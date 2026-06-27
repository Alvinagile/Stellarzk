import type { Config } from '@netlify/functions';
import { executeAssistantSuppression } from './_shared/assistantSuppression';
import { compileServerEvidence } from './_shared/evidence';

declare const Netlify: { env?: { get: (key: string) => string | undefined } } | undefined;

interface SuppressionRequest {
  targetText?: string;
  requestReason?: string;
  requester?: string;
  environment?: string;
  apiKey?: string;
  assistantId?: string;
  baseUrl?: string;
  maxLeakScoreBps?: number;
  reinforcementPromptLimit?: number;
  validationPromptLimit?: number;
}

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function getEnv(key: string) {
  if (typeof Netlify !== 'undefined') {
    const value = Netlify.env?.get(key);
    if (value) {
      return value;
    }
  }

  return process.env[key];
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

function getNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

async function persistEvidence(evidence: ReturnType<typeof compileServerEvidence>, run: Awaited<ReturnType<typeof executeAssistantSuppression>>, requestReason: string) {
  const supabaseUrl = getEnv('SUPABASE_URL') ?? getEnv('VITE_SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return { status: 'not_configured' as const, message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for server-side persistence.' };
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/stellarzk_evidence_runs`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      case_id: evidence.caseId,
      evidence_hash: evidence.evidenceHash,
      evidence_root: evidence.evidenceRoot,
      target_commitment: evidence.targetCommitment,
      proof_hash: evidence.proofReceipt.proofHash,
      assistant_id_hash: String((evidence.bundle.liveAssistantRun as Record<string, unknown>).assistantIdHash),
      request_reason: requestReason,
      validation_score_bps: Math.round(run.validationScore * 10000),
      leak_score_bps: Math.round(run.leakScore * 10000),
      total_tests: run.totalTests,
      passed_tests: run.passedTests,
      failed_tests: run.failedTests,
      bundle: evidence.bundle,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { status: 'failed' as const, message: text.slice(0, 300) || 'Supabase insert failed.' };
  }

  const rows = await response.json() as Array<{ id?: string }>;
  return { status: 'stored' as const, id: rows[0]?.id };
}

export default async (request: Request) => {
  if (request.method !== 'POST') {
    return json(405, { error: 'POST required.' });
  }

  let body: SuppressionRequest;
  try {
    body = await request.json() as SuppressionRequest;
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const targetText = body.targetText?.trim();
  if (!targetText || targetText.length < 3) {
    return json(400, { error: 'targetText must contain at least 3 characters.' });
  }
  if (targetText.length > 3000) {
    return json(400, { error: 'targetText is capped at 3000 characters for the live demo runner.' });
  }

  const apiKey = body.apiKey?.trim() || getEnv('OPENAI_API_KEY');
  const assistantId = body.assistantId?.trim() || getEnv('OPENAI_ASSISTANT_ID');
  const baseUrl = body.baseUrl?.trim() || getEnv('OPENAI_BASE_URL') || 'https://api.openai.com/v1';

  if (!apiKey || !assistantId) {
    return json(400, {
      error: 'OpenAI API key and Assistant ID are required for this run.',
    });
  }

  const requestReason = body.requestReason?.trim() || 'Live OpenAI Assistant black-box suppression run.';
  const maxLeakScoreBps = getNumber(body.maxLeakScoreBps, Number(getEnv('SUPPRESSION_MAX_LEAK_BPS') ?? 100), 0, 10000);

  try {
    const run = await executeAssistantSuppression({
      apiKey,
      baseUrl,
      assistantId,
      targetText,
      reinforcementPromptLimit: getNumber(body.reinforcementPromptLimit, 6, 1, 8),
      validationPromptLimit: getNumber(body.validationPromptLimit, 4, 1, 6),
    });

    const evidence = compileServerEvidence({
      requester: body.requester?.trim() || 'DoraHacks Stellar Hacks reviewer',
      environment: body.environment?.trim() || 'OpenAI Assistant black-box suppression runner',
      targetText,
      targetSalt: `stellar-live-${new Date().toISOString().slice(0, 10)}`,
      requestReason,
      maxLeakScoreBps,
      modelArtifactMutation: 'OpenAI Assistant instruction suppression injection plus adversarial validation prompt suite',
      run,
    });
    const persistence = await persistEvidence(evidence, run, requestReason);

    return json(200, {
      evidence,
      run: {
        assistantIdHash: String((evidence.bundle.liveAssistantRun as Record<string, unknown>).assistantIdHash),
        suppressionInjected: run.suppressionInjected,
        baselineLeakScoreBps: Math.round(run.baselineLeakScore * 10000),
        baselineTests: run.baselineTests,
        leakScoreBps: Math.round(run.leakScore * 10000),
        validationScoreBps: Math.round(run.validationScore * 10000),
        totalTests: run.totalTests,
        passedTests: run.passedTests,
        failedTests: run.failedTests,
        processingTimeSeconds: run.processingTimeSeconds,
        phase1: run.phase1,
        phase2: run.phase2,
      },
      persistence,
    });
  } catch (error) {
    return json(502, {
      error: error instanceof Error ? error.message : 'OpenAI Assistant suppression run failed.',
    });
  }
};

export const config: Config = {
  path: '/api/black-box-suppression',
  method: ['POST'],
};

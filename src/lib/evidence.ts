export type ExecutionLane = 'rag_retrieval' | 'assistant_black_box' | 'white_box_adapter';

export interface EvidenceInput {
  requester: string;
  environment: string;
  executionLane: ExecutionLane;
  hiddenTarget: string;
  targetSalt: string;
  requestReason: string;
  beforeLeakScoreBps: number;
  afterLeakScoreBps: number;
  maxLeakScoreBps: number;
  validationPrompts: number;
  retrievalDocumentsRevoked: number;
  modelArtifactMutation: string;
}

export interface CompiledEvidence {
  caseId: string;
  createdAt: string;
  targetCommitment: string;
  privateWitnessHash: string;
  evidenceRoot: string;
  evidenceHash: string;
  merkleLeaves: Array<{ label: string; hash: string }>;
  publicSignals: {
    maxLeakScoreBps: number;
    measuredLeakScoreBps: number;
    validationPrompts: number;
    retrievalDocumentsRevoked: number;
    targetCommitment: string;
    evidenceRoot: string;
  };
  proofReceipt: {
    circuit: string;
    scheme: string;
    status: 'witness_prepared' | 'threshold_failed';
    statement: string;
    proofHash: string;
    boundary: string;
  };
  stellar: {
    network: 'testnet';
    contract: string;
    anchorStatus: 'ready_for_submission' | 'blocked_by_threshold';
    explorer: string;
    mode?: string;
    txHash?: string;
    sourceAccount?: string;
    fallbackReason?: string;
  };
  bundle: Record<string, unknown>;
}

export const defaultInput: EvidenceInput = {
  requester: 'Forg3t operator',
  environment: 'OpenAI Assistant black-box suppression runner',
  executionLane: 'assistant_black_box',
  hiddenTarget: '',
  targetSalt: '',
  requestReason: '',
  beforeLeakScoreBps: 0,
  afterLeakScoreBps: 0,
  maxLeakScoreBps: 0,
  validationPrompts: 0,
  retrievalDocumentsRevoked: 0,
  modelArtifactMutation: 'Assistant suppression policy update',
};

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

export async function sha256Hex(value: string | Blob): Promise<string> {
  const buffer = value instanceof Blob ? await value.arrayBuffer() : encoder.encode(value);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return `0x${toHex(new Uint8Array(digest))}`;
}

async function hashLeaf(label: string, payload: unknown) {
  return {
    label,
    hash: await sha256Hex(`${label}:${canonicalJson(payload)}`),
  };
}

async function merkleRoot(leaves: Array<{ label: string; hash: string }>): Promise<string> {
  let level = leaves.map((leaf) => leaf.hash);

  while (level.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(await sha256Hex(`${left}:${right}`));
    }
    level = next;
  }

  return level[0];
}

export async function compileEvidence(input: EvidenceInput): Promise<CompiledEvidence> {
  const createdAt = new Date().toISOString();
  const targetCommitment = await sha256Hex(`target:${input.targetSalt}:${input.hiddenTarget}`);
  const privateWitnessHash = await sha256Hex(
    canonicalJson({
      targetSalt: input.targetSalt,
      hiddenTarget: input.hiddenTarget,
      beforeLeakScoreBps: input.beforeLeakScoreBps,
      afterLeakScoreBps: input.afterLeakScoreBps,
    }),
  );

  const redactedWorkflow = {
    requester: input.requester,
    environment: input.environment,
    executionLane: input.executionLane,
    requestReason: input.requestReason,
    modelArtifactMutation: input.modelArtifactMutation,
  };

  const validation = {
    beforeLeakScoreBps: input.beforeLeakScoreBps,
    afterLeakScoreBps: input.afterLeakScoreBps,
    maxLeakScoreBps: input.maxLeakScoreBps,
    validationPrompts: input.validationPrompts,
    retrievalDocumentsRevoked: input.retrievalDocumentsRevoked,
    passed: input.afterLeakScoreBps <= input.maxLeakScoreBps,
  };

  const leaves = await Promise.all([
    hashLeaf('redacted-workflow', redactedWorkflow),
    hashLeaf('validation-summary', validation),
    hashLeaf('target-commitment', targetCommitment),
    hashLeaf('private-witness-hash', privateWitnessHash),
  ]);

  const evidenceRoot = await merkleRoot(leaves);
  const publicSignals = {
    maxLeakScoreBps: input.maxLeakScoreBps,
    measuredLeakScoreBps: input.afterLeakScoreBps,
    validationPrompts: input.validationPrompts,
    retrievalDocumentsRevoked: input.retrievalDocumentsRevoked,
    targetCommitment,
    evidenceRoot,
  };
  const proofHash = await sha256Hex(canonicalJson({ publicSignals, privateWitnessHash, circuit: 'forg3t_suppression_threshold_v1' }));
  const caseId = (await sha256Hex(`${evidenceRoot}:${targetCommitment}`)).slice(0, 18);
  const thresholdPassed = input.afterLeakScoreBps <= input.maxLeakScoreBps;

  const bundle = {
    protocol: 'Forg3t StellarZK',
    caseId,
    createdAt,
    publicSignals,
    proofReceipt: {
      circuit: 'forg3t_suppression_threshold_v1',
      scheme: 'Groth16-compatible circuit boundary',
      status: thresholdPassed ? 'witness_prepared' : 'threshold_failed',
      statement: 'The private deletion target is committed, the redacted evidence root is bound, and the measured post-unlearning leak score is below the public threshold.',
      proofHash,
      boundary: 'No raw target text, prompt, customer output, or private witness is exported.',
    },
    merkleLeaves: leaves,
    stellar: {
      network: 'testnet',
      contract: 'CDZ77TVJGUTWUXOY7YDTDBA5BXEISRCBLJPDJ5J5FEFIYV2LCFOH5CHD',
      anchorStatus: thresholdPassed ? 'ready_for_submission' : 'blocked_by_threshold',
      explorer: 'https://stellar.expert/explorer/testnet',
    },
  };

  const evidenceHash = await sha256Hex(canonicalJson(bundle));

  return {
    caseId,
    createdAt,
    targetCommitment,
    privateWitnessHash,
    evidenceRoot,
    evidenceHash,
    merkleLeaves: leaves,
    publicSignals,
    proofReceipt: bundle.proofReceipt as CompiledEvidence['proofReceipt'],
    stellar: bundle.stellar as CompiledEvidence['stellar'],
    bundle: { ...bundle, evidenceHash },
  };
}

export function downloadBundle(bundle: Record<string, unknown>) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `forg3t-stellarzk-${String(bundle.caseId ?? 'evidence')}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

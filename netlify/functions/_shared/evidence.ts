import { createHash } from 'node:crypto';
import type { AssistantSuppressionExecutionResult } from './assistantSuppression';
import { FORG3T_ZK_ANCHOR_CONTRACT_ID, type StellarAnchorResult } from './stellarAnchor';
import type { ZkProofResult } from './zkProof';

export interface ServerEvidenceInput {
  requester: string;
  environment: string;
  targetText: string;
  targetSalt: string;
  requestReason: string;
  maxLeakScoreBps: number;
  modelArtifactMutation: string;
  run: AssistantSuppressionExecutionResult;
}

function sha256Hex(value: string) {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
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

function hashLeaf(label: string, payload: unknown) {
  return {
    label,
    hash: sha256Hex(`${label}:${canonicalJson(payload)}`),
  };
}

function merkleRoot(leaves: Array<{ label: string; hash: string }>) {
  let level = leaves.map((leaf) => leaf.hash);

  while (level.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(sha256Hex(`${left}:${right}`));
    }
    level = next;
  }

  return level[0];
}

export function compileServerEvidence(input: ServerEvidenceInput, zkProof?: ZkProofResult, stellarAnchor?: StellarAnchorResult) {
  const createdAt = new Date().toISOString();
  const beforeLeakScoreBps = Math.round(input.run.baselineLeakScore * 10000);
  const afterLeakScoreBps = Math.round(input.run.leakScore * 10000);
  const validationScoreBps = Math.round(input.run.validationScore * 10000);
  const targetCommitment = sha256Hex(`target:${input.targetSalt}:${input.targetText}`);
  const privateWitnessHash = sha256Hex(
    canonicalJson({
      targetSalt: input.targetSalt,
      targetText: input.targetText,
      assistantId: input.run.assistantId,
      beforeLeakScoreBps,
      afterLeakScoreBps,
    }),
  );

  const redactedWorkflow = {
    requester: input.requester,
    environment: input.environment,
    executionLane: 'assistant_black_box',
    requestReason: input.requestReason,
    modelArtifactMutation: input.modelArtifactMutation,
    assistantIdHash: sha256Hex(`assistant:${input.run.assistantId}`),
  };

  const validation = {
    beforeLeakScoreBps,
    afterLeakScoreBps,
    maxLeakScoreBps: input.maxLeakScoreBps,
    validationScoreBps,
    validationPrompts: input.run.totalTests,
    retrievalDocumentsRevoked: 0,
    suppressionInjected: input.run.suppressionInjected,
    passed: afterLeakScoreBps <= input.maxLeakScoreBps,
    phase1: input.run.phase1,
    phase2: input.run.phase2,
  };

  const leaves = [
    hashLeaf('redacted-workflow', redactedWorkflow),
    hashLeaf('validation-summary', validation),
    hashLeaf('target-commitment', targetCommitment),
    hashLeaf('private-witness-hash', privateWitnessHash),
  ];

  const evidenceRoot = merkleRoot(leaves);
  const publicSignals = {
    maxLeakScoreBps: input.maxLeakScoreBps,
    measuredLeakScoreBps: afterLeakScoreBps,
    validationPrompts: input.run.totalTests,
    retrievalDocumentsRevoked: 0,
    targetCommitment,
    evidenceRoot,
  };
  const proofHash = sha256Hex(canonicalJson({ publicSignals, privateWitnessHash, circuit: 'forg3t_suppression_threshold_v1' }));
  const caseId = sha256Hex(`${evidenceRoot}:${targetCommitment}`).slice(0, 18);
  const thresholdPassed = afterLeakScoreBps <= input.maxLeakScoreBps;

  const proofReceipt = {
    circuit: 'forg3t_suppression_threshold_v1',
    scheme: zkProof ? 'Groth16 bn128 verified proof' : 'Groth16 bn128 proof pending',
    status: thresholdPassed ? 'witness_prepared' : 'threshold_failed',
    statement: 'The private deletion target is committed, the redacted evidence root is bound, and the measured OpenAI Assistant leak score is below the public threshold.',
    proofHash: zkProof?.proofHash ?? proofHash,
    boundary: 'No raw target text, test prompt, assistant output, API key, or private witness is exported.',
  };

  const stellar = {
    network: 'testnet',
    contract: FORG3T_ZK_ANCHOR_CONTRACT_ID,
    anchorStatus: thresholdPassed ? 'ready_for_submission' : 'blocked_by_threshold',
    explorer: stellarAnchor?.explorer ?? 'https://stellar.expert/explorer/testnet',
    mode: stellarAnchor?.mode ?? 'pending',
    txHash: stellarAnchor?.txHash,
    sourceAccount: stellarAnchor?.sourceAccount,
    fallbackReason: stellarAnchor?.fallbackReason,
  };

  const bundle = {
    protocol: 'Forg3t StellarZK',
    caseId,
    createdAt,
    publicSignals,
    proofReceipt,
    merkleLeaves: leaves,
    stellar,
    liveAssistantRun: {
      assistantIdHash: sha256Hex(`assistant:${input.run.assistantId}`),
      suppressionInjected: input.run.suppressionInjected,
      leakScoreBps: afterLeakScoreBps,
      validationScoreBps,
      baselineLeakScoreBps: beforeLeakScoreBps,
      baselineTests: input.run.baselineTests,
      totalTests: input.run.totalTests,
      passedTests: input.run.passedTests,
      failedTests: input.run.failedTests,
      processingTimeSeconds: input.run.processingTimeSeconds,
      phase1: input.run.phase1,
      phase2: input.run.phase2,
    },
    zkProof: zkProof ? {
      protocol: zkProof.protocol,
      curve: zkProof.curve,
      circuit: zkProof.circuit,
      verified: zkProof.verified,
      proofHash: zkProof.proofHash,
      publicSignals: zkProof.publicSignals,
      verificationKeyHash: zkProof.verificationKeyHash,
      artifacts: zkProof.artifacts,
      proof: zkProof.proof,
    } : null,
  };

  const evidenceHash = sha256Hex(canonicalJson(bundle));

  return {
    caseId,
    createdAt,
    targetCommitment,
    privateWitnessHash,
    evidenceRoot,
    evidenceHash,
    merkleLeaves: leaves,
    publicSignals,
    proofReceipt,
    stellar,
    bundle: { ...bundle, evidenceHash },
  };
}

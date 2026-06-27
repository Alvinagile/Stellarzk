import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { groth16 } = require('snarkjs') as {
  groth16: {
    fullProve: (
      input: Record<string, string>,
      wasmFile: string,
      zkeyFile: string,
    ) => Promise<{ proof: Record<string, unknown>; publicSignals: string[] }>;
    verify: (
      verificationKey: Record<string, unknown>,
      publicSignals: string[],
      proof: Record<string, unknown>,
    ) => Promise<boolean>;
  };
};

const BN254_FIELD = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

export interface ZkProofInput {
  maxLeakScoreBps: number;
  measuredLeakScoreBps: number;
  targetCommitment: string;
  evidenceRoot: string;
  privateWitnessHash: string;
}

export interface ZkProofResult {
  protocol: 'groth16';
  curve: 'bn128';
  circuit: 'forg3t_suppression_threshold_v1';
  verified: boolean;
  proofHash: string;
  publicSignals: string[];
  proof: Record<string, unknown>;
  verificationKeyHash: string;
  artifacts: {
    wasm: string;
    zkey: string;
    verificationKey: string;
  };
}

function sha256Hex(value: string) {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}

function scalarFromHex(hex: string) {
  return (BigInt(hex) % BN254_FIELD).toString();
}

function artifactPath(fileName: string) {
  const candidates = [
    join(process.cwd(), 'zk-artifacts', fileName),
    join(process.cwd(), '..', 'zk-artifacts', fileName),
    join('/var/task', 'zk-artifacts', fileName),
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`ZK artifact not found: ${fileName}`);
  }

  return found;
}

export async function generateThresholdProof(input: ZkProofInput): Promise<ZkProofResult> {
  const wasmPath = artifactPath('suppression_threshold.wasm');
  const zkeyPath = artifactPath('suppression_threshold_final.zkey');
  const verificationKeyPath = artifactPath('verification_key.json');
  const verificationKey = JSON.parse(readFileSync(verificationKeyPath, 'utf8')) as Record<string, unknown>;

  const proofInput = {
    measuredLeakScoreBps: String(input.measuredLeakScoreBps),
    maxLeakScoreBps: String(input.maxLeakScoreBps),
    targetCommitment: scalarFromHex(input.targetCommitment),
    evidenceRoot: scalarFromHex(input.evidenceRoot),
    privateWitnessHash: scalarFromHex(input.privateWitnessHash),
  };
  const { proof, publicSignals } = await groth16.fullProve(proofInput, wasmPath, zkeyPath);
  const verified = await groth16.verify(verificationKey, publicSignals, proof);

  if (!verified) {
    throw new Error('Generated Groth16 proof did not verify against verification_key.json.');
  }

  return {
    protocol: 'groth16',
    curve: 'bn128',
    circuit: 'forg3t_suppression_threshold_v1',
    verified,
    proofHash: sha256Hex(JSON.stringify(proof)),
    publicSignals,
    proof,
    verificationKeyHash: sha256Hex(readFileSync(verificationKeyPath, 'utf8')),
    artifacts: {
      wasm: 'zk-artifacts/suppression_threshold.wasm',
      zkey: 'zk-artifacts/suppression_threshold_final.zkey',
      verificationKey: 'zk-artifacts/verification_key.json',
    },
  };
}

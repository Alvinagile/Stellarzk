import type { CompiledEvidence } from './evidence';

export interface LiveSuppressionRequest {
  targetText: string;
  requestReason: string;
  requester: string;
  environment: string;
  assistantId: string;
  apiKey: string;
  beforeLeakScoreBps?: number;
  maxLeakScoreBps?: number;
}

export interface LiveSuppressionResult {
  evidence: CompiledEvidence;
  run: {
    assistantIdHash: string;
    suppressionInjected: boolean;
    leakScoreBps: number;
    validationScoreBps: number;
    baselineLeakScoreBps: number;
    baselineTests: number;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    processingTimeSeconds: number;
    phase1: {
      total: number;
      passed: number;
      failed: number;
    };
    phase2: {
      total: number;
      passed: number;
      failed: number;
    };
  };
  persistence: {
    status: 'stored' | 'failed' | 'not_configured';
    id?: string;
    message?: string;
  };
}

export async function runLiveSuppression(request: LiveSuppressionRequest) {
  const response = await fetch('/api/black-box-suppression', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  const payload = await response.json() as LiveSuppressionResult | { error?: string };

  if (!response.ok) {
    throw new Error('error' in payload && payload.error ? payload.error : 'Live suppression run failed.');
  }

  return payload as LiveSuppressionResult;
}

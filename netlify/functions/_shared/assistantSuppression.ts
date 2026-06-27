import {
  buildAdversarialPrompts,
  buildReinforcementPrompts,
  detectSuppressionResponse,
  mergeSuppressionInstructions,
  summarizeSuppressionRun,
  type SuppressionPhaseResult,
} from './suppression';

export interface AssistantSuppressionExecutionConfig {
  apiKey: string;
  baseUrl: string;
  assistantId: string;
  targetText: string;
  reinforcementPromptLimit?: number;
  validationPromptLimit?: number;
  maxRunPollAttempts?: number;
}

export interface AssistantSuppressionExecutionResult {
  assistantId: string;
  suppressionInjected: boolean;
  baselineLeakScore: number;
  baselineTests: number;
  leakScore: number;
  validationScore: number;
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
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function buildAssistantsUrl(baseUrl: string, path: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  const rooted = path.startsWith('/') ? path : `/${path}`;
  return normalized.endsWith('/v1') ? `${normalized}${rooted}` : `${normalized}/v1${rooted}`;
}

function buildHeaders(apiKey: string, includeContentType = false) {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    'OpenAI-Beta': 'assistants=v2',
  };
}

async function maybeParseJson(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function requestOpenAI<T>(url: string, init: RequestInit, fallbackMessage: string) {
  const response = await fetch(url, init);
  const responseText = await response.text();
  const payload = await maybeParseJson(responseText);

  if (!response.ok) {
    const errorMessage = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error?: { message?: string } }).error?.message ?? fallbackMessage)
      : responseText.slice(0, 400) || fallbackMessage;
    throw new Error(`${fallbackMessage}: ${errorMessage}`);
  }

  return payload as T;
}

async function fetchAssistant(apiKey: string, baseUrl: string, assistantId: string) {
  return requestOpenAI<Record<string, unknown>>(
    buildAssistantsUrl(baseUrl, `/assistants/${assistantId}`),
    {
      headers: buildHeaders(apiKey),
    },
    'Failed to load assistant',
  );
}

async function updateAssistantInstructions(
  apiKey: string,
  baseUrl: string,
  assistantId: string,
  instructions: string,
) {
  return requestOpenAI<Record<string, unknown>>(
    buildAssistantsUrl(baseUrl, `/assistants/${assistantId}`),
    {
      method: 'POST',
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify({ instructions }),
    },
    'Failed to update assistant',
  );
}

async function createThread(apiKey: string, baseUrl: string) {
  return requestOpenAI<{ id: string }>(
    buildAssistantsUrl(baseUrl, '/threads'),
    {
      method: 'POST',
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify({}),
    },
    'Failed to create thread',
  );
}

async function deleteThread(apiKey: string, baseUrl: string, threadId: string) {
  try {
    await fetch(buildAssistantsUrl(baseUrl, `/threads/${threadId}`), {
      method: 'DELETE',
      headers: buildHeaders(apiKey),
    });
  } catch {
    // Best effort cleanup.
  }
}

async function sendMessageToAssistant(params: {
  apiKey: string;
  baseUrl: string;
  assistantId: string;
  message: string;
  maxPollAttempts: number;
}) {
  const thread = await createThread(params.apiKey, params.baseUrl);

  try {
    await requestOpenAI(
      buildAssistantsUrl(params.baseUrl, `/threads/${thread.id}/messages`),
      {
        method: 'POST',
        headers: buildHeaders(params.apiKey, true),
        body: JSON.stringify({
          role: 'user',
          content: params.message,
        }),
      },
      'Failed to add thread message',
    );

    const run = await requestOpenAI<{ id: string; status: string }>(
      buildAssistantsUrl(params.baseUrl, `/threads/${thread.id}/runs`),
      {
        method: 'POST',
        headers: buildHeaders(params.apiKey, true),
        body: JSON.stringify({
          assistant_id: params.assistantId,
        }),
      },
      'Failed to start assistant run',
    );

    let attempts = 0;
    let status = run.status;

    while (!['completed', 'failed', 'cancelled', 'expired'].includes(status) && attempts < params.maxPollAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const state = await requestOpenAI<{ status: string }>(
        buildAssistantsUrl(params.baseUrl, `/threads/${thread.id}/runs/${run.id}`),
        {
          headers: buildHeaders(params.apiKey),
        },
        'Failed to poll assistant run',
      );
      status = state.status;
      attempts += 1;
    }

    if (status !== 'completed') {
      throw new Error(`Assistant run did not complete successfully (status: ${status})`);
    }

    const messages = await requestOpenAI<{ data: Array<Record<string, unknown>> }>(
      buildAssistantsUrl(params.baseUrl, `/threads/${thread.id}/messages`),
      {
        headers: buildHeaders(params.apiKey),
      },
      'Failed to read assistant messages',
    );

    const assistantMessage = messages.data.find((message) => message.role === 'assistant');
    const content = Array.isArray(assistantMessage?.content) ? assistantMessage.content[0] as Record<string, unknown> : null;
    const text = content && typeof content === 'object' && 'text' in content
      ? (content.text as { value?: string }).value ?? ''
      : '';

    if (!text) {
      throw new Error('Assistant returned an empty response');
    }

    return text;
  } finally {
    await deleteThread(params.apiKey, params.baseUrl, thread.id);
  }
}

async function runPromptSet(params: {
  prompts: string[];
  assistantId: string;
  apiKey: string;
  baseUrl: string;
  targetText: string;
  maxRunPollAttempts: number;
}) {
  const results: SuppressionPhaseResult[] = [];

  for (const prompt of params.prompts) {
    try {
      const response = await sendMessageToAssistant({
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
        assistantId: params.assistantId,
        message: prompt,
        maxPollAttempts: params.maxRunPollAttempts,
      });

      results.push({
        response,
        suppressionActive: detectSuppressionResponse(response, params.targetText),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Prompt execution failed';
      results.push({
        response: `Error: ${message}`,
        suppressionActive: false,
      });
    }
  }

  return results;
}

export async function executeAssistantSuppression(config: AssistantSuppressionExecutionConfig): Promise<AssistantSuppressionExecutionResult> {
  const start = Date.now();
  const reinforcementPromptLimit = Math.max(1, Math.min(config.reinforcementPromptLimit ?? 6, 8));
  const validationPromptLimit = Math.max(1, Math.min(config.validationPromptLimit ?? 4, 6));
  const maxRunPollAttempts = Math.max(3, Math.min(config.maxRunPollAttempts ?? 12, 45));

  const assistant = await fetchAssistant(config.apiKey, config.baseUrl, config.assistantId);
  const originalInstructions = typeof assistant.instructions === 'string' ? assistant.instructions : '';
  const updatedInstructions = mergeSuppressionInstructions(originalInstructions, config.targetText);

  const baselineResults = await runPromptSet({
    prompts: buildAdversarialPrompts(config.targetText).slice(0, validationPromptLimit),
    assistantId: config.assistantId,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    targetText: config.targetText,
    maxRunPollAttempts,
  });

  await updateAssistantInstructions(
    config.apiKey,
    config.baseUrl,
    config.assistantId,
    updatedInstructions,
  );

  const phase1Results = await runPromptSet({
    prompts: buildReinforcementPrompts(config.targetText).slice(0, reinforcementPromptLimit),
    assistantId: config.assistantId,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    targetText: config.targetText,
    maxRunPollAttempts,
  });

  const phase2Results = await runPromptSet({
    prompts: buildAdversarialPrompts(config.targetText).slice(0, validationPromptLimit),
    assistantId: config.assistantId,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    targetText: config.targetText,
    maxRunPollAttempts,
  });

  const summary = summarizeSuppressionRun(
    phase1Results,
    phase2Results,
    Math.max(1, Math.floor((Date.now() - start) / 1000)),
  );
  const baselineFailedTests = baselineResults.filter((result) => !result.suppressionActive).length;

  return {
    assistantId: config.assistantId,
    suppressionInjected: true,
    baselineLeakScore: baselineResults.length > 0 ? baselineFailedTests / baselineResults.length : 1,
    baselineTests: baselineResults.length,
    leakScore: summary.leakScore,
    validationScore: summary.validationScore,
    totalTests: summary.totalTests,
    passedTests: summary.passedTests,
    failedTests: summary.failedTests,
    processingTimeSeconds: summary.processingTimeSeconds,
    phase1: summary.phase1,
    phase2: summary.phase2,
  };
}

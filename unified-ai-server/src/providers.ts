import { isDeepSeekModel, DEEPSEEK_BASE_URL, DEEPSEEK_ANTHROPIC_BASE_URL } from '@nextoffer/shared/models';
import { CONFIG } from './config.js';
import { getRunTokenTotal } from './usage.js';

export type ProviderRoute = {
  provider: 'openai' | 'deepseek';
  baseUrl: string;
  apiKey: string;
};

export function routeModel(model: string, apiKeyHeader?: string): ProviderRoute {
  const deepseek = isDeepSeekModel(model);
  const apiKey = apiKeyHeader
    || (deepseek ? CONFIG.defaultDeepSeekKey : CONFIG.defaultOpenAiKey);
  return {
    provider: deepseek ? 'deepseek' : 'openai',
    baseUrl: deepseek ? DEEPSEEK_BASE_URL : 'https://api.openai.com/v1',
    apiKey,
  };
}

export function anthropicBaseUrl(model: string) {
  return isDeepSeekModel(model) ? DEEPSEEK_ANTHROPIC_BASE_URL : '';
}

export function checkTokenBudget(runId: string | undefined, projectedTokens: number) {
  if (!runId) return;
  const total = getRunTokenTotal(runId) + projectedTokens;
  if (total > CONFIG.maxTokensPerRun) {
    throw new Error(`Run token budget exceeded (${total} > ${CONFIG.maxTokensPerRun})`);
  }
}

export async function proxyJson(url: string, init: RequestInit) {
  let model = '';
  try {
    const parsed = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    if (parsed?.model) model = String(parsed.model);
  } catch {
    /* body isn't JSON-parseable — skip model label */
  }
  const modelLabel = model ? ` model=${model}` : '';
  const startedAt = Date.now();
  console.log(`[llm] → ${init.method || 'GET'} ${url}${modelLabel}`);

  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  const elapsedMs = Date.now() - startedAt;
  const line = `[llm] ← ${res.status} ${url}${modelLabel} (${elapsedMs}ms)`;
  if (!res.ok) console.error(`${line} — ${data?.error?.message || 'upstream error'}`);
  else console.log(line);

  return { res, data };
}

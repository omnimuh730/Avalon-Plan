import { calculateCost, resolveModelPricing, DEFAULT_DEEPSEEK_MODEL } from './pricing.js';
import { isValidApiKey } from './api-keys.js';
import { estimateTokens } from './validation.js';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function runTests() {
  assert(!isValidApiKey('sk-...'), 'placeholder sk-... rejected');
  assert(!isValidApiKey(''), 'empty rejected');

  const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
  const cost = calculateCost('gpt-4o-mini', usage);
  assert(cost.promptUsd === 0.00015, `prompt cost ${cost.promptUsd}`);
  assert(cost.completionUsd === 0.0003, `completion cost ${cost.completionUsd}`);
  assert(cost.totalUsd === 0.00045, `total cost ${cost.totalUsd}`);

  const deepseekFlash = resolveModelPricing(DEFAULT_DEEPSEEK_MODEL);
  assert(deepseekFlash.provider === 'deepseek', 'deepseek-v4-flash provider');

  const deepseekLegacy = resolveModelPricing('deepseek-chat');
  assert(deepseekLegacy.provider === 'deepseek', 'legacy deepseek-chat maps to deepseek');

  const gptFallback = resolveModelPricing('gpt-4o-mini');
  assert(gptFallback.provider === 'openai', 'gpt catalog hit');

  assert(estimateTokens('hello world') >= 2, 'token estimate');

  console.log('ai-bff ok');
}

runTests();

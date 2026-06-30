import type { AiProviderId, CostBreakdown, ModelInfo, TokenUsage } from './types.js';

export interface ModelPricing {
  provider: AiProviderId;
  label: string;
  supportsVision: boolean;
  supportsStructuredOutput: boolean;
  contextWindow: number;
  promptPer1M: number;
  completionPer1M: number;
}

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';

export const MODEL_CATALOG: Record<string, ModelPricing> = {
  'gpt-4o': {
    provider: 'openai',
    label: 'GPT-4o',
    supportsVision: true,
    supportsStructuredOutput: true,
    contextWindow: 128_000,
    promptPer1M: 2.5,
    completionPer1M: 10,
  },
  'gpt-4o-mini': {
    provider: 'openai',
    label: 'GPT-4o Mini',
    supportsVision: true,
    supportsStructuredOutput: true,
    contextWindow: 128_000,
    promptPer1M: 0.15,
    completionPer1M: 0.6,
  },
  'gpt-4-turbo': {
    provider: 'openai',
    label: 'GPT-4 Turbo',
    supportsVision: true,
    supportsStructuredOutput: true,
    contextWindow: 128_000,
    promptPer1M: 10,
    completionPer1M: 30,
  },
  'gpt-4.1': {
    provider: 'openai',
    label: 'GPT-4.1',
    supportsVision: true,
    supportsStructuredOutput: true,
    contextWindow: 1_047_576,
    promptPer1M: 2,
    completionPer1M: 8,
  },
  'gpt-4.1-mini': {
    provider: 'openai',
    label: 'GPT-4.1 Mini',
    supportsVision: true,
    supportsStructuredOutput: true,
    contextWindow: 1_047_576,
    promptPer1M: 0.4,
    completionPer1M: 1.6,
  },
  'gpt-3.5-turbo': {
    provider: 'openai',
    label: 'GPT-3.5 Turbo',
    supportsVision: false,
    supportsStructuredOutput: false,
    contextWindow: 16_385,
    promptPer1M: 0.5,
    completionPer1M: 1.5,
  },
  'deepseek-v4-flash': {
    provider: 'deepseek',
    label: 'DeepSeek V4 Flash',
    supportsVision: false,
    supportsStructuredOutput: true,
    contextWindow: 64_000,
    promptPer1M: 0.14,
    completionPer1M: 0.28,
  },
  'deepseek-reasoner': {
    provider: 'deepseek',
    label: 'DeepSeek Reasoner',
    supportsVision: false,
    supportsStructuredOutput: true,
    contextWindow: 64_000,
    promptPer1M: 0.55,
    completionPer1M: 2.19,
  },
  /** @deprecated Use deepseek-v4-flash */
  'deepseek-chat': {
    provider: 'deepseek',
    label: 'DeepSeek Chat (deprecated)',
    supportsVision: false,
    supportsStructuredOutput: true,
    contextWindow: 64_000,
    promptPer1M: 0.27,
    completionPer1M: 1.1,
  },
};

export function resolveModelPricing(model: string): ModelPricing {
  const known = MODEL_CATALOG[model];
  if (known) return known;

  if (model.startsWith('gpt-')) {
    return MODEL_CATALOG['gpt-4o-mini'];
  }
  if (model.startsWith('deepseek-')) {
    return MODEL_CATALOG[DEFAULT_DEEPSEEK_MODEL];
  }

  return {
    provider: 'openai',
    label: model,
    supportsVision: false,
    supportsStructuredOutput: true,
    contextWindow: 8192,
    promptPer1M: 1,
    completionPer1M: 3,
  };
}

export function calculateCost(model: string, usage: TokenUsage): CostBreakdown {
  const pricing = resolveModelPricing(model);
  const promptUsd = (usage.promptTokens / 1_000_000) * pricing.promptPer1M;
  const completionUsd = (usage.completionTokens / 1_000_000) * pricing.completionPer1M;
  return {
    promptUsd: roundUsd(promptUsd),
    completionUsd: roundUsd(completionUsd),
    totalUsd: roundUsd(promptUsd + completionUsd),
    currency: 'USD',
    rates: {
      promptPer1M: pricing.promptPer1M,
      completionPer1M: pricing.completionPer1M,
    },
  };
}

export function listModels(): ModelInfo[] {
  return Object.entries(MODEL_CATALOG)
    .filter(([id]) => id !== 'deepseek-chat')
    .map(([id, meta]) => ({
    id,
    provider: meta.provider,
    label: meta.label,
    supportsVision: meta.supportsVision,
    supportsStructuredOutput: meta.supportsStructuredOutput,
    contextWindow: meta.contextWindow,
    pricing: {
      promptPer1M: meta.promptPer1M,
      completionPer1M: meta.completionPer1M,
      currency: 'USD',
    },
  }));
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

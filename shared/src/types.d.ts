declare module '@nextoffer/shared/pricing' {
  export const STANDARD_PRICING: Array<{
    prefix: string;
    input: number;
    cachedInput: number | null;
    output: number;
  }>;
  export function findPricing(model: string): { input: number; cachedInput?: number | null; output: number } | null;
  export function costFromUsage(model: string, usage: Record<string, unknown>): {
    inputTokens: number;
    cachedTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    priced: boolean;
  };
  export function formatUsd(amount: number): string;
  export function mergeUsage(a: unknown, b: unknown): unknown;
  export function emptyUsage(): unknown;
}

declare module '@nextoffer/shared/models' {
  export const DEEPSEEK_BASE_URL: string;
  export const DEEPSEEK_ANTHROPIC_BASE_URL: string;
  export const DEEPSEEK_MODELS: string[];
  export function isDeepSeekModel(id: string): boolean;
  export function listOpenAiModels(apiKey: string): Promise<Array<{ id: string }>>;
}

declare module '@nextoffer/shared/skill-normalize' {
  export function toCanonical(skill: string): string;
  export function normalizeSkillSet(skills: string[]): Set<string>;
}

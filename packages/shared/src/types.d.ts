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

declare module '@nextoffer/shared/terminal-log' {
  export const TAG_COLORS: Record<string, string>;
  export const LEVEL_STYLES: Record<string, { icon: string; color: string }>;
  export function stripAnsi(text: string): string;
  export function extractBracketTag(text: string): { tag: string | null; body: string };
  export function formatLogLine(level: 'info' | 'warn' | 'error', args: unknown[], defaultTag?: string): string;
  export function parseStyledLine(
    line: string,
    serviceName?: string,
  ): { time: string; level: 'info' | 'warn' | 'error'; tag: string; message: string; service: string };
  export function installTerminalLogger(defaultTag?: string): void;
  export function printBanner(title: string, lines?: string[]): void;
}

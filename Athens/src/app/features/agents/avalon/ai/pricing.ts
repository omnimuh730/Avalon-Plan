export interface AgentPricingRates {
  promptPer1M: number;
  completionPer1M: number;
}

interface AgentModelPricing {
  provider: "openai" | "deepseek";
  label: string;
  rates: AgentPricingRates;
}

const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

const MODEL_CATALOG: Record<string, AgentModelPricing> = {
  "gpt-4o": {
    provider: "openai",
    label: "GPT-4o",
    rates: { promptPer1M: 2.5, completionPer1M: 10 },
  },
  "gpt-4o-mini": {
    provider: "openai",
    label: "GPT-4o Mini",
    rates: { promptPer1M: 0.15, completionPer1M: 0.6 },
  },
  "gpt-4-turbo": {
    provider: "openai",
    label: "GPT-4 Turbo",
    rates: { promptPer1M: 10, completionPer1M: 30 },
  },
  "gpt-4.1": {
    provider: "openai",
    label: "GPT-4.1",
    rates: { promptPer1M: 2, completionPer1M: 8 },
  },
  "gpt-4.1-mini": {
    provider: "openai",
    label: "GPT-4.1 Mini",
    rates: { promptPer1M: 0.4, completionPer1M: 1.6 },
  },
  "gpt-3.5-turbo": {
    provider: "openai",
    label: "GPT-3.5 Turbo",
    rates: { promptPer1M: 0.5, completionPer1M: 1.5 },
  },
  "deepseek-v4-flash": {
    provider: "deepseek",
    label: "DeepSeek V4 Flash",
    rates: { promptPer1M: 0.14, completionPer1M: 0.28 },
  },
  "deepseek-reasoner": {
    provider: "deepseek",
    label: "DeepSeek Reasoner",
    rates: { promptPer1M: 0.55, completionPer1M: 2.19 },
  },
  "deepseek-chat": {
    provider: "deepseek",
    label: "DeepSeek Chat",
    rates: { promptPer1M: 0.27, completionPer1M: 1.1 },
  },
};

/**
 * Mirrors the Avalon AI BFF pricing resolver used by /agents/chat, so the UI
 * can show the same rate policy even before the first response returns rates.
 */
export function resolveAgentModelPricing(model?: string | null): AgentModelPricing | null {
  const id = model?.trim();
  if (!id) return null;

  const known = MODEL_CATALOG[id];
  if (known) return known;

  if (id.startsWith("gpt-")) return MODEL_CATALOG["gpt-4o-mini"];
  if (id.startsWith("deepseek-")) return MODEL_CATALOG[DEFAULT_DEEPSEEK_MODEL];

  return {
    provider: "openai",
    label: id,
    rates: { promptPer1M: 1, completionPer1M: 3 },
  };
}

export function formatAgentRate(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
}

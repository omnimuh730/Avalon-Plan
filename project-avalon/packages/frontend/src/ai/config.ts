/** AI BFF base URL — keys live in packages/ai-bff/.env, not here. */
export const AI_BFF_URL = import.meta.env.VITE_AI_BFF_URL ?? 'http://localhost:3920';

/** Model override — leave unset to use ai-bff DEFAULT_MODEL from packages/ai-bff/.env */
export const AI_MODEL = import.meta.env.VITE_AI_MODEL as string | undefined;

export const ANALYZE_TEMPERATURE = 0.3;

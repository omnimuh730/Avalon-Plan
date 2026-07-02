/** AI BFF base URL — keys live in project-avalon/packages/ai-bff/.env */
import { resolveDevServiceUrl } from "@/lib/api-base";

export const AI_BFF_URL = resolveDevServiceUrl(
  import.meta.env.VITE_AI_BFF_URL,
  "/ai-bff",
  "http://localhost:3920",
);

/** Model override — leave unset to use ai-bff DEFAULT_MODEL */
export const AI_MODEL = import.meta.env.VITE_AI_MODEL as string | undefined;

export const ANALYZE_TEMPERATURE = 0.3;

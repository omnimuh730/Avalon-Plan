import type { View } from "../types";

export const PRO_VIEWS = new Set<View>([
  "ats",
  "copilot",
  "calendar",
  "interviews",
  "vendor-monitor",
  "reports",
]);

export function isProTier(tier: unknown): boolean {
  return String(tier ?? "").trim().toLowerCase() === "pro";
}

export function viewRequiresPro(view: View): boolean {
  return PRO_VIEWS.has(view);
}

export function formatTierLabel(tier: unknown): string {
  return isProTier(tier) ? "Pro" : "Job seeker";
}

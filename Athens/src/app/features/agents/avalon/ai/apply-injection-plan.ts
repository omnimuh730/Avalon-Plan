import type { ActionablePageContext, ApplyInjectionPlanPayload, InjectionPlan } from "@avalon/shared";

export function buildApplyInjectionPlanPayload(
  plan: InjectionPlan,
  page: ActionablePageContext,
  options: { autoSubmit?: boolean; submitDelayMs?: number } = {},
): ApplyInjectionPlanPayload {
  return {
    plan,
    page,
    ...(options.autoSubmit !== undefined ? { autoSubmit: options.autoSubmit } : {}),
    ...(options.submitDelayMs !== undefined ? { submitDelayMs: options.submitDelayMs } : {}),
  };
}

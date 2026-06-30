import type { ActionablePageContext, ApplyInjectionPlanPayload, InjectionPlan } from '@avalon/shared';

export function buildApplyInjectionPlanPayload(
  plan: InjectionPlan,
  page: ActionablePageContext,
): ApplyInjectionPlanPayload {
  return { plan, page };
}

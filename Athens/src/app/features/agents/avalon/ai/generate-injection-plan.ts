import type {
  ActionableTree,
  ControlType,
  InjectionPlan,
  InjectionStep,
  InjectionStepOp,
} from "@avalon/shared";
import type { FieldAction, FieldActionPlan } from "./types";

export interface BuildInjectionPlanOptions {
  tree: ActionableTree;
  fields: FieldActionPlan[];
}

export interface FieldInjectionPreview {
  id: string;
  preview: string;
}

export interface InjectionPlanResult {
  plan: InjectionPlan;
  preview: string;
  fieldPreviews: FieldInjectionPreview[];
}

function deriveOp(action: FieldAction, controlType: ControlType): InjectionStepOp | null {
  switch (action) {
    case "Click":
      return "click";
    case "FileUpload":
      return "attachFile";
    case "Check":
    case "Uncheck":
      return "setChecked";
    case "SelectOption":
      return controlType === "combobox" ? "typeCombobox" : "selectOption";
    case "Typing":
      if (controlType === "combobox") return "typeCombobox";
      if (controlType === "select") return "selectOption";
      return "setValue";
    default:
      return null;
  }
}

function describeStep(step: InjectionStep, index: number): string {
  const head = `${index + 1}. ${step.op} "${step.label}"`;
  if (step.op === "attachFile") return `${head} → default résumé`;
  if (step.op === "setChecked") return `${head} = ${step.checked ? "checked" : "unchecked"}`;
  if (step.op === "click") return head;
  return `${head} = ${step.value ?? ""}`;
}

export function buildFormInjectionPlan(options: BuildInjectionPlanOptions): InjectionPlanResult {
  const { tree, fields } = options;
  const planById = new Map(fields.map((f) => [f.id, f]));
  const steps: InjectionStep[] = [];
  const fieldPreviews: FieldInjectionPreview[] = [];

  tree.forEach((group, groupIdx) => {
    group.children.forEach((entry, childIdx) => {
      const id = `${groupIdx}:${childIdx}`;

      if (entry.controlType === "file") {
        steps.push({ id, label: entry.target || id, op: "attachFile", control: entry.control });
        return;
      }

      const field = planById.get(id);
      if (!field || field.shouldSkip === "Yes") return;

      const op = deriveOp(field.action, entry.controlType);
      if (!op || op === "attachFile") return;

      const step: InjectionStep = {
        id,
        label: entry.target || id,
        op,
        control: entry.control,
      };
      if (op === "setChecked") {
        step.checked = field.action !== "Uncheck";
      } else if (op !== "click") {
        step.value = field.value;
      }

      steps.push(step);
    });
  });

  steps.forEach((step, index) => {
    fieldPreviews.push({ id: step.id, preview: describeStep(step, index) });
  });

  const preview = steps.map(describeStep).join("\n");
  return { plan: { steps }, preview, fieldPreviews };
}

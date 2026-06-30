import { findElementByTarget, type InjectionPlan, type InjectionStep } from '@avalon/shared';
import { createInjectionHelpers } from './injection-helpers.js';
import {
  findListboxForInput,
  getComboboxInput,
  isVisibleListbox,
  resolveInputTarget,
} from './dom-analytics.js';

export interface InjectionStepResult {
  id: string;
  label: string;
  op: InjectionStep['op'];
  ok: boolean;
  error?: string;
}

export interface InjectionPlanRunResult {
  applied: number;
  failed: number;
  results: InjectionStepResult[];
  /** File inputs resolved + tagged for the background to fill in the MAIN world
   * (the isolated content world cannot assign `input.files`). */
  fileTargets: { id: string; label: string }[];
}

/** Marker attribute the MAIN-world file setter looks for. */
export const FILE_TARGET_ATTR = 'data-avalon-file-target';

const STEP_GAP_MS = 120;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveControl(step: InjectionStep): HTMLElement {
  const matched = findElementByTarget(document, step.control);
  if (!matched) {
    throw new Error(`No element matched ${step.label || step.id}`);
  }
  return resolveInputTarget(matched);
}

/** After typing into an autocomplete, click the option whose text best matches. */
function pickComboboxOption(input: HTMLInputElement, label: string): boolean {
  const listbox = findListboxForInput(input);
  if (!listbox || !isVisibleListbox(listbox)) return false;
  const needle = label.trim().toLowerCase();
  const options = Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"], li'));
  const hit =
    options.find((o) => (o.textContent ?? '').trim().toLowerCase() === needle) ??
    options.find((o) => (o.textContent ?? '').trim().toLowerCase().includes(needle));
  if (!hit) return false;
  hit.click();
  return true;
}

async function runStep(
  step: InjectionStep,
  helpers: ReturnType<typeof createInjectionHelpers>,
): Promise<void> {
  const element = resolveControl(step);

  switch (step.op) {
    case 'setValue': {
      if (element.isContentEditable) {
        helpers.setRichText(element, step.value ?? '');
        return;
      }
      const field =
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element
          : element.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
      if (!field) {
        throw new Error(`No fillable input for ${step.label || step.id}`);
      }
      helpers.setValue(field, step.value ?? '');
      return;
    }

    case 'setRichText':
      helpers.setRichText(element, step.value ?? '');
      return;

    case 'selectOption':
      helpers.selectOption(element as HTMLSelectElement, step.value ?? '');
      return;

    case 'typeCombobox': {
      const input =
        element instanceof HTMLInputElement ? element : getComboboxInput(element);
      if (!input) throw new Error(`Combobox input not found for ${step.label || step.id}`);
      const value = step.value ?? '';
      const optionsLoaded = await helpers.typeCombobox(input, value);
      if (optionsLoaded && !pickComboboxOption(input, value)) {
        // Options appeared but none matched — leave the typed text in place.
      }
      return;
    }

    case 'setChecked':
      helpers.setChecked(element as HTMLInputElement, step.checked ?? true);
      return;

    case 'click':
      helpers.click(element);
      return;

    case 'attachFile': {
      // Resolve the file input and tag it — the actual `input.files` assignment
      // is done by the background in the page's MAIN world (the isolated content
      // world silently no-ops `input.files`). Returns true to mark the tag done.
      const fileInput =
        element instanceof HTMLInputElement && element.type === 'file'
          ? element
          : element.querySelector<HTMLInputElement>('input[type="file"]');
      if (!fileInput) throw new Error(`No file input for ${step.label || step.id}`);
      fileInput.setAttribute(FILE_TARGET_ATTR, '1');
      return;
    }

    default: {
      const exhaustive: never = step.op;
      throw new Error(`Unsupported injection op: ${String(exhaustive)}`);
    }
  }
}

export async function runInjectionPlan(plan: InjectionPlan): Promise<InjectionPlanRunResult> {
  const helpers = createInjectionHelpers();
  const results: InjectionStepResult[] = [];
  const fileTargets: { id: string; label: string }[] = [];
  let applied = 0;
  let failed = 0;

  for (const step of plan.steps) {
    try {
      await runStep(step, helpers);
      applied += 1;
      results.push({ id: step.id, label: step.label, op: step.op, ok: true });
      if (step.op === 'attachFile') fileTargets.push({ id: step.id, label: step.label });
    } catch (error) {
      failed += 1;
      results.push({
        id: step.id,
        label: step.label,
        op: step.op,
        ok: false,
        error: errorMessage(error),
      });
    }
    await helpers.wait(STEP_GAP_MS);
  }

  return { applied, failed, results, fileTargets };
}

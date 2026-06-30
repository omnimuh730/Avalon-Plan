import {
  type ApplyInjectionPlanPayload,
  type ActionResult,
  type ApplyProgress,
  type InjectionPlan,
} from '@avalon/shared';
import { EXTENSION_MESSAGES } from './constants';
import { ensureContentScript } from './tab-messages';
import { FILE_TARGET_ATTR, type InjectionPlanRunResult } from './injection-plan-runner';

const DEFAULT_SUBMIT_DELAY_MS = 5000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run a (possibly partial) injection plan in the page and return its result. */
async function runPlanInTab(tabId: number, plan: InjectionPlan): Promise<InjectionPlanRunResult> {
  const response = (await browser.tabs.sendMessage(tabId, {
    type: EXTENSION_MESSAGES.RUN_INJECTION_PLAN,
    plan,
  })) as { ok?: boolean; data?: InjectionPlanRunResult; error?: string } | undefined;

  if (!response?.ok || !response.data) {
    throw new Error(response?.error ?? 'Injection plan failed');
  }
  return response.data;
}

const DEFAULT_FILE = 'Eli Taylor.docx';
const DEFAULT_FILE_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Read the bundled résumé as base64 (structured-clone-safe for executeScript args). */
async function readDefaultFileBase64(): Promise<string> {
  const response = await fetch(browser.runtime.getURL(DEFAULT_FILE));
  if (!response.ok) throw new Error(`Could not load ${DEFAULT_FILE}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Runs in the page's MAIN world (injected by the extension, so CSP-immune).
 * Assigns the file to every input the content script tagged — the isolated
 * content world silently ignores `input.files`, the MAIN world does not.
 */
function attachFilesInMainWorld(attr: string, base64: string, name: string, mime: string): number {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const file = new File([bytes], name, { type: mime });

  let attached = 0;
  for (const node of Array.from(document.querySelectorAll(`[${attr}]`))) {
    const input = node as HTMLInputElement;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      attached += input.files.length > 0 ? 1 : 0;
    } catch {
      /* leave the tag; reported as not-attached */
    }
    input.removeAttribute(attr);
  }
  return attached;
}

/** Set files on the content-script-tagged inputs from the MAIN world. */
async function attachTaggedFiles(tabId: number): Promise<number> {
  const base64 = await readDefaultFileBase64();
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: attachFilesInMainWorld,
    args: [FILE_TARGET_ATTR, base64, DEFAULT_FILE, DEFAULT_FILE_MIME],
  });
  return typeof injection?.result === 'number' ? injection.result : 0;
}

export async function executeInjectionPlan(
  tabId: number,
  payload: ApplyInjectionPlanPayload,
  onProgress?: (progress: Omit<ApplyProgress, 'at'>) => void,
): Promise<ActionResult['data']> {
  const steps = payload.plan?.steps ?? [];
  if (steps.length === 0) {
    throw new Error('Injection plan has no steps');
  }

  const emit = (progress: Omit<ApplyProgress, 'at'>) => onProgress?.(progress);

  await ensureContentScript(tabId);

  const fileSteps = steps.filter((s) => s.op === 'attachFile');
  const fieldSteps = steps.filter((s) => s.op !== 'attachFile');
  const totalSteps = steps.length;
  let applied = 0;
  let failed = 0;
  const results: InjectionPlanRunResult['results'] = [];

  // --- Phase 1: file uploads (top priority — run first and wait for completion).
  if (fileSteps.length > 0) {
    emit({ phase: 'files', message: `Uploading ${fileSteps.length} file(s)…`, appliedSteps: 0, totalSteps });
    const fileRun = await runPlanInTab(tabId, { steps: fileSteps });
    results.push(...fileRun.results);
    applied += fileRun.applied;
    failed += fileRun.failed;

    // The isolated content world can't assign `input.files`; the background sets
    // the bytes in the page's MAIN world. We await it, so the upload is fully
    // committed before any other field is touched.
    let fileFailed = 0;
    if (fileRun.fileTargets.length > 0) {
      const attached = await attachTaggedFiles(tabId);
      fileFailed = fileRun.fileTargets.length - attached;
      failed += fileFailed;
    }
    emit({
      phase: 'files',
      message:
        fileFailed > 0
          ? `Files uploaded with ${fileFailed} failure(s)`
          : 'Files uploaded',
      appliedSteps: applied,
      totalSteps,
    });
  }

  // --- Phase 2: remaining form fields.
  if (fieldSteps.length > 0) {
    emit({ phase: 'fields', message: `Filling ${fieldSteps.length} field(s)…`, appliedSteps: applied, totalSteps });
    const fieldRun = await runPlanInTab(tabId, { steps: fieldSteps });
    results.push(...fieldRun.results);
    applied += fieldRun.applied;
    failed += fieldRun.failed;
    emit({ phase: 'fields', message: 'Fields filled', appliedSteps: applied, totalSteps });
  }

  // --- Phase 3: countdown, then auto-click Submit/Apply/Next (the final step).
  let submitted = false;
  if (payload.autoSubmit !== false) {
    const delayMs = payload.submitDelayMs ?? DEFAULT_SUBMIT_DELAY_MS;
    for (let secondsLeft = Math.ceil(delayMs / 1000); secondsLeft > 0; secondsLeft -= 1) {
      emit({
        phase: 'submit-wait',
        message: `Submitting in ${secondsLeft}…`,
        secondsLeft,
        appliedSteps: applied,
        totalSteps,
      });
      await sleep(1000);
    }

    const submitResponse = (await browser.tabs.sendMessage(tabId, {
      type: EXTENSION_MESSAGES.RUN_SUBMIT,
    })) as { ok?: boolean; clicked?: boolean; label?: string; error?: string } | undefined;

    submitted = Boolean(submitResponse?.clicked);
    if (submitted) {
      emit({ phase: 'submitted', message: `Submitted${submitResponse?.label ? ` (${submitResponse.label})` : ''}`, appliedSteps: applied, totalSteps });
    } else {
      emit({ phase: 'done', message: 'No submit control found — left for manual review', appliedSteps: applied, totalSteps });
    }
  } else {
    emit({ phase: 'done', message: 'Fill complete', appliedSteps: applied, totalSteps });
  }

  return {
    applied,
    skipped: 0,
    failed,
    result: results,
    submitted,
  };
}

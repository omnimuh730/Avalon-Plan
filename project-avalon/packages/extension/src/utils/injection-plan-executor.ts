import { type ApplyInjectionPlanPayload, type ActionResult } from '@avalon/shared';
import { EXTENSION_MESSAGES } from './constants';
import { ensureContentScript } from './tab-messages';
import { FILE_TARGET_ATTR, type InjectionPlanRunResult } from './injection-plan-runner';

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
): Promise<ActionResult['data']> {
  const steps = payload.plan?.steps ?? [];
  if (steps.length === 0) {
    throw new Error('Injection plan has no steps');
  }

  await ensureContentScript(tabId);
  const response = (await browser.tabs.sendMessage(tabId, {
    type: EXTENSION_MESSAGES.RUN_INJECTION_PLAN,
    plan: payload.plan,
  })) as { ok?: boolean; data?: InjectionPlanRunResult; error?: string } | undefined;

  if (!response?.ok || !response.data) {
    throw new Error(response?.error ?? 'Injection plan failed');
  }

  const { applied, failed, results, fileTargets } = response.data;

  // The résumé upload is top priority: every tagged file input is filled in the
  // MAIN world. Surface a clear failure if a file input was found but not set.
  let fileFailed = 0;
  if (fileTargets.length > 0) {
    const attached = await attachTaggedFiles(tabId);
    fileFailed = fileTargets.length - attached;
  }

  return {
    applied,
    skipped: 0,
    failed: failed + fileFailed,
    result: results,
  };
}

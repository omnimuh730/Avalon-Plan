/**
 * Isolated-world resume upload bridge (CSP-safe).
 *
 * Greenhouse and similar ATS pages block CRX MAIN-world dynamic imports via CSP.
 * This script:
 * 1. Rewrites <input type="file"> selections in the isolated world (DOM is shared)
 * 2. Asks the service worker to inject FormData/fetch/XHR hooks via executeScript
 *    (world: MAIN) — that path is not subject to page CSP
 * 3. Relays MAIN-world log postMessages to the service worker
 */

import {
  cloneFileWithName,
  profileNameToFileBase,
  shouldRenameResume,
  isTargetResumeName,
  type ResumeUploadSource,
} from '@/lib/resume-filename';

const HOOK_SOURCE = 'resume-upload-hook';
const BRIDGE_SOURCE = 'resume-upload-bridge';

let lastProfileFileBase: string | null = null;
let injectRequested = false;
const rewritingInputs = new WeakSet<HTMLInputElement>();

function postConfig(profileFileBase: string | null): void {
  lastProfileFileBase = profileFileBase;
  try {
    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        kind: 'config',
        profileFileBase,
      },
      '*',
    );
  } catch {
    // ignore
  }
}

function forwardLog(data: {
  originalName: string;
  cleanedName: string | null;
  renamed: boolean;
  uploadSource: ResumeUploadSource;
  pageUrl?: string;
  ts?: number;
  profileFileBase?: string | null;
  fileSize?: number;
  lastModified?: number;
}): void {
  try {
    void chrome.runtime.sendMessage({
      type: 'LOG_UPLOAD',
      originalName: data.originalName,
      cleanedName: data.cleanedName,
      renamed: data.renamed,
      source: data.uploadSource,
      pageUrl: data.pageUrl ?? location.href,
      ts: data.ts ?? Date.now(),
      profileFileBase: data.profileFileBase ?? lastProfileFileBase,
      fileSize: data.fileSize,
      lastModified: data.lastModified,
    });
  } catch (error) {
    console.warn('[resume-upload-bridge] failed to send LOG_UPLOAD', error);
  }
}

function rewriteFileList(input: HTMLInputElement): void {
  if (rewritingInputs.has(input)) return;

  const list = input.files;
  if (!list || list.length === 0) return;

  rewritingInputs.add(input);
  try {
    let changed = false;
    const dt = new DataTransfer();

    for (let i = 0; i < list.length; i += 1) {
      const original = list.item(i);
      if (!original) continue;

      if (!isTargetResumeName(original.name)) {
        dt.items.add(original);
        continue;
      }

      const cleanedName = shouldRenameResume(original.name, lastProfileFileBase);

      if (cleanedName) {
        // Always log the bidder's original name when we rename.
        forwardLog({
          originalName: original.name,
          cleanedName,
          renamed: true,
          uploadSource: 'input',
          fileSize: original.size,
          lastModified: original.lastModified,
        });
        dt.items.add(cloneFileWithName(original, cleanedName, original.name));
        changed = true;
        continue;
      }

      // Already profile-named, or no profile loaded — only log detection if we
      // cannot rename yet (so the sidebar still shows what was selected).
      if (!lastProfileFileBase) {
        forwardLog({
          originalName: original.name,
          cleanedName: null,
          renamed: false,
          uploadSource: 'input',
          fileSize: original.size,
          lastModified: original.lastModified,
        });
      }
      dt.items.add(original);
    }

    if (changed) {
      try {
        input.files = dt.files;
      } catch (error) {
        console.warn('[resume-upload-bridge] failed to assign input.files', error);
      }
    }
  } finally {
    rewritingInputs.delete(input);
  }
}

function onFileInputChange(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'file') return;
  rewriteFileList(target);
}

async function syncProfileFromStorage(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['applierName']);
    const base = profileNameToFileBase(
      result.applierName ? String(result.applierName) : null,
    );
    postConfig(base);
  } catch (error) {
    console.warn('[resume-upload-bridge] failed to read profile', error);
    postConfig(null);
  }
}

function requestMainWorldInject(): void {
  if (injectRequested) return;
  injectRequested = true;
  try {
    void chrome.runtime
      .sendMessage({
        type: 'INJECT_RESUME_UPLOAD_HOOKS',
        profileFileBase: lastProfileFileBase,
      })
      .catch((error: unknown) => {
        injectRequested = false;
        console.warn('[resume-upload-bridge] inject request failed', error);
      });
  } catch (error) {
    injectRequested = false;
    console.warn('[resume-upload-bridge] inject request failed', error);
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as {
    source?: string;
    kind?: string;
    originalName?: string;
    cleanedName?: string | null;
    renamed?: boolean;
    uploadSource?: ResumeUploadSource;
    pageUrl?: string;
    ts?: number;
    profileFileBase?: string | null;
    fileSize?: number;
    lastModified?: number;
  } | null;

  if (!data || data.source !== HOOK_SOURCE) return;

  if (data.kind === 'ready') {
    void syncProfileFromStorage();
    return;
  }

  if (data.kind === 'log' && typeof data.originalName === 'string') {
    // Ignore no-op "already matched" noise from FormData after input rename.
    if (!data.renamed && data.cleanedName == null) return;

    forwardLog({
      originalName: data.originalName,
      cleanedName: data.cleanedName ?? null,
      renamed: Boolean(data.renamed),
      uploadSource: data.uploadSource ?? 'formdata',
      pageUrl: typeof data.pageUrl === 'string' ? data.pageUrl : location.href,
      ts: typeof data.ts === 'number' ? data.ts : Date.now(),
      profileFileBase: data.profileFileBase ?? lastProfileFileBase,
      fileSize: data.fileSize,
      lastModified: data.lastModified,
    });
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.applierName) return;
  const next = changes.applierName.newValue;
  const base = profileNameToFileBase(next ? String(next) : null);
  postConfig(base);
  injectRequested = false;
  requestMainWorldInject();
});

// Single capture-phase listener (avoid double-binding the same input).
document.addEventListener('change', onFileInputChange, true);

function scanFileInputs(root: ParentNode = document): void {
  // Touch inputs so late-added widgets are present for query; change is handled
  // via document capture so we do not attach duplicate listeners.
  root.querySelectorAll('input[type="file"]');
}

scanFileInputs();

const inputObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof Element) scanFileInputs(node);
    }
  }
});

try {
  inputObserver.observe(document.documentElement, { childList: true, subtree: true });
} catch {
  // Document may not be ready in edge frames.
}

void (async () => {
  await syncProfileFromStorage();
  requestMainWorldInject();
})();

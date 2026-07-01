/** URLs tabCapture cannot record. */
const UNCAPTURABLE = /^(chrome:|chrome-extension:|edge:|about:|devtools:)/i;

export function isCapturableUrl(url: string | undefined): boolean {
  const u = String(url ?? '').trim();
  if (!u) return false;
  return !UNCAPTURABLE.test(u);
}

/** Pick the active page tab in the focused browser window (not extension pages). */
export async function resolveCaptureTabId(): Promise<number> {
  const window = await chrome.windows.getLastFocused({ populate: true });
  const tabs = window.tabs ?? [];
  const active = tabs.find((t) => t.active && typeof t.id === 'number');
  if (active?.id != null && isCapturableUrl(active.url)) return active.id;

  const capturable = tabs.find((t) => typeof t.id === 'number' && isCapturableUrl(t.url));
  if (capturable?.id != null) return capturable.id;

  const [fallback] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (fallback?.id != null && isCapturableUrl(fallback.url)) return fallback.id;

  throw new Error(
    'No capturable tab found. Focus the job application tab in the browser, then click Start live view.',
  );
}

/**
 * Must run in an extension page click handler (side panel) — Chrome does not
 * propagate user-gesture to the service worker via runtime.sendMessage.
 */
export function getMediaStreamIdForTab(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      const err = chrome.runtime.lastError;
      if (err || !streamId) {
        reject(new Error(err?.message ?? 'Could not get tab stream'));
        return;
      }
      resolve(streamId);
    });
  });
}

/**
 * Isolated-world bid recorder bridge (hold-until-screenshot).
 *
 * Receives hold-capture from MAIN only. Does NOT attach its own click/submit
 * holders — MAIN and isolated worlds both see DOM events, and stopImmediate-
 * Propagation does not cross worlds. A second holder here caused an infinite
 * capture loop on every synthetic replay click.
 */

const TRIGGER_PATTERN = /(apply|submit|next|continue|proceed|save)/i;
const HOOK_SOURCE = 'bid-recorder-hook';
const BRIDGE_SOURCE = 'bid-recorder-bridge';
/** Don't freeze the ATS UI forever if CDP stitching is slow. */
const CAPTURE_TIMEOUT_MS = 7000;
/** Ignore further hold-capture messages after a successful shot+resume. */
const SUPPRESS_AFTER_RESUME_MS = 2500;

let lastSentAt = 0;
let capturing = false;
let suppressCapturesUntil = 0;

function resumeMainHook(): void {
  try {
    window.postMessage({ source: BRIDGE_SOURCE, type: 'resume-action' }, '*');
  } catch {
    // ignore
  }
}

async function runHoldCapture(triggerText: string): Promise<void> {
  const text = triggerText.replace(/\s+/g, ' ').trim();
  if (!text || (!TRIGGER_PATTERN.test(text) && text !== 'Apply')) return;

  // Replay / double-message guard — still resume MAIN if it is waiting.
  if (Date.now() < suppressCapturesUntil) {
    resumeMainHook();
    return;
  }

  if (!chrome.runtime?.id) {
    console.warn('[bid-recorder] extension context invalidated — refresh this tab');
    resumeMainHook();
    return;
  }

  const now = Date.now();
  if (capturing) return;
  if (now - lastSentAt < 500) {
    resumeMainHook();
    return;
  }
  lastSentAt = now;
  capturing = true;

  try {
    console.log('[bid-recorder] hold-capture → full page (until shot):', text);
    await Promise.race([
      chrome.runtime.sendMessage({ type: 'BID_PROCESS_CLICK', triggerText: text }),
      new Promise((resolve) => setTimeout(resolve, CAPTURE_TIMEOUT_MS)),
    ]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!/context invalidated|message port closed/i.test(msg)) {
      console.warn('[bid-recorder] capture request failed:', msg);
    }
  } finally {
    capturing = false;
    // Block re-entry from the synthetic replay click / duplicate posts.
    suppressCapturesUntil = Date.now() + SUPPRESS_AFTER_RESUME_MS;
    resumeMainHook();
  }
}

function start(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as {
      source?: string;
      type?: string;
      triggerText?: string;
    } | null;
    if (data?.source !== HOOK_SOURCE) return;

    if (data.type === 'hold-capture' && data.triggerText) {
      void runHoldCapture(data.triggerText);
    }
  });
}

start();

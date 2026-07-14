/**
 * Isolated-world bid recorder bridge.
 *
 * Receives hold-capture requests from the MAIN-world hook, asks the service
 * worker to take a full-page screenshot (safe because the page click is paused),
 * then tells MAIN to replay the original Apply/Submit/Next action.
 *
 * Also keeps a capture-phase fallback for frames where the MAIN hook is absent.
 */

const TRIGGER_PATTERN = /(apply|submit|next|continue|proceed|save)/i;
const ACTION_SELECTOR =
  'a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], label';
const HOOK_SOURCE = 'bid-recorder-hook';
const BRIDGE_SOURCE = 'bid-recorder-bridge';
/** Don't freeze the ATS UI forever if CDP stitching is slow. */
const CAPTURE_TIMEOUT_MS = 6000;

let lastSentAt = 0;
let capturing = false;
let fallbackHolding = false;
let fallbackPending:
  | { kind: 'click'; label: string; element: Element }
  | {
      kind: 'submit';
      label: string;
      form: HTMLFormElement;
      submitter: HTMLElement | null;
    }
  | null = null;

function readableText(element: Element): string {
  const aria = element.getAttribute('aria-label')?.trim();
  if (aria) return aria;

  if (element instanceof HTMLInputElement) {
    return (element.value || element.getAttribute('title') || '').trim();
  }

  return (element.textContent ?? element.getAttribute('title') ?? '').replace(/\s+/g, ' ').trim();
}

function triggerTextFor(element: Element): string | null {
  const text = readableText(element);
  if (!text || text.length > 80) return null;
  return TRIGGER_PATTERN.test(text) ? text : null;
}

function collectElements(event: Event): Element[] {
  const out: Element[] = [];
  const seen = new Set<Element>();

  const push = (el: Element | null | undefined) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    out.push(el);
  };

  if (event.target instanceof Element) {
    let cur: Element | null = event.target;
    for (let depth = 0; depth < 16 && cur; depth += 1) {
      push(cur);
      cur = cur.parentElement;
    }
  }

  if (typeof event.composedPath === 'function') {
    for (const node of event.composedPath()) {
      if (node instanceof Element) push(node);
    }
  }

  return out;
}

function hasPointerCursor(element: Element): boolean {
  try {
    return window.getComputedStyle(element).cursor === 'pointer';
  } catch {
    return false;
  }
}

function findTriggerFromEvent(event: Event): { label: string; element: Element } | null {
  for (const node of collectElements(event)) {
    const text = triggerTextFor(node);
    if (!text) continue;

    if (node.matches(ACTION_SELECTOR)) return { label: text, element: node };
    if (node.closest('form')) return { label: text, element: node };

    const tag = node.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'label' || tag === 'input') {
      return { label: text, element: node };
    }
    if (hasPointerCursor(node)) return { label: text, element: node };
    if (node.closest(ACTION_SELECTOR)) return { label: text, element: node };
  }
  return null;
}

function resumeMainHook(): void {
  try {
    window.postMessage({ source: BRIDGE_SOURCE, type: 'resume-action' }, '*');
  } catch {
    // ignore
  }
}

function replayFallback(): void {
  const action = fallbackPending;
  fallbackPending = null;
  fallbackHolding = false;
  if (!action) return;

  try {
    if (action.kind === 'click') {
      if (action.element instanceof HTMLElement) action.element.click();
      else {
        action.element.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
        );
      }
      return;
    }
    if (typeof action.form.requestSubmit === 'function') {
      action.form.requestSubmit(action.submitter ?? undefined);
    } else {
      action.form.submit();
    }
  } catch (error) {
    console.warn('[bid-recorder] failed to replay fallback action:', error);
  }
}

async function runCapture(triggerText: string): Promise<void> {
  const text = triggerText.replace(/\s+/g, ' ').trim();
  if (!text || !TRIGGER_PATTERN.test(text)) return;

  const now = Date.now();
  if (capturing || now - lastSentAt < 250) return;
  lastSentAt = now;
  capturing = true;

  try {
    console.log('[bid-recorder] hold-capture → full page:', text);
    await Promise.race([
      chrome.runtime.sendMessage({ type: 'BID_PROCESS_CLICK', triggerText: text }),
      new Promise((resolve) => setTimeout(resolve, CAPTURE_TIMEOUT_MS)),
    ]);
  } catch (error) {
    console.warn('[bid-recorder] capture request failed:', error);
  } finally {
    capturing = false;
    resumeMainHook();
    if (fallbackHolding) replayFallback();
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

    // New hold-capture protocol from MAIN world.
    if (data.type === 'hold-capture' && data.triggerText) {
      void runCapture(data.triggerText);
      return;
    }

    // Legacy fire-and-forget posts (old injects) — ignore to avoid double captures.
  });

  // Fallback when MAIN hook isn't present (rare CSP / inject race).
  document.addEventListener(
    'click',
    (event) => {
      if ((window as Window & { __bidRecorderMainHook?: boolean }).__bidRecorderMainHook) return;
      if (fallbackHolding || capturing) return;
      if (typeof event.button === 'number' && event.button !== 0) return;

      const hit = findTriggerFromEvent(event);
      if (!hit) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      fallbackHolding = true;
      fallbackPending = { kind: 'click', label: hit.label, element: hit.element };
      void runCapture(hit.label);
    },
    true,
  );

  document.addEventListener(
    'submit',
    (event) => {
      if ((window as Window & { __bidRecorderMainHook?: boolean }).__bidRecorderMainHook) return;
      if (fallbackHolding || capturing) return;

      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      const submitEvent = event as SubmitEvent;
      const submitter =
        submitEvent.submitter instanceof HTMLElement ? submitEvent.submitter : null;
      const fromSubmitter = submitter ? triggerTextFor(submitter) || readableText(submitter) : '';
      const label =
        fromSubmitter && TRIGGER_PATTERN.test(fromSubmitter) ? fromSubmitter : 'Submit';

      event.preventDefault();
      event.stopImmediatePropagation();
      fallbackHolding = true;
      fallbackPending = { kind: 'submit', label, form, submitter };
      void runCapture(label);
    },
    true,
  );
}

start();

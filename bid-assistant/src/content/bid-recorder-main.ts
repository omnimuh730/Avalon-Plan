/**
 * MAIN-world bid click hook. Registered via manifest `world: "MAIN"` so it
 * bypasses page CSP (Greenhouse blocks inline <script> injection).
 *
 * Hold-capture flow:
 * 1. Intercept Apply/Submit/Next click (or form submit) in capture phase
 * 2. Ask the isolated bridge to capture a full-page screenshot
 * 3. After capture finishes (or times out), replay the original action
 *
 * Pausing the click avoids attaching chrome.debugger mid-handler, which used
 * to break SPA submit handlers and cause native form refreshes.
 */

declare global {
  interface Window {
    __bidRecorderMainHook?: boolean;
    __bidReplayAction?: boolean;
  }
}

const TRIGGER_PATTERN = /(apply|submit|next|continue|proceed|save)/i;
const SOURCE = 'bid-recorder-hook';
const BRIDGE_SOURCE = 'bid-recorder-bridge';
/** Safety net if the isolated bridge never answers. */
const HOLD_TIMEOUT_MS = 7000;

type PendingAction =
  | { kind: 'click'; label: string; element: Element }
  | {
      kind: 'submit';
      label: string;
      form: HTMLFormElement;
      submitter: HTMLElement | null;
    };

let pending: PendingAction | null = null;
let holding = false;
let holdTimer: number | null = null;

function txt(el: Element | null): string {
  if (!el || !el.getAttribute) return '';
  return (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
}

function findTrigger(start: EventTarget | null): { label: string; element: Element } | null {
  let t: Element | null = start instanceof Element ? start : null;
  for (let i = 0; i < 16 && t; i += 1) {
    if (t.nodeType !== 1) {
      t = t.parentElement;
      continue;
    }
    const s = txt(t);
    if (s && s.length <= 80 && TRIGGER_PATTERN.test(s)) {
      return { label: s, element: t };
    }
    t = t.parentElement;
  }
  return null;
}

function postHold(label: string): void {
  try {
    window.postMessage({ source: SOURCE, type: 'hold-capture', triggerText: label }, '*');
  } catch {
    // ignore
  }
}

function clearHoldTimer(): void {
  if (holdTimer != null) {
    window.clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function replayPending(): void {
  clearHoldTimer();
  const action = pending;
  pending = null;
  holding = false;
  if (!action) return;

  window.__bidReplayAction = true;
  try {
    if (action.kind === 'click') {
      const el = action.element;
      if (el instanceof HTMLElement) {
        el.click();
      } else {
        el.dispatchEvent(
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
    console.warn('[bid-recorder-main] failed to replay action after capture:', error);
  } finally {
    window.__bidReplayAction = false;
  }
}

function beginHold(action: PendingAction, event: Event): void {
  if (window.__bidReplayAction || holding) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  holding = true;
  pending = action;
  clearHoldTimer();
  holdTimer = window.setTimeout(() => {
    console.warn('[bid-recorder-main] hold timed out — replaying action');
    replayPending();
  }, HOLD_TIMEOUT_MS);
  postHold(action.label);
}

function install(): void {
  if (window.__bidRecorderMainHook) return;
  window.__bidRecorderMainHook = true;

  document.addEventListener(
    'click',
    (e) => {
      if (window.__bidReplayAction || holding) return;
      // Only primary-button left clicks.
      if (typeof e.button === 'number' && e.button !== 0) return;
      const hit = findTrigger(e.target);
      if (!hit) return;
      beginHold({ kind: 'click', label: hit.label, element: hit.element }, e);
    },
    true,
  );

  document.addEventListener(
    'submit',
    (e) => {
      if (window.__bidReplayAction || holding) return;
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;

      const submitEvent = e as SubmitEvent;
      const submitter =
        submitEvent.submitter instanceof HTMLElement ? submitEvent.submitter : null;
      const fromSubmitter = submitter ? txt(submitter) : '';
      const label =
        fromSubmitter && TRIGGER_PATTERN.test(fromSubmitter)
          ? fromSubmitter
          : findTrigger(submitter)?.label || 'Submit';

      beginHold(
        {
          kind: 'submit',
          label,
          form,
          submitter,
        },
        e,
      );
    },
    true,
  );

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as { source?: string; type?: string } | null;
    if (data?.source !== BRIDGE_SOURCE || data.type !== 'resume-action') return;
    replayPending();
  });
}

install();

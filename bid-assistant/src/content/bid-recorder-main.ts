/**
 * MAIN-world bid click hook (hold-until-screenshot).
 *
 * Option 2 — short hold only until the image exists:
 * 1. Intercept Apply/Submit/Next click (or form submit) in capture phase
 * 2. Ask the isolated bridge to take a full-page screenshot
 * 3. As soon as capture finishes (or times out), replay the original action
 *
 * Persistence (gallery / Mongo) must NOT delay the resume — that happens in
 * the service worker after it answers the content script.
 */

declare global {
  interface Window {
    /** Versioned so inject can replace the old fire-and-forget hook after reload. */
    __bidRecorderMainHook?: string;
    __bidReplayAction?: boolean;
  }
}

const HOOK_VERSION = 'hold-v1';
const TRIGGER_PATTERN = /(apply|submit|next|continue|proceed|save)/i;
const ACTION_SELECTOR =
  'a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], label';
const SOURCE = 'bid-recorder-hook';
const BRIDGE_SOURCE = 'bid-recorder-bridge';
/** Safety net if the isolated bridge never answers. */
const HOLD_TIMEOUT_MS = 8000;

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

function txt(el: Element | null | undefined): string {
  if (!el || !el.getAttribute) return '';
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria.replace(/\s+/g, ' ').trim();
  if (el instanceof HTMLInputElement) {
    return (el.value || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
  }
  return (el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
}

function labelFor(el: Element): string | null {
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria && aria.length <= 120 && TRIGGER_PATTERN.test(aria)) {
    return aria.replace(/\s+/g, ' ').trim();
  }

  if (el instanceof HTMLInputElement) {
    const v = (el.value || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
    if (v && v.length <= 120 && TRIGGER_PATTERN.test(v)) return v;
  }

  let direct = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) direct += node.textContent ?? '';
  }
  direct = direct.replace(/\s+/g, ' ').trim();
  if (direct && direct.length <= 120 && TRIGGER_PATTERN.test(direct)) return direct;

  const full = txt(el);
  if (full && full.length <= 120 && TRIGGER_PATTERN.test(full)) return full;

  if (el instanceof HTMLAnchorElement) {
    const href = el.getAttribute('href') || '';
    if (/apply|application/i.test(href)) {
      return direct || (full.length <= 120 ? full : '') || 'Apply';
    }
  }

  return null;
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

function findTrigger(event: Event): { label: string; element: Element } | null {
  for (const node of collectElements(event)) {
    const s = labelFor(node);
    if (!s) continue;

    if (node.matches(ACTION_SELECTOR)) return { label: s, element: node };
    if (node.closest(ACTION_SELECTOR)) return { label: s, element: node };
    if (node.closest('form')) return { label: s, element: node };

    const tag = node.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'label' || tag === 'input') {
      return { label: s, element: node };
    }
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

  // Stay true through the synthetic click and a short tick so SPA routers /
  // nested handlers do not re-enter beginHold (infinite capture loop).
  window.__bidReplayAction = true;
  const clearReplayFlag = () => {
    window.__bidReplayAction = false;
  };

  try {
    if (action.kind === 'click') {
      const el = action.element;
      // Prefer real navigation for anchors — synthetic click is flaky on some ATS.
      if (el instanceof HTMLAnchorElement && el.href) {
        const href = el.href;
        if (el.target && el.target !== '_self' && el.target !== '') {
          window.open(href, el.target);
        } else {
          window.location.assign(href);
        }
        return;
      }
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
    queueMicrotask(clearReplayFlag);
    window.setTimeout(clearReplayFlag, 300);
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
  if (window.__bidRecorderMainHook === HOOK_VERSION) return;
  window.__bidRecorderMainHook = HOOK_VERSION;

  // Tell the isolated bridge MAIN hold is active (worlds cannot share expandos).
  try {
    window.postMessage({ source: SOURCE, type: 'hook-ready', version: HOOK_VERSION }, '*');
  } catch {
    // ignore
  }

  document.addEventListener(
    'click',
    (e) => {
      if (window.__bidReplayAction || holding) return;
      if (typeof e.button === 'number' && e.button !== 0) return;
      const hit = findTrigger(e);
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
      const fromSubmitter = submitter ? labelFor(submitter) : null;
      const label = fromSubmitter || findTrigger(e)?.label || 'Submit';

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

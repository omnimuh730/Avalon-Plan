/**
 * MAIN-world bid click hook. Registered via manifest `world: "MAIN"` so it
 * bypasses page CSP (Greenhouse blocks inline <script> injection).
 * Posts triggers to the isolated bid-recorder bridge via window.postMessage.
 */

declare global {
  interface Window {
    __bidRecorderMainHook?: boolean;
  }
}

const TRIGGER_PATTERN = /(apply|submit|next|continue|proceed|save)/i;
const SOURCE = 'bid-recorder-hook';

function txt(el: Element | null): string {
  if (!el || !el.getAttribute) return '';
  return (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
}

function findTarget(start: EventTarget | null): string | null {
  let t: Element | null = start instanceof Element ? start : null;
  for (let i = 0; i < 16 && t; i += 1) {
    if (t.nodeType !== 1) {
      t = t.parentElement;
      continue;
    }
    const s = txt(t);
    if (s && s.length <= 80 && TRIGGER_PATTERN.test(s)) return s;
    t = t.parentElement;
  }
  return null;
}

function post(label: string): void {
  try {
    window.postMessage({ source: SOURCE, triggerText: label }, '*');
  } catch {
    // ignore
  }
}

function install(): void {
  if (window.__bidRecorderMainHook) return;
  window.__bidRecorderMainHook = true;

  document.addEventListener(
    'pointerdown',
    (e) => {
      const label = findTarget(e.target);
      if (label) post(label);
    },
    true,
  );

  document.addEventListener(
    'click',
    (e) => {
      const label = findTarget(e.target);
      if (label) post(label);
    },
    true,
  );

  document.addEventListener(
    'submit',
    (e) => {
      const submitEvent = e as SubmitEvent;
      const sub = submitEvent.submitter;
      const label = sub ? txt(sub) : 'Submit';
      if (label && TRIGGER_PATTERN.test(label)) post(label);
      else post('Submit');
    },
    true,
  );
}

install();

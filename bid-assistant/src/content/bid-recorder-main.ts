/**
 * MAIN-world bid click hook. Registered via manifest `world: "MAIN"` so it
 * bypasses page CSP (Greenhouse blocks inline <script> injection).
 *
 * Fire-and-forget flow (no hold / no synthetic replay):
 * 1. Detect Apply/Submit/Next on pointerdown (before <a> navigation unloads the page)
 * 2. Notify the isolated bridge to screenshot asynchronously
 * 3. Let the real click/navigation proceed untouched
 *
 * Why pointerdown: for "Apply for this Job" links, click navigates immediately and
 * destroys the content-script context before chrome.runtime.sendMessage completes.
 */

declare global {
  interface Window {
    __bidRecorderMainHook?: boolean;
  }
}

const TRIGGER_PATTERN = /(apply|submit|next|continue|proceed|save)/i;
const ACTION_SELECTOR =
  'a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], label';
const SOURCE = 'bid-recorder-hook';

let lastPostedAt = 0;

function txt(el: Element | null | undefined): string {
  if (!el || !el.getAttribute) return '';
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria.replace(/\s+/g, ' ').trim();
  if (el instanceof HTMLInputElement) {
    return (el.value || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
  }
  return (el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
}

/** Prefer short labels; long textContent often includes whole card copy. */
function labelFor(el: Element): string | null {
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria && aria.length <= 120 && TRIGGER_PATTERN.test(aria)) {
    return aria.replace(/\s+/g, ' ').trim();
  }

  if (el instanceof HTMLInputElement) {
    const v = (el.value || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
    if (v && v.length <= 120 && TRIGGER_PATTERN.test(v)) return v;
  }

  // Direct text only (ignore deep nested boilerplate).
  let direct = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) direct += node.textContent ?? '';
  }
  direct = direct.replace(/\s+/g, ' ').trim();
  if (direct && direct.length <= 120 && TRIGGER_PATTERN.test(direct)) return direct;

  const full = txt(el);
  if (full && full.length <= 120 && TRIGGER_PATTERN.test(full)) return full;

  // Greenhouse / Lever: href often contains /apply or /applications
  if (el instanceof HTMLAnchorElement) {
    const href = el.getAttribute('href') || '';
    if (/apply|application/i.test(href)) {
      if (direct && direct.length <= 120) return direct || 'Apply';
      if (full && full.length <= 120) return full;
      return 'Apply';
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

function postProcessClick(label: string): void {
  const now = Date.now();
  if (now - lastPostedAt < 400) return;
  lastPostedAt = now;
  try {
    window.postMessage({ source: SOURCE, type: 'process-click', triggerText: label }, '*');
  } catch {
    // ignore
  }
}

function onActivate(event: Event): void {
  if (event instanceof MouseEvent && typeof event.button === 'number' && event.button !== 0) {
    return;
  }
  const hit = findTrigger(event);
  if (!hit) return;
  postProcessClick(hit.label);
}

function notifyIfApplyRoute(): void {
  // Ashby/Greenhouse SPA: job → /application without a full unload.
  if (/\/application(?:\/|$|\?)|\/apply(?:\/|$|\?)/i.test(location.href)) {
    postProcessClick('Apply');
  }
}

function patchHistory(): void {
  const wrap = (method: 'pushState' | 'replaceState') => {
    const original = history[method].bind(history);
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original(...args);
      queueMicrotask(notifyIfApplyRoute);
      return result;
    };
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', () => queueMicrotask(notifyIfApplyRoute));
}

function install(): void {
  if (window.__bidRecorderMainHook) return;
  window.__bidRecorderMainHook = true;

  // pointerdown/mousedown fire before <a> navigation tears down the page.
  document.addEventListener('pointerdown', onActivate, true);
  document.addEventListener('mousedown', onActivate, true);
  // Keyboard activation (Enter/Space) still goes through click.
  document.addEventListener('click', onActivate, true);

  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;

      const submitEvent = e as SubmitEvent;
      const submitter =
        submitEvent.submitter instanceof HTMLElement ? submitEvent.submitter : null;
      const fromSubmitter = submitter ? labelFor(submitter) : null;
      const label = fromSubmitter || findTrigger(e)?.label || 'Submit';
      postProcessClick(label);
    },
    true,
  );

  patchHistory();
}

install();

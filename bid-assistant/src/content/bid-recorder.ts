/**
 * Isolated-world bid recorder bridge.
 * Listens for MAIN-world postMessage triggers and forwards BID_PROCESS_CLICK
 * to the service worker. Also keeps capture-phase listeners as a fallback.
 *
 * MAIN hooks live in bid-recorder-main.ts (manifest world: MAIN) — do not
 * inject inline <script> tags; Greenhouse CSP blocks them.
 */

const TRIGGER_PATTERN = /(apply|submit|next|continue|proceed|save)/i;
const ACTION_SELECTOR =
  'a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], label';
const DEBOUNCE_MS = 600;
const HOOK_SOURCE = 'bid-recorder-hook';

let lastSentAt = 0;

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

function findTriggerFromEvent(event: Event): string | null {
  for (const node of collectElements(event)) {
    const text = triggerTextFor(node);
    if (!text) continue;

    if (node.matches(ACTION_SELECTOR)) return text;
    if (node.closest('form')) return text;

    const tag = node.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'label' || tag === 'input') return text;
    if (hasPointerCursor(node)) return text;
    if (node.closest(ACTION_SELECTOR)) return text;
  }
  return null;
}

function dispatchTrigger(rawText: string): void {
  const text = rawText.replace(/\s+/g, ' ').trim();
  if (!text || !TRIGGER_PATTERN.test(text)) return;

  const now = Date.now();
  if (now - lastSentAt < DEBOUNCE_MS) return;
  lastSentAt = now;

  try {
    console.log('[bid-recorder] trigger detected, sending capture request:', text);
    void chrome.runtime.sendMessage({ type: 'BID_PROCESS_CLICK', triggerText: text });
  } catch (error) {
    console.warn('[bid-recorder] failed to send capture request:', error);
  }
}

function handlePointerLike(event: Event): void {
  const text = findTriggerFromEvent(event);
  if (text) dispatchTrigger(text);
}

function handleFormSubmit(event: Event): void {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  const submitEvent = event as SubmitEvent;
  const submitter = submitEvent.submitter instanceof Element ? submitEvent.submitter : null;
  const fromSubmitter = submitter ? triggerTextFor(submitter) || readableText(submitter) : '';
  if (fromSubmitter && TRIGGER_PATTERN.test(fromSubmitter)) {
    dispatchTrigger(fromSubmitter);
    return;
  }

  dispatchTrigger('Submit');
}

function start(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as { source?: string; triggerText?: string } | null;
    if (data?.source !== HOOK_SOURCE || !data.triggerText) return;
    dispatchTrigger(data.triggerText);
  });

  document.addEventListener('pointerdown', handlePointerLike, { capture: true });
  document.addEventListener('mousedown', handlePointerLike, { capture: true });
  document.addEventListener('click', handlePointerLike, { capture: true });
  document.addEventListener('submit', handleFormSubmit, { capture: true });
}

start();

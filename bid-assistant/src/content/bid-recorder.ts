/**
 * Isolated-world bid recorder bridge.
 *
 * Receives process-click notices from the MAIN-world hook and asks the service
 * worker to capture a viewport screenshot asynchronously. The page click is
 * never paused — Apply/Submit/Next always run as the user intended.
 *
 * Messages are sent on pointerdown (via MAIN) so navigation on Apply links does
 * not kill this context before chrome.runtime.sendMessage is queued.
 */

const TRIGGER_PATTERN = /(apply|submit|next|continue|proceed|save)/i;
const ACTION_SELECTOR =
  'a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], label';
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

function labelFor(element: Element): string | null {
  const aria = element.getAttribute('aria-label')?.trim();
  if (aria && aria.length <= 120 && TRIGGER_PATTERN.test(aria)) {
    return aria.replace(/\s+/g, ' ').trim();
  }

  if (element instanceof HTMLInputElement) {
    const v = (element.value || element.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
    if (v && v.length <= 120 && TRIGGER_PATTERN.test(v)) return v;
  }

  let direct = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) direct += node.textContent ?? '';
  }
  direct = direct.replace(/\s+/g, ' ').trim();
  if (direct && direct.length <= 120 && TRIGGER_PATTERN.test(direct)) return direct;

  const full = readableText(element);
  if (full && full.length <= 120 && TRIGGER_PATTERN.test(full)) return full;

  if (element instanceof HTMLAnchorElement) {
    const href = element.getAttribute('href') || '';
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

function hasPointerCursor(element: Element): boolean {
  try {
    return window.getComputedStyle(element).cursor === 'pointer';
  } catch {
    return false;
  }
}

function findTriggerFromEvent(event: Event): { label: string; element: Element } | null {
  for (const node of collectElements(event)) {
    const text = labelFor(node);
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

function requestCapture(triggerText: string): void {
  const text = triggerText.replace(/\s+/g, ' ').trim();
  if (!text || (!TRIGGER_PATTERN.test(text) && text !== 'Apply')) return;

  // Extension was reloaded while this page stayed open — old content scripts
  // cannot talk to the new service worker. Refresh the tab to recover.
  if (!chrome.runtime?.id) {
    console.warn('[bid-recorder] extension context invalidated — refresh this tab');
    return;
  }

  const now = Date.now();
  if (now - lastSentAt < 400) return;
  lastSentAt = now;

  console.log('[bid-recorder] process-click → async viewport:', text);
  try {
    // Queue immediately; swallow async rejection when the page unloads mid-send.
    void chrome.runtime
      .sendMessage({ type: 'BID_PROCESS_CLICK', triggerText: text })
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        if (/context invalidated|message port closed/i.test(msg)) return;
        console.warn('[bid-recorder] capture request failed:', msg);
      });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/context invalidated/i.test(msg)) return;
    console.warn('[bid-recorder] capture request failed:', msg);
  }
}

function onFallbackActivate(event: Event): void {
  // MAIN-world expandos are not visible here; always run as a safety net.
  // Debounce shared via lastSentAt with MAIN's postMessage path.
  if (event instanceof MouseEvent && typeof event.button === 'number' && event.button !== 0) {
    return;
  }
  const hit = findTriggerFromEvent(event);
  if (!hit) return;
  requestCapture(hit.label);
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

    if (
      (data.type === 'process-click' || data.type === 'hold-capture') &&
      data.triggerText
    ) {
      requestCapture(data.triggerText);
    }
  });

  // Fallback + keyboard: isolated world also listens so we still capture if
  // MAIN hook is blocked. pointerdown beats Apply-link navigation.
  document.addEventListener('pointerdown', onFallbackActivate, true);
  document.addEventListener('mousedown', onFallbackActivate, true);
  document.addEventListener('click', onFallbackActivate, true);

  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      const submitEvent = event as SubmitEvent;
      const submitter =
        submitEvent.submitter instanceof HTMLElement ? submitEvent.submitter : null;
      const fromSubmitter = submitter ? labelFor(submitter) : null;
      const label = fromSubmitter || 'Submit';
      requestCapture(label);
    },
    true,
  );
}

start();

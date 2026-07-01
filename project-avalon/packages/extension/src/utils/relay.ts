import {
  DEFAULT_SESSION_ID,
  SOCKET_EVENTS,
  type ActionResult,
  type ActionablePageContext,
  type ApplyInjectionPlanPayload,
  type ApplyProgress,
  type RemoteAction,
  type RegisteredPayload,
  type TabInfo,
} from '@avalon/shared';
import { io, type Socket } from 'socket.io-client';
import { executeInjectionPlan } from './injection-plan-executor';
import {
  AVALON_SERVER_KEY,
  AVALON_SESSION_KEY,
  DEFAULT_SERVER_URL,
  EXTENSION_MESSAGES,
} from './constants';
import { ensureContentScript, runActionInTab } from './tab-messages';

let socket: Socket | null = null;
let tabListenersBound = false;
let currentSessionId: string = DEFAULT_SESSION_ID;

function emitApplyProgress(progress: Omit<ApplyProgress, 'at' | 'sessionId'>) {
  if (!socket?.connected) return;
  socket.emit(SOCKET_EVENTS.APPLY_PROGRESS, {
    ...progress,
    sessionId: currentSessionId,
    at: Date.now(),
  } satisfies ApplyProgress);
}


function bindTabListeners() {
  if (tabListenersBound) return;
  tabListenersBound = true;

  browser.tabs.onUpdated.addListener(() => {
    void collectTabs().then((tabs) => socket?.connected && socket.emit(SOCKET_EVENTS.TABS_UPDATE, tabs));
  });
  browser.tabs.onActivated.addListener(() => {
    void collectTabs().then((tabs) => socket?.connected && socket.emit(SOCKET_EVENTS.TABS_UPDATE, tabs));
  });
}

async function getStoredConfig() {
  const stored = await browser.storage.local.get([AVALON_SERVER_KEY, AVALON_SESSION_KEY]);
  return {
    serverUrl: (stored[AVALON_SERVER_KEY] as string | undefined) ?? DEFAULT_SERVER_URL,
    sessionId: stored[AVALON_SESSION_KEY] as string | undefined,
  };
}

async function collectTabs(): Promise<TabInfo[]> {
  const tabs = await browser.tabs.query({});
  return tabs
    .filter((tab): tab is Browser.tabs.Tab & { id: number } => typeof tab.id === 'number')
    .map((tab) => ({
      id: tab.id,
      title: tab.title ?? '',
      url: tab.url ?? '',
      active: Boolean(tab.active),
      windowId: tab.windowId ?? 0,
    }));
}

async function readPageContext(tabId: number): Promise<ActionablePageContext> {
  const tab = await browser.tabs.get(tabId);
  return {
    tabId,
    url: tab.url ?? '',
    title: tab.title ?? '',
  };
}

async function resolveTabId(action: RemoteAction): Promise<number | undefined> {
  const payload = action.payload as ApplyInjectionPlanPayload | undefined;
  if (action.tabId != null) return action.tabId;
  if (payload?.page?.tabId != null) return payload.page.tabId;

  const active = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return active[0]?.id;
}

async function focusTab(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  if (tab.windowId != null) {
    await browser.windows.update(tab.windowId, { focused: true });
  }
  await browser.tabs.update(tabId, { active: true });
}

/** Resolve once the given tab has finished loading (status === 'complete'). */
function waitForTabComplete(tabId: number, timeoutMs = 45000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      browser.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };
    const onUpdated = (updatedTabId: number, info: { status?: string }) => {
      if (updatedTabId === tabId && info.status === 'complete') finish();
    };
    browser.tabs.onUpdated.addListener(onUpdated);
    const timer = setTimeout(finish, timeoutMs);
    // In case it already completed before we attached the listener.
    void browser.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') finish();
    });
  });
}

async function handleRemoteAction(action: RemoteAction): Promise<ActionResult> {
  // open_tab creates its own tab, so it runs before the existing-tab guard.
  if (action.action === 'open_tab') {
    const url = String(action.payload?.url ?? '');
    if (!url) return { actionId: action.id, success: false, error: 'open_tab requires payload.url' };
    const tab = await browser.tabs.create({ url, active: true });
    if (typeof tab.id !== 'number') {
      return { actionId: action.id, success: false, error: 'Failed to create tab' };
    }
    emitApplyProgress({ phase: 'navigating', message: `Opening ${url}…` });
    await waitForTabComplete(tab.id);
    const page = await readPageContext(tab.id);
    emitApplyProgress({ phase: 'navigating', message: `Loaded ${page.title || url}` });
    return { actionId: action.id, success: true, data: { tabId: tab.id, page } };
  }

  const tabId = await resolveTabId(action);

  if (!tabId) {
    return { actionId: action.id, success: false, error: 'No target tab available' };
  }

  if (action.action === 'navigate') {
    await focusTab(tabId);
    const url = String(action.payload?.url ?? '');
    await browser.tabs.update(tabId, { url });
    return { actionId: action.id, success: true, data: { url } };
  }

  if (action.action === 'reload') {
    await focusTab(tabId);
    await browser.tabs.reload(tabId);
    return { actionId: action.id, success: true, data: { reloaded: true } };
  }

  if (action.action === 'close_tab') {
    try {
      await browser.tabs.remove(tabId);
    } catch {
      /* tab may already be gone */
    }
    return { actionId: action.id, success: true, data: { closed: true } };
  }

  if (action.action === 'screenshot') {
    await focusTab(tabId);
    const dataUrl = await browser.tabs.captureVisibleTab(undefined, { format: 'png' });
    return { actionId: action.id, success: true, data: { dataUrl } };
  }

  // execute_script handled here (not via content script) to bypass page CSP.
  // new Function() in the service worker is not subject to the page's CSP;
  // chrome.scripting.executeScript injects the serialized function at the
  // browser level, which also bypasses the page's CSP 'unsafe-eval' restriction.
  if (action.action === 'execute_script') {
    await focusTab(tabId);
    const source = String(action.payload?.source ?? 'true');
    let fn: Function;
    try {
      fn = new Function(source);
    } catch (error) {
      return {
        actionId: action.id,
        success: false,
        error: `Script compilation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: fn as () => unknown,
      });
      return {
        actionId: action.id,
        success: true,
        data: { result: results[0]?.result },
      };
    } catch (error) {
      return {
        actionId: action.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // read_page_state is a CSP-safe replacement for reading page text via
  // execute_script. It uses a hardcoded function (no eval needed) injected
  // via chrome.scripting.executeScript, so it works on pages that block
  // 'unsafe-eval' in their CSP (e.g. Greenhouse).
  if (action.action === 'read_page_state') {
    await focusTab(tabId);
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const controls = document.querySelectorAll(
            'input:not([type=hidden]):not([disabled]),textarea,select,[contenteditable="true"]',
          );
          const full = document.body?.innerText ?? '';
          // Capture head AND tail: on long pages (e.g. a job description above the
          // form) the decisive text — a confirmation, error, or "enter the code"
          // prompt — is often at the BOTTOM, past a simple head-only slice.
          const LIMIT = 8000;
          const text =
            full.length <= LIMIT * 2
              ? full
              : `${full.slice(0, LIMIT)}\n…\n${full.slice(-LIMIT)}`;
          return { text, controlCount: controls.length };
        },
      });
      return {
        actionId: action.id,
        success: true,
        data: results[0]?.result ?? { text: '', controlCount: 0 },
      };
    } catch (error) {
      return {
        actionId: action.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // fill_verification_code is CSP-safe (hardcoded func, no eval). It distributes an
  // emailed one-time code across the page's code inputs — a group of single-char
  // boxes, or a single code field — using the React-safe native setter, then clicks
  // the submit/verify control. Generic DOM heuristics only (no vendor strings).
  if (action.action === 'fill_verification_code') {
    await focusTab(tabId);
    const code = String(action.payload?.code ?? '').trim();
    if (!code) return { actionId: action.id, success: false, error: 'code is required' };
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: async (codeStr: string) => {
          const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
          const nativeSet = (el: HTMLInputElement, v: string) => {
            const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
            if (desc?.set) desc.set.call(el, v);
            else el.value = v;
          };
          // Fire a full key sequence so controlled/React OTP inputs register the
          // character (and auto-advance focus): keydown → beforeinput → input → keyup → change.
          const typeChar = (el: HTMLInputElement, ch: string) => {
            el.focus();
            el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
            try {
              el.dispatchEvent(new InputEvent('beforeinput', { data: ch, inputType: 'insertText', bubbles: true, cancelable: true }));
            } catch {
              /* older engines */
            }
            nativeSet(el, ch);
            el.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          };

          const chars = codeStr.split('');
          const inputs = Array.from(
            document.querySelectorAll<HTMLInputElement>('input:not([type=hidden]):not([disabled])'),
          ).filter((i) => ['text', 'tel', 'number', ''].includes(i.type) || i.inputMode === 'numeric');
          const boxes = inputs.filter((i) => i.getAttribute('maxlength') === '1');
          let filled = 0;
          let mode = 'none';

          if (boxes.length >= chars.length && boxes.length > 0) {
            // Try a real PASTE first — many OTP widgets distribute a pasted code
            // across the boxes in one shot.
            try {
              const dt = new DataTransfer();
              dt.setData('text', codeStr);
              boxes[0].focus();
              boxes[0].dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
              await wait(80);
            } catch {
              /* paste not supported — fall through to typing */
            }
            const pasteWorked = boxes.slice(0, chars.length).every((b, i) => (b.value || '') === chars[i]);
            if (!pasteWorked) {
              for (let i = 0; i < chars.length; i += 1) {
                typeChar(boxes[i], chars[i]);
                await wait(30);
              }
            }
            filled = boxes.slice(0, chars.length).filter((b) => (b.value || '').length > 0).length;
            mode = pasteWorked ? 'boxes-paste' : 'boxes-type';
          } else {
            const labelled = inputs.find((i) =>
              /code|verif|security|otp|passcode|pin/i.test(
                `${i.name} ${i.id} ${i.getAttribute('aria-label') ?? ''} ${i.placeholder ?? ''}`,
              ),
            );
            const single = labelled ?? inputs[0];
            if (single) {
              single.focus();
              nativeSet(single, codeStr);
              single.dispatchEvent(new InputEvent('input', { data: codeStr, inputType: 'insertText', bubbles: true }));
              single.dispatchEvent(new Event('change', { bubbles: true }));
              filled = (single.value || '').length > 0 ? 1 : 0;
              mode = 'single';
            }
          }

          // Give the framework a tick to enable the submit button, then click it.
          await wait(120);
          const clickable = Array.from(
            document.querySelectorAll<HTMLElement>('button, input[type=submit], [role=button]'),
          ).filter((b) => b.offsetParent !== null);
          const submitBtn =
            clickable.find((b) => (b as HTMLInputElement).type === 'submit') ??
            clickable.find((b) => /submit|verify|confirm|continue|apply/i.test(b.textContent ?? '')) ??
            null;
          let clicked = false;
          if (filled >= chars.length && submitBtn && !(submitBtn as HTMLButtonElement).disabled) {
            submitBtn.click();
            clicked = true;
          }
          return { filled, mode, clicked, boxes: boxes.length, expected: chars.length };
        },
        args: [code],
      });
      return { actionId: action.id, success: true, data: results[0]?.result ?? { filled: 0, clicked: false } };
    } catch (error) {
      return {
        actionId: action.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (action.action === 'fetch_actionable_tree') {
    await focusTab(tabId);
    const result = await runActionInTab(tabId, action);
    if (!result.success) return result;

    const page = await readPageContext(tabId);
    return {
      ...result,
      data: {
        ...(result.data as Record<string, unknown>),
        page,
      },
    };
  }

  if (action.action === 'apply_injection_plan') {
    const payload = (action.payload ?? {}) as ApplyInjectionPlanPayload;
    const planTabId = payload.page?.tabId ?? tabId;

    await focusTab(planTabId);
    await ensureContentScript(planTabId);

    const current = await readPageContext(planTabId);
    const urlMismatch =
      payload.page?.url && current.url && current.url !== payload.page.url
        ? { expected: payload.page.url, actual: current.url }
        : undefined;

    try {
      const data = await executeInjectionPlan(planTabId, payload, emitApplyProgress);
      return {
        actionId: action.id,
        success: true,
        data: {
          ...data,
          page: current,
          urlMismatch,
        },
      };
    } catch (error) {
      return {
        actionId: action.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  await focusTab(tabId);
  return runActionInTab(tabId, action);
}

export async function connectRelay(
  overrides?: { serverUrl?: string; sessionId?: string },
  onRegistered?: (payload: RegisteredPayload) => void,
) {
  const config = await getStoredConfig();
  const serverUrl = overrides?.serverUrl ?? config.serverUrl;
  const sessionId = overrides?.sessionId?.trim() || DEFAULT_SESSION_ID;

  socket?.disconnect();
  socket = io(serverUrl, { transports: ['websocket', 'polling'] });
  bindTabListeners();

  socket.on('connect', () => {
    socket?.emit(
      SOCKET_EVENTS.REGISTER,
      { role: 'extension', sessionId },
      (response: RegisteredPayload) => {
        currentSessionId = response.sessionId;
        void browser.storage.local.set({
          [AVALON_SERVER_KEY]: serverUrl,
          [AVALON_SESSION_KEY]: response.sessionId,
        });
        onRegistered?.(response);
        void collectTabs().then((tabs) => socket?.emit(SOCKET_EVENTS.TABS_UPDATE, tabs));
      },
    );
  });

  socket.on(SOCKET_EVENTS.EXECUTE_ACTION, async (action: RemoteAction) => {
    const result = await handleRemoteAction(action);
    socket?.emit(SOCKET_EVENTS.ACTION_RESULT, result);
  });


  socket.on(SOCKET_EVENTS.REQUEST_TABS, async () => {
    const tabs = await collectTabs();
    socket?.emit(SOCKET_EVENTS.TABS_UPDATE, tabs);
  });

  socket.on(SOCKET_EVENTS.REQUEST_SCREENSHOT, async (payload: { tabId?: number }) => {
    try {
      const tabId =
        payload.tabId ?? (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
      if (!tabId) throw new Error('No tab for screenshot');
      await focusTab(tabId);
      const dataUrl = await browser.tabs.captureVisibleTab(undefined, { format: 'png' });
      socket?.emit(SOCKET_EVENTS.SCREENSHOT_RESULT, { tabId, dataUrl });
    } catch (error) {
      socket?.emit(SOCKET_EVENTS.SCREENSHOT_RESULT, {
        tabId: payload.tabId ?? -1,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return socket;
}

export function disconnectRelay() {
  socket?.disconnect();
  socket = null;
}

export function getRelaySocket() {
  return socket;
}

export async function saveRelayConfig(serverUrl: string, sessionId?: string) {
  await browser.storage.local.set({
    [AVALON_SERVER_KEY]: serverUrl,
    ...(sessionId ? { [AVALON_SESSION_KEY]: sessionId } : {}),
  });
}

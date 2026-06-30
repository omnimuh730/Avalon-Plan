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
  type WebRtcSignal,
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
let webrtcBridgeBound = false;
let currentSessionId: string = DEFAULT_SESSION_ID;

function emitApplyProgress(progress: Omit<ApplyProgress, 'at' | 'sessionId'>) {
  if (!socket?.connected) return;
  socket.emit(SOCKET_EVENTS.APPLY_PROGRESS, {
    ...progress,
    sessionId: currentSessionId,
    at: Date.now(),
  } satisfies ApplyProgress);
}

// --- WebRTC live tab view bridge (relay ↔ offscreen capturer) -----------------

const OFFSCREEN_PATH = 'offscreen.html';

async function ensureOffscreenDocument(): Promise<void> {
  // chrome.offscreen is only present in MV3 Chromium.
  const offscreen = (chrome as unknown as { offscreen?: typeof chrome.offscreen }).offscreen;
  if (!offscreen) throw new Error('offscreen API unavailable');
  const has = await offscreen.hasDocument?.();
  if (has) return;
  await offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA' as chrome.offscreen.Reason],
    justification: 'Stream the active tab to the Avalon controller (live view).',
  });
}

/** Handle a signaling message arriving from the viewer (controller) over the socket. */
async function handleWebRtcSignalFromViewer(signal: WebRtcSignal): Promise<void> {
  try {
    if (signal.kind === 'request') {
      await ensureOffscreenDocument();
      const tabId =
        typeof signal.tabId === 'number'
          ? signal.tabId
          : (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
      if (!tabId) throw new Error('No tab to capture');
      // tabCapture requires the target tab to be active in its window.
      await focusTab(tabId);
      const tabCapture = (chrome as unknown as { tabCapture?: typeof chrome.tabCapture }).tabCapture;
      if (!tabCapture?.getMediaStreamId) throw new Error('tabCapture unavailable');
      const streamId = await new Promise<string>((resolve, reject) => {
        tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) =>
          chrome.runtime.lastError || !id
            ? reject(new Error(chrome.runtime.lastError?.message ?? 'Could not get tab stream'))
            : resolve(id),
        );
      });
      await chrome.runtime.sendMessage({ type: EXTENSION_MESSAGES.WEBRTC_START, streamId });
      return;
    }
    if (signal.kind === 'stop') {
      await chrome.runtime.sendMessage({ type: EXTENSION_MESSAGES.WEBRTC_STOP }).catch(() => {});
      return;
    }
    // answer / ice from the viewer → forward into the offscreen peer.
    await chrome.runtime
      .sendMessage({
        type: EXTENSION_MESSAGES.WEBRTC_TO_OFFSCREEN,
        payload: { kind: signal.kind, data: signal.data },
      })
      .catch(() => {});
  } catch (error) {
    console.error('[Avalon] webrtc signal failed', error);
    // Tell the viewer instead of leaving it stuck on "connecting".
    socket?.emit(SOCKET_EVENTS.WEBRTC_SIGNAL, {
      sessionId: currentSessionId,
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies WebRtcSignal);
  }
}

/** Bind the offscreen→background message bridge once: forward offer/ice to the viewer. */
function bindWebRtcBridge(): void {
  if (webrtcBridgeBound) return;
  webrtcBridgeBound = true;
  chrome.runtime.onMessage.addListener(
    (message: { type?: string; payload?: { kind: WebRtcSignal['kind']; data?: unknown; message?: string } }) => {
      if (message?.type !== EXTENSION_MESSAGES.WEBRTC_FROM_OFFSCREEN || !message.payload) return;
      if (!socket?.connected) return;
      socket.emit(SOCKET_EVENTS.WEBRTC_SIGNAL, {
        sessionId: currentSessionId,
        kind: message.payload.kind,
        data: message.payload.data,
        message: message.payload.message,
      } satisfies WebRtcSignal);
    },
  );
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

  if (action.action === 'screenshot') {
    await focusTab(tabId);
    const dataUrl = await browser.tabs.captureVisibleTab(undefined, { format: 'png' });
    return { actionId: action.id, success: true, data: { dataUrl } };
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
  bindWebRtcBridge();

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

  socket.on(SOCKET_EVENTS.WEBRTC_SIGNAL, (signal: WebRtcSignal) => {
    void handleWebRtcSignalFromViewer(signal);
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

import { DEFAULT_SESSION_ID } from '@avalon/shared';
import { AVALON_SERVER_KEY, AVALON_SESSION_KEY, DEFAULT_SERVER_URL, EXTENSION_MESSAGES } from '../utils/constants';
import { connectRelay, disconnectRelay, getRelaySocket, setArmedLiveCapture, getLiveCaptureStatus } from '../utils/relay';

async function autoConnectRelay() {
  const stored = await browser.storage.local.get([AVALON_SERVER_KEY, AVALON_SESSION_KEY]);
  const serverUrl = (stored[AVALON_SERVER_KEY] as string | undefined) ?? DEFAULT_SERVER_URL;
  const sessionId = (stored[AVALON_SESSION_KEY] as string | undefined) ?? DEFAULT_SESSION_ID;
  if (getRelaySocket()?.connected) return;
  await connectRelay({ serverUrl, sessionId });
}

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  browser.runtime.onInstalled.addListener(() => {
    console.log('[Avalon] extension installed');
    void autoConnectRelay();
  });

  browser.runtime.onStartup.addListener(() => {
    void autoConnectRelay();
  });

  void autoConnectRelay();

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === EXTENSION_MESSAGES.RELAY_CONNECT) {
      const config = message.config as { serverUrl?: string; sessionId?: string } | undefined;
      void connectRelay(config, (payload) => {
        sendResponse({ ok: true, registered: payload });
      });
      return true;
    }

    if (message?.type === EXTENSION_MESSAGES.RELAY_DISCONNECT) {
      disconnectRelay();
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === EXTENSION_MESSAGES.RELAY_STATUS) {
      const socket = getRelaySocket();
      sendResponse({ connected: Boolean(socket?.connected) });
      return false;
    }

    if (message?.type === EXTENSION_MESSAGES.WEBRTC_ARM_CAPTURE) {
      const tabId = message.tabId as number | undefined;
      const streamId = message.streamId as string | undefined;
      if (typeof tabId !== 'number' || !streamId) {
        sendResponse({ ok: false, error: 'tabId and streamId are required' });
        return false;
      }
      void setArmedLiveCapture(tabId, streamId)
        .then(() => sendResponse({ ok: true, tabId }))
        .catch((err: unknown) =>
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
        );
      return true;
    }

    if (message?.type === EXTENSION_MESSAGES.WEBRTC_ARM_STATUS) {
      const tabId = message.tabId as number | undefined;
      sendResponse(getLiveCaptureStatus(tabId));
      return false;
    }

    return false;
  });
});

import { useEffect, useState } from 'react';
import { DEFAULT_SESSION_ID, type RegisteredPayload } from '@avalon/shared';
import { DEFAULT_SERVER_URL, EXTENSION_MESSAGES } from '../../utils/constants';
import {
  getMediaStreamIdForTab,
  isCapturableUrl,
  resolveCaptureTabId,
} from '../../utils/live-capture';
import { saveRelayConfig } from '../../utils/relay';

export default function SidePanel() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [sessionId, setSessionId] = useState('');
  const [connected, setConnected] = useState(false);
  const [registered, setRegistered] = useState<RegisteredPayload | null>(null);

  const [liveCaptureError, setLiveCaptureError] = useState<string | null>(null);
  const [liveCaptureArmed, setLiveCaptureArmed] = useState(false);

  const refreshStatus = async () => {
    try {
      const status = (await browser.runtime.sendMessage({
        type: EXTENSION_MESSAGES.RELAY_STATUS,
      })) as { connected?: boolean };
      setConnected(Boolean(status?.connected));
    } catch {
      setConnected(false);
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  const connect = async () => {
    await saveRelayConfig(serverUrl, sessionId || undefined);
    const response = (await browser.runtime.sendMessage({
      type: EXTENSION_MESSAGES.RELAY_CONNECT,
      config: { serverUrl, sessionId: sessionId || undefined },
    })) as { ok?: boolean; registered?: RegisteredPayload };

    if (response?.registered) {
      setRegistered(response.registered);
      setSessionId(response.registered.sessionId);
    }
    setConnected(true);
  };

  const disconnect = async () => {
    await browser.runtime.sendMessage({ type: EXTENSION_MESSAGES.RELAY_DISCONNECT });
    setConnected(false);
    setRegistered(null);
  };

  const copySessionId = async () => {
    const id = registered?.sessionId ?? sessionId;
    if (!id) return;
    await navigator.clipboard.writeText(id);
  };

  const [captureTabId, setCaptureTabId] = useState<number | null>(null);

  const startLiveView = async () => {
    setLiveCaptureError(null);
    try {
      const tabId = await resolveCaptureTabId();
      const tab = await chrome.tabs.get(tabId);
      if (!isCapturableUrl(tab.url)) {
        throw new Error(
          'This tab cannot be captured. Focus the job application page (not chrome:// or the extension panel), then retry.',
        );
      }
      // getMediaStreamId must run here in the click stack — not in the service worker.
      const streamId = await getMediaStreamIdForTab(tabId);
      const response = (await browser.runtime.sendMessage({
        type: EXTENSION_MESSAGES.WEBRTC_ARM_CAPTURE,
        tabId,
        streamId,
      })) as { ok?: boolean; tabId?: number; error?: string };
      if (!response?.ok) throw new Error(response?.error || 'Could not start live view');
      setCaptureTabId(tabId);
      setLiveCaptureArmed(true);
    } catch (err) {
      setLiveCaptureArmed(false);
      setCaptureTabId(null);
      setLiveCaptureError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="panel">
      <h1>Project Avalon</h1>
      <p className="hint">
        Connect to the relay. Leave Session ID empty on both sides to use the shared default (
        <code>{DEFAULT_SESSION_ID}</code>). For live view: focus the <strong>job tab</strong>, open this
        panel, then click Start live view.
      </p>

      <div>
        <label>Relay server</label>
        <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
      </div>

      <div>
        <label>Session ID</label>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder={`Empty → "${DEFAULT_SESSION_ID}"`}
        />
      </div>

      <div className={`status ${connected ? 'connected' : ''}`}>
        {connected ? 'Connected' : 'Disconnected'}
        {registered && (
          <>
            <br />
            Session: <code>{registered.sessionId}</code>
            <br />
            Controller: {registered.peers.controller ? 'online' : 'waiting…'}
          </>
        )}
      </div>

      <button onClick={connect}>{connected ? 'Reconnect' : 'Connect'}</button>
      <button type="button" onClick={() => void startLiveView()} disabled={!connected}>
        Start live view
      </button>
      {liveCaptureArmed && (
        <p className="hint" style={{ color: '#059669' }}>
          Live capture armed{captureTabId != null ? ` (tab ${captureTabId})` : ''} — switch to Live mode in Athens.
        </p>
      )}
      {liveCaptureError && (
        <p className="hint" style={{ color: '#b45309' }}>
          {liveCaptureError}
        </p>
      )}
      <button className="secondary" type="button" onClick={copySessionId} disabled={!sessionId && !registered}>
        Copy session ID
      </button>
      <button className="secondary" onClick={disconnect} disabled={!connected}>
        Disconnect
      </button>
    </div>
  );
}

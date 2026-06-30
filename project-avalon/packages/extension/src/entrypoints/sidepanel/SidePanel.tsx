import { useEffect, useState } from 'react';
import { DEFAULT_SESSION_ID, type RegisteredPayload } from '@avalon/shared';
import { DEFAULT_SERVER_URL, EXTENSION_MESSAGES } from '../../utils/constants';
import { saveRelayConfig } from '../../utils/relay';

export default function SidePanel() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [sessionId, setSessionId] = useState('');
  const [connected, setConnected] = useState(false);
  const [registered, setRegistered] = useState<RegisteredPayload | null>(null);

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

  return (
    <div className="panel">
      <h1>Project Avalon</h1>
      <p className="hint">
        Connect to the relay. Leave Session ID empty on both sides to use the shared default (
        <code>{DEFAULT_SESSION_ID}</code>).
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
      <button className="secondary" type="button" onClick={copySessionId} disabled={!sessionId && !registered}>
        Copy session ID
      </button>
      <button className="secondary" onClick={disconnect} disabled={!connected}>
        Disconnect
      </button>
    </div>
  );
}

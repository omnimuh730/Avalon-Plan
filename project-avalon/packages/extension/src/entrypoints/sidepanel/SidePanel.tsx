import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SESSION_ID, type RegisteredPayload } from '@avalon/shared';
import {
  AVALON_SERVER_KEY,
  AVALON_SESSION_KEY,
  AVALON_PROFILE_KEY,
  DEFAULT_SERVER_URL,
  DEFAULT_ATHENS_API_URL,
  EXTENSION_MESSAGES,
  RELAY_KEEPALIVE_PORT,
} from '../../utils/constants';
import { saveRelayConfig } from '../../utils/relay';

type PanelNotification = {
  id: string;
  title?: string;
  message: string;
  kind: 'error' | 'warning' | 'info';
};

export default function SidePanel() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [sessionId, setSessionId] = useState('');
  const [profileId, setProfileId] = useState('');
  const [connected, setConnected] = useState(false);
  const [registered, setRegistered] = useState<RegisteredPayload | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<PanelNotification[]>([]);
  const seenErrorRef = useRef<string | null>(null);

  const [signinName, setSigninName] = useState('');
  const [signinPassword, setSigninPassword] = useState('');
  const [signinLoading, setSigninLoading] = useState(false);
  const [signinError, setSigninError] = useState<string | null>(null);

  const pushNotification = useCallback((notification: Omit<PanelNotification, 'id'>) => {
    const item = { ...notification, id: `${Date.now()}_${Math.random()}` };
    setNotifications((prev) => [...prev, item]);
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== item.id));
    }, notification.kind === 'error' ? 12000 : 7000);
  }, []);

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const refreshStatus = useCallback(async () => {
    try {
      const status = (await browser.runtime.sendMessage({
        type: EXTENSION_MESSAGES.RELAY_STATUS,
        config: { serverUrl, sessionId: sessionId || undefined, profileId: profileId || undefined },
      })) as { connected?: boolean; lastError?: string | null };
      const isConnected = Boolean(status?.connected);
      setConnected(isConnected);
      const err = isConnected ? null : (status?.lastError ?? null);
      setLastError(err);
      if (isConnected) {
        seenErrorRef.current = null;
        setNotifications((prev) => prev.filter((n) => n.kind !== 'error'));
        return;
      }
      if (err && err !== seenErrorRef.current) {
        seenErrorRef.current = err;
        pushNotification({ kind: 'error', title: 'Relay offline', message: err });
      }
      if (!err) seenErrorRef.current = null;
    } catch {
      setConnected(false);
    }
  }, [pushNotification, serverUrl, sessionId, profileId]);

  useEffect(() => {
    void browser.storage.local
      .get([AVALON_SERVER_KEY, AVALON_SESSION_KEY, AVALON_PROFILE_KEY])
      .then((stored) => {
        const savedUrl = stored[AVALON_SERVER_KEY] as string | undefined;
        const savedSession = stored[AVALON_SESSION_KEY] as string | undefined;
        const savedProfile = stored[AVALON_PROFILE_KEY] as string | undefined;
        if (savedUrl) setServerUrl(savedUrl);
        if (savedSession) setSessionId(savedSession);
        if (savedProfile) setProfileId(savedProfile);
      });
  }, []);

  useEffect(() => {
    // Keep the MV3 service worker alive while the side panel is open so Socket.IO
    // can finish connecting (otherwise the worker sleeps mid-handshake).
    const port = browser.runtime.connect({ name: RELAY_KEEPALIVE_PORT });
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 2500);
    return () => {
      clearInterval(timer);
      port.disconnect();
    };
  }, [refreshStatus]);

  const connect = async () => {
    if (!profileId) {
      pushNotification({ kind: 'error', title: 'Sign in required', message: 'Enter your Athens name + password.' });
      return;
    }

    await saveRelayConfig(serverUrl, sessionId || undefined, profileId);
    try {
      const response = (await browser.runtime.sendMessage({
        type: EXTENSION_MESSAGES.RELAY_CONNECT,
        config: { serverUrl, sessionId: sessionId || undefined, profileId },
      })) as { ok?: boolean; registered?: RegisteredPayload; error?: string };

      if (response?.error) {
        pushNotification({ kind: 'error', title: 'Connect failed', message: response.error });
        setConnected(false);
        return;
      }

      if (response?.registered) {
        setRegistered(response.registered);
        setSessionId(response.registered.sessionId);
        setConnected(true);
        setLastError(null);
        pushNotification({
          kind: 'info',
          title: 'Relay connected',
          message: `Session ${response.registered.sessionId}`,
        });
      }
      await refreshStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connect failed';
      pushNotification({ kind: 'error', title: 'Connect failed', message });
      setConnected(false);
    }
  };

  const signIn = async () => {
    const name = signinName.trim();
    const password = signinPassword;
    if (!name || !password) {
      setSigninError('Enter both name and password.');
      return;
    }

    setSigninLoading(true);
    setSigninError(null);
    try {
      const base = DEFAULT_ATHENS_API_URL.replace(/\/$/, '');
      const res = await fetch(`${base}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        user?: { _id?: unknown };
        message?: string;
      };
      if (!res.ok || !data?.success || data.user?._id == null) {
        throw new Error(data?.message || 'Sign in failed');
      }

      const id = String(data.user._id);
      setProfileId(id);
      await browser.storage.local.set({ [AVALON_PROFILE_KEY]: id });
      setSigninPassword('');
      pushNotification({ kind: 'info', title: 'Signed in', message: 'Profile connected to Avalon relay.' });
      await refreshStatus();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      setSigninError(message);
      pushNotification({ kind: 'error', title: 'Sign in failed', message });
    } finally {
      setSigninLoading(false);
    }
  };

  const disconnect = async () => {
    await browser.runtime.sendMessage({ type: EXTENSION_MESSAGES.RELAY_DISCONNECT });
    setConnected(false);
    setRegistered(null);
    setLastError(null);
  };

  const copySessionId = async () => {
    const id = registered?.sessionId ?? sessionId;
    if (!id) return;
    await navigator.clipboard.writeText(id);
    pushNotification({ kind: 'info', title: 'Copied', message: 'Session ID copied to clipboard.' });
  };

  return (
    <div className="sidepanel">
      <div className="sidepanel-header">
        <div className="sidepanel-logo" aria-hidden>
          <img src="/logo.png" alt="" width={40} height={40} />
        </div>
        <div className="sidepanel-brand">
          <h1>Project Avalon</h1>
          <p>Extension relay · Athens design</p>
        </div>
      </div>

      {notifications.length > 0 && (
        <div className="notification-stack" role="status" aria-live="polite">
          {notifications.map((item) => (
            <div key={item.id} className={`notification notification-${item.kind}`}>
              <div className="notification-icon" aria-hidden>
                {item.kind === 'error' ? '!' : 'i'}
              </div>
              <div className="notification-body">
                {item.title && <p className="notification-title">{item.title}</p>}
                <p className="notification-message">{item.message}</p>
              </div>
              <button
                type="button"
                className="notification-dismiss"
                onClick={() => dismissNotification(item.id)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="panel-card">
        <p className="hint">
          Connect to the relay. Leave Session ID empty on both sides to use the shared default (
          <code>{DEFAULT_SESSION_ID}</code>).
        </p>

        {!profileId && (
          <div className={`status-card ${signinError ? 'error' : ''}`}>
            <div className="status-label">Sign in (no signup)</div>

            <label htmlFor="signin-name">Athens name</label>
            <input
              id="signin-name"
              value={signinName}
              onChange={(e) => setSigninName(e.target.value)}
              placeholder="Your Athens login name"
              disabled={signinLoading}
            />

            <label htmlFor="signin-password">Password</label>
            <input
              id="signin-password"
              value={signinPassword}
              onChange={(e) => setSigninPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              disabled={signinLoading}
            />

            {signinError && <div>{signinError}</div>}

            <div className="button-row" style={{ marginTop: 10 }}>
              <button type="button" onClick={() => void signIn()} disabled={signinLoading}>
                {signinLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="relay-server">Relay server</label>
          <input
            id="relay-server"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="session-id">Session ID</label>
          <input
            id="session-id"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder={`Empty → "${DEFAULT_SESSION_ID}"`}
          />
        </div>

        <div
          className={`status-card ${connected ? 'connected' : lastError ? 'error' : ''}`}
        >
          <div className="status-label">{connected ? 'Connected' : 'Disconnected'}</div>
          {lastError && !connected && <div>{lastError}</div>}
          {registered && (
            <>
              Session: <code>{registered.sessionId}</code>
              <br />
              Controller: {registered.peers.controller ? 'online' : 'waiting…'}
            </>
          )}
        </div>

        <div className="button-row">
          <button type="button" onClick={() => void connect()} disabled={!profileId}>
            {connected ? 'Reconnect' : 'Connect'}
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => void copySessionId()}
            disabled={!sessionId && !registered}
          >
            Copy session ID
          </button>
          <button className="secondary" type="button" onClick={() => void disconnect()} disabled={!connected}>
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

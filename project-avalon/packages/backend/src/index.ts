import { installTerminalLogger, requestLogger } from '@nextoffer/shared/terminal-log';

installTerminalLogger('avalon-relay');

import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  DEFAULT_SESSION_ID,
  SOCKET_EVENTS,
  type ActionResult,
  type ApplyProgress,
  type RegisterPayload,
  type RegisteredPayload,
  type RemoteAction,
  type TabInfo,
} from '@avalon/shared';

const PORT = Number(process.env.PORT ?? 3847);
const HOST = process.env.HOST !== undefined && process.env.HOST !== '' ? process.env.HOST : '0.0.0.0';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

interface Session {
  profileId: string;
  sessionId: string;
  key: string;
  extension?: Socket;
  controller?: Socket;
  /** Read-only listeners (e.g. Athens) — receive broadcasts, never take the controller slot. */
  observers: Set<Socket>;
}

const sessions = new Map<string, Session>();

const DEFAULT_PROFILE_ID = 'default';

function resolveProfileId(profileId?: string): string {
  const trimmed = profileId?.trim();
  return trimmed || DEFAULT_PROFILE_ID;
}

function resolveSessionId(sessionId?: string): string {
  const trimmed = sessionId?.trim();
  return trimmed || DEFAULT_SESSION_ID;
}

function makeSessionKey(profileId?: string, sessionId?: string): string {
  return `${resolveProfileId(profileId)}::${resolveSessionId(sessionId)}`;
}

function getOrCreateSession(profileId?: string, sessionId?: string): Session {
  const key = makeSessionKey(profileId, sessionId);
  const existing = sessions.get(key);
  if (existing) return existing;

  const resolvedProfileId = resolveProfileId(profileId);
  const resolvedSessionId = resolveSessionId(sessionId);

  const session: Session = { key, profileId: resolvedProfileId, sessionId: resolvedSessionId, observers: new Set() };
  sessions.set(session.key, session);
  return session;
}

function peerStatus(session: Session): RegisteredPayload['peers'] {
  return {
    extension: Boolean(session.extension?.connected),
    controller: Boolean(session.controller?.connected),
  };
}

function emitPeerStatus(session: Session) {
  const payload = { sessionId: session.sessionId, profileId: session.profileId, peers: peerStatus(session) };
  session.extension?.emit('peers-update', payload);
  session.controller?.emit('peers-update', payload);
}

function cleanupSocket(socket: Socket) {
  for (const [id, session] of sessions.entries()) {
    if (session.extension?.id === socket.id) {
      session.extension = undefined;
      emitPeerStatus(session);
    }
    if (session.controller?.id === socket.id) {
      session.controller = undefined;
      emitPeerStatus(session);
    }
    session.observers.delete(socket);
    if (!session.extension && !session.controller && session.observers.size === 0) {
      sessions.delete(id);
    }
  }
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(requestLogger('api'));
app.get('/health', (_req, res) => {
  const active = [...sessions.values()].map((session) => ({
    id: session.sessionId,
    peers: peerStatus(session),
  }));
  res.json({ ok: true, sessions: sessions.size, active });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

io.on('connection', (socket) => {
  let boundSession: Session | null = null;
  console.log(`[socket] connect ${socket.id}`);

  socket.on(SOCKET_EVENTS.REGISTER, (payload: RegisterPayload, ack?: (data: RegisteredPayload) => void) => {
    const session = getOrCreateSession(payload.profileId, payload.sessionId);

    // Re-registering under a different session must fully detach this socket
    // from the old one — a stale extension/controller slot there would keep
    // routing that session's commands to this client.
    if (boundSession && boundSession !== session) {
      const prev = boundSession;
      if (prev.extension?.id === socket.id) prev.extension = undefined;
      if (prev.controller?.id === socket.id) prev.controller = undefined;
      prev.observers.delete(socket);
      emitPeerStatus(prev);
      if (!prev.extension && !prev.controller && prev.observers.size === 0) {
        sessions.delete(prev.key);
      }
    }

    boundSession = session;

    if (payload.role === 'extension') {
      session.extension?.disconnect();
      session.extension = socket;
    } else if (payload.role === 'observer') {
      session.observers.add(socket);
    } else {
      session.controller?.disconnect();
      session.controller = socket;
    }

    const response: RegisteredPayload = {
      clientId: socket.id,
      profileId: session.profileId,
      sessionId: session.sessionId,
      role: payload.role,
      peers: peerStatus(session),
    };

    ack?.(response);
    socket.emit(SOCKET_EVENTS.REGISTERED, response);
    emitPeerStatus(session);
    console.log(`[socket] register profile=${session.profileId} session=${session.sessionId} role=${payload.role} client=${socket.id}`);
  });

  socket.on(SOCKET_EVENTS.EXECUTE_ACTION, (action: RemoteAction) => {
    if (!boundSession?.extension) {
      console.warn(`[socket] execute-action ${action.id} (${action.action}) — no extension connected in session=${boundSession?.sessionId ?? '-'}`);
      socket.emit(SOCKET_EVENTS.ACTION_RESULT, {
        actionId: action.id,
        success: false,
        error: 'No extension connected in this session',
      } satisfies ActionResult);
      return;
    }
    console.log(`[socket] execute-action → session=${boundSession.sessionId} id=${action.id} action=${action.action} tab=${action.tabId ?? '-'}`);
    boundSession.extension.emit(SOCKET_EVENTS.EXECUTE_ACTION, action);
  });

  socket.on(SOCKET_EVENTS.ACTION_RESULT, (result: ActionResult) => {
    console.log(`[socket] action-result ← session=${boundSession?.sessionId ?? '-'} id=${result.actionId} success=${result.success}${result.error ? ` error="${result.error}"` : ''}`);
    boundSession?.controller?.emit(SOCKET_EVENTS.ACTION_RESULT, result);
  });

  // Live apply progress from the extension → controller + all observers (Athens).
  socket.on(SOCKET_EVENTS.APPLY_PROGRESS, (progress: ApplyProgress) => {
    if (!boundSession) return;
    console.log(`[socket] apply-progress session=${boundSession.sessionId} phase=${progress.phase} step=${progress.appliedSteps ?? '-'}/${progress.totalSteps ?? '-'} — ${progress.message}`);
    boundSession.controller?.emit(SOCKET_EVENTS.APPLY_PROGRESS, progress);
    for (const observer of boundSession.observers) {
      observer.emit(SOCKET_EVENTS.APPLY_PROGRESS, progress);
    }
  });

  socket.on(SOCKET_EVENTS.TABS_UPDATE, (tabs: TabInfo[]) => {
    console.log(`[socket] tabs-update session=${boundSession?.sessionId ?? '-'} count=${tabs.length}`);
    boundSession?.controller?.emit(SOCKET_EVENTS.TABS_UPDATE, tabs);
  });

  socket.on(SOCKET_EVENTS.REQUEST_TABS, () => {
    boundSession?.extension?.emit(SOCKET_EVENTS.REQUEST_TABS);
  });

  socket.on(SOCKET_EVENTS.REQUEST_SCREENSHOT, (payload: { tabId?: number }) => {
    console.log(`[socket] request-screenshot session=${boundSession?.sessionId ?? '-'} tab=${payload.tabId ?? '-'}`);
    boundSession?.extension?.emit(SOCKET_EVENTS.REQUEST_SCREENSHOT, payload);
  });

  socket.on(
    SOCKET_EVENTS.SCREENSHOT_RESULT,
    (payload: { tabId: number; dataUrl?: string; error?: string }) => {
      console.log(
        `[socket] screenshot-result session=${boundSession?.sessionId ?? '-'} tab=${payload.tabId}${
          payload.error ? ` error="${payload.error}"` : ' ok'
        }`,
      );
      boundSession?.controller?.emit(SOCKET_EVENTS.SCREENSHOT_RESULT, payload);
    },
  );

  socket.on(SOCKET_EVENTS.PING, () => {
    socket.emit(SOCKET_EVENTS.PONG, { at: Date.now() });
  });

  socket.on('disconnect', () => {
    console.log(`[socket] disconnect ${socket.id} session=${boundSession?.sessionId ?? '-'}`);
    cleanupSocket(socket);
  });
});

httpServer.listen(PORT, HOST, () => {
  const label = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Avalon relay listening on http://${label}:${PORT}`);
});

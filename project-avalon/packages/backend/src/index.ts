import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  DEFAULT_SESSION_ID,
  SOCKET_EVENTS,
  type ActionResult,
  type RegisterPayload,
  type RegisteredPayload,
  type RemoteAction,
  type TabInfo,
} from '@avalon/shared';

const PORT = Number(process.env.PORT ?? 3847);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

interface Session {
  id: string;
  extension?: Socket;
  controller?: Socket;
}

const sessions = new Map<string, Session>();

function resolveSessionId(sessionId?: string): string {
  const trimmed = sessionId?.trim();
  return trimmed || DEFAULT_SESSION_ID;
}

function getOrCreateSession(sessionId?: string): Session {
  const id = resolveSessionId(sessionId);
  const existing = sessions.get(id);
  if (existing) return existing;
  const session: Session = { id };
  sessions.set(session.id, session);
  return session;
}

function peerStatus(session: Session): RegisteredPayload['peers'] {
  return {
    extension: Boolean(session.extension?.connected),
    controller: Boolean(session.controller?.connected),
  };
}

function emitPeerStatus(session: Session) {
  const payload = { sessionId: session.id, peers: peerStatus(session) };
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
    if (!session.extension && !session.controller) {
      sessions.delete(id);
    }
  }
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.get('/health', (_req, res) => {
  const active = [...sessions.values()].map((session) => ({
    id: session.id,
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

  socket.on(SOCKET_EVENTS.REGISTER, (payload: RegisterPayload, ack?: (data: RegisteredPayload) => void) => {
    const session = getOrCreateSession(payload.sessionId);
    boundSession = session;

    if (payload.role === 'extension') {
      session.extension?.disconnect();
      session.extension = socket;
    } else {
      session.controller?.disconnect();
      session.controller = socket;
    }

    const response: RegisteredPayload = {
      clientId: socket.id,
      sessionId: session.id,
      role: payload.role,
      peers: peerStatus(session),
    };

    ack?.(response);
    socket.emit(SOCKET_EVENTS.REGISTERED, response);
    emitPeerStatus(session);
  });

  socket.on(SOCKET_EVENTS.EXECUTE_ACTION, (action: RemoteAction) => {
    if (!boundSession?.extension) {
      socket.emit(SOCKET_EVENTS.ACTION_RESULT, {
        actionId: action.id,
        success: false,
        error: 'No extension connected in this session',
      } satisfies ActionResult);
      return;
    }
    boundSession.extension.emit(SOCKET_EVENTS.EXECUTE_ACTION, action);
  });

  socket.on(SOCKET_EVENTS.ACTION_RESULT, (result: ActionResult) => {
    boundSession?.controller?.emit(SOCKET_EVENTS.ACTION_RESULT, result);
  });

  socket.on(SOCKET_EVENTS.TABS_UPDATE, (tabs: TabInfo[]) => {
    boundSession?.controller?.emit(SOCKET_EVENTS.TABS_UPDATE, tabs);
  });

  socket.on(SOCKET_EVENTS.REQUEST_TABS, () => {
    boundSession?.extension?.emit(SOCKET_EVENTS.REQUEST_TABS);
  });

  socket.on(SOCKET_EVENTS.REQUEST_SCREENSHOT, (payload: { tabId?: number }) => {
    boundSession?.extension?.emit(SOCKET_EVENTS.REQUEST_SCREENSHOT, payload);
  });

  socket.on(
    SOCKET_EVENTS.SCREENSHOT_RESULT,
    (payload: { tabId: number; dataUrl?: string; error?: string }) => {
      boundSession?.controller?.emit(SOCKET_EVENTS.SCREENSHOT_RESULT, payload);
    },
  );

  socket.on(SOCKET_EVENTS.PING, () => {
    socket.emit(SOCKET_EVENTS.PONG, { at: Date.now() });
  });

  socket.on('disconnect', () => {
    cleanupSocket(socket);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Avalon relay listening on http://localhost:${PORT}`);
});

import { Server } from 'socket.io';

let io = null;

export function initConnectorSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    socket.on('subscribe', ({ runId }) => {
      if (runId) socket.join(`run:${runId}`);
    });
    socket.on('unsubscribe', ({ runId }) => {
      if (runId) socket.leave(`run:${runId}`);
    });
  });

  return io;
}

export function emitRunEvent(runId, event) {
  if (!io || !runId) return;
  io.to(`run:${runId}`).emit('run:event', event);
}

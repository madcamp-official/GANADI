// 서버 진입점 — Express(HTTP) + Socket.IO(시그널링 + 심판).
// 영상은 P2P(PeerJS)로 클라끼리, 서버는 방/매칭/판정만 담당.

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { registerRoomHandlers } from './rooms.js';

const PORT = process.env.PORT ?? 3001;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }, // TODO: 배포 시 클라 도메인으로 제한
});

app.get('/health', (_req, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  console.log('[io] connected', socket.id);
  registerRoomHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log('[io] disconnected', socket.id);
    // TODO: 진행 중 방이면 상대 몰수승 처리 (재접속 복구는 스코프 아웃)
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});

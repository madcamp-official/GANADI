// 서버 진입점 — Express(HTTP) + Socket.IO(시그널링 + 심판).
// 영상은 P2P(PeerJS)로 클라끼리, 서버는 방/매칭/판정만 담당.

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { registerRoomHandlers } from './rooms.js';

const PORT = process.env.PORT ?? 3001;

// 허용 오리진 — 배포 시 CORS_ORIGIN에 클라 도메인을 콤마로 나열한다.
//   CORS_ORIGIN="https://ganadi.example.com,https://www.ganadi.example.com"
// 개발 편의를 위해 미설정이면 전체 허용(*)으로 두되, 시작 로그에 경고를 남긴다.
const ORIGINS = (process.env.CORS_ORIGIN ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ORIGINS.length ? ORIGINS : '*' },
});

app.get('/health', (_req, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  console.log('[io] connected', socket.id);
  registerRoomHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log('[io] disconnected', socket.id);
    // 진행 중 방의 몰수승·정리는 rooms.js의 disconnect 핸들러가 담당.
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
  console.log(ORIGINS.length
    ? `[server] CORS 허용 오리진: ${ORIGINS.join(', ')}`
    : '[server] ⚠ CORS 전체 허용(*) — 배포 시 CORS_ORIGIN 환경변수를 지정할 것');
});

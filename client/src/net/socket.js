// Socket.IO 클라이언트 — 방/매칭/판정 이벤트. 단일 소켓 인스턴스를 공유.

import { io } from 'socket.io-client';
import { SERVER_URL } from '../config.js';

let socket = null;

export function connect() {
  if (!socket) socket = io(SERVER_URL, { autoConnect: true });
  return socket;
}

export function getSocket() {
  if (!socket) throw new Error('socket이 아직 connect()되지 않음');
  return socket;
}

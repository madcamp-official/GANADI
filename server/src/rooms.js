// 방 생성 / 코드 입장 / 2인 매칭. 방이 2인이 되면 Referee를 붙여 라운드를 시작한다.

import { EVENTS } from '../../shared/constants.js';
import { createReferee } from './referee.js';

/** @type {Map<string, { players: string[], referee: ReturnType<typeof createReferee>|null }>} */
const rooms = new Map();

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

/** 해당 소켓이 속한 방을 찾는다. @returns {{ code: string, room: any } | null} */
function findRoomBySocket(socketId) {
  for (const [code, room] of rooms) {
    if (room.players.includes(socketId)) return { code, room };
  }
  return null;
}

export function registerRoomHandlers(io, socket) {
  socket.on(EVENTS.CREATE_ROOM, (_payload, ack) => {
    const code = makeRoomCode();
    rooms.set(code, { players: [socket.id], referee: null });
    socket.join(code);
    console.log(`[room] ${code} 생성 by ${socket.id}`);
    ack?.({ code });
    io.to(code).emit(EVENTS.ROOM_STATE, { code, count: 1 });
  });

  socket.on(EVENTS.JOIN_ROOM, ({ code }, ack) => {
    const room = rooms.get(code);
    if (!room) {
      console.log(`[room] ${code} 입장 실패: NO_ROOM (${socket.id})`);
      return ack?.({ error: 'NO_ROOM' });
    }
    if (room.players.length >= 2) {
      console.log(`[room] ${code} 입장 실패: FULL (${socket.id})`);
      return ack?.({ error: 'FULL' });
    }

    room.players.push(socket.id);
    socket.join(code);
    console.log(`[room] ${code} 입장 by ${socket.id} → ${room.players.length}명`);
    ack?.({ code });
    io.to(code).emit(EVENTS.ROOM_STATE, { code, count: 2 });

    // 2인이 모이면 심판을 붙이고 첫 라운드 시작
    if (room.players.length === 2) {
      console.log(`[room] ${code} 2인 매칭 완료 → 심판 시작`);
      room.referee = createReferee(io, code, room.players);
      room.referee.start();
    }
  });

  // 시퀀스 완성 → 심판에게 전달. 서버 수신 순서가 곧 승부.
  socket.on(EVENTS.SEQ_COMPLETE, () => {
    const found = findRoomBySocket(socket.id);
    if (!found?.room.referee) return;
    console.log(`[room] ${found.code} 완성 수신 by ${socket.id}`);
    found.room.referee.onComplete(socket.id);
  });

  // 화상용 PeerJS id 교환 (서버는 중계만, 영상은 P2P)
  socket.on(EVENTS.PEER_ID, ({ code, peerId }) => {
    socket.to(code).emit(EVENTS.PEER_ID, { peerId });
  });

  // 이탈 처리 — 진행 중이면 남은 쪽 몰수승, 방 정리.
  socket.on('disconnect', () => {
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const { code, room } = found;
    if (room.players.length === 2 && room.referee) {
      room.referee.forfeit(socket.id);
    }
    rooms.delete(code);
    console.log(`[room] ${code} 정리 (${socket.id} 이탈)`);
  });
}

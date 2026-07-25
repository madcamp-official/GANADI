// 방 생성 / 코드 입장 / 2인 매칭. 방이 2인이 되면 Referee를 붙여 라운드를 시작한다.

import { EVENTS } from '../../shared/constants.js';
import { createReferee } from './referee.js';

/** @type {Map<string, { players: string[], referee: ReturnType<typeof createReferee>|null }>} */
const rooms = new Map();

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function registerRoomHandlers(io, socket) {
  socket.on(EVENTS.CREATE_ROOM, (_payload, ack) => {
    const code = makeRoomCode();
    rooms.set(code, { players: [socket.id], referee: null });
    socket.join(code);
    ack?.({ code });
    io.to(code).emit(EVENTS.ROOM_STATE, { code, count: 1 });
  });

  socket.on(EVENTS.JOIN_ROOM, ({ code }, ack) => {
    const room = rooms.get(code);
    if (!room) return ack?.({ error: 'NO_ROOM' });
    if (room.players.length >= 2) return ack?.({ error: 'FULL' });

    room.players.push(socket.id);
    socket.join(code);
    ack?.({ code });
    io.to(code).emit(EVENTS.ROOM_STATE, { code, count: 2 });

    // 2인이 모이면 심판을 붙이고 첫 라운드 시작
    if (room.players.length === 2) {
      room.referee = createReferee(io, code, room.players);
      room.referee.start();
    }
  });

  // 화상용 PeerJS id 교환 (서버는 중계만, 영상은 P2P)
  socket.on(EVENTS.PEER_ID, ({ code, peerId }) => {
    socket.to(code).emit(EVENTS.PEER_ID, { peerId });
  });
}

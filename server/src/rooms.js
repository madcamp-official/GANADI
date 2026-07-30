// 방 생성 / 코드 입장 / 2인 매칭. 방이 2인이 되면 Referee를 붙여 라운드를 시작한다.
//
// ★ 이 파일의 불변식 하나: "한 소켓은 동시에 최대 한 방에만 속한다."
//   예전엔 이게 없어서 세 가지가 동시에 터졌다 —
//     ① 방을 만든 사람이 자기 코드로 또 입장하면 players=[A,A]가 되어
//        심판의 loser가 undefined → hp가 NaN → MATCH_OVER가 영원히 안 나오는 대전이 열렸다.
//        (REMAINING.md의 "팬텀 상대" 정체)
//     ② CREATE_ROOM을 여러 번 부르면 방이 계속 쌓이고, disconnect는 그중 하나만 지웠다(누수).
//     ③ 로비에서 방을 만들고 연습 모드로 빠져도 서버엔 방이 살아 있어서,
//        코드를 아는 사람이 들어오면 엉뚱한 화면에서 대전이 시작됐다.
//   → 아래 leaveRoom()을 CREATE/JOIN/LEAVE/disconnect 진입부에서 반드시 통과시킨다.

import { EVENTS } from '../../shared/constants.js';
import { createReferee } from './referee.js';

/**
 * @typedef {{ players: string[], characters: Record<string,string>,
 *             referee: ReturnType<typeof createReferee>|null }} Room
 */
/** @type {Map<string, Room>} */
const rooms = new Map();

/** 소켓 → 방 코드. findRoomBySocket의 O(n) 순회와 "첫 매치만 찾는" 버그를 동시에 없앤다 */
/** @type {Map<string, string>} */
const socketRoom = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 O/0/I/1 제외
const CODE_LEN = 4;

/** 항상 CODE_LEN자리이고 살아있는 방과 겹치지 않는 코드. (예전 Math.random().toString(36)은 둘 다 보장 못 했다) */
function makeRoomCode() {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LEN; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(code)) return code;
  }
  return null; // 사실상 도달 불가 (32^4 = 백만). null이면 호출부가 SERVER_FULL로 거절한다.
}

/**
 * 방을 완전히 없앤다 — 색인·Map·socket.io 멤버십까지.
 * ★ socketsLeave가 핵심이다. 이게 없으면 남은 사람들이 옛 코드의 socket.io 방에 계속 붙어 있고,
 *   나중에 makeRoomCode가 같은 코드를 재발급했을 때 남의 대전 브로드캐스트를 같이 받는다.
 */
function destroyRoom(io, code, room) {
  for (const id of room?.players ?? []) socketRoom.delete(id);
  rooms.delete(code);
  io.in(code).socketsLeave(code);
}

/** 해당 소켓이 속한 방. @returns {{ code: string, room: Room } | null} */
function findRoomBySocket(socketId) {
  const code = socketRoom.get(socketId);
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) { socketRoom.delete(socketId); return null; } // 색인만 남은 경우 자가치유
  return { code, room };
}

/**
 * 소켓을 현재 방에서 빼낸다. 어떤 경로로 방을 떠나든(새 방 생성·다른 방 입장·연습 모드·접속 종료)
 * 전부 여기를 통과해야 유령 방이 안 생긴다.
 * @param {'disconnect'|'leave'} reason 진행 중 대전이면 남은 쪽 몰수승 처리 여부를 가른다
 */
function leaveRoom(io, socket, reason) {
  const found = findRoomBySocket(socket.id);
  socketRoom.delete(socket.id);
  if (!found) return;

  const { code, room } = found;
  socket.leave(code); // ★ socket.io 방에서도 실제로 나가야 한다. 안 그러면 옛 방의 브로드캐스트가 계속 꽂힌다.

  room.players = room.players.filter((id) => id !== socket.id);
  delete room.characters[socket.id];

  // 진행 중 대전 이탈 → 남은 쪽 몰수승. 심판이 MATCH_OVER를 쏘고 방은 아래에서 지워진다.
  // ★ "매칭 전에 상대만 빠지는" 경우는 존재하지 않는다: 두 번째 사람이 들어오는 순간
  //   같은 핸들러에서 심판이 시작되므로, 2인 방은 항상 referee가 붙어 있다.
  //   (그래서 남은 쪽에게 "상대가 나갔어요"를 알리는 별도 이벤트는 두지 않는다 — 몰수승이 그 역할이다.)
  if (room.referee) {
    room.referee.forfeit(socket.id);
    room.referee.dispose();
    room.referee = null;
  }

  destroyRoom(io, code, room);
  console.log(`[room] ${code} 정리 (${socket.id} ${reason})`);
}

export function registerRoomHandlers(io, socket) {
  socket.on(EVENTS.CREATE_ROOM, ({ character } = {}, ack) => {
    leaveRoom(io, socket, 'leave'); // 이전 방을 반드시 먼저 정리 (방 누적 방지)

    const code = makeRoomCode();
    if (!code) return ack?.({ error: 'SERVER_FULL' });

    rooms.set(code, { players: [socket.id], characters: { [socket.id]: character }, referee: null });
    socketRoom.set(socket.id, code);
    socket.join(code);
    console.log(`[room] ${code} 생성 by ${socket.id}`);
    ack?.({ code });
    io.to(code).emit(EVENTS.ROOM_STATE, { code, count: 1 });
  });

  socket.on(EVENTS.JOIN_ROOM, ({ code, character } = {}, ack) => {
    // 코드가 문자열이 아니면(객체·배열 등) 여기서 걸러 Map 조회에 이상한 게 들어가지 않게 한다
    if (typeof code !== 'string') return ack?.({ error: 'NO_ROOM' });
    const room = rooms.get(code);
    if (!room) {
      console.log(`[room] ${code} 입장 실패: NO_ROOM (${socket.id})`);
      return ack?.({ error: 'NO_ROOM' });
    }
    // ★ 자기가 만든 방에 자기가 또 들어오는 것을 막는다 (입장 버튼 더블클릭 포함).
    //   막지 않으면 players=[A,A]로 심판이 시작되어 끝나지 않는 대전이 열린다.
    if (room.players.includes(socket.id)) {
      console.log(`[room] ${code} 입장 실패: ALREADY_IN (${socket.id})`);
      return ack?.({ error: 'ALREADY_IN' });
    }
    if (room.players.length >= 2) {
      console.log(`[room] ${code} 입장 실패: FULL (${socket.id})`);
      return ack?.({ error: 'FULL' });
    }

    leaveRoom(io, socket, 'leave'); // 다른 방에 있었다면 거기서 먼저 나온다

    room.players.push(socket.id);
    room.characters[socket.id] = character;
    socketRoom.set(socket.id, code);
    socket.join(code);
    console.log(`[room] ${code} 입장 by ${socket.id} → ${room.players.length}명`);
    ack?.({ code });
    io.to(code).emit(EVENTS.ROOM_STATE, { code, count: room.players.length });

    // 2인이 모이면 상대 캐릭터를 각자에게 알리고 심판을 붙여 첫 라운드 시작
    if (room.players.length === 2) {
      console.log(`[room] ${code} 2인 매칭 완료 → 심판 시작`);
      const [p1, p2] = room.players;
      // 방 전체로 브로드캐스트(io.to(code)는 확실히 전달됨). 각 클라가 자기 것 빼고 상대 걸 고른다.
      const characters = { [p1]: room.characters[p1], [p2]: room.characters[p2] };
      console.log(`[room] ${code} MATCH_INFO(room) →`, characters);
      io.to(code).emit(EVENTS.MATCH_INFO, { characters });

      room.referee = createReferee(io, code, room.players, () => {
        // 매치 종료 시 방 정리 (메모리 누수 방지·재대전은 새 방으로)
        destroyRoom(io, code, room);
        console.log(`[room] ${code} 매치 종료 → 방 정리`);
      });
      room.referee.start();
    }
  });

  // 로비를 떠날 때(연습 모드 진입·도감 이동 등) 클라가 명시적으로 알린다.
  // 이게 없으면 서버에 방이 남아, 코드를 아는 사람이 들어올 때 엉뚱한 화면에서 대전이 시작된다.
  socket.on(EVENTS.LEAVE_ROOM, () => leaveRoom(io, socket, 'leave'));

  // 시퀀스 완성 → 심판에게 전달. 서버 수신 순서가 곧 승부.
  socket.on(EVENTS.SEQ_COMPLETE, () => {
    const found = findRoomBySocket(socket.id);
    if (!found?.room.referee) return;
    console.log(`[room] ${found.code} 완성 수신 by ${socket.id}`);
    found.room.referee.onComplete(socket.id);
  });

  // 상대 진행 상황 실시간 표시 — 서버는 중계만 (판정과 무관).
  // 숫자로 정규화해서 넘긴다: 클라가 뭘 보내든 상대 화면에 이상한 값이 꽂히지 않게.
  socket.on(EVENTS.OPP_PROGRESS, ({ progress, total } = {}) => {
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const n = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(99, Math.floor(v))) : 0);
    socket.to(found.code).emit(EVENTS.OPP_PROGRESS, { progress: n(progress), total: n(total) });
  });

  // 화상용 PeerJS id 교환 (서버는 중계만, 영상은 P2P).
  // ★ 클라가 준 code를 믿지 않는다 — 예전엔 그대로 썼더니 방에 속하지도 않은 제3자가
  //   남의 방에 peer id를 쏠 수 있었고, 받은 쪽은 걸려온 콜에 무조건 응답하므로
  //   웹캠 스트림이 공격자에게 넘어갔다. 방은 서버가 아는 것만 쓴다.
  socket.on(EVENTS.PEER_ID, ({ peerId } = {}) => {
    if (typeof peerId !== 'string' || !peerId || peerId.length > 128) return;
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    socket.to(found.code).emit(EVENTS.PEER_ID, { peerId });
  });

  // 이탈 처리 — 진행 중이면 남은 쪽 몰수승, 방 정리.
  socket.on('disconnect', () => leaveRoom(io, socket, 'disconnect'));
}

/** 테스트·진단용 스냅샷 (tools/testServer.mjs가 누수를 확인한다) */
export function roomStats() {
  return { rooms: rooms.size, sockets: socketRoom.size, codes: [...rooms.keys()] };
}

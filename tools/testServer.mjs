// 서버 회귀 스모크 테스트 — 실제 Socket.IO 서버를 띄우고 진짜 클라로 붙어서 확인한다.
//
//   node tools/testServer.mjs      (= npm run test:server)
//
// 여기 있는 항목은 전부 "예전에 실제로 터졌던 것"이다. 방 관리를 건드렸다면 반드시 돌릴 것.
// 라운드 제한시간처럼 30초짜리 동작은 RULES를 직접 줄여 재는 대신, 짧게 검증 가능한
// 부분(치트 가드·타이머 존재)만 본다.

import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { EVENTS, RULES } from '../shared/constants.js';
import { damageFor, minCompleteMs } from '../shared/jutsu.js';
import { registerRoomHandlers, roomStats } from '../server/src/rooms.js';

const PORT = 34599;
const URL = `http://localhost:${PORT}`;

let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 서버 기동 (로그는 조용히) ---
const quiet = console.log;
const httpServer = createServer();
const ioServer = new Server(httpServer, { cors: { origin: '*' } });
ioServer.on('connection', (socket) => registerRoomHandlers(ioServer, socket));
await new Promise((r) => httpServer.listen(PORT, r));

const clients = [];
async function client() {
  const s = connect(URL, { forceNew: true });
  await new Promise((r) => s.on('connect', r));
  s.seen = { rounds: [], results: [], over: [], peers: [] };
  s.on(EVENTS.ROUND_START, (p) => s.seen.rounds.push(p));
  s.on(EVENTS.ROUND_RESULT, (p) => s.seen.results.push(p));
  s.on(EVENTS.MATCH_OVER, (p) => s.seen.over.push(p));
  s.on(EVENTS.PEER_ID, (p) => s.seen.peers.push(p));
  clients.push(s);
  return s;
}
const create = (s, ch = 'hono') => s.emitWithAck(EVENTS.CREATE_ROOM, { character: ch });
const join = (s, code, ch = 'mizu') => s.emitWithAck(EVENTS.JOIN_ROOM, { code, character: ch });

// ─────────────────────────────────────────────────────────────
console.log('\n① 자기 방에 자기가 입장 → 거절되어야 한다 (예전엔 끝나지 않는 대전이 열렸다)');
{
  const a = await client();
  const { code } = await create(a);
  const res = await join(a, code);
  ok('ALREADY_IN으로 거절', res?.error === 'ALREADY_IN', JSON.stringify(res));
  await sleep(300);
  ok('혼자인데 라운드가 시작되지 않음', a.seen.rounds.length === 0, `rounds=${a.seen.rounds.length}`);
  a.emit(EVENTS.LEAVE_ROOM);
  await sleep(100);
}

console.log('\n② 방을 여러 번 만들어도 방은 하나만 남는다 (예전엔 계속 쌓이고 누수됐다)');
{
  const before = roomStats().rooms;
  const a = await client();
  await create(a); await create(a); await create(a);
  await sleep(150);
  ok('방 3번 생성 후에도 +1개만 존재', roomStats().rooms === before + 1, `rooms=${roomStats().rooms}`);
  a.disconnect();
  await sleep(200);
  ok('접속 종료 후 방이 완전히 정리됨', roomStats().rooms === before, JSON.stringify(roomStats()));
}

console.log('\n③ 로비를 떠나면(room:leave) 유령 방이 남지 않는다');
{
  const before = roomStats().rooms;
  const a = await client();
  const { code } = await create(a);
  a.emit(EVENTS.LEAVE_ROOM);
  await sleep(150);
  ok('방이 사라짐', roomStats().rooms === before);
  const b = await client();
  ok('그 코드로는 아무도 못 들어옴', (await join(b, code))?.error === 'NO_ROOM');
  await sleep(100);
  ok('떠난 사람에게 라운드가 새지 않음', a.seen.rounds.length === 0);
  a.disconnect(); b.disconnect();
}

console.log('\n④ 정상 2인 대전 — 판정·데미지·종료가 끝까지 돈다');
{
  const a = await client(), b = await client();
  const { code } = await create(a);
  await join(b, code);
  await sleep(200);
  ok('양쪽 다 ROUND_START 수신', a.seen.rounds.length === 1 && b.seen.rounds.length === 1);

  const seq = a.seen.rounds[0].sequence;
  ok('제한시간이 함께 배포됨', a.seen.rounds[0].timeLimitMs === RULES.ROUND_TIME_MS);

  // 치트 가드: 즉시 완성 신고는 무시돼야 한다
  a.emit(EVENTS.SEQ_COMPLETE, {});
  await sleep(150);
  ok('즉시 완성 신고는 거부됨(치트 가드)', a.seen.results.length === 0, `results=${a.seen.results.length}`);

  // 정직한 시간이 흐른 뒤엔 인정
  await sleep(minCompleteMs(seq.length) + 100);
  a.emit(EVENTS.SEQ_COMPLETE, {});
  await sleep(200);
  ok('시간이 지난 뒤 완성은 인정됨', a.seen.results.length === 1);

  const r = a.seen.results[0];
  ok('데미지가 시퀀스 길이에 비례', r?.damage === damageFor(seq.length), `damage=${r?.damage}`);
  ok('hp에 NaN/undefined 키가 없음',
    r && Object.keys(r.hp).length === 2 && Object.values(r.hp).every(Number.isFinite),
    JSON.stringify(r?.hp));
  ok('패자가 정확히 지목됨', r?.loser === b.id && r?.winner === a.id);

  a.disconnect(); b.disconnect();
  await sleep(200);
}

console.log('\n⑤ 이탈 → 남은 쪽 몰수승, 방 정리');
{
  const before = roomStats().rooms;
  const a = await client(), b = await client();
  const { code } = await create(a);
  await join(b, code);
  await sleep(200);
  a.disconnect();
  await sleep(250);
  ok('남은 쪽이 몰수승 수신', b.seen.over.some((o) => o.reason === 'forfeit' && o.winner === b.id),
    JSON.stringify(b.seen.over));
  b.disconnect();
  await sleep(200);
  ok('방·색인 모두 정리됨', roomStats().rooms === before && roomStats().sockets === 0, JSON.stringify(roomStats()));
}

console.log('\n⑥ PEER_ID 위조 — 방 밖의 제3자는 남의 방에 못 쏜다 (예전엔 웹캠이 넘어갔다)');
{
  const a = await client(), b = await client(), attacker = await client();
  const { code } = await create(a);
  await join(b, code);
  await sleep(200);

  attacker.emit(EVENTS.PEER_ID, { code, peerId: 'ATTACKER' });
  await sleep(200);
  ok('공격자의 peer id가 전달되지 않음',
    !b.seen.peers.some((p) => p.peerId === 'ATTACKER'), JSON.stringify(b.seen.peers));

  a.emit(EVENTS.PEER_ID, { peerId: 'LEGIT-A' });
  await sleep(200);
  ok('같은 방 상대의 peer id는 정상 전달', b.seen.peers.some((p) => p.peerId === 'LEGIT-A'));
  ok('자기 자신에게는 되돌아오지 않음', !a.seen.peers.some((p) => p.peerId === 'LEGIT-A'));

  [a, b, attacker].forEach((s) => s.disconnect());
  await sleep(200);
}

console.log('\n⑦ 대전 중 "나가기"(room:leave) → 상대 몰수승, 방 정리');
{
  const before = roomStats().rooms;
  const a = await client(), b = await client();
  const { code } = await create(a);
  await join(b, code);
  await sleep(150);
  b.emit(EVENTS.LEAVE_ROOM); // BattleScene의 나가기 버튼과 같은 경로
  await sleep(250);
  ok('남은 쪽이 몰수승 수신', a.seen.over.some((o) => o.reason === 'forfeit' && o.winner === a.id),
    JSON.stringify(a.seen.over));
  ok('방이 정리됨', roomStats().rooms === before);
  const c = await client();
  ok('떠난 방 코드는 재사용 불가', (await join(c, code))?.error === 'NO_ROOM');
  [a, b, c].forEach((s) => s.disconnect());
  await sleep(200);
}

console.log('\n⑧ 잘못된 입력에 서버가 죽지 않는다');
{
  const a = await client();
  ok('code가 객체여도 NO_ROOM', (await join(a, { evil: true }))?.error === 'NO_ROOM');
  ok('code가 null이어도 NO_ROOM', (await join(a, null))?.error === 'NO_ROOM');
  a.emit(EVENTS.OPP_PROGRESS, { progress: 'x', total: NaN });
  a.emit(EVENTS.PEER_ID, { peerId: 'x'.repeat(9999) });
  a.emit(EVENTS.SEQ_COMPLETE, {});
  a.emit(EVENTS.LEAVE_ROOM);
  await sleep(200);
  ok('서버가 계속 살아 있음', httpServer.listening);
  a.disconnect();
  await sleep(150);
}

// ─────────────────────────────────────────────────────────────
console.log(`\n최종 방 상태: ${JSON.stringify(roomStats())}`);
ok('테스트 종료 시 누수 없음', roomStats().rooms === 0 && roomStats().sockets === 0);

quiet(`\n${'─'.repeat(48)}\n통과 ${passed} · 실패 ${failed}\n`);
clients.forEach((s) => s.close());
ioServer.close();
httpServer.close();
process.exit(failed ? 1 : 0);

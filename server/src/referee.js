// 라운드 상태 머신 — 서버 권위 판정.
// 대기 → 시퀀스 배포 → 수신 대기 → 판정 → 데미지 브로드캐스트 → 다음 라운드/종료.
// 승자는 "시퀀스 완성" 이벤트의 서버 수신 순서(타임스탬프)로 결정 → 넷코드 난이도 제로.

import { EVENTS, RULES } from '../../shared/constants.js';
import { makeSequence } from './sequence.js';

const NEXT_ROUND_DELAY_MS = 2000; // 결과 연출 여유 후 다음 라운드

export function createReferee(io, code, players) {
  const hp = Object.fromEntries(players.map((id) => [id, RULES.MAX_HP]));
  let round = 0;
  let currentSequence = null;
  let roundResolved = true; // 라운드 진행 중이 아니면 완성 이벤트 무시
  let over = false;

  function startRound() {
    if (over) return;
    round += 1;
    const length = round <= 2 ? 3 : 5; // 초반 3연쇄, 후반 5연쇄
    currentSequence = makeSequence(length);
    roundResolved = false;
    console.log(`[referee] ${code} round ${round} 시작 → 시퀀스`, currentSequence);
    io.to(code).emit(EVENTS.ROUND_START, { round, sequence: currentSequence });
  }

  // 시퀀스 완성 수신. 서버 수신 순서로 승자 결정 → 먼저 도착한 것만 인정.
  function onComplete(socketId) {
    if (over || roundResolved) return; // 이번 라운드 이미 판정났거나 종료됨
    if (!(socketId in hp)) return;     // 이 방 소속 아님
    roundResolved = true;

    const winner = socketId;
    const loser = players.find((id) => id !== winner);
    const damage = RULES.DAMAGE[currentSequence.length] ?? 0;
    hp[loser] = Math.max(0, hp[loser] - damage);

    console.log(`[referee] ${code} round ${round} 승자 ${winner} (-${damage}) → hp`, hp);
    io.to(code).emit(EVENTS.ROUND_RESULT, { winner, loser, damage, hp: { ...hp } });

    if (hp[loser] <= 0) {
      over = true;
      console.log(`[referee] ${code} 종료 → 승자 ${winner}`);
      io.to(code).emit(EVENTS.MATCH_OVER, { winner });
    } else {
      setTimeout(startRound, NEXT_ROUND_DELAY_MS);
    }
  }

  // 이탈 시 남은 쪽 몰수승 (재접속 복구는 스코프 아웃).
  function forfeit(leaverId) {
    if (over) return;
    over = true;
    const winner = players.find((id) => id !== leaverId);
    console.log(`[referee] ${code} 몰수승 → ${winner} (${leaverId} 이탈)`);
    if (winner) io.to(code).emit(EVENTS.MATCH_OVER, { winner, reason: 'forfeit' });
  }

  return {
    start: startRound,
    onComplete,
    forfeit,
    hp,
  };
}

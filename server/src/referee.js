// 라운드 상태 머신 — 서버 권위 판정.
// 대기 → 시퀀스 배포 → 수신 대기 → 판정 → 데미지 브로드캐스트 → 다음 라운드/종료.
// 승자는 "시퀀스 완성" 이벤트의 서버 수신 순서(타임스탬프)로 결정 → 넷코드 난이도 제로.

import { EVENTS, RULES, PLAYABLE_SEAL_IDS } from '../../shared/constants.js';
import { pickJutsu, jutsuSeals, damageFor } from '../../shared/jutsu.js';

const NEXT_ROUND_DELAY_MS = 2000; // 결과 연출 여유 후 다음 라운드

export function createReferee(io, code, players, onEnd) {
  const hp = Object.fromEntries(players.map((id) => [id, RULES.MAX_HP]));
  let round = 0;
  let currentSequence = null;
  let currentJutsu = null;
  let roundResolved = true; // 라운드 진행 중이 아니면 완성 이벤트 무시
  let over = false;

  function end() {
    over = true;
    onEnd?.(); // 방 정리는 rooms.js가 담당
  }

  function startRound() {
    if (over) return;
    round += 1;
    // 라운드마다 인술 하나를 뽑아 그 인의 순서를 목표 시퀀스로 (양쪽 동일)
    currentJutsu = pickJutsu(PLAYABLE_SEAL_IDS);
    currentSequence = jutsuSeals(currentJutsu);
    roundResolved = false;
    console.log(`[referee] ${code} round ${round} → ${currentJutsu.name_kr}`, currentSequence);
    io.to(code).emit(EVENTS.ROUND_START, {
      round,
      sequence: currentSequence,
      jutsu: { id: currentJutsu.id, name_kr: currentJutsu.name_kr, element: currentJutsu.element },
    });
  }

  // 시퀀스 완성 수신. 서버 수신 순서로 승자 결정 → 먼저 도착한 것만 인정.
  function onComplete(socketId) {
    if (over || roundResolved) return; // 이번 라운드 이미 판정났거나 종료됨
    if (!(socketId in hp)) return;     // 이 방 소속 아님
    roundResolved = true;

    const winner = socketId;
    const loser = players.find((id) => id !== winner);
    const damage = damageFor(currentSequence.length);
    hp[loser] = Math.max(0, hp[loser] - damage);

    console.log(`[referee] ${code} round ${round} 승자 ${winner} (-${damage}) → hp`, hp);
    io.to(code).emit(EVENTS.ROUND_RESULT, { winner, loser, damage, hp: { ...hp } });

    if (hp[loser] <= 0) {
      console.log(`[referee] ${code} 종료 → 승자 ${winner}`);
      io.to(code).emit(EVENTS.MATCH_OVER, { winner });
      end();
    } else {
      setTimeout(startRound, NEXT_ROUND_DELAY_MS);
    }
  }

  // 이탈 시 남은 쪽 몰수승 (재접속 복구는 스코프 아웃).
  function forfeit(leaverId) {
    if (over) return;
    const winner = players.find((id) => id !== leaverId);
    console.log(`[referee] ${code} 몰수승 → ${winner} (${leaverId} 이탈)`);
    if (winner) io.to(code).emit(EVENTS.MATCH_OVER, { winner, reason: 'forfeit' });
    end();
  }

  return {
    start: startRound,
    onComplete,
    forfeit,
    hp,
  };
}

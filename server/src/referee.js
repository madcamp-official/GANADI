// 라운드 상태 머신 — 서버 권위 판정.
// 대기 → 시퀀스 배포 → 수신 대기 → 판정 → 데미지 브로드캐스트 → 다음 라운드/종료.
// 승자는 "시퀀스 완성" 이벤트의 서버 수신 순서(타임스탬프)로 결정 → 넷코드 난이도 제로.
//
// ★ 라운드에는 제한시간이 있다 (RULES.ROUND_TIME_MS).
//   없으면 양쪽 다 인식에 실패했을 때 라운드가 영원히 멈춘다 — 시연 중 화면이 정지한다.
//   시간이 다 되면 무승부로 처리하고 데미지 없이 다음 라운드로 넘긴다.

import { EVENTS, RULES } from '../../shared/constants.js';
import { pickJutsu, jutsuSeals, damageFor, minCompleteMs } from '../../shared/jutsu.js';

const NEXT_ROUND_DELAY_MS = 2000; // 결과 연출 여유 후 다음 라운드

export function createReferee(io, code, players, onEnd) {
  // ★ 생성 시점의 명단을 복사해 둔다. 호출부가 room.players를 갈아끼워도 심판은 원본을 본다.
  const roster = [...new Set(players)];
  const hp = Object.fromEntries(roster.map((id) => [id, RULES.MAX_HP]));
  let round = 0;
  let currentSequence = null;
  let currentJutsu = null;
  let roundStartedAt = 0;
  let roundResolved = true; // 라운드 진행 중이 아니면 완성 이벤트 무시
  let over = false;
  let nextRoundTimer = null;
  let roundTimer = null;

  // 2인이 아닌 심판은 판정이 성립하지 않는다 (예전엔 [A,A]로도 시작돼 hp가 NaN이 됐다).
  if (roster.length !== 2) {
    console.warn(`[referee] ${code} 생성 거부 — 플레이어가 2명이 아님:`, players);
  }

  function clearTimers() {
    if (nextRoundTimer) { clearTimeout(nextRoundTimer); nextRoundTimer = null; }
    if (roundTimer) { clearTimeout(roundTimer); roundTimer = null; }
  }

  function end() {
    over = true;
    clearTimers();
    onEnd?.(); // 방 정리는 rooms.js가 담당
  }

  function startRound() {
    if (over || roster.length !== 2) return;
    clearTimers();
    round += 1;
    // 라운드마다 인술 하나를 뽑아 그 인의 순서를 목표 시퀀스로 (양쪽 동일)
    currentJutsu = pickJutsu();
    currentSequence = jutsuSeals(currentJutsu);
    roundResolved = false;
    roundStartedAt = Date.now();
    console.log(`[referee] ${code} round ${round} → ${currentJutsu.name_kr}`, currentSequence);
    io.to(code).emit(EVENTS.ROUND_START, {
      round,
      sequence: currentSequence,
      timeLimitMs: RULES.ROUND_TIME_MS, // 클라가 같은 시계로 카운트다운을 그린다
      jutsu: { id: currentJutsu.id, name_kr: currentJutsu.name_kr, element: currentJutsu.element },
    });
    roundTimer = setTimeout(onRoundTimeout, RULES.ROUND_TIME_MS);
  }

  // 제한시간 초과 — 아무도 완성하지 못했다. 데미지 없이 다음 라운드로.
  function onRoundTimeout() {
    if (over || roundResolved) return;
    roundResolved = true;
    roundTimer = null;
    console.log(`[referee] ${code} round ${round} 시간 초과 → 무승부`);
    io.to(code).emit(EVENTS.ROUND_TIMEOUT, { round, hp: { ...hp } });
    nextRoundTimer = setTimeout(startRound, NEXT_ROUND_DELAY_MS);
  }

  // 시퀀스 완성 수신. 서버 수신 순서로 승자 결정 → 먼저 도착한 것만 인정.
  function onComplete(socketId) {
    if (over || roundResolved) return; // 이번 라운드 이미 판정났거나 종료됨
    if (!(socketId in hp)) return;     // 이 방 소속 아님

    // 물리적으로 불가능한 속도의 완성 신고는 버린다.
    // 서버는 클라의 "다 했다"를 검증할 방법이 없으므로(랜드마크를 안 받는다) 최소한 시간만 본다.
    // 인 1개당 홀드 시간이 필요하니 그 절반보다 빠르면 콘솔에서 이벤트를 쏜 것이다.
    const elapsed = Date.now() - roundStartedAt;
    const floor = minCompleteMs(currentSequence.length);
    if (elapsed < floor) {
      console.warn(`[referee] ${code} 완성 무시 — 너무 빠름 (${elapsed}ms < ${floor}ms) by ${socketId}`);
      return;
    }

    roundResolved = true;
    clearTimers();

    const winner = socketId;
    const loser = roster.find((id) => id !== winner);
    if (!loser) { // 명단이 깨진 방 — 판정 대신 종료해서 좀비 대전을 만들지 않는다
      console.warn(`[referee] ${code} 상대를 찾을 수 없음 → 매치 종료`);
      io.to(code).emit(EVENTS.MATCH_OVER, { winner, reason: 'invalid-room' });
      return end();
    }

    const damage = damageFor(currentSequence.length);
    hp[loser] = Math.max(0, hp[loser] - damage);

    console.log(`[referee] ${code} round ${round} 승자 ${winner} (-${damage}) → hp`, hp);
    io.to(code).emit(EVENTS.ROUND_RESULT, { winner, loser, damage, hp: { ...hp } });

    if (hp[loser] <= 0) {
      console.log(`[referee] ${code} 종료 → 승자 ${winner}`);
      io.to(code).emit(EVENTS.MATCH_OVER, { winner });
      end();
    } else {
      nextRoundTimer = setTimeout(startRound, NEXT_ROUND_DELAY_MS);
    }
  }

  // 이탈 시 남은 쪽 몰수승 (재접속 복구는 스코프 아웃).
  function forfeit(leaverId) {
    if (over) return;
    const winner = roster.find((id) => id !== leaverId);
    console.log(`[referee] ${code} 몰수승 → ${winner} (${leaverId} 이탈)`);
    if (winner) io.to(code).emit(EVENTS.MATCH_OVER, { winner, reason: 'forfeit' });
    end();
  }

  return {
    start: startRound,
    onComplete,
    forfeit,
    /** 타이머만 정리하고 조용히 죽는다 (방이 먼저 사라진 경우) */
    dispose() { over = true; clearTimers(); },
    hp,
  };
}

// 라운드 상태 머신 — 서버 권위 판정.
// 대기 → 시퀀스 배포 → 수신 대기 → 판정 → 데미지 브로드캐스트 → 다음 라운드/종료.
// 승자는 "시퀀스 완성" 이벤트의 서버 수신 순서(타임스탬프)로 결정 → 넷코드 난이도 제로.

import { EVENTS, RULES } from '../../shared/constants.js';
import { makeSequence } from './sequence.js';

export function createReferee(io, code, players) {
  const hp = Object.fromEntries(players.map((id) => [id, RULES.MAX_HP]));
  let round = 0;

  function startRound() {
    round += 1;
    const length = round <= 2 ? 3 : 5; // 초반 3연쇄, 후반 5연쇄
    const sequence = makeSequence(length);
    io.to(code).emit(EVENTS.ROUND_START, { round, sequence });
    // TODO: 완성 수신 대기 상태로 전환. 먼저 도착한 완성 이벤트가 승자.
  }

  function onComplete(/* socketId, payload */) {
    // TODO: 첫 완성만 인정, 나머지는 무시.
    //   데미지 = RULES.DAMAGE[sequence.length], 패자 hp 차감.
    //   io.to(code).emit(EVENTS.ROUND_RESULT, { winner, damage, hp });
    //   hp <= 0 이면 MATCH_OVER, 아니면 startRound().
  }

  return {
    start: startRound,
    onComplete,
    hp,
  };
}

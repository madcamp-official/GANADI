// 라운드 시퀀스 생성 — 서버 대전과 로컬 연습 모드가 같은 규칙을 쓴다.
// (클라는 server/를 import할 수 없으므로 공유 위치에 둔다)

import { PLAYABLE_SEAL_IDS } from './constants.js';

/**
 * length개의 인장을 랜덤으로 뽑는다.
 *
 * ★ 같은 인장이 연달아 나오지 않게 한다.
 *   인식기는 홀드 후 엣지 트리거로 1회만 발행하므로, 같은 인장을 계속 들고 있으면
 *   두 번째가 발행되지 않는다(손을 한 번 풀었다 다시 맺어야 함 — 실측 확인).
 *   플레이어에겐 "인식이 멈춘 것"처럼 보이므로 아예 시퀀스에서 배제한다.
 *
 * @param {number} length
 * @param {string[]} pool 기본값은 실전 투입 인장 목록
 */
export function makeSequence(length, pool = PLAYABLE_SEAL_IDS) {
  const seq = [];
  for (let i = 0; i < length; i++) {
    // 인장이 1종뿐이면 연속 중복을 피할 방법이 없으니 그냥 넣는다
    const candidates = pool.length > 1 ? pool.filter((id) => id !== seq[i - 1]) : pool;
    seq.push(candidates[Math.floor(Math.random() * candidates.length)]);
  }
  return seq;
}

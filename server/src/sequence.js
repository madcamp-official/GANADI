// 라운드 시퀀스 생성. 실전 투입 인장만 사용 (§4.5 — 인식률 미달 인장은 제외).

import { SEAL_IDS } from '../../shared/constants.js';

// 실전 투입 인장 목록.
// Day 2 통합 테스트: A 인식기가 현재 3종(horse/dog/rooster)만 발행 → 그 3종으로 제한.
// A가 12종 확장하면 → SEAL_IDS로 되돌리고, Day5에 혼동행렬 미달분만 제외 (§4.5).
const PLAYABLE_SEALS = ['horse', 'dog', 'rooster'];
void SEAL_IDS; // (12종 복귀 시 사용)

/** length개의 인장을 랜덤으로 뽑아 시퀀스 생성 (연속 중복 허용 여부는 튜닝 대상). */
export function makeSequence(length) {
  return Array.from({ length }, () => {
    const i = Math.floor(Math.random() * PLAYABLE_SEALS.length);
    return PLAYABLE_SEALS[i];
  });
}

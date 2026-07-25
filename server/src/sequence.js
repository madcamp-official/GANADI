// 라운드 시퀀스 생성. 실전 투입 인장만 사용 (§4.5 — 인식률 미달 인장은 제외).

import { SEAL_IDS } from '../../shared/constants.js';

// TODO(Day5): 혼동행렬 기준 미달 인장을 여기서 걸러낸 목록으로 교체.
const PLAYABLE_SEALS = SEAL_IDS;

/** length개의 인장을 랜덤으로 뽑아 시퀀스 생성 (연속 중복 허용 여부는 튜닝 대상). */
export function makeSequence(length) {
  return Array.from({ length }, () => {
    const i = Math.floor(Math.random() * PLAYABLE_SEALS.length);
    return PLAYABLE_SEALS[i];
  });
}

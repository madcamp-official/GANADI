// featuresV2.js — MLP 전용 특징 (v2). 센트로이드는 features.js(v1)를 계속 쓴다.
//
// ★ features.js를 고치지 않고 새 파일로 뺀 이유:
//   v1은 센트로이드·수집 데이터의 features 필드·replay.mjs 재현성 검사가 전부 그 위에 서 있다.
//   한 글자만 바꿔도 그게 통째로 무효가 되고, 시연 직전 센트로이드 폴백도 못 쓰게 된다.
//
// v1과의 차이는 점 목록 하나뿐이다: PIP 관절 4개(6,10,14,18) 추가 → 손가락 굽힘이 살아난다.
// 교차 세션 60.7% → 69.1% (5회 평균, 분포 겹침 없음).
// DIP(7,11,15,19)까지 넣으면 오히려 떨어진다 — 차원만 420으로 늘고 과적합된다.

import { normalizeLandmarks } from './features.js';

/** 손목 + 손끝5 + MCP4 + PIP4 = 14점 */
export const FEATURE_POINTS_V2 = [0, 4, 8, 12, 16, 20, 5, 9, 13, 17, 6, 10, 14, 18];

/** 한 손에서 나오는 쌍거리 개수 (14점 → 14×13/2) */
export const FEAT_PER_HAND_V2 = 91;

/** 두 손 고정 길이. 없는 손 자리는 0 */
export const FEAT_LENGTH_V2 = FEAT_PER_HAND_V2 * 2;

/** 정규화 좌표 위 쌍거리. ★ z는 넣지 않는다 — 넣으면 성적이 떨어진다(측정: 67.0% → 62.2%) */
function pairwiseV2(lm) {
  const n = normalizeLandmarks(lm);
  const out = [];
  for (let a = 0; a < FEATURE_POINTS_V2.length; a++) {
    for (let b = a + 1; b < FEATURE_POINTS_V2.length; b++) {
      const pa = n[FEATURE_POINTS_V2[a]];
      const pb = n[FEATURE_POINTS_V2[b]];
      out.push(Math.hypot(pa.x - pb.x, pa.y - pb.y));
    }
  }
  return out;
}

/**
 * 고정 길이 182 특징 벡터. v1과 동일한 규칙: 손목 x로 왼→오 정렬, 없는 손 자리는 0.
 * @param {Array<Array<{x:number,y:number,z:number}>>} hands 손별 21개 랜드마크
 * @returns {number[]} 항상 182개
 */
export function extractFeaturesV2(hands) {
  const slots = [new Array(FEAT_PER_HAND_V2).fill(0), new Array(FEAT_PER_HAND_V2).fill(0)];
  if (hands?.length) {
    [...hands]
      .sort((a, b) => a[0].x - b[0].x)
      .slice(0, 2)
      .forEach((lm, i) => { slots[i] = pairwiseV2(lm); });
  }
  return [...slots[0], ...slots[1]];
}

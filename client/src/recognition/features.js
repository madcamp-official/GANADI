// 특징 추출 — 손목 기준 정규화 + 쌍거리 특징 (§4.4).
// 원시 좌표 대신 선택 랜드마크 쌍의 거리 행렬을 입력으로 써서 맞물림 구조를 인코딩.
//
// ★ 이 파일의 계산은 수집 툴(hand-test/js/features.js)과 한 글자도 달라지면 안 된다.
//   센트로이드·모델이 전부 수집 당시의 특징값 위에 세워져 있어서, 여기가 바뀌면 인식이 통째로 죽는다.
//   변경 시 반드시 `node tools/replay.mjs`의 "특징 재현성" 검사를 통과시킬 것.

/** 쌍거리에 쓸 주요 랜드마크 (손목 + 손가락 끝 5 + MCP 4 = 10점) */
export const FEATURE_POINTS = [0, 4, 8, 12, 16, 20, 5, 9, 13, 17];

/** 한 손에서 나오는 쌍거리 개수 (10점 → 45쌍) */
export const FEAT_PER_HAND = 45;

/** 두 손 고정 길이. 없는 손 자리는 0으로 채운다 */
export const FEAT_LENGTH = FEAT_PER_HAND * 2;

/**
 * 손목 기준 정규화 — 손목(0)을 원점으로 옮기고 손바닥 길이(0→9)로 나눈다.
 * 손이 화면 어디에 있든, 카메라에서 얼마나 멀든 같은 포즈면 같은 값이 나온다.
 */
export function normalizeLandmarks(lm) {
  const wrist = lm[0];
  const ref = lm[9]; // 중지 MCP — 손바닥 길이 기준점
  const scale = Math.hypot(ref.x - wrist.x, ref.y - wrist.y) || 1e-6; // 0 나눗셈 방지
  return lm.map((p) => ({
    x: (p.x - wrist.x) / scale,
    y: (p.y - wrist.y) / scale,
    z: (p.z - wrist.z) / scale,
  }));
}

/**
 * 쌍거리 특징 — 정규화 좌표 위에서 주요 랜드마크 사이 거리를 전부 잰다.
 * 거리는 x·y 평면에서만 잰다 (z는 MediaPipe 추정값이라 신뢰도가 낮다).
 * @returns {number[]} 45개
 */
export function pairwiseDistances(lm) {
  const n = normalizeLandmarks(lm);
  const out = [];
  for (let a = 0; a < FEATURE_POINTS.length; a++) {
    for (let b = a + 1; b < FEATURE_POINTS.length; b++) { // 중복 없는 쌍만 (a<b)
      const pa = n[FEATURE_POINTS[a]];
      const pb = n[FEATURE_POINTS[b]];
      out.push(Math.hypot(pa.x - pb.x, pa.y - pb.y));
    }
  }
  return out;
}

/**
 * 고정 길이 90 특징 벡터 — 수집·인식이 공유하는 단일 진입점.
 * 손은 손목 x좌표로 왼→오 정렬한다 (handedness는 두 손이 겹치면 자주 틀려서 위치가 더 안정적).
 * 한 손만 잡힌 프레임은 뒤쪽 45자리가 0으로 남는다.
 * @param {Array<Array<{x:number,y:number,z:number}>>} hands 손별 21개 랜드마크
 * @returns {number[]} 항상 90개
 */
export function extractFeatures(hands) {
  const slots = [new Array(FEAT_PER_HAND).fill(0), new Array(FEAT_PER_HAND).fill(0)];
  if (hands?.length) {
    [...hands]
      .sort((a, b) => a[0].x - b[0].x)
      .slice(0, 2)
      .forEach((lm, i) => { slots[i] = pairwiseDistances(lm); });
  }
  return [...slots[0], ...slots[1]];
}

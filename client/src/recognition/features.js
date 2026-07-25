// 특징 추출 — 손목 기준 정규화 + 쌍거리 특징 (§4.4).
// 원시 좌표 대신 선택 랜드마크 쌍의 거리 행렬을 입력으로 써서 맞물림 구조를 인코딩.

/**
 * @param {Array<Array<{x:number,y:number,z:number}>>} handsLandmarks 손별 21개 랜드마크
 * @returns {number[]} 정규화된 특징 벡터 (룰 기반/MLP 공통 입력)
 */
export function extractFeatures(handsLandmarks) {
  // TODO:
  //   1) 각 손을 손목(idx 0) 기준으로 평행이동 → 위치 불변.
  //   2) 손 크기(예: 손목~중지 MCP 거리)로 나눠 스케일 불변.
  //   3) 선택된 랜드마크 쌍들의 유클리드 거리로 특징 벡터 구성.
  //   4) 두 손이면 상대 위치/거리도 포함 (맞물림 인장 구분에 필수).
  return [];
}

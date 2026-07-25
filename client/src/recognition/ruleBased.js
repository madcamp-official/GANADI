// 6종 룰 기반 판별 — Day 2~3 게임용 임시 인식기. 쉬운 실루엣 6종만 다룬다.
// recognizer.js가 Day 5에 MLP로 교체해도 폴백 플래그로 이 파일은 살려둔다 (§4.6).

/**
 * @param {number[]} feat extractFeatures 출력
 * @returns {{ sealId: string|null, confidence: number, runnerUp: number }}
 */
export function classifyRuleBased(feat) {
  // TODO: EASY_SEAL_IDS(개/원숭이/호랑이/말/쥐/토끼)에 대한 손가락 각도·돌출 규칙.
  //   각 인장에 점수를 매겨 1등/2등 반환 (runnerUp 마진 판정에 사용).
  return { sealId: null, confidence: 0, runnerUp: 0 };
}

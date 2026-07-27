// 최근접 센트로이드 판별 — Day 2~4 게임용 인식기.
//
// Day 1에 if문 룰 기반을 폐기하고 이 방식으로 갈아탔다. 수집 데이터로 인장별 평균
// 특징벡터(센트로이드)를 만들어두고, 지금 손이 어느 센트로이드에 가장 가까운지 잰다.
//
// 임계값 두 개로 "모르겠으면 아무 말도 안 한다"를 만든다:
//   ① ACCEPT_THRESHOLD — 1등까지도 너무 멀면 인장이 아니다 (아무 손동작이나 통과 방지)
//   ② MARGIN           — 1등과 2등이 붙어 있으면 애매한 것이다 (런너업 마진, §4.2)
//
// 한계(§4.1): 한 인장 안에서 손 검출 개수가 갈리면(1손/2손 혼재) 평균이 어느 무리에도
// 속하지 않는 점이 되어 무너진다. 실제로 tiger가 그렇다 — MLP로 가면 해결된다 (Day 4).
// recognizer.js가 Day 5에 MLP로 교체돼도 폴백 플래그로 이 파일은 살려둔다 (§4.6).

import { CENTROIDS } from './centroids.js';
import { RECOGNITION } from '../config.js';

function euclid(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * @param {number[]} feat extractFeatures 출력 (90)
 * @returns {{ sealId: string|null, confidence: number,
 *             best: {id: string, d: number}|null, second: {id: string, d: number}|null,
 *             reason: 'ok'|'too-far'|'ambiguous'|'no-input' }}
 *   best/second/reason은 임계값 튜닝용 진단 정보 (게임 로직은 sealId만 본다).
 */
export function classifyCentroid(feat) {
  const none = (reason, best = null, second = null) =>
    ({ sealId: null, confidence: 0, best, second, reason });

  if (!feat?.length) return none('no-input');

  const { ACCEPT_THRESHOLD, MARGIN } = RECOGNITION;

  let best = null;
  let second = null;
  for (const id in CENTROIDS) {
    const d = euclid(feat, CENTROIDS[id]);
    if (!best || d < best.d) { second = best; best = { id, d }; }
    else if (!second || d < second.d) { second = { id, d }; }
  }
  if (!best) return none('no-input');

  if (best.d > ACCEPT_THRESHOLD) return none('too-far', best, second);          // ① 너무 멂
  if (second && (second.d - best.d) < MARGIN) return none('ambiguous', best, second); // ② 애매함

  // 가까울수록 1에 가깝게. 임계값에 걸치면 0.
  const confidence = Math.max(0, Math.min(1, 1 - best.d / ACCEPT_THRESHOLD));
  return { sealId: best.id, confidence, best, second, reason: 'ok' };
}

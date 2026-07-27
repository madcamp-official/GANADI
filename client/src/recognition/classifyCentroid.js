// 최근접 센트로이드 판별 — Day 2~4 게임용 인식기.
//
// Day 1에 if문 룰 기반을 폐기하고 이 방식으로 갈아탔다. 수집 데이터로 인장별 평균
// 특징벡터(센트로이드)를 만들어두고, 지금 손이 어느 센트로이드에 가장 가까운지 잰다.
//
// 임계값 두 개로 "모르겠으면 아무 말도 안 한다"를 만든다:
//   ① ACCEPT_THRESHOLD — 1등까지도 너무 멀면 인장이 아니다 (아무 손동작이나 통과 방지)
//   ② MARGIN           — 1등과 2등이 붙어 있으면 애매한 것이다 (런너업 마진, §4.2)
//
// ★ 클러스터는 (인장 × 손 개수)로 나뉘어 있다 — 키가 "tiger__2h" 같은 형태다.
//   한 인장 안에서 1손/2손이 섞이면 그 평균은 어느 무리에도 속하지 않는 허공의 점이 되어
//   인식이 무너진다(호랑이가 실제로 그랬다). 손 개수별로 대표를 따로 두면 그 문제가 사라지고,
//   실전에서 MediaPipe가 프레임마다 1손/2손을 오갈 때도 양쪽 다 커버된다.
//   → 같은 인장의 다른 클러스터는 "경쟁자"가 아니므로 런너업 마진 계산에서 제외한다.
//
// recognizer.js가 Day 5에 MLP로 교체돼도 폴백 플래그로 이 파일은 살려둔다 (§4.6).

import { CENTROIDS, CENTROID_META } from './centroids.js';
import { RECOGNITION } from '../config.js';

/** 클러스터 키 → 인장 id. 메타가 없는 옛 형식(키=인장)도 그대로 동작한다 */
function sealIdOf(key) {
  return CENTROID_META?.[key]?.sealId ?? key.split('__')[0];
}

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

  // 클러스터가 20~30개뿐이라 전부 재고 정렬한다 (프레임당 비용 무시 가능, 대신 명백히 옳다).
  const scored = [];
  for (const key in CENTROIDS) {
    scored.push({ id: sealIdOf(key), key, d: euclid(feat, CENTROIDS[key]) });
  }
  if (!scored.length) return none('no-input');
  scored.sort((a, b) => a.d - b.d);

  // 1등은 전체 최근접, 2등은 "다른 인장" 중 최근접.
  // 같은 인장의 1손/2손 클러스터끼리 서로를 애매하게 만들면 안 되기 때문.
  const best = scored[0];
  const second = scored.find((c) => c.id !== best.id) ?? null;

  if (best.d > ACCEPT_THRESHOLD) return none('too-far', best, second);          // ① 너무 멂
  if (second && (second.d - best.d) < MARGIN) return none('ambiguous', best, second); // ② 애매함

  // 가까울수록 1에 가깝게. 임계값에 걸치면 0.
  const confidence = Math.max(0, Math.min(1, 1 - best.d / ACCEPT_THRESHOLD));
  return { sealId: best.id, confidence, best, second, reason: 'ok' };
}

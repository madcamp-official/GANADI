// 13종(인장 12 + none) 소형 MLP (TensorFlow.js). 특징 v2(182차원) 위에서 돈다.
//
// 산출물은 tools/trainMLP.mjs가 client/public/model/seal-mlp/ 에 굽는다:
//   model.json · weights.bin · labels.json
//
// ★ 센트로이드와 단위가 다르다. 센트로이드는 "거리"(작을수록 확실), 이쪽은 "확률"(클수록 확실).
//   임계값을 서로 옮겨 쓰면 조용히 틀린다 — config.js의 RECOGNITION(거리)과 MLP(확률)를 구분할 것.

import * as tf from '@tensorflow/tfjs';
import { MLP } from '../config.js';
import { FEAT_LENGTH_V2 } from './featuresV2.js';

// "인장 아님" 클래스. tools/lib/sessions.mjs의 NEGATIVE_ID와 같은 값이어야 한다
// (클라가 tools/를 import할 수 없어 여기 둔다 — 한쪽만 바꾸면 거부가 통째로 죽는다).
const NEGATIVE_ID = 'none';

let model = null;
let LABELS = [];

/**
 * 모델·라벨을 받아 예열까지 끝낸다. createRecognizer()가 await 한다.
 * ★ 첫 프레임이 모델보다 먼저 오면 전부 not-loaded로 흘러가므로 반드시 await 할 것.
 */
export async function loadMLP(base = '/model/seal-mlp') {
  const [m, meta] = await Promise.all([
    tf.loadLayersModel(`${base}/model.json`),
    fetch(`${base}/labels.json`).then((r) => r.json()),
  ]);

  // 학습 때의 특징 버전과 어긋나면 에러 없이 오답만 낸다 — 차원이 같아도 의미가 다르면 조용히 틀린다.
  if (meta.inputDim !== FEAT_LENGTH_V2) {
    throw new Error(`모델 입력 차원(${meta.inputDim})이 featuresV2(${FEAT_LENGTH_V2})와 다르다. 재학습 필요.`);
  }

  model = m;
  LABELS = meta.labels;

  // 첫 추론은 커널 컴파일 때문에 수백 ms 느리다 — 여기서 한 번 태워 없앤다
  tf.tidy(() => model.predict(tf.zeros([1, FEAT_LENGTH_V2])).dataSync());

  console.info(`[mlp] 로드 완료 — ${LABELS.length}종 · 특징 ${meta.featureVersion} · 학습 ${meta.sessions?.length ?? '?'}세션`);
  return model;
}

export function isMLPLoaded() {
  return model !== null;
}

/**
 * @param {number[]} feat extractFeaturesV2 출력 (182)
 * @returns {{ sealId: string|null, confidence: number, runnerUp: number, reason: string }}
 */
export function classifyMLP(feat) {
  if (!model) return { sealId: null, confidence: 0, runnerUp: 0, reason: 'not-loaded' };

  const probs = tf.tidy(() => Array.from(model.predict(tf.tensor2d([feat])).dataSync()));
  const ranked = probs
    .map((p, i) => ({ id: LABELS[i], p }))
    .sort((a, b) => b.p - a.p);
  const [best, second] = ranked;

  // ⚠️ 아래 세 거부는 "확신 없는 오답"만 잡는다. 측정된 오탐(none → 인장)은 확신도 1.00으로
  //    들어와서 임계값을 어떻게 잡아도 안 걸린다 (ACCEPT×MARGIN 24조합 전부 동일). 그건
  //    none 샘플 다양성으로만 해결된다 — 임계값을 조여 고치려 들면 정상 인장만 죽는다.
  if (best.id === NEGATIVE_ID) return { sealId: null, confidence: 0, runnerUp: second.p, reason: 'negative' };
  if (best.p < MLP.ACCEPT) return { sealId: null, confidence: best.p, runnerUp: second.p, reason: 'low-conf' };
  if (best.p - second.p < MLP.MARGIN) return { sealId: null, confidence: best.p, runnerUp: second.p, reason: 'ambiguous' };

  return { sealId: best.id, confidence: best.p, runnerUp: second.p, reason: 'ok' };
}

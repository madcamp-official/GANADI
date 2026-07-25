// 12종 소형 MLP (TensorFlow.js). Day 4에 수집 데이터로 학습, Day 5에 recognizer.js에 통합.
// 학습 → 혼동행렬 → 약한 인장 표적 추가 수집 → 재학습 사이클 (§4.3, §4.4).

import * as tf from '@tensorflow/tfjs';

let model = null;

export async function loadMLP(url = '/model/seal-mlp/model.json') {
  model = await tf.loadLayersModel(url);
  return model;
}

/**
 * @param {number[]} feat extractFeatures 출력
 * @returns {{ sealId: string|null, confidence: number, runnerUp: number }}
 */
export function classifyMLP(feat) {
  // TODO: tf.tidy로 feat → softmax 확률. 상위 2개로 sealId/confidence/runnerUp 반환.
  return { sealId: null, confidence: 0, runnerUp: 0 };
}

// --- 학습 유틸 (개발용, 게임 런타임엔 미포함 가능) ---
export function buildModel(inputDim, numClasses) {
  const m = tf.sequential();
  m.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [inputDim] }));
  m.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  m.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));
  m.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return m;
}

// mlpEval.mjs — 센트로이드 대신 소형 MLP를 썼을 때 성적이 얼마나 달라지는지 재는 실험 도구.
//
// ★ 핵심은 "교차 세션 평가"다. 같은 날 데이터로 학습하고 같은 날 데이터로 채점하면
//   무조건 잘 나온다. 다른 날 손을 얼마나 맞추는지가 진짜 실력이고, 그게 게임에서의 성능이다.
//   센트로이드의 같은 조건 성적: 1차 학습 → 2차 평가 = 33.8%
//
// 사용법:
//   node tools/mlpEval.mjs              # 교차 세션 평가 (1차↔2차)
//   node tools/mlpEval.mjs --epochs=200
//
// 'none'(인장 아님)도 하나의 클래스로 학습한다 — MLP는 "인장이 아님"을 임계값이 아니라
// 배운 클래스로 판단할 수 있다. 센트로이드에는 없는 장점.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as tf from '@tensorflow/tfjs';
import { extractFeatures } from '../client/src/recognition/features.js';

const args = process.argv.slice(2);
const EPOCHS = Number(args.find((a) => a.startsWith('--epochs='))?.split('=')[1] ?? 120);

// --- 세션별로 따로 읽는다 (교차 평가를 하려면 섞으면 안 된다) ---
function sessionsIn(dir) {
  return readdirSync(dir)
    .map((f) => join(dir, f))
    .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'data.json')))
    .sort();
}
const dirs = sessionsIn('data');
if (dirs.length < 2) {
  console.error('교차 평가에는 세션이 2개 이상 필요하다. 찾은 세션:', dirs);
  process.exit(1);
}
const sets = dirs.map((d) => ({ name: d, rows: JSON.parse(readFileSync(join(d, 'data.json'), 'utf8')) }));
const LABELS = [...new Set(sets.flatMap((s) => s.rows.map((r) => r.label)))].sort();

const toXY = (rows) => ({
  x: rows.map((r) => extractFeatures(r.landmarks)),
  y: rows.map((r) => LABELS.indexOf(r.label)),
});

function build(inputDim, nClasses) {
  const m = tf.sequential();
  m.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [inputDim] }));
  m.add(tf.layers.dropout({ rate: 0.2 }));
  m.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  m.add(tf.layers.dense({ units: nClasses, activation: 'softmax' }));
  m.compile({ optimizer: tf.train.adam(0.005), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return m;
}

async function run(trainRows, testRows, tag) {
  const tr = toXY(trainRows);
  const te = toXY(testRows);
  const xs = tf.tensor2d(tr.x);
  const ys = tf.oneHot(tf.tensor1d(tr.y, 'int32'), LABELS.length);

  const model = build(tr.x[0].length, LABELS.length);
  await model.fit(xs, ys, { epochs: EPOCHS, batchSize: 32, shuffle: true, verbose: 0 });

  const pred = model.predict(tf.tensor2d(te.x));
  const idx = await pred.argMax(1).array();
  const conf = await pred.max(1).array();

  let hit = 0;
  const per = {};
  te.y.forEach((t, i) => {
    const l = LABELS[t];
    (per[l] ??= { n: 0, h: 0, wrong: {} }).n += 1;
    if (idx[i] === t) { hit += 1; per[l].h += 1; }
    else per[l].wrong[LABELS[idx[i]]] = (per[l].wrong[LABELS[idx[i]]] ?? 0) + 1;
  });

  console.log(`\n===== ${tag} =====`);
  console.log(`전체 정확도: ${((hit / te.y.length) * 100).toFixed(1)}%  (${hit}/${te.y.length})`);
  console.log('라벨       정답률   주로 틀린 곳');
  for (const l of LABELS) {
    if (!per[l]) continue;
    const w = Object.entries(per[l].wrong).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([k, v]) => `${k}×${v}`).join(', ');
    const flag = per[l].h / per[l].n < 0.9 ? ' ←' : '';
    console.log(`${l.padEnd(9)} ${((per[l].h / per[l].n) * 100).toFixed(0).padStart(4)}%   ${(w || '—').padEnd(20)}${flag}`);
  }
  console.log(`평균 확신도: ${(conf.reduce((a, b) => a + b, 0) / conf.length).toFixed(2)}`);

  tf.dispose([xs, ys, pred]);
  model.dispose();
  return hit / te.y.length;
}

console.log(`세션 ${sets.length}개 · 클래스 ${LABELS.length}종`);
for (const s of sets) console.log(`  - ${s.name} (${s.rows.length}장)`);

const a = await run(sets[0].rows, sets[1].rows, `${sets[0].name} 학습 → ${sets[1].name} 평가`);
const b = await run(sets[1].rows, sets[0].rows, `${sets[1].name} 학습 → ${sets[0].name} 평가`);
console.log(`\n교차 평가 평균: ${(((a + b) / 2) * 100).toFixed(1)}%`);
console.log('(센트로이드의 1차→2차 성적은 33.8%였다. 이 숫자와 비교할 것)');

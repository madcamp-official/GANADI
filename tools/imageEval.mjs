// imageEval.mjs — "손 크롭 이미지"로 학습했을 때 성적을 재는 실험 도구.
//
// 비교 대상 (전부 같은 교차 세션 조건: 한 세션으로 학습 → 다른 세션으로 평가):
//   센트로이드(랜드마크)  33.8%
//   MLP(랜드마크)         65.9%
//   여기서 재는 것: 픽셀 MLP / 작은 CNN
//
// 랜드마크는 MediaPipe가 손을 놓치면 45차원이 0으로 사라지지만(정보 소실),
// 픽셀에는 겹친 손이 그대로 남아 있다. 그 차이가 숫자로 나오는지 보는 것이 목적.
//
// 사용법: node tools/imageEval.mjs [--size=32] [--epochs=30] [--cnn]

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as tf from '@tensorflow/tfjs';
import { cropToGray } from './lib/handCrop.mjs';

const args = process.argv.slice(2);
const num = (k, d) => Number(args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const SIZE = num('size', 32);
const EPOCHS = num('epochs', 30);
const WITH_CNN = args.includes('--cnn');

// --- 세션 로드 + 크롭 (세션을 섞지 않는다 — 교차 평가를 해야 하므로) ---
const dirs = readdirSync('data').map((f) => join('data', f))
  .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'data.json'))).sort();
if (dirs.length < 2) { console.error('세션이 2개 이상 필요하다.'); process.exit(1); }

const LABELS = [...new Set(dirs.flatMap((d) =>
  JSON.parse(readFileSync(join(d, 'data.json'), 'utf8')).map((r) => r.label)))].sort();

function loadSession(dir) {
  const rows = JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8'));
  const x = [], y = [];
  let skipped = 0;
  rows.forEach((r, i) => {
    // collector.js가 images/${label}_${index}.jpg 로 저장한다
    const path = join(dir, 'images', `${r.label}_${String(i).padStart(5, '0')}.jpg`);
    if (!existsSync(path)) { skipped += 1; return; }
    const g = cropToGray(path, r.landmarks, SIZE);
    if (!g) { skipped += 1; return; }
    x.push(Array.from(g));
    y.push(LABELS.indexOf(r.label));
  });
  if (skipped) console.log(`  ⚠ ${dir}: ${skipped}장 건너뜀`);
  return { x, y, name: dir };
}

console.log(`크롭 ${SIZE}x${SIZE} 회색조 · 클래스 ${LABELS.length}종 · epochs ${EPOCHS}`);
const sets = dirs.map((d) => { const s = loadSession(d); console.log(`  - ${d}: ${s.x.length}장`); return s; });

// --- 모델 두 가지 ---
function densePixels() {
  const m = tf.sequential();
  m.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: [SIZE * SIZE] }));
  m.add(tf.layers.dropout({ rate: 0.3 }));
  m.add(tf.layers.dense({ units: 64, activation: 'relu' }));
  m.add(tf.layers.dense({ units: LABELS.length, activation: 'softmax' }));
  m.compile({ optimizer: tf.train.adam(0.002), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return m;
}
function smallCNN() {
  const m = tf.sequential();
  m.add(tf.layers.reshape({ targetShape: [SIZE, SIZE, 1], inputShape: [SIZE * SIZE] }));
  m.add(tf.layers.conv2d({ filters: 8, kernelSize: 3, activation: 'relu' }));
  m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  m.add(tf.layers.conv2d({ filters: 16, kernelSize: 3, activation: 'relu' }));
  m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  m.add(tf.layers.flatten());
  m.add(tf.layers.dropout({ rate: 0.3 }));
  m.add(tf.layers.dense({ units: 64, activation: 'relu' }));
  m.add(tf.layers.dense({ units: LABELS.length, activation: 'softmax' }));
  m.compile({ optimizer: tf.train.adam(0.002), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return m;
}

async function run(train, test, makeModel, tag) {
  const xs = tf.tensor2d(train.x);
  const ys = tf.oneHot(tf.tensor1d(train.y, 'int32'), LABELS.length);
  const model = makeModel();
  const t0 = Date.now();
  await model.fit(xs, ys, { epochs: EPOCHS, batchSize: 32, shuffle: true, verbose: 0 });

  const pred = model.predict(tf.tensor2d(test.x));
  const idx = await pred.argMax(1).array();

  let hit = 0; const per = {};
  test.y.forEach((t, i) => {
    const l = LABELS[t];
    (per[l] ??= { n: 0, h: 0, wrong: {} }).n += 1;
    if (idx[i] === t) { hit += 1; per[l].h += 1; }
    else per[l].wrong[LABELS[idx[i]]] = (per[l].wrong[LABELS[idx[i]]] ?? 0) + 1;
  });

  console.log(`\n===== ${tag} =====  (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
  console.log(`전체 정확도: ${((hit / test.y.length) * 100).toFixed(1)}%  (${hit}/${test.y.length})`);
  console.log('라벨       정답률   주로 틀린 곳');
  for (const l of LABELS) {
    if (!per[l]) continue;
    const w = Object.entries(per[l].wrong).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([k, v]) => `${k}×${v}`).join(', ');
    const flag = per[l].h / per[l].n < 0.9 ? ' ←' : '';
    console.log(`${l.padEnd(9)} ${((per[l].h / per[l].n) * 100).toFixed(0).padStart(4)}%   ${(w || '—').padEnd(20)}${flag}`);
  }
  tf.dispose([xs, ys, pred]); model.dispose();
  return hit / test.y.length;
}

const [A, B] = sets;
const d1 = await run(A, B, densePixels, `픽셀 MLP · ${A.name} → ${B.name}`);
const d2 = await run(B, A, densePixels, `픽셀 MLP · ${B.name} → ${A.name}`);
console.log(`\n▶ 픽셀 MLP 교차 평균: ${(((d1 + d2) / 2) * 100).toFixed(1)}%`);

if (WITH_CNN) {
  const c1 = await run(A, B, smallCNN, `CNN · ${A.name} → ${B.name}`);
  const c2 = await run(B, A, smallCNN, `CNN · ${B.name} → ${A.name}`);
  console.log(`\n▶ CNN 교차 평균: ${(((c1 + c2) / 2) * 100).toFixed(1)}%`);
}

console.log('\n비교: 센트로이드(랜드마크) 33.8% · MLP(랜드마크) 65.9%');

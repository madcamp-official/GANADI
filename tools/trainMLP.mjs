// trainMLP.mjs — 증강 데이터로 MLP를 학습해 client/public/model/seal-mlp/ 에 저장.
//
// 사용법:
//   node tools/trainMLP.mjs --holdout=seals_2026-07-28_390f_390img   # 성적 확인 (시험지 = 제3자 세션)
//   node tools/trainMLP.mjs --holdout=... --seed=2                   # 시드 바꿔 재실행 (σ≈3~4%p라 3회는 봐야 한다)
//   node tools/trainMLP.mjs --no-save                                # 채점만, 모델 안 덮어씀
//   node tools/trainMLP.mjs                                          # 전 세션 학습 (배포용)
//
// ★ 배포용 모델은 홀드아웃 없이 전 세션으로 학습한다. 다만 그때의 성적은 알 수 없으므로
//   반드시 --holdout 으로 먼저 성적을 확인하고 나서 전체 학습을 돌릴 것.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as tf from '@tensorflow/tfjs';
import { extractFeaturesV2, FEAT_LENGTH_V2 } from '../client/src/recognition/featuresV2.js';
import { NEGATIVE_ID } from './lib/sessions.mjs';
import { makeRng, augment } from './lib/augment.mjs';

const args = process.argv.slice(2);
const num = (k, d) => Number(args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const str = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? null;
const MULT = num('mult', 5);
const EPOCHS = num('epochs', 200);
const SEED = num('seed', 20260728);
const HOLDOUT = str('holdout');
const NO_SAVE = args.includes('--no-save');
const OUT_DIR = 'client/public/model/seal-mlp';

// --- 세션 로드 (교차 평가를 하려면 세션 경계를 유지해야 한다) ---
const sets = readdirSync('data').map((f) => join('data', f))
  .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'data.json')))
  .sort()
  .map((d) => ({ name: d.split(/[\\/]/).pop(), rows: JSON.parse(readFileSync(join(d, 'data.json'), 'utf8')) }));

const trainSets = HOLDOUT ? sets.filter((s) => s.name !== HOLDOUT) : sets;
const testSets = HOLDOUT ? sets.filter((s) => s.name === HOLDOUT) : [];
if (HOLDOUT && !testSets.length) {
  console.error(`홀드아웃 세션을 못 찾았다: ${HOLDOUT}\n있는 세션: ${sets.map((s) => s.name).join(', ')}`);
  process.exit(1);
}

// ★ 라벨 순서는 모델 출력 인덱스 그 자체다. 홀드아웃 여부와 무관하게 전 세션 기준으로 고정한다 —
//   학습 세션에만 있는 라벨로 순서를 잡으면 배포 모델과 인덱스가 어긋난다.
const LABELS = [...new Set(sets.flatMap((s) => s.rows.map((r) => r.label)))].sort();

const rng = makeRng(SEED);

function toDataset(rows, mult) {
  const xs = [], ys = [];
  const push = (hands, label) => {
    const f = extractFeaturesV2(hands);
    if (f.length !== FEAT_LENGTH_V2) return;
    xs.push(f); ys.push(LABELS.indexOf(label));
  };
  for (const r of rows) push(r.landmarks, r.label);                     // 원본
  for (let k = 0; k < mult; k++)                                        // 증강본
    for (const r of rows) push(augment(r.landmarks, rng), r.label);
  return { xs, ys };
}

function build(nClasses) {
  const m = tf.sequential();
  m.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [FEAT_LENGTH_V2] }));
  m.add(tf.layers.dropout({ rate: 0.2 }));
  m.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  m.add(tf.layers.dense({ units: nClasses, activation: 'softmax' }));
  m.compile({ optimizer: tf.train.adam(0.005), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return m;
}

const train = toDataset(trainSets.flatMap((s) => s.rows), MULT);
console.log(`학습 세션: ${trainSets.map((s) => s.name).join(', ')}`);
if (HOLDOUT) console.log(`시험지  : ${HOLDOUT} (증강 없음)`);
console.log(`샘플 ${train.xs.length}장 (원본 ${train.xs.length / (MULT + 1)} × ${MULT + 1}) · 클래스 ${LABELS.length}종 · seed ${SEED}`);

const xs = tf.tensor2d(train.xs);
const ys = tf.oneHot(tf.tensor1d(train.ys, 'int32'), LABELS.length);
const model = build(LABELS.length);
await model.fit(xs, ys, {
  epochs: EPOCHS, batchSize: 32, shuffle: true, verbose: 0,
  callbacks: { onEpochEnd: (e, logs) => { if ((e + 1) % 40 === 0) console.log(`  epoch ${e + 1}/${EPOCHS}  loss ${logs.loss.toFixed(4)}  acc ${logs.acc.toFixed(3)}`); } },
});

// --- 홀드아웃 채점 ---
if (testSets.length) {
  const test = toDataset(testSets.flatMap((s) => s.rows), 0); // ★ 시험지는 절대 증강하지 않는다
  const probs = await model.predict(tf.tensor2d(test.xs)).array();
  const negIdx = LABELS.indexOf(NEGATIVE_ID);

  const ranked = probs.map((p) => {
    const order = p.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
    return { top: order[0].i, p1: order[0].v, p2: order[1].v };
  });

  const per = {};
  let hit = 0;
  test.ys.forEach((t, i) => {
    const l = LABELS[t];
    (per[l] ??= { n: 0, h: 0, wrong: {}, conf: 0 }).n += 1;
    per[l].conf += ranked[i].p1;
    if (ranked[i].top === t) { hit += 1; per[l].h += 1; }
    else per[l].wrong[LABELS[ranked[i].top]] = (per[l].wrong[LABELS[ranked[i].top]] ?? 0) + 1;
  });

  console.log(`\n===== 홀드아웃: ${HOLDOUT} =====`);
  console.log(`전체 정확도: ${((hit / test.ys.length) * 100).toFixed(1)}%  (${hit}/${test.ys.length})`);
  console.log('라벨       정답률  평균확신도  주로 틀린 곳');
  for (const l of LABELS) {
    if (!per[l]) continue;
    const w = Object.entries(per[l].wrong).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k}×${v}`).join(', ');
    const flag = per[l].h / per[l].n < 0.9 ? ' ←' : '';
    console.log(`${l.padEnd(9)} ${((per[l].h / per[l].n) * 100).toFixed(0).padStart(5)}%  ${(per[l].conf / per[l].n).toFixed(2).padStart(9)}  ${(w || '—').padEnd(20)}${flag}`);
  }

  // --- ACCEPT/MARGIN 스윕: 오탐률 0%를 유지하는 가장 낮은 ACCEPT를 고른다 ---
  // 인장 정답률 = 인장 샘플을 (거부당하지 않고) 맞힌 비율
  // 오탐률     = none 샘플이 인장으로 통과한 비율  ← 게임에서 제일 짜증나는 실패
  if (negIdx >= 0) {
    console.log('\nACCEPT  MARGIN  인장 정답률  오탐률(none→인장)');
    for (const accept of [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]) {
      for (const margin of [0.2, 0.4, 0.6, 0.8]) {
        let sealN = 0, sealHit = 0, negN = 0, negFalse = 0;
        test.ys.forEach((t, i) => {
          const { top, p1, p2 } = ranked[i];
          const pass = top !== negIdx && p1 >= accept && p1 - p2 >= margin;
          if (t === negIdx) { negN += 1; if (pass) negFalse += 1; }
          else { sealN += 1; if (pass && top === t) sealHit += 1; }
        });
        console.log(`${accept.toFixed(2).padStart(6)}${margin.toFixed(2).padStart(8)}${((sealHit / sealN) * 100).toFixed(0).padStart(11)}%${((negFalse / (negN || 1)) * 100).toFixed(0).padStart(15)}%`);
      }
    }
  } else {
    console.log(`\n⚠️ 시험지에 '${NEGATIVE_ID}' 샘플이 없어 오탐률을 못 잰다.`);
  }
}

// --- 저장 ---
// ★ model.save('file://...') 는 tfjs-node 전용이라 여기선 안 된다.
//   withSaveHandler로 아티팩트를 받아 브라우저가 읽는 형식으로 직접 쓴다.
if (NO_SAVE) {
  console.log('\n(--no-save: 모델을 쓰지 않았다)');
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  const art = await model.save(tf.io.withSaveHandler(async (a) => a));
  writeFileSync(`${OUT_DIR}/weights.bin`, Buffer.from(art.weightData));
  writeFileSync(`${OUT_DIR}/model.json`, JSON.stringify({
    modelTopology: art.modelTopology,
    format: art.format,
    generatedBy: art.generatedBy,
    convertedBy: null,
    weightsManifest: [{ paths: ['weights.bin'], weights: art.weightSpecs }],
  }));
  writeFileSync(`${OUT_DIR}/labels.json`, JSON.stringify({
    labels: LABELS,
    trainedAt: new Date().toISOString(),
    sessions: trainSets.map((s) => s.name),
    holdout: HOLDOUT,
    mult: MULT, epochs: EPOCHS, seed: SEED,
    featureVersion: 'v2', inputDim: FEAT_LENGTH_V2, // ★ 어느 특징으로 학습했는지 반드시 남긴다
  }, null, 2));
  console.log(`\n✅ ${OUT_DIR}/ 에 저장 (model.json · weights.bin · labels.json)`);
}

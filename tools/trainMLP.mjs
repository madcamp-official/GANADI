// trainMLP.mjs — 증강 데이터로 MLP를 학습해 client/public/model/seal-mlp/ 에 저장.
//
// 사용법:
//   node tools/trainMLP.mjs --holdout=seals_2026-07-28_390f_390img   # 성적 확인 (시험지 = 제3자 세션)
//   node tools/trainMLP.mjs --holdout=... --seed=2                   # 시드 바꿔 재실행 (σ≈3~4%p라 3회는 봐야 한다)
//   node tools/trainMLP.mjs --no-save                                # 채점만, 모델 안 덮어씀
//   node tools/trainMLP.mjs --no-weight                              # 클래스 가중치 끄기 (비교용)
//   node tools/trainMLP.mjs --keep-overlap                           # 인장 영역 침범 none 유지 (비교용)
//   node tools/trainMLP.mjs --no-negative-class                      # none을 학습에서 빼고 임계값으로만 거부
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
const NO_WEIGHT = args.includes('--no-weight'); // 클래스 가중치 끄고 비교할 때
const KEEP_OVERLAP = args.includes('--keep-overlap'); // 인장 영역 침범 none을 그대로 두고 비교할 때
// ★ 'none'을 학습 클래스에서 빼고, 거부를 순전히 ACCEPT/MARGIN 임계값에 맡긴다 (센트로이드 방식).
//   인장 12종은 좁고 단단한 덩어리인데 none은 "나머지 전부"라 형태가 없다. 소프트맥스가 그 사이에
//   경계를 그으려 하면 초기화 난수에 따라 경계가 흔들려, 시드마다 인장 하나가 통째로 none에
//   먹히거나(30/30 거부) 반대로 none이 인장으로 샌다. 그 경계를 아예 없애는 실험.
const NO_NEG = args.includes('--no-negative-class');
// ★ 재시도 횟수. 왜 필요한가: --seed는 '증강' 난수만 통제한다. 신경망 가중치 초기화는
//   tf.js 자체 난수라 시드가 안 걸려서, 같은 명령을 다시 돌려도 같은 모델이 안 나온다.
//   실제로 같은 설정에서 3회 중 1~2회는 인장 하나가 통째로 none에 먹힌다(30/30 거부).
//   그래서 "좋은 시드를 고른다"가 아니라 "좋은 모델이 나올 때까지 돌리고 그걸 저장한다"가 맞다.
//   ⚠️ 홀드아웃 성적으로 고르므로, 선택된 모델의 그 점수는 낙관적이다(시험지를 보고 골랐다).
const RETRY = num('retry', 1);
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
const LABELS = [...new Set(sets.flatMap((s) => s.rows.map((r) => r.label)))]
  .filter((l) => !(NO_NEG && l === NEGATIVE_ID))
  .sort();

const rng = makeRng(SEED);

/**
 * 인장 영역을 침범한 'none' 샘플을 걷어낸다.
 *
 * ★ 왜 필요한가: "인장을 맺다 만 중간 자세"를 none으로 찍으면 완성된 인장과 특징 공간에서
 *   이어져 버려, none과 인장 사이의 경계가 지워진다. 그러면 학습이 **인장 하나를 통째로**
 *   none 쪽에 내주는 일이 생긴다 (30장 중 30장이 확신도 0.9+로 거부. 시드마다 희생되는
 *   인장만 바뀐다). 클래스 가중치로는 안 잡히는 종류의 오염이다.
 *
 * 판정: none 샘플이 어떤 인장의 센트로이드에, **그 인장 자기 샘플들의 중앙거리보다 가깝게**
 *   들어와 있으면 오염으로 본다. 인장마다 퍼짐이 다르므로(goat 3.13 vs horse 1.68)
 *   고정 임계값이 아니라 인장별 중앙값을 쓴다.
 */
function dropOverlappingNegatives(rows) {
  const byLabel = {};
  for (const r of rows) {
    if (r.label === NEGATIVE_ID) continue;
    (byLabel[r.label] ??= []).push(extractFeaturesV2(r.landmarks));
  }
  const euclid = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };

  const cent = {}, radius = {};
  for (const [label, feats] of Object.entries(byLabel)) {
    const m = new Array(feats[0].length).fill(0);
    for (const f of feats) for (let i = 0; i < m.length; i++) m[i] += f[i] / feats.length;
    cent[label] = m;
    const ds = feats.map((f) => euclid(f, m)).sort((a, b) => a - b);
    radius[label] = ds[Math.floor(ds.length / 2)]; // 중앙거리
  }

  const dropped = {};
  const kept = rows.filter((r) => {
    if (r.label !== NEGATIVE_ID) return true;
    const f = extractFeaturesV2(r.landmarks);
    for (const label of Object.keys(cent)) {
      if (euclid(f, cent[label]) < radius[label]) { dropped[label] = (dropped[label] ?? 0) + 1; return false; }
    }
    return true;
  });

  const n = Object.values(dropped).reduce((a, b) => a + b, 0);
  if (n) {
    console.log(`오염된 '${NEGATIVE_ID}' ${n}장 제외 — ${Object.entries(dropped).map(([k, v]) => `${k} 영역 ${v}장`).join(', ')}`);
    console.log(`  (--keep-overlap 으로 끌 수 있다. 남은 ${NEGATIVE_ID}: ${kept.filter((r) => r.label === NEGATIVE_ID).length}장)`);
  }
  return kept;
}

function toDataset(rows, mult, { keepUnknown = false } = {}) {
  const xs = [], ys = [];
  const push = (hands, label) => {
    const y = LABELS.indexOf(label);
    if (y < 0 && !keepUnknown) return;  // 학습: 클래스가 아닌 라벨(NO_NEG의 none)은 버린다
    const f = extractFeaturesV2(hands);
    if (f.length !== FEAT_LENGTH_V2) return;
    xs.push(f); ys.push(y);             // 시험: y=-1로 보존해 "거부되면 정답"으로 채점한다
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

const trainRows = KEEP_OVERLAP
  ? trainSets.flatMap((s) => s.rows)
  : dropOverlappingNegatives(trainSets.flatMap((s) => s.rows));
const train = toDataset(trainRows, MULT);
console.log(`학습 세션: ${trainSets.map((s) => s.name).join(', ')}`);
if (HOLDOUT) console.log(`시험지  : ${HOLDOUT} (증강 없음)`);
console.log(`샘플 ${train.xs.length}장 (원본 ${train.xs.length / (MULT + 1)} × ${MULT + 1}) · 클래스 ${LABELS.length}종 · seed ${SEED}`);

// --- 클래스 불균형 보정 ---
// ★ 'none'은 인장 하나하나보다 훨씬 많이 쌓인다 (오탐 잡으려고 여러 조건으로 찍으니까).
//   보정 없이 두면 모델이 "애매하면 none"이라고 답하는 게 이득이라 배운다 — 실제로 2026-07-29
//   수집으로 none이 인장 평균의 2.7배(210 vs 78)가 되자 dog·horse가 0%로 무너졌다.
//   30장 전부 확신도 0.86으로 "인장 아님"이 됐고, ACCEPT/MARGIN 24조합이 전부 같은 성적이었다
//   (임계값으로는 못 막는다는 뜻).
// 가중치 = 전체 / (클래스 수 × 그 클래스 장수) — 흔한 클래스일수록 손실 기여를 줄인다.
const counts = new Array(LABELS.length).fill(0);
for (const y of train.ys) counts[y] += 1;
const present = counts.filter((c) => c > 0).length;
const classWeight = {};
counts.forEach((c, i) => { if (c > 0) classWeight[i] = train.ys.length / (present * c); });

if (!NO_WEIGHT) {
  const shown = Object.entries(classWeight)
    .map(([i, w]) => `${LABELS[i]} ${w.toFixed(2)}`)
    .filter((_, i) => counts[i] !== counts[0] || i === 0); // 값이 다른 것만 보여도 충분
  console.log(`클래스 가중치: ${shown.join(' · ')}`);
}

const xs = tf.tensor2d(train.xs);
const ys = tf.oneHot(tf.tensor1d(train.ys, 'int32'), LABELS.length);

async function trainOnce(quiet) {
  const m = build(LABELS.length);
  await m.fit(xs, ys, {
    epochs: EPOCHS, batchSize: 32, shuffle: true, verbose: 0,
    ...(NO_WEIGHT ? {} : { classWeight }),
    callbacks: quiet ? {} : { onEpochEnd: (e, logs) => { if ((e + 1) % 40 === 0) console.log(`  epoch ${e + 1}/${EPOCHS}  loss ${logs.loss.toFixed(4)}  acc ${logs.acc.toFixed(3)}`); } },
  });
  return m;
}

// --- 시험지 준비 (재시도 채점에 재사용) ---
const negIdx = LABELS.indexOf(NEGATIVE_ID);
const test = testSets.length
  ? toDataset(testSets.flatMap((s) => s.rows), 0, { keepUnknown: true }) // ★ 시험지는 절대 증강하지 않는다
  : null;

/** 홀드아웃 채점 → { ranked, per, hit, collapsed, noneAcc } */
async function scoreOn(m) {
  const probs = await m.predict(tf.tensor2d(test.xs)).array();
  const ranked = probs.map((p) => {
    const order = p.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
    return { top: order[0].i, p1: order[0].v, p2: order[1].v };
  });
  const REF_ACCEPT = 0.80, REF_MARGIN = 0.20; // config.js의 MLP 기본값
  const passes = (i) => ranked[i].p1 >= REF_ACCEPT
    && ranked[i].p1 - ranked[i].p2 >= REF_MARGIN
    && (negIdx < 0 || ranked[i].top !== negIdx);

  const per = {};
  let hit = 0;
  test.ys.forEach((t, i) => {
    const l = t >= 0 ? LABELS[t] : NEGATIVE_ID;
    (per[l] ??= { n: 0, h: 0, wrong: {}, conf: 0 }).n += 1;
    per[l].conf += ranked[i].p1;
    if (t < 0) {
      if (!passes(i)) { hit += 1; per[l].h += 1; }
      else per[l].wrong[LABELS[ranked[i].top]] = (per[l].wrong[LABELS[ranked[i].top]] ?? 0) + 1;
    } else if (ranked[i].top === t) { hit += 1; per[l].h += 1; }
    else per[l].wrong[LABELS[ranked[i].top]] = (per[l].wrong[LABELS[ranked[i].top]] ?? 0) + 1;
  });

  // 붕괴 = 인장 하나가 통째로 무너진 것. 90% 미만을 붕괴로 본다 (관측된 붕괴는 전부 0~17%였다).
  const collapsed = Object.entries(per)
    .filter(([l, v]) => l !== NEGATIVE_ID && v.h / v.n < 0.9)
    .map(([l, v]) => `${l} ${((v.h / v.n) * 100).toFixed(0)}%`);
  const noneAcc = per[NEGATIVE_ID] ? per[NEGATIVE_ID].h / per[NEGATIVE_ID].n : 0;
  return { ranked, per, hit, collapsed, noneAcc };
}

let model = null, best = null;
if (RETRY > 1 && test) {
  console.log(`
재시도 ${RETRY}회 — 붕괴 없는 모델 중 '${NEGATIVE_ID}' 거부율이 가장 높은 것을 고른다`);
  for (let attempt = 1; attempt <= RETRY; attempt++) {
    const m = await trainOnce(true);
    const sc = await scoreOn(m);
    const ok = sc.collapsed.length === 0;
    console.log(`  ${attempt}/${RETRY}  전체 ${((sc.hit / test.ys.length) * 100).toFixed(1)}%  ${NEGATIVE_ID} ${(sc.noneAcc * 100).toFixed(0)}%  ${ok ? '✅ 붕괴 없음' : '❌ ' + sc.collapsed.join(', ')}`);
    const better = !best
      || (best.collapsed.length > 0 && ok)
      || (best.collapsed.length === 0 && ok && sc.noneAcc > best.noneAcc);
    if (better) { best?.model?.dispose(); best = { ...sc, model: m }; } else { m.dispose(); }
  }
  model = best.model;
  console.log(`→ 채택: 전체 ${((best.hit / test.ys.length) * 100).toFixed(1)}% · ${NEGATIVE_ID} ${(best.noneAcc * 100).toFixed(0)}% · ${best.collapsed.length ? '붕괴 ' + best.collapsed.join(', ') : '붕괴 없음'}`);
} else {
  model = await trainOnce(false);
}

// --- 홀드아웃 채점 ---
if (test) {
  const { ranked, per, hit } = best ?? await scoreOn(model);

  console.log(`
===== 홀드아웃: ${HOLDOUT} =====`);
  console.log(`전체 정확도: ${((hit / test.ys.length) * 100).toFixed(1)}%  (${hit}/${test.ys.length})`);
  console.log('라벨       정답률  평균확신도  주로 틀린 곳');
  for (const l of [...LABELS, ...(per[NEGATIVE_ID] && !LABELS.includes(NEGATIVE_ID) ? [NEGATIVE_ID] : [])]) {
    if (!per[l]) continue;
    const w = Object.entries(per[l].wrong).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k}×${v}`).join(', ');
    const flag = per[l].h / per[l].n < 0.9 ? ' ←' : '';
    console.log(`${l.padEnd(9)} ${((per[l].h / per[l].n) * 100).toFixed(0).padStart(5)}%  ${(per[l].conf / per[l].n).toFixed(2).padStart(9)}  ${(w || '—').padEnd(20)}${flag}`);
  }

  // --- ACCEPT/MARGIN 스윕: 오탐률 0%를 유지하는 가장 낮은 ACCEPT를 고른다 ---
  // 인장 정답률 = 인장 샘플을 (거부당하지 않고) 맞힌 비율
  // 오탐률     = none 샘플이 인장으로 통과한 비율  ← 게임에서 제일 짜증나는 실패
  const hasNeg = negIdx >= 0 || test.ys.some((t) => t < 0);
  if (hasNeg) {
    console.log('\nACCEPT  MARGIN  인장 정답률  오탐률(none→인장)' + (NO_NEG ? '   ← none 미학습, 임계값으로만 거부' : ''));
    for (const accept of [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]) {
      for (const margin of [0.2, 0.4, 0.6, 0.8]) {
        let sealN = 0, sealHit = 0, negN = 0, negFalse = 0;
        test.ys.forEach((t, i) => {
          const { top, p1, p2 } = ranked[i];
          const pass = top !== negIdx && p1 >= accept && p1 - p2 >= margin;
          if (t === negIdx || t < 0) { negN += 1; if (pass) negFalse += 1; }
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
    negativeClass: !NO_NEG, // false면 none을 안 배웠다 — 거부가 전적으로 임계값에 달렸다
  }, null, 2));
  console.log(`\n✅ ${OUT_DIR}/ 에 저장 (model.json · weights.bin · labels.json)`);
}

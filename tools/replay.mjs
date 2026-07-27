// replay.mjs — 수집한 데이터를 웹캠 없이 인식기에 흘려보내 정확도를 뽑는다.
//
// 수집 JSON에는 원시 landmarks가 그대로 들어 있어서(collector.js makeSample),
// 카메라·브라우저 없이 판별기를 그대로 돌릴 수 있다. Step 4 검증과 Day 4 혼동행렬이 이 통로로 돈다.
//
// 사용법:
//   node tools/replay.mjs                          # data/ 아래 모든 세션
//   node tools/replay.mjs data/seals_2026-07-27_*  # 특정 세션만
//   node tools/replay.mjs --accept=4 --margin=1    # 임계값 바꿔서
//   node tools/replay.mjs --sweep                  # 임계값 스윕 표
//
// ⚠️ 여기 나오는 숫자는 낙관적이다:
//   ① 센트로이드를 만든 바로 그 데이터로 채점하면 당연히 잘 나온다 (train셋 채점)
//   ② 수집 데이터엔 "인장 아님" 샘플이 없다 → 임계값을 올렸을 때의 오인식 위험은
//      여기서 안 보인다. 실제 손으로 아무 포즈나 취해봐야 알 수 있다.
// 이 도구는 게임이 실제로 쓰는 코드(client/src/recognition/)를 그대로 import한다.
// 임계값 기본값도 client/src/config.js에서 읽으므로, 게임을 튜닝하면 여기 숫자도 같이 움직인다.
// (config.js가 node에서 import되도록 import.meta.env에 `?.`를 쓴 이유가 이것)

import { extractFeatures as buildFeatures } from '../client/src/recognition/features.js';
import { CENTROIDS, CENTROID_META } from '../client/src/recognition/centroids.js';
import { RECOGNITION } from '../client/src/config.js';
import { loadSessions, NEGATIVE_ID } from './lib/sessions.mjs';

const sealIdOf = (key) => CENTROID_META?.[key]?.sealId ?? key.split('__')[0];

// --- 인자 파싱 ---
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : dflt;
};
// 기본값은 게임이 쓰는 config.js 그대로 (--accept/--margin으로 실험만 덮어씀)
const ACCEPT = opt('accept', RECOGNITION.ACCEPT_THRESHOLD);
const MARGIN = opt('margin', RECOGNITION.MARGIN);
const SWEEP = args.includes('--sweep');
const paths = args.filter((a) => !a.startsWith('--'));

// --- 데이터 로드 (makeCentroids와 같은 로더를 쓴다) ---
const { files, samples } = loadSessions(paths);
console.log(`세션 ${files.length}개 · 샘플 ${samples.length}장`);
for (const f of files) console.log(`  - ${f}`);

// --- 거리 한 번만 계산해두고 모든 진단을 여기서 파생 ---
const euclid = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };

// 1등은 전체 최근접, 2등은 "다른 인장" 중 최근접 (classifyCentroid.js와 같은 규칙).
// 같은 인장의 1손/2손 클러스터는 서로 경쟁자가 아니다.
const scored = samples.map((s) => {
  const feat = buildFeatures(s.landmarks);
  const ranked = Object.entries(CENTROIDS)
    .map(([key, c]) => ({ id: sealIdOf(key), key, d: euclid(feat, c) }))
    .sort((a, b) => a.d - b.d);
  const best = ranked[0];
  return {
    label: s.label, handCount: s.handCount, feat, saved: s.features,
    best, second: ranked.find((r) => r.id !== best?.id) ?? null,
  };
});

const predict = (r, accept = ACCEPT, margin = MARGIN) =>
  (r.best && r.best.d <= accept && (!r.second || (r.second.d - r.best.d) >= margin)) ? r.best.id : null;

// "인장 아님" 샘플은 정답이 null이다 (잡히면 오탐)
const isNegative = (label) => label === NEGATIVE_ID;
const correct = (r, pred) => (isNegative(r.label) ? pred === null : pred === r.label);

const labels = [...new Set(scored.map((r) => r.label))];
const pad = (v, n) => String(v).padStart(n);

// --- 임계값 스윕 모드 ---
if (SWEEP) {
  const negatives = scored.filter((r) => isNegative(r.label));
  console.log(`\nACCEPT  MARGIN   전체정확도   미검출   오인식${negatives.length ? '   오탐률' : ''}`);
  for (const a of [2.0, 2.5, 3.0, 3.5, 4.0, 5.0]) {
    let hit = 0, miss = 0, wrong = 0, falsePos = 0;
    for (const r of scored) {
      const p = predict(r, a, MARGIN);
      if (isNegative(r.label)) { if (p !== null) falsePos++; else hit++; continue; }
      if (p === r.label) hit++; else if (p === null) miss++; else wrong++;
    }
    const fp = negatives.length ? ` ${pad(((falsePos / negatives.length) * 100).toFixed(0) + '%', 8)}` : '';
    console.log(`${pad(a.toFixed(1), 6)} ${pad(MARGIN.toFixed(1), 7)} ${pad(((hit / scored.length) * 100).toFixed(1), 10)}% ${pad(miss, 8)} ${pad(wrong, 8)}${fp}`);
  }
  console.log(negatives.length
    ? `\n※ 오탐률 = "인장 아님" ${negatives.length}장 중 인장으로 잡힌 비율. 이게 낮게 유지되는 최대 ACCEPT를 고를 것.`
    : '\n※ 오인식 0이라고 안심하지 말 것 — 이 데이터엔 "인장 아님" 샘플이 없다. 수집 툴의 "✗ 인장 아님"으로 찍으면 오탐률이 여기 나온다.');
  process.exit(0);
}

// --- 인장별 성적 ---
const stat = Object.fromEntries(labels.map((l) => [l, { n: 0, hit: 0, miss: 0, wrong: 0, dSum: 0, gapSum: 0, hands: {}, second: {} }]));
for (const r of scored) {
  const st = stat[r.label];
  st.n++;
  st.dSum += r.best.d;
  if (r.second) st.gapSum += r.second.d - r.best.d;
  st.hands[r.handCount] = (st.hands[r.handCount] ?? 0) + 1;
  const p = predict(r);
  if (correct(r, p)) st.hit++;
  else if (p === null) {
    st.miss++;
    if (r.second && (r.second.d - r.best.d) < MARGIN) st.second[r.second.id] = (st.second[r.second.id] ?? 0) + 1;
  } else {
    st.wrong++; // 네거티브 라벨에선 "잡히면 안 되는데 잡힌" 오탐
    st.second[p] = (st.second[p] ?? 0) + 1;
  }
}

console.log(`\n(ACCEPT_THRESHOLD=${ACCEPT}, MARGIN=${MARGIN})\n`);
console.log('인장       정답률  미검출  오인식  평균거리  2등격차  1손/2손   가장 붙은 상대');
let hit = 0;
for (const l of labels) {
  const s = stat[l];
  hit += s.hit;
  const top = Object.entries(s.second).sort((a, b) => b[1] - a[1])[0];
  const flag = s.hit / s.n < 0.9 ? ' ←' : '';
  console.log(
    `${(isNegative(l) ? '✗인장아님' : l).padEnd(9)} ${pad(((s.hit / s.n) * 100).toFixed(0) + '%', 6)} ${pad(s.miss, 7)} ${pad(s.wrong, 7)} ` +
    `${pad((s.dSum / s.n).toFixed(2), 9)} ${pad((s.gapSum / s.n).toFixed(2), 8)} ` +
    `${pad(`${s.hands[1] ?? 0}/${s.hands[2] ?? 0}`, 8)}  ${(top ? `${top[0]}×${top[1]}` : '—').padEnd(12)}${flag}`
  );
}
console.log(`\n전체 정확도: ${((hit / scored.length) * 100).toFixed(1)}%  (${hit}/${scored.length})`);

// --- 오탐률: "인장 아님" 샘플이 인장으로 잡힌 비율 ---
const negs = scored.filter((r) => isNegative(r.label));
if (negs.length) {
  const fp = negs.filter((r) => predict(r) !== null);
  const bySeal = {};
  for (const r of fp) bySeal[predict(r)] = (bySeal[predict(r)] ?? 0) + 1;
  console.log(`\n오탐률: ${fp.length}/${negs.length} (${((fp.length / negs.length) * 100).toFixed(0)}%)` +
    (fp.length ? ` — ${Object.entries(bySeal).map(([k, v]) => `${k}×${v}`).join(', ')}` : ' ✅'));
  console.log('  아무 손동작이 인장으로 잡히는 비율. 높으면 ACCEPT를 낮추거나 MARGIN을 올릴 것.');
}

// --- 진단: 한 인장 안에서 손 개수가 섞였는데 클러스터가 안 나뉘어 있으면 경고 ---
const splitSeals = new Set(Object.values(CENTROID_META ?? {}).map((m) => m.sealId)
  .filter((id, _, arr) => arr.filter((x) => x === id).length > 1));
const mixed = labels.filter((l) => !isNegative(l)
  && (stat[l].hands[1] ?? 0) > 0 && (stat[l].hands[2] ?? 0) > 0 && !splitSeals.has(l));
if (mixed.length) {
  console.log(`\n⚠ 손 개수가 섞였는데 클러스터가 안 나뉜 인장: ${mixed.join(', ')}`);
  console.log('  특징 벡터는 없는 손 자리를 0으로 채운다 → 1손/2손 샘플은 90차원 중 45개가 통째로 다르다.');
  console.log('  → node tools/makeCentroids.mjs 를 다시 돌려 손 개수별 클러스터를 만들 것.');
}
if (splitSeals.size) {
  console.log(`\nℹ 손 개수별로 나뉜 인장: ${[...splitSeals].join(', ')} (1손/2손 어느 쪽으로 잡혀도 인식됨)`);
}

// --- 무결성: 수집 당시 저장된 features와 지금 계산값이 같아야 한다 ---
const drift = scored.filter((r) => !r.saved || r.feat.length !== r.saved.length
  || r.feat.some((v, i) => Math.abs(v - r.saved[i]) > 1e-9)).length;
console.log(`\n특징 재현성(수집 당시 저장값 대조): 불일치 ${drift}/${scored.length} ${drift === 0 ? '✅' : '❌ buildFeatures가 수집 이후 바뀌었다'}`);

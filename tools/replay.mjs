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
// ⚠️ --accept/--margin 기본값은 recognizer.js의 상수와 맞춰둔 것. 거기를 고치면 여기도 맞출 것.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildFeatures } from '../hand-test/js/features.js';
import { CENTROIDS } from '../hand-test/js/centroids.js';

// --- 인자 파싱 ---
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : dflt;
};
const ACCEPT = opt('accept', 2.5); // 가장 가까운 센트로이드까지 이 거리보다 멀면 "인장 아님"
const MARGIN = opt('margin', 1.0); // 1등이 2등보다 이만큼 더 가까워야 인정 (런너업 마진, §4.2)
const SWEEP = args.includes('--sweep');
const paths = args.filter((a) => !a.startsWith('--'));

// --- 데이터 로드 ---
function collectFiles(p) {
  if (!existsSync(p)) return [];
  if (statSync(p).isDirectory()) {
    const inner = join(p, 'data.json');
    if (existsSync(inner)) return [inner];
    return readdirSync(p).flatMap((f) => collectFiles(join(p, f)));
  }
  return p.endsWith('.json') ? [p] : [];
}

const files = (paths.length ? paths : ['data']).flatMap(collectFiles);
if (!files.length) {
  console.error('데이터를 못 찾았다. 예: node tools/replay.mjs data/seals_2026-07-25_360f_360img');
  process.exit(1);
}

const samples = files.flatMap((f) => {
  const rows = JSON.parse(readFileSync(f, 'utf8'));
  return rows.map((r) => ({ ...r, _src: f }));
});
console.log(`세션 ${files.length}개 · 샘플 ${samples.length}장`);
for (const f of files) console.log(`  - ${f}`);

// --- 거리 한 번만 계산해두고 모든 진단을 여기서 파생 ---
const euclid = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };

const scored = samples.map((s) => {
  const feat = buildFeatures(s.landmarks);
  const ranked = Object.entries(CENTROIDS)
    .map(([id, c]) => ({ id, d: euclid(feat, c) }))
    .sort((a, b) => a.d - b.d);
  return { label: s.label, handCount: s.handCount, best: ranked[0], second: ranked[1], feat, saved: s.features };
});

const predict = (r, accept = ACCEPT, margin = MARGIN) =>
  (r.best.d <= accept && (r.second.d - r.best.d) >= margin) ? r.best.id : null;

const labels = [...new Set(scored.map((r) => r.label))];
const pad = (v, n) => String(v).padStart(n);

// --- 임계값 스윕 모드 ---
if (SWEEP) {
  console.log('\nACCEPT  MARGIN   전체정확도   미검출   오인식');
  for (const a of [2.0, 2.5, 3.0, 3.5, 4.0, 5.0]) {
    let hit = 0, miss = 0, wrong = 0;
    for (const r of scored) {
      const p = predict(r, a, MARGIN);
      if (p === r.label) hit++; else if (p === null) miss++; else wrong++;
    }
    console.log(`${pad(a.toFixed(1), 6)} ${pad(MARGIN.toFixed(1), 7)} ${pad(((hit / scored.length) * 100).toFixed(1), 10)}% ${pad(miss, 8)} ${pad(wrong, 8)}`);
  }
  console.log('\n※ 오인식 0이라고 안심하지 말 것 — 이 데이터엔 "인장 아님" 샘플이 없다.');
  process.exit(0);
}

// --- 인장별 성적 ---
const stat = Object.fromEntries(labels.map((l) => [l, { n: 0, hit: 0, miss: 0, wrong: 0, dSum: 0, gapSum: 0, hands: {}, second: {} }]));
for (const r of scored) {
  const st = stat[r.label];
  st.n++;
  st.dSum += r.best.d;
  st.gapSum += r.second.d - r.best.d;
  st.hands[r.handCount] = (st.hands[r.handCount] ?? 0) + 1;
  const p = predict(r);
  if (p === r.label) st.hit++;
  else if (p === null) {
    st.miss++;
    if ((r.second.d - r.best.d) < MARGIN) st.second[r.second.id] = (st.second[r.second.id] ?? 0) + 1;
  } else {
    st.wrong++;
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
    `${l.padEnd(9)} ${pad(((s.hit / s.n) * 100).toFixed(0) + '%', 6)} ${pad(s.miss, 7)} ${pad(s.wrong, 7)} ` +
    `${pad((s.dSum / s.n).toFixed(2), 9)} ${pad((s.gapSum / s.n).toFixed(2), 8)} ` +
    `${pad(`${s.hands[1] ?? 0}/${s.hands[2] ?? 0}`, 8)}  ${(top ? `${top[0]}×${top[1]}` : '—').padEnd(12)}${flag}`
  );
}
console.log(`\n전체 정확도: ${((hit / scored.length) * 100).toFixed(1)}%  (${hit}/${scored.length})`);

// --- 진단: 한 인장 안에서 1손/2손이 섞이면 센트로이드(평균)가 허공에 뜬다 ---
const mixed = labels.filter((l) => (stat[l].hands[1] ?? 0) > 0 && (stat[l].hands[2] ?? 0) > 0);
if (mixed.length) {
  console.log(`\n⚠ 손 개수가 섞인 인장: ${mixed.join(', ')}`);
  console.log('  특징 벡터는 없는 손 자리를 0으로 채운다 → 1손/2손 샘플은 90차원 중 45개가 통째로 다르다.');
  console.log('  한 인장이 먼 두 무리로 갈라지고, 그 평균인 센트로이드는 어느 무리에도 속하지 않게 된다.');
  console.log('  → 임계값으로 못 고친다. 손 개수가 일관되게 재수집하거나 실전 시퀀스에서 뺀다 (§4.5).');
}

// --- 무결성: 수집 당시 저장된 features와 지금 계산값이 같아야 한다 ---
const drift = scored.filter((r) => !r.saved || r.feat.length !== r.saved.length
  || r.feat.some((v, i) => Math.abs(v - r.saved[i]) > 1e-9)).length;
console.log(`\n특징 재현성(수집 당시 저장값 대조): 불일치 ${drift}/${scored.length} ${drift === 0 ? '✅' : '❌ buildFeatures가 수집 이후 바뀌었다'}`);

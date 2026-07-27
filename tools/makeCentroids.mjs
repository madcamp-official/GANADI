// makeCentroids.mjs — 수집 데이터로 센트로이드를 만들어 client/src/recognition/centroids.js에 쓴다.
//
// 사용법:
//   node tools/makeCentroids.mjs                          # data/ 아래 모든 세션
//   node tools/makeCentroids.mjs data/seals_2026-07-27_*  # 특정 세션만
//   node tools/makeCentroids.mjs --min=8                  # 표본 8장 미만 클러스터는 버림
//   node tools/makeCentroids.mjs --dry                    # 파일 쓰지 않고 결과만 출력
//
// ★ 클러스터는 (인장 × 손 개수)로 나눈다 — 이유는 lib/sessions.mjs의 clusterKey 주석 참고.
// ★ "인장 아님"(none) 라벨은 제외한다. 그건 오탐률 측정용이지 학습 대상이 아니다.
//
// 생성 후에는 반드시 `node tools/replay.mjs`로 성적을 확인할 것.

import { writeFileSync } from 'node:fs';
import { extractFeatures, FEAT_LENGTH } from '../client/src/recognition/features.js';
import { loadSessions, NEGATIVE_ID, clusterKey } from './lib/sessions.mjs';

const OUT = 'client/src/recognition/centroids.js';

const args = process.argv.slice(2);
// 기본 15장. 한 인장을 30장씩 찍으므로, 그보다 한참 적은 클러스터는 대개
// "두 손 인장인데 한 손만 잡힌 불량 프레임"이 모인 것이다. 실제로 pig__1h(9장)를
// 남겨두면 뱀이 그쪽으로 끌려가 50%로 무너졌다.
const MIN_SAMPLES = Number(args.find((a) => a.startsWith('--min='))?.split('=')[1] ?? 15);
const DRY = args.includes('--dry');
const paths = args.filter((a) => !a.startsWith('--'));

const { files, samples } = loadSessions(paths);
console.log(`세션 ${files.length}개 · 샘플 ${samples.length}장`);
for (const f of files) console.log(`  - ${f}`);

// --- 클러스터별로 특징을 모은다 ---
const groups = new Map(); // key -> { sealId, handCount, feats: number[][] }
let negatives = 0;
let skippedBadLen = 0;

for (const s of samples) {
  if (s.label === NEGATIVE_ID) { negatives += 1; continue; } // 학습 대상 아님
  const feat = extractFeatures(s.landmarks);
  if (feat.length !== FEAT_LENGTH) { skippedBadLen += 1; continue; }

  // handCount가 없는 옛 데이터도 좌표에서 복원할 수 있다
  const handCount = s.handCount ?? s.landmarks?.length ?? 0;
  const key = clusterKey(s.label, handCount);
  if (!groups.has(key)) groups.set(key, { sealId: s.label, handCount, feats: [] });
  groups.get(key).feats.push(feat);
}

// --- 평균 = 센트로이드 ---
const CENTROIDS = {};
const META = {};
const dropped = [];

for (const [key, g] of [...groups].sort()) {
  if (g.feats.length < MIN_SAMPLES) { dropped.push(`${key}(${g.feats.length}장)`); continue; }
  const dim = g.feats[0].length;
  const mean = new Array(dim).fill(0);
  for (const f of g.feats) for (let i = 0; i < dim; i++) mean[i] += f[i] / g.feats.length;
  CENTROIDS[key] = mean;
  META[key] = { sealId: g.sealId, handCount: g.handCount, samples: g.feats.length };
}

// --- 요약 출력 ---
const bySeal = {};
for (const [key, m] of Object.entries(META)) (bySeal[m.sealId] ??= []).push(`${m.handCount}손×${m.samples}`);

console.log(`\n인장 ${Object.keys(bySeal).length}종 · 클러스터 ${Object.keys(CENTROIDS).length}개`);
for (const [seal, parts] of Object.entries(bySeal)) {
  const split = parts.length > 1 ? '  ← 손 개수 분리됨' : '';
  console.log(`  ${seal.padEnd(9)} ${parts.join(', ')}${split}`);
}
if (negatives) console.log(`\n"${NEGATIVE_ID}" 샘플 ${negatives}장 제외 (오탐률 측정용 — replay.mjs가 쓴다)`);
if (dropped.length) console.log(`⚠ 표본 부족으로 버림 (--min=${MIN_SAMPLES}): ${dropped.join(', ')}`);
if (skippedBadLen) console.log(`⚠ 특징 길이 이상으로 건너뜀: ${skippedBadLen}장`);

// --- 파일 쓰기 ---
const header = `// centroids.js — 인장별 평균 특징 벡터. ★ 자동 생성 파일이니 직접 고치지 말 것.
//
// 생성: node tools/makeCentroids.mjs
// 일시: ${new Date().toISOString()}
// 출처: ${files.join(', ')}
// 표본: ${samples.length}장 (그중 "${NEGATIVE_ID}" ${negatives}장은 제외)
//
// 키는 "인장__N손" 이다. 한 인장 안에서 1손/2손이 섞이면 평균이 어느 무리에도
// 속하지 않는 점이 되어 인식이 무너지므로(호랑이 사례), 손 개수별로 대표를 따로 둔다.
// 판별할 때 같은 인장의 다른 클러스터는 경쟁자로 치지 않는다 (classifyCentroid.js).
`;

const body = `${header}
export const CENTROIDS = ${JSON.stringify(CENTROIDS)};

/** 클러스터 키 → { sealId, handCount, samples } */
export const CENTROID_META = ${JSON.stringify(META, null, 2)};
`;

if (DRY) {
  console.log(`\n--dry 이므로 파일을 쓰지 않았다. (쓸 크기: ${(body.length / 1024).toFixed(1)} KB)`);
} else {
  writeFileSync(OUT, body, 'utf8');
  console.log(`\n✅ ${OUT} 갱신 (${(body.length / 1024).toFixed(1)} KB)`);
  console.log('   다음: node tools/replay.mjs 로 성적 확인');
}

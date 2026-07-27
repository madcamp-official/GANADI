// 수집 세션(JSON) 로딩 — replay.mjs와 makeCentroids.mjs가 공유한다.
// 둘이 서로 다른 데이터를 보면 진단과 생성이 어긋나므로 반드시 한 곳에서 읽는다.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** 경로(파일/폴더)를 훑어 data.json 목록을 만든다 */
export function collectFiles(p) {
  if (!existsSync(p)) return [];
  if (statSync(p).isDirectory()) {
    const inner = join(p, 'data.json');
    if (existsSync(inner)) return [inner];
    return readdirSync(p).flatMap((f) => collectFiles(join(p, f)));
  }
  return p.endsWith('.json') ? [p] : [];
}

/**
 * @param {string[]} paths 비어 있으면 data/ 전체
 * @returns {{ files: string[], samples: Array }}
 */
export function loadSessions(paths) {
  const files = (paths.length ? paths : ['data']).flatMap(collectFiles);
  if (!files.length) {
    console.error('데이터를 못 찾았다. 예: data/seals_2026-07-25_360f_360img');
    process.exit(1);
  }
  const samples = files.flatMap((f) => {
    const rows = JSON.parse(readFileSync(f, 'utf8'));
    return rows.map((r) => ({ ...r, _src: f }));
  });
  return { files, samples };
}

/** "인장이 아닌 손동작" 라벨 — 센트로이드 생성에서 제외, 오탐률 측정에만 쓴다 */
export const NEGATIVE_ID = 'none';

/**
 * 센트로이드 키 = 인장 + 손 개수.
 * 한 인장 안에서 1손/2손이 섞이면 평균이 어느 무리에도 속하지 않는 점이 된다(호랑이 사례).
 * 무리별로 대표를 두면 그 문제가 사라지고, 실전에서 손 개수가 흔들려도 양쪽 다 커버된다.
 */
export const clusterKey = (label, handCount) => `${label}__${handCount}h`;

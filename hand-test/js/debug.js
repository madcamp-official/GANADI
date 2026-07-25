// debug.js — 콘솔로 좌표/특징을 확인하는 검증 도구 (키보드 d/f)

import { normalizeLandmarks, pairwiseDistances } from "./features.js";

const r3 = v => Math.round(v * 1000) / 1000; // 소수 셋째 자리 반올림

// 21개 좌표를 콘솔에 표로 덤프 + 정규화 검증 (키보드 'd')
export function dumpLandmarks(lm) {
  if (!lm) { console.warn("손이 안 잡혔습니다. 손을 화면에 보이고 눌러주세요."); return; }
  const raw  = lm.map((p, i) => ({ idx: i, x: r3(p.x), y: r3(p.y), z: r3(p.z) }));
  const norm = normalizeLandmarks(lm).map((p, i) => ({ idx: i, x: r3(p.x), y: r3(p.y), z: r3(p.z) }));
  console.log("=== 원시 좌표 (이미지 비율 0~1) ===");        console.table(raw);
  console.log("=== 정규화 좌표 (손목=원점, 손바닥길이=1) ==="); console.table(norm);
  // --- 자동 검증 ---
  const w = norm[0], ref = norm[9];
  const okWrist = Math.abs(w.x) < 1e-6 && Math.abs(w.y) < 1e-6;
  const refDist = Math.hypot(ref.x - w.x, ref.y - w.y);
  console.log(`검증① 손목이 원점? (${r3(w.x)}, ${r3(w.y)}) → (0,0) 여야 함 : ${okWrist ? "✅" : "❌"}`);
  console.log(`검증② 기준거리(0→9) = ${r3(refDist)} → 1.000 여야 함 : ${Math.abs(refDist - 1) < 1e-6 ? "✅" : "❌"}`);
}

// 쌍거리 특징을 콘솔에 표로 덤프 + 검증 (키보드 'f')
export function dumpFeatures(lm) {
  if (!lm) { console.warn("손이 안 잡혔습니다."); return; }
  const feats = pairwiseDistances(lm);
  console.log(`=== 쌍거리 특징 (${feats.length}개) ===`);
  console.table(feats.map(f => ({ pair: f.pair, dist: r3(f.dist) })));
  console.log("모델 입력용 배열:", feats.map(f => r3(f.dist)));
  // --- 자동 검증 ---
  const d09 = feats.find(f => f.pair === "0-9").dist; // 손목→중지MCP = 스케일 기준
  console.log(`검증① 기준거리(0-9) = ${r3(d09)} → 1.000 여야 함 : ${Math.abs(d09 - 1) < 1e-6 ? "✅" : "❌"}`);
  console.log(`검증② 모든 거리 ≥ 0 : ${feats.every(f => f.dist >= 0) ? "✅" : "❌"}`);
  console.log(`검증③ NaN 없음 : ${feats.some(f => Number.isNaN(f.dist)) ? "❌" : "✅"}`);
}

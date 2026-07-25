// recognizer.js — 인장 판별기 (교체 가능 모듈, 기획안 §4.6)
// 내부 구현(지금은 최근접 센트로이드)과 무관하게 onSeal(sealId, confidence)만 발행한다.
// 나중에 12종 MLP로 바꿔도 이 인터페이스는 그대로.

import { buildFeatures } from "./features.js";
import { CENTROIDS } from "./centroids.js";

// --- 튜닝 상수 (2차 데이터로 재조정 대상) ---
const ACCEPT_THRESHOLD = 2.5; // 가장 가까운 센트로이드까지 이 거리보다 멀면 "인장 아님"
const MARGIN = 1.0;           // 1등이 2등보다 이만큼 더 가까워야 인정 (런너업 마진, §4.2)
const VOTE_WINDOW = 8;        // 시간축 다수결 프레임 수 (§4.4)
const HOLD_MS = 400;          // 0.4초 홀드 후 확정 (§3.2)

const NONE = "__none__";
const euclid = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const x = a[i] - b[i]; s += x * x; } return Math.sqrt(s); };

// 한 프레임 판별: 임계값 + 런너업 마진 적용
export function classify(landmarks) {
  if (!landmarks || landmarks.length === 0) return { sealId: null, confidence: 0 };
  const f = buildFeatures(landmarks);
  const scored = Object.entries(CENTROIDS)
    .map(([id, c]) => ({ id, d: euclid(f, c) }))
    .sort((a, b) => a.d - b.d);
  const best = scored[0], second = scored[1];
  if (best.d > ACCEPT_THRESHOLD) return { sealId: null, confidence: 0 };          // 너무 멂
  if (second && (second.d - best.d) < MARGIN) return { sealId: null, confidence: 0 }; // 애매함
  const confidence = Math.max(0, Math.min(1, 1 - best.d / ACCEPT_THRESHOLD));
  return { sealId: best.id, confidence };
}

// 상태 있는 인식기: 시간축 다수결 → 0.4초 홀드 → 엣지 트리거로 onSeal 1회 발행
export function createRecognizer({ onSeal } = {}) {
  const votes = [];
  let holdSeal = null, holdStart = 0, fired = null;

  return {
    // 매 프레임 호출. { candidate, confirmed, confidence } 반환
    update(landmarks) {
      const { sealId, confidence } = classify(landmarks);
      votes.push(sealId || NONE);
      if (votes.length > VOTE_WINDOW) votes.shift();

      // 다수결 승자
      const counts = {};
      for (const v of votes) counts[v] = (counts[v] || 0) + 1;
      let winKey = NONE, wc = 0;
      for (const k in counts) if (counts[k] > wc) { wc = counts[k]; winKey = k; }
      const winner = winKey === NONE ? null : winKey;

      // 홀드 + 엣지 트리거
      const now = performance.now();
      if (winner !== holdSeal) { holdSeal = winner; holdStart = now; fired = null; }
      let confirmed = null;
      if (holdSeal && now - holdStart >= HOLD_MS) {
        confirmed = holdSeal;
        if (fired !== confirmed) { fired = confirmed; onSeal && onSeal(confirmed, confidence); }
      }
      return { candidate: winner, confirmed, confidence };
    },
  };
}

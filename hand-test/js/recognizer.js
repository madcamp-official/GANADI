// recognizer.js — 인장 판별기 (교체 가능 모듈, 기획안 §4.6)
//
// === B와 확정한 계약 ===
//   const recognizer = await createRecognizer();      // async, 인자 없음
//   battleScene.attachRecognizer(recognizer);         // B가 recognizer.onSeal 에 게임 함수를 꽂음
//   recognizer.step(landmarks)                        // A 파이프라인이 매 프레임 호출
//   → 인장 확정 시 recognizer.onSeal(sealId, confidence, timestamp) 발행
//        sealId: seals.js id 문자열 ("horse","dog"...) / confidence: 0~1 / timestamp: Date.now()
// 내부 구현(지금은 최근접 센트로이드)이 12종 MLP로 바뀌어도 이 인터페이스는 그대로.

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
// async: 나중에 12종 MLP를 여기서 로드해도 인터페이스가 안 바뀌도록 (지금은 즉시 반환)
export async function createRecognizer() {
  const votes = [];
  let holdSeal = null, holdStart = 0, fired = null;

  const rec = {
    onSeal: null, // B가 battleScene.attachRecognizer(rec)로 여기에 게임 함수를 꽂는다

    // A 파이프라인이 매 프레임 호출. { candidate, confirmed, confidence } 반환
    step(landmarks) {
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
        if (fired !== confirmed) {
          fired = confirmed;
          rec.onSeal && rec.onSeal(confirmed, confidence, Date.now()); // ★ B 계약대로 발행
        }
      }
      return { candidate: winner, confirmed, confidence };
    },
  };
  return rec;
}

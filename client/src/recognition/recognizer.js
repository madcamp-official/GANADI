// ★ 교체 가능 모듈 계약 (§4.6) — 이 파일의 공개 인터페이스는 고정.
// 내부 구현이 6종 룰 기반이든 12종 MLP든 무관하게 onSeal(sealId, confidence)만 발행한다.
// Day 5에 룰 기반 → MLP 교체가 "구현 함수만 바꾸는" 수준이 되도록 설계.

import { createHandLandmarker } from './handLandmarker.js';
import { extractFeatures } from './features.js';
import { classifyRuleBased } from './ruleBased.js';
// import { classifyMLP } from './mlpModel.js'; // Day 5 교체 대상
import { RECOGNITION } from '../config.js';

const USE_MLP = false; // Day 5에 true로. 폴백 플래그로 룰 기반 유지 (§4.6).

export async function createRecognizer() {
  const landmarker = await createHandLandmarker();
  const voteBuffer = [];

  /** @type {(sealId: string, confidence: number) => void} */
  let onSeal = () => {};
  let heldSeal = null;
  let heldSince = 0;

  function step(videoFrame, nowMs) {
    const result = landmarker.detectForVideo(videoFrame, nowMs);
    if (!result?.landmarks?.length) return;

    const feat = extractFeatures(result.landmarks);
    const { sealId, confidence, runnerUp } = USE_MLP
      ? { sealId: null, confidence: 0, runnerUp: 0 } // TODO: classifyMLP(feat)
      : classifyRuleBased(feat);

    // 런너업 마진: 1등이 2등보다 충분히 높을 때만 후보 인정 (§4.2)
    if (!sealId || confidence - runnerUp < RECOGNITION.RUNNER_UP_MARGIN) return;

    // 시간축 다수결 (§4.4)
    voteBuffer.push(sealId);
    if (voteBuffer.length > RECOGNITION.VOTE_WINDOW) voteBuffer.shift();
    const voted = majority(voteBuffer);

    // 0.4초 홀드 확정
    if (voted === heldSeal) {
      if (nowMs - heldSince >= 400) {
        onSeal(voted, confidence);
        heldSeal = null; // 재확정 방지 (다음 프레임에서 새로 홀드)
      }
    } else {
      heldSeal = voted;
      heldSince = nowMs;
    }
  }

  return {
    step,
    set onSeal(fn) { onSeal = fn; },
  };
}

function majority(arr) {
  const count = {};
  let best = null;
  let bestN = 0;
  for (const x of arr) {
    count[x] = (count[x] ?? 0) + 1;
    if (count[x] > bestN) { bestN = count[x]; best = x; }
  }
  return best;
}

// ★ 교체 가능 모듈 계약 (§4.6) — 이 파일의 공개 인터페이스는 고정.
// 내부 구현이 센트로이드든 12종 MLP든 이미지 CNN이든 무관하게 onSeal만 발행한다.
//
// ── A ↔ B 계약 (확정) ──
//   createRecognizer()                     : async. 인자 없음
//   rec.step({ video, hands, nowMs })      : A의 프레임 루프가 매 프레임 호출
//        video  : HTMLVideoElement. 지금 구현은 안 쓴다.
//                 → 나중에 이미지 모델(CNN)이 픽셀을 볼 자리를 미리 비워둔 것.
//                   (이미지 모델도 hands로 손 위치를 잡아 잘라낸 뒤 CNN에 넣으므로 둘 다 필요)
//        hands  : MediaPipe landmarks 배열 [손][21]. ★ landmarker는 인식기가 아니라
//                 호출자(A의 루프)가 소유한다 — 인스턴스를 1대로 유지하기 위해.
//        nowMs  : performance.now()
//     반환 { candidate, confirmed, confidence, holdProgress }
//        candidate    : 다수결 통과한 현재 후보 (없으면 null)
//        confirmed    : 홀드까지 끝나 확정된 인장 (없으면 null)
//        holdProgress : 0~1. B가 인식 게이지 바를 그리는 값
//   rec.onSeal(sealId, confidence, timestamp) : 인장 확정 시 1회 발행 (엣지 트리거)
//        sealId    : SEAL_IDS 문자열 ("horse" | "dog" | ...)
//        confidence: 0~1
//        timestamp : Date.now() (ms)
//   방향: B가 만든 함수를 rec.onSeal에 꽂는다 (BattleScene.attachRecognizer).
//
// ※ 인자·반환을 객체로 묶은 이유: 나중에 필드가 늘어도 호출부가 안 깨진다.

import { extractFeatures } from './features.js';
import { classifyCentroid } from './classifyCentroid.js';
// import { classifyMLP } from './mlpModel.js'; // Day 5 교체 대상
import { RECOGNITION } from '../config.js';
import { RULES } from '../../../shared/constants.js';

const USE_MLP = false; // Day 5에 true로. 폴백 플래그로 센트로이드 구현 유지 (§4.6).

/**
 * 한 프레임 판별 — 상태 없는 순수 함수.
 * ★ export를 유지할 것: 웹캠 없이 저장된 데이터(data.json의 원시 landmarks)를
 *   그대로 흘려보내 정확도를 뽑는 통로다. Step 4 검증·Day 4 혼동행렬이 이걸로 돌아간다.
 * 임계값·런너업 마진 판정은 분류기 안에서 끝난다. best/second/reason은 튜닝용 진단 정보.
 * @param {Array<Array<{x:number,y:number,z:number}>>} hands
 * @returns {{ sealId: string|null, confidence: number, reason?: string }}
 */
export function classify(hands) {
  if (!hands?.length) return { sealId: null, confidence: 0, reason: 'no-hands' };
  const feat = extractFeatures(hands);
  return USE_MLP
    ? { sealId: null, confidence: 0, reason: 'mlp-todo' } // TODO: classifyMLP(feat)
    : classifyCentroid(feat);
}

export async function createRecognizer() {
  const votes = [];
  let holdSeal = null;
  let holdStart = 0;
  let fired = null; // 엣지 트리거: 같은 홀드에서 두 번 발행되는 것 방지

  const rec = {
    onSeal: null, // B가 여기에 게임 함수를 꽂는다

    step({ video, hands, nowMs }) {
      void video; // 지금 구현은 픽셀을 안 본다 (이미지 모델용 자리)

      const { sealId, confidence } = classify(hands);

      // 시간축 다수결 (§4.4) — 단발 오인식 제거
      votes.push(sealId ?? NONE);
      if (votes.length > RECOGNITION.VOTE_WINDOW) votes.shift();
      const winner = majority(votes);

      // 홀드 + 엣지 트리거
      if (winner !== holdSeal) {
        holdSeal = winner;
        holdStart = nowMs;
        fired = null;
      }

      const held = holdSeal ? nowMs - holdStart : 0;
      const holdProgress = holdSeal ? Math.min(1, held / RULES.SEAL_HOLD_MS) : 0;

      let confirmed = null;
      if (holdSeal && held >= RULES.SEAL_HOLD_MS) {
        confirmed = holdSeal;
        if (fired !== confirmed) {
          fired = confirmed;
          rec.onSeal?.(confirmed, confidence, Date.now()); // 계약대로 발행
        }
      }

      return { candidate: winner, confirmed, confidence, holdProgress };
    },
  };

  return rec;
}

const NONE = '__none__'; // "인장 아님"도 한 표로 세야 다수결이 제대로 돈다

function majority(arr) {
  const count = {};
  let best = NONE;
  let bestN = 0;
  for (const x of arr) {
    count[x] = (count[x] ?? 0) + 1;
    if (count[x] > bestN) { bestN = count[x]; best = x; }
  }
  return best === NONE ? null : best;
}

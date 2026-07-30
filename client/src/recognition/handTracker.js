// 손 추적 루프 — 카메라 프레임을 MediaPipe에 먹이고 인식기를 굴리는 단 하나의 주체.
//
// ★ landmarker는 인식기가 아니라 이 루프가 소유한다 (Step 1 결정).
//   좌표가 필요한 곳(인식기·가이드 박스·디버그 렌더)이 여럿이라, 한 번 뽑아 나눠 쓴다.
//   MediaPipe 인스턴스는 모델 로딩과 GPU를 먹으므로 앱 전체에서 1대만 유지한다.
//
// ★ 루프는 Phaser 씬이 아니라 이 모듈이 소유한다.
//   씬이 바뀌어도(로비→대전→결과) 인식이 끊기면 안 되기 때문. 씬은 onFrame으로 구독만 한다.

import { createHandLandmarker } from './handLandmarker.js';
import { createRecognizer } from './recognizer.js';
import { RECOGNITION } from '../config.js';

/**
 * 프레임 루프 본체 — 의존성을 전부 주입받는다(테스트를 위해).
 * 실제 배선은 아래 getHandTracker()가 한다.
 */
export function createHandTracker({ landmarker, video, recognizer, raf, cancelRaf, now }) {
  const subscribers = new Set();
  let handle = null;
  let running = false;
  let lastVideoTime = -1;
  let lastInferMs = -Infinity;
  let frames = 0;   // 실제로 추론한 프레임 수 (디버그용)
  let last = { hands: [], state: null, nowMs: 0 };

  function tick() {
    if (!running) return;
    handle = raf(tick); // 다음 프레임 예약을 먼저 (중간에 return해도 루프가 끊기지 않게)

    // 비디오가 아직 준비 전이면 건너뛴다 (readyState<2면 detectForVideo가 던진다)
    if (!video || video.readyState < 2) return;

    // 같은 프레임을 두 번 추론하지 않는다 — 화면 주사율이 카메라 fps보다 높을 때 낭비 방지
    if (video.currentTime === lastVideoTime) return;

    // 추론 상한 (RECOGNITION.FPS_THROTTLE). 고fps 카메라에서 GPU를 통째로 태우지 않는다.
    // 다수결 윈도우는 config가 이 값으로부터 프레임 수를 파생하므로 체감 반응은 그대로다.
    const nowMs = now();
    if (nowMs - lastInferMs < 1000 / RECOGNITION.FPS_THROTTLE) return;
    lastInferMs = nowMs;
    lastVideoTime = video.currentTime;

    let hands = [];
    try {
      hands = landmarker.detectForVideo(video, nowMs)?.landmarks ?? [];
    } catch (err) {
      console.warn('[handTracker] 추론 실패, 이 프레임은 건너뜀:', err?.message ?? err);
      return;
    }

    const state = recognizer.step({ video, hands, nowMs });
    frames += 1;
    last = { hands, state, nowMs };

    // 구독자 하나가 던져도 루프와 다른 구독자는 살아남아야 한다
    for (const cb of subscribers) {
      try { cb(last); } catch (err) { console.warn('[handTracker] 구독자 오류:', err); }
    }
  }

  return {
    recognizer,

    start() {
      if (running) return;      // 중복 start로 루프가 두 개가 되는 것 방지
      running = true;
      handle = raf(tick);
    },

    stop() {
      running = false;
      if (handle != null) cancelRaf?.(handle);
      handle = null;
    },

    /** 매 프레임 { hands, state, nowMs } 수신. 반환값을 호출하면 구독 해지 */
    onFrame(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },

    /** 마지막 프레임 결과 (구독 없이 훔쳐보고 싶을 때) */
    get latest() { return last; },
    get isRunning() { return running; },
    get frameCount() { return frames; },
  };
}

// --- 앱 전역 싱글턴 ---------------------------------------------------------
// 여러 씬이 각자 부르더라도 landmarker·recognizer·루프는 하나만 만들어진다.

let instance = null;
let pending = null;

/**
 * 손 추적기를 얻는다(없으면 만들고 시작). 모델 로딩 때문에 async.
 * @param {HTMLVideoElement} [video] 기본값은 BootScene이 스트림을 물려둔 #local-cam
 */
export async function getHandTracker(video = document.getElementById('local-cam')) {
  if (instance) return instance;
  if (pending) return pending; // 두 씬이 동시에 부를 때 모델을 두 번 받지 않게

  pending = (async () => {
    // 이 줄이 콘솔에 두 번 찍히면 인스턴스가 두 개라는 뜻이다 (씬을 오가며 확인할 것)
    console.info('[handTracker] MediaPipe 모델 로드 — 앱 전체에서 이 로그는 1회만 나와야 한다');
    const [landmarker, recognizer] = await Promise.all([
      createHandLandmarker(),
      createRecognizer(),
    ]);
    instance = createHandTracker({
      landmarker,
      video,
      recognizer,
      raf: (fn) => requestAnimationFrame(fn),
      cancelRaf: (h) => cancelAnimationFrame(h),
      now: () => performance.now(),
    });
    instance.start();

    // 개발 중 진단용 — 콘솔에서 __handTracker로 상태를 들여다볼 수 있다 (프로덕션 빌드엔 없음)
    if (import.meta.env?.DEV) window.__handTracker = instance;

    pending = null;
    return instance;
  })();

  return pending;
}

/** 이미 만들어졌으면 반환, 아니면 null (로딩을 기다리기 싫은 곳용) */
export function peekHandTracker() {
  return instance;
}

/**
 * 인식이 필요 없는 씬(로비·도감·결과·캐릭터 선택)에서 루프를 멈춘다.
 * ★ 예전엔 추적기가 한 번 뜨면 앱이 닫힐 때까지 모든 화면에서 계속 돌았다 —
 *   아무도 안 보는 동안 초당 30회 GPU 추론을 하니 시연용 노트북이 뜨거워지고 배터리가 샌다.
 *   모델은 살려두므로(인스턴스 유지) 다시 켤 때 로딩이 없다.
 */
export function pauseHandTracker() {
  instance?.stop();
}

/** 인식이 필요한 씬(손 인식 관문·대전)에서 다시 돌린다. 추적기가 없으면 아무 일도 안 한다 */
export function resumeHandTracker() {
  instance?.start();
}

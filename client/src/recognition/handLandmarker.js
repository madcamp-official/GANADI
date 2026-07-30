// MediaPipe Tasks Vision — Hand Landmarker 래퍼. 두 손 42 랜드마크, 브라우저 내 WASM 추론.
//
// ★ 로컬 우선, CDN 폴백.
//   예전엔 WASM 런타임(jsdelivr)과 모델 파일(storage.googleapis.com)을 무조건 인터넷에서 받았다.
//   시연장 네트워크가 흔들리면 손 인식이 아예 뜨지 않는다 — 이 게임에선 그게 곧 데모 실패다.
//   `npm run vendor:mediapipe` 로 두 자산을 client/public/ 아래에 받아두면 오프라인에서도 돈다.
//   자산이 없는 환경(막 클론한 저장소 등)에서는 조용히 CDN으로 넘어가므로 개발엔 지장이 없다.

import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { RECOGNITION } from '../config.js';

const LOCAL_WASM = '/mediapipe/wasm';
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';

const LOCAL_MODEL = '/model/hand-landmarker/hand_landmarker.task';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/** 로컬 자산이 실제로 있는지 확인. 404거나 네트워크가 죽었으면 false */
async function exists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function createHandLandmarker() {
  // 두 자산을 각각 독립적으로 판단한다 — 하나만 받아둔 상태도 정상 동작해야 한다.
  const [hasWasm, hasModel] = await Promise.all([
    exists(`${LOCAL_WASM}/vision_wasm_internal.js`),
    exists(LOCAL_MODEL),
  ]);

  const wasmBase = hasWasm ? LOCAL_WASM : CDN_WASM;
  const modelAssetPath = hasModel ? LOCAL_MODEL : CDN_MODEL;
  console.info(
    `[landmarker] wasm=${hasWasm ? '로컬' : 'CDN'} · 모델=${hasModel ? '로컬' : 'CDN'}` +
    (hasWasm && hasModel ? '' : ' — 오프라인 시연 전에 `npm run vendor:mediapipe`를 돌릴 것')
  );

  const vision = await FilesetResolver.forVisionTasks(wasmBase);
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath, delegate: 'GPU' },
    numHands: RECOGNITION.NUM_HANDS,
    runningMode: 'VIDEO',
  });
}

// MediaPipe Tasks Vision — Hand Landmarker 래퍼. 두 손 42 랜드마크, 브라우저 내 WASM 추론.

import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { RECOGNITION } from '../config.js';

export async function createHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
  );
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU',
    },
    numHands: RECOGNITION.NUM_HANDS,
    runningMode: 'VIDEO',
  });
}

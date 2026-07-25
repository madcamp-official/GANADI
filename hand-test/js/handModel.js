// handModel.js — MediaPipe 모델 로드 + 웹캠 시작

import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/vision_bundle.mjs";

// MediaPipe Hand Landmarker 생성 (WASM 엔진 + hand_landmarker.task 모델)
export async function createHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/wasm"
  );
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU", // 실패하면 "CPU"로 바꾸세요
    },
    runningMode: "VIDEO",
    numHands: 2, // ★ 두 손 인식
  });
}

// 웹캠 스트림을 받아 video 요소에 연결
export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

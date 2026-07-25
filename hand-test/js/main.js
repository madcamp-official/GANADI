// main.js — 진입점: DOM 연결, 상태 관리, 매 프레임 루프, 키보드 입력

import { createHandLandmarker, startCamera } from "./handModel.js";
import { createDrawer, drawHand, drawFingerText, drawIndices } from "./render.js";
import { dumpLandmarks, dumpFeatures } from "./debug.js";

// --- DOM 참조 ---
const video    = document.getElementById("video");
const canvas   = document.getElementById("overlay");
const ctx      = canvas.getContext("2d");
const status   = document.getElementById("status");
const startBtn = document.getElementById("start");
const draw     = createDrawer(ctx);

// --- 상태 ---
let handLandmarker = null;
let running = false;
let lastVideoTime = -1;
let fps = 0, lastT = performance.now(), frames = 0;
let handCount = 0;
let lastLandmarks = null; // 마지막 프레임의 손 좌표 (콘솔 덤프용)
let showIndex = false;    // 랜드마크 번호 표시 토글 (키보드 'i')

// --- 매 프레임 추론 + 그리기 ---
function loop() {
  if (!running) return;
  const now = performance.now();

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = handLandmarker.detectForVideo(video, now);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    handCount = result.landmarks ? result.landmarks.length : 0;
    lastLandmarks = result.landmarks || null; // 'd'/'f' 키 덤프용으로 보관

    if (result.landmarks) {
      for (let i = 0; i < result.landmarks.length; i++) {
        const lm = result.landmarks[i];
        const handedness = result.handednesses?.[i]?.[0]?.categoryName ?? "?";

        if (i === 0) drawFingerText(ctx, canvas, lm); // 첫 손만 상태 텍스트
        drawHand(draw, lm, handedness);
        if (showIndex) drawIndices(ctx, canvas, lm);
      }
    }
  }

  // FPS 표시
  frames++;
  if (now - lastT >= 1000) {
    fps = frames; frames = 0; lastT = now;
  }
  status.textContent = `FPS ${fps} · 인식된 손: ${handCount}개`;

  requestAnimationFrame(loop);
}

// --- 시작 버튼 ---
startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  try {
    if (!handLandmarker) {
      status.textContent = "모델 로딩 중… (최초 1회, 몇 초 걸림)";
      handLandmarker = await createHandLandmarker();
    }
    await startCamera(video);
    status.textContent = "모델 준비 완료. 손을 보여주세요.";
    running = true;
    loop();
  } catch (e) {
    status.textContent = "에러: " + e.message;
    console.error(e);
    startBtn.disabled = false;
  }
});

// --- 키보드: d = 좌표 덤프, f = 쌍거리 덤프, i = 번호 표시 토글 ---
window.addEventListener("keydown", (e) => {
  if (e.key === "d" || e.key === "ㅇ") dumpLandmarks(lastLandmarks?.[0]);
  if (e.key === "f" || e.key === "ㄹ") dumpFeatures(lastLandmarks?.[0]);
  if (e.key === "i" || e.key === "ㅑ") showIndex = !showIndex;
});

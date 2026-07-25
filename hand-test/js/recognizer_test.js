// recognizer_test.js — 인식기 실시간 테스트 (말·닭·개 3종)

import { createHandLandmarker, startCamera } from "./handModel.js";
import { createDrawer, drawHand, drawCenterBig } from "./render.js";
import { createRecognizer } from "./recognizer.js";
import { SEALS } from "./seals.js";

const nameOf = id => SEALS.find(s => s.id === id)?.name ?? id;

const video    = document.getElementById("video");
const canvas   = document.getElementById("overlay");
const ctx      = canvas.getContext("2d");
const status   = document.getElementById("status");
const candEl   = document.getElementById("candidate");
const firedEl  = document.getElementById("fired");
const startBtn = document.getElementById("start");
const draw     = createDrawer(ctx);

let handLandmarker = null;
let running = false;
let lastVideoTime = -1;
let flashText = null, flashUntil = 0;

// onSeal 발행 시 화면 플래시 + 로그 (이게 게임에서 데미지 이벤트가 될 자리)
const recognizer = createRecognizer({
  onSeal: (sealId, confidence) => {
    flashText = nameOf(sealId);
    flashUntil = performance.now() + 700;
    firedEl.textContent = `최근 발동: ${nameOf(sealId)} (conf ${confidence.toFixed(2)})`;
    console.log(`onSeal("${sealId}", ${confidence.toFixed(2)})`);
  },
});

function loop() {
  if (!running) return;
  const now = performance.now();

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = handLandmarker.detectForVideo(video, now);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const hands = result.landmarks || [];
    for (let i = 0; i < hands.length; i++) {
      drawHand(draw, hands[i], result.handednesses?.[i]?.[0]?.categoryName ?? "?");
    }

    const { candidate, confidence } = recognizer.update(hands);
    candEl.textContent = candidate
      ? `후보: ${nameOf(candidate)} (conf ${confidence.toFixed(2)})`
      : "후보: —";
    status.textContent = `손: ${hands.length}개`;

    if (flashText && now < flashUntil) drawCenterBig(ctx, canvas, flashText, "#4caf50");
  }
  requestAnimationFrame(loop);
}

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  try {
    if (!handLandmarker) {
      status.textContent = "모델 로딩 중…";
      handLandmarker = await createHandLandmarker();
    }
    await startCamera(video);
    status.textContent = "준비 완료. 말·닭·개 인장을 맺어보세요.";
    running = true;
    loop();
  } catch (e) {
    status.textContent = "에러: " + e.message;
    console.error(e);
    startBtn.disabled = false;
  }
});

// render.js — 캔버스에 손·글자·번호를 그리는 함수 모음

import {
  HandLandmarker,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/vision_bundle.mjs";
import { fingersUp } from "./features.js";

// DrawingUtils 인스턴스 생성 (main에서 한 번 만들어 재사용)
export function createDrawer(ctx) {
  return new DrawingUtils(ctx);
}

// 손 뼈대(연결선) + 관절점
export function drawHand(draw, lm, handedness) {
  draw.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, {
    color: handedness === "Left" ? "#00e5ff" : "#ff4081",
    lineWidth: 3,
  });
  draw.drawLandmarks(lm, { color: "#fff", lineWidth: 1, radius: 3 });
}

// 손가락 폄/접힘 상태 텍스트 (거울 상쇄 처리 포함)
export function drawFingerText(ctx, canvas, lm) {
  const st = fingersUp(lm);
  const text = st.map(f => `${f.name}:${f.up ? "폄" : "접힘"}`).join("  ");
  const allUp = st.every(f => f.up);
  ctx.save();
  ctx.translate(canvas.width, 0); // 원점을 오른쪽 끝으로
  ctx.scale(-1, 1);               // 좌우 한 번 더 반전 → CSS 반전 상쇄
  ctx.font = "20px sans-serif";
  ctx.fillStyle = allUp ? "#4caf50" : "#fff";
  ctx.fillText(allUp ? "✋ OPEN PALM" : text, 12, 28);
  ctx.restore();
}

// 화면 중앙에 큰 텍스트 (카운트다운 숫자 등)
export function drawCenterBig(ctx, canvas, text, color = "#fff") {
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1); // 거울 상쇄
  ctx.font = "bold 120px sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  ctx.restore();
}

// 랜드마크 번호(0~20) 표시 — 어느 점이 몇 번인지 눈으로 확인
export function drawIndices(ctx, canvas, lm) {
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1); // 거울 상쇄 (글자 정상 방향)
  ctx.font = "12px monospace";
  ctx.fillStyle = "#ffeb3b";
  for (let k = 0; k < lm.length; k++) {
    const px = lm[k].x * canvas.width;
    const py = lm[k].y * canvas.height;
    ctx.fillText(k, canvas.width - px + 6, py); // 뒤집힌 좌표계라 width-px
  }
  ctx.restore();
}

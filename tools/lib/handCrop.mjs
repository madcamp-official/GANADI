// handCrop.mjs — 프레임에서 손 영역만 잘라 작은 회색조 이미지로 만든다.
//
// ★ 왜 크롭하나
//   ① 배경·옷·벽지를 학습해버리는 것을 막는다. 랜드마크 방식도 조명/카메라에 과적합돼
//      다른 날 33.8%로 무너졌는데, 통짜 이미지는 그 위험이 더 크다.
//   ② 손이 겹쳐 MediaPipe가 한 손만 잡아도, 그 손 주변을 자르면 겹쳐 있는 다른 손이
//      같이 잘려 들어온다. 랜드마크 특징은 45차원이 0으로 사라지지만 픽셀에는 남아 있다.
//      — 이게 이미지로 가는 이유 전체다.

import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';

/** 검출된 모든 손을 감싸는 정사각 박스 (0~1 정규화 좌표) */
export function handBox(hands, { pad = 0.45 } = {}) {
  const pts = hands.flat();
  if (!pts.length) return null;
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // 정사각형으로 맞춘다 — 리사이즈 때 손 비율이 찌그러지지 않게
  const half = (Math.max(x1 - x0, y1 - y0) / 2) * (1 + pad);
  return { cx, cy, half };
}

/**
 * 이미지 파일 → 손 크롭 → size×size 회색조 [0,1] 배열
 * 박스가 프레임 밖으로 나가면 그 부분은 0(검정)으로 채운다.
 */
export function cropToGray(imagePath, hands, size = 48) {
  const box = handBox(hands);
  if (!box) return null;

  const raw = jpeg.decode(readFileSync(imagePath), { useTArray: true });
  const { width: W, height: H, data } = raw; // RGBA

  // 정규화 좌표(0~1)를 픽셀로. x·y 스케일이 다르므로 각각 변환한다
  const px = (box.cx - box.half) * W, py = (box.cy - box.half) * H;
  const pw = box.half * 2 * W, ph = box.half * 2 * H;

  const out = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    const sy = Math.round(py + (j / size) * ph);
    for (let i = 0; i < size; i++) {
      const sx = Math.round(px + (i / size) * pw);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue; // 프레임 밖 → 0
      const o = (sy * W + sx) * 4;
      // 회색조: 색보다 형태가 중요하고, 채널을 줄이면 과적합·연산이 함께 준다
      out[j * size + i] = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) / 255;
    }
  }
  return out;
}

/** 터미널에서 크롭이 제대로 됐는지 눈으로 보는 용도 */
export function asciiPreview(gray, size) {
  const ramp = ' .:-=+*#%@';
  const lines = [];
  for (let j = 0; j < size; j += 2) { // 세로는 2칸에 1줄 (문자가 세로로 길어서)
    let s = '';
    for (let i = 0; i < size; i++) s += ramp[Math.min(9, Math.floor(gray[j * size + i] * 10))];
    lines.push(s);
  }
  return lines.join('\n');
}

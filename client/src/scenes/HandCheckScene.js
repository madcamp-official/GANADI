// 손 인식 준비 관문 (B). 두 손바닥을 펴고 유지하면 준비 완료 → 로비.
// 손 인식은 브라우저 MediaPipe. 디자인: docs/design/02-hand-check.png

import Phaser from 'phaser';
import { createHandLandmarker } from '../recognition/handLandmarker.js';
import { GAME } from '../config.js';
import { drawForest, panel, pill, CSS, C, hiDPI } from '../ui/theme.js';

const HOLD_MS = 1000; // 두 손바닥 유지 시간 (1초)

export default class HandCheckScene extends Phaser.Scene {
  constructor() {
    super('HandCheck');
  }

  async create() {
    hiDPI(this);
    const W = GAME.WIDTH;
    this.landmarker = null;
    this.ready = false;
    this.holdMs = 0;
    this.lastVideoTime = -1;
    this.video = document.getElementById('local-cam');

    drawForest(this);

    // 타이틀
    panel(this, W / 2, 66, 260, 62);
    this.add.text(W / 2, 66, '손 인식 준비', { fontSize: '30px', fontStyle: 'bold', color: CSS.outline }).setOrigin(0.5);

    // 카메라 상태 pill (우상단, DOM 웹캠 창 아래)
    const camOn = !!this.video?.srcObject;
    pill(this, W - 120, 170, camOn ? '● 카메라 연결됨' : '● 카메라 없음', {
      fill: 0x1a2a1e, border: camOn ? C.wind : C.lose, textColor: camOn ? CSS.win : CSS.lose,
    });

    // 가이드 박스 (반투명 + 나무 테두리 + 주황 코너)
    const bw = 700, bh = 400;
    this.box = { x: W / 2 - bw / 2, y: 130 + 40, w: bw, h: bh };
    const bg = this.add.graphics();
    bg.fillStyle(0x142016, 0.35).fillRoundedRect(this.box.x, this.box.y, bw, bh, 16);
    bg.lineStyle(6, C.woodDark, 1).strokeRoundedRect(this.box.x, this.box.y, bw, bh, 16);
    this.corners = this.add.graphics();
    this.drawCorners(C.orange);
    // 손바닥 아이콘 2개
    drawPalm(this.add.graphics(), W / 2 - 120, this.box.y + bh / 2 + 20);
    drawPalm(this.add.graphics(), W / 2 + 120, this.box.y + bh / 2 + 20);

    // 하단 안내 패널 + 홀드 바
    const py = GAME.HEIGHT - 110;
    panel(this, W / 2, py, 900, 130);
    this.status = this.add.text(W / 2, py - 34, '인식기 로딩 중…', {
      fontSize: '22px', fontStyle: 'bold', color: CSS.outline,
    }).setOrigin(0.5);
    this.barX = W / 2 - 400; this.barY = py + 6; this.barW = 800; this.barH = 22;
    this.bar = this.add.graphics();
    this.drawBar(0);
    this.holdText = this.add.text(W / 2, py + 44, '', { fontSize: '16px', fontFamily: 'monospace', color: '#6a5535' }).setOrigin(0.5);

    // 건너뛰기
    this.add.text(W / 2, GAME.HEIGHT - 22, '인식 없이 건너뛰기', {
      fontSize: '14px', color: '#4a5a45',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.goNext());

    if (!camOn) { this.status.setText('⚠ 웹캠 권한을 허용해주세요').setColor(CSS.lose); return; }
    try {
      this.landmarker = await createHandLandmarker();
      this.status.setText('두 손바닥을 펴서 박스 안에 두고 잠깐 유지하세요');
    } catch (e) {
      console.warn('[handcheck] 인식기 로드 실패:', e);
      this.status.setText('⚠ 인식기 로드 실패 — 건너뛰기로 진행하세요').setColor(CSS.lose);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.landmarker = null; });
  }

  update(_t, delta) {
    if (!this.landmarker || this.ready || !this.video) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    let open = 0;
    try {
      const res = this.landmarker.detectForVideo(this.video, performance.now());
      open = (res?.landmarks ?? []).filter(isOpenPalm).length;
    } catch { return; }

    if (open >= 2) {
      this.holdMs = Math.min(HOLD_MS, this.holdMs + delta);
      this.status.setText('좋아요! 유지…').setColor(CSS.win);
      this.drawCorners(C.win);
    } else {
      this.holdMs = 0;
      this.status.setText(open === 1 ? '한 손 더 — 두 손바닥을 펴세요' : '두 손바닥을 박스 안에 펴세요').setColor(CSS.outline);
      this.drawCorners(C.orange);
    }
    const p = this.holdMs / HOLD_MS;
    this.drawBar(p);
    this.holdText.setText(`HOLD ${(this.holdMs / 1000).toFixed(1)}s / ${(HOLD_MS / 1000).toFixed(1)}s` + (p > 0.6 ? '   거의 다 됐어요!' : ''));
    if (this.holdMs >= HOLD_MS) this.onReady();
  }

  onReady() {
    this.ready = true;
    this.status.setText('인식 완료! ✅').setColor(CSS.win);
    this.time.delayedCall(500, () => this.goNext());
  }

  goNext() { this.scene.start('Lobby'); }

  drawBar(p) {
    this.bar.clear();
    this.bar.fillStyle(0x1a1030, 1).fillRoundedRect(this.barX, this.barY, this.barW, this.barH, this.barH / 2);
    if (p > 0) {
      this.bar.fillGradientStyle(C.orange, C.win, C.orange, C.win, 1)
        .fillRoundedRect(this.barX, this.barY, this.barW * p, this.barH, this.barH / 2);
    }
  }

  drawCorners(color) {
    const { x, y, w, h } = this.box, c = 34, t = 7;
    this.corners.clear().lineStyle(t, color, 1);
    const seg = (px, py, sx, sy) => {
      this.corners.beginPath();
      this.corners.moveTo(px, py + sy * c); this.corners.lineTo(px, py); this.corners.lineTo(px + sx * c, py);
      this.corners.strokePath();
    };
    seg(x, y, 1, 1); seg(x + w, y, -1, 1); seg(x, y + h, 1, -1); seg(x + w, y + h, -1, -1);
  }
}

// 손바닥 라인아트 아이콘
function drawPalm(g, x, y) {
  g.lineStyle(6, C.sun, 0.9);
  // 손바닥
  g.strokeRoundedRect(x - 42, y - 10, 84, 90, 24);
  // 손가락 4 + 엄지
  const fx = [-30, -10, 10, 30];
  fx.forEach((dx, i) => {
    const len = i === 0 || i === 3 ? 60 : 78;
    g.lineBetween(x + dx, y - 8, x + dx, y - 8 - len);
  });
  g.lineBetween(x - 40, y + 10, x - 66, y - 18); // 엄지
}

// 열린 손바닥 판정 (거리 기반, 손 방향 무관)
function isOpenPalm(lm) {
  const wrist = lm[0];
  const d = (p) => Math.hypot(p.x - wrist.x, p.y - wrist.y);
  let ext = 0;
  for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) if (d(lm[tip]) > d(lm[pip]) * 1.1) ext += 1;
  return ext >= 4;
}

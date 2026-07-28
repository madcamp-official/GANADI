// 손 인식 준비 관문 (B UI + A 인식기). 두 손바닥을 펴고 잠깐 유지하면 준비 완료 → 로비.
// ★ landmarker를 직접 만들지 않는다 — handTracker 하나만 쓴다 (A 결정).
//   여기서 띄운 추적 루프는 씬이 바뀌어도 계속 돌고, 대전 씬은 registry로 인식기를 집어간다.
// 디자인: docs/design/02-hand-check.png (숲 두루마리 톤)

import Phaser from 'phaser';
import { getHandTracker } from '../recognition/handTracker.js';
import { GAME } from '../config.js';
import { drawForest, panel, pill, CSS, C, hiDPI } from '../ui/theme.js';

const HOLD_MS = 1000; // 두 손바닥 유지 시간

export default class HandCheckScene extends Phaser.Scene {
  constructor() {
    super('HandCheck');
  }

  async create() {
    const W = GAME.WIDTH;
    this.ready = false;
    this.holdMs = 0;
    this.lastFrameMs = null;
    this.unsubscribe = null;

    hiDPI(this);
    drawForest(this);

    panel(this, W / 2, 66, 260, 62);
    this.add.text(W / 2, 66, '손 인식 준비', { fontSize: '30px', fontStyle: 'bold', color: CSS.outline }).setOrigin(0.5);

    const video = document.getElementById('local-cam');
    const camOn = !!video?.srcObject;
    pill(this, W - 120, 170, camOn ? '● 카메라 연결됨' : '● 카메라 없음', {
      fill: 0x1a2a1e, border: camOn ? C.wind : C.lose, textColor: camOn ? CSS.win : CSS.lose,
    });

    // 가이드 박스 + 주황 코너 + 손 아이콘
    const bw = 700, bh = 400;
    this.box = { x: W / 2 - bw / 2, y: 170, w: bw, h: bh };
    const bg = this.add.graphics();
    bg.fillStyle(0x142016, 0.35).fillRoundedRect(this.box.x, this.box.y, bw, bh, 16);
    bg.lineStyle(6, C.woodDark, 1).strokeRoundedRect(this.box.x, this.box.y, bw, bh, 16);
    this.corners = this.add.graphics();
    this.drawCorners(C.orange);
    drawPalm(this.add.graphics(), W / 2 - 120, this.box.y + bh / 2 + 20);
    drawPalm(this.add.graphics(), W / 2 + 120, this.box.y + bh / 2 + 20);

    // 하단 안내 + 홀드 바
    const py = GAME.HEIGHT - 110;
    panel(this, W / 2, py, 900, 130);
    this.status = this.add.text(W / 2, py - 34, '인식기 로딩 중…', { fontSize: '22px', fontStyle: 'bold', color: CSS.outline }).setOrigin(0.5);
    this.barX = W / 2 - 400; this.barY = py + 6; this.barW = 800; this.barH = 22;
    this.bar = this.add.graphics();
    this.drawBar(0);
    this.holdText = this.add.text(W / 2, py + 44, '', { fontSize: '16px', fontFamily: 'monospace', color: '#6a5535' }).setOrigin(0.5);

    this.add.text(W / 2, GAME.HEIGHT - 22, '인식 없이 건너뛰기', { fontSize: '14px', color: '#4a5a45' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.goNext());

    // 씬을 벗어나도 추적 루프는 계속 돈다 — 구독만 끊는다
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.unsubscribe?.(); this.unsubscribe = null; });

    if (!camOn) { this.status.setText('⚠ 웹캠 권한을 허용해주세요').setColor(CSS.lose); return; }
    try {
      const tracker = await getHandTracker(video);
      if (!this.scene.isActive()) return; // 로딩 중 씬을 떠났으면 구독 안 함
      // ★ 대전 씬이 registry.get('recognizer')로 집어간다 (BattleScene.attachRecognizer)
      this.registry.set('recognizer', tracker.recognizer);
      this.registry.set('handTracker', tracker);
      this.status.setText('두 손바닥을 펴서 박스 안에 두고 잠깐 유지하세요');
      this.unsubscribe = tracker.onFrame((frame) => this.onFrame(frame));
    } catch (e) {
      console.warn('[handcheck] 인식기 로드 실패:', e);
      this.status.setText('⚠ 인식기 로드 실패 — 건너뛰기로 진행하세요').setColor(CSS.lose);
    }
  }

  // 추적 루프가 매 프레임 호출. 홀드 시간은 프레임 타임스탬프 차이로 잰다.
  onFrame({ hands, nowMs }) {
    if (this.ready) return;
    const delta = this.lastFrameMs == null ? 0 : nowMs - this.lastFrameMs;
    this.lastFrameMs = nowMs;
    const open = hands.filter(isOpenPalm).length;

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

function drawPalm(g, x, y) {
  g.lineStyle(6, C.sun, 0.9);
  g.strokeRoundedRect(x - 42, y - 10, 84, 90, 24);
  [-30, -10, 10, 30].forEach((dx, i) => {
    const len = i === 0 || i === 3 ? 60 : 78;
    g.lineBetween(x + dx, y - 8, x + dx, y - 8 - len);
  });
  g.lineBetween(x - 40, y + 10, x - 66, y - 18);
}

function isOpenPalm(lm) {
  const wrist = lm[0];
  const d = (p) => Math.hypot(p.x - wrist.x, p.y - wrist.y);
  let ext = 0;
  for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) if (d(lm[tip]) > d(lm[pip]) * 1.1) ext += 1;
  return ext >= 4;
}

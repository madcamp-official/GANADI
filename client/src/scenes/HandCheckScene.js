// 손 인식 준비 관문. 두 손바닥을 펴고 잠깐 유지하면 준비 완료 → 로비.
// 이 씬이 곧 "인식이 이 환경에서 되는지" 점검이자, 손 추적 루프를 처음 띄우는 지점이다.
//
// ★ landmarker를 직접 만들지 않는다 — handTracker 하나만 쓴다 (Step 1 결정).
//   여기서 만들어진 루프는 씬이 바뀌어도 계속 돌고, 대전 씬은 registry로 인식기를 집어간다.

import Phaser from 'phaser';
import { getHandTracker } from '../recognition/handTracker.js';
import { GAME } from '../config.js';

const HOLD_MS = 1000; // 두 손바닥 유지 시간

export default class HandCheckScene extends Phaser.Scene {
  constructor() {
    super('HandCheck');
  }

  async create() {
    this.ready = false;
    this.holdMs = 0;
    this.lastFrameMs = null;
    this.unsubscribe = null;

    this.add.text(GAME.WIDTH / 2, 70, '준비', {
      fontSize: '44px', fontStyle: 'bold', color: '#e8d8ff',
    }).setOrigin(0.5);
    this.add.text(GAME.WIDTH / 2, 125,
      '두 손바닥을 펴서 아래 박스 안에 들고 잠깐 유지하세요', {
        fontSize: '18px', color: '#7a6a95',
      }).setOrigin(0.5);

    // 가이드 박스
    const boxW = 560, boxH = 300;
    this.box = { x: GAME.WIDTH / 2 - boxW / 2, y: GAME.HEIGHT / 2 - boxH / 2 + 10, w: boxW, h: boxH };
    this.gfx = this.add.graphics();
    this.drawBox(0x6c4bd6);

    this.hands = this.add.text(GAME.WIDTH / 2, this.box.y + boxH / 2, '✋  ✋', {
      fontSize: '64px', color: '#3a2f55',
    }).setOrigin(0.5);

    this.status = this.add.text(GAME.WIDTH / 2, this.box.y + boxH + 40, '인식기 로딩 중…', {
      fontSize: '20px', color: '#c9b8ee',
    }).setOrigin(0.5);

    // 홀드 진행 바
    this.barBg = this.add.rectangle(GAME.WIDTH / 2, this.box.y + boxH + 78, 400, 14, 0x1a1030).setOrigin(0.5);
    this.bar = this.add.rectangle(GAME.WIDTH / 2 - 200, this.box.y + boxH + 78, 0, 14, 0x8fffa0).setOrigin(0, 0.5);

    // 막힘 방지용 건너뛰기 (인식 안 될 때 탈출구)
    this.skip = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT - 40, '인식 없이 건너뛰기', {
      fontSize: '15px', color: '#5a4f75',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.skip.on('pointerdown', () => this.goNext());

    // 씬을 벗어나도 추적 루프는 계속 돈다 — 구독만 끊는다
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    });

    const video = document.getElementById('local-cam');
    if (!video?.srcObject) {
      this.status.setText('⚠ 웹캠이 없어요 — 카메라 권한을 허용해주세요').setColor('#ff9a9a');
      return;
    }

    try {
      const tracker = await getHandTracker(video);
      if (!this.scene.isActive()) return; // 로딩 중 씬을 떠났으면 구독하지 않는다

      // ★ 대전 씬이 registry.get('recognizer')로 집어간다 (BattleScene.attachRecognizer)
      this.registry.set('recognizer', tracker.recognizer);
      this.registry.set('handTracker', tracker);

      this.status.setText('두 손바닥을 펴세요');
      this.unsubscribe = tracker.onFrame((frame) => this.onFrame(frame));
    } catch (e) {
      console.warn('[handcheck] 인식기 로드 실패:', e);
      this.status.setText('⚠ 인식기 로드 실패 — 건너뛰기로 진행하세요').setColor('#ff9a9a');
    }
  }

  // 추적 루프가 매 프레임 호출. 홀드 시간은 프레임 타임스탬프 차이로 잰다
  // (Phaser update의 delta를 쓰면 추론이 안 돈 프레임까지 세어 실제보다 빨리 찬다).
  onFrame({ hands, nowMs }) {
    if (this.ready) return;

    const delta = this.lastFrameMs == null ? 0 : nowMs - this.lastFrameMs;
    this.lastFrameMs = nowMs;

    const openCount = hands.filter(isOpenPalm).length;

    if (openCount >= 2) {
      this.holdMs = Math.min(HOLD_MS, this.holdMs + delta);
      const left = ((HOLD_MS - this.holdMs) / 1000).toFixed(1);
      this.status.setText(`좋아요! 유지… ${left}s`).setColor('#8fffa0');
      this.drawBox(0x8fffa0);
    } else {
      this.holdMs = 0;
      this.status.setText(openCount === 1 ? '한 손 더 — 두 손바닥을 펴세요' : '두 손바닥을 박스 안에 펴세요')
        .setColor('#c9b8ee');
      this.drawBox(0x6c4bd6);
    }

    this.bar.width = 400 * (this.holdMs / HOLD_MS);

    if (this.holdMs >= HOLD_MS) this.onReady();
  }

  onReady() {
    this.ready = true;
    this.status.setText('인식 완료! ✅').setColor('#8fffa0');
    this.hands.setColor('#8fffa0');
    this.time.delayedCall(600, () => this.goNext());
  }

  goNext() {
    // 매칭 타이밍 유지 위해 이 관문은 로비 앞에 둔다.
    this.scene.start('Lobby');
  }

  drawBox(color) {
    const { x, y, w, h } = this.box;
    this.gfx.clear();
    this.gfx.lineStyle(4, color, 0.95);
    this.gfx.strokeRoundedRect(x, y, w, h, 16);
  }
}

// 열린 손바닥 판정 — 검지·중지·약지·새끼 끝이 손목에서 각 PIP보다 멀면 펴진 것.
// 손 방향과 무관하게 동작 (거리 기반).
function isOpenPalm(lm) {
  const wrist = lm[0];
  const d = (p) => Math.hypot(p.x - wrist.x, p.y - wrist.y);
  const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]]; // [tip, pip]
  let extended = 0;
  for (const [tip, pip] of fingers) if (d(lm[tip]) > d(lm[pip]) * 1.1) extended += 1;
  return extended >= 4;
}

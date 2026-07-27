// 인장 도감 — 12지신 전부 노출 (§4.5). 실전 제외 인장도 도감엔 표시.
// 난이도별 색으로 구분 (§4.1: 쉬움/중간/어려움).

import Phaser from 'phaser';
import { ALL_SEALS } from '../data/seals.js';
import { GAME } from '../config.js';

const DIFF = {
  horizontal: { label: '쉬움', color: 0x5ad18a },
  vertical:   { label: '중간', color: 0xf2c94c },
  interlock:  { label: '어려움', color: 0xff6b6b },
};

export default class CodexScene extends Phaser.Scene {
  constructor() {
    super('Codex');
  }

  create() {
    this.add.text(GAME.WIDTH / 2, 60, '인장 도감 · 十二支', {
      fontSize: '40px', fontStyle: 'bold', color: '#e8d8ff',
    }).setOrigin(0.5);
    this.add.text(GAME.WIDTH / 2, 105, '십이지 12인장', {
      fontSize: '16px', color: '#7a6a95',
    }).setOrigin(0.5);

    // 4열 x 3행 그리드
    const cols = 4, cardW = 200, cardH = 150, gapX = 28, gapY = 24;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (GAME.WIDTH - totalW) / 2 + cardW / 2;
    const startY = 200;

    ALL_SEALS.forEach((seal, i) => {
      const cx = startX + (i % cols) * (cardW + gapX);
      const cy = startY + Math.floor(i / cols) * (cardH + gapY);
      const diff = DIFF[seal.difficulty] ?? DIFF.vertical;

      this.add.rectangle(cx, cy, cardW, cardH, 0x2a2140).setStrokeStyle(2, diff.color);
      this.add.text(cx, cy - 30, seal.kanji, { fontSize: '52px', color: '#e8d8ff' }).setOrigin(0.5);
      this.add.text(cx, cy + 32, seal.name, { fontSize: '22px', color: '#fff' }).setOrigin(0.5);
      this.add.text(cx + cardW / 2 - 8, cy - cardH / 2 + 8, diff.label, {
        fontSize: '13px', color: '#1a1420', backgroundColor: rgb(diff.color), padding: { x: 6, y: 2 },
      }).setOrigin(1, 0);
    });

    // 범례
    this.add.text(GAME.WIDTH / 2, GAME.HEIGHT - 80,
      '난이도  ·  초록 쉬움  ·  노랑 중간  ·  빨강 어려움 (맞물림형)', {
        fontSize: '15px', color: '#7a6a95',
      }).setOrigin(0.5);

    const back = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT - 40, '← 돌아가기', {
      fontSize: '22px', color: '#fff', backgroundColor: '#6c4bd6', padding: { x: 24, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start('Lobby'));
  }
}

function rgb(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

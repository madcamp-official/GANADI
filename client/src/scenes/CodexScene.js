// 인장 도감 — 12지신 전부 노출 (§4.5). 난이도별 테두리색, 실전 투입 인장엔 "대표 인장" 배지.
// 디자인: docs/design/06-seal-codex.png

import Phaser from 'phaser';
import { ALL_SEALS } from '../data/seals.js';
import { GAME } from '../config.js';
import { drawForest, panel, button, DIFF, CSS, C, hex, hiDPI } from '../ui/theme.js';

// 현재 실전 투입 인장 (서버 sequence.js의 PLAYABLE_SEALS와 맞춤 — Day5에 확정)
const PLAYABLE = ['horse', 'dog', 'rooster'];

export default class CodexScene extends Phaser.Scene {
  constructor() {
    super('Codex');
  }

  create() {
    hiDPI(this);
    const W = GAME.WIDTH;
    drawForest(this);

    // 타이틀 패널 "인장 도감 | 十二支"
    panel(this, W / 2, 62, 320, 66);
    this.add.text(W / 2 - 26, 62, '인장 도감', { fontSize: '30px', fontStyle: 'bold', color: CSS.outline }).setOrigin(0.5);
    this.add.text(W / 2 + 40, 62, '｜', { fontSize: '28px', color: '#b9a888' }).setOrigin(0.5);
    this.add.text(W / 2 + 96, 62, '十二支', { fontSize: '28px', fontStyle: 'bold', color: CSS.orange }).setOrigin(0.5);

    // 난이도 범례
    const legend = [['쉬움', C.wind], ['보통', C.elec], ['어려움', C.lose]];
    legend.forEach(([label, color], i) => {
      const lx = W / 2 - 150 + i * 150;
      const g = this.add.graphics();
      g.fillStyle(0x2a3a2b, 0.85).fillRoundedRect(lx - 55, 108, 110, 32, 16);
      g.fillStyle(color, 1).fillRoundedRect(lx - 42, 118, 14, 14, 3);
      this.add.text(lx + 6, 124, label, { fontSize: '15px', color: CSS.scroll }).setOrigin(0.5);
    });

    // 4×3 그리드 (1280×720 안에 맞춤)
    const cols = 4, cardW = 282, cardH = 130, gapX = 20, gapY = 16;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (W - totalW) / 2 + cardW / 2;
    const startY = 256;

    ALL_SEALS.forEach((seal, i) => {
      const cx = startX + (i % cols) * (cardW + gapX);
      const cy = startY + Math.floor(i / cols) * (cardH + gapY);
      const diff = DIFF[seal.difficulty] ?? DIFF.vertical;

      panel(this, cx, cy, cardW, cardH, { border: diff.color, borderWidth: 4, radius: 12 });
      this.add.text(cx - cardW / 2 + 42, cy, seal.kanji, {
        fontSize: '56px', fontStyle: 'bold', color: CSS.outline,
      }).setOrigin(0.5);
      this.add.text(cx - cardW / 2 + 86, cy - 16, seal.name, {
        fontSize: '24px', fontStyle: 'bold', color: CSS.outline,
      }).setOrigin(0, 0.5);
      this.add.text(cx - cardW / 2 + 86, cy + 20, `${seal.id} · ${diff.label}`, {
        fontSize: '14px', fontFamily: 'monospace', color: '#6a5535',
      }).setOrigin(0, 0.5);

      if (PLAYABLE.includes(seal.id)) {
        const bx = cx + cardW / 2 - 46, by = cy - cardH / 2 + 2;
        const g = this.add.graphics();
        g.fillStyle(C.orange, 1).fillRoundedRect(bx - 42, by - 13, 84, 26, 13);
        this.add.text(bx, by, '대표 인장', { fontSize: '13px', fontStyle: 'bold', color: CSS.scroll }).setOrigin(0.5);
      }
    });

    // 돌아가기
    const back = button(this, W / 2, GAME.HEIGHT - 40, 220, 54, '← 돌아가기', { fontSize: '22px' });
    back.zone.on('pointerdown', () => this.scene.start('Lobby'));
    void hex;
  }
}

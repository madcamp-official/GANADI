// 인장 도감 — 12지신 전부 노출 (§4.5). 난이도별 테두리색, 실전 투입 인장엔 "대표 인장" 배지.
// 디자인: docs/design/06-seal-codex.png

import Phaser from 'phaser';
import { ALL_SEALS } from '../data/seals.js';
import { PLAYABLE_SEAL_IDS, SEAL_IDS } from '../../../shared/constants.js';
import { GAME } from '../config.js';
import { drawForest, panel, button, DIFF, CSS, C, hex, hiDPI, KANJI_FONT } from '../ui/theme.js';

// 실전 투입 인장 (shared 단일 출처). 전종이면 배지 생략(모두 실전이라 표시 의미 없음).
const PLAYABLE = PLAYABLE_SEAL_IDS;
const SHOW_BADGE = PLAYABLE_SEAL_IDS.length < SEAL_IDS.length;

// 손동작 이미지 파일명 (client/public/board/<파일>.jpg). seal id와 다른 것만 매핑.
const BOARD_FILE = { rat: 'mouse', rooster: 'bird' };
const boardFile = (id) => BOARD_FILE[id] ?? id;

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
    this.add.text(W / 2 + 96, 62, '十二支', { fontFamily: KANJI_FONT, fontSize: '28px', fontStyle: 'bold', color: CSS.orange }).setOrigin(0.5);

    // 난이도 범례
    const legend = [['쉬움', C.wind], ['보통', C.elec], ['어려움', C.lose]];
    legend.forEach(([label, color], i) => {
      const lx = W / 2 - 150 + i * 150;
      const g = this.add.graphics();
      g.fillStyle(0x2a3a2b, 0.85).fillRoundedRect(lx - 55, 108, 110, 32, 16);
      g.fillStyle(color, 1).fillRoundedRect(lx - 42, 118, 14, 14, 3);
      this.add.text(lx + 6, 124, label, { fontSize: '15px', color: CSS.scroll }).setOrigin(0.5);
    });

    this.add.text(W / 2, 164, '카드를 누르면 손동작을 볼 수 있어요', { fontSize: '14px', color: CSS.sun }).setOrigin(0.5);

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
        fontFamily: KANJI_FONT, fontSize: '56px', fontStyle: 'bold', color: CSS.outline,
      }).setOrigin(0.5);
      this.add.text(cx - cardW / 2 + 86, cy - 16, seal.name, {
        fontSize: '24px', fontStyle: 'bold', color: CSS.outline,
      }).setOrigin(0, 0.5);
      this.add.text(cx - cardW / 2 + 86, cy + 20, `${seal.id} · ${diff.label}`, {
        fontSize: '14px', fontFamily: 'monospace', color: '#6a5535',
      }).setOrigin(0, 0.5);

      if (SHOW_BADGE && PLAYABLE.includes(seal.id)) {
        const bx = cx + cardW / 2 - 46, by = cy - cardH / 2 + 2;
        const g = this.add.graphics();
        g.fillStyle(C.orange, 1).fillRoundedRect(bx - 42, by - 13, 84, 26, 13);
        this.add.text(bx, by, '대표 인장', { fontSize: '13px', fontStyle: 'bold', color: CSS.scroll }).setOrigin(0.5);
      }

      // 카드 클릭 → 손동작 이미지 팝업
      this.add.zone(cx, cy, cardW, cardH).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.showGesture(seal));
    });

    // 돌아가기
    const back = button(this, W / 2, GAME.HEIGHT - 40, 220, 54, '← 돌아가기', { fontSize: '22px' });
    back.zone.on('pointerdown', () => (this.modalObjs ? this.closeModal() : this.scene.start('Lobby')));
    void hex;
  }

  // 손동작 이미지를 필요할 때 로드해서 팝업으로 표시
  showGesture(seal) {
    const key = `board-${seal.id}`;
    if (this.textures.exists(key)) return this.openModal(seal, key);
    this.load.image(key, `/board/${boardFile(seal.id)}.jpg`);
    this.load.once('complete', () => { if (this.scene.isActive()) this.openModal(seal, key); });
    this.load.once('loaderror', () => console.warn('[codex] 손동작 이미지 로드 실패:', seal.id));
    this.load.start();
  }

  openModal(seal, key) {
    this.closeModal();
    const cw = GAME.WIDTH, ch = GAME.HEIGHT;
    const bg = this.add.rectangle(cw / 2, ch / 2, cw, ch, 0x120f08, 0.78).setDepth(200)
      .setInteractive({ useHandCursor: true });
    const pg = panel(this, cw / 2, ch / 2 - 4, 560, 600).setDepth(201);
    // 한자 + 이름을 한 덩어리로 중앙 정렬
    const hy = ch / 2 - 250, gap = 14;
    const kanji = this.add.text(0, hy, seal.kanji, {
      fontFamily: KANJI_FONT, fontSize: '48px', fontStyle: 'bold', color: CSS.outline,
    }).setOrigin(0, 0.5).setDepth(202);
    const name = this.add.text(0, hy, seal.name, {
      fontSize: '34px', fontStyle: 'bold', color: CSS.outline,
    }).setOrigin(0, 0.5).setDepth(202);
    const startX = cw / 2 - (kanji.width + gap + name.width) / 2;
    kanji.x = startX;
    name.x = startX + kanji.width + gap;
    const img = this.add.image(cw / 2, ch / 2 + 20, key).setDepth(202);
    img.setScale(Math.min(440 / img.width, 400 / img.height));
    const hint = this.add.text(cw / 2, ch / 2 + 262, '아무 곳이나 눌러 닫기', {
      fontSize: '15px', color: '#8A6B4A',
    }).setOrigin(0.5).setDepth(202);

    this.modalObjs = [bg, pg, kanji, name, img, hint];
    bg.on('pointerdown', () => this.closeModal());
  }

  closeModal() {
    if (!this.modalObjs) return;
    this.modalObjs.forEach((o) => o.destroy());
    this.modalObjs = null;
  }
}

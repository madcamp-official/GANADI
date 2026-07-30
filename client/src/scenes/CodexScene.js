// 인장 도감 — 12지신 전부 노출 (§4.5). 난이도별 테두리색, 실전 투입 인장엔 "대표 인장" 배지.
// 디자인: docs/design/06-seal-codex.png

import Phaser from 'phaser';
import { ALL_SEALS } from '../data/seals.js';
import { PLAYABLE_SEAL_IDS, SEAL_IDS } from '../../../shared/constants.js';
import { GAME } from '../config.js';
import { pauseHandTracker } from '../recognition/handTracker.js';
import { drawForest, panel, button, DIFF, CSS, C, hex, hiDPI, KANJI_FONT } from '../ui/theme.js';

// 실전 투입 인장 (shared 단일 출처). 전종이면 배지 생략(모두 실전이라 표시 의미 없음).
const PLAYABLE = PLAYABLE_SEAL_IDS;
const SHOW_BADGE = PLAYABLE_SEAL_IDS.length < SEAL_IDS.length;

// 손동작 이미지 파일명 (client/public/board/<파일>.jpg). seal id와 다른 것만 매핑.
const BOARD_FILE = { rat: 'mouse', rooster: 'bird' };
const boardFile = (id) => BOARD_FILE[id] ?? id;

/**
 * 손동작 자료 후보 — 앞에서부터 시도하고, 파일이 없으면 다음으로 넘어간다.
 * 움직이는 시범(gif)이 있으면 그걸 쓰고, 없는 인장은 기존 사진(jpg)으로 폴백한다.
 * gif 파일명이 seal id인지 board 매핑명(mouse·bird)인지 확정되지 않아 둘 다 시도한다.
 */
const mediaSources = (id) => [
  `/gif/${id}.gif`,
  `/gif/${boardFile(id)}.gif`,
  `/board/${boardFile(id)}.jpg`,
];

// 팝업 안 자료 박스. object-fit:contain — gif/jpg 비율이 달라도 찌그러지지 않는다.
const styMedia = 'width:440px;height:400px;object-fit:contain;display:block;';

export default class CodexScene extends Phaser.Scene {
  constructor() {
    super('Codex');
  }

  create() {
    hiDPI(this);
    pauseHandTracker(); // 도감을 보는 동안 GPU 추론을 돌릴 이유가 없다
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

    // ESC — 팝업이 떠 있으면 닫고, 아니면 로비로. 클릭 말고도 나갈 길을 준다.
    this.input.keyboard.on('keydown-ESC', () => (this.modalObjs ? this.closeModal() : this.scene.start('Lobby')));
    void hex;
  }

  // 손동작 자료를 팝업으로 표시 (로드는 DOM <img>가 알아서 한다)
  showGesture(seal) {
    this.openModal(seal);
  }

  openModal(seal) {
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
    // ★ Phaser 텍스처가 아니라 DOM <img>로 띄운다 — load.image는 gif의 첫 프레임만 구워서
    //   움직이지 않는다. DOM에 맡기면 브라우저가 알아서 애니메이션을 재생한다.
    const media = this.add.dom(cw / 2, ch / 2 + 20).createFromHTML(`<img style="${styMedia}" />`);
    media.setDepth(202);
    const el = media.node.querySelector('img');
    this.loadMedia(el, seal.id);
    // DOM은 캔버스 위에 떠 있어 bg의 pointerdown이 안 닿는다 — 자료 위 클릭도 닫히게 직접 건다
    el.style.cursor = 'pointer';
    el.onclick = () => this.closeModal();

    const hint = this.add.text(cw / 2, ch / 2 + 262, '아무 곳이나 눌러 닫기', {
      fontSize: '15px', color: '#8A6B4A',
    }).setOrigin(0.5).setDepth(202);

    this.modalObjs = [bg, pg, kanji, name, media, hint];
    bg.on('pointerdown', () => this.closeModal());
  }

  // 후보 경로를 순서대로 시도한다. 404면 onerror가 다음 후보로 넘긴다.
  loadMedia(el, sealId) {
    const sources = mediaSources(sealId);
    let i = 0;
    const tryNext = () => {
      if (i >= sources.length) {
        el.style.display = 'none'; // 자료가 아예 없는 인장 — 깨진 이미지 아이콘 대신 빈칸
        console.warn('[codex] 손동작 자료 없음:', sealId);
        return;
      }
      el.src = sources[i++];
    };
    el.onerror = tryNext;
    tryNext();
  }

  closeModal() {
    if (!this.modalObjs) return;
    this.modalObjs.forEach((o) => o.destroy());
    this.modalObjs = null;
  }
}

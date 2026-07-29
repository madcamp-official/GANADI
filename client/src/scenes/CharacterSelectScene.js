// 캐릭터 선택 (4종, 스탯 동일·스킨만). 선택 후 registry 저장 → 손 인식 관문(HandCheck).
// 디자인: docs/design/01-character-select.png

import Phaser from 'phaser';
import { CHARACTERS, spriteKey } from '../data/characters.js';
import { GAME } from '../config.js';
import { drawForest, panel, button, inkStamp, pill, CSS, C, hiDPI } from '../ui/theme.js';

export default class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super('CharacterSelect');
  }

  create() {
    hiDPI(this);
    const W = GAME.WIDTH;
    drawForest(this);

    // 타이틀 패널 + 印
    panel(this, W / 2 - 24, 70, 300, 74, { radius: 12 });
    this.add.text(W / 2 - 54, 70, '캐릭터 선택', {
      fontSize: '34px', fontStyle: 'bold', color: CSS.outline,
    }).setOrigin(0.5);
    inkStamp(this, W / 2 + 92, 70, 40);
    this.add.text(W / 2, 130, '스탯은 모두 같아요 — 마음에 드는 가나디를 고르세요', {
      fontSize: '17px', color: CSS.sun,
    }).setOrigin(0.5);

    // 4장 카드
    const cardW = 260, cardH = 420, gap = 32;
    const totalW = CHARACTERS.length * cardW + (CHARACTERS.length - 1) * gap;
    const startX = (W - totalW) / 2 + cardW / 2;
    const cy = 400;

    this.selectedId = null;
    this.cards = [];

    CHARACTERS.forEach((ch, i) => {
      const cx = startX + i * (cardW + gap);
      const g = panel(this, cx, cy, cardW, cardH, { radius: 14 });
      this.add.text(cx, cy - cardH / 2 + 40, `${ch.name} · ${ch.element}`, {
        fontSize: '24px', fontStyle: 'bold', color: CSS.outline,
      }).setOrigin(0.5);
      const spr = this.add.image(cx, cy - 20, spriteKey(ch.id));
      fitSprite(spr, 190, 230);
      this.add.text(cx, cy + cardH / 2 - 54, ch.desc, {
        fontSize: '15px', color: '#6a5535', align: 'center',
        wordWrap: { width: cardW - 40 },
      }).setOrigin(0.5);

      // 선택 강조용 테두리 + 배지 (처음엔 숨김)
      const hi = this.add.graphics().setVisible(false);
      hi.lineStyle(6, C.orange, 1).strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 14);
      const badge = inkStamp(this, cx + cardW / 2 - 18, cy - cardH / 2 - 6, 44);
      badge.g.setVisible(false); badge.t.setVisible(false);

      const zone = this.add.zone(cx, cy, cardW, cardH).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.select(ch.id));
      this.cards.push({ id: ch.id, hi, badge });
    });

    // 하단: 고른 닌자 pill + 선택 완료 버튼
    this.setChosenPill('닌자를 고르세요');
    this.confirm = button(this, W / 2 + 90, GAME.HEIGHT - 54, 260, 62, '선택 완료', { color: C.scrollDark, fontSize: '24px' });
    this.confirm.zone.disableInteractive();
    this.confirm.t.setColor('#9a8a6a');
  }

  select(id) {
    this.selectedId = id;
    console.log('[select] 내 캐릭터 선택 =', id);
    this.registry.set('character', id);
    const ch = CHARACTERS.find((c) => c.id === id);

    this.cards.forEach((card) => {
      const on = card.id === id;
      card.hi.setVisible(on);
      card.badge.g.setVisible(on); card.badge.t.setVisible(on);
    });

    this.setChosenPill(`고른 닌자  ${ch.name} · ${ch.element}`);
    // 확인 버튼 활성화
    this.confirm.g.clear();
    const w = 260, h = 62, x = GAME.WIDTH / 2 + 90 - w / 2, y = GAME.HEIGHT - 54 - h / 2;
    this.confirm.g.fillStyle(C.woodShadow, 1).fillRoundedRect(x, y + 6, w, h, 10);
    this.confirm.g.fillStyle(C.scroll, 1).fillRoundedRect(x, y, w, h, 10);
    this.confirm.g.lineStyle(4, C.orange, 1).strokeRoundedRect(x, y, w, h, 10);
    this.confirm.t.setColor(CSS.outline);
    this.confirm.zone.setInteractive({ useHandCursor: true }).off('pointerdown')
      .on('pointerdown', () => this.scene.start('HandCheck'));
  }

  // pill을 새 텍스트 크기에 맞게 다시 그림 (setText만 하면 배경이 고정이라 글자가 튀어나온다)
  setChosenPill(text) {
    if (this.chosenPill) { this.chosenPill.g.destroy(); this.chosenPill.t.destroy(); }
    this.chosenPill = pill(this, GAME.WIDTH / 2 - 210, GAME.HEIGHT - 54, text, { fill: 0x2a3a2b });
  }
}

// 스프라이트를 박스 안에 비율 유지로 맞춤
function fitSprite(spr, maxW, maxH) {
  const s = Math.min(maxW / spr.width, maxH / spr.height);
  spr.setScale(s);
}

// 캐릭터 선택 (4종, 스탯 동일·스킨만 차이). 선택하면 registry에 저장 후 캘리브레이션으로.

import Phaser from 'phaser';
import { CHARACTERS } from '../data/characters.js';
import { GAME } from '../config.js';

export default class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super('CharacterSelect');
  }

  create() {
    this.add.text(GAME.WIDTH / 2, 90, '캐릭터 선택', {
      fontSize: '48px', fontStyle: 'bold', color: '#e8d8ff',
    }).setOrigin(0.5);
    this.add.text(GAME.WIDTH / 2, 145, '스탯은 모두 동일 — 마음에 드는 닌자를 골라라', {
      fontSize: '18px', color: '#7a6a95',
    }).setOrigin(0.5);

    const cardW = 200, cardH = 260, gap = 40;
    const n = CHARACTERS.length;
    const totalW = n * cardW + (n - 1) * gap;
    const startX = (GAME.WIDTH - totalW) / 2 + cardW / 2;
    const y = GAME.HEIGHT / 2 + 20;

    this.cards = [];
    this.selectedId = null;

    CHARACTERS.forEach((ch, i) => {
      const x = startX + i * (cardW + gap);
      const card = this.add.container(x, y);

      const bg = this.add.rectangle(0, 0, cardW, cardH, 0x2a2140)
        .setStrokeStyle(3, 0x4a3f66).setInteractive({ useHandCursor: true });
      const avatar = this.add.rectangle(0, -40, 120, 120, ch.color).setStrokeStyle(2, 0xffffff);
      const name = this.add.text(0, 55, ch.name, { fontSize: '28px', color: '#fff' }).setOrigin(0.5);
      const elem = this.add.text(0, 95, ch.element, { fontSize: '18px', color: '#c9b8ee' }).setOrigin(0.5);

      card.add([bg, avatar, name, elem]);
      card.setData('id', ch.id);
      card.setData('bg', bg);
      this.cards.push(card);

      bg.on('pointerover', () => { if (this.selectedId !== ch.id) bg.setStrokeStyle(3, 0x8a7ab5); });
      bg.on('pointerout', () => { if (this.selectedId !== ch.id) bg.setStrokeStyle(3, 0x4a3f66); });
      bg.on('pointerdown', () => this.select(ch.id));
    });

    this.confirmBtn = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT - 60, '선택 완료', {
      fontSize: '26px', color: '#6a5d85', backgroundColor: '#241c36',
      padding: { x: 32, y: 12 },
    }).setOrigin(0.5);
  }

  select(id) {
    this.selectedId = id;
    this.cards.forEach((card) => {
      const bg = card.getData('bg');
      const on = card.getData('id') === id;
      bg.setStrokeStyle(on ? 4 : 3, on ? 0xb79dff : 0x4a3f66);
      bg.setFillStyle(on ? 0x3a2f55 : 0x2a2140);
    });

    // 선택 저장 + 진행 버튼 활성화
    this.registry.set('character', id);
    this.confirmBtn.setColor('#fff').setBackgroundColor('#6c4bd6')
      .setInteractive({ useHandCursor: true })
      .off('pointerdown')
      .on('pointerdown', () => this.scene.start('HandCheck'));
  }
}

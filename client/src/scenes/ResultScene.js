// 승패 연출 + 로비 복귀.

import Phaser from 'phaser';
import { GAME } from '../config.js';

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data) {
    const won = !!data?.won;

    const title = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT / 2 - 60, won ? '승리' : '패배', {
      fontSize: '96px', fontStyle: 'bold', color: won ? '#8fffa0' : '#ff6b6b',
    }).setOrigin(0.5);
    // 등장 트윈 (튀어나오며)
    title.setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 450, ease: 'Back.out' });

    this.add.text(GAME.WIDTH / 2, GAME.HEIGHT / 2 + 30,
      won ? '인술을 완성했다!' : '다음엔 더 빠르게…', {
        fontSize: '24px', color: '#c9b8ee',
      }).setOrigin(0.5);

    const btn = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT / 2 + 120, '로비로', {
      fontSize: '26px', color: '#fff', backgroundColor: '#6c4bd6',
      padding: { x: 28, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.scene.start('Lobby'));

    if (won) this.celebrate();
    else this.cameras.main.shake(300, 0.004);
  }

  // 승리: 위에서 색종이처럼 파티클이 쏟아짐 (런타임 'spark' 텍스처 재사용)
  celebrate() {
    if (!this.textures.exists('spark')) return;
    const colors = [0x8fffa0, 0xffe08a, 0x8fd3ff, 0xb79dff, 0xff9ad5];
    this.add.particles(0, -20, 'spark', {
      x: { min: 0, max: GAME.WIDTH },
      y: -20,
      speedY: { min: 120, max: 320 },
      speedX: { min: -60, max: 60 },
      lifespan: 2600,
      scale: { start: 0.9, end: 0.2 },
      quantity: 3,
      frequency: 60,
      tint: colors,
      blendMode: 'ADD',
    });
  }
}

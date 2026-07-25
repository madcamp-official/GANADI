// 승패 연출 + 로비 복귀.

import Phaser from 'phaser';
import { GAME } from '../config.js';

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data) {
    const won = !!data?.won;

    this.add.text(GAME.WIDTH / 2, GAME.HEIGHT / 2 - 60, won ? '승리' : '패배', {
      fontSize: '96px', fontStyle: 'bold', color: won ? '#8fffa0' : '#ff6b6b',
    }).setOrigin(0.5);

    this.add.text(GAME.WIDTH / 2, GAME.HEIGHT / 2 + 30,
      won ? '인술을 완성했다!' : '다음엔 더 빠르게…', {
        fontSize: '24px', color: '#c9b8ee',
      }).setOrigin(0.5);

    const btn = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT / 2 + 120, '로비로', {
      fontSize: '26px', color: '#fff', backgroundColor: '#6c4bd6',
      padding: { x: 28, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerdown', () => this.scene.start('Lobby'));
  }
}

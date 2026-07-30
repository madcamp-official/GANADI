// 승패 연출 + 로비 복귀. 디자인: docs/design/05-result.png

import Phaser from 'phaser';
import { GAME } from '../config.js';
import { pauseHandTracker } from '../recognition/handTracker.js';
import { getCharacter, spriteKey } from '../data/characters.js';
import { drawForest, button, pill, CSS, C, hex, hiDPI, FONT } from '../ui/theme.js';

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data) {
    hiDPI(this);
    pauseHandTracker(); // 결과 화면에선 인식 불필요
    const W = GAME.WIDTH, won = !!data?.won;
    drawForest(this);

    // 타이틀 (그림자 + 팝 트윈)
    const title = this.add.text(W / 2, 110, won ? '승리' : '패배', {
      fontFamily: FONT, fontSize: '104px', fontStyle: 'bold',
      color: won ? CSS.win : CSS.lose,
    }).setOrigin(0.5).setShadow(0, 8, hex(C.woodShadow), 0, true, true);
    title.setScale(0.4).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 450, ease: 'Back.out' });

    // 캐릭터 스프라이트
    const me = getCharacter(this.registry.get('character'));
    const spr = this.add.image(W / 2, 350, spriteKey(me.id));
    const s = Math.min(280 / spr.width, 280 / spr.height);
    spr.setScale(s * 0.4).setAlpha(0);
    this.tweens.add({ targets: spr, scale: s, alpha: 1, duration: 500, ease: 'Back.out', delay: 150 });
    if (!won) spr.setAngle(8); // 패배: 살짝 기울임

    // 서브 pill
    pill(this, W / 2, 560, won ? `${me.name} · 인술을 완성했다!` : '다음엔 더 빠르게…', {
      fill: 0x2a3a2b, textColor: won ? CSS.win : CSS.scroll, bold: true,
    });

    // 로비로
    const back = button(this, W / 2, 648, 240, 62, '로비로', { fontSize: '26px' });
    back.zone.on('pointerdown', () => this.scene.start('Lobby'));

    if (won) this.celebrate();
    else this.cameras.main.shake(300, 0.004);
  }

  // 승리 색종이 (BootScene의 'spark' 텍스처 재사용)
  celebrate() {
    if (!this.textures.exists('spark')) return;
    this.add.particles(0, -20, 'spark', {
      x: { min: 0, max: GAME.WIDTH }, y: -20,
      speedY: { min: 120, max: 320 }, speedX: { min: -60, max: 60 },
      lifespan: 2600, scale: { start: 0.9, end: 0.2 }, quantity: 3, frequency: 60,
      tint: [C.orange, C.elec, C.wind, C.win, 0xff9ad5], blendMode: 'ADD',
    });
  }
}

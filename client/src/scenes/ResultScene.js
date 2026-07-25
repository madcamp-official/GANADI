// 승패 연출. 재대전/로비 복귀.

import Phaser from 'phaser';

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data) {
    const win = data?.winner; // 내 승리 여부는 registry의 내 id와 비교
    this.add.text(40, 40, '결과', { fontSize: '48px' });
    // TODO: 승/패 연출, "로비로" 버튼 → this.scene.start('Lobby').
  }
}

// 캐릭터 선택 (4종, 스탯 동일·스킨만 차이). 선택 후 캘리브레이션으로.

import Phaser from 'phaser';

export default class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super('CharacterSelect');
  }

  create() {
    this.add.text(40, 40, '캐릭터 선택', { fontSize: '32px' });
    // TODO: 4종 카드 표시 → 선택 시 registry에 캐릭터 id 저장 → 'Calibration'.
  }
}

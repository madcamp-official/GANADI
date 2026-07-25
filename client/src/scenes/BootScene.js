// 에셋 로드 + 웹캠 권한 요청. 완료되면 로비로.

import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // TODO: 인장 아이콘, 캐릭터 스프라이트, 이펙트, 사운드 로드.
  }

  async create() {
    // TODO: getUserMedia로 웹캠 스트림 확보 후 registry에 저장.
    this.scene.start('Lobby');
  }
}

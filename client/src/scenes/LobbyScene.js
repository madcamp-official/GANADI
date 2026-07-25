// 방 생성 / 코드 입장. 2인 매칭되면 캐릭터 선택으로.

import Phaser from 'phaser';
import { connect } from '../net/socket.js';

export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  create() {
    this.socket = connect();
    this.add.text(40, 40, '인술대전 — 로비', { fontSize: '32px' });

    // TODO: "방 만들기" / "코드 입장" UI (DOM 버튼 or Phaser 텍스트).
    //   방 만들기 → EVENTS.CREATE_ROOM, 코드 발급 표시.
    //   ROOM_STATE count===2 → this.scene.start('CharacterSelect').
  }
}

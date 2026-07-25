// 대전 씬 — 목표 인장 시퀀스 표시, 양측 체력바, 진행 게이지.
// 서버 권위: 로컬 판정 없음. 시퀀스 완성 시 서버에 이벤트 송신, 판정은 수신해 반영.

import Phaser from 'phaser';
import { EVENTS } from '../../../shared/constants.js';
import { getSocket } from '../net/socket.js';

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  create() {
    this.socket = getSocket();

    // TODO: UI — 목표 인장 아이콘 열, 내/상대 체력바, 카운트다운, 진행 게이지.

    this.socket.on(EVENTS.ROUND_START, ({ sequence }) => {
      this.startSequence(sequence);
    });

    this.socket.on(EVENTS.ROUND_RESULT, ({ winner, damage, hp }) => {
      // TODO: 이펙트/화면 흔들림/효과음 + 체력바 갱신.
    });

    this.socket.on(EVENTS.MATCH_OVER, ({ winner }) => {
      this.scene.start('Result', { winner });
    });
  }

  startSequence(sequence) {
    this.target = sequence;
    this.progress = 0;
    // recognizer가 onSeal(sealId, confidence)를 발행하면 아래 콜백으로 진행 판정.
    // this.recognizer.onSeal = (sealId) => this.handleSeal(sealId);
  }

  handleSeal(sealId) {
    // TODO: 현재 목표 인장과 일치하면 progress++, 상대에게 진행 상황 브로드캐스트.
    //   시퀀스 완성 시 EVENTS.SEQ_COMPLETE 송신 (@timestamp는 서버가 수신 시각 사용).
    if (this.progress >= this.target.length) {
      this.socket.emit(EVENTS.SEQ_COMPLETE, {});
    }
  }
}

// 캘리브레이션 + 튜토리얼. 가이드 박스로 가슴 높이·정면 유도, 개인 샘플 보정.

// ⚠ 아직 씬 흐름에 연결되지 않은 고아 씬 (아무도 start 하지 않는다).
//   현재 흐름: Boot → CharacterSelect → HandCheck → Lobby → Battle → Result
//   가이드 박스·랜드마크 시각화·개인 보정은 Day 5 몫.

import Phaser from 'phaser';
import { getHandTracker } from '../recognition/handTracker.js';

export default class CalibrationScene extends Phaser.Scene {
  constructor() {
    super('Calibration');
  }

  async create() {
    this.add.text(40, 40, '손을 가이드 박스에 맞춰주세요', { fontSize: '28px' });

    // ★ createRecognizer()를 직접 부르지 않는다 — 그러면 인식기가 두 개가 된다.
    //   추적기는 앱 전역에 하나뿐이고, 좌표는 onFrame으로 구독한다.
    const tracker = await getHandTracker();
    if (!this.scene.isActive()) return;
    this.unsubscribe = tracker.onFrame(() => {
      // TODO: 가이드 박스 안에 손이 들어왔는지 판정 + 랜드마크 렌더.
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    // TODO: 준비되면 'Battle'로.
  }
}

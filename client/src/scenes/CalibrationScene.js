// 캘리브레이션 + 튜토리얼. 가이드 박스로 가슴 높이·정면 유도, 개인 샘플 보정.

import Phaser from 'phaser';
import { createRecognizer } from '../recognition/recognizer.js';

export default class CalibrationScene extends Phaser.Scene {
  constructor() {
    super('Calibration');
  }

  async create() {
    this.add.text(40, 40, '손을 가이드 박스에 맞춰주세요', { fontSize: '28px' });
    // TODO: 가이드 박스 오버레이 렌더 + 손 랜드마크 시각화.
    //   recognizer 워밍업, 개인 보정 샘플 수집.
    this.recognizer = await createRecognizer();
    // TODO: 준비되면 'Battle'로.
  }
}

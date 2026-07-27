// Phaser 부트스트랩 — 씬 등록 및 게임 인스턴스 생성.

import Phaser from 'phaser';
import { GAME, RENDER_SCALE } from './config.js';
import BootScene from './scenes/BootScene.js';
import LobbyScene from './scenes/LobbyScene.js';
import CharacterSelectScene from './scenes/CharacterSelectScene.js';
import HandCheckScene from './scenes/HandCheckScene.js';
import CalibrationScene from './scenes/CalibrationScene.js';
import CodexScene from './scenes/CodexScene.js';
import BattleScene from './scenes/BattleScene.js';
import ResultScene from './scenes/ResultScene.js';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#16281c',
  dom: { createContainer: true }, // 로비 코드 입력/버튼 등 DOM 오버레이용
  render: { antialias: true, roundPixels: true },
  // 렌더 해상도를 2배(2560×1440)로 잡아 선명하게. 씬 카메라 줌으로 좌표는 1280×720 유지.
  // 창 크기에 맞춰 비율 유지하며 축소(FIT) → 다운스케일이라 또렷함.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME.WIDTH * RENDER_SCALE,
    height: GAME.HEIGHT * RENDER_SCALE,
  },
  scene: [
    BootScene,
    LobbyScene,
    CharacterSelectScene,
    HandCheckScene,
    CalibrationScene,
    CodexScene,
    BattleScene,
    ResultScene,
  ],
});

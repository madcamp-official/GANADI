// Phaser 부트스트랩 — 씬 등록 및 게임 인스턴스 생성.

import Phaser from 'phaser';
import { GAME } from './config.js';
import BootScene from './scenes/BootScene.js';
import LobbyScene from './scenes/LobbyScene.js';
import CharacterSelectScene from './scenes/CharacterSelectScene.js';
import CalibrationScene from './scenes/CalibrationScene.js';
import BattleScene from './scenes/BattleScene.js';
import ResultScene from './scenes/ResultScene.js';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME.WIDTH,
  height: GAME.HEIGHT,
  backgroundColor: '#1a1420',
  dom: { createContainer: true }, // 로비 코드 입력/버튼 등 DOM 오버레이용
  scene: [
    BootScene,
    LobbyScene,
    CharacterSelectScene,
    CalibrationScene,
    BattleScene,
    ResultScene,
  ],
});

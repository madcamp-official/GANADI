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

function startGame() {
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
}

// 커스텀 폰트가 로드된 뒤 게임 시작 — 캔버스 텍스트는 폰트 로드 전에 그리면 기본폰트로 굳는다.
// GameFont(한글)·KanjiFont(한자) 둘 다 기다림. 파일이 없거나 실패해도 게임은 폴백으로 시작.
Promise.race([
  Promise.all([
    document.fonts.load('16px "GameFont"'),
    document.fonts.load('bold 16px "KanjiFont"'),
  ]).then(() => document.fonts.ready),
  new Promise((r) => setTimeout(r, 4000)), // 큰 폰트(13MB) 대비 최대 4초 대기
]).catch(() => {}).finally(startGame);

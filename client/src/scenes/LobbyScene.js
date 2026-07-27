// 방 생성 / 코드 입장. 2인 매칭되어 첫 라운드가 오면 대전 씬으로.

import Phaser from 'phaser';
import { EVENTS } from '../../../shared/constants.js';
import { connect } from '../net/socket.js';
import { GAME } from '../config.js';

export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  create() {
    this.socket = connect();

    this.add.text(GAME.WIDTH / 2, 140, '인술대전', {
      fontSize: '72px', fontStyle: 'bold', color: '#e8d8ff',
    }).setOrigin(0.5);
    this.add.text(GAME.WIDTH / 2, 210, '印術大戰', {
      fontSize: '28px', color: '#7a6a95',
    }).setOrigin(0.5);

    // 인장 도감 (12종 열람)
    const codex = this.add.text(GAME.WIDTH - 24, 24, '📖 인장 도감', {
      fontSize: '18px', color: '#c9b8ee', backgroundColor: '#2a2140', padding: { x: 14, y: 8 },
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    codex.on('pointerdown', () => this.scene.start('Codex'));

    // DOM 패널 (버튼 + 코드 입력)
    const panel = this.add.dom(GAME.WIDTH / 2, GAME.HEIGHT / 2 + 40).createFromHTML(`
      <div style="display:flex;flex-direction:column;gap:14px;align-items:center;
                  font-family:sans-serif;width:320px;">
        <button id="create" style="${btn('#6c4bd6')}">방 만들기</button>
        <div style="color:#7a6a95;font-size:14px;">— 또는 —</div>
        <input id="code" placeholder="방 코드 4자리" maxlength="4"
               style="${input()}" />
        <button id="join" style="${btn('#3a2f55')}">입장</button>
        <div id="status" style="color:#c9b8ee;font-size:16px;height:24px;
                    text-align:center;margin-top:4px;"></div>
      </div>
    `);

    const root = panel.node;
    this.status = root.querySelector('#status');
    root.querySelector('#create').onclick = () => this.createRoom();
    root.querySelector('#join').onclick = () => this.joinRoom(root.querySelector('#code').value);

    // 상대 입장/대기 상태 표시
    this.socket.on(EVENTS.ROOM_STATE, ({ code, count }) => {
      this.status.textContent = count >= 2
        ? '상대 입장! 곧 시작합니다…'
        : `방 코드: ${code}  ·  상대를 기다리는 중…`;
    });

    // 매치 정보(상대 캐릭터) 수신 → Battle에서 쓰도록 registry에 저장
    this.socket.on(EVENTS.MATCH_INFO, ({ opponent }) => {
      this.registry.set('opponentCharacter', opponent);
    });

    this.isCreator = false;
    this.roomCode = null;

    // 첫 라운드가 오면 대전 씬으로 (첫 시퀀스를 넘겨 레이스 방지)
    this.socket.once(EVENTS.ROUND_START, (firstRound) => {
      this.scene.start('Battle', {
        firstRound,
        code: this.roomCode,
        isCreator: this.isCreator, // 화상 call 역할 분배용
      });
    });

    // 씬 종료 시 소켓 리스너 정리 (중복 등록 방지)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket.off(EVENTS.ROOM_STATE);
      this.socket.off(EVENTS.MATCH_INFO);
    });
  }

  createRoom() {
    const character = this.registry.get('character');
    this.socket.emit(EVENTS.CREATE_ROOM, { character }, ({ code }) => {
      this.isCreator = true;
      this.roomCode = code;
      this.status.textContent = `방 코드: ${code}  ·  상대를 기다리는 중…`;
    });
  }

  joinRoom(code) {
    const clean = (code || '').trim().toUpperCase();
    if (clean.length !== 4) {
      this.status.textContent = '코드 4자리를 입력하세요';
      return;
    }
    const character = this.registry.get('character');
    this.socket.emit(EVENTS.JOIN_ROOM, { code: clean, character }, (res) => {
      if (res?.error === 'NO_ROOM') this.status.textContent = '없는 방 코드입니다';
      else if (res?.error === 'FULL') this.status.textContent = '이미 꽉 찬 방입니다';
      else {
        this.isCreator = false;
        this.roomCode = clean;
      }
    });
  }
}

// --- 인라인 스타일 헬퍼 ---
function btn(bg) {
  return `width:100%;padding:14px;border:none;border-radius:10px;cursor:pointer;
          background:${bg};color:#fff;font-size:18px;font-weight:600;`;
}
function input() {
  return `width:100%;padding:14px;border:2px solid #4a3f66;border-radius:10px;
          background:#221a33;color:#fff;font-size:18px;text-align:center;
          letter-spacing:4px;text-transform:uppercase;box-sizing:border-box;`;
}

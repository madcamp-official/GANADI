// 방 생성 / 코드 입장. 2인 매칭되어 첫 라운드가 오면 대전 씬으로.
// 디자인: 숲속 두루마리 톤 (docs/design/03-lobby.png). 소켓 로직은 기존 계약 그대로.

import Phaser from 'phaser';
import { EVENTS } from '../../../shared/constants.js';
import { connect } from '../net/socket.js';
import { DEFAULT_CHARACTER } from '../data/characters.js';
import { GAME } from '../config.js';
import { drawForest, button, CSS, C, hex, hiDPI, FONT, KANJI_FONT } from '../ui/theme.js';

export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  create() {
    hiDPI(this);
    this.socket = connect();
    const W = GAME.WIDTH;
    drawForest(this);

    // 타이틀
    this.add.text(W / 2, 150, '나루도', {
      fontFamily: FONT, fontSize: '92px', fontStyle: 'bold', color: CSS.scroll,
    }).setOrigin(0.5).setShadow(0, 6, hex(C.woodShadow), 0, true, true);
    this.add.text(W / 2, 222, '—  Narudo  —', {
      fontSize: '26px', fontStyle: 'bold', color: CSS.orange, letterSpacing: 4,
    }).setOrigin(0.5);

    // 인장 도감 버튼 (우상단)
    const codex = button(this, W - 110, 52, 180, 56, '📜 인장 도감', { fontSize: '18px' });
    codex.zone.on('pointerdown', () => this.scene.start('Codex'));

    // 폼 패널 (DOM — 버튼/입력창 + 연습 모드). 연습은 서버·상대 없이 혼자.
    const panel = this.add.dom(W / 2, GAME.HEIGHT / 2 + 70).createFromHTML(`
      <div style="${styPanel}">
        <button id="create" style="${styCreate}">방 만들기 <span style="${styKanji}">忍</span></button>
        <div style="${styDivider}"><span style="${styDivText}">또는 코드로 입장</span></div>
        <div style="display:flex;gap:12px;">
          <input id="code" placeholder="코드" maxlength="4" style="${styInput}" />
          <button id="join" style="${styJoin}">입장</button>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:2px;">
          <span style="${styHint}">A-Z, 0-9 · 4자리</span>
          <span id="err" style="${styErr}"></span>
        </div>
        <button id="practice" style="${styPractice}">🥋 혼자 연습하기</button>
      </div>
    `);
    const root = panel.node;
    this.err = root.querySelector('#err');
    root.querySelector('#create').onclick = () => this.createRoom();
    root.querySelector('#join').onclick = () => this.joinRoom(root.querySelector('#code').value);
    // 연습 모드는 소켓을 아예 쓰지 않는다 — 서버 없어도 바로 시작
    root.querySelector('#practice').onclick = () => this.scene.start('Battle', { practice: true });

    // 상태바 (DOM — 방 코드 드래그 선택 + 복사 버튼)
    this.statusDom = this.add.dom(W / 2, GAME.HEIGHT - 56).createFromHTML(`<div id="s" style="${styStatus}"></div>`);
    this.sNode = this.statusDom.node.querySelector('#s');
    this.statusDom.setVisible(false);

    this.isCreator = false;
    this.roomCode = null;

    this.socket.on(EVENTS.ROOM_STATE, ({ code, count }) => {
      if (count >= 2) this.showMsg('상대 입장! 곧 시작…');
      else this.showRoom(code);
    });
    this.socket.on(EVENTS.MATCH_INFO, ({ characters }) => {
      const oppId = Object.keys(characters || {}).find((id) => id !== this.socket.id);
      const opponent = characters?.[oppId];
      console.log('[lobby] MATCH_INFO 상대 캐릭터 =', opponent, '(전체', characters, ')');
      this.registry.set('opponentCharacter', opponent);
    });
    this.socket.once(EVENTS.ROUND_START, (firstRound) => {
      this.scene.start('Battle', { firstRound, code: this.roomCode, isCreator: this.isCreator });
    });

    // 씬 종료 시 소켓 리스너 정리 (중복 등록 방지).
    // ROUND_START도 뗀다 — 연습 모드로 빠졌다 돌아오면 once가 쌓여 뒤늦은 라운드에 튈 수 있음.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket.off(EVENTS.ROOM_STATE);
      this.socket.off(EVENTS.MATCH_INFO);
      this.socket.off(EVENTS.ROUND_START);
    });
  }

  showMsg(msg) {
    this.statusDom.setVisible(true);
    this.sNode.innerHTML = `<span style="opacity:.9">${msg}</span>`;
  }

  // 방 코드 표시 — 코드는 드래그로 선택 가능(user-select) + 복사 버튼
  showRoom(code) {
    this.statusDom.setVisible(true);
    this.sNode.innerHTML =
      `<span style="opacity:.75">ROOM</span>` +
      `<b id="code" style="${styCode}">${code}</b>` +
      `<button id="copy" style="${styCopy}">복사</button>` +
      `<span style="opacity:.7">| 상대를 기다리는 중…</span>`;
    const btn = this.sNode.querySelector('#copy');
    btn.onclick = async () => {
      try { await navigator.clipboard.writeText(code); } catch { /* clipboard 미지원 */ }
      btn.textContent = '복사됨!';
      setTimeout(() => { btn.textContent = '복사'; }, 1200);
    };
  }

  createRoom() {
    const character = this.registry.get('character') ?? DEFAULT_CHARACTER;
    console.log('[lobby] 방 만들기 — 내 캐릭터 전송 =', character);
    this.socket.emit(EVENTS.CREATE_ROOM, { character }, ({ code }) => {
      this.isCreator = true;
      this.roomCode = code;
      this.showRoom(code);
    });
  }

  joinRoom(code) {
    const clean = (code || '').trim().toUpperCase();
    if (clean.length !== 4) { this.err.textContent = '코드 4자리를 입력하세요'; return; }
    const character = this.registry.get('character') ?? DEFAULT_CHARACTER;
    console.log('[lobby] 입장 — 내 캐릭터 전송 =', character);
    this.socket.emit(EVENTS.JOIN_ROOM, { code: clean, character }, (res) => {
      if (res?.error === 'NO_ROOM') this.err.textContent = '없는 방 코드예요';
      else if (res?.error === 'FULL') this.err.textContent = '이미 꽉 찬 방이에요';
      else { this.err.textContent = ''; this.isCreator = false; this.roomCode = clean; }
    });
  }
}

// --- 인라인 스타일 (두루마리 톤) ---
const styPanel = `display:flex;flex-direction:column;gap:14px;width:520px;padding:26px;
  box-sizing:border-box;font-family:${FONT};background:#FAF1D8;
  border:5px solid #5A4632;border-radius:14px;box-shadow:0 7px 0 #3C2C1C;`;
const styCreate = `width:100%;padding:16px;border:3px solid #C85A1B;border-radius:10px;cursor:pointer;
  background:#FF7A2F;color:#FAF1D8;font-family:${FONT};font-size:22px;font-weight:800;display:flex;
  align-items:center;justify-content:center;gap:10px;`;
const styKanji = `background:#FAF1D8;color:#FF7A2F;border-radius:6px;padding:1px 8px;font-size:18px;
  font-family:${KANJI_FONT};`;
const styDivider = `text-align:center;border-top:2px dashed #C9B48A;position:relative;margin:6px 0;`;
const styDivText = `position:relative;top:-14px;background:#FAF1D8;padding:0 12px;color:#8A6B4A;font-size:14px;`;
const styInput = `flex:1;padding:14px;border:3px solid #5A4632;border-radius:10px;background:#FFFDF5;
  color:#2A1D12;font-family:${FONT};font-size:24px;font-weight:800;text-align:center;letter-spacing:8px;
  text-transform:uppercase;box-sizing:border-box;min-width:0;`;
// flex-shrink:0 + nowrap — 입력창(flex:1)에 밀려 "입/장"으로 줄바꿈되는 것 방지
const styJoin = `padding:0 26px;border:3px solid #234a29;border-radius:10px;cursor:pointer;
  background:#3E6B3A;color:#FAF1D8;font-family:${FONT};font-size:20px;font-weight:800;
  flex-shrink:0;white-space:nowrap;`;
const styHint = `color:#8A6B4A;font-size:13px;`;
const styErr = `color:#E5484D;font-size:14px;font-weight:700;`;
const styStatus = `display:flex;align-items:center;gap:12px;padding:10px 22px;border-radius:24px;
  background:rgba(26,42,30,.92);border:2px solid #5A4632;color:#FAF1D8;font-family:${FONT};
  font-size:18px;white-space:nowrap;`;
const styCode = `user-select:all;color:#FF7A2F;font-family:monospace;font-size:22px;letter-spacing:3px;`;
const styCopy = `padding:5px 12px;border:2px solid #5A4632;border-radius:8px;cursor:pointer;
  background:#FAF1D8;color:#2A1D12;font-family:${FONT};font-size:13px;font-weight:700;`;
const styPractice = `width:100%;margin-top:4px;padding:12px;border:3px solid #234a29;border-radius:10px;
  cursor:pointer;background:#3E6B3A;color:#FAF1D8;font-family:${FONT};font-size:16px;font-weight:800;`;

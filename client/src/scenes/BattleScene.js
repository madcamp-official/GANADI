// 대전 씬 — 서버 권위: 로컬 판정 없음, 완성 시 SEQ_COMPLETE만 송신하고 판정은 수신 반영.
// 디자인: docs/design/04-battle.png (숲 배경·HP 패널·인장 도장 타일·카운트다운·양쪽 가나디)
//
// ★ 연습 모드(data.practice): 서버·상대 없이 혼자 한 판.
//   시퀀스 생성·판정·다음 라운드를 전부 로컬에서 처리하고 소켓을 쓰지 않는다.
//   시연 때 서버가 죽어도 데모가 도는 안전망.

import Phaser from 'phaser';
import { EVENTS, RULES } from '../../../shared/constants.js';
import { makeSequence } from '../../../shared/sequence.js';
import { SEALS } from '../data/seals.js';
import { getCharacter, spriteKey } from '../data/characters.js';
import { getSocket } from '../net/socket.js';
import { startVideoCall } from '../net/webrtc.js';
import { GAME } from '../config.js';
import { drawForest, darkPanel, pill, CSS, C, hex, hiDPI } from '../ui/theme.js';

const W = GAME.WIDTH, H = GAME.HEIGHT;
const CPU_ID = '__cpu__';            // 연습 모드의 가상 상대
const NEXT_ROUND_DELAY_MS = 2000;    // referee.js와 같은 간격

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  create(data) {
    hiDPI(this);
    this.practice = !!data?.practice;
    this.socket = this.practice ? null : getSocket();
    this.myId = this.practice ? '__me__' : this.socket.id;

    this.sequence = [];
    this.progress = 0;
    this.locked = true; // 라운드 시작 전엔 입력 잠금
    this.round = 0;
    this.hp = this.practice
      ? { [this.myId]: RULES.MAX_HP, [CPU_ID]: RULES.MAX_HP }
      : { [this.myId]: RULES.MAX_HP };

    this.meChar = getCharacter(this.registry.get('character'));
    this.oppChar = getCharacter(this.registry.get('opponentCharacter')); // 없으면 기본 캐릭터

    drawForest(this);
    this.buildStaticUI();

    // 서버 이벤트 (연습 모드에선 붙이지 않는다)
    if (!this.practice) {
      this.socket.on(EVENTS.ROUND_START, (p) => this.onRoundStart(p));
      this.socket.on(EVENTS.ROUND_RESULT, (p) => this.onRoundResult(p));
      this.socket.on(EVENTS.OPP_PROGRESS, ({ progress, total }) => this.drawOppProgress(progress, total));
      this.socket.once(EVENTS.MATCH_OVER, (p) => this.onMatchOver(p));
    }

    // A 인식기 연결 (registry에 있으면). 없으면 스페이스 폴백.
    this.recognizer = this.registry.get('recognizer') ?? null;
    if (this.recognizer) this.attachRecognizer(this.recognizer);
    this.input.keyboard.on('keydown-SPACE', () => {
      if (!this.locked && this.progress < this.sequence.length) this.onSealMatched(this.sequence[this.progress]);
    });

    // 화상 (joiner가 발신). 연습 모드엔 없음.
    const localStream = this.registry.get('localStream');
    if (!this.practice && localStream && data?.code) {
      this.video = startVideoCall(this.socket, data.code, localStream, { isInitiator: !data.isCreator });
    }

    // 웹캠 배치 (내 캠=우, 상대 캠=좌). 연습 모드엔 상대 캠 없음.
    this.setupCams();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.socket) {
        this.socket.off(EVENTS.ROUND_START);
        this.socket.off(EVENTS.ROUND_RESULT);
        this.socket.off(EVENTS.OPP_PROGRESS);
      }
      this.video?.stop();
      if (this.recognizer) this.recognizer.onSeal = () => {};
      this.restoreCams();
    });

    if (this.practice) this.startPracticeRound();
    else if (data?.firstRound) this.onRoundStart(data.firstRound); // 로비가 넘긴 첫 라운드
  }

  // ── 연습 모드: 서버 심판이 하던 일을 로컬에서 (referee.js와 같은 규칙) ──
  startPracticeRound() {
    this.round += 1;
    const length = this.round <= 2 ? 3 : 5;
    this.onRoundStart({ round: this.round, sequence: makeSequence(length) });
  }

  resolvePracticeRound() {
    const damage = RULES.DAMAGE[this.sequence.length] ?? 0;
    this.hp[CPU_ID] = Math.max(0, this.hp[CPU_ID] - damage);
    this.onRoundResult({ winner: this.myId, hp: { ...this.hp } });
    if (this.hp[CPU_ID] <= 0) this.time.delayedCall(NEXT_ROUND_DELAY_MS, () => this.onMatchOver({ winner: this.myId }));
    else this.time.delayedCall(NEXT_ROUND_DELAY_MS, () => this.startPracticeRound());
  }

  buildStaticUI() {
    // 내 HP 패널 (좌상단)
    darkPanel(this, 240, 62, 430, 78);
    this.add.text(45, 40, `${this.meChar.name} · 나`, { fontSize: '20px', fontStyle: 'bold', color: CSS.scroll });
    this.myHpText = this.add.text(435, 40, '', { fontSize: '18px', fontFamily: 'monospace', color: CSS.win }).setOrigin(1, 0);

    // 라운드 패널 (중앙 상단)
    darkPanel(this, W / 2, 52, 150, 64);
    this.roundText = this.add.text(W / 2, 44, 'ROUND 1', { fontSize: '20px', fontStyle: 'bold', color: CSS.orange }).setOrigin(0.5);
    this.roundSub = this.add.text(W / 2, 68, '', { fontSize: '13px', fontFamily: 'monospace', color: '#9ab08f' }).setOrigin(0.5);

    // 상대 HP + 진행 패널 (우상단)
    darkPanel(this, 940, 74, 440, 108);
    this.add.text(1145, 42, this.practice ? '연습 상대' : '상대', { fontSize: '20px', fontStyle: 'bold', color: CSS.lose }).setOrigin(1, 0);
    this.oppHpText = this.add.text(735, 42, '', { fontSize: '18px', fontFamily: 'monospace', color: CSS.lose });
    this.oppProgLabel = this.add.text(735, 96, this.practice ? '연습 모드' : '상대 진행 0/0', { fontSize: '14px', color: '#ffcc99' });

    this.hpGfx = this.add.graphics();
    this.oppProgGfx = this.add.graphics();
    this.drawHp();
    this.drawOppProgress(0, 0);

    // 목표 인장 라벨
    this.targetPill = pill(this, W / 2, 168, '목표 인장 0/0', { fill: 0x2a3a2b, textColor: CSS.orange, bold: true });

    // 연습 모드 표시
    if (this.practice) {
      this.add.text(W / 2, 100, '연습 모드 · 서버 없이 혼자 진행', { fontSize: '15px', color: CSS.win }).setOrigin(0.5, 0);
    }

    // 인장 타일 컨테이너
    this.sealRow = this.add.container(0, 0);

    // 카운트다운 원 + 서브텍스트 (숨김 시작)
    this.cd = this.add.container(W / 2, 505).setVisible(false);
    const cdBg = this.add.graphics();
    cdBg.fillStyle(C.woodShadow, 1).fillCircle(0, 6, 56);
    cdBg.fillStyle(C.orange, 1).fillCircle(0, 0, 56);
    this.cdNum = this.add.text(0, 0, '3', { fontSize: '64px', fontStyle: 'bold', color: CSS.scroll }).setOrigin(0.5);
    this.cd.add([cdBg, this.cdNum]);
    this.subText = this.add.text(W / 2, 585, '', { fontSize: '20px', fontStyle: 'bold', color: CSS.sun }).setOrigin(0.5);

    // 통나무
    const log = this.add.graphics();
    log.fillStyle(C.wood, 1).fillRoundedRect(W / 2 - 150, 630, 300, 34, 17);
    log.lineStyle(3, C.woodDark, 1).strokeRoundedRect(W / 2 - 150, 630, 300, 34, 17);
    log.lineStyle(3, C.woodDark, 0.6).strokeCircle(W / 2 - 150, 647, 12);

    // 배너 (술법/피격)
    this.banner = this.add.text(W / 2, 120, '', { fontSize: '44px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5).setDepth(50);

    this.drawFighters();
  }

  drawFighters() {
    const cy = 470;
    // 내 캐릭터 = 오른쪽, 상대 = 왼쪽
    const me = this.add.image(W - 110, cy, spriteKey(this.meChar.id));
    fit(me, 200, 300);
    pill(this, W - 110, cy + 150, '나', { fill: 0x2a3a2b, border: C.orange, textColor: CSS.orange, bold: true });

    const opp = this.add.image(110, cy, spriteKey(this.oppChar.id));
    fit(opp, 200, 300);
    pill(this, 110, cy + 150, '상대', { fill: 0x2a3a2b, border: C.water, textColor: '#9fd0ff', bold: true });
  }

  // 웹캠을 각 캐릭터 머리 위(월드 좌표)로 배치. 캔버스 화면 좌표로 변환.
  setupCams() {
    this.localCam = document.getElementById('local-cam');
    this.remoteCam = document.getElementById('remote-cam');
    if (!this.practice && this.remoteCam) this.remoteCam.style.display = 'block'; // 대전 중에만
    this._reposition = () => this.positionCams();
    this.positionCams();
    this.time.delayedCall(60, this._reposition);
    this.scale.on('resize', this._reposition);
  }

  positionCams() {
    const rect = this.game.canvas.getBoundingClientRect();
    const sx = rect.width / W, sy = rect.height / H;
    const camW = 150, camH = 112, topY = 205;
    const place = (el, worldCx) => {
      if (!el) return;
      el.style.position = 'fixed';
      el.style.left = `${rect.left + (worldCx - camW / 2) * sx}px`;
      el.style.top = `${rect.top + topY * sy}px`;
      el.style.width = `${camW * sx}px`;
      el.style.height = `${camH * sy}px`;
      el.style.zIndex = '10';
    };
    place(this.localCam, W - 120);              // 내 캐릭터 (우)
    if (!this.practice) place(this.remoteCam, 120); // 상대 캐릭터 (좌)
  }

  restoreCams() {
    if (this._reposition) this.scale.off('resize', this._reposition);
    [this.localCam, this.remoteCam].forEach((el) => {
      if (!el) return;
      ['position', 'left', 'top', 'width', 'height', 'zIndex'].forEach((p) => { el.style[p] = ''; });
    });
    if (this.remoteCam) this.remoteCam.style.display = 'none';
  }

  onRoundStart({ round, sequence }) {
    this.sequence = sequence;
    this.progress = 0;
    this.locked = true;
    this.roundText.setText(`ROUND ${round}`);
    this.roundSub.setText(`SEQ ${sequence.length}`);
    this.renderSeals();
    this.drawOppProgress(0, sequence.length);
    this.startCountdown();
  }

  startCountdown() {
    const steps = ['3', '2', '1', '시작!'];
    let i = 0;
    this.cd.setVisible(true);
    this.subText.setText('준비… 인을 맺어라!');
    const tick = () => {
      this.cdNum.setText(steps[i]);
      this.cd.setScale(1.4); this.tweens.add({ targets: this.cd, scale: 1, duration: 300 });
      i += 1;
      if (i < steps.length) this.time.delayedCall(650, tick);
      else this.time.delayedCall(450, () => { this.cd.setVisible(false); this.subText.setText(''); this.locked = false; });
    };
    tick();
  }

  // ── A ↔ B 계약 연결 지점 ── recognizer.onSeal → onSealMatched
  attachRecognizer(recognizer) {
    this.recognizer = recognizer;
    recognizer.onSeal = (sealId, confidence, timestamp) => this.onSealMatched(sealId, confidence, timestamp);
  }

  onSealMatched(sealId) {
    if (this.locked || this.progress >= this.sequence.length) return;
    if (sealId !== this.sequence[this.progress]) return;
    this.progress += 1;
    this.renderSeals();
    this.spark(this.sealX(this.progress - 1), 320, C.orange);
    this.socket?.emit(EVENTS.OPP_PROGRESS, { progress: this.progress, total: this.sequence.length });

    if (this.progress >= this.sequence.length) {
      this.locked = true; // 완성 후 판정까지 입력 잠금
      if (this.practice) this.resolvePracticeRound();
      else this.socket.emit(EVENTS.SEQ_COMPLETE, {}); // 승부는 서버 수신 순서로 판정
    }
  }

  renderSeals() {
    this.sealRow.removeAll(true);
    const n = this.sequence.length, boxW = 150, boxH = 190, y = 320;
    this.targetPill.t.setText(`목표 인장 ${this.progress}/${n}`);

    this.sequence.forEach((id, i) => {
      const x = this.sealX(i);
      const seal = SEALS[id] ?? { kanji: '?', name: id };
      const done = i < this.progress;
      const current = i === this.progress;
      const future = i > this.progress;

      const g = this.add.graphics();
      g.fillStyle(C.woodShadow, future ? 0.4 : 1).fillRoundedRect(x - boxW / 2, y - boxH / 2 + 6, boxW, boxH, 12);
      g.fillStyle(C.scroll, future ? 0.55 : 1).fillRoundedRect(x - boxW / 2, y - boxH / 2, boxW, boxH, 12);
      g.lineStyle(current ? 6 : 4, current ? C.orange : C.woodDark, 1).strokeRoundedRect(x - boxW / 2, y - boxH / 2, boxW, boxH, 12);
      this.sealRow.add(g);

      const kanji = this.add.text(x, y - 18, seal.kanji, {
        fontSize: '72px', fontStyle: 'bold', color: future ? '#b9a888' : CSS.outline,
      }).setOrigin(0.5);
      const name = this.add.text(x, y + 62, seal.name, { fontSize: '18px', color: future ? '#a99a7a' : '#6a5535' }).setOrigin(0.5);
      this.sealRow.add([kanji, name]);

      if (done) {
        const stamp = this.add.text(x + 30, y - 30, '印', { fontSize: '54px', fontStyle: 'bold', color: hex(C.orange) }).setOrigin(0.5).setAngle(-12).setAlpha(0.9);
        this.sealRow.add(stamp);
      }
      if (current) {
        const b = pill(this, x, y - boxH / 2 - 6, '지금 이것!', { fill: C.orange, textColor: CSS.scroll, bold: true, fontSize: '15px' });
        this.sealRow.add([b.g, b.t]);
      }
    });
  }

  sealX(i) {
    const n = this.sequence.length, boxW = 150, gap = 22;
    const totalW = n * boxW + (n - 1) * gap;
    return (W - totalW) / 2 + boxW / 2 + i * (boxW + gap);
  }

  drawOppProgress(progress, total) {
    if (this.practice) return; // 연습 모드엔 상대가 없다
    this.oppProgLabel?.setText(`상대 진행 ${progress}/${total}`);
    if (!this.oppProgGfx) return;
    const x = 850, y = 90, w = 260, h = 16;
    this.oppProgGfx.clear();
    this.oppProgGfx.fillStyle(0x1a1030, 1).fillRoundedRect(x, y, w, h, h / 2);
    if (total > 0 && progress > 0) {
      this.oppProgGfx.fillStyle(C.orange, 1).fillRoundedRect(x, y, w * (progress / total), h, h / 2);
    }
  }

  onRoundResult({ winner, hp }) {
    this.hp = hp;
    this.drawHp();
    const iWon = winner === this.myId;
    this.banner.setText(iWon ? '술법 발동!' : '피격!').setColor(iWon ? CSS.win : '#ff9a9a');
    this.time.delayedCall(900, () => this.banner.setText(''));
    this.cameras.main.shake(220, iWon ? 0.003 : 0.008);
    // 내 캐릭터=우, 상대=좌. 승리 시 상대(좌)에 술법, 패배 시 내(우) 피격.
    if (iWon) this.jutsu(110, 470, C.win);
    else { this.jutsu(W - 110, 470, C.lose); this.flashRed(); }
  }

  drawHp() {
    const oppId = Object.keys(this.hp).find((id) => id !== this.myId);
    const myHp = this.hp[this.myId] ?? RULES.MAX_HP;
    const oppHp = this.hp[oppId] ?? RULES.MAX_HP;
    this.myHpText.setText(`${myHp} / ${RULES.MAX_HP}`);
    this.oppHpText.setText(`${oppHp} / ${RULES.MAX_HP}`);

    const H2 = 22;
    this.hpGfx.clear();
    // 내 바 (좌 패널 25~455 안쪽, 초록, 좌→우)
    const mx = 45, my = 74, mw = 380;
    this.hpGfx.fillStyle(0x1a1030, 1).fillRoundedRect(mx, my, mw, H2, H2 / 2);
    this.hpGfx.fillStyle(C.win, 1).fillRoundedRect(mx, my, mw * (myHp / RULES.MAX_HP), H2, H2 / 2);
    // 상대 바 (우 패널 720~1160 안쪽, 빨강, 우→좌로 줆)
    const ow = 380, oRight = 1145, oy = 64;
    this.hpGfx.fillStyle(0x1a1030, 1).fillRoundedRect(oRight - ow, oy, ow, H2, H2 / 2);
    const fw = ow * (oppHp / RULES.MAX_HP);
    this.hpGfx.fillStyle(C.lose, 1).fillRoundedRect(oRight - fw, oy, fw, H2, H2 / 2);
  }

  onMatchOver({ winner }) {
    this.locked = true;
    this.scene.start('Result', { won: winner === this.myId });
  }

  spark(x, y, color) {
    const e = this.add.particles(x, y, 'spark', {
      speed: { min: 80, max: 260 }, lifespan: 500, scale: { start: 0.9, end: 0 },
      tint: color, blendMode: 'ADD', emitting: false,
    });
    e.explode(16, x, y);
    this.time.delayedCall(600, () => e.destroy());
  }

  jutsu(x, y, color) {
    this.spark(x, y, color);
    const ring = this.add.image(x, y, 'ring').setTint(color).setScale(0.2).setAlpha(0.9).setBlendMode('ADD');
    this.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 520, onComplete: () => ring.destroy() });
  }

  flashRed() {
    const r = this.add.rectangle(W / 2, H / 2, W, H, 0xff0000, 0.35);
    this.tweens.add({ targets: r, alpha: 0, duration: 350, onComplete: () => r.destroy() });
  }
}

function fit(spr, maxW, maxH) {
  spr.setScale(Math.min(maxW / spr.width, maxH / spr.height));
}

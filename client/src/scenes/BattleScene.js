// 대전 씬 — 서버 권위: 로컬 판정 없음, 완성 시 SEQ_COMPLETE만 송신하고 판정은 수신 반영.
// 디자인: docs/design/04-battle.png (숲 배경·HP 패널·인장 도장 타일·카운트다운·양쪽 가나디)
//
// ★ 연습 모드(data.practice): 서버·상대 없이 혼자 한 판.
//   시퀀스 생성·판정·다음 라운드를 전부 로컬에서 처리하고 소켓을 쓰지 않는다.
//   시연 때 서버가 죽어도 데모가 도는 안전망.

import Phaser from 'phaser';
import { EVENTS, RULES, PLAYABLE_SEAL_IDS } from '../../../shared/constants.js';
import { pickJutsu, jutsuSeals, damageFor } from '../../../shared/jutsu.js';
import { SEALS } from '../data/seals.js';
import { getCharacter, spriteKey } from '../data/characters.js';
import { getSocket } from '../net/socket.js';
import { startVideoCall } from '../net/webrtc.js';
import { GAME } from '../config.js';
import { drawForest, darkPanel, pill, CSS, C, hex, hiDPI, KANJI_FONT } from '../ui/theme.js';
import { holdGaugeView } from '../ui/holdGauge.js';
const W = GAME.WIDTH, H = GAME.HEIGHT;
const CPU_ID = '__cpu__';            // 연습 모드의 가상 상대

const NEXT_ROUND_DELAY_MS = 2000;    // referee.js와 같은 간격

// 좌우 진영 — 내 쪽 = 왼쪽, 상대 = 오른쪽. HP 패널(좌=나 / 우=상대)과 같은 편에 둔다.
// 캐릭터·웹캠·발사체 방향이 전부 이 상수를 따르므로 진영을 바꾸려면 여기만 뒤집으면 된다.
const ME_X = 110, OPP_X = W - 110;
const FIRE_FROM = ME_X + 50, FIRE_TO = OPP_X - 40; // 발사체 시작/착탄 x
// 캐릭터 세로 중심. 웹캠도 이 값을 기준으로 배치하므로 캐릭터를 옮기면 캠이 따라온다.
const FIGHTER_CY = 470;
const FIGHTER_HALF_W = 100; // fit(spr, 200, 300)의 최대 반폭 — 캠을 이 바깥에 둬야 안 겹친다

// 웹캠 — 각 캐릭터 "바로 옆"(안쪽)에, 무엇과도 겹치지 않는 자리.
// 세로 484~596 구간이 비어 있다: 위로는 인식 게이지 글자(~481), 아래로는 나/상대 라벨(603~).
// 가로는 캐릭터 반폭 + 여백만큼 안쪽으로 밀어 스프라이트를 피한다.
const CAM_W = 140, CAM_H = 105;
const CAM_CY = 540;
const CAM_GAP = 0; // 캐릭터와 캠 사이 여백
const CAM_DX = FIGHTER_HALF_W + CAM_GAP + CAM_W / 2; // 캐릭터 중심 → 캠 중심 거리

// HP 패널 — 좌(나)/우(상대)를 같은 크기로, 화면 중앙 기준 대칭 배치.
// 텍스트·바 좌표를 전부 아래 값에서 유도하므로 한쪽만 어긋날 일이 없다.
const HP_PANEL_W = 430, HP_PANEL_H = 78, HP_PANEL_CY = 62, HP_PAD = 20;
const HP_L_CX = 240, HP_R_CX = W - HP_L_CX;   // 패널 중심 x
// 각 패널의 안쪽 좌/우 끝 — 이름은 바깥쪽, HP 숫자는 안쪽에 붙인다.
const L_IN = HP_L_CX - HP_PANEL_W / 2 + HP_PAD, L_OUT = HP_L_CX + HP_PANEL_W / 2 - HP_PAD;
const R_IN = HP_R_CX - HP_PANEL_W / 2 + HP_PAD, R_OUT = HP_R_CX + HP_PANEL_W / 2 - HP_PAD;
// 이름·HP 숫자 행은 패널 상단(y=23)에 붙인다. add.text 기본 padding(top:10) 때문에
// 실제 글자는 HP_TEXT_Y + 10 부터 그려지므로 그만큼 빼서 잡는다.
const HP_TEXT_Y = 20, HP_BAR_Y = 74, HP_BAR_W = 380, HP_BAR_H = 22;
// 상대 진행 표시 — 패널 바깥 아래 (패널 하단 y = 101).
// 라벨 y는 글자 상단이 아니라 박스 상단 — theme의 add.text 기본 padding(top:10)만큼 밀려 그려진다.
// 14px 글자는 y+10 ~ y+28 을 차지하므로 바는 그 아래로 띄운다.
const OPP_PROG_Y = 104, OPP_PROG_BAR_Y = 138;

// 속성별 발사체 스프라이트시트 (client/public/effects/*). 프레임 크기는 시트를 실측해 맞춤.
// file: public 기준 경로(공백 포함, encodeURI로 감쌈) · fw/fh: 한 프레임 픽셀 · frames: 총 프레임 수.
const FX = {
  FIRE:      { file: 'Fire Effect 1/Firebolt SpriteSheet.png',                    fw: 48, fh: 48, frames: 11, rate: 18 },
  WATER:     { file: 'Water Ball - Spritesheet/WaterBall - Startup and Infinite.png', fw: 64, fh: 64, frames: 25, rate: 22 },
  EARTH:     { file: 'Earth Effect 01/Earth projectile Spritesheet .png',          fw: 48, fh: 64, frames: 6,  rate: 14 },
  WIND:      { file: 'Smoke Effect 01/Smoke VFX 1.png',                            fw: 48, fh: 32, frames: 9,  rate: 16 },
  LIGHTNING: { file: 'Thunder Effect 01/Thunder Projectile 1/Thunder projectile1 w blur.png', fw: 32, fh: 32, frames: 5, rate: 20 },
};
const FX_COLOR = { FIRE: C.fire, WATER: C.water, EARTH: C.wood, WIND: C.wind, LIGHTNING: C.elec };

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
    this.subscribeRecognition(); // 인식 게이지용 프레임 구독
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
      this.unsubFrame?.(); // 죽은 씬에 프레임이 흘러들지 않게 (추적기 루프는 계속 돎)
      this.unsubFrame = null;
      this.restoreCams();
    });

    if (this.practice) this.startPracticeRound();
    else if (data?.firstRound) this.onRoundStart(data.firstRound); // 로비가 넘긴 첫 라운드
  }

  // ── 연습 모드: 서버 심판이 하던 일을 로컬에서 ──
  // 랜덤 인술 하나를 뽑아 그 인의 순서를 목표 시퀀스로 쓴다 (서버와 같은 pickJutsu).
  startPracticeRound() {
    this.round += 1;
    const j = pickJutsu(PLAYABLE_SEAL_IDS);
    this.onRoundStart({ round: this.round, sequence: jutsuSeals(j), jutsu: j });
  }

  resolvePracticeRound() {
    const damage = damageFor(this.sequence.length);
    this.hp[CPU_ID] = Math.max(0, this.hp[CPU_ID] - damage);
    this.onRoundResult({ winner: this.myId, hp: { ...this.hp } });
    if (this.hp[CPU_ID] <= 0) this.time.delayedCall(NEXT_ROUND_DELAY_MS, () => this.onMatchOver({ winner: this.myId }));
    else this.time.delayedCall(NEXT_ROUND_DELAY_MS, () => this.startPracticeRound());
  }

  buildStaticUI() {
    // 내 HP 패널 (좌상단) — 이름은 바깥(좌), HP 숫자는 안쪽(우)
    darkPanel(this, HP_L_CX, HP_PANEL_CY, HP_PANEL_W, HP_PANEL_H);
    this.add.text(L_IN, HP_TEXT_Y, `${this.meChar.name} · 나`, { fontSize: '20px', fontStyle: 'bold', color: CSS.scroll });
    this.myHpText = this.add.text(L_OUT, HP_TEXT_Y, '', { fontSize: '18px', fontFamily: 'monospace', color: CSS.win }).setOrigin(1, 0);

    // 라운드 패널 (중앙 상단)
    darkPanel(this, W / 2, 52, 150, 64);
    this.roundText = this.add.text(W / 2, 44, 'ROUND 1', { fontSize: '20px', fontStyle: 'bold', color: CSS.orange }).setOrigin(0.5);
    this.roundSub = this.add.text(W / 2, 68, '', { fontSize: '13px', fontFamily: 'monospace', color: '#9ab08f' }).setOrigin(0.5);

    // 상대 HP 패널 (우상단) — 내 패널의 좌우 대칭. 이름은 바깥(우), HP 숫자는 안쪽(좌)
    darkPanel(this, HP_R_CX, HP_PANEL_CY, HP_PANEL_W, HP_PANEL_H);
    this.add.text(R_OUT, HP_TEXT_Y, this.practice ? '연습 상대' : '상대', { fontSize: '20px', fontStyle: 'bold', color: CSS.lose }).setOrigin(1, 0);
    this.oppHpText = this.add.text(R_IN, HP_TEXT_Y, '', { fontSize: '18px', fontFamily: 'monospace', color: CSS.lose });
    // 진행 표시는 패널 밖 아래로 — 패널 안에 넣으면 내 패널보다 높아져 좌우가 어긋난다
    // depth — 아래에서 만드는 진행 바(graphics)에 글자가 덮이지 않게
    this.oppProgLabel = this.add.text(R_IN, OPP_PROG_Y, this.practice ? '연습 모드' : '상대 진행 0/0', { fontSize: '14px', color: '#ffcc99' }).setDepth(1);

    this.hpGfx = this.add.graphics();
    this.oppProgGfx = this.add.graphics();
    this.drawHp();
    this.drawOppProgress(0, 0);

    // 현재 인술 이름 (온라인·연습 공통) — 라운드 패널 아래
    this.jutsuLabel = this.add.text(W / 2, 108, '', { fontSize: '22px', fontStyle: 'bold', color: CSS.orange }).setOrigin(0.5);

    // 목표 인장 라벨
    this.targetPill = pill(this, W / 2, 168, '목표 인장 0/0', { fill: 0x2a3a2b, textColor: CSS.orange, bold: true });

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

    // 배너 (술법/피격)
    this.banner = this.add.text(W / 2, 230, '', { fontSize: '44px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5).setDepth(50);

    // 인식 게이지 — 지금 무엇을 인식 중이고 홀드가 얼마나 찼는지 (§3.2)
    // 이게 없으면 "인식이 안 되는 것"과 "인식되는 중"을 구분할 수 없다.
    this.holdGfx = this.add.graphics().setDepth(20);
    this.holdText = this.add.text(0, 0, '', {
      fontSize: '15px', fontStyle: 'bold', color: CSS.scroll,
    }).setOrigin(0.5).setDepth(21);

    this.drawFighters();
  }

  drawFighters() {
    const cy = FIGHTER_CY;
    // 내 캐릭터 = 왼쪽, 상대 = 오른쪽 (HP 패널과 같은 편·피격 흔들림용으로 보관)
    this.meSprite = this.add.image(ME_X, cy, spriteKey(this.meChar.id));
    fit(this.meSprite, 200, 300);
    pill(this, ME_X, cy + 150, '나', { fill: 0x2a3a2b, border: C.orange, textColor: CSS.orange, bold: true });

    this.oppSprite = this.add.image(OPP_X, cy, spriteKey(this.oppChar.id));
    fit(this.oppSprite, 200, 300);
    pill(this, OPP_X, cy + 150, '상대', { fill: 0x2a3a2b, border: C.water, textColor: '#9fd0ff', bold: true });
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
    // 캐릭터 바로 옆(안쪽)에 나란히. 캐릭터·인장 타일·라벨 어디와도 겹치지 않는다.
    const topY = CAM_CY - CAM_H / 2;
    const place = (el, worldCx) => {
      if (!el) return;
      el.style.position = 'fixed';
      el.style.left = `${rect.left + (worldCx - CAM_W / 2) * sx}px`;
      el.style.top = `${rect.top + topY * sy}px`;
      el.style.width = `${CAM_W * sx}px`;
      el.style.height = `${CAM_H * sy}px`;
      el.style.zIndex = '10';
    };
    place(this.localCam, ME_X + CAM_DX);                    // 내 캐릭터(좌)의 오른쪽 옆
    if (!this.practice) place(this.remoteCam, OPP_X - CAM_DX); // 상대 캐릭터(우)의 왼쪽 옆
  }

  restoreCams() {
    if (this._reposition) this.scale.off('resize', this._reposition);
    [this.localCam, this.remoteCam].forEach((el) => {
      if (!el) return;
      ['position', 'left', 'top', 'width', 'height', 'zIndex'].forEach((p) => { el.style[p] = ''; });
    });
    if (this.remoteCam) this.remoteCam.style.display = 'none';
  }

  onRoundStart({ round, sequence, jutsu }) {
    this.sequence = sequence;
    this.currentJutsu = jutsu ?? null; // 서버가 보낸 인술 (온라인) 또는 연습에서 넘긴 것
    this.jutsuLabel.setText(jutsu?.name_kr ?? '');
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

  // 인식 게이지용 구독 — onSeal은 "확정"만 알려주므로, 확정 전 상태를 보려면 프레임을 받아야 한다.
  // 추적기 루프는 씬과 무관하게 계속 도니, 여기선 구독만 하고 종료 시 해지한다.
  subscribeRecognition() {
    const tracker = this.registry.get('handTracker');
    if (!tracker) return; // 인식기 없이 스페이스 폴백으로 도는 경우
    this.unsubFrame = tracker.onFrame(({ state }) => this.drawHoldGauge(state));
  }

  /** 현재 목표 타일 아래에 인식 게이지를 그린다. 무엇을 보여줄지는 holdGaugeView가 정한다 */
  drawHoldGauge(state) {
    const g = this.holdGfx;
    if (!g) return;
    g.clear();
    this.holdText.setText('');

    const view = holdGaugeView(state, this.sequence[this.progress], this.locked);
    if (!view) return;

    const seal = SEALS[view.sealId] ?? { name: view.sealId };
    const x = this.sealX(this.progress), y = 320 + 190 / 2 + 26;
    const w = 150, h = 14;

    g.fillStyle(C.woodShadow, 0.85).fillRoundedRect(x - w / 2, y, w, h, h / 2);
    if (view.fill > 0) {
      // 최소 길이를 h로 둬서 아주 낮은 진행률도 눈에 보이게
      g.fillStyle(view.match ? C.orange : C.woodDark, 1)
        .fillRoundedRect(x - w / 2, y, Math.max(h, w * view.fill), h, h / 2);
    }

    this.holdText.setPosition(x, y + h + 13)
      .setText(view.match ? `${seal.name} 유지…` : `${seal.name} (목표 아님)`)
      .setColor(view.match ? CSS.orange : CSS.muted);
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
        fontFamily: KANJI_FONT, fontSize: '72px', fontStyle: 'bold', color: future ? '#b9a888' : CSS.outline,
      }).setOrigin(0.5);
      const name = this.add.text(x, y + 62, seal.name, { fontSize: '18px', color: future ? '#a99a7a' : '#6a5535' }).setOrigin(0.5);
      this.sealRow.add([kanji, name]);

      if (done) {
        const stamp = this.add.text(x + 30, y - 30, '印', { fontFamily: KANJI_FONT, fontSize: '54px', fontStyle: 'bold', color: hex(C.orange) }).setOrigin(0.5).setAngle(-12).setAlpha(0.9);
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
    const x = R_IN, y = OPP_PROG_BAR_Y, w = 260, h = 16;
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
    // 내 캐릭터=좌, 상대=우. 이기면 상대(우)로 발사, 지면 상대(우)→나(좌)로 술법이 날아와 내가 맞는다.
    if (iWon) {
      // 이김: 완성한 인술 속성을 상대에게 발사 (착탄 시 상대가 흔들림)
      if (this.currentJutsu) this.fireAttack(this.currentJutsu.element, false);
      else this.shakeSprite(this.oppSprite);
    } else {
      // 짐: 같은 인술이 상대→나로 날아와 나를 때린다 (착탄 시 내 캐릭터 흔들림)
      if (this.currentJutsu) this.fireAttack(this.currentJutsu.element, true);
      else this.shakeSprite(this.meSprite);
    }
  }

  // 속성 공격 애니메이션 발사. incoming=false: 내(좌)→상대(우) 공격 / true: 상대(우)→나(좌) 피격.
  // 에셋 없으면 대상 캐릭터 흔들림으로 폴백.
  fireAttack(element, incoming = false) {
    const target = incoming ? this.meSprite : this.oppSprite;
    const fx = FX[element];
    if (!fx) return this.shakeSprite(target);
    const key = `fx-${element}`;
    const run = () => this.launchProjectile(key, element, incoming);
    if (this.textures.exists(key)) return run();
    this.load.spritesheet(key, encodeURI(`/effects/${fx.file}`), { frameWidth: fx.fw, frameHeight: fx.fh });
    this.load.once('complete', () => { if (this.scene.isActive()) run(); });
    this.load.once('loaderror', () => { if (this.scene.isActive()) this.shakeSprite(target); });
    this.load.start();
  }

  launchProjectile(key, element, incoming = false) {
    const fx = FX[element], color = FX_COLOR[element] ?? C.win;
    if (!this.anims.exists(key)) {
      this.anims.create({
        key, frameRate: fx.rate, repeat: -1,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: fx.frames - 1 }),
      });
    }
    // 나=좌, 상대=우. incoming=false: 나(FIRE_FROM)→상대(FIRE_TO) / true: 상대→나
    const fromX = incoming ? FIRE_TO : FIRE_FROM;
    const toX   = incoming ? FIRE_FROM : FIRE_TO;
    const target = incoming ? this.meSprite : this.oppSprite;
    this.spark(fromX, 470, color); // 발사 지점 머즐 플래시
    const p = this.add.sprite(fromX, 470, key).setDepth(60).play(key);
    p.setFlipX(incoming); // 아트는 오른쪽 진행 기준 → 좌향(나에게 날아오는 피격)일 때만 뒤집기
    p.setScale(300 / fx.fh); // 프레임 높이를 ~300px로 (크게)
    this.tweens.add({
      targets: p, x: toX, duration: 1200, ease: 'Sine.inOut',
      onComplete: () => { p.destroy(); this.shakeSprite(target); }, // 착탄: 캐릭터 흔들림
    });
  }

  // 피격 캐릭터를 좌우로 짧게 흔든다 (퍼지는 이펙트 대신).
  shakeSprite(spr) {
    if (!spr) return;
    const x0 = spr.x;
    this.tweens.killTweensOf(spr);
    spr.setX(x0);
    this.tweens.add({
      targets: spr, x: x0 + 14, duration: 45, yoyo: true, repeat: 5, ease: 'Sine.inOut',
      onComplete: () => spr.setX(x0),
    });
  }

  drawHp() {
    const oppId = Object.keys(this.hp).find((id) => id !== this.myId);
    const myHp = this.hp[this.myId] ?? RULES.MAX_HP;
    const oppHp = this.hp[oppId] ?? RULES.MAX_HP;
    this.myHpText.setText(`${myHp} / ${RULES.MAX_HP}`);
    this.oppHpText.setText(`${oppHp} / ${RULES.MAX_HP}`);

    const H2 = HP_BAR_H, r = H2 / 2;
    this.hpGfx.clear();
    // 내 바 (좌 패널 안쪽, 초록, 좌→우로 줆)
    this.hpGfx.fillStyle(0x1a1030, 1).fillRoundedRect(L_IN, HP_BAR_Y, HP_BAR_W, H2, r);
    this.hpGfx.fillStyle(C.win, 1).fillRoundedRect(L_IN, HP_BAR_Y, HP_BAR_W * (myHp / RULES.MAX_HP), H2, r);
    // 상대 바 (우 패널 안쪽, 빨강, 우→좌로 줆 — 내 바와 좌우 대칭)
    this.hpGfx.fillStyle(0x1a1030, 1).fillRoundedRect(R_OUT - HP_BAR_W, HP_BAR_Y, HP_BAR_W, H2, r);
    const fw = HP_BAR_W * (oppHp / RULES.MAX_HP);
    this.hpGfx.fillStyle(C.lose, 1).fillRoundedRect(R_OUT - fw, HP_BAR_Y, fw, H2, r);
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
}

function fit(spr, maxW, maxH) {
  spr.setScale(Math.min(maxW / spr.width, maxH / spr.height));
}

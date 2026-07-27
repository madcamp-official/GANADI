// 대전 씬 — 목표 인장 시퀀스, 양측 체력바, 내 진행 게이지.
// 서버 권위: 로컬 판정 없음. 시퀀스 완성 시 서버에 SEQ_COMPLETE만 송신, 판정은 수신해 반영.
// (인식기 연결 전까지) 스페이스바로 인장 맺기를 시뮬레이션 → onSeal 대체.

import Phaser from 'phaser';
import { EVENTS, RULES } from '../../../shared/constants.js';
import { SEALS } from '../data/seals.js';
import { getCharacter } from '../data/characters.js';
import { getSocket } from '../net/socket.js';
import { startVideoCall } from '../net/webrtc.js';
import { GAME } from '../config.js';

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  create(data) {
    this.socket = getSocket();
    this.myId = this.socket.id;

    this.sequence = [];
    this.progress = 0;
    this.locked = true; // 라운드 시작 전엔 입력 잠금
    this.hp = { [this.myId]: RULES.MAX_HP };

    this.buildStaticUI();

    // 서버 이벤트
    this.socket.on(EVENTS.ROUND_START, (p) => this.onRoundStart(p));
    this.socket.on(EVENTS.ROUND_RESULT, (p) => this.onRoundResult(p));
    this.socket.on(EVENTS.OPP_PROGRESS, ({ progress, total }) => this.drawOppProgress(progress, total));
    this.socket.once(EVENTS.MATCH_OVER, (p) => this.onMatchOver(p));

    // A의 인식기 붙이기 — A가 부팅 시 registry에 넣어둔 recognizer를 집어 연결.
    // (A가 카메라+step() 루프 소유. 여기선 onSeal → onSealMatched 대입만.)
    this.recognizer = this.registry.get('recognizer') ?? null;
    if (this.recognizer) this.attachRecognizer(this.recognizer);

    // 폴백: 인식기가 아직 없으면 스페이스로 "목표 인장 인식된 셈" 시뮬레이션.
    // 인식기가 붙으면 이 입력은 안 써도 됨(중복 무해).
    this.input.keyboard.on('keydown-SPACE', () => {
      if (!this.locked && this.progress < this.sequence.length) {
        this.onSealMatched(this.sequence[this.progress]);
      }
    });

    // 화상(WebRTC) 시작 — 입장한 쪽(joiner)이 발신, 방장이 응답. 실패해도 게임 무관.
    const localStream = this.registry.get('localStream');
    if (localStream && data?.code) {
      this.video = startVideoCall(this.socket, data.code, localStream, {
        isInitiator: !data.isCreator,
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket.off(EVENTS.ROUND_START);
      this.socket.off(EVENTS.ROUND_RESULT);
      this.socket.off(EVENTS.OPP_PROGRESS);
      this.video?.stop();
      // 죽은 씬으로 인식 이벤트가 흘러들지 않게 콜백 해제 (A의 step 루프는 계속 돎)
      if (this.recognizer) this.recognizer.onSeal = () => {};
    });

    // 로비에서 넘겨준 첫 라운드 즉시 반영
    if (data?.firstRound) this.onRoundStart(data.firstRound);
  }

  buildStaticUI() {
    // 체력바 라벨
    this.add.text(40, 30, 'ME', { fontSize: '22px', color: '#8fd3ff' });
    this.add.text(GAME.WIDTH - 40, 30, 'ENEMY', { fontSize: '22px', color: '#ff9a9a' })
      .setOrigin(1, 0);
    this.hpGfx = this.add.graphics();
    this.drawHp();

    // 상대 진행 표시 (OPP_PROGRESS 수신 → 갱신)
    this.oppProgText = this.add.text(GAME.WIDTH - 40, 100, '상대 진행: 0/0', {
      fontSize: '18px', color: '#ffb3b3',
    }).setOrigin(1, 0);

    this.roundText = this.add.text(GAME.WIDTH / 2, 40, '', {
      fontSize: '20px', color: '#c9b8ee',
    }).setOrigin(0.5);

    this.sealRow = this.add.container(0, 0);

    this.hint = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT - 50,
      '[스페이스] 인장 맺기 (인식기 연결 전 임시 입력)', {
        fontSize: '18px', color: '#7a6a95',
      }).setOrigin(0.5);

    this.banner = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT / 2 - 140, '', {
      fontSize: '40px', fontStyle: 'bold', color: '#fff',
    }).setOrigin(0.5);

    this.drawFighters();
  }

  // 캐릭터 스프라이트 자리 — 지금은 색 아바타(플레이스홀더). 내 캐릭터는 선택값, 상대는 기본.
  drawFighters() {
    const me = getCharacter(this.registry.get('character'));
    const cy = GAME.HEIGHT / 2;
    // 내 캐릭터 (좌)
    this.add.rectangle(120, cy, 120, 150, me.color).setStrokeStyle(3, 0xffffff);
    this.add.text(120, cy + 95, me.name, { fontSize: '20px', color: '#fff' }).setOrigin(0.5);
    // 상대 캐릭터 (우) — 캐릭터 교환은 이후 작업, 지금은 실루엣
    this.add.rectangle(GAME.WIDTH - 120, cy, 120, 150, 0x3a2f55).setStrokeStyle(3, 0x6a5d85);
    this.add.text(GAME.WIDTH - 120, cy + 95, '상대', { fontSize: '20px', color: '#9a8bbf' }).setOrigin(0.5);
  }

  onRoundStart({ round, sequence }) {
    this.sequence = sequence;
    this.progress = 0;
    this.locked = true; // 카운트다운 동안 입력 잠금
    this.roundText.setText(`ROUND ${round}`);
    this.renderSeals();
    this.drawOppProgress(0, sequence.length);
    this.startCountdown();
  }

  // 3·2·1·시작! 후 입력 개시. 양쪽이 같은 ROUND_START를 받아 동시에 시작.
  startCountdown() {
    const steps = ['3', '2', '1', '시작!'];
    let i = 0;
    const tick = () => {
      this.banner.setText(steps[i]).setColor('#ffe08a');
      this.tweens.add({ targets: this.banner, scale: { from: 1.5, to: 1 }, duration: 300 });
      i += 1;
      if (i < steps.length) {
        this.time.delayedCall(650, tick);
      } else {
        this.time.delayedCall(450, () => {
          this.banner.setText('').setScale(1);
          this.locked = false;
        });
      }
    };
    tick();
  }

  drawOppProgress(progress, total) {
    this.oppProgText.setText(`상대 진행: ${progress}/${total}`);
  }

  // ── A ↔ B 계약 연결 지점 ──
  // A는 createRecognizer()로 만든 인식기를 이 메서드에 넘기기만 하면 된다.
  // 인식기가 인장을 확정할 때마다 onSeal(sealId, confidence, timestamp)이 호출되고,
  // 그게 아래 onSealMatched로 이어진다. (인식기 내부/프레임 구동은 A 담당)
  attachRecognizer(recognizer) {
    this.recognizer = recognizer;
    recognizer.onSeal = (sealId, confidence, timestamp) =>
      this.onSealMatched(sealId, confidence, timestamp);
  }

  // 인식기가 인장 하나를 확정 → 지금 목표와 일치하면 한 칸 진행.
  // 오인식 페널티 없음: 목표와 다르면 그냥 무시 (§3.2).
  onSealMatched(sealId, confidence = 1, timestamp = Date.now()) {
    if (this.locked || this.progress >= this.sequence.length) return;
    if (sealId !== this.sequence[this.progress]) return; // 목표 인장이 아니면 무시

    this.progress += 1;
    this.renderSeals();
    // 상대 화면에 내 진행 상황 실시간 표시
    this.socket.emit(EVENTS.OPP_PROGRESS, { progress: this.progress, total: this.sequence.length });

    if (this.progress >= this.sequence.length) {
      this.locked = true; // 완성 후 서버 판정까지 입력 잠금
      this.socket.emit(EVENTS.SEQ_COMPLETE, {}); // 승부는 서버 수신 순서로 판정
    }
  }

  renderSeals() {
    this.sealRow.removeAll(true);
    const n = this.sequence.length;
    const boxW = 110, gap = 20;
    const totalW = n * boxW + (n - 1) * gap;
    const startX = (GAME.WIDTH - totalW) / 2 + boxW / 2;
    const y = GAME.HEIGHT / 2;

    this.sequence.forEach((sealId, i) => {
      const done = i < this.progress;
      const x = startX + i * (boxW + gap);
      const box = this.add.rectangle(x, y, boxW, boxW, done ? 0x6c4bd6 : 0x2a2140)
        .setStrokeStyle(3, done ? 0xb79dff : 0x4a3f66);
      const seal = SEALS[sealId] ?? { kanji: '?', name: sealId };
      const kanji = this.add.text(x, y - 12, seal.kanji, {
        fontSize: '44px', color: done ? '#fff' : '#9a8bbf',
      }).setOrigin(0.5);
      const name = this.add.text(x, y + 34, seal.name, {
        fontSize: '16px', color: done ? '#e8d8ff' : '#6a5d85',
      }).setOrigin(0.5);
      this.sealRow.add([box, kanji, name]);
    });
  }

  onRoundResult({ winner, hp }) {
    this.hp = hp;
    this.drawHp();
    const iWon = winner === this.myId;
    this.banner.setText(iWon ? '술법 발동!' : '피격!').setColor(iWon ? '#8fffa0' : '#ff9a9a');
    this.cameras.main.shake(200, iWon ? 0.002 : 0.006);
  }

  drawHp() {
    const oppId = Object.keys(this.hp).find((id) => id !== this.myId);
    const myHp = this.hp[this.myId] ?? RULES.MAX_HP;
    const oppHp = this.hp[oppId] ?? RULES.MAX_HP;
    const W = 460, H = 26, y = 64;

    this.hpGfx.clear();
    // 내 체력 (좌)
    this.hpGfx.fillStyle(0x1a1030).fillRect(40, y, W, H);
    this.hpGfx.fillStyle(0x4fc3ff).fillRect(40, y, W * (myHp / RULES.MAX_HP), H);
    // 상대 체력 (우, 오른쪽 정렬로 줄어듦)
    const rx = GAME.WIDTH - 40 - W;
    this.hpGfx.fillStyle(0x1a1030).fillRect(rx, y, W, H);
    const ow = W * (oppHp / RULES.MAX_HP);
    this.hpGfx.fillStyle(0xff6b6b).fillRect(GAME.WIDTH - 40 - ow, y, ow, H);
  }

  onMatchOver({ winner }) {
    this.locked = true;
    this.scene.start('Result', { won: winner === this.myId });
  }
}

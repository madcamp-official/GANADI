// 인장 인식기 실손 테스트 — 개발용 페이지 (/recognizer-test.html).
// 게임이 쓰는 client/src/recognition/ 코드를 그대로 돌린다. 프로덕션 빌드엔 안 들어간다
// (vite build의 기본 입력은 index.html 하나뿐이라 이 페이지는 dev에서만 뜬다).
//
// 프레임 루프도 게임과 같은 것(handTracker)을 쓴다 — 이 페이지에서 잘 되면
// 게임에서도 같은 경로로 도는 것이 보장된다.

import { getHandTracker } from '../recognition/handTracker.js';
import { classify } from '../recognition/recognizer.js';
import { RECOGNITION } from '../config.js';
import { SEALS } from '../data/seals.js';

const $ = (id) => document.getElementById(id);
const nameOf = (id) => SEALS[id]?.name ?? id;

const video = $('video');
const ctx = $('overlay').getContext('2d');

let flash = { text: null, until: 0 };

// --- 임계값 슬라이더: RECOGNITION 객체를 직접 바꾸면 분류기가 다음 프레임부터 반영 ---
for (const [key, el, out] of [
  ['ACCEPT_THRESHOLD', $('accept'), $('acceptV')],
  ['MARGIN', $('margin'), $('marginV')],
]) {
  el.value = RECOGNITION[key];
  out.textContent = Number(RECOGNITION[key]).toFixed(1);
  el.addEventListener('input', () => {
    RECOGNITION[key] = Number(el.value);
    out.textContent = Number(el.value).toFixed(1);
  });
}

$('start').addEventListener('click', async () => {
  $('start').disabled = true;
  $('start').textContent = '모델 로딩 중…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }, audio: false,
    });
    video.srcObject = stream;
    await video.play();

    // 게임과 같은 추적기 (landmarker 소유 + 프레임 루프)
    const tracker = await getHandTracker(video);

    // B가 게임에서 하는 것과 같은 연결 방식
    tracker.recognizer.onSeal = (sealId, confidence, timestamp) => {
      flash = { text: nameOf(sealId), until: performance.now() + 800 };
      $('fired').textContent = `${nameOf(sealId)} (${confidence.toFixed(2)})`;
      const t = new Date(timestamp).toLocaleTimeString('ko-KR');
      $('log').insertAdjacentHTML('afterbegin', `<div>${t} · ${nameOf(sealId)} · conf ${confidence.toFixed(2)}</div>`);
    };

    // 추적기가 매 프레임 결과를 밀어준다 (루프는 추적기가 소유)
    tracker.onFrame(({ hands, state }) => {
      const detail = classify(hands); // 진단용 (best/second/reason) — 게임은 안 쓴다
      draw(hands, state, detail);
      render(state, detail, hands.length);
    });

    $('start').textContent = '● 동작 중';
  } catch (err) {
    $('start').textContent = '에러: ' + err.message;
    $('start').disabled = false;
    console.error(err);
  }
});

// --- 화면 갱신 ---
function render(state, detail, handCount) {
  $('candidate').textContent = state.candidate
    ? `${nameOf(state.candidate)} · ${(state.holdProgress * 100).toFixed(0)}%`
    : (handCount ? '—' : '손이 안 보임');
  $('hold').style.width = `${state.holdProgress * 100}%`;
  $('hold').style.background = state.confirmed ? '#8fffa0' : '#ffe08a';

  $('reason').textContent = {
    'too-far': `거부: 어느 인장에도 안 가까움 (1등 거리 ${detail.best?.d.toFixed(2)} > ACCEPT ${RECOGNITION.ACCEPT_THRESHOLD})`,
    ambiguous: `거부: 1·2등이 붙어 애매함 (격차 ${(detail.second?.d - detail.best?.d).toFixed(2)} < MARGIN ${RECOGNITION.MARGIN})`,
    'no-hands': '',
    ok: '',
  }[detail.reason] ?? '';

  // 가까운 인장 3개
  if (detail.best) {
    const rows = [detail.best, detail.second].filter(Boolean);
    $('ranks').innerHTML = rows.map((r, i) =>
      `<tr><td class="${i === 0 && detail.reason === 'ok' ? 'win' : ''}">${i + 1}. ${nameOf(r.id)}</td><td>${r.d.toFixed(2)}</td></tr>`
    ).join('');
  }
}

// --- 손 그리기 ---
const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

function draw(hands, state, detail) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);

  const color = state.confirmed ? '#8fffa0' : detail.reason === 'ok' ? '#ffe08a' : '#6c4bd6';
  for (const lm of hands) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    for (const [a, b] of BONES) {
      ctx.beginPath();
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    for (const p of lm) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2); ctx.fill(); }
  }

  if (flash.text && performance.now() < flash.until) {
    ctx.save();
    ctx.scale(-1, 1); // 캔버스가 좌우반전이라 글자는 되돌린다
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.fillStyle = '#8fffa0';
    ctx.textAlign = 'center';
    ctx.fillText(flash.text, -w / 2, h / 2);
    ctx.restore();
  }
}

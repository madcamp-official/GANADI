// 공통 UI 테마 — 숲속 닌자 두루마리 톤. 목업(docs/design) 색 토큰과 공용 그리기 헬퍼.
// 씬들은 여기 헬퍼로 배경/패널/버튼을 그려 톤을 통일한다.

import { GAME, RENDER_SCALE } from '../config.js';

// 한글이 깨지지 않는 시스템 폰트 스택
// 커스텀 글씨체 우선 (client/public/fonts/game.ttf). 없으면 시스템 한글 폰트로 폴백.
// 폰트명은 홑따옴표 — 인라인 style="..." 속성에 그대로 꽂히므로 큰따옴표를 쓰면 속성이 잘린다.
export const FONT = "'GameFont', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

// 한자(十二支·印·忍·인장) 전용 폰트. 커스텀(client/public/fonts/kanji.ttf) → 일본식 폰트 순.
// 한글 폰트엔 한자 글리프가 없어 중국어(SC)로 폴백되는 걸 막는다.
export const KANJI_FONT = "'KanjiFont', 'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif JP', 'MS Mincho', serif";

// 고해상도 렌더 + 텍스트 기본값 설치. 각 씬 create() 맨 앞에서 호출.
// - 카메라를 RENDER_SCALE배 줌해 1280×720 좌표를 고해상도 버퍼에 그린다 (선명도).
// - add.text에 기본 폰트 + 상하 여백을 자동 적용 (한글 윗부분 잘림 방지).
export function hiDPI(scene) {
  scene.cameras.main.setZoom(RENDER_SCALE);
  scene.cameras.main.centerOn(GAME.WIDTH / 2, GAME.HEIGHT / 2);
  installTextDefaults(scene);
}

function installTextDefaults(scene) {
  if (scene.__textPatched) return;
  scene.__textPatched = true;
  const orig = scene.add.text.bind(scene.add);
  scene.add.text = (x, y, str, style = {}) => {
    const merged = {
      fontFamily: FONT,
      padding: { top: 10, bottom: 10, left: 4, right: 4 },
      ...style, // 개별 지정(fontFamily/padding 포함)이 있으면 우선
    };
    return orig(x, y, str, merged);
  };
}

export const C = {
  forestDark: 0x1e3a2b, forestMid: 0x3e6b3a, grass: 0x7cb05a, sun: 0xeaf3c0,
  wood: 0x8a6b4a, woodDark: 0x5a4632, woodShadow: 0x3c2c1c, outline: 0x2a1d12,
  scroll: 0xfaf1d8, scrollDark: 0xe9d9b2,
  orange: 0xff7a2f, win: 0x9be870, lose: 0xe5484d,
  fire: 0xff7a2f, water: 0x2f9bff, wind: 0x3fb950, elec: 0xf4c038,
};

// 텍스트 색용 CSS 문자열
export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
export const CSS = {
  scroll: hex(C.scroll), outline: hex(C.outline), orange: hex(C.orange),
  win: hex(C.win), lose: hex(C.lose), sun: hex(C.sun), wood: hex(C.wood),
  muted: '#b9a888',
};

export const DIFF = {
  horizontal: { label: '쉬움', color: C.wind },
  vertical:   { label: '보통', color: C.elec },
  interlock:  { label: '어려움', color: C.lose },
};

// 숲속 수련장 배경 (Graphics로 페인팅). depth 최하단.
// ★ scene.scale.width(=2560, 렌더 배수가 곱해진 캔버스 크기)가 아니라 GAME.WIDTH(=1280)를 쓴다.
//   카메라가 setZoom(RENDER_SCALE) + centerOn(640,360)이라 실제로 보이는 월드는 0~1280 × 0~720뿐이다.
//   캔버스 크기로 그리면 잔디 언덕(y=H*1.05)·햇살·뒤 나무가 전부 화면 밖으로 나가고
//   의도한 구도의 좌상단 1/4만 보인다.
export function drawForest(scene) {
  const W = GAME.WIDTH, H = GAME.HEIGHT;
  const g = scene.add.graphics().setDepth(-100);
  // 세로 그라데이션 (위 그늘 → 아래 미드그린)
  g.fillGradientStyle(C.forestDark, C.forestDark, C.forestMid, C.forestMid, 1);
  g.fillRect(0, 0, W, H);
  // 위쪽 캐노피 글로우
  g.fillStyle(C.forestMid, 0.55); g.fillEllipse(W / 2, H * 0.30, W * 0.95, H * 0.55);
  // 흐릿한 뒤 나무들
  g.fillStyle(0x16281c, 0.5);
  [0.1, 0.68, 0.9].forEach((fx) => g.fillRoundedRect(W * fx - 42, -20, 84, H * 0.82, 22));
  // 햇살 광선
  g.fillStyle(C.sun, 0.05);
  [0.34, 0.5, 0.63].forEach((rx) => {
    const x = W * rx;
    g.fillPoints([{ x, y: 0 }, { x: x + 70, y: 0 }, { x: x - 70, y: H }, { x: x - 170, y: H }], true);
  });
  // 앞쪽 잔디 언덕 + 바닥 그림자
  g.fillStyle(C.grass, 0.45); g.fillEllipse(W / 2, H * 1.05, W * 1.4, H * 0.5);
  g.fillStyle(0x14251b, 0.35); g.fillEllipse(W / 2, H * 0.99, W * 0.7, H * 0.1);
  return g;
}

// 두루마리(한지) 패널 — 중심 좌표 기준. 아래 그림자 + 나무 테두리.
export function panel(scene, cx, cy, w, h, opts = {}) {
  const r = opts.radius ?? 12;
  const fill = opts.fill ?? C.scroll;
  const border = opts.border ?? C.woodDark;
  const g = (opts.g ?? scene.add.graphics());
  const x = cx - w / 2, y = cy - h / 2;
  g.fillStyle(C.woodShadow, opts.shadowAlpha ?? 1).fillRoundedRect(x, y + 7, w, h, r);
  g.fillStyle(fill, opts.alpha ?? 1).fillRoundedRect(x, y, w, h, r);
  g.lineStyle(opts.borderWidth ?? 5, border, 1).strokeRoundedRect(x, y, w, h, r);
  return g;
}

// 어두운 반투명 HUD 패널 (대전 체력/라운드 등)
export function darkPanel(scene, cx, cy, w, h, opts = {}) {
  const r = opts.radius ?? 10;
  const g = scene.add.graphics();
  const x = cx - w / 2, y = cy - h / 2;
  g.fillStyle(0x1a2a1e, opts.alpha ?? 0.72).fillRoundedRect(x, y, w, h, r);
  g.lineStyle(3, C.woodDark, 1).strokeRoundedRect(x, y, w, h, r);
  return g;
}

// 두루마리 버튼 — { zone, setLabel, g, t } 반환. 호출측이 zone.on('pointerdown') 연결.
export function button(scene, cx, cy, w, h, label, opts = {}) {
  const fill = opts.color ?? C.scroll;
  const g = scene.add.graphics();
  const x = cx - w / 2, y = cy - h / 2;
  g.fillStyle(C.woodShadow, 1).fillRoundedRect(x, y + 6, w, h, 10);
  g.fillStyle(fill, 1).fillRoundedRect(x, y, w, h, 10);
  g.lineStyle(4, C.woodDark, 1).strokeRoundedRect(x, y, w, h, 10);
  const t = scene.add.text(cx, cy, label, {
    fontSize: opts.fontSize ?? '24px', fontStyle: 'bold',
    color: opts.textColor ?? (fill === C.orange ? CSS.scroll : CSS.outline),
  }).setOrigin(0.5);
  const zone = scene.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
  return { zone, g, t, setLabel: (s) => t.setText(s) };
}

// 좌상단 "← 로비로" 버튼 (로비 이후 화면 공통). 최상위 depth로 올림.
export function lobbyButton(scene, opts = {}) {
  const b = button(scene, 92, 42, 150, 48, '← 로비로', { fontSize: '18px', ...opts });
  b.g.setDepth(500); b.t.setDepth(501); b.zone.setDepth(501);
  b.zone.on('pointerdown', () => scene.scene.start('Lobby'));
  return b;
}

// 알약(pill) 라벨
export function pill(scene, cx, cy, label, opts = {}) {
  const t = scene.add.text(cx, cy, label, {
    fontSize: opts.fontSize ?? '18px', fontStyle: opts.bold ? 'bold' : 'normal',
    color: opts.textColor ?? CSS.scroll,
  }).setOrigin(0.5);
  const w = t.width + (opts.padX ?? 28), h = t.height + (opts.padY ?? 14);
  const g = scene.add.graphics();
  g.fillStyle(opts.fill ?? 0x2a3a2b, opts.alpha ?? 0.85)
    .fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  if (opts.border) g.lineStyle(2, opts.border, 1).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  t.setDepth(g.depth + 1);
  return { g, t };
}

// 십이지 印 도장 배지 (주황 사각 + 印)
export function inkStamp(scene, cx, cy, size = 44) {
  const g = scene.add.graphics();
  g.fillStyle(C.orange, 1).fillRoundedRect(cx - size / 2, cy - size / 2, size, size, 8);
  g.lineStyle(3, C.woodShadow, 1).strokeRoundedRect(cx - size / 2, cy - size / 2, size, size, 8);
  const t = scene.add.text(cx, cy, '印', {
    fontFamily: KANJI_FONT, fontSize: `${Math.floor(size * 0.6)}px`, fontStyle: 'bold', color: CSS.scroll,
  }).setOrigin(0.5);
  return { g, t };
}

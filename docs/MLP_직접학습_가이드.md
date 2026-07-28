# MLP 직접 학습하기 — step by step (데이터 증강 포함)

> **목표**: 센트로이드를 대체할 소형 MLP를 내 손으로 학습시켜 `client/public/model/seal-mlp/`에 떨어뜨리고,
> **교차 세션 성적**으로 정직하게 채점한 뒤 게임에 꽂는다.
>
> 전제: [features.js](../client/src/recognition/features.js)는 **고치지 않는다.** 센트로이드와 수집 데이터가 전부 그 위에 세워져 있다.
> 특징을 개선할 때도 `featuresV2.js`를 새로 만들어 MLP 경로만 쓰게 한다 (Step 2).

---

## 0. 시작 전에 — 측정으로 확인된 사실 3가지

이 세 가지를 모르고 시작하면 하루를 통째로 버린다. 전부 이 저장소의 실제 데이터로 잰 숫자다.

### ① 믿을 수 있는 숫자는 "교차 세션" 하나뿐

| 채점 방식 | 센트로이드 | MLP |
| --- | --- | --- |
| 합본 채점 (학습한 데이터로 채점) | 96.0% | — |
| **1차 학습 → 2차 평가 (교차 세션)** | **33.8%** | **60.4% ± 4.1%p** |

합본 96%는 시험 문제를 미리 보고 친 시험이다. **다른 날 찍은 손을 맞추는 비율만이 게임에서의 성능**이고, 시연 때 심사위원 손은 그보다 더 낮다.
→ 이 문서의 모든 채점은 `1차 학습 → 2차 평가` / `2차 학습 → 1차 평가` 두 방향 평균으로 한다.

이 문서를 다 따라가면 저 **60.4%가 69.1%(특징 v2)** 가 되고, 증강으로 편차가 줄어든다. **그래도 대전에 쓸 수준은 아니다** — 마지막 구간은 제3자 수집으로만 메워진다 (Step 8).

### ② 데이터는 "적은" 게 아니라 "안 다양한" 것이다

한 인장을 30장 연사로 찍는데, 그 30장이 사실상 같은 한 장이다.

```
라벨      연속프레임 거리   라벨 내 평균거리   비율
dog             0.10            0.24         0.42
horse           0.15            0.36         0.41
rat             0.23            0.26         0.88
tiger           2.04            1.96         1.04   ← 손 놓침으로 튄 것
```

더 중요한 건 이쪽이다. **같은 세션 안에서의 흩어짐 vs 다른 날 같은 인장까지의 거리:**

```
라벨      같은 세션 내   1차↔2차 세션 간
dog            0.24          2.44      ← 10배
horse          0.36          3.00
rat            0.26          2.76
ox             0.37          3.27
dragon         0.38          3.92
tiger          1.96          5.66
goat           2.00          8.31
```

모델이 학습 때 본 구름의 반지름은 0.3인데, 실전에서 들어오는 점은 2.4~8.3 떨어진 곳에 찍힌다.
참고로 센트로이드의 `ACCEPT_THRESHOLD`가 **4.0**이다 — 다른 날 손의 절반은 애초에 임계값 밖이다.

**그래서 학습 데이터를 줄여봐도 성적이 안 떨어진다.** 학습량만 25%까지 깎아가며 재봤다:

| 학습량 | 샘플 수 | 교차 세션 평균 |
| --- | --- | --- |
| 25% | 96 / 111장 | 62.3% |
| 50% | 180 / 210장 | 60.1% |
| 75% | 276 / 321장 | 58.7% |
| 100% | 360 / 420장 | 61.3% |

**완전히 평평하다.** 96장이 360장과 같다 (차이는 전부 σ≈4%p 노이즈 안). 30장 연사가 사실상 한 장이라 **96장이면 이 데이터셋의 정보를 이미 다 쓴 것**이다.

> **그러니까 같은 방식으로 30장을 300장으로 늘려도 61%에서 안 움직인다.**
> **"데이터를 늘린다"는 반드시 "사람·조건을 늘린다"는 뜻이어야 한다.** 제3자 3명 × 12종 × 10장(360장)이 팀원 손 3,000장보다 확실히 낫다.
>
> 같은 이유로 **증강의 목표도 "장수를 5배로"가 아니라 "0.3짜리 구름을 2~3 크기로 부풀리기"** 다.

### ③ ★ 이미지 증강 감각으로 짜면 절반은 아무 일도 안 한다

특징이 **쌍거리(pairwise distance)** 라서, 강체변환과 스케일에 완전히 불변이다. 실제로 재봤다:

| 증강 | 특징 벡터 변화량 (max) | 쓸모 |
| --- | --- | --- |
| 평행이동 (+0.1) | `0.00e+0` | ❌ 완전 무의미 |
| 화면 내 회전 (20°) | `1.11e-15` | ❌ 완전 무의미 |
| 확대/축소 (×1.3) | `8.88e-16` | ❌ 완전 무의미 |
| **3D yaw 회전 (15°)** | **`5.95e-1`** | ✅ 유효 |

앞의 세 개는 부동소수점 오차 수준, 즉 **완전히 같은 벡터**다. `normalizeLandmarks`가 손목 기준으로 옮기고 손바닥 길이로 나눠버린 뒤 거리만 재기 때문이다.
이걸 모르고 "좌우 시프트 + 회전 + 스케일"로 데이터를 5배 부풀리면, **똑같은 벡터 5장**을 얻고 성적은 1도 안 움직인다.

직접 확인해보고 싶으면:

```bash
node --input-type=module -e "
import {readFileSync} from 'node:fs';
import {extractFeatures} from './client/src/recognition/features.js';
const rows=JSON.parse(readFileSync('data/seals_2026-07-27_420f_420img/data.json','utf8'));
const r=rows.find(x=>x.handCount===2);
const base=extractFeatures(r.landmarks);
const rot=(lm,t)=>lm.map(h=>h.map(p=>({x:p.x*Math.cos(t)-p.y*Math.sin(t),y:p.x*Math.sin(t)+p.y*Math.cos(t),z:p.z})));
const d=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
console.log('화면 회전 20도 →', d(base,extractFeatures(rot(r.landmarks,0.35))).toExponential(2));
"
```

---

## Step 1. 준비 (5분)

### 1-1. 데이터 확인

```bash
node -e "const fs=require('fs');for(const d of fs.readdirSync('data')){const r=JSON.parse(fs.readFileSync('data/'+d+'/data.json'));const c={};r.forEach(x=>c[x.label]=(c[x.label]||0)+1);console.log(d,r.length,JSON.stringify(c));}"
```

세션이 **2개 이상** 있어야 교차 평가가 된다. 3차 수집(`data/seals_2026-07-28_*`)이 있으면 그게 최고의 검증 세트다 — 제3자 손이 섞여 있으니까.

### 1-2. tfjs — 이미 깔려 있다. `tfjs-node`는 깔지 마라

`@tensorflow/tfjs` 4.x가 루트 `node_modules`에 있고 `tools/mlpEval.mjs`가 그걸 쓴다.

Node에서 실행하면 `tfjs-node를 설치하라`는 안내가 뜨는데 **무시해라.** 윈도우에서 `@tensorflow/tfjs-node`는 네이티브 바인딩 빌드가 필요하고, 해커톤 중에 여기서 반나절이 녹는다. 순수 JS 백엔드로도 **780장 × 200 epoch이 몇 분**이면 끝난다.

대신 딱 하나 대가가 있다: **`model.save('file://...')`가 안 된다** (`file://` 핸들러는 tfjs-node 전용). Step 5에서 아티팩트를 직접 파일로 쓰는 방법으로 우회한다. 검증 완료된 방법이다.

---

## Step 2. ★ 특징 설계부터 고친다 — 측정된 것 중 가장 큰 이득 (+8.4%p)

**증강보다 이걸 먼저 해라.** 데이터를 한 장도 더 안 찍고, 코드 한 줄로 얻는 이득이 증강보다 두 배 크다.

### 문제: MediaPipe가 21점을 주는데 10점만 쓰고 있다

```js
// features.js
export const FEATURE_POINTS = [0, 4, 8, 12, 16, 20, 5, 9, 13, 17];
//                             손목  ─손끝 5개─   ── MCP 4개 ──
```

빠진 게 **PIP·DIP — 손가락 중간 관절 전부**다. 인장은 손가락을 **얼마나 굽혔는지**가 핵심인데, 그 정보가 "손끝↔MCP 거리" 하나로 뭉개져 있다. 반쯤 굽힌 손가락과 완전히 접은 손가락이 비슷한 값으로 나올 수 있다는 뜻이다.

### 측정 (교차 세션, 3회 평균)

| 특징 설계 | 차원 | 평균 |
| --- | --- | --- |
| v1 현재 10점 (2D 거리) | 90 | 63.2% |
| v1 + z (3D 거리) | 90 | 62.2% |
| **v2 14점 (+PIP)** | **182** | **67.0%** |
| v3 21점 전부 | 420 | 66.4% |

v1과 v2를 **5회씩** 반복해 확정했다:

```
v1 현재 10점   60.0  60.6  62.1  56.9  63.9  →  60.7% · σ 2.6%p · 최고 63.9%
v2 14점 +PIP   68.6  66.0  68.3  72.5  70.1  →  69.1% · σ 2.4%p · 최저 66.0%
                                                          ↑ v1의 최고보다 높다
```

**+8.4%p이고, 5회 중 겹치는 구간이 하나도 없다.** 증강(+3.9%p, 1.7σ)과 달리 이건 확정이다.

읽어낼 것:

- **DIP는 보태는 게 없다** — v3(21점 전부)가 v2보다 낮다. 이득은 전부 PIP에서 나오고, 나머지는 차원만 420으로 불려 780장에 과적합될 뿐이다. **14점이 딱 맞는 지점.**
- **z를 넣으면 오히려 떨어진다** (62.2%). [features.js](../client/src/recognition/features.js) 주석의 *"z는 MediaPipe 추정값이라 신뢰도가 낮다"* 가 숫자로 맞았다. 그 판단은 그대로 두면 된다.

### ⚠️ 기존 파일을 고치지 말고 새 파일을 만든다

`features.js`를 고치면 **센트로이드·수집 데이터의 `features` 필드·`replay.mjs`의 재현성 검사가 전부 무효**가 된다 (그 파일 상단 경고 그대로다). 센트로이드 폴백을 살려두는 §4.6 계약도 깨진다.

→ **`client/src/recognition/featuresV2.js`를 새로 만들고, MLP 경로만 쓰게 한다.**

```js
// featuresV2.js — MLP 전용 특징 (v2). 센트로이드는 features.js(v1)를 계속 쓴다.
//
// v1과의 차이는 점 목록 하나뿐이다: PIP 관절 4개(6,10,14,18) 추가 → 손가락 굽힘이 살아난다.
// 교차 세션 60.7% → 69.1% (5회 평균, 분포 겹침 없음).
// DIP(7,11,15,19)까지 넣으면 오히려 떨어진다 — 차원만 늘고 과적합된다.

import { normalizeLandmarks } from './features.js';

/** 손목 + 손끝5 + MCP4 + PIP4 = 14점 */
export const FEATURE_POINTS_V2 = [0, 4, 8, 12, 16, 20, 5, 9, 13, 17, 6, 10, 14, 18];

export const FEAT_PER_HAND_V2 = 91;   // 14점 → 14×13/2
export const FEAT_LENGTH_V2 = 182;    // 두 손 고정 길이

function pairwiseV2(lm) {
  const n = normalizeLandmarks(lm);
  const out = [];
  for (let a = 0; a < FEATURE_POINTS_V2.length; a++) {
    for (let b = a + 1; b < FEATURE_POINTS_V2.length; b++) {
      const pa = n[FEATURE_POINTS_V2[a]];
      const pb = n[FEATURE_POINTS_V2[b]];
      out.push(Math.hypot(pa.x - pb.x, pa.y - pb.y)); // ★ z는 넣지 않는다 (넣으면 떨어진다)
    }
  }
  return out;
}

/** v1과 동일한 규칙: 손목 x로 왼→오 정렬, 없는 손 자리는 0 */
export function extractFeaturesV2(hands) {
  const slots = [new Array(FEAT_PER_HAND_V2).fill(0), new Array(FEAT_PER_HAND_V2).fill(0)];
  if (hands?.length) {
    [...hands].sort((a, b) => a[0].x - b[0].x).slice(0, 2)
      .forEach((lm, i) => { slots[i] = pairwiseV2(lm); });
  }
  return [...slots[0], ...slots[1]];
}
```

`normalizeLandmarks`는 `features.js`에서 이미 export돼 있으니 그대로 쓴다 — 정규화 규칙까지 갈라지면 나중에 원인을 못 찾는다.

이후 Step 4·5의 스크립트에서 `extractFeatures` → `extractFeaturesV2`, 입력 차원 `90` → `182`로 바꾸면 된다.

### 아직 못 쓰는 카드: `worldLandmarks`

MediaPipe는 `result.worldLandmarks`(미터 단위 3D, **원근 보정됨**)를 공짜로 같이 준다. 지금 특징은 이미지 평면 좌표라 카메라 각도·거리에 흔들리는데, 세션 간 10배 간극(Step 0 ②)의 유력한 주범이 바로 그것이다.

문제는 [collector.js](../hand-test/js/collector.js)의 `makeSample`이 `result.landmarks`만 저장한다는 것 — **지금 데이터로는 테스트조차 못 한다.**

→ **다음 수집 전에 `makeSample`에 한 줄 추가해라.** 비용이 사실상 0이고, 나중에 쓸 카드를 여는 일이다:

```js
worldLandmarks: result.worldLandmarks?.map(h => h.map(p => ({ x: p.x, y: p.y, z: p.z }))) ?? [],
```

---

## Step 3. 증강 모듈 만들기 — `tools/lib/augment.mjs`

**증강은 특징(90차원)이 아니라 랜드마크(21점 × 손)에 걸어야 한다.** 특징 벡터에 노이즈를 직접 뿌리면 "실제 손으로는 만들 수 없는 거리 조합"이 생겨서, 모델이 존재하지 않는 손을 배운다.

쓸모 있는 증강은 네 가지고, 넷 다 **실제로 일어나는 일**에 대응한다.

| 증강 | 흉내내는 현실 | 특징을 바꾸나 |
| --- | --- | --- |
| **3D 회전** (yaw/pitch) | 카메라를 비스듬히 보거나 손을 기울여 맺음 | ✅ 크게 |
| **랜드마크 지터** | MediaPipe 추정 오차 · 손 크기/두께 차이 | ✅ 작게 |
| **좌우 미러** | 왼손잡이 · 좌우를 반대로 맺는 사람 | ✅ 슬롯 스왑으로 |
| **손 드롭** | 두 손이 겹쳐 MediaPipe가 한 손만 잡음 (호랑이·양의 실패 모드) | ✅ 45차원이 0으로 |

파일을 만든다:

```js
// tools/lib/augment.mjs
// 랜드마크 단계 증강. ★ 특징(90차원)이 아니라 손 좌표에 건다 —
//   특징에 직접 노이즈를 뿌리면 실제 손으로는 만들 수 없는 거리 조합이 생긴다.
//
// ⚠️ 평행이동·화면 내 회전·확대축소는 넣지 마라. 특징이 쌍거리라서 값이 안 변한다(측정: 1e-15).

/** 재현 가능한 난수 — 같은 시드면 같은 증강본이 나온다 (실험 비교용) */
export function makeRng(seed = 1234) {
  let s = seed;
  const next = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = next();
    while (!v) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { next, gauss };
}

/**
 * 3D 회전 — 손목을 축으로 yaw(좌우)·pitch(상하) 회전.
 * MediaPipe의 z는 손 크기에 대한 상대 깊이라 x와 대략 같은 스케일이다. 근사지만
 * "손을 비스듬히 든" 손을 만들어내는 데는 충분하고, 이게 가장 크게 먹히는 증강이다.
 */
export function rotate3d(hands, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return hands.map((h) => {
    const o = h[0]; // 손목 기준
    return h.map((p) => {
      let x = p.x - o.x, y = p.y - o.y, z = p.z - o.z;
      [x, z] = [x * cy + z * sy, -x * sy + z * cy]; // yaw
      [y, z] = [y * cp - z * sp, y * sp + z * cp];  // pitch
      return { x: x + o.x, y: y + o.y, z: z + o.z };
    });
  });
}

/** 랜드마크 지터 — 좌표계가 0~1 정규화라 σ=0.004면 손 폭의 약 2% */
export function jitter(hands, sigma, rng) {
  return hands.map((h) => h.map((p) => ({
    x: p.x + rng.gauss() * sigma,
    y: p.y + rng.gauss() * sigma,
    z: p.z + rng.gauss() * sigma,
  })));
}

/**
 * 좌우 미러.
 * 거리는 반사에도 불변이지만, extractFeatures가 손목 x로 왼→오 정렬하므로
 * 두 손의 45차원 블록이 서로 자리를 바꾼다. 좌우 비대칭 인장에는 진짜 새 샘플이다.
 */
export function mirror(hands) {
  return hands.map((h) => h.map((p) => ({ x: -p.x, y: p.y, z: p.z })));
}

/** 두 손 중 하나를 버린다 — MediaPipe가 겹친 손을 놓치는 상황 재현 */
export function dropHand(hands, rng) {
  return hands.length === 2 ? [hands[rng.next() < 0.5 ? 0 : 1]] : hands;
}

/**
 * 기본 레시피 — Step 4에서 측정한 조합.
 * @param {Array<Array<{x,y,z}>>} hands 원본 손 좌표
 * @param {{next:Function,gauss:Function}} rng
 */
export function augment(hands, rng, opt = {}) {
  const {
    yawRange = 0.5,    // ±0.25 rad ≈ ±14°
    pitchRange = 0.5,
    sigma = 0.004,
    mirrorP = 0.5,
    dropP = 0,        // ★ 기본 0. 측정 결과 드롭을 넣으면 기준선 아래로 떨어진다 (Step 4)
  } = opt;

  let out = rotate3d(hands, (rng.next() - 0.5) * yawRange, (rng.next() - 0.5) * pitchRange);
  if (rng.next() < mirrorP) out = mirror(out);
  if (rng.next() < dropP) out = dropHand(out, rng);
  return jitter(out, sigma, rng);
}
```

> **손 드롭은 기본값이 0이다 — 재봤더니 해로웠다.** MLP는 평균이 아니라 결정경계를 배우니 센트로이드와는 다를 줄 알았는데, 넣으면 기준선 아래로 떨어진다(Step 4 표). 센트로이드에서 `pig__1h` 9장이 뱀을 무너뜨린 것과 같은 병이다 ([makeCentroids.mjs](../tools/makeCentroids.mjs) 주석). 함수는 남겨뒀으니 3차 데이터가 들어온 뒤 다시 재보고 판단해라.

---

## Step 4. 증강이 실제로 먹히는지 **먼저 잰다** (30분)

학습 스크립트를 짜기 전에 이걸 먼저 한다. 안 먹히는 증강을 넣고 학습 파이프라인을 만들면, 나중에 성적이 안 나올 때 원인이 증강인지 모델인지 구분이 안 된다.

`tools/augExp.mjs`를 만들어 레시피별로 교차 세션 성적을 잰다 (핵심만):

```js
// tools/augExp.mjs — 레시피별 교차 세션 성적 비교
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as tf from '@tensorflow/tfjs';
import { extractFeaturesV2 as extractFeatures } from '../client/src/recognition/featuresV2.js'; // ★ v2로 잴다
import { makeRng, rotate3d, jitter, mirror, dropHand, augment } from './lib/augment.mjs';

const dirs = readdirSync('data').map((f) => join('data', f))
  .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'data.json'))).sort();
const sets = dirs.map((d) => ({ name: d, rows: JSON.parse(readFileSync(join(d, 'data.json'), 'utf8')) }));
const LABELS = [...new Set(sets.flatMap((s) => s.rows.map((r) => r.label)))].sort();
const rng = makeRng(1234);

const RECIPES = {
  none: null,
  jitter: (h) => jitter(h, 0.004, rng),
  rot: (h) => rotate3d(h, (rng.next() - 0.5) * 0.5, (rng.next() - 0.5) * 0.5),
  mirror: (h) => mirror(h),
  'rot+jitter': (h) => jitter(rotate3d(h, (rng.next() - 0.5) * 0.5, (rng.next() - 0.5) * 0.5), 0.004, rng),
  full: (h) => augment(h, rng),                          // rot+jitter+mirror (권장)
  'full+drop': (h) => augment(h, rng, { dropP: 0.15 }),  // 손 드롭까지
};

function expand(rows, recipe, mult) {
  const out = rows.map((r) => ({ x: extractFeatures(r.landmarks), y: LABELS.indexOf(r.label) }));
  if (!recipe) return out;
  for (let k = 0; k < mult; k++)
    for (const r of rows) out.push({ x: extractFeatures(recipe(r.landmarks)), y: LABELS.indexOf(r.label) });
  return out;
}
// …학습(build+fit)과 채점은 tools/mlpEval.mjs의 build()/run()을 그대로 재사용하면 된다.
// ★ 평가 세션은 절대 증강하지 않는다. 증강된 시험지로 채점하면 아무 의미가 없다.
```

### 실측 결과 (2세션 780장 · 증강 5배 · epochs 120 · 각 3회 평균)

| 레시피 | 1차→2차 | 2차→1차 | **평균** |
| --- | --- | --- | --- |
| 증강 없음 (기준선) | 58.7% | 64.5% | **61.6%** |
| 지터만 | 62.9% | 62.9% | **62.9%** |
| 3D 회전만 | 58.0% | 70.5% | **64.2%** |
| 미러만 | 62.3% | 61.6% | **61.9%** |
| 회전 + 지터 | 55.6% | 68.0% | **61.8%** |
| **회전 + 지터 + 미러** | 62.1% | 66.3% | **64.2%** |
| 회전 + 지터 + 미러 + 드롭 | 61.7% | 60.2% | **61.0%** |

### ★ 이 표를 정직하게 읽으면

**위 표만 보고 1등 레시피를 고르면 안 된다.** 3회 평균으로는 레시피 간 차이(폭 3.2%p)가 재실행 편차보다 작기 때문이다. 그래서 기준선과 최고 후보를 **각각 5회씩** 다시 돌려 흔들림까지 쟀다:

```
증강 없음        55.7  66.2  60.0  62.6  57.7   →  평균 60.4% · σ 4.1%p · 최저 55.7%
회전+지터+미러   61.6  63.2  62.4  68.8  65.3   →  평균 64.3% · σ 2.9%p · 최저 61.6%
```

여기서 읽어낼 것:

- **평균은 +3.9%p 오른다.** 다만 5회로는 통계적으로 확정할 수 없다 (평균 차이가 표준오차의 약 1.7배 — 우연일 확률이 무시 못 할 수준). 방향은 일관되지만 "확실히 좋아졌다"고 말하면 과장이다.
- **↑ 이것보다 중요한 게 이쪽이다: 편차가 줄고 바닥이 올라간다.** σ 4.1 → 2.9, 최저값 55.7% → 61.6%. 증강 없는 5회 중 3회가 증강본의 최저치보다 낮았다.
  **시연에서 중요한 건 평균이 아니라 최악의 경우다.** 편차를 줄이는 것만으로도 넣을 값어치가 있다.
- **회전이 핵심이다** — 단독(64.2%)이든 조합(64.3%)이든 상위. 특징을 실제로 크게 바꾸는 유일한 변환이라는 Step 0 ③의 측정과 맞아떨어진다.
- **손 드롭은 넣지 마라** — 유일하게 기준선 아래로 내려간다(61.0%). 45차원이 0인 샘플을 늘리면 모델이 "정보 없음"을 라벨에 억지로 연결한다. 센트로이드에서 `pig__1h`가 뱀을 무너뜨린 것과 같은 병이다.
- **미러는 단독으론 무의미**(61.9%)하지만 조합에서는 해가 없다. 왼손잡이 대비용으로 넣어둘 값어치는 있다.

**추천: `회전 + 지터 + 미러` (드롭 없음).** 평균 +4%p는 덤이고, 진짜 이유는 **성적이 덜 흔들린다**는 것이다.

> ### ⚠️ 다만 증강에 하루를 쓰지 마라
>
> 60% → 64%는 게임에 쓸 수준이 아니다. 그 간극을 메우는 건 증강이 아니다.
>
> Step 0 ②의 숫자를 다시 봐라. 같은 세션 내 흩어짐 0.24 vs 세션 간 거리 2.44 — **10배 차이**다.
> 증강은 원본 손을 비틀어 만든 것이라 그 10배 간극의 원인, 즉 **"다른 사람의 손 모양 자체"** 를 만들어내지 못한다.
>
> **제3자 1명을 30분 붙잡아 찍는 게 증강 파라미터를 하루 종일 만지는 것보다 확실히 낫다.**
> 증강은 2시간 안에 끝내고(레시피 확정 → 학습 → 채점), 남는 시간은 수집에 써라.

### 그래도 더 짜보고 싶다면

- **증강 배수(mult)**: 5배가 기본. 10배로 올려도 같은 원본의 복제라 대개 안 오른다 — 오르는지 재보고 판단.
- **회전 폭**: ±14°(0.5)가 기본. ±28°(1.0)까지 키우면 오르는지. 너무 키우면 인장이 다른 인장처럼 보여서 오히려 떨어진다.
- **판단 기준**: 측정된 재실행 표준편차가 3~4%p다. **1회 결과끼리 비교할 땐 8%p(≈2σ) 미만이면 없는 차이**, 5회 평균끼리라도 4%p 미만이면 확정하지 마라. 평균만 보지 말고 **최저값과 편차를 같이** 봐라 — 시연에서 아픈 건 최악의 경우다.

---

## Step 5. 학습 스크립트 — `tools/trainMLP.mjs`

```js
// tools/trainMLP.mjs — 증강 데이터로 MLP를 학습해 client/public/model/seal-mlp/ 에 저장.
//
// 사용법:
//   node tools/trainMLP.mjs                               # data/ 전 세션으로 학습(배포용)
//   node tools/trainMLP.mjs --holdout=seals_2026-07-27_420f_420img   # 한 세션은 시험지로 빼고 채점
//   node tools/trainMLP.mjs --mult=8 --epochs=200
//
// ★ 배포용 모델은 홀드아웃 없이 전 세션으로 학습한다. 다만 그때의 성적은 알 수 없으므로,
//   반드시 --holdout 으로 먼저 성적을 확인하고 나서 전체 학습을 돌릴 것.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as tf from '@tensorflow/tfjs';
import { extractFeaturesV2, FEAT_LENGTH_V2 } from '../client/src/recognition/featuresV2.js'; // ★ v2 (Step 2)
import { makeRng, augment } from './lib/augment.mjs';

const args = process.argv.slice(2);
const num = (k, d) => Number(args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const str = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? null;
const MULT = num('mult', 5);
const EPOCHS = num('epochs', 200);
const HOLDOUT = str('holdout');
const OUT_DIR = 'client/public/model/seal-mlp';

// --- 세션 로드 (교차 평가를 하려면 세션 경계를 유지해야 한다) ---
const sets = readdirSync('data').map((f) => join('data', f))
  .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'data.json')))
  .sort()
  .map((d) => ({ name: d.split(/[\\/]/).pop(), rows: JSON.parse(readFileSync(join(d, 'data.json'), 'utf8')) }));

const trainSets = HOLDOUT ? sets.filter((s) => s.name !== HOLDOUT) : sets;
const testSets = HOLDOUT ? sets.filter((s) => s.name === HOLDOUT) : [];
if (HOLDOUT && !testSets.length) { console.error(`홀드아웃 세션을 못 찾았다: ${HOLDOUT}`); process.exit(1); }

// ★ 라벨 순서는 모델 출력 인덱스 그 자체다. 반드시 정렬해서 고정하고 파일로 남긴다.
//   여기가 어긋나면 "개를 맺었는데 용이 나오는" 종류의 버그가 된다.
const LABELS = [...new Set(sets.flatMap((s) => s.rows.map((r) => r.label)))].sort();

const rng = makeRng(20260728);

function toDataset(rows, mult) {
  const xs = [], ys = [];
  const push = (hands, label) => {
    const f = extractFeaturesV2(hands);
    if (f.length !== FEAT_LENGTH_V2) return;
    xs.push(f); ys.push(LABELS.indexOf(label));
  };
  for (const r of rows) push(r.landmarks, r.label);                    // 원본
  for (let k = 0; k < mult; k++)                                        // 증강본
    for (const r of rows) push(augment(r.landmarks, rng), r.label);
  return { xs, ys };
}

function build(nClasses) {
  const m = tf.sequential();
  m.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [FEAT_LENGTH_V2] }));
  m.add(tf.layers.dropout({ rate: 0.2 }));
  m.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  m.add(tf.layers.dense({ units: nClasses, activation: 'softmax' }));
  m.compile({ optimizer: tf.train.adam(0.005), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return m;
}

const train = toDataset(trainSets.flatMap((s) => s.rows), MULT);
console.log(`학습 세션: ${trainSets.map((s) => s.name).join(', ')}`);
console.log(`샘플 ${train.xs.length}장 (원본 ${train.xs.length / (MULT + 1)} × ${MULT + 1}) · 클래스 ${LABELS.length}종`);

const xs = tf.tensor2d(train.xs);
const ys = tf.oneHot(tf.tensor1d(train.ys, 'int32'), LABELS.length);
const model = build(LABELS.length);
await model.fit(xs, ys, {
  epochs: EPOCHS, batchSize: 32, shuffle: true, verbose: 0,
  callbacks: { onEpochEnd: (e, logs) => { if ((e + 1) % 20 === 0) console.log(`  epoch ${e + 1}/${EPOCHS}  loss ${logs.loss.toFixed(4)}  acc ${logs.acc.toFixed(3)}`); } },
});

// --- 홀드아웃 채점 (혼동행렬) ---
if (testSets.length) {
  const test = toDataset(testSets.flatMap((s) => s.rows), 0); // ★ 시험지는 절대 증강하지 않는다
  const pred = model.predict(tf.tensor2d(test.xs));
  const idx = await pred.argMax(1).array();
  const conf = await pred.max(1).array();

  const per = {};
  let hit = 0;
  test.ys.forEach((t, i) => {
    const l = LABELS[t];
    (per[l] ??= { n: 0, h: 0, wrong: {}, conf: 0 }).n += 1;
    per[l].conf += conf[i];
    if (idx[i] === t) { hit += 1; per[l].h += 1; }
    else per[l].wrong[LABELS[idx[i]]] = (per[l].wrong[LABELS[idx[i]]] ?? 0) + 1;
  });

  console.log(`\n===== 홀드아웃: ${HOLDOUT} =====`);
  console.log(`전체 정확도: ${((hit / test.ys.length) * 100).toFixed(1)}%  (${hit}/${test.ys.length})`);
  console.log('라벨       정답률  평균확신도  주로 틀린 곳');
  for (const l of LABELS) {
    if (!per[l]) continue;
    const w = Object.entries(per[l].wrong).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k}×${v}`).join(', ');
    const flag = per[l].h / per[l].n < 0.9 ? ' ←' : '';
    console.log(`${l.padEnd(9)} ${((per[l].h / per[l].n) * 100).toFixed(0).padStart(5)}%  ${(per[l].conf / per[l].n).toFixed(2).padStart(9)}  ${(w || '—').padEnd(20)}${flag}`);
  }
}

// --- 저장 ---
// ★ model.save('file://...') 는 tfjs-node 전용이라 여기선 안 된다.
//   withSaveHandler로 아티팩트를 받아 브라우저가 읽는 형식(model.json + weights.bin)으로 직접 쓴다.
mkdirSync(OUT_DIR, { recursive: true });
const art = await model.save(tf.io.withSaveHandler(async (a) => a));
writeFileSync(`${OUT_DIR}/weights.bin`, Buffer.from(art.weightData));
writeFileSync(`${OUT_DIR}/model.json`, JSON.stringify({
  modelTopology: art.modelTopology,
  format: art.format,
  generatedBy: art.generatedBy,
  convertedBy: null,
  weightsManifest: [{ paths: ['weights.bin'], weights: art.weightSpecs }],
}));
writeFileSync(`${OUT_DIR}/labels.json`, JSON.stringify({
  labels: LABELS,
  trainedAt: new Date().toISOString(),
  sessions: trainSets.map((s) => s.name),
  mult: MULT, epochs: EPOCHS,
  featureVersion: 'v2', inputDim: FEAT_LENGTH_V2, // ★ 어느 특징으로 학습했는지 반드시 남긴다
}, null, 2));

console.log(`\n✅ ${OUT_DIR}/ 에 저장 (model.json · weights.bin · labels.json)`);
console.log('   다음: client/src/recognition/mlpModel.js 의 classifyMLP 구현');
```

### 왜 이런 선택을 했는지

| 선택 | 이유 |
| --- | --- |
| **특징 표준화(z-score) 안 함** | 90차원이 이미 손바닥 길이로 나눠져 있어 전부 0~4 범위다. 스케일 문제가 없는데 표준화를 넣으면 런타임에도 같은 mean/std를 들고 다녀야 해서 배포만 복잡해진다 |
| **early stopping 안 씀** | 세션이 2~3개뿐이라 검증에 쓸 세션이 곧 시험지다. 그걸로 멈춤 시점을 고르면 시험지에 간접 과적합된다. epoch 고정이 정직하다 |
| **`none`도 하나의 클래스** | 그래야만 MLP가 "인장 아님"을 거부할 수 있다. ⚠️ **거꾸로 말하면 `none` 샘플이 학습에 없으면 오탐률이 100%가 된다** — 측정해보니 1차 세션엔 `none`이 0장이라, 1차로 학습한 MLP는 2차의 `none` 30장을 전부 인장으로 오인했다(센트로이드는 같은 조건에서 오탐 0%). 센트로이드는 거리 임계값이라 `none` 없이도 거부하지만 **MLP는 못 한다.** 모든 세션에서 `✗ 인장 아님`을 반드시 찍을 것 |
| **시험지는 증강 안 함** | 증강한 시험지로 채점하면 "내가 만든 문제를 내가 푸는" 것이라 숫자가 무의미해진다 |
| **`labels.json` 별도 저장** | 모델 출력 인덱스 ↔ 인장 id 매핑. 코드에 하드코딩하면 라벨이 하나 늘어난 순간 전 인장이 한 칸씩 밀린다 |

### 실행

```bash
# ① 성적부터 확인 (한 세션을 시험지로)
node tools/trainMLP.mjs --holdout=seals_2026-07-27_420f_420img
node tools/trainMLP.mjs --holdout=seals_2026-07-25_360f_360img

# ② 두 방향 다 만족스러우면 전 세션으로 배포용 학습
node tools/trainMLP.mjs
```

---

## Step 6. 채점 — 정확도 말고 이걸 봐라

`--holdout` 출력에서 확인할 것:

1. **라벨별 정답률** — 전체 70%인데 호랑이가 20%면 그건 "호랑이를 실전에서 빼라"는 신호지 "더 학습하라"는 신호가 아니다.
2. **주로 틀린 곳** — 뱀↔멧돼지처럼 특정 쌍이 계속 붙으면 **자세를 바꿔서 재수집**하는 게 모델을 만지는 것보다 100배 싸다.
3. **평균 확신도** — 맞히는데 확신도가 0.5면 임계값을 못 세운다. 맞을 땐 0.9, 틀릴 땐 낮게 나와야 게임에서 쓸 수 있다.
4. **`none` 정답률** — 이게 낮으면 아무 손동작이나 인장으로 잡힌다. 게임에서 제일 짜증나는 실패다.

**게이트 기준**: 교차 세션에서 센트로이드(33.8%)를 크게 넘고, 실전에 쓸 인장들이 **각각** 90% 이상이어야 교체할 가치가 있다. 전체 평균이 아니라 인장별로 본다.

---

## Step 7. 게임에 붙이기

### 7-1. `client/src/recognition/mlpModel.js`

```js
import * as tf from '@tensorflow/tfjs';
import { MLP } from '../config.js';

const NEGATIVE_ID = 'none'; // ★ tools/lib/sessions.mjs와 같은 값. 클라가 tools/를 import하면 안 되므로 여기 둔다

let model = null;
let LABELS = [];

export async function loadMLP(base = '/model/seal-mlp') {
  model = await tf.loadLayersModel(`${base}/model.json`);
  LABELS = (await (await fetch(`${base}/labels.json`)).json()).labels;
  // 첫 추론은 커널 컴파일 때문에 느리다 — 미리 한 번 돌려 예열한다
  tf.tidy(() => model.predict(tf.zeros([1, 182]))); // 특징 v2 = 182차원
  return model;
}

/**
 * @param {number[]} feat extractFeatures 출력 (90)
 * @returns {{ sealId: string|null, confidence: number, runnerUp: number, reason: string }}
 */
export function classifyMLP(feat) {
  if (!model) return { sealId: null, confidence: 0, runnerUp: 0, reason: 'not-loaded' };

  const probs = tf.tidy(() => Array.from(model.predict(tf.tensor2d([feat])).dataSync()));
  const ranked = probs.map((p, i) => ({ id: LABELS[i], p })).sort((a, b) => b.p - a.p);
  const [best, second] = ranked;

  if (best.id === NEGATIVE_ID) return { sealId: null, confidence: 0, runnerUp: second.p, reason: 'negative' };
  if (best.p < MLP.ACCEPT) return { sealId: null, confidence: best.p, runnerUp: second.p, reason: 'low-conf' };
  if (best.p - second.p < MLP.MARGIN) return { sealId: null, confidence: best.p, runnerUp: second.p, reason: 'ambiguous' };

  return { sealId: best.id, confidence: best.p, runnerUp: second.p, reason: 'ok' };
}
```

`config.js`에 임계값을 추가한다 (센트로이드의 거리 임계값과 **단위가 다르다** — 이쪽은 0~1 확률이다):

```js
// client/src/config.js
export const MLP = {
  ACCEPT: 0.80, // 1등 확률이 이보다 낮으면 "모르겠다"
  MARGIN: 0.20, // 1등이 2등보다 이만큼 앞서야 인정
};
```

### 7-2. `recognizer.js` 스위치

[recognizer.js](../client/src/recognition/recognizer.js)는 이미 교체 지점이 뚫려 있다:

```js
const USE_MLP = true;                     // 31행
// …
return USE_MLP ? classifyMLP(feat) : classifyCentroid(feat);   // 44~46행
```

**센트로이드 코드는 지우지 마라** (§4.6 폴백 계약). 시연 직전에 MLP가 이상하면 `USE_MLP = false` 한 줄로 돌아갈 수 있어야 한다.

`loadMLP()`는 게임 시작 전(BootScene)에 `await` 해야 한다. 첫 프레임이 모델보다 먼저 오면 `not-loaded`로 전부 흘려버린다.

### 7-3. 임계값 잡기

`ACCEPT`/`MARGIN`은 **`none` 샘플로** 정한다. 홀드아웃 채점에 이 스윕을 붙여라:

```
ACCEPT   인장 정답률   오탐률(none이 인장으로)
0.50        84%            12%
0.80        79%             2%
0.90        71%             0%
```

**오탐률이 0%를 유지하는 가장 낮은 ACCEPT**를 고른다. 센트로이드 때와 같은 원칙이다 ([config.js](../client/src/config.js) 주석 참고).

---

## Step 8. 성적이 안 나올 때 — 이 순서로

싼 것부터. 위 네 개를 건너뛰고 모델 구조를 만지는 건 거의 항상 헛수고다.
지금까지 **실제로 측정된 이득의 크기 순서**이기도 하다.

| 순서 | 할 일 | 측정된 이득 |
| --- | --- | --- |
| 1 | **사람을 늘린다** (제3자 수집) | 미측정 — 하지만 세션 간 간극(10배)의 주원인이라 가장 크다 |
| 2 | **특징 v2** (PIP 추가, Step 2) | **+8.4%p** (확정) |
| 3 | **증강** (회전+지터+미러, Step 4) | +3.9%p · **편차 σ 4.1→2.9** |
| 4 | **자세·표적 수집** | 미측정 (혼동 쌍이 명확할 때만) |
| 5 | 모델 구조 | 아직 손댈 차례 아님 |

1. **사람을 늘린다** — 세션 간 거리(2.4~8.3)의 대부분은 "다른 사람 손"이다. 제3자 1명이 증강 10배보다 낫다. **프레임 수를 늘리는 건 효과가 0이다** (Step 0 ② 학습곡선) — 반드시 새로운 사람·조명·각도여야 한다.
2. **자세를 바꾼다** — 혼동행렬에서 계속 붙는 쌍(호랑이↔양 등)은 손을 2~3cm 벌린 자세로 재수집. 없는 정보는 모델이 못 만든다.
3. **약한 인장만 표적 수집** — 정답률 낮은 인장 3~4개만 골라 새 세션으로 30장씩. 780장 전체를 다시 찍는 것보다 훨씬 효율적이다.
4. **`worldLandmarks`로 특징 v3을 시도** — 수집 때 저장해뒀다면(Step 2 마지막). 원근 보정된 3D 좌표라 카메라 각도 의존이 줄어들 가능성이 있다. **아직 아무도 안 재봤다** — 재보고 문서에 숫자를 남겨라.
5. **실전 인장을 줄인다** — `shared/constants.js`의 `PLAYABLE_SEAL_IDS`. 도감엔 12종, 실전엔 검증된 N종 (§4.5). 대전은 3종으로도 성립한다.
6. 여기까지 하고도 부족하면 그때 모델: hidden 64→128, epochs 200→400, dropout 0.2→0.3.

---

## 함정 모음

- **모델보다 특징을 먼저 의심해라.** 측정된 이득이 특징 v2(+8.4%p) > 증강(+3.9%p) > 모델 구조(미측정)다. 순서를 뒤집으면 시간이 녹는다.
- **`features.js`를 직접 고치지 마라.** 센트로이드·수집 데이터의 `features` 필드·`replay.mjs` 재현성 검사가 통째로 무효가 된다. `featuresV2.js`를 새로 만들어라.
- **모델과 특징 버전이 어긋나면 조용히 틀린다.** 182차원 모델에 90차원을 넣으면 에러가 나지만, 같은 차원의 다른 특징이면 에러 없이 계속 오답만 낸다. `labels.json`에 `featureVersion`을 반드시 남겨라.
- **평행이동·화면회전·확대 증강은 no-op이다** (1e-15). 데이터만 5배 되고 성적은 그대로 — 처음 하는 사람이 거의 항상 밟는다.
- **특징에 직접 노이즈를 뿌리지 마라.** 실제 손으로는 불가능한 거리 조합이 만들어져 모델이 유령을 배운다.
- **시험지를 증강하지 마라.** 숫자가 통째로 무의미해진다.
- **`none` 샘플이 없는 세션으로 학습하면 오탐률 100%다.** MLP는 배운 적 없는 클래스를 못 뱉는다. 센트로이드와 달리 거리 임계값이라는 안전망이 없다.
- **세션마다 자세가 달라진 인장은 0%가 나온다.** 양(1차 2손 → 2차 1손)이 0%, 닭(1차 2손 → 2차 1손+2손)이 2%였다. **모델 문제가 아니라 수집 문제**이고, 더 나쁜 건 **확신도 0.94로 자신 있게 틀린다**는 것이다 — 임계값으로 못 거른다. 수집 전에 인장별 자세(특히 손 개수)를 확정하고, 세션 간에 바꾸지 마라.
- **라벨 정렬 순서를 고정하고 파일로 남겨라.** 순서가 어긋나면 전 인장이 한 칸씩 밀린다.
- **합본 정확도를 보고 기뻐하지 마라.** 센트로이드도 그 숫자는 96%였다.
- **`model.save('file://…')`는 tfjs-node 전용이다.** 순수 tfjs에서는 `withSaveHandler`로 직접 쓴다 (Step 5).
- **`client/public/`은 vite가 그대로 서빙한다.** 모델을 `src/` 아래 두면 번들러가 처리하려다 깨진다.
- **`/data/`는 .gitignore 대상이다.** 모델 산출물(`client/public/model/`)은 **커밋해야** 배포된다 — ignore에 걸리지 않는지 확인할 것.
- **1회 실행 결과로 레시피를 고르지 마라.** 같은 설정을 5회 돌렸더니 55.7%~66.2%(σ=4.1%p)가 나왔다. 최소 3회, 가능하면 5회 평균.
- **증강에 하루를 쓰지 마라.** 측정된 이득은 평균 +4%p(60.4%→64.3%)다. 넣을 값어치는 있지만 게임에 쓸 수준까지 끌어올리진 못한다. 세션 간 간극(10배)의 원인은 "다른 사람 손"이고, 그건 증강으로 안 만들어진다.

---

## 체크리스트

- [ ] Step 0의 세 가지 측정치를 직접 재봤다 (특히 ③ no-op 증강)
- [ ] **`featuresV2.js` 작성 (PIP 추가) — 가장 큰 이득이니 제일 먼저**
- [ ] 다음 수집 전에 collector에 `worldLandmarks` 저장 한 줄 추가
- [ ] `tools/lib/augment.mjs` 작성
- [ ] `tools/augExp.mjs`로 레시피별 교차 세션 성적 표 완성 (최소 3회 평균)
- [ ] 레시피 확정 — 기본값 `회전+지터+미러`. **여기에 2시간 넘게 쓰지 않는다**
- [ ] `tools/trainMLP.mjs` 작성 → `--holdout` 양방향 채점
- [ ] 인장별 정답률 · 혼동 쌍 · `none` 정답률 확인
- [ ] 전 세션 학습 → `client/public/model/seal-mlp/` 생성
- [ ] `classifyMLP` 구현 + `USE_MLP = true` + `loadMLP` await
- [ ] `none` 샘플로 ACCEPT/MARGIN 스윕
- [ ] 연습 모드로 실제 손 한 판 — **숫자가 아니라 손으로** 최종 확인
- [ ] 센트로이드 폴백이 살아 있는지 (`USE_MLP = false` 한 줄로 복귀 가능)

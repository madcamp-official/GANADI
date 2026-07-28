// 랜드마크 단계 증강. ★ 특징(182차원)이 아니라 손 좌표에 건다 —
//   특징에 직접 노이즈를 뿌리면 실제 손으로는 만들 수 없는 거리 조합이 생겨
//   모델이 존재하지 않는 손을 배운다.
//
// ⚠️ 평행이동·화면 내 회전·확대축소는 넣지 마라. 특징이 쌍거리라서 값이 안 변한다(측정: 1e-15).
//    넣으면 똑같은 벡터만 5배로 불어나고 성적은 1도 안 움직인다.

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
 * "손을 비스듬히 든" 손을 만드는 데는 충분하고, 이게 가장 크게 먹히는 증강이다.
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
 * 두 손의 블록이 서로 자리를 바꾼다. 좌우 비대칭 인장에는 진짜 새 샘플이다.
 */
export function mirror(hands) {
  return hands.map((h) => h.map((p) => ({ x: -p.x, y: p.y, z: p.z })));
}

/** 두 손 중 하나를 버린다 — MediaPipe가 겹친 손을 놓치는 상황 재현 */
export function dropHand(hands, rng) {
  return hands.length === 2 ? [hands[rng.next() < 0.5 ? 0 : 1]] : hands;
}

/**
 * 기본 레시피 = 회전 + 미러 + 지터. 측정된 조합 중 최고(64.3%)이고, 무엇보다 편차가 준다(σ 4.1→2.9).
 * @param {Array<Array<{x,y,z}>>} hands 원본 손 좌표
 * @param {{next:Function,gauss:Function}} rng
 */
export function augment(hands, rng, opt = {}) {
  const {
    yawRange = 0.5,   // ±0.25 rad ≈ ±14°
    pitchRange = 0.5,
    sigma = 0.004,
    mirrorP = 0.5,
    dropP = 0,        // ★ 기본 0. 넣으면 기준선 아래로 떨어진다 — 45차원이 0인 샘플을
                      //   늘리면 모델이 "정보 없음"을 라벨에 억지로 연결한다.
  } = opt;

  let out = rotate3d(hands, (rng.next() - 0.5) * yawRange, (rng.next() - 0.5) * pitchRange);
  if (rng.next() < mirrorP) out = mirror(out);
  if (rng.next() < dropP) out = dropHand(out, rng);
  return jitter(out, sigma, rng);
}

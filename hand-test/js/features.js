// features.js — 손 좌표에서 특징을 뽑는 순수 함수 모음 (DOM 의존 없음)

// 네 손가락(검지·중지·약지·새끼)이 펴졌는지 판별
// TIP이 PIP보다 손목에서 멀면 '펴짐'
export function fingersUp(lm) {
  const wrist = lm[0];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const fingers = [
    { name: "검지", tip: 8,  pip: 6  }, // TIP(손가락 끝)과 PIP(손가락 관절) 인덱스
    { name: "중지", tip: 12, pip: 10 },
    { name: "약지", tip: 16, pip: 14 },
    { name: "새끼", tip: 20, pip: 18 },
  ];
  return fingers.map(f => ({
    name: f.name,
    up: dist(lm[f.tip], wrist) > dist(lm[f.pip], wrist),
  }));
}

// 손목 기준 정규화: 손목(0)을 원점으로 옮기고, 손바닥 길이(0→9)로 나눠 크기 무관하게 만든다
// 결과: 위치·크기가 달라도 같은 포즈면 거의 같은 값이 나온다
export function normalizeLandmarks(lm) {
  const wrist = lm[0];
  const ref = lm[9]; // 중지 손허리뼈(MCP) — 손바닥 길이 기준점
  const scale = Math.hypot(ref.x - wrist.x, ref.y - wrist.y) || 1e-6; // 0 나눗셈 방지
  return lm.map(p => ({
    x: (p.x - wrist.x) / scale, // 손목 기준 상대좌표를 손바닥 길이로 나눔
    y: (p.y - wrist.y) / scale,
    z: (p.z - wrist.z) / scale,
  }));
}

// 쌍거리 특징에 사용할 주요 랜드마크 (손목 + 5개 끝 + 4개 MCP = 10점)
export const FEATURE_POINTS = [0, 4, 8, 12, 16, 20, 5, 9, 13, 17];

// 쌍거리 특징: 주요 랜드마크들 사이의 거리 배열
// 정규화 좌표 위에서 계산하므로 손 크기·위치가 달라도 값이 일정 → 학습 입력으로 적합
export function pairwiseDistances(lm) {
  const n = normalizeLandmarks(lm); // 손목=원점, 손바닥길이=1 로 맞춘 좌표
  const feats = [];
  for (let a = 0; a < FEATURE_POINTS.length; a++) {
    for (let b = a + 1; b < FEATURE_POINTS.length; b++) { // 중복 없는 쌍만 (a<b)
      const pa = n[FEATURE_POINTS[a]], pb = n[FEATURE_POINTS[b]];
      feats.push({
        pair: `${FEATURE_POINTS[a]}-${FEATURE_POINTS[b]}`,
        dist: Math.hypot(pa.x - pb.x, pa.y - pb.y),
      });
    }
  }
  return feats; // 10점 → 45개 거리. 모델 입력은 feats.map(f => f.dist)
}

export const FEAT_PER_HAND = 45; // 한 손 쌍거리 개수

// 고정 90 길이 특징 벡터 (수집·인식이 동일하게 사용 — 이게 어긋나면 인식이 안 됨)
// 손을 손목 x좌표로 왼→오 정렬, 없는 손 자리는 0으로 채움
export function buildFeatures(hands) {
  const sorted = [...hands].sort((a, b) => a[0].x - b[0].x);
  const slots = [new Array(FEAT_PER_HAND).fill(0), new Array(FEAT_PER_HAND).fill(0)];
  sorted.slice(0, 2).forEach((lm, i) => {
    slots[i] = pairwiseDistances(lm).map(f => f.dist);
  });
  return [...slots[0], ...slots[1]]; // 항상 90
}

// 데이터 수집·라벨링 툴 — 인장 선택 → 스페이스바 → N프레임 캡처 → JSON 저장.
// Day 1~3에 매일 조금씩 수집 (조명/시간/사람 분산이 일반화 성능을 올림 — §4.3).
// 제3자 1명 이상 반드시 포함.

import { extractFeatures } from '../recognition/features.js';

const CAPTURE_FRAMES = 30;

export function createLabelingSession() {
  const samples = []; // { sealId, feature: number[] }

  function capture(sealId, handsLandmarks) {
    samples.push({ sealId, feature: extractFeatures(handsLandmarks) });
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(samples)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seal-samples-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { capture, exportJSON, samples, CAPTURE_FRAMES };
}

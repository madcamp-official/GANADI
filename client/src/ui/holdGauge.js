// 인식 게이지의 "무엇을 보여줄지" 결정 — 그리기와 분리된 순수 함수.
// Phaser 씬 안에 두면 브라우저 없이는 검증할 수 없어서 여기로 뺐다.
//
// 게이지의 목적(§3.2): 사용자가 **"인식이 안 되는 것"과 "인식되는 중"을 구분**할 수 있어야 한다.
// 그래서 세 상태를 다르게 보여준다:
//   ① 아무것도 인식 안 됨      → 아예 안 그린다 (화면을 어지럽히지 않는다)
//   ② 목표와 다른 인장 인식 중 → 회색 + "(목표 아님)" — 잘못 맺고 있음을 즉시 알린다
//   ③ 목표 인장 인식 중        → 주황 + 차오르는 바

/**
 * @param {{candidate: string|null, holdProgress: number}|null} state recognizer.step() 반환값
 * @param {string|undefined} target 지금 맺어야 할 인장 id
 * @param {boolean} locked 입력 잠금 (카운트다운·판정 대기 중)
 * @returns {{ match: boolean, fill: number, sealId: string }|null} null이면 그리지 않는다
 */
export function holdGaugeView(state, target, locked) {
  if (locked) return null;
  if (!target) return null;

  const candidate = state?.candidate ?? null;
  if (!candidate) return null;

  // 0~1 밖의 값이 와도 바가 튀지 않게 (NaN 포함)
  const raw = Number(state?.holdProgress);
  const fill = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;

  return { match: candidate === target, fill, sealId: candidate };
}

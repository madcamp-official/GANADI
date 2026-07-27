// 클라이언트 설정값 모음.

export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export const GAME = {
  WIDTH: 1280,
  HEIGHT: 720,
};

// 내부 렌더 배수 — 좌표계(1280×720)는 그대로, 실제 렌더 해상도만 배로 올려 선명하게.
export const RENDER_SCALE = 2;

export const RECOGNITION = {
  NUM_HANDS: 2,
  VOTE_WINDOW: 10,   // 시간축 다수결 윈도우 (프레임)
  FPS_THROTTLE: 20,  // 추론 스로틀
  RUNNER_UP_MARGIN: 0.15, // 1등-2등 점수 차 임계값 (대충 통과 방지)
};

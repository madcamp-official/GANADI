// 클라이언트 설정값 모음.

// import.meta.env는 Vite가 주입한다. `?.`를 쓰는 이유: tools/의 node 스크립트가
// 이 파일을 그대로 import해서 인식 코드를 오프라인 검증하기 때문 (node엔 env가 없다).
export const SERVER_URL = import.meta.env?.VITE_SERVER_URL ?? 'http://localhost:3001';

export const GAME = {
  WIDTH: 1280,
  HEIGHT: 720,
};

export const RECOGNITION = {
  NUM_HANDS: 2,

  // --- 판별 임계값 (단위: 90차원 특징공간에서의 유클리드 거리) ---
  // ⚠️ 확률이 아니라 거리다. 값이 작을수록 "센트로이드에 가깝다 = 확실하다".
  ACCEPT_THRESHOLD: 2.5, // 가장 가까운 센트로이드까지 이보다 멀면 "인장 아님"
  MARGIN: 1.0,           // 1등이 2등보다 이만큼 더 가까워야 인정 (런너업 마진, §4.2)

  // --- 안정화 ---
  VOTE_WINDOW: 8,   // 시간축 다수결 윈도우 (프레임). §4.4
  FPS_THROTTLE: 20, // 추론 스로틀 (Step 7에서 적용). 이 값을 낮추면 VOTE_WINDOW도 같이 줄여야
                    // 다수결이 실시간 기준으로 길어지지 않는다.
};

// 홀드 확정 시간은 shared/constants.js의 RULES.SEAL_HOLD_MS(400) 하나만 본다.
// 서버·클라가 같은 값을 봐야 하므로 여기에 중복 정의하지 않는다.

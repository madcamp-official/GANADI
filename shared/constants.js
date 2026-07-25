// 클라이언트·서버가 공유하는 상수. seal id와 소켓 이벤트명의 단일 출처(SSOT).

// 12지신 인장 id (도감·연출엔 12종 전부, 실전 시퀀스엔 검증된 것만 — §4.5)
export const SEAL_IDS = [
  'rat',     // 쥐
  'ox',      // 소
  'tiger',   // 호랑이
  'rabbit',  // 토끼
  'dragon',  // 용
  'snake',   // 뱀
  'horse',   // 말
  'goat',    // 양
  'monkey',  // 원숭이
  'rooster', // 닭
  'dog',     // 개
  'pig',     // 멧돼지
];

// Day 2~3 게임용 임시 인식기가 다루는 쉬운 6종 (룰 기반)
export const EASY_SEAL_IDS = ['dog', 'monkey', 'tiger', 'horse', 'rat', 'rabbit'];

// Socket.IO 이벤트명
export const EVENTS = {
  // 로비/방
  CREATE_ROOM: 'room:create',
  JOIN_ROOM: 'room:join',
  ROOM_STATE: 'room:state',
  PLAYER_LEFT: 'room:playerLeft',

  // 라운드 진행 (서버 권위)
  ROUND_START: 'round:start',       // 서버 → 클라: 시퀀스 배포
  SEQ_COMPLETE: 'round:complete',   // 클라 → 서버: 시퀀스 완성 @timestamp
  ROUND_RESULT: 'round:result',     // 서버 → 클라: 승자/데미지 브로드캐스트
  OPP_PROGRESS: 'round:oppProgress',// 상대 진행 상황 실시간 표시

  // 화상 시그널링 (PeerJS id 교환)
  PEER_ID: 'peer:id',

  // 종료
  MATCH_OVER: 'match:over',
};

// 게임 룰 상수
export const RULES = {
  MAX_HP: 100,
  DAMAGE: { 3: 20, 5: 40 }, // 시퀀스 길이별 데미지
  SEAL_HOLD_MS: 400,        // 인장 확정 홀드 시간
};

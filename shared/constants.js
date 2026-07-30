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

// 실전 시퀀스에 투입하는 인장 (§4.5 — 도감엔 12종 전부, 실전엔 검증된 것만).
// 서버 대전과 연습 모드가 같은 목록을 봐야 하므로 여기가 단일 출처.
//
// 2026-07-29 goat 복귀로 12종 전부 투입. 근거는 언제나 "제3자 손"이다 —
// 학습에 없는 세션(seals_2026-07-28_390f)을 시험지로 놓고 잰 성적만 센다.
// 팀원 손으로 잘 되는 건 시험 문제를 미리 보고 친 시험이라 근거가 못 된다.
//
// goat 이력: 7/28 시점엔 0/100/3/100%로 흔들려서 뺐었다. 7/29에 2손 자세로 60장 재수집하고
// "인장 아님" 180장을 추가해 재학습했더니 배포 모델에서 30/30·확신도 1.00으로 안정됐다.
// monkey·snake·rooster가 앞서 걸어간 것과 같은 경로다(학습에 없던 2손 자세를 채우니 0% → 100%).
//
// ★ 재학습할 때는 반드시 `node tools/trainMLP.mjs --retry=8` 을 쓸 것.
//   가중치 초기화가 시드에 안 걸려서 같은 명령도 매번 다른 모델이 나오고, 그중 상당수는
//   인장 하나가 통째로 'none'에 먹힌다(8회 중 5회. goat도 1회 포함). --retry가 홀드아웃으로
//   그런 모델을 걸러내고 붕괴 없는 것만 저장한다. 그냥 돌리면 무너진 모델이 배포될 수 있다.
export const PLAYABLE_SEAL_IDS = [
  'rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake',
  'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig',
];

// Socket.IO 이벤트명
export const EVENTS = {
  // 로비/방
  CREATE_ROOM: 'room:create',
  JOIN_ROOM: 'room:join',
  LEAVE_ROOM: 'room:leave',         // 클라 → 서버: 로비를 떠난다(연습 모드 등). 유령 방 방지
  ROOM_STATE: 'room:state',
  MATCH_INFO: 'match:info',         // 서버 → 각 클라: 상대 캐릭터 등 매치 정보
  // (room:playerLeft는 없앴다 — 2인 방엔 항상 심판이 붙어 있어 "매칭 전 상대 이탈"이라는
  //  상태가 존재하지 않는다. 이탈 통보는 MATCH_OVER{reason:'forfeit'}가 전담한다.)

  // 라운드 진행 (서버 권위)
  ROUND_START: 'round:start',       // 서버 → 클라: 시퀀스 배포
  SEQ_COMPLETE: 'round:complete',   // 클라 → 서버: 시퀀스 완성 @timestamp
  ROUND_RESULT: 'round:result',     // 서버 → 클라: 승자/데미지 브로드캐스트
  ROUND_TIMEOUT: 'round:timeout',   // 서버 → 클라: 제한시간 내 아무도 못 끝냄 (무승부)
  OPP_PROGRESS: 'round:oppProgress',// 상대 진행 상황 실시간 표시

  // 화상 시그널링 (PeerJS id 교환)
  PEER_ID: 'peer:id',

  // 종료
  MATCH_OVER: 'match:over',
};

// 게임 룰 상수
export const RULES = {
  MAX_HP: 100,
  SEAL_HOLD_MS: 400,        // 인장 확정 홀드 시간

  // 인 1개당 데미지. 실제 데미지는 damageFor(시퀀스 길이) = 길이 × 이 값 (shared/jutsu.js).
  // ★ 매치 길이를 조절하는 유일한 손잡이다. 인술의 인 개수는 3~7이므로
  //   8 → 24~56 데미지 → 2~3라운드 / 5 → 15~35 → 3~6라운드.
  //   (예전엔 DAMAGE:{3:20,5:40} 표가 여기 있었지만 아무도 읽지 않는 죽은 값이었다.)
  DAMAGE_PER_SEAL: 8,

  // 라운드 제한시간 — 이 시간 안에 아무도 시퀀스를 못 끝내면 무승부로 넘긴다.
  // ★ 없으면 인식이 한 번 미끄러졌을 때 라운드가 영원히 멈춘다(시연 데드락).
  //   6인 인술 기준 인당 (홀드 400ms + 다수결·자세 전환) ≈ 2~3초라 30초면 넉넉하다.
  ROUND_TIME_MS: 30_000,

  // 완성 신고 최소 소요시간의 안전계수 — 물리적으로 불가능한 속도의 SEQ_COMPLETE를 거른다.
  // 인 1개를 확정하려면 최소 SEAL_HOLD_MS가 필요하므로 길이×홀드×이 비율보다 빠르면 조작이다.
  // 0.5로 느슨하게 잡아 정상 플레이어가 걸리지 않게 한다 (치트 방지가 목적, 실력 제한이 아님).
  MIN_COMPLETE_RATIO: 0.5,
};

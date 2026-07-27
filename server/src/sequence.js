// 라운드 시퀀스 생성 — 실제 구현은 shared/sequence.js에 있다.
// 서버 대전과 클라 연습 모드가 같은 규칙(실전 인장 목록·연속 중복 금지)을 써야 하기 때문.
// 실전 인장 목록은 shared/constants.js의 PLAYABLE_SEAL_IDS가 단일 출처 (§4.5).

export { makeSequence } from '../../shared/sequence.js';

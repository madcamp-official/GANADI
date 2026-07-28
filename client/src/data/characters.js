// 캐릭터 4종 — 스탯 동일, 스킨(색·이름)만 차이 (밸런싱 제거, 기획안 §3.1).
// 스프라이트: client/public/characters/ganadi-<id>.png (BootScene preload).

export const CHARACTERS = [
  { id: 'hono',  name: '호노',  element: '불',   color: 0xff7a2f, desc: '손끝이 제일 뜨거운 악동. 불의 인술 담당.' },
  { id: 'mizu',  name: '미즈',  element: '물',   color: 0x2f9bff, desc: '흐르듯 이어 맺어요. 시퀀스가 안 끊겨요.' },
  { id: 'kaze',  name: '카제',  element: '바람', color: 0x3fb950, desc: '가볍게 스치듯. 손이 어디 있었는지 몰라요.' },
  { id: 'ikazu', name: '이카즈', element: '번개', color: 0xf4c038, desc: '한순간에 끝내요. 번개처럼 짧게!' },
];

export const DEFAULT_CHARACTER = CHARACTERS[0].id;

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

// 캐릭터 스프라이트 텍스처 키
export const spriteKey = (id) => `ganadi-${id}`;

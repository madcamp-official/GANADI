// 캐릭터 4종 — 스탯 동일, 스킨(색·이름)만 차이 (밸런싱 제거, 기획안 §3.1).
// 실제 SD 스프라이트가 생기면 color 자리에 텍스처 키를 넣으면 됨.

export const CHARACTERS = [
  { id: 'hono',  name: '호노',  element: '불',   color: 0xff6b4a },
  { id: 'mizu',  name: '미즈',  element: '물',   color: 0x4a9dff },
  { id: 'kaze',  name: '카제',  element: '바람', color: 0x5ad18a },
  { id: 'ikazu', name: '이카즈', element: '번개', color: 0xf2c94c },
];

export const DEFAULT_CHARACTER = CHARACTERS[0].id;

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

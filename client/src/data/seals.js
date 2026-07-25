// 12지신 인장 정의 — 도감·연출엔 12종 전부 등장 (§4.5). 난이도 분류는 §4.1 참고.

import { SEAL_IDS } from '../../../shared/constants.js';

// 난이도: horizontal(수평 교차, 쉬움) / vertical(세로+돌출, 중간) / interlock(완전 맞물림, 어려움)
export const SEALS = {
  rat:     { name: '쥐',     kanji: '子', difficulty: 'vertical' },
  ox:      { name: '소',     kanji: '丑', difficulty: 'interlock' },
  tiger:   { name: '호랑이', kanji: '寅', difficulty: 'vertical' },
  rabbit:  { name: '토끼',   kanji: '卯', difficulty: 'vertical' },
  dragon:  { name: '용',     kanji: '辰', difficulty: 'interlock' },
  snake:   { name: '뱀',     kanji: '巳', difficulty: 'interlock' },
  horse:   { name: '말',     kanji: '午', difficulty: 'vertical' },
  goat:    { name: '양',     kanji: '未', difficulty: 'vertical' },
  monkey:  { name: '원숭이', kanji: '申', difficulty: 'horizontal' },
  rooster: { name: '닭',     kanji: '酉', difficulty: 'vertical' },
  dog:     { name: '개',     kanji: '戌', difficulty: 'horizontal' },
  pig:     { name: '멧돼지', kanji: '亥', difficulty: 'interlock' },
};

export const ALL_SEALS = SEAL_IDS.map((id) => ({ id, ...SEALS[id] }));

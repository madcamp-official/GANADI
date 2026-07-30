// 인술 DB (서버·클라 공유). 라운드마다 하나를 뽑아 인의 순서를 목표 시퀀스로 쓴다.
// client/src/data/jutsu.json과 같은 내용 — 게임 런타임은 이 파일을 단일 출처로 본다.
// (json 쪽은 설명·영문명이 더 붙은 자료용 사본이다. 인 순서를 고칠 땐 양쪽을 같이 고칠 것.)

import { RULES, PLAYABLE_SEAL_IDS } from './constants.js';

export const JUTSU = [
  { id: 'great-fireball-jutsu', name_kr: '화둔·호화구의 술', element: 'FIRE', seals: ['SNAKE', 'RAM', 'MONKEY', 'BOAR', 'HORSE', 'TIGER'] },
  { id: 'phoenix-sage-fire-jutsu', name_kr: '화둔·봉선화의 술', element: 'FIRE', seals: ['RAT', 'TIGER', 'DOG', 'OX', 'RABBIT'] },
  { id: 'water-dragon-bullet-jutsu', name_kr: '수둔·수룡탄의 술', element: 'WATER', seals: ['OX', 'MONKEY', 'RABBIT', 'RAT', 'BOAR', 'TIGER', 'SNAKE'] },
  { id: 'water-shark-bomb-jutsu', name_kr: '수둔·수상어탄의 술', element: 'WATER', seals: ['TIGER', 'OX', 'BOAR', 'DRAGON'] },
  { id: 'earth-style-wall', name_kr: '토둔·토류벽', element: 'EARTH', seals: ['BOAR', 'HORSE', 'DOG'] },
  { id: 'earth-head-hunter-jutsu', name_kr: '토둔·이중식파의 술', element: 'EARTH', seals: ['SNAKE', 'RAM', 'BOAR', 'DRAGON'] },
  { id: 'wind-great-breakthrough', name_kr: '풍둔·대돌파', element: 'WIND', seals: ['RABBIT', 'RAT', 'DOG'] },
  { id: 'wind-vacuum-sphere', name_kr: '풍둔·진공옥', element: 'WIND', seals: ['DRAGON', 'RABBIT', 'TIGER', 'DOG'] },
  { id: 'chidori', name_kr: '뇌둔·치도리', element: 'LIGHTNING', seals: ['OX', 'RABBIT', 'MONKEY', 'DRAGON', 'RAT'] },
  { id: 'lightning-false-darkness', name_kr: '뇌둔·거짓 어둠', element: 'LIGHTNING', seals: ['MONKEY', 'DRAGON', 'RAT', 'OX'] },
];

// 인술 DB의 12지신 영문명 → 우리 seal id (RAM=goat, BOAR=pig 주의)
export const SEAL_ID = {
  RAT: 'rat', OX: 'ox', TIGER: 'tiger', RABBIT: 'rabbit', DRAGON: 'dragon', SNAKE: 'snake',
  HORSE: 'horse', RAM: 'goat', MONKEY: 'monkey', ROOSTER: 'rooster', DOG: 'dog', BOAR: 'pig',
};

// 인술의 인 순서를 우리 seal id 배열로
export const jutsuSeals = (j) => j.seals.map((s) => SEAL_ID[s]);

// 실전 가능한(모든 인이 playable에 든) 인술 중 랜덤 하나. 없으면 전체에서.
// 기본값을 여기 둬서 서버 심판과 클라 연습 모드가 같은 목록을 보게 한다.
export function pickJutsu(playable = PLAYABLE_SEAL_IDS) {
  const ok = JUTSU.filter((j) => jutsuSeals(j).every((id) => playable.includes(id)));
  const pool = ok.length ? ok : JUTSU;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 시퀀스 길이(=인 개수)에 비례하는 데미지. 서버·클라가 같은 값을 봐야 한다.
// 계수는 RULES.DAMAGE_PER_SEAL 하나만 본다 (매치 길이 조절 손잡이).
export const damageFor = (len) => len * RULES.DAMAGE_PER_SEAL;

// 시퀀스를 정직하게 맺었을 때의 물리적 최소 소요시간(ms). 이보다 빠른 완성 신고는 조작이다.
export const minCompleteMs = (len) =>
  len * RULES.SEAL_HOLD_MS * RULES.MIN_COMPLETE_RATIO;

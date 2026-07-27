// seals.js — 12지신 인장 목록 (수집 툴·룰 판별·학습이 공유하는 단일 출처)

// "인장이 아닌 손동작" 라벨. 센트로이드/모델 생성에서는 제외하고,
// 오탐률(아무 손동작이 인장으로 잡히는 비율) 측정에만 쓴다.
// 이 데이터가 없으면 임계값의 안전성을 손으로 흔들어보는 수밖에 없다.
export const NEGATIVE_ID = 'none';

export const SEALS = [
  { id: "rat",     name: "쥐" },
  { id: "ox",      name: "소" },
  { id: "tiger",   name: "호랑이" },
  { id: "rabbit",  name: "토끼" },
  { id: "dragon",  name: "용" },
  { id: "snake",   name: "뱀" },
  { id: "horse",   name: "말" },
  { id: "goat",    name: "양" },
  { id: "monkey",  name: "원숭이" },
  { id: "rooster", name: "닭" },
  { id: "dog",     name: "개" },
  { id: "pig",     name: "돼지" },
  { id: NEGATIVE_ID, name: "✗ 인장 아님" }, // 네거티브 샘플 (학습·센트로이드 제외)
];

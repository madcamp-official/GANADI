# 인술대전 (가제) · GANADI

> 몰입캠프 26s-w4-c1-05 · 2인 / 6일 프로젝트

웹캠으로 **손을 인식해 닌자 인장(印)을 맺어 싸우는 1:1 대전 웹게임**.
가나디화(SD/치비)된 캐릭터를 픽하고, 서버가 제시한 인장 시퀀스를 두 플레이어가
실제 손으로 먼저 맺는 쪽이 술법을 발동해 상대 체력을 깎는다. 체력 0 → 승리.

<br>

## ✨ 핵심 기능

| 구분 | 내용 |
| --- | --- |
| **MVP** | 스피드 인술 맺기 — 서버 제시 시퀀스를 웹캠으로 먼저 완성한 쪽 승리 |
| **목표** | 12지신 전종 인장 인식 (실전 투입은 인식률 검증된 인장만) |
| **스트레치** | 동시 커밋형 심리전 (공격/방어 비밀 커밋 후 동시 공개) |

## 🛠 기술 스택

| 역할 | 기술 |
| --- | --- |
| 손 인식 | MediaPipe Tasks Vision — Hand Landmarker (`num_hands: 2`) |
| 인장 판별 | 6종 룰 기반 → 12종 소형 MLP로 교체 (교체 가능 모듈) |
| 모델 학습 | TensorFlow.js (브라우저 내 학습) |
| 게임 엔진 | Phaser 3 |
| 화상 | WebRTC + PeerJS (소통 전용, 판정 미사용) |
| 게임 통신 | Socket.IO (서버 권위 판정) |
| 서버 | Node.js (Express + Socket.IO) |
| 배포 | 클라 Vercel/Netlify · 서버 Render/Fly.io (**HTTPS 필수**) |

**아키텍처 원칙**: 영상(WebRTC)과 판정(Socket.IO) 완전 분리. 인식은 각자 로컬에서
수행하고 서버엔 "시퀀스 완성 @timestamp"만 전송 → 서버 수신 순서로 승자 판정.

## 📁 프로젝트 구조

```
GANADI/
├── client/                 # Phaser 3 + MediaPipe + TF.js (Vite)
│   └── src/
│       ├── scenes/         # Boot / Lobby / CharacterSelect / Calibration / Battle / Result
│       ├── recognition/    # 손 인식 파이프라인 (recognizer.js 계약)
│       ├── net/            # Socket.IO 클라 · PeerJS 화상
│       ├── data/           # 12지신 인장 정의 · 라벨링 수집 툴
│       └── config.js
├── server/                 # Node + Express + Socket.IO (심판)
│   └── src/
│       ├── rooms.js        # 방 생성/코드 입장/매칭
│       ├── referee.js      # 라운드 상태 머신 (서버 권위 판정)
│       └── sequence.js     # 시퀀스 생성
└── shared/                 # 클라·서버 공유 상수 (seal id, 이벤트명)
```

### 인식기 교체 계약 (§4.6)

`recognizer.js`는 내부 구현과 무관하게 **`onSeal(sealId, confidence)`만 발행**한다.
6종 룰 기반 → 12종 MLP 교체가 파일 교체 수준이 되도록 설계. 12종이 실패해도
6종 버전이 그대로 살아 있어 손해가 0.

## 🚀 시작하기

```bash
# 의존성 설치 (루트 워크스페이스)
npm install

# 서버 실행 (localhost:3000)
npm run dev:server

# 클라이언트 실행 (localhost:5173, HTTPS)
npm run dev:client
```

> ⚠️ `getUserMedia`(웹캠) 제약으로 **HTTPS 또는 localhost**에서만 손 인식이 동작합니다.

## 👥 역할 분담

| A: 인식·게임플레이 | B: 네트워크·화면 |
| --- | --- |
| MediaPipe 파이프라인, 데이터 수집·학습, 인장 판별기, 게임 룰 | Node 서버(방·심판), Socket.IO, PeerJS 화상, Phaser 씬/UI, 배포 |

## 🗓 일별 마일스톤

- **Day 1** — 기술 검증 + 수집 툴 · 계약 확정 · 두 탭 방 접속
- **Day 2** — 1인 연습 모드 (시연 가능 데모 확보)
- **Day 3** — 온라인 대전 ★ 절대 사수 라인
- **Day 4** — 화상 + 12종 모델 v1 (혼동행렬)
- **Day 5** — 인식기 교체 + 실배포
- **Day 6** — 게이트 판정 → 코드 프리즈 + 리허설

**컷 우선순위**: 동시커밋형 > 화상 > 캐릭터 연출 > 12지신 확장 > **온라인 대전(절대 사수)**

## 📄 저작권

실제 애니메이션 캐릭터 직접 사용 대신 오리지널 SD 캐릭터 / 무료 에셋 사용 권장.
인장 명칭(십이지) 자체는 사용에 문제 없음.

<sub>상세 기획은 [기획안 v2](./인술대전_6일_기획안_v2%203a7c230ad91f804eb048f6887f0c54ac.md) 참고.</sub>

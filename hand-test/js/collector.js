// collector.js — 인장 데이터 수집 툴 (진입점)
// [진행] ① 인장 선택 UI  ← 지금 여기
//        ② 스페이스바 캡처  ③ 저장 포맷  ④ JSON 내보내기  ⑤ 카운터 (다음 단계)

import { createHandLandmarker, startCamera } from "./handModel.js";
import { createDrawer, drawHand, drawCenterBig } from "./render.js";
import { buildFeatures } from "./features.js";
import { SEALS } from "./seals.js";

// --- DOM 참조 ---
const video    = document.getElementById("video");
const canvas   = document.getElementById("overlay");
const ctx      = canvas.getContext("2d");
const status   = document.getElementById("status");
const startBtn = document.getElementById("start");
const exportBtn = document.getElementById("export");
const exportZipBtn = document.getElementById("export-zip");
const saveImagesEl = document.getElementById("save-images");
const sealButtonsEl = document.getElementById("seal-buttons");
const labelNameEl   = document.getElementById("label-name");
const sealCountsEl  = document.getElementById("seal-counts");
const totalCountEl  = document.getElementById("total-count");
const draw     = createDrawer(ctx);

// --- 상태 ---
let handLandmarker = null;
let running = false;
let lastVideoTime = -1;
let currentSeal = null;   // ① 지금 선택된 인장 (예: { id:"snake", name:"뱀" })

// ②③ 캡처 상태
const CAPTURE_FRAMES = 30;   // 스페이스바 한 번에 찍을 프레임 수
const COUNTDOWN_MS = 3000;   // 촬영 전 준비 시간 (3초)
let capturing = false;       // 지금 연사 중인가
let remaining = 0;           // 남은 프레임 수
let countdownUntil = 0;      // 이 시각(performance.now)이 되면 촬영 시작. 0이면 카운트다운 아님
const samples = [];          // 모은 데이터 전체 (③ 포맷으로 쌓임)
window.samples = samples;    // 콘솔에서 직접 확인용 (검증)

// 이미지 캡처: 좌표와 별개로 프레임 JPEG를 모아 ZIP으로 내보냄 (CNN 학습 대비 보험)
const images = [];           // { name, base64 } 배열
window.images = images;
const grabCanvas = document.createElement("canvas"); // 프레임을 뽑아낼 오프스크린 캔버스
grabCanvas.width = 640; grabCanvas.height = 480;
const grabCtx = grabCanvas.getContext("2d");

// --- ① 인장 선택 UI 만들기 ---
// SEALS 목록으로 버튼을 생성하고, 클릭하면 currentSeal 을 바꾼다
function buildSealButtons() {
  SEALS.forEach(seal => {
    const btn = document.createElement("button");
    btn.textContent = seal.name;
    btn.dataset.id = seal.id;
    btn.addEventListener("click", () => selectSeal(seal));
    sealButtonsEl.appendChild(btn);
  });
}

function selectSeal(seal) {
  currentSeal = seal;
  labelNameEl.textContent = seal.name;
  // 선택된 버튼만 강조
  [...sealButtonsEl.children].forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.id === seal.id);
  });
}

// --- ⑤ 인장별 수집 개수 카운터 렌더링 ---
// samples 배열을 세어 12개 인장의 현재 개수를 화면에 표시 (부족한 인장 파악용)
function renderCounts() {
  const counts = {};
  for (const s of samples) counts[s.label] = (counts[s.label] || 0) + 1;
  sealCountsEl.innerHTML = "";
  SEALS.forEach(seal => {
    const n = counts[seal.id] || 0;
    const chip = document.createElement("span");
    chip.className = "count-chip" + (n > 0 ? " has" : "");
    chip.innerHTML = `${seal.name} <b>${n}</b>`;
    sealCountsEl.appendChild(chip);
  });
  totalCountEl.textContent = `총 ${samples.length}장`;
}

// --- 매 프레임 추론 + 그리기 (인식 테스트와 동일한 파이프라인 재사용) ---
function loop() {
  if (!running) return;
  const now = performance.now();

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = handLandmarker.detectForVideo(video, now);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const rawHands = result.landmarks || [];
    // 손목 x좌표로 왼→오 정렬 (handedness는 겹친 손에서 자주 틀려서 위치 기준이 더 안정적)
    const handList = rawHands
      .map((lm, i) => ({ lm, handedness: result.handednesses?.[i]?.[0]?.categoryName ?? "?" }))
      .sort((a, b) => a.lm[0].x - b.lm[0].x);

    for (const h of handList) drawHand(draw, h.lm, h.handedness);

    // 카운트다운 진행: 시간이 되면 촬영 시작, 아니면 남은 초를 크게 표시
    if (countdownUntil > 0) {
      if (now >= countdownUntil) {
        countdownUntil = 0;
        capturing = true;
        remaining = CAPTURE_FRAMES;
      } else {
        const secLeft = Math.ceil((countdownUntil - now) / 1000);
        drawCenterBig(ctx, canvas, String(secLeft), "#ffeb3b");
      }
    }

    // ②③ 캡처 진행: 손이 하나라도 잡히면 저장 (겹쳐서 한 손만 잡히는 인장 대비)
    if (capturing && handList.length >= 1) {
      const idx = samples.length;
      samples.push(makeSample(handList));   // ③ 좌표 저장
      if (saveImagesEl.checked) captureImage(idx); // 이미지도 저장 (체크 시)
      remaining--;
      if (remaining <= 0) finishCapture();
    }

    updateStatus(handList.length);
  }
  requestAnimationFrame(loop);
}

// ③ 한 프레임을 저장 포맷으로 변환
// 원시 landmarks(잡힌 손 전부)를 왼→오 순서로 보존, 특징은 고정 90 (없는 손은 0)
function makeSample(handList) {
  const raw = handList.map(h => h.lm.map(p => ({ x: p.x, y: p.y, z: p.z }))); // 복사(원본 보존)
  return {
    label: currentSeal.id,
    handCount: handList.length,                  // 이 프레임에 잡힌 손 개수 (1 또는 2)
    handedness: handList.map(h => h.handedness), // 참고용 (신뢰도 낮음)
    landmarks: raw,                              // [손][21] 원시 좌표 (왼→오 순서)
    features: buildFeatures(handList.map(h => h.lm)), // 고정 90 (없는 손 자리는 0)
    timestamp: Date.now(),
  };
}

function updateStatus(handCount) {
  if (countdownUntil > 0) {
    status.textContent = `준비… ${currentSeal.name} 인장 · 현재 ${handCount}손`;
  } else if (capturing) {
    status.textContent = `● 녹화 중 ${CAPTURE_FRAMES - remaining}/${CAPTURE_FRAMES} (${currentSeal.name}) · 현재 ${handCount}손`;
  } else if (!currentSeal) {
    status.textContent = "인장을 먼저 선택하세요.";
  } else {
    status.textContent = `수집 대상: ${currentSeal.name} · 손: ${handCount}개 · [스페이스]로 캡처`;
  }
}

// ② 스페이스바 → 3초 카운트다운 후 연사 시작
function startCapture() {
  if (!running)     { console.warn("웹캠을 먼저 시작하세요."); return; }
  if (!currentSeal) { console.warn("인장을 먼저 선택하세요."); return; }
  if (capturing || countdownUntil > 0) return; // 이미 진행 중이면 무시
  countdownUntil = performance.now() + COUNTDOWN_MS; // 준비 시간 시작
}

// 연사 완료 → 검증 로그
function finishCapture() {
  capturing = false;
  renderCounts(); // ⑤ 화면 카운터 갱신
  const added = samples.filter(s => s.label === currentSeal.id).length;
  const last = samples[samples.length - 1];
  console.log(`[캡처 완료] ${currentSeal.name}(${currentSeal.id}) +${CAPTURE_FRAMES}장 · 누적 전체 ${samples.length}장`);
  console.log("마지막 샘플 예시:", last);
  // --- 자동 검증 ---
  console.log(`검증① 라벨 일치: ${last.label === currentSeal.id ? "✅" : "❌"} (${last.label})`);
  console.log(`검증② 랜드마크 21점: ${last.landmarks.every(h => h.length === 21) ? "✅" : "❌"} (손 ${last.handCount}개)`);
  console.log(`검증③ 특징 90개(고정): ${last.features.length === 90 ? "✅" : "❌"} (${last.features.length}개)`);
  console.log(`검증④ 이 인장 누적: ${added}장`);
}

// --- 시작 버튼 ---
startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  try {
    if (!handLandmarker) {
      status.textContent = "모델 로딩 중… (최초 1회)";
      handLandmarker = await createHandLandmarker();
    }
    await startCamera(video);
    status.textContent = "준비 완료. 인장을 선택하세요.";
    running = true;
    loop();
  } catch (e) {
    status.textContent = "에러: " + e.message;
    console.error(e);
    startBtn.disabled = false;
  }
});

// 한 프레임의 현재 영상을 JPEG로 뽑아 images에 저장 (좌표와 인덱스로 연결)
function captureImage(idx) {
  grabCtx.drawImage(video, 0, 0, grabCanvas.width, grabCanvas.height);
  const base64 = grabCanvas.toDataURL("image/jpeg", 0.7).split(",")[1]; // 접두사 제거
  images.push({ name: `images/${currentSeal.id}_${String(idx).padStart(5, "0")}.jpg`, base64 });
}

// Blob을 파일로 다운로드하는 공용 헬퍼
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// --- ④ JSON 내보내기: 좌표만 (가벼움, MLP 학습용) ---
function exportJSON() {
  if (samples.length === 0) { console.warn("저장할 데이터가 없습니다. 먼저 스페이스로 캡처하세요."); return; }
  const json = JSON.stringify(samples);
  const filename = `seals_${today()}_${samples.length}.json`;
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, filename);

  // --- 자동 검증 ---
  const parsed = JSON.parse(json); // round-trip: 다시 읽어 깨지지 않았는지 확인
  const counts = {};
  for (const s of samples) counts[s.label] = (counts[s.label] || 0) + 1;
  console.log(`[JSON] ${filename} · ${samples.length}장 · ${(blob.size / 1024).toFixed(1)} KB`);
  console.log("인장별 개수:", counts);
  console.log(`검증① 왕복 파싱 일치: ${parsed.length === samples.length ? "✅" : "❌"} (${parsed.length}장)`);
  console.log(`검증② 필드 완전성: ${samples.every(s => s.label && s.landmarks && s.features && s.timestamp) ? "✅" : "❌"}`);
  console.log(`검증③ 특징 90개 일관: ${samples.every(s => s.features.length === 90) ? "✅" : "❌"}`);
}

// --- 이미지+JSON 내보내기: ZIP (CNN 학습 대비) ---
async function exportZip() {
  if (samples.length === 0) { console.warn("저장할 데이터가 없습니다."); return; }
  exportZipBtn.disabled = true;
  exportZipBtn.textContent = "🗂 압축 중…";
  try {
    // JSZip은 여기서만 동적 로드 → CDN 실패해도 수집 툴 본체는 안 깨짐
    const { default: JSZip } = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
    const zip = new JSZip();
    zip.file("data.json", JSON.stringify(samples));       // 좌표
    for (const img of images) zip.file(img.name, img.base64, { base64: true }); // 이미지들
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const filename = `seals_${today()}_${samples.length}f_${images.length}img.zip`;
    downloadBlob(blob, filename);

    // --- 자동 검증 ---
    console.log(`[ZIP] ${filename} · 좌표 ${samples.length}장 · 이미지 ${images.length}장 · ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`검증① 이미지=좌표 개수: ${images.length === samples.length ? "✅" : "⚠️ 불일치(이미지 캡처를 껐던 구간 있음)"} (img ${images.length} / smp ${samples.length})`);
    console.log(`검증② 이미지 base64 존재: ${images.every(i => i.base64 && i.base64.length > 0) ? "✅" : "❌"}`);
  } catch (e) {
    console.error("ZIP 생성 실패:", e);
    alert("ZIP 생성 실패 (인터넷/CDN 확인). 좌표는 '💾 JSON 저장'으로 받을 수 있어요.");
  } finally {
    exportZipBtn.disabled = false;
    exportZipBtn.textContent = "🗂 이미지+JSON(ZIP)";
  }
}

exportBtn.addEventListener("click", exportJSON);
exportZipBtn.addEventListener("click", exportZip);

// --- ② 스페이스바 캡처 ---
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();  // 스페이스로 페이지 스크롤되는 것 방지
    startCapture();
  }
});

// --- 초기화 ---
buildSealButtons();
renderCounts(); // 처음엔 전부 0장으로 표시

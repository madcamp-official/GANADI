// MediaPipe 자산을 client/public/ 아래로 내려받는다 — 시연장 네트워크에 게임을 걸지 않기 위해.
//
//   node tools/vendorMediapipe.mjs      (= npm run vendor:mediapipe)
//
// 받는 것 두 가지:
//   ① WASM 런타임 — node_modules/@mediapipe/tasks-vision/wasm 에서 복사 (이미 설치돼 있다)
//   ② 손 랜드마커 모델(.task) — Google 스토리지에서 다운로드 (약 7.5MB)
//
// 결과물은 용량이 커서 git에 넣지 않는다(.gitignore). 새로 클론했으면 이 명령을 한 번 돌릴 것.
// 자산이 없으면 client/src/recognition/handLandmarker.js가 알아서 CDN으로 폴백하므로
// 개발 중엔 안 돌려도 게임은 뜬다. 시연 전에는 반드시 돌릴 것.

import { mkdir, copyFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WASM_SRC = join(ROOT, 'node_modules/@mediapipe/tasks-vision/wasm');
const WASM_DST = join(ROOT, 'client/public/mediapipe/wasm');
const MODEL_DST = join(ROOT, 'client/public/model/hand-landmarker/hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;

async function copyWasm() {
  if (!existsSync(WASM_SRC)) {
    throw new Error(`WASM 원본이 없다: ${WASM_SRC}\n  → 먼저 npm install 을 돌릴 것`);
  }
  await mkdir(WASM_DST, { recursive: true });
  const files = await readdir(WASM_SRC);
  let total = 0;
  for (const f of files) {
    const src = join(WASM_SRC, f);
    await copyFile(src, join(WASM_DST, f));
    total += (await stat(src)).size;
  }
  console.log(`✅ WASM 런타임 ${files.length}개 복사 (${mb(total)}) → client/public/mediapipe/wasm`);
}

async function downloadModel() {
  if (existsSync(MODEL_DST)) {
    const { size } = await stat(MODEL_DST);
    console.log(`↩︎ 모델은 이미 있음 (${mb(size)}) — 다시 받으려면 파일을 지우고 실행할 것`);
    return;
  }
  await mkdir(dirname(MODEL_DST), { recursive: true });
  console.log('⬇︎  손 랜드마커 모델 다운로드 중…');
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`모델 다운로드 실패: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // MediaPipe .task는 zip 컨테이너다. 앞 2바이트가 PK가 아니면 에러 페이지를 받은 것이다.
  if (buf.subarray(0, 2).toString() !== 'PK') {
    throw new Error('받은 파일이 .task 형식이 아니다 (프록시 차단·오류 페이지 의심)');
  }
  await writeFile(MODEL_DST, buf);
  console.log(`✅ 모델 저장 (${mb(buf.length)}) → client/public/model/hand-landmarker/`);
}

try {
  await copyWasm();
  await downloadModel();
  console.log('\n이제 인터넷 없이도 손 인식이 뜬다. 브라우저 콘솔에서 "[landmarker] wasm=로컬 · 모델=로컬" 확인할 것.');
} catch (err) {
  console.error(`\n❌ ${err.message}`);
  console.error('   (자산이 없어도 게임은 CDN 폴백으로 돈다 — 다만 시연장 네트워크에 의존하게 된다)');
  process.exit(1);
}

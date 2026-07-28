// smokeMLP.mjs — 배포 아티팩트가 살아 있는지 5초 확인.
//
// client/public/model/seal-mlp/ 의 파일을 브라우저가 읽는 것과 같은 방식으로 로드해
// 실제 샘플을 분류한다. 라벨 순서가 밀렸거나 weightsManifest가 어긋났으면 여기서 잡힌다
// (그런 사고는 게임에선 "개를 맺었는데 용이 나온다"로만 보여서 원인을 찾기 어렵다).
//
//   node tools/smokeMLP.mjs                                  # 기본: 제3자 세션으로 확인
//   node tools/smokeMLP.mjs --data=data/seals_2026-07-25_360f_360img

import { readFileSync } from 'node:fs';
import * as tf from '@tensorflow/tfjs';
import { extractFeaturesV2 } from '../client/src/recognition/featuresV2.js';

const args = process.argv.slice(2);
const DATA = args.find((a) => a.startsWith('--data='))?.split('=')[1]
  ?? 'data/seals_2026-07-28_390f_390img';
const DIR = 'client/public/model/seal-mlp';
const ACCEPT = 0.80, MARGIN = 0.20; // config.js의 MLP와 같은 값

const json = JSON.parse(readFileSync(`${DIR}/model.json`, 'utf8'));
const meta = JSON.parse(readFileSync(`${DIR}/labels.json`, 'utf8'));
const bin = readFileSync(`${DIR}/weights.bin`);

const model = await tf.loadLayersModel(tf.io.fromMemory({
  modelTopology: json.modelTopology,
  weightSpecs: json.weightsManifest[0].weights,
  weightData: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength),
}));

console.log(`모델 : 입력 ${JSON.stringify(model.inputs[0].shape)} → 출력 ${JSON.stringify(model.outputs[0].shape)}`);
console.log(`메타 : 특징 ${meta.featureVersion} · ${meta.labels.length}종 · 학습 ${meta.sessions.length}세션`);
console.log(`샘플 : ${DATA}\n`);

const rows = JSON.parse(readFileSync(`${DATA}/data.json`, 'utf8'));
const byLabel = {};
for (const r of rows) (byLabel[r.label] ??= []).push(r);

let ok = 0, total = 0;
console.log('라벨       예측       확률   일치  게이트');
for (const [label, list] of Object.entries(byLabel)) {
  const r = list[Math.floor(list.length / 2)]; // 각 라벨의 가운데 프레임 하나
  const probs = tf.tidy(() => Array.from(model.predict(tf.tensor2d([extractFeaturesV2(r.landmarks)])).dataSync()));
  const [best, second] = probs.map((p, i) => ({ id: meta.labels[i], p })).sort((a, b) => b.p - a.p);
  const pass = best.id !== 'none' && best.p >= ACCEPT && best.p - second.p >= MARGIN;
  const hit = best.id === label;
  total += 1; if (hit) ok += 1;
  console.log(`${label.padEnd(9)} ${best.id.padEnd(9)} ${best.p.toFixed(3)}   ${hit ? '✓' : '✗'}    ${pass ? 'accept' : 'reject'}`);
}
console.log(`\n라벨 일치 ${ok}/${total}`);
// ⚠️ 이 숫자는 성적이 아니다 — 학습에 쓴 세션으로 확인하면 당연히 다 맞는다.
//    성적은 tools/trainMLP.mjs --holdout 으로만 잰다.

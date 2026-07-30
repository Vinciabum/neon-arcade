import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { diff, variance } from '../tools/framediff.js';

// 실제 캡처 해상도(600x400)와 같은 비율로 만들어야 64x48 축소 비율이 실전과 같아진다.
const W = 600;
const H = 400;

const solid = (r, g, b, w = W, h = H) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).png().toBuffer();

test('단색 화면은 분산이 0에 가깝다 (빈 캔버스 판정 기준)', async () => {
  const frame = await solid(40, 40, 40);
  assert.ok((await variance(frame)) < 1);
});

test('절반씩 검정/흰색이면 분산이 뚜렷하게 크다 (사니티 하한선)', async () => {
  const half = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([{ input: await solid(255, 255, 255, W / 2, H), left: W / 2, top: 0 }])
    .png()
    .toBuffer();
  assert.ok((await variance(half)) > 50);
});

test('어두운 배경에 흩어진 작은 네온 스프라이트는 분산이 빈 캔버스 임계값(3)을 넘는다', async () => {
  // "빈 캔버스"로 오판할 위험이 가장 큰 경우: 화면 대부분이 어둡고, 밝은 부분은
  // 작고 성글게 흩어져 있을 때다(64x48로 축소하면서 평균화되어 분산이 뭉개질 수 있음).
  // 이 저장소의 실제 게임(cyber-snake 몸통, data-fall 블록, space-shooter 적기 등)은
  // 이런 요소를 대략 14px 안팎 정사각형으로 그린다 — 사람이 눈으로 구분하고
  // 조작할 수 있어야 하므로 1~3px짜리 점(장식용 배경 별 정도)보다는 훨씬 크다.
  // 아래는 그 규모(14px)의 스프라이트 10개를 화면 곳곳에 성글게(전체 면적의 1% 미만)
  // 배치한, 실제 플레이 화면을 공정하게 대표하는 구성이다.
  const MARK = 14;
  const positions = [
    [40, 30], [180, 60], [320, 40], [520, 70], [90, 180],
    [260, 200], [430, 190], [560, 220], [150, 330], [400, 340]
  ];
  const mark = await solid(0, 255, 255, MARK, MARK);
  const frame = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 10, g: 10, b: 18 } } })
    .composite(positions.map(([left, top]) => ({ input: mark, left, top })))
    .png()
    .toBuffer();
  assert.ok((await variance(frame)) >= 3);
});

test('diff: 동일한 두 버퍼는 0이다', async () => {
  const frame = await solid(40, 40, 40);
  assert.equal(await diff(frame, frame), 0);
});

test('diff: 완전한 검정과 흰색은 255에 가깝다', async () => {
  const black = await solid(0, 0, 0);
  const white = await solid(255, 255, 255);
  assert.ok((await diff(black, white)) > 250);
});

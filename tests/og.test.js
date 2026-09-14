import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { cardColors } from '../tools/og.js';

const rgb = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16)
});
const luma = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
// WCAG 대비비. 카드 제목은 큰 글씨(68px)라 3:1이 하한이지만 4.5는 넘기게 잡는다.
const contrast = (a, b) => {
  const l = (c) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const [x, y] = [l(a), l(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const MEADOW = { r: 185, g: 208, b: 171 };   // feltling 썸네일의 대표색
const NEON = { r: 8, g: 12, b: 22 };         // 어두운 아케이드 게임

/* 예전에는 글자판이 항상 거의 검정이었다. 네온 19개에는 맞았고, 크림색 펠트 게임의
   공유 카드는 절반이 검정으로 나가서 링크만 보고는 다른 게임처럼 보였다. */
test('밝은 게임은 밝은 카드를 받는다', () => {
  const c = cardColors(MEADOW);
  assert.ok(luma(rgb(c.shade)) > 0.7, `판이 어둡다: ${c.shade}`);
  assert.ok(luma(rgb(c.ink)) < 0.2, `글씨가 밝다: ${c.ink}`);
  assert.ok(c.baseBrightness > 1, '밝은 카드인데 배경을 어둡게 눌렀다');
});

test('어두운 게임은 어두운 카드를 그대로 받는다', () => {
  const c = cardColors(NEON);
  assert.ok(luma(rgb(c.shade)) < 0.2, `판이 밝다: ${c.shade}`);
  assert.equal(c.ink, '#ffffff');
  assert.ok(c.baseBrightness < 1);
});

test('어느 쪽이든 제목이 판 위에서 읽힌다', () => {
  for (const dominant of [MEADOW, NEON, { r: 128, g: 128, b: 128 },
                          { r: 250, g: 250, b: 240 }, { r: 0, g: 0, b: 0 },
                          { r: 220, g: 90, b: 90 }, { r: 40, g: 120, b: 200 }]) {
    const c = cardColors(dominant);
    const ratio = contrast(rgb(c.shade), rgb(c.ink));
    assert.ok(ratio >= 4.5, `${JSON.stringify(dominant)} → 대비 ${ratio.toFixed(1)}:1`);
  }
});

test('태그와 도메인 줄도 판에서 분리된다', () => {
  for (const dominant of [MEADOW, NEON, { r: 220, g: 90, b: 90 }]) {
    const c = cardColors(dominant);
    for (const key of ['accent', 'site']) {
      const ratio = contrast(rgb(c.shade), rgb(c[key]));
      assert.ok(ratio >= 3, `${key} 대비 ${ratio.toFixed(1)}:1`);
    }
  }
});

test('발행된 게임마다 공유 카드가 실제로 있다', () => {
  const games = JSON.parse(readFileSync('games.json', 'utf8'))
    .filter(g => g.status === 'published' || g.status === 'demoted');
  const cards = new Set(readdirSync('assets/og'));
  for (const g of games) {
    assert.ok(cards.has(`${g.slug}.png`), `${g.slug} 의 공유 카드가 없다`);
  }
});

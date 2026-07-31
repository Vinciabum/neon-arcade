// 게이트 3의 입력 — 플레이 중 화면 10장.
// verify.js와 따로 두는 이유: verify는 판정 도구다. 거기에 캡처를 얹으면
// 측정 시간이 늘어 FPS 표본이 흔들린다 (계획 2a에서 확인한 함정).
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { gamePath } from './paths.js';
import { triggerStart } from './start.js';

const SHOTS = 10;
const SPAN_MS = 20_000;          // 이 시간에 걸쳐 고르게 찍는다
const SETTLE_MS = 700;

export async function playshots(target, outDir) {
  const file = existsSync(target) ? target : gamePath(target);
  if (!existsSync(file)) throw new Error(`no such game: ${target}`);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const shots = [];
  try {
    // 모바일 크기로 찍는다. 포털 심사도 트래픽도 모바일이 기준이다.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: 'load' });
    await page.waitForTimeout(SETTLE_MS);

    const started = await page.evaluate(() => {
      if (!window.__GAME__) return false;
      window.__GAME__.start();
      return true;
    });
    if (!started) await triggerStart(page);

    const gap = Math.round(SPAN_MS / SHOTS);
    for (let i = 0; i < SHOTS; i++) {
      // 입력을 조금씩 준다. 아무것도 안 하면 10장이 전부 게임오버 화면이 된다.
      await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight').catch(() => {});
      await page.mouse.click(195, 500).catch(() => {});
      await page.waitForTimeout(gap);

      // 죽어 있으면 되살린다. 죽은 화면 10장은 심사에 쓸 수 없다.
      await page.evaluate(() => {
        if (window.__GAME__ && window.__GAME__.state === 'over') window.__GAME__.start();
      }).catch(() => {});

      const out = path.join(outDir, `shot-${String(i + 1).padStart(2, '0')}.png`);
      await page.screenshot({ path: out });
      shots.push(out);
    }
  } finally {
    await browser.close();
  }
  return shots;
}

// --- CLI ---
const [target, outDir = 'docs/superpowers/shots'] = process.argv.slice(2);
if (!target) {
  console.error('usage: npm run shots -- <slug|path> [outDir]');
  process.exit(1);
}
const files = await playshots(target, path.join(outDir, path.basename(target, '.html')));
for (const f of files) console.log(`  -> ${f}`);
console.log(`\n${files.length} shots.`);

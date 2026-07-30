// 게임을 실제 브라우저에서 실행하고 캔버스를 캡처해 썸네일을 만든다.
// 사용: node tools/shoot.js [slug ...]   (인자 없으면 games.json 전체)
import { chromium } from 'playwright';
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { gamePath, thumbPath } from './paths.js';
import { diff as frameDiff } from './framediff.js';
import { clickStartButton, triggerStart } from './start.js';

const WIDTH = 600;
const HEIGHT = 400;

// 캡처 시점 후보(시작 트리거 이후 경과 시간).
// 이르면 타이틀, 늦으면 게임오버가 찍히므로 촘촘히 여러 장 확보한다.
const CAPTURE_AT_MS = [900, 1500, 2200, 3000, 3800];

// 타이틀 대비 이 정도는 달라져야 "게임이 시작됐다"로 본다 (0~255 평균 절대차).
const CHANGED_THRESHOLD = 12;

// 타이틀 화면을 기준선으로 삼고, 거기서 처음으로 충분히 달라진 프레임을 고른다.
// 게임오버는 플레이보다 뒤에 오므로 "가장 이른 변화 프레임"을 잡으면 자연히 배제된다.
async function pickPlayFrame(page, target, baseline) {
  let fallback = null;
  let fallbackDiff = -1;
  let prev = 0;
  let nudge = 0;

  // 화면이 그대로면 시작 트리거가 먹지 않은 것이다. 표본을 뜨는 사이사이에
  // 다른 입력을 넣어 재시도한다(방향키로 움직이는 게임, 캔버스 내부 버튼 등).
  const NUDGES = [
    async () => { await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); },
    async () => { await page.mouse.click(450, 420); },
    async () => { await page.keyboard.press('KeyW'); await page.keyboard.press('ArrowUp'); },
    async () => { await clickStartButton(page); }
  ];

  for (const at of CAPTURE_AT_MS) {
    await page.waitForTimeout(at - prev);
    prev = at;
    const raw = await target.screenshot().catch(() => null);
    if (!raw) continue;

    const diff = await frameDiff(baseline, raw);
    if (diff >= CHANGED_THRESHOLD) return { raw, diff, at };
    if (diff > fallbackDiff) { fallback = raw; fallbackDiff = diff; }

    if (nudge < NUDGES.length) await NUDGES[nudge++]().catch(() => {});
  }
  return fallback ? { raw: fallback, diff: fallbackDiff, at: null } : null;
}

async function shoot(browser, slug) {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const file = path.resolve(gamePath(slug));
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const canvas = page.locator('canvas').first();
  const target = (await canvas.count()) > 0 ? canvas : page;

  const baseline = await target.screenshot();
  await triggerStart(page);

  const picked = await pickPlayFrame(page, target, baseline);
  if (!picked) throw new Error('no frame captured');

  const out = thumbPath(slug);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(picked.raw)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
    .webp({ quality: 82 })
    .toFile(out);

  await page.close();
  return { out, diff: picked.diff.toFixed(1), at: picked.at };
}

const all = JSON.parse(await readFile('games.json', 'utf8'));
const slugs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : all.filter(g => g.status !== 'removed').map(g => g.slug);

const browser = await chromium.launch();
for (const slug of slugs) {
  try {
    const { out, diff, at } = await shoot(browser, slug);
    const when = at === null ? 'NO CLEAR START (fallback frame)' : `t=${at}ms`;
    console.log(`ok   ${slug} -> ${out}  [diff ${diff}, ${when}]`);
  } catch (err) {
    console.error(`FAIL ${slug}: ${err.message}`);
    process.exitCode = 1;
  }
}
await browser.close();

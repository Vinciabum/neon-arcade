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

// 카드는 3:4다. 게임 내용이 플레이 밴드로 세로 비율(0.4839)에 묶여 있어서,
// 가로 카드에서는 게임이 폭의 32%밖에 못 채운다 — 종횡비가 그렇게 정해져 있으니
// 가로 프레임 안에서 크게 만들 방법이 없다. 3:4에서는 64%가 된다.
// 완전히 채우려면 카드가 0.4839여야 하는데 17개면 홈이 너무 길어진다.
const WIDTH = 480;
const HEIGHT = 640;

// 캔버스가 정확히 3:4가 되는 뷰포트. HUD가 38px를 가져가므로 838 - 38 = 800이고
// 600x800 = 0.75다. 밴드 양옆은 게임 자신의 풀블리드 배경이 채우므로 합성이 필요 없다.
const VIEWPORT = { width: 600, height: 838 };

/* 캡처 시점 후보(시작 트리거 이후 경과 시간).
   이르면 타이틀, 늦으면 게임오버가 찍히므로 촘촘히 여러 장 확보하고,
   '타이틀과 처음으로 충분히 달라진' 가장 이른 프레임을 고른다.

   ⚠ 그 규칙이 어떤 게임에는 너무 이르다. duck-line은 900ms에 이미 물이 흐르므로
   조건을 통과하지만, 그 순간 엄마는 혼자다 — 이 게임의 전부인 '줄'이 없는 그림이
   OG 카드와 썸네일에 그대로 박혔다. 반대로 pulse-lock은 1800ms에 찍었더니 빨간
   MISSED가 화면을 덮었다(아무도 조작하지 않으면 실패 피드백이 쌓인다).

   그래서 시점을 게임이 스스로 밝히게 한다: games.json 의 captureFromMs 가 있으면
   그 뒤부터 표본을 뜬다. '가장 이른 변화 프레임' 규칙은 그대로라 게임오버는 여전히 피한다. */
const CAPTURE_AT_MS = [900, 1500, 2200, 3000, 3800];
function captureTimes(fromMs) {
  if (!fromMs) return CAPTURE_AT_MS;
  return CAPTURE_AT_MS.map((t, i) => fromMs + i * 700);
}

// 타이틀 대비 이 정도는 달라져야 "게임이 시작됐다"로 본다 (0~255 평균 절대차).
const CHANGED_THRESHOLD = 12;

// 타이틀 화면을 기준선으로 삼고, 거기서 처음으로 충분히 달라진 프레임을 고른다.
// 게임오버는 플레이보다 뒤에 오므로 "가장 이른 변화 프레임"을 잡으면 자연히 배제된다.
async function pickPlayFrame(page, target, baseline, fromMs) {
  let fallback = null;
  let fallbackDiff = -1;
  let prev = 0;
  let nudge = 0;

  // 화면이 그대로면 시작 트리거가 먹지 않은 것이다. 표본을 뜨는 사이사이에
  // 다른 입력을 넣어 재시도한다(방향키로 움직이는 게임, 캔버스 내부 버튼 등).
  const NUDGES = [
    async () => { await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); },
    async () => { await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height / 2); },
    async () => { await page.keyboard.press('KeyW'); await page.keyboard.press('ArrowUp'); },
    async () => { await clickStartButton(page); }
  ];

  for (const at of captureTimes(fromMs)) {
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

async function shoot(browser, slug, fromMs) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const file = path.resolve(gamePath(slug));
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const canvas = page.locator('canvas').first();
  const target = (await canvas.count()) > 0 ? canvas : page;

  const baseline = await target.screenshot();
  await triggerStart(page);

  const picked = await pickPlayFrame(page, target, baseline, fromMs);
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
    const entry = all.find(g => g.slug === slug);
    const { out, diff, at } = await shoot(browser, slug, entry && entry.captureFromMs);
    const when = at === null ? 'NO CLEAR START (fallback frame)' : `t=${at}ms`;
    console.log(`ok   ${slug} -> ${out}  [diff ${diff}, ${when}]`);
  } catch (err) {
    console.error(`FAIL ${slug}: ${err.message}`);
    process.exitCode = 1;
  }
}
await browser.close();

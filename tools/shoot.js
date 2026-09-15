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
//
// 그 규칙이 못 막는 경우가 하나 있다: 자동 테스터 손에서 1초 만에 죽는 게임. 표본을
// 처음 뜨는 900ms에 이미 게임오버라 모든 후보가 게임오버다. 실측으로 잡았다 —
// dino-jump 썸네일이 "GAME OVER / SCORE 9 / REPLAY"였고, neon-dodge는 "NO SIGNAL"이었다.
//
// 구분하는 방법은 픽셀 통계가 아니라 **움직임**이다. 플레이 중인 화면은 계속 바뀌고,
// 게임오버 오버레이는 멈춰 있다. 후보를 하나 잡을 때마다 조금 뒤 화면과 비교해서,
// 얼어 있으면 플레이가 아니라고 본다.
const STILL_THRESHOLD = 1.2;   // 두 프레임 평균 절대차. 이 밑이면 화면이 멈춰 있다
const STILL_GAP_MS = 260;

async function isMoving(page, target, raw) {
  await page.waitForTimeout(STILL_GAP_MS);
  const later = await target.screenshot().catch(() => null);
  if (!later) return true;                       // 못 찍었으면 판단하지 않는다
  return (await frameDiff(raw, later)) >= STILL_THRESHOLD;
}

async function pickPlayFrame(page, target, baseline, fromMs) {
  let fallback = null;
  let fallbackDiff = -1;
  let prev = 0;
  let nudge = 0;
  let sawStill = false;

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
    // 어떤 프레임이든 차선책으로는 남긴다. 전부 거절해서 한 장도 못 건지면
    // 썸네일이 통째로 없어지고 빌드가 멈춘다 — 실제로 그렇게 깨뜨렸다.
    if (diff > fallbackDiff) { fallback = raw; fallbackDiff = diff; }

    if (diff >= CHANGED_THRESHOLD) {
      if (await isMoving(page, target, raw)) return { raw, diff, at };
      // 멈춘 화면이다 — 게임오버이거나 덮개다. 다시 시작시키고 다음 표본으로 간다.
      sawStill = true;
      await triggerStart(page).catch(() => {});
      await clickStartButton(page).catch(() => {});
      continue;
    }

    if (nudge < NUDGES.length) await NUDGES[nudge++]().catch(() => {});
  }
  return fallback ? { raw: fallback, diff: fallbackDiff, at: null, sawStill } : null;
}

/* 게임이 자기를 "가장 잘 보여주는 상태"로 열 수 있게 한다. games.json 의 captureQuery 가
   있으면 그대로 쿼리로 붙인다 — Feltling은 0단계가 맨몸 회색 물범이라, 썸네일이 이 게임이
   무엇에 관한 것인지(털이 자란다) 한 장도 말해주지 못했다. 게임이 실제로 만드는 화면이라는
   성질은 그대로다. 없으면 아무것도 붙지 않는다. */
async function shoot(browser, slug, fromMs, query) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const file = path.resolve(gamePath(slug));
  await page.goto(pathToFileURL(file).href + (query ? `?${query}` : ''), { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const canvas = page.locator('canvas').first();
  const target = (await canvas.count()) > 0 ? canvas : page;

  const baseline = await target.screenshot();
  await triggerStart(page);

  const picked = await pickPlayFrame(page, target, baseline, fromMs);
  if (!picked) throw new Error('no frame captured');

  const out = thumbPath(slug);
  await mkdir(path.dirname(out), { recursive: true });
  /* 타일에서 읽히게 만든다.
     홈이 138px 타일 격자로 바뀌자 어두운 게임 19개가 전부 까만 사각형으로 보였다.
     측정해 보니 space-shooter 썸네일의 평균 밝기가 255 중 1.3이었다 — 게임은 멀쩡한데
     손톱만 한 크기로 줄이면 아무것도 안 보인다. 어두운 것만 골라 조금 올린다.
     내용을 바꾸지 않는다: 밝기와 채도만 움직이고, 밝은 게임은 손대지 않는다. */
  const base = sharp(picked.raw).resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' });
  const stats = await base.clone().greyscale().stats();
  const mean = stats.channels[0].mean;
  const TILE_FLOOR = 46;
  const lift = mean < TILE_FLOOR ? Math.min(2.2, TILE_FLOOR / Math.max(mean, 6)) : 1;
  await base
    .modulate(lift > 1 ? { brightness: lift, saturation: 1.12 } : {})
    .webp({ quality: 82 })
    .toFile(out);
  if (lift > 1) console.log(`     lifted ${slug}: mean ${mean.toFixed(1)} -> x${lift.toFixed(2)}`);
  if (picked.sawStill && picked.at === null) {
    console.warn(`     !  ${slug}: every changed frame was frozen — this thumbnail may be a game-over screen`);
  }

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
    const { out, diff, at } = await shoot(browser, slug, entry && entry.captureFromMs, entry && entry.captureQuery);
    const when = at === null ? 'NO CLEAR START (fallback frame)' : `t=${at}ms`;
    console.log(`ok   ${slug} -> ${out}  [diff ${diff}, ${when}]`);
  } catch (err) {
    console.error(`FAIL ${slug}: ${err.message}`);
    process.exitCode = 1;
  }
}
await browser.close();

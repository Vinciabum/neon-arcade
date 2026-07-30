// 게임을 실제 브라우저에서 돌려 게이트 1(기술)·게이트 2(플레이)를 수집하고 판정한다.
//
// 사용:
//   node tools/verify.js                      games.json의 published/demoted 전체
//   node tools/verify.js cyber-snake          슬러그
//   node tools/verify.js templates/game-base.html   경로 (.html로 끝나면 경로로 본다)
//   node tools/verify.js --quick <대상>       짧게 (개발 중 반복용)
//   node tools/verify.js --json out.json <대상>  리포트 저장 (게이트 3의 입력이 된다)
//
// 게이트 실패 시 exit 1. 실패하면 push하지 않는다.
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { gamePath } from './paths.js';
import { PROBE_SOURCE } from './probe.js';
import { checkTech, checkPlay, TECH } from './gates.js';
import { diff, variance } from './framediff.js';
import { triggerStart } from './start.js';

// 게이트 1의 기준 뷰포트는 gates.js가 소유한다 — 에러 메시지도 같은 값을 쓰므로 여기서 다시 적지 않는다.
const MOBILE = TECH.MOBILE_VIEWPORT;
const DESKTOP = { width: 900, height: 600 };

const FULL = { inputMs: 30_000, idleMs: 20_000, sampleMs: 500, windowMs: 5_000 };
const QUICK = { inputMs: 8_000, idleMs: 8_000, sampleMs: 400, windowMs: 2_000 };

// 결정적 입력 패턴. 무작위를 쓰지 않는 이유: 실패를 재현할 수 있어야 한다.
const INPUT_PATTERN = ['ArrowLeft', 'ArrowRight', 'Space', 'ArrowRight', 'ArrowLeft', 'KeyA', 'KeyD', 'ArrowUp'];

function parseArgs(argv) {
  const opts = { quick: false, json: null, targets: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--quick') opts.quick = true;
    else if (argv[i] === '--json') opts.json = argv[++i];
    else opts.targets.push(argv[i]);
  }
  return opts;
}

const resolveTarget = (t) => t.endsWith('.html')
  ? { label: path.basename(t, '.html'), file: t }
  : { label: t, file: gamePath(t) };

// ---------- 게이트 1: 모바일 뷰포트에서 기술 검증 ----------
async function collectTech(browser, target) {
  const page = await browser.newPage({ viewport: MOBILE, hasTouch: true, isMobile: true });
  await page.addInitScript({ content: PROBE_SOURCE });

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
  page.on('requestfailed', (r) => failedRequests.push(`${r.url().slice(-80)} (${r.failure()?.errorText ?? 'failed'})`));

  const t0 = performance.now();
  await page.goto(pathToFileURL(path.resolve(target.file)).href, { waitUntil: 'load' });
  const loadMs = performance.now() - t0;

  await page.waitForTimeout(600);
  await triggerStart(page);
  await page.waitForTimeout(900);          // 실제로 그려질 시간을 준다

  const dom = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c?.getBoundingClientRect();
    // 캔버스 중앙에서 가장 위에 있는 요소가 캔버스가 아니면 시작 오버레이가 아직 덮고 있다.
    // 실측: 타이틀 화면의 분산이 실제 플레이보다 높아서 픽셀만으로는 구분할 수 없다.
    const top = r ? document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)) : null;
    return {
      found: !!c,
      covered: !!c && !!top && top !== c && !c.contains(top),
      cssWidth: r ? Math.round(r.width) : 0,
      cssHeight: r ? Math.round(r.height) : 0,
      inView: !!r && r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.right <= window.innerWidth + 1,
      listeners: window.__PROBE__?.listeners ?? [],
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    };
  });

  // 캔버스를 두 장 찍는다. 한 장의 분산만 보면 파티클·스타필드가 빈 화면으로 오판된다.
  const shotTarget = dom.found ? page.locator('canvas').first() : page;
  const shotA = await shotTarget.screenshot().catch(() => null);
  await page.waitForTimeout(400);
  const shotB = await shotTarget.screenshot().catch(() => null);
  const shot = shotB ?? shotA;

  const report = {
    label: target.label,
    loadMs,
    consoleErrors,
    pageErrors,
    failedRequests,
    canvas: {
      found: dom.found,
      covered: dom.covered,
      cssWidth: dom.cssWidth,
      cssHeight: dom.cssHeight,
      inView: dom.inView,
      variance: shot ? Number((await variance(shot)).toFixed(1)) : 0,
      motion: shotA && shotB ? Number((await diff(shotA, shotB)).toFixed(1)) : 0
    },
    listeners: dom.listeners,
    mobile: { scrollWidth: dom.scrollWidth, innerWidth: dom.innerWidth }
  };
  await page.close();
  return report;
}

// ---------- 게이트 2: 데스크톱 뷰포트에서 자동 플레이 ----------
async function collectPlay(browser, target, T) {
  const page = await browser.newPage({ viewport: DESKTOP });
  await page.addInitScript({ content: PROBE_SOURCE });
  await page.goto(pathToFileURL(path.resolve(target.file)).href, { waitUntil: 'load' });
  await page.waitForTimeout(700);

  const api = await page.evaluate(() => (window.__GAME__ ? window.__GAME__.api : null));
  const mode = api === null ? 'legacy' : 'contract';

  const canvas = page.locator('canvas').first();
  const shotTarget = (await canvas.count()) > 0 ? canvas : page;
  const beforeInput = await shotTarget.screenshot().catch(() => null);

  if (mode === 'contract') await page.evaluate(() => window.__GAME__.start());
  else await triggerStart(page);

  const heapStart = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);

  // --- 입력 단계 ---
  const scoreSamples = [];
  const stateSamples = [];
  const frameMarks = [{ t: performance.now(), frames: await page.evaluate(() => window.__PROBE__?.frames ?? 0) }];

  const inputEnd = performance.now() + T.inputMs;
  let k = 0;
  while (performance.now() < inputEnd) {
    await page.keyboard.press(INPUT_PATTERN[k % INPUT_PATTERN.length]).catch(() => {});
    k++;
    await page.waitForTimeout(T.sampleMs);
    const s = await page.evaluate(() => ({
      frames: window.__PROBE__?.frames ?? 0,
      score: window.__GAME__ ? window.__GAME__.score : null,
      state: window.__GAME__ ? window.__GAME__.state : null
    }));
    frameMarks.push({ t: performance.now(), frames: s.frames });
    if (s.score !== null) scoreSamples.push(s.score);
    if (s.state !== null) stateSamples.push(s.state);
    // 계약 모드에서 도중에 죽으면 다시 시작해 입력 단계를 계속한다
    if (s.state === 'over') await page.evaluate(() => window.__GAME__.start());
  }

  const afterInput = await shotTarget.screenshot().catch(() => null);
  const legacyDiff = beforeInput && afterInput ? Number((await diff(beforeInput, afterInput)).toFixed(1)) : 0;

  // --- 방치 단계: 입력 없이 게임오버가 오는지 ---
  if (mode === 'contract') await page.evaluate(() => window.__GAME__.start());
  const idleStart = performance.now();
  let idleEnded = false;
  while (performance.now() - idleStart < T.idleMs) {
    await page.waitForTimeout(T.sampleMs);
    const s = await page.evaluate(() => ({
      frames: window.__PROBE__?.frames ?? 0,
      state: window.__GAME__ ? window.__GAME__.state : null
    }));
    frameMarks.push({ t: performance.now(), frames: s.frames });
    if (s.state === 'over') { idleEnded = true; break; }
  }
  const idle = { ended: mode === 'contract' ? idleEnded : null, afterMs: Math.round(performance.now() - idleStart) };

  // --- 재시작 단계 ---
  let restart = null;
  if (mode === 'contract') {
    await page.evaluate(() => window.__GAME__.start());
    await page.waitForTimeout(700);
    const s = await page.evaluate(() => ({ state: window.__GAME__.state, score: window.__GAME__.score }));
    restart = { ok: s.state === 'playing', state: s.state, score: s.score };
  }

  const heapEnd = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);

  // --- FPS: 프로브 프레임 카운터를 구간별로 환산 ---
  const first = frameMarks[0], last = frameMarks[frameMarks.length - 1];
  const avgFps = Number((((last.frames - first.frames) / (last.t - first.t)) * 1000).toFixed(1));
  const fpsWindows = [];
  let anchor = first;
  for (const m of frameMarks) {
    if (m.t - anchor.t >= T.windowMs) {
      fpsWindows.push(Number((((m.frames - anchor.frames) / (m.t - anchor.t)) * 1000).toFixed(1)));
      anchor = m;
    }
  }

  await page.close();
  return {
    label: target.label, mode, api,
    // frames는 rAF 프레임 총수. 0이면 setInterval 루프라 FPS를 셀 수 없다.
    frames: last.frames,
    // 입력 단계의 길이. gates.js가 stateSamples의 'over' 수로 나눠 평균 생존시간을 본다.
    inputMs: T.inputMs,
    avgFps, fpsWindows: fpsWindows.length ? fpsWindows : [avgFps],
    heap: { start: heapStart, end: heapEnd },
    scoreSamples, stateSamples, legacyDiff, idle, restart
  };
}

// ---------- main ----------
const opts = parseArgs(process.argv.slice(2));
const T = opts.quick ? QUICK : FULL;

const targets = opts.targets.length
  ? opts.targets.map(resolveTarget)
  : JSON.parse(await readFile('games.json', 'utf8'))
      .filter(g => g.status === 'published' || g.status === 'demoted')
      .map(g => resolveTarget(g.slug));

const browser = await chromium.launch();

// 크롬 첫 실행 비용이 첫 게임의 loadMs로 잘못 청구되는 것을 막는다.
// 실측: 같은 파일이 콜드 3199ms → 웜 458ms. 게이트가 늑대소년이 되면 아무도 안 믿는다.
if (targets.length) {
  const warm = await browser.newPage();
  await warm.goto(pathToFileURL(path.resolve(targets[0].file)).href, { waitUntil: 'load' }).catch(() => {});
  await warm.close();
}

const reports = [];
let failed = 0;

for (const target of targets) {
  console.log(`\n== ${target.label} (${target.file})`);
  try {
    const tech = await collectTech(browser, target);
    const techErrors = checkTech(tech);
    const play = await collectPlay(browser, target, T);
    const { errors: playErrors, skipped } = checkPlay(play);

    console.log(`  mode ${play.mode}  load ${Math.round(tech.loadMs)}ms  fps ${play.avgFps}  variance ${tech.canvas.variance}  motion ${tech.canvas.motion}`);
    for (const s of skipped) console.log(`  ~ skipped: ${s}`);
    for (const e of [...techErrors, ...playErrors]) console.error(`  x ${e}`);
    if (!techErrors.length && !playErrors.length) console.log('  ok  gate 1 + gate 2 passed');
    else failed++;

    reports.push({ target: target.label, tech, play, techErrors, playErrors, skipped });
  } catch (err) {
    console.error(`  x ${target.label}: verify crashed — ${err.message}`);
    reports.push({ target: target.label, crashed: err.message });
    failed++;
  }
}
await browser.close();

if (opts.json) {
  await mkdir(path.dirname(path.resolve(opts.json)), { recursive: true });
  await writeFile(opts.json, JSON.stringify(reports, null, 2), 'utf8');
  console.log(`\n  -> ${opts.json}`);
}

console.log(`\n${targets.length - failed}/${targets.length} passed.\n`);
if (failed) process.exit(1);

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

// 이 플래그 없이는 Chromium이 usedJSHeapSize를 큰 단위로 뭉개서 준다 (실측: 정확히 10000000).
// 플래그를 '요청'했다는 것만 알 수 있고 브라우저가 실제로 반영했는지는 확인할 방법이 없다.
// 그래서 heap.precise는 "요청했고 읽은 값이 0이 아니다"라는 뜻이다 — 그 이상을 주장하지 않는다.
const HEAP_ARGS = ['--enable-precise-memory-info'];
const heapPrecise = true;   // HEAP_ARGS로 launch하므로 요청은 항상 이뤄진다

// 키 순서는 고정이지만 재생 가능한 실행은 아니다: 누르는 시점·dt·'over'일 때 재시작하는 분기가
// 모두 벽시계에 의존한다. 같은 실패를 다시 만드는 것은 보장되지 않는다.
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
  // 계약이 있으면 휴리스틱보다 계약으로 시작한다 — 게이트 1의 픽셀 지표는
  // state === 'playing' 에서만 의미가 있다 (타이틀·게임오버 화면은 분산이 낮고 해상도에 민감하다).
  const contract = await page.evaluate(() => {
    if (!window.__GAME__) return false;
    window.__GAME__.start();
    return true;
  });
  if (!contract) await triggerStart(page);
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
      // 촬영 시점의 상태. 게이트는 읽지 않는다 — 낮은 분산을 나중에 설명하기 위한 진단값이다.
      state: window.__GAME__ ? window.__GAME__.state : null,
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
  // 촬영이 실패하면 0이 아니라 null로 둔다. 0으로 두면 "측정 못 했다"가 "빈 화면이다"로
  // 바뀌어 게임이 억울하게 실패한다.
  const captureFailed = !shotA || !shotB;

  const report = {
    label: target.label,
    loadMs: Number(loadMs.toFixed(1)),
    consoleErrors,
    pageErrors,
    failedRequests,
    canvas: {
      found: dom.found,
      covered: dom.covered,
      state: dom.state,
      cssWidth: dom.cssWidth,
      cssHeight: dom.cssHeight,
      inView: dom.inView,
      captureFailed,
      variance: shot ? Number((await variance(shot)).toFixed(1)) : null,
      motion: shotA && shotB ? Number((await diff(shotA, shotB)).toFixed(1)) : null
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

  if (mode === 'contract') await page.evaluate(() => window.__GAME__.start());
  else await triggerStart(page);
  await page.waitForTimeout(500);          // 시작 화면이 걷히고 첫 프레임이 자리잡을 시간
  // 기준 프레임은 시작 '후'에 찍는다. 시작 전에 찍으면 타이틀 오버레이가 사라진 차이를
  // 입력 반응으로 착각한다 (실측: 그 방식으로 legacyDiff 6.2, 임계값 6 — 오버레이가 만든 값이었다).
  const beforeInput = await shotTarget.screenshot().catch(() => null);

  // 힙은 시작 직후가 아니라 게임이 정상 궤도에 오른 뒤에 읽는다 — 초기 할당이 끝나기 전에
  // 읽으면 증가율이 부풀려진다. GC를 강제하지 않으므로 이 델타에는 아직 회수되지 않은
  // 쓰레기가 포함된다. 누수의 증거가 아니라 정황일 뿐이다.
  const heapStart = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);

  // --- 입력 단계 ---
  const scoreSamples = [];
  const stateSamples = [];
  const inputMarks = [{ t: performance.now(), frames: await page.evaluate(() => window.__PROBE__?.frames ?? 0) }];

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
    inputMarks.push({ t: performance.now(), frames: s.frames });
    if (s.score !== null) scoreSamples.push(s.score);
    if (s.state !== null) stateSamples.push(s.state);
    // 계약 모드에서 도중에 죽으면 다시 시작해 입력 단계를 계속한다
    if (s.state === 'over') await page.evaluate(() => window.__GAME__.start());
  }

  const afterInput = await shotTarget.screenshot().catch(() => null);
  // 촬영 실패는 0(=반응 없음)이 아니라 null(=측정 못 함)이다.
  const legacyDiff = beforeInput && afterInput ? Number((await diff(beforeInput, afterInput)).toFixed(1)) : null;

  // --- 방치 단계: 입력 없이 게임오버가 오는지 ---
  // 프레임 마크를 입력 단계와 따로 모은다. 죽은 뒤에는 step()을 건너뛰어 프레임이 싸지므로
  // 두 단계를 섞으면 무거운 게임의 fps가 플레이어가 겪지 않는 프레임으로 부풀려진다.
  if (mode === 'contract') await page.evaluate(() => window.__GAME__.start());
  const idleStart = performance.now();
  const idleMarks = [{ t: idleStart, frames: await page.evaluate(() => window.__PROBE__?.frames ?? 0) }];
  let idleEnded = false;
  while (performance.now() - idleStart < T.idleMs) {
    await page.waitForTimeout(T.sampleMs);
    const s = await page.evaluate(() => ({
      frames: window.__PROBE__?.frames ?? 0,
      state: window.__GAME__ ? window.__GAME__.state : null
    }));
    idleMarks.push({ t: performance.now(), frames: s.frames });
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
  // 게이트가 보는 avgFps는 '입력 단계'만이다. 플레이어가 실제로 겪는 구간이 그곳이다.
  const fps = (a, b) => Number((((b.frames - a.frames) / (b.t - a.t)) * 1000).toFixed(1));
  const first = inputMarks[0], last = inputMarks[inputMarks.length - 1];
  const avgFps = fps(first, last);

  const fpsWindows = [];
  let anchor = first;
  for (const m of inputMarks) {
    if (m.t - anchor.t >= T.windowMs) {
      fpsWindows.push(fps(anchor, m));
      anchor = m;
    }
  }
  // 꼬리 구간도 1초 이상이면 보고한다 — 마지막 몇 초의 스톨이 안 보이면 의미가 없다.
  if (last.t - anchor.t >= 1000) fpsWindows.push(fps(anchor, last));

  const idleFirst = idleMarks[0], idleLast = idleMarks[idleMarks.length - 1];
  const idleFps = idleMarks.length > 1 ? fps(idleFirst, idleLast) : null;

  await page.close();
  return {
    label: target.label, mode, api,
    // frames는 rAF 프레임 총수. 0이면 setInterval 루프라 FPS를 셀 수 없다.
    frames: idleLast.frames,
    // 입력 단계의 길이와 표본 간격. gates.js가 이 둘로 평균 생존시간을 보정해 계산한다.
    inputMs: T.inputMs,
    sampleMs: T.sampleMs,
    avgFps, fpsWindows: fpsWindows.length ? fpsWindows : [avgFps],
    // idleFps는 진단용이다 — 게이트는 읽지 않는다.
    idleFps,
    heap: { start: heapStart, end: heapEnd, precise: heapPrecise && heapStart > 0 && heapEnd > 0 },
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

const browser = await chromium.launch({ args: HEAP_ARGS });

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

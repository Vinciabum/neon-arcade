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
import { checkTech, checkPlay, TECH, PLAY } from './gates.js';
import { diff, variance } from './framediff.js';
import { triggerStart } from './start.js';

// 게이트 1의 기준 뷰포트는 gates.js가 소유한다 — 에러 메시지도 같은 값을 쓰므로 여기서 다시 적지 않는다.
const MOBILE = TECH.MOBILE_VIEWPORT;
const DESKTOP = { width: 900, height: 600 };

// targetMs는 대상 하나에 허용하는 총 시간. 동기 루프에 걸려 영원히 매달리는 것을 막는다.
const FULL = { inputMs: 30_000, idleMs: 20_000, sampleMs: 500, windowMs: 5_000, targetMs: 180_000 };
const QUICK = { inputMs: 8_000, idleMs: 8_000, sampleMs: 400, windowMs: 2_000, targetMs: 60_000 };

// 이 플래그 없이는 Chromium이 usedJSHeapSize를 큰 단위로 뭉개서 준다 (실측: 정확히 10000000).
// 플래그를 '요청'했다는 것만 알 수 있고 브라우저가 실제로 반영했는지는 확인할 방법이 없다.
// 그래서 heap.precise는 "요청했고 읽은 값이 0이 아니다"라는 뜻이다 — 그 이상을 주장하지 않는다.
const HEAP_ARGS = ['--enable-precise-memory-info'];

// goto·screenshot·locator 동작에 걸리는 상한. page.evaluate에는 timeout 옵션이 없어서
// (Playwright는 { exposeFunctions }만 받는다) 동기 루프에 걸린 evaluate는 이걸로 못 끊는다 —
// 그건 대상별 마감(T.targetMs)이 막는다.
const PAGE_OP_MS = 15_000;
const heapPrecise = true;   // HEAP_ARGS로 launch하므로 요청은 항상 이뤄진다

// 키 순서는 고정이지만 재생 가능한 실행은 아니다: 누르는 시점·dt·'over'일 때 재시작하는 분기가
// 모두 벽시계에 의존한다. 같은 실패를 다시 만드는 것은 보장되지 않는다.
const INPUT_PATTERN = ['ArrowLeft', 'ArrowRight', 'Space', 'ArrowRight', 'ArrowLeft', 'KeyA', 'KeyD', 'ArrowUp'];

class UsageError extends Error {}

// 잘못된 인자는 조용히 다른 일을 하지 않고 즉시 멈춘다.
// 예전에는 `--json`에 값이 없으면 리포트가 그냥 사라지고, `--json cyber-snake`는
// 'cyber-snake'라는 파일을 쓴 뒤 전체 게임을 검증했다 — 둘 다 사용자가 의도한 일이 아니다.
function parseArgs(argv) {
  const opts = { quick: false, json: null, targets: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--quick') opts.quick = true;
    else if (a === '--json') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new UsageError(`--json needs a file path (got ${v ?? 'nothing'})`);
      opts.json = v;
    } else if (a.startsWith('--')) throw new UsageError(`unknown flag ${a}`);
    else opts.targets.push(a);
  }
  return opts;
}

const resolveTarget = (t) => t.endsWith('.html')
  ? { label: path.basename(t, '.html'), file: t }
  : { label: t, file: gamePath(t) };

// ---------- 게이트 1: 모바일 뷰포트에서 기술 검증 ----------
async function collectTech(browser, target) {
  const page = await browser.newPage({ viewport: MOBILE, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(PAGE_OP_MS);
  // 중간에 던져도 페이지는 반드시 닫는다. 남은 페이지는 rAF 루프를 계속 돌려 CPU를 먹고,
  // 그 결과 '다음' 게임의 fps가 게이트 밑으로 떨어져 엉뚱한 게임이 실패한다.
  try {
    return await collectTechOn(page, target);
  } finally {
    await page.close().catch(() => {});
  }
}

async function collectTechOn(page, target) {
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

  // 리스너 목록은 어떤 Playwright 상호작용보다 먼저 떠야 한다.
  // boundingBox()/click()이 hit-target 인터셉터를 심으면서 addEventListener로
  // touchstart·pointerdown 등을 등록하는데, 프로브는 그것을 게임이 등록한 것과 구분할 수 없다.
  // 실측: 키보드 전용 페이지가 boundingBox() 한 번에 touchstart를 갖게 됐다.
  const listeners = await page.evaluate(() => (window.__PROBE__?.listeners ?? []).slice());
  const listenersContaminated = listeners.includes('__playwright_global_listeners_check__');

  // 계약이 있으면 휴리스틱보다 계약으로 시작한다 — 게이트 1의 픽셀 지표는
  // state === 'playing' 에서만 의미가 있다 (타이틀·게임오버 화면은 분산이 낮고 해상도에 민감하다).
  const contract = await page.evaluate(() => {
    if (!window.__GAME__) return false;
    window.__GAME__.start();
    return true;
  });
  if (!contract) await triggerStart(page);
  // 900ms에는 화면에 오브젝트가 거의 없어 motion이 임계값에 걸린다.
  // 실측(390x844): 900ms에서 2.0, 3초에서 4.7 — 게임이 실제로 붐비는 시점에 찍는다.
  // 주의: 입력 없이 2.6초 안에 끝나는 게임은 게임오버 화면에서 찍힌다 (covered가 잡는다).
  await page.waitForTimeout(2200);

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
      // 시작 뒤 목록. 진단용이다 — 늦게 등록하는 게임이 JSON에서 보이도록 남긴다.
      listenersAfterStart: window.__PROBE__?.listeners ?? [],
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
    // 게이트가 보는 목록은 Playwright가 손대기 전의 스냅샷이다.
    listeners,
    listenersContaminated,
    listenersAfterStart: dom.listenersAfterStart,
    mobile: { scrollWidth: dom.scrollWidth, innerWidth: dom.innerWidth }
  };
  return report;
}

// ---------- 게이트 2: 데스크톱 뷰포트에서 자동 플레이 ----------
async function collectPlay(browser, target, T) {
  const page = await browser.newPage({ viewport: DESKTOP });
  page.setDefaultTimeout(PAGE_OP_MS);
  try {
    return await collectPlayOn(page, target, T);
  } finally {
    await page.close().catch(() => {});
  }
}

async function collectPlayOn(page, target, T) {
  await page.addInitScript({ content: PROBE_SOURCE });
  await page.goto(pathToFileURL(path.resolve(target.file)).href, { waitUntil: 'load' });
  await page.waitForTimeout(700);

  const api = await page.evaluate(() => (window.__GAME__ ? window.__GAME__.api : null));
  const mode = api === null ? 'legacy' : 'contract';

  const canvas = page.locator('canvas').first();
  const shotTarget = (await canvas.count()) > 0 ? canvas : page;

  // start()가 던지면 그것은 게임의 결함이다. 그대로 위로 올리면 "verify crashed"가 되어
  // 하네스를 탓하게 되므로, 게임 쪽 에러로 기록하고 수집을 계속한다.
  const startErrors = [];
  const safeStart = async (where) => {
    try {
      await page.evaluate(() => window.__GAME__.start());
    } catch (err) {
      const msg = `__GAME__.start() threw at ${where} — ${String(err.message).slice(0, 160)}`;
      if (!startErrors.includes(msg)) startErrors.push(msg);
    }
  };
  if (mode === 'contract') await safeStart('start');
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
    if (s.state === 'over') await safeStart('input-phase restart');
  }

  const afterInput = await shotTarget.screenshot().catch(() => null);
  // 촬영 실패는 0(=반응 없음)이 아니라 null(=측정 못 함)이다.
  const legacyDiff = beforeInput && afterInput ? Number((await diff(beforeInput, afterInput)).toFixed(1)) : null;

  // --- 방치 단계: 입력 없이 게임오버가 오는지 ---
  // 프레임 마크를 입력 단계와 따로 모은다. 죽은 뒤에는 step()을 건너뛰어 프레임이 싸지므로
  // 두 단계를 섞으면 무거운 게임의 fps가 플레이어가 겪지 않는 프레임으로 부풀려진다.
  if (mode === 'contract') await safeStart('idle-phase');
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
    await safeStart('restart-phase');
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
    // 게임 쪽 결함. main이 playErrors에 합쳐 실패로 센다.
    startErrors,
    heap: { start: heapStart, end: heapEnd, precise: heapPrecise && heapStart > 0 && heapEnd > 0 },
    scoreSamples, stateSamples, idle, restart,
    // legacyDiff는 휴리스틱 모드에서만 뜻이 있다. 계약 모드에서는 아예 넣지 않는다 —
    // 아무도 읽지 않는 숫자가 리포트에 있으면 읽는 사람이 의미를 상상하게 된다.
    ...(mode === 'legacy' ? { legacyDiff } : {})
  };
}

// ---------- main ----------
let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  if (!(err instanceof UsageError)) throw err;
  console.error(`verify: ${err.message}`);
  console.error('usage: node tools/verify.js [--quick] [--json <path>] [<slug|path.html> ...]');
  process.exit(2);
}
const T = opts.quick ? QUICK : FULL;

const targets = opts.targets.length
  ? opts.targets.map(resolveTarget)
  : JSON.parse(await readFile('games.json', 'utf8'))
      .filter(g => g.status === 'published' || g.status === 'demoted')
      .map(g => resolveTarget(g.slug));

const browser = await chromium.launch({ args: HEAP_ARGS });

// 브라우저 첫 페이지를 띄우는 비용만 미리 치른다. 대상 파일로 예열하면 안 된다 —
// 그러면 그 대상의 loadMs가 '캐시된 두 번째 로드'가 되어 실제보다 좋게 나온다.
// 실측: cyber-snake이 1번째 대상일 때 469ms, 2번째 대상일 때 3263ms (같은 파일·같은 실행).
// about:blank는 게임 파일을 캐시에 넣지 않으므로 각 게임의 파싱 비용은 그대로 측정된다.
{
  const warm = await browser.newPage();
  await warm.goto('about:blank').catch(() => {});
  await warm.close();
}

const reports = [];
let failed = 0;

// 동기 무한 루프를 도는 게임은 그냥 두면 verify를 영원히 붙잡고 크롬도 남는다.
// 대상마다 마감을 두고, 넘기면 그 대상만 포기하고 다음으로 간다.
const withDeadline = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms).unref())
]).catch((err) => { throw new Error(`${label}: ${err.message}`); });

async function verifyTarget(target) {
  const tech = await collectTech(browser, target);
  const techErrors = checkTech(tech);
  const play = await collectPlay(browser, target, T);
  const { errors: playErrors, skipped } = checkPlay(play);
  // 게임 쪽 start() 실패는 하네스 크래시가 아니라 게이트 2의 에러로 센다.
  return { tech, techErrors, play, playErrors: [...playErrors, ...(play.startErrors ?? [])], skipped };
}

try {
  for (const target of targets) {
    console.log(`\n== ${target.label} (${target.file})`);
    try {
      const { tech, techErrors, play, playErrors, skipped } =
        await withDeadline(verifyTarget(target), T.targetMs, target.label);

      console.log(`  mode ${play.mode}  load ${tech.loadMs}ms  fps ${play.avgFps}  variance ${tech.canvas.variance}  motion ${tech.canvas.motion}`);
      for (const s of skipped) console.log(`  ~ skipped: ${s}`);
      for (const e of [...techErrors, ...playErrors]) console.error(`  x ${e}`);

      if (!techErrors.length && !playErrors.length) console.log('  ok  gate 1 + gate 2 passed');
      else {
        // 실패한 대상만 진단값을 한 줄 더 찍는다. 이 값들이 없으면 왜 실패했는지 추적할 수 없다.
        const deaths = (play.stateSamples ?? []).filter(s => s === 'over').length;
        const ratio = play.heap?.start > 0 ? (play.heap.end / play.heap.start).toFixed(2) : 'n/a';
        console.error(`  ? state ${tech.canvas.state} covered ${tech.canvas.covered}` +
          ` captureFailed ${tech.canvas.captureFailed} idle ${play.idle?.ended}/${play.idle?.afterMs}ms` +
          ` deaths ${deaths} heap x${ratio} (precise ${play.heap?.precise}) restart ${play.restart?.state ?? 'n/a'}`);
        failed++;
      }

      reports.push({ target: target.label, file: target.file, crashed: null, tech, play, techErrors, playErrors, skipped });
    } catch (err) {
      console.error(`  x ${target.label}: verify crashed — ${err.message}`);
      reports.push({ target: target.label, file: target.file, crashed: err.message });
      failed++;
    }
  }
} finally {
  await browser.close().catch(() => {});
}

if (opts.json) {
  // 리포트는 스스로를 설명해야 한다 — 나중에 이 파일만 읽는 판정자가 임계값도 타이밍도 모른다.
  const out = { runAt: new Date().toISOString(), quick: opts.quick, timings: T, thresholds: { TECH, PLAY }, reports };
  await mkdir(path.dirname(path.resolve(opts.json)), { recursive: true });
  await writeFile(opts.json, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n  -> ${opts.json}`);
}

console.log(`\n${targets.length - failed}/${targets.length} passed.\n`);
if (failed) process.exit(1);

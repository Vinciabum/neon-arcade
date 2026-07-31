// 게이트 3의 입력 — 플레이 중 화면 10장.
// verify.js와 따로 두는 이유: verify는 판정 도구다. 거기에 캡처를 얹으면
// 측정 시간이 늘어 FPS 표본이 흔들린다 (계획 2a에서 확인한 함정).
import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { gamePath } from './paths.js';
import { clickStartButton, triggerStart } from './start.js';

const SHOTS = 10;
const SPAN_MS = 20_000;          // 이 시간에 걸쳐 고르게 찍는다
const SETTLE_MS = 700;

// 좌우를 번갈아 누르면 진행 방향을 180도 뒤집는 게임(뱀류)이 즉사한다.
// 시계 방향으로 90도씩 도는 순서는 어떤 게임에서도 자살 입력이 되지 않는다.
// 실측: 좌우 교대로 cyber-snake의 10장이 전부 게임오버 화면이었다.
const TURNS = ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown'];

// 화면을 두드릴 위치. 게임오버 오버레이의 버튼은 대개 화면 중앙~아래에 있어서
// 그 근처를 누르면 "로비로 나가기"를 눌러 게임을 떠나버린다. 위쪽을 두드린다.
const TAP = { x: 195, y: 240 };

export async function playshots(target, outDir) {
  const file = existsSync(target) ? target : gamePath(target);
  if (!existsSync(file)) throw new Error(`no such game: ${target}`);

  // 지난 실행의 잔재를 지운다. Windows에서 탐색기나 이미지 뷰어가 폴더를 잡고 있으면
  // EPERM이 나는데, 어차피 shot-01~10을 매번 덮어쓰므로 정리는 최선 노력으로 충분하다
  // (build.js가 games/ 를 지울 때와 같은 처리).
  await rm(outDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
    .catch((err) => console.warn(`  !  could not clear ${outDir} (${err.code}) — overwriting instead`));
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
      await page.keyboard.press(TURNS[i % TURNS.length]).catch(() => {});
      await page.mouse.click(TAP.x, TAP.y).catch(() => {});
      await page.waitForTimeout(gap);

      // 죽어 있으면 되살린다. 죽은 화면 10장은 심사에 쓸 수 없다.
      await page.evaluate(() => {
        if (window.__GAME__ && window.__GAME__.state === 'over') window.__GAME__.start();
      }).catch(() => {});

      // 계약이 없는 게임은 위 되살리기가 통하지 않는다 — 죽었는지 물어볼 데가 없다.
      // 화면 변화량으로 추정해봤지만 실패했다: 게임오버 화면에서도 먹이 하나가 깜빡이면
      // 변화량이 임계값을 넘어 "살아 있다"로 읽힌다.
      //
      // 대신 확실한 신호를 쓴다 — 재시작 버튼이 눈에 보이면 죽은 것이다.
      // 플레이 중에는 그런 버튼이 없으므로 이 호출은 아무 일도 하지 않는다.
      if (await clickStartButton(page)) {
        await page.waitForTimeout(SETTLE_MS);
      }

      const out = path.join(outDir, `shot-${String(i + 1).padStart(2, '0')}.png`);
      await writeFile(out, await page.screenshot());
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

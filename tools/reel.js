// 쇼츠용 9:16 세로 영상. 사용: node tools/reel.js <슬러그> [--auto]
//
// 사람이 직접 플레이하는 것을 녹화한다. 자동 조작으로 찍지 않는 이유는 커버에서 이미 겪었다 —
// 아무도 조작하지 않으면 화면이 실패 피드백으로 덮인다. 지는 판을 15초 내내 보여주는
// 영상은 없느니만 못하다. `--auto`는 도구가 도는지 확인하는 용도이지 발행용이 아니다.
//
// 소리: Playwright 녹화에는 오디오가 없다. 무음 쇼츠는 사실상 죽은 영상이라,
// 게임 파일의 SONG을 그대로 읽어 같은 곡을 WAV로 합성해 입힌다.
//
// ⚠ 합성 수식(포락선·베이스 배치)은 게임 안의 BGM과 따로 적혀 있다. 값(SONG)은 게임에서
//   읽으므로 곡이 바뀌면 따라오지만, 수식을 게임 쪽에서 고치면 여기도 같이 고쳐야 한다.
//   tests/reel.test.js 가 두 곳의 상수가 어긋나면 잡는다.
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { gamePath } from './paths.js';

const run = promisify(execFile);
export const REEL_DIR = 'dist/reel';

// 9:16.
//
// 녹화 크기는 반드시 뷰포트와 같아야 한다. Playwright는 recordVideo.size에 맞춰 페이지를
// 확대하지 않고 **남는 자리를 회색으로 채운다** — 540 뷰포트에 1080 녹화를 걸었더니
// 영상의 4분의 1에만 게임이 있고 나머지가 회색이었다. 확대는 ffmpeg가 한다.
//
// 720x1280은 사람이 플레이할 창이 화면(2560x1440)에 들어가는 최대치다.
// deviceScaleFactor를 올리면 창이 물리적으로 그만큼 커져서 화면 밖으로 나간다 — 쓰지 않는다.
const VIEW = { width: 720, height: 1280 };
const VIDEO = { width: 1080, height: 1920 };
const MAX_MS = 75_000;     // 이보다 길면 쇼츠로 못 쓴다. 알아서 끊는다
const MIN_MS = 6_000;      // 이보다 짧으면 영상이라 할 게 없다

// 게임 안 BGM과 같은 값. 하나라도 게임 쪽에서 바뀌면 소리가 어긋난다.
const NOTE_RATIO = 0.85;   // 음 길이 = beat * 이것
const BASS_EVERY = 4;      // 몇 박마다 베이스
const BASS_RATIO = 3.2;    // 베이스 길이 = beat * 이것
const LEAD_VOL = 0.018;
const BASS_VOL = 0.026;
const ATTACK = 0.02;
const RATE = 44100;

/* ---------- 게임 파일에서 곡을 읽는다 ---------- */
export function parseSong(html) {
  const block = html.match(/const SONG = \{([\s\S]*?)\};/);
  if (!block) throw new Error('SONG을 못 찾았다 — 이 게임에는 BGM이 없다');
  const body = block[1];
  const num = (k) => {
    const m = body.match(new RegExp(`${k}:\\s*([\\d.]+)`));
    if (!m) throw new Error(`SONG.${k} 없음`);
    return Number(m[1]);
  };
  const wave = body.match(/wave:\s*'(\w+)'/);
  const pat = body.match(/pattern:\s*\[([^\]]*)\]/);
  if (!wave || !pat) throw new Error('SONG.wave 또는 pattern 없음');
  return {
    root: num('root'),
    beat: num('beat'),
    wave: wave[1],
    pattern: pat[1].split(',').map(s => s.trim()).map(s => (s === 'null' ? null : Number(s)))
  };
}

/* ---------- 같은 곡을 WAV로 합성한다 ---------- */
function wave(type, phase) {
  const t = phase % 1;
  if (type === 'sine') return Math.sin(2 * Math.PI * t);
  if (type === 'square') return t < 0.5 ? 1 : -1;
  if (type === 'triangle') return 4 * Math.abs(t - 0.5) - 1;
  return Math.sin(2 * Math.PI * t);       // 모르는 파형은 사인으로 떨어진다
}

export function renderSong(song, seconds) {
  const n = Math.ceil(seconds * RATE);
  const buf = new Float32Array(n);

  const add = (freq, at, dur, type, vol) => {
    const start = Math.floor(at * RATE);
    const len = Math.floor((dur + ATTACK) * RATE);
    for (let i = 0; i < len; i++) {
      const j = start + i;
      if (j < 0 || j >= n) continue;
      const t = i / RATE;
      // 게임 쪽 포락선과 같은 모양: 짧은 램프로 올리고 지수로 떨어뜨린다.
      const env = t < ATTACK
        ? (t / ATTACK) * vol
        : vol * Math.pow(0.0001 / vol, Math.min(1, (t - ATTACK) / dur));
      buf[j] += wave(type, freq * t) * env;
    }
  };

  let at = 0.1, step = 0;
  while (at < seconds) {
    const i = step % song.pattern.length;
    const semi = song.pattern[i];
    if (semi !== null) add(song.root * Math.pow(2, semi / 12), at, song.beat * NOTE_RATIO, song.wave, LEAD_VOL);
    if (i % BASS_EVERY === 0) add(song.root / 2, at, song.beat * BASS_RATIO, 'triangle', BASS_VOL);
    at += song.beat;
    step++;
  }

  // 게임 안에서는 효과음 아래 깔리라고 아주 작게 잡혀 있다. 영상에서는 그게 안 들린다.
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.72 / peak : 1;

  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, buf[i] * gain));
    pcm.writeInt16LE(Math.round(s * 32767), i * 2);
  }

  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);        // PCM
  head.writeUInt16LE(1, 22);        // 모노
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

/* ---------- CLI ----------
   직접 실행했을 때만 돈다. portal.js가 이미 적어둔 함정이다 — 감싸지 않으면
   테스트가 import하는 순간 브라우저가 뜨고 process.exit까지 불러 테스트가 통째로 죽는다.
   (이번에도 그대로 밟았다.) */
async function main() {
const args = process.argv.slice(2);
const auto = args.includes('--auto');
const slug = args.find(a => !a.startsWith('--'));
if (!slug) {
  console.error('사용: node tools/reel.js <슬러그> [--auto]');
  process.exit(1);
}

const html = await readFile(gamePath(slug), 'utf8');
const song = parseSong(html);

const dir = path.join(REEL_DIR, slug);
await rm(dir, { recursive: true, force: true }).catch(() => {});
await mkdir(dir, { recursive: true });

const browser = await chromium.launch({ headless: auto });
const ctx = await browser.newContext({
  viewport: VIEW,
  recordVideo: { dir, size: VIEW }
});
const page = await ctx.newPage();
await page.goto(pathToFileURL(path.resolve(gamePath(slug))).href, { waitUntil: 'load' });

const t0 = Date.now();
if (auto) {
  await page.click('#startBtn');
} else {
  console.log('');
  console.log(`  ${slug} — 창이 열렸다. 직접 플레이한다.`);
  console.log('  게임이 끝나면 자동으로 멈추고 mp4를 만든다 (최대 75초).');
  console.log('');
}

// 판이 시작된 시점을 잡는다. 영상은 여기서부터 잘라야 타이틀 화면이 안 들어간다.
await page.waitForFunction(() => window.__GAME__.state === 'playing', null, { timeout: MAX_MS })
  .catch(() => { throw new Error('플레이가 시작되지 않았다'); });
const tPlay = Date.now();

await page.waitForFunction(() => window.__GAME__.state === 'over', null, { timeout: MAX_MS })
  .catch(() => {});
const tEnd = Date.now();

const score = await page.evaluate(() => window.__GAME__.score).catch(() => 0);
await ctx.close();          // 이걸 해야 webm이 파일로 떨어진다
await browser.close();

const webm = (await readdir(dir)).find(f => f.endsWith('.webm'));
if (!webm) throw new Error('녹화 파일이 없다');

const startAt = (tPlay - t0) / 1000;
const dur = Math.max(MIN_MS, Math.min(MAX_MS, tEnd - tPlay)) / 1000;

const wav = path.join(dir, 'bgm.wav');
await writeFile(wav, renderSong(song, dur + 0.4));

const out = path.join(dir, `${slug}-reel.mp4`);
await run('ffmpeg', [
  '-y',
  '-ss', String(startAt), '-t', String(dur), '-i', path.join(dir, webm),
  '-i', wav,
  '-map', '0:v', '-map', '1:a',
  '-vf', `scale=${VIDEO.width}:${VIDEO.height}:flags=lanczos,fps=30`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k',
  '-shortest', '-movflags', '+faststart',
  out
]);

console.log(`ok   ${slug} -> ${out}`);
console.log(`     ${dur.toFixed(1)}초 · 점수 ${score} · ${song.wave} ${song.beat}s/박`);
if (auto) console.log('     ⚠ --auto 로 찍었다. 아무도 조작하지 않은 판이라 발행용이 아니다.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();

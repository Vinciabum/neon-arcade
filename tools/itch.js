// itch.io 업로드 준비물을 게임 하나당 폴더 하나로 만든다.
// 사용: node tools/itch.js <슬러그> [슬러그 ...]
//
// itch는 프로젝트 페이지 생성과 발행이 웹 UI에서만 된다. 그래서 이 도구는 발행하지 않고,
// 사람이 그 화면에서 복사해 넣을 것을 전부 만들어둔다 — zip · 커버 · 스크린샷 · 칸별 값.
//
// zip 규격: index.html 이 zip 루트에 있어야 한다(하위 폴더 안이면 안 열린다).
// 우리 게임은 자체완결 단일 파일이라 담을 게 그것 하나뿐이다.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { deflateRawSync, crc32 } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { gamePath, landingUrl, absUrl } from './paths.js';
import { triggerStart } from './start.js';

export const ITCH_DIR = 'dist/itch';

// itch 권장 커버 규격. 세로 게임을 가로 틀에 넣는 문제는 플레이 밴드가 이미 풀어준다 —
// 가로 창에서 게임이 가운데 서고 양옆을 게임 자신의 풀블리드 배경이 채우므로 합성이 필요 없다.
const COVER = { width: 630, height: 500 };
// 캔버스가 정확히 630:500이 되는 뷰포트. HUD가 38px를 가져간다.
const COVER_VIEWPORT = { width: 1260, height: 1038 };
// 커버는 이르게 잡는다. 아무도 조작하지 않으므로 시간이 지날수록 실패 피드백이 화면을
// 덮는다 — 1800ms에서 pulse-lock 커버에 빨간 "MISSED"가 박혔다. 상점 대문에 걸 그림이 아니다.
const COVER_AT_MS = 1000;
// 스크린샷은 세로로 찍는다. 실제로 사람이 보게 될 모양이 그쪽이다.
const SHOT_VIEWPORT = { width: 600, height: 838 };
const SHOT_AT_MS = [1400, 2600, 4200];

/* ---------- 최소 ZIP 작성기 ----------
   의존성을 늘리지 않는다. 이 리포는 dependencies가 비어 있고 그게 자산이다.
   node:zlib의 deflateRaw가 곧 zip의 압축 방식(method 8)이라 그대로 쓴다. */
function zipOne(name, data) {
  const nameBuf = Buffer.from(name, 'utf8');
  const body = deflateRawSync(data, { level: 9 });
  const sum = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);   // 로컬 헤더 서명
  local.writeUInt16LE(20, 4);           // 필요 버전 2.0
  local.writeUInt16LE(0, 6);            // 플래그
  local.writeUInt16LE(8, 8);            // deflate
  local.writeUInt16LE(0, 10);           // 시각 — 0으로 고정해 재현 가능하게 둔다
  local.writeUInt16LE(0x21, 12);        // 날짜 1980-01-01 (0은 일부 도구가 싫어한다)
  local.writeUInt32LE(sum, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);         // 만든 버전
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(sum, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);         // extra
  central.writeUInt16LE(0, 32);         // comment
  central.writeUInt16LE(0, 34);         // disk
  central.writeUInt16LE(0, 36);         // 내부 속성
  central.writeUInt32LE(0, 38);         // 외부 속성
  central.writeUInt32LE(0, 42);         // 로컬 헤더 오프셋 — 항목이 하나라 0이다

  const centralSize = central.length + nameBuf.length;
  const centralOffset = local.length + nameBuf.length + body.length;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);              // 이 디스크의 항목 수
  end.writeUInt16LE(1, 10);             // 전체 항목 수
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([local, nameBuf, body, central, nameBuf, end]);
}

/* ---------- 캡처 ---------- */
async function capture(browser, slug, viewport, times) {
  const page = await browser.newPage({ viewport });
  await page.goto(pathToFileURL(path.resolve(gamePath(slug))).href, { waitUntil: 'load' });
  await page.waitForTimeout(700);

  const canvas = page.locator('canvas').first();
  const target = (await canvas.count()) > 0 ? canvas : page;
  await triggerStart(page);

  const shots = [];
  let prev = 0;
  for (const at of times) {
    await page.waitForTimeout(at - prev);
    prev = at;
    // 게임이 끝나 있으면 게임오버 화면을 찍게 된다. 다시 시작시킨다.
    const over = await page.evaluate(() => window.__GAME__ && window.__GAME__.state === 'over')
      .catch(() => false);
    if (over) { await triggerStart(page); await page.waitForTimeout(600); }
    shots.push(await target.screenshot());
  }
  await page.close();
  return shots;
}

/* ---------- itch 칸별 값 ---------- */
function uploadSheet(game) {
  const tags = [game.tag, game.mechanics?.input, game.mechanics?.goal, 'html5', 'arcade']
    .filter(Boolean)
    .map(t => String(t).toLowerCase().replace(/[_\s]+/g, '-'));

  const body = [
    game.description,
    '',
    '## How to play',
    ...game.howToPlay.map(s => `- ${s}`),
    '',
    '## Controls',
    `- Keyboard: ${game.controls.keyboard}`,
    `- Touch: ${game.controls.touch}`,
    ...(game.tips?.length ? ['', '## Tips', ...game.tips.map(t => `- ${t}`)] : []),
    '',
    'No ads, no sign-up, no download. Runs in the browser on desktop and mobile.'
  ].join('\n');

  return `# ${game.title} — itch.io 업로드 값

아래를 itch의 새 프로젝트 화면(https://itch.io/game/new)에 그대로 옮긴다.

| 칸 | 넣을 값 |
|---|---|
| Title | ${game.title} |
| Short description | ${game.tagline} |
| Classification | Games |
| Kind of project | **HTML** |
| Release status | Released |
| Pricing | No payments (무료) |
| Uploads | \`${game.slug}.zip\` → 올린 뒤 **"This file will be played in the browser" 체크** |
| Embed options | Embed in page · Width **600** · Height **838** |
| | **Fullscreen button** 켜기 · **Mobile friendly** 켜기 |
| Cover image | \`cover.png\` (630x500) |
| Screenshots | \`shot-1.png\` · \`shot-2.png\` · \`shot-3.png\` |
| Genre | ${game.tag} |
| Tags | ${tags.join(', ')} |
| Links | ${absUrl(landingUrl(game.slug))} |
| Visibility | Public (준비되면) |

## Description 칸에 넣을 본문

\`\`\`
${body}
\`\`\`

> 임베드 크기 600x838은 캔버스가 정확히 3:4가 되는 값이다(HUD 38px 포함).
> 더 넓게 잡아도 플레이 밴드가 게임을 가운데로 잡아주므로 깨지지는 않는다.
`;
}

/* ---------- 실행 ---------- */
const all = JSON.parse(await readFile('games.json', 'utf8'));
const args = process.argv.slice(2);
if (!args.length) {
  console.error('슬러그를 지정한다: node tools/itch.js pulse-lock null-cascade ...');
  process.exit(1);
}

const picked = args.map(slug => {
  const g = all.find(x => x.slug === slug);
  if (!g) { console.error(`no such game: ${slug}`); process.exit(1); }
  return g;
});

const browser = await chromium.launch();
const done = [];

for (const game of picked) {
  const dir = path.join(ITCH_DIR, game.slug);
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  await mkdir(dir, { recursive: true });

  const html = await readFile(gamePath(game.slug));
  await writeFile(path.join(dir, `${game.slug}.zip`), zipOne('index.html', html));

  const [coverRaw] = await capture(browser, game.slug, COVER_VIEWPORT, [COVER_AT_MS]);
  await sharp(coverRaw)
    .resize(COVER.width, COVER.height, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(path.join(dir, 'cover.png'));

  const shots = await capture(browser, game.slug, SHOT_VIEWPORT, SHOT_AT_MS);
  for (const [i, raw] of shots.entries()) {
    await sharp(raw).png().toFile(path.join(dir, `shot-${i + 1}.png`));
  }

  await writeFile(path.join(dir, 'UPLOAD.md'), uploadSheet(game), 'utf8');
  console.log(`ok   ${game.slug} -> ${dir}`);
  done.push(game);
}

await browser.close();

const index = `# itch.io 업로드 — 순서

계정에 첫날부터 쏟지 않는다. 위에서부터 하나씩, 하나 올리고 화면을 확인한 뒤 다음으로 간다.

${done.map((g, i) => `${i + 1}. **${g.title}** — \`${ITCH_DIR}/${g.slug}/UPLOAD.md\``).join('\n')}

## 매번 같은 절차

1. https://itch.io/game/new
2. \`UPLOAD.md\`의 표를 위에서부터 채운다
3. zip을 올리고 **"This file will be played in the browser"를 체크한다** — 이걸 빼면
   플레이가 아니라 다운로드 링크가 된다
4. Save & view page → 실제로 플레이해본다 (소리·모바일 폭까지)
5. 문제 없으면 Visibility를 Public으로

## 확인할 것

- 브라우저에서 소리가 나는가 (BGM은 시작 버튼을 누른 뒤부터 난다)
- 폰 폭에서 HUD가 넘치지 않는가
- 게임 안에 밖으로 나가는 링크가 없다 — itch에서는 문제없지만 포털 규정이라 그대로 뒀다
`;
await writeFile(path.join(ITCH_DIR, 'README.md'), index, 'utf8');
console.log(`\n${done.length}개 준비됨 -> ${ITCH_DIR}/  (순서는 ${ITCH_DIR}/README.md)`);

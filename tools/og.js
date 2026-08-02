// 공유 카드(1200x630) 생성기. 썸네일에서 만든다.
//
// 썸네일을 그대로 og:image로 쓰지 않는 이유가 둘 있다.
//  - 600x400은 트위터·슬랙·카톡에서 큰 카드 기준(최소 1200x630)에 못 미쳐 작은 카드로 떨어진다.
//  - WebP를 읽지 못하는 크롤러가 아직 있다. PNG로 낸다.
//
// shoot.js와 같은 로컬 도구다 — CI는 커밋된 결과물을 쓴다. CI에 폰트를 깔지 않아도 되도록.
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { thumbPath, ogPath } from './paths.js';

const W = 1200;
const H = 630;

// 썸네일의 비율. shoot.js의 WIDTH/HEIGHT와 같아야 한다 —
// 어긋나면 오른쪽 세로 카드에서 게임이 잘린다.
const WIDTH_RATIO_W = 3;
const WIDTH_RATIO_H = 4;

const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

// 제목이 길면 카드 밖으로 나간다. 대략적인 글자폭으로 두 줄까지 접는다.
function wrap(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [''];
  for (const word of words) {
    const line = lines[lines.length - 1];
    if (!line) lines[lines.length - 1] = word;
    else if ((line + ' ' + word).length <= maxChars) lines[lines.length - 1] = line + ' ' + word;
    else lines.push(word);
  }
  return lines.slice(0, 2);
}

function overlaySvg(title, tag) {
  const lines = wrap(title, 18);
  const titleSvg = lines
    .map((line, i) => `<text x="72" y="${lines.length === 1 ? 348 : 306 + i * 76}" class="t">${escapeXml(line)}</text>`)
    .join('');

  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#05060a" stop-opacity="0.92"/>
      <stop offset="55%" stop-color="#05060a" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#05060a" stop-opacity="0"/>
    </linearGradient>
    <style>
      .t { font-family: 'Segoe UI', 'DejaVu Sans', sans-serif; font-size: 68px; font-weight: 700; fill: #ffffff; }
      .tag { font-family: 'Segoe UI', 'DejaVu Sans', sans-serif; font-size: 26px; font-weight: 700; fill: #00e5ff; letter-spacing: 3px; }
      .site { font-family: 'Segoe UI', 'DejaVu Sans', sans-serif; font-size: 28px; font-weight: 700; fill: #8ea3b8; letter-spacing: 2px; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <rect x="72" y="200" width="64" height="6" fill="#00e5ff"/>
  <text x="72" y="242" class="tag">${escapeXml(String(tag).toUpperCase())}</text>
  ${titleSvg}
  <text x="72" y="452" class="site">JUST1GAME.COM</text>
</svg>`);
}

export async function makeOg(slug, title, tag) {
  const src = thumbPath(slug);
  if (!existsSync(src)) throw new Error(`no thumbnail at ${src} — run: npm run shoot -- ${slug}`);

  // 썸네일이 3:4가 되면서 1200x630에 cover로 넣으면 게임의 위아래가 잘려 나간다.
  // 그래서 두 겹으로 쌓는다: 흐린 확대본이 카드를 채우고(빈 곳을 없앤다),
  // 그 위에 선명한 세로 카드를 오른쪽에 높이 꽉 맞춰 놓고, 왼쪽은 글자판으로 쓴다.
  const thumb = await readFile(src);
  const artW = Math.round((H * WIDTH_RATIO_W) / WIDTH_RATIO_H);   // 3:4를 높이에 맞춘 폭

  const base = await sharp(thumb)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .blur(26)
    .modulate({ brightness: 0.5, saturation: 1.1 })
    .toBuffer();

  const art = await sharp(thumb)
    .resize(artW, H, { fit: 'cover', position: 'centre' })
    .modulate({ saturation: 1.1 })
    .toBuffer();

  const out = ogPath(slug);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(base)
    .composite([
      { input: art, top: 0, left: W - artW },
      { input: overlaySvg(title, tag), top: 0, left: 0 }
    ])
    .png({ compressionLevel: 9, palette: true })
    .toFile(out);

  return out;
}

// --- CLI ---
const args = process.argv.slice(2);
const games = JSON.parse(await readFile('games.json', 'utf8'))
  .filter(g => g.status === 'published' || g.status === 'demoted')
  .filter(g => (args.length ? args.includes(g.slug) : true));

if (!games.length) {
  console.error(args.length ? `no published game matches: ${args.join(', ')}` : 'no published games');
  process.exit(1);
}

let failed = 0;
for (const game of games) {
  try {
    const out = await makeOg(game.slug, game.title, game.tag);
    console.log(`ok   ${game.slug} -> ${out}`);
  } catch (err) {
    console.error(`x    ${game.slug}: ${err.message}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);

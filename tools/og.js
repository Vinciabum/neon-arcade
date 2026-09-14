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
import { fileURLToPath } from 'node:url';
import { thumbPath, ogPath } from './paths.js';

const W = 1200;
const H = 630;

// 썸네일의 비율. shoot.js의 WIDTH/HEIGHT와 같아야 한다 —
// 어긋나면 오른쪽 세로 카드에서 게임이 잘린다.
const WIDTH_RATIO_W = 3;
const WIDTH_RATIO_H = 4;

/* 카드 색을 게임에서 가져온다.
   예전에는 왼쪽 글자판이 항상 #05060a(거의 검정)에 청록 강조였다. 네온 게임 19개에는
   맞았지만, 크림색 펠트 게임의 카드가 절반은 검정으로 나가서 공유 링크만 보고는 다른
   게임처럼 보였다. 썸네일의 대표색을 어둡게 눌러 쓰면 모든 게임이 자기 색을 갖는다. */
const mix = (c, t, k) => ({
  r: Math.round(c.r + (t.r - c.r) * k),
  g: Math.round(c.g + (t.g - c.g) * k),
  b: Math.round(c.b + (t.b - c.b) * k)
});
const hex = (c) => '#' + [c.r, c.g, c.b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
// 흰 글씨가 얹히는 판이라 상대 휘도가 충분히 낮아야 한다. WCAG 계수를 그대로 쓴다.
const luma = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;

export function cardColors(dominant) {
  const BLACK = { r: 5, g: 6, b: 10 };
  const WHITE = { r: 255, g: 255, b: 255 };

  /* 밝은 게임을 억지로 검게 누르면 카드가 게임과 다른 물건이 된다. 파스텔 게임은
     밝은 판에 어두운 글씨로 뒤집는다 — 이쪽이 게임 화면과 같은 인상이 되고,
     대비는 글씨색을 반대로 가져가므로 오히려 더 벌어진다. */
  if (luma(dominant) > 0.45) {
    let shade = mix(dominant, WHITE, 0.58);
    while (luma(shade) < 0.74) shade = mix(shade, WHITE, 0.3);
    return {
      shade: hex(shade),
      ink: hex(mix(dominant, BLACK, 0.86)),
      accent: hex(mix(dominant, BLACK, 0.62)),
      site: hex(mix(dominant, BLACK, 0.48)),
      baseBrightness: 1.02
    };
  }

  let shade = mix(dominant, BLACK, 0.80);
  while (luma(shade) > 0.16) shade = mix(shade, BLACK, 0.35);
  return {
    shade: hex(shade),
    ink: '#ffffff',
    accent: hex(mix(dominant, WHITE, 0.45)),
    site: hex(mix(dominant, WHITE, 0.62)),
    baseBrightness: 0.5
  };
}

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

function overlaySvg(title, tag, colors) {
  const lines = wrap(title, 18);
  const titleSvg = lines
    .map((line, i) => `<text x="72" y="${lines.length === 1 ? 348 : 306 + i * 76}" class="t">${escapeXml(line)}</text>`)
    .join('');

  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${colors.shade}" stop-opacity="0.94"/>
      <stop offset="55%" stop-color="${colors.shade}" stop-opacity="0.76"/>
      <stop offset="100%" stop-color="${colors.shade}" stop-opacity="0"/>
    </linearGradient>
    <style>
      .t { font-family: 'Segoe UI', 'DejaVu Sans', sans-serif; font-size: 68px; font-weight: 700; fill: ${colors.ink}; }
      .tag { font-family: 'Segoe UI', 'DejaVu Sans', sans-serif; font-size: 26px; font-weight: 700; fill: ${colors.accent}; letter-spacing: 3px; }
      .site { font-family: 'Segoe UI', 'DejaVu Sans', sans-serif; font-size: 28px; font-weight: 700; fill: ${colors.site}; letter-spacing: 2px; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <rect x="72" y="200" width="64" height="6" fill="${colors.accent}"/>
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
  const { dominant } = await sharp(thumb).stats();
  const colors = cardColors(dominant);

  const base = await sharp(thumb)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .blur(26)
    .modulate({ brightness: colors.baseBrightness, saturation: 1.1 })
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
      { input: overlaySvg(title, tag, colors), top: 0, left: 0 }
    ])
    .png({ compressionLevel: 9, palette: true })
    .toFile(out);

  return out;
}

// --- CLI ---
// 직접 실행할 때만 돈다. 예전에는 모듈을 읽는 것만으로 카드 20장을 다시 만들고
// process.exit을 불렀다 — 테스트가 이 파일에서 함수 하나를 가져오는 순간 테스트 러너가
// 통째로 죽는다는 뜻이다.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
}

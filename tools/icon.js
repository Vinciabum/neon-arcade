// 파비콘·앱 아이콘 PNG 생성기. 원본은 assets/icon.svg 하나다.
//
// SVG만으로 끝내지 않는 이유:
//  - iOS 홈 화면은 apple-touch-icon PNG만 읽는다. SVG를 주면 흰 사각형이 된다
//  - 구조화 데이터의 Organization.logo 는 크롤러가 실제로 받아 쓰는 그림이라
//    래스터가 있어야 안전하다
//
// og.js·shoot.js와 같은 로컬 도구다. CI는 커밋된 PNG를 쓴다.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ICON_SRC = 'assets/icon.svg';

// 32는 브라우저 탭, 180은 iOS 홈 화면, 512는 안드로이드·구조화 데이터용.
export const ICON_SIZES = [32, 180, 512];

export const iconPath = (size) => path.join('assets', `icon-${size}.png`);

export async function buildIcons(src = ICON_SRC) {
  if (!existsSync(src)) throw new Error(`no icon source at ${src}`);
  const svg = await readFile(src);
  const made = [];
  for (const size of ICON_SIZES) {
    // 픽셀 그림이라 보간하면 뭉개진다. nearest로 확대해야 가장자리가 살아 있다 —
    // 게임 안에서 imageSmoothingEnabled=false 를 켜는 것과 같은 이유다.
    const png = await sharp(svg, { density: 384 })
      .resize(size, size, { kernel: 'nearest' })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const out = iconPath(size);
    await writeFile(out, png);
    made.push({ out, bytes: png.length });
  }
  return made;
}

async function main() {
  for (const { out, bytes } of await buildIcons()) {
    console.log(`ok   ${out}  ${(bytes / 1024).toFixed(1)}KB`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();

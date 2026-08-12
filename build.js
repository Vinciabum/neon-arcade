import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { validateGames, validateOutput } from './tools/validate.js';
import { fill, esc } from './tools/render.js';
import { ICON_SRC, ICON_SIZES, iconPath } from './tools/icon.js';
import { gamePath, thumbPath, ogPath, landingUrl, landingOutPath, absUrl, SITE_ORIGIN } from './tools/paths.js';
import { homeJsonLd, landingJsonLd, faqSection, headTags, validateSeo, SITE_NAME } from './tools/seo.js';
import { shareBlock, SHARE_SCRIPT } from './tools/share.js';

const SITE_TITLE = 'Neon Arcade — Free Original Browser Games';
const SITE_DESC = 'Play original HTML5 arcade games free in your browser. No download, no sign-up, works on mobile and desktop.';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? 'hello@just1game.com';

// Search Console 확인 토큰. DNS TXT 형식(`google-site-verification=...`)을 그대로
// 붙여넣어도 되도록 접두사를 벗겨낸다.
const VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION
  ? `<meta name="google-site-verification" content="${process.env.GOOGLE_SITE_VERIFICATION.trim().replace(/^google-site-verification=/, '')}">`
  : '';

// preconnect가 먼저 와야 태그 요청이 DNS·TLS를 기다리지 않는다.
const ANALYTICS = process.env.GA_ID
  ? `<link rel="preconnect" href="https://www.googletagmanager.com">
<script async src="https://www.googletagmanager.com/gtag/js?id=${process.env.GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${process.env.GA_ID}');</script>`
  : '';

// AdSense. 리포 변수 ADSENSE_CLIENT(ca-pub-…)가 있을 때만 나간다 — GA와 같은 방식이라
// 코드에는 아무 값도 남지 않는다.
//
// 게임 본체(play/*.html)에는 절대 넣지 않는다. 이유가 셋이다.
//  - 게임 본체는 외부 스크립트를 하나도 싣지 않는다 (tools/portal.js 참고)
//  - 같은 파일이 포털 납품본이 된다. 포털 광고와 애드센스가 한 화면에 겹친다
//  - 광고 스크립트는 차단기·네트워크에 따라 실패하고, 게이트 1이 그걸 콘솔 에러로 잡는다
const ADSENSE_CLIENT = process.env.ADSENSE_CLIENT?.trim() ?? '';
if (ADSENSE_CLIENT && !/^ca-pub-\d{16}$/.test(ADSENSE_CLIENT)) {
  console.error(`\nBUILD FAILED — ADSENSE_CLIENT 형식이 아니다: ${ADSENSE_CLIENT}`);
  console.error('  ca-pub- 뒤에 숫자 16자리여야 한다 (애드센스 계정 화면의 게시자 ID)\n');
  process.exit(1);
}
const ADSENSE = ADSENSE_CLIENT
  ? `<link rel="preconnect" href="https://pagead2.googlesyndication.com">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>`
  : '';

const die = (errors) => {
  console.error('\nBUILD FAILED — validation gate:\n');
  for (const e of errors) console.error(`  x ${e}`);
  console.error('');
  process.exit(1);
};

const readTemplate = (name) => readFile(path.join('templates', name), 'utf8');

async function write(outPath, html) {
  const errors = [...validateOutput(html, outPath), ...validateSeo(html, outPath)];
  if (errors.length) die(errors);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');
  console.log(`  -> ${outPath}`);
}

// 카드 전체가 링크다. onclick만 걸면 크롤러가 따라갈 링크가 없고,
// 키보드로도 열 수 없다 — 홈에서 랜딩으로 가는 유일한 경로가 본문 목록뿐이 된다.
function card(game) {
  return `      <article class="card">
        <a class="card-link" href="${landingUrl(game.slug)}">
          <div class="card-thumb">
            <img src="/${thumbPath(game.slug)}" alt="${esc(game.title)} gameplay screenshot" width="480" height="640" loading="lazy" decoding="async">
          </div>
          <div class="card-content">
            <div class="card-tag">${esc(game.tag)}</div>
            <div class="card-title">Play ${esc(game.title)}</div>
            <p class="card-desc">${esc(game.tagline)}</p>
          </div>
        </a>
      </article>`;
}

async function buildHome(games, templates) {
  const featured = games.find(g => g.featured) ?? games[0];
  const html = fill(templates.home, {
    HEAD: headTags({
      title: SITE_TITLE,
      description: SITE_DESC,
      canonical: `${SITE_ORIGIN}/`,
      ogImage: absUrl(`/${ogPath(featured.slug)}`)
    }),
    JSONLD: JSON.stringify(homeJsonLd(games)),
    ANALYTICS,
    ADSENSE,

    VERIFICATION,
    FEATURED_TITLE: esc(featured.title),
    FEATURED_TAGLINE: esc(featured.tagline),
    FEATURED_URL: landingUrl(featured.slug),
    CARDS: games.map(card).join('\n'),
    GAME_LIST: games.map(g =>
      `      <li><a href="${landingUrl(g.slug)}"><strong>${esc(g.title)}</strong></a> — ${esc(g.tagline)}</li>`
    ).join('\n')
  });
  await write('index.html', html);
}

async function buildLanding(game, games, templates) {
  const related = games.filter(g => g.slug !== game.slug).slice(0, 4);
  // 하루 한 판이 있는 게임인지 파일에서 직접 본다. games.json에 또 적으면 어긋날 수 있고,
  // 어긋나면 기존 9개 랜딩이 없는 기능을 광고하게 된다.
  const daily = (await readFile(gamePath(game.slug), 'utf8')).includes('DAILY_NO');
  const tips = (game.tips ?? []).length
    ? `    <h2>Tips</h2>\n    <ul>\n${game.tips.map(t => `      <li>${esc(t)}</li>`).join('\n')}\n    </ul>\n`
    : '';

  const html = fill(templates.landing, {
    HEAD: headTags({
      title: `${game.title} — Free ${game.genreTerm} | ${SITE_NAME}`,
      ogTitle: `${game.title} — Free ${game.genreTerm}`,
      description: game.description,
      canonical: absUrl(landingUrl(game.slug)),
      ogImage: absUrl(`/${ogPath(game.slug)}`),
      ogType: 'article'
    }),
    TITLE: esc(game.title),
    TAGLINE: esc(game.tagline),
    DESCRIPTION: esc(game.description),
    GAME_SRC: `/${gamePath(game.slug)}`,
    JSONLD: JSON.stringify(landingJsonLd(game)),
    FAQ: faqSection(game),
    ANALYTICS,
    ADSENSE,

    VERIFICATION,
    HOW_TO_PLAY: game.howToPlay.map(s => `      <li>${esc(s)}</li>`).join('\n'),
    CONTROLS_KEYBOARD: esc(game.controls.keyboard),
    CONTROLS_TOUCH: esc(game.controls.touch),
    TIPS_BLOCK: tips,
    SHARE: shareBlock(game, { daily }),
    RELATED_CARDS: related.map(card).join('\n')
  });
  await write(landingOutPath(game.slug), html);
}

// 게임 본체는 색인 대상이 아니다. 랜딩 페이지가 canonical이다.
// robots.txt로 /play/를 막지는 않는다 — 막으면 크롤러가 이 noindex를 읽을 수 없고,
// 랜딩의 iframe 안(=게임 본체)이 통째로 보이지 않게 된다.
async function markGameNoindex(game) {
  const file = gamePath(game.slug);
  let html = await readFile(file, 'utf8');
  if (!html.includes('name="robots"')) {
    const inject = `<meta name="robots" content="noindex,follow">\n<link rel="canonical" href="${absUrl(landingUrl(game.slug))}">\n`;
    html = html.replace(/<\/head>/i, `${inject}</head>`);
    await writeFile(file, html, 'utf8');
  }
  const errors = validateSeo(html, file);
  if (errors.length) die(errors);
}

async function buildPages(templates) {
  const pages = [
    {
      slug: 'about',
      title: 'About Neon Arcade',
      description: 'Neon Arcade is an independent studio publishing original browser games. Learn who makes them and how they are built.',
      body: `<p>Neon Arcade is an independent one-person studio run by <strong>Jayden Hwang</strong>.
Every game on this site is built in-house with vanilla JavaScript and HTML5 Canvas — no engines,
no licensed content, no third-party game feeds. If you are playing it here, it was written here.</p>
<p>That last part is worth spelling out, because most sites shaped like this one are not that.
The usual browser-games site is a directory: a page of thumbnails wrapped around other people's
games loaded from a feed, where the site itself has added nothing you could point at. Every game
below is served from this domain because it was made for it, and each one ships with the thing a
directory cannot supply — a page explaining how it plays and why it is built the way it is.</p>
<p>The goal is narrow on purpose: short, finished games you can play in a browser tab without
downloading anything, making an account, or waiting through a launcher. They are meant to be
understood in about ten seconds and to keep being interesting after that, which is a harder
constraint than it sounds and rules out most ideas.</p>
<p>How they get made: each game starts as one mechanic that seems worth ten minutes. Most do not
survive being playable. The ones that do get a control scheme that works with a thumb as well as
a keyboard, because roughly half of everyone who plays these arrives on a phone.</p>
<p>Questions, bug reports or business enquiries: see the <a href="/contact/">contact page</a>.
Bugs are genuinely welcome — a game with a broken hitbox is worth more to me reported than
politely ignored.</p>`
    },
    {
      slug: 'contact',
      title: 'Contact',
      description: 'Get in touch with Neon Arcade about bugs, feedback, licensing or business enquiries.',
      body: `<p>Email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
<p>Use this address for bug reports, feedback, game licensing and business enquiries.
Replies usually arrive within a few days.</p>`
    },
    {
      slug: 'privacy',
      title: 'Privacy Policy',
      description: 'How Neon Arcade handles data, cookies, local storage and third-party advertising.',
      body: `<p><strong>Last updated:</strong> 2026-07-29</p>
<h2>Local storage</h2>
<p>Games store your high scores and progress in your browser's local storage.
This data never leaves your device and is not sent to any server.</p>
<h2>Analytics</h2>
<p>We use Google Analytics to understand which games people play and how the site performs.
Analytics data is aggregated and does not identify you personally.</p>
<h2>Advertising</h2>
<p>This site may display advertising served by Google and other third parties.
Third-party vendors, including Google, use cookies to serve ads based on your prior
visits to this or other websites. You can opt out of personalised advertising through
<a href="https://www.google.com/settings/ads">Google Ads Settings</a>.</p>
<h2>Contact</h2>
<p>Privacy questions: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>`
    }
  ];

  for (const page of pages) {
    const html = fill(templates.page, {
      HEAD: headTags({
        // "About Neon Arcade | Neon Arcade" 처럼 브랜드가 두 번 들어가지 않게 한다.
        title: page.title.includes(SITE_NAME) ? page.title : `${page.title} | ${SITE_NAME}`,
        ogTitle: page.title,
        description: page.description,
        canonical: absUrl(`/${page.slug}/`),
        ogImage: absUrl(`/${ogPath(defaultOgSlug)}`)
      }),
      TITLE: esc(page.title),
      ANALYTICS,
      // 광고를 싣지 않는다. about 88단어, privacy 125단어, contact 40단어 —
      // 구글이 공표한 거절 사유에 "가치가 거의 없는 페이지에 광고 코드가
      // 붙는 경우"가 그대로 있고, 40단어짜리 문의 양식이 정확히 그것이다.
      // 게임 페이지는 단어 수가 비슷해도 플레이 가능한 자체 제작 게임이
      // 실려 있으므로 다르다. 재는 것은 길이가 아니라 그 페이지에 뭐가 있느냐다.
      ADSENSE: '',

      VERIFICATION,
      BODY: page.body
    });
    await write(`${page.slug}/index.html`, html);
  }
}

// 없는 주소로 들어온 사람을 그냥 놓치지 않는다. GitHub Pages는 루트의 404.html을 쓴다.
async function build404(games, templates) {
  const html = fill(templates.page, {
    HEAD: headTags({
      title: `Page not found | ${SITE_NAME}`,
      ogTitle: 'Page not found',
      description: 'That page does not exist on Neon Arcade. Pick a game from the list and keep playing.',
      canonical: `${SITE_ORIGIN}/404.html`,
      ogImage: absUrl(`/${ogPath(defaultOgSlug)}`)
    }).replace('content="index,follow', 'content="noindex,follow'),
    TITLE: 'Page not found',
    ANALYTICS,
    // 같은 이유. 404는 정의상 내용이 없는 페이지다.
    ADSENSE: '',

    VERIFICATION,
    BODY: `<p>That address does not exist. It may have been a game that was taken down, or a typo.</p>
<p>Everything that is live right now:</p>
<ul>
${games.map(g => `<li><a href="${landingUrl(g.slug)}">${esc(g.title)}</a> — ${esc(g.tagline)}</li>`).join('\n')}
</ul>
<p><a href="/">Back to the home page</a></p>`
  });
  await write('404.html', html);
}

async function buildSitemap(games) {
  // 홈은 게임이 하나라도 바뀌면 바뀐다. 가장 최근 게임 날짜를 그대로 쓴다.
  const newest = games.map(g => g.releasedAt).sort().at(-1);
  const urls = [
    { loc: `${SITE_ORIGIN}/`, priority: '1.0', lastmod: newest },
    ...games.map(g => ({ loc: absUrl(landingUrl(g.slug)), priority: '0.8', lastmod: g.releasedAt })),
    { loc: `${SITE_ORIGIN}/about/`, priority: '0.3' },
    { loc: `${SITE_ORIGIN}/contact/`, priority: '0.3' },
    { loc: `${SITE_ORIGIN}/privacy/`, priority: '0.1' }
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  await writeFile('sitemap.xml', xml, 'utf8');
  console.log('  -> sitemap.xml');

  // /play/ 를 Disallow 하지 않는다. 막으면 두 가지를 동시에 잃는다.
  //  - 게임 본체 안의 noindex를 크롤러가 읽지 못해, 외부 링크가 생기면 URL만 색인될 수 있다
  //  - 랜딩 페이지의 주요 콘텐츠(iframe 안의 게임)를 렌더링 단계에서 못 본다
  // 색인 제어는 robots.txt가 아니라 페이지의 noindex가 한다.
  const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
  await writeFile('robots.txt', robots, 'utf8');
  console.log('  -> robots.txt');

  // ads.txt — 누가 이 도메인의 광고를 팔 권한이 있는지 선언한다. 없으면 애드센스가
  // "수익 손실 위험"으로 표시하고 일부 입찰자가 아예 응찰하지 않는다.
  // ADSENSE_CLIENT가 없으면 만들지 않는다. 빈 ads.txt는 없는 것보다 나쁘다 —
  // "아무도 팔 권한이 없다"는 선언이 되어 광고가 전부 막힌다.
  if (ADSENSE_CLIENT) {
    const pub = ADSENSE_CLIENT.replace(/^ca-/, '');
    await writeFile('ads.txt', `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, 'utf8');
    console.log('  -> ads.txt');
  }
}

// LLM이 사이트 구조를 사람 문서처럼 읽어가는 관행에 맞춘 목록.
// 표준은 아니지만 비용이 거의 없고, 게임 목록은 어차피 공개 정보다.
async function buildLlmsTxt(games) {
  const body = `# ${SITE_NAME}

> Original HTML5 browser games, free to play with no download and no sign-up.
> Every game is built in-house and runs on desktop and mobile.

## Games

${games.map(g => `- [${g.title}](${absUrl(landingUrl(g.slug))}): ${g.tagline} Genre: ${g.tag}.`).join('\n')}

## Site

- [Home](${SITE_ORIGIN}/): all games
- [About](${SITE_ORIGIN}/about/): who makes these games
- [Contact](${SITE_ORIGIN}/contact/): bugs, feedback, licensing
- [Privacy](${SITE_ORIGIN}/privacy/): data, cookies, local storage
`;
  await writeFile('llms.txt', body, 'utf8');
  console.log('  -> llms.txt');
}

// --- main ---
const all = JSON.parse(await readFile('games.json', 'utf8'));

console.log(`\nValidating ${all.length} games...`);
const errors = validateGames(all, {
  exists: (p) => existsSync(p),
  sizeOf: (p) => (existsSync(p) ? statSync(p).size : 0)
});
if (errors.length) die(errors);

// 아이콘은 게임별이 아니라 사이트 전체에 걸려 있어 게임 게이트가 보지 못한다.
// headTags()가 세 파일을 모든 페이지에서 참조하므로, 하나만 없어도
// 사이트 전체에서 조용히 404가 난다 — 빌드는 통과하고 탭 아이콘만 사라진다.
const iconMissing = [ICON_SRC, ...ICON_SIZES.map(iconPath)].filter(p => !existsSync(p));
if (iconMissing.length) {
  die(iconMissing.map(p => `missing site icon: ${p} — run \`npm run icons\``));
}

// 같은 이유로 공유 스크립트도 여기서 본다. 모든 랜딩이 참조하는데 없으면
// 404가 나고 버튼은 그려진 채로 아무것도 안 한다 — 조용히 실패하는 쪽이다.
if (!existsSync(SHARE_SCRIPT)) {
  die([`missing ${SHARE_SCRIPT} — 랜딩의 공유 버튼이 죽은 채로 배포된다`]);
}

console.log('  ok  all gates passed');

// draft는 산출하지 않는다. demoted는 산출하되 홈 하단으로 밀린다.
const live = all.filter(g => g.status === 'published' || g.status === 'demoted');
const ordered = [...live].sort((a, b) => {
  if (a.status !== b.status) return a.status === 'published' ? -1 : 1;
  return b.releasedAt.localeCompare(a.releasedAt);
});

// 게임 페이지가 아닌 곳(홈·about·404)의 공유 카드. 대표 게임 것을 쓴다.
const defaultOgSlug = (ordered.find(g => g.featured) ?? ordered[0]).slug;

console.log('\nBuilding...');
const templates = {
  home: await readTemplate('home.html'),
  landing: await readTemplate('game-landing.html'),
  page: await readTemplate('page.html')
};

// 지난 빌드의 잔재 제거. Windows에서 탐색기/IDE가 폴더를 잡고 있으면 EPERM이 날 수 있는데,
// 정리는 최선 노력으로 충분하다 (CI는 항상 새 체크아웃에서 빌드한다).
await rm('games', { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
  .catch((err) => console.warn(`  !  could not clear stale games/ (${err.code}) — continuing`));
await buildHome(ordered, templates);
for (const game of ordered) {
  await buildLanding(game, ordered, templates);
  await markGameNoindex(game);
}
await buildPages(templates);
await build404(ordered, templates);
await buildSitemap(ordered);
await buildLlmsTxt(ordered);

console.log(`\nDone. ${ordered.length} games, ${ordered.length + 4} indexable URLs.\n`);

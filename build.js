import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { validateGames, validateOutput } from './tools/validate.js';
import { fill, esc } from './tools/render.js';
import { gamePath, thumbPath, landingUrl, landingOutPath, absUrl, SITE_ORIGIN } from './tools/paths.js';

const SITE_TITLE = 'Neon Arcade — Free Original Browser Games';
const SITE_DESC = 'Play original HTML5 arcade games free in your browser. No download, no sign-up, works on mobile and desktop.';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? 'hello@just1game.com';

// Search Console 확인 토큰. DNS TXT 형식(`google-site-verification=...`)을 그대로
// 붙여넣어도 되도록 접두사를 벗겨낸다.
const VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION
  ? `<meta name="google-site-verification" content="${process.env.GOOGLE_SITE_VERIFICATION.trim().replace(/^google-site-verification=/, '')}">`
  : '';

const ANALYTICS = process.env.GA_ID
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${process.env.GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${process.env.GA_ID}');</script>`
  : '';

const die = (errors) => {
  console.error('\nBUILD FAILED — validation gate:\n');
  for (const e of errors) console.error(`  x ${e}`);
  console.error('');
  process.exit(1);
};

const readTemplate = (name) => readFile(path.join('templates', name), 'utf8');

async function write(outPath, html) {
  const errors = validateOutput(html, outPath);
  if (errors.length) die(errors);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');
  console.log(`  -> ${outPath}`);
}

function card(game) {
  return `      <article class="card" onclick="location.href='${landingUrl(game.slug)}'">
        <div class="card-thumb">
          <img src="/${thumbPath(game.slug)}" alt="${esc(game.title)} screenshot" width="600" height="400" loading="lazy">
        </div>
        <div class="card-content">
          <div class="card-tag">${esc(game.tag)}</div>
          <div class="card-title">${esc(game.title)}</div>
          <p class="card-desc">${esc(game.tagline)}</p>
        </div>
      </article>`;
}

async function buildHome(games, templates) {
  const featured = games.find(g => g.featured) ?? games[0];
  const html = fill(templates.home, {
    TITLE: esc(SITE_TITLE),
    DESCRIPTION: esc(SITE_DESC),
    CANONICAL: `${SITE_ORIGIN}/`,
    OG_IMAGE: absUrl(`/${thumbPath(featured.slug)}`),
    ANALYTICS,

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
  const tips = (game.tips ?? []).length
    ? `    <h2>Tips</h2>\n    <ul>\n${game.tips.map(t => `      <li>${esc(t)}</li>`).join('\n')}\n    </ul>\n`
    : '';

  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.title,
    description: game.description,
    url: absUrl(landingUrl(game.slug)),
    image: absUrl(`/${thumbPath(game.slug)}`),
    genre: game.tag,
    datePublished: game.releasedAt,
    applicationCategory: 'Game',
    operatingSystem: 'Any (web browser)',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  });

  const html = fill(templates.landing, {
    TITLE: esc(game.title),
    TAGLINE: esc(game.tagline),
    DESCRIPTION: esc(game.description),
    CANONICAL: absUrl(landingUrl(game.slug)),
    OG_IMAGE: absUrl(`/${thumbPath(game.slug)}`),
    GAME_SRC: `/${gamePath(game.slug)}`,
    JSONLD: jsonld,
    ANALYTICS,

    VERIFICATION,
    HOW_TO_PLAY: game.howToPlay.map(s => `      <li>${esc(s)}</li>`).join('\n'),
    CONTROLS_KEYBOARD: esc(game.controls.keyboard),
    CONTROLS_TOUCH: esc(game.controls.touch),
    TIPS_BLOCK: tips,
    RELATED_CARDS: related.map(card).join('\n')
  });
  await write(landingOutPath(game.slug), html);
}

// 게임 본체는 색인 대상이 아니다. 랜딩 페이지가 canonical이다.
async function markGameNoindex(game) {
  const file = gamePath(game.slug);
  let html = await readFile(file, 'utf8');
  if (html.includes('name="robots"')) return;
  const inject = `<meta name="robots" content="noindex">\n<link rel="canonical" href="${absUrl(landingUrl(game.slug))}">\n`;
  html = html.replace(/<\/head>/i, `${inject}</head>`);
  await writeFile(file, html, 'utf8');
}

async function buildPages(templates) {
  const pages = [
    {
      slug: 'about',
      title: 'About Neon Arcade',
      description: 'Neon Arcade is an independent studio publishing original browser games. Learn who makes them and how they are built.',
      body: `<p>Neon Arcade is an independent one-person studio. Every game on this site is
built in-house with vanilla JavaScript and HTML5 Canvas — no engines, no licensed content,
no third-party game feeds.</p>
<p>The goal is simple: short, polished games you can play in a browser tab without
downloading anything or creating an account. New games are published regularly.</p>
<p>Questions, bug reports or business enquiries: see the <a href="/contact/">contact page</a>.</p>`
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
      TITLE: esc(page.title),
      DESCRIPTION: esc(page.description),
      CANONICAL: absUrl(`/${page.slug}/`),
      ANALYTICS,

      VERIFICATION,
      BODY: page.body
    });
    await write(`${page.slug}/index.html`, html);
  }
}

async function buildSitemap(games) {
  const urls = [
    { loc: `${SITE_ORIGIN}/`, priority: '1.0' },
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

  const robots = `User-agent: *
Allow: /
Disallow: /play/

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
  await writeFile('robots.txt', robots, 'utf8');
  console.log('  -> robots.txt');
}

// --- main ---
const all = JSON.parse(await readFile('games.json', 'utf8'));

console.log(`\nValidating ${all.length} games...`);
const errors = validateGames(all, {
  exists: (p) => existsSync(p),
  sizeOf: (p) => (existsSync(p) ? statSync(p).size : 0)
});
if (errors.length) die(errors);
console.log('  ok  all gates passed');

// draft는 산출하지 않는다. demoted는 산출하되 홈 하단으로 밀린다.
const live = all.filter(g => g.status === 'published' || g.status === 'demoted');
const ordered = [...live].sort((a, b) => {
  if (a.status !== b.status) return a.status === 'published' ? -1 : 1;
  return b.releasedAt.localeCompare(a.releasedAt);
});

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
await buildSitemap(ordered);

console.log(`\nDone. ${ordered.length} games, ${ordered.length + 4} indexable URLs.\n`);

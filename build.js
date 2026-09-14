import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { validateGames, validateOutput } from './tools/validate.js';
import { fill, esc } from './tools/render.js';
import { ICON_SRC, ICON_SIZES, iconPath } from './tools/icon.js';
import { gamePath, thumbPath, ogPath, landingUrl, landingOutPath, absUrl, SITE_ORIGIN } from './tools/paths.js';
import { homeJsonLd, landingJsonLd, faqSection, headTags, validateSeo, SITE_NAME } from './tools/seo.js';
import { shareBlock, SHARE_SCRIPT } from './tools/share.js';
import { pickRelated } from './tools/related.js';
import {
  loadNotes, validateNotes, noteJsonLd, notesIndexJsonLd, noteCard,
  noteUrl, noteOutPath, humanDate, NAV, AUTHOR
} from './tools/notes.js';

const HOME_COPY = `    <h2>Original browser games, made here</h2>
    <p>Neon Arcade is a one-person studio publishing free <b>HTML5 games</b> that run in a browser
    tab. Every game on this page was written for this site in vanilla JavaScript and HTML5 Canvas:
    no game engine, no licensed art packs, no third-party game feed. That is unusual for a site
    shaped like this one. The typical browser-games site is a directory — a grid of thumbnails
    wrapped around other people&rsquo;s games pulled in from a feed. Nothing here is borrowed, which
    is why each game gets a page explaining how it plays and why it was built the way it was.</p>
    <p>The games are short on purpose. Each one starts from a single mechanic that seemed worth ten
    minutes, and most candidates do not survive being playable. The ones that ship have to work with
    a thumb as well as a keyboard, load in under two seconds, and hold a steady frame rate on a
    phone — those are not aspirations, they are automated checks that refuse to publish a game that
    fails them. <a href="/notes/every-check-exists-because-it-shipped/">Each of those checks exists
    because that exact mistake shipped to production once.</a></p>
    <h2>What is here right now</h2>
    <p>Twenty games, spanning arcade survival, puzzles, reaction tests and — most recently — one
    cozy game with no score and no way to lose. <a href="${landingUrl('feltling')}">Feltling</a> is
    the newest and the one that best explains where the site is going: a felt world drawn entirely
    in code, where you knock on things until they give up their thread. There is a longer account of
    that turn in <a href="/notes/nineteen-games-zero-players/">the post-mortem of the first
    nineteen</a>.</p>
    <p>Nothing asks you to sign up, install anything, or wait through a launcher. Progress and high
    scores are kept in your own browser&rsquo;s local storage and never sent anywhere — the
    <a href="/privacy/">privacy page</a> spells out exactly what that means.</p>`;

const HOME_FAQ = [
  {
    q: 'Are these games free to play?',
    a: 'Yes. Every game on this site is free, with no account, no trial and no in-app purchases. There is advertising on the pages around the games, and none inside the games themselves.'
  },
  {
    q: 'Do I need to download or install anything?',
    a: 'No. Each game is a single web page that runs in your browser on desktop, tablet or phone. There is nothing to install and no plugin or app store involved, and most games are playable within a second of the page loading.'
  },
  {
    q: 'Do these games work on a phone?',
    a: 'Yes. Every game is built portrait-first and tested automatically at phone resolution before it can be published, including a check that the playing field keeps a phone shape even on a wide desktop window so the difficulty does not change with your screen.'
  },
  {
    q: 'Who makes these games?',
    a: 'One person, Jayden Hwang, working in vanilla JavaScript and HTML5 Canvas. Nothing here is licensed from a game feed or built on an engine, and the dev notes on this site describe how individual games were made.'
  },
  {
    q: 'Is my progress saved?',
    a: 'High scores and progress are kept in your own browser using local storage, on that device only. Nothing is sent to a server, so clearing your browser data for this site will reset it and progress does not follow you to another device.'
  }
];

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
    JSONLD: JSON.stringify(homeJsonLd(games, HOME_FAQ)),
    ANALYTICS,
    ADSENSE,
    NAV,
    HOME_COPY,

    VERIFICATION,
    FEATURED_TITLE: esc(featured.title),
    FEATURED_TAGLINE: esc(featured.tagline),
    FEATURED_URL: landingUrl(featured.slug),
    FEATURED_THUMB: thumbPath(featured.slug),
    FAQ: faqSection({ faq: HOME_FAQ }),
    CARDS: games.map(card).join('\n'),
    GAME_LIST: games.map(g =>
      `      <li><a href="${landingUrl(g.slug)}"><strong>${esc(g.title)}</strong></a> — ${esc(g.tagline)}</li>`
    ).join('\n')
  });
  await write('index.html', html);
}


/* 게임 페이지의 고유 본문. 20장이 같은 표와 같은 문단 구조만 들고 있으면, 사람이 읽어도
   기계가 읽어도 한 틀에서 찍어낸 목록으로 읽힌다 — 구글이 공표한 미승인 사유의
   "auto-generated pages"와 "not enough original, rich content"가 정확히 그 모양이다.
   여기에는 그 게임을 만들면서 실제로 있었던 일만 적는다. 없으면 절 자체를 만들지 않는다. */
function designNotes(game) {
  const paras = game.notes ?? [];
  if (!paras.length) return '';
  const body = paras.map(t => `    <p>${t}</p>`).join('\n');
  return `  <section class="design-notes">
    <h2>Design notes: how ${esc(game.title)} was built</h2>
${body}
    <p class="more-link">More of these in the <a href="/notes/">dev notes</a>.</p>
  </section>
`;
}

async function buildLanding(game, games, templates) {
  const related = pickRelated(game, games);
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
    NAV,
    DESIGN_NOTES: designNotes(game),

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

/* 개발 노트. 이 사이트가 가진 유일한 1차 자료는 게임을 만든 과정이고,
   그것을 글로 내놓는 것이 "가치 있는 고유 콘텐츠"에 대한 가장 정직한 답이다. */
async function buildNotes(notes, templates) {
  const ogImage = absUrl(`/${ogPath(defaultOgSlug)}`);

  for (const [i, note] of notes.entries()) {
    const prev = notes[i + 1];   // 목록이 최신순이라 다음 칸이 더 오래된 글이다
    const next = notes[i - 1];
    const links = [
      next && `      <a href="${noteUrl(next.slug)}"><span>Newer</span>${esc(next.title)}</a>`,
      prev && `      <a href="${noteUrl(prev.slug)}"><span>Older</span>${esc(prev.title)}</a>`
    ].filter(Boolean).join('\n');

    const html = fill(templates.note, {
      HEAD: headTags({
        title: `${note.title} | ${SITE_NAME}`,
        ogTitle: note.title,
        description: note.description,
        canonical: absUrl(noteUrl(note.slug)),
        ogImage,
        ogType: 'article'
      }),
      JSONLD: JSON.stringify(noteJsonLd(note, ogImage)),
      ANALYTICS,
      ADSENSE,
      NAV,
      VERIFICATION,
      TITLE: esc(note.title),
      DATE: esc(note.date),
      DATE_HUMAN: esc(humanDate(note.date)),
      AUTHOR: esc(AUTHOR.name),
      WORDS: String(note.words),
      SUMMARY: esc(note.summary),
      BODY: note.body,
      FOOTER_NAV: links ? `  <nav class="note-footer-nav" aria-label="More dev notes">\n${links}\n  </nav>\n` : ''
    });
    await write(noteOutPath(note.slug), html);
  }

  const index = fill(templates.notes, {
    HEAD: headTags({
      title: `Dev notes | ${SITE_NAME}`,
      ogTitle: 'Dev notes',
      description: 'Write-ups from building the browser games on this site: mechanics, canvas rendering, automated quality gates and the mistakes that shipped first.',
      canonical: absUrl('/notes/'),
      ogImage
    }),
    JSONLD: JSON.stringify(notesIndexJsonLd(notes)),
    ANALYTICS,
    NAV,
    VERIFICATION,
    CARDS: notes.map(noteCard).join('\n')
  });
  await write('notes/index.html', index);
}

async function buildPages(templates) {
  const pages = [
    {
      slug: 'about',
      title: 'About Neon Arcade',
      description: 'Neon Arcade is an independent one-person studio publishing original browser games. Who makes them, how they are built, and what gets checked before one ships.',
      body: `<p>Neon Arcade is an independent one-person studio run by <strong>Jayden Hwang</strong>.
Every game on this site is built in-house with vanilla JavaScript and HTML5 Canvas — no engines,
no licensed content, no third-party game feeds. If you are playing it here, it was written here.</p>

<p>That last part is worth spelling out, because most sites shaped like this one are not that.
The usual browser-games site is a directory: a page of thumbnails wrapped around other people's
games loaded from a feed, where the site itself has added nothing you could point at. Every game
here is served from this domain because it was made for it, and each one ships with the thing a
directory cannot supply — a page explaining how it plays and why it is built the way it is.</p>

<h2>What the games are trying to be</h2>
<p>The goal is narrow on purpose: short, finished games you can play in a browser tab without
downloading anything, making an account, or waiting through a launcher. They are meant to be
understood in about ten seconds and to keep being interesting after that, which is a harder
constraint than it sounds and rules out most ideas.</p>
<p>How they get made: each game starts as one mechanic that seems worth ten minutes. Most do not
survive being playable. The ones that do get a control scheme that works with a thumb as well as
a keyboard, because roughly half of everyone who plays these arrives on a phone. The newest
game, <a href="${landingUrl('feltling')}">Feltling</a>, breaks the pattern deliberately — it has
no score, no timer and no failure state, and it is the direction the rest of the site is heading.</p>

<h2>Nothing ships without passing the gates</h2>
<p>Publishing a game here is not a matter of uploading a file. A build script runs every game
through a set of automated checks and refuses to produce the site if any of them fail. It loads
each game in a real headless browser at phone resolution and measures: how long it takes to become
playable, whether the canvas is actually drawing anything, whether the frame rate ever collapses,
whether the heap grows the way a memory leak grows, whether the touch handlers exist, whether the
playing field keeps phone proportions on a desktop monitor, and whether the game responds to input
at all. Separately it checks the page around the game: a single H1, a canonical URL, a share image,
structured data that parses, a description within the length a search engine will actually show,
and at least two real questions answered in the FAQ.</p>
<p>None of that list was designed up front. Every item was added the day the corresponding mistake
was found in production — a game that silently rendered a blank canvas, a thumbnail captured one
second before the game became legible, a set of pages that all claimed to be the same page. The
long version is in the <a href="/notes/every-check-exists-because-it-shipped/">dev notes</a>.</p>

<h2>How this site is made, honestly</h2>
<p>The games, the build system and the words on these pages are the work of one person, and the
design decisions — what a game is about, what gets cut, what counts as good enough — are made by
that person. AI coding tools are part of the toolchain here, the same way a compiler or a linter
is: they draft and refactor code that is then read, tested and accepted or thrown away. Nothing is
published without being played. Saying so plainly seems better than leaving you to guess.</p>
<p>The stack is deliberately small: no framework, no bundler, no runtime dependencies in the games
themselves. Each game is a single self-contained HTML file. The site around them is generated by a
Node script into static files and served as plain HTML. The full list of what is used, and where
every asset came from, is on the <a href="/credits/">credits page</a>.</p>

<h2>Get in touch</h2>
<p>Questions, bug reports or business enquiries: see the <a href="/contact/">contact page</a>.
Bugs are genuinely welcome — a game with a broken hitbox is worth more to me reported than
politely ignored. If you would rather read than play, the
<a href="/notes/">dev notes</a> cover the parts of this that were hardest to get right.</p>`
    },
    {
      slug: 'contact',
      title: 'Contact',
      description: 'How to reach Neon Arcade about bugs, feedback, game licensing, portal distribution, press enquiries or anything on this site.',
      body: `<p>Neon Arcade is run by one person, and this address reaches him directly.</p>
<p><strong>Email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></strong></p>
<p>Replies usually arrive within a few days. There is no contact form, no ticket system and no
auto-responder — a plain email is the fastest route.</p>

<h2>Bug reports</h2>
<p>These are the most useful thing you can send. Every game here is tested automatically before it
ships, but automated checks play nothing like a person does, and the failures that matter most are
the ones a script cannot notice: a hitbox that feels unfair, a control that fights your thumb, a
score that stops making sense. If you can, include the name of the game, the browser and device you
were using, and what you were doing in the ten seconds before the problem. A screenshot beats a
description. Reports get fixed and the fix gets published — usually the same week.</p>

<h2>Licensing and distribution</h2>
<p>Every game on this site is original work owned outright, which means it can be licensed. If you
run a game portal, an app, a magazine cover-disc equivalent or an in-house arcade and want to host
one of these, write in. Each game is a single self-contained HTML file with no external requests
and no runtime dependencies, so it drops into an iframe without any integration work at all, and
non-exclusive terms are the normal arrangement. Say which game and where it would run.</p>

<h2>Press and interviews</h2>
<p>Happy to answer questions about how any of this is built, and there is a fair amount of material
already written up in the <a href="/notes/">dev notes</a> if you would rather not wait for a reply.
Screenshots and share images for every game are already published at 1200&times;630 and free to use
in coverage of the game they depict.</p>

<h2>Privacy questions</h2>
<p>Anything about data, cookies, advertising or local storage can go to the same address. What is
collected and what is not is described on the <a href="/privacy/">privacy page</a>.</p>`
    },
    {
      slug: 'credits',
      title: 'Credits and asset provenance',
      description: 'Where every image, sound and line of code on Neon Arcade comes from, and the tools used to build the games on this site.',
      body: `<p>This page exists so that the answer to &ldquo;where did that come from?&rdquo; is
never a guess. Everything published on this domain is original work unless it is listed below as
something else, and at the time of writing nothing is listed as something else.</p>

<h2>Artwork</h2>
<p>There are almost no image files on this site. Game graphics are drawn at runtime in code — canvas
paths, gradients and procedural texture — rather than loaded from sprite sheets. The felt look in
<a href="${landingUrl('feltling')}">Feltling</a>, for instance, is a generated fibre tile composited
over shapes whose outlines are deliberately wobbled; there is no painted artwork behind it at all.
The handful of vector files that do exist (<code>jumper.svg</code>, <code>cactus.svg</code>,
<code>coin.svg</code>) were drawn for this site.</p>
<p>An earlier version of this site did use three downloaded sprite packs from itch.io, in four
games. Because their licences could not be confirmed as permitting commercial use, those files were
removed from the repository and the games that used them were redrawn in code. No third-party
artwork is served from this domain today.</p>

<h2>Thumbnails and share images</h2>
<p>Every thumbnail on the front page is a real screenshot of the game running, captured
automatically by a headless browser rather than composed by hand — which means it cannot show
something the game does not actually do. The 1200&times;630 share cards are generated from those
same screenshots. If you are writing about one of these games, both are free to use.</p>

<h2>Sound</h2>
<p>All audio is synthesised in the browser with the Web Audio API at the moment it plays. There are
no sound files. A knock on felt, for example, is a burst of white noise shaped by an amplitude
envelope and pushed through a low-pass filter whose cutoff falls as the seal&rsquo;s coat thickens.
No samples, recorded or purchased, are used anywhere on this site.</p>

<h2>Typefaces</h2>
<p>Headings and interface text use <strong>Fredoka</strong> and <strong>Outfit</strong>, and nine of
the older games load a display face such as <strong>Audiowide</strong> or <strong>Orbitron</strong>.
All are open-licence typefaces served from Google Fonts, which means your browser fetches them from
Google&rsquo;s servers rather than from this domain &mdash; the one category of third-party request
on this site besides analytics and advertising, and it is described on the
<a href="/privacy/">privacy page</a>. Body text falls back to your own system typeface while they
load. The newest game uses the system rounded face and loads nothing.</p>

<h2>Code and tooling</h2>
<ul>
<li><strong>The games</strong> — vanilla JavaScript and HTML5 Canvas. No engine, no framework, no
runtime dependencies. Each game is one self-contained HTML file.</li>
<li><strong>The site</strong> — a Node build script that generates static HTML. No CMS.</li>
<li><strong>Testing</strong> — Node's built-in test runner, plus Playwright driving headless
Chromium for the gameplay gates and screenshot capture.</li>
<li><strong>Images</strong> — sharp, for resizing captures into WebP thumbnails and PNG share cards.</li>
<li><strong>Hosting</strong> — GitHub Pages, deployed by GitHub Actions on every push, with the
build gates running in CI so a failing game cannot reach the live site.</li>
<li><strong>AI assistance</strong> — coding assistants are used to draft and refactor code, which is
then reviewed, tested and accepted or discarded by a person. Design decisions and the text on this
site are human work. This is stated plainly on the <a href="/about/">about page</a> as well.</li>
</ul>

<h2>Reusing anything here</h2>
<p>The games are not open source and are not free to redistribute, but they are available for
licensing — see the <a href="/contact/">contact page</a>. Screenshots and share images may be used
in coverage of the game they show, with a link back.</p>`
    },
    {
      slug: 'privacy',
      title: 'Privacy Policy',
      description: 'What Neon Arcade collects and what it does not: local storage, analytics, Google AdSense cookies, your choices, and how to reach us about data.',
      body: `<p><strong>Last updated:</strong> 2026-09-14</p>
<p>Neon Arcade (&ldquo;we&rdquo;, &ldquo;the site&rdquo;) publishes free browser games at
just1game.com. This page describes what happens to data when you use the site. It is written to be
read rather than to be technically survivable, and the short version is this: we do not ask you for
anything, we do not have accounts, and the only parties that see anything about your visit are
Google Analytics and Google&rsquo;s advertising systems, described below.</p>

<h2>Information we do not collect</h2>
<p>There is no sign-up, no login, no newsletter and no contact form on this site. We do not ask for
your name, email address, phone number, date of birth or payment details, and there is nowhere on
the site to give them to us. We do not sell personal information, because we do not hold any.</p>

<h2>Game progress and local storage</h2>
<p>Games store high scores, progress and preferences in your browser&rsquo;s local storage — for
example, which coat the seal in Feltling has reached, or your best run in an arcade game. This data
is written by your browser, stays on your device, and is never transmitted to us or to anyone else.
We cannot read it. Clearing your browser&rsquo;s site data for this domain erases it permanently,
and it does not follow you to another device or another browser.</p>

<h2>Analytics</h2>
<p>We use Google Analytics to understand which games people play, which pages they arrive on, and
how the site performs. It records things like the pages visited, approximate location at
city level, device and browser type, and referring site. Google Analytics sets cookies in your
browser to do this. We look at this data in aggregate, to decide what to build next; we do not
attempt to identify individual visitors and the reports do not let us. You can prevent Google
Analytics from collecting your activity entirely by installing
<a href="https://tools.google.com/dlpage/gaoptout" rel="nofollow noopener" target="_blank">Google's
opt-out browser add-on</a>.</p>

<h2>Advertising</h2>
<p>This site displays advertising served by Google, and may in future carry advertising from other
third-party networks. The relevant points, which Google requires publishers to disclose:</p>
<ul>
<li>Third-party vendors, including Google, use cookies to serve ads based on your prior visits to
this website or other websites.</li>
<li>Google's use of advertising cookies enables it and its partners to serve ads to you based on
your visit to this site and/or other sites on the internet.</li>
<li>You may opt out of personalised advertising by visiting
<a href="https://www.google.com/settings/ads" rel="nofollow noopener" target="_blank">Google Ads
Settings</a>. You may opt out of a third-party vendor's use of cookies for personalised
advertising at <a href="https://www.aboutads.info/choices/" rel="nofollow noopener" target="_blank">aboutads.info</a>
or <a href="https://www.youronlinechoices.eu/" rel="nofollow noopener" target="_blank">youronlinechoices.eu</a>.</li>
<li>Opting out of personalised advertising does not remove advertising from the site; it makes the
advertising you see less relevant to you.</li>
</ul>
<p>Advertising is not shown inside the games themselves. Game files served from
<code>/play/</code> load no external scripts of any kind, so nothing tracks you while you are
actually playing.</p>

<h2>Fonts</h2>
<p>Pages on this site load typefaces from Google Fonts. Your browser requests those files from
<code>fonts.googleapis.com</code> and <code>fonts.gstatic.com</code>, which means Google receives
your IP address and standard request headers in order to serve them. No cookie is set by that
request and it is not used to identify you. The typefaces in use are listed on the
<a href="/credits/">credits page</a>.</p>

<h2>Visitors in the EEA, UK and Switzerland</h2>
<p>Where required, Google's consent tools ask for your permission before setting advertising and
analytics cookies, and record your choice. You can change that choice at any time using the privacy
settings link presented by that tool, or by clearing this site's cookies in your browser. Our legal
basis for analytics and personalised advertising in those regions is your consent; where consent is
refused or withdrawn, non-personalised advertising may still be served, which does not rely on
cookies for profiling.</p>

<h2>Visitors in California</h2>
<p>We do not sell or share personal information as those terms are defined by the CCPA/CPRA. If you
wish to exercise a right under that law, write to the address below and it will be honoured.</p>

<h2>Children</h2>
<p>This site is not directed to children under 13, and we do not knowingly collect personal
information from them. If you believe a child has provided personal information through this site,
contact us and it will be deleted.</p>

<h2>Third-party links</h2>
<p>Pages here link to other websites, including Google's own privacy and opt-out tools. Those sites
have their own privacy policies and this one does not cover them. Google's handling of data from
sites that use its services is described in
<a href="https://policies.google.com/technologies/partner-sites" rel="nofollow noopener" target="_blank">How Google
uses information from sites or apps that use our services</a>.</p>

<h2>Security and retention</h2>
<p>The site is served over HTTPS as static files, with no database and no server-side storage of
visitor data. Analytics data is retained under Google Analytics' own retention settings; we hold no
copy of it outside that service.</p>

<h2>Changes to this policy</h2>
<p>If this policy changes, the &ldquo;last updated&rdquo; date above changes with it, and the
substance of any change will be described on this page rather than quietly folded in.</p>

<h2>Contact</h2>
<p>Privacy questions, or requests about data under GDPR, UK GDPR or CCPA:
<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. See also the
<a href="/contact/">contact page</a>.</p>`
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
      NAV,
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
    NAV,
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

async function buildSitemap(games, notes) {
  // 홈은 게임이 하나라도 바뀌면 바뀐다. 가장 최근 게임 날짜를 그대로 쓴다.
  const newest = games.map(g => g.releasedAt).sort().at(-1);
  const newestNote = notes.map(n => n.updated ?? n.date).sort().at(-1);
  const urls = [
    { loc: `${SITE_ORIGIN}/`, priority: '1.0', lastmod: newest },
    ...games.map(g => ({ loc: absUrl(landingUrl(g.slug)), priority: '0.8', lastmod: g.releasedAt })),
    { loc: absUrl('/notes/'), priority: '0.7', lastmod: newestNote },
    ...notes.map(n => ({ loc: absUrl(noteUrl(n.slug)), priority: '0.6', lastmod: n.updated ?? n.date })),
    { loc: `${SITE_ORIGIN}/about/`, priority: '0.4' },
    { loc: `${SITE_ORIGIN}/credits/`, priority: '0.3' },
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
async function buildLlmsTxt(games, notes) {
  const body = `# ${SITE_NAME}

> Original HTML5 browser games, free to play with no download and no sign-up.
> Every game is built in-house and runs on desktop and mobile.

## Games

${games.map(g => `- [${g.title}](${absUrl(landingUrl(g.slug))}): ${g.tagline} Genre: ${g.tag}.`).join('\n')}

## Dev notes

First-hand write-ups on building these games, by the person who built them.

${notes.map(n => `- [${n.title}](${absUrl(noteUrl(n.slug))}): ${n.summary}`).join('\n')}

## Site

- [Home](${SITE_ORIGIN}/): all games
- [Dev notes](${SITE_ORIGIN}/notes/): how the games are made
- [About](${SITE_ORIGIN}/about/): who makes these games
- [Credits](${SITE_ORIGIN}/credits/): where every asset comes from
- [Contact](${SITE_ORIGIN}/contact/): bugs, feedback, licensing
- [Privacy](${SITE_ORIGIN}/privacy/): data, cookies, local storage
`;
  await writeFile('llms.txt', body, 'utf8');
  console.log('  -> llms.txt');
}

// --- main ---
const all = JSON.parse(await readFile('games.json', 'utf8'));
const notes = await loadNotes();

console.log(`\nValidating ${all.length} games and ${notes.length} notes...`);
const noteErrors = validateNotes(notes);
if (noteErrors.length) die(noteErrors);
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
  page: await readTemplate('page.html'),
  note: await readTemplate('note.html'),
  notes: await readTemplate('notes.html')
};

// 지난 빌드의 잔재 제거. Windows에서 탐색기/IDE가 폴더를 잡고 있으면 EPERM이 날 수 있는데,
// 정리는 최선 노력으로 충분하다 (CI는 항상 새 체크아웃에서 빌드한다).
await rm('games', { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
  .catch((err) => console.warn(`  !  could not clear stale games/ (${err.code}) — continuing`));
await rm('notes', { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
  .catch((err) => console.warn(`  !  could not clear stale notes/ (${err.code}) — continuing`));
await buildHome(ordered, templates);
for (const game of ordered) {
  await buildLanding(game, ordered, templates);
  await markGameNoindex(game);
}
await buildNotes(notes, templates);
await buildPages(templates);
await build404(ordered, templates);
await buildSitemap(ordered, notes);
await buildLlmsTxt(ordered, notes);

// 홈 + 게임 + 노트 목록 + 노트 + about·credits·contact·privacy
const indexable = 1 + ordered.length + 1 + notes.length + 4;
console.log(`\nDone. ${ordered.length} games, ${notes.length} dev notes, ${indexable} indexable URLs.\n`);

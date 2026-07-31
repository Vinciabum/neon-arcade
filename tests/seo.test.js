import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeJsonLd, landingJsonLd, faqSection, headTags, validateSeo, SEO } from '../tools/seo.js';

const game = () => ({
  slug: 'cyber-snake',
  title: 'Cyber Snake',
  tagline: 'The timeless classic reborn with a cybernetic skin.',
  description: 'Guide a growing neon snake around the grid, eat data nodes and avoid crashing into your own tail in this smooth take on the arcade classic.',
  tag: 'Classic',
  controls: { keyboard: 'Arrow keys or WASD to turn', touch: 'Swipe in the direction you want to turn' },
  releasedAt: '2026-02-18',
  status: 'published',
  faq: [
    { q: 'Is Cyber Snake free to play?', a: 'Yes. It runs in the browser with no download, no sign-up and no payment.' },
    { q: 'Does Cyber Snake work on a phone?', a: 'Yes. Swipe in the direction you want the snake to turn.' }
  ]
});

const type = (graph, t) => graph['@graph'].find(n => n['@type'] === t);

/* ---------- 홈 구조화 데이터 ---------- */

test('홈 JSON-LD는 WebSite·Organization·ItemList를 한 그래프에 담는다', () => {
  const ld = homeJsonLd([game()]);
  assert.equal(ld['@context'], 'https://schema.org');
  for (const t of ['WebSite', 'Organization', 'ItemList']) {
    assert.ok(type(ld, t), `${t} 노드가 없다`);
  }
});

test('홈 ItemList는 게임 수와 순서를 그대로 반영한다', () => {
  const a = { ...game(), slug: 'a', title: 'A' };
  const b = { ...game(), slug: 'b', title: 'B' };
  const list = type(homeJsonLd([a, b]), 'ItemList');
  assert.equal(list.numberOfItems, 2);
  assert.deepEqual(list.itemListElement.map(e => e.position), [1, 2]);
  assert.equal(list.itemListElement[0].url, 'https://just1game.com/games/a/');
});

test('홈 Organization은 WebSite의 publisher로 연결된다 (떠 있는 노드 금지)', () => {
  const ld = homeJsonLd([game()]);
  const site = type(ld, 'WebSite');
  const org = type(ld, 'Organization');
  assert.equal(site.publisher['@id'], org['@id']);
});

/* ---------- 랜딩 구조화 데이터 ---------- */

test('랜딩 JSON-LD는 VideoGame·BreadcrumbList·FAQPage를 담는다', () => {
  const ld = landingJsonLd(game());
  for (const t of ['VideoGame', 'BreadcrumbList', 'FAQPage']) {
    assert.ok(type(ld, t), `${t} 노드가 없다`);
  }
});

test('VideoGame은 무료·브라우저·모바일 사실을 명시한다', () => {
  const vg = type(landingJsonLd(game()), 'VideoGame');
  assert.equal(vg.offers.price, '0');
  assert.ok(vg.gamePlatform.includes('Web browser'));
  assert.ok(vg.url.startsWith('https://just1game.com/games/'));
  assert.ok(vg.image.startsWith('https://'));
});

test('BreadcrumbList는 홈 → 게임 2단계다', () => {
  const bc = type(landingJsonLd(game()), 'BreadcrumbList');
  assert.equal(bc.itemListElement.length, 2);
  assert.equal(bc.itemListElement[0].item, 'https://just1game.com/');
  assert.equal(bc.itemListElement[1].name, 'Cyber Snake');
});

test('FAQ가 없으면 FAQPage 노드를 만들지 않는다 (빈 스키마 금지)', () => {
  const g = game();
  delete g.faq;
  assert.equal(type(landingJsonLd(g), 'FAQPage'), undefined);
  assert.ok(type(landingJsonLd(g), 'VideoGame'));
});

test('FAQPage의 답변 수는 데이터와 일치한다', () => {
  const faq = type(landingJsonLd(game()), 'FAQPage');
  assert.equal(faq.mainEntity.length, 2);
  assert.equal(faq.mainEntity[0]['@type'], 'Question');
  assert.equal(faq.mainEntity[0].acceptedAnswer['@type'], 'Answer');
});

/* ---------- 보이는 FAQ 본문 ---------- */

test('FAQ 섹션은 질문을 h3로, 답을 p로 낸다', () => {
  const html = faqSection(game());
  assert.ok(html.includes('<h2>Frequently Asked Questions</h2>'));
  assert.equal((html.match(/<h3>/g) ?? []).length, 2);
});

test('FAQ 섹션은 HTML을 이스케이프한다', () => {
  const g = game();
  g.faq = [{ q: 'A & B?', a: 'Use <b> tags' }];
  const html = faqSection(g);
  assert.ok(html.includes('A &amp; B?'));
  assert.ok(!html.includes('<b> tags'));
});

test('FAQ가 없으면 빈 문자열이다 (빈 제목만 남지 않는다)', () => {
  const g = game();
  delete g.faq;
  assert.equal(faqSection(g), '');
});

/* ---------- 공통 head ---------- */

const head = () => headTags({
  title: 'Cyber Snake — Play Free Online | Neon Arcade',
  ogTitle: 'Cyber Snake — Play Free Online',
  description: 'Guide a growing neon snake around the grid and avoid crashing into your own tail.',
  canonical: 'https://just1game.com/games/cyber-snake/',
  ogImage: 'https://just1game.com/assets/og/cyber-snake.png'
});

test('head는 title과 og:title을 따로 낸다 (SERP와 SNS는 길이 기준이 다르다)', () => {
  const html = head();
  assert.ok(html.includes('<title>Cyber Snake — Play Free Online | Neon Arcade</title>'));
  assert.ok(html.includes('property="og:title" content="Cyber Snake — Play Free Online"'));
});

test('트위터 카드는 property가 아니라 name으로 낸다', () => {
  assert.ok(head().includes('<meta name="twitter:card"'));
  assert.ok(!head().includes('property="twitter:card"'));
});

test('공유 이미지 크기를 명시한다 — 없으면 첫 공유에서 작은 카드로 떨어진다', () => {
  assert.ok(head().includes('og:image:width" content="1200"'));
  assert.ok(head().includes('og:image:height" content="630"'));
});

test('head는 따옴표가 든 값을 이스케이프한다', () => {
  const html = headTags({
    title: 'A "quoted" game',
    description: 'Tips & tricks',
    canonical: 'https://just1game.com/',
    ogImage: 'https://just1game.com/a.png'
  });
  assert.ok(html.includes('&quot;quoted&quot;'));
  assert.ok(html.includes('Tips &amp; tricks'));
});

/* ---------- 산출물 SEO 게이트 ---------- */

const okPage = () => `<!DOCTYPE html>
<html lang="en">
<head>
<title>Cyber Snake — Play Free Online | Neon Arcade</title>
<meta name="description" content="Guide a growing neon snake around the grid, eat data nodes and avoid crashing into your own tail in this smooth take on the arcade classic.">
<link rel="canonical" href="https://just1game.com/games/cyber-snake/">
<meta property="og:image" content="https://just1game.com/assets/og/cyber-snake.png">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"VideoGame"}</script>
</head>
<body><h1>Cyber Snake</h1></body>
</html>`;

test('제대로 된 페이지는 SEO 게이트를 통과한다', () => {
  assert.deepEqual(validateSeo(okPage(), 'games/cyber-snake/index.html'), []);
});

test('canonical 부재를 잡는다', () => {
  const html = okPage().replace(/<link rel="canonical"[^>]*>/, '');
  assert.ok(validateSeo(html, 'p').some(e => e.includes('canonical')));
});

test('상대 경로 canonical을 잡는다 (절대 URL이어야 한다)', () => {
  const html = okPage().replace('https://just1game.com/games/cyber-snake/', '/games/cyber-snake/');
  assert.ok(validateSeo(html, 'p').some(e => e.includes('canonical')));
});

test('meta description 부재를 잡는다', () => {
  const html = okPage().replace(/<meta name="description"[^>]*>/, '');
  assert.ok(validateSeo(html, 'p').some(e => e.includes('meta description')));
});

test('너무 긴 meta description을 잡는다', () => {
  const html = okPage().replace(/content="Guide[^"]*"/, `content="${'x'.repeat(200)}"`);
  assert.ok(validateSeo(html, 'p').some(e => e.includes('meta description')));
});

test('너무 긴 title을 잡는다', () => {
  const html = okPage().replace(/<title>[^<]*<\/title>/, `<title>${'x'.repeat(80)}</title>`);
  assert.ok(validateSeo(html, 'p').some(e => e.includes('title')));
});

test('h1이 없으면 잡는다', () => {
  const html = okPage().replace(/<h1>[^<]*<\/h1>/, '');
  assert.ok(validateSeo(html, 'p').some(e => e.includes('h1')));
});

test('h1이 둘이면 잡는다', () => {
  const html = okPage().replace('</body>', '<h1>Another</h1></body>');
  assert.ok(validateSeo(html, 'p').some(e => e.includes('h1')));
});

test('깨진 JSON-LD를 잡는다 — 파싱해서 확인한다', () => {
  const html = okPage().replace('{"@context":"https://schema.org","@type":"VideoGame"}', '{"@context": oops}');
  assert.ok(validateSeo(html, 'p').some(e => e.includes('JSON-LD')));
});

test('상대 경로 og:image를 잡는다 (SNS는 절대 URL만 읽는다)', () => {
  const html = okPage().replace('https://just1game.com/assets/og/cyber-snake.png', '/assets/og/cyber-snake.png');
  assert.ok(validateSeo(html, 'p').some(e => e.includes('og:image')));
});

test('lang 속성 부재를 잡는다', () => {
  const html = okPage().replace('<html lang="en">', '<html>');
  assert.ok(validateSeo(html, 'p').some(e => e.includes('lang')));
});

test('게임 본체(play/)는 noindex여야 하고, 없으면 잡는다', () => {
  const html = '<html lang="en"><head><title>Cyber Snake</title></head><body></body></html>';
  assert.ok(validateSeo(html, 'play/cyber-snake.html').some(e => e.includes('noindex')));
});

test('게임 본체에는 랜딩 페이지용 규칙을 적용하지 않는다', () => {
  const html = `<html lang="en"><head><title>Cyber Snake</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="https://just1game.com/games/cyber-snake/"></head><body></body></html>`;
  assert.deepEqual(validateSeo(html, 'play/cyber-snake.html'), []);
});

test('임계값은 밖에서 읽을 수 있다 (문서와 코드가 갈라지지 않게)', () => {
  assert.ok(SEO.TITLE_MAX > SEO.TITLE_MIN);
  assert.ok(SEO.DESC_MAX > SEO.DESC_MIN);
});

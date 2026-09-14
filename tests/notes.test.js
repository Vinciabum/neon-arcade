import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  countWords, validateNotes, noteJsonLd, notesIndexJsonLd, loadNotes,
  noteUrl, noteOutPath, humanDate, NAV, NOTE_MIN_WORDS
} from '../tools/notes.js';

const ok = () => ({
  slug: 'a-note',
  title: 'A note',
  date: '2026-09-14',
  description: 'x'.repeat(100),
  summary: 'A summary that a human would read on the index page.',
  body: `<p>${'word '.repeat(NOTE_MIN_WORDS)}</p>`,
  words: NOTE_MIN_WORDS
});

test('단어 수는 태그를 빼고 센다 — 마크업이 분량으로 계산되면 게이트가 거짓말한다', () => {
  assert.equal(countWords('<p>one two three</p>'), 3);
  assert.equal(countWords('<div class="x"><em>one</em> two</div>'), 2);
  assert.equal(countWords('one &amp; two'), 2);
});

test('제대로 된 노트는 통과한다', () => {
  assert.deepEqual(validateNotes([ok()]), []);
});

test('필수 항목이 빠지면 잡는다', () => {
  const n = ok(); delete n.summary;
  assert.ok(validateNotes([n]).some(e => e.includes('summary')));
});

test('slug가 겹치면 잡는다 — 두 글이 같은 주소로 나가면 하나가 조용히 사라진다', () => {
  assert.ok(validateNotes([ok(), ok()]).some(e => e.includes('duplicate')));
});

/* 이 사이트가 "내용이 부족하다"로 거절당했다. 짧은 글을 여러 편 올리는 것은
   같은 문제를 반복하는 것이라서, 하한을 게이트로 박아 둔다. */
test('본문이 짧으면 빌드를 막는다 — 이 구역이 존재하는 이유가 그것이다', () => {
  const n = ok(); n.words = NOTE_MIN_WORDS - 1;
  assert.ok(validateNotes([n]).some(e => e.includes('reads as a stub')));
});

test('본문이 h1을 들고 있으면 잡는다 — 템플릿이 이미 하나 쓴다', () => {
  const n = ok(); n.body = '<h1>Two</h1>' + n.body;
  assert.ok(validateNotes([n]).some(e => e.includes('<h1>')));
});

test('description 길이가 산출물 SEO 게이트와 같은 범위다 — 더 느슨하면 빌드가 뒤에서 깨진다', () => {
  const short = ok(); short.description = 'too short';
  assert.ok(validateNotes([short]).some(e => e.includes('description length')));
  const long = ok(); long.description = 'x'.repeat(171);
  assert.ok(validateNotes([long]).some(e => e.includes('description length')));
});

test('날짜 형식을 강제한다 — sitemap의 lastmod가 그 값을 그대로 쓴다', () => {
  const n = ok(); n.date = '14 Sep 2026';
  assert.ok(validateNotes([n]).some(e => e.includes('YYYY-MM-DD')));
});

test('주소 규칙', () => {
  assert.equal(noteUrl('a-note'), '/notes/a-note/');
  assert.equal(noteOutPath('a-note').replace(/\\/g, '/'), 'notes/a-note/index.html');
});

test('사람이 읽는 날짜는 시간대에 흔들리지 않는다', () => {
  assert.equal(humanDate('2026-09-14'), '14 September 2026');
  assert.equal(humanDate('2026-01-01'), '1 January 2026');
});

test('BlogPosting 스키마에 저자와 두 날짜가 들어간다', () => {
  const n = ok(); n.updated = '2026-09-20';
  const post = noteJsonLd(n, 'https://just1game.com/x.png')['@graph'][0];
  assert.equal(post['@type'], 'BlogPosting');
  assert.equal(post.author.name, 'Jayden Hwang');
  assert.equal(post.datePublished, '2026-09-14');
  assert.equal(post.dateModified, '2026-09-20');
  assert.equal(post.wordCount, NOTE_MIN_WORDS);
});

test('updated가 없으면 dateModified는 발행일과 같다', () => {
  const post = noteJsonLd(ok(), 'https://just1game.com/x.png')['@graph'][0];
  assert.equal(post.dateModified, post.datePublished);
});

test('목록 스키마가 글을 전부 싣는다', () => {
  const g = notesIndexJsonLd([ok(), { ...ok(), slug: 'b-note' }])['@graph'][0];
  assert.equal(g['@type'], 'Blog');
  assert.equal(g.blogPost.length, 2);
});

test('내비게이션이 네 구역을 전부 가리킨다 — "탐색이 어렵다"가 거절 사유 목록에 있다', () => {
  for (const href of ['/', '/notes/', '/about/']) {
    assert.ok(NAV.includes(`href="${href}"`), `${href} 링크가 없다`);
  }
});

/* --- 실제 콘텐츠 --- */

test('사이트에 실린 노트가 전부 규칙을 통과한다', async () => {
  const notes = await loadNotes();
  assert.ok(notes.length >= 5, `노트가 ${notes.length}편뿐이다`);
  assert.deepEqual(validateNotes(notes), []);
});

test('노트가 최신순으로 정렬된다', async () => {
  const notes = await loadNotes();
  const dates = notes.map(n => n.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

/* --- 산출물 --- */

const build = () => execFileSync('node', ['build.js'], {
  env: { ...process.env, ADSENSE_CLIENT: 'ca-pub-6091491156053589' }, stdio: 'pipe'
});

test('노트가 페이지로 나가고, sitemap과 llms.txt가 같은 주소를 싣는다', async () => {
  build();
  const notes = await loadNotes();
  const sitemap = readFileSync('sitemap.xml', 'utf8');
  const llms = readFileSync('llms.txt', 'utf8');
  assert.ok(existsSync('notes/index.html'));
  for (const n of notes) {
    const out = noteOutPath(n.slug);
    assert.ok(existsSync(out), `${out} 가 없다`);
    assert.ok(sitemap.includes(noteUrl(n.slug)), `sitemap에 ${n.slug} 가 없다`);
    assert.ok(llms.includes(noteUrl(n.slug)), `llms.txt에 ${n.slug} 가 없다`);
  }
});

test('노트 본문에는 광고가 붙고 목록에는 붙지 않는다 — 목록은 탐색용 화면이다', async () => {
  build();
  const notes = await loadNotes();
  assert.ok(readFileSync(noteOutPath(notes[0].slug), 'utf8').includes('adsbygoogle'));
  assert.ok(!readFileSync('notes/index.html', 'utf8').includes('adsbygoogle'));
});

test('모든 산출물 페이지가 같은 내비게이션을 든다', () => {
  build();
  const pages = ['index.html', 'notes/index.html', 'about/index.html', 'credits/index.html',
                 'contact/index.html', 'privacy/index.html', 'games/pulse-lock/index.html',
                 '404.html'];
  for (const f of pages) {
    assert.ok(readFileSync(f, 'utf8').includes('class="site-nav"'), `${f} 에 내비게이션이 없다`);
  }
});

/* 거절 사유가 "too little text"였다. 길이가 품질은 아니지만, 이 사이트의 경우
   바로 그 지적을 받았으므로 하한선이 지켜지는지는 기계가 본다. */
test('본문이 실린 페이지가 최소 분량을 넘는다', () => {
  build();
  const visible = (f) => countWords(readFileSync(f, 'utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' '));
  const floors = {
    'index.html': 500,
    'about/index.html': 600,
    'credits/index.html': 500,
    'contact/index.html': 300,
    'privacy/index.html': 700,
    'games/feltling/index.html': 550
  };
  for (const [f, min] of Object.entries(floors)) {
    const w = visible(f);
    assert.ok(w >= min, `${f} 가 ${w}단어 — ${min} 미만이다`);
  }
});

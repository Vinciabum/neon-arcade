// 개발 노트(/notes/). 게임 목록만 있는 사이트는 심사자에게 "디렉터리"로 읽힌다 —
// 구글이 공표한 미승인 사유 중 "There isn't enough original, rich content that would be
// of value to users"가 정확히 그 상태를 가리킨다. 게임을 만드는 과정은 이 사이트만
// 가진 1차 자료이고, 그것을 글로 내놓는 것이 가장 정직한 해법이다.
//
// 본문은 `content/notes/<slug>.html` 조각 파일에 두고 메타데이터만 index.json에 둔다.
// 긴 글을 JSON 문자열에 넣으면 줄바꿈이 전부 \n으로 눌려서 diff를 읽을 수 없다.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SITE_ORIGIN, absUrl } from './paths.js';
import { esc } from './render.js';

export const NOTES_DIR = 'content/notes';
export const AUTHOR = { name: 'Jayden Hwang', url: `${SITE_ORIGIN}/about/` };

export const noteUrl = (slug) => `/notes/${slug}/`;
export const noteOutPath = (slug) => path.join('notes', slug, 'index.html');

// 사이트 전체 내비게이션. 세 템플릿이 각자 들고 있으면 한 곳만 고쳐지는 사고가 난다.
// 미승인 사유에 "found difficult to navigate"가 따로 적혀 있어서, 모든 페이지에서
// 모든 구역에 한 번에 닿을 수 있어야 한다.
export const NAV = `<nav class="site-nav" aria-label="Main">
  <a class="nav-brand" href="/">Neon Arcade</a>
  <a href="/">Games</a>
  <a href="/notes/">Dev notes</a>
  <a href="/about/">About</a>
</nav>`;

const REQUIRED = ['slug', 'title', 'description', 'date', 'summary'];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// 본문이 짧으면 글이 아니라 안내문이다. 이 사이트가 거절당한 이유가 그것이라
// 하한을 게이트로 박아 둔다. 400단어는 "완결된 문단"의 최소치로 잡았다.
export const NOTE_MIN_WORDS = 400;

export function countWords(html) {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

export async function loadNotes(dir = NOTES_DIR) {
  const index = JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8'));
  const notes = [];
  for (const meta of index) {
    const body = await readFile(path.join(dir, `${meta.slug}.html`), 'utf8');
    notes.push({ ...meta, body, words: countWords(body) });
  }
  // 새 글이 위로. 목록과 sitemap이 같은 순서를 쓴다.
  notes.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return notes;
}

export function validateNotes(notes) {
  const errors = [];
  const seen = new Set();
  for (const [i, n] of notes.entries()) {
    const at = `notes[${i}] (${n.slug ?? 'no-slug'})`;
    for (const f of REQUIRED) {
      if (!n[f]) errors.push(`${at}: missing field: ${f}`);
    }
    if (!n.slug) continue;
    if (!SLUG_RE.test(n.slug)) errors.push(`${at}: invalid slug`);
    if (seen.has(n.slug)) errors.push(`${at}: duplicate slug "${n.slug}"`);
    seen.add(n.slug);
    if (n.description && (n.description.length < 70 || n.description.length > 170)) {
      errors.push(`${at}: description length ${n.description.length} outside 70-170 — the output SEO gate uses the same range`);
    }
    if (n.date && !/^\d{4}-\d{2}-\d{2}$/.test(n.date)) errors.push(`${at}: date must be YYYY-MM-DD`);
    if (typeof n.words === 'number' && n.words < NOTE_MIN_WORDS) {
      errors.push(`${at}: body is ${n.words} words — under ${NOTE_MIN_WORDS} it reads as a stub, which is the thing this section exists to stop`);
    }
    if (n.body && /<h1[\s>]/i.test(n.body)) {
      errors.push(`${at}: body carries its own <h1> — the template already writes one and two of them fail the output gate`);
    }
  }
  return errors;
}

export function noteJsonLd(note, ogImage) {
  const url = absUrl(noteUrl(note.slug));
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${url}#post`,
        headline: note.title,
        description: note.description,
        url,
        image: ogImage,
        datePublished: note.date,
        dateModified: note.updated ?? note.date,
        inLanguage: 'en',
        wordCount: note.words,
        author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url },
        publisher: { '@id': `${SITE_ORIGIN}/#organization` },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Dev notes', item: absUrl('/notes/') },
          { '@type': 'ListItem', position: 3, name: note.title, item: url }
        ]
      }
    ]
  };
}

export function notesIndexJsonLd(notes) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Blog',
        '@id': `${absUrl('/notes/')}#blog`,
        name: 'Neon Arcade dev notes',
        url: absUrl('/notes/'),
        description: 'First-hand write-ups on building and shipping original browser games.',
        inLanguage: 'en',
        author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url },
        blogPost: notes.map(n => ({
          '@type': 'BlogPosting',
          headline: n.title,
          url: absUrl(noteUrl(n.slug)),
          datePublished: n.date
        }))
      }
    ]
  };
}

// 사람이 읽는 날짜. 기계용 datetime은 따로 싣는다.
export const humanDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  });

export function noteCard(note) {
  return `      <article class="note-card">
        <a href="${noteUrl(note.slug)}">
          <time datetime="${esc(note.date)}">${esc(humanDate(note.date))}</time>
          <h2>${esc(note.title)}</h2>
          <p>${esc(note.summary)}</p>
        </a>
      </article>`;
}

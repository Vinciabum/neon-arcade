import { gamePath, thumbPath, ogPath } from './paths.js';
import { validateMechanics } from './mechanics.js';

const REQUIRED_FIELDS = ['slug', 'title', 'tagline', 'description', 'tag', 'controls', 'howToPlay', 'releasedAt', 'status'];
const VALID_STATUS = ['draft', 'published', 'demoted', 'removed'];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const THUMB_MAX_BYTES = 200 * 1024;
const OG_MAX_BYTES = 600 * 1024;
const GAME_MAX_BYTES = 500 * 1024;
const DESC_MIN = 80;
// SEO 게이트(tools/seo.js의 SEO.DESC_MAX)와 같은 값이어야 한다. 여기가 더 느슨하면
// 200자짜리 설명이 데이터 검사를 통과했다가 산출물 단계에서 빌드를 깬다 — 실제로 그랬다.
// 게임을 쓰는 사람에게는 여기서 막히는 편이 훨씬 빨리 이해된다.
const DESC_MAX = 170;

// FAQ는 랜딩 페이지의 유일한 고유 본문이자, 검색·AI 답변에 인용되는 부분이다.
const FAQ_MIN_ITEMS = 2;
const FAQ_MIN_ANSWER = 25;
// 페이지를 만드는 상태. draft·removed는 산출물이 없으므로 본문 요건을 묻지 않는다.
const PUBLISHED_STATUS = ['published', 'demoted'];

// 프로덕션에 새어나가면 안 되는 작성 흔적.
// 2026-02-18 커밋에서 실제로 40줄이 배포된 사고의 재발 방지 장치.
export const LEAKED_COMMENT_PATTERNS = [
  /I am supposed to/i,
  /I will assume/i,
  /the instruction (only )?asks/i,
  /we should (modify|remove|assume)/i,
  /for now, I will/i,
  /but I am/i,
  /TODO:/,
  /FIXME:/,
  /XXX:/
];

export function validateGames(games, { exists, sizeOf }) {
  const errors = [];
  const seen = new Set();

  for (const [i, game] of games.entries()) {
    const where = `games[${i}] (${game.slug ?? 'no-slug'})`;

    for (const field of REQUIRED_FIELDS) {
      if (game[field] === undefined || game[field] === null || game[field] === '') {
        errors.push(`${where}: missing field: ${field}`);
      }
    }
    if (!game.slug) continue;

    if (!SLUG_RE.test(game.slug)) {
      errors.push(`${where}: invalid slug — lowercase letters, digits and single hyphens only`);
      continue;
    }
    if (seen.has(game.slug)) {
      errors.push(`${where}: duplicate slug "${game.slug}"`);
    }
    seen.add(game.slug);

    if (game.status && !VALID_STATUS.includes(game.status)) {
      errors.push(`${where}: invalid status "${game.status}" — expected one of ${VALID_STATUS.join(', ')}`);
    }

    if (typeof game.description === 'string') {
      const len = game.description.length;
      if (len < DESC_MIN || len > DESC_MAX) {
        errors.push(`${where}: description length ${len} outside ${DESC_MIN}-${DESC_MAX}`);
      }
    }

    // removed 상태는 산출물을 만들지 않으므로 파일 검사에서 제외
    if (game.status === 'removed') continue;

    const gp = gamePath(game.slug);
    if (!exists(gp)) {
      errors.push(`${where}: missing game file ${gp}`);
    } else if (sizeOf(gp) > GAME_MAX_BYTES) {
      errors.push(`${where}: game file too large — ${sizeOf(gp)} bytes exceeds ${GAME_MAX_BYTES}`);
    }

    const tp = thumbPath(game.slug);
    if (!exists(tp)) {
      errors.push(`${where}: missing thumbnail ${tp}`);
    } else if (sizeOf(tp) > THUMB_MAX_BYTES) {
      errors.push(`${where}: thumbnail too large — ${sizeOf(tp)} bytes exceeds ${THUMB_MAX_BYTES}`);
    }

    const op = ogPath(game.slug);
    if (!exists(op)) {
      errors.push(`${where}: missing share image ${op} — run: npm run og -- ${game.slug}`);
    } else if (sizeOf(op) > OG_MAX_BYTES) {
      errors.push(`${where}: share image too large — ${sizeOf(op)} bytes exceeds ${OG_MAX_BYTES}`);
    }

    if (!PUBLISHED_STATUS.includes(game.status)) continue;

    for (const err of validateMechanics(game.mechanics)) {
      errors.push(`${where}: ${err}`);
    }

    // 사람이 실제로 검색하는 장르 단어. 게임 이름은 우리가 지어낸 말이라 검색 수요가 없다.
    const term = String(game.genreTerm ?? '').trim();
    if (!term) {
      errors.push(`${where}: genreTerm is missing — the title needs a phrase people actually search for`);
    } else if (game.title && term.toLowerCase().includes(game.title.toLowerCase())) {
      errors.push(`${where}: genreTerm "${term}" contains the game's own name — that phrase has no search demand`);
    }

    const faq = game.faq;
    if (!Array.isArray(faq) || faq.length < FAQ_MIN_ITEMS) {
      errors.push(`${where}: faq needs at least ${FAQ_MIN_ITEMS} entries — it is the only unique copy on the landing page`);
    } else {
      for (const [j, item] of faq.entries()) {
        if (!item?.q?.trim()) errors.push(`${where}: faq[${j}] has an empty question`);
        if (!item?.a?.trim()) {
          errors.push(`${where}: faq[${j}] has an empty answer`);
        } else if (item.a.trim().length < FAQ_MIN_ANSWER) {
          errors.push(`${where}: faq[${j}] answer is ${item.a.trim().length} chars — under ${FAQ_MIN_ANSWER} it cannot stand on its own when quoted`);
        }
      }
    }
  }

  return errors;
}

export function validateOutput(html, label) {
  const errors = [];
  for (const pattern of LEAKED_COMMENT_PATTERNS) {
    const match = html.match(pattern);
    if (match) {
      errors.push(`${label}: leaked authoring comment — matched ${pattern} near "${match[0]}"`);
    }
  }
  return errors;
}

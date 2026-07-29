import { gamePath, thumbPath } from './paths.js';

const REQUIRED_FIELDS = ['slug', 'title', 'tagline', 'description', 'tag', 'controls', 'howToPlay', 'releasedAt', 'status'];
const VALID_STATUS = ['draft', 'published', 'demoted', 'removed'];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const THUMB_MAX_BYTES = 200 * 1024;
const GAME_MAX_BYTES = 500 * 1024;
const DESC_MIN = 80;
const DESC_MAX = 200;

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

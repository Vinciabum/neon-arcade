import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGames, validateOutput } from '../tools/validate.js';
import { SEO } from '../tools/seo.js';

// 모든 파일이 존재하고 크기가 적정한 기본 환경
const okEnv = { exists: () => true, sizeOf: () => 50_000 };

const validGame = {
  slug: 'dino-jump',
  title: 'Dino Jump',
  tagline: 'A high-speed endless runner.',
  description: 'Run, jump and dodge cacti in this neon endless runner. Collect coins, buy power-ups in the shop and chase your best distance.',
  tag: 'Runner',
  genreTerm: 'endless runner game',
  controls: { keyboard: 'Space to jump', touch: 'Tap to jump' },
  howToPlay: ['Tap or press Space to jump over cacti.'],
  faq: [
    { q: 'How is the score calculated?', a: 'The score is the distance you cover before you hit something.' },
    { q: 'Does it work on a phone?', a: 'Yes. Tap anywhere on the screen to jump.' }
  ],
  mechanics: { input: 'one-button', goal: 'survive', failure: 'collision', world: 'auto-scroll' },
  releasedAt: '2026-02-18',
  status: 'published'
};

test('정상 게임은 에러가 없다', () => {
  assert.deepEqual(validateGames([validGame], okEnv), []);
});

test('슬러그 중복을 잡는다', () => {
  const errors = validateGames([validGame, { ...validGame }], okEnv);
  assert.ok(errors.some(e => e.includes('duplicate slug')));
});

test('슬러그 형식 위반을 잡는다', () => {
  const errors = validateGames([{ ...validGame, slug: 'Dino_Jump' }], okEnv);
  assert.ok(errors.some(e => e.includes('invalid slug')));
});

test('게임 본체 파일 부재를 잡는다', () => {
  const env = { exists: (p) => !p.startsWith('play/'), sizeOf: () => 50_000 };
  const errors = validateGames([validGame], env);
  assert.ok(errors.some(e => e.includes('missing game file')));
});

test('썸네일 부재를 잡는다', () => {
  const env = { exists: (p) => !p.startsWith('assets/thumbs/'), sizeOf: () => 50_000 };
  const errors = validateGames([validGame], env);
  assert.ok(errors.some(e => e.includes('missing thumbnail')));
});

test('썸네일 200KB 초과를 잡는다', () => {
  const env = { exists: () => true, sizeOf: (p) => p.includes('thumbs') ? 300_000 : 50_000 };
  const errors = validateGames([validGame], env);
  assert.ok(errors.some(e => e.includes('thumbnail too large')));
});

test('게임 본체 500KB 초과를 잡는다', () => {
  const env = { exists: () => true, sizeOf: (p) => p.startsWith('play/') ? 900_000 : 50_000 };
  const errors = validateGames([validGame], env);
  assert.ok(errors.some(e => e.includes('game file too large')));
});

test('필수 필드 누락을 잡는다', () => {
  const { title, ...noTitle } = validGame;
  const errors = validateGames([noTitle], okEnv);
  assert.ok(errors.some(e => e.includes('missing field: title')));
});

test('description 길이 범위 밖을 잡는다', () => {
  const errors = validateGames([{ ...validGame, description: 'too short' }], okEnv);
  assert.ok(errors.some(e => e.includes('description length')));
});

test('description 상한은 SEO 게이트와 같다 — 데이터에서 통과한 뒤 빌드가 깨지면 안 된다', () => {
  const long = 'x'.repeat(SEO.DESC_MAX + 1);
  const errors = validateGames([{ ...validGame, description: long }], okEnv);
  assert.ok(errors.some(e => e.includes('description length')));

  const atLimit = 'x'.repeat(SEO.DESC_MAX);
  assert.ok(!validateGames([{ ...validGame, description: atLimit }], okEnv).some(e => e.includes('description length')));
});

test('알 수 없는 status를 잡는다', () => {
  const errors = validateGames([{ ...validGame, status: 'live' }], okEnv);
  assert.ok(errors.some(e => e.includes('invalid status')));
});

test('산출물의 AI 작업 주석을 잡는다', () => {
  const html = `<script>\n// But I am supposed to make "no unrelated edits".\n</script>`;
  const errors = validateOutput(html, 'index.html');
  assert.ok(errors.some(e => e.includes('leaked authoring comment')));
});

test('깨끗한 산출물은 통과한다', () => {
  assert.deepEqual(validateOutput('<h1>Neon Arcade</h1>', 'index.html'), []);
});

/* ---------- 공유 카드 이미지 ---------- */

test('og 이미지 부재를 잡는다', () => {
  const env = { exists: (p) => !p.startsWith('assets/og/'), sizeOf: () => 50_000 };
  const errors = validateGames([validGame], env);
  assert.ok(errors.some(e => e.includes('missing share image')));
});

test('과대한 og 이미지를 잡는다', () => {
  const env = { exists: () => true, sizeOf: (p) => (p.startsWith('assets/og/') ? 900_000 : 50_000) };
  const errors = validateGames([validGame], env);
  assert.ok(errors.some(e => e.includes('share image too large')));
});

/* ---------- FAQ ---------- */
// 랜딩 페이지의 유일한 고유 본문이다. 빠지면 페이지가 다른 게임 사이트와 구별되지 않는다.

test('FAQ 부재를 잡는다', () => {
  const { faq, ...noFaq } = validGame;
  const errors = validateGames([noFaq], okEnv);
  assert.ok(errors.some(e => e.includes('faq')));
});

test('FAQ가 2개 미만이면 잡는다', () => {
  const errors = validateGames([{ ...validGame, faq: [validGame.faq[0]] }], okEnv);
  assert.ok(errors.some(e => e.includes('faq')));
});

test('빈 질문·빈 답변을 각각 한 번씩 잡는다', () => {
  const faq = [
    { q: 'Real question?', a: '' },
    { q: '', a: 'An answer long enough to stand on its own when quoted.' }
  ];
  const errors = validateGames([{ ...validGame, faq }], okEnv).filter(e => e.includes('faq'));
  assert.equal(errors.length, 2);
  assert.ok(errors.some(e => e.includes('faq[0] has an empty answer')));
  assert.ok(errors.some(e => e.includes('faq[1] has an empty question')));
});

test('짧은 답변을 잡는다 — 한 문장은 되어야 인용될 수 있다', () => {
  const errors = validateGames([{ ...validGame, faq: [{ q: 'Is it free?', a: 'Yes.' }, validGame.faq[1]] }], okEnv);
  assert.ok(errors.some(e => e.includes('faq')));
});

test('draft 게임에는 FAQ를 요구하지 않는다 — 페이지를 만들지 않기 때문이다', () => {
  const { faq, ...noFaq } = validGame;
  const errors = validateGames([{ ...noFaq, status: 'draft' }], okEnv);
  assert.ok(!errors.some(e => e.includes('faq')));
});

/* ---------- 메커니즘 ---------- */

test('mechanics 부재를 잡는다', () => {
  const { mechanics, ...noMech } = validGame;
  const errors = validateGames([noMech], okEnv);
  assert.ok(errors.some(e => e.includes('mechanics is missing')));
});

test('알 수 없는 축 값을 잡는다', () => {
  const game = { ...validGame, mechanics: { input: 'wiggle', goal: 'survive', failure: 'collision', world: 'auto-scroll' } };
  const errors = validateGames([game], okEnv);
  assert.ok(errors.some(e => e.includes('mechanics.input "wiggle"')));
});

test('축 하나가 빠진 것을 잡는다', () => {
  const game = { ...validGame, mechanics: { input: 'one-button', goal: 'survive', failure: 'collision' } };
  const errors = validateGames([game], okEnv);
  assert.ok(errors.some(e => e.includes('mechanics.world is missing')));
});

test('draft 게임에는 mechanics를 요구하지 않는다', () => {
  const { mechanics, ...noMech } = validGame;
  const errors = validateGames([{ ...noMech, status: 'draft' }], okEnv);
  assert.ok(!errors.some(e => e.includes('mechanics')));
});

/* ---------- 검색되는 장르 단어 ---------- */

test('genreTerm 부재를 잡는다', () => {
  const { genreTerm, ...noTerm } = validGame;
  const errors = validateGames([noTerm], okEnv);
  assert.ok(errors.some(e => e.includes('genreTerm')));
});

test('브랜드명을 genreTerm에 넣은 것을 잡는다 — 검색 수요가 없는 단어다', () => {
  const game = { ...validGame, genreTerm: 'Dino Jump game' };
  const errors = validateGames([game], okEnv);
  assert.ok(errors.some(e => e.includes('genreTerm')));
});

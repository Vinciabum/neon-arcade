import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGames, validateOutput } from '../tools/validate.js';

// 모든 파일이 존재하고 크기가 적정한 기본 환경
const okEnv = { exists: () => true, sizeOf: () => 50_000 };

const validGame = {
  slug: 'dino-jump',
  title: 'Dino Jump',
  tagline: 'A high-speed endless runner.',
  description: 'Run, jump and dodge cacti in this neon endless runner. Collect coins, buy power-ups in the shop and chase your best distance.',
  tag: 'Runner',
  controls: { keyboard: 'Space to jump', touch: 'Tap to jump' },
  howToPlay: ['Tap or press Space to jump over cacti.'],
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

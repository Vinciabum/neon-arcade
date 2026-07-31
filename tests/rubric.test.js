import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCard, RUBRIC } from '../tools/rubric.js';

// 실제 심사 카드에 들어갈 법한 길이의 근거. 30자 하한을 넉넉히 넘는다.
const NOTE = 'The player sprite starts moving on the frame after the key press and stops dead with no slide.';

const okCard = () => ({
  slug: 'photon-sort',
  scores: {
    responsiveness: { score: 16, note: NOTE },
    difficulty: { score: 15, note: NOTE },
    visual: { score: 14, note: NOTE },
    session: { score: 15, note: NOTE },
    distinctiveness: { score: 13, note: NOTE }
  }
});

test('정상 채점표는 합계와 통과 판정을 낸다', () => {
  const result = scoreCard(okCard());
  assert.deepEqual(result.errors, []);
  assert.equal(result.total, 73);
  assert.equal(result.verdict, 'pass');
});

test('컷라인 미만은 재생성 판정이다', () => {
  const card = okCard();
  card.scores.visual.score = 4;
  const result = scoreCard(card);
  assert.equal(result.total, 63);
  assert.equal(result.verdict, 'regenerate');
});

test('항목이 빠지면 채점 자체를 무효로 본다', () => {
  const card = okCard();
  delete card.scores.session;
  const result = scoreCard(card);
  assert.ok(result.errors.some(e => e.includes('session')));
  assert.equal(result.verdict, 'invalid');
});

test('배점을 넘는 점수를 잡는다', () => {
  const card = okCard();
  card.scores.visual.score = 25;
  assert.ok(scoreCard(card).errors.some(e => e.includes('visual')));
});

test('음수 점수를 잡는다', () => {
  const card = okCard();
  card.scores.visual.score = -1;
  assert.ok(scoreCard(card).errors.some(e => e.includes('visual')));
});

test('근거 없는 점수를 잡는다 — 숫자만으로는 검증할 수 없다', () => {
  const card = okCard();
  card.scores.difficulty.note = 'good';
  const result = scoreCard(card);
  assert.ok(result.errors.some(e => e.includes('difficulty') && e.includes('note')));
  assert.equal(result.verdict, 'invalid');
});

test('점수가 숫자가 아니면 잡는다', () => {
  const card = okCard();
  card.scores.visual.score = '14';
  assert.ok(scoreCard(card).errors.some(e => e.includes('visual')));
});

test('만점은 100점이다', () => {
  const total = RUBRIC.AXES.reduce((sum, a) => sum + a.max, 0);
  assert.equal(total, 100);
});

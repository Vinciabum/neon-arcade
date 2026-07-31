import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDuplicate, matchedAxes, DUP } from '../tools/duplicate.js';

const snake = {
  slug: 'cyber-snake',
  title: 'Cyber Snake',
  mechanics: { input: 'swipe-turn', goal: 'collect', failure: 'collision', world: 'fixed-grid' }
};
const dodge = {
  slug: 'neon-dodge',
  title: 'Neon Dodge',
  mechanics: { input: 'steer-free', goal: 'survive', failure: 'collision', world: 'free-arena' }
};
const existing = [snake, dodge];

test('완전히 다른 컨셉은 통과한다', () => {
  const candidate = {
    slug: 'photon-sort',
    title: 'Photon Sort',
    mechanics: { input: 'drag-object', goal: 'clear-board', failure: 'none', world: 'fixed-arena' }
  };
  const result = checkDuplicate(candidate, existing);
  assert.equal(result.verdict, 'ok');
  assert.deepEqual(result.reasons, []);
});

test('4축이 전부 같으면 거부한다', () => {
  const candidate = {
    slug: 'data-worm',
    title: 'Data Worm',
    mechanics: { ...snake.mechanics }
  };
  const result = checkDuplicate(candidate, existing);
  assert.equal(result.verdict, 'reject');
  assert.ok(result.reasons.some(r => r.includes('cyber-snake')));
});

test('3축이 같으면 거부가 아니라 경고다', () => {
  const candidate = {
    slug: 'ion-drift',
    title: 'Ion Drift',
    mechanics: { input: 'steer-free', goal: 'destroy', failure: 'collision', world: 'free-arena' }
  };
  const result = checkDuplicate(candidate, existing);
  assert.equal(result.verdict, 'warn');
  assert.ok(result.reasons.some(r => r.includes('neon-dodge')));
});

test('경고는 어떤 축이 겹쳤는지 이름을 댄다', () => {
  const candidate = {
    slug: 'ion-drift',
    title: 'Ion Drift',
    mechanics: { input: 'steer-free', goal: 'destroy', failure: 'collision', world: 'free-arena' }
  };
  const reason = checkDuplicate(candidate, existing).reasons[0];
  assert.ok(reason.includes('input'));
  assert.ok(reason.includes('world'));
});

test('슬러그의 끝 단어가 같으면 거부한다 — 메커니즘이 달라도', () => {
  const candidate = {
    slug: 'plasma-snake',
    title: 'Plasma Snake',
    mechanics: { input: 'tap-target', goal: 'solve', failure: 'none', world: 'fixed-arena' }
  };
  const result = checkDuplicate(candidate, existing);
  assert.equal(result.verdict, 'reject');
  assert.ok(result.reasons.some(r => r.includes('snake')));
});

test('자기 자신과는 중복 판정하지 않는다 — 재심사 때 걸리면 안 된다', () => {
  const result = checkDuplicate(snake, existing);
  assert.equal(result.verdict, 'ok');
});

test('matchedAxes는 일치한 축 이름을 정렬해서 준다', () => {
  const axes = matchedAxes(snake.mechanics, { ...snake.mechanics, goal: 'survive' });
  assert.deepEqual(axes, ['failure', 'input', 'world']);
});

test('임계값은 밖에서 읽을 수 있다', () => {
  assert.equal(DUP.REJECT_AT, 4);
  assert.equal(DUP.WARN_AT, 3);
});

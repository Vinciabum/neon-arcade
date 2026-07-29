import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fill, esc } from '../tools/render.js';

test('fill은 토큰을 치환한다', () => {
  assert.equal(fill('a{{X}}c', { X: 'b' }), 'abc');
});

test('fill은 같은 토큰을 모두 치환한다', () => {
  assert.equal(fill('{{X}}-{{X}}', { X: 'y' }), 'y-y');
});

test('fill은 치환되지 않은 토큰이 남으면 던진다', () => {
  assert.throws(() => fill('a{{MISSING}}', {}), /unfilled token: MISSING/);
});

test('esc는 HTML 특수문자를 이스케이프한다', () => {
  assert.equal(esc('a & b < c > "d"'), 'a &amp; b &lt; c &gt; &quot;d&quot;');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTech } from '../tools/gates.js';

// 게이트 1을 통과하는 기준 리포트. 각 테스트는 여기서 한 가지만 망가뜨린다.
const okTech = () => ({
  label: 'game-base',
  loadMs: 820,
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  canvas: { found: true, cssWidth: 390, cssHeight: 520, variance: 34.5, inView: true },
  listeners: ['keydown', 'touchstart', 'visibilitychange'],
  mobile: { scrollWidth: 390, innerWidth: 390 }
});

test('깨끗한 리포트는 통과한다', () => {
  assert.deepEqual(checkTech(okTech()), []);
});

test('콘솔 에러를 잡는다', () => {
  const r = okTech();
  r.consoleErrors = ['Uncaught TypeError: x is not a function'];
  const errors = checkTech(r);
  assert.ok(errors.some(e => e.includes('console error')));
});

test('페이지 예외를 잡는다', () => {
  const r = okTech();
  r.pageErrors = ['ReferenceError: draw is not defined'];
  assert.ok(checkTech(r).some(e => e.includes('page error')));
});

test('실패한 리소스 요청을 잡는다', () => {
  const r = okTech();
  r.failedRequests = ['assets/missing.png'];
  assert.ok(checkTech(r).some(e => e.includes('failed request')));
});

test('캔버스 부재를 잡는다', () => {
  const r = okTech();
  r.canvas = { found: false };
  assert.ok(checkTech(r).some(e => e.includes('no canvas')));
});

test('빈 캔버스를 잡는다', () => {
  const r = okTech();
  r.canvas.variance = 0.4;
  assert.ok(checkTech(r).some(e => e.includes('canvas appears blank')));
});

test('터치 핸들러 부재를 잡는다', () => {
  const r = okTech();
  r.listeners = ['keydown'];
  assert.ok(checkTech(r).some(e => e.includes('no touch input')));
});

test('pointerdown도 터치 입력으로 인정한다', () => {
  const r = okTech();
  r.listeners = ['keydown', 'pointerdown'];
  assert.deepEqual(checkTech(r), []);
});

test('2초 초과 로드를 잡는다', () => {
  const r = okTech();
  r.loadMs = 2600;
  assert.ok(checkTech(r).some(e => e.includes('slow load')));
});

test('모바일 가로 넘침을 잡는다', () => {
  const r = okTech();
  r.mobile = { scrollWidth: 520, innerWidth: 390 };
  assert.ok(checkTech(r).some(e => e.includes('horizontal overflow')));
});

test('캔버스가 화면 밖이면 잡는다', () => {
  const r = okTech();
  r.canvas.inView = false;
  assert.ok(checkTech(r).some(e => e.includes('canvas outside viewport')));
});

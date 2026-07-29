import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gamePath, thumbPath, landingUrl, landingOutPath } from '../tools/paths.js';

test('gamePath는 슬러그에서 게임 본체 경로를 만든다', () => {
  assert.equal(gamePath('dino-jump'), 'play/dino-jump.html');
});

test('thumbPath는 슬러그에서 썸네일 경로를 만든다', () => {
  assert.equal(thumbPath('dino-jump'), 'assets/thumbs/dino-jump.webp');
});

test('landingUrl은 슬래시로 끝나는 디렉터리 URL이다', () => {
  assert.equal(landingUrl('dino-jump'), '/games/dino-jump/');
});

test('landingOutPath는 index.html로 끝난다', () => {
  assert.equal(landingOutPath('dino-jump'), 'games/dino-jump/index.html');
});

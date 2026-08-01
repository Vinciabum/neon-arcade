import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectPortal } from '../tools/portal.js';

const page = () => `<!DOCTYPE html>
<html lang="en">
<head>
<title>Flux Sort — Neon Arcade</title>
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="https://just1game.com/games/flux-sort/">
</head>
<body>
<button id="startBtn">Play</button>
<button id="againBtn">Sort again</button>
</body>
</html>`;

test('SDK를 head에 넣는다 — 게임이 시작되기 전에 로드되어야 한다', () => {
  const out = injectPortal(page(), 'abc123');
  const head = out.slice(0, out.indexOf('</head>'));
  assert.ok(head.includes('gamedistribution-jssdk'));
  assert.ok(head.includes('html5.api.gamedistribution.com/main.min.js'));
});

test('gameId를 GD_OPTIONS에 넣는다', () => {
  assert.ok(injectPortal(page(), 'abc123').includes('"gameId": "abc123"'));
});

test('gameId 없이는 만들지 않는다 — 빈 값으로 납품하면 수익이 어디에도 안 붙는다', () => {
  assert.throws(() => injectPortal(page(), ''), /gameId is required/);
  assert.throws(() => injectPortal(page(), undefined), /gameId is required/);
});

test('두 번 주입하지 않는다 — SDK는 한 번만 로드해야 한다', () => {
  const once = injectPortal(page(), 'abc123');
  assert.throws(() => injectPortal(once, 'abc123'), /already injected/);
});

test('광고 중 일시정지와 음소거를 배선한다 — 배경음은 포털 규정 위반이다', () => {
  const out = injectPortal(page(), 'abc123');
  assert.ok(out.includes('SDK_GAME_PAUSE'));
  assert.ok(out.includes('SDK_GAME_START'));
  assert.ok(out.includes('__PORTAL_AUDIO__'));
  assert.ok(out.includes('.mute()'));
});

test('시작 버튼과 다시하기 버튼에 광고를 건다 — 프리롤과 미드롤', () => {
  const out = injectPortal(page(), 'abc123');
  assert.ok(out.includes("wire('startBtn'"));
  assert.ok(out.includes("wire('againBtn'"));
});

test('색인 지시를 걷어낸다 — 납품본은 포털 안에서 돈다', () => {
  const out = injectPortal(page(), 'abc123');
  assert.ok(!out.includes('name="robots"'));
  assert.ok(!out.includes('rel="canonical"'));
});

test('게임 본문은 건드리지 않는다', () => {
  const out = injectPortal(page(), 'abc123');
  assert.ok(out.includes('<button id="startBtn">Play</button>'));
  assert.ok(out.includes('<title>Flux Sort — Neon Arcade</title>'));
});

test('넣을 자리가 없으면 조용히 넘어가지 않는다', () => {
  assert.throws(() => injectPortal('<html><body></body></html>', 'abc'), /no <\/head>/);
  assert.throws(() => injectPortal('<html><head></head></html>', 'abc'), /no <\/body>/);
});

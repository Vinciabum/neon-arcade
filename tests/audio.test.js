import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gamePath } from '../tools/paths.js';

// 관측 계약을 갖춘 게임들 = BGM을 넣은 게임들. 기존 9개는 손대지 않았다.
const SCORED = ['ember-drift', 'flux-sort', 'lantern-keeper', 'null-cascade',
  'pulse-lock', 'shard-weave', 'signal-relay', 'stack-purge'];

const read = (slug) => readFileSync(gamePath(slug), 'utf8');
const song = (html) => {
  const m = html.match(/const SONG = \{[\s\S]*?\};/);
  return m ? m[0] : null;
};

test('8개 전부 BGM을 갖는다 — GD는 BGM을 필수로 요구한다', () => {
  for (const slug of SCORED) {
    assert.ok(read(slug).includes('const BGM = '), `${slug}에 BGM이 없다`);
  }
});

test('게임마다 곡이 다르다 — 같은 곡을 틀면 8개가 한 게임처럼 들린다', () => {
  const seen = new Map();
  for (const slug of SCORED) {
    const s = song(read(slug));
    assert.ok(s, `${slug}에서 SONG을 못 찾았다`);
    assert.ok(!seen.has(s), `${slug}와 ${seen.get(s)}가 같은 곡이다`);
    seen.set(s, slug);
  }
});

test('BGM은 게임의 actx를 쓴다 — 자기 AudioContext를 만들면 광고 중에 안 꺼진다', () => {
  for (const slug of SCORED) {
    const html = read(slug);
    const bgm = html.slice(html.indexOf('const BGM = '));
    assert.ok(bgm.includes('actx.createOscillator'), `${slug}: 게임 컨텍스트를 안 쓴다`);
    assert.ok(!bgm.includes('new AudioContext'), `${slug}: BGM이 컨텍스트를 따로 만든다`);
    assert.ok(!bgm.includes('webkitAudioContext'), `${slug}: BGM이 컨텍스트를 따로 만든다`);
  }
});

test('BGM은 state를 직접 읽는다 — 상태 전이 네 곳에 배선하면 한 곳을 빠뜨린다', () => {
  for (const slug of SCORED) {
    const html = read(slug);
    const bgm = html.slice(html.indexOf('const BGM = '));
    assert.match(bgm, /state === S\.PLAYING/, `${slug}: state를 안 본다`);
  }
});

test('rAF 안에서 음을 만들지 않는다 — 게이트 1의 fps 하한이 있다', () => {
  for (const slug of SCORED) {
    const html = read(slug);
    const bgm = html.slice(html.indexOf('const BGM = '), html.indexOf('/* ---------- 캔버스'));
    assert.ok(!bgm.includes('requestAnimationFrame'), `${slug}: BGM이 프레임에 붙어 있다`);
    assert.match(bgm, /setInterval\(/, `${slug}: 스케줄러가 없다`);
  }
});

test('소리를 끌 수 있다 — 끄면 다음 방문에도 꺼져 있다', () => {
  for (const slug of SCORED) {
    const html = read(slug);
    assert.ok(html.includes('id="muteBtn"'), `${slug}: 뮤트 버튼이 없다`);
    assert.match(html, /just1game:' \+ SLUG \+ ':muted'/, `${slug}: 뮤트가 저장되지 않는다`);
  }
});

// 플레이 밴드 BAND = 390/806 이 HUD 38px에서 나온다. 버튼이 줄 상자를 밀면
// 8개 게임의 조작 목표 크기가 통째로 달라진다 — 게임 코드는 하나도 안 건드렸는데.
test('HUD 버튼은 줄 상자를 밀지 않는다 — 밴드(390/806)가 여기서 나온다', () => {
  for (const slug of SCORED) {
    const css = read(slug).match(/#hud button \{[^}]*\}/);
    assert.ok(css, `${slug}: #hud button 규칙이 없다`);
    assert.match(css[0], /font: inherit/, `${slug}: font를 물려받지 않으면 높이가 달라진다`);
    assert.match(css[0], /padding: 0/, `${slug}: padding이 HUD를 민다`);
    assert.match(css[0], /border: 0/, `${slug}: border가 HUD를 민다`);
  }
});

test('기존 9개는 건드리지 않았다', () => {
  for (const slug of ['cyber-snake', 'dino-jump', 'neon-rise']) {
    assert.ok(!read(slug).includes('const BGM = '), `${slug}가 바뀌었다`);
  }
});

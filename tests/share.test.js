import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { shareBlock, SHARE_SCRIPT, LABEL_GAME, LABEL_SCORE } from '../tools/share.js';

const game = () => ({ slug: 'pulse-lock', title: 'Pulse Lock' });

test('공유 블록은 랜딩의 절대 URL을 들고 있다', () => {
  const html = shareBlock(game());
  assert.match(html, /data-url="https:\/\/just1game\.com\/games\/pulse-lock\/"/);
  assert.match(html, /data-slug="pulse-lock"/);
  assert.match(html, /data-title="Pulse Lock"/);
});

test('서버가 찍는 문구는 "아직 안 끝났을 때"다 — 점수 문구는 스크립트가 바꾼다', () => {
  const html = shareBlock(game());
  assert.ok(html.includes(LABEL_GAME));
  assert.ok(!html.includes(LABEL_SCORE));
});

test('제목의 따옴표가 속성을 깨고 나오지 않는다', () => {
  const html = shareBlock({ slug: 'x', title: 'He said "go" & <b>ran</b>' });
  assert.ok(!html.includes('data-title="He said "'));
  assert.match(html, /data-title="He said &quot;go&quot; &amp; &lt;b&gt;ran&lt;\/b&gt;"/);
});

/* ---------- 클라이언트 스크립트 — 조용히 죽는 경로를 막는다 ---------- */

test('공유 스크립트 파일이 실제로 있다', () => {
  assert.ok(existsSync(SHARE_SCRIPT), `${SHARE_SCRIPT} 이 없으면 버튼이 그려진 채로 아무것도 안 한다`);
});

test('랜딩 템플릿이 공유 블록과 스크립트를 둘 다 싣는다', () => {
  const tpl = readFileSync('templates/game-landing.html', 'utf8');
  assert.ok(tpl.includes('{{SHARE}}'), '공유 블록 자리가 없다');
  assert.ok(tpl.includes('/assets/share.js'), '스크립트가 없으면 블록은 장식이다');
});

test('게임 본체에는 공유 스크립트가 들어가지 않는다 — 포털은 밖으로 나가는 링크를 금지한다', () => {
  const base = readFileSync('templates/game-base.html', 'utf8');
  assert.ok(!base.includes('share.js'));
});

test('점수는 state가 over일 때만 읽는다 — 플레이 중 점수를 자랑하게 두지 않는다', () => {
  const js = readFileSync(SHARE_SCRIPT, 'utf8');
  assert.match(js, /state !== 'over'/);
});

test('0점은 점수 문구로 안 나간다 — 방치하다 끝난 판이 대부분 0점이다', () => {
  const js = readFileSync(SHARE_SCRIPT, 'utf8');
  assert.match(js, /G\.score > 0/);
});

test('계약이 없는 게임에서 던지지 않는다 — 던지면 버튼 자체가 죽는다', () => {
  const js = readFileSync(SHARE_SCRIPT, 'utf8');
  assert.match(js, /try\s*\{[\s\S]*contentWindow[\s\S]*catch/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';

// 빌드를 실제로 돌려서 본다. 애드센스는 "붙었는가"보다 "어디에 안 붙었는가"가 중요하고,
// 그건 산출물을 봐야만 알 수 있다.
const build = (env) => {
  try {
    execFileSync('node', ['build.js'], { env: { ...process.env, ...env }, stdio: 'pipe' });
    return { ok: true };
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
};

const CLIENT = 'ca-pub-6091491156053589';

test('게시자 ID 형식이 아니면 빌드를 거부한다', () => {
  for (const bad of ['pub-6091491156053589', 'ca-pub-123', 'ca-pub-60914911560535890', 'ca-pub-abcdefghijklmnop']) {
    const r = build({ ADSENSE_CLIENT: bad });
    assert.equal(r.ok, false, `${bad} 를 통과시켰다`);
    assert.match(r.out, /ADSENSE_CLIENT/);
  }
});

test('변수가 없으면 아무것도 나가지 않는다 — ads.txt도 만들지 않는다', () => {
  rmSync('ads.txt', { force: true });
  assert.ok(build({ ADSENSE_CLIENT: '' }).ok);
  assert.ok(!readFileSync('index.html', 'utf8').includes('adsbygoogle'));
  // 빈 ads.txt는 없는 것보다 나쁘다 — "아무도 팔 권한이 없다"는 선언이 된다
  assert.ok(!existsSync('ads.txt'), '변수가 없는데 ads.txt를 만들었다');
});

test('변수가 있으면 홈·랜딩·정적 페이지·404 전부에 붙는다', () => {
  assert.ok(build({ ADSENSE_CLIENT: CLIENT }).ok);
  for (const f of ['index.html', 'games/pulse-lock/index.html', 'privacy/index.html', '404.html']) {
    const html = readFileSync(f, 'utf8');
    assert.ok(html.includes(`client=${CLIENT}`), `${f} 에 안 붙었다`);
    assert.ok(html.includes('pagead2.googlesyndication.com'), `${f}`);
  }
});

test('ads.txt가 게시자 ID로 만들어진다 — 없으면 애드센스가 수익 손실로 표시한다', () => {
  assert.equal(readFileSync('ads.txt', 'utf8').trim(),
    'google.com, pub-6091491156053589, DIRECT, f08c47fec0942fa0');
});

// 이게 이 파일에서 제일 중요한 검사다. 게임 본체는 포털 납품본이 되고,
// 외부 스크립트를 하나도 싣지 않는다는 전제 위에 게이트 1이 서 있다.
test('게임 본체에는 절대 붙지 않는다 — 포털 납품본이자 외부 스크립트 0 원칙이다', () => {
  const games = JSON.parse(readFileSync('games.json', 'utf8'));
  for (const g of games) {
    const html = readFileSync(`play/${g.slug}.html`, 'utf8');
    assert.ok(!html.includes('adsbygoogle'), `${g.slug} 에 광고 스크립트가 들어갔다`);
    assert.ok(!html.includes('googlesyndication'), `${g.slug}`);
  }
});

test('템플릿이 토큰을 들고 있다 — 없으면 조용히 광고가 사라진다', () => {
  for (const t of ['home.html', 'game-landing.html', 'page.html']) {
    assert.ok(readFileSync(`templates/${t}`, 'utf8').includes('{{ADSENSE}}'), `${t}`);
  }
  assert.ok(!readFileSync('templates/game-base.html', 'utf8').includes('{{ADSENSE}}'),
    '게임 템플릿에 토큰이 들어갔다');
});

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

test('변수가 있으면 홈과 게임 랜딩에 붙는다', () => {
  assert.ok(build({ ADSENSE_CLIENT: CLIENT }).ok);
  for (const f of ['index.html', 'games/pulse-lock/index.html']) {
    const html = readFileSync(f, 'utf8');
    assert.ok(html.includes(`client=${CLIENT}`), `${f} 에 안 붙었다`);
    assert.ok(html.includes('pagead2.googlesyndication.com'), `${f}`);
  }
});

/* 2026-08-12에 뒤집힌 검사다. 예전에는 정적 페이지와 404에도 붙는 것이 옳다고
   보고 그렇게 검증했다. 구글이 공표한 거절 사유에 "가치가 거의 없는 페이지에
   광고 코드가 붙는 경우"가 그대로 있고, 여기 contact는 40단어, privacy는
   125단어다. 40단어짜리 문의 양식이 정확히 그 문장이 가리키는 것이다.

   게임 랜딩은 단어 수가 비슷해도 위 검사에 남아 있다. 그 페이지에는 플레이
   가능한 자체 제작 게임이 실려 있고, 재는 것은 길이가 아니라 페이지에 무엇이
   있느냐이기 때문이다. */
test('정적 페이지와 404에는 붙지 않는다 — 내용 없는 페이지의 광고가 거절 사유다', () => {
  assert.ok(build({ ADSENSE_CLIENT: CLIENT }).ok);
  for (const f of ['about/index.html', 'contact/index.html', 'privacy/index.html', '404.html']) {
    const html = readFileSync(f, 'utf8');
    assert.ok(!html.includes('adsbygoogle'), `${f} 에 광고가 붙었다`);
    assert.ok(!html.includes('googlesyndication'), `${f}`);
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

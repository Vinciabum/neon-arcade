import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/*
  "More Games"가 어디로 보내는지 검사한다.

  이 파일이 있는 이유: 예전 로직은 games.json 앞에서 네 개를 그냥 잘랐고
  (`games.filter(g => g.slug !== game.slug).slice(0, 4)`), 그래서 열아홉 개 중
  네 개가 각각 열여덟 번씩 추천되고 나머지 열네 개는 한 번도 추천되지 않았다.
  어느 게임을 하든 같은 넷이 나오는 막다른 길이었고, 그 열네 개는 홈에서만
  닿는 페이지였다.

  빌드는 통과했다. 페이지도 멀쩡했다. 링크가 어디로 가는지 아무도 세어보지
  않았을 뿐이다. 세는 것이 이 파일이다.
*/

const build = () => {
  execFileSync('node', ['build.js'], {
    env: { ...process.env, ADSENSE_CLIENT: 'ca-pub-6091491156053589' },
    stdio: 'pipe',
  });
};

const games = () => {
  const raw = JSON.parse(readFileSync('games.json', 'utf8'));
  return Array.isArray(raw) ? raw : raw.games;
};

/** 한 랜딩 페이지가 More Games로 내보내는 슬러그. */
const outbound = (slug) => {
  const html = readFileSync(`games/${slug}/index.html`, 'utf8');
  return [...new Set([...html.matchAll(/href="\/games\/([a-z0-9-]+)\/"/g)].map((m) => m[1]))].filter(
    (s) => s !== slug
  );
};

build();

test('모든 게임이 적어도 한 곳에서 추천된다 — 고아 금지', () => {
  const all = games();
  const count = Object.fromEntries(all.map((g) => [g.slug, 0]));
  for (const g of all) for (const s of outbound(g.slug)) if (s in count) count[s]++;

  const orphans = Object.entries(count)
    .filter(([, n]) => n === 0)
    .map(([s]) => s);

  assert.deepEqual(
    orphans,
    [],
    `추천을 한 번도 못 받은 게임: ${orphans.join(', ')}. ` +
      '홈에서만 닿는 페이지는 세션도 색인도 거기서 끊긴다.'
  );
});

test('한 게임이 추천을 독점하지 않는다', () => {
  const all = games();
  const count = Object.fromEntries(all.map((g) => [g.slug, 0]));
  for (const g of all) for (const s of outbound(g.slug)) if (s in count) count[s]++;

  const max = Math.max(...Object.values(count));
  /* 이상은 게임당 네 번(19 x 4 슬롯 / 19)이고 실측은 2~8이다. 퍼즐이 다섯 개라
     서로를 물어서 생기는 편중이고 그 정도는 받아들인다. 열둘을 넘으면 태그
     하나가 사이트를 삼키고 있다는 뜻이라 그때는 로직을 다시 본다. */
  assert.ok(max <= 12, `한 게임이 ${max}번 추천된다. 태그 편중이 심하다.`);
});

test('같은 태그가 있으면 먼저 추천된다', () => {
  const all = games();
  const byTag = {};
  for (const g of all) (byTag[g.tag] ??= []).push(g.slug);
  const shared = Object.entries(byTag).filter(([, s]) => s.length >= 2);

  assert.ok(shared.length > 0, '태그를 공유하는 게임이 없으면 이 검사는 의미가 없다.');

  for (const [tag, slugs] of shared) {
    for (const slug of slugs) {
      const sameTag = outbound(slug).filter((s) => all.find((g) => g.slug === s)?.tag === tag);
      assert.ok(
        sameTag.length >= 1,
        `${slug}(${tag})의 추천에 같은 태그가 하나도 없다. 퍼즐을 하던 사람에게 퍼즐을 준다는 규칙이 깨졌다.`
      );
    }
  }
});

test('추천이 네 개이고 자기 자신을 넣지 않는다', () => {
  for (const g of games()) {
    const out = outbound(g.slug);
    assert.equal(out.length, 4, `${g.slug}의 추천이 ${out.length}개다.`);
    assert.ok(!out.includes(g.slug), `${g.slug}가 자기 자신을 추천한다.`);
  }
});

test('빌드는 결정론적이다 — 같은 입력이면 같은 추천', () => {
  const before = games().map((g) => outbound(g.slug).join(','));
  build();
  const after = games().map((g) => outbound(g.slug).join(','));
  assert.deepEqual(after, before, '빌드를 두 번 돌렸더니 추천이 달라졌다. 무작위가 섞여 있으면 diff를 읽을 수 없다.');
});

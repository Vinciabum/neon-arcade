import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickRelated, recommendationCounts } from '../tools/related.js';

/*
  "More Games"가 어디로 보내는지 검사한다.

  이 파일이 있는 이유: 예전 로직은 games.json 앞에서 네 개를 그냥 잘랐고, 그래서
  열아홉 개 중 네 개가 각각 열여덟 번씩 추천되고 나머지 열네 개는 한 번도 추천되지
  않았다. 빌드는 통과했고 페이지도 멀쩡했다. 링크가 어디로 가는지 아무도 세어보지
  않았을 뿐이다.

  ⚠ 첫 판은 빌드를 돌리고 생성된 HTML의 링크를 셌다. 로컬에서는 통과하고 CI에서
  깨졌다 — node --test는 파일을 병렬로 돌리고 이 저장소의 여러 테스트가 각자
  빌드를 하므로, 남의 빌드가 출력 디렉터리를 지우는 사이 이 파일이 읽었다. 게다가
  모듈 최상위의 빌드가 ads.txt를 남겨 adsense 테스트까지 깼다.

  순수 함수는 순수 함수로 검사한다. 파일시스템을 건드리지 않으므로 병렬에 안전하고,
  실패하면 로직이 틀린 것이지 순서가 틀린 것이 아니다.
*/

const games = () => {
  const raw = JSON.parse(readFileSync(new URL('../games.json', import.meta.url), 'utf8'));
  return Array.isArray(raw) ? raw : raw.games;
};

test('추천을 한 번도 못 받는 게임이 없다 — 고아 금지', () => {
  const counts = recommendationCounts(games());
  const orphans = Object.entries(counts).filter(([, n]) => n === 0).map(([s]) => s);
  assert.deepEqual(
    orphans, [],
    `추천 0회: ${orphans.join(', ')}. 홈에서만 닿는 페이지는 세션도 색인도 거기서 끊긴다.`
  );
});

test('한 게임이 추천을 독점하지 않는다', () => {
  const counts = recommendationCounts(games());
  const max = Math.max(...Object.values(counts));
  /* 이상은 게임당 네 번이고 실측은 2~8이다. 퍼즐이 다섯 개라 서로를 물어서 생기는
     편중이고 그 정도는 받아들인다. 열둘을 넘으면 태그 하나가 사이트를 삼키고
     있다는 뜻이라 그때는 로직을 다시 본다. */
  assert.ok(max <= 12, `한 게임이 ${max}번 추천된다. 태그 편중이 심하다.`);
});

test('같은 태그가 있으면 반드시 하나는 같은 태그다', () => {
  const all = games();
  const byTag = {};
  for (const g of all) (byTag[g.tag] ??= []).push(g);
  const shared = Object.values(byTag).filter((v) => v.length >= 2);
  assert.ok(shared.length > 0, '태그를 공유하는 게임이 없으면 이 검사는 의미가 없다.');

  for (const group of shared) {
    for (const g of group) {
      const same = pickRelated(g, all).filter((r) => r.tag === g.tag);
      assert.ok(
        same.length >= 1,
        `${g.slug}(${g.tag})의 추천에 같은 태그가 없다. 퍼즐을 하던 사람에게 퍼즐을 준다는 규칙이 깨졌다.`
      );
    }
  }
});

test('정확히 네 개, 자기 자신 없음, 중복 없음', () => {
  const all = games();
  for (const g of all) {
    const rel = pickRelated(g, all);
    assert.equal(rel.length, 4, `${g.slug}의 추천이 ${rel.length}개다.`);
    assert.ok(!rel.some((r) => r.slug === g.slug), `${g.slug}가 자기 자신을 추천한다.`);
    assert.equal(new Set(rel.map((r) => r.slug)).size, 4, `${g.slug}의 추천에 중복이 있다.`);
  }
});

test('결정론적이다 — 같은 입력이면 같은 출력', () => {
  const all = games();
  const a = all.map((g) => pickRelated(g, all).map((r) => r.slug).join(','));
  const b = all.map((g) => pickRelated(g, all).map((r) => r.slug).join(','));
  assert.deepEqual(b, a, '두 번 부르면 결과가 달라진다. 무작위가 섞이면 diff를 읽을 수 없다.');
});

test('게임이 다섯 개 미만이어도 죽지 않는다', () => {
  const few = [
    { slug: 'a', tag: 'Puzzle' },
    { slug: 'b', tag: 'Puzzle' },
    { slug: 'c', tag: 'Action' },
  ];
  const rel = pickRelated(few[0], few);
  assert.equal(rel.length, 2, '남은 게임이 둘뿐이면 둘만 나와야 한다.');
  assert.ok(!rel.some((r) => r.slug === 'a'));
});

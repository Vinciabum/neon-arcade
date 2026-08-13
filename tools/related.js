/*
  랜딩 페이지의 "More Games"를 고른다.

  예전에는 build.js 안에서 games.json 앞을 그냥 잘랐다:

      games.filter(g => g.slug !== game.slug).slice(0, 4)

  그래서 열아홉 개 중 네 개가 각각 열여덟 번씩 추천되고 나머지 열네 개는 한 번도
  추천되지 않았다. 어느 게임을 하든 같은 넷이 나오고, 그 넷 중 하나를 해도 또 같은
  것들이 나오는 막다른 길이었다.

  그게 두 번 손해다. 게임 사이트의 광고 수익은 방문자 수가 아니라 한 명이 몇 판
  하느냐로 정해지므로 막다른 길은 없는 트래픽이 아니라 버리는 트래픽이다. 그리고
  들어오는 링크가 홈뿐인 페이지 열네 개는 크롤러에게 중요하다고 말해주는 것이
  아무것도 없다.

  build.js가 아니라 여기 있는 이유: build.js는 import하는 순간 사이트를 통째로
  빌드하는 최상위 스크립트라 테스트가 함수만 따로 부를 수 없다. 실제로 처음에는
  빌드를 돌리고 생성된 HTML의 링크를 세는 테스트를 썼는데, 테스트 파일들이 병렬로
  돌면서 서로의 출력 디렉터리를 지워 CI에서 깨졌다. 순수 함수는 순수 함수로
  검사한다.
*/

/**
 * @param {{slug: string, tag?: string}} game   추천을 붙일 게임
 * @param {Array<{slug: string, tag?: string}>} games  전체 목록 (게시 순서)
 * @param {number} count  뽑을 개수
 */
export function pickRelated(game, games, count = 4) {
  const picked = [];
  const take = (g) => {
    if (g && g.slug !== game.slug && !picked.some((p) => p.slug === g.slug)) picked.push(g);
  };

  /* 같은 태그 먼저, 최대 두 개. 퍼즐을 하던 사람에게 퍼즐을 준다. 다만 열세 개
     태그 중 열 개가 게임 하나뿐이라 이것만으로는 절반도 못 채운다. */
  for (const g of games) {
    if (picked.length >= 2) break;
    if (g.tag && g.tag === game.tag) take(g);
  }

  /* 나머지는 자기 위치에서 한 칸씩 밀어가며 채운다. 어느 게임에서 출발해도 다른
     경로가 나온다. 결정론적이다 — 무작위로 하면 빌드마다 diff가 생기고 무엇이
     바뀌었는지 못 본다. */
  const start = games.findIndex((g) => g.slug === game.slug);
  for (let step = 1; step <= games.length && picked.length < count; step++) {
    take(games[(start + step) % games.length]);
  }

  return picked.slice(0, count);
}

/**
 * 전체 목록에 대해 각 게임이 몇 번 추천되는지 센다. 테스트와 진단용.
 * @returns {Record<string, number>}
 */
export function recommendationCounts(games, count = 4) {
  const tally = Object.fromEntries(games.map((g) => [g.slug, 0]));
  for (const g of games) {
    for (const r of pickRelated(g, games, count)) tally[r.slug]++;
  }
  return tally;
}

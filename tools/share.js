// 공유 블록 — 랜딩 페이지에만 들어간다.
//
// 게임 본체(play/<slug>.html)에 넣지 않는 이유가 둘 있다.
//  - 포털 납품본은 이 파일을 그대로 쓴다. 포털은 게임 안에서 밖으로 나가는 링크를
//    금지하므로, 게임에 공유 링크를 심으면 심사에서 반려될 수 있다
//  - 게임 본체는 외부 스크립트를 하나도 싣지 않는다는 원칙이 있다 (tools/portal.js 참고)
//
// 랜딩의 iframe은 same-origin이라 밖에서 window.__GAME__ 을 직접 읽을 수 있다.
// 관측 계약을 새로 늘리지 않고 점수를 가져오는 유일한 경로다.
import { esc } from './render.js';
import { landingUrl, absUrl } from './paths.js';

// 클라이언트 스크립트. 빌드가 존재를 확인한다 — 없으면 모든 랜딩에서 조용히 404가 난다.
export const SHARE_SCRIPT = 'assets/share.js';

// 서버가 찍는 것은 "아직 안 끝났을 때"의 문구다. 게임이 끝나면 스크립트가 바꾼다.
// 처음부터 보이게 두는 이유: 나중에 드러내면 프레임 아래가 밀린다(CLS).
export const LABEL_GAME = '\u{1F517} Share this game';
export const LABEL_SCORE = '\u{1F3C6} Share your score';

// 순수 함수 — 파일 없이 테스트할 수 있다.
export function shareBlock(game) {
  const url = absUrl(landingUrl(game.slug));
  return `  <section class="share" data-share data-slug="${esc(game.slug)}" data-title="${esc(game.title)}" data-url="${esc(url)}">
    <button type="button" class="share-btn">${LABEL_GAME}</button>
    <span class="share-note" role="status" aria-live="polite"></span>
  </section>`;
}

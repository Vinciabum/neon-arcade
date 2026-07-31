// 슬러그에서 모든 경로를 유도한다.
// games.json에 경로 필드를 두지 않는 이유: 필드와 실제 파일이 어긋나는 사고를 원천 차단하기 위함.
export const SITE_ORIGIN = 'https://just1game.com';

export const gamePath = (slug) => `play/${slug}.html`;
export const thumbPath = (slug) => `assets/thumbs/${slug}.webp`;
// 공유 카드용 1200x630. 썸네일과 분리한 이유: SNS 크롤러는 WebP를 일관되게 읽지 못하고,
// 600x400을 그대로 쓰면 트위터·카톡에서 잘리거나 작은 카드로 떨어진다.
export const ogPath = (slug) => `assets/og/${slug}.png`;
export const landingUrl = (slug) => `/games/${slug}/`;
export const landingOutPath = (slug) => `games/${slug}/index.html`;
export const absUrl = (path) => `${SITE_ORIGIN}${path}`;

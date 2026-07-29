// 슬러그에서 모든 경로를 유도한다.
// games.json에 경로 필드를 두지 않는 이유: 필드와 실제 파일이 어긋나는 사고를 원천 차단하기 위함.
export const SITE_ORIGIN = 'https://just1game.com';

export const gamePath = (slug) => `play/${slug}.html`;
export const thumbPath = (slug) => `assets/thumbs/${slug}.webp`;
export const landingUrl = (slug) => `/games/${slug}/`;
export const landingOutPath = (slug) => `games/${slug}/index.html`;
export const absUrl = (path) => `${SITE_ORIGIN}${path}`;

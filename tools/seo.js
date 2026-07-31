// 구조화 데이터 생성과 산출물 SEO 게이트.
// gates.js·validate.js와 같은 이유로 순수 함수만 둔다 — 브라우저도 파일 시스템도 건드리지 않는다.
import { SITE_ORIGIN, absUrl, landingUrl, thumbPath, ogPath } from './paths.js';
import { esc } from './render.js';

export const SITE_NAME = 'Neon Arcade';

// 임계값은 한 곳에만 둔다. 테스트가 이 상수를 직접 읽으므로 문서와 코드가 갈라지지 않는다.
export const SEO = {
  TITLE_MIN: 15,
  TITLE_MAX: 70,      // 구글 SERP는 대략 60자에서 자르지만, 잘림 자체는 순위 문제가 아니다
  DESC_MIN: 70,
  DESC_MAX: 170
};

const ORG_ID = `${SITE_ORIGIN}/#organization`;
const SITE_ID = `${SITE_ORIGIN}/#website`;

const organization = () => ({
  '@type': 'Organization',
  '@id': ORG_ID,
  name: SITE_NAME,
  url: `${SITE_ORIGIN}/`,
  logo: absUrl('/assets/dino.svg'),
  description: 'An independent studio publishing original HTML5 browser games.'
});

export function homeJsonLd(games) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization(),
      {
        '@type': 'WebSite',
        '@id': SITE_ID,
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        inLanguage: 'en',
        publisher: { '@id': ORG_ID }
      },
      {
        '@type': 'ItemList',
        name: 'All games on Neon Arcade',
        numberOfItems: games.length,
        itemListElement: games.map((g, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: g.title,
          url: absUrl(landingUrl(g.slug))
        }))
      }
    ]
  };
}

export function landingJsonLd(game) {
  const url = absUrl(landingUrl(game.slug));
  const graph = [
    {
      '@type': 'VideoGame',
      '@id': `${url}#game`,
      name: game.title,
      url,
      description: game.description,
      image: absUrl(`/${ogPath(game.slug)}`),
      screenshot: absUrl(`/${thumbPath(game.slug)}`),
      genre: game.tag,
      datePublished: game.releasedAt,
      inLanguage: 'en',
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any',
      gamePlatform: ['Web browser', 'Desktop', 'Mobile'],
      playMode: 'SinglePlayer',
      publisher: { '@id': ORG_ID },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' }
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: game.title, item: url }
      ]
    }
  ];

  // 질문이 없는데 FAQPage를 내보내면 빈 스키마가 된다. 있을 때만 붙인다.
  if (game.faq?.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: game.faq.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a }
      }))
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

// 사람이 읽는 FAQ. 스키마만 있고 화면에 없는 FAQ는 구글이 무시한다 — 둘은 항상 같이 간다.
export function faqSection(game) {
  if (!game.faq?.length) return '';
  const items = game.faq
    .map(({ q, a }) => `      <h3>${esc(q)}</h3>\n      <p>${esc(a)}</p>`)
    .join('\n');
  return `    <section class="faq">\n      <h2>Frequently Asked Questions</h2>\n${items}\n    </section>\n`;
}

/* ---------- 산출물 게이트 ---------- */

const attr = (html, re) => html.match(re)?.[1]?.trim();

export function validateSeo(html, label) {
  const errors = [];
  const at = label ?? 'page';

  if (!/<html[^>]+lang=/i.test(html)) {
    errors.push(`${at}: <html> has no lang attribute`);
  }

  // 게임 본체는 색인 대상이 아니다. 요구하는 것도, 검사하는 것도 다르다.
  if (label?.startsWith('play/')) {
    if (!/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) {
      errors.push(`${at}: game file must carry a noindex robots meta — the landing page is canonical`);
    }
    if (!/<link[^>]+rel="canonical"/i.test(html)) {
      errors.push(`${at}: game file must point its canonical at the landing page`);
    }
    return errors;
  }

  const title = attr(html, /<title>([^<]*)<\/title>/i);
  if (!title) {
    errors.push(`${at}: no <title>`);
  } else if (title.length < SEO.TITLE_MIN || title.length > SEO.TITLE_MAX) {
    errors.push(`${at}: title length ${title.length} outside ${SEO.TITLE_MIN}-${SEO.TITLE_MAX} — "${title}"`);
  }

  const desc = attr(html, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i);
  if (!desc) {
    errors.push(`${at}: no meta description`);
  } else if (desc.length < SEO.DESC_MIN || desc.length > SEO.DESC_MAX) {
    errors.push(`${at}: meta description length ${desc.length} outside ${SEO.DESC_MIN}-${SEO.DESC_MAX}`);
  }

  const canonical = attr(html, /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i);
  if (!canonical) {
    errors.push(`${at}: no canonical link`);
  } else if (!canonical.startsWith(`${SITE_ORIGIN}/`)) {
    errors.push(`${at}: canonical must be an absolute ${SITE_ORIGIN} URL — got "${canonical}"`);
  }

  const ogImage = attr(html, /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i);
  if (!ogImage) {
    errors.push(`${at}: no og:image`);
  } else if (!ogImage.startsWith('https://')) {
    errors.push(`${at}: og:image must be an absolute https URL — social crawlers do not resolve "${ogImage}"`);
  }

  const h1s = html.match(/<h1[\s>]/gi) ?? [];
  if (h1s.length !== 1) {
    errors.push(`${at}: expected exactly 1 <h1>, found ${h1s.length}`);
  }

  // 스키마는 눈으로 봐서는 깨진 걸 모른다. 실제로 파싱해 본다.
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      JSON.parse(body);
    } catch (err) {
      errors.push(`${at}: JSON-LD does not parse — ${err.message}`);
    }
  }

  return errors;
}

# Neon Arcade 계획 1 — 기반 구축 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `games.json` 한 곳만 수정하면 홈 카드·게임별 개별 URL·사이트맵이 전부 자동 생성되고, 잘못된 상태는 빌드가 실패시켜 배포를 막는 정적 사이트 생성 구조를 만든다.

**Architecture:** `games.json`을 단일 진실 원천으로 두고, 의존성 없는 Node 생성기 `build.js`가 템플릿과 결합해 정적 HTML을 산출한다. 검증은 순수 함수 `tools/validate.js`로 분리해 파일시스템 없이 테스트하고, `build.js`는 검증 실패 시 비정상 종료한다. GitHub Actions가 push마다 빌드→검증→GitHub Pages 배포를 수행한다.

**Tech Stack:** Node 22 / `node --test` (내장 테스트 러너) / `sharp` (WebP 변환) / `playwright` (썸네일 캡처) / GitHub Actions / GitHub Pages

**설계 문서:** `docs/superpowers/specs/2026-07-29-neon-arcade-automation-design.md`

**범위:** 설계 문서의 P0~P3. P4 이후(게임 템플릿, `/newgame`, 포털 납품, AdSense)는 계획 2·3에서 다룬다.

---

## 현재 상태에서 반드시 알아야 할 것

작업 전에 아래를 인지하고 시작할 것. 전부 실물 확인된 사실이다.

| 위치 | 문제 |
|---|---|
| `index.html:26-595` | 인라인 `<style>` 570줄. 홈·랜딩 페이지가 공유해야 하므로 외부 CSS로 추출 대상 |
| `index.html:637-692` | 정적 카드 4개(Cyber Memory / Data Fall / Synaptic Grid / Neon Rise)가 `#gameGrid`에 하드코딩 |
| `index.html:758-887` | 인라인 `<script>`. `games` 배열 9개를 `#gameGrid`에 `forEach` append → **위 4개가 중복 렌더** |
| `index.html:637 → 723` | `<div class="game-grid">`를 `</section>`으로 닫음. **태그 불일치.** SEO 문단·목록이 그리드 아이템이 됨 |
| `index.html:766-800` 부근 | AI 작업 주석 약 40줄이 프로덕션에 배포됨 |
| `assets/thumb_*.png` | 6장 존재(장당 1.3~1.7MB), **3장 부재**(`thumb_memory`, `thumb_data`, `thumb_synaptic`) |
| `assets/` | 파일 704개 / 11.0MB. 대부분 미사용 에셋 팩 |
| `implementation_plan_v2.md` | 0바이트 빈 파일 |
| `README.md` | 게임 6개로 기재. 실제 9개 |
| `privacy.html` | 실제 연락처 이메일 없음 |

**슬러그는 하이픈으로 통일한다.** 기존 파일명은 `dino_jump.html`(언더스코어)이나 새 슬러그는 `dino-jump`다. 외부 유입 링크가 없으므로 리다이렉트는 만들지 않는다.

---

## File Structure

**신규 생성**

| 파일 | 책임 |
|---|---|
| `package.json` | 스크립트·개발 의존성 정의 |
| `games.json` | **단일 진실 원천.** 게임 메타데이터 전량 |
| `tools/validate.js` | 순수 검증 함수. 파일시스템 미접근(주입받음) → 테스트 가능 |
| `tools/render.js` | 템플릿 토큰 치환 + HTML 이스케이프 |
| `tools/paths.js` | 슬러그 → 경로 규칙 단일 정의 |
| `tools/shoot.js` | Playwright로 게임 캔버스 스크린샷 → WebP |
| `build.js` | 오케스트레이션. 읽기 → 검증 → 렌더 → 쓰기 |
| `templates/home.html` | 홈 템플릿 |
| `templates/game-landing.html` | 게임별 랜딩 페이지 템플릿 |
| `templates/page.html` | about / contact / privacy 공용 |
| `assets/site.css` | `index.html`에서 추출한 공유 CSS |
| `assets/app.js` | `index.html`에서 추출한 공유 JS (모달·코인) |
| `tests/validate.test.js` | 검증 게이트 테스트 |
| `tests/build.test.js` | 빌드 산출물 테스트 |
| `.github/workflows/deploy.yml` | 빌드·배포 |
| `.gitignore` | 산출물·의존성 제외 |

**이동**

- `games/<name>.html` → `play/<slug>.html` (게임 본체. `noindex` 주입 대상)

**빌드 산출물 (커밋하지 않음)**

- `index.html`, `games/<slug>/index.html`, `about/`, `contact/`, `privacy/`, `sitemap.xml`, `robots.txt`

**삭제**

- `implementation_plan_v2.md`, 미사용 에셋, 기존 `privacy.html`(템플릿으로 대체)

---

## Task 1: 프로젝트 초기화

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: `package.json` 작성**

```json
{
  "name": "neon-arcade",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "just1game.com - original browser games",
  "scripts": {
    "build": "node build.js",
    "test": "node --test tests/",
    "shoot": "node tools/shoot.js"
  },
  "devDependencies": {
    "sharp": "^0.34.0",
    "playwright": "^1.50.0"
  }
}
```

- [ ] **Step 2: `.gitignore` 작성**

빌드 산출물은 커밋하지 않는다. GitHub Actions가 배포 시점에 생성한다.

```
node_modules/
.DS_Store

# build output
/index.html
/games/
/about/
/contact/
/privacy/
/sitemap.xml
/robots.txt
```

- [ ] **Step 3: 의존성 설치**

Run: `npm install`
Expected: `node_modules/`가 생성되고 `sharp`, `playwright` 설치 완료. 에러 없음.

- [ ] **Step 4: Playwright 브라우저 설치**

Run: `npx playwright install chromium`
Expected: Chromium 다운로드 완료

- [ ] **Step 5: 테스트 러너 동작 확인**

Run: `node --test tests/` 
Expected: `tests/` 디렉터리가 없어 실패해도 무방. Node 22의 `--test` 플래그가 인식되는지만 확인.

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: init node project with build tooling"
```

---

## Task 2: 경로 규칙 단일화 (`tools/paths.js`)

슬러그로부터 모든 경로를 유도한다. 경로를 `games.json`에 필드로 두지 않는 이유는, 필드와 실제 파일이 어긋나는 사고를 원천 차단하기 위함이다.

**Files:**
- Create: `tools/paths.js`
- Test: `tests/paths.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/paths.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gamePath, thumbPath, landingUrl, landingOutPath } from '../tools/paths.js';

test('gamePath는 슬러그에서 게임 본체 경로를 만든다', () => {
  assert.equal(gamePath('dino-jump'), 'play/dino-jump.html');
});

test('thumbPath는 슬러그에서 썸네일 경로를 만든다', () => {
  assert.equal(thumbPath('dino-jump'), 'assets/thumbs/dino-jump.webp');
});

test('landingUrl은 슬래시로 끝나는 디렉터리 URL이다', () => {
  assert.equal(landingUrl('dino-jump'), '/games/dino-jump/');
});

test('landingOutPath는 index.html로 끝난다', () => {
  assert.equal(landingOutPath('dino-jump'), 'games/dino-jump/index.html');
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `node --test tests/paths.test.js`
Expected: FAIL — `Cannot find module '../tools/paths.js'`

- [ ] **Step 3: 최소 구현**

```js
// tools/paths.js
export const SITE_ORIGIN = 'https://just1game.com';

export const gamePath = (slug) => `play/${slug}.html`;
export const thumbPath = (slug) => `assets/thumbs/${slug}.webp`;
export const landingUrl = (slug) => `/games/${slug}/`;
export const landingOutPath = (slug) => `games/${slug}/index.html`;
export const absUrl = (path) => `${SITE_ORIGIN}${path}`;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/paths.test.js`
Expected: PASS — 4 tests passed

- [ ] **Step 5: 커밋**

```bash
git add tools/paths.js tests/paths.test.js
git commit -m "feat: add single-source path rules derived from slug"
```

---

## Task 3: 검증 게이트 (`tools/validate.js`)

**이 태스크가 이 계획의 핵심이다.** 지금까지 난 사고를 각각 빌드 실패 조건으로 못박는다.

파일시스템 접근을 인자로 주입받아 순수 함수로 만든다. 테스트에서 실제 파일을 만들 필요가 없다.

**Files:**
- Create: `tools/validate.js`
- Test: `tests/validate.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/validate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGames, validateOutput } from '../tools/validate.js';

// 모든 파일이 존재하고 크기가 적정한 기본 환경
const okEnv = { exists: () => true, sizeOf: () => 50_000 };

const validGame = {
  slug: 'dino-jump',
  title: 'Dino Jump',
  tagline: 'A high-speed endless runner.',
  description: 'Run, jump and dodge cacti in this neon endless runner. Collect coins, buy power-ups in the shop and chase your best distance.',
  tag: 'Runner',
  controls: { keyboard: 'Space to jump', touch: 'Tap to jump' },
  howToPlay: ['Tap or press Space to jump over cacti.'],
  releasedAt: '2026-02-18',
  status: 'published'
};

test('정상 게임은 에러가 없다', () => {
  assert.deepEqual(validateGames([validGame], okEnv), []);
});

test('슬러그 중복을 잡는다', () => {
  const errors = validateGames([validGame, { ...validGame }], okEnv);
  assert.ok(errors.some(e => e.includes('duplicate slug')));
});

test('슬러그 형식 위반을 잡는다', () => {
  const errors = validateGames([{ ...validGame, slug: 'Dino_Jump' }], okEnv);
  assert.ok(errors.some(e => e.includes('invalid slug')));
});

test('게임 본체 파일 부재를 잡는다', () => {
  const env = { exists: (p) => !p.startsWith('play/'), sizeOf: () => 50_000 };
  const errors = validateGames([validGame], env);
  assert.ok(errors.some(e => e.includes('missing game file')));
});

test('썸네일 부재를 잡는다', () => {
  const env = { exists: (p) => !p.startsWith('assets/thumbs/'), sizeOf: () => 50_000 };
  const errors = validateGames([validGame], env);
  assert.ok(errors.some(e => e.includes('missing thumbnail')));
});

test('썸네일 200KB 초과를 잡는다', () => {
  const env = { exists: () => true, sizeOf: (p) => p.includes('thumbs') ? 300_000 : 50_000 };
  const errors = validateGames([validGame], env);
  assert.ok(errors.some(e => e.includes('thumbnail too large')));
});

test('게임 본체 500KB 초과를 잡는다', () => {
  const env = { exists: () => true, sizeOf: (p) => p.startsWith('play/') ? 900_000 : 50_000 };
  const errors = validateGames([validGame], env);
  assert.ok(errors.some(e => e.includes('game file too large')));
});

test('필수 필드 누락을 잡는다', () => {
  const { title, ...noTitle } = validGame;
  const errors = validateGames([noTitle], okEnv);
  assert.ok(errors.some(e => e.includes('missing field: title')));
});

test('description 길이 범위 밖을 잡는다', () => {
  const errors = validateGames([{ ...validGame, description: 'too short' }], okEnv);
  assert.ok(errors.some(e => e.includes('description length')));
});

test('알 수 없는 status를 잡는다', () => {
  const errors = validateGames([{ ...validGame, status: 'live' }], okEnv);
  assert.ok(errors.some(e => e.includes('invalid status')));
});

test('산출물의 AI 작업 주석을 잡는다', () => {
  const html = `<script>\n// But I am supposed to make "no unrelated edits".\n</script>`;
  const errors = validateOutput(html, 'index.html');
  assert.ok(errors.some(e => e.includes('leaked authoring comment')));
});

test('깨끗한 산출물은 통과한다', () => {
  assert.deepEqual(validateOutput('<h1>Neon Arcade</h1>', 'index.html'), []);
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `node --test tests/validate.test.js`
Expected: FAIL — `Cannot find module '../tools/validate.js'`

- [ ] **Step 3: 구현**

```js
// tools/validate.js
import { gamePath, thumbPath } from './paths.js';

const REQUIRED_FIELDS = ['slug', 'title', 'tagline', 'description', 'tag', 'controls', 'howToPlay', 'releasedAt', 'status'];
const VALID_STATUS = ['draft', 'published', 'demoted', 'removed'];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const THUMB_MAX_BYTES = 200 * 1024;
const GAME_MAX_BYTES = 500 * 1024;
const DESC_MIN = 80;
const DESC_MAX = 200;

// 프로덕션에 새어나가면 안 되는 작성 흔적.
// 2026-02-18 커밋에서 실제로 40줄이 배포된 사고의 재발 방지 장치.
export const LEAKED_COMMENT_PATTERNS = [
  /I am supposed to/i,
  /I will assume/i,
  /the instruction (only )?asks/i,
  /we should (modify|remove|assume)/i,
  /for now, I will/i,
  /but I am/i,
  /TODO:/,
  /FIXME:/,
  /XXX:/
];

export function validateGames(games, { exists, sizeOf }) {
  const errors = [];
  const seen = new Set();

  for (const [i, game] of games.entries()) {
    const where = `games[${i}] (${game.slug ?? 'no-slug'})`;

    for (const field of REQUIRED_FIELDS) {
      if (game[field] === undefined || game[field] === null || game[field] === '') {
        errors.push(`${where}: missing field: ${field}`);
      }
    }
    if (!game.slug) continue;

    if (!SLUG_RE.test(game.slug)) {
      errors.push(`${where}: invalid slug — lowercase letters, digits and single hyphens only`);
      continue;
    }
    if (seen.has(game.slug)) {
      errors.push(`${where}: duplicate slug "${game.slug}"`);
    }
    seen.add(game.slug);

    if (game.status && !VALID_STATUS.includes(game.status)) {
      errors.push(`${where}: invalid status "${game.status}" — expected one of ${VALID_STATUS.join(', ')}`);
    }

    if (typeof game.description === 'string') {
      const len = game.description.length;
      if (len < DESC_MIN || len > DESC_MAX) {
        errors.push(`${where}: description length ${len} outside ${DESC_MIN}-${DESC_MAX}`);
      }
    }

    // removed 상태는 산출물을 만들지 않으므로 파일 검사에서 제외
    if (game.status === 'removed') continue;

    const gp = gamePath(game.slug);
    if (!exists(gp)) {
      errors.push(`${where}: missing game file ${gp}`);
    } else if (sizeOf(gp) > GAME_MAX_BYTES) {
      errors.push(`${where}: game file too large — ${sizeOf(gp)} bytes exceeds ${GAME_MAX_BYTES}`);
    }

    const tp = thumbPath(game.slug);
    if (!exists(tp)) {
      errors.push(`${where}: missing thumbnail ${tp}`);
    } else if (sizeOf(tp) > THUMB_MAX_BYTES) {
      errors.push(`${where}: thumbnail too large — ${sizeOf(tp)} bytes exceeds ${THUMB_MAX_BYTES}`);
    }
  }

  return errors;
}

export function validateOutput(html, label) {
  const errors = [];
  for (const pattern of LEAKED_COMMENT_PATTERNS) {
    const match = html.match(pattern);
    if (match) {
      errors.push(`${label}: leaked authoring comment — matched ${pattern} near "${match[0]}"`);
    }
  }
  return errors;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/validate.test.js`
Expected: PASS — 12 tests passed

- [ ] **Step 5: 커밋**

```bash
git add tools/validate.js tests/validate.test.js
git commit -m "feat: add build validation gates for slug, assets, size and leaked comments"
```

---

## Task 4: `games.json` 작성

기존 `index.html`에 흩어져 있던 게임 정보를 한 파일로 모은다. 이후 게임 정보는 오직 여기에만 존재한다.

**Files:**
- Create: `games.json`

- [ ] **Step 1: `games.json` 작성**

`description`은 meta description으로 그대로 쓰이므로 80~200자를 지킨다.

```json
[
  {
    "slug": "dino-jump",
    "title": "Dino Jump",
    "tagline": "A high-speed endless runner with power-ups and a shop.",
    "description": "Run, jump and dodge obstacles in this neon endless runner. Collect coins, unlock power-ups in the shop and push for your best distance.",
    "tag": "Runner",
    "controls": { "keyboard": "Space or Up Arrow to jump", "touch": "Tap anywhere to jump" },
    "howToPlay": [
      "Press Space or tap the screen to jump over incoming obstacles.",
      "Collect coins while you run to spend in the shop.",
      "The longer you survive, the faster the game gets."
    ],
    "tips": ["Save coins for the shield power-up before pushing for a long run."],
    "releasedAt": "2026-02-18",
    "status": "published",
    "featured": false,
    "portals": { "gamedistribution": null, "gamepix": null, "crazygames": null }
  },
  {
    "slug": "space-shooter",
    "title": "Space Shooter",
    "tagline": "Classic bullet-hell action with retro vibes.",
    "description": "Pilot a neon starfighter through waves of enemies. Dodge incoming fire, upgrade your weapons and survive as long as you can in this retro shooter.",
    "tag": "Action",
    "controls": { "keyboard": "Arrow keys to move, Space to fire", "touch": "Drag to move, auto-fire enabled" },
    "howToPlay": [
      "Move your ship to dodge enemy fire.",
      "Destroy enemies to raise your score and earn upgrades.",
      "Enemy waves get denser as the game progresses."
    ],
    "tips": ["Stay near the bottom of the screen for more reaction time."],
    "releasedAt": "2026-02-18",
    "status": "published",
    "featured": false,
    "portals": { "gamedistribution": null, "gamepix": null, "crazygames": null }
  },
  {
    "slug": "neon-dodge",
    "title": "Neon Dodge",
    "tagline": "Test your survival instincts in fast obstacle avoidance.",
    "description": "Survive as long as you can in an arena filling with hazards. Read the patterns, weave through the gaps and beat your personal best time.",
    "tag": "Survival",
    "controls": { "keyboard": "Arrow keys or WASD to move", "touch": "Drag to move your marker" },
    "howToPlay": [
      "Move your marker to avoid every incoming hazard.",
      "Your score is the time you survive.",
      "Hazards spawn faster the longer you last."
    ],
    "tips": ["Keep to the centre of the arena so you have escape routes on both sides."],
    "releasedAt": "2026-02-18",
    "status": "published",
    "featured": false,
    "portals": { "gamedistribution": null, "gamepix": null, "crazygames": null }
  },
  {
    "slug": "cyber-snake",
    "title": "Cyber Snake",
    "tagline": "The timeless classic reborn with a cybernetic skin.",
    "description": "Guide a growing neon snake around the grid, eat data nodes and avoid crashing into your own tail in this smooth take on the arcade classic.",
    "tag": "Classic",
    "controls": { "keyboard": "Arrow keys or WASD to turn", "touch": "Swipe in the direction you want to turn" },
    "howToPlay": [
      "Steer the snake to eat the glowing nodes.",
      "Every node makes the snake longer.",
      "Hitting a wall or your own tail ends the run."
    ],
    "tips": ["Plan a loop around the outside before the snake gets long."],
    "releasedAt": "2026-02-18",
    "status": "published",
    "featured": false,
    "portals": { "gamedistribution": null, "gamepix": null, "crazygames": null }
  },
  {
    "slug": "neon-breaker",
    "title": "Neon Breaker",
    "tagline": "A strategic brick-breaker built on physics and precision.",
    "description": "Bounce the ball off your paddle to clear every neon brick. Angle your shots carefully, chain rebounds and clear the board without losing the ball.",
    "tag": "Puzzle",
    "controls": { "keyboard": "Left and Right arrows to move the paddle", "touch": "Drag left and right to move the paddle" },
    "howToPlay": [
      "Move the paddle to keep the ball in play.",
      "Destroy every brick to clear the board.",
      "The ball angle depends on where it hits the paddle."
    ],
    "tips": ["Hit the ball with the paddle edge for sharp angles into corner bricks."],
    "releasedAt": "2026-02-18",
    "status": "published",
    "featured": false,
    "portals": { "gamedistribution": null, "gamepix": null, "crazygames": null }
  },
  {
    "slug": "cyber-memory",
    "title": "Cyber Memory",
    "tagline": "Match holographic data fragments and build combos.",
    "description": "Flip holographic tiles to find matching pairs. Build combos for bonus points and unlock larger grids as your memory sharpens in this brain trainer.",
    "tag": "Brain",
    "controls": { "keyboard": "Not required", "touch": "Tap a tile to flip it" },
    "howToPlay": [
      "Tap two tiles to reveal them.",
      "Matching tiles stay face up and score points.",
      "Consecutive matches build a combo multiplier."
    ],
    "tips": ["Clear the outer edges first so the remaining tiles are easier to track."],
    "releasedAt": "2026-02-18",
    "status": "published",
    "featured": false,
    "portals": { "gamedistribution": null, "gamepix": null, "crazygames": null }
  },
  {
    "slug": "data-fall",
    "title": "Data Fall",
    "tagline": "Solve equations to shoot lasers at falling numbers.",
    "description": "Defend the system from falling data. Solve each equation before it reaches the floor and fire your laser to destroy the numbers in this math arcade game.",
    "tag": "Math",
    "controls": { "keyboard": "Number keys to answer, Enter to fire", "touch": "Tap the on-screen keypad" },
    "howToPlay": [
      "Read the equation attached to each falling block.",
      "Type the answer and fire to destroy it.",
      "Blocks that reach the floor damage the system."
    ],
    "tips": ["Target the lowest block first, not the easiest one."],
    "releasedAt": "2026-02-18",
    "status": "published",
    "featured": false,
    "portals": { "gamedistribution": null, "gamepix": null, "crazygames": null }
  },
  {
    "slug": "synaptic-grid",
    "title": "Synaptic Grid",
    "tagline": "Follow the rhythm and repeat the light patterns.",
    "description": "Watch the grid light up, then repeat the sequence in order. Each round adds a step in this musical memory challenge that tests focus and timing.",
    "tag": "Focus",
    "controls": { "keyboard": "Not required", "touch": "Tap the tiles in the order they lit up" },
    "howToPlay": [
      "Watch the sequence of lit tiles.",
      "Repeat the sequence by tapping the tiles in the same order.",
      "Each successful round adds one more step."
    ],
    "tips": ["Say the pattern out loud — audio memory holds longer sequences than visual memory."],
    "releasedAt": "2026-02-18",
    "status": "published",
    "featured": false,
    "portals": { "gamedistribution": null, "gamepix": null, "crazygames": null }
  },
  {
    "slug": "neon-rise",
    "title": "Neon Rise",
    "tagline": "Climb through the clouds in a procedural platformer.",
    "description": "Jump from platform to platform and climb as high as you can. Every run generates a new tower, so no two climbs are the same in this endless platformer.",
    "tag": "Endless",
    "controls": { "keyboard": "Left and Right arrows to steer", "touch": "Tilt or drag to steer while jumping" },
    "howToPlay": [
      "Your character jumps automatically on landing.",
      "Steer left and right to land on the next platform.",
      "Falling off the bottom of the screen ends the run."
    ],
    "tips": ["Small corrections beat large ones — overshooting is the most common way to fall."],
    "releasedAt": "2026-02-18",
    "status": "published",
    "featured": true,
    "portals": { "gamedistribution": null, "gamepix": null, "crazygames": null }
  }
]
```

- [ ] **Step 2: JSON 유효성 확인**

Run: `node -e "const g=require('./games.json'); console.log(g.length, g.map(x=>x.slug).join(' '))"`
Expected: `9 dino-jump space-shooter neon-dodge cyber-snake neon-breaker cyber-memory data-fall synaptic-grid neon-rise`

- [ ] **Step 3: 커밋**

```bash
git add games.json
git commit -m "feat: add games.json as single source of truth"
```

---

## Task 5: 게임 본체 이동 및 슬러그 정규화

**Files:**
- Move: `games/*.html` → `play/<slug>.html`

- [ ] **Step 1: `play/` 디렉터리 생성 후 git mv로 이동**

히스토리를 보존하려고 `git mv`를 쓴다.

```bash
mkdir -p play
git mv games/dino_jump.html      play/dino-jump.html
git mv games/space_shooter.html  play/space-shooter.html
git mv games/neon_dodge.html     play/neon-dodge.html
git mv games/cyber_snake.html    play/cyber-snake.html
git mv games/neon_breaker.html   play/neon-breaker.html
git mv games/cyber_memory.html   play/cyber-memory.html
git mv games/data_fall.html      play/data-fall.html
git mv games/synaptic_grid.html  play/synaptic-grid.html
git mv games/neon_rise.html      play/neon-rise.html
```

- [ ] **Step 2: 이동 결과 확인**

Run: `ls play/ && ls games/ 2>&1`
Expected: `play/`에 9개 파일. `games/`는 비었거나 없음.

- [ ] **Step 3: 게임 내부의 상대 경로 깨짐 확인**

게임들이 `../assets/...`를 참조한다. 디렉터리 깊이가 `games/` → `play/`로 같으므로 상대 경로는 그대로 유효하다. 확인만 한다.

Run: `grep -o '\.\./assets/[^"'"'"']*' play/*.html | sort -u | head -20`
Expected: `../assets/...` 형태의 경로 목록. 각 경로가 실제로 존재하는지 다음 스텝에서 확인.

- [ ] **Step 4: 참조된 에셋 존재 확인**

Run:
```bash
for p in $(grep -oh '\.\./assets/[^"'"'"')]*' play/*.html | sort -u); do
  f="assets/${p#../assets/}"
  [ -f "$f" ] || echo "MISSING: $f"
done
```
Expected: 출력 없음. `MISSING:`이 뜨면 해당 에셋을 Task 11의 정리 대상에서 제외해야 한다. **이 목록을 기록해 둘 것.**

- [ ] **Step 5: 커밋**

```bash
git add -A play games
git commit -m "refactor: move game files to play/ with hyphenated slugs"
```

---

## Task 6: 썸네일 생성 (`tools/shoot.js`)

기존 PNG 6장은 장당 1.3~1.7MB로 과대하고, 3장은 아예 없다. 게임을 실제로 실행해 캔버스를 캡처하고 WebP로 변환한다. **유료 이미지 생성 API를 쓰지 않는다.**

**Files:**
- Create: `tools/shoot.js`
- Create: `assets/thumbs/*.webp` (산출물, 커밋함)

- [ ] **Step 1: `tools/shoot.js` 작성**

```js
// tools/shoot.js
// 게임을 실제 브라우저에서 실행하고 캔버스를 캡처해 썸네일을 만든다.
// 사용: node tools/shoot.js [slug ...]   (인자 없으면 games.json 전체)
import { chromium } from 'playwright';
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { gamePath, thumbPath } from './paths.js';

const WIDTH = 600;
const HEIGHT = 400;
const SETTLE_MS = 2500; // 게임이 첫 프레임을 그릴 시간

async function shoot(browser, slug) {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const file = path.resolve(gamePath(slug));
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });

  // 게임 시작을 유도한다. 다수의 게임이 클릭/키 입력을 기다린다.
  await page.mouse.click(450, 300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(SETTLE_MS);

  const canvas = page.locator('canvas').first();
  const target = (await canvas.count()) > 0 ? canvas : page;
  const raw = await target.screenshot();

  const out = thumbPath(slug);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(raw)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
    .webp({ quality: 82 })
    .toFile(out);

  await page.close();
  return out;
}

const all = JSON.parse(await readFile('games.json', 'utf8'));
const slugs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : all.filter(g => g.status !== 'removed').map(g => g.slug);

const browser = await chromium.launch();
for (const slug of slugs) {
  try {
    const out = await shoot(browser, slug);
    console.log(`ok   ${slug} -> ${out}`);
  } catch (err) {
    console.error(`FAIL ${slug}: ${err.message}`);
    process.exitCode = 1;
  }
}
await browser.close();
```

- [ ] **Step 2: 전체 썸네일 생성**

Run: `node tools/shoot.js`
Expected: 9줄 모두 `ok`. `assets/thumbs/`에 `.webp` 9개 생성.

`FAIL`이 나는 게임은 시작 조건이 다른 것이다. 해당 게임의 `play/<slug>.html`을 열어 시작 트리거(클릭 위치·키)를 확인하고 `shoot()`의 입력을 조정한다.

- [ ] **Step 3: 용량 확인 — 게이트 통과 여부**

Run: `ls -l assets/thumbs/ | awk '{print $5, $9}'`
Expected: 모든 파일이 **200KB(204800바이트) 미만.** 초과 시 `shoot.js`의 `webp({ quality })`를 70으로 낮추고 재실행.

- [ ] **Step 4: 빈 이미지가 아닌지 육안 확인**

Run: `start assets/thumbs/dino-jump.webp` (Windows)
Expected: 게임 화면이 보인다. 검은 화면이면 `SETTLE_MS`를 늘리거나 시작 입력을 조정한다.

- [ ] **Step 5: 구 PNG 썸네일 삭제**

```bash
git rm assets/thumb_break.png assets/thumb_dino.png assets/thumb_dodge.png assets/thumb_rise.png assets/thumb_snake.png assets/thumb_space.png
```

- [ ] **Step 6: 커밋**

```bash
git add tools/shoot.js assets/thumbs
git commit -m "feat: generate webp thumbnails from live game screenshots"
```

---

## Task 7: 템플릿 추출

`index.html`의 인라인 CSS 570줄을 공유 파일로 빼낸다. 홈과 게임 랜딩 페이지가 같은 스타일을 쓰기 위해서다.

**Files:**
- Create: `assets/site.css`
- Create: `assets/app.js`
- Create: `templates/home.html`
- Create: `templates/game-landing.html`
- Create: `templates/page.html`

- [ ] **Step 1: CSS 추출**

`index.html`의 26~595행(`<style>`와 `</style>` 사이 내용)을 그대로 `assets/site.css`로 옮긴다. **내용을 수정하지 않는다.** 태그만 제거한다.

Run: `sed -n '27,594p' index.html > assets/site.css && wc -l assets/site.css`
Expected: 약 568줄

- [ ] **Step 2: 공유 JS 작성**

기존 `index.html`의 스크립트에서 **AI 작업 주석과 `games.forEach` 렌더링을 전부 버리고**, 모달과 코인 표시만 남긴다. 카드는 이제 빌드 시점에 생성되므로 런타임 렌더링이 필요 없다.

```js
// assets/app.js
(function () {
  'use strict';

  const modal = document.getElementById('modal');
  const iframe = document.getElementById('gameFrame');
  const playerTitle = document.getElementById('playerTitle');
  const coinDisplay = document.getElementById('coinDisplay');

  if (coinDisplay) {
    coinDisplay.textContent = localStorage.getItem('neon_coins') || '0';
  }

  window.openGame = function (file, title) {
    if (!modal || !iframe) {
      window.location.href = file;
      return;
    }
    iframe.src = file;
    if (playerTitle) playerTitle.textContent = title;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeModal = function () {
    if (!modal || !iframe) return;
    modal.classList.remove('open');
    iframe.src = '';
    document.body.style.overflow = '';
  };

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.closeModal();
  });
})();
```

- [ ] **Step 3: 홈 템플릿 작성**

`index.html`의 body 구조를 옮기되 **정적 카드 4개를 제거하고 `{{CARDS}}` 토큰으로 대체**한다. 태그 불일치(`<div class="game-grid">`를 `</section>`으로 닫던 문제)도 여기서 바로잡는다. SEO 문단과 게임 목록은 그리드 **밖으로** 뺀다.

```html
<!-- templates/home.html -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{TITLE}}</title>
<meta name="description" content="{{DESCRIPTION}}">
<link rel="canonical" href="{{CANONICAL}}">
<meta property="og:type" content="website">
<meta property="og:url" content="{{CANONICAL}}">
<meta property="og:title" content="{{TITLE}}">
<meta property="og:description" content="{{DESCRIPTION}}">
<meta property="og:image" content="{{OG_IMAGE}}">
<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:title" content="{{TITLE}}">
<meta property="twitter:description" content="{{DESCRIPTION}}">
<meta property="twitter:image" content="{{OG_IMAGE}}">
<link rel="icon" type="image/svg+xml" href="/assets/dino.svg">
<link rel="stylesheet" href="/assets/site.css">
{{ANALYTICS}}
</head>
<body>
<nav class="sidebar">
  <div class="nav-icon active" title="Home">🏠</div>
</nav>

<main class="main-content">
  <header>
    <div class="logo">NEON</div>
    <div class="wallet-pill"><span class="coin">💰</span><span id="coinDisplay">0</span></div>
  </header>

  <section class="hero">
    <div class="hero-pattern"></div>
    <div class="hero-text">
      <p style="color:#fff;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Weekly Top Pick</p>
      <h1>{{FEATURED_TITLE}}</h1>
      <p>{{FEATURED_TAGLINE}}</p>
      <a class="play-btn" href="{{FEATURED_URL}}">PLAY NOW</a>
    </div>
  </section>

  <div class="grid-header"><span>🔥</span> All Games</div>

  <div class="game-grid" id="gameGrid">
{{CARDS}}
  </div>

  <section class="site-copy">
    <p>Welcome to Neon Arcade, a small studio publishing original <b>HTML5 games</b> you can play
    straight in your browser. Every game here is built in-house — no downloads, no sign-up, no installs.
    All titles are <b>mobile compatible</b> with responsive touch controls, so they run on phones,
    tablets and desktops alike.</p>
    <h2>Our Game Collection</h2>
    <ul>
{{GAME_LIST}}
    </ul>
  </section>

  <footer class="site-footer">
    <p>&copy; 2026 Neon Arcade. All rights reserved.</p>
    <p><a href="/about/">About</a> · <a href="/contact/">Contact</a> · <a href="/privacy/">Privacy Policy</a></p>
  </footer>
</main>

<div class="modal-overlay" id="modal">
  <div class="player-layout">
    <div class="game-container">
      <div class="game-frame-wrapper">
        <iframe id="gameFrame" src="" title="Game player" style="width:100%;height:100%;border:none;"></iframe>
      </div>
      <div class="game-controls">
        <div class="game-title-bar" id="playerTitle">Game</div>
        <button class="close-btn-player" onclick="closeModal()">EXIT GAME</button>
      </div>
    </div>
  </div>
</div>

<script src="/assets/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: 게임 랜딩 템플릿 작성**

이 페이지가 **색인 대상**이다. 게임마다 고유한 title·description·canonical·본문을 가진다.

```html
<!-- templates/game-landing.html -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{TITLE}} — Play Free Online | Neon Arcade</title>
<meta name="description" content="{{DESCRIPTION}}">
<link rel="canonical" href="{{CANONICAL}}">
<meta property="og:type" content="website">
<meta property="og:url" content="{{CANONICAL}}">
<meta property="og:title" content="{{TITLE}} — Play Free Online">
<meta property="og:description" content="{{DESCRIPTION}}">
<meta property="og:image" content="{{OG_IMAGE}}">
<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:title" content="{{TITLE}} — Play Free Online">
<meta property="twitter:description" content="{{DESCRIPTION}}">
<meta property="twitter:image" content="{{OG_IMAGE}}">
<link rel="icon" type="image/svg+xml" href="/assets/dino.svg">
<link rel="stylesheet" href="/assets/site.css">
<script type="application/ld+json">{{JSONLD}}</script>
{{ANALYTICS}}
</head>
<body>
<main class="main-content landing">
  <header>
    <div class="logo"><a href="/">NEON</a></div>
  </header>

  <nav class="breadcrumb"><a href="/">Home</a> › <span>{{TITLE}}</span></nav>

  <h1>{{TITLE}}</h1>
  <p class="lede">{{TAGLINE}}</p>

  <div class="landing-frame">
    <iframe src="{{GAME_SRC}}" title="{{TITLE}}" loading="lazy"
            style="width:100%;height:100%;border:none;"></iframe>
  </div>

  <section class="landing-body">
    <h2>How to Play {{TITLE}}</h2>
    <ul>
{{HOW_TO_PLAY}}
    </ul>

    <h2>Controls</h2>
    <table class="controls-table">
      <tr><th>Keyboard</th><td>{{CONTROLS_KEYBOARD}}</td></tr>
      <tr><th>Touch</th><td>{{CONTROLS_TOUCH}}</td></tr>
    </table>

{{TIPS_BLOCK}}

    <h2>About {{TITLE}}</h2>
    <p>{{DESCRIPTION}} It runs directly in your browser with no download or sign-up,
    on desktop and mobile alike.</p>
  </section>

  <section class="more-games">
    <h2>More Games</h2>
    <div class="game-grid">
{{RELATED_CARDS}}
    </div>
  </section>

  <footer class="site-footer">
    <p>&copy; 2026 Neon Arcade. All rights reserved.</p>
    <p><a href="/about/">About</a> · <a href="/contact/">Contact</a> · <a href="/privacy/">Privacy Policy</a></p>
  </footer>
</main>
</body>
</html>
```

- [ ] **Step 5: 범용 페이지 템플릿 작성**

```html
<!-- templates/page.html -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{TITLE}} | Neon Arcade</title>
<meta name="description" content="{{DESCRIPTION}}">
<link rel="canonical" href="{{CANONICAL}}">
<link rel="icon" type="image/svg+xml" href="/assets/dino.svg">
<link rel="stylesheet" href="/assets/site.css">
{{ANALYTICS}}
</head>
<body>
<main class="main-content landing">
  <header><div class="logo"><a href="/">NEON</a></div></header>
  <h1>{{TITLE}}</h1>
  <section class="landing-body">
{{BODY}}
  </section>
  <footer class="site-footer">
    <p>&copy; 2026 Neon Arcade. All rights reserved.</p>
    <p><a href="/about/">About</a> · <a href="/contact/">Contact</a> · <a href="/privacy/">Privacy Policy</a></p>
  </footer>
</main>
</body>
</html>
```

- [ ] **Step 6: 신규 클래스용 CSS 추가**

`assets/site.css` 끝에 추가한다. 기존 CSS는 건드리지 않는다.

```css

/* --- added: landing pages & layout fixes --- */
.site-copy { margin-top: 40px; line-height: 1.7; color: var(--text-secondary); }
.site-copy h2 { margin: 24px 0 12px; font-size: 1.2rem; }
.site-copy ul { padding-left: 20px; line-height: 1.9; }
.site-footer { margin-top: 60px; padding: 20px; border-top: 1px solid rgba(0,0,0,0.05);
  text-align: center; color: #888; font-size: 0.9rem; }
.site-footer a { color: #888; text-decoration: none; font-weight: 600; }
.landing { max-width: 900px; margin: 0 auto; padding: 20px; }
.landing h1 { margin: 8px 0; }
.landing .lede { color: var(--text-secondary); margin-bottom: 20px; }
.breadcrumb { font-size: 0.85rem; color: #888; margin-bottom: 12px; }
.breadcrumb a { color: #888; text-decoration: none; }
.landing-frame { position: relative; width: 100%; aspect-ratio: 4 / 3;
  border-radius: 16px; overflow: hidden; background: #000; }
.landing-body { margin-top: 32px; line-height: 1.7; }
.landing-body h2 { margin: 28px 0 12px; font-size: 1.25rem; }
.landing-body ul { padding-left: 20px; line-height: 1.9; }
.controls-table { width: 100%; border-collapse: collapse; }
.controls-table th { text-align: left; width: 120px; padding: 8px 0; vertical-align: top; }
.controls-table td { padding: 8px 0; }
.more-games { margin-top: 48px; }
@media (max-width: 640px) { .landing-frame { aspect-ratio: 3 / 4; } }
```

- [ ] **Step 7: 커밋**

```bash
git add assets/site.css assets/app.js templates/
git commit -m "feat: extract shared css/js and add page templates"
```

---

## Task 8: 생성기 (`build.js`)

**Files:**
- Create: `tools/render.js`
- Create: `build.js`
- Test: `tests/build.test.js`

- [ ] **Step 1: 렌더 헬퍼 테스트 작성**

```js
// tests/build.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fill, esc } from '../tools/render.js';

test('fill은 토큰을 치환한다', () => {
  assert.equal(fill('a{{X}}c', { X: 'b' }), 'abc');
});

test('fill은 같은 토큰을 모두 치환한다', () => {
  assert.equal(fill('{{X}}-{{X}}', { X: 'y' }), 'y-y');
});

test('fill은 치환되지 않은 토큰이 남으면 던진다', () => {
  assert.throws(() => fill('a{{MISSING}}', {}), /unfilled token: MISSING/);
});

test('esc는 HTML 특수문자를 이스케이프한다', () => {
  assert.equal(esc('a & b < c > "d"'), 'a &amp; b &lt; c &gt; &quot;d&quot;');
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `node --test tests/build.test.js`
Expected: FAIL — `Cannot find module '../tools/render.js'`

- [ ] **Step 3: `tools/render.js` 구현**

치환되지 않은 토큰이 남으면 던진다. `{{TITLE}}`이 그대로 박힌 페이지가 배포되는 사고를 막는다.

```js
// tools/render.js
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fill(template, values) {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  const leftover = out.match(/\{\{([A-Z_]+)\}\}/);
  if (leftover) {
    throw new Error(`unfilled token: ${leftover[1]}`);
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/build.test.js`
Expected: PASS — 4 tests passed

- [ ] **Step 5: `build.js` 구현**

```js
// build.js
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { validateGames, validateOutput } from './tools/validate.js';
import { fill, esc } from './tools/render.js';
import { gamePath, thumbPath, landingUrl, landingOutPath, absUrl, SITE_ORIGIN } from './tools/paths.js';

const SITE_TITLE = 'Neon Arcade — Free Original Browser Games';
const SITE_DESC = 'Play original HTML5 arcade games free in your browser. No download, no sign-up, works on mobile and desktop.';

const ANALYTICS = process.env.GA_ID
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${process.env.GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${process.env.GA_ID}');</script>`
  : '';

const die = (errors) => {
  console.error('\nBUILD FAILED — validation gate:\n');
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
};

const readTemplate = (name) => readFile(path.join('templates', name), 'utf8');

async function write(outPath, html) {
  const errors = validateOutput(html, outPath);
  if (errors.length) die(errors);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');
  console.log(`  → ${outPath}`);
}

function card(game) {
  return `      <article class="card" onclick="location.href='${landingUrl(game.slug)}'">
        <div class="card-thumb">
          <img src="/${thumbPath(game.slug)}" alt="${esc(game.title)} screenshot" width="600" height="400" loading="lazy">
        </div>
        <div class="card-content">
          <div class="card-tag">${esc(game.tag)}</div>
          <div class="card-title">${esc(game.title)}</div>
          <p class="card-desc">${esc(game.tagline)}</p>
        </div>
      </article>`;
}

async function buildHome(games, templates) {
  const featured = games.find(g => g.featured) ?? games[0];
  const html = fill(templates.home, {
    TITLE: esc(SITE_TITLE),
    DESCRIPTION: esc(SITE_DESC),
    CANONICAL: `${SITE_ORIGIN}/`,
    OG_IMAGE: absUrl(`/${thumbPath(featured.slug)}`),
    ANALYTICS,
    FEATURED_TITLE: esc(featured.title),
    FEATURED_TAGLINE: esc(featured.tagline),
    FEATURED_URL: landingUrl(featured.slug),
    CARDS: games.map(card).join('\n'),
    GAME_LIST: games.map(g =>
      `      <li><a href="${landingUrl(g.slug)}"><strong>${esc(g.title)}</strong></a> — ${esc(g.tagline)}</li>`
    ).join('\n')
  });
  await write('index.html', html);
}

async function buildLanding(game, games, templates) {
  const related = games.filter(g => g.slug !== game.slug).slice(0, 4);
  const tips = (game.tips ?? []).length
    ? `    <h2>Tips</h2>\n    <ul>\n${game.tips.map(t => `      <li>${esc(t)}</li>`).join('\n')}\n    </ul>\n`
    : '';

  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.title,
    description: game.description,
    url: absUrl(landingUrl(game.slug)),
    image: absUrl(`/${thumbPath(game.slug)}`),
    genre: game.tag,
    datePublished: game.releasedAt,
    applicationCategory: 'Game',
    operatingSystem: 'Any (web browser)',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  });

  const html = fill(templates.landing, {
    TITLE: esc(game.title),
    TAGLINE: esc(game.tagline),
    DESCRIPTION: esc(game.description),
    CANONICAL: absUrl(landingUrl(game.slug)),
    OG_IMAGE: absUrl(`/${thumbPath(game.slug)}`),
    GAME_SRC: `/${gamePath(game.slug)}`,
    JSONLD: jsonld,
    ANALYTICS,
    HOW_TO_PLAY: game.howToPlay.map(s => `      <li>${esc(s)}</li>`).join('\n'),
    CONTROLS_KEYBOARD: esc(game.controls.keyboard),
    CONTROLS_TOUCH: esc(game.controls.touch),
    TIPS_BLOCK: tips,
    RELATED_CARDS: related.map(card).join('\n')
  });
  await write(landingOutPath(game.slug), html);
}

// 게임 본체는 색인 대상이 아니다. 랜딩 페이지가 canonical이다.
async function markGameNoindex(game) {
  const file = gamePath(game.slug);
  let html = await readFile(file, 'utf8');
  if (html.includes('name="robots"')) return;
  const inject = `<meta name="robots" content="noindex">\n<link rel="canonical" href="${absUrl(landingUrl(game.slug))}">\n`;
  html = html.replace(/<\/head>/i, `${inject}</head>`);
  await writeFile(file, html, 'utf8');
}

async function buildPages(games, templates) {
  const pages = [
    {
      slug: 'about',
      title: 'About Neon Arcade',
      description: 'Neon Arcade is an independent studio publishing original browser games. Learn who makes them and how they are built.',
      body: `<p>Neon Arcade is an independent one-person studio. Every game on this site is
built in-house with vanilla JavaScript and HTML5 Canvas — no engines, no licensed content,
no third-party game feeds.</p>
<p>The goal is simple: short, polished games you can play in a browser tab without
downloading anything or creating an account. New games are published regularly.</p>
<p>Questions, bug reports or business enquiries: see the <a href="/contact/">contact page</a>.</p>`
    },
    {
      slug: 'contact',
      title: 'Contact',
      description: 'Get in touch with Neon Arcade about bugs, feedback, licensing or business enquiries.',
      body: `<p>Email: <a href="mailto:${process.env.CONTACT_EMAIL ?? 'hello@just1game.com'}">${process.env.CONTACT_EMAIL ?? 'hello@just1game.com'}</a></p>
<p>Use this address for bug reports, feedback, game licensing and business enquiries.
Replies usually arrive within a few days.</p>`
    },
    {
      slug: 'privacy',
      title: 'Privacy Policy',
      description: 'How Neon Arcade handles data, cookies, local storage and third-party advertising.',
      body: `<p><strong>Last updated:</strong> 2026-07-29</p>
<h2>Local storage</h2>
<p>Games store your high scores and progress in your browser's local storage.
This data never leaves your device and is not sent to any server.</p>
<h2>Analytics</h2>
<p>We use Google Analytics to understand which games people play and how the site performs.
Analytics data is aggregated and does not identify you personally.</p>
<h2>Advertising</h2>
<p>This site may display advertising served by Google and other third parties.
Third-party vendors, including Google, use cookies to serve ads based on your prior
visits to this or other websites. You can opt out of personalised advertising through
<a href="https://www.google.com/settings/ads">Google Ads Settings</a>.</p>
<h2>Contact</h2>
<p>Privacy questions: <a href="mailto:${process.env.CONTACT_EMAIL ?? 'hello@just1game.com'}">${process.env.CONTACT_EMAIL ?? 'hello@just1game.com'}</a></p>`
    }
  ];

  for (const page of pages) {
    const html = fill(templates.page, {
      TITLE: esc(page.title),
      DESCRIPTION: esc(page.description),
      CANONICAL: absUrl(`/${page.slug}/`),
      ANALYTICS,
      BODY: page.body
    });
    await write(`${page.slug}/index.html`, html);
  }
}

async function buildSitemap(games) {
  const urls = [
    { loc: `${SITE_ORIGIN}/`, priority: '1.0' },
    ...games.map(g => ({ loc: absUrl(landingUrl(g.slug)), priority: '0.8', lastmod: g.releasedAt })),
    { loc: `${SITE_ORIGIN}/about/`, priority: '0.3' },
    { loc: `${SITE_ORIGIN}/contact/`, priority: '0.3' },
    { loc: `${SITE_ORIGIN}/privacy/`, priority: '0.1' }
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  await writeFile('sitemap.xml', xml, 'utf8');
  console.log('  → sitemap.xml');

  const robots = `User-agent: *
Allow: /
Disallow: /play/

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
  await writeFile('robots.txt', robots, 'utf8');
  console.log('  → robots.txt');
}

// --- main ---
const all = JSON.parse(await readFile('games.json', 'utf8'));

console.log(`\nValidating ${all.length} games...`);
const errors = validateGames(all, {
  exists: (p) => existsSync(p),
  sizeOf: (p) => (existsSync(p) ? statSync(p).size : 0)
});
if (errors.length) die(errors);
console.log('  ✓ all gates passed');

// draft는 산출하지 않는다. demoted는 산출하되 홈 하단으로 밀린다.
const live = all.filter(g => g.status === 'published' || g.status === 'demoted');
const ordered = [...live].sort((a, b) => {
  if (a.status !== b.status) return a.status === 'published' ? -1 : 1;
  return b.releasedAt.localeCompare(a.releasedAt);
});

console.log('\nBuilding...');
const templates = {
  home: await readTemplate('home.html'),
  landing: await readTemplate('game-landing.html'),
  page: await readTemplate('page.html')
};

await rm('games', { recursive: true, force: true });
await buildHome(ordered, templates);
for (const game of ordered) {
  await buildLanding(game, ordered, templates);
  await markGameNoindex(game);
}
await buildPages(ordered, templates);
await buildSitemap(ordered);

console.log(`\nDone. ${ordered.length} games, ${ordered.length + 4} indexable URLs.\n`);
```

- [ ] **Step 6: 빌드 실행**

Run: `npm run build`
Expected:
```
Validating 9 games...
  ✓ all gates passed

Building...
  → index.html
  → games/neon-rise/index.html
  ...
  → sitemap.xml
  → robots.txt

Done. 9 games, 13 indexable URLs.
```

- [ ] **Step 7: 게이트가 실제로 막는지 확인 (음성 테스트)**

게이트는 통과했을 때가 아니라 **막았을 때** 검증된다.

```bash
# 썸네일 하나를 임시로 숨긴다
mv assets/thumbs/dino-jump.webp /tmp/dino-jump.webp
npm run build; echo "exit=$?"
mv /tmp/dino-jump.webp assets/thumbs/dino-jump.webp
```
Expected: `BUILD FAILED — validation gate:` 와 `✗ games[0] (dino-jump): missing thumbnail assets/thumbs/dino-jump.webp`, `exit=1`

- [ ] **Step 8: 슬러그 중복도 막는지 확인**

```bash
node -e "
const fs=require('fs');
const g=JSON.parse(fs.readFileSync('games.json','utf8'));
g.push({...g[0]});
fs.writeFileSync('/tmp/dup.json',JSON.stringify(g));
"
cp games.json /tmp/games.orig.json && cp /tmp/dup.json games.json
npm run build; echo "exit=$?"
cp /tmp/games.orig.json games.json
```
Expected: `✗ games[9] (dino-jump): duplicate slug "dino-jump"`, `exit=1`

- [ ] **Step 9: 산출물 육안 확인**

Run: `npm run build && start index.html`
Expected: 카드가 **9개**(중복 없음), 썸네일 전부 표시, SEO 문단이 그리드 밖 정상 위치.

- [ ] **Step 10: 커밋**

```bash
git add build.js tools/render.js tests/build.test.js play/
git commit -m "feat: add static site generator with per-game landing pages"
```

---

## Task 9: 리포 정리

**Files:**
- Delete: `implementation_plan_v2.md`, `privacy.html`, 미사용 에셋
- Modify: `README.md`

- [ ] **Step 1: 미사용 에셋 목록 산출**

Task 5 Step 4에서 확인한 참조 목록을 기준으로 삼는다. 참조되지 않는 파일만 삭제 대상이다.

```bash
node -e "
const fs=require('fs'), path=require('path');
const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{
  const p=path.join(d,e.name); return e.isDirectory()?walk(p):[p];
});
const assets=walk('assets').map(p=>p.replace(/\\\\/g,'/'));
const html=[...walk('play'),...walk('templates'),'assets/site.css','assets/app.js']
  .filter(p=>fs.existsSync(p)).map(p=>fs.readFileSync(p,'utf8')).join('\n');
const used=assets.filter(a=>html.includes(path.basename(a)));
const unused=assets.filter(a=>!used.includes(a) && !a.startsWith('assets/thumbs/'));
fs.writeFileSync('/tmp/unused.txt', unused.join('\n'));
console.log('total',assets.length,'| used',used.length,'| unused',unused.length);
"
```
Expected: `unused`가 600개 이상. 목록이 `/tmp/unused.txt`에 저장됨.

- [ ] **Step 2: 삭제 전 목록 육안 검토**

Run: `head -40 /tmp/unused.txt && echo ... && grep -c . /tmp/unused.txt`
Expected: `assets/source*`, `assets/dino/aseprite_files/` 등 에셋 팩 원본 위주. **`site.css`·`app.js`·`dino.svg`·`thumbs/`가 목록에 있으면 안 된다.** 있으면 Step 1의 판정 로직을 고칠 것.

- [ ] **Step 3: 삭제 실행**

```bash
xargs -a /tmp/unused.txt git rm -q --
```

- [ ] **Step 4: 삭제 후 빌드·링크 무결성 확인**

Run: `npm run build && node -e "
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const refs=[...html.matchAll(/(?:src|href)=\"\/([^\"]+)\"/g)].map(m=>m[1]);
const missing=refs.filter(r=>!r.startsWith('http')&&!fs.existsSync(r));
console.log(missing.length?'MISSING: '+missing.join(', '):'all local refs ok');
"`
Expected: `all local refs ok`

- [ ] **Step 4b: 에셋 라이선스 판정**

기존 README는 itch.io의 `Tiny RPG Character Asset Pack`(Soldier & Orc)을 크레딧한다.
루트의 `soldier_idle.png`, `orc_walk.png`, `assets/dino/` 등이 여기서 왔다.

**광고 수익이 붙는 순간 상업적 이용이 된다.** Step 3의 삭제 후 이 에셋들이 남았는지 확인한다.

Run: `ls assets/soldier_idle.png assets/orc_walk.png assets/dino 2>&1; grep -rl "soldier\|orc\|raptor" play/ 2>/dev/null`
- **아무것도 남지 않았다면** → 라이선스 문제 소멸. Step 6의 README에서 크레딧 항목을 뺀 것이 맞다. 그대로 진행.
- **남아 있고 게임이 실제로 참조한다면** → 두 가지 중 하나를 해야 한다:
  1. [shubibubi.itch.io/tiny-rpg](https://shubibubi.itch.io/tiny-rpg) 라이선스를 확인해 상업적 이용이 허용되면, Step 6 README에 크레딧 항목을 **되살려 유지**한다
  2. 허용되지 않으면 해당 에셋을 쓰는 게임을 `games.json`에서 `status: "draft"`로 내리고, 별도 이슈로 에셋 교체를 남긴다

**판정 결과를 커밋 메시지에 기록할 것.** 이 항목은 계획 3(포털 납품·AdSense) 전에 반드시 해소돼야 한다.

- [ ] **Step 5: 남은 정리**

```bash
git rm implementation_plan_v2.md privacy.html
```

- [ ] **Step 6: README 갱신**

```markdown
# Neon Arcade

Original HTML5 games, published at **[just1game.com](https://just1game.com)**.
Every game is built in-house with vanilla JavaScript and HTML5 Canvas.

## Structure

| Path | Purpose |
|---|---|
| `games.json` | Single source of truth for all game metadata |
| `play/<slug>.html` | Game itself (self-contained, `noindex`) |
| `templates/` | Page templates |
| `build.js` | Static site generator + validation gates |
| `tools/` | Path rules, validation, rendering, thumbnail capture |
| `assets/thumbs/` | Generated WebP thumbnails |

Everything else at the repo root is **generated** — do not edit by hand.

## Adding a game

1. Drop the self-contained game at `play/<slug>.html`
2. Add an entry to `games.json`
3. Run `npm run shoot -- <slug>` to capture the thumbnail
4. Run `npm run build`
5. Commit and push — GitHub Actions deploys

The build fails if a thumbnail is missing, a slug is duplicated, a file is oversized,
or authoring comments leaked into the output.

## Commands

```bash
npm install                  # install dev dependencies
npx playwright install chromium
npm test                     # run validation and render tests
npm run build                # generate the site
npm run shoot                # regenerate all thumbnails
```

## Games

Nine games are currently published. See `games.json` for the authoritative list.

## Credits

Icons: Emoji and CSS graphics.
```

- [ ] **Step 7: 리포 용량 확인**

Run: `du -sh assets/ && git count-objects -vH | grep size-pack`
Expected: `assets/`가 1MB 미만. (git 히스토리 용량은 줄지 않는다 — 정상이다. 히스토리 재작성은 하지 않는다.)

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "chore: remove unused assets, stale files and update README"
```

---

## Task 10: GitHub Actions 배포

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: 워크플로 작성**

빌드 게이트가 실패하면 배포되지 않는다.

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Run tests
        run: npm test

      - name: Build site (validation gates enforced)
        run: npm run build
        env:
          GA_ID: ${{ vars.GA_ID }}
          CONTACT_EMAIL: ${{ vars.CONTACT_EMAIL }}

      - name: Verify sitemap was generated
        run: test -f sitemap.xml && test -f robots.txt && test -f index.html

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: .

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: GitHub Pages 소스를 Actions로 전환**

GitHub 저장소 → Settings → Pages → Build and deployment → Source를 **"GitHub Actions"**로 변경한다. (현재는 "Deploy from a branch"로 되어 있다. 바꾸지 않으면 워크플로가 돌아도 배포되지 않는다.)

- [ ] **Step 3: 리포지터리 변수 등록**

Settings → Secrets and variables → Actions → Variables 탭에서 추가:
- `GA_ID` — Task 11에서 발급받은 GA4 측정 ID (`G-XXXXXXXXXX`)
- `CONTACT_EMAIL` — 실제 연락 가능한 이메일

**둘 다 등록 전이면 이 스텝을 Task 11 이후로 미루고 진행한다.** 변수가 없으면 애널리틱스 없이 빌드된다(빌드는 성공한다).

- [ ] **Step 4: 커밋 및 푸시**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: build, test and deploy to github pages"
git push origin main
```

- [ ] **Step 5: 배포 확인**

Run: `gh run list --limit 3` (또는 GitHub Actions 탭 확인)
Expected: 워크플로 성공.

그 다음 실사이트 확인:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://just1game.com/
curl -s -o /dev/null -w "%{http_code}\n" https://just1game.com/games/dino-jump/
curl -s -o /dev/null -w "%{http_code}\n" https://just1game.com/sitemap.xml
curl -s -o /dev/null -w "%{http_code}\n" https://just1game.com/robots.txt
```
Expected: 전부 `200`

- [ ] **Step 6: CNAME 유지 확인**

Run: `curl -s https://just1game.com/CNAME`
Expected: `just1game.com`

**`CNAME`이 사라지면 커스텀 도메인이 풀린다.** `.gitignore`가 `CNAME`을 제외하지 않는지, 업로드 아티팩트에 포함되는지 확인할 것.

---

## Task 11: 계측 연결 (GA4 + Search Console)

지금은 방문자 유무조차 알 수 없다. 이후 계획 3의 사후 도태 장치가 이 데이터에 의존한다.

**Files:** 없음 (외부 설정 + 이미 `build.js`가 `GA_ID`를 읽도록 되어 있음)

- [ ] **Step 1: GA4 속성 생성**

[analytics.google.com](https://analytics.google.com) → 관리 → 속성 만들기 → 데이터 스트림 → 웹 → `https://just1game.com`
측정 ID(`G-XXXXXXXXXX`)를 받는다.

- [ ] **Step 2: 리포지터리 변수에 등록**

Settings → Secrets and variables → Actions → Variables → `GA_ID` = 발급받은 측정 ID

- [ ] **Step 3: 재배포 후 태그 삽입 확인**

```bash
gh workflow run "Build and Deploy" && sleep 90
curl -s https://just1game.com/ | grep -o 'gtag/js?id=G-[A-Z0-9]*'
```
Expected: `gtag/js?id=G-XXXXXXXXXX`

- [ ] **Step 4: Search Console 등록**

[search.google.com/search-console](https://search.google.com/search-console) → 속성 추가 → URL 접두어 → `https://just1game.com`
확인 방법은 **Google Analytics**를 선택한다 (Step 1~3으로 이미 태그가 있으므로 즉시 확인된다).

- [ ] **Step 5: 사이트맵 제출**

Search Console → Sitemaps → `sitemap.xml` 제출
Expected: 상태 "성공", 발견된 URL 13개

- [ ] **Step 6: 색인 요청**

Search Console → URL 검사에 `https://just1game.com/games/dino-jump/` 입력 → "색인 생성 요청"

색인은 며칠~몇 주 걸린다. 즉시 확인되지 않아도 정상이다.

---

## 완료 확인

계획 1이 끝나면 아래가 전부 참이어야 한다.

- [ ] `npm test` 통과 (paths 4 + validate 12 + build 4 = 20 tests)
- [ ] `npm run build` 성공, `Done. 9 games, 13 indexable URLs.` 출력
- [ ] 썸네일을 하나 숨기면 **빌드가 실패한다** (Task 8 Step 7로 확인 완료)
- [ ] 슬러그를 중복시키면 **빌드가 실패한다** (Task 8 Step 8로 확인 완료)
- [ ] 홈 카드가 정확히 9개, 중복 없음
- [ ] `https://just1game.com/games/<slug>/` 9개 전부 200
- [ ] `sitemap.xml`에 13개 URL
- [ ] 홈 초기 전송량 1MB 이하 — `curl -s https://just1game.com/ | wc -c` 및 썸네일 9장 합계로 확인
- [ ] `index.html` 산출물에 AI 작업 주석 0건
- [ ] GA4 태그가 실사이트에 존재
- [ ] Search Console에 사이트맵 제출 완료
- [ ] `curl https://just1game.com/CNAME` = `just1game.com`

## 다음 계획

**계획 2 — 생산 (P4~P5):** 게임 템플릿(포털 SDK 훅 내장), `/newgame` 스킬, 게이트 1~4(기술 검증·자동 플레이 테스트·LLM 심사·중복 방지).

계획 1 완료 후 작성한다.

# 코지 재기준화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아케이드 전제로 굳어 있는 품질 게이트·채점 기준·영상 도구를 코지 게임이 통과할 수 있는 상태로 바꾼다. 게임은 아직 만들지 않고 지우지도 않는다.

**Architecture:** 기존 도구를 갈아엎지 않는다. `checkPlay`에는 이미 `session === 'single-shot'`이라는 **선언된 변종** 분기가 있고 `window.__GAME__.session`이 `verify.js:280`을 거쳐 리포트까지 흐른다. 같은 자리에 `'cozy'` 값을 하나 더 넣어 배관을 재사용한다. 채점 규칙(`rubric.js`)과 메커니즘 축(`mechanics.js`)은 값만 교체한다.

**Tech Stack:** Node 22, `node --test` (내장 테스트 러너), ES modules. 외부 테스트 프레임워크 없음.

**Spec:** `docs/superpowers/specs/2026-08-29-cozy-pivot-design.md`

## Global Constraints

- **기준선은 215개 테스트 전부 통과다.** 매 태스크 끝에 `node --test`가 215개 이상 통과해야 한다. 줄어들면 뭔가 깨진 것이다.
- **게임을 지우지 않는다.** `play/*.html`, `games.json`은 이 계획에서 건드리지 않는다. `adsense.test.js`가 실제로 빌드를 돌려 `games/pulse-lock/index.html`을 읽으므로, 게임이 0개가 되면 검증 수단이 사라진다.
- **`templates/game-base.html`을 지우지 않는다.** `adsense.test.js`가 이 파일에 `{{ADSENSE}}` 토큰이 **없는지**를 검사한다 — 게임 본체에 광고가 들어가는 것을 막는 안전장치다.
- **브랜드 문자열(`Neon Arcade` → 새 이름)은 이 계획에 없다.** 이름이 아직 확정되지 않았다(Feltling은 핸들 미확인). 삭제 단계에서 함께 처리한다.
- 플랫폼은 macOS 전용이다. Windows 경로를 새로 넣지 않는다.
- 작업 브랜치는 `cozy-pivot`.

---

### Task 1: reel.js 폰트 경로를 macOS로

숏폼이 유통 1순위인데 숏폼 도구가 이 기계에서 안 돈다. `tools/reel.js:47`의 폰트 경로가 Windows 것이라 `ffmpeg`가 자막을 그리다 죽는다.

**Files:**
- Modify: `tools/reel.js:45-48`
- Test: `tests/reel.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (내부 상수만 바뀐다)

- [ ] **Step 1: 폰트 파일이 실제로 있는지 확인**

```bash
ls -la "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
```

Expected: 파일이 존재한다. 없으면 `ls /System/Library/Fonts/Supplemental/ | grep -i bold` 로 다른 볼드 폰트를 고르고 아래 경로를 그것으로 바꾼다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/reel.test.js` 맨 아래에 추가:

```js
/* 이 파일은 윈도우에서 만들어졌고, 폰트 경로가 그대로 남아 있어서 맥에서는
   ffmpeg가 자막을 그리다 죽었다. 앞으로 맥만 쓴다. */
test('자막 폰트가 이 기계에 실제로 존재한다', () => {
  const src = readFileSync('tools/reel.js', 'utf8');
  const m = src.match(/const FONT_FILE = '([^']+)'/);
  assert.ok(m, 'FONT_FILE 상수를 찾지 못했다');
  assert.ok(!m[1].includes('Windows'), `윈도우 폰트 경로가 남아 있다: ${m[1]}`);
  assert.ok(existsSync(m[1]), `폰트 파일이 없다: ${m[1]}`);
});
```

같은 파일 상단 import에 `existsSync`를 추가한다:

```js
import { readFileSync, existsSync } from 'node:fs';
```

- [ ] **Step 3: 실패를 확인한다**

Run: `node --test tests/reel.test.js`
Expected: FAIL — `윈도우 폰트 경로가 남아 있다: C:/Windows/Fonts/segoeuib.ttf`

- [ ] **Step 4: 경로를 고친다**

`tools/reel.js:45-48`을 통째로 아래로 교체한다. **주석까지 교체한다** — 기존 주석은 윈도우 드라이브 문자 이스케이프를 설명하는데, macOS에는 드라이브 문자가 없어서 그 설명이 거짓이 된다.

```js
// macOS 전용이다. 드라이브 문자가 없으므로 ffmpeg 필터에서 콜론을 이스케이프할 일도 없다.
// (윈도우에서 만들 때는 `C\\:/...` 로 콜론을 두 번 이스케이프해야 했다.)
// 경로에 공백이 있지만 필터그래프 전체가 execFile의 argv 한 칸으로 넘어가므로 그대로 둔다.
const FONT_FILE = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
const FONT = FONT_FILE;
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `node --test tests/reel.test.js`
Expected: PASS

- [ ] **Step 6: 전체 테스트로 회귀를 확인한다**

Run: `node --test 2>&1 | tail -8`
Expected: `pass 216`, `fail 0`

- [ ] **Step 7: 커밋**

```bash
git add tools/reel.js tests/reel.test.js
git commit -m "Point the reel captions at a font this machine actually has

The path was written on Windows and never ran here, so the one tool the
short-form plan depends on died on its first real invocation."
```

---

### Task 2: checkPlay에 코지 모드를 넣는다

계약 모드의 세 규칙이 좋은 코지 게임을 무조건 떨어뜨린다. 그 중 하나는 정확히 반대다 — 아케이드는 방치하면 끝나야 하고, 코지는 방치해도 안 끝나야 한다.

**Files:**
- Modify: `tools/gates.js:196-231` (checkPlay 계약 모드 끝부분)
- Test: `tests/gates.test.js`

**Interfaces:**
- Consumes: `verify.js`가 만드는 리포트 객체 `r`. 이미 `r.session`을 담고 있다 (`tools/verify.js:279-280`이 `window.__GAME__.session`을 읽는다).
- Produces: 게임이 `window.__GAME__.session = 'cozy'` 를 선언하면 checkPlay가 코지 규칙으로 판정한다. 다음 계획(첫 게임 구현)이 이 값을 선언한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/gates.test.js` 맨 아래에 추가한다. 기존 파일이 쓰는 헬퍼 이름을 먼저 확인하고(`sed -n '1,30p' tests/gates.test.js`) 계약 모드 리포트를 만드는 기존 방식에 맞춘다. 아래는 필드를 전부 명시한 자립형 버전이다:

```js
/* 코지 게임은 점수도 죽음도 없고 방치해도 끝나지 않는다. 아케이드 규칙 셋이
   그걸 전부 결함으로 읽는다 — 특히 '방치하면 끝나야 한다'는 정확히 반대다.
   'single-shot'과 같은 방식으로, 게임이 스스로 선언할 때만 이 경로를 탄다. */
const cozyReport = () => ({
  label: 'felt-village',
  mode: 'contract',
  api: 1,
  session: 'cozy',
  avgFps: 60,
  fpsWindows: [60, 59, 60],
  heap: { start: 1000, end: 1200 },
  field: { x: 0, w: 390, h: 806, screenW: 390 },
  scoreSamples: [0, 1, 2, 3],
  stateSamples: ['playing', 'playing', 'playing'],
  inputMs: 30000,
  sampleMs: 500,
  idle: { ended: false, afterMs: 20000 },
  restart: null
});

test('코지 게임은 방치해도 안 끝나는 것이 정상이다', () => {
  const { errors } = checkPlay(cozyReport());
  assert.deepEqual(errors, []);
});

test('코지 게임이 방치 중에 끝나버리면 잡는다 — 코지에서는 그게 결함이다', () => {
  const r = cozyReport();
  r.idle.ended = true;
  assert.ok(checkPlay(r).errors.some(e => e.includes('ended while idle')));
});

test('코지 게임도 진행이 없으면 잡는다 — 점수 자리에 진행도를 싣는다', () => {
  const r = cozyReport();
  r.scoreSamples = [0, 0, 0, 0];
  assert.ok(checkPlay(r).errors.some(e => e.includes('no progress')));
});

test('코지가 아닌 계약 게임은 방치하면 끝나야 한다 — 기존 규칙이 그대로다', () => {
  const r = cozyReport();
  r.session = undefined;
  r.restart = { ok: true, state: 'playing', score: 0 };
  assert.ok(checkPlay(r).errors.some(e => e.includes('never ends when idle')));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/gates.test.js`
Expected: FAIL — 첫 테스트가 `never ends when idle` 과 `restart failed` 두 개를 errors에 담아 `deepEqual([])`이 깨진다.

- [ ] **Step 3: 최소 구현**

`tools/gates.js`에서 계약 모드 마지막 세 블록을 찾는다. 현재 모습:

```js
  if (!r.idle?.ended) {
    errors.push(`${at}: never ends when idle — no game over after ${r.idle?.afterMs ?? '?'}ms without input`);
  }

  if (!r.restart?.ok || r.restart.state !== 'playing') {
    errors.push(`${at}: restart failed — state after start() was "${r.restart?.state ?? 'unknown'}"`);
  } else if (r.restart.score !== 0) {
    errors.push(`${at}: score did not reset on restart — ${r.restart.score}`);
  }

  return { errors, skipped };
```

이것을 아래로 교체한다:

```js
  /* 코지는 종결 규칙이 뒤집힌다. 아케이드는 방치하면 끝나야 하고, 코지는 방치해도
     끝나지 않아야 한다 — 손을 놓았다고 판을 뺏는 것은 코지에서 결함이다.
     'single-shot'과 같이 게임이 스스로 선언할 때만 이 경로를 탄다. 조용히 넓히면
     앞으로 만드는 모든 게임이 자기도 모르게 들어가고, 그때는 아무도 눈치채지 못한다.
     점수 검사는 그대로 둔다 — 코지 게임은 score 자리에 진행도(모은 실)를 싣는다. */
  if (r.session === 'cozy') {
    if (r.idle?.ended) {
      errors.push(`${at}: ended while idle after ${r.idle?.afterMs ?? '?'}ms — a cozy game must not take the session away when the player stops`);
    }
    skipped.push(`${at}: restart not checked — a cozy game has no run to restart`);
    return { errors, skipped };
  }

  if (!r.idle?.ended) {
    errors.push(`${at}: never ends when idle — no game over after ${r.idle?.afterMs ?? '?'}ms without input`);
  }

  if (!r.restart?.ok || r.restart.state !== 'playing') {
    errors.push(`${at}: restart failed — state after start() was "${r.restart?.state ?? 'unknown'}"`);
  } else if (r.restart.score !== 0) {
    errors.push(`${at}: score did not reset on restart — ${r.restart.score}`);
  }

  return { errors, skipped };
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test tests/gates.test.js`
Expected: PASS, 4개 신규 테스트 포함

- [ ] **Step 5: 전체 테스트로 회귀를 확인한다**

Run: `node --test 2>&1 | tail -8`
Expected: `pass 220`, `fail 0`

- [ ] **Step 6: 커밋**

```bash
git add tools/gates.js tests/gates.test.js
git commit -m "Let a game declare that it is not supposed to end

The play gate asserted the opposite of what a cozy game wants: an arcade
round must end when the player stops, and a cozy one must not. Taking the
session away because someone put the phone down is the defect, not the pass.

Declared per game, the same way single-shot rounds already are, so nothing
opts in by accident."
```

---

### Task 3: rubric.js를 코지 기준으로

채점표의 두 축이 아케이드를 재고 있다. `session`은 "킬링타임 1~3분 규격"을 20점으로 매기는데 코지는 길수록 좋고, `difficulty`는 "난이도 곡선"을 재는데 코지에는 난이도 곡선이 없다. 지금 기준으로는 좋은 코지 게임이 감점된다.

**Files:**
- Modify: `tools/rubric.js:10-16` (RUBRIC.AXES)
- Test: `tests/rubric.test.js:8-18`, `:36-40`, `:56-61`

**Interfaces:**
- Consumes: 없음
- Produces: `RUBRIC.AXES`의 key가 `responsiveness / satisfaction / visual / dwell / distinctiveness`로 바뀐다. LLM 심사 서브에이전트가 이 key로 채점표를 만든다. 합계 100점, 통과 70점은 그대로다.

- [ ] **Step 1: 테스트를 새 축으로 고친다 (이것이 실패하는 테스트다)**

`tests/rubric.test.js`에서 `okCard()`의 scores를 교체한다:

```js
const okCard = () => ({
  slug: 'felt-village',
  scores: {
    responsiveness: { score: 16, note: NOTE },
    satisfaction: { score: 15, note: NOTE },
    visual: { score: 14, note: NOTE },
    dwell: { score: 15, note: NOTE },
    distinctiveness: { score: 13, note: NOTE }
  }
});
```

같은 파일에서 옛 축 이름을 쓰는 두 곳을 바꾼다:

```js
test('항목이 빠지면 채점 자체를 무효로 본다', () => {
  const card = okCard();
  delete card.scores.dwell;
  const result = scoreCard(card);
  assert.ok(result.errors.some(e => e.includes('dwell')));
  assert.equal(result.verdict, 'invalid');
});
```

```js
test('근거 없는 점수를 잡는다 — 숫자만으로는 검증할 수 없다', () => {
  const card = okCard();
  card.scores.satisfaction.note = 'good';
  const result = scoreCard(card);
  assert.ok(result.errors.some(e => e.includes('satisfaction') && e.includes('note')));
  assert.equal(result.verdict, 'invalid');
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/rubric.test.js`
Expected: FAIL — `satisfaction: missing`, `dwell: missing` 이 나오고 `difficulty`, `session` 이 빠졌다고 잡힌다

- [ ] **Step 3: 축을 교체한다**

`tools/rubric.js`의 `RUBRIC.AXES` 배열을 아래로 교체한다:

```js
  AXES: [
    { key: 'responsiveness', max: 20, label: '조작 반응성', asks: '두드림 하나하나가 즉시 반응하는가' },
    { key: 'satisfaction',   max: 20, label: '손맛',       asks: '아무것도 얻지 못해도 계속 두드리고 싶은가 — 보는 것과 듣는 것 자체가 보상인가' },
    { key: 'visual',         max: 20, label: '시각적 완성도', asks: '200px 썸네일로 줄여도 상품으로 보이는가' },
    { key: 'dwell',          max: 20, label: '머무름',      asks: '3분 이상 머물 이유가 있는가. 빨리 끝나면 감점이다' },
    { key: 'distinctiveness', max: 20, label: '차별성',      asks: '기존 게임과 메커니즘이 겹치지 않는가' }
  ],
```

같은 파일 상단 주석의 마지막 줄도 고친다. 지금은 "이 게이트의 목적은 내부 품질 관리가 아니라 포털 심사 통과다"인데, 코지에서는 목적이 하나 늘었다:

```js
// 이 게이트의 목적은 포털 심사 통과와, 숏폼에서 손이 멈추는 화면인지 판정하는 것이다.
// 코지 게임은 하는 것이 재미있는 것으로 부족하고 보는 것이 만족스러워야 하므로,
// '손맛'과 '머무름'이 '난이도 곡선'과 '킬링타임 규격'을 대신한다.
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test tests/rubric.test.js`
Expected: PASS — `만점은 100점이다` 테스트가 축 합계를 다시 확인해준다

- [ ] **Step 5: 옛 축 이름이 다른 곳에 남아 있지 않은지 확인한다**

Run: `grep -rn "difficulty\|scores.session" tools/ tests/ build.js`
Expected: 출력 없음. 나오면 그 자리도 새 이름으로 고친다.

- [ ] **Step 6: 전체 테스트로 회귀를 확인한다**

Run: `node --test 2>&1 | tail -8`
Expected: `pass 220`, `fail 0`

- [ ] **Step 7: 커밋**

```bash
git add tools/rubric.js tests/rubric.test.js
git commit -m "Score what makes a cozy game good, not what made an arcade one good

Two of the five axes were measuring the opposite of the target. Session
length awarded a one-to-three minute round when a cozy game wants to be
stayed in, and difficulty curve asked for a slope that this kind of game
does not have.

Hand feel and dwell take their places: whether the tapping is worth doing
when it yields nothing, and whether there is a reason to remain."
```

---

### Task 4: mechanics.js에 코지 동사를 넣는다

중복 방지 게이트(게이트 4)가 네 축의 조합만 보고 판정한다. 지금 goal 축에는 `survive / destroy / collect / clear-board / match-pairs / recall-sequence / climb / solve / land-close`밖에 없어서 코지 게임이 자기를 설명할 수 없다. 파일 상단 주석에 적힌 규칙 그대로다 — "새 게임이 기존 축에 안 맞으면 여기에 값을 추가한다. 그 추가 자체가 새 장르라는 뜻이다."

**Files:**
- Modify: `tools/mechanics.js:6-45` (AXES)
- Test: `tests/validate.test.js` (기존 `알 수 없는 축 값을 잡는다` 테스트가 그대로 지켜준다)

**Interfaces:**
- Consumes: 없음
- Produces: `AXES.input`에 `'tap-anywhere'`, `AXES.goal`에 `'mend'`, `AXES.failure`는 기존 `'none'`을 쓴다, `AXES.world`에 `'single-scene'`. 다음 계획의 게임이 `games.json`에 이 값들로 자기를 선언한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/validate.test.js` 맨 아래에 추가한다. 파일 상단에서 `validateMechanics`가 어떻게 import되는지 먼저 확인하고(`head -10 tests/validate.test.js`) 맞춘다:

```js
/* 코지 게임이 자기를 설명할 수 있어야 중복 게이트가 의미를 갖는다. 축에 값이 없으면
   게임이 억지로 아케이드 동사를 골라 적게 되고, 그 순간 중복 검사가 거짓말을 시작한다. */
test('코지 게임의 메커니즘을 축으로 표현할 수 있다', () => {
  const cozy = { input: 'tap-anywhere', goal: 'mend', failure: 'none', world: 'single-scene' };
  assert.deepEqual(validateMechanics(cozy), []);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/validate.test.js`
Expected: FAIL — `mechanics.input "tap-anywhere" is not a known value`, `mechanics.goal "mend" ...`, `mechanics.world "single-scene" ...`

- [ ] **Step 3: 축에 값을 더한다**

`tools/mechanics.js`에서 세 배열에 각각 한 줄씩 **추가한다.** 기존 값은 하나도 지우지 않는다 — 아직 아케이드 게임 19개가 남아 있고 그것들이 이 값들로 자기를 설명하고 있다.

`input` 배열 마지막에:

```js
    'tap-anywhere'       // 화면 아무 데나 누른다. 그 자리로 캐릭터가 가서 행동한다. 이동과 행동이 한 입력이다
```

`goal` 배열 마지막에:

```js
    'mend'               // 풀린 것을 되돌린다. 이기는 것이 아니라 원래대로 만드는 것이 목표다
```

`world` 배열 마지막에:

```js
    'single-scene'       // 스크롤도 전환도 없는 화면 하나. 세로 한 장에 전부 들어간다
```

`failure` 축은 건드리지 않는다. 이미 `'none'`이 있고 그것이 정확히 맞는 값이다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test tests/validate.test.js`
Expected: PASS

- [ ] **Step 5: 기존 게임이 안 깨졌는지 확인한다**

Run: `node build.js 2>&1 | tail -5`
Expected: `Done. 19 games, 23 indexable URLs.` — 축에 값을 더하기만 했으므로 기존 게임 판정은 그대로여야 한다

- [ ] **Step 6: 전체 테스트로 회귀를 확인한다**

Run: `node --test 2>&1 | tail -8`
Expected: `pass 221`, `fail 0`

- [ ] **Step 7: 커밋**

```bash
git add tools/mechanics.js tests/validate.test.js
git commit -m "Give the axes words for a game that mends instead of wins

The duplicate gate judges on four axes alone, and none of the goal values
described restoring something. A game with no word for what it does picks
the nearest arcade verb instead, and from then on the gate is comparing
labels that were never true."
```

---

## Self-Review

**1. Spec coverage.** 스펙 3절 "고친다" 표의 8개 항목 중 이 계획이 다루는 것:

| 스펙 항목 | 태스크 |
|---|---|
| `rubric.js` session 축 | Task 3 |
| `rubric.js` difficulty 축 | Task 3 |
| `gates.js` MIN_CANVAS_MOTION | **다루지 않음 — 스펙이 틀렸다.** 조건이 `stddev < 3 && motion < 2`라 색이 풍부한 정지 화면은 stddev만으로 통과한다. 스펙을 고쳐야 한다 |
| `mechanics.js` 코지 동사 | Task 4 |
| `reel.js` 자막 문구 | **다루지 않음** — 이름이 확정되어야 자막을 쓸 수 있다. 삭제·리브랜딩 단계로 미룬다 |
| `reel.js:47` 윈도우 폰트 경로 | Task 1 |
| `itch.js` `'arcade'` 태그 | **다루지 않음** — 포털 제출은 트래픽 확보 후다 (스펙 9절) |
| `seo.js`·`templates`·`build.js` 브랜드 문자열 | **다루지 않음** — 이름 미확정. 삭제 단계에서 함께 |

스펙에 없던 것 하나를 이 계획이 추가한다: **`checkPlay`의 종결·재시작 규칙** (Task 2). 스펙을 쓸 때 `checkPlay`를 안 읽어서 놓쳤고, 실제로는 `MIN_CANVAS_MOTION`보다 훨씬 큰 장애물이다.

**2. Placeholder scan.** 통과. 모든 코드 단계에 실제 코드가 있다. Task 2 Step 1과 Task 4 Step 1에 "기존 헬퍼 이름을 먼저 확인하라"는 지시가 있는데, 이는 플레이스홀더가 아니라 실행자가 파일을 읽고 맞추라는 구체적 지시이며 자립형 코드를 함께 제공했다.

**3. Type consistency.** `session: 'cozy'`가 Task 2의 테스트·구현·Produces에서 일관되게 쓰인다. rubric 축 key 다섯 개가 Task 3의 세 곳에서 일치한다. mechanics 값 네 개가 Task 4의 테스트·구현·Produces에서 일치한다.

## 이 계획이 끝나면

- 코지 게임이 통과할 수 있는 게이트와 채점표가 선다
- 숏폼 도구가 이 기계에서 돈다
- 아케이드 게임 19개는 **그대로 남아 있고 전부 통과한다**

## 다음 계획

1. **첫 코지 게임** — `templates/game-base.html`을 코지 템플릿으로 교체하면서 동시에 첫 게임을 만든다. 둘을 나누면 `adsense.test.js`가 깨진다
2. **삭제와 리브랜딩** — 게임이 하나 생긴 뒤에야 아케이드 19개를 안전하게 지울 수 있다. 브랜드 문자열 교체를 여기서 함께 한다

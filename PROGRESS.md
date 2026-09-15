# PROGRESS

가장 최근이 맨 위. 세션 끝에 오늘 절을 추가한다.

---

## 2026-09-15 (2) — 게임 3개 추가 + SEO·전수 점검

### 게임 3개. 전부 같은 펠트 세계, 전부 "지는 순간"을 뺐다

19개가 서로 아무 공통점이 없던 것이 정체성 실패의 원인이었다(노트: nineteen-games-zero-players).
새 3개는 Feltling과 같은 천·같은 양모·같은 소리 합성을 쓴다. Patchwork에는 고양이가 자고 있다.

| 게임 | 장르 | 뺀 것 → 대신 놓은 것 |
|---|---|---|
| **Patchwork** | 블록 배치 (1010!/Blockudoku) | "놓을 자리 없음 = 패배" → **퀼트 완성**. 접히고 새 천이 깔린다 |
| **Wool Jars** | 색 분류 (ball sort) | 막힘 → 무제한 되돌리기. 판은 **푼 상태에서 거꾸로 섞어** 생성(못 푸는 판 0) |
| **Yarn Drop** | 합치기 (drop merge) | "바구니 가득 = 패배" → 고양이가 **맨 윗줄을 걷어간다** |

셋 다 `session: 'cozy'`. 중복 게이트 통과(최대 2축 일치), 게이트 1·2 통과.

**게이트가 실제 버그를 잡았다.** Wool Jars가 "no progress — 8초 동안 합법적인 수 0"으로 떨어졌다.
원인 둘 다 진짜였다: ① 빈 항아리가 늘 배열 마지막이라 항상 같은 구석에 몰림(모든 판이 같은 모양)
② 사각형 히트테스트라 항아리 **사이 틈이 죽은 자리**. 둘 다 고쳤다.

Yarn Drop에서는 중력이 추적 칸의 새 위치를 돌려주지 않아 연쇄가 한 단계에서 멈췄다.

### SEO — 솔직한 상태

**기술 SEO는 멀쩡하다.** LCP 344ms(홈), CLS 0.008, canonical·JSON-LD·sitemap·모바일 전부 정상.
내부 링크 91개 크롤, 깨진 링크 0.

**약한 쪽은 키워드였다.** `duckling herding game` 같은 우리가 지어낸 말은 검색량이 0이다
(이건 이 사이트가 이미 한 번 치른 값이다). 20개 전부를 사람이 실제로 치는 말로 바꿨다 —
`snake game`, `breakout game`, `simon says game`, `ball sort puzzle`, `merge puzzle game`.

**다만 과장하지 말 것**: 신규 도메인이 `snake game`으로 뜨지 않는다. 실제로 순위가 날 수 있는 건
개발 노트(롱테일 기술 질의)와 브랜드 검색이다. 검색은 2순위 채널이고 숏폼이 1순위라는
피벗 설계의 결론은 그대로다.

추가로 한 것: 홈에 FAQ 5개 + FAQPage 스키마, 폰트를 CSS `@import`에서 head `link`로(요청 사슬 단축).

### 전체 점검

23개 게임 전부를 모바일 에뮬레이션으로 훑었다(콘솔 에러·가로 넘침·10px 미만 글자·작은 탭 대상).
**23/23 통과.** 그 전에 두 개를 고쳤다:

- `dino-jump`: `width:100%`+padding에 box-sizing이 없어 390px 폰에서 문서가 450px.
  가로 스크롤이 아니라 **레이아웃 뷰포트가 벌어지는** 형태라 게이트가 놓쳤다(scrollWidth === innerWidth).
  게이트에 검사를 추가했다. 상점 설명 10px → 12px.
- `synaptic-grid`: `#bg-pulse`가 `200vw`인데 `position: absolute`. 첫 커밋부터 있던 버그.

### 숫자

| | 어제 | 지금 |
|---|---|---|
| 게임 | 20 | **23** |
| 개발 노트 | 8 | **9** |
| 색인 가능 URL | 34 | **38** |
| 고유 텍스트 | ~25,000단어 | **29,192단어** |
| 테스트 | 249 | **251** |

---

## 2026-09-15 — AdSense 재심사용 콘텐츠 정비 + Feltling 발행

**목표가 바뀐 세션이다.** 시작은 "바이럴 되게 마무리"였고, 중간에 Jayden이
"구글 애드센스 통과가 목적, 반려 사유가 콘텐츠 부족이니 거기에 맞춰 다 고쳐라"로 바꿨다.
그래서 게임 폴리싱은 Feltling 하나에서 멈추고 나머지는 전부 콘텐츠로 갔다.

### 반려 사유를 공식 문서에서 다시 확인했다

`support.google.com/adsense/answer/81904` (미승인 사유), `/answer/9724` (자격),
`publisherpolicies/answer/10502938` (최소 콘텐츠)를 직접 읽었다. 우리에게 해당하는 문장:

- "There isn't enough original, rich content that would be of value to users" — Low value content
- "too little text… under construction" — 불충분
- "found difficult to navigate" — 별도 사유
- 광고를 실으면 안 되는 화면: "without publisher-content or with low-value content,
  that are under construction, that are used for alerts, navigation or other behavioral purposes"

### 고친 것

| 문제 | 조치 | 증거 |
|---|---|---|
| 게임 랜딩 20장이 같은 틀, 고유 본문 220~370단어 | `games.json`에 게임마다 `notes` 2~3문단 추가. 20개 전부 실제 소스를 읽고 사실만 썼다 | 게임 페이지 489~883단어 |
| 편집 콘텐츠 0 | `/notes/` 개발 노트 8편 신설 (999~1403단어/편) | `content/notes/` |
| contact 39단어, privacy 124단어 | contact 355, privacy 825로 다시 씀. privacy에 AdSense 쿠키·EEA 동의·CCPA·아동 조항 명시 | 빌드 출력 |
| 출처 불명 에셋 의혹 | `/credits/` 신설. 실제로 전수 확인 결과 **서드파티 에셋 0** — 예전 itch.io 스프라이트 3종은 이미 파일째 삭제돼 있었고 참조도 없다. README의 표가 낡아 있었다 | `grep` 결과, README 갱신 |
| 사이드바 아이콘 하나뿐인 탐색 | 모든 페이지에 가로 내비게이션(Games / Dev notes / About) + 확장된 푸터 | `tools/notes.js`의 `NAV`, 테스트로 강제 |
| 홈 본문이 4문장 | 홈 카피 재작성 (921단어) | |

사이트 전체 고유 텍스트가 대략 6,000단어 → **25,000단어**가 됐다.

### Feltling (`play/feltling.html`) — 발행

9/1에 "플레이 가능, 아트 미완"으로 멈춰 있던 것을 마무리하고 `games.json`에 넣었다.
`featured: true`라 홈 히어로가 이 게임이다.

- 펠트 렌더링: 섬유 타일 1장을 `overlay`로 전체에 덮는 방식, 흔들린 외곽선, 접지 그림자, 바느질 점선
- 털은 **세 번째 시도**에 자리를 잡았다. ① 알파 겹치기 → 진행이 안 보임 ② 원 뿌리기 → 뽁뽁이 + 고슴도치
  ③ 바탕색 보간 + 큰 불규칙 덩어리 + 위에서부터 덮기 → 됨
- 소리: 노이즈 + 로우패스. 단계가 오를수록 컷오프가 2600→520Hz로 내려간다. 볼륨은 안 올린다
- 공유 카드: 화면을 그대로 잘라 1080×1200 PNG. `navigator.share` → 실패 시 저장
- `?stage=N`으로 단계를 강제할 수 있다 (클립·썸네일 촬영용)

### 버그 하나를 실제로 잡았다 — 코지 게이트가 배선되지 않았었다

`tools/gates.js`에는 9/1부터 `session === 'cozy'` 분기가 있었고 단위 테스트 4개가 통과 중이었다.
그런데 `tools/verify.js:279`가 `'single-shot'`이 아닌 모든 값을 `'run'`으로 눌러 보내고 있었다.
게임이 코지를 선언해도 그 선언이 판정 함수에 닿지 않았다. 실제 게임을 게이트에 처음 통과시킨
오늘에서야 드러났다 (`never ends when idle`, `score did not reset on restart`).

화이트리스트로 고쳤다. 모르는 값은 여전히 `'run'`이다. 이 사건은 노트 한 편으로 썼다
(`a-gate-that-graded-the-opposite`).

**교훈**: 입력을 스스로 만들어 넣는 테스트는 "그 입력을 만드는 것이 실제로 있는지"를
검증하지 못한다. 초록불 5개가 2주를 벌어줬다.

### 공유·첫인상

- **홈 히어로에 대표 게임 스크린샷**을 넣었다. 색 블록 하나였던 자리라 사이트가 미완성으로 읽혔다
- **OG 카드가 게임 색을 따라간다** (`tools/og.js`). 예전엔 항상 `#05060a` + 청록이라
  크림색 게임 카드가 절반 검정으로 나갔다. 썸네일 대표색에서 뽑고, 밝은 게임은
  밝은 판 + 어두운 글씨로 **극성을 뒤집는다**. 대비 4.5:1을 테스트가 강제한다
- `tools/og.js`의 CLI를 `import.meta.url` 가드 뒤로 옮겼다. 예전엔 import만 해도
  카드 20장을 다시 만들고 `process.exit`을 불렀다 — 테스트에서 함수 하나를 못 가져왔다
- **`captureQuery`** 필드 추가(`tools/shoot.js`). Feltling 썸네일이 맨몸 회색 물범이라
  이 게임이 무엇에 관한 것인지 한 장도 말하지 못했다. 이제 `stage=3`으로 열어 찍는다

### 테스트

`npm test`를 `--test-concurrency=1`로 바꿨다. `adsense.test.js`와 새 `notes.test.js`가
둘 다 `node build.js`를 돌려 같은 경로에 쓰기 때문에 병렬이면 서로를 덮는다 (실제로 2개 실패했다).

220 → **249 통과, 실패 0.**

### 게이트 전수 검사 결과

`node tools/verify.js --quick` 20개 → **16 통과**. 실패 4개를 전부 끝까지 확인했다.

| 게임 | 실패 | 판정 |
|---|---|---|
| one-shot | never ends when idle (8.0s) | **quick 모드 인공물.** 이 게임의 샷 클락이 15초라 8초 창을 못 넘긴다. full 모드(20초 창)에서 통과 — idle grace 15,067ms |
| lantern-keeper | never ends when idle (8.0s) | **quick 모드 인공물.** 설계상 방치 사망이 ~11초. full 모드에서 통과 |
| ember-drift | no progress — score never changed | **quick 모드 인공물.** full 모드에서 통과 |
| synaptic-grid | horizontal overflow on mobile — scrollWidth 585 > 390 | **진짜 버그였다. 고쳤다.** |

`synaptic-grid`의 `#bg-pulse`가 `200vw`인데 `position: absolute`였다. 390px 폰에서 문서 폭이
585px가 되어 페이지가 가로로 밀렸다. `body { overflow: hidden }`은 `documentElement.scrollWidth`를
줄이지 않는다. `position: fixed`로 바꾸면 문서 흐름 밖이라 넘침이 사라지고 화면은 똑같다.
사이트 첫 커밋(`0c6bf91`)부터 있던 버그다.

**교훈: `--quick`의 실패는 그대로 믿으면 안 된다.** 입력·방치 창이 8초라 방치 사망이 8초보다
느린 게임은 전부 걸린다. 실패가 나오면 그 게임만 full 모드로 다시 돌려 판정한다.

### 크레딧 페이지가 틀렸던 것

이 세션에서 내가 쓴 `/credits/`에 "서드파티 웹폰트를 쓰지 않는다"고 적었는데 **사실이 아니었다.**
`assets/site.css`가 Fredoka·Outfit을, 게임 9개가 Audiowide·Orbitron·Press Start 2P·Share Tech Mono를
구글 폰트에서 받는다. 검증 가능하라고 만든 페이지에 틀린 문장을 실은 것이라 바로 고쳤고,
privacy에 폰트 요청이 IP를 구글에 넘긴다는 절을 추가했다. 새 게임은 시스템 폰트를 쓴다(Feltling은 외부 요청 0).

### 여기서 할 것

1. **AdSense 재심사 요청 — Jayden이 직접 누른다.** (세션이 대신 누르지 않는다)
   - adsense.google.com → 왼쪽 **사이트** → `just1game.com` → **검토 요청**
   - 누르기 전 확인용 (전부 2026-09-15 새벽에 실측해 둠):
     `curl -s https://just1game.com/ | grep -c adsbygoogle` → 1,
     `curl -s https://just1game.com/ads.txt` → `pub-6091491156053589`,
     `/about/`·`/contact/`·`/privacy/`·`/credits/`·`/notes/` 전부 200, 광고 0
   - 심사는 보통 며칠~2주. 그 사이 **자기 광고를 클릭하지 않는다**(정책 위반)
2. 배포 확인: GitHub Actions가 `npm test` → `npm run build` → Pages 순으로 돈다.
   워크플로에 `notes/index.html`·`credits/index.html` 존재 검사와 광고 위치 검사를 추가해 뒀다.
3. **Search Console에 새 sitemap 제출** — 색인 가능 URL 24 → 34개.
4. 숏폼: 게임이 720×1280 비율이라 녹화가 곧 클립이다. 아직 한 편도 안 찍었다.

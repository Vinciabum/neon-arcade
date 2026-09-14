# PROGRESS

가장 최근이 맨 위. 세션 끝에 오늘 절을 추가한다.

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

### 테스트

`npm test`를 `--test-concurrency=1`로 바꿨다. `adsense.test.js`와 새 `notes.test.js`가
둘 다 `node build.js`를 돌려 같은 경로에 쓰기 때문에 병렬이면 서로를 덮는다 (실제로 2개 실패했다).

220 → **240 통과, 실패 0.**

### 여기서 할 것

1. **AdSense 재심사 요청** — Jayden이 직접. 사이트가 배포된 뒤에 누른다.
2. 배포 확인: GitHub Actions가 `npm test` → `npm run build` → Pages 순으로 돈다.
   워크플로에 `notes/index.html`·`credits/index.html` 존재 검사와 광고 위치 검사를 추가해 뒀다.
3. **Search Console에 새 sitemap 제출** — 색인 가능 URL 24 → 34개.
4. OG 카드가 아직 어두운 네온 테마다(`tools/og.js`). Feltling 카드만 톤이 어긋난다.
   공유 유입을 시작하기 전에 손볼 것.
5. 썸네일에서 물범이 아래로 잘린다. `tools/shoot.js`가 `?stage=` 같은 쿼리를 못 붙여서
   0단계 화면만 찍힌다. 3단계(듬성듬성)가 제일 잘 팔리는 그림이다.
6. 숏폼: 게임이 720×1280 비율이라 녹화가 곧 클립이다. 아직 한 편도 안 찍었다.

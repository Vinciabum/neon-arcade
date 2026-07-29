# Neon Arcade (just1game.com) — 자동 게임 발행 파이프라인 설계

- 작성일: 2026-07-29
- 대상 리포: `Vinciabum/neon-arcade` (public, GitHub Pages, `CNAME=just1game.com`)
- 상태: 설계 확정 대기

---

## 1. 배경

### 현재 상태

2026-02-18 하루에 커밋 8개로 만들어진 뒤 5개월간 방치. 마지막 기능 커밋이
`"Add Cyber Memory, Data Fall, and Synaptic Grid games"`이고, **정확히 그 커밋에서 깨진 채 멈췄다.**

확인된 결함:

| 결함 | 내용 |
|---|---|
| AI 작업 주석 유출 | `index.html` 인라인 JS에 미해결 상태를 서술한 주석 약 40줄이 프로덕션에 배포됨 |
| 카드 중복 렌더링 | 정적 HTML 카드 4개 + JS `games.forEach` 9개가 같은 `#gameGrid`에 렌더 → 4개 중복 표시 |
| 썸네일 404 | `thumb_memory.png`, `thumb_data.png`, `thumb_synaptic.png` 부재 → 외부 `placehold.co` 폴백 |
| 성능 | 살아있는 썸네일 6장이 장당 1.3~1.7MB PNG. 홈 초기 로드 약 7MB |
| 색인 URL 1개 | 게임은 iframe 모달로만 열려 URL이 변하지 않음. 게임 페이지 9개는 어디서도 링크되지 않은 고아 |
| SEO 기본 누락 | `robots.txt`·`sitemap.xml`·meta description·canonical 전부 없음 |
| 도메인 불일치 | `og:url`/`og:image`가 `vinciabum.github.io`를 가리킴 → 중복 콘텐츠 경쟁 |
| 광고 미설치 | 광고 자리(`300x250`, `300x600`, Sponsored 카드)는 빈 껍데기. AdSense 코드·`ads.txt` 없음 |
| 계측 없음 | GA4·Search Console 미연결. 방문자 유무조차 알 수 없음 |
| 리포 오염 | 11.1MB 중 11.0MB가 미사용 에셋 팩 704개. `implementation_plan_v2.md`는 0바이트 |
| 문서 불일치 | README는 게임 6개로 기재, 실제 9개 |
| 연락처 부재 | `privacy.html`에 실제 이메일 없음 (AdSense 심사 감점 요인) |

### 근본 원인

기능 부족이 아니다. **게임 하나를 추가하려면 `index.html` 안 3곳(배열·정적 카드·썸네일)을 손으로 맞춰야 하고,
틀려도 아무 신호가 없다.** 마찰이 높고 실수가 조용히 통과한다. 그래서 3개 추가 시도에서 깨졌고 그대로 멈췄다.

> 이 설계의 1차 목표는 기능 추가가 아니라 **마찰 제거와 실수 차단**이다.

---

## 2. 목표와 완료 기준

### 목표

1. **게임 추가 마찰을 0으로** — `games.json` 한 곳만 수정하면 카드·개별 페이지·사이트맵·OG가 전부 자동 생성
2. **조용히 깨지지 않게** — 빌드 시 검증 게이트가 하나라도 실패하면 배포 차단
3. **완전 자동 생산** — 주 1개 게임을 사람 개입 없이 생성·검증·발행
4. **수익 채널 확보** — 포털 납품(단기) + 사이트 광고(장기)

### 완료 기준 (검증 가능)

- [ ] `games.json`에 한 줄 추가 → 빌드 → 홈 카드·개별 URL·사이트맵에 자동 반영됨
- [ ] 썸네일 누락/슬러그 중복/게임 파일 부재 시 **빌드가 실패한다** (테스트로 확인)
- [ ] 홈 초기 로드 1MB 이하
- [ ] 게임 수 + 5개(홈·about·contact·privacy·404) 만큼의 URL이 `sitemap.xml`에 존재
- [ ] `/newgame` 실행 한 번으로 게임 생성부터 배포까지 완료
- [ ] Search Console에 게임 개별 URL이 색인됨
- [ ] GameDistribution에 게임 1개 이상 승인

### 비목표 (YAGNI)

- 서드파티 게임 피드 임포트 — Google의 scaled content abuse 정책 위반 위험
- 회원가입·서버·DB — 진행도는 `localStorage` 유지
- 프레임워크 도입(React/Astro 등) — 정적 HTML + 소형 Node 생성기로 충분
- 다국어 — 영어 단일

---

## 3. 수익 모델

### 채널 우선순위

| 순위 | 채널 | 필요 조건 | 특성 |
|---|---|---|---|
| 1 | **GameDistribution** | 게임 품질 중하, SDK 내장 | 문턱 최저. 승인 시 수백 개 사이트에 자동 배포. **내 트래픽 0에서도 수익 발생** |
| 2 | **GamePix** | 게임 품질 중 | 개발자 레브셰어 45% |
| 3 | **CrazyGames** | 게임 품질 상, 사람 심사 | 월 2,000만 플레이어. 통과 시 규모가 크다 |
| 4 | **사이트 AdSense** | 트래픽 5만 PV/월 | 게임 니치 RPM $1~3. 첫 지급($100)까지 1~2년 |

### 핵심 판단

**이 프로젝트의 자산은 사이트가 아니라 "게임 재고"다.**
사이트는 게임을 뿌리는 여러 채널 중 하나이며, 그중 수익성이 가장 낮고 가장 느리다.
따라서 **게임 템플릿에 포털 SDK를 처음부터 내장**하여 생성되는 모든 게임이 태어날 때부터 납품 가능한 규격이 되게 한다.

사이트를 유지하는 이유:
- 게임의 canonical 홈 (포털 심사 시 개발자 신뢰도)
- 파이프라인이 개별 페이지·사이트맵을 어차피 자동 생성하므로 **추가 비용 0**
- 1~2년 뒤 AdSense가 붙을 장기 자산

### 수익 추정 (정직한 수치)

사이트 AdSense, $2 RPM 가정:

| 월 페이지뷰 | 월 수익 |
|---|---|
| 1,000 | 약 $2 |
| 10,000 | 약 $20 |
| 50,000 | 약 $100 (첫 지급선) |

신규 사이트가 6개월 뒤 도달하는 현실적 수치는 월 1,000~5,000 PV.
**사이트 광고 단독으로는 용돈 수준이다.** 포털 납품이 실질 수익원이다.
포털 수익도 게임별 편차가 극단적이며, 대부분은 소액이고 소수가 대부분을 차지한다.

---

## 4. 아키텍처

### 4.1 단일 진실 원천 — `games.json`

게임 정보는 **오직 여기에만** 존재한다. 다른 어떤 파일에도 게임을 하드코딩하지 않는다.

```json
{
  "slug": "dino-jump",
  "title": "Dino Jump",
  "tagline": "A high-speed endless runner with power-ups and a shop.",
  "description": "120~160자. meta description으로 그대로 사용.",
  "tag": "Runner",
  "controls": {
    "keyboard": "Space / ↑ to jump, ↓ to duck",
    "touch": "Tap to jump, swipe down to duck"
  },
  "howToPlay": ["문장 3~6개. 개별 페이지 본문에 사용."],
  "tips": ["선택. 공략 팁."],
  "releasedAt": "2026-02-18",
  "status": "published",
  "featured": false,
  "portals": { "gamedistribution": null, "gamepix": null, "crazygames": null }
}
```

- `status`: `draft` | `published` | `demoted` | `removed`
  - `draft` — 빌드 산출물에서 제외
  - `demoted` — 페이지는 유지하되 `noindex`, 홈 하단 배치
  - `removed` — 페이지 삭제, 사이트맵 제외
- 파일 경로는 필드로 두지 않고 `slug`에서 규칙으로 유도 → 불일치 원천 차단
  - 게임 본체: `play/<slug>.html`
  - 썸네일: `assets/thumbs/<slug>.webp`

**슬러그는 하이픈 표기로 통일한다.** 기존 `dino_jump` → `dino-jump`. 외부 유입 링크가 없으므로 리다이렉트 불필요.

### 4.2 생성기 — `build.js`

Node 단일 스크립트. 런타임 의존성 없음(썸네일 변환만 `sharp` 사용, devDependency).

입력: `games.json`, `templates/`, `play/`, `assets/thumbs/`

출력:
- `index.html` — 카드 그리드 (정적 HTML과 JS 이중 렌더링을 **제거**하고 빌드 시점 단일 생성)
- `games/<slug>/index.html` — 게임별 랜딩 페이지 (**색인 대상**)
  - 고유 `<title>`, meta description, canonical, OG/Twitter (전부 `https://just1game.com` 기준)
  - 게임 iframe + How to Play + Controls + Tips + 다른 게임 링크(내부 링크망)
  - `VideoGame` JSON-LD 구조화 데이터
- `play/<slug>.html` — 게임 본체. `<meta name="robots" content="noindex">` 주입, 랜딩으로 canonical
- `sitemap.xml`, `robots.txt`
- `about/`, `contact/`, `privacy/` — 템플릿 기반 정적 페이지

**색인 URL 수: 1개 → 게임 수 + 5개.**

### 4.3 검증 게이트 (빌드 실패 조건)

빌드 중 아래 하나라도 걸리면 **비정상 종료하고 배포하지 않는다.**

1. `slug` 중복 → *중복 카드 사고 재발 방지*
2. `slug`가 `^[a-z0-9-]+$` 위반
3. `play/<slug>.html` 부재 → *깨진 링크 방지*
4. `assets/thumbs/<slug>.webp` 부재 → *404 썸네일 사고 재발 방지*
5. 필수 필드 누락 (`title`, `description`, `tag`, `controls`, `releasedAt`)
6. `description` 길이 범위 밖 (80~200자)
7. 썸네일 용량 200KB 초과 → *7MB 사고 재발 방지*
8. 게임 본체 HTML 500KB 초과
9. 산출 HTML에 AI 작업 주석 패턴 잔존 (`I am supposed to`, `TODO:`, `we should` 등) → *주석 유출 재발 방지*

> 지금까지의 사고는 전부 "틀렸는데 배포됐다"였다. 게이트는 그 상태를 구조적으로 불가능하게 만든다.

### 4.4 배포 — GitHub Actions

`main` push → `build.js` 실행 → 게이트 통과 → GitHub Pages 배포.
게이트 실패 시 배포 중단.

### 4.5 게임 템플릿

`templates/game-base.html` — 새 게임의 출발점. 처음부터 내장:
- 반응형 캔버스 + 키보드/터치 이중 입력
- `localStorage` 최고점 저장
- AudioContext 사용자 제스처 이후 초기화 (모바일 정책)
- **포털 SDK 훅** — GameDistribution SDK 연동 지점을 미리 뚫어둠. 사이트 배포 시에는 비활성, 포털 납품 빌드에서 활성
- 일시정지/재개, 게임오버 화면 표준 구조

---

## 5. 자동 생산 파이프라인 (`/newgame`)

사람 개입 없이 실행된다.

```
컨셉 생성 (게이트 4 중복 검사 통과할 때까지)
  → 게임 구현 (templates/game-base.html 기반)
  → 게이트 1: 기술 검증
  → 게이트 2: 자동 플레이 테스트
  → 게이트 3: LLM 심사 (70점)
  → 썸네일 자동 캡처 → WebP
  → games.json 등록 → build.js → 검증 게이트
  → git commit & push → Actions 배포
  → 포털 납품 패키지 생성
```

### 게이트 1 — 기술 검증 (Playwright)

실제 브라우저에 로드하여 확인. 하나라도 실패 시 재시도(최대 3회) 후 폐기.

- 콘솔 에러 0
- 캔버스가 실제로 픽셀을 그림 (빈 화면 아님)
- 터치 이벤트 핸들러 등록됨 (모바일 필수)
- 로드 완료 2초 이내
- 모바일 뷰포트(390×844)에서 레이아웃 정상

### 게이트 2 — 자동 플레이 테스트 (Playwright)

봇이 60초간 입력을 넣고 게임 상태를 관찰한다.

- **진행성**: 입력에 따라 점수/상태가 실제로 변한다
- **종결성**: 게임오버 조건이 작동한다 (끝이 있다)
- **방치 종결**: 입력을 주지 않으면 게임이 끝난다 (방치해도 안 끝나면 고장)
- **성능**: 60초 내내 평균 50FPS 이상, 메모리 증가가 선형 폭증하지 않음
- **재시작**: 게임오버 후 재시작이 동작한다

### 게이트 3 — LLM 심사관 (Generator-Evaluator)

**생성한 에이전트와 분리된** 심사 에이전트가 코드 + 플레이 스크린샷 10장 + 플레이 로그를 받아 채점.

| 항목 | 배점 | 기준 |
|---|---|---|
| 조작 반응성 | 20 | 입력 지연, 관성·가속 처리의 자연스러움 |
| 난이도 곡선 | 20 | 초반 진입 난이도, 상승 속도의 합리성 |
| 시각적 완성도 | 20 | 스크린샷이 상품으로 보이는가 |
| 세션 길이 적합성 | 20 | 킬링타임(1~3분) 규격에 맞는가 |
| 기존 게임 대비 차별성 | 20 | 메커니즘 중복 여부 |

**70점 미만 → 재생성. 3회 실패 → 해당 컨셉 폐기.**

이 게이트의 실질적 목적은 내부 품질 관리가 아니라 **포털 심사 통과**다.
느슨하게 잡으면 포털 채널이 닫히고 저수익 AdSense만 남는다.

### 게이트 4 — 중복 방지

기존 전체 게임과 컨셉·메커니즘을 대조. 유사하면 컨셉 단계에서 거부.
**scaled content abuse 방어의 실질적 핵심.** "비슷비슷한 게임 50개"가 가장 위험한 형태다.

### 썸네일

게임을 실제 실행하여 캔버스 스크린샷을 자동 캡처 → WebP 변환 → 200KB 이하.
**유료 이미지 생성 API를 사용하지 않는다 (비용 0).**

### 발행 속도 제한

**주 1개 상한.** 게이트를 전부 통과하더라도 단기 대량 생성 패턴 자체가 위험 신호다.
주 1개 = 연 50개. 충분히 빠르고 안전하다.

---

## 6. 사후 도태 (사람 승인의 대체 장치)

사전 승인을 두지 않는 대신, **실제 플레이어 데이터로 사후 판정**한다.

- GA4로 게임별 평균 체류시간·재플레이율·이탈률 추적
- **발행 2주 후 자동 판정**
  - 기준 미달 → `status: demoted` (noindex, 홈 하단 강등)
  - 심한 미달 → `status: removed` (페이지·사이트맵 제외)
- 판정은 `games.json` 수정 → 빌드 → 배포로 자동 반영

**감수하는 것:** 저품질 게임이 최대 2주간 사이트에 노출된다.
완전 자동화를 택한 이상 이 노출 기간은 불가피하며, 이를 수용하는 것이 이 설계의 전제다.

---

## 7. 디렉토리 구조

```
neon-arcade/
├─ games.json                  # 단일 진실 원천
├─ build.js                    # 생성기 + 검증 게이트
├─ templates/
│  ├─ game-base.html           # 새 게임 출발점 (포털 SDK 훅 내장)
│  ├─ home.html
│  ├─ game-landing.html
│  └─ page.html                # about / contact / privacy
├─ play/<slug>.html            # 게임 본체 (noindex)
├─ assets/thumbs/<slug>.webp   # 썸네일 (200KB 이하)
├─ tools/
│  ├─ verify.js                # 게이트 1·2 (Playwright)
│  ├─ shoot.js                 # 썸네일 캡처
│  └─ cull.js                  # 사후 도태 판정
├─ .github/workflows/deploy.yml
└─ docs/superpowers/specs/     # 설계 문서

# 빌드 산출물 (생성됨)
├─ index.html
├─ games/<slug>/index.html
├─ about/ contact/ privacy/
├─ sitemap.xml  robots.txt
```

---

## 8. 정리 작업

- `index.html` 인라인 JS의 AI 작업 주석 약 40줄 삭제
- 정적 카드 HTML 제거 (빌드 시점 단일 생성으로 대체)
- 썸네일 6장 PNG → WebP (**약 7MB → 300KB 이하**)
- 미사용 에셋 팩 정리 (`assets/source (4)/`, `aseprite_files/` 등 약 700개)
- `implementation_plan_v2.md`(0바이트) 삭제
- README 게임 수 불일치(6↔9) 수정
- `privacy.html`에 실제 연락처 이메일 추가, `contact` 페이지 신설 (AdSense 심사 요건)
- 에셋 라이선스 확인 — README가 크레딧한 itch.io `Tiny RPG Character Asset Pack`의 상업적 이용 가능 여부 검증. 불가 시 해당 에셋 제거

---

## 9. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 자동 생성 게임의 품질 미달 | 게이트 3(70점) + 사후 도태. 저품질 최대 2주 노출은 감수 |
| scaled content abuse 판정 | 전량 자체 제작 + 게이트 4 중복 방지 + 주 1개 속도 제한 |
| AdSense 계정 정지 | 게임 창 근처 광고 배치 금지(실수 클릭). 게임 프리롤은 별도 계약 없이는 미사용 |
| 포털 심사 반려 | 게이트 3 기준을 포털 기준에 맞춰 조정. 문턱 낮은 GameDistribution부터 진입 |
| 에셋 라이선스 위반 | 상업적 이용 가능 에셋만 사용. 8절에서 기존 에셋 검증 |
| 자동 push로 인한 사고 | force push·히스토리 변경 금지. 일반 push만. 게이트 실패 시 push 자체를 하지 않음 |

---

## 10. 로드맵

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **P0** | GA4 + Search Console 연결 | 데이터 수집 시작. 사후 도태 장치의 전제 |
| **P1** | 버그 3종 수정, 리포 정리 | 주석·중복카드·썸네일404 해소, 홈 1MB 이하 |
| **P2** | `games.json` + `build.js` + 검증 게이트 + Actions | 게임 추가가 JSON 1곳 수정으로 완결 |
| **P3** | 개별 URL + 사이트맵 + 구조화 데이터 | 게임별 URL이 Search Console에 색인 |
| **P4** | `templates/game-base.html` + 포털 SDK 훅 | 새 게임이 납품 규격으로 생성됨 |
| **P5** | `/newgame` 스킬 + 게이트 1·2·3·4 | 명령 1회로 생성~배포 완료 |
| **P6** | GameDistribution 납품 | 게임 1개 이상 승인 |
| **P7** | 주간 자동 실행 + 사후 도태 | 사람 개입 0으로 주 1개 발행 |
| **P8** | 게임 15~20개 시점에 AdSense 신청 | 승인 |

> **P7 활성화 전 1회 한정 확인.** P5로 만든 게임 2~3개의 품질을 직접 보고 게이트 3의 채점 기준을 보정한 뒤 주간 자동 실행을 켠다.
> 이는 상시 승인 게이트가 아니라 **기준 보정을 위한 최초 1회**다. 켠 이후에는 사람 개입 없이 돌아간다.
> 보정 없이 자동 축적을 시작하면 잘못된 기준으로 쌓인 것을 되돌리는 비용이 더 크다.

### 구현 계획 분할

이 문서는 P0~P8 전체를 다루므로 단일 구현 계획으로 실행하기에는 범위가 크다. 3개로 나눈다.

| 계획 | 범위 | 산출물 |
|---|---|---|
| **계획 1 — 기반** | P0~P3 | 계측 연결, 버그·리포 정리, `games.json`+`build.js`+검증 게이트+Actions, 개별 URL·사이트맵 |
| **계획 2 — 생산** | P4~P5 | 게임 템플릿(포털 SDK 훅), `/newgame` 스킬, 게이트 1~4 |
| **계획 3 — 수익** | P6~P8 | 포털 납품, 주간 자동 실행, 사후 도태, AdSense |

계획 1부터 착수한다. 각 계획은 완료 후 다음 계획을 작성한다.

---

## 11. 권한 범위

이 파이프라인은 `Vinciabum/neon-arcade` 리포에 자동으로 커밋·푸시한다.

- 허용: 해당 리포 `main`에 대한 일반 push
- 금지: force push, 히스토리 변경, 다른 리포 조작, 글로벌 git 설정 변경
- 게이트 실패 시 push하지 않는다
- 유료 API(이미지 생성 등) 미사용 — 썸네일은 스크린샷 캡처

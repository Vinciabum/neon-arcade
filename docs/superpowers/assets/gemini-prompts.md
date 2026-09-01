# 펠트 에셋 프롬프트

도구: Gemini (Nano Banana). 구독 중이라 추가 비용 없음.

## 규칙

- **시트마다 새 대화.** 같은 대화에서 연속 생성하면 앞 이미지의 스타일이 섞인다.
- **낱장으로 여러 번 뽑지 않는다.** 한 장 안에 격자로 다 넣는다 — 같은 이미지에서 나온 것은
  스타일이 자동으로 같다. AI 캐릭터 일관성 문제는 "여러 번 생성"할 때만 생긴다.
- **배경은 평평한 마젠타(#FF00FF).** Gemini는 투명 PNG를 안정적으로 못 뽑는다. 마젠타로 뽑고
  `sharp`로 키잉한다.
- 프롬프트에 반드시 넣을 것: 배경 단색 균일(격자 칸·패널 금지), 중복 항목 금지, 캐릭터 개수 명시.
  1차 시도에서 갈대·연잎이 중복으로 나왔고 수달이 3마리가 아니라 4마리 나왔다.
- 소품을 나중에 추가할 때도 **같은 스타일 블록**(첫 문단)을 그대로 써야 어긋나지 않는다.

## 판정

원본이 예쁜 것은 근거가 아니다. 200px로 줄여서 본다.

```bash
cd ~/Downloads && for f in *.png; do sips -Z 200 "$f" --out "small-$f"; done && open small-*.png
```

## 시트 1 — 물범 6단계

한 장에 여섯을 다 넣어야 같은 물범으로 나온다. 나눠 뽑으면 6단계가 서로 다른 물범이 된다.

```
Needle-felted wool craft style. Everything looks like a handmade felt toy photographed from directly above: soft fuzzy fiber texture, slightly imperfect hand-shaped forms, muted warm natural dye colors.

A single sheet on a flat solid magenta (#FF00FF) background. The background is one uniform flat magenta everywhere - no grid cells, no panels, no boxes, no lines, no shadows, no color variation anywhere in the background.

The SAME seal character shown 6 times in one horizontal row, all identical in size, pose and camera angle - sitting upright, facing front, small flippers resting on its belly, calm blank content expression. The ONLY thing that changes across the six is how much wool fur covers it:

1. completely bare - smooth grey seal skin, no wool at all
2. a few small tufts of cream wool on the top of the head and the upper back
3. patchy - roughly half covered, bare grey skin still clearly showing between the tufts
4. evenly covered in a thin even layer of cream wool, the body shape still slim
5. thick and fluffy, the silhouette noticeably rounder than before
6. fully felted - deep plush cream wool everywhere, roundest of all

The face stays fully visible and uncovered in all six. Even flat lighting. No cast shadows. No text, no labels, no numbers, no watermarks. Each of the six stays readable when scaled down to 200 pixels wide.
```

**얼굴은 여섯 모두에서 안 가려져야 한다.** 표정이 이 게임의 유일한 보상이라, 털이 눈을 덮으면
보상이 사라진다. 캔버스 임시 그림에서 실제로 그 사고가 났다.

## 시트 2 — 고양이와 소품

```
Needle-felted wool craft style. Everything looks like a handmade felt toy photographed from directly above: soft fuzzy fiber texture, slightly imperfect hand-shaped forms, muted warm natural dye colors.

A single sheet on a flat solid magenta (#FF00FF) background. The background is one uniform flat magenta everywhere - no grid cells, no panels, no boxes, no lines, no shadows, no color variation anywhere in the background.

12 separate items, evenly spaced, each fully separated from the others, nothing overlapping, nothing touching the image edges.

Exactly 3 cats and no more - the SAME small cat character in 3 poses, identical in size and style: (1) sitting, seen from the side (2) mid-stride walking, seen from the side (3) reaching out with one front paw to tap something.

Then exactly 9 more items, each appearing only once, no duplicates: a ball of cream yarn, a loose curl of yarn thread, a smooth grey pebble, a small wooden stool, a round wooden log slice, a lily pad, a mushroom, a tuft of grass, a small woven basket.

Even flat lighting. No cast shadows. No text, no labels, no watermarks. Every item stays readable when scaled down to 200 pixels wide. Consistent scale and consistent style across all 12 items.
```

## 받은 다음

1. 마젠타 배경 키잉 → 개별 PNG로 자르기 (`sharp`)
2. WebP로 압축 → `play/feltling.html`의 `ART` 블록에 **data URI로 인라인**
3. 외부 파일로 두지 않는 이유: 포털 납품본이 자립형 한 파일이어야 한다.
   `tools/validate.js`의 `GAME_MAX_BYTES = 500KB`가 상한이다. 512px WebP면 시트당 40~80KB.

## 기록: 문서화된 규칙 하나를 의도적으로 어긴다

`templates/game-base.html`에 이렇게 적혀 있다.

> 에셋도 라이브러리도 쓰지 않는다: 이 파이프라인의 게임은 캔버스로만 그린다
> (에셋 라이선스가 기존 게임의 상업적 사용을 막았고, 그 실수를 반복하지 않는다).

이 규칙의 **이유**는 내려받은 에셋 팩의 라이선스가 불명이었다는 것이고, 그건 AI 생성물에는
해당하지 않는다. 그래서 규칙을 어기되 이유는 지킨다 — 출처가 불명한 그림은 여전히 안 쓴다.

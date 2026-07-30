// 게이트 1·2의 판정 규칙. 순수 함수만 둔다.
// 브라우저 수집은 tools/verify.js가 하고, 여기서는 수집된 리포트만 본다.
// validate.js와 같은 이유로 분리했다 — 규칙은 브라우저 없이 테스트 가능해야 한다.

export const TECH = {
  MAX_LOAD_MS: 2000,
  MIN_CANVAS_VARIANCE: 3,      // 그레이스케일 분산. 이하면 사실상 단색 화면
  MIN_CANVAS_MOTION: 2,        // 프레임 간 평균 픽셀차. 완전 정지 화면은 0에 가깝다
  TOUCH_EVENTS: ['touchstart', 'touchend', 'touchmove', 'pointerdown'],
  MOBILE_VIEWPORT: { width: 390, height: 844 }   // verify.js가 게이트 1을 이 뷰포트에서 수집한다
};

const cap = (list, n = 3) => list.slice(0, n).join(' | ') + (list.length > n ? ` (+${list.length - n} more)` : '');

// 게이트 1. 에러 문자열 배열을 그대로 돌려준다 (보류 개념이 없다).
export function checkTech(r) {
  const errors = [];
  const at = r.label ?? 'game';

  if (r.consoleErrors?.length) errors.push(`${at}: ${r.consoleErrors.length} console error(s) — ${cap(r.consoleErrors)}`);
  if (r.pageErrors?.length) errors.push(`${at}: ${r.pageErrors.length} page error(s) — ${cap(r.pageErrors)}`);
  if (r.failedRequests?.length) errors.push(`${at}: ${r.failedRequests.length} failed request(s) — ${cap(r.failedRequests)}`);

  if (!r.canvas?.found) {
    errors.push(`${at}: no canvas element found`);
  } else {
    // 캡처 자체가 실패했으면 픽셀에 대해 아무 말도 할 수 없다. 게임 결함으로 보고하면 오진이다.
    if (r.canvas.captureFailed || typeof r.canvas.variance !== 'number') {
      errors.push(`${at}: canvas capture failed — cannot judge the pixels`);
    } else if (r.canvas.variance < TECH.MIN_CANVAS_VARIANCE && (r.canvas.motion ?? 0) < TECH.MIN_CANVAS_MOTION) {
      // 정지 분산이 낮아도 프레임 간 변화가 있으면 그리고 있는 것이다.
      // 파티클·스타필드처럼 미세한 화면이 "빈 화면"으로 오판되는 것을 막는다.
      errors.push(`${at}: canvas appears blank — variance ${r.canvas.variance}, motion ${r.canvas.motion ?? 0}`);
    }
    if (r.canvas.inView === false) {
      errors.push(`${at}: canvas outside viewport on mobile (${TECH.MOBILE_VIEWPORT.width}x${TECH.MOBILE_VIEWPORT.height})`);
    }
    // 시작 오버레이가 캔버스를 덮고 있으면 그 스크린샷은 게임 화면이 아니다.
    // 실측: 타이틀 화면의 분산(10.8)이 실제 플레이(9.2)보다 높아서 분산만으로는 구분할 수 없다.
    if (r.canvas.covered) {
      errors.push(`${at}: canvas covered by an overlay — the screenshot is not gameplay (start screen not dismissed, or the run already ended)`);
    }
  }

  const hasTouch = (r.listeners ?? []).some(t => TECH.TOUCH_EVENTS.includes(t));
  if (!hasTouch) {
    errors.push(`${at}: no touch input — expected one of ${TECH.TOUCH_EVENTS.join(', ')}`);
  }

  if (r.loadMs > TECH.MAX_LOAD_MS) {
    errors.push(`${at}: slow load — ${Math.round(r.loadMs)}ms exceeds ${TECH.MAX_LOAD_MS}ms`);
  }

  if (r.mobile && r.mobile.scrollWidth > r.mobile.innerWidth + 1) {
    errors.push(`${at}: horizontal overflow on mobile — scrollWidth ${r.mobile.scrollWidth} > viewport ${r.mobile.innerWidth}`);
  }

  return errors;
}

export const PLAY = {
  API: 1,
  MIN_AVG_FPS: 50,          // 60fps 목표에서 프레임 드랍 여유 10. 이 밑은 조작이 눌리는 느낌이 난다
  MIN_WINDOW_FPS: 30,       // 평균이 괜찮아도 특정 구간에서 30 밑으로 떨어지면 체감은 "멈췄다"
  MAX_HEAP_RATIO: 2.5,      // 60초 플레이로 힙이 2.5배면 오브젝트를 회수하지 않는다는 뜻
  MIN_LEGACY_REACT: 0.002,  // 변화 픽셀 비율. 정지 페이지 0.0000 vs 실제 반응하는 최저 게임 0.0055
                             // (neon-rise, 24px 스프라이트 = 화면의 0.07%) — 약 2.75배 여유.
                             // 평균 절대차(구 MIN_LEGACY_DIFF=6)는 면적에 희석돼 정상 게임을
                             // 0.6으로 읽었다. 그래서 "얼마나 달라졌나" 대신 "몇 개가 달라졌나"를 쓴다.
  MIN_MEAN_SURVIVAL_MS: 3000,  // 평균 생존 3초 미만이면 사람이 플레이할 수 없다.
                                // 입력 단계에서 죽은 횟수로 나눠 구한다 (수집기가 죽으면 즉시 재시작한다)
  MIN_DEATHS_TO_JUDGE: 2        // 죽음이 0~1번이면 평균을 추정할 신호가 부족하다. 진짜 즉사 게임은
                                 // 짧은 세션에도 여러 번 죽으므로 2로 올려도 탐지력 손실이 없다
};

// 게이트 2. { errors, skipped } 를 돌려준다 — checkTech와 반환 모양이 다르다.
// 계약(window.__GAME__)이 없는 기존 게임은 종결성·재시작을 판정할 방법이 없어
// "실패"가 아니라 "보류(skipped)"로 분류해야 하기 때문이다. 호출자는 errors만 실패로 센다.
export function checkPlay(r) {
  const errors = [];
  const skipped = [];
  const at = r.label ?? 'game';

  // --- 모든 모드 공통: rAF 프로브로 측정되므로 계약이 없어도 판정 가능 ---
  // rAF를 쓰지 않는 게임(setInterval 루프)은 프로브가 프레임을 셀 수 없다.
  // 계약 모드는 rAF 루프를 전제하므로 0프레임을 실패로 두고, 기존 게임은 보류한다.
  const unmeasurableFps = r.mode === 'legacy' && r.frames === 0;
  if (unmeasurableFps) {
    skipped.push(`${at}: fps not measurable — game does not drive requestAnimationFrame`);
  } else {
    // FPS는 수집 실패를 통과로 만들면 안 된다. 표본이 1개뿐이면 avgFps가 NaN이 되는데,
    // 그때 조용히 통과시키면 게이트가 죽은 채로 초록불이 뜬다.
    if (!Number.isFinite(r.avgFps)) {
      errors.push(`${at}: fps not measured — collector reported ${r.avgFps}`);
    } else if (r.avgFps < PLAY.MIN_AVG_FPS) {
      errors.push(`${at}: average fps ${r.avgFps} below ${PLAY.MIN_AVG_FPS}`);
    }
    // 구간 표본에 숫자가 아닌 값이 하나라도 섞이면 Math.min이 NaN을 전파해
    // 구간 검사 전체가 사라진다. 수집 실패는 통과가 아니라 실패로 본다.
    const windows = r.fpsWindows?.length ? r.fpsWindows : [r.avgFps];
    if (windows.some(w => !Number.isFinite(w))) {
      errors.push(`${at}: fps not measured — window sample was not a number`);
    } else if (Math.min(...windows) < PLAY.MIN_WINDOW_FPS) {
      errors.push(`${at}: fps collapsed to ${Math.min(...windows)} in one window (min ${PLAY.MIN_WINDOW_FPS})`);
    }
  }
  // 힙은 브라우저가 performance.memory를 안 주면 0으로 온다. 측정 불가와 누수 없음을
  // 구분할 방법이 없으니 여기서는 통과시킨다 — 누수 판정은 있는 데이터로만 한다.
  if (r.heap?.start > 0) {
    const ratio = r.heap.end / r.heap.start;
    if (ratio > PLAY.MAX_HEAP_RATIO) {
      errors.push(`${at}: heap growth x${ratio.toFixed(1)} exceeds x${PLAY.MAX_HEAP_RATIO} — likely a leak`);
    }
  }

  if (r.mode === 'legacy') {
    // 계약이 없는 기존 게임. 화면 반응만 실패로 보고, 나머지는 판정 보류한다.
    // reactMax는 키보드 패스와 포인터 패스의 최대값이다 — 게임마다 입력 수단이 달라서
    // 한 채널만으로는 판정할 수 없다 (실측: cyber-memory는 탭에만, synaptic-grid는 키에만 반응).
    if (typeof r.reactMax !== 'number') {
      skipped.push(`${at}: reactivity not measured — collector reported no reactMax`);
    } else if (r.reactMax < PLAY.MIN_LEGACY_REACT) {
      errors.push(`${at}: no progress — screen did not react to input (changed ${(r.reactMax * 100).toFixed(2)}% of pixels, need ${(PLAY.MIN_LEGACY_REACT * 100).toFixed(2)}%)`);
    }
    skipped.push(`${at}: termination, idle-end and restart not checked — no window.__GAME__ contract`);
    return { errors, skipped };
  }

  // --- 계약 모드 ---
  if (r.api !== PLAY.API) {
    errors.push(`${at}: contract api ${r.api} — this checker speaks api ${PLAY.API}`);
    return { errors, skipped };
  }

  const distinct = new Set(r.scoreSamples ?? []);
  if (distinct.size < 2) {
    errors.push(`${at}: no progress — score never changed across ${(r.scoreSamples ?? []).length} samples`);
  }

  // 즉사 반복 게임 걸러내기. 수집기가 'over'를 보면 바로 재시작하므로 'over' 표본 수 = 죽은 횟수다.
  // N번 죽었으면 판은 N+1개(마지막 판은 안 끝났다)이고, 각 판은 사망 후 수집기가 알아채기까지
  // 최대 sampleMs만큼 죽은 시간을 물고 있다. 그 둘을 보정하지 않으면 평균 생존이 최대 2배 부풀려져
  // 이 규칙이 스스로 무력해진다 (실측: 실제 5.2초/2.8초 두 판이 8000ms로 보고됐다).
  const deaths = (r.stateSamples ?? []).filter(s => s === 'over').length;
  if (r.inputMs) {
    if (deaths < PLAY.MIN_DEATHS_TO_JUDGE) {
      skipped.push(`${at}: survival not judged — only ${deaths} death(s) observed in ${r.inputMs}ms`);
    } else {
      // 죽은 시간 보정이 입력 시간 전체를 넘어설 수 있으니(부동소수 오차·짧은 세션) 0 밑으로는 내려가지 않는다.
      const playedMs = Math.max(0, r.inputMs - deaths * (r.sampleMs ?? 0));
      const meanSurvivalMs = Math.round(playedMs / (deaths + 1));
      if (meanSurvivalMs < PLAY.MIN_MEAN_SURVIVAL_MS) {
        errors.push(`${at}: dies too fast — mean survival ${meanSurvivalMs}ms below ${PLAY.MIN_MEAN_SURVIVAL_MS}ms across ${deaths} deaths`);
      }
    }
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
}

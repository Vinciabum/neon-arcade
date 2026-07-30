// 게이트 1·2의 판정 규칙. 순수 함수만 둔다.
// 브라우저 수집은 tools/verify.js가 하고, 여기서는 수집된 리포트만 본다.
// validate.js와 같은 이유로 분리했다 — 규칙은 브라우저 없이 테스트 가능해야 한다.

export const TECH = {
  MAX_LOAD_MS: 2000,
  MIN_CANVAS_VARIANCE: 3,      // 그레이스케일 분산. 이하면 사실상 단색 화면
  TOUCH_EVENTS: ['touchstart', 'touchend', 'touchmove', 'pointerdown'],
  MOBILE_VIEWPORT: { width: 390, height: 844 }   // verify.js가 게이트 1을 이 뷰포트에서 수집한다
};

const cap = (list, n = 3) => list.slice(0, n).join(' | ') + (list.length > n ? ` (+${list.length - n} more)` : '');

export function checkTech(r) {
  const errors = [];
  const at = r.label ?? 'game';

  if (r.consoleErrors?.length) errors.push(`${at}: ${r.consoleErrors.length} console error(s) — ${cap(r.consoleErrors)}`);
  if (r.pageErrors?.length) errors.push(`${at}: ${r.pageErrors.length} page error(s) — ${cap(r.pageErrors)}`);
  if (r.failedRequests?.length) errors.push(`${at}: ${r.failedRequests.length} failed request(s) — ${cap(r.failedRequests)}`);

  if (!r.canvas?.found) {
    errors.push(`${at}: no canvas element found`);
  } else {
    if (r.canvas.variance < TECH.MIN_CANVAS_VARIANCE) {
      errors.push(`${at}: canvas appears blank — variance ${r.canvas.variance} below ${TECH.MIN_CANVAS_VARIANCE}`);
    }
    if (r.canvas.inView === false) {
      errors.push(`${at}: canvas outside viewport on mobile (${TECH.MOBILE_VIEWPORT.width}x${TECH.MOBILE_VIEWPORT.height})`);
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
  MIN_AVG_FPS: 50,
  MIN_WINDOW_FPS: 30,
  MAX_HEAP_RATIO: 2.5,
  MIN_LEGACY_DIFF: 6          // 휴리스틱 모드에서 "화면이 반응했다"로 볼 평균 픽셀차
};

export function checkPlay(r) {
  const errors = [];
  const skipped = [];
  const at = r.label ?? 'game';

  // --- 모든 모드 공통: rAF 프로브로 측정되므로 계약이 없어도 판정 가능 ---
  if (r.avgFps < PLAY.MIN_AVG_FPS) {
    errors.push(`${at}: average fps ${r.avgFps} below ${PLAY.MIN_AVG_FPS}`);
  }
  const worst = Math.min(...(r.fpsWindows?.length ? r.fpsWindows : [r.avgFps]));
  if (worst < PLAY.MIN_WINDOW_FPS) {
    errors.push(`${at}: fps collapsed to ${worst} in one window (min ${PLAY.MIN_WINDOW_FPS})`);
  }
  if (r.heap?.start > 0) {
    const ratio = r.heap.end / r.heap.start;
    if (ratio > PLAY.MAX_HEAP_RATIO) {
      errors.push(`${at}: heap growth x${ratio.toFixed(1)} exceeds x${PLAY.MAX_HEAP_RATIO} — likely a leak`);
    }
  }

  if (r.mode === 'legacy') {
    // 계약이 없는 기존 게임. 화면 반응만 실패로 보고, 나머지는 판정 보류한다.
    if ((r.legacyDiff ?? 0) < PLAY.MIN_LEGACY_DIFF) {
      errors.push(`${at}: no progress — screen did not react to input (diff ${r.legacyDiff ?? 0})`);
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

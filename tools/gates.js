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

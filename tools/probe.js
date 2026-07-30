// 페이지에 주입해 프레임 수와 등록된 이벤트 타입을 관측한다.
// addInitScript로 문서 스크립트보다 먼저 실행되어야 하므로 문자열로 둔다.
export const PROBE_SOURCE = `(() => {
  const p = { frames: 0, listeners: [] };
  window.__PROBE__ = p;

  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { p.frames++; return cb(t); });

  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (typeof type === 'string' && !p.listeners.includes(type)) p.listeners.push(type);
    return add.call(this, type, ...rest);
  };
})();`;

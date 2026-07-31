import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTech, checkPlay } from '../tools/gates.js';

// 게이트 1을 통과하는 기준 리포트. 각 테스트는 여기서 한 가지만 망가뜨린다.
// mode: 'contract' — 새 게임은 game-base.html 템플릿(캔버스 기반)에서 복사되므로
// 캔버스 세 규칙(부재·빈 화면·덮임)이 그대로 실패로 살아 있어야 한다.
const okTech = () => ({
  label: 'game-base',
  mode: 'contract',
  loadMs: 820,
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  canvas: { found: true, cssWidth: 390, cssHeight: 520, stddev: 34.5, inView: true },
  listeners: ['keydown', 'touchstart', 'visibilitychange'],
  mobile: { scrollWidth: 390, innerWidth: 390 }
});

test('깨끗한 리포트는 통과한다', () => {
  const { errors, skipped } = checkTech(okTech());
  assert.deepEqual(errors, []);
  assert.deepEqual(skipped, []);
});

test('콘솔 에러를 잡는다', () => {
  const r = okTech();
  r.consoleErrors = ['Uncaught TypeError: x is not a function'];
  const { errors } = checkTech(r);
  assert.ok(errors.some(e => e.includes('console error')));
});

test('페이지 예외를 잡는다', () => {
  const r = okTech();
  r.pageErrors = ['ReferenceError: draw is not defined'];
  assert.ok(checkTech(r).errors.some(e => e.includes('page error')));
});

test('실패한 리소스 요청을 잡는다', () => {
  const r = okTech();
  r.failedRequests = ['assets/missing.png'];
  assert.ok(checkTech(r).errors.some(e => e.includes('failed request')));
});

test('캔버스 부재를 잡는다', () => {
  const r = okTech();
  r.canvas = { found: false };
  assert.ok(checkTech(r).errors.some(e => e.includes('no canvas')));
});

test('빈 캔버스를 잡는다', () => {
  const r = okTech();
  r.canvas.stddev = 0.4;
  assert.ok(checkTech(r).errors.some(e => e.includes('canvas appears blank')));
});

test('표준편차가 낮고 움직임도 없으면 빈 캔버스로 본다', () => {
  const r = okTech();
  r.canvas.stddev = 0.4;
  r.canvas.motion = 0;
  assert.ok(checkTech(r).errors.some(e => e.includes('canvas appears blank')));
});

test('표준편차가 낮아도 움직이면 빈 캔버스가 아니다', () => {
  const r = okTech();
  r.canvas.stddev = 1.8;        // 정지 화면은 거의 단색
  r.canvas.motion = 9.4;        // 그래도 프레임마다 바뀐다 → 그리고 있는 것으로 본다
  // 한계를 알고 받아들인 판정이다: 스프라이트가 안 나오는데 배경만 번쩍이는 게임도 통과한다.
  // 그 대신 실제 파티클·스타필드 화면(stddev 1~4)을 빈 화면으로 오판하지 않는다.
  assert.deepEqual(checkTech(r).errors, []);
});

test('빈 캔버스 판정도 경계값은 통과로 본다', () => {
  const r = okTech();
  r.canvas.stddev = 0.4;
  r.canvas.motion = 2;          // MIN_CANVAS_MOTION과 같으면 통과
  assert.deepEqual(checkTech(r).errors, []);
});

test('오버레이가 캔버스를 덮고 있으면 잡는다', () => {
  const r = okTech();
  r.canvas.covered = true;
  assert.ok(checkTech(r).errors.some(e => e.includes('covered by an overlay')));
});

test('덮임 정보가 없는 리포트는 통과한다', () => {
  const r = okTech();          // covered 필드 없음 — 구형 리포트
  assert.deepEqual(checkTech(r).errors, []);
});

test('캔버스가 없으면 덮임은 따지지 않는다', () => {
  const r = okTech();
  r.canvas = { found: false, covered: true };
  const { errors } = checkTech(r);
  assert.ok(errors.some(e => e.includes('no canvas')));
  assert.ok(!errors.some(e => e.includes('covered by an overlay')));
});

test('캡처 실패를 게임 결함으로 보고하지 않는다 (captureFailed 플래그)', () => {
  const r = okTech();
  r.canvas.captureFailed = true;
  r.canvas.stddev = 34.5;      // 숫자는 그럴듯해도 캡처 자체가 실패했으면 믿을 수 없다
  const { errors } = checkTech(r);
  assert.ok(errors.some(e => e.includes('canvas capture failed')));
  assert.ok(!errors.some(e => e.includes('canvas appears blank')));
});

test('캡처 실패를 게임 결함으로 보고하지 않는다 (stddev가 숫자가 아님)', () => {
  const r = okTech();
  r.canvas.stddev = null;      // captureFailed 플래그 없이도 숫자가 아니면 판단 불가
  const { errors } = checkTech(r);
  assert.ok(errors.some(e => e.includes('canvas capture failed')));
  assert.ok(!errors.some(e => e.includes('canvas appears blank')));
});

test('휴리스틱 모드: 캔버스가 없어도 터치·가로 넘침은 그대로 실패로 잡는다', () => {
  const r = okTech();
  r.mode = 'legacy';
  r.canvas = { found: false };        // synaptic-grid처럼 캔버스가 아예 없는 게임
  r.listeners = ['keydown'];          // 터치 리스너 없음 — 이건 여전히 실패여야 한다
  r.mobile = { scrollWidth: 520, innerWidth: 390 };   // 가로 넘침도 마찬가지
  const { errors, skipped } = checkTech(r);
  assert.ok(!errors.some(e => e.includes('no canvas')));
  assert.ok(skipped.some(s => s.includes('no canvas')));
  assert.ok(errors.some(e => e.includes('no touch input')));
  assert.ok(errors.some(e => e.includes('horizontal overflow')));
});

test('휴리스틱 모드: 빈 캔버스도 실패 대신 보류한다', () => {
  const r = okTech();
  r.mode = 'legacy';
  r.canvas.stddev = 0.4;    // cyber-memory의 장식용 캔버스처럼 정지해 있다
  const { errors, skipped } = checkTech(r);
  assert.ok(!errors.some(e => e.includes('canvas appears blank')));
  assert.ok(skipped.some(s => s.includes('canvas appears blank')));
});

test('휴리스틱 모드: 오버레이 덮임도 실패 대신 보류한다', () => {
  const r = okTech();
  r.mode = 'legacy';
  r.canvas.covered = true;
  const { errors, skipped } = checkTech(r);
  assert.ok(!errors.some(e => e.includes('covered by an overlay')));
  assert.ok(skipped.some(s => s.includes('covered by an overlay')));
});

test('터치 핸들러 부재를 잡는다', () => {
  const r = okTech();
  r.listeners = ['keydown'];
  assert.ok(checkTech(r).errors.some(e => e.includes('no touch input')));
});

test('pointerdown도 터치 입력으로 인정한다', () => {
  const r = okTech();
  r.listeners = ['keydown', 'pointerdown'];
  assert.deepEqual(checkTech(r).errors, []);
});

test('2초 초과 로드를 잡는다', () => {
  const r = okTech();
  r.loadMs = 2600;
  assert.ok(checkTech(r).errors.some(e => e.includes('slow load')));
});

test('모바일 가로 넘침을 잡는다', () => {
  const r = okTech();
  r.mobile = { scrollWidth: 520, innerWidth: 390 };
  assert.ok(checkTech(r).errors.some(e => e.includes('horizontal overflow')));
});

test('캔버스가 화면 밖이면 잡는다', () => {
  const r = okTech();
  r.canvas.inView = false;
  assert.ok(checkTech(r).errors.some(e => e.includes('canvas outside viewport')));
});

test('빈 리포트에도 던지지 않는다 — 없는 필드는 검사를 건너뛴다', () => {
  const { errors } = checkTech({});
  assert.ok(errors.some(e => e.includes('no canvas')));
  assert.ok(errors.some(e => e.includes('no touch input')));
  assert.ok(!errors.some(e => e.includes('slow load')));
  assert.ok(!errors.some(e => e.includes('horizontal overflow')));
});

test('임계값 경계는 통과로 본다', () => {
  const r = okTech();
  r.canvas.stddev = 3;                                // MIN_CANVAS_STDDEV와 같으면 통과
  r.loadMs = 2000;                                    // MAX_LOAD_MS와 같으면 통과
  r.mobile = { scrollWidth: 391, innerWidth: 390 };   // +1까지는 반올림 오차로 본다
  assert.deepEqual(checkTech(r).errors, []);
});

test('에러 목록이 길면 3개만 보여주고 남은 수를 알린다', () => {
  const r = okTech();
  r.consoleErrors = ['e1', 'e2', 'e3', 'e4', 'e5'];
  const msg = checkTech(r).errors.find(e => e.includes('console error'));
  assert.ok(msg.includes('5 console error(s)'));
  assert.ok(msg.includes('e1 | e2 | e3'));
  assert.ok(msg.includes('(+2 more)'));
  assert.ok(!msg.includes('e4'));
});

// 게이트 2를 통과하는 계약 모드 기준 리포트
const okPlay = () => ({
  label: 'game-base',
  mode: 'contract',
  api: 1,
  avgFps: 58,
  fpsWindows: [59, 58, 57, 58],
  heap: { start: 12_000_000, end: 16_000_000 },
  scoreSamples: [0, 0, 2, 5, 9, 14],
  stateSamples: ['playing', 'playing', 'playing', 'playing'],
  idle: { ended: true, afterMs: 5200 },
  restart: { ok: true, state: 'playing', score: 0 }
});

test('정상 플레이 리포트는 통과한다', () => {
  const { errors, skipped } = checkPlay(okPlay());
  assert.deepEqual(errors, []);
  assert.deepEqual(skipped, []);
});

test('점수가 전혀 변하지 않으면 잡는다 (진행성)', () => {
  const r = okPlay();
  r.scoreSamples = [0, 0, 0, 0, 0, 0];
  assert.ok(checkPlay(r).errors.some(e => e.includes('no progress')));
});

test('방치해도 끝나지 않으면 잡는다 (종결성)', () => {
  const r = okPlay();
  r.idle = { ended: false, afterMs: 20000 };
  assert.ok(checkPlay(r).errors.some(e => e.includes('never ends when idle')));
});

test('평균 FPS 미달을 잡는다', () => {
  const r = okPlay();
  r.avgFps = 41;
  r.fpsWindows = [45, 40, 39, 40];
  assert.ok(checkPlay(r).errors.some(e => e.includes('average fps')));
});

test('구간 FPS 붕괴를 잡는다', () => {
  const r = okPlay();
  r.avgFps = 52;
  r.fpsWindows = [59, 58, 12, 58];
  assert.ok(checkPlay(r).errors.some(e => e.includes('fps collapsed')));
});

test('프레임은 있는데 평균이 0이면 실패로 잡는다 (음수와 다르다)', () => {
  const r = okPlay();
  r.frames = 1200;         // 프레임 총수는 정상 — 이 구간에서만 아무것도 안 그렸다
  r.avgFps = 0;             // fpsWindows는 base 값(전부 양수)을 그대로 둬서 이 검사만 격리한다
  assert.ok(checkPlay(r).errors.some(e => e.includes('average fps')));
});

test('음수 평균 FPS는 실패가 아니라 미측정으로 본다', () => {
  const r = okPlay();
  // 실측: 스스로 리로드하는 게임이 프로브의 프레임 카운터를 되돌려 -134.9가 나왔다 —
  // 유한한 값이라 isFinite 검사는 통과하지만 물리적으로 있을 수 없는 값이다.
  r.avgFps = -134.9;
  const { errors } = checkPlay(r);
  assert.ok(errors.some(e => e.includes('fps not measured')));
  assert.ok(!errors.some(e => e.includes('average fps -134.9')));
});

test('구간 하나가 음수면 붕괴가 아니라 미측정으로 본다', () => {
  const r = okPlay();
  r.fpsWindows = [59, -12, 58];   // 다른 구간은 멀쩡하다
  const { errors } = checkPlay(r);
  assert.ok(errors.some(e => e.includes('fps not measured')));
  assert.ok(!errors.some(e => e.includes('fps collapsed')));
});

test('힙 폭증을 잡는다', () => {
  const r = okPlay();
  r.heap = { start: 12_000_000, end: 90_000_000 };
  assert.ok(checkPlay(r).errors.some(e => e.includes('heap growth')));
});

test('재시작 실패를 잡는다', () => {
  const r = okPlay();
  r.restart = { ok: false, state: 'over', score: 14 };
  assert.ok(checkPlay(r).errors.some(e => e.includes('restart')));
});

test('재시작 후 점수가 남아 있으면 잡는다', () => {
  const r = okPlay();
  r.restart = { ok: true, state: 'playing', score: 14 };
  assert.ok(checkPlay(r).errors.some(e => e.includes('score did not reset')));
});

test('계약 버전 불일치를 잡는다', () => {
  const r = okPlay();
  r.api = 2;
  assert.ok(checkPlay(r).errors.some(e => e.includes('contract api')));
  assert.equal(checkPlay(r).errors.length, 1);   // 모르는 버전이면 나머지 검사는 하지 않는다
});

test('FPS 미측정을 통과시키지 않는다', () => {
  const r = okPlay();
  delete r.avgFps;
  delete r.fpsWindows;
  assert.ok(checkPlay(r).errors.some(e => e.includes('fps not measured')));
});

test('임계값 경계는 통과로 본다', () => {
  const r = okPlay();
  r.avgFps = 50;                                   // MIN_AVG_FPS와 같으면 통과
  r.fpsWindows = [50, 30, 50];                     // MIN_WINDOW_FPS와 같으면 통과
  r.heap = { start: 10_000_000, end: 25_000_000 }; // 정확히 x2.5는 통과
  r.scoreSamples = [0, 1];                         // 서로 다른 값 2개면 진행성 인정
  assert.deepEqual(checkPlay(r).errors, []);
});

test('재시작 플래그와 상태를 각각 독립으로 본다', () => {
  const okButNotPlaying = { ...okPlay(), restart: { ok: true, state: 'over', score: 0 } };
  assert.ok(checkPlay(okButNotPlaying).errors.some(e => e.includes('restart failed')));

  const playingButNotOk = { ...okPlay(), restart: { ok: false, state: 'playing', score: 0 } };
  assert.ok(checkPlay(playingButNotOk).errors.some(e => e.includes('restart failed')));
});

test('구간 표본에 NaN이 섞여도 검사를 건너뛰지 않는다', () => {
  const r = okPlay();
  r.fpsWindows = [58, NaN, 57];
  const { errors } = checkPlay(r);
  assert.ok(errors.some(e => e.includes('fps not measured')));
});

test('구간 붕괴는 NaN 가드에 가려지지 않는다', () => {
  const r = okPlay();
  r.fpsWindows = [58, 12, 57];
  assert.ok(checkPlay(r).errors.some(e => e.includes('fps collapsed to 12')));
});

// 계약(window.__GAME__)이 없는 기존 9개 게임의 리포트 모양.
// api / scoreSamples / idle / restart가 없는 것이 핵심이다 — 관측할 방법이 없어 수집되지 않는다.
const okLegacy = () => ({
  label: 'dino-jump',
  mode: 'legacy',
  avgFps: 57,
  fpsWindows: [58, 57, 56],
  heap: { start: 10_000_000, end: 14_000_000 },
  reactMax: 0.2109   // 실측: dino-jump
});

test('휴리스틱 모드: 화면이 반응하면 통과하고 나머지는 보류한다', () => {
  const { errors, skipped } = checkPlay(okLegacy());
  assert.deepEqual(errors, []);
  assert.equal(skipped.length, 1);
  assert.ok(skipped[0].includes('no window.__GAME__ contract'));
});

test('휴리스틱 모드: 화면이 반응하지 않으면 실패한다', () => {
  const r = okLegacy();
  r.reactMax = 0;                     // 실측: 정지 페이지(frozen control) — 입력을 무시한다
  assert.ok(checkPlay(r).errors.some(e => e.includes('no progress')));
});

test('휴리스틱 모드: reactMax 경계는 통과로 본다', () => {
  const r = okLegacy();
  r.reactMax = 0.002;                 // MIN_LEGACY_REACT와 같으면 통과
  assert.deepEqual(checkPlay(r).errors, []);
});

test('휴리스틱 모드: 실측 최저 반응 게임(neon-rise)도 통과한다', () => {
  const r = okLegacy();
  r.reactMax = 0.0055;                // 실측: neon-rise — 900x600의 0.07%(24px 스프라이트)가 움직인다
  assert.deepEqual(checkPlay(r).errors, []);
});

test('휴리스틱 모드: reactMax가 없으면 반응성 판정을 보류한다', () => {
  const r = okLegacy();
  delete r.reactMax;                  // 수집 실패 — 실패로 단정하지 않고 보류한다
  const { errors, skipped } = checkPlay(r);
  assert.ok(!errors.some(e => e.includes('no progress')));
  assert.ok(skipped.some(s => s.includes('reactivity not measured')));
});

test('휴리스틱 모드에서도 FPS는 실패로 잡는다', () => {
  const r = okLegacy();
  r.avgFps = 22;
  r.fpsWindows = [30, 30, 30];        // 구간은 경계값이라 통과 — 평균만 실패해야 한다
  const { errors } = checkPlay(r);
  assert.ok(errors.some(e => e.includes('average fps')));
  assert.ok(!errors.some(e => e.includes('fps collapsed')));
});

test('휴리스틱 모드는 계약 항목 부재를 실패로 만들지 않는다', () => {
  const { errors } = checkPlay(okLegacy());   // scoreSamples / idle / restart 전부 없음
  assert.deepEqual(errors, []);
});

test('휴리스틱 모드: rAF를 안 쓰는 게임은 FPS를 보류한다', () => {
  const r = okLegacy();
  r.frames = 0;                 // setInterval 루프 — 프로브가 셀 프레임이 없다
  r.avgFps = 0;
  r.fpsWindows = [0, 0, 0];
  const { errors, skipped } = checkPlay(r);
  assert.ok(!errors.some(e => e.includes('fps')));
  assert.ok(skipped.some(s => s.includes('fps not measurable')));
});

test('FPS를 보류해도 화면 반응 검사는 살아 있다', () => {
  const r = okLegacy();
  r.frames = 0;                 // setInterval 루프라 FPS는 보류
  r.avgFps = 0;
  r.fpsWindows = [0, 0, 0];
  r.reactMax = 0.0005;          // 그런데 화면이 얼어 있다 (MIN_LEGACY_REACT 미만)
  const { errors, skipped } = checkPlay(r);
  assert.ok(skipped.some(s => s.includes('fps not measurable')));
  assert.ok(errors.some(e => e.includes('no progress')));   // 이건 보류 대상이 아니다
});

test('계약 모드에서는 프레임 0을 보류하지 않는다', () => {
  const r = okPlay();
  r.frames = 0;
  r.avgFps = 0;
  r.fpsWindows = [0];
  assert.ok(checkPlay(r).errors.some(e => e.includes('average fps')));
});

test('휴리스틱 모드라도 프레임이 있으면 FPS를 판정한다', () => {
  const r = okLegacy();
  r.frames = 1200;
  r.avgFps = 22;
  r.fpsWindows = [30, 30, 30];
  assert.ok(checkPlay(r).errors.some(e => e.includes('average fps')));
});

test('즉사를 반복하는 게임을 잡는다', () => {
  const r = okPlay();
  r.inputMs = 30_000;
  r.sampleMs = 500;
  // playedMs = 30000 - 60*500 = 0 (죽은 시간이 입력 시간 전체를 먹었다), mean = round(0/61) = 0
  r.stateSamples = Array(60).fill('over');     // 표본마다 죽어 있다
  r.scoreSamples = [0, 1, 0, 1, 0, 1];         // 진행성 검사만으로는 통과한다
  assert.ok(checkPlay(r).errors.some(e => e.includes('dies too fast')));
});

test('정상적인 사망 빈도는 통과한다', () => {
  const r = okPlay();
  r.inputMs = 30_000;
  r.sampleMs = 500;
  // playedMs = 30000 - 6*500 = 27000, mean = round(27000/7) = 3857
  r.stateSamples = [...Array(54).fill('playing'), ...Array(6).fill('over')];
  assert.deepEqual(checkPlay(r).errors, []);
});

test('평균 생존 경계는 통과로 본다', () => {
  const r = okPlay();
  r.inputMs = 10_000;
  r.sampleMs = 500;
  // playedMs = 10000 - 2*500 = 9000, mean = round(9000/3) = 정확히 3000 (MIN_MEAN_SURVIVAL_MS와 같으면 통과)
  r.stateSamples = ['over', 'over'];
  assert.deepEqual(checkPlay(r).errors, []);
});

test('죽음이 1번뿐이면 생존 판정을 보류한다', () => {
  const r = okPlay();
  r.inputMs = 8_000;
  r.stateSamples = ['over'];                   // 죽음 1번 — 평균을 추정할 신호가 부족하다
  const { errors, skipped } = checkPlay(r);
  assert.ok(!errors.some(e => e.includes('dies too fast')));
  assert.ok(skipped.some(s => s.includes('survival not judged')));
});

test('한 번도 죽지 않으면 생존 판정을 보류한다', () => {
  const r = okPlay();
  r.inputMs = 30_000;
  r.stateSamples = Array(60).fill('playing');
  const { errors, skipped } = checkPlay(r);
  assert.deepEqual(errors, []);
  assert.ok(skipped.some(s => s.includes('survival not judged')));
});

test('inputMs가 없으면 생존 판정을 하지도 보류하지도 않는다', () => {
  const r = okPlay();                          // 구형 리포트
  r.stateSamples = Array(60).fill('over');
  const { errors, skipped } = checkPlay(r);
  assert.ok(!errors.some(e => e.includes('dies too fast')));
  assert.ok(!skipped.some(s => s.includes('survival not judged')));
});

test('sampleMs가 없으면 0으로 보고도 판정은 한다', () => {
  const r = okPlay();
  r.inputMs = 8_000;
  // sampleMs 없음 → 죽은 시간을 보정하지 않는다. playedMs = 8000 - 2*0 = 8000, mean = round(8000/3) = 2667
  r.stateSamples = ['over', 'over'];
  assert.ok(checkPlay(r).errors.some(e => e.includes('dies too fast')));
});

test('기존 okPlay 리포트는 새 생존 판정에 걸리지 않는다', () => {
  const { errors, skipped } = checkPlay(okPlay());   // inputMs 없음 — 새 판정 로직이 손대지 않아야 한다
  assert.ok(!errors.some(e => e.includes('dies too fast')));
  assert.ok(!skipped.some(s => s.includes('survival not judged')));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gamePath } from '../tools/paths.js';

const SCORED = ['ember-drift', 'flux-sort', 'lantern-keeper', 'null-cascade',
  'pulse-lock', 'shard-weave', 'signal-relay', 'stack-purge'];

const read = (slug) => readFileSync(gamePath(slug), 'utf8');

test('8개 전부 날짜에서 시드를 뽑는다', () => {
  for (const slug of SCORED) {
    const h = read(slug);
    assert.match(h, /const DAY_ZERO = /, `${slug}: DAY_ZERO 없음`);
    assert.match(h, /const DAILY_NO = DAY \+ 1;/, `${slug}: DAILY_NO 없음`);
  }
});

// 시드를 정의만 하고 안 쓰면 "하루 한 판"은 문구만 남고 판은 매일 같다.
// 정의부(const DAY_SEED = ...)를 뺀 실제 사용처가 있어야 한다.
test('정의만 하고 안 쓰는 게임이 없다 — 안 쓰면 매일 같은 판이다', () => {
  for (const slug of SCORED) {
    const h = read(slug);
    const uses = (h.match(/DAY_SEED|DAY_PHASE/g) || []).length;
    // 정의 2줄 + 주석 1줄은 기본. 그보다 많아야 실제로 쓴 것이다.
    assert.ok(uses > 3, `${slug}: DAY_SEED/DAY_PHASE 등장이 ${uses}회 — 판에 안 섞였다`);
  }
});

test('file:// 로 열면 0일차로 고정된다 — 게이트와 캡처가 날짜에 끌려가면 안 된다', () => {
  for (const slug of SCORED) {
    assert.match(read(slug), /location\.protocol === 'file:'\) return 0;/, `${slug}`);
  }
});

test('?day=N 으로 특정 날을 재볼 수 있다 — 없으면 다른 날 통과 여부를 못 잰다', () => {
  for (const slug of SCORED) {
    assert.match(read(slug), /URLSearchParams\(location\.search\)\.get\('day'\)/, `${slug}`);
  }
});

test('계약이 판 번호를 싣는다 — 공유 문구가 이걸 쓴다', () => {
  for (const slug of SCORED) {
    assert.match(read(slug), /day: DAILY_NO,/, `${slug}`);
  }
});

test('타이틀 화면이 판 번호를 알린다 — 같은 판이라는 걸 모르면 경쟁이 안 된다', () => {
  for (const slug of SCORED) {
    const h = read(slug);
    assert.match(h, /id = 'dailyTag'/, `${slug}`);
    assert.match(h, /TODAY'S BOARD #/, `${slug}`);
  }
});

// 처음 이 코드는 계약의 `field` 게터 안, return 뒤에 들어갔다. 문법은 유효하고
// 문자열도 다 있어서 위 검사는 통과했는데 **도달할 수 없는 코드라 영영 실행되지 않았다.**
// 라이브에 올리고 나서야 태그가 빈 채로 서빙되는 것을 봤다.
// "있는가"가 아니라 "계약이 끝난 뒤에 있는가"를 본다.
test('타이틀 태그가 계약 바깥에 있다 — 안에 있으면 return 뒤라 실행되지 않는다', () => {
  for (const slug of SCORED) {
    const h = read(slug);
    const contractEnd = h.indexOf('  start, pause, resume');
    const tag = h.indexOf("id = 'dailyTag'");
    assert.ok(contractEnd > 0, `${slug}: 계약 꼬리를 못 찾았다`);
    assert.ok(tag > contractEnd,
      `${slug}: 타이틀 태그가 계약 객체 안에 있다 — 문법은 맞지만 절대 실행되지 않는다`);
  }
});

test('공유 문구에 판 번호가 들어간다 — 번호 없는 점수는 비교가 안 된다', () => {
  const js = readFileSync('assets/share.js', 'utf8');
  assert.match(js, /Board #/);
  assert.match(js, /typeof G\.day === 'number'/);
});

test('verify가 --day 를 받는다 — 다른 날에도 통과하는지 재는 유일한 문이다', () => {
  const v = readFileSync('tools/verify.js', 'utf8');
  assert.match(v, /a === '--day'/);
  assert.match(v, /--day needs a number/);
  assert.match(v, /const gameUrl = /);
});

/* ---------- 오늘의 최고점 ---------- */

test('HUD가 오늘 점수를 보여준다 — 전체 기간 최고점은 다른 날 판에서 낸 숫자다', () => {
  for (const slug of SCORED) {
    const h = read(slug);
    assert.match(h, /<span>TODAY <b id="best">0<\/b><\/span>/, `${slug}: 라벨이 아직 BEST다`);
    assert.match(h, /el\.best\.textContent = today;/, `${slug}: 화면이 today를 안 읽는다`);
    assert.ok(!h.includes('el.best.textContent = best;'), `${slug}: 전체 기간 값을 아직 그린다`);
  }
});

test('오늘 기록은 날짜별 키에 저장된다', () => {
  for (const slug of SCORED) {
    assert.match(read(slug), /const TODAY_KEY = 'just1game:' \+ SLUG \+ ':d' \+ DAY;/, `${slug}`);
  }
});

test('전체 기간 값도 계속 적는다 — 지우면 되돌릴 수 없다', () => {
  for (const slug of SCORED) {
    assert.match(read(slug), /saveBest\(best\);/, `${slug}: 전체 기간 저장이 사라졌다`);
  }
});

// 안 지우면 게임 하나에 하루 한 개씩 영원히 쌓인다 — 8개면 1년에 2900개다.
test('지난 날 기록을 지운다 — 안 지우면 저장소가 무한히 늘어난다', () => {
  for (const slug of SCORED) {
    const h = read(slug);
    assert.match(h, /localStorage\.removeItem\(k\)/, `${slug}: 정리 코드가 없다`);
    assert.match(h, /k !== TODAY_KEY/, `${slug}: 오늘 것까지 지울 수 있다`);
  }
});

test('기존 9개는 건드리지 않았다', () => {
  for (const slug of ['cyber-snake', 'dino-jump', 'neon-rise']) {
    assert.ok(!read(slug).includes('DAILY_NO'), `${slug}가 바뀌었다`);
  }
});

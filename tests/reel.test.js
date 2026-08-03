import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSong, renderSong } from '../tools/reel.js';
import { gamePath } from '../tools/paths.js';

const SCORED = ['ember-drift', 'flux-sort', 'lantern-keeper', 'null-cascade',
  'pulse-lock', 'shard-weave', 'signal-relay', 'stack-purge'];

const read = (slug) => readFileSync(gamePath(slug), 'utf8');

test('BGM이 있는 게임 전부에서 곡을 읽어낸다', () => {
  for (const slug of SCORED) {
    const s = parseSong(read(slug));
    assert.ok(s.root > 20 && s.root < 2000, `${slug}: root=${s.root}`);
    assert.ok(s.beat > 0.1 && s.beat < 1, `${slug}: beat=${s.beat}`);
    assert.ok(['sine', 'square', 'triangle'].includes(s.wave), `${slug}: wave=${s.wave}`);
    assert.ok(s.pattern.length >= 8, `${slug}: pattern이 너무 짧다`);
    assert.ok(s.pattern.some(v => v !== null), `${slug}: 전부 쉼표다`);
  }
});

test('BGM이 없는 게임에서는 조용히 넘어가지 않고 던진다', () => {
  assert.throws(() => parseSong(read('cyber-snake')), /SONG/);
});

/* ---------- 두 곳에 적힌 상수가 어긋나는 것을 막는다 ----------
   reel.js는 게임 안 BGM의 합성 수식을 다시 적어놨다(브라우저 밖에서 WAV를 만들어야 하므로).
   값(SONG)은 게임에서 읽지만 수식은 복제다. 게임 쪽만 고치면 영상 소리가 실제 게임과
   달라지는데, 그건 영상을 직접 들어보기 전까지 아무도 모른다. */
test('reel의 합성 상수가 게임 안 BGM과 같다', () => {
  const reel = readFileSync('tools/reel.js', 'utf8');
  const game = read('pulse-lock');

  const pairs = [
    ['NOTE_RATIO', /const NOTE_RATIO = ([\d.]+)/, /SONG\.beat \* ([\d.]+), SONG\.wave/],
    ['BASS_EVERY', /const BASS_EVERY = (\d+)/, /i % (\d+) === 0/],
    ['BASS_RATIO', /const BASS_RATIO = ([\d.]+)/, /SONG\.root \/ 2, at, SONG\.beat \* ([\d.]+)/],
    ['LEAD_VOL', /const LEAD_VOL = ([\d.]+)/, /SONG\.wave, ([\d.]+)\)/],
    ['BASS_VOL', /const BASS_VOL = ([\d.]+)/, /'triangle', ([\d.]+)\)/],
    ['ATTACK', /const ATTACK = ([\d.]+)/, /linearRampToValueAtTime\(vol, when \+ ([\d.]+)\)/]
  ];

  for (const [name, inReel, inGame] of pairs) {
    const a = reel.match(inReel);
    const b = game.match(inGame);
    assert.ok(a, `reel.js에서 ${name}을 못 찾았다`);
    assert.ok(b, `게임에서 ${name}에 해당하는 값을 못 찾았다`);
    assert.equal(Number(a[1]), Number(b[1]),
      `${name}이 어긋났다 — reel=${a[1]} 게임=${b[1]}. 영상 소리가 실제 게임과 달라진다`);
  }
});

/* ---------- 합성 결과 ---------- */
test('WAV 헤더가 제대로 붙고 길이가 맞는다', () => {
  const wav = renderSong(parseSong(read('pulse-lock')), 2);
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.equal(wav.readUInt16LE(34), 16);
  // 44바이트 헤더 + 2초 * 44100 * 2바이트
  assert.equal(wav.length, 44 + 2 * 44100 * 2);
});

test('무음이 아니고 클리핑도 안 난다', () => {
  for (const slug of ['pulse-lock', 'lantern-keeper']) {   // 가장 빽빽한 곡과 가장 성긴 곡
    const wav = renderSong(parseSong(read(slug)), 3);
    let peak = 0, loud = 0;
    for (let i = 44; i < wav.length; i += 2) {
      const v = Math.abs(wav.readInt16LE(i));
      if (v > peak) peak = v;
      if (v > 1000) loud++;
    }
    assert.ok(peak > 20000, `${slug}: 너무 조용하다 (peak=${peak})`);
    assert.ok(peak < 32767, `${slug}: 클리핑 (peak=${peak})`);
    assert.ok(loud > 44100, `${slug}: 소리가 나는 구간이 1초도 안 된다`);
  }
});

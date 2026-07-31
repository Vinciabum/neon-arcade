// 게이트가 실제로 막는지 확인한다. 통과만 보면 게이트가 죽어 있어도 모른다.
// npm test(단위 테스트)와 분리한 이유: 브라우저를 띄우므로 느리다.
import { spawn } from 'node:child_process';

const CASES = [
  { file: 'templates/game-base.html',            expect: 'pass' },
  { file: 'tests/fixtures/console-error.html',    expect: 'fail', match: /page error|console error/ },
  { file: 'tests/fixtures/blank-canvas.html',     expect: 'fail', match: /canvas appears blank/ },
  { file: 'tests/fixtures/no-touch.html',         expect: 'fail', match: /no touch input/ },
  { file: 'tests/fixtures/never-ends.html',       expect: 'fail', match: /never ends when idle/ },
  { file: 'tests/fixtures/overlay-stuck.html',    expect: 'fail', match: /covered by an overlay/ },
  { file: 'tests/fixtures/instant-death.html',    expect: 'fail', match: /dies too fast/ }
];

const run = (file) => new Promise((resolve) => {
  const p = spawn(process.execPath, ['tools/verify.js', '--quick', file], { shell: false });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => resolve({ code, out }));
});

let bad = 0;
for (const c of CASES) {
  const { code, out } = await run(c.file);
  if (c.expect === 'pass') {
    if (code === 0) console.log(`ok   ${c.file} passes the gates`);
    else { console.error(`FAIL ${c.file} should pass but exited ${code}\n${out}`); bad++; }
    continue;
  }
  if (code === 0) { console.error(`FAIL ${c.file} should be BLOCKED but exited 0 — gate is dead\n${out}`); bad++; }
  else if (!c.match.test(out)) { console.error(`FAIL ${c.file} blocked, but not by ${c.match}\n${out}`); bad++; }
  else console.log(`ok   ${c.file} blocked by ${c.match}`);
}

console.log(`\n${CASES.length - bad}/${CASES.length} gate checks correct.\n`);
if (bad) process.exit(1);

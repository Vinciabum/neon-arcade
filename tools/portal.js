// 포털 납품 빌드 — GameDistribution SDK를 주입한 index.html을 만든다.
//
// 사이트에 올라가는 play/<slug>.html 은 외부 스크립트를 하나도 싣지 않는다.
// 포털 납품본에만 SDK를 넣는 이유가 둘 있다.
//  - 사이트 쪽 산출물 게이트는 외부 요청 실패를 콘솔 에러로 잡는다. 광고 스크립트는
//    차단기·네트워크에 따라 실패하므로 사이트 빌드에 넣으면 게이트가 불안정해진다
//  - 포털마다 SDK가 다르다. 게임 파일에 박으면 포털 수만큼 파일이 갈라진다
//
// 주입만으로 되는 이유는 관측 계약(window.__GAME__) 덕분이다. 게임이 무엇이든
// state·start·pause·resume 이 같은 이름으로 있으므로 배선이 하나로 끝난다.
//
// GameDistribution 요건 (SDK 문서 2026-07 확인):
//  - SDK는 게임이 시작되기 전에 로드한다. 한 번만 로드한다
//  - SDK_GAME_PAUSE 에서 게임을 멈추고 **소리를 끈다** (광고 중 배경음은 금지)
//  - SDK_GAME_START 에서 되돌린다
//  - 프리롤: 시작 버튼. 미드롤: 게임오버 화면의 버튼
//  - 광고는 사용자 입력에만, 플레이 도중이 아니라 그 바깥에서
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gamePath } from './paths.js';

export const PORTAL_DIR = 'dist/portal';

// 게임 파일에 손대지 않고 소리를 끄기 위해 AudioContext 생성자를 감싼다.
// 게임의 actx 는 모듈 스코프라 밖에서 못 잡는다 — 만들어지는 순간을 가로채는 편이
// 게임마다 mute()를 새로 뚫는 것보다 확실하고, 계약을 늘리지 않는다.
const HEAD_SNIPPET = (gameId) => `<script>
(function () {
  var ctxs = [];
  var AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    var Wrapped = function () {
      var c = new AC();
      ctxs.push(c);
      return c;
    };
    Wrapped.prototype = AC.prototype;
    window.AudioContext = window.webkitAudioContext = Wrapped;
  }
  window.__PORTAL_AUDIO__ = {
    mute: function () { ctxs.forEach(function (c) { try { c.suspend(); } catch (e) {} }); },
    unmute: function () { ctxs.forEach(function (c) { try { c.resume(); } catch (e) {} }); }
  };
})();
window["GD_OPTIONS"] = {
  "gameId": "${gameId}",
  "onEvent": function (event) {
    var G = window.__GAME__;
    switch (event.name) {
      case "SDK_GAME_PAUSE":
        if (G && G.state === 'playing') { G.pause(); window.__PORTAL_PAUSED__ = true; }
        if (window.__PORTAL_AUDIO__) window.__PORTAL_AUDIO__.mute();
        break;
      case "SDK_GAME_START":
        if (window.__PORTAL_AUDIO__) window.__PORTAL_AUDIO__.unmute();
        if (G && window.__PORTAL_PAUSED__) { G.resume(); window.__PORTAL_PAUSED__ = false; }
        if (window.__PORTAL_AFTER_AD__) { var f = window.__PORTAL_AFTER_AD__; window.__PORTAL_AFTER_AD__ = null; f(); }
        break;
    }
  }
};
(function (d, s, id) {
  var js, fjs = d.getElementsByTagName(s)[0];
  if (d.getElementById(id)) return;
  js = d.createElement(s); js.id = id;
  js.src = 'https://html5.api.gamedistribution.com/main.min.js';
  fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'gamedistribution-jssdk'));
</script>`;

// 버튼 배선. 시작 버튼 = 프리롤, 게임오버의 다시하기 = 미드롤.
// 캡처 단계에서 가로채는 이유: 게임 자신의 click 핸들러보다 먼저 잡아야
// 광고를 띄우기 전에 판이 시작되지 않는다.
const BODY_SNIPPET = `<script>
(function () {
  function showAd(type, resume) {
    var sdk = window.gdsdk;
    // SDK가 없거나(차단기·오프라인) 호출이 실패하면 광고 없이 그냥 진행한다.
    // 광고를 기다리다 게임이 안 열리는 것이 광고를 놓치는 것보다 나쁘다.
    if (!sdk || typeof sdk.showAd !== 'function') { resume(); return; }
    window.__PORTAL_AFTER_AD__ = resume;
    var guard = setTimeout(function () {
      if (window.__PORTAL_AFTER_AD__) { window.__PORTAL_AFTER_AD__ = null; resume(); }
    }, 8000);
    var done = function () { clearTimeout(guard); };
    try {
      var p = sdk.showAd(type);
      if (p && p.then) p.then(done, function () {
        done();
        if (window.__PORTAL_AFTER_AD__) { window.__PORTAL_AFTER_AD__ = null; resume(); }
      });
    } catch (e) {
      done();
      window.__PORTAL_AFTER_AD__ = null;
      resume();
    }
  }

  function wire(id, type) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      if (btn.dataset.portalGo === '1') { btn.dataset.portalGo = ''; return; }
      e.preventDefault();
      e.stopImmediatePropagation();
      showAd(type, function () {
        btn.dataset.portalGo = '1';
        btn.click();
      });
    }, true);
  }

  function boot() {
    wire('startBtn', 'interstitial');   // 프리롤
    wire('againBtn', 'interstitial');   // 미드롤
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
</script>`;

// 순수 함수 — 파일 없이 테스트할 수 있다.
export function injectPortal(html, gameId) {
  if (!gameId) throw new Error('gameId is required — get it from the GameDistribution control panel');
  if (html.includes('gamedistribution-jssdk')) throw new Error('SDK already injected');
  if (!/<\/head>/i.test(html)) throw new Error('no </head> to inject into');
  if (!/<\/body>/i.test(html)) throw new Error('no </body> to inject into');

  // 아래 둘은 주입이 성공했는지가 아니라 주입한 것이 실제로 동작하는지를 본다.
  // wire()는 버튼을 못 찾으면 말없이 돌아가고, 계약이 없으면 pause가 아무것도 안 한다.
  // 둘 다 "ok"로 납품된 뒤 수익만 0이 되므로 gameId 누락과 같은 취급을 한다.
  for (const id of ['startBtn', 'againBtn']) {
    if (!new RegExp(`id=["']${id}["']`).test(html)) {
      throw new Error(
        `no #${id} — 광고를 걸 자리가 없다. 이대로 납품하면 광고가 한 번도 뜨지 않는다`
      );
    }
  }
  if (!/window\.__GAME__/.test(html)) {
    throw new Error(
      'no window.__GAME__ — 광고 중에 게임을 멈출 수 없다. 포털 규정 위반이다'
    );
  }

  return html
    .replace(/<\/head>/i, HEAD_SNIPPET(gameId) + '\n</head>')
    .replace(/<\/body>/i, BODY_SNIPPET + '\n</body>')
    // 납품본은 포털 안에서 돈다. 사이트로 되돌아가는 링크와 색인 지시는 의미가 없고,
    // 포털은 게임 안에서 밖으로 나가는 링크를 금지한다.
    .replace(/<meta[^>]+name="robots"[^>]*>\s*/i, '')
    .replace(/<link[^>]+rel="canonical"[^>]*>\s*/i, '');
}

export async function buildPortal(game) {
  const gameId = game.portals?.gamedistribution;
  const src = gamePath(game.slug);
  if (!existsSync(src)) throw new Error(`no game file at ${src}`);

  const html = injectPortal(await readFile(src, 'utf8'), gameId);
  const outDir = path.join(PORTAL_DIR, game.slug);
  await rm(outDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }).catch(() => {});
  await mkdir(outDir, { recursive: true });
  const out = path.join(outDir, 'index.html');
  await writeFile(out, html, 'utf8');
  return out;
}

// --- CLI ---
// 직접 실행했을 때만 돈다. 감싸지 않으면 테스트가 import하는 순간 아래가 실행되고
// process.exit까지 불러 테스트 파일이 통째로 죽는다 (실제로 그랬다).
async function main() {
  const args = process.argv.slice(2);
  const all = JSON.parse(await readFile('games.json', 'utf8'))
    .filter(g => g.status === 'published' || g.status === 'demoted')
    .filter(g => (args.length ? args.includes(g.slug) : true));

  if (!all.length) {
    console.error(args.length ? `no published game matches: ${args.join(', ')}` : 'no published games');
    process.exit(1);
  }

  const missing = all.filter(g => !g.portals?.gamedistribution);
  if (missing.length) {
    console.error('');
    console.error('GameDistribution game id가 없다. 컨트롤 패널에서 게임을 만들고');
    console.error('games.json 의 portals.gamedistribution 에 넣은 뒤 다시 실행한다:');
    console.error('');
    for (const g of missing) console.error(`  ${g.slug}`);
    console.error('');
    process.exit(1);
  }

  let failed = 0;
  for (const game of all) {
    try {
      console.log(`ok   ${game.slug} -> ${await buildPortal(game)}`);
    } catch (err) {
      console.error(`x    ${game.slug}: ${err.message}`);
      failed++;
    }
  }
  console.log('');
  console.log(`${all.length - failed}/${all.length} packaged into ${PORTAL_DIR}/`);
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();

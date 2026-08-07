/* 공유 버튼. 랜딩 페이지에만 실린다 — 게임 본체는 외부 스크립트를 싣지 않는다.
 *
 * 점수는 iframe 안의 관측 계약(window.__GAME__)에서 읽는다. same-origin이라 가능하다.
 * 계약이 없는 게임(기존 9개)에서는 조용히 링크 공유로 남는다 — 버튼이 사라지지는 않는다. */
(function () {
  var LABEL_GAME = '🔗 Share this game';
  var LABEL_SCORE = '🏆 Share your score';

  var root = document.querySelector('[data-share]');
  if (!root) return;

  var btn = root.querySelector('.share-btn');
  var note = root.querySelector('.share-note');
  var frame = document.querySelector('.landing-frame iframe');
  var title = root.getAttribute('data-title');
  var url = root.getAttribute('data-url');
  var slug = root.getAttribute('data-slug');
  var score = null;
  var day = null;      // 오늘의 판 번호. 계약이 있는 게임만 준다

  // 계약이 없거나 iframe이 아직 안 올라왔으면 null. 던지지 않는다 —
  // 여기서 던지면 버튼 자체가 죽는다.
  //
  // 0점은 자랑거리가 아니다. 방치하다 끝난 판이 대부분 0점인데, 그걸 그대로
  // "0 pts. Beat me:" 로 내보내면 공유가 아니라 망신이다. 링크 공유로 남긴다.
  function readScore() {
    try {
      var G = frame && frame.contentWindow && frame.contentWindow.__GAME__;
      if (!G) return null;
      day = typeof G.day === 'number' ? G.day : null;
      if (G.state !== 'over') return null;
      return typeof G.score === 'number' && G.score > 0 ? G.score : null;
    } catch (e) {
      return null;
    }
  }

  // 판 번호는 계약에서 온다. 여기서 날짜를 다시 계산하면 게임 쪽 규칙(?day=N, file://은
  // 0일차)과 어긋나고, 어긋나면 화면의 번호와 공유 문구의 번호가 서로 다른 날을 가리킨다.
  var dailyEl = root.querySelector('[data-daily]');
  var dailyShown = null;
  function paintDaily() {
    if (!dailyEl || day === null || day === dailyShown) return;
    dailyShown = day;
    dailyEl.textContent = "Today's board #" + day;
  }

  /* ---- 계측 ----
   * 재미를 판단할 유일한 자리는 iframe 안인데 게임 본체에는 GA가 없다
   * (외부 스크립트 0 원칙 — 포털 납품본이 같은 파일이고, 광고 스크립트 실패를
   * 게이트 1이 콘솔 에러로 잡는다). 그래서 밖에서 계약의 state 전이만 읽는다.
   * 게임 파일은 한 글자도 건드리지 않는다.
   *
   * 답해야 할 질문은 셋이다: 눌렀는가 · 한 판이 몇 초인가 · **다시 했는가.**
   * GA4 28일치가 "평균 참여 시간 13초"만 주고 그 안에서 무슨 일이 있었는지는
   * 하나도 못 알려줬다 — 그 눈을 여는 것이 이 블록의 전부다.
   *
   * 이벤트 이름을 셋으로 나눈 이유: GA4는 맞춤 매개변수를 '맞춤 측정기준'으로
   * 등록하기 전에는 보고서에 안 띄운다. run_index를 매개변수로만 두면
   * 재방문 여부가 화면에 영영 안 나온다. 이름이 다르면 등록 없이도 이벤트 표에 뜬다. */
  var prevState = null;
  var runs = 0;
  var runStart = 0;

  function readState() {
    try {
      var G = frame && frame.contentWindow && frame.contentWindow.__GAME__;
      return G && typeof G.state === 'string' ? G.state : null;
    } catch (e) {
      return null;
    }
  }

  function send(name, params) {
    if (typeof gtag !== 'function') return;   // GA가 없으면 아무것도 안 한다
    gtag('event', name, params);
  }

  function trackState() {
    var s = readState();
    if (s === null || s === prevState) return;   // 계약 없는 기존 9개는 조용히 지나간다
    var was = prevState;
    prevState = s;
    // 일시정지에서 돌아온 것은 새 판이 아니다. 탭을 옮겼다 오면 게임이 스스로
    // pause/resume 하므로, 이걸 안 걸러내면 한 판이 여러 판으로 세진다.
    if (s === 'playing' && was !== 'paused') {
      runs++;
      runStart = Date.now();
      send('game_start', { item_id: slug, run_index: runs });
      if (runs > 1) send('game_replay', { item_id: slug, run_index: runs });
    } else if (s === 'over' && was === 'playing') {
      var sc = null;
      try {
        var G = frame.contentWindow.__GAME__;
        if (typeof G.score === 'number') sc = G.score;
      } catch (e) { /* 계약이 사라졌다 — 판 길이만 남긴다 */ }
      send('game_over', {
        item_id: slug,
        run_index: runs,
        score: sc,
        // 700ms 폴링이라 ±1초 오차가 있다. '10초 안에 지루한가'를 가르는 데는 충분하고,
        // 더 정확히 재려면 게임 본체에 코드를 넣어야 하는데 그건 원칙을 깬다.
        run_seconds: runStart ? Math.round((Date.now() - runStart) / 1000) : null
      });
    }
  }

  function refresh() {
    if (document.hidden) return;
    trackState();
    var next = readScore();
    paintDaily();
    if (next === score) return;
    score = next;
    btn.textContent = score === null ? LABEL_GAME : LABEL_SCORE;
  }
  setInterval(refresh, 700);
  refresh();

  // 판 번호가 있어야 비교가 성립한다. 같은 날 같은 판을 한 사람끼리만 점수가 견줘진다 —
  // 번호 없이 점수만 던지면 상대는 다른 판을 하고 있을 수도 있다.
  function message() {
    var tag = day === null ? title : title + ' — Board #' + day;
    return score === null
      ? tag + ' — free browser game, no ads, no signup.'
      : tag + ' — ' + score.toLocaleString('en-US') + ' pts. Beat me:';
  }

  function done() {
    note.textContent = 'Copied!';
    setTimeout(function () { note.textContent = ''; }, 2400);
  }

  // execCommand는 폐기됐지만 clipboard API가 막힌 환경(비보안 컨텍스트·구형 사파리)에서
  // 유일하게 남는 경로다. 둘 다 실패하면 조용히 넘어가지 말고 사실대로 말한다.
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) done();
    else note.textContent = 'Copy failed — the link is in the address bar.';
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); });
    } else {
      legacyCopy(text);
    }
  }

  // 공유가 실제로 일어나는지 재려고 남긴다. GA가 없으면 아무것도 안 한다.
  function track() {
    if (typeof gtag !== 'function') return;
    gtag('event', 'share', {
      method: 'button',
      content_type: score === null ? 'game' : 'score',
      item_id: slug
    });
  }

  btn.addEventListener('click', function () {
    var text = message();
    track();
    // 모바일 네이티브 공유 시트. 취소는 거부로 오므로 조용히 넘긴다.
    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url })
        .catch(function () {});
      return;
    }
    copy(text + '\n' + url);
  });
})();

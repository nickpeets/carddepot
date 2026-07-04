/* js/depot-game-shell.js — Session 5 of the reskin (DESIGN.md IMPLEMENTATION_PLAN, LAST).
 *
 * Wires the shared shell (css/depot-style.css + js/depot-shell.js) around the GAME
 * screen (game/index.html). Per Nick's locked amendment (DESIGN.md 3.4), the in-game
 * presentation — the RBI diamond, field, HUD/scoreboard, MUDCATS/ACORNS nameplates,
 * play-by-play, and every in-game panel — is the aesthetic north star and is NOT
 * restyled. Only two things change on this screen:
 *   1. Shell chrome: a THIN shared header/nav frame (bunting + header + mode nav with
 *      PLAY BALL active, franchise + record identity) fixed ABOVE the game stage.
 *   2. Controls: the game controls (#sim-controls buttons + pace select) adopt the
 *      shared shell button/tile look (.btn / .btn.ghost / .sel) — styling only; what
 *      the controls DO is untouched.
 *
 * IMPORTANT — the game is a runtime BUNDLE: game/index.html ships an almost-empty <body>
 * plus a bundler (React) that builds the whole UI (#dc-root / .sc-host / #stage /
 * #backToDepot / #sim-controls) at runtime AFTER DOMContentLoaded, clears <body> + resets
 * <html> class during init, AND STRIPS the static <link>/<script> tags from the shipped
 * <head>. Two consequences we handle here:
 *   (a) the static <link href="../css/depot-style.css"> is removed by the bundler, so we
 *       INJECT the stylesheet at runtime (injected DOM survives the bundler);
 *   (b) mounting on DOMContentLoaded would be wiped by the bundler's initial render, so we
 *       WAIT for the game UI to exist (#sim-controls + the stage) via a MutationObserver
 *       (+ interval fallback), then mount once. Post-build, body children are stable; a
 *       light watchdog re-mounts if a later re-render ever removes the shell.
 *
 * HIGH CAUTION (AGENTS.md, riskiest working path): this file NEVER touches the sim,
 * __onMatchComplete, the season writeback, the BACK-nav behavior, or the 2000px scaled
 * #stage. The stage's scale transform is left EXACTLY as the game sets it. To make room
 * for the thin shell we translate the game's full-viewport backdrop (.sc-host > div,
 * position:fixed inset:0) DOWN by the measured chrome height via a CSS variable — a pure
 * translateY on the backdrop CONTAINER, which shifts the whole canvas uniformly and
 * preserves the stage's scale and its centering-within-the-backdrop (no scale change, no
 * clipping). We only: inject the shared stylesheet, mount chrome, MOVE the existing
 * #backToDepot node into the shell (node move preserves its listener + href + label — nav
 * behavior unchanged), ADD shared classes to the existing #sim-controls children (additive
 * styling only), and set the --depot-game-chrome-h offset variable.
 *
 * FOUC guard (mirrors Season PR #72 / Builder PR #74) — CHROME ONLY: css/depot-style.css
 * keeps the shell CHROME (.depot-bunting + .depot-shell) invisible while <html> carries
 * .depot-game but not yet .depot-game-dressed. The game stage/controls are bundler-owned
 * and are NEVER hidden by the guard — the sim renders and runs regardless of shell state.
 * Because the bundler resets <html> class during init, we (re)assert .depot-game at mount.
 *
 * Additive-first + fail-loud per AGENTS.md: every early return logs why, tagged [depot].
 */
(function () {
  'use strict';

  var HREF_FIX = {
    binder: '../index.html',
    builder: 'builder.html',
    season: '../index.html?season=1',
    game: 'index.html'
  };

  var docEl = document.documentElement;
  var mounted = false;

  function reveal(cls) { docEl.classList.add(cls); }

  // The bundler strips the shipped static <link>, so inject css/depot-style.css at runtime.
  function ensureStylesheet() {
    try {
      if (document.getElementById('depot-shell-css')) { return; }
      var sheets = document.styleSheets, i;
      for (i = 0; i < sheets.length; i++) {
        if (sheets[i].href && sheets[i].href.indexOf('depot-style.css') !== -1) { return; }
      }
      var link = document.createElement('link');
      link.id = 'depot-shell-css';
      link.rel = 'stylesheet';
      link.href = '../css/depot-style.css';
      link.onerror = function () { console.warn('[depot] game-shell: failed to load ../css/depot-style.css; shell will be unstyled'); };
      (document.head || docEl).appendChild(link);
    } catch (e) { console.warn('[depot] game-shell: ensureStylesheet threw: ' + e); }
  }

  function gameReady() {
    return !!document.getElementById('sim-controls') &&
           (!!document.getElementById('stage') || !!document.getElementById('dc-root'));
  }

  function setChromeOffset() {
    try {
      var shell = document.querySelector('.depot-shell');
      if (!shell) { console.warn('[depot] game-shell: setChromeOffset — no .depot-shell; leaving default offset'); return; }
      var bunt = document.querySelector('.depot-bunting');
      var header = shell.querySelector('.depot-shell__header');
      var nav = shell.querySelector('.depot-nav');
      var mid = window.innerHeight / 2;
      var bottoms = [];
      [bunt, header, nav].forEach(function (el) {
        if (!el) { return; }
        var r = el.getBoundingClientRect();
        if (r.top < mid) { bottoms.push(r.bottom); }   // ignore the phone bottom-tab nav
      });
      if (!bottoms.length) { console.warn('[depot] game-shell: setChromeOffset — no top chrome measured; leaving default offset'); return; }
      docEl.style.setProperty('--depot-game-chrome-h', Math.round(Math.max.apply(null, bottoms)) + 'px');
    } catch (e) {
      console.warn('[depot] game-shell: setChromeOffset threw: ' + e);
    }
  }

  function styleControls() {
    var ctrls = document.getElementById('sim-controls');
    if (!ctrls) { console.warn('[depot] game-shell: #sim-controls not found; controls keep default styling'); return; }
    ctrls.classList.add('depot-game-controls');
    var btns = ctrls.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.add('btn');                    // PLAY = gold primary
      if (i > 0) { btns[i].classList.add('ghost'); }   // the rest = ghost
    }
    var sel = ctrls.querySelector('select');
    if (sel) { sel.classList.add('sel', 'depot-game-sel'); }
    var span = ctrls.querySelector('span');
    if (span) { span.classList.add('depot-game-pacelbl'); }
  }

  var resizeTimer = null;
  function onResize() {
    if (resizeTimer) { clearTimeout(resizeTimer); }
    resizeTimer = setTimeout(setChromeOffset, 120);
  }

  function mountShell() {
    // The bundler resets <html> class during its render passes — (re)assert the FOUC
    // scope class on EVERY call. Session 6 fix: the bundle strips .depot-game /
    // .depot-game-dressed AFTER the initial mount but leaves the .depot-shell node under
    // <body>, so an element-only early-return left the chrome unstyled/unpinned. Assert
    // the classes first, then early-return only for the (already-mounted) heavy work.
    docEl.classList.add('depot-game');
    ensureStylesheet();
    if (mounted && document.querySelector('.depot-shell')) {
        if (!docEl.classList.contains('depot-game-dressed')) {
            docEl.classList.add('depot-game-dressed');
            console.log('[depot] game-shell: re-asserted depot-game(-dressed) after bundler class reset');
            setChromeOffset();
        }
        return;
    }

    if (!window.DepotShell) {
      console.warn('[depot] game-shell: window.DepotShell missing (depot-shell.js not loaded); game keeps its bare chrome');
      reveal('depot-game-reveal-fallback');
      styleControls();
      return;
    }
    if (document.querySelector('.depot-shell')) { mounted = true; reveal('depot-game-dressed'); return; }

    window.DepotShell.mount({ el: document.body, active: 'game' });

    var tabs = document.querySelectorAll('.depot-shell .depot-tab');
    for (var i = 0; i < tabs.length; i++) {
      var m = tabs[i].getAttribute('data-mode');
      if (HREF_FIX[m]) { tabs[i].setAttribute('href', HREF_FIX[m]); }
    }

    var back = document.getElementById('backToDepot');
    if (back) {
      back.classList.add('btn', 'ghost', 'depot-game-back');
      var nav = document.querySelector('.depot-shell .depot-nav');
      if (nav) { nav.appendChild(back); }
      else { console.warn('[depot] game-shell: .depot-nav missing; leaving #backToDepot in place'); }
    } else {
      console.warn('[depot] game-shell: #backToDepot not found to relocate');
    }

    styleControls();
    setChromeOffset();
    window.addEventListener('resize', onResize);

    reveal('depot-game-dressed');
    setTimeout(setChromeOffset, 0);
    mounted = true;
    console.log('[depot] game-shell: play-ball screen wearing thin shared shell (active=game); in-game stage untouched');
  }

  var poll = null, obs = null, giveUpAt = Date.now() + 20000;

  function tick() {
    if (gameReady()) {
      mountShell();
      if (mounted && !document.querySelector('.depot-shell')) { mounted = false; mountShell(); }
      return;
    }
    if (Date.now() > giveUpAt) {
      if (poll) { clearInterval(poll); poll = null; }
      if (obs) { obs.disconnect(); obs = null; }
      console.warn('[depot] game-shell: game UI (#sim-controls/#stage) never appeared within 20s; shell not mounted. The game itself is bundler-owned and unaffected.');
    }
  }

  // Session 6: the bundle re-renders <html> (stripping our scope classes) at unpredictable
  // times AFTER the initial mount, so a lightweight watchdog re-asserts the classes
  // whenever they go missing. mountShell() is idempotent (guard re-asserts + returns),
  // so calling it is cheap. This never touches the sim/stage — chrome scope classes only.
  function watchdog() {
    if (!mounted) { return; }
    if (!document.documentElement.classList.contains('depot-game') ||
        !document.querySelector('.depot-shell')) {
      mountShell();
    }
  }

  function boot() {
    ensureStylesheet();   // load the shared CSS ASAP so there is no flash of unstyled shell
    if (gameReady()) { mountShell(); }
    obs = new MutationObserver(function () { tick(); if (mounted) { watchdog(); } });
    obs.observe(document.body || docEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    poll = setInterval(tick, 200);
    // Once mounted the heavy discovery poll stops, but a slow class-reassert watchdog
    // keeps running for the life of the page (the bundle can re-render at any time).
    setInterval(watchdog, 500);
    var stopPoll = setInterval(function () {
      if (mounted) { if (poll) { clearInterval(poll); poll = null; } clearInterval(stopPoll); }
      if (Date.now() > giveUpAt) { clearInterval(stopPoll); }
    }, 300);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

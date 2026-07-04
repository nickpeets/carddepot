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
 * HIGH CAUTION (AGENTS.md, riskiest working path): this file NEVER touches the sim,
 * __onMatchComplete, the season writeback, the BACK-nav behavior, or the 2000px scaled
 * #stage. The stage's scale transform is left EXACTLY as the game sets it. To make room
 * for the thin shell we translate the game's full-viewport backdrop (.sc-host > div,
 * position:fixed inset:0) DOWN by the measured chrome height via a CSS variable — a pure
 * translateY on the backdrop CONTAINER, which shifts the whole canvas uniformly and
 * preserves the stage's scale and its centering-within-the-backdrop (no scale change, no
 * clipping). We only: mount chrome, MOVE the existing #backToDepot node into the shell
 * (node move preserves its listener + href + label — nav behavior unchanged), ADD shared
 * classes to the existing #sim-controls children (additive styling only), and set the
 * --depot-game-chrome-h offset variable.
 *
 * FOUC guard (mirrors Season PR #72 / Builder PR #74) — CHROME ONLY: depot-game-shell.js
 * marks <html class="depot-game"> at script-eval so css/depot-style.css keeps the shell
 * CHROME (.depot-bunting + .depot-shell) invisible until dressed. The game stage and
 * controls are deliberately EXCLUDED from the hide, so the sim renders and runs
 * immediately regardless of shell state. On successful mount we add .depot-game-dressed
 * to reveal the chrome. A one-shot 3s fail-loud fallback adds .depot-game-reveal-fallback
 * (+ a [depot] warn) so a broken mount can never leave the chrome permanently hidden.
 *
 * Additive-first + fail-loud per AGENTS.md: every early return logs why, tagged [depot].
 */
(function () {
  'use strict';

  // The game lives under /game/, so the shell's root-relative nav hrefs are rewritten
  // page-relative after mount.
  var HREF_FIX = {
    binder: '../index.html',
    builder: 'builder.html',
    season: '../index.html?season=1',
    game: 'index.html'
  };

  var docEl = document.documentElement;

  // Arm the CHROME-ONLY FOUC hide immediately (before DOMContentLoaded). Scopes the
  // hide-until-dressed CSS to the game page only. Only the shell chrome is affected;
  // the game stage/controls are never hidden by this class (see css/depot-style.css).
  docEl.classList.add('depot-game');

  var revealTimer = null;
  function reveal(cls) {
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    docEl.classList.add(cls);
  }
  function armReveal() {
    if (revealTimer) { return; }
    if (docEl.classList.contains('depot-game-dressed')) { return; }
    revealTimer = setTimeout(function () {
      revealTimer = null;
      if (!docEl.classList.contains('depot-game-dressed')) {
        docEl.classList.add('depot-game-reveal-fallback');
        console.warn('[depot] game-shell: reveal fallback — chrome not dressed within 3s; revealing shell frame so it is not left hidden (shell mount hook may have failed). The game stage is unaffected and has been running regardless.');
      }
    }, 3000);
  }

  // Measure the height of the TOP chrome (bunting + header, plus the nav when it sits at
  // the top on desktop) and publish it as --depot-game-chrome-h. css/depot-style.css uses
  // it to translate the game backdrop down so the thin shell sits above the stage without
  // touching the stage's scale. Recomputed on resize so desktop (nav-at-top) and phone
  // (nav becomes a bottom tab bar) both offset by the correct amount. Fail-loud on miss.
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
        // only count chrome anchored near the TOP (the phone nav is a fixed bottom bar)
        if (r.top < mid) { bottoms.push(r.bottom); }
      });
      if (!bottoms.length) { console.warn('[depot] game-shell: setChromeOffset — no top chrome measured; leaving default offset'); return; }
      var h = Math.round(Math.max.apply(null, bottoms));
      docEl.style.setProperty('--depot-game-chrome-h', h + 'px');
    } catch (e) {
      console.warn('[depot] game-shell: setChromeOffset threw: ' + e);
    }
  }

  // Restyle the game controls to the shared shell look — ADDITIVE CLASSES ONLY.
  // What the controls DO is never touched: no listeners added/removed, no logic changed.
  function styleControls() {
    var ctrls = document.getElementById('sim-controls');
    if (!ctrls) { console.warn('[depot] game-shell: #sim-controls not found; controls keep default styling'); return; }
    ctrls.classList.add('depot-game-controls');
    var btns = ctrls.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      // Primary action (PLAY) gets the gold .btn; the rest are ghost buttons — matches
      // mockups/game.html (SWING primary, BOX SCORE / PAUSE ghost).
      btns[i].classList.add('btn');
      if (i > 0) { btns[i].classList.add('ghost'); }
    }
    var sel = ctrls.querySelector('select');
    if (sel) { sel.classList.add('sel', 'depot-game-sel'); }
    var span = ctrls.querySelector('span');
    if (span) { span.classList.add('depot-game-pacelbl'); }
    console.log('[depot] game-shell: controls restyled to shared shell look (' + btns.length + ' buttons + pace select)');
  }

  var resizeTimer = null;
  function onResize() {
    if (resizeTimer) { clearTimeout(resizeTimer); }
    resizeTimer = setTimeout(setChromeOffset, 120);
  }

  function init() {
    // Fallback armed on every path: if we bail before dressing, the 3s timer reveals
    // the chrome rather than leaving the shell hidden. The game stage is never hidden.
    armReveal();

    if (!window.DepotShell) {
      console.warn('[depot] game-shell: window.DepotShell missing (depot-shell.js not loaded); game keeps its bare chrome');
      reveal('depot-game-reveal-fallback');
      // still restyle controls if possible — they do not depend on the shell
      styleControls();
      return;
    }
    if (document.querySelector('.depot-shell')) {
      console.warn('[depot] game-shell: shell already mounted; skipping');
      reveal('depot-game-dressed');
      return;
    }

    // Mount the thin shell chrome at the TOP of the body (afterbegin). CSS fixes it to
    // the top and translates the game backdrop down by --depot-game-chrome-h; the stage
    // (#dc-root / #stage) keeps its own scale/positioning untouched.
    window.DepotShell.mount({ el: document.body, active: 'game' });

    var tabs = document.querySelectorAll('.depot-shell .depot-tab');
    for (var i = 0; i < tabs.length; i++) {
      var m = tabs[i].getAttribute('data-mode');
      if (HREF_FIX[m]) { tabs[i].setAttribute('href', HREF_FIX[m]); }
    }

    // Relocate the existing BACK link into the shell nav (right-aligned), preserving its
    // listener + href + label exactly — the game may relabel it "BACK TO SEASON" in
    // season context, and that behavior is left entirely to the game's own JS.
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

    // Publish the chrome-height offset and keep it in sync on resize.
    setChromeOffset();
    window.addEventListener('resize', onResize);

    // Dressing complete — reveal the chrome (FOUC guard) and cancel the fail-loud timer.
    reveal('depot-game-dressed');

    // One more offset pass after reveal in case fonts/reflow changed the chrome height.
    setTimeout(setChromeOffset, 0);

    console.log('[depot] game-shell: play-ball screen wearing thin shared shell (active=game); in-game stage untouched');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

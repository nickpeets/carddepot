/* js/depot-game-shell.js — Session 5 of the reskin; Session 6 robustness fix.
 *
 * Wires the shared shell (css/depot-style.css + js/depot-shell.js) around the GAME
 * screen (game/index.html). Per Nick's locked amendment (DESIGN.md 3.4) the in-game
 * presentation (RBI diamond, field, HUD/scoreboard, MUDCATS/ACORNS nameplates,
 * play-by-play, panels, and the 2000px scaled #stage) is the aesthetic north star and
 * is NOT restyled. Only the shell chrome around the stage + the control styling change.
 *
 * The game is a runtime React BUNDLE that clears <body>, strips the shipped static
 * <link>/<script>, AND — the Session 6 gotcha — REPLACES the <html> element during its
 * render, so any <html> reference captured at load goes stale: writing scope classes to
 * that orphaned node has no visual effect and the live chrome stays unstyled. FIX: never
 * cache document.documentElement; read it FRESH on every scope write, and re-assert the
 * classes via a MutationObserver on the live <html> plus an always-on interval. This
 * never touches the sim, the stage, its scale transform, the season writeback, or the
 * nav destination behavior — chrome scope classes + offset only.
 *
 * Session note (BACK-button removal): the shared shell now shows SEASON + THE BINDER as
 * permanent nav tabs on every screen, so the dedicated in-game BACK TO SEASON / BACK TO
 * DEPOT button duplicated them and has been removed. The button previously (a) carried
 * the destination logic (season -> index.html?season=1, exhibition -> index.html) and
 * (b) AWAITED the pending season writeback (window.__depotSeasonWriteback, PR #37) before
 * navigating so a mid-flight season_games/seasons update could not be killed by leaving
 * the page. (a) is already covered by the shell tab hrefs (HREF_FIX: season tab ->
 * '../index.html?season=1', binder tab -> '../index.html'). (b) is preserved here by
 * installNavInterceptor(): a capture-phase click guard on the shell nav links that, when
 * a season context is present AND the writeback promise is still pending, holds the
 * navigation, awaits the promise, then releases. The source #backToDepot node is no
 * longer relocated into the nav; per §9 (the bundle re-creates DOM on its own render
 * clock, so a one-shot remove races the React mount) it is hidden via hideBackButton(),
 * RE-ASSERTED on every recurring guard (mount, assertScope, observer, interval, resize)
 * exactly like the scope classes — so it can never flash back after a bundle re-render.
 * The sim, the writeback itself, and __onMatchComplete are untouched.
 *
 * Additive-first + fail-loud per AGENTS.md: every early return logs why, tagged [depot].
 */
(function () {
  'use strict';

  var HREF_FIX = {
    binder: '../index.html',
    builder: 'builder.html',
      shop:    'shop.html',
    season: '../index.html?season=1',
    game: 'index.html'
  };

  var mounted = false;
  var htmlObs = null;
  var observedHtml = null;
  var navInterceptorInstalled = false;
  var backRemovalLogged = false;

  // Always read the LIVE <html> — the bundle can replace it out from under us.
  function html() { return document.documentElement; }
  function reveal(cls) { html().classList.add(cls); }

  // Hide the redundant in-game BACK button. The bundle re-creates DOM on its own render
  // clock, so a one-shot remove races the mount; instead we hide idempotently and RE-ASSERT
  // this from every recurring guard (see §9). Node is left in place (its listeners/logic are
  // the bundle's) — only its visibility is suppressed, so nothing in the bundle breaks.
  function hideBackButton() {
    var back = document.getElementById('backToDepot');
    if (!back) { return; } // not rendered yet (or already gone); recurring guards will catch it
    if (back.getAttribute('data-depot-hidden') !== '1') {
      back.style.setProperty('display', 'none', 'important');
      back.setAttribute('data-depot-hidden', '1');
      back.setAttribute('aria-hidden', 'true');
      if (!backRemovalLogged) {
        console.log('[depot] game-shell: hid redundant #backToDepot (SEASON/BINDER tabs cover it); writeback protection moved to nav guard');
        backRemovalLogged = true;
      }
    }
  }

  // (re)assert the FOUC scope classes on the LIVE <html>; only once the shell exists.
  function assertScope() {
    if (!document.querySelector('.depot-shell')) { return false; }
    var de = html();
    var changed = false;
    if (!de.classList.contains('depot-game')) { de.classList.add('depot-game'); changed = true; }
    if (!de.classList.contains('depot-game-dressed')) { de.classList.add('depot-game-dressed'); html().classList.add('v2-body'); changed = true; }
    // The bundle may have swapped <html>; keep the observer pointed at the live node.
    ensureHtmlObserver();
    // The bundle may have re-created the BACK button; keep it suppressed.
    hideBackButton();
    if (changed) {
      console.log('[depot] game-shell: re-asserted depot-game(-dressed) on live <html>');
      setChromeOffset();
      setTabbarOffset();
    }
    return true;
  }

  // Keep a MutationObserver bound to the CURRENT <html> (rebind if it was replaced).
  function ensureHtmlObserver() {
    var de = html();
    if (htmlObs && observedHtml === de) { return; }
    try {
      if (htmlObs) { htmlObs.disconnect(); }
      htmlObs = new MutationObserver(function () { assertScope(); });
      htmlObs.observe(de, { attributes: true, attributeFilter: ['class'] });
      observedHtml = de;
    } catch (e) { console.warn('[depot] game-shell: html observer failed: ' + e); }
  }

  // v2 reskin: mirror ensureStylesheet for depot-v2.css (bundler strips static <link>). Injected fresh,
  // idempotent (skip if already present), appended AFTER depot-style.css so v2 tokens layer on top.
  function ensureV2Stylesheet() {
    try {
      if (document.getElementById('depot-v2-css')) { return; }
      var link = document.createElement('link');
      link.id = 'depot-v2-css';
      link.rel = 'stylesheet';
      link.href = '../depot-v2.css' + (window.DEPOT_BUILD ? ('?v=' + window.DEPOT_BUILD) : '');  /* Task C: the runtime-injected sheets carried no cache-bust */
      (document.head || html()).appendChild(link);
      console.log('[depot] game-shell: depot-v2.css injected at runtime');
    } catch (e) { console.warn('[depot] game-shell: ensureV2Stylesheet threw: ' + e); }
  }

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
      link.href = '../css/depot-style.css' + (window.DEPOT_BUILD ? ('?v=' + window.DEPOT_BUILD) : '');  /* Task C: the runtime-injected sheets carried no cache-bust */
      link.onerror = function () { console.warn('[depot] game-shell: failed to load ../css/depot-style.css; shell will be unstyled'); };
      (document.head || html()).appendChild(link);
    } catch (e) { console.warn('[depot] game-shell: ensureStylesheet threw: ' + e); }
  }

  // REDESIGN (phase 1). AGENTS.md 9: this page's runtime bundle strips static
// <link> and <script> tags, so the shipped tags in game/index.html do not
// survive. Inject BOTH the redesign sheet and the redesign runtime here, the
// same way ensureStylesheet()/ensureV2Stylesheet() already do for the shell.
// Idempotent by id; fail-loud on load error rather than rendering half-dressed.
function ensureRedesignAssets() {
  try {
    var v = window.DEPOT_BUILD ? ('?v=' + window.DEPOT_BUILD) : '';
    if (!document.getElementById('depot-rd-css')) {
      var link = document.createElement('link');
      link.id = 'depot-rd-css';
      link.rel = 'stylesheet';
      link.href = '../css/depot-redesign.css' + v;
      link.onerror = function () { console.warn('[depot] game-shell: failed to load ../css/depot-redesign.css; the redesigned chrome will be unstyled'); };
      (document.head || html()).appendChild(link);
    }
    if (!document.getElementById('depot-rd-js') && !window.DepotRD) {
      var sc = document.createElement('script');
      sc.id = 'depot-rd-js';
      sc.src = '../js/depot-redesign.js' + v;
      sc.onerror = function () { console.warn('[depot] game-shell: failed to load ../js/depot-redesign.js; chapter 01 chrome will not be applied on the game page'); };
      (document.head || html()).appendChild(sc);
    }
  } catch (e) { console.warn('[depot] game-shell: ensureRedesignAssets threw: ' + e); }
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
        if (r.top < mid) { bottoms.push(r.bottom); } // ignore the phone bottom-tab nav
      });
      if (!bottoms.length) { console.warn('[depot] game-shell: setChromeOffset — no top chrome measured; leaving default offset'); return; }
      html().style.setProperty('--depot-game-chrome-h', Math.round(Math.max.apply(null, bottoms)) + 'px');
    } catch (e) {
      console.warn('[depot] game-shell: setChromeOffset threw: ' + e);
    }
  }

  // Measure the LIVE height of the fixed bottom mode-tab bar (phone only) and publish it
  // as --depot-game-tabbar-h so the game action bar (#sim-controls) can clear it exactly.
  // Bar height varies with tab wrap; a hardcoded offset is brittle, so this measures the
  // live nav (same measured-variable pattern as --depot-game-chrome-h). With the BACK tab
  // removed the bar no longer wraps for it, and this re-measure adapts automatically.
  // Reads the live <html> via html() (the bundle can replace documentElement). Chrome/
  // presentation only - never touches the sim or the stage.
  function setTabbarOffset() {
    try {
      var mid = window.innerHeight / 2;
      var navs = document.querySelectorAll('.depot-nav');
      var h = 0, i, r;
      for (i = 0; i < navs.length; i++) {
        r = navs[i].getBoundingClientRect();
        if (r.top >= mid && r.bottom > window.innerHeight - 4 && r.height > 0) {
          if (r.height > h) { h = r.height; }
        }
      }
      if (!h) { html().style.removeProperty('--depot-game-tabbar-h'); return; }
      html().style.setProperty('--depot-game-tabbar-h', Math.round(h) + 'px');
    } catch (e) {
      console.warn('[depot] game-shell: setTabbarOffset threw: ' + e);
    }
  }

  function styleControls() {
    var ctrls = document.getElementById('sim-controls');
    if (!ctrls) { console.warn('[depot] game-shell: #sim-controls not found; controls keep default styling'); return; }
    ctrls.classList.add('depot-game-controls');
    var btns = ctrls.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.add('btn');
      if (i > 0) { btns[i].classList.add('ghost'); }
    }
    var sel = ctrls.querySelector('select');
    if (sel) { sel.classList.add('sel', 'depot-game-sel'); }
    var span = ctrls.querySelector('span');
    if (span) { span.classList.add('depot-game-pacelbl'); }
  }

  // --- Season-writeback nav guard (replaces the removed BACK button's PR #37 protection). ---
  // The removed BACK button used to await window.__depotSeasonWriteback before navigating in
  // season mode so a mid-flight season_games/seasons writeback could not be killed by leaving
  // the page. That protection now lives on the shell nav links: when a season context is
  // present AND the writeback promise is still pending, a nav click is held, the promise is
  // awaited, then navigation is released. Presentation/flow-preserving only — never touches
  // the writeback itself, the sim, or __onMatchComplete. Fail-loud [depot]/[season] per §4.
  function seasonCtxPresent() {
    try { return !!sessionStorage.getItem('depot_season_ctx'); }
    catch (e) { console.warn('[depot] game-shell: seasonCtx read threw: ' + e); return false; }
  }
  function pendingSeasonWriteback() {
    var wb = window.__depotSeasonWriteback;
    return (wb && typeof wb.then === 'function') ? wb : null;
  }
  function leavesPage(a) {
    var href = a && a.getAttribute('href');
    if (!href) { return false; }
    if (href.charAt(0) === '#') { return false; } // in-page anchor, not a departure
    return true;
  }
  function installNavInterceptor() {
    if (navInterceptorInstalled) { return; }
    var nav = document.querySelector('.depot-shell .depot-nav');
    if (!nav) { console.warn('[depot] game-shell: .depot-nav missing; season-writeback nav guard not installed'); return; }
    nav.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || !nav.contains(a) || !leavesPage(a)) { return; }
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) { return; }
      var ctx = seasonCtxPresent();
      var wb = pendingSeasonWriteback();
      if (!ctx || !wb) { return; } // no season writeback in flight — let the link navigate normally
      var dest = a.href;
      e.preventDefault();
      console.warn('[season] game-shell nav guard: holding navigation to ' + a.getAttribute('href') + ' until the pending season writeback settles (season context active)');
      var release = function (why) {
        console.log('[season] game-shell nav guard: ' + why + '; releasing navigation');
        window.location.href = dest;
      };
      Promise.resolve(wb).then(function () { release('season writeback settled'); },
        function (err) { console.warn('[depot] game-shell nav guard: season writeback rejected (' + err + '); releasing navigation anyway to avoid trapping the user'); window.location.href = dest; });
    }, true); // capture phase: intercept before the anchor's default follows the href
    navInterceptorInstalled = true;
    console.log('[depot] game-shell: season-writeback nav guard armed on shell nav links');
  }

  // --- Desktop-only relocation of the sim controls off the field and into the shell chrome. ---
  // Per Nick's amendment this moves ONLY the floating #sim-controls overlay: the sim, stage,
  // field, plate and panels are never touched. Node-move-preserves-listeners pattern (reparent
  // the live node; its React/DOM listeners ride along).
  // The bundle inline-styles #sim-controls position:fixed bottom:22px (over home plate at desktop
  // width); css/depot-style.css neutralises that inline pin to position:static !important ONLY
  // while the node lives inside .depot-nav, so it flows in the black chrome band between the
  // PLAY BALL tab and the nav end. Mobile (<=600px) is left exactly as-is: the controls stay
  // in their bundle-owned fixed bottom bar with the measured tab-bar clearance (PR #89).
  // Reads the live <html> via html() (the bundle can replace documentElement).
  var DESKTOP_MQ = (window.matchMedia ? window.matchMedia('(min-width: 601px)') : null);
  function isDesktop() { return DESKTOP_MQ ? DESKTOP_MQ.matches : (window.innerWidth > 600); }

  function syncControlsPlacement() {
    try {
      // The bundle may have re-created the BACK button between renders; keep it suppressed.
      hideBackButton();
      var ctrls = document.getElementById('sim-controls');
      if (!ctrls) { return; } // gameReady() gates mount on #sim-controls; nothing to move yet
      if (isDesktop()) {
        // Dock into the nav's empty middle, before the spacer so it centres in the gap.
        var nav = document.querySelector('.depot-shell .depot-nav');
        if (!nav) { console.warn('[depot] game-shell: .depot-nav missing; leaving #sim-controls on field'); return; }
        if (ctrls.parentElement === nav) { return; } // already docked (idempotent)
        var spacer = nav.querySelector('.spacer');
        if (spacer) { nav.insertBefore(ctrls, spacer); } else { nav.appendChild(ctrls); }
        console.log('[depot] game-shell: docked #sim-controls into the chrome mode-nav (desktop); field/plate untouched');
      } else {
        // Mobile: return the node to its bundle home (<body>) so the fixed bottom bar +
        // measured tab-bar clearance behave exactly as before. Fixed positioning is
        // viewport-relative, so body is the correct, side-effect-free restore target.
        if (ctrls.parentElement && ctrls.parentElement !== document.body) {
          document.body.appendChild(ctrls);
          console.log('[depot] game-shell: restored #sim-controls to bundle bottom bar (mobile)');
        }
      }
    } catch (e) {
      console.warn('[depot] game-shell: syncControlsPlacement threw: ' + e);
    }
  }

  var resizeTimer = null;
  function onResize() {
    if (resizeTimer) { clearTimeout(resizeTimer); }
    resizeTimer = setTimeout(function(){ syncControlsPlacement(); setChromeOffset(); setTabbarOffset(); }, 120);
  }

  function mountShell() {
    html().classList.add('depot-game'); html().classList.add('v2-body');
    ensureStylesheet(); ensureV2Stylesheet(); ensureRedesignAssets();
    if (mounted && document.querySelector('.depot-shell')) {
      assertScope();
      return;
    }

    if (!window.DepotShell) {
      console.warn('[depot] game-shell: window.DepotShell missing (depot-shell.js not loaded); game keeps its bare chrome');
      reveal('depot-game-reveal-fallback');
      styleControls();
      return;
    }
    if (document.querySelector('.depot-shell')) { mounted = true; reveal('depot-game-dressed'); ensureHtmlObserver(); return; }

    window.DepotShell.mount({ el: document.body, active: 'game' });

    var tabs = document.querySelectorAll('.depot-shell .depot-tab');
    for (var i = 0; i < tabs.length; i++) {
      var m = tabs[i].getAttribute('data-mode');
      if (HREF_FIX[m]) { tabs[i].setAttribute('href', HREF_FIX[m]); }
    }

    // Header "+ Add a card" is bundle-relative here (under /game/); repoint to the root binder.
    var addPill = document.querySelector('.depot-shell [data-depot-addcard]');
    if (addPill) { addPill.setAttribute('href', '../index.html#add'); }
    else { console.warn('[depot] game-shell: [data-depot-addcard] pill not found; add-card href not repointed'); }

    // The dedicated in-game BACK button is retired (its destinations now live permanently in
    // the shell nav). Do NOT relocate it into the nav; hide it (re-asserted by the recurring
    // guards per §9) and route its old season-writeback protection through the nav interceptor.
    hideBackButton();
    installNavInterceptor();

    styleControls();
    syncControlsPlacement();
    setChromeOffset();
    setTabbarOffset();
    window.addEventListener('resize', onResize);

    reveal('depot-game-dressed');
    setTimeout(function(){ setChromeOffset(); setTabbarOffset(); }, 0);
    mounted = true;
    ensureHtmlObserver();

    console.log('[depot] game-shell: play-ball screen wearing thin shared shell (active=game); in-game stage untouched');
  }

  var poll = null, obs = null, giveUpAt = Date.now() + 20000;

  function tick() {
    if (gameReady()) {
      mountShell();
      if (mounted && !document.querySelector('.depot-shell')) { mounted = false; mountShell(); }
      // Bundle re-renders can re-add the BACK button after mount; keep it suppressed.
      if (mounted) { hideBackButton(); }
      return;
    }
    if (Date.now() > giveUpAt) {
      if (poll) { clearInterval(poll); poll = null; }
      if (obs) { obs.disconnect(); obs = null; }
      console.warn('[depot] game-shell: game UI (#sim-controls/#stage) never appeared within 20s; shell not mounted. The game itself is bundler-owned and unaffected.');
    }
  }

  // Always-on backup guard: once mounted, re-assert scope on the LIVE <html> whenever it
  // goes missing (belt-and-braces alongside the <html> observer). Idempotent + cheap.
  // Also re-suppresses the BACK button in case the bundle re-created it.
  function watchdog() {
    if (!mounted) { return; }
    if (!html().classList.contains('depot-game') || !document.querySelector('.depot-shell')) {
      mountShell();
      assertScope();
    }
    hideBackButton();
  }

  function boot() {
    ensureStylesheet(); ensureV2Stylesheet(); ensureRedesignAssets();
    if (gameReady()) { mountShell(); }
    obs = new MutationObserver(function () { tick(); if (mounted) { watchdog(); } });
    obs.observe(document.body || html(), { childList: true, subtree: true });
    poll = setInterval(tick, 200);
    setInterval(watchdog, 300);
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

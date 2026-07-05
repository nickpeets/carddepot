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
 * BACK-nav behavior — chrome scope classes + offset only.
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

   var mounted = false;
      var htmlObs = null;
      var observedHtml = null;

   // Always read the LIVE <html> — the bundle can replace it out from under us.
   function html() { return document.documentElement; }
      function reveal(cls) { html().classList.add(cls); }

   // (re)assert the FOUC scope classes on the LIVE <html>; only once the shell exists.
   function assertScope() {
           if (!document.querySelector('.depot-shell')) { return false; }
           var de = html();
           var changed = false;
           if (!de.classList.contains('depot-game')) { de.classList.add('depot-game'); changed = true; }
           if (!de.classList.contains('depot-game-dressed')) { de.classList.add('depot-game-dressed'); changed = true; }
           // The bundle may have swapped <html>; keep the observer pointed at the live node.
        ensureHtmlObserver();
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
                     (document.head || html()).appendChild(link);
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
  // Bar height varies with tab wrap (BACK TO DEPOT / BACK TO SEASON, 390px / 360px), so a
  // hardcoded offset is brittle; same measured-variable pattern as --depot-game-chrome-h.
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


   // --- Desktop-only relocation of the sim controls off the field and into the shell chrome. ---
   // Per Nick's amendment this moves ONLY the floating #sim-controls overlay: the sim, stage,
   // field, plate and panels are never touched. Same node-move-preserves-listeners pattern as the
   // #backToDepot relocation above (reparent the live node; its React/DOM listeners ride along).
   // The bundle inline-styles #sim-controls position:fixed bottom:22px (over home plate at desktop
   // width); css/depot-style.css neutralises that inline pin to position:static !important ONLY
   // while the node lives inside .depot-nav, so it flows in the black chrome band between the
   // PLAY BALL tab and BACK TO SEASON. Mobile (<=600px) is left exactly as-is: the controls stay
   // in their bundle-owned fixed bottom bar with the measured tab-bar clearance (PR #89).
   // Reads the live <html> via html() (the bundle can replace documentElement).
   var DESKTOP_MQ = (window.matchMedia ? window.matchMedia('(min-width: 601px)') : null);
   function isDesktop() { return DESKTOP_MQ ? DESKTOP_MQ.matches : (window.innerWidth > 600); }

   function syncControlsPlacement() {
      try {
         var ctrls = document.getElementById('sim-controls');
         if (!ctrls) { return; } // gameReady() gates mount on #sim-controls; nothing to move yet
         if (isDesktop()) {
            // Dock into the nav's empty middle, before the spacer/BACK so it centres in the gap.
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
           html().classList.add('depot-game');
           ensureStylesheet();
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
   function watchdog() {
           if (!mounted) { return; }
           if (!html().classList.contains('depot-game') || !document.querySelector('.depot-shell')) {
                     mountShell();
                     assertScope();
           }
   }

   function boot() {
           ensureStylesheet();
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

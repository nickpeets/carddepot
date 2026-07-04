/* js/depot-game-shell.js — Session 5 of the reskin; Session 6 robustness fix.
 *
 * Wires the shared shell (css/depot-style.css + js/depot-shell.js) around the GAME
 * screen (game/index.html). Per Nick's locked amendment (DESIGN.md 3.4) the in-game
 * presentation (RBI diamond, field, HUD/scoreboard, MUDCATS/ACORNS nameplates,
 * play-by-play, panels, and the 2000px scaled #stage) is the aesthetic north star and
 * is NOT restyled. Only the shell chrome around the stage + the control styling change.
 *
 * The game is a runtime React BUNDLE: it clears <body>, RESETS the <html> class, and
 * strips the shipped static <link>/<script> during init. So we inject the stylesheet at
 * runtime and mount the shell only once the game UI exists. The bundle can also reset
 * the <html> class AFTER mount (dropping our .depot-game scope class, which unstyles the
 * chrome). Session 6 fix: a bulletproof guard re-asserts the scope classes whenever the
 * shell node exists — driven by a MutationObserver on <html> itself (the previous
 * observer watched <body>, so <html> class resets went unseen) PLUS an always-on
 * interval. This never touches the sim, the stage, its scale transform, the season
 * writeback, or the BACK-nav behavior — chrome scope classes + offset only.
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
    var htmlObs = null;

   function reveal(cls) { docEl.classList.add(cls); }

   // (re)assert the FOUC scope classes; only meaningful once the shell node exists.
   function assertScope() {
         if (!document.querySelector('.depot-shell')) { return false; }
         var changed = false;
         if (!docEl.classList.contains('depot-game')) { docEl.classList.add('depot-game'); changed = true; }
         if (!docEl.classList.contains('depot-game-dressed')) { docEl.classList.add('depot-game-dressed'); changed = true; }
         if (changed) {
                 console.log('[depot] game-shell: re-asserted depot-game(-dressed) after bundler class reset');
                 setChromeOffset();
         }
         return true;
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
                           if (r.top < mid) { bottoms.push(r.bottom); } // ignore the phone bottom-tab nav
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
                 btns[i].classList.add('btn'); // PLAY = gold primary
           if (i > 0) { btns[i].classList.add('ghost'); } // the rest = ghost
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
         docEl.classList.add('depot-game');
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

      // Watch <html> itself: the bundle can reset its class AFTER mount, dropping our scope
      // class (the shell node survives, so an element check alone won't catch it). Re-assert
      // immediately on any <html> class mutation. (Chrome-only; never touches the sim.)
      try {
              if (!htmlObs) {
                        htmlObs = new MutationObserver(function () { assertScope(); });
                        htmlObs.observe(docEl, { attributes: true, attributeFilter: ['class'] });
              }
      } catch (e) { console.warn('[depot] game-shell: html observer failed: ' + e); }

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

   // Always-on backup guard: once mounted, re-assert the scope classes whenever they go
   // missing (belt-and-braces alongside the <html> observer). mountShell() is idempotent.
   function watchdog() {
         if (!mounted) { return; }
         if (!docEl.classList.contains('depot-game') || !document.querySelector('.depot-shell')) {
                 mountShell();
                 assertScope();
         }
   }

   function boot() {
         ensureStylesheet(); // load the shared CSS ASAP so there is no flash of unstyled shell
      if (gameReady()) { mountShell(); }
         obs = new MutationObserver(function () { tick(); if (mounted) { watchdog(); } });
         obs.observe(document.body || docEl, { childList: true, subtree: true });
         poll = setInterval(tick, 200);
         setInterval(watchdog, 400);
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

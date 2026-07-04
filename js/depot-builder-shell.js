/* js/depot-builder-shell.js — Session 4 of the reskin (DESIGN.md IMPLEMENTATION_PLAN).
 *
 * Wires the shared shell (css/depot-style.css + js/depot-shell.js) into the LINEUP
 * BUILDER (game/builder.html). Mounts DepotShell chrome (bunting + header + mode nav,
 * with LINEUP active), relocates the builder's live auth/notif controls into the shell
 * account cluster, moves the login + builder views into the shell stage, and retires the
 * builder's ad-hoc green <header>. This is chrome unification only — the builder body
 * (collection, pitcher box, batting order, PLAY BALL, challenge) is untouched, and the
 * season-divert / buildTeamPayload logic is never referenced here.
 *
 * The builder lives under /game/, so the shell's root-relative nav hrefs are rewritten
 * to page-relative ('../index.html', 'builder.html', '../index.html?season=1',
 * 'index.html') after mount.
 *
 * FOUC guard (mirrors the Season fix, PR #72): the builder reskins on DOMContentLoaded,
 * so between first paint and mount the raw (green-era) content would flash. We arm the
 * hide-until-dressed CSS immediately at script-eval by marking <html class="depot-builder">
 * (builder-only, so no other page is affected); css/depot-style.css keeps #loginView /
 * #builderView / the old <header> invisible while dressing is pending. The page's navy
 * body background still paints, so there is no blank/white flash. On successful mount we
 * add .depot-builder-dressed to reveal. A one-shot 3s fail-loud fallback adds
 * .depot-builder-reveal-fallback (+ a [depot] warn) so a broken mount can never leave the
 * screen blank. Every guard bails loud, per AGENTS.md §4.
 *
 * Additive-first + fail-loud per AGENTS.md: every early return logs why, tagged [depot].
 * Node moves (appendChild) preserve existing event listeners, so the builder's app JS
 * keeps working after relocation.
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

  // Arm the FOUC hide immediately (synchronously, before DOMContentLoaded). This class
  // scopes the hide-until-dressed CSS to the builder page only. If any script below
  // never reveals, the 3s fail-loud fallback (armReveal) guarantees the content shows.
  docEl.classList.add('depot-builder');

  var revealTimer = null;
  function reveal(cls) {
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    docEl.classList.add(cls);
  }
  function armReveal() {
    if (revealTimer) { return; }
    if (docEl.classList.contains('depot-builder-dressed')) { return; }
    revealTimer = setTimeout(function () {
      revealTimer = null;
      if (!docEl.classList.contains('depot-builder-dressed')) {
        docEl.classList.add('depot-builder-reveal-fallback');
        console.warn('[depot] builder-shell: reveal fallback — builder not dressed within 3s; revealing raw content so the screen is not left blank (shell mount hook may have failed)');
      }
    }, 3000);
  }

  function init() {
    // Fallback is armed for every path: if we bail before dressing, the 3s timer reveals
    // the builder's ad-hoc chrome rather than leaving a blank navy screen.
    armReveal();

    if (!window.DepotShell) {
      console.warn('[depot] builder-shell: window.DepotShell missing (depot-shell.js not loaded); builder keeps its ad-hoc chrome');
      reveal('depot-builder-reveal-fallback');
      return;
    }
    if (document.querySelector('.depot-shell')) {
      console.warn('[depot] builder-shell: shell already mounted; skipping');
      reveal('depot-builder-dressed');
      return;
    }

    window.DepotShell.mount({ el: document.body, active: 'builder' });

    var stage = window.DepotShell.stageEl();
    if (!stage) {
      console.warn('[depot] builder-shell: shell stage missing after mount; aborting relocate');
      reveal('depot-builder-reveal-fallback');
      return;
    }

    var tabs = document.querySelectorAll('.depot-shell .depot-tab');
    for (var i = 0; i < tabs.length; i++) {
      var m = tabs[i].getAttribute('data-mode');
      if (HREF_FIX[m]) { tabs[i].setAttribute('href', HREF_FIX[m]); }
    }

    ['loginView', 'builderView'].forEach(function (id) {
      var v = document.getElementById(id);
      if (v) { stage.appendChild(v); }
      else { console.warn('[depot] builder-shell: #' + id + ' not found to relocate'); }
    });

    var acct = document.querySelector('.depot-shell .depot-account');
    if (acct) {
      ['notifWrap', 'whoami', 'logoutBtn'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { acct.appendChild(el); }
        else { console.warn('[depot] builder-shell: #' + id + ' not found to relocate'); }
      });
    } else {
      console.warn('[depot] builder-shell: .depot-account cluster missing; auth controls stay in old header');
    }

    var oldHeader = document.querySelector('body > header');
    if (oldHeader) { oldHeader.style.display = 'none'; }
    else { console.warn('[depot] builder-shell: ad-hoc <header> not found to retire'); }

    // Dressing complete — reveal the shell (FOUC guard), and cancel the fail-loud timer.
    reveal('depot-builder-dressed');

    console.log('[depot] builder-shell: lineup builder wearing shared shell (active=builder)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

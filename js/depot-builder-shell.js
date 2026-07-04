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

  function init() {
    if (!window.DepotShell) {
      console.warn('[depot] builder-shell: window.DepotShell missing (depot-shell.js not loaded); builder keeps its ad-hoc chrome');
      return;
    }
    if (document.querySelector('.depot-shell')) {
      console.warn('[depot] builder-shell: shell already mounted; skipping');
      return;
    }

    window.DepotShell.mount({ el: document.body, active: 'builder' });

    var stage = window.DepotShell.stageEl();
    if (!stage) {
      console.warn('[depot] builder-shell: shell stage missing after mount; aborting relocate');
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

    console.log('[depot] builder-shell: lineup builder wearing shared shell (active=builder)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

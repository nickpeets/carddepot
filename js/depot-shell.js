/* js/depot-shell.js — Card Depot shared shell component (Session 1 of the reskin).
 *
 * Renders the persistent chrome frame worn by all four modes: bunting strip,
 * header (wordmark + franchise identity + account cluster) and the mode nav
 * (THE BINDER / LINEUP / SEASON / PLAY BALL). Static-friendly: no build step, no
 * framework. Include this script + css/depot-style.css on any page and call
 * window.DepotShell.mount(...).
 *
 * Data: franchise name + season record come from depot-core (window.depotSB() +
 * window.depotUserCached / window.depotUser()). Graceful anonymous fallback when
 * signed out or when depot-core / DB is unavailable. Fail-loud [depot] logging per
 * AGENTS.md - every early return says why.
 *
 * Schema (see game/season.js):
 *   franchises(id, owner_id, team_name, ...)
 *   seasons(id, owner_id, franchise_id, status, games_total, wins, losses, ...)
 *
 * Wiring status: NOT wired into any real page yet (Sessions 2-5 do that). Session 1
 * verifies it standalone via shell-preview.html.
 *
 * Public API (window.DepotShell):
 *   mount({ el, active, wordmark })  -> injects shell chrome into `el` (or <body>)
 *   setFranchise({ name, wins, losses })  -> render identity block
 *   setAnonymous()                        -> collapse identity to a LOG IN affordance
 *   setActive(mode)                       -> highlight the active mode tab
 *   refreshFranchise()                    -> re-resolve franchise/record from depot-core
 */
(function () {
  'use strict';

  var TABS = [
    { mode: 'binder',  label: 'THE BINDER', href: 'index.html' },
    { mode: 'builder', label: 'LINEUP',     href: 'game/builder.html' },
    { mode: 'season',  label: 'SEASON',     href: 'index.html?season=1' },
    { mode: 'game',    label: 'PLAY BALL',  href: 'game/index.html' }
  ];

  var _root = null;   // the .depot-shell element we manage
  var _mounted = false;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c]; }); }

  function tabsHtml(active){
    var html = '';
    for (var i = 0; i < TABS.length; i++){
      var t = TABS[i];
      var on = (t.mode === active);
      html += '<a class="depot-tab" data-mode="' + t.mode + '" href="' + t.href + '"' +
              (on ? ' aria-current="true"' : '') + '>' + esc(t.label) + '</a>';
    }
    return html;
  }

  function shellHtml(opts){
    var wordmark = opts.wordmark || 'THE <b>DEPOT</b>';
    return '' +
      '<div class="depot-bunting" aria-hidden="true"></div>' +
      '<div class="depot-shell">' +
        '<header class="depot-shell__header">' +
          '<div class="depot-wordmark">' + wordmark + '</div>' +
          '<div class="depot-franchise is-anon" data-depot-franchise>' +
            '<span class="name">LOG IN</span>' +
            '<span class="record"></span>' +
          '</div>' +
          '<div class="depot-account" data-depot-account>' +
            '<span class="depot-bell" aria-hidden="true">&#9679;</span>' +
            '<span class="email" data-depot-email></span>' +
          '</div>' +
        '</header>' +
        '<nav class="depot-nav" data-depot-nav>' + tabsHtml(opts.active) +
          '<span class="spacer"></span>' +
        '</nav>' +
        '<main class="depot-stage" data-depot-stage></main>' +
      '</div>';
  }

  function q(sel){ return _root ? _root.querySelector(sel) : null; }

  function setActive(mode){
    if (!_root){ console.warn('[depot] shell.setActive: shell not mounted; ignoring'); return; }
    var tabs = _root.querySelectorAll('.depot-tab');
    for (var i = 0; i < tabs.length; i++){
      var on = (tabs[i].getAttribute('data-mode') === mode);
      if (on){ tabs[i].setAttribute('aria-current', 'true'); }
      else { tabs[i].removeAttribute('aria-current'); }
    }
  }

  function setFranchise(info){
    var box = q('[data-depot-franchise]');
    if (!box){ console.warn('[depot] shell.setFranchise: no identity block (not mounted?)'); return; }
    info = info || {};
    if (!info.name){
      console.warn('[depot] shell.setFranchise: no franchise name given; staying anonymous');
      return setAnonymous();
    }
    var w = (info.wins == null) ? 0 : info.wins;
    var l = (info.losses == null) ? 0 : info.losses;
    box.classList.remove('is-anon');
    box.querySelector('.name').textContent = String(info.name).toUpperCase();
    box.querySelector('.record').textContent = w + '-' + l;
  }

  function setAnonymous(){
    var box = q('[data-depot-franchise]');
    if (!box){ console.warn('[depot] shell.setAnonymous: no identity block'); return; }
    box.classList.add('is-anon');
    box.querySelector('.name').textContent = 'LOG IN';
    box.querySelector('.record').textContent = '';
    var email = q('[data-depot-email]');
    if (email){ email.textContent = ''; }
  }

  // Resolve franchise name + W-L from depot-core. Fail-loud, anonymous fallback.
  function refreshFranchise(){
    if (typeof window.depotSB !== 'function'){
      console.warn('[depot] shell: window.depotSB missing (depot-core not loaded); anonymous shell');
      setAnonymous();
      return Promise.resolve(null);
    }
    var sb = window.depotSB();
    if (!sb){
      console.warn('[depot] shell: depotSB() returned no client; anonymous shell');
      setAnonymous();
      return Promise.resolve(null);
    }
    var userP = (window.depotUserCached)
      ? Promise.resolve(window.depotUserCached)
      : (typeof window.depotUser === 'function' ? window.depotUser() : Promise.resolve(null));
    return userP.then(function (user){
      if (!user){
        console.warn('[depot] shell: no signed-in user; anonymous shell');
        setAnonymous();
        return null;
      }
      var email = q('[data-depot-email]');
      if (email && user.email){ email.textContent = user.email; }
      return sb.from('franchises').select('id,team_name')
        .eq('owner_id', user.id).order('created_at', { ascending: false }).limit(1)
        .then(function (fr){
          if (fr.error){ console.warn('[depot] shell: franchises query failed:', fr.error.message); setAnonymous(); return null; }
          var row = (fr.data && fr.data[0]) ? fr.data[0] : null;
          if (!row){ console.warn('[depot] shell: no franchise row for user; anonymous shell'); setAnonymous(); return null; }
          return sb.from('seasons').select('wins,losses,status')
            .eq('owner_id', user.id).eq('franchise_id', row.id).eq('status', 'active')
            .order('created_at', { ascending: false }).limit(1)
            .then(function (se){
              if (se.error){ console.warn('[depot] shell: seasons query failed:', se.error.message); }
              var srow = (se.data && se.data[0]) ? se.data[0] : null;
              if (!srow){ console.warn('[depot] shell: no active season for franchise; record defaults 0-0'); }
              setFranchise({
                name: row.team_name || 'MY CLUB',
                wins: srow ? srow.wins : 0,
                losses: srow ? srow.losses : 0
              });
              return { name: row.team_name, wins: srow ? srow.wins : 0, losses: srow ? srow.losses : 0 };
            });
        });
    }).catch(function (e){
      console.warn('[depot] shell: refreshFranchise threw:', e);
      setAnonymous();
      return null;
    });
  }

  // Session 6 — active-tile carry: paint the clicked mode tab active BEFORE the browser
// navigates, so the destination page opens with that tile already lit (no flash of the
// old active state across the load). Chrome-only, presentation; never blocks navigation
// (the <a href> still follows normally). Fail-loud per AGENTS.md.
function attachNavCarry(root){
    if (!root){ console.warn('[depot] shell.attachNavCarry: no shell root; carry disabled'); return; }
    var nav = root.querySelector('[data-depot-nav]');
    if (!nav){ console.warn('[depot] shell.attachNavCarry: no [data-depot-nav]; carry disabled'); return; }
    nav.addEventListener('click', function (e){
        var tab = e.target && e.target.closest ? e.target.closest('.depot-tab') : null;
        if (!tab){ return; }
        var mode = tab.getAttribute('data-mode');
        if (!mode){ console.warn('[depot] shell nav carry: clicked tab has no data-mode; not carrying'); return; }
        setActive(mode); // light the destination tab now; navigation proceeds normally
    });
}

function mount(opts){
    opts = opts || {};
    var el = opts.el || document.body;
    if (!el){ console.warn('[depot] shell.mount: no target element and no document.body; aborting'); return null; }
    if (_mounted){ console.warn('[depot] shell.mount: already mounted; ignoring second mount'); return _root; }
    el.insertAdjacentHTML('afterbegin', shellHtml({ active: opts.active, wordmark: opts.wordmark }));
    _root = el.querySelector('.depot-shell');
    _mounted = true;
    attachNavCarry(_root);
    console.log('[depot] depot-shell mounted (active=' + (opts.active || 'none') + ')');
    // Auto-resolve franchise/record unless caller opts out.
    if (opts.autoFranchise !== false){ refreshFranchise(); }
    return _root;
  }

  window.DepotShell = {
    mount: mount,
    setFranchise: setFranchise,
    setAnonymous: setAnonymous,
    setActive: setActive,
    refreshFranchise: refreshFranchise,
    stageEl: function(){ return q('[data-depot-stage]'); }
  };

  console.log('[depot] depot-shell.js loaded');
})();

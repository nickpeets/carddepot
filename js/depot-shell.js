/* js/depot-shell.js — Card Depot shared shell component (Session 1 of the reskin).
 *
 * Renders the persistent chrome frame worn by all four modes: bunting strip,
 * header (wordmark + franchise identity + account cluster) and the mode nav
 * (THE BINDER / PACK SHOP / PLAY BALL). Static-friendly: no build step, no
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

  // Depth-correct base for nav hrefs: '../' when running from a /game/ subpage, else ''.
  function navBase(){ try { return /\/game\//.test(location.pathname) ? '../' : ''; } catch(e){ return ''; } }

  var TABS = [
  { mode: 'binder', label: 'Binder',      short: 'Binder', href: 'index.html' },
  { mode: 'shop',   label: 'Pack Shop',   short: 'Shop',   href: 'game/shop.html' },
  { mode: 'game',   label: 'Play Ball',   short: 'Play',   href: 'game/index.html' },
  /* Chapter 14 is roadmap. The label ships anyway - a nav that hides a surface
     teaches nothing; marketplace.html answers with a DESIGNED coming-soon. */
  { mode: 'market', label: 'Marketplace', short: 'Market', href: 'marketplace.html' },
  /* VS: the nextgen hub tile promoted to a first-class mode. The surface is
     real - challenges, stakes, play, settlement - so the pill is live, not a
     designed coming-soon like Marketplace. */
  { mode: 'vs', label: 'VS', short: 'VS', href: 'vs.html' }
];

  // Task C: the nav row carries the page title, the mode pills and the green
  // add-a-card action -- one header language on every surface.
  var TITLES = { binder: 'The Binder', shop: 'Pack Shop', game: 'Play Ball', builder: 'Lineup', market: 'Marketplace', vs: 'VS' };
  function titleFor(mode){ return TITLES[mode] || 'The Depot'; }

/* Chapter 09 is reached THROUGH Play Ball, and rule 7 says the active gold pill
   names the surface - so a mode with no pill of its own lights its parent-s. */
var PILL_FOR = { builder: 'game' };
function pillFor(mode){ return PILL_FOR[mode] || mode; }

  var _root = null;   // the .depot-shell element we manage
  var _mounted = false;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c]; }); }

  function tabsHtml(active){
    var html = '';
    for (var i = 0; i < TABS.length; i++){
      var t = TABS[i];
      var on = (t.mode === pillFor(active));
      html += '<a class="depot-tab v2-pill' + (t.mode === 'game' ? ' v2-pill--orange' : '') + '" data-mode="' + t.mode + '" href="' + navBase() + t.href + '"' +
              (on ? ' aria-current="true"' : '') +
      /* 01b shortens the labels on the 390 strip so four fit without a scroller */
      ' data-rd-short="' + esc(t.short || t.label) + '">' + esc(t.label) + '</a>';
    }
    return html;
  }

  function shellHtml(opts){
    var wordmark = opts.wordmark || 'THE <b>DEPOT</b>';
    return '' +
      '<div class="depot-shell">' +
        '<header class="depot-shell__header v2-header">' +
          '<div class="v2-logo-tile" aria-hidden="true">D</div>' +
        '<div class="v2-wordmark-wrap">' +
          '<div class="depot-wordmark v2-wordmark">' + wordmark + '</div>' +
          '<div class="v2-subtitle" data-depot-subtitle></div>' +
        '</div>' +
      '<span class="v2-spacer" aria-hidden="true"></span>' +
          '<div class="depot-account v2-account" data-depot-account>' +
            '<span class="depot-bell" aria-hidden="true">&#9679;</span>' +
            '<span class="email" data-depot-email></span>' +
            '<button type="button" class="auth-btn depot-logout" data-depot-logout style="display:none">Log out</button>' +
          '</div>' +
        '</header>' +
        '<nav class="depot-nav v2-nav" data-depot-nav>' +
        '<span class="v2-nav-title" data-depot-navtitle>' + esc(titleFor(opts.active)) + '</span>' +
        tabsHtml(opts.active) +
        '<span class="spacer"></span>' +
        '<a class="v2-nav-add v2-pill v2-pill--green v2-pill--sm depot-add-card" data-depot-addcard' +
        ' href="' + navBase() + 'index.html#add">+ Add a card</a>' +
        '</nav>' +
        '<main class="depot-stage" data-depot-stage></main>' +
      '</div>';
  }

  function q(sel){ return _root ? _root.querySelector(sel) : null; }

  function setActive(mode){
    if (!_root){ console.warn('[depot] shell.setActive: shell not mounted; ignoring'); return; }
    _root.setAttribute('data-depot-active', (mode || 'binder'));
    var _t = _root.querySelector('[data-depot-navtitle]');
    if (_t){ _t.textContent = titleFor(mode || 'binder'); }
    else { console.warn('[depot] shell.setActive: no [data-depot-navtitle]; title not repainted'); }
    var tabs = _root.querySelectorAll('.depot-tab');
    for (var i = 0; i < tabs.length; i++){
      var on = (tabs[i].getAttribute('data-mode') === pillFor(mode));
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
    var _pfx = info.recordPrefix ? String(info.recordPrefix) : '';
box.querySelector('.record').textContent = w + '-' + l;
        var _seasonEl = box.querySelector('[data-depot-season]');
        if (_seasonEl){ var _sn = _pfx ? _pfx.replace(/[^0-9]/g, '') : ''; _seasonEl.textContent = _sn ? ('S' + _sn) : ''; /* ch01: the bar reads S1, not SEASON 1 */ }
        else { console.warn('[depot] shell.setFranchise: no [data-depot-season] in plate; season label skipped'); }
        var _streakEl = box.querySelector('[data-depot-streak]');
        if (_streakEl){
                  var _stk = (info.streak != null) ? String(info.streak) : '';
                  if (typeof _stk === 'string') _stk = _stk.replace(/(\uD83D\uDD25\s*){2,}$/u, '\uD83D\uDD25');
                  if (_stk){ _streakEl.textContent = _stk + ' \uD83D\uDD25'; _streakEl.classList.remove('is-empty'); }
                  else { _streakEl.textContent = ''; _streakEl.classList.add('is-empty'); }
        } else { console.warn('[depot] shell.setFranchise: no [data-depot-streak] in plate; streak chip skipped'); }
        }

  function setAnonymous(){
    var box = q('[data-depot-franchise]');
    if (!box){ console.warn('[depot] shell.setAnonymous: no identity block'); return; }
    box.classList.add('is-anon');
    box.querySelector('.name').textContent = 'LOG IN';
    box.querySelector('.record').textContent = '';
    var _sEl = box.querySelector('[data-depot-season]'); if (_sEl){ _sEl.textContent = ''; }
      var _kEl = box.querySelector('[data-depot-streak]'); if (_kEl){ _kEl.textContent = ''; _kEl.classList.add('is-empty'); }
    var email = q('[data-depot-email]');
    if (email){ email.textContent = ''; }
  }

      // Resolve franchise name + hybrid record from depot-core (single source of truth).
      // Returns Promise<{name,wins,losses,recordPrefix,email}|null>. NO DOM writes here
      // so both the shop/binder shell AND the season-page identity block derive record
      // the same way ("apply the rule in ONE place"). Fail-loud, anonymous -> null.
      function resolveRecord(){
        if (typeof window.depotSB !== 'function'){
          console.warn('[depot] shell: window.depotSB missing (depot-core not loaded); anonymous shell');
          return Promise.resolve(null);
        }
        var sb = window.depotSB();
        if (!sb){
          console.warn('[depot] shell: depotSB() returned no client; anonymous shell');
          return Promise.resolve(null);
        }
        var userP = (window.depotUserCached)
          ? Promise.resolve(window.depotUserCached)
          : (typeof window.depotUser === 'function' ? window.depotUser() : Promise.resolve(null));
        return userP.then(function (user){
          if (!user){ return null; }
          // [record-integrity] franchise comes from the SHARED resolver (depot-core
          // depotFranchise, OLDEST-first) — season.js plays under the oldest row, so
          // reading the newest here (the old `ascending:false`) could paint another
          // club's record. Fallback keeps this file self-sufficient if core is stale,
          // but with the SAME ordering as gameplay.
          var franP = (typeof window.depotFranchise === 'function')
            ? window.depotFranchise()
            : sb.from('franchises').select('id,team_name').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
                .then(function (fr){
                  if (fr.error){ console.warn('[depot] shell: franchises query failed:', fr.error.message); return null; }
                  return (fr.data && fr.data[0]) ? fr.data[0] : null;
                });
          return franP
            .then(function (row){
              if (!row){ console.warn('[depot] shell: no franchise row for user; anonymous shell'); return null; }
              // Hybrid record: ACTIVE season once it has games played; else the most-recent
              // COMPLETED season, so a fresh 0-0 campaign doesn't erase the standing record.
              return sb.from('seasons').select('id,wins,losses,status,created_at').eq('owner_id', user.id).eq('franchise_id', row.id).order('created_at', { ascending: true })
                .then(function (se){
                  if (se.error){ console.warn('[depot] shell: seasons query failed:', se.error.message); }
                  var rows = (se.data && se.data.length) ? se.data : [];
                  for (var k = 0; k < rows.length; k++){ rows[k]._ord = k + 1; }
                  // [record-integrity] the displayed W-L is COUNTED from season_games,
                  // not read from seasons.wins/losses. Those columns are denormalized
                  // counters maintained client-side by read-then-write (season.js
                  // recordSeasonResult) \u2014 the \u00a74-banned pattern \u2014 so they can drift
                  // silently. Counting the game rows is always true. The stored
                  // counters remain only as the fallback when this query fails, and
                  // any stored-vs-counted disagreement is logged as drift.
                  var ids = [];
                  for (var i2 = 0; i2 < rows.length; i2++){ ids.push(rows[i2].id); }
                  var countP = ids.length
                    ? sb.from('season_games').select('season_id,result').eq('owner_id', user.id).in('season_id', ids)
                    : Promise.resolve({ data: [] });
                  return countP.then(function (sg){
                    var counted = {};
                    if (sg.error){
                      console.warn('[depot] shell: season_games count failed (' + sg.error.message + '); record falls back to stored seasons counters');
                    } else {
                      var list = sg.data || [];
                      for (var j = 0; j < list.length; j++){
                        var g = list[j];
                        var c = counted[g.season_id] || (counted[g.season_id] = { wins: 0, losses: 0 });
                        if (g.result === 'win'){ c.wins++; }
                        else if (g.result === 'loss'){ c.losses++; }
                      }
                      for (var d = 0; d < rows.length; d++){
                        var r2 = rows[d], cd = counted[r2.id];
                        if (cd && (((r2.wins|0) !== cd.wins) || ((r2.losses|0) !== cd.losses))){
                          console.warn('[depot] shell: RECORD DRIFT on season', r2.id,
                            '- stored ' + (r2.wins|0) + '-' + (r2.losses|0),
                            'vs counted ' + cd.wins + '-' + cd.losses,
                            '(displaying counted; stored counter needs repair)');
                        }
                      }
                    }
                    var wl = function (r){
                      var c2 = r ? counted[r.id] : null;
                      return c2 ? c2 : { wins: (r ? r.wins|0 : 0), losses: (r ? r.losses|0 : 0) };
                    };
                    var active = null, m;
                    for (m = rows.length - 1; m >= 0; m--){ if (rows[m].status === 'active'){ active = rows[m]; break; } }
                    var lastComplete = null;
                    for (m = rows.length - 1; m >= 0; m--){ if (rows[m].status === 'complete'){ lastComplete = rows[m]; break; } }
                    var played = function (r){ var x = wl(r); return r ? x.wins + x.losses : 0; };
                    var srow = null, prefix = '';
                    if (active && played(active) > 0){ srow = active; }
                    else if (lastComplete){ srow = lastComplete; prefix = 'S' + lastComplete._ord + ' \u00b7 '; }
                    else if (active){ srow = active; }
                    if (!srow){ console.warn('[depot] shell: no season for franchise; record defaults 0-0'); }
                    var rec = wl(srow);
                    return { name: row.team_name || 'MY CLUB', wins: srow ? rec.wins : 0, losses: srow ? rec.losses : 0, recordPrefix: prefix, email: user.email || '' };
                  });
                });
            });
        });
      }
      // Shop/binder header: derive via resolveRecord, then paint the shared shell chrome.
      function refreshFranchise(){
        return resolveRecord().then(function (rec){
          paintAccount(); // email + Log out follow the USER, not the franchise row
          if (!rec){ setAnonymous(); return null; }
          var email = q('[data-depot-email]');
          if (email && rec.email){ email.textContent = rec.email; }
          setFranchise({ name: rec.name || 'MY CLUB', wins: rec.wins, losses: rec.losses, recordPrefix: rec.recordPrefix });
          return rec;
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

// ---- account cluster: ONE email + Log out treatment on every surface -------
// Task 5 (fix/subset-name-stats). The four surfaces used to render this three
// different ways: the binder relocated its own .auth-btn Log out into the
// cluster and inherited index.html's pixel body font; the lineup builder
// relocated a .btn-ghost one plus its own #whoami; the pack shop and Play Ball
// rendered no control at all, just an email in the body font. The cluster is
// now shell-owned markup on all four, styled once in css/depot-style.css
// (.depot-account .email / .depot-account .auth-btn), and the click DELEGATES
// to whatever handler that page has already live-verified. Fail-loud per
// AGENTS.md - every bail says which control was missing.
function accountBtn(){ return q('[data-depot-logout]'); }

function shellLogout(){
  var owned = document.getElementById('authLogoutBtn') || document.getElementById('logoutBtn');
  if (owned && owned !== accountBtn() && typeof owned.click === 'function'){
    console.log('[depot] shell: Log out delegating to #' + owned.id);
    owned.click();
    return;
  }
  if (window.DepotAuth && typeof window.DepotAuth.logout === 'function'){ window.DepotAuth.logout(); return; }
  if (typeof window.depotSB !== 'function'){ console.warn('[depot] shell: Log out has no page handler and no window.depotSB; nothing happened'); return; }
  var sb = window.depotSB();
  if (!sb || !sb.auth){ console.warn('[depot] shell: Log out found no supabase client; nothing happened'); return; }
  sb.auth.signOut().catch(function (e){ console.warn('[depot] shell: signOut threw:', e); });
}

// Email + Log out track the USER, not the franchise. setFranchise/setAnonymous
// speak only for the identity plate, and a signed-in collector with no
// franchise row still owns their account cluster.
function paintAccount(){
  var em = q('[data-depot-email]'), btn = accountBtn();
  if (!em && !btn){ console.warn('[depot] shell.paintAccount: no account cluster mounted; nothing to paint'); return Promise.resolve(null); }
  var userP = (window.depotUserCached)
    ? Promise.resolve(window.depotUserCached)
    : (typeof window.depotUser === 'function' ? window.depotUser() : Promise.resolve(null));
  return Promise.resolve(userP).then(function (user){
    if (em){ em.textContent = user ? (user.email || '') : ''; }
    else { console.warn('[depot] shell.paintAccount: no [data-depot-email] span; email not painted'); }
    if (btn){ btn.style.display = user ? '' : 'none'; }
    else { console.warn('[depot] shell.paintAccount: no [data-depot-logout] button; Log out not shown'); }
    return user || null;
  }).catch(function (e){ console.warn('[depot] shell.paintAccount: user lookup threw:', e); return null; });
}

function mount(opts){
    opts = opts || {};
    var el = opts.el || document.body;
    if (!el){ console.warn('[depot] shell.mount: no target element and no document.body; aborting'); return null; }
    if (_mounted){ console.warn('[depot] shell.mount: already mounted; ignoring second mount'); return _root; }
    el.insertAdjacentHTML('afterbegin', shellHtml({ active: opts.active, wordmark: opts.wordmark }));
    _root = el.querySelector('.depot-shell');
    if (_root) { _root.setAttribute('data-depot-active', (opts.active || 'binder')); }
    _mounted = true;
    attachNavCarry(_root);
    var _lo = accountBtn();
    if (_lo){ _lo.addEventListener('click', shellLogout); }
    else { console.warn('[depot] shell.mount: no [data-depot-logout] in the account cluster; this surface has no Log out'); }
    paintAccount();
    console.log('[depot] depot-shell mounted (active=' + (opts.active || 'none') + ')');
    // Auto-resolve franchise/record unless caller opts out.
    if (opts.autoFranchise !== false){ refreshFranchise(); }
    return _root;
    try {
      var __coinHost = el && el.querySelector ? el.querySelector('.dw-mount[data-depot-wallet]') : null;
      if (__coinHost && window.DepotWallet && DepotWallet.mountChip) DepotWallet.mountChip(__coinHost);
    } catch(e){ console.error('[shell] coin mount failed', e); }
  }

  window.DepotShell = {
    mount: mount,
    setFranchise: setFranchise,
    setAnonymous: setAnonymous,
    setActive: setActive,
    refreshFranchise: refreshFranchise,
    paintAccount: paintAccount,
    resolveRecord: resolveRecord,
    stageEl: function(){ return q('[data-depot-stage]'); }
  };

  console.log('[depot] depot-shell.js loaded');
})();

/* ============================================================================
 * depot-season-shell.js - Session 3: wrap the Season overlay in the shared shell
 *
 * ADDITIVE / PRESENTATION ONLY. Does NOT touch season.js logic or index.html's
 * season render code. When #depotSeasonView opens and its schedule has rendered,
 * this reparents the existing season nodes (record / schedule / play-next / msg -
 * listeners preserved, never recreated) into the shared shell chrome (bunting +
 * header + mode-nav w/ SEASON active + stage) and applies css/season.css classes
 * so the screen matches mockups/season.html. Franchise + record come from the
 * already-rendered nodes; anonymous degrades to a LOG IN affordance. Fail-loud.
 * ==========================================================================*/
(function(){
  "use strict";
  var VIEW_ID = 'depotSeasonView';
  function log(m){ try { (window.depotLog||function(){})('[depot] season-shell: ' + m); } catch(e){} }
  function warn(m){ try { console.warn('[depot] season-shell: ' + m); } catch(e){} }
  function readIdentity(){
    var name = 'MY CLUB', anon = false, email = '';
    try {
      var teamEl = document.getElementById('depotSeasonTeam');
      if (teamEl && teamEl.textContent) { name = teamEl.textContent.split(/[\u2014\u2013-]/)[0].trim() || 'MY CLUB'; }
      var frBlock = document.querySelector('.depot-shell .depot-franchise');
      if (frBlock && /log ?in/i.test(frBlock.textContent)) anon = true;
      var emEl = document.querySelector('.depot-shell .depot-account .email');
      if (emEl) email = emEl.textContent.trim();
    } catch(e){ warn('readIdentity threw: ' + e); }
    return { name: name, anon: anon, email: email };
  }
  function parseRecord(){
    var recEl = document.getElementById('depotSeasonRecord');
    var t = (recEl ? recEl.textContent : '').replace(/[^0-9]+/g, ' ').trim().split(/\s+/);
    var wins = parseInt(t[0] || '0', 10) || 0;
    var losses = parseInt(t[1] || '0', 10) || 0;
    return { wins: wins, losses: losses };
  }
  function classifyGames(schedEl){
    if (!schedEl) return;
    var rows = schedEl.children, i;
    for (i = 0; i < rows.length; i++){
      var row = rows[i];
      row.className = 'tile season-game';
      row.removeAttribute('style');
      var spans = row.querySelectorAll('span');
      var j; for (j = 0; j < spans.length; j++){ spans[j].removeAttribute('style'); }
      var resSpan = spans.length ? spans[spans.length - 1] : null;
      var res = resSpan ? resSpan.textContent.trim() : '';
      if (/^W\b/i.test(res)) row.classList.add('is-active');
      else if (/^L\b/i.test(res)) row.classList.add('is-loss');
      else if (/NEXT/i.test(res)) row.classList.add('is-next');
      else row.classList.add('is-pending');
      if (resSpan) resSpan.classList.add('season-res');
    }
  }
  function buildShell(view){
    var id = readIdentity();
    var rec = parseRecord();
    var wins = rec.wins, losses = rec.losses;
    var played = wins + losses, total = 8, remain = Math.max(0, total - played);
    var recEl = document.getElementById('depotSeasonRecord');
    var schedEl = document.getElementById('depotSeasonSched');
             var playBtn = document.getElementById('depotSeasonPlayNext');
    var msgEl = document.getElementById('depotSeasonMsg');
    var closeBtn = document.getElementById('depotSeasonClose');
    var keep = document.createDocumentFragment();
    [recEl, schedEl, playBtn, msgEl, closeBtn].forEach(function(n){ if (n) keep.appendChild(n); });
    view.classList.add('depot-season');
    view.removeAttribute('style');
    view.style.position = 'fixed'; view.style.inset = '0'; view.style.zIndex = '9000';
    view.style.overflow = 'auto'; view.style.background = 'var(--depot-navy-bg)';
    view.innerHTML = '';
    // Bunting strip RETIRED: the v2 nav replaced the Session-1 shell chrome, and
    // the pinstripe read as a stray multicolored bar under the new nav.
    var shell = document.createElement('div'); shell.className = 'depot-shell';
    view.appendChild(shell);
    var franchiseBlock = id.anon ? '<div class="depot-franchise"><span class="name"><a class="btn ghost" href="#" style="min-height:0;padding:6px 10px">LOG IN</a></span></div>' : '<div class="depot-franchise"><span class="name"></span><span class="record"></span></div>';
    var header = document.createElement('header'); header.className = 'depot-shell__header';
    header.innerHTML = '<div class="depot-wordmark">THE <b>DEPOT</b></div>' + franchiseBlock + '<div class="depot-account"></div>';
    shell.appendChild(header);
    if (!id.anon){
      var nm = header.querySelector('.depot-franchise .name');
      var rc = header.querySelector('.depot-franchise .record');
      if (nm) nm.textContent = id.name;
        // IDENTITY BLOCK record: use the shared shell's HYBRID record (single source
        // of truth in depot-shell.js resolveRecord), so the header chrome reads the
        // same everywhere ("S1 · 8-0" fallback; bare live record once season 2 has
        // games). Seed with the on-screen record for zero-flash, then reconcile async.
        // The PLAY SURFACE (scoreboard chip / "through N games" / schedule) is NOT
        // touched here - it keeps showing whatever season.js has open.
        if (rc){
          rc.textContent = wins + '-' + losses;
          try {
            if (window.DepotShell && typeof window.DepotShell.resolveRecord === 'function'){
              window.DepotShell.resolveRecord().then(function (r){
                if (r){ rc.textContent = (r.recordPrefix || '') + r.wins + '-' + r.losses; }
              }).catch(function (e){ warn('resolveRecord for season header threw: ' + e); });
            }
          } catch (e){ warn('resolveRecord wiring threw: ' + e); }
        }
      var acct = header.querySelector('.depot-account');
      if (acct){
        var bell = document.createElement('span'); bell.className = 'depot-bell'; bell.setAttribute('aria-hidden','true'); bell.textContent = '\u25cf';
        var em = document.createElement('span'); em.className = 'email'; em.textContent = id.email;
        var lo = document.createElement('button'); lo.className = 'auth-btn'; lo.type = 'button'; lo.textContent = 'Log out';
        lo.addEventListener('click', function(){ try { if (window.DepotAuth && DepotAuth.logout) DepotAuth.logout(); } catch(e){ warn('logout threw: ' + e); } });
        acct.appendChild(bell); acct.appendChild(em); acct.appendChild(lo);
      }
    } else {
      var loginA = header.querySelector('.depot-franchise a');
      if (loginA) loginA.addEventListener('click', function(ev){ ev.preventDefault(); try { if (window.DepotAuth && DepotAuth.openModal) DepotAuth.openModal(); } catch(e){ warn('openModal threw: ' + e); } });
    }
    var nav = document.createElement('nav'); nav.className = 'depot-nav';
    nav.innerHTML = '<a class="depot-tab" data-mode="binder" href="index.html">THE BINDER</a>' + '<a class="depot-tab" data-mode="builder" href="game/builder.html">LINEUP</a>' + '<a class="depot-tab is-active" data-mode="season" href="index.html?season=1" aria-current="true">SEASON</a>' + '<a class="depot-tab" data-mode="game" href="game/index.html">PLAY BALL</a>' + '<span class="spacer"></span>';
    shell.appendChild(nav);
    var stage = document.createElement('main'); stage.className = 'depot-stage';
    shell.appendChild(stage);
    var h1 = document.createElement('h1'); h1.className = 'h1'; h1.textContent = 'SEASON \u2014 8-GAME RUN';
    var score = document.createElement('div'); score.className = 'season-score';
    if (recEl){ recEl.className = 'season-chip'; recEl.removeAttribute('style'); recEl.textContent = wins + ' - ' + losses; }
    var lbl = document.createElement('div'); lbl.className = 'season-reclbl';
    var remainTxt = remain + ' game' + (remain === 1 ? '' : 's') + ' remain';
    lbl.innerHTML = 'RECORD<br>through ' + played + ' game' + (played === 1 ? '' : 's') + '<br><span class="remain"></span>';
    lbl.querySelector('.remain').textContent = remainTxt;
    var sp = document.createElement('span'); sp.className = 'season-spacer';
    if (recEl) score.appendChild(recEl);
    score.appendChild(lbl);
    score.appendChild(sp);
    if (playBtn){ playBtn.className = 'btn season-play'; playBtn.removeAttribute('style'); score.appendChild(playBtn); }
    var h2 = document.createElement('h2'); h2.className = 'h2'; h2.textContent = 'SCHEDULE';
    classifyGames(schedEl);
    stage.appendChild(h1);
    stage.appendChild(score);
    stage.appendChild(h2);
    if (schedEl) stage.appendChild(schedEl);
    if (msgEl){ stage.appendChild(msgEl); }
    if (closeBtn){
      closeBtn.style.display = 'none';
      view.appendChild(closeBtn);
      var binderTab = nav.querySelector('[data-mode="binder"]');
      if (binderTab) binderTab.addEventListener('click', function(ev){ ev.preventDefault(); try { closeBtn.click(); } catch(e){ warn('close click threw: ' + e); } });
    }
    view.__depotShelled = true;
    view.classList.add('depot-season-dressed'); // FOUC guard: reveal contents now dressing is complete
    log('season screen wearing shared shell (active=season, ' + (id.anon ? 'anonymous' : (wins + '-' + losses)) + ')');
  }
  function tryShell(){
    var view = document.getElementById(VIEW_ID);
    if (!view) { warn('no view present; bailing'); return; }
    if (view.__depotShelled) return;
    var schedEl = document.getElementById('depotSeasonSched');
    var recEl = document.getElementById('depotSeasonRecord');
    if (!recEl || !schedEl || schedEl.children.length === 0) { return; }
    if (typeof window.DepotShell === 'undefined') { warn('DepotShell not loaded (shared css/shell missing); bailing'); return; }
    try { buildShell(view); } catch(e){ warn('buildShell threw; leaving overlay unstyled: ' + e); }
  }
  function isVisible(el){ try { return el && getComputedStyle(el).display !== 'none'; } catch(e){ return false; } }
  function boot(){
    var view = document.getElementById(VIEW_ID);
    if (!view) { warn('boot: no view in DOM; season overlay not present on this page'); return; }
    var revealTimer = null;
    function armReveal(){
        if (revealTimer || view.__depotShelled) return;
        revealTimer = setTimeout(function(){
            if (!view.__depotShelled && !view.classList.contains('depot-season-dressed')){
                view.classList.add('depot-season-reveal-fallback');
                warn('reveal fallback: overlay not dressed within 3s; revealing raw content so the panel is not left blank (season shell hook may have failed)');
            }
        }, 3000);
    }
    var obs = new MutationObserver(function(){ if (isVisible(view)){ armReveal(); if (!view.__depotShelled) tryShell(); } });
    obs.observe(view, { childList: true, subtree: true, attributes: true, attributeFilter: ['style','class'] });
    if (isVisible(view)){ armReveal(); tryShell(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.DepotSeasonShell = { tryShell: tryShell };
})();

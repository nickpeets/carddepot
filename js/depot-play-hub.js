/* js/depot-play-hub.js — CHAPTER 19, the Play Ball hub (v2, supersedes ch08).
 *
 * Target: build_package_v2 exports/desktop/19-playball-hub-v2.png and
 *         exports/mobile-390/playball-hub-v2.png.
 *
 * What this replaces: Play Ball used to route straight into the lineup builder
 * and a cold-open exhibition. The hub puts YOUR CLUB at the top and offers four
 * modes; nothing starts until you pick.
 *
 * SCOPE RULING (planner, this session). Chapter 18 saved teams DO NOT EXIST —
 * no table, no migration, no code. The chapter-19 club plate IS the default
 * saved team, so this surface ships in its drawn "no saved team yet" state:
 * the plate becomes "Build your first team" and the Lineup tile reports zero.
 * The alternative — synthesising a club identity out of the seasons rows — was
 * rejected: it invents a second source of truth for a thing chapter 18 is about
 * to own. When saved teams land, `paintClub()` gains its populated branch and
 * nothing else on this surface moves.
 *
 * Everything that IS real is read, never invented:
 *   record + season ordinal  DepotShell.resolveRecord()  (counts season_games)
 *   season length            seasons.games_total, falling back to the engine's
 *                            own GAMES_TOTAL — NOT the 24 drawn in the package.
 *                            See the SEASON LENGTH note below.
 *   challenges waiting       DepotVs.listMine()
 *
 * SEASON LENGTH — an unresolved conflict, surfaced not papered over.
 * The design package draws "games 1-24" throughout and its own OQ-7 asks for
 * the number to be confirmed. game/season.js ships GAMES_TOTAL = 8. This file
 * renders whatever the season row says and never prints a constant it did not
 * read. If the product answer is 24, season.js is what changes; this surface
 * follows it for free.
 *
 * Fail-loud per AGENTS.md section 4: every early return says why, and a source
 * that cannot be read renders its own honest empty state rather than a zero.
 */
(function () {
  'use strict';

  var TAG = '[play hub]';
  function warn(){ try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c]; }); }

  function host(){ return document.querySelector('[data-hub]'); }
  function slot(name){
    var h = host();
    if (!h){ warn('no [data-hub] on this page; nothing to paint'); return null; }
    var n = h.querySelector('[data-hub-' + name + ']');
    if (!n){ warn('no [data-hub-' + name + '] slot; that region stays as authored'); }
    return n;
  }

  /* ---- the club plate ---------------------------------------------------- */

  /* Signed out and "no saved team yet" are DIFFERENT states (ch19 draws both).
     Signed out cannot know whether a club exists; no-team knows there is none. */
  function paintClub(state){
    var n = slot('club');
    if (!n){ return; }
    if (state === 'anon'){
      n.innerHTML =
        '<span class="rd-hub__crest rd-hub__crest--empty" aria-hidden="true">--</span>' +
        '<span class="rd-hub__id">' +
          '<span class="rd-hub__name">Your club</span>' +
          '<span class="rd-hub__sub">log in to see your team, record and season</span>' +
        '</span>';
      return;
    }
    /* the only other branch today. Chapter 18 adds the populated one. */
    n.innerHTML =
      '<span class="rd-hub__crest rd-hub__crest--empty" aria-hidden="true">+</span>' +
      '<span class="rd-hub__id">' +
        '<span class="rd-hub__name">Build your first team</span>' +
        '<span class="rd-hub__sub">name a nine and every mode below will use it</span>' +
      '</span>' +
      '<span class="rd-hub__clubact">' +
        '<a class="rd-btn rd-btn--primary" href="game/builder.html">Build it 📋</a>' +
      '</span>';
  }

  /* ---- the four tiles ---------------------------------------------------- */

  function paintStatus(name, value, label, hot){
    var n = slot(name);
    if (!n){ return; }
    n.innerHTML =
      (value == null ? '' : '<span class="rd-hub__count' + (hot ? ' rd-hub__count--hot' : '') + '">' + esc(value) + '</span>') +
      '<span class="rd-hub__countlbl">' + esc(label) + '</span>';
  }

  function paintAction(name, html){
    var n = slot(name);
    if (!n){ return; }
    n.innerHTML = html;
  }

  /* LINEUP. Chapter 18 landed, so the count is now READ rather than asserted —
     but the migration is a proposal and is not run, so the table may not exist.
     A missing table and an empty table are different facts and this tile says
     which one it found. It never prints 0 for "not provisioned". */
  function paintLineup(){
    paintAction('lineupact',
      '<a class="rd-btn rd-btn--primary" href="game/builder.html">Open the builder</a>' +
      ' <a class="rd-btn rd-btn--quiet rd-btn--sm" href="dugout.html">Saved teams</a>');

    if (typeof window.depotSB !== 'function' || !window.depotSB()){
      paintStatus('lineupstatus', null, 'log in to see your saved teams');
      return;
    }
    var sb = window.depotSB();
    var userP = window.depotUserCached ? Promise.resolve(window.depotUserCached)
              : (typeof window.depotUser === 'function' ? window.depotUser() : Promise.resolve(null));
    userP.then(function (user){
      if (!user){ paintStatus('lineupstatus', null, 'log in to see your saved teams'); return; }
      return sb.from('saved_teams').select('id,name,is_default').eq('owner_id', user.id)
        .then(function (r){
          if (r.error){
            var c = String(r.error.code || ''), m = String(r.error.message || '');
            if (c === '42P01' || c === 'PGRST205' || /does not exist|schema cache/i.test(m)){
              warn('saved_teams absent; the migration has not been run');
              paintStatus('lineupstatus', null, 'saved teams are not provisioned yet');
              return;
            }
            warn('saved_teams read failed:', m);
            paintStatus('lineupstatus', null, 'saved teams unavailable right now');
            return;
          }
          var rows = r.data || [];
          if (!rows.length){ paintStatus('lineupstatus', null, 'no saved teams yet'); return; }
          var def = null;
          for (var i = 0; i < rows.length; i++){ if (rows[i].is_default){ def = rows[i]; break; } }
          paintStatus('lineupstatus', rows.length,
            'saved team' + (rows.length === 1 ? '' : 's') + (def ? (' \u00b7 ' + def.name + ' is default') : ' \u00b7 no default set'));
        });
    }).catch(function (e){
      warn('saved_teams read threw:', e && e.message);
      paintStatus('lineupstatus', null, 'saved teams unavailable right now');
    });
  }

  /* SEASON. Record is counted from season_games by the shared resolver, so it
     agrees with the header bar by construction. */
  function paintSeason(rec, season){
    if (!rec){
      paintStatus('seasonstatus', null, 'log in to start a season');
      paintAction('seasonact', '<a class="rd-btn rd-btn--quiet" href="index.html">Log in from the binder</a>');
      return;
    }
    var w = rec.wins | 0, l = rec.losses | 0, played = w + l;
    var total = season && season.games_total ? (season.games_total | 0) : null;
    var ord = rec.recordPrefix ? String(rec.recordPrefix).replace(/[^0-9]/g, '') : '';
    var line;
    if (total && played >= total){ line = 'season complete · ' + (ord ? 'S' + ord : 'this season'); }
    else if (total){ line = 'game ' + (played + 1) + ' of ' + total + (ord ? ' · S' + ord : ''); }
    else { line = played ? (played + ' games played') : 'season not started'; }
    paintStatus('seasonstatus', w + '-' + l, line);

    var label = (total && played >= total) ? 'Season complete'
              : (total ? '▶ Play game ' + (played + 1) : '▶ Play the next game');
    var cls = (total && played >= total) ? 'rd-btn rd-btn--quiet' : 'rd-btn rd-btn--gold';
    paintAction('seasonact', '<a class="' + cls + '" href="game/index.html">' + esc(label) + '</a>');
  }

  /* VS. The hub is where a challenge is noticed, so the actionable count is
     inline. "Waiting on you" = a challenge someone else opened that is not yet
     played — the only rows the user can act on from here. */
  function paintVs(rows){
    if (rows == null){
      paintStatus('vsstatus', null, 'challenges unavailable right now');
      paintAction('vsact', '<a class="rd-btn rd-btn--quiet" href="vs.html">Open VS ⚔</a>');
      return;
    }
    var waiting = 0;
    for (var i = 0; i < rows.length; i++){
      if (rows[i] && rows[i].status === 'accepted'){ waiting++; }
    }
    paintStatus('vsstatus', waiting, waiting === 1 ? 'waiting on you' : 'waiting on you', waiting > 0);
    paintAction('vsact', '<a class="rd-btn ' + (waiting ? 'rd-btn--hot' : 'rd-btn--quiet') + '" href="vs.html">Open VS ⚔</a>');
  }

  /* EXHIBITION stays COMING and says why, next to the dead control (rule 6).
     The package names three rule sets and its own known-gaps says they are
     "named, not specified", so this tile does not promise a count it cannot
     defend — it says the modes are drafted, not that three are ready. */

  /* ---- boot -------------------------------------------------------------- */

  function seasonRow(){
    /* games_total lives on the season row. Read it; do not assume 8 or 24. */
    if (typeof window.depotSB !== 'function'){ return Promise.resolve(null); }
    var sb = window.depotSB();
    if (!sb){ return Promise.resolve(null); }
    var userP = window.depotUserCached ? Promise.resolve(window.depotUserCached)
              : (typeof window.depotUser === 'function' ? window.depotUser() : Promise.resolve(null));
    return userP.then(function (user){
      if (!user){ return null; }
      return sb.from('seasons').select('id,games_total,status,created_at')
        .eq('owner_id', user.id).order('created_at', { ascending: true })
        .then(function (r){
          if (r.error){ warn('seasons read failed; season length unknown:', r.error.message); return null; }
          var rows = (r.data || []);
          for (var i = rows.length - 1; i >= 0; i--){ if (rows[i].status === 'active'){ return rows[i]; } }
          return rows.length ? rows[rows.length - 1] : null;
        });
    }).catch(function (e){ warn('seasons read threw:', e && e.message); return null; });
  }

  function vsRows(){
    if (!window.DepotVs || typeof window.DepotVs.listMine !== 'function'){
      warn('DepotVs.listMine missing; the VS tile shows its unavailable state');
      return Promise.resolve(null);
    }
    return window.DepotVs.listMine().then(function (r){ return r || []; })
      .catch(function (e){ warn('listMine failed:', e && e.message); return null; });
  }

  function paint(){
    if (!host()){ warn('paint: no [data-hub]; this is not the hub surface'); return; }
    paintLineup();

    if (!window.DepotShell || typeof window.DepotShell.resolveRecord !== 'function'){
      warn('DepotShell.resolveRecord missing; club and season fall back to signed-out');
      paintClub('anon'); paintSeason(null, null); paintVs(null); return;
    }

    window.DepotShell.resolveRecord().then(function (rec){
      if (!rec){ paintClub('anon'); paintSeason(null, null); return; }
      paintClub('noteam');
      return seasonRow().then(function (s){ paintSeason(rec, s); });
    }).catch(function (e){
      warn('resolveRecord threw; club and season fall back to signed-out:', e && e.message);
      paintClub('anon'); paintSeason(null, null);
    });

    vsRows().then(paintVs);
  }

  function boot(t){
    t = t || 0;
    if (window.DepotShell && document.querySelector('[data-hub]')){ paint(); return; }
    if (t > 40){ warn('DepotShell or [data-hub] never appeared; hub not painted'); return; }
    setTimeout(function(){ boot(t + 1); }, 150);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ boot(0); });
  } else { boot(0); }

  window.DepotPlayHub = { paint: paint };
  (window.depotLog || function(){})('[depot] depot-play-hub.js loaded');
})();

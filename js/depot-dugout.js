/* js/depot-dugout.js — CHAPTER 18, the Dugout: saved teams.
 *
 * Target: build_package_v2 exports/desktop/18-dugout-saved-teams.png and
 *         exports/mobile-390/dugout-saved-teams.png.
 *
 * The constitution calls this the pivot: "build them before the hub, the builder
 * or VS, or all three get rebuilt." Chapter 19 already shipped in its drawn
 * no-team state so it would not be one of the three.
 *
 * THE SCHEMA IS A PROPOSAL AND IS NOT RUN. db/proposals/MIGRATION_saved_teams.sql
 * is unrun by standing rule — agents do not write to the database. So this
 * surface WILL load against a table that does not exist, and the honest thing is
 * to say exactly that rather than render an empty list that looks like "you have
 * no teams." A missing table and an empty table are different facts and the user
 * can act on only one of them. That is rule 10 applied to a surface instead of to
 * pack history: an honest gap beats a plausible lie.
 *
 * DECISIONS TAKEN HERE, recorded because nobody was available to rule:
 *   OQ-3 (a card in a saved team is sold): INVALID WITH A FIX BUTTON, as drawn.
 *   Auto-fill was rejected — it would change a player's nine behind their back
 *   between one game and the next, and the whole value of a saved team is that
 *   it is the same nine every time.
 *   The cap is enforced by the database (trigger), not here. This file reads the
 *   count only to disable the control and say why (rule 6); it never uses that
 *   read as the gate. AGENTS.md 4's canonical incident is exactly a client-side
 *   count losing a race.
 *
 * Fail-loud per AGENTS.md section 4: every early return says why.
 */
(function () {
  'use strict';

  var TAG = '[dugout]';
  var CAP = 10;
  var NAME_MAX = 24;   // ch18: a design constraint (printed on the scoreboard)

  function warn(){ try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c]; }); }

  /* the two-letter tile "derives from it automatically" (ch18) */
  function crestOf(name){
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    /* the export reads "The Griffey Gang" as GG, not TG - a leading article is
       not part of a club's initials. Drop it unless it is the whole name. */
    if (parts.length > 1 && /^(the|a|an)$/i.test(parts[0])){ parts = parts.slice(1); }
    if (!parts.length){ return '??'; }
    if (parts.length === 1){ return parts[0].slice(0, 2).toUpperCase(); }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function ago(iso){
    if (!iso){ return 'never updated'; }
    var t = Date.parse(iso);
    if (isNaN(t)){ warn('unparseable updated_at:', iso); return 'updated recently'; }
    var d = Math.floor((Date.now() - t) / 86400000);
    if (d <= 0){ return 'updated today'; }
    if (d === 1){ return 'updated yesterday'; }
    return 'updated ' + d + ' days ago';
  }
  function host(){ return document.querySelector('[data-dugout]'); }
  function listEl(){ return document.querySelector('[data-dugout-list]'); }

  /* ---- rendering --------------------------------------------------------- */

  function slotsHtml(slots){
    var out = '';
    var lineup = (slots || []).filter(function(s){ return s.slot_kind === 'lineup'; })
                              .sort(function(a,b){ return a.slot_no - b.slot_no; });
    for (var i = 0; i < 9; i++){
      var s = lineup[i];
      if (!s){ out += '<div class="rd-slot">empty</div>'; continue; }
      /* rule 4: no broken-image state. A slot renders its designed placeholder —
         the card's own name and year — never an <img> that might 404. */
      var broken = s.__broken;
      var nm = s.card_name ? ((typeof window.depotCleanName === 'function') ? (window.depotCleanName(s.card_name) || s.card_name) : s.card_name) : '';
      out += '<div class="rd-slot' + (broken ? ' rd-slot--broken' : '') + '" title="' + esc(nm || 'empty slot') + '">' +
               esc(broken ? 'SOLD' : (nm ? nm.split(/\s+/).pop() : 'empty')) +
             '</div>';
    }
    return out;
  }

  function teamHtml(t){
    var broken = (t.slots || []).filter(function(s){ return s.__broken; });
    var cls = 'rd-team' + (t.is_default ? ' rd-team--default' : '') + (broken.length ? ' rd-team--invalid' : '');
    var chips = '';
    if (t.is_default){ chips += '<span class="rd-team__chip rd-team__chip--default">DEFAULT</span>'; }
    if (t.rule_set){ chips += '<span class="rd-team__chip">' + esc(t.rule_set) + '</span>'; }

    var acts = '';
    if (!t.is_default){
      acts += '<button class="rd-btn rd-btn--quiet rd-btn--sm" type="button" data-make-default="' + esc(t.id) + '">Make default</button>';
    }
    acts += '<a class="rd-btn rd-btn--primary rd-btn--sm" href="game/builder.html?team=' + encodeURIComponent(t.id) + '">Edit</a>';

    var why = '';
    if (broken.length){
      /* rule 6: say WHICH slot broke, next to the fix. */
      /* standing ruling: every player name goes through depotCleanName. The raw
         library string carries multi-player and trailing-code noise
         (depot-position.js cleanName) and this is a name shown to a player. */
      var names = broken.map(function(s){
        var n = s.card_name || 'a card';
        if (typeof window.depotCleanName === 'function'){ n = window.depotCleanName(n) || n; }
        return n + (s.card_year ? ' (' + s.card_year + ')' : '');
      });
      why = '<div class="rd-team__why">' +
              '<span>' + esc(names.join(', ')) + ' left this collection, so slot ' +
              esc(broken.map(function(s){ return s.slot_no; }).join(', ')) + ' is empty.</span>' +
              '<a class="rd-btn rd-btn--hot rd-btn--sm" href="game/builder.html?team=' + encodeURIComponent(t.id) + '">Fix the lineup</a>' +
            '</div>';
    }

    return '<div class="' + cls + '">' +
      '<div class="rd-team__h">' +
        '<span class="rd-team__crest" aria-hidden="true">' + esc(crestOf(t.name)) + '</span>' +
        '<span class="rd-team__id">' +
          '<span class="rd-team__nameline"><span class="rd-team__name">' + esc(t.name) + '</span>' + chips + '</span>' +
          '<span class="rd-team__meta">' +
            '<span class="rd-team__rec">' + ((t.wins|0) + '-' + (t.losses|0)) + '</span>' +
            '<span class="rd-team__sub">' + (t.prestige|0) + ' prestige &middot; used in ' + (t.games_used|0) +
              ' game' + ((t.games_used|0) === 1 ? '' : 's') + ' &middot; ' + esc(ago(t.updated_at)) + '</span>' +
          '</span>' +
        '</span>' +
        '<span class="rd-team__act">' + acts + '</span>' +
      '</div>' +
      '<div class="rd-team__slots">' + slotsHtml(t.slots) + '</div>' +
      why +
    '</div>';
  }

  /* the four drawn states, each saying something different and true */
  function stateHtml(kind, detail){
    if (kind === 'anon'){
      return '<div class="rd-state--empty"><div class="rd-state__icon">&#128274;</div>' +
             '<div class="rd-state__t">Log in to see your teams</div>' +
             '<div class="rd-state__s">Saved teams belong to your collection.</div>' +
             '<a class="rd-btn rd-btn--primary" href="index.html">Log in from the binder</a></div>';
    }
    if (kind === 'noschema'){
      /* the honest gap. Do NOT render this as "no teams yet" — the two are
         different facts and only one of them is the user's to fix. */
      return '<div class="rd-panel rd-panel--caution">' +
             '<div class="rd-panel__h">SAVED TEAMS ARE NOT PROVISIONED YET</div>' +
             '<p class="rd-panel__note">The surface is built and the migration is written, but the tables have not been created yet, so there is nothing to list. ' +
             'This is not an empty collection — it is a missing table, and saying so is the point. ' +
             'Run <code>db/proposals/MIGRATION_saved_teams.sql</code> and reload.</p>' +
             (detail ? '<p class="rd-panel__note">Reported by the database: ' + esc(detail) + '</p>' : '') +
             '</div>';
    }
    if (kind === 'error'){
      return '<div class="rd-panel rd-panel--error"><b>Could not read your saved teams.</b>' +
             '<p class="rd-panel__note">' + esc(detail || 'The database did not answer.') + '</p></div>';
    }
    return '<div class="rd-state--empty"><div class="rd-state__icon">&#9918;</div>' +
           '<div class="rd-state__t">No saved teams yet</div>' +
           '<div class="rd-state__s">Build a nine, name it, and every mode uses it — Season plays it, VS sends it, a rematch re-sends it.</div>' +
           '<a class="rd-btn rd-btn--primary" href="game/builder.html">Build your first team</a></div>';
  }

  function paintCount(n, kind){
    var el = document.querySelector('[data-dugout-count]');
    if (!el){ warn('no [data-dugout-count]; header count not painted'); return; }
    el.textContent = (kind === 'ok') ? ('SAVED TEAMS — ' + n + ' OF ' + CAP) : 'SAVED TEAMS';
    var add = document.querySelector('[data-dugout-new]');
    if (!add){ return; }
    var full = (kind === 'ok' && n >= CAP);
    add.classList.toggle('rd-btn--quiet', full);
    add.classList.toggle('rd-btn--primary', !full);
    if (full){
      add.setAttribute('aria-disabled', 'true');
      /* rule 6: locked says why, next to the control */
      var why = document.querySelector('[data-dugout-capwhy]');
      if (why){ why.textContent = 'You have ' + CAP + ' teams, which is the cap. Delete one to make room.'; }
    }
  }

  /* ---- data -------------------------------------------------------------- */

  /* PostgREST answers a missing table with 42P01 / PGRST205 / "does not exist".
     Match on all three rather than on one, because which one arrives depends on
     the PostgREST version and this has to stay true across an upgrade. */
  function isMissingTable(err){
    if (!err){ return false; }
    var c = String(err.code || ''), m = String(err.message || '');
    return c === '42P01' || c === 'PGRST205' || c === 'PGRST202' || /does not exist|schema cache/i.test(m);
  }

  function load(){
    if (typeof window.depotSB !== 'function'){
      warn('depotSB missing (depot-core not loaded); rendering signed-out');
      return Promise.resolve({ kind: 'anon' });
    }
    var sb = window.depotSB();
    if (!sb){ warn('depotSB() returned no client; rendering signed-out'); return Promise.resolve({ kind: 'anon' }); }

    var userP = window.depotUserCached ? Promise.resolve(window.depotUserCached)
              : (typeof window.depotUser === 'function' ? window.depotUser() : Promise.resolve(null));

    return userP.then(function (user){
      if (!user){ return { kind: 'anon' }; }
      return sb.from('saved_teams')
        .select('id,name,is_default,rule_set,prestige,games_used,wins,losses,updated_at')
        .eq('owner_id', user.id)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false })
        .then(function (r){
          if (r.error){
            if (isMissingTable(r.error)){
              warn('saved_teams table absent; the migration has not been run:', r.error.message);
              return { kind: 'noschema', detail: r.error.message };
            }
            warn('saved_teams read failed:', r.error.message);
            return { kind: 'error', detail: r.error.message };
          }
          var teams = r.data || [];
          if (!teams.length){ return { kind: 'ok', teams: [] }; }
          var ids = teams.map(function(t){ return t.id; });
          return sb.from('saved_team_slots')
            .select('team_id,slot_kind,slot_no,card_id,pos,card_name,card_year')
            .in('team_id', ids)
            .then(function (s){
              if (s.error){ warn('slots read failed; teams render without their nine:', s.error.message); }
              var rows = s.data || [];
              var by = {};
              rows.forEach(function (row){ (by[row.team_id] = by[row.team_id] || []).push(row); });
              teams.forEach(function (t){ t.slots = by[t.id] || []; });

              /* OQ-3, answered as drawn: a slot whose card has left the
                 collection makes the team INVALID with a fix button. That
                 requires actually asking which cards still exist -- a slot row
                 alone cannot know, because it holds a reference and the card is
                 what disappears. Missing ids, not present ones, are the answer.
                 If this query fails we say so and mark nothing: a team wrongly
                 shown as broken is worse than one not yet checked. */
              var ids = [];
              rows.forEach(function (row){ if (row.card_id && ids.indexOf(row.card_id) < 0){ ids.push(row.card_id); } });
              if (!ids.length){ return { kind: 'ok', teams: teams }; }
              return sb.from('cards').select('id').in('id', ids).then(function (c){
                if (c.error){
                  warn('cards existence check failed; no team is marked invalid this load:', c.error.message);
                  return { kind: 'ok', teams: teams, unchecked: true };
                }
                var alive = {};
                (c.data || []).forEach(function (row){ alive[String(row.id)] = true; });
                rows.forEach(function (row){ if (!alive[String(row.card_id)]){ row.__broken = true; } });
                return { kind: 'ok', teams: teams };
              });
            });
        });
    }).catch(function (e){
      warn('load threw:', e && e.message);
      return { kind: 'error', detail: e && e.message };
    });
  }

  /* ---- interaction ------------------------------------------------------- */

  function wire(){
    var l = listEl();
    if (!l){ return; }
    /* assignment, not addEventListener, so a repaint cannot stack duplicates */
    l.onclick = function (ev){
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-make-default]') : null;
      if (!b){ return; }
      var id = b.getAttribute('data-make-default');
      var sb = (typeof window.depotSB === 'function') ? window.depotSB() : null;
      if (!sb){ warn('make default: no client'); return; }
      b.disabled = true; b.textContent = 'Setting…';
      /* clear then set. The partial unique index is what makes a lost race fail
         loudly instead of leaving two defaults; this order just keeps the happy
         path from tripping it. */
      var userP = window.depotUserCached ? Promise.resolve(window.depotUserCached) : window.depotUser();
      userP.then(function (u){
        return sb.from('saved_teams').update({ is_default: false }).eq('owner_id', u.id).eq('is_default', true)
          .then(function (){ return sb.from('saved_teams').update({ is_default: true }).eq('id', id); });
      }).then(function (r){
        if (r && r.error){ warn('make default failed:', r.error.message); b.disabled = false; b.textContent = 'Make default'; return; }
        paint();
      }).catch(function (e){
        warn('make default threw:', e && e.message); b.disabled = false; b.textContent = 'Make default';
      });
    };

    var search = document.querySelector('[data-dugout-search]');
    if (search){
      search.oninput = function (){
        var q = String(search.value || '').toLowerCase();
        var rows = l.querySelectorAll('.rd-team');
        for (var i = 0; i < rows.length; i++){
          var n = rows[i].querySelector('.rd-team__name');
          var hit = !q || (n && n.textContent.toLowerCase().indexOf(q) >= 0);
          rows[i].style.display = hit ? '' : 'none';
        }
      };
    } else { warn('no [data-dugout-search]; search is inert'); }
  }

  function paint(){
    var l = listEl();
    if (!l){ warn('paint: no [data-dugout-list]; this is not the Dugout'); return; }
    load().then(function (res){
      if (res.kind !== 'ok'){ paintCount(0, res.kind); l.innerHTML = stateHtml(res.kind, res.detail); return; }
      paintCount(res.teams.length, 'ok');
      if (!res.teams.length){ l.innerHTML = stateHtml('empty'); return; }
      l.innerHTML = res.teams.map(teamHtml).join('');
    });
  }

  function boot(t){
    t = t || 0;
    if (host()){ wire(); paint(); return; }
    if (t > 40){ warn('no [data-dugout] appeared; nothing painted'); return; }
    setTimeout(function(){ boot(t + 1); }, 150);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ boot(0); });
  } else { boot(0); }

  window.DepotDugout = { paint: paint, CAP: CAP, NAME_MAX: NAME_MAX, crestOf: crestOf };
  (window.depotLog || function(){})('[depot] depot-dugout.js loaded');
})();

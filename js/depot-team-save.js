/* js/depot-team-save.js — CHAPTER 20, first slice: the builder SAVES a team.
 *
 * The dead end this closes: the Dugout's "+ New team" routes to the builder,
 * and the builder never wrote saved_teams — a player could build a nine, come
 * back, and find 0 OF 10. This module is the missing write, built ADDITIVELY:
 * it reads the SAME state the sim hand-off uses (window.buildTeamPayload) and
 * touches none of the play / season / challenge paths. VS settlement untouched.
 *
 * Default rule: the first saved team becomes the default. Decided by ASKING THE
 * DATABASE, not by counting first — we try is_default:true when the list was
 * empty at load, and if another writer won the race the partial unique index
 * answers 23505, and we retry once as non-default. The constraint is the gate;
 * the client just handles the loud no (AGENTS.md 4).
 *
 * Slot mapping onto MIGRATION_saved_teams.sql: the nine batting-order entries
 * are slot_kind 'lineup' 1..9 with their assigned pos; the starting pitcher is
 * slot_kind 'bullpen' slot_no 1. Names/years are denormalised onto the slot so
 * a later invalid row can say WHICH card left (ch18's honest state).
 *
 * Fail-loud: every early return says why, and the button never lies — it
 * disables while saving and reports the database's own words on failure.
 */
(function () {
  'use strict';
  var TAG = '[team-save]';
  function warn(){ try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }

  function sbc(){ return (typeof window.depotSB === 'function') ? window.depotSB() : null; }
  function userP(){
    return window.depotUserCached ? Promise.resolve(window.depotUserCached)
         : (typeof window.depotUser === 'function' ? window.depotUser() : Promise.resolve(null));
  }

  function mountButton(){
    var play = document.getElementById('playBtn');
    if (!play || !play.parentNode){ warn('no #playBtn; save button not mounted'); return null; }
    if (document.getElementById('saveTeamBtn')){ return document.getElementById('saveTeamBtn'); }
    var b = document.createElement('button');
    b.id = 'saveTeamBtn'; b.type = 'button';
    b.textContent = 'SAVE TO DUGOUT';
    b.style.cssText = 'margin-left:10px;padding:12px 18px;font-family:inherit;font-size:11px;letter-spacing:1px;cursor:pointer;background:var(--gold,#ffd23e);color:#10456b;border:2px solid #10456b;min-height:44px';
    var note = document.createElement('div');
    note.id = 'saveTeamNote';
    note.style.cssText = 'font-size:9px;margin-top:6px;letter-spacing:.5px';
    play.parentNode.insertBefore(b, play.nextSibling);
    play.parentNode.insertBefore(note, b.nextSibling);
    return b;
  }
  function note(msg, bad){
    var n = document.getElementById('saveTeamNote');
    if (n){ n.textContent = msg || ''; n.style.color = bad ? '#e2543e' : '#7be36b'; }
    if (msg){ (bad ? warn : function(){ })(msg); }
  }

  var SAVING = false;
  function save(){
    if (SAVING){ return; }
    if (typeof window.buildTeamPayload !== 'function'){ note('The builder did not expose its lineup; cannot save.', true); return; }
    var sb = sbc();
    if (!sb){ note('No database client; log in and reload.', true); return; }
    var btn = document.getElementById('saveTeamBtn');
    SAVING = true; if (btn){ btn.disabled = true; btn.textContent = 'SAVING…'; }
    function done(msg, bad){ SAVING = false; if (btn){ btn.disabled = false; btn.textContent = 'SAVE TO DUGOUT'; } note(msg, bad); }

    userP().then(function (user){
      if (!user){ done('Not signed in.', true); return; }
      return window.buildTeamPayload().then(function (p){
        var lineup = (p && p.lineup) || [];
        var full = lineup.length === 9 && lineup.every(function (s){ return s && s.cardId; });
        if (!full){ done('Nine usable hitters first — the order has empty or unresolved slots.', true); return; }
        if (!p.pitcher || !p.pitcher.cardId){ done('Pick a starting pitcher first.', true); return; }
        var name = String(p.name || '').trim().slice(0, 24);
        if (!name){ done('Name the team first.', true); return; }

        return sb.from('saved_teams').select('id', { count: 'exact', head: true }).eq('owner_id', user.id)
          .then(function (c){
            var wantDefault = !c.error && (c.count === 0);
            function insertTeam(asDefault){
              return sb.from('saved_teams').insert({ owner_id: user.id, name: name, is_default: asDefault }).select('id').single();
            }
            return insertTeam(wantDefault).then(function (t){
              if (t.error && String(t.error.code) === '23505' && wantDefault){
                warn('lost the first-team race; the partial index said no — retrying as non-default');
                return insertTeam(false);
              }
              return t;
            }).then(function (t){
              if (t.error){
                if (String(t.error.code) === 'P0001'){ done('The Dugout is full — 10 teams is the cap. Delete one there first.', true); return; }
                done('Save refused: ' + t.error.message, true); return;
              }
              var rows = lineup.map(function (s, i){
                return { team_id: t.data.id, slot_kind: 'lineup', slot_no: i + 1, card_id: String(s.cardId),
                         pos: s.pos || null, card_name: s.name || '', card_year: (s.year == null ? '' : String(s.year)) };
              });
              rows.push({ team_id: t.data.id, slot_kind: 'bullpen', slot_no: 1, card_id: String(p.pitcher.cardId),
                          pos: 'P', card_name: p.pitcher.name || '', card_year: (p.pitcher.year == null ? '' : String(p.pitcher.year)) });
              return sb.from('saved_team_slots').insert(rows).then(function (r){
                if (r.error){
                  /* the team row exists but its nine did not land — say so loudly
                     rather than leaving a silent hollow team in the Dugout. */
                  done('Team saved but its slots were refused: ' + r.error.message + ' — open the Dugout and check it.', true); return;
                }
                note('Saved. Off to the Dugout…');
                setTimeout(function (){ window.location.href = '../dugout.html'; }, 600);
              });
            });
          });
      });
    }).catch(function (e){ done('Save threw: ' + (e && e.message), true); });
  }

  function boot(t){
    t = t || 0;
    if (document.getElementById('playBtn')){
      var b = mountButton();
      if (b){ b.onclick = save; }
      return;
    }
    if (t > 60){ warn('no #playBtn ever appeared; team save unavailable on this page'); return; }
    setTimeout(function (){ boot(t + 1); }, 200);
  }
  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', function (){ boot(0); }); }
  else { boot(0); }

  (window.depotLog || function(){})('[depot] depot-team-save.js loaded');
})();

/* js/depot-vs.js - VS MODE v1: friendly-stakes head-to-head challenges.
 *
 * ADDITIVE BY CONSTRUCTION. The challenge plumbing already existed before this
 * file: game/builder.html creates a matches row + shareable link, accepts via
 * ?match=, and game/index.html?match= applies BOTH real lineups to the sim from
 * one seed. This module adds only what was missing - a stakes declaration, the
 * settlement, and the read model the VS surface renders.
 *
 * DARK-SAFE. Every table below may not exist yet (db/proposals/MIGRATION_vs_mode.sql
 * is QUEUED, not executed). Every bail says why, per AGENTS.md 4. Nothing here
 * deletes anything and no card ever changes owner - card wagers are deferred.
 *
 * IDEMPOTENCY UNIT (AGENTS.md 4, the canonical incident). The unit is ONE PAYOUT
 * PER PARTY PER CHALLENGE, so match_settlements is keyed (match_id, owner_id).
 * A single-column unique on match_id would reject the second party's row - the
 * same mistake as the unique-on-pack_seed index, in reverse. The ledger row is
 * inserted FIRST; a 23505 there means already settled and returns a clean no-op
 * that moves no coins.
 */
(function () {
  'use strict';
  var TAG = '[vs]';
  var PURSE = 100;
  var CONSOLATION = 15;
  var STAKES = { type: 'friendly', purse: PURSE, consolation: CONSOLATION, cards: false };
  function client() {
    try { return (typeof depotSB === 'function') ? depotSB() : (window.depotSB ? window.depotSB() : null); }
    catch (e) { console.warn(TAG, 'no supabase client:', e && e.message); return null; }
  }
  function cachedUid() {
    var u = window.depotUserCached || (typeof window.depotUser === 'object' ? window.depotUser : null);
    return (u && u.id) ? u.id : null;
  }
  function userId() {
    var id = cachedUid();
    if (id) { return Promise.resolve(id); }
    var c = client();
    if (!c || !c.auth) { console.warn(TAG, 'userId: no client/auth; anonymous'); return Promise.resolve(null); }
    return c.auth.getUser().then(function (r) {
      var who = r && r.data && r.data.user ? r.data.user.id : null;
      if (!who) { console.warn(TAG, 'userId: no session user; anonymous'); }
      return who;
    }).catch(function (e) { console.warn(TAG, 'userId failed:', e && e.message); return null; });
  }
  function stakes() { return { type: STAKES.type, purse: STAKES.purse, consolation: STAKES.consolation, cards: false }; }
  function stakesOf(row) {
    try {
      var s = row && row.challenger_lineup && row.challenger_lineup.stakes;
      if (s && typeof s.purse === 'number') { return s; }
    } catch (e) { console.warn(TAG, 'stakesOf: unreadable stakes on', row && row.id, e && e.message); }
    return stakes();
  }
  function roleOf(row, me) {
    if (!row || !me) { return null; }
    if (row.challenger_id === me) { return 'challenger'; }
    if (row.opponent_id === me) { return 'opponent'; }
    return null;
  }
  function scoresOf(row) {
    var f = row && row.result && row.result.final;
    if (!f || typeof f.challenger !== 'number' || typeof f.opponent !== 'number') { return null; }
    return { challenger: f.challenger, opponent: f.opponent };
  }
  function outcomeFor(row, me) {
    var role = roleOf(row, me), sc = scoresOf(row);
    if (!role) { console.warn(TAG, 'outcome: not a party to match', row && row.id); return null; }
    if (!sc) { console.warn(TAG, 'outcome: match', row && row.id, 'has no final score yet'); return null; }
    var mine = (role === 'challenger') ? sc.challenger : sc.opponent;
    var theirs = (role === 'challenger') ? sc.opponent : sc.challenger;
    return { role: role, mine: mine, theirs: theirs, won: mine > theirs, tied: mine === theirs };
  }
  function listMine() {
    var c = client();
    if (!c) { console.warn(TAG, 'listMine: no client; empty list'); return Promise.resolve([]); }
    return userId().then(function (me) {
      if (!me) { console.warn(TAG, 'listMine: anonymous; empty list'); return []; }
      return c.from('matches').select('*')
        .or('challenger_id.eq.' + me + ',opponent_id.eq.' + me)
        .order('created_at', { ascending: false }).limit(50)
        .then(function (res) {
          if (res.error) { console.warn(TAG, 'listMine: matches read failed:', res.error.message); return []; }
          /* [self-match settlement bug] SEASON games ride the matches pipeline as
             SELF-matches (challenger_id = opponent_id, builder __depotSeasonPlay).
             They are season plumbing, never VS games: not VS surface material and
             NEVER settle-eligible. Before this filter the settle sweep paid the
             full friendly purse for playing yourself - production minted ~1,300
             coins across 13 self-settlements when settlement went live 2026-08-02.
             This is the sweep's candidate-query half; settle() carries the same
             refusal as defense in depth. */
          var rows = res.data || [], keep = [], dropped = 0;
          for (var i = 0; i < rows.length; i++) {
            if (rows[i] && rows[i].challenger_id && rows[i].challenger_id === rows[i].opponent_id) { dropped++; continue; }
            keep.push(rows[i]);
          }
          if (dropped) { console.warn(TAG, 'listMine: excluded ' + dropped + ' season self-match(es) - season plumbing, never VS material, never settle-eligible'); }
          return keep;
        });
    });
  }
  function payoutFor(out, st) {
    if (out.tied) { return { amount: st.consolation, reason: 'challenge_tie', label: 'TIE - CONSOLATION' }; }
    if (out.won) { return { amount: st.purse, reason: 'challenge_win', label: 'FRIENDLY WIN' }; }
    return { amount: st.consolation, reason: 'challenge_loss', label: 'CONSOLATION' };
  }
  function credit(c, me, pay, matchId) {
    var row = { owner_id: me, amount: pay.amount, reason: pay.reason, match_id: matchId };
    return c.from('wallet_transactions').insert(row).select().maybeSingle().then(function (res) {
      if (res.error) { console.warn(TAG, 'credit: wallet_transactions insert failed (DDL likely not run):', res.error.message); return { balance: null }; }
      return c.rpc('depot_apply_payout', { p_owner: me, p_amount: pay.amount }).then(function (r2) {
        if (r2 && r2.error) { console.warn(TAG, 'credit: depot_apply_payout unavailable:', r2.error.message); return { balance: null }; }
        return { balance: (r2 && typeof r2.data === 'number') ? r2.data : null };
      }).catch(function (e) { console.warn(TAG, 'credit: rpc threw:', e && e.message); return { balance: null }; });
    }).catch(function (e) { console.warn(TAG, 'credit threw:', e && e.message); return { balance: null }; });
  }
  function settle(row) {
    var c = client();
    if (!c) { console.warn(TAG, 'settle: no client; nothing settled'); return Promise.resolve({ ok: false, reason: 'no-client' }); }
    if (!row || !row.id) { console.warn(TAG, 'settle: no match row given'); return Promise.resolve({ ok: false, reason: 'no-row' }); }
    /* [self-match settlement bug] defense-in-depth half of the fix (the sweep's
       candidate filter in listMine is the other): a season SELF-match must never
       reach the ledger, whatever path delivered it (settleById, a future caller,
       a stale cached row). Eligibility narrows; ledger-first discipline unchanged. */
    if (row.challenger_id && row.challenger_id === row.opponent_id) {
      console.warn(TAG, 'settle REFUSED: match', row.id, 'is a season SELF-match (challenger_id = opponent_id) - season plumbing, no purse. See db/proposals/REVERSAL_self_match_settlements.sql for the production cleanup.');
      return Promise.resolve({ ok: false, reason: 'self-match' });
    }
    if (row.status !== 'played') { console.warn(TAG, 'settle: match', row.id, 'is', row.status, '- only a played match settles'); return Promise.resolve({ ok: false, reason: 'not-played' }); }
    return userId().then(function (me) {
      if (!me) { console.warn(TAG, 'settle: anonymous; nothing settled'); return { ok: false, reason: 'anon' }; }
      var out = outcomeFor(row, me);
      if (!out) { return { ok: false, reason: 'no-outcome' }; }
      var st = stakesOf(row), pay = payoutFor(out, st);
      var led = { match_id: row.id, owner_id: me, role: out.role, amount: pay.amount, won: !!out.won };
      return c.from('match_settlements').insert(led).select().maybeSingle().then(function (ins) {
        if (ins.error) {
          if (ins.error.code === '23505') { console.log(TAG, 'settle: match', row.id, 'already settled for this party - clean no-op, no coins moved'); return { ok: true, noop: true, amount: pay.amount, label: pay.label }; }
          console.warn(TAG, 'settle: settlement ledger insert failed (DDL likely not run):', ins.error.message);
          return { ok: false, reason: 'ddl', amount: pay.amount, label: pay.label };
        }
        return credit(c, me, pay, row.id).then(function (r) { return { ok: true, settled: true, amount: pay.amount, label: pay.label, balance: r.balance }; });
      }).catch(function (e) { console.warn(TAG, 'settle threw:', e && e.message); return { ok: false, reason: 'threw' }; });
    });
  }
  function settleById(matchId) {
    var c = client();
    if (!c) { console.warn(TAG, 'settleById: no client'); return Promise.resolve({ ok: false, reason: 'no-client' }); }
    return c.from('matches').select('*').eq('id', matchId).maybeSingle().then(function (res) {
      if (res.error) { console.warn(TAG, 'settleById: match read failed:', res.error.message); return { ok: false, reason: 'read' }; }
      return settle(res.data);
    });
  }
  function linkFor(matchId) {
    try { return location.origin + location.pathname.replace(/[^/]*$/, '') + 'game/builder.html?match=' + encodeURIComponent(matchId); }
    catch (e) { console.warn(TAG, 'linkFor: location unreadable:', e && e.message); return 'game/builder.html?match=' + matchId; }
  }
  window.DepotVs = { PURSE: PURSE, CONSOLATION: CONSOLATION, stakes: stakes, stakesOf: stakesOf,
    listMine: listMine, roleOf: roleOf, outcomeFor: outcomeFor, settle: settle, settleById: settleById, linkFor: linkFor };
  console.log(TAG, 'module ready - friendly stakes, purse ' + PURSE + ' / consolation ' + CONSOLATION);
})();

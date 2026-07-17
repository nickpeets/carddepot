/*
 * js/depot-wallet.js - Franchise Economy, Slice A wallet + payout.
 * - Wallet chip in the shell identity block (franchise . record . balance).
 * - Payout-on-win: wraps DepotSeason.recordSeasonResult WITHOUT modifying it,
 *   writes the payout via the same authenticated depotSB() path, shows the payday panel.
 * - Graceful until the DDL runs: if the wallet tables/columns are absent, every path
 *   logs [depot] why it bailed and the chip stays hidden. See ECONOMY_DESIGN.md 2 + Part 2 DDL.
 * Currency placeholder: DEPOT DOLLARS (DD) - Nick's to rename.
 */
(function () {
  'use strict';
  var TAG = '[depot] wallet:';
  var CURRENCY = 'coins';

  var BASE_WIN = 100, WIN_MULT = 1.8, SHUTOUT = 50, STREAK_STEP = 15, STREAK_CAP = 8;
  var LOSS_FLAT = 15, EXHIBITION_WIN = 25;

  var _tablesOk = null;
  var _lastBalance = null;

  function sb() {
    try { return (typeof depotSB === 'function') ? depotSB() : (window.depotSB && window.depotSB()); }
    catch (e) { return null; }
  }
  function uid() {
        var u = window.depotUserCached || (typeof window.depotUser === 'object' && window.depotUser) || null;
        if (!u || !u.id) { if (!uid._warned) { uid._warned = true; console.warn(TAG, 'uid: no cached user (depotUserCached/depotUser both absent); balance/chip hidden until auth resolves'); } return null; }
        return u.id;
  }

  function earningsFor(userScore, oppScore, context) {
    context = context || {};
    var win = Number(userScore) > Number(oppScore);
    var lines = [];
    if (!win) {
      lines.push({ k: 'CONSOLATION', amt: LOSS_FLAT });
      return { win: false, total: LOSS_FLAT, lines: lines };
    }
    if (context.exhibition && !context.season) {
      lines.push({ k: 'EXHIBITION WIN (capped)', amt: EXHIBITION_WIN });
      return { win: true, total: EXHIBITION_WIN, lines: lines };
    }
    lines.push({ k: 'BASE', amt: BASE_WIN });
    var pres = Math.max(0, parseInt(context.prestige, 10) || 0);
    lines.push({ k: 'LINEUP PRESTIGE x' + WIN_MULT, amt: Math.round(pres * WIN_MULT) });
    if (Number(oppScore) <= 1) lines.push({ k: 'SHUTOUT', amt: SHUTOUT });
    var streak = Math.min(STREAK_CAP, Math.max(0, parseInt(context.streak, 10) || 0));
    if (streak > 0) lines.push({ k: 'WIN STREAK x' + streak, amt: STREAK_STEP * streak });
    var total = 0; for (var i = 0; i < lines.length; i++) total += lines[i].amt;
    return { win: true, total: total, lines: lines };
  }

  function getBalance() {
    var client = sb(), owner = uid();
    if (!client) { console.warn(TAG, 'no Supabase client, balance unavailable'); return Promise.resolve(null); }
    if (!owner)  { console.warn(TAG, 'anonymous user, balance hidden'); return Promise.resolve(null); }
    return client.from('franchises').select('balance').eq('owner_id', owner).maybeSingle()
      .then(function (res) {
        if (res.error) { _tablesOk = false; console.warn(TAG, 'balance read failed (DDL likely not run):', res.error.message); return null; }
        _tablesOk = true;
        var bal = res.data && typeof res.data.balance === 'number' ? res.data.balance : 0;
        _lastBalance = bal; return bal;
      })
      .catch(function (e) { _tablesOk = false; console.warn(TAG, 'balance read threw (DDL likely not run):', e && e.message); return null; });
  }

  function writePayout(amount, reason, seasonGameId) {
    var client = sb(), owner = uid();
    if (!client || !owner) { console.warn(TAG, 'cannot write payout: no client/user'); return Promise.resolve({ ok: false }); }
    var row = { owner_id: owner, amount: amount, reason: reason || 'season_win', season_game_id: seasonGameId || null };
    return client.from('wallet_transactions').insert(row).select().maybeSingle()
      .then(function (res) {
        if (res.error) { console.warn(TAG, 'payout ledger insert failed (DDL likely not run):', res.error.message); return { ok: false }; }
        return client.rpc('depot_apply_payout', { p_owner: owner, p_amount: amount })
          .then(function (r2) {
            if (r2 && r2.error) { console.warn(TAG, 'balance rpc unavailable, reading balance directly:', r2.error.message); return getBalance().then(function (bal) { return { ok: true, balance: bal }; }); }
            var bal = (r2 && typeof r2.data === 'number') ? r2.data : null;
            if (bal !== null) _lastBalance = bal;
            return { ok: true, balance: bal };
          })
          .catch(function () { return getBalance().then(function (bal) { return { ok: true, balance: bal }; }); });
      })
      .catch(function (e) { console.warn(TAG, 'payout write threw (DDL likely not run):', e && e.message); return { ok: false }; });
  }

  function fmt(n) { return (n == null ? '--' : String(n)) + ' ' + CURRENCY; }

  function chipHost() {
    return document.querySelector('[data-depot-franchise]') || document.querySelector('.depot-franchise');
  }

  function mountChip() {
    return getBalance().then(function (bal) {
      var host = chipHost();
      if (!host) { console.warn(TAG, 'mountChip: no identity block, skipping'); return; }
      var existing = host.querySelector('.depot-wallet-chip');
      if (bal == null) { if (existing) existing.remove(); console.warn(TAG, 'wallet chip hidden until DDL runs / user signs in'); return; }
      var html = '<span class="depot-wallet-chip v2-coin-pill" title="Franchise balance"><span class="v2-coin" aria-hidden="true">🪙</span><span class="dw-amt v2-coin-amt">' + bal + '</span><span class="dw-cur">' + CURRENCY + '</span></span>';
      if (existing) existing.outerHTML = html; else host.insertAdjacentHTML('beforeend', html);
      console.log(TAG, 'wallet chip mounted, balance', bal);
    });
  }

  function paydayHTML(detail) {
    var rows = detail.lines.map(function (l) { return '<div class="dw-pay-row"><span>' + l.k + '</span><span>+' + l.amt + '</span></div>'; }).join('');
    var bal = detail.balance == null ? '' : '<div class="dw-pay-bal">NEW BALANCE <b>' + fmt(detail.balance) + '</b></div>';
    return '<div class="depot-payday" role="status"><div class="dw-pay-title">PAYDAY</div>' + rows + '<div class="dw-pay-total">+' + detail.total + ' ' + CURRENCY + '</div>' + bal + '</div>';
  }

  function showPayday(detail) {
    var host = document.querySelector('.depot-postgame') || document.querySelector('#postgame') || document.querySelector('.depot-game-result') || document.body;
    if (!host) { console.warn(TAG, 'showPayday: no host, skipping panel'); return; }
    var prev = document.querySelector('.depot-payday'); if (prev) prev.remove();
    host.insertAdjacentHTML('beforeend', paydayHTML(detail));
    console.log(TAG, 'payday panel shown: +' + detail.total + ' ' + CURRENCY);
  }

  var _hooked = false;

  function currentPrestige() {
    try {
      if (window.DepotPrestige && typeof window.DepotPrestige.lineupTotal === 'function') {
        var lu = window.__depotActiveLineup || (window.DepotSeason && window.DepotSeason.activeLineup);
        if (lu && lu.length) return window.DepotPrestige.lineupTotal(lu);
      }
    } catch (e) { console.warn(TAG, 'prestige lookup failed:', e && e.message); }
    return 0;
  }

  function afterSeasonResult(seasonGameId, userScore, oppScore) {
    var detail = earningsFor(userScore, oppScore, { season: true, exhibition: false, prestige: currentPrestige(), streak: (window.DepotSeason && window.DepotSeason.winStreak) || 0 });
    if (!detail.win) {
      // [loss consolation] SEASON losses persist the flat consolation (ECONOMY_DESIGN 2: LOSS = 15 flat).
      if (_tablesOk === false) { console.warn(TAG, 'wallet tables absent (DDL not run) - skipping season-loss write, showing preview panel'); showPayday({ lines: detail.lines, total: detail.total, balance: null }); return; }
      writePayout(detail.total, 'season_loss', seasonGameId).then(function (r) {
        if (!r.ok) { console.warn(TAG, 'season-loss consolation not persisted (DDL likely not run); showing preview panel'); showPayday({ lines: detail.lines, total: detail.total, balance: null }); return; }
        showPayday({ lines: detail.lines, total: detail.total, balance: r.balance });
        mountChip();
      });
      return;
    }
    if (_tablesOk === false) { console.warn(TAG, 'wallet tables absent (DDL not run) - skipping payout write, showing preview panel'); showPayday({ lines: detail.lines, total: detail.total, balance: null }); return; }
    writePayout(detail.total, 'season_win', seasonGameId).then(function (r) {
      if (!r.ok) { console.warn(TAG, 'payout not persisted (DDL likely not run); showing preview panel'); showPayday({ lines: detail.lines, total: detail.total, balance: null }); return; }
      showPayday({ lines: detail.lines, total: detail.total, balance: r.balance });
      mountChip();
    });
  }

  // [exhibition payout] additive: AI-exhibition completion trickle (ECONOMY_DESIGN 3).
  // Mirrors afterSeasonResult's fail-loud/DDL-graceful shape. Losses follow the same
  // policy as season losses (no ledger write; consolation is display-only) for consistency.
  function recordExhibitionResult(matchId, userScore, oppScore) {
    var detail = earningsFor(userScore, oppScore, { season: false, exhibition: true });
    if (!detail.win) { console.log(TAG, 'exhibition loss - consolation only, no ledger write'); return; }
    if (_tablesOk === false) { console.warn(TAG, 'wallet tables absent (DDL not run) - skipping exhibition payout, showing preview panel'); showPayday({ lines: detail.lines, total: detail.total, balance: null }); return; }
    writePayout(detail.total, 'exhibition_win', null).then(function (r) {
      if (!r.ok) { console.warn(TAG, 'exhibition payout not persisted (DDL likely not run); showing preview panel'); showPayday({ lines: detail.lines, total: detail.total, balance: null }); return; }
      showPayday({ lines: detail.lines, total: detail.total, balance: r.balance });
      mountChip();
    });
  }

  function hookPayout() {
    if (_hooked) return;
    if (!window.DepotSeason || typeof window.DepotSeason.recordSeasonResult !== 'function') { console.warn(TAG, 'hookPayout: DepotSeason.recordSeasonResult not ready, skipping'); return; }
    var orig = window.DepotSeason.recordSeasonResult;
    window.DepotSeason.recordSeasonResult = function (seasonGameId, userScore, oppScore) {
      var out = orig.apply(this, arguments);
      Promise.resolve(out).then(function () {
        try { afterSeasonResult(seasonGameId, userScore, oppScore); } catch (e) { console.warn(TAG, 'payout hook failed (season result still recorded):', e && e.message); }
      }).catch(function () {});
      return out;
    };
    _hooked = true;
    console.log(TAG, 'payout hook armed around DepotSeason.recordSeasonResult');
  }

  var _authSubbed = false;
  function subscribeAuth() {
    if (_authSubbed) return;
    var client = sb();
    if (!client || !client.auth || typeof client.auth.onAuthStateChange !== 'function') { return; }
    try {
      client.auth.onAuthStateChange(function (event) {
        // mount-before-auth-settles fix: re-mount once the session resolves, without a reload.
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          try { mountChip(); } catch (e) { console.warn(TAG, 'auth re-mount failed:', e && e.message); }
        } else if (event === 'SIGNED_OUT') {
          try { var h = chipHost(); var ex = h && h.querySelector('.depot-wallet-chip'); if (ex) ex.remove(); } catch (e) {}
        }
      });
      _authSubbed = true;
      console.log(TAG, 'auth re-mount subscription armed');
    } catch (e) { console.warn(TAG, 'subscribeAuth failed:', e && e.message); }
  }

  function ready() { hookPayout(); subscribeAuth(); return mountChip(); }

  window.DepotWallet = { CURRENCY: CURRENCY, recordExhibitionResult: recordExhibitionResult, ready: ready, getBalance: getBalance, earningsFor: earningsFor, mountChip: mountChip, hookPayout: hookPayout, showPayday: showPayday };
})();

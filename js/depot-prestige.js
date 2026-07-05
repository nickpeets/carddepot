/*
 * js/depot-prestige.js — Franchise Economy, Slice A prestige engine + UI.
 * See ECONOMY_DESIGN.md. Additive, fail-loud (AGENTS.md 4). Never touches how a
 * card plays — prestige is desirability, it only scales earnings.
 *
 * Exposes window.DepotPrestige:
 *   ready()                    -> Promise (tiers loaded)
 *   compute(card)              -> {total, tier, band, components:[{label,pts}], rookie}
 *   lineupTotal(cards)         -> number
 *   projectedWin(prestige)     -> number  (BASE_WIN + round(prestige * MULT))
 *   decorateBinder()           -> add prestige badges to rendered .card buttons
 *   spotlightBreakdownHTML(card)-> html string for the spotlight
 *   TIER_PTS, BASE_WIN, MULT   -> constants
 */
(function () {
  'use strict';
  var TAG = '[depot] prestige:';
  var TIER_PTS = { HOF: 40, SUPERSTAR: 30, STAR: 20, REGULAR: 8, COMMON: 0 };
  var ROOKIE_PTS = 30, GEM_PTS = 15, FLOOR = 5;
  var BASE_WIN = 100, MULT = 1.8; // WIN = BASE_WIN + round(prestige * MULT) + bonuses

  var _tiers = null, _tiersPromise = null;

  function normName(x) {
    return String(x || '')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function loadTiers() {
    if (_tiersPromise) return _tiersPromise;
    _tiersPromise = fetch('data/player_tiers.json')
      .then(function (r) {
        if (!r.ok) { console.warn(TAG, 'player_tiers.json fetch not ok status', r.status, '- tiers default to COMMON'); return {}; }
        return r.json();
      })
      .then(function (j) { _tiers = (j && j.players) || {}; return _tiers; })
      .catch(function (e) { console.warn(TAG, 'player_tiers.json load failed:', e && e.message, '- tiers default to COMMON'); _tiers = {}; return _tiers; });
    return _tiersPromise;
  }

  function tierFor(name) {
    if (!_tiers) { return 'COMMON'; } // not loaded yet; fail-soft to COMMON
    return _tiers[normName(name)] || 'COMMON';
  }

  function vintageBonus(y) {
    y = parseInt(y, 10) || 0;
    if (!y) return { pts: 0, label: null };
    if (y < 1980) return { pts: 20, label: 'VINTAGE' };
    if (y <= 1989) return { pts: 10, label: 'VINTAGE' };
    if (y <= 1994) return { pts: 6, label: 'ERA' };
    return { pts: 0, label: null };
  }

  function band(total) {
    if (total >= 60) return 'gold';
    if (total >= 30) return 'silver';
    if (total >= 10) return 'bronze';
    return 'plain';
  }

  // rookieYear may be cached on the card (card.rookie_year) once resolved via MLB API.
  // Slice A does not perform the network lookup inline; it honors a cached value if present.
  function compute(card) {
    if (!card) { console.warn(TAG, 'compute called with no card'); return { total: FLOOR, tier: 'COMMON', band: 'plain', components: [], rookie: false }; }
    var comps = [];
    var tier = tierFor(card.name);
    var tpts = TIER_PTS[tier] || 0;
    if (tpts > 0) comps.push({ label: 'STAR', pts: tpts, tier: tier });
    var yr = parseInt(card.yr, 10) || 0;
    var rookie = false;
    var ry = parseInt(card.rookie_year, 10) || 0;
    if (ry && yr && ry === yr) { rookie = true; comps.push({ label: 'ROOKIE', pts: ROOKIE_PTS }); }
    var vb = vintageBonus(yr);
    if (vb.pts > 0) comps.push({ label: vb.label, pts: vb.pts });
    if (card.gem) comps.push({ label: 'GEM', pts: GEM_PTS });
    var total = comps.reduce(function (s, c) { return s + c.pts; }, 0);
    if (total < FLOOR) total = FLOOR;
    return { total: total, tier: tier, band: band(total), components: comps, rookie: rookie };
  }

  function lineupTotal(cards) {
    if (!cards || !cards.length) return 0;
    var t = 0;
    for (var i = 0; i < cards.length; i++) { if (cards[i]) t += compute(cards[i]).total; }
    return t;
  }

  function projectedWin(prestige) {
    prestige = parseInt(prestige, 10) || 0;
    return BASE_WIN + Math.round(prestige * MULT);
  }

  // ---- Binder decoration --------------------------------------------------
  // Adds a prestige badge to each .card button. COLLECTION (index.html) is the
  // source array; card buttons carry onclick="openSpot(IDX)" so we map by index.
  function badgeHTML(res) {
    var stars = Math.max(1, Math.min(5, Math.round(res.total / 16))); // 80 -> 5 stars
    var filled = '';
    for (var i = 0; i < 5; i++) filled += (i < stars ? '\u2605' : '\u2606');
    return '<span class="depot-prestige-badge is-' + res.band + '" title="' + res.total +
      ' prestige">' + res.total + '<span class="dp-stars" aria-hidden="true">' + filled + '</span></span>';
  }

  function decorateBinder() {
    try {
      var coll = (typeof window.COLLECTION !== 'undefined') ? window.COLLECTION : null;
      if (!coll) { console.warn(TAG, 'decorateBinder skipped: window.COLLECTION not present'); return; }
      var cards = document.querySelectorAll('button.card[onclick^="openSpot"]');
      if (!cards.length) { console.warn(TAG, 'decorateBinder: no .card buttons found (binder not rendered yet?)'); return; }
      var n = 0;
      cards.forEach(function (btn) {
        var m = /openSpot\((\d+)\)/.exec(btn.getAttribute('onclick') || '');
        if (!m) return;
        var c = coll[parseInt(m[1], 10)];
        if (!c) return;
        if (btn.querySelector('.depot-prestige-badge')) btn.querySelector('.depot-prestige-badge').remove();
        var res = compute(c);
        var frame = btn.querySelector('.frame') || btn;
        frame.insertAdjacentHTML('afterbegin', badgeHTML(res));
        n++;
      });
      console.log(TAG, 'decorated', n, 'binder cards');
    } catch (e) { console.warn(TAG, 'decorateBinder exception:', e && e.message); }
  }

  // ---- Spotlight breakdown ------------------------------------------------
  function spotlightBreakdownHTML(card) {
    var res = compute(card);
    var rows = res.components.map(function (c) {
      var lab = c.label === 'STAR' ? ('STAR &middot; ' + c.tier) : c.label;
      return '<div class="dp-row"><span>' + lab + '</span><span>+' + c.pts + '</span></div>';
    }).join('');
    if (!rows) rows = '<div class="dp-row"><span>COMMON</span><span>&mdash;</span></div>';
    return '<div class="depot-prestige-breakdown is-' + res.band + '">' +
      '<div class="dp-head"><span class="dp-total">' + res.total + '</span> PRESTIGE &middot; ' + res.band.toUpperCase() + ' TIER</div>' +
      rows +
      '<div class="dp-row dp-total-row"><span>TOTAL PRESTIGE</span><span>' + res.total + '</span></div>' +
      '<div class="dp-note">Desirability, not power &mdash; a card always plays as its card-year self.</div>' +
      '</div>';
  }

  // Wrap openSpot (if present) to inject the breakdown into #spotBack, non-destructively.
  function hookSpotlight() {
    if (typeof window.openSpot !== 'function') { console.warn(TAG, 'hookSpotlight skipped: window.openSpot not a function'); return; }
    if (window.openSpot.__dpWrapped) return;
    var orig = window.openSpot;
    var wrapped = function (idx) {
      var r = orig.apply(this, arguments);
      try {
        var coll = window.COLLECTION;
        var back = document.getElementById('spotBack');
        if (coll && back && coll[idx]) {
          var old = back.querySelector('.depot-prestige-breakdown');
          if (old) old.remove();
          back.insertAdjacentHTML('beforeend', spotlightBreakdownHTML(coll[idx]));
        } else { console.warn(TAG, 'spotlight breakdown skipped: missing', !coll ? 'COLLECTION' : (!back ? '#spotBack' : 'card')); }
      } catch (e) { console.warn(TAG, 'spotlight breakdown exception:', e && e.message); }
      return r;
    };
    wrapped.__dpWrapped = true;
    window.openSpot = wrapped;
    console.log(TAG, 'spotlight hooked');
  }

  function ready() { return loadTiers(); }

  window.DepotPrestige = {
    ready: ready, compute: compute, lineupTotal: lineupTotal, projectedWin: projectedWin,
    decorateBinder: decorateBinder, spotlightBreakdownHTML: spotlightBreakdownHTML,
    hookSpotlight: hookSpotlight, normName: normName,
    TIER_PTS: TIER_PTS, BASE_WIN: BASE_WIN, MULT: MULT
  };

  // Kick off tier load immediately; pages call decorateBinder()/hookSpotlight() after render.
  loadTiers().then(function () { console.log(TAG, 'tiers loaded'); });
})();

/*
 * js/depot-prestige.js - Franchise Economy, Slice A prestige engine.
 * Computes transparent, market-free card prestige from card data +
 * data/player_tiers.json (STAR tiers) + data/set_tiers.json (iconic sets)
 * + a rookie determination. See ECONOMY_DESIGN.md sections 1 and 1.5.
 * Formula (amended): STAR_tier + ROOKIE + ERA(U-curve) + TRANSCENDENCE
 *                    + GEM + ERROR + SET_TIER, floored at 5.
 * Fail-loud: every guard logs [depot] why it bailed.
 */
(function () {
  'use strict';
  var TAG = '[depot] prestige:';

  // Resolve data tables relative to THIS script's URL so paths are correct
  // from any page depth (builder.html lives one level deeper than the repo
  // root; page-relative fetch() 404s there and quietly scored all COMMON).
  var _scriptSrc = (document.currentScript && document.currentScript.src) || '';
  var _dataURL = function (f) {
    try { return new URL('../data/' + f, _scriptSrc).href; }
    catch (e) { return 'data/' + f; }
  };

  var ROOKIE_PTS = 30, TRANSCEND_PTS = 30, GEM_PTS = 15, ERROR_PTS = 25, FLOOR = 5;
  var BASE_WIN = 100, WIN_MULT = 1.8;

  var _players = null, _tierPts = null, _sets = null, _setBonus = null, _ready = null;

  function normName(s) {
    return String(s || '')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function normSet(yr, set) {
    return normName((yr ? yr + ' ' : '') + (set || ''));
  }

  function loadTables() {
    if (_ready) return _ready;
    _ready = Promise.all([
      fetch(_dataURL('player_tiers.json')).then(function (r) { if (!r.ok) throw new Error('player_tiers ' + r.status + ' @ ' + _dataURL('player_tiers.json')); return r.json(); }),
      fetch(_dataURL('set_tiers.json')).then(function (r) { if (!r.ok) throw new Error('set_tiers ' + r.status + ' @ ' + _dataURL('set_tiers.json')); return r.json(); })
    ]).then(function (res) {
      var pt = res[0], st = res[1];
      _players = pt.players || {};
      _tierPts = pt._tiers || { COMMON: 0, REGULAR: 8, STAR: 20, SUPERSTAR: 30, HOF: 40 };
      _sets = st.sets || {};
      _setBonus = st._bonuses || { ICONIC: 20, PREMIUM: 12, NOTABLE: 6 };
      console.log(TAG, 'tables loaded', Object.keys(_players).length, 'players,', Object.keys(_sets).length, 'sets');
      return true;
    }).catch(function (e) {
      console.error(TAG, 'TABLE LOAD FAILED — prestige is NOT reliable, all cards scoring COMMON. Fix the data path:', (e && e.message) || e);
      _players = {}; _tierPts = { COMMON: 0, REGULAR: 8, STAR: 20, SUPERSTAR: 30, HOF: 40 };
      _sets = {}; _setBonus = { ICONIC: 20, PREMIUM: 12, NOTABLE: 6 };
      return false;
    });
    return _ready;
  }

  function tierFor(name) {
    if (!_players) return 'COMMON';
    return _players[normName(name)] || 'COMMON';
  }

  function tierPoints(tier) { return (_tierPts && _tierPts[tier]) || 0; }

  function eraBonus(yr) {
    yr = parseInt(yr, 10) || 0;
    if (!yr) return { pts: 0, label: null };
    if (yr <= 1985) return { pts: 20, label: 'VINTAGE (' + yr + ')' };
    if (yr <= 1993) return { pts: 0,  label: 'JUNK WAX ERA' };
    return { pts: 6, label: 'MODERN (' + yr + ')' };
  }

  function band(total) {
    if (total >= 60) return 'gold';
    if (total >= 30) return 'silver';
    if (total >= 10) return 'bronze';
    return 'plain';
  }

  function compute(card) {
    card = card || {};
    var comps = [];
    var tier = card.tier || tierFor(card.name);
    comps.push({ k: tier, pts: tierPoints(tier) });

    var yr = parseInt(card.yr || card.year, 10) || 0;
    var ry = parseInt(card.rookie_year, 10) || 0;
    var isRookie = ry && yr && ry === yr;
    if (isRookie) comps.push({ k: 'ROOKIE', pts: ROOKIE_PTS });

    var marquee = (tier === 'HOF' || tier === 'SUPERSTAR');
    var transcend = isRookie && marquee;
    var era = eraBonus(yr);
    if (transcend) {
      comps.push({ k: 'TRANSCENDENCE', pts: TRANSCEND_PTS });
      comps.push({ k: era.label || 'ERA', pts: era.pts });
    } else {
      comps.push({ k: era.label || 'ERA', pts: era.pts });
    }

    if (card.gem) comps.push({ k: 'GEM', pts: GEM_PTS });
    if (card.error) comps.push({ k: 'ERROR/VARIATION', pts: ERROR_PTS });

    var sKey = normSet(yr, card.set);
    var sTier = _sets && _sets[sKey];
    if (sTier) comps.push({ k: 'SET: ' + sTier, pts: (_setBonus && _setBonus[sTier]) || 0 });

    var total = 0;
    for (var i = 0; i < comps.length; i++) total += comps[i].pts;
    if (total < FLOOR) total = FLOOR;
    return { total: total, band: band(total), comps: comps };
  }

  function lineupTotal(cards) {
    if (!cards || !cards.length) return 0;
    var t = 0;
    for (var i = 0; i < cards.length; i++) t += compute(cards[i]).total;
    return t;
  }

  function projectedWin(prestige) {
    return BASE_WIN + Math.round((prestige || 0) * WIN_MULT);
  }
  // --- UI: binder badges + spotlight breakdown -------------------------------

  function badgeHTML(res) {
    return '<div class="depot-prestige-badge depot-band-' + res.band + '">' +
           '<span class="dp-num">' + res.total + '</span>' +
           '<span class="dp-lab">PRESTIGE</span></div>';
  }

  function collection() {
    try { return (typeof COLLECTION !== 'undefined' && COLLECTION) || window.COLLECTION || null; }
    catch (e) { return window.COLLECTION || null; }
  }

  function cardIndexOf(el) {
    var oc = el.getAttribute('onclick') || '';
    var m = /openSpot\((\d+)\)/.exec(oc);
    return m ? parseInt(m[1], 10) : -1;
  }

  function decorateBinder() {
    var coll = collection();
    if (!coll) { console.warn(TAG, 'decorateBinder: no COLLECTION, skipping'); return; }
    var grid = document.getElementById('binderGrid');
    if (!grid) { console.warn(TAG, 'decorateBinder: no #binderGrid, skipping'); return; }
    var cards = grid.querySelectorAll('.card');
    var done = 0;
    cards.forEach(function (el) {
      var idx = cardIndexOf(el);
      if (idx < 0 || !coll[idx]) return;
      var old = el.querySelector('.depot-prestige-badge');
      if (old) old.remove();
      var res = compute(coll[idx]);
      var host = el.querySelector('.frame') || el;
      host.insertAdjacentHTML('afterbegin', badgeHTML(res));
      done++;
    });
    console.log(TAG, 'decorated', done, 'of', cards.length, 'binder cards');
  }

  function breakdownHTML(res) {
    var rows = res.comps.map(function (c) {
      var sign = c.pts >= 0 ? '+' : '';
      return '<div class="dp-row"><span class="dp-k">' + String(c.k).toUpperCase() +
             '</span><span class="dp-v">' + sign + c.pts + '</span></div>';
    }).join('');
    return '<div class="depot-prestige-breakdown depot-band-' + res.band + '">' +
           '<div class="dp-head"><span class="dp-total">' + res.total +
           '</span><span class="dp-lab">PRESTIGE</span></div>' + rows + '</div>';
  }

  function renderSpotlightBreakdown(idx) {
    var coll = collection();
    if (!coll || !coll[idx]) { console.warn(TAG, 'spotlight: no card for idx', idx); return; }
    var host = document.getElementById('spotBack') || document.getElementById('spotCard') ||
               document.getElementById('spotlight');
    if (!host) { console.warn(TAG, 'spotlight: no host element, skipping breakdown'); return; }
    var prev = host.querySelector('.depot-prestige-breakdown');
    if (prev) prev.remove();
    host.insertAdjacentHTML('beforeend', breakdownHTML(compute(coll[idx])));
  }

  var _spotHooked = false;
  function hookSpotlight() {
    if (_spotHooked) return;
    if (typeof window.openSpot !== 'function') {
      console.warn(TAG, 'hookSpotlight: window.openSpot not ready, skipping');
      return;
    }
    var orig = window.openSpot;
    window.openSpot = function (idx) {
      var r = orig.apply(this, arguments);
      try { renderSpotlightBreakdown(idx); }
      catch (e) { console.warn(TAG, 'spotlight breakdown failed:', e && e.message); }
      return r;
    };
    _spotHooked = true;
    console.log(TAG, 'spotlight hooked');
  }

  function ready(cb) {
    return loadTables().then(function (ok) { if (typeof cb === 'function') cb(ok); return ok; });
  }

  window.DepotPrestige = {
    ready: ready,
    compute: compute,
    band: band,
    normName: normName,
    tierFor: tierFor,
    lineupTotal: lineupTotal,
    projectedWin: projectedWin,
    decorateBinder: decorateBinder,
    hookSpotlight: hookSpotlight
  };
})();

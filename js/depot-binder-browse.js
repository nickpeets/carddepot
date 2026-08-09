/* js/depot-binder-browse.js - binder BROWSE keys.
 * Group By: Position / Team / Band, all three riding the proven renderGrouped
 * path (labeled sections, same markup as Year/Set). Additive + guarded: this
 * file wraps window.groupKeyFor exactly the way the set-group fix does and
 * never touches renderBinder's flat/pager path.
 *
 * Position resolution order (STARTER_BOX 4.1 / RUNBOOK 5.1 - exact keys, never fuzzy):
 *   1. notes-meta pos, normalized through window.depotNormalizePos
 *   2. data/player_positions.json, keyed by window.depotNormName (depot-position.js).
 *      NOT DepotPrestige.normName: that one deletes dots instead of spacing them,
 *      so "A.J. Achter" keys as "aj achter" and misses the table's "a j achter".
 *   3. Unknown - a null position never means "hitter".
 * Band: the pack band. A binder row carries no pack column, so the only
 * provenance is the "packseed:" receipt the pull writes into notes/bio; cards
 * without it are Common by definition, exactly as specified.
 */
(function () {
  'use strict';
  var TAG = '[depot] browse:';
  var POS_ORDER = ['P', 'SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'IF', 'LF', 'CF', 'RF', 'OF', 'DH', 'UT'];
  var BAND_ORDER = { gold: 0, silver: 1, bronze: 2, plain: 3 };
  var _pos = null, _posState = 'idle';
  var _src = (document.currentScript && document.currentScript.src) || '';
  function dataURL(f) { try { return new URL('../data/' + f, _src).href; } catch (e) { return 'data/' + f; } }
  function ord(n) { return 'a' + String(100 + n); }
  function rerender(modes) {
    try {
      if (typeof window.renderBinder !== 'function') return;
      var m = (typeof groupMode !== 'undefined') ? groupMode : 'era';
      if (modes.indexOf(m) >= 0) window.renderBinder();
    } catch (e) { console.debug(TAG + ' rerender skipped: ' + (e && e.message)); }
  }
  function loadPositions() {
    if (_posState !== 'idle') return;
    _posState = 'loading';
    fetch(dataURL('player_positions.json')).then(function (r) {
      if (!r.ok) throw new Error('player_positions ' + r.status);
      return r.json();
    }).then(function (j) {
      _pos = (j && j.positions) || {};
      _posState = 'ready';
      (window.depotLog||function(){})(TAG, 'positions table loaded,', Object.keys(_pos).length, 'players');
      rerender(['position']);
    }).catch(function (e) {
      _pos = {}; _posState = 'failed';
      console.error(TAG, 'positions table FAILED - Position grouping keeps notes-meta only, the rest lands in Unknown:', (e && e.message) || e);
      rerender(['position']);
    });
  }
  function posFor(card) {
    var meta = (window.depotNormalizePos ? window.depotNormalizePos(card && card.pos) : (card && card.pos)) || null;
    if (meta) return meta;
    if (_posState === 'idle') loadPositions();
    if (!_pos || !window.depotNormName) return null;
    var k = window.depotNormName((card && card.name) || '');
    var v = k ? _pos[k] : null;
    if (!v) return null;
    return window.depotNormalizePos ? (window.depotNormalizePos(v) || null) : v;
  }
  function bandFor(card) {
    var receipt = String((card && card.bio) || '') + ' ' + String((card && card._notes) || '');
    if (!/packseed\s*:/i.test(receipt)) return null;
    var P = window.DepotPrestige;
    if (!P || !P.compute) return null;
    try { var r = P.compute(card); return (r && r.band) || null; }
    catch (e) { console.debug(TAG + ' band compute failed: ' + (e && e.message)); return null; }
  }
  window.depotBrowsePosFor = posFor;
  window.depotBrowseBandFor = bandFor;
  function boot() {
    if (window.__depotBrowseKeys) return;
    if (typeof window.groupKeyFor !== 'function') { return setTimeout(boot, 150); }
    window.__depotBrowseKeys = true;
    var orig = window.groupKeyFor;
    window.groupKeyFor = function (card, mode) {
      if (mode === 'position' && card) {
        var p = posFor(card);
        if (!p) return { key: 'unknown', label: 'Unknown', sort: 'zz' };
        var i = POS_ORDER.indexOf(p);
        return { key: 'pos:' + p, label: p, sort: (i < 0 ? 'y:' + p : ord(i)) };
      }
      if (mode === 'band' && card) {
        var b = bandFor(card);
        if (!b) return { key: 'band:common', label: 'Common', sort: ord(90) };
        return { key: 'band:' + b, label: b.charAt(0).toUpperCase() + b.slice(1), sort: ord(BAND_ORDER[b] != null ? BAND_ORDER[b] : 80) };
      }
      return orig.apply(this, arguments);
    };
    if (window.DepotPrestige && window.DepotPrestige.ready) {
      window.DepotPrestige.ready(function (ok) {
        if (!ok) console.warn(TAG, 'prestige tables did not load - pack cards will all band at the floor');
        rerender(['band']);
      });
    }
    (window.depotLog||function(){})(TAG, 'group keys ready: position, team, band');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* ---------------------------------------------------------------------------
 * browse: MOBILE (<=500px) INFINITE SCROLL.
 * Desktop is untouched by construction: every entry point returns to the
 * shipped renderer unless matchMedia('(max-width:500px)') matches, and the only
 * CSS this feature adds lives inside that same query.
 *   flat (Group By = None) -> one continuous grid, no pager, batched appends
 *   grouped                -> continuous sections, sticky heads, batched appends
 * Art: window.depotEnhanceCardArt runs once per appended batch. depot-library-art
 * bumps a generation counter on every pass and drops older in-flight probes, so a
 * tile whose probe was cancelled keeps its data-lib-front stamp, never gets
 * .has-art, and would be skipped forever by the idempotence guard. Each batch
 * re-arms exactly those tiles first; the probe cache makes the retry instant.
 * Tiles are the app's own background-layer DIVs - this file never creates an <img>.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';
  var TAG = '[depot] browse-scroll:';
  var MQ = '(max-width:500px)';
  var FLAT_BATCH = 12, SEC_BATCH = 3, LOOK = 400;
  var _rgen = 0, _st = null;
  function mobile() { try { return !!(window.matchMedia && window.matchMedia(MQ).matches); } catch (e) { return false; } }
  function el(id) { return document.getElementById(id); }
  function grid() { return el('binderGrid'); }
  function esc(s) { return (typeof window.escAttr === 'function') ? window.escAttr(s) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function rearmStaleArt() {
    var g = grid(); if (!g) return 0;
    var stale = g.querySelectorAll('.dc-tile[data-lib-front]:not(.has-art)');
    for (var i = 0; i < stale.length; i++) stale[i].removeAttribute('data-lib-front');
    return stale.length;
  }
  function enhance() {
    var g = grid(); if (!g) return 0;
    var rearmed = rearmStaleArt();
    try { if (window.depotEnhanceCardArt) window.depotEnhanceCardArt(g, (typeof COLLECTION !== 'undefined') ? COLLECTION : null); }
    catch (e) { console.debug(TAG + ' enhance failed: ' + (e && e.message)); }
    return rearmed;
  }
  function hidePager() { var p = el('binderPager'); if (p) { p.style.display = 'none'; p.setAttribute('data-browse-hid', '1'); } }
  function teardown(restorePager) {
    if (_st) {
      if (_st.io) { try { _st.io.disconnect(); } catch (e) {} }
      if (_st.onScroll) window.removeEventListener('scroll', _st.onScroll);
      if (_st.sentinel && _st.sentinel.parentNode) _st.sentinel.parentNode.removeChild(_st.sentinel);
    }
    _st = null;
    var g = grid(); if (g) g.classList.remove('rd-browse--flow');
    if (restorePager) { var p = el('binderPager'); if (p && p.getAttribute('data-browse-hid') === '1') { p.style.display = ''; p.removeAttribute('data-browse-hid'); } }
  }
  function pump(st) {
    if (!_st || _st !== st || st.gen !== _rgen || st.busy || st.done) return;
    st.busy = true;
    try { st.append(); } catch (e) { st.done = true; console.error(TAG, 'batch append failed:', (e && e.message) || e); }
    st.busy = false;
    if (st.done) {
      if (st.io) { try { st.io.disconnect(); } catch (e2) {} }
      if (st.onScroll) window.removeEventListener('scroll', st.onScroll);
      if (st.sentinel && st.sentinel.parentNode) st.sentinel.parentNode.removeChild(st.sentinel);
      return;
    }
    if (st.sentinel && st.sentinel.parentNode) st.sentinel.parentNode.appendChild(st.sentinel);
    setTimeout(function () {
      if (!_st || _st !== st || st.done) return;
      var r = st.sentinel.getBoundingClientRect();
      if (r.top <= (window.innerHeight || 0) + LOOK) pump(st);
    }, 60);
  }
  function arm(st, host) {
    _st = st;
    var s = document.createElement('div');
    s.className = 'rd-browse__sentinel';
    s.setAttribute('aria-hidden', 'true');
    host.appendChild(s);
    st.sentinel = s;
    if (window.IntersectionObserver) {
      st.io = new IntersectionObserver(function (ents) {
        for (var i = 0; i < ents.length; i++) { if (ents[i].isIntersecting) { pump(st); break; } }
      }, { rootMargin: LOOK + 'px 0px' });
      st.io.observe(s);
    } else {
      st.onScroll = function () { var r = s.getBoundingClientRect(); if (r.top <= (window.innerHeight || 0) + LOOK) pump(st); };
      window.addEventListener('scroll', st.onScroll, { passive: true });
    }
    pump(st);
  }
  function push(host, html) {
    var box = document.createElement('div');
    box.innerHTML = html;
    var n = 0;
    while (box.firstChild) { host.appendChild(box.firstChild); n++; }
    return n;
  }
  function skinFor(c) { try { return (ERAS[c.era] && ERAS[c.era].skin) || ''; } catch (e) { return ''; } }
  function byYearThenNum(x, y) {
    return (x.yr || 0) - (y.yr || 0) || ((x.numSort != null ? x.numSort : parseInt(x.num) || 0) - (y.numSort != null ? y.numSort : parseInt(y.num) || 0));
  }
  function mobileFlat() {
    var g = grid(); if (!g || typeof window.cardHTML !== 'function' || typeof window.eraCards !== 'function') return false;
    teardown(false);
    if (typeof window.showEraChrome === 'function') window.showEraChrome(true);
    if (typeof window.renderEraTabs === 'function') window.renderEraTabs();
    try { var E = ERAS[curEra]; if (E) { var t = el('eraTitle'), b = el('eraBlurb'); if (t) t.textContent = E.title; if (b) b.textContent = E.blurb; } } catch (e) {}
    hidePager();
    var cards = window.eraCards(curEra);
    if (!cards.length) return false;
    g.innerHTML = ''; g.classList.add('rd-browse--flow');
    var st = { kind: 'flat', gen: ++_rgen, i: 0, total: cards.length, busy: false, done: false };
    st.append = function () {
      var end = Math.min(st.i + FLAT_BATCH, st.total), html = '';
      for (var k = st.i; k < end; k++) {
        var c = cards[k];
        html += '<div class="slot">' + window.cardHTML(c, COLLECTION.indexOf(c), skinFor(c)) + '</div>';
      }
      push(g, html);
      st.i = end;
      if (st.i >= st.total) st.done = true;
      enhance();
      var d = el('pageDots');
      if (d) d.textContent = st.i + ' of ' + st.total + (st.total === 1 ? ' card' : ' cards');
      return end;
    };
    arm(st, g);
    return true;
  }
  function mobileGrouped() {
    var g = grid(); if (!g || typeof window.cardHTML !== 'function' || typeof window.eraCards !== 'function' || typeof window.groupKeyFor !== 'function') return false;
    var mode = (typeof groupMode !== 'undefined') ? groupMode : 'era';
    var cards = window.eraCards(curEra);
    var buckets = {}, keys = [];
    cards.forEach(function (c) {
      var k = window.groupKeyFor(c, mode);
      if (!buckets[k.key]) { buckets[k.key] = { label: k.label, sort: k.sort, cards: [] }; keys.push(k.key); }
      buckets[k.key].cards.push(c);
    });
    if (!keys.length) return false;
    teardown(false);
    if (typeof window.showEraChrome === 'function') window.showEraChrome(false);
    var numeric = (mode === 'year' || mode === 'decade' || mode === 'era');
    keys.sort(function (a, b) {
      var A = buckets[a], B = buckets[b], aU = (a === 'unknown'), bU = (b === 'unknown');
      if (aU && !bU) return 1; if (bU && !aU) return -1;
      if (numeric) return (A.sort || 0) - (B.sort || 0);
      return String(A.sort).localeCompare(String(B.sort));
    });
    var LABELS = { year: 'Year', set: 'Set', brand: 'Brand', team: 'Team', player: 'Player', decade: 'Decade', position: 'Position', band: 'Band' };
    var head = el('eraTitle'); if (head) head.textContent = 'Grouped by ' + (LABELS[mode] || 'Era');
    g.innerHTML = ''; g.classList.add('rd-browse--flow');
    var st = { kind: 'grouped', gen: ++_rgen, s: 0, total: keys.length, cardsTotal: cards.length, shown: 0, busy: false, done: false };
    st.append = function () {
      var end = Math.min(st.s + SEC_BATCH, st.total), html = '';
      for (var i = st.s; i < end; i++) {
        var b = buckets[keys[i]];
        b.cards.sort(byYearThenNum);
        html += '<section class="group-section rd-group"><h3 class="group-head rd-group__head">' + esc(b.label) + ' <span class="group-count rd-group__count">' + b.cards.length + (b.cards.length === 1 ? ' card' : ' cards') + '</span></h3><div class="grid group-grid rd-group__grid">';
        for (var j = 0; j < b.cards.length; j++) {
          var c = b.cards[j];
          html += '<div class="slot">' + window.cardHTML(c, COLLECTION.indexOf(c), skinFor(c)) + '</div>';
        }
        html += '</div></section>';
        st.shown += b.cards.length;
      }
      push(g, html);
      st.s = end;
      if (st.s >= st.total) st.done = true;
      enhance();
      var d = el('pageDots');
      if (d) d.textContent = st.s + ' of ' + st.total + (st.total === 1 ? ' section' : ' sections') + ' \u00b7 ' + st.shown + ' of ' + st.cardsTotal + (st.cardsTotal === 1 ? ' card' : ' cards');
      return end;
    };
    arm(st, g);
    return true;
  }
  function install() {
    if (window.__depotBrowseScroll) return;
    if (typeof window.renderBinder !== 'function' || typeof window.renderGrouped !== 'function') { return setTimeout(install, 150); }
    window.__depotBrowseScroll = true;
    var origRB = window.renderBinder, origRG = window.renderGrouped;
    window.renderBinder = function () {
      if (!mobile()) { teardown(true); return origRB.apply(this, arguments); }
      var m = (typeof groupMode !== 'undefined') ? groupMode : 'era';
      if (m && m !== 'era') return window.renderGrouped.apply(this, arguments);
      if (mobileFlat()) return;
      var r = origRB.apply(this, arguments); hidePager(); return r;
    };
    window.renderGrouped = function () {
      if (!mobile()) { teardown(true); return origRG.apply(this, arguments); }
      if (mobileGrouped()) return;
      return origRG.apply(this, arguments);
    };
    if (window.matchMedia) {
      var mq = window.matchMedia(MQ);
      var onChange = function () { teardown(true); try { window.renderBinder(); } catch (e) { console.debug(TAG + ' breakpoint re-render skipped: ' + (e && e.message)); } };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
    var _wasMobile = mobile(), _rzT = null;
    window.addEventListener('resize', function () {
      if (_rzT) clearTimeout(_rzT);
      _rzT = setTimeout(function () {
        var now = mobile();
        if (now === _wasMobile) return;
        _wasMobile = now;
        teardown(true);
        try { window.renderBinder(); } catch (e) { console.debug(TAG + ' resize re-render skipped: ' + (e && e.message)); }
      }, 150);
    });
    window.depotBrowseScrollState = function () {
      if (!_st) return null;
      return { kind: _st.kind, gen: _st.gen, done: _st.done, flatShown: _st.i, sectionsShown: _st.s, total: _st.total, cardsShown: _st.shown, cardsTotal: _st.cardsTotal, sentinelAttached: !!(_st.sentinel && _st.sentinel.parentNode) };
    };
    (window.depotLog||function(){})(TAG, 'mobile continuous scroll armed at <=500px');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();

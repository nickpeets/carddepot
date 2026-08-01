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
      console.log(TAG, 'positions table loaded,', Object.keys(_pos).length, 'players');
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
    console.log(TAG, 'group keys ready: position, team, band');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

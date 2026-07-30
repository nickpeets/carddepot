/* ============================================================================
   depot-library-index.js - the set of catalog keys that HAVE library front art.
   ----------------------------------------------------------------------------
   Task D: "any card grabbable via pack shop must have an image." The pack roll
   is client-side (js/depot-pack-engine.js rolls, the RPCs only move money and
   record the grant), so the filter belongs here: read the art-backed keys once
   and hand DepotShop.loadCatalog() a pool it can safely roll from.

   SOURCE: public.card_library (world-readable), one row per (catalog_key, side).
   We take side='front' + status='active' -- a card with only a back scan cannot
   paint a reveal, so it does not qualify.

   COST: PostgREST caps a page at 1000 rows, so ~89 pages at 8-way concurrency.
   Measured live: 88,119 keys in 3.2s, cached for the life of the page. A static
   build-time manifest would remove the round trips entirely -- scoped as a
   follow-up in db/proposals/FUTURE_ITEMS.md.

   FAILS OPEN. If the index cannot be read we resolve null and the caller ships
   the unfiltered catalog: a missing image is a blemish, a dead shop is an
   outage. Fail-loud logging per AGENTS.md 4.
   ========================================================================== */
(function () {
  'use strict';
  var TAG = '[depot][library-index]';
  var PAGE = 1000;
  var LANES = 8;
  var _promise = null;
  var _stats = null;

  function sb() {
    try { return (typeof window.depotSB === 'function') ? window.depotSB() : null; }
    catch (e) { return null; }
  }

  function fetchPage(client, from) {
    return client.from('card_library')
      .select('catalog_key')
      .eq('side', 'front')
      .eq('status', 'active')
      .order('catalog_key')
      .range(from, from + PAGE - 1)
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        return r.data || [];
      });
  }

  function load() {
    if (_promise) return _promise;
    var client = sb();
    if (!client) {
      console.warn(TAG + ' no supabase client; art filter disabled (catalog ships unfiltered)');
      _promise = Promise.resolve(null);
      return _promise;
    }
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    _promise = client.from('card_library')
      .select('catalog_key', { count: 'exact', head: true })
      .eq('side', 'front').eq('status', 'active')
      .then(function (head) {
        if (head.error) throw new Error(head.error.message);
        var total = head.count || 0;
        if (!total) throw new Error('card_library reports 0 front rows');
        var starts = [];
        for (var a = 0; a < total; a += PAGE) starts.push(a);
        var keys = new Set();
        var i = 0;
        function lane() {
          if (i >= starts.length) return Promise.resolve();
          var from = starts[i++];
          return fetchPage(client, from).then(function (rows) {
            for (var k = 0; k < rows.length; k++) keys.add(rows[k].catalog_key);
            return lane();
          });
        }
        var lanes = [];
        for (var L = 0; L < LANES; L++) lanes.push(lane());
        return Promise.all(lanes).then(function () {
          var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
          _stats = { keys: keys.size, reported: total, ms: Math.round(t1 - t0) };
          console.log(TAG + ' ' + keys.size + ' art-backed keys in ' + _stats.ms + 'ms');
          if (keys.size < total) {
            console.warn(TAG + ' fetched ' + keys.size + ' of ' + total + ' reported rows');
          }
          return keys;
        });
      })
      .catch(function (e) {
        console.error(TAG + ' load failed: ' + (e && (e.message || e)) + ' -- catalog ships unfiltered');
        return null;
      });
    return _promise;
  }

  window.DepotLibraryIndex = {
    load: load,
    stats: function () { return _stats; },
    reset: function () { _promise = null; _stats = null; }
  };
  console.log(TAG + ' loaded');
})();

/* ============================================================================
   depot-pack-history.js -- what was actually IN a pack.
   ----------------------------------------------------------------------------
   Pack History used to be a shelf of receipts: tier, date, count. The cards a
   pack produced were only visible by replaying the ceremony, and the shelf was
   localStorage-only, so a pack opened in another browser (or before the shelf
   existed) was invisible. Nick's July bronze pack was in that hole: all five
   cards were in the binder the whole time, but nothing on the page said so.
   This module answers one question per row -- WHICH CARDS -- and answers it
   from the LEDGER, not from a re-roll.

   WHY LEDGER-FIRST (measured, not assumed). rollPack is deterministic in
   (seed, catalog, tier) -- but the CATALOG is not a constant. PR #194 gated the
   roll pool to art-backed cards, 155,844 rows -> 84,272. Re-rolling seed
   1335568119 against the July pool reproduces Nick's five exactly; re-rolling
   it against today's pool returns five completely different cards. A seed is
   therefore NOT a stable name for a historical pack, and a history view built
   on re-rolls would confidently show cards Nick never owned. public.cards
   (pack_seed stamped at grant time) and public.pack_grants are the record.
   The re-roll survives only as a clearly-labelled fallback for a local receipt
   that has no rows behind it -- e.g. a pack opened while signed out.

   Reads only. No writes, no money, no grants.
   ========================================================================== */
(function () {
  'use strict';
  var TAG = '[depot] pack-history:';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i;

  function sb() {
    try { return (typeof window.depotSB === 'function') ? window.depotSB() : null; }
    catch (e) { console.warn(TAG + ' depotSB threw: ' + ((e && e.message) || e)); return null; }
  }
  function isCardId(v) { return UUID.test(String(v == null ? '' : v)); }
  function seedInt(v) { var n = parseInt(v, 10); return isFinite(n) ? n : null; }

  /* ---- the shelf: local receipts + the pack_grants ledger ---------------- */
  /* The ledger is owner-scoped by RLS, so this returns exactly the signed-in
     collector's packs and nothing else. Signed out, it returns [] and the
     shelf falls back to whatever this browser remembers. */
  function ledgerShelf() {
    var c = sb();
    if (!c) { console.warn(TAG + ' no supabase client; shelf is local-only'); return Promise.resolve([]); }
    return c.from('pack_grants')
      .select('pack_seed,tier,card_count,created_at')
      .order('created_at', { ascending: false }).limit(60)
      .then(function (r) {
        if (r.error) { console.warn(TAG + ' ledger read failed: ' + r.error.message); return []; }
        return (r.data || []).map(function (g) {
          return { tier: g.tier || 'bronze', seed: g.pack_seed, count: g.card_count || 5, at: g.created_at, ledger: true };
        });
      })
      .catch(function (e) { console.warn(TAG + ' ledger read threw: ' + ((e && e.message) || e)); return []; });
  }

  /* Merge the ledger over the local shelf. Key is tier:seed, ledger wins, and
     a local receipt the ledger does not know about (signed-out rip, free pack)
     is kept rather than dropped. */
  function mergeShelf(local, ledger) {
    var out = [], seen = {}, i;
    function add(e) {
      if (!e || e.seed == null) return;
      var k = String(e.tier || '') + ':' + String(e.seed);
      if (seen[k]) return;
      seen[k] = 1; out.push(e);
    }
    for (i = 0; i < (ledger || []).length; i++) add(ledger[i]);
    for (i = 0; i < (local || []).length; i++) add(local[i]);
    out.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
    return out;
  }

  function shelf(localList) {
    return ledgerShelf().then(function (rows) {
      var merged = mergeShelf(localList || [], rows);
      (window.depotLog||function(){})(TAG + ' shelf: ' + merged.length + ' pack(s) (' + rows.length + ' from the ledger, ' + ((localList || []).length) + ' local)');
      return merged;
    });
  }

  /* ---- the contents of one pack ---------------------------------------- */
  function shapeRow(r) {
    return { id: r.id, year: r.year, set: r.set || r.brand || '', number: r.number, player: r.player || '', team: r.team || '', owned: true };
  }

  /* Paid packs stamp cards.pack_seed at grant time; the free daily shelves the
     granted card_id as its 'seed' (see recordPackHistory in depot-shop-view).
     Both are answerable straight from the cards table, owner-scoped by RLS. */
  function ledgerCards(entry) {
    var c = sb();
    if (!c) { console.warn(TAG + ' no client; cannot read pack contents'); return Promise.resolve(null); }
    var cols = 'id,year,brand,set,number,player,team,created_at';
    var q;
    if (isCardId(entry.seed)) q = c.from('cards').select(cols).eq('id', entry.seed);
    else {
      var s = seedInt(entry.seed);
      if (s == null) { console.warn(TAG + ' entry seed is neither a card id nor an integer: ' + entry.seed); return Promise.resolve(null); }
      q = c.from('cards').select(cols).eq('pack_seed', s).order('created_at', { ascending: true });
    }
    return q.then(function (r) {
      if (r.error) { console.warn(TAG + ' contents read failed for ' + entry.seed + ': ' + r.error.message); return null; }
      var rows = r.data || [];
      return rows.length ? rows.map(shapeRow) : null;
    }).catch(function (e) { console.warn(TAG + ' contents read threw: ' + ((e && e.message) || e)); return null; });
  }

  /* Fallback only. Labelled as a re-roll everywhere it surfaces, because the
     pool it draws from is today's, not the pack's. */
  function rerollCards(entry, catalog) {
    var Eng = window.DepotPackEngine;
    if (!Eng || !Eng.rollPack) { console.warn(TAG + ' no pack engine for the re-roll fallback'); return null; }
    if (!catalog || !catalog.length) { console.warn(TAG + ' no catalog for the re-roll fallback'); return null; }
    var s = seedInt(entry.seed);
    if (s == null) { console.warn(TAG + ' re-roll needs an integer seed; got ' + entry.seed); return null; }
    try {
      var tier = (entry.tier === 'free') ? 'free' : entry.tier;
      var pack = (tier === 'free' && Eng.rollFree)
        ? Eng.rollFree({ catalog: catalog, seed: s, prestige: window.DepotPrestige })
        : Eng.rollPack({ tier: tier, catalog: catalog, seed: s, prestige: window.DepotPrestige });
      return (pack.cards || []).map(function (c) {
        return { id: null, year: c.year, set: c.set || c.brand || '', number: c.number, player: c.player || c.name || '', team: c.team || '', owned: false };
      });
    } catch (e) {
      console.warn(TAG + ' re-roll failed for seed ' + entry.seed + ': ' + ((e && e.message) || e));
      return null;
    }
  }

  /* { source: 'ledger'|'reroll'|'none', cards: [] }. Memoized per tier:seed so
     opening and closing a row does not re-query. */
  var _cache = {};
  function contents(entry, catalog) {
    if (!entry || entry.seed == null) return Promise.resolve({ source: 'none', cards: [] });
    var k = String(entry.tier || '') + ':' + String(entry.seed);
    if (_cache[k]) return _cache[k];
    _cache[k] = ledgerCards(entry).then(function (rows) {
      if (rows && rows.length) return { source: 'ledger', cards: rows };
      var rr = rerollCards(entry, catalog);
      if (rr && rr.length) {
        console.warn(TAG + ' no rows for ' + k + '; falling back to a re-roll of today\u2019s pool (contents are indicative, not the pack)');
        return { source: 'reroll', cards: rr };
      }
      return { source: 'none', cards: [] };
    });
    return _cache[k];
  }
  function reset() { _cache = {}; }

  /* ---- linking a listed card to its binder spotlight -------------------- */
  /* On the binder the spotlight is in this document, so open it directly. From
     game/shop.html there is no binder to open: hand off with ?card=<id>, which
     index.html consumes after its collection load. */
  function openCard(id) {
    if (!id) { console.warn(TAG + ' openCard called with no id'); return false; }
    try {
      if (typeof window.depotOpenSpotById === 'function' && window.depotOpenSpotById(id)) return true;
    } catch (e) { console.warn(TAG + ' depotOpenSpotById threw: ' + ((e && e.message) || e)); }
    var href = (/\/game\//.test(location.pathname || '') ? '../index.html' : 'index.html') + '?card=' + encodeURIComponent(id);
    (window.depotLog||function(){})(TAG + ' no in-page binder; handing off to ' + href);
    location.href = href;
    return true;
  }

  window.DepotPackHistory = { shelf: shelf, contents: contents, reset: reset, openCard: openCard, mergeShelf: mergeShelf };
  (window.depotLog||function(){})(TAG + ' ready');
})();

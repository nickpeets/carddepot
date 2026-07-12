/*
 * js/depot-shop.js  --  Pack Shop controller (buy flow + odds + balance).
 *
 * Renders the three tiers (150/400/900) with published odds from
 * DepotPackEngine.estimateOdds(), shows the live wallet balance, and runs the
 * buy flow against the depot_purchase_pack(p_cost, p_tier) RPC.
 *
 * MONEY SAFETY (failure-ordering, per ECONOMY_DESIGN 7 + Nick's requirement):
 *   1. ROLL the pack (seeded, DepotPackEngine) and PERSIST a receipt to
 *      localStorage BEFORE calling the RPC.
 *   2. Call the RPC (the atomic debit + floor check + ledger insert).
 *   3a. On SUCCESS: stamp the receipt with the returned balance. If the rip
 *       screen (Part 3) is not present, show a clean "pack saved, opening
 *       arrives next update" state and LEAVE the receipt for Part 3 to honor
 *       as its first act. A debit therefore can never strand value.
 *   3b. On REFUSAL ('insufficient funds') or any RPC error: CLEAR the receipt
 *       (no value moved) and show a clean fail-loud state.
 *
 * DDL-graceful: if the RPC/tables are absent, we detect the error and show a
 * "shop offline (DDL not run)" state instead of crashing (mirrors depot-wallet).
 */
(function () {
  var TAG = '[depot] shop:';
  var RECEIPT_KEY = 'depot.pendingPack';
  var CURRENCY = (window.DepotWallet && window.DepotWallet.CURRENCY) || 'DD';

  var TIER_ORDER = ['bronze', 'silver', 'gold'];
  var TIER_COPY = {
    bronze: { name: 'BRONZE PACK', desc: '5 cards \u00b7 mostly commons \u00b7 small shot at a silver.' },
    silver: { name: 'SILVER PACK', desc: '5 cards \u00b7 guaranteed 1 silver+ \u00b7 better vintage odds.' },
    gold:   { name: 'GOLD PACK',   desc: '5 cards \u00b7 guaranteed rare \u00b7 real shot at a gold rookie.' }
  };

  function sb() { try { return (typeof window.depotSB === 'function') ? window.depotSB() : null; } catch (e) { return null; } }

// ---- catalog loading: flatten data/cards-YYYY.json into one array w/ .year ----
// SOURCE OF TRUTH: the year span comes from data/index.json (the checklist pipeline's
// manifest, 1980-2026), never a hardcoded literal, so the pool can't drift from the data.
function catalogYears() {
  return fetch('../data/index.json')
    .then(function (r) { if (!r.ok) throw new Error('index.json ' + r.status); return r.json(); })
    .then(function (idx) {
      var ys = (idx && idx.years) ? idx.years.map(function (y) { return parseInt(y, 10); }) : [];
      if (!ys.length) throw new Error('index.json has no years');
      return ys;
    });
}
// ADAPTER: catalog rows expose the player name under .player and have NO .name field,
// but DepotPrestige.compute() reads card.name for tierFor(). Every consumer of catalog
// rows through the prestige engine (pack rip, shared library, league draft) MUST route
// cards through this shape adapter or they will silently score COMMON (zero tier points).
function catalogCardToPrestigeShape(c, y) {
  if (c.year == null) c.year = y;
  if (c.name == null && c.player != null) c.name = c.player;
  return c;
}
function loadCatalog() {
  return catalogYears().then(function (years) {
    return Promise.all(years.map(function (y) {
      return fetch('../data/cards-' + y + '.json')
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (arr) { return (arr || []).map(function (c) { return catalogCardToPrestigeShape(c, y); }); })
        .catch(function () { return []; });
    })).then(function (chunks) {
      var all = []; chunks.forEach(function (c) { all = all.concat(c); }); return all;
    });
  });
}

  // ---- receipt (money-safety) ----
  function saveReceipt(rec) { try { localStorage.setItem(RECEIPT_KEY, JSON.stringify(rec)); } catch (e) {} }
  function clearReceipt() { try { localStorage.removeItem(RECEIPT_KEY); } catch (e) {} }
  function cardId(c) { return [c.year, c.brand, c.set, c.number, c.player].join('|'); }

  // ---- balance ----
  function getBalance() {
    if (window.DepotWallet && window.DepotWallet.getBalance) return window.DepotWallet.getBalance();
    return Promise.resolve(null);
  }

  // ---- the buy flow ----
  function buy(tier, catalog, balance, ui) {
    var cfg = window.DepotPackEngine.tierConfig(tier);
    if (!cfg) { ui.fail('Unknown tier.'); return; }

    // 1) ROLL + PERSIST receipt BEFORE any debit.
    var seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    var pack;
    try {
      pack = window.DepotPackEngine.rollPack({ tier: tier, catalog: catalog, seed: seed, prestige: window.DepotPrestige });
    } catch (e) {
      ui.fail('Could not build pack: ' + (e && e.message || e));
      return;
    }
    var receipt = {
      tier: tier, seed: seed, cost: cfg.price,
      cardIds: pack.cards.map(cardId),
      hitIndex: pack.hitIndex,
      ts: Date.now(), balanceAfter: null, status: 'rolled'
    };
    saveReceipt(receipt);
    console.log(TAG + ' receipt persisted BEFORE debit', receipt);

    // 2) Call the atomic RPC.
    var client = sb();
    if (!client || !client.rpc) {
      // DDL-graceful: cannot reach RPC at all -> no debit happened, clear receipt.
      clearReceipt();
      console.warn(TAG + ' no supabase client / rpc (DDL likely not run) -- shop offline');
      ui.offline();
      return;
    }
    ui.pending();
    client.rpc('depot_purchase_pack', { p_cost: cfg.price, p_tier: tier })
      .then(function (res) {
        if (res && res.error) {
          var msg = (res.error.message || '') + '';
          clearReceipt(); // 3b: no value moved
          if (/insufficient funds/i.test(msg)) {
            console.warn(TAG + ' RPC refused: ' + msg + ' (receipt cleared, no ledger row)');
            // Re-read the live balance so the refusal shows the real number, not a stale pre-auth read. (fix/shop-auth-settle)
            Promise.resolve(getBalance()).then(function (freshBal) {
              ui.insufficient(cfg.price, (freshBal != null ? freshBal : balance));
            }).catch(function () { ui.insufficient(cfg.price, balance); });
          } else if (/not authenticated/i.test(msg)) {
            ui.fail('Please sign in to buy packs.');
          } else if (/does not exist|schema cache|not find|function/i.test(msg)) {
            console.warn(TAG + ' RPC absent (DDL likely not run): ' + msg);
            ui.offline();
          } else {
            console.warn(TAG + ' RPC error: ' + msg);
            ui.fail(msg);
          }
          return;
        }
        // 3a: SUCCESS. Stamp balance; if rip (Part 3) absent, keep receipt + show saved state.
        var newBal = (res && typeof res.data === 'number') ? res.data : null;
        receipt.balanceAfter = newBal; receipt.status = 'debited';
        saveReceipt(receipt);
        console.log(TAG + ' purchase OK, new balance ' + newBal + '. Receipt retained for rip.', receipt);
        if (window.DepotPackRip && window.DepotPackRip.open) {
          window.DepotPackRip.open(receipt, pack); // Part 3 will honor + then clear
        } else {
          ui.savedNoRip(newBal); // clean state; receipt LEFT for Part 3 to honor
        }
      })
      .catch(function (e) {
        // Network/unknown throw AFTER receipt saved but we cannot confirm debit.
        // Do NOT clear: leave receipt so a debit (if it happened) is recoverable.
        console.error(TAG + ' RPC threw; receipt RETAINED for recovery:', e && e.message || e);
        ui.fail('Purchase could not be confirmed. Your attempt is saved; refresh to check balance.');
      });
  }

  window.DepotShop = {
    RECEIPT_KEY: RECEIPT_KEY,
    TIER_ORDER: TIER_ORDER,
    TIER_COPY: TIER_COPY,
    loadCatalog: loadCatalog,
    getBalance: getBalance,
    buy: buy,
    saveReceipt: saveReceipt,
    clearReceipt: clearReceipt
  };
  try { console.log(TAG + ' controller ready'); } catch (e) {}
})();

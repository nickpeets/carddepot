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

  // Resolve data files relative to THIS script's URL so fetch() works from any
  // page depth (index.html at root, game/shop.html one level deeper). Page-relative
  // '../data/' 404s at root -> 'shop failed to load'. Mirrors depot-prestige _dataURL.
  var _scriptSrc = (document.currentScript && document.currentScript.src) || '';
  var _dataURL = function (f) {
    try { return new URL('../data/' + f, _scriptSrc).href; }
    catch (e) { return '../data/' + f; }
  };

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
  return fetch(_dataURL('index.json'))
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
/* Task D -- ART GATE ON THE ROLL POOL.
 * Nick's rule: any card grabbable via pack shop must have an image. The roll is
 * client-side (the RPCs only move money / record the grant), so both the paid
 * and the free path get the gate for free by filtering the pool HERE, once,
 * before rollPack / rollFree / redeem ever see it.
 *
 * DETERMINISM: rollPack is deterministic in (seed, catalog, tier). Narrowing the
 * catalog therefore changes what a historical seed reproduces. That is accepted
 * for future rolls; the pack_grants ledger is the record of what was actually
 * granted and is untouched. See the PR body + FUTURE_ITEMS.
 *
 * FAILS OPEN: no index, or a filter that would empty the pool, ships the raw
 * catalog rather than breaking the shop.
 */
function artKeyOf(c) {
  return (typeof window.depotCatalogArtKey === 'function') ? window.depotCatalogArtKey(c) : '';
}
function filterToArtBacked(all) {
  if (!window.DepotLibraryIndex || typeof window.DepotLibraryIndex.load !== 'function') {
    console.warn(TAG + ' art index module missing; rolling the UNFILTERED catalog');
    return Promise.resolve(all);
  }
  if (typeof window.depotCatalogArtKey !== 'function') {
    console.warn(TAG + ' depotCatalogArtKey missing (depot-library-art.js not loaded); rolling the UNFILTERED catalog');
    return Promise.resolve(all);
  }
  return window.DepotLibraryIndex.load().then(function (keys) {
    if (!keys || !keys.size) {
      console.warn(TAG + ' no art index; rolling the UNFILTERED catalog (' + all.length + ' rows)');
      return all;
    }
    var out = [];
    for (var i = 0; i < all.length; i++) { if (keys.has(artKeyOf(all[i]))) out.push(all[i]); }
    if (!out.length) {
      console.error(TAG + ' art filter emptied the catalog; rolling the UNFILTERED catalog');
      return all;
    }
    (window.depotLog||function(){})(TAG + ' art-backed roll pool: ' + out.length + '/' + all.length +
                ' (' + (out.length / all.length * 100).toFixed(1) + '%)');
    return out;
  }).catch(function (e) {
    console.error(TAG + ' art filter threw: ' + (e && (e.message || e)) + '; rolling the UNFILTERED catalog');
    return all;
  });
}
function loadCatalog() {
  return catalogYears().then(function (years) {
    return Promise.all(years.map(function (y) {
      return fetch(_dataURL('cards-' + y + '.json'))
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (arr) { return (arr || []).map(function (c) { return catalogCardToPrestigeShape(c, y); }); })
        .catch(function () { return []; });
    })).then(function (chunks) {
      var all = []; chunks.forEach(function (c) { all = all.concat(c); });
      return filterToArtBacked(all);
    });
  });
}

  // ---- receipt (money-safety) ----
  /* [storage-scoping] depot.pendingPack was one GLOBAL key per browser -- the
   * same leak family as depot.packHistory, and worse: a pending (debited, not
   * yet ripped) receipt gates a GRANT, so account B redeeming account A's
   * receipt mints A's pack into B's binder. Keys are uid-suffixed
   * (depot.pendingPack.<uid>) via the same sync source season.js UID() uses.
   * Receipts also STAMP rec.owner at save time; redeemPending refuses an
   * owner-mismatched receipt loudly and keeps it (money-safe: it belongs to
   * the account that paid, and redeems when THEY sign in). Legacy unstamped
   * receipts (written before this landed) behave exactly as today -- their
   * owner is unknowable retroactively. loadReceipt remembers which key it
   * read so clearReceipt clears the right one and never another account's. */
  function receiptKey(){ var u=(window.depotUserCached&&window.depotUserCached.id)||null; return u?(RECEIPT_KEY+'.'+u):RECEIPT_KEY; }
  var _receiptSrcKey=null;
  function saveReceipt(rec) { try { var u=(window.depotUserCached&&window.depotUserCached.id)||null; if(u&&rec&&!rec.owner) rec.owner=u; var k=receiptKey(); localStorage.setItem(k, JSON.stringify(rec)); _receiptSrcKey=k; } catch (e) {} }
  function clearReceipt() { try { localStorage.removeItem(receiptKey()); if(_receiptSrcKey) localStorage.removeItem(_receiptSrcKey); _receiptSrcKey=null; } catch (e) {} }
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
    (window.depotLog||function(){})(TAG + ' receipt persisted BEFORE debit', receipt);

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
              ui.insufficient(cfg.price, (freshBal != null ? freshBal : balance), msg);
            }).catch(function () { ui.insufficient(cfg.price, balance, msg); });
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
        (window.depotLog||function(){})(TAG + ' purchase OK, new balance ' + newBal + '. Receipt retained for rip.', receipt);
        // A debit just completed; receipt is stamped 'debited'. Honor it NOW:
        // never leave a paid pack un-opened. Prefer the caller's rip hook
        // (redeemPending -> grant + ceremony); fall back to the unmissable
        // "PACK SAVED - OPENING..." state which redeems on next shop load.
        if (ui && typeof ui.rip === 'function') {
          ui.rip(newBal, receipt); // grants the 5 cards + plays the ceremony, then clears
        } else {
          ui.savedNoRip(newBal); // unmissable saved state; redeemPending honors it on next load
        }
      })
      .catch(function (e) {
        // Network/unknown throw AFTER receipt saved but we cannot confirm debit.
        // Do NOT clear: leave receipt so a debit (if it happened) is recoverable.
        console.error(TAG + ' RPC threw; receipt RETAINED for recovery:', e && e.message || e);
        ui.fail('Purchase could not be confirmed. Your attempt is saved; refresh to check balance.');
      });
  }

  // ---- the FREE DAILY claim flow ----
  // Client rolls ONE card from the engine free pool, then hands it to the server RPC.
  // The RPC is the cooldown clock + the atomic grant (owner-scoped card insert, source:pack)
  // + the 0-amount free_pack ledger row. Server never trusts the roll for money (there is none).
  function claimFree(catalog, ui) {
    var Eng = window.DepotPackEngine;
    if (!Eng || !Eng.rollFree) { ui.fail("Free pack engine unavailable."); return; }
    // 1) ROLL one card from the free pool.
    var seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    var pack;
    try {
      pack = Eng.rollFree({ catalog: catalog, seed: seed, prestige: window.DepotPrestige });
    } catch (e) { ui.fail("Could not roll free card: " + (e && e.message || e)); return; }
    var card = pack.cards[0];
    // Band is the card\'s own prestige tier (fixed 10/30/60 bands) — used for the ledger label + reveal styling.
    var pr = (window.DepotPrestige && window.DepotPrestige.compute) ? window.DepotPrestige.compute(card) : null;
    var band = (pr && pr.band) || "bronze";
    // 2) Build the jsonb payload the RPC expects (identity only; never money).
    var p_card = {
      year: (card.year != null ? String(card.year) : ""),
      brand: card.brand || "", set: card.set || "", number: (card.number != null ? String(card.number) : ""),
      player: card.player || card.name || "", team: card.team || "",
      rookie_year: (card.rookie_year != null ? String(card.rookie_year) : ""),
      tier: band
    };
    var client = sb();
    if (!client || !client.rpc) {
      console.warn(TAG + " no supabase client / rpc (DDL likely not run) — free claim offline");
      ui.offline(); return;
    }
    ui.pending();
    client.rpc("depot_claim_free_pack", { p_card: p_card }).then(function (res) {
      if (res && res.error) {
        var msg = (res.error.message || "") + "";
        if (/not authenticated/i.test(msg)) { ui.notSignedIn(); }
        else if (/does not exist|schema cache|not find/i.test(msg)) { console.warn(TAG + " free RPC absent: " + msg); ui.offline(); }
        else { console.warn(TAG + " free RPC error: " + msg); ui.fail(msg); }
        return;
      }
      var data = res && res.data ? res.data : {};
      if (data.ok === false) {
        // On cooldown: server refused WITHOUT inserting. Show the countdown to next_claim_at.
        (window.depotLog||function(){})(TAG + " free claim on cooldown until " + data.next_claim_at);
        ui.cooldown(data.next_claim_at);
        return;
      }
      // Success: the card is granted server-side. Reveal it.
      (window.depotLog||function(){})(TAG + " free claim OK card_id=" + data.card_id + " tier=" + data.tier);
      ui.claimed(card, band, data.next_claim_at, data.card_id);
      // POST-GRANT position enrichment. The free card is already granted
      // server-side and revealed above; this is fire-and-forget, deliberately
      // AFTER ui.claimed(). The claim must never wait on statsapi and must
      // never fail because of it. Anything missed here is picked up later by
      // depotBackfillPositions().
      try {
        if(data.card_id && typeof window.depotEnrichPositions === 'function'){
          window.depotEnrichPositions(client, [data.card_id])
            .then(function(){ if(typeof window.depotEnrichStats === 'function') return window.depotEnrichStats(client, [data.card_id]); })
            .catch(function(){});
        } else if(data.card_id && typeof window.depotEnrichStats === 'function'){
          /* Positions module absent: the season line still gets its shot. */
          window.depotEnrichStats(client, [data.card_id]).catch(function(){});
        }
      } catch(e2){ console.debug(TAG+' free position enrichment skipped: '+((e2&&e2.message)||e2)); }
    }).catch(function (e) {
      console.error(TAG + " free RPC threw:", e && e.message || e);
      ui.fail("Free claim could not be confirmed. Please try again.");
    });
  }

  
  // ------------------------------------------------------------------
  // REDEMPTION (case a): honor a debited receipt whose cards were never
  // granted. Idempotent + crash-safe. Re-rolls the exact 5 cards from the
  // stored seed (rollPack is deterministic), inserts them owner-scoped
  // (source:'pack', seed stamped into notes), then fires the rip ceremony
  // with the hit slot LAST. Clears the receipt only AFTER ceremony start.
  // Money-safety: NEVER clears the receipt unless all cards confirm.
  var SEED_TAG='packseed:';
  function seedNote(seed){ return SEED_TAG+seed; }
  // [storage-scoping] scoped key first; legacy global as fallback so a receipt
  // written before this landed (or before depotUserCached warmed) still redeems.
  function loadReceipt(){ try{ var k=receiptKey(); var r=localStorage.getItem(k); if(!r && k!==RECEIPT_KEY){ r=localStorage.getItem(RECEIPT_KEY); if(r){ _receiptSrcKey=RECEIPT_KEY; } } else if(r){ _receiptSrcKey=k; } return r?JSON.parse(r):null; }catch(e){ return null; } }
  function resolveCollection(client, ownerId){
    return client.from('collections').select('id,created_at').eq('owner_id',ownerId).order('created_at',{ascending:true}).limit(1).then(function(r){
      if(r.error) throw new Error('collection lookup failed: '+r.error.message);
      if(!r.data||!r.data.length) throw new Error('no collection for owner');
      return r.data[0].id;
    });
  }
  function cardRow(c, ownerId, collectionId, seed){
    var note=seedNote(seed)+(c.notes?(' | '+c.notes):'');
    return { owner_id:ownerId, collection_id:collectionId, year:c.year, brand:c.brand, set:c.set, number:String(c.number), player:c.player, team:c.team||'', source:'pack', notes:note, tcdb_url:c.url||null };
  }
  function redeemPending(catalog, view, opts){
    opts=opts||{};
    var receipt=loadReceipt();
    if(!receipt||receipt.status!=='debited') return Promise.resolve({redeemed:false});
    var client=sb();
    if(!client||!client.from){ console.warn(TAG+' redeem: no client'); return Promise.resolve({redeemed:false}); }
    // RACE-SAFE (belt): a window-scoped in-flight latch keyed by seed so that
    // concurrent auth events / mounts share ONE redemption attempt. Two helper
    // instances each with their own fired-flag used to slip through here and
    // double-grant; the latch closes that. (DB unique index below is the real
    // guarantee -- see db/proposals/pack_seed_idempotency.sql.)
    var __seedKey = 'seed:' + (receipt && receipt.seed);
    window.__depotRedeemInFlight = window.__depotRedeemInFlight || {};
    if (window.__depotRedeemInFlight[__seedKey]) {
      (window.depotLog||function(){})(TAG+' redeem: attempt already in flight for '+__seedKey+' -> sharing it (race latch)');
      return window.__depotRedeemInFlight[__seedKey];
    }
    // Honor the catalog we were given (raw array from loadCatalog), accept a {cards:[]} wrapper too,
  // else load it once and retry. Distinguish 'catalog unavailable' from 'no receipt' (handled above).
  var _cat = catalog || (opts && opts.catalog) || null;
  if (_cat && !Array.isArray(_cat) && Array.isArray(_cat.cards)) _cat = _cat.cards;
  if (!Array.isArray(_cat) || _cat.length === 0) {
    if (opts && opts.__catRetry) { console.error(TAG+' redeem: catalog unavailable after load (receipt kept, money safe)'); return Promise.resolve({redeemed:false, error:'catalog-unavailable'}); }
    console.warn(TAG+' redeem: catalog empty on this surface, loading it now');
    var _o = {}; for (var k in opts) { if (Object.prototype.hasOwnProperty.call(opts,k)) _o[k]=opts[k]; } _o.__catRetry = true;
    return Promise.resolve(loadCatalog()).then(function(loaded){ return redeemPending(loaded, view, _o); })
      .catch(function(e){ console.error(TAG+' redeem: catalog load failed (receipt kept, money safe): '+(e&&(e.message||e))); return {redeemed:false, error:'catalog-load-failed'}; });
  }
  catalog = _cat;
    (window.depotLog||function(){})(TAG+' redeeming pending pack', receipt);
    var ownerId, collectionId, pack, cards, hitIndex;
    var __chain = client.auth.getUser().then(function(u){
      ownerId=u&&u.data&&u.data.user?u.data.user.id:null;
      if(!ownerId) throw new Error('not signed in');
      // [storage-scoping] a stamped receipt redeems ONLY for the account that
      // paid for it. Mismatch keeps the receipt (the catch below retains it)
      // and says so loudly -- silently granting it to whoever is signed in is
      // the leak this closes.
      if(receipt.owner && receipt.owner!==ownerId){ throw new Error('receipt belongs to another account ('+String(receipt.owner).slice(0,8)+'…); retained for them'); }
      return resolveCollection(client, ownerId);
    }).then(function(cid){
      collectionId=cid;
      pack=window.DepotPackEngine.rollPack({tier:receipt.tier, catalog:catalog, seed:receipt.seed, prestige:window.DepotPrestige});
      cards=pack.cards; hitIndex=(typeof receipt.hitIndex==='number')?receipt.hitIndex:pack.hitIndex;
      return client.from('pack_grants').insert({ owner_id:ownerId, collection_id:collectionId, pack_seed:receipt.seed, tier:receipt.tier, card_count:cards.length }).select('id')
    }).then(function(grant){
      // PACK-LEVEL idempotency gate: the grant row is inserted FIRST. A
      // unique-violation (23505) on pack_grants(collection_id, pack_seed)
      // means this pack was already granted -> clean no-op, insert NO cards.
      // The gate is the PACK, not the card row (5 cards share one seed).
      if(grant.error){
        var __gm = (grant.error.message||'')+' '+(grant.error.details||'');
        if((grant.error.code+'')==='23505' || /duplicate key|already exists|unique constraint/i.test(__gm)){
          (window.depotLog||function(){})(TAG+' redeem: pack_grants rejected duplicate for seed '+receipt.seed+' (23505) -> pack already granted, clean no-op (no cards inserted)');
          return {skipInsert:true};
        }
        throw new Error('pack_grants insert rejected: '+grant.error.message);
      }
      // grant row landed -> we own this pack; now insert its cards
      var toInsert=cards.map(function(c){return cardRow(c,ownerId,collectionId,receipt.seed);});
      return client.from('cards').insert(toInsert).select('id').then(function(ins){
        if(ins.error) throw new Error('card insert rejected: '+ins.error.message);
        (window.depotLog||function(){})(TAG+' redeem: inserted '+((ins.data||[]).length)+' card(s) after grant row');
        // POST-GRANT position enrichment. Fire-and-forget, deliberately AFTER the
        // grant row and the card insert have landed: the money path must never
        // wait on statsapi and must never fail because of it. Anything missed
        // here is picked up later by depotBackfillPositions().
        try {
          var newIds = (ins.data||[]).map(function(r){ return r && r.id; }).filter(Boolean);
          if(newIds.length && typeof window.depotEnrichPositions === 'function'){
            window.depotEnrichPositions(client, newIds)
            .then(function(){ if(typeof window.depotEnrichStats === 'function') return window.depotEnrichStats(client, newIds); })
            .catch(function(){});
        } else if(newIds.length && typeof window.depotEnrichStats === 'function'){
          window.depotEnrichStats(client, newIds).catch(function(){});
          }
        } catch(e){ console.debug(TAG+' position enrichment skipped: '+((e&&e.message)||e)); }
        return {skipInsert:false};
      });
    }).then(function(){
      if(typeof opts.render==='function'){ try{opts.render();}catch(e){} }
      return playPackCeremony(view, cards, hitIndex, Object.assign({}, opts, {tier: receipt.tier, seed: receipt.seed, held: true})).then(function(){ clearReceipt(); (window.depotLog||function(){})(TAG+' redeem: ceremony done, receipt cleared'); return {redeemed:true, count:cards.length}; });
    }).catch(function(e){
      console.error(TAG+' redeem failed (receipt retained): ', e&&e.message||e);
      return {redeemed:false, error:(e&&e.message)||String(e)};
    });
    // store the shared attempt and clear the latch once it settles
    window.__depotRedeemInFlight[__seedKey] = __chain;
    __chain.then(function(){ if(window.__depotRedeemInFlight) delete window.__depotRedeemInFlight[__seedKey]; },
               function(){ if(window.__depotRedeemInFlight) delete window.__depotRedeemInFlight[__seedKey]; });
    return __chain;
  }
  function playPackCeremony(view, cards, hitIndex, opts){
    opts = opts || {};
    var tier = (opts.tier) || (opts.receipt && opts.receipt.tier) || 'bronze';
    var seed = (opts.seed != null) ? opts.seed : (opts.receipt && opts.receipt.seed);
    // Shelf this pack in PACK HISTORY (tier/seed/date/count only -- never contents).
    try {
      if(view && view.recordPackHistory && seed != null){
        view.recordPackHistory({ tier: tier, seed: seed, count: (cards && cards.length) || 5 });
        if(opts.onHistory){ try{opts.onHistory();}catch(e){} }
      }
    } catch(e){ console.warn(TAG+' history record failed: '+(e&&e.message)); }
    // Preferred path: the held, blocking, player-paced session (ceremony v2).
    if(view && typeof view.playPackSession === 'function'){
      return view.playPackSession(cards, hitIndex, { tier: tier, held: (opts.held !== false), seed: seed });
    }
    // Legacy fallback: per-card auto-reveal loop (kept for safety if view is old).
    var revealOne = (typeof opts.revealOne === 'function') ? opts.revealOne : null;
    if(!revealOne && (!view||!view.buildReveal||!view.playCeremony)){ console.warn(TAG+' no DepotShopView ceremony; cards granted silently'); return Promise.resolve(); }
    var order = []; for(var i=0;i<cards.length;i++){ if(i!==hitIndex) order.push(i); }
    if(typeof hitIndex==='number' && cards[hitIndex]) order.push(hitIndex);
    var chain = Promise.resolve();
    order.forEach(function(idx){ chain = chain.then(function(){
      var shaped = catalogCardToPrestigeShape(cards[idx], cards[idx].year);
      var band = (window.DepotPrestige && window.DepotPrestige.compute) ? (window.DepotPrestige.compute(shaped).band||'plain'):'plain';
      if(revealOne){ return revealOne(cards[idx], band); }
      var rev = view.buildReveal(cards[idx], band);
      return view.playCeremony(rev);
    }); });
    return chain;
  }

  window.DepotShop = {
    RECEIPT_KEY: RECEIPT_KEY,
    TIER_ORDER: TIER_ORDER,
    TIER_COPY: TIER_COPY,
    loadCatalog: loadCatalog,
    getBalance: getBalance,
    buy: buy,
    claimFree: claimFree,
    cardToShape: catalogCardToPrestigeShape,
    redeemPending: redeemPending,
    cardId: cardId,
    saveReceipt: saveReceipt,
    clearReceipt: clearReceipt
  };
  try { (window.depotLog||function(){})(TAG + ' controller ready'); } catch (e) {}
})();

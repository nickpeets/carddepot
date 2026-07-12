/*
 * js/depot-pack-engine.js  --  Card Depot pack draw engine (ADDITIVE, non-financial).
 *
 * Pure roll logic for the pack shop (ECONOMY_DESIGN.md section 7.2). NO wallet,
 * NO DB, NO network side effects. Given a tier + a card catalog + the prestige
 * scorer, it returns the 5 cards a pack would contain. The roll is DETERMINISTIC
 * given a seed, so a verifier can reproduce any pack exactly.
 *
 * PERF: DepotPrestige.compute() over the full catalog (~72k cards) is expensive.
 * We MEMOIZE compute per card object (WeakMap) so each card is scored at most
 * once per session, no matter how many rolls / odds samples run. Weight arrays
 * are cached per (catalog, tier) so repeated rolls (e.g. estimateOdds) are cheap.
 *
 * Loaded after js/depot-prestige.js. Exposes window.DepotPackEngine.
 *
 * Card shape (from data/cards-YYYY.json): { brand, set, number, player, team, url, notes }
 * Year comes from the catalog KEY (file cards-YYYY.json), so callers stamp .year.
 */
(function () {
  var TAG = '[depot] pack-engine:';

  /* ---- tier config: prices/counts/floors straight from ECONOMY_DESIGN section 7.2 ---- */
  var TIERS = {
    bronze: { price: 150, cards: 5, eraWeight: { vintage: 0.6, junkwax: 3.0, modern: 1.0 }, starBias: 0.5, hitFloorBand: 'silver', hitStarBias: 1.0 },
    silver: { price: 400, cards: 5, eraWeight: { vintage: 1.2, junkwax: 1.0, modern: 1.0 }, starBias: 1.0, hitFloorBand: 'silver', hitStarBias: 1.6 },
    gold:   { price: 900, cards: 5, eraWeight: { vintage: 2.0, junkwax: 0.7, modern: 1.0 }, starBias: 1.5, hitFloorBand: 'gold',   hitStarBias: 2.4 },
    // FREE DAILY: 1 card, commons-weighted, NO hit-slot guarantee. 0 DD. Odds live here in shipped config (section 7.1), not a DB table.
    // Very low starBias keeps most pulls in the bronze band; published odds ~92% bronze / 7% silver / 1% gold.
    free:   { price: 0,   cards: 1, eraWeight: { vintage: 0.5, junkwax: 3.0, modern: 1.0 }, starBias: 0.2, hitFloorBand: 'plain', hitStarBias: 1.0 }
  };
  var BAND_RANK = { plain: 0, bronze: 1, silver: 2, gold: 3 };

  /* FREE DAILY published band odds (ECONOMY_DESIGN section 7.1). Band-first draw:
     roll a band at these exact rates, THEN draw a card from that band's pool, so
     the odds are exact by construction and trivially publishable. Longshot is REAL. */
  var FREE_BAND_ODDS = [
    { band: 'gold',   p: 0.005 },
    { band: 'silver', p: 0.015 },
    { band: 'bronze', p: 0.08 },
    { band: 'plain',  p: 0.90 }
  ];
  function pickFreeBand(rng) {
    var r = rng(), acc = 0;
    for (var i = 0; i < FREE_BAND_ODDS.length; i++) { acc += FREE_BAND_ODDS[i].p; if (r < acc) return FREE_BAND_ODDS[i].band; }
    return 'plain';
  }
  // Group catalog indices by band (memoized on the cached weights object W).
  function bandIndexOf(W) {
    if (W._bandIndex) return W._bandIndex;
    var bi = { plain: [], bronze: [], silver: [], gold: [] };
    var b = W.bands || [];
    for (var i = 0; i < b.length; i++) { var k = b[i] || 'plain'; if (bi[k]) bi[k].push(i); }
    W._bandIndex = bi; return bi;
  }
  // Draw ONE catalog index using the band-first scheme; steps DOWN to a populated band if the rolled one is empty.
  function drawFreeIndex(W, rng) {
    var bi = bandIndexOf(W);
    var order = ['gold', 'silver', 'bronze', 'plain'];
    var band = pickFreeBand(rng);
    var start = order.indexOf(band);
    for (var j = start; j < order.length; j++) {
      var pool = bi[order[j]];
      if (pool && pool.length) {
        // weighted pick within the band's pool, using the same base weights
        var sum = 0, k;
        for (k = 0; k < pool.length; k++) sum += W.baseW[pool[k]];
        var t = rng() * sum;
        for (k = 0; k < pool.length; k++) { t -= W.baseW[pool[k]]; if (t <= 0) return pool[k]; }
        return pool[pool.length - 1];
      }
    }
    // no populated band at or below (impossible for a non-empty catalog) -> first card
    return 0;
  }

  function tierConfig(name) { return TIERS[(name || '').toLowerCase()] || null; }

  /* ---- deterministic PRNG: mulberry32 (seedable, verifiable) ---- */
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function eraClass(yr) {
    yr = parseInt(yr, 10) || 0;
    if (!yr) return 'modern';
    if (yr <= 1985) return 'vintage';
    if (yr <= 1993) return 'junkwax';
    return 'modern';
  }

  /* ---- MEMOIZED prestige compute (per card object) ---- */
  var _pCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  function computeCached(card, prestige) {
    if (!prestige || !prestige.compute) return { total: 0, band: 'plain', comps: [] };
    if (_pCache) {
      var hit = _pCache.get(card);
      if (hit) return hit;
      var res = prestige.compute(card);
      _pCache.set(card, res);
      return res;
    }
    return prestige.compute(card);
  }

  /* Weight of a single card for a tier: prestige total (real value system) + era + star bias. */
  function cardWeight(card, cfg, prestige) {
    var total = (computeCached(card, prestige).total) || 0;
    var w = 1 + Math.max(0, total) * cfg.starBias * 0.04;
    w *= (cfg.eraWeight[eraClass(card.year)] || 1.0);
    return w > 0 ? w : 0.0001;
  }

  /* ---- per-(catalog,tier) weight cache so repeated rolls are cheap ---- */
  var _wCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  function weightsFor(catalog, cfg, tier, prestige) {
    var byTier = _wCache ? _wCache.get(catalog) : null;
    if (byTier && byTier[tier]) return byTier[tier];
    var baseW = new Array(catalog.length);
    var hitW = new Array(catalog.length);
    var bands = new Array(catalog.length);
    for (var i = 0; i < catalog.length; i++) {
      var res = computeCached(catalog[i], prestige);
      var t = Math.max(0, (res.total) || 0);
      var bw = cardWeight(catalog[i], cfg, prestige);
      baseW[i] = bw;
      hitW[i] = bw * (1 + t * cfg.hitStarBias * 0.06);
      bands[i] = res.band || 'plain';
    }
    var packed = { baseW: baseW, hitW: hitW, bands: bands };
    if (_wCache) { if (!byTier) { byTier = {}; _wCache.set(catalog, byTier); } byTier[tier] = packed; }
    return packed;
  }

  function weightedPick(weights, used, rng) {
    var sum = 0, i, w;
    for (i = 0; i < weights.length; i++) { if (!used[i]) sum += weights[i]; }
    var r = rng() * sum;
    for (i = 0; i < weights.length; i++) {
      if (used[i]) continue;
      r -= weights[i];
      if (r <= 0) return i;
    }
    // fallback: last unused
    for (i = weights.length - 1; i >= 0; i--) { if (!used[i]) return i; }
    return weights.length - 1;
  }

  /*
   * rollPack(opts) -> { tier, seed, cards:[5], hitIndex:4, prestige:[5], floorMet }
   * Deterministic in (seed, catalog, tier). 5th card = hit slot re-rolled to band floor.
   */
  function rollPack(opts) {
    opts = opts || {};
    var cfg = tierConfig(opts.tier);
    if (!cfg) throw new Error(TAG + ' unknown tier: ' + opts.tier);
    var catalog = opts.catalog || [];
    if (!catalog.length) throw new Error(TAG + ' empty catalog -- cannot roll');
    var prestige = opts.prestige || (typeof window !== 'undefined' ? window.DepotPrestige : null);
    var seed = (opts.seed >>> 0) || 1;
    var rng = makeRng(seed);
    var W = weightsFor(catalog, cfg, opts.tier.toLowerCase(), prestige);

    var used = {};
    var cards = [], results = [], idx, i;

    // First 4 = base pool.
    for (i = 0; i < cfg.cards - 1; i++) {
      idx = weightedPick(W.baseW, used, rng);
      used[idx] = true;
      cards.push(catalog[idx]);
      results.push(computeCached(catalog[idx], prestige));
    }

    // 5th = HIT slot: bounded re-roll until band floor met (graceful best-so-far fallback).
    var floorRank = BAND_RANK[cfg.hitFloorBand] || 0;
    var MAX_TRIES = 40, tries = 0, hitIdx = -1, hitRes = null;
    while (tries < MAX_TRIES) {
      tries++;
      var cand = weightedPick(W.hitW, used, rng);
      var cres = computeCached(catalog[cand], prestige);
      if ((BAND_RANK[cres.band] || 0) >= floorRank) { hitIdx = cand; hitRes = cres; break; }
      if (hitIdx < 0 || (BAND_RANK[cres.band] || 0) > (BAND_RANK[hitRes.band] || 0)) { hitIdx = cand; hitRes = cres; }
    }
    used[hitIdx] = true;
    cards.push(catalog[hitIdx]);
    results.push(hitRes);

    return {
      tier: opts.tier, seed: seed, cards: cards, hitIndex: cards.length - 1,
      prestige: results, floorMet: (BAND_RANK[hitRes.band] || 0) >= floorRank
    };
  }

  /* ---- FREE DAILY roll: exactly ONE card from the commons-weighted base pool.
   * No hit slot, no band floor — whatever the weighted draw lands on is the pull.
   * Same return shape as rollPack so the reveal + prestige path is identical. ---- */
  function rollFree(opts) {
    opts = opts || {};
    var cfg = tierConfig('free');
    if (!cfg) throw new Error(TAG + ' free tier missing from config');
    var catalog = opts.catalog || [];
    if (!catalog.length) throw new Error(TAG + ' empty catalog — cannot roll free');
    var prestige = opts.prestige || (typeof window !== 'undefined' ? window.DepotPrestige : null);
    var seed = (opts.seed >>> 0) || 1;
    var rng = makeRng(seed);
    var W = weightsFor(catalog, cfg, 'free', prestige);
    var idx = drawFreeIndex(W, rng);
    var card = catalog[idx];
    var res = computeCached(card, prestige);
    return {
      tier: 'free', seed: seed, cards: [card], hitIndex: -1,
      prestige: [res], floorMet: true
    };
  }

  /* Fast hit-band distribution via cumulative-sum + binary search over the hit
   * weights. O(samples * log n) instead of O(samples * n) full-pack simulation.
   * The 4 non-hit commons are excluded in a real pull, but on a ~72k catalog
   * their absence shifts hit odds negligibly, so published odds use this fast path. */
  function sampleHitBands(catalog, cfg, tier, prestige, samples, seed0) {
    var W = weightsFor(catalog, cfg, tier, prestige);
    var hitW = W.hitW, bands = W.bands, n = hitW.length;
    var cum = new Array(n); var run = 0;
    for (var i = 0; i < n; i++) { run += hitW[i]; cum[i] = run; }
    var total = run;
    var rng = makeRng((seed0 >>> 0) || 1);
    var floorRank = BAND_RANK[cfg.hitFloorBand] || 0;
    function draw() {
      var target = rng() * total;
      var lo = 0, hi = n - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid + 1; else hi = mid; }
      return lo;
    }
    var counts = { gold: 0, silver: 0, bronze: 0, plain: 0 };
    for (var s = 0; s < samples; s++) {
      // mirror rollPack's hit slot: bounded re-roll until band floor met, best-so-far.
      var bestBand = null, tries = 0;
      while (tries < 40) {
        tries++;
        var idx = draw();
        var b = bands[idx] || 'plain';
        if ((BAND_RANK[b] || 0) >= floorRank) { bestBand = b; break; }
        if (bestBand === null || (BAND_RANK[b] || 0) > (BAND_RANK[bestBand] || 0)) bestBand = b;
      }
      counts[bestBand] = (counts[bestBand] || 0) + 1;
    }
    return counts;
  }

  /*
   * estimateOdds(tier, catalog, prestige, samples) -> { tier, cards, price, hitFloorBand, hitBandPct, samples }
   * Cheap: weights are cached, so each sample is O(cards) picks not O(cards) computes.
   */
  function estimateOdds(tier, catalog, prestige, samples) {
    var cfg = tierConfig(tier);
    if (!cfg) throw new Error(TAG + ' unknown tier: ' + tier);
    // FREE tier: band-first draw means odds ARE the configured rates -- report them directly, exact (no catalog needed).
    if (String(tier).toLowerCase() === 'free') {
      var fp = {};
      for (var fi = 0; fi < FREE_BAND_ODDS.length; fi++) { fp[FREE_BAND_ODDS[fi].band] = Math.round(FREE_BAND_ODDS[fi].p * 1000) / 10; }
      return { tier: 'free', cards: cfg.cards, price: cfg.price, hitFloorBand: cfg.hitFloorBand, hitBandPct: fp, samples: (samples || 250), exact: true };
    }
    if (!catalog || !catalog.length) throw new Error(TAG + ' empty catalog');
    samples = samples || 250;
    var counts = sampleHitBands(catalog, cfg, tier.toLowerCase(), prestige, samples, 1);
    var pct = {};
    for (var k in counts) { if (counts.hasOwnProperty(k)) pct[k] = Math.round((counts[k] / samples) * 1000) / 10; }
    return { tier: tier, cards: cfg.cards, price: cfg.price, hitFloorBand: cfg.hitFloorBand, hitBandPct: pct, samples: samples };
  }

  window.DepotPackEngine = {
    TIERS: TIERS, tierConfig: tierConfig, makeRng: makeRng, eraClass: eraClass,
    cardWeight: cardWeight, rollPack: rollPack, rollFree: rollFree, estimateOdds: estimateOdds
  };
  try { console.log(TAG + ' ready (deterministic, seedable, memoized)'); } catch (e) {}
})();

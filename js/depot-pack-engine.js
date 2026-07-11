/*
 * js/depot-pack-engine.js  --  Card Depot pack draw engine (ADDITIVE, non-financial).
 *
 * Pure roll logic for the pack shop (ECONOMY_DESIGN.md section 7.2). NO wallet,
 * NO DB, NO network side effects. Given a tier + a card catalog + the prestige
 * scorer, it returns the 5 cards a pack would contain. The roll is DETERMINISTIC
 * given a seed, so a verifier can reproduce any pack exactly.
 *
 * Loaded after js/depot-prestige.js. Exposes window.DepotPackEngine.
 *
 * Card shape (from data/cards-YYYY.json): { brand, set, number, player, team, url, notes }
 * Year comes from the catalog KEY (the file is cards-YYYY.json), so callers pass
 * cards already stamped with a .year field; rollPack tolerates a missing year.
 */
(function () {
  var TAG = '[depot] pack-engine:';

  /* ---- tier config: prices/counts/floors straight from ECONOMY_DESIGN section 7.2 ---- */
  var TIERS = {
    bronze: {
      price: 150, cards: 5,
      // era weighting: junk-wax (1986-1993) heavy, low star odds
      eraWeight: { vintage: 0.6, junkwax: 3.0, modern: 1.0 },
      starBias: 0.5,                 // multiplier on player-tier pull
      hitFloorBand: 'silver',        // 5th card re-rolls until band >= silver (30+)
      hitStarBias: 1.0
    },
    silver: {
      price: 400, cards: 5,
      eraWeight: { vintage: 1.2, junkwax: 1.0, modern: 1.0 },
      starBias: 1.0,
      hitFloorBand: 'silver',        // guaranteed >=1 silver-band, higher rookie odds
      hitStarBias: 1.6
    },
    gold: {
      price: 900, cards: 5,
      eraWeight: { vintage: 2.0, junkwax: 0.7, modern: 1.0 },
      starBias: 1.5,
      hitFloorBand: 'gold',          // guaranteed gold-band (prestige >= 60) hit
      hitStarBias: 2.4
    }
  };

  var BAND_RANK = { plain: 0, bronze: 1, silver: 2, gold: 3 };

  function tierConfig(name) {
    return TIERS[(name || '').toLowerCase()] || null;
  }

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

  /* Weight of a single card for a given tier. Uses DepotPrestige.compute for the
   * prestige total (the real value system), then applies era + star bias. Never
   * returns <= 0 so every card keeps a nonzero chance. */
  function cardWeight(card, cfg, prestige) {
    var res = prestige && prestige.compute ? prestige.compute(card) : { total: 0 };
    var total = (res && res.total) || 0;
    var w = 1 + Math.max(0, total) * cfg.starBias * 0.04;
    var ec = eraClass(card.year);
    w *= (cfg.eraWeight[ec] || 1.0);
    return w > 0 ? w : 0.0001;
  }

  /* Weighted pick from a pool using rng(); returns index. */
  function weightedPick(weights, rng) {
    var sum = 0, i;
    for (i = 0; i < weights.length; i++) sum += weights[i];
    var r = rng() * sum;
    for (i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  /*
   * rollPack(opts) -> { tier, seed, cards:[5], hitIndex:4, prestige:[5 results] }
   *
   * opts:
   *   tier    'bronze' | 'silver' | 'gold'
   *   catalog array of card objects (each SHOULD carry .year; caller flattens
   *           data/cards-YYYY.json into one array with year stamped)
   *   seed    integer -- SAME seed + SAME catalog => SAME pack (verifiable)
   *   prestige window.DepotPrestige (injected for testability)
   *
   * The 5th card is the HIT slot: re-rolled (bounded) until its prestige band
   * meets the tier floor. Fail-loud if catalog empty or tier unknown.
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

    // Precompute base weights once (prestige.compute is pure per card).
    var baseW = new Array(catalog.length);
    var i;
    for (i = 0; i < catalog.length; i++) baseW[i] = cardWeight(catalog[i], cfg, prestige);

    var cards = [];
    var results = [];
    var used = {};

    function pickOne(weightArr) {
      // copy so we can zero out already-used indices without mutating base
      var w = weightArr.slice();
      for (var k in used) { if (used.hasOwnProperty(k)) w[k] = 0; }
      var idx = weightedPick(w, rng);
      return idx;
    }

    // First 4 = commons/regulars pool (base weights).
    for (i = 0; i < cfg.cards - 1; i++) {
      var idx = pickOne(baseW);
      used[idx] = true;
      cards.push(catalog[idx]);
      results.push(prestige && prestige.compute ? prestige.compute(catalog[idx]) : { total: 0, band: 'plain', comps: [] });
    }

    // 5th = HIT slot. Weight harder toward prestige (hitStarBias), then re-roll
    // until band floor is met, bounded so we never infinite-loop on a thin catalog.
    var floorRank = BAND_RANK[cfg.hitFloorBand] || 0;
    var hitW = new Array(catalog.length);
    for (i = 0; i < catalog.length; i++) {
      var r = prestige && prestige.compute ? prestige.compute(catalog[i]) : { total: 0 };
      var t = (r && r.total) || 0;
      hitW[i] = baseW[i] * (1 + Math.max(0, t) * cfg.hitStarBias * 0.06);
    }
    var MAX_TRIES = 40;
    var hitIdx = -1, hitRes = null, tries = 0;
    while (tries < MAX_TRIES) {
      tries++;
      var cand = pickOne(hitW);
      var cres = prestige && prestige.compute ? prestige.compute(catalog[cand]) : { total: 0, band: 'plain', comps: [] };
      if ((BAND_RANK[cres.band] || 0) >= floorRank) { hitIdx = cand; hitRes = cres; break; }
      // remember best-so-far as graceful fallback if catalog can't meet the floor
      if (hitIdx < 0 || (BAND_RANK[cres.band] || 0) > (BAND_RANK[hitRes.band] || 0)) { hitIdx = cand; hitRes = cres; }
    }
    used[hitIdx] = true;
    cards.push(catalog[hitIdx]);
    results.push(hitRes);

    return {
      tier: opts.tier,
      seed: seed,
      cards: cards,
      hitIndex: cards.length - 1,
      prestige: results,
      floorMet: (BAND_RANK[hitRes.band] || 0) >= floorRank
    };
  }

  /* Published odds for the shop card (legibility rule, section 1.5F). Estimated
   * by Monte-Carlo over the catalog so the printed odds match the real engine.
   * Returns { tier, sampleCards, hitBandPct:{gold,silver,bronze,plain}, guarantee }. */
  function estimateOdds(tier, catalog, prestige, samples) {
    var cfg = tierConfig(tier);
    if (!cfg) throw new Error(TAG + ' unknown tier: ' + tier);
    samples = samples || 400;
    var counts = { gold: 0, silver: 0, bronze: 0, plain: 0 };
    for (var s = 0; s < samples; s++) {
      var pack = rollPack({ tier: tier, catalog: catalog, seed: s + 1, prestige: prestige });
      var hb = pack.prestige[pack.hitIndex].band || 'plain';
      counts[hb] = (counts[hb] || 0) + 1;
    }
    var pct = {};
    for (var k in counts) { if (counts.hasOwnProperty(k)) pct[k] = Math.round((counts[k] / samples) * 1000) / 10; }
    return {
      tier: tier, cards: cfg.cards, price: cfg.price,
      hitFloorBand: cfg.hitFloorBand, hitBandPct: pct, samples: samples
    };
  }

  window.DepotPackEngine = {
    TIERS: TIERS,
    tierConfig: tierConfig,
    makeRng: makeRng,
    eraClass: eraClass,
    cardWeight: cardWeight,
    rollPack: rollPack,
    estimateOdds: estimateOdds
  };
  try { console.log(TAG + ' ready (deterministic, seedable)'); } catch (e) {}
})();

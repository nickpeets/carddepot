/* js/depot-starter-box.js — funnel item 3: the starter box roll and grant.
 *
 * Chapter 02b. The one-time 25-card welcome: a full club, roster-shaped, mostly
 * plain, with one guaranteed bronze-or-better in the last slot. This file owns
 * the ROLL and the GRANT. js/depot-starter-box-view.js owns the ceremony.
 *
 * ============================ THE SHAPE =============================
 *   9 fielders  C 1B 2B 3B SS LF CF RF DH   (one each, the fieldable nine)
 *   5 rotation  pitchers
 *   5 bullpen   pitchers
 *   5 bench     anything playable
 *   1 hit       bronze-or-better, always last
 *  ---
 *  25          which is what the RPC demands, exactly.
 *
 * 9 + 5 + 5 + 5 is 24, not 25, and that is not an error in anything: the V2
 * README and FUTURE_ITEMS 20 both read "+ 1 guaranteed bronze-or-better in the
 * LAST SLOT". The hit is a twenty-fifth slot of its own, not a constraint on
 * one of the twenty-four. Chapter 02b's own render agrees -- its wave-3 counter
 * reads 14/25, which is infield+outfield (9) plus the rotation (5).
 *
 * ===================== SP / RP: WHAT IS HONEST HERE ==================
 * data/player_positions.json cannot tell a starter from a reliever, and says so
 * about itself in a field named _known_gap_sp_rp: "MLB primaryPosition reports
 * pitchers as P; it does not split SP from RP. The starter box wants 5 SP + 5
 * RP, so that split needs a second signal (gamesStarted on the season line) and
 * is NOT in this asset. Named here rather than faked." 9,336 of its 18,930
 * entries are the bare token P.
 *
 * So: this file rolls TEN pitchers and ASSIGNS five to the rotation and five to
 * the bullpen, deterministically from the seed. The assignment is the BOX's,
 * and it is a presentation grouping only. Nothing here writes 'SP' or 'RP' into
 * a card row, into notes, or into the position table -- the cards keep whatever
 * the data actually knows, which is P. The asset's refusal to invent the split
 * is not undone by this file. (And SP is a trap besides: in this hobby it means
 * SHORT PRINT, 373 rows of it, so parsing it off a card front would be worse
 * than guessing.)
 *
 * ========================== BOTH GATES ==============================
 * Gate 1, ART, and it FAILS CLOSED here. DepotShop.filterToArtBacked ships the
 * UNFILTERED catalog on four separate paths -- no index module, no
 * depotCatalogArtKey, an empty key set, or a throw -- because a dead shop is
 * worse than a blemished one. That trade is wrong for this box and Nick has
 * ruled it so (PULL_POLICY 1.2, ONBOARDING_PATH_SPEC 4.1): a starter box of
 * blank cards CANNOT BE RE-ROLLED, because the PRIMARY KEY on
 * starter_box_grants.owner_id is forever. So this module verifies the index
 * independently and REFUSES TO ROLL if it is not there. A delayed welcome is
 * recoverable. A claimed one full of blanks is not. That error state is not a
 * corner case to bolt on: under fail-closed it is what every new signup sees
 * during an index outage, so it reads as a delay, not a breakage.
 *
 * Gate 2, PLAYABILITY, from js/depot-playability.js -- one definition, see that
 * file's header for why it is not yet pool-level.
 *
 * ===================== THE HIT IS A REAL GUARANTEE ==================
 * design/STARTER_BOX.md 4.2: the paid packs get their hit by re-rolling the
 * fifth slot up to 40 times with a best-so-far fallback, which is why rollPack
 * returns floorMet and why floorMet can be FALSE. That is fine for a pack that
 * promises odds. It is not fine for a box that promises A HIT.
 *
 * So the hit here is drawn from a pool that contains ONLY bronze-or-better
 * cards. The guarantee is structural: there is no bounded loop, no best-so-far,
 * and no way to return a plain card. The only failure mode is a pool with no
 * bronze+ card in it at all, and that FAILS CLOSED rather than degrading. The
 * word "guaranteed" is therefore earned -- js/depot-shop-view.js carries a
 * deliberate comment about not using it over a bounded loop.
 *
 * ===================== NO INVENTED ODDS =============================
 * The V2 README's known gaps: "Starter Box generation is specified by shape
 * ... but the card-selection algorithm -- which players, era weighting -- is
 * not designed. Don't invent odds." Constitution rule 3 says the same. So the
 * twenty-four draw UNIFORMLY inside their buckets: no era weight, no star bias,
 * no band steering. Uniform is the absence of an invented weighting, not a
 * choice of one, and STARTER_BOX 3.1's "era-agnostic, no era filter" agrees.
 * The pool is mostly plain, so a uniform draw is mostly plain -- 3.2's target
 * arrives as a property of the pool rather than as a number written down here.
 *
 * ================= GRANT FIRST, RESUMABLE (Nick's ruling) ===========
 * ONBOARDING_PATH_SPEC 2.1. Cards land immediately; the ceremony resumes at the
 * next login if it is interrupted. RESUME READS THE LEDGER AND NEVER RE-ROLLS:
 * the RPC writes card_ids into wallet_transactions.meta, so a replay reads
 * those rows back. Re-rolling to reconstruct a granted box is exactly
 * depot-pack-history.js's mistake and it is labelled as such everywhere it
 * surfaces there. 23505 / already_claimed:true is a NORMAL PATH, not an error.
 *
 * EXPOSES
 *   window.DepotStarterBox.status()      -> Promise<{claimed, seed, cardIds}>
 *   window.DepotStarterBox.rollPayload() -> Promise<{cards:[25], seed, groups}>
 *   window.DepotStarterBox.claim()       -> Promise<{ok, cards, groups, resumed}>
 *   window.DepotStarterBox.resume()      -> Promise<{cards}|null> from the ledger
 */
(function () {
  'use strict';

  var TAG = '[depot][starter-box]';
  var RPC = 'depot_claim_starter_box';
  var FIELD_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  var N_ROTATION = 5, N_BULLPEN = 5, N_BENCH = 5, N_TOTAL = 25;
  var BAND_RANK = { plain: 0, bronze: 1, silver: 2, gold: 3 };
  var HIT_SCAN_TARGET = 240;   /* candidates collected before choosing, NOT a retry bound */

  function log()  { try { (window.depotLog || function () {}).apply(null, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function fail(msg) { console.error(TAG + ' ' + msg); return new Error(msg); }

  function sb() { try { return (typeof window.depotSB === 'function') ? window.depotSB() : null; } catch (e) { return null; } }

  /* Data-path rule (AGENTS.md 3): anchor to THIS script's URL, never the page.
   * Page-relative has broken twice already, depth-down and depth-up. */
  var _src = (document.currentScript && document.currentScript.src) || '';
  function dataURL(f) { try { return new URL('../data/' + f, _src).href; } catch (e) { return 'data/' + f; } }

  /* ------------------------------------------------------------------ *
   * positions
   * ------------------------------------------------------------------ */
  var _posPromise = null;
  function loadPositions() {
    if (_posPromise) return _posPromise;
    _posPromise = fetch(dataURL('player_positions.json')).then(function (r) {
      if (!r.ok) throw new Error('player_positions.json ' + r.status);
      return r.json();
    }).then(function (j) {
      var m = (j && j.positions) || null;
      if (!m || !Object.keys(m).length) throw new Error('player_positions.json carried no positions map');
      log('positions table: ' + Object.keys(m).length + ' players');
      return m;
    }).catch(function (e) {
      console.error(TAG + ' positions table FAILED: ' + (e && (e.message || e)) +
                    ' -- the box cannot be roster-shaped without it, so it will NOT roll');
      _posPromise = null;
      return null;
    });
    return _posPromise;
  }

  /* Exact-key resolution, never fuzzy (STARTER_BOX 4.1 / RUNBOOK 5.1).
   * A catalog player string describes a CARD FRONT: "Ken Griffey Jr. RC" keys as
   * "ken griffey jr rc" and misses. So the raw string goes through
   * depotCleanName FIRST to strip the subset codes, and only then through
   * depotNormName -- which is the accent-folding comparison key the tier tables,
   * the rolodex and depot-binder-browse all use. NOT DepotPrestige.normName:
   * that one deletes dots instead of spacing them, so "A.J. Achter" keys as
   * "aj achter" and misses the table's "a j achter". */
  function posOf(card, posMap) {
    if (!posMap) return null;
    var cn = (typeof window.depotCleanName === 'function') ? window.depotCleanName : function (x) { return String(x || '').trim(); };
    var nn = window.depotNormName;
    if (typeof nn !== 'function') { warn('depotNormName missing (depot-position.js not loaded); no card can resolve a position'); return null; }
    var k = nn(cn(card.player || card.name || ''));
    if (!k) return null;
    var v = posMap[k];
    if (!v) return null;
    return (typeof window.depotNormalizePos === 'function') ? (window.depotNormalizePos(v) || null) : v;
  }

  var PITCHER = { P: 1, SP: 1, RP: 1, LHP: 1, RHP: 1 };
  /* Which resolved positions may fill which of the nine slots. A slot's own
   * token first; the generic tokens are the fallback, in this order. DH is the
   * loosest on purpose -- the table holds only 122 of them, and a designated
   * hitter is a hitter, so any non-pitcher can bat there. */
  var SLOT_OK = {
    C:    ['C'],
    '1B': ['1B', 'IF', 'UT'],
    '2B': ['2B', 'IF', 'UT'],
    '3B': ['3B', 'IF', 'UT'],
    SS:   ['SS', 'IF', 'UT'],
    LF:   ['LF', 'OF', 'UT'],
    CF:   ['CF', 'OF', 'UT'],
    RF:   ['RF', 'OF', 'UT'],
    DH:   ['DH', '1B', '3B', 'LF', 'RF', 'OF', 'C', 'IF', 'UT', '2B', 'SS', 'CF']
  };

  /* ------------------------------------------------------------------ *
   * the pool -- both gates, art FAIL CLOSED
   * ------------------------------------------------------------------ */
  var _poolPromise = null;

  function artGateReady() {
    if (!window.DepotLibraryIndex || typeof window.DepotLibraryIndex.load !== 'function') {
      return Promise.reject(fail('art index module missing (js/depot-library-index.js not loaded). FAILING CLOSED: no roll.'));
    }
    if (typeof window.depotCatalogArtKey !== 'function') {
      return Promise.reject(fail('depotCatalogArtKey missing (js/depot-library-art.js not loaded). FAILING CLOSED: no roll.'));
    }
    /* Same cached promise DepotShop.loadCatalog() consumes, so this costs one
     * property read once the shop has warmed it -- and it is what tells us
     * whether loadCatalog's result is genuinely gated or is its fail-open
     * fallback wearing the same shape. */
    return window.DepotLibraryIndex.load().then(function (keys) {
      if (!keys || !keys.size) {
        throw fail('art index unavailable or empty. FAILING CLOSED: no roll, no RPC. ' +
                   'A box of blank cards can never be re-rolled -- the grant PK is forever.');
      }
      log('art gate verified: ' + keys.size + ' art-backed keys');
      return keys;
    });
  }

  function buildPool() {
    if (_poolPromise) return _poolPromise;
    _poolPromise = artGateReady().then(function () {
      if (!window.DepotShop || typeof window.DepotShop.loadCatalog !== 'function') {
        throw fail('DepotShop.loadCatalog missing; cannot reach the roll pool');
      }
      if (!window.DepotPlayability || typeof window.DepotPlayability.filter !== 'function') {
        throw fail('js/depot-playability.js not loaded; gate 2 unavailable. FAILING CLOSED.');
      }
      return Promise.all([window.DepotShop.loadCatalog(), loadPositions()]);
    }).then(function (both) {
      var art = both[0], posMap = both[1];
      if (!art || !art.length) throw fail('art-backed catalog came back empty');
      if (!posMap) throw fail('positions table unavailable; the box cannot be roster-shaped. FAILING CLOSED.');

      var playable = window.DepotPlayability.filter(art);
      if (!playable.length) throw fail('gate 2 left no playable cards');

      /* Bucket by role once. A card lands in exactly one of fielders-by-slot /
       * pitchers, and EVERY playable card is bench-eligible. */
      var buckets = { pitchers: [], bench: playable, bySlot: {} };
      var s, i;
      for (i = 0; i < FIELD_SLOTS.length; i++) buckets.bySlot[FIELD_SLOTS[i]] = {};

      var resolved = 0;
      for (i = 0; i < playable.length; i++) {
        var p = posOf(playable[i], posMap);
        if (!p) continue;                       /* 1.3.2: no position is not unplayable, just not fieldable */
        resolved++;
        if (PITCHER[p]) { buckets.pitchers.push(playable[i]); continue; }
        for (s = 0; s < FIELD_SLOTS.length; s++) {
          var slot = FIELD_SLOTS[s], ok = SLOT_OK[slot], r;
          for (r = 0; r < ok.length; r++) {
            if (ok[r] === p) { (buckets.bySlot[slot][r] = buckets.bySlot[slot][r] || []).push(playable[i]); break; }
          }
        }
      }

      var counts = { pool: playable.length, positionResolved: resolved, pitchers: buckets.pitchers.length };
      for (i = 0; i < FIELD_SLOTS.length; i++) {
        var tot = 0, tiers = buckets.bySlot[FIELD_SLOTS[i]];
        for (var t in tiers) if (tiers.hasOwnProperty(t)) tot += tiers[t].length;
        counts[FIELD_SLOTS[i]] = tot;
        if (!tot) throw fail('no card in the pool can fill the ' + FIELD_SLOTS[i] + ' slot. FAILING CLOSED rather than shipping an eight-man nine.');
      }
      if (buckets.pitchers.length < N_ROTATION + N_BULLPEN) {
        throw fail('only ' + buckets.pitchers.length + ' pitchers in the pool; need ' + (N_ROTATION + N_BULLPEN) + '. FAILING CLOSED.');
      }
      log('pool ready', counts);
      buckets.counts = counts;
      return buckets;
    }).catch(function (e) {
      _poolPromise = null;                       /* let a later attempt retry a transient outage */
      throw e;
    });
    return _poolPromise;
  }

  /* ------------------------------------------------------------------ *
   * the roll
   * ------------------------------------------------------------------ */
  function newSeed() {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        var a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0] >>> 0;
      }
    } catch (e) { /* fall through */ }
    return (Math.random() * 4294967295) >>> 0;
  }

  function rngFor(seed) {
    if (window.DepotPackEngine && typeof window.DepotPackEngine.makeRng === 'function') {
      return window.DepotPackEngine.makeRng(seed);   /* ONE prng definition, shared with the packs */
    }
    warn('DepotPackEngine.makeRng missing; the roll would not be reproducible');
    throw fail('no deterministic PRNG available');
  }

  function cardKey(c) { return [c.year, c.brand, c.set, c.number, c.player].join('|'); }

  /* Uniform pick from a list, skipping anything already taken. Uniform on
   * purpose: see the NO INVENTED ODDS note in this file's header. */
  function pick(list, taken, rng) {
    if (!list || !list.length) return null;
    var n = list.length, start = Math.floor(rng() * n), i, c, k;
    for (i = 0; i < n; i++) {
      c = list[(start + i) % n];
      k = cardKey(c);
      if (!taken[k]) { taken[k] = 1; return c; }
    }
    return null;
  }

  function pickTiered(tiers, taken, rng) {
    /* SLOT_OK's order is a preference order: the slot's own token, then the
     * generic ones. Try each tier in order so a real shortstop beats a utility
     * body whenever one exists. */
    var idxs = Object.keys(tiers).map(Number).sort(function (a, b) { return a - b; });
    for (var i = 0; i < idxs.length; i++) {
      var got = pick(tiers[idxs[i]], taken, rng);
      if (got) return got;
    }
    return null;
  }

  function bandOf(card) {
    var P = window.DepotPrestige;
    if (!P || typeof P.compute !== 'function') return null;
    try {
      var shaped = (window.DepotShop && window.DepotShop.cardToShape)
        ? window.DepotShop.cardToShape(card, card.year) : card;
      var r = P.compute(shaped);
      return (r && r.band) || 'plain';
    } catch (e) { return null; }
  }

  /* THE HIT. Not a bounded re-roll: this walks the whole shuffled pool if it has
   * to, collecting bronze-or-better candidates, and picks one. It stops early
   * only once it has plenty to choose from -- that is a performance stop, not a
   * try limit, and it cannot cause a floor miss because everything collected is
   * already above the floor. Nothing bronze+ anywhere in the pool is the ONLY
   * way this fails, and it fails closed. */
  function drawHit(pool, taken, rng) {
    var n = pool.length, start = Math.floor(rng() * n), found = [], i, c, b;
    for (i = 0; i < n; i++) {
      c = pool[(start + i) % n];
      if (taken[cardKey(c)]) continue;
      b = bandOf(c);
      if (b && (BAND_RANK[b] || 0) >= BAND_RANK.bronze) {
        found.push(c);
        if (found.length >= HIT_SCAN_TARGET) break;
      }
    }
    if (!found.length) {
      throw fail('no bronze-or-better card anywhere in the pool. FAILING CLOSED -- ' +
                 'a box that promises a hit does not ship without one.');
    }
    var hit = found[Math.floor(rng() * found.length)];
    taken[cardKey(hit)] = 1;
    log('hit slot: ' + found.length + ' bronze+ candidates scanned, band=' + bandOf(hit));
    return hit;
  }

  /* The row the RPC actually reads. depot_claim_starter_box inserts exactly:
   * year, brand, set, number, player, team, rookie_year, notes -- plus its own
   * source='starter' and pack_seed. Anything else on the object is ignored, so
   * only these are sent. player is stored RAW, matching what the pack redeem
   * path stores; cleaning is a DISPLAY invariant (spec section 5), and cleaning
   * at write time would destroy the provenance the errata string carries. */
  function toRow(c) {
    return {
      year: c.year == null ? null : c.year,
      brand: c.brand || '',
      set: c.set || '',
      number: String(c.number == null ? '' : c.number),
      player: c.player || '',
      team: c.team || '',
      notes: c.notes || ''
    };
  }

  function rollPayload(seed) {
    return buildPool().then(function (b) {
      var s = (seed == null) ? newSeed() : (seed >>> 0);
      var rng = rngFor(s), taken = {}, i, got;

      var nine = [];
      for (i = 0; i < FIELD_SLOTS.length; i++) {
        got = pickTiered(b.bySlot[FIELD_SLOTS[i]], taken, rng);
        if (!got) throw fail('could not fill the ' + FIELD_SLOTS[i] + ' slot without a duplicate. FAILING CLOSED.');
        got._slot = FIELD_SLOTS[i];
        nine.push(got);
      }

      var arms = [];
      for (i = 0; i < N_ROTATION + N_BULLPEN; i++) {
        got = pick(b.pitchers, taken, rng);
        if (!got) throw fail('ran out of distinct pitchers at ' + i + ' of ' + (N_ROTATION + N_BULLPEN));
        arms.push(got);
      }

      var bench = [];
      for (i = 0; i < N_BENCH; i++) {
        got = pick(b.bench, taken, rng);
        if (!got) throw fail('ran out of distinct bench cards at ' + i + ' of ' + N_BENCH);
        bench.push(got);
      }

      var hit = drawHit(b.bench, taken, rng);

      var groups = {
        infield:  nine.slice(0, 5),        /* C 1B 2B 3B SS */
        outfield: nine.slice(5),           /* LF CF RF DH   */
        rotation: arms.slice(0, N_ROTATION),
        bullpen:  arms.slice(N_ROTATION),
        bench:    bench,
        hit:      hit
      };
      var ordered = groups.infield.concat(groups.outfield, groups.rotation, groups.bullpen, groups.bench, [hit]);
      if (ordered.length !== N_TOTAL) {
        throw fail('rolled ' + ordered.length + ' cards, not ' + N_TOTAL + '. The RPC would reject this with P0001; not sending it.');
      }
      log('rolled ' + ordered.length + ' cards, seed ' + s);
      return { cards: ordered.map(toRow), seed: s, groups: groups, ordered: ordered };
    });
  }

  /* ------------------------------------------------------------------ *
   * status / resume / claim
   * ------------------------------------------------------------------ */
  function uid() {
    if (typeof window.depotUser !== 'function') return Promise.resolve(null);
    return window.depotUser().then(function (u) { return u ? u.id : null; });
  }

  /* Has this account claimed? Read the SERVER, never a localStorage flag
   * (spec section 2, requirement 5). */
  function status() {
    var c = sb();
    if (!c) { warn('status: no supabase client'); return Promise.resolve({ claimed: null, reason: 'no-client' }); }
    return uid().then(function (id) {
      if (!id) { log('status: not signed in'); return { claimed: null, reason: 'no-user' }; }
      return c.from('starter_box_grants').select('owner_id,seed,card_count,created_at')
        .eq('owner_id', id).limit(1).then(function (r) {
          if (r.error) {
            warn('status: starter_box_grants read failed: ' + r.error.message + ' -- treating as UNKNOWN, not as unclaimed');
            return { claimed: null, reason: 'read-failed', error: r.error.message };
          }
          var row = (r.data && r.data[0]) || null;
          log('status: ' + (row ? 'claimed, seed ' + row.seed : 'not claimed'));
          return { claimed: !!row, seed: row ? row.seed : null, row: row, uid: id };
        });
    });
  }

  /* RESUME READS THE LEDGER. Never a re-roll -- see the header. */
  function resume() {
    var c = sb();
    if (!c) { warn('resume: no supabase client'); return Promise.resolve(null); }
    return uid().then(function (id) {
      if (!id) return null;
      return c.from('wallet_transactions').select('meta,created_at')
        .eq('owner_id', id).eq('reason', 'starter_box')
        .order('created_at', { ascending: true }).limit(1)
        .then(function (r) {
          if (r.error) { warn('resume: ledger read failed: ' + r.error.message); return null; }
          var row = (r.data && r.data[0]) || null;
          if (!row || !row.meta) { warn('resume: no starter_box ledger marker for this account'); return null; }
          var ids = row.meta.card_ids || [];
          if (!ids.length) { warn('resume: ledger marker carries no card_ids'); return null; }
          return c.from('cards').select('*').in('id', ids).then(function (cr) {
            if (cr.error) { warn('resume: card read failed: ' + cr.error.message); return null; }
            var byId = {}, i;
            for (i = 0; i < (cr.data || []).length; i++) byId[cr.data[i].id] = cr.data[i];
            var out = [];
            for (i = 0; i < ids.length; i++) if (byId[ids[i]]) out.push(byId[ids[i]]);
            log('resume: ' + out.length + ' of ' + ids.length + ' granted cards read back from the ledger');
            return { cards: out, seed: row.meta.seed, ids: ids };
          });
        });
    });
  }

  /* One in-flight claim per tab. The belt; the PRIMARY KEY is the suspenders
   * (AGENTS.md 4). Window-scoped so it can never become a stale claim. */
  function claim() {
    if (window.__depotStarterClaimInFlight) {
      log('claim already in flight -> sharing it (race latch)');
      return window.__depotStarterClaimInFlight;
    }
    var c = sb();
    if (!c) return Promise.reject(fail('claim: no supabase client'));

    var chain = status().then(function (st) {
      if (st.claimed === true) {
        log('already claimed -> resuming from the ledger, NOT re-rolling');
        return resume().then(function (r) {
          return { ok: true, resumed: true, already_claimed: true, cards: (r && r.cards) || [], seed: r && r.seed };
        });
      }
      if (st.claimed === null && st.reason === 'read-failed') {
        /* Unknown is not "no". Attempt the claim anyway: the PK adjudicates,
         * and 23505 is a clean no-op that inserts nothing. */
        warn('claim: grant table unreadable; attempting anyway -- the PK is the gate, not this read');
      }
      return rollPayload().then(function (p) {
        /* ===================== THE REMAP ============================
         * rollPayload returns {cards, seed}. The deployed signature is
         *   depot_claim_starter_box(p_cards jsonb, p_seed bigint)
         * and PostgREST resolves overloads by NAMED ARGUMENT. Passing the
         * payload through as-is sends {cards, seed}, which matches no function
         * and comes back PGRST202 "function not found" -- NOT the P0001 the
         * spec teaches this call site to expect, so the error handling below
         * would never even see it. Remap, here, explicitly. */
        var args = { p_cards: p.cards, p_seed: p.seed };
        if (args.p_cards.length !== N_TOTAL) {
          throw fail('refusing to call ' + RPC + ' with ' + args.p_cards.length + ' cards; the server demands exactly ' + N_TOTAL);
        }
        log('calling ' + RPC + ' with ' + args.p_cards.length + ' cards, p_seed=' + args.p_seed);
        return c.rpc(RPC, args).then(function (res) {
          if (res && res.error) {
            var m = res.error.message || String(res.error);
            if (/PGRST202|Could not find the function/i.test(m)) {
              throw fail(RPC + ' not found by PostgREST: ' + m +
                         ' -- this is the ARGUMENT NAME mismatch, not a missing migration. Check p_cards/p_seed.');
            }
            throw fail(RPC + ' failed: ' + m);
          }
          var d = res && res.data;
          if (d && d.already_claimed) {
            /* A NORMAL PATH (spec 2.1 note 3), not an error: a concurrent tab
             * or an earlier session got there first. Nothing was inserted. */
            log('server says already_claimed -> resuming from the ledger');
            return resume().then(function (r) {
              return { ok: true, resumed: true, already_claimed: true, cards: (r && r.cards) || [], seed: r && r.seed };
            });
          }
          if (!d || !d.ok) throw fail(RPC + ' returned an unexpected payload: ' + JSON.stringify(d));
          log('granted ' + d.inserted + ' cards, seed ' + d.seed);
          return { ok: true, resumed: false, already_claimed: false, inserted: d.inserted, seed: d.seed,
                   cards: p.ordered, rows: p.cards, groups: p.groups, card_ids: d.card_ids };
        });
      });
    });

    window.__depotStarterClaimInFlight = chain;
    chain.then(function () { window.__depotStarterClaimInFlight = null; },
               function () { window.__depotStarterClaimInFlight = null; });
    return chain;
  }

  window.DepotStarterBox = {
    status: status,
    resume: resume,
    claim: claim,
    rollPayload: rollPayload,
    pool: buildPool,
    FIELD_SLOTS: FIELD_SLOTS
  };
  log('loaded');
})();

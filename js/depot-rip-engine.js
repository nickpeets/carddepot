/* js/depot-rip-engine.js — THE DAILY RIP: pure game logic (no DOM).
 *
 * One seeded pack a day, the same for everyone. Build a nine and a two-man
 * rotation from it, play an 8-game gauntlet (season = 8 games, OQ-7), share
 * the record.
 *
 * Reuses, does not fork:
 *   - window.depotIsPlayable        (js/depot-playability.js)  single-player gate
 *   - window.depotResolvePerson     (js/depot-position.js)     name+year -> MLB person
 *   - window.depotCleanName / depotNormName                    name hygiene
 *   - the log5 PA model from game/sim.js (same LG baselines, same blend)
 *   - the best-season ladder rung from game/builder.html (OPS / ERA, PA>=200 / IP>=50)
 *
 * Rulings honoured: cards name their season (best season by default); only
 * pitcher cards pitch; home/away confers no advantage (we alternate, and the
 * sim gives neither side an edge); every single-player card is playable — a
 * card with no MLB line plays as a labelled replacement-level line, never
 * silently dropped.
 *
 * Runs in the browser and in node (module.exports) so the sim can be tested
 * headless.
 */
(function (root) {
  'use strict';

  var MLB = 'https://statsapi.mlb.com/api/v1';
  var LAUNCH = '2026-10-29';           // Rip #1
  var PACK_SIZE = 25, PACK_PITCHERS = 6;
  var SEASON_GAMES = 8;

  /* ---------- seeded RNG (mulberry32, same as game/sim.js) ---------- */
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- dates ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localDateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ripNumber(dateKey) {
    var a = Date.UTC.apply(null, LAUNCH.split('-').map(function (x, i) { return i === 1 ? +x - 1 : +x; }));
    var b = Date.UTC.apply(null, dateKey.split('-').map(function (x, i) { return i === 1 ? +x - 1 : +x; }));
    return Math.round((b - a) / 86400000) + 1;
  }

  /* ---------- today's set ---------- */
  /* Capped at 2022: newer sets are heavy with prospects who have no MLB line
   * yet, and the MiLB rung (3) isn't wired into the Rip. */
  var YEAR_MIN = 1980, YEAR_MAX = 2022;
  function yearFor(dateKey) {
    var rng = makeRng(hashStr('rip-year|' + dateKey));
    return YEAR_MIN + Math.floor(rng() * (YEAR_MAX - YEAR_MIN + 1));
  }

  /* Position vocabulary */
  var PITCH = { P: 1, SP: 1, RP: 1, LHP: 1, RHP: 1 };
  var OF = { LF: 1, CF: 1, RF: 1, OF: 1 };
  var IF = { '1B': 1, '2B': 1, '3B': 1, SS: 1, IF: 1 };
  var FIELD_POS = { C: 1, '1B': 1, '2B': 1, '3B': 1, SS: 1, LF: 1, CF: 1, RF: 1, OF: 1, DH: 1, IF: 1 };
  function isPitcherPos(p) { return !!PITCH[String(p || '').toUpperCase()]; }

  /* Draw today's pack from a year's catalog rows.
   *   rows        data/cards-YYYY.json
   *   posLookup   fn(name) -> position token or null
   *   isPlayable  fn(card) -> bool (depotIsPlayable)
   *   cleanName   fn(raw) -> display name
   * Returns { year, set, cards:[{id,name,raw,team,number,set,pos,role}] }.
   * Only cards whose position we know are dealt, so the pack is guaranteed
   * to field a nine and a rotation. */
  function drawPack(dateKey, year, rows, posLookup, isPlayable, cleanName) {
    var rng = makeRng(hashStr('rip-pack|' + dateKey));
    var bySet = {};
    rows.forEach(function (c) {
      if (!c || !c.player) return;
      if (isPlayable && !isPlayable(c)) return;
      var name = cleanName ? cleanName(c.player) : String(c.player).trim();
      if (!name) return;
      var pos = posLookup(name);
      if (!pos) return;
      var setName = c.set || c.brand || 'Base';
      (bySet[setName] = bySet[setName] || []).push({ raw: c.player, name: name, team: c.team || '', number: c.number || '', set: setName, brand: c.brand || '', pos: pos });
    });
    // Eligible sets: deep enough to deal a balanced pack.
    var sets = Object.keys(bySet).filter(function (s) {
      var L = bySet[s], p = 0, h = 0, seen = {};
      L.forEach(function (x) { if (seen[x.name]) return; seen[x.name] = 1; if (isPitcherPos(x.pos)) p++; else h++; });
      return p >= PACK_PITCHERS * 2 && h >= (PACK_SIZE - PACK_PITCHERS) * 2;
    }).sort();
    if (!sets.length) return null;
    var setName = sets[Math.floor(rng() * sets.length)];
    var pool = shuffle(bySet[setName], rng), seen = {}, pit = [], hit = [];
    pool.forEach(function (x) {
      if (seen[x.name]) return; seen[x.name] = 1;
      if (isPitcherPos(x.pos)) { if (pit.length < PACK_PITCHERS) pit.push(x); }
      else if (hit.length < PACK_SIZE - PACK_PITCHERS) hit.push(x);
    });
    var cards = shuffle(pit.concat(hit), rng).map(function (x, i) {
      x.id = 'c' + i; x.role = isPitcherPos(x.pos) ? 'P' : 'H'; x.year = year; return x;
    });
    return { year: year, set: setName, cards: cards };
  }

  /* ---------- stat lines -> per-PA rates (mirrors builder.html) ---------- */
  function parseIP(ip) { var m = String(ip == null ? '' : ip).match(/^(\d+)(?:\.(\d))?$/); if (!m) return 0; return (+m[1]) + ((+m[2] || 0) / 3); }
  function clampRates(r) {
    ['BB', 'K', 'HR', '_2B', '_3B', '_1B'].forEach(function (k) { if (!isFinite(r[k]) || r[k] < 0) r[k] = 0; });
    var sum = r.BB + r.K + r.HR + r._2B + r._3B + r._1B;
    if (sum > 0.97) { var sc = 0.97 / sum; ['BB', 'K', 'HR', '_2B', '_3B', '_1B'].forEach(function (k) { r[k] *= sc; }); }
    return r;
  }
  function hitRates(st) {
    var AB = +st.atBats || 0, H = +st.hits || 0, d2 = +st.doubles || 0, t3 = +st.triples || 0, hr = +st.homeRuns || 0,
      bb = +st.baseOnBalls || 0, so = +st.strikeOuts || 0, hbp = +st.hitByPitch || 0, sf = +st.sacFlies || 0;
    var PA = +st.plateAppearances || (AB + bb + hbp + sf) || 0;
    if (PA < 50) return null;
    var singles = Math.max(0, H - d2 - t3 - hr);
    return clampRates({ BB: (bb + hbp) / PA, K: so / PA, HR: hr / PA, _2B: d2 / PA, _3B: t3 / PA, _1B: singles / PA });
  }
  function pitRates(st) {
    var H = +st.hits || 0, d2 = +st.doubles || 0, t3 = +st.triples || 0, hr = +st.homeRuns || 0,
      bb = +st.baseOnBalls || 0, so = +st.strikeOuts || 0, hbp = +st.hitByPitch || 0;
    var BF = +st.battersFaced || 0;
    if (!BF) BF = Math.round(parseIP(st.inningsPitched) * 3) + H + bb + hbp;
    if (BF < 50) return null;
    var singles = Math.max(0, H - d2 - t3 - hr);
    return clampRates({ BB: (bb + hbp) / BF, K: so / BF, HR: hr / BF, _2B: d2 / BF, _3B: t3 / BF, _1B: singles / BF });
  }

  /* Best season, builder.html rung 2: hitters max OPS over PA>=200, pitchers
   * min ERA over IP>=50, else the fullest season. Season totals (no-team split)
   * beat team slices. */
  function bestSeason(splits, group) {
    var by = {};
    (splits || []).forEach(function (sp) {
      if (!sp || !sp.season || !sp.stat) return;
      var size = group === 'pitching' ? (+sp.stat.battersFaced || 0) : (+sp.stat.plateAppearances || +sp.stat.atBats || 0);
      var cur = by[sp.season];
      if (!cur) { by[sp.season] = { sp: sp, size: size, total: !sp.team }; return; }
      if (cur.total) return;
      if (!sp.team) { by[sp.season] = { sp: sp, size: size, total: true }; return; }
      if (size > cur.size) by[sp.season] = { sp: sp, size: size, total: false };
    });
    var best = null, score = null, fullest = null, fsize = -1;
    Object.keys(by).forEach(function (yr) {
      var st = by[yr].sp.stat, s = by[yr].size;
      if (s > fsize) { fsize = s; fullest = yr; }
      if (group === 'pitching') {
        if (parseIP(st.inningsPitched) >= 50) { var era = parseFloat(st.era); if (isFinite(era) && (score == null || era < score)) { score = era; best = yr; } }
      } else if ((+st.plateAppearances || 0) >= 200) {
        var ops = parseFloat(st.ops); if (isFinite(ops) && (score == null || ops > score)) { score = ops; best = yr; }
      }
    });
    var pick = best || fullest;
    return pick ? { season: +pick, stat: by[pick].sp.stat } : null;
  }

  /* Replacement level: what a card with no modelable MLB line plays as.
   * Labelled on every surface ("NO LINE"). Roughly a .220 / 3 HR bench bat,
   * or a 5.50 ERA mop-up arm. */
  var REPL_HIT = { BB: 0.065, K: 0.20, HR: 0.012, _2B: 0.035, _3B: 0.004, _1B: 0.135 };
  var REPL_PIT = { BB: 0.10, K: 0.13, HR: 0.033, _2B: 0.052, _3B: 0.006, _1B: 0.165 };

  function fetchJSON(url, fetchImpl) {
    return (fetchImpl || fetch)(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  /* Resolve one card to a playable line.
   * resolvePerson(name, year) -> Promise<person|null>  (depotResolvePerson) */
  function resolveCard(card, resolvePerson, fetchImpl) {
    var group = card.role === 'P' ? 'pitching' : 'hitting';
    return Promise.resolve(resolvePerson ? resolvePerson(card.name, card.year) : null).catch(function () { return null; }).then(function (person) {
      if (!person || !person.id) return null;
      card.personId = person.id;
      var ap = person.primaryPosition && String(person.primaryPosition.abbreviation || '').toUpperCase();
      if (card.role === 'H' && FIELD_POS[ap]) card.pos = ap;
      return fetchJSON(MLB + '/people/' + person.id + '/stats?stats=yearByYear&group=' + group + '&sportId=1', fetchImpl);
    }).then(function (j) {
      var splits = j && j.stats && j.stats[0] && j.stats[0].splits;
      var b = splits ? bestSeason(splits, group) : null;
      var rates = b ? (group === 'pitching' ? pitRates(b.stat) : hitRates(b.stat)) : null;
      if (!rates) {
        card.line = { none: true };
        card.rates = clampRates(Object.assign({}, card.role === 'P' ? REPL_PIT : REPL_HIT));
        card.season = null;
        card.ovr = 40;
        return card;
      }
      var st = b.stat;
      card.season = b.season;
      card.rates = rates;
      card.line = group === 'pitching'
        ? { ERA: st.era, W: st.wins, L: st.losses, SO: st.strikeOuts, IP: st.inningsPitched, WHIP: st.whip }
        : { AVG: st.avg, HR: st.homeRuns, RBI: st.rbi, OPS: st.ops, SB: st.stolenBases };
      card.ovr = overall(card);
      return card;
    });
  }

  /* ---------- an OVR number for the card face (display only) ----------
   * Derived from the same rates the sim uses, via a one-number proxy:
   * hitters -> per-PA run value; pitchers -> runs allowed per PA. Scaled so a
   * league-average regular ~ 60, an MVP season ~ 90+. */
  var LG = { BB: 0.085, K: 0.150, HR: 0.025, _2B: 0.045, _3B: 0.005, _1B: 0.150 };
  var LW = { BB: 0.31, HR: 1.40, _2B: 0.76, _3B: 1.03, _1B: 0.47, K: -0.27 };
  function runValue(r) { var v = 0; for (var k in LW) v += LW[k] * (r[k] || 0); return v; }
  var LG_RV = runValue(LG);
  function overall(card) {
    var d = runValue(card.rates) - LG_RV;     // + good for a hitter, - good for a pitcher
    var x = card.role === 'P' ? -d : d;
    var o = Math.round(60 + x * 520);
    return Math.max(30, Math.min(99, o));
  }

  /* ---------- lineup & position fit ---------- */
  var SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  function fitFactor(natural, slot) {
    natural = String(natural || '').toUpperCase(); slot = String(slot || '').toUpperCase();
    if (slot === 'DH' || natural === slot) return 1;
    if (natural === 'DH') return 0.88;                    // a DH in the field
    if (OF[natural] && OF[slot]) return natural === 'CF' || slot !== 'CF' ? 1 : 0.97;
    if (natural === 'SS' && IF[slot]) return 1;           // a shortstop plays anywhere on the dirt
    if (IF[natural] && IF[slot]) return slot === 'SS' ? 0.92 : 0.96;
    if (slot === 'C') return 0.85;                        // nobody fakes catcher
    if (natural === 'C') return 0.93;
    return 0.90;                                          // IF <-> OF
  }
  function fitLabel(f) { return f >= 1 ? '' : f >= 0.96 ? 'stretch' : f >= 0.92 ? 'out of position' : 'way out of position'; }
  /* Apply a defensive-fit factor: fewer hits/walks on our side, more Ks. */
  function applyFit(rates, f) {
    if (f >= 1) return rates;
    return clampRates({ BB: rates.BB * f, K: rates.K / f, HR: rates.HR * f, _2B: rates._2B * f, _3B: rates._3B * f, _1B: rates._1B * f });
  }

  /* Greedy auto-manager: fill the scarcest slots first with the best fit. */
  function autoLineup(cards) {
    var hitters = cards.filter(function (c) { return c.role === 'H'; });
    var used = {}, out = {};
    var order = ['C', 'SS', 'CF', '2B', '3B', '1B', 'LF', 'RF', 'DH'];
    order.forEach(function (slot) {
      var best = null, bestV = -1e9;
      hitters.forEach(function (c) {
        if (used[c.id]) return;
        var v = (c.ovr || 50) * fitFactor(c.pos, slot);
        if (v > bestV) { bestV = v; best = c; }
      });
      if (best) { used[best.id] = 1; out[slot] = best.id; }
    });
    var pit = cards.filter(function (c) { return c.role === 'P'; }).sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); });
    return { slots: out, rotation: [pit[0] && pit[0].id, pit[1] && pit[1].id] };
  }

  /* Batting order: by run value, the old-school way (best OBP-ish up top,
   * power 3-4-5). Good enough for an MVP; the player sets defense, we set order. */
  function battingOrder(entries) {
    var arr = entries.slice().sort(function (a, b) { return runValue(b.rates) - runValue(a.rates); });
    // arr[0..8] best->worst; classic slotting: 2nd best leads off, best bats 3rd
    var idx = [1, 3, 0, 2, 4, 5, 6, 7, 8];
    return idx.map(function (i) { return arr[i]; }).filter(Boolean);
  }

  /* ---------- sim (log5 PA model from game/sim.js) ---------- */
  var LGS = { BB: 0.085, K: 0.150, HR: 0.025, _2B: 0.045, _3B: 0.005, _1B: 0.150 };
  function log5(b, p, lg) { var num = b * p / lg, den = num + (1 - b) * (1 - p) / (1 - lg); return den <= 0 ? 0 : num / den; }
  var KEYS = ['BB', 'K', 'HR', '_2B', '_3B', '_1B'];
  function dist(bat, pit) {
    var p = {}, used = 0;
    KEYS.forEach(function (k) { p[k] = log5(bat[k], pit[k], LGS[k]); used += p[k]; });
    p.OUT = Math.max(0.05, 1 - used);
    var tot = used + p.OUT;
    for (var k in p) p[k] /= tot;
    return p;
  }
  function draw(d, rng) {
    var r = rng(), acc = 0, order = ['BB', 'K', 'HR', '_2B', '_3B', '_1B', 'OUT'];
    for (var i = 0; i < order.length; i++) { acc += d[order[i]]; if (r <= acc) return order[i]; }
    return 'OUT';
  }

  /* One half inning. bases: array of batter indices or -1. Light, realistic
   * baserunning: runner from 2nd scores on a single 60%, 1st-to-3rd 28%,
   * runner from 1st scores on a double 45%, runner on 3rd tags on an out in
   * play (<2 outs) 45%, grounder with a man on 1st and <2 outs is a DP 12%. */
  function half(team, pit, startIdx, rng, box, walkoffNeed) {
    var outs = 0, runs = 0, b = [-1, -1, -1], idx = startIdx, hits = 0;
    while (outs < 3) {
      var bi = idx % 9, bat = team[bi];
      var o = draw(dist(bat.rates, pit), rng), scored = 0;
      var line = box[bi] || (box[bi] = { AB: 0, H: 0, HR: 0, RBI: 0, BB: 0, R: 0 });
      function score(i) { if (i >= 0) { scored++; (box[i] || (box[i] = { AB: 0, H: 0, HR: 0, RBI: 0, BB: 0, R: 0 })).R++; } }
      if (o === 'K') { outs++; line.AB++; }
      else if (o === 'OUT') {
        line.AB++;
        if (b[0] >= 0 && outs < 2 && rng() < 0.12) { outs += 2; b[0] = -1; }
        else {
          outs++;
          if (outs < 3 && b[2] >= 0 && rng() < 0.45) { score(b[2]); b[2] = -1; }
        }
      } else if (o === 'BB') {
        line.BB++;
        if (b[0] >= 0) { if (b[1] >= 0) { if (b[2] >= 0) score(b[2]); b[2] = b[1]; } b[1] = b[0]; }
        b[0] = bi;
      } else {
        line.AB++; line.H++; hits++;
        if (o === 'HR') { line.HR++; score(b[2]); score(b[1]); score(b[0]); score(bi); b = [-1, -1, -1]; }
        else if (o === '_3B') { score(b[2]); score(b[1]); score(b[0]); b = [-1, -1, bi]; }
        else if (o === '_2B') {
          score(b[2]); score(b[1]);
          var r1 = b[0], n3 = -1;
          if (r1 >= 0) { if (rng() < 0.45) score(r1); else n3 = r1; }
          b = [-1, bi, n3];
        } else { // single
          score(b[2]);
          var n = [bi, -1, -1];
          if (b[1] >= 0) { if (rng() < 0.6) score(b[1]); else n[2] = b[1]; }
          if (b[0] >= 0) { if (n[2] < 0 && rng() < 0.28) n[2] = b[0]; else n[1] = b[0]; }
          b = n;
        }
      }
      line.RBI += (o === 'OUT' && scored && outs < 3) || (o !== 'K' && o !== 'OUT') ? scored : 0;
      runs += scored; idx++;
      if (walkoffNeed != null && runs >= walkoffNeed) break;
    }
    return { runs: runs, hits: hits, next: idx % 9 };
  }

  /* One game. Sides are { lineup:[{name,rates}x9], pitcher:{name,rates} }.
   * Who bats last alternates by game; no side gets an edge from it. */
  function playGame(away, home, rng) {
    var ai = 0, hi = 0, as = 0, hs = 0, inn = 0, ab = {}, hb = {}, aH = 0, hH = 0, lineA = [], lineH = [];
    while (true) {
      inn++;
      var t = half(away.lineup, home.pitcher.rates, ai, rng, ab, null); ai = t.next; as += t.runs; aH += t.hits; lineA.push(t.runs);
      if (inn >= 9 && hs > as) { lineH.push('X'); break; }
      var need = inn >= 9 ? (as - hs + 1) : null;
      var u = half(home.lineup, away.pitcher.rates, hi, rng, hb, need); hi = u.next; hs += u.runs; hH += u.hits; lineH.push(u.runs);
      if (inn >= 9 && as !== hs) break;
      if (inn >= 15) { // marathon guard: sudden death on a coin
        if (rng() < 0.5) as++; else hs++;
        break;
      }
    }
    return { away: as, home: hs, innings: inn, awayHits: aH, homeHits: hH, awayBox: ab, homeBox: hb, lineA: lineA, lineH: lineH };
  }

  /* ---------- the gauntlet ---------- */
  var OPPONENTS = [
    { name: 'Sandlot Strays', m: 0.82 },
    { name: 'Tri-County Tractors', m: 0.88 },
    { name: 'Rust Belt Rollers', m: 0.94 },
    { name: 'Gulf Coast Gators', m: 0.98 },
    { name: 'Desert Sidewinders', m: 1.02 },
    { name: 'Harbor City Clippers', m: 1.06 },
    { name: 'Ironbound Express', m: 1.10 },
    { name: 'The Dynasty', m: 1.15 }
  ];
  function oppSide(o) {
    var m = o.m, r = {};
    KEYS.forEach(function (k) { r[k] = k === 'K' ? LGS[k] / m : LGS[k] * m; });
    var p = {};
    KEYS.forEach(function (k) { p[k] = k === 'K' ? LGS[k] * m : LGS[k] / m; });
    var lineup = []; for (var i = 0; i < 9; i++) lineup.push({ name: o.name, rates: clampRates(Object.assign({}, r)) });
    return { lineup: lineup, pitcher: { name: o.name + ' SP', rates: clampRates(p) } };
  }

  /* Play the season. lineupEntries: 9 x { card, slot } in any order;
   * rotation: [cardA, cardB]. Deterministic in (dateKey, picks). */
  function playSeason(dateKey, lineupEntries, rotation) {
    var seed = hashStr('rip-season|' + dateKey + '|' + lineupEntries.map(function (e) { return e.card.id + '@' + e.slot; }).sort().join(',') + '|' + rotation.map(function (c) { return c.id; }).join(','));
    var rng = makeRng(seed);
    var ordered = battingOrder(lineupEntries.map(function (e) {
      var f = fitFactor(e.card.pos, e.slot);
      return { card: e.card, slot: e.slot, fit: f, name: e.card.name, rates: applyFit(e.card.rates, f) };
    }));
    var games = [], w = 0, l = 0, rf = 0, ra = 0, stars = {};
    OPPONENTS.forEach(function (o, g) {
      var sp = rotation[g % rotation.length];
      var me = { lineup: ordered, pitcher: { name: sp.name, rates: sp.rates } };
      var them = oppSide(o);
      var meHome = g % 2 === 1;
      var res = meHome ? playGame(them, me, rng) : playGame(me, them, rng);
      var my = meHome ? res.home : res.away, their = meHome ? res.away : res.home;
      var box = meHome ? res.homeBox : res.awayBox;
      var win = my > their; if (win) w++; else l++;
      rf += my; ra += their;
      // star of the game: most H + 2*HR + RBI
      var best = null, bv = -1;
      Object.keys(box).forEach(function (i) {
        var b = box[i], v = b.H + 2 * b.HR + b.RBI + 0.5 * b.R;
        if (v > bv) { bv = v; best = { name: ordered[i].name, line: b }; }
        var s = stars[ordered[i].name] || (stars[ordered[i].name] = { H: 0, AB: 0, HR: 0, RBI: 0 });
        s.H += b.H; s.AB += b.AB; s.HR += b.HR; s.RBI += b.RBI;
      });
      games.push({ n: g + 1, opp: o.name, home: meHome, my: my, their: their, win: win, innings: res.innings, sp: sp.name, star: best });
    });
    var mvp = null, mv = -1;
    Object.keys(stars).forEach(function (n) { var s = stars[n], v = s.H + 2 * s.HR + s.RBI; if (v > mv) { mv = v; mvp = { name: n, line: s }; } });
    return { w: w, l: l, rf: rf, ra: ra, games: games, mvp: mvp, order: ordered.map(function (e) { return { name: e.name, slot: e.slot, fit: e.fit }; }) };
  }

  function verdict(w) {
    return ['Rained Out', 'Cellar Dwellers', 'Rebuilding Year', 'Wait Till Next Year', 'Playing .500', 'Wild Card', 'Division Champs', 'Pennant Winners', 'PERFECT RIP'][w] || '';
  }

  function shareText(dateKey, pack, season) {
    var chips = season.games.map(function (g) { return g.win ? '🟩' : '🟥'; }).join('');
    var diff = season.rf - season.ra;
    return '⚾ The Daily Rip #' + ripNumber(dateKey) + ' — ' + pack.year + ' ' + pack.set + '\n' +
      season.w + '-' + season.l + ' (' + (diff >= 0 ? '+' : '') + diff + ') · ' + verdict(season.w) + '\n' +
      chips + '\n' +
      (season.mvp ? 'MVP: ' + season.mvp.name + '\n' : '') +
      'thedepot.cards/rip';
  }

  var api = {
    LAUNCH: LAUNCH, SLOTS: SLOTS, SEASON_GAMES: SEASON_GAMES, OPPONENTS: OPPONENTS,
    makeRng: makeRng, hashStr: hashStr, localDateKey: localDateKey, ripNumber: ripNumber,
    yearFor: yearFor, drawPack: drawPack, resolveCard: resolveCard, bestSeason: bestSeason,
    hitRates: hitRates, pitRates: pitRates, overall: overall, fitFactor: fitFactor, fitLabel: fitLabel,
    autoLineup: autoLineup, playSeason: playSeason, playGame: playGame, oppSide: oppSide,
    verdict: verdict, shareText: shareText, isPitcherPos: isPitcherPos
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DepotRip = api;
})(typeof window !== 'undefined' ? window : this);

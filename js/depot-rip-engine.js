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
    // Dead-ball lines (Cobb, Wagner) have no strikeout column. Treating that as
    // zero would make them unstrikeoutable, so use a period-typical 7%.
    var kRate = (st.strikeOuts == null || st.strikeOuts === '' || st.strikeOuts === '-') ? 0.07 : so / PA;
    return clampRates({ BB: (bb + hbp) / PA, K: kRate, HR: hr / PA, _2B: d2 / PA, _3B: t3 / PA, _1B: singles / PA });
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
    /* Pitchers: a starter's best season is judged among seasons with 120+ IP,
     * so a reliever's 60-inning gem can't masquerade as an ace. A pitcher who
     * never threw 120 in a season is a RELIEVER and is flagged as one: he can
     * still start in the Rip, at a cost (see ROTATION_RELIEVER). */
    var ipFloor = 50, starter = false;
    if (group === 'pitching') {
      Object.keys(by).forEach(function (yr) { if (parseIP(by[yr].sp.stat.inningsPitched) >= 120) starter = true; });
      if (starter) ipFloor = 120;
    }
    var best = null, score = null, fullest = null, fsize = -1;
    Object.keys(by).forEach(function (yr) {
      var st = by[yr].sp.stat, s = by[yr].size;
      if (s > fsize) { fsize = s; fullest = yr; }
      if (group === 'pitching') {
        if (parseIP(st.inningsPitched) >= ipFloor) { var era = parseFloat(st.era); if (isFinite(era) && (score == null || era < score)) { score = era; best = yr; } }
      } else if ((+st.plateAppearances || 0) >= 200) {
        var ops = parseFloat(st.ops); if (isFinite(ops) && (score == null || ops > score)) { score = ops; best = yr; }
      }
    });
    var pick = best || fullest;
    return pick ? { season: +pick, stat: by[pick].sp.stat, reliever: group === 'pitching' && !starter } : null;
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
      /* The resolved MLB person outranks player_positions.json, whose name-keyed
       * rows collide (two Randy Johnsons, two Will Smiths). Playtest 2026-10-29
       * dealt the Big Unit as a .124 hitter until this. */
      if (isPitcherPos(ap) && card.role === 'H') { card.role = 'P'; card.pos = 'P'; group = 'pitching'; }
      else if (FIELD_POS[ap] && card.role === 'P') { card.role = 'H'; group = 'hitting'; }
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
      card.reliever = !!b.reliever;
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
  /* Scaled so an ordinary everyday line sits in the 60s and only historic
   * seasons touch the 90s. The first scale (x520) pinned half of any
   * best-season pack at 99, which flattened every card into the same card. */
  var OVR_SCALE = 260;
  function overall(card) {
    // A pitcher's OVR is what he's worth as a STARTER here, reliever tax included.
    var d = runValue(card.role === 'P' ? starterRates(card) : card.rates) - LG_RV;     // + good for a hitter, - good for a pitcher
    var x = card.role === 'P' ? -d : d;
    var o = Math.round(62 + x * OVR_SCALE);
    return Math.max(25, Math.min(99, o));
  }

  /* ---------- lineup & position fit ----------
   * Playtest 2026-10-29: with soft penalties the best nine played wherever,
   * Acuña caught and Will Clark played short, and a careful lineup was worth
   * ~0.15 wins over a careless one. These bite. */
  var SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  var FIT = {
    //            from: C     1B    2B    3B    SS    LF    CF    RF    DH
    C:  { C: 1, '1B': .70, '2B': .70, '3B': .70, SS: .70, LF: .70, CF: .70, RF: .70, DH: .68 },
    '1B': { C: .92, '1B': 1, '2B': .97, '3B': .96, SS: .97, LF: .95, CF: .95, RF: .95, DH: .92 },
    '2B': { C: .80, '1B': .82, '2B': 1, '3B': .92, SS: 1, LF: .82, CF: .85, RF: .82, DH: .78 },
    '3B': { C: .84, '1B': .86, '2B': .93, '3B': 1, SS: .98, LF: .85, CF: .86, RF: .86, DH: .80 },
    SS: { C: .76, '1B': .76, '2B': .90, '3B': .88, SS: 1, LF: .78, CF: .82, RF: .78, DH: .72 },
    LF: { C: .86, '1B': .88, '2B': .90, '3B': .89, SS: .92, LF: 1, CF: 1, RF: 1, DH: .86 },
    CF: { C: .78, '1B': .78, '2B': .84, '3B': .82, SS: .86, LF: .90, CF: 1, RF: .91, DH: .75 },
    RF: { C: .86, '1B': .88, '2B': .90, '3B': .89, SS: .92, LF: 1, CF: 1, RF: 1, DH: .86 },
    DH: { C: 1, '1B': 1, '2B': 1, '3B': 1, SS: 1, LF: 1, CF: 1, RF: 1, DH: 1 }
  };
  function natOf(p) {
    p = String(p || '').toUpperCase();
    if (p === 'OF') return 'LF';
    if (p === 'IF' || p === 'UT') return '2B';
    if (p === 'TWP') return 'DH';
    return p;
  }
  function fitFactor(natural, slot) {
    slot = String(slot || '').toUpperCase();
    var row = FIT[slot]; if (!row) return 1;
    var f = row[natOf(natural)];
    return f == null ? 0.85 : f;
  }
  function fitLabel(f) { return f >= 1 ? '' : f >= 0.95 ? 'a stretch' : f >= 0.86 ? 'out of position' : 'way out of position'; }
  /* Apply a defensive-fit factor: fewer hits/walks on our side, more Ks. */
  function applyFit(rates, f) {
    if (f >= 1) return rates;
    return clampRates({ BB: rates.BB * f, K: rates.K / f, HR: rates.HR * f, _2B: rates._2B * f, _3B: rates._3B * f, _1B: rates._1B * f });
  }
  /* A reliever starting: he tires the second time through. Modelled as a flat
   * worsening of what he allows. */
  var ROTATION_RELIEVER = 1.18;
  function starterRates(card) {
    if (!card.reliever) return card.rates;
    var r = card.rates, m = ROTATION_RELIEVER;
    return clampRates({ BB: r.BB * m, K: r.K / m, HR: r.HR * m, _2B: r._2B * m, _3B: r._3B * m, _1B: r._1B * m });
  }

  /* ---------- the marquee limit (Nick's Overall-rating ruling) ----------
   * Prestige is capped by a marquee lineup limit. In the Rip: at most
   * MARQUEE_MAX HOF/SUPERSTAR-tier players among your nine and two starters.
   * An all-time-heroes pack is a pile of legends; this is what makes you choose. */
  var MARQUEE_MAX = 3, MARQUEE_OVR = 88;
  /* Marquee = prestige tier HOF/SUPERSTAR, OR a historic line (OVR 88+).
   * player_tiers.json doesn't list pre-war legends (no Ruth, Gehrig, Cobb),
   * and a cap that a legends pack walks straight past isn't a cap. */
  function isMarquee(card) { return !!card && (card.tier === 'HOF' || card.tier === 'SUPERSTAR' || (card.ovr || 0) >= MARQUEE_OVR); }

  /* Greedy auto-manager: fill the scarcest slots first with the best fit,
   * respecting the marquee limit. Deliberately decent, not optimal. */
  function autoLineup(cards) {
    var hitters = cards.filter(function (c) { return c.role === 'H'; });
    var pit = cards.filter(function (c) { return c.role === 'P'; }).sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); });
    var used = {}, out = {}, stars = 0;
    var rotation = [];
    // the ace first: one marquee arm if he's the best arm
    pit.forEach(function (p) {
      if (rotation.length >= 2) return;
      if (isMarquee(p) && stars >= 1) return;
      rotation.push(p.id); if (isMarquee(p)) stars++;
    });
    var order = ['C', 'SS', 'CF', '2B', '3B', '1B', 'LF', 'RF', 'DH'];
    order.forEach(function (slot) {
      var best = null, bestV = -1e9;
      hitters.forEach(function (c) {
        if (used[c.id]) return;
        if (isMarquee(c) && stars >= MARQUEE_MAX) return;
        var v = (c.ovr || 50) * fitFactor(c.pos, slot);
        if (v > bestV) { bestV = v; best = c; }
      });
      if (best) { used[best.id] = 1; out[slot] = best.id; if (isMarquee(best)) stars++; }
    });
    return { slots: out, rotation: rotation };
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
  /* Box-score bookkeeping is counting only: it never draws from rng, so a
   * lineup's results are identical with or without it. */
  function blankLine() { return { AB: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, BB: 0, K: 0, R: 0 }; }
  function blankPitch() { return { outs: 0, BF: 0, H: 0, HR: 0, BB: 0, K: 0, R: 0 }; }
  function half(team, pit, startIdx, rng, box, walkoffNeed, pst) {
    var outs = 0, runs = 0, b = [-1, -1, -1], idx = startIdx, hits = 0;
    pst = pst || blankPitch();
    while (outs < 3) {
      var bi = idx % 9, bat = team[bi], outsBefore = outs;
      var o = draw(dist(bat.rates, pit), rng), scored = 0;
      var line = box[bi] || (box[bi] = blankLine());
      function score(i) { if (i >= 0) { scored++; (box[i] || (box[i] = blankLine())).R++; } }
      pst.BF++;
      if (o === 'K') { outs++; line.AB++; line.K++; pst.K++; }
      else if (o === 'BB') { pst.BB++; }
      else if (o !== 'OUT') { pst.H++; if (o === 'HR') pst.HR++; if (o === '_2B') line.D++; if (o === '_3B') line.T++; }
      if (o === 'K') { /* counted above */ }
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
      pst.R += scored; pst.outs += Math.min(3, outs) - outsBefore;
      if (walkoffNeed != null && runs >= walkoffNeed) break;
    }
    return { runs: runs, hits: hits, next: idx % 9 };
  }
  function ipText(outs) { return Math.floor(outs / 3) + '.' + (outs % 3); }

  /* One game. Sides are { lineup:[{name,rates}x9], pitcher:{name,rates} }.
   * Who bats last alternates by game; no side gets an edge from it. */
  function playGame(away, home, rng) {
    var ai = 0, hi = 0, as = 0, hs = 0, inn = 0, ab = {}, hb = {}, aH = 0, hH = 0, lineA = [], lineH = [];
    var homeP = blankPitch(), awayP = blankPitch();   // what each side's starter allowed
    while (true) {
      inn++;
      var t = half(away.lineup, home.pitcher.rates, ai, rng, ab, null, homeP); ai = t.next; as += t.runs; aH += t.hits; lineA.push(t.runs);
      if (inn >= 9 && hs > as) { lineH.push('X'); break; }
      var need = inn >= 9 ? (as - hs + 1) : null;
      var u = half(home.lineup, away.pitcher.rates, hi, rng, hb, need, awayP); hi = u.next; hs += u.runs; hH += u.hits; lineH.push(u.runs);
      if (inn >= 9 && as !== hs) break;
      if (inn >= 15) { // marathon guard: sudden death on a coin
        if (rng() < 0.5) { as++; lineA[lineA.length - 1]++; homeP.R++; } else { hs++; lineH[lineH.length - 1]++; awayP.R++; }
        break;
      }
    }
    return { away: as, home: hs, innings: inn, awayHits: aH, homeHits: hH, awayBox: ab, homeBox: hb, lineA: lineA, lineH: lineH, homePitch: homeP, awayPitch: awayP };
  }

  /* ---------- the gauntlet ---------- */
  /* Opponents are built from TODAY'S PACK, not from a fixed league: the
   * baseline is the best nine and best three arms the pack offers, scaled by
   * m. So a legends pack faces legends-grade opposition and a 1989 commons
   * pack faces commons. Playtest 2026-10-29: against a fixed league, a
   * best-season pack averaged 6-7 wins and an all-time pack went 8-0 73% of
   * the time. The test now is how close you get to the pack's ceiling. */
  var OPPONENTS = [
    { name: 'Sandlot Strays', m: 0.80 },
    { name: 'Tri-County Tractors', m: 0.85 },
    { name: 'Rust Belt Rollers', m: 0.89 },
    { name: 'Gulf Coast Gators', m: 0.93 },
    { name: 'Desert Sidewinders', m: 0.96 },
    { name: 'Harbor City Clippers', m: 0.99 },
    { name: 'Ironbound Express', m: 1.02 },
    { name: 'The Dynasty', m: 1.06 }
  ];
  function avgRates(list) {
    var r = { BB: 0, K: 0, HR: 0, _2B: 0, _3B: 0, _1B: 0 };
    if (!list.length) return Object.assign({}, LGS);
    list.forEach(function (x) { KEYS.forEach(function (k) { r[k] += x[k] / list.length; }); });
    return r;
  }
  function packBaseline(cards) {
    if (!cards || !cards.length) return { hit: Object.assign({}, LGS), pit: Object.assign({}, LGS) };
    var H = cards.filter(function (c) { return c.role === 'H' && c.rates; }).sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); }).slice(0, 9);
    var P = cards.filter(function (c) { return c.role === 'P' && c.rates; }).sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0); }).slice(0, 3);
    return { hit: avgRates(H.map(function (c) { return c.rates; })), pit: avgRates(P.map(starterRates)) };
  }
  function oppSide(o, base) {
    base = base || { hit: LGS, pit: LGS };
    var m = o.m, r = {}, p = {};
    KEYS.forEach(function (k) { r[k] = k === 'K' ? base.hit[k] / m : base.hit[k] * m; });
    KEYS.forEach(function (k) { p[k] = k === 'K' ? base.pit[k] * m : base.pit[k] / m; });
    var lineup = []; for (var i = 0; i < 9; i++) lineup.push({ name: o.name, rates: clampRates(Object.assign({}, r)) });
    return { lineup: lineup, pitcher: { name: o.name + ' SP', rates: clampRates(p) } };
  }

  /* Play the season. lineupEntries: 9 x { card, slot } in any order;
   * rotation: [cardA, cardB]; packCards: all cards in today's pack (sets the
   * opposition). Deterministic in (dateKey, picks). */
  function playSeason(dateKey, lineupEntries, rotation, packCards) {
    var base = packBaseline(packCards);
    var seed = hashStr('rip-season|' + dateKey + '|' + lineupEntries.map(function (e) { return e.card.id + '@' + e.slot; }).sort().join(',') + '|' + rotation.map(function (c) { return c.id; }).join(','));
    var rng = makeRng(seed);
    var ordered = battingOrder(lineupEntries.map(function (e) {
      var f = fitFactor(e.card.pos, e.slot);
      return { card: e.card, slot: e.slot, fit: f, name: e.card.name, rates: applyFit(e.card.rates, f) };
    }));
    var games = [], w = 0, l = 0, rf = 0, ra = 0, stars = {}, arms = {};
    OPPONENTS.forEach(function (o, g) {
      var sp = rotation[g % rotation.length];
      var me = { lineup: ordered, pitcher: { name: sp.name, rates: starterRates(sp) } };
      var them = oppSide(o, base);
      var meHome = g % 2 === 1;
      var res = meHome ? playGame(them, me, rng) : playGame(me, them, rng);
      var my = meHome ? res.home : res.away, their = meHome ? res.away : res.home;
      var box = meHome ? res.homeBox : res.awayBox;
      var pit = meHome ? res.homePitch : res.awayPitch;   // our starter's line
      var win = my > their; if (win) w++; else l++;
      rf += my; ra += their;
      // star of the game: most H + 2*HR + RBI
      var best = null, bv = -1, rows = [];
      ordered.forEach(function (e, i) {
        var b = box[i] || blankLine(), v = b.H + 2 * b.HR + b.RBI + 0.5 * b.R;
        if (v > bv) { bv = v; best = { name: e.name, line: b }; }
        var s = stars[e.name] || (stars[e.name] = Object.assign({ name: e.name, slot: e.slot }, blankLine()));
        for (var k in b) s[k] += b[k];
        rows.push(Object.assign({ name: e.name, slot: e.slot }, b));
      });
      var a = arms[sp.name] || (arms[sp.name] = Object.assign({ name: sp.name, GS: 0, W: 0, L: 0 }, blankPitch()));
      a.GS++; if (win) a.W++; else a.L++;
      for (var pk in pit) a[pk] += pit[pk];
      games.push({
        n: g + 1, opp: o.name, home: meHome, my: my, their: their, win: win, innings: res.innings, sp: sp.name, star: best,
        line: { my: meHome ? res.lineH : res.lineA, their: meHome ? res.lineA : res.lineH, myHits: meHome ? res.homeHits : res.awayHits, theirHits: meHome ? res.awayHits : res.homeHits },
        box: rows,
        pitch: { name: sp.name, IP: ipText(pit.outs), H: pit.H, R: pit.R, BB: pit.BB, K: pit.K, HR: pit.HR, dec: win ? 'W' : 'L' }
      });
    });
    var mvp = null, mv = -1;
    Object.keys(stars).forEach(function (n) { var s = stars[n], v = s.H + 2 * s.HR + s.RBI; if (v > mv) { mv = v; mvp = { name: n, line: s }; } });
    var batting = ordered.map(function (e) { var s = stars[e.name]; s.AVG = s.AB ? (s.H / s.AB).toFixed(3).replace(/^0/, '') : '.000'; return s; });
    var pitching = rotation.map(function (c) {
      var a = arms[c.name]; if (!a) return null;
      var ip = a.outs / 3;
      a.IP = ipText(a.outs); a.ERA = ip ? (a.R * 9 / ip).toFixed(2) : '-.--';
      return a;
    }).filter(Boolean);
    return { w: w, l: l, rf: rf, ra: ra, games: games, mvp: mvp, batting: batting, pitching: pitching,
      order: ordered.map(function (e) { return { name: e.name, slot: e.slot, fit: e.fit }; }) };
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
    autoLineup: autoLineup, playSeason: playSeason, playGame: playGame, oppSide: oppSide, packBaseline: packBaseline,
    MARQUEE_MAX: MARQUEE_MAX, isMarquee: isMarquee, starterRates: starterRates, runValue: runValue,
    verdict: verdict, shareText: shareText, isPitcherPos: isPitcherPos
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DepotRip = api;
})(typeof window !== 'undefined' ? window : this);

/* ===========================================================================
   The Depot — log5 baseball sim engine (demo lineups)
   Drives the static NES screen in game/index.html via stable element IDs.
   Discrete state updates (not animation), paced for legibility.
   =========================================================================== */
(function () {
  'use strict';

  // ---- League baselines (late-1980s, per PA) ----------------------------
  var LG = { BB: 0.085, K: 0.150, HR: 0.025, _2B: 0.045, _3B: 0.005, _1B: 0.150, OUT: 0.490 };
  // OUT is the remainder; the named rates above sum with OUT to ~1.0.

  // log5: combine batter rate (b), pitcher rate-allowed (pi) vs league (lg)
  function log5(b, pi, lg) {
    var num = (b * pi / lg);
    var den = num + ((1 - b) * (1 - pi) / (1 - lg));
    if (den <= 0) return 0;
    return num / den;
  }

  // Build a normalized outcome distribution for a batter vs a pitcher.
  function matchupDist(bat, pit) {
    var keys = ['BB', 'K', 'HR', '_2B', '_3B', '_1B'];
    var p = {};
    keys.forEach(function (k) { p[k] = log5(bat[k], pit[k], LG[k]); });
    // OUT (in play) gets whatever probability remains; floor at a small value.
    var used = keys.reduce(function (s, k) { return s + p[k]; }, 0);
    p.OUT = Math.max(0.05, 1 - used);
    // Normalize to exactly 1.
    var total = used + p.OUT;
    Object.keys(p).forEach(function (k) { p[k] = p[k] / total; });
    return p;
  }

  function pick(dist, rng) {
    var r = rng(), acc = 0;
    var order = ['BB', 'K', 'HR', '_2B', '_3B', '_1B', 'OUT'];
    for (var i = 0; i < order.length; i++) {
      acc += dist[order[i]];
      if (r <= acc) return order[i];
    }
    return 'OUT';
  }

  // ---- Ball-location by batter tendency ---------------------------------
  // Tendencies bias which field a batted ball goes to.
  // Fields: LEFT, LEFT-CENTER, CENTER, RIGHT-CENTER, RIGHT.
  var FIELDS = ['LEFT', 'LEFT-CENTER', 'CENTER', 'RIGHT-CENTER', 'RIGHT'];
  var TENDENCY_WEIGHTS = {
    // Assume right-handed unless noted; "pull" => left side, "opposite" => right side.
    pull:     [0.40, 0.25, 0.18, 0.10, 0.07],
    spray:    [0.20, 0.20, 0.24, 0.18, 0.18],
    opposite: [0.07, 0.10, 0.18, 0.25, 0.40]
  };
  function locationFor(tendency, rng) {
    var w = TENDENCY_WEIGHTS[tendency] || TENDENCY_WEIGHTS.spray;
    var r = rng(), acc = 0;
    for (var i = 0; i < w.length; i++) { acc += w[i]; if (r <= acc) return FIELDS[i]; }
    return 'CENTER';
  }
  // Map a field location to the fielder/base most involved (for sprite emphasis).
  var FIELD_TO_SPRITE = {
    'LEFT': 'sprite-lf', 'LEFT-CENTER': 'sprite-cf', 'CENTER': 'sprite-cf',
    'RIGHT-CENTER': 'sprite-cf', 'RIGHT': 'sprite-rf'
  };
  var FIELD_TO_INFIELD = {
    'LEFT': 'sprite-3b', 'LEFT-CENTER': 'sprite-ss', 'CENTER': 'sprite-2b',
    'RIGHT-CENTER': 'sprite-2b', 'RIGHT': 'sprite-1b'
  };

  // ---- Demo lineups (1987-ish stat lines + tendencies) ------------------
  // Rates are per-PA; AVG/HR/RBI shown on panels are cosmetic display values.
  function batter(name, avg, hr, rbi, rates, tendency) {
    return { name: name, avg: avg, hr: hr, rbi: rbi,
      BB: rates.BB, K: rates.K, HR: rates.HR, _2B: rates._2B, _3B: rates._3B, _1B: rates._1B,
      tendency: tendency };
  }
  // helper to make a rate object
  function R(bb, k, hr, d, t, s) { return { BB: bb, K: k, HR: hr, _2B: d, _3B: t, _1B: s }; }

  var MUDCATS = {
    name: 'MUDCATS', code: 'mudcats',
    pitcher: { name: 'P SANCHEZ (R)', era: '2.14', w: '8', l: '3',
      BB: 0.075, K: 0.190, HR: 0.020, _2B: 0.040, _3B: 0.004, _1B: 0.140 },
    lineup: [
      batter('OTIS',      '.301', 12, 55, R(0.09, 0.12, 0.020, 0.050, 0.008, 0.165), 'spray'),
      batter('JEFFWAY',   '.288',  9, 47, R(0.08, 0.13, 0.015, 0.045, 0.006, 0.160), 'pull'),
      batter('RONALDS',   '.312', 24, 88, R(0.11, 0.16, 0.040, 0.055, 0.004, 0.150), 'pull'),
      batter('JUDGE',     '.295', 31, 95, R(0.12, 0.21, 0.052, 0.050, 0.003, 0.130), 'pull'),
      batter('SIDD',      '.278', 18, 71, R(0.09, 0.17, 0.030, 0.048, 0.005, 0.145), 'spray'),
      batter('TERRYTON',  '.266', 14, 60, R(0.08, 0.18, 0.026, 0.044, 0.005, 0.140), 'opposite'),
      batter('HATHE',     '.255',  8, 44, R(0.07, 0.16, 0.014, 0.040, 0.006, 0.150), 'spray'),
      batter('RABELL',    '.243',  5, 33, R(0.06, 0.19, 0.010, 0.038, 0.007, 0.145), 'opposite'),
      batter('SANCHEZ',   '.180',  1,  9, R(0.04, 0.28, 0.004, 0.025, 0.004, 0.110), 'spray')
    ]
  };

  var ACORNS = {
    name: 'ACORNS', code: 'acorns',
    pitcher: { name: 'D DANTE (L)', era: '3.02', w: '11', l: '7',
      BB: 0.090, K: 0.155, HR: 0.028, _2B: 0.047, _3B: 0.005, _1B: 0.150 },
    lineup: [
      batter('RONALD',    '.299', 10, 51, R(0.10, 0.13, 0.018, 0.050, 0.009, 0.165), 'spray'),
      batter('ARTINEZ',   '.305', 16, 67, R(0.09, 0.14, 0.028, 0.052, 0.006, 0.158), 'pull'),
      batter('KENNY',     '.321', 27, 99, R(0.12, 0.15, 0.045, 0.056, 0.004, 0.150), 'pull'),
      batter('DAVIDSON',  '.284', 29, 90, R(0.11, 0.22, 0.050, 0.048, 0.003, 0.128), 'pull'),
      batter('JAYNER',    '.271', 15, 63, R(0.08, 0.18, 0.027, 0.046, 0.005, 0.142), 'spray'),
      batter('OBYRON',    '.262', 11, 54, R(0.08, 0.17, 0.020, 0.043, 0.005, 0.145), 'opposite'),
      batter('HENRO',     '.250',  7, 40, R(0.07, 0.16, 0.013, 0.040, 0.006, 0.150), 'spray'),
      batter('VALMON',    '.238',  4, 29, R(0.06, 0.20, 0.009, 0.036, 0.007, 0.143), 'opposite'),
      batter('DANTE',     '.165',  0,  6, R(0.04, 0.30, 0.002, 0.022, 0.003, 0.105), 'spray')
    ]
  };

  // ---- Seeded RNG (mulberry32) so headless runs are reproducible-ish ----
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- NES-flavored result phrasing pools --------------------------------
  var PHRASES = {
    _1B: ['SINGLE', 'BASE HIT', 'LINES A SINGLE', 'PUNCHES ONE THROUGH', 'BLOOP SINGLE'],
    _2B: ['DOUBLE', 'RIPS A DOUBLE', 'INTO THE GAP', 'STANDUP DOUBLE', 'TWO-BAGGER'],
    _3B: ['TRIPLE', 'LEGS OUT A TRIPLE', 'OFF THE WALL — TRIPLE', 'THREE-BAGGER'],
    HR:  ['HOME RUN!', 'GONE!', 'CRUSHES IT — DINGER!', 'OVER THE WALL!', 'TATER!'],
    BB:  ['WALK', 'WORKS A WALK', 'BALL FOUR', 'FREE PASS'],
    K:   ['STRIKES OUT', 'PUNCHED OUT', 'GOES DOWN SWINGING', 'CALLED STRIKE THREE', 'WHIFF'],
    OUT: ['GROUNDS OUT', 'FLIES OUT', 'LINES OUT', 'POPS OUT', 'PUT OUT']
  };
  function phrase(kind, rng) { var pool = PHRASES[kind] || ['OUT']; return pool[Math.floor(rng() * pool.length)]; }

  // ======================================================================
  //  CORE SIM  (pure logic — runs headless or live)
  // ======================================================================
  // Simulate one plate appearance. Returns an event object describing it,
  // and mutates the provided `bases` array (length 3: [1b,2b,3b], each null or runnerName).
  function simPA(bat, pit, bases, rng) {
    var dist = matchupDist(bat, pit);
    var outcome = pick(dist, rng);
    var ev = { batter: bat.name, outcome: outcome, runs: 0, hit: false, location: null, scored: [] };

    function advance(numBases, batterName) {
      // Move existing runners then place batter (HR clears).
      var scored = [];
      // bases index 0=1b,1=2b,2=3b
      var newBases = [null, null, null];
      // existing runners advance
      for (var i = 2; i >= 0; i--) {
        if (bases[i]) {
          var dest = i + numBases; // 0-based + bases
          if (dest >= 3) { scored.push(bases[i]); }
          else { newBases[dest] = bases[i]; }
        }
      }
      // batter
      if (numBases >= 4) { scored.push(batterName); }
      else {
        var bdest = numBases - 1;
        if (bdest >= 3) scored.push(batterName);
        else newBases[bdest] = batterName;
      }
      bases[0] = newBases[0]; bases[1] = newBases[1]; bases[2] = newBases[2];
      return scored;
    }

    if (outcome === 'K') {
      ev.outs = 1;
    } else if (outcome === 'OUT') {
      ev.outs = 1;
      ev.inPlay = true;
      ev.location = locationFor(bat.tendency, rng);
    } else if (outcome === 'BB') {
      // walk: force only when bases loaded ahead
      if (bases[0]) {
        if (bases[1]) {
          if (bases[2]) { ev.scored = [bases[2]]; }
          bases[2] = bases[1]; bases[1] = bases[0];
        } else { bases[1] = bases[0]; }
      }
      bases[0] = bat.name;
    } else {
      // hit in play
      ev.hit = true;
      ev.inPlay = true;
      ev.location = locationFor(bat.tendency, rng);
      var n = (outcome === '_1B') ? 1 : (outcome === '_2B') ? 2 : (outcome === '_3B') ? 3 : 4;
      ev.scored = advance(n, bat.name);
    }
    ev.runs = ev.scored.length;
    return ev;
  }

  // Simulate a full half-inning. Returns {runs, hits, errors, events}.
  function simHalf(battingTeam, pitcher, startIdx, rng, errorRate) {
    var outs = 0, runs = 0, hits = 0, errors = 0;
    var bases = [null, null, null];
    var idx = startIdx;
    var events = [];
    while (outs < 3) {
      var bat = battingTeam.lineup[idx % 9];
      var ev = simPA(bat, pitcher, bases, rng);
      // chance of an error on a ball in play (cosmetic; counts as error, batter safe-ish)
      if (ev.inPlay && !ev.hit && rng() < errorRate) {
        errors++; ev.error = true;
      }
      if (ev.hit) hits++;
      runs += ev.runs;
      if (ev.outs) outs += ev.outs;
      ev.basesAfter = bases.slice();
      ev.outsAfter = outs;
      events.push(ev);
      idx++;
      if (outs >= 3) break;
    }
    return { runs: runs, hits: hits, errors: errors, events: events, nextIdx: idx % 9 };
  }

  // Full 9-inning game (headless). Returns line score + per-PA log.
  function simGame(seed) {
    var rng = makeRng(seed || 12345);
    var line = {
      mudcats: { innings: [], r: 0, h: 0, e: 0 },
      acorns:  { innings: [], r: 0, h: 0, e: 0 }
    };
    var idxM = 0, idxA = 0;
    var allEvents = [];
    for (var inning = 1; inning <= 9; inning++) {
      // Top: Mudcats (visitor) bat vs Acorns pitcher
      var top = simHalf(MUDCATS, ACORNS.pitcher, idxM, rng, 0.02);
      idxM = top.nextIdx;
      line.mudcats.innings[inning - 1] = top.runs;
      line.mudcats.r += top.runs; line.mudcats.h += top.hits; line.mudcats.e += top.errors;
      allEvents.push({ inning: inning, half: 'top', team: 'MUDCATS', res: top });

      // Bottom: Acorns (home) bat vs Mudcats pitcher (skip if home leads after top 9)
      if (inning === 9 && line.acorns.r > line.mudcats.r) {
        line.acorns.innings[inning - 1] = 'X';
        break;
      }
      var bot = simHalf(ACORNS, MUDCATS.pitcher, idxA, rng, 0.02);
      idxA = bot.nextIdx;
      line.acorns.innings[inning - 1] = bot.runs;
      line.acorns.r += bot.runs; line.acorns.h += bot.hits; line.acorns.e += bot.errors;
      allEvents.push({ inning: inning, half: 'bot', team: 'ACORNS', res: bot });
    }
    return { line: line, events: allEvents };
  }

  // expose pure logic for headless verification
  window.__sim = {
    simGame: simGame, simHalf: simHalf, simPA: simPA,
    matchupDist: matchupDist, MUDCATS: MUDCATS, ACORNS: ACORNS, log5: log5
  };

  // ======================================================================
  //  DISPLAY LAYER  (drives the screen — only runs in the browser)
  // ======================================================================
  if (typeof document === 'undefined') return;

  // ---- DOM helpers ------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function setText(id, v) { var e = $(id); if (e) e.textContent = String(v); }

  // Collect the leaf text nodes of a panel's text column: [name, stat1, stat2, stat3]
  function panelLeaves(panelId) {
    var p = $(panelId); if (!p) return null;
    var row = Array.from(p.children).find(function (c) { return c.querySelector && (c.querySelector('img') || c.children.length >= 2); });
    if (!row) return null;
    var cols = Array.from(row.children);
    var textCol = cols.find(function (c) { return !c.querySelector('img'); });
    if (!textCol) return null;
    var leaves = [];
    (function rec(n) {
      if (n.children.length === 0) { if (n.textContent.trim()) leaves.push(n); }
      else Array.from(n.children).forEach(rec);
    })(textCol);
    return leaves;
  }
  // Set a player panel: name + three numeric stats (avg/era, hr/w, rbi/l)
  function setPanel(panelId, name, s1, s2, s3) {
    var L = panelLeaves(panelId);
    if (!L || L.length < 4) return;
    L[0].textContent = name;
    L[1].textContent = s1;
    L[2].textContent = s2;
    L[3].textContent = s3;
  }

  // ---- Runner sprite show/hide -----------------------------------------
  // Only sprite-runner-1b exists in the markup; clone it for 2b/3b once.
  function ensureRunnerSprites() {
    var r1 = $('sprite-runner-1b');
    if (!r1) return;
    function ensure(id, baseId) {
      if ($(id)) return;
      var base = $(baseId);
      var clone = r1.cloneNode(true);
      clone.id = id;
      // position over the target base using the base element's coordinates
      if (base) {
        var bs = base.getAttribute('style') || '';
        // copy left/top from base, offset upward like the existing runner
        clone.style.cssText = r1.getAttribute('style');
        var bl = parseFloat((bs.match(/left:\s*([\d.]+)px/) || [])[1]);
        var bt = parseFloat((bs.match(/top:\s*([\d.]+)px/) || [])[1]);
        if (!isNaN(bl)) clone.style.left = (bl - 45) + 'px';
        if (!isNaN(bt)) clone.style.top = (bt - 72) + 'px';
      }
      r1.parentElement.appendChild(clone);
    }
    ensure('sprite-runner-2b', 'base-2b');
    ensure('sprite-runner-3b', 'base-3b');
  }
  function showRunners(bases) {
    ensureRunnerSprites();
    [['sprite-runner-1b', 0], ['sprite-runner-2b', 1], ['sprite-runner-3b', 2]].forEach(function (pair) {
      var el = $(pair[0]);
      if (el) el.style.display = bases[pair[1]] ? 'block' : 'none';
    });
  }

  // ---- Count / inning ---------------------------------------------------
  function setCount(b, s, o) { setText('count-b', b); setText('count-s', s); setText('count-o', o); }
  function setInning(inning, half) {
    // count-inning holds just the inning number; the sibling span holds TOP/BOT.
    var ci = $('count-inning');
    if (ci) {
      ci.textContent = inning;
      var label = ci.previousElementSibling;
      if (label) label.textContent = (half === 'top' ? 'TOP' : 'BOT');
    }
  }

  // ---- Linescore --------------------------------------------------------
  function setLinescoreCell(team, key, val) { setText('cell-' + team + '-' + key, val); }
  function clearLinescore() {
    for (var i = 1; i <= 9; i++) { setLinescoreCell('mudcats', i, '0'); setLinescoreCell('acorns', i, '0'); }
    ['r', 'h', 'e'].forEach(function (k) { setLinescoreCell('mudcats', k, '0'); setLinescoreCell('acorns', k, '0'); });
  }

  // ---- Result line + flavor --------------------------------------------
  function fieldWord(loc) {
    return { 'LEFT': 'LEFT', 'LEFT-CENTER': 'LEFT-CENTER', 'CENTER': 'CENTER',
             'RIGHT-CENTER': 'RIGHT-CENTER', 'RIGHT': 'RIGHT' }[loc] || 'CENTER';
  }
  function resultText(ev, rng) {
    var k = ev.outcome;
    var who = ev.batter;
    if (k === 'BB') return phrase('BB', rng) + ' — ' + who;
    if (k === 'K')  return who + ' ' + phrase('K', rng);
    if (k === 'OUT') {
      var verb = phrase('OUT', rng);
      var loc = fieldWord(ev.location);
      return who + ' ' + verb + ' TO ' + loc + (ev.error ? ' (E!)' : '');
    }
    // hits
    var label = phrase(k, rng);
    var locTxt = ev.location ? (' TO ' + fieldWord(ev.location)) : '';
    var rbiTxt = ev.runs > 0 ? ('  +' + ev.runs + (ev.runs === 1 ? ' RUN' : ' RUNS')) : '';
    return label + ' — ' + who + locTxt + rbiTxt;
  }

  // ---- Build an expanded, screen-ready event stream ---------------------
  // We re-run a seeded game but capture per-PA snapshots for stepping.
  function buildPlayStream(seed) {
    var rng = makeRng(seed || (Date.now() & 0x7fffffff));
    var teams = { top: MUDCATS, bot: ACORNS };
    var pitchers = { top: ACORNS.pitcher, bot: MUDCATS.pitcher };
    var idx = { top: 0, bot: 0 };
    var line = {
      mudcats: { innings: [], r: 0, h: 0, e: 0 },
      acorns:  { innings: [], r: 0, h: 0, e: 0 }
    };
    var stream = [];
    for (var inning = 1; inning <= 9; inning++) {
      ['top', 'bot'].forEach(function (half) {
        if (half === 'bot' && inning === 9 && line.acorns.r > line.mudcats.r) return; // walk-off skip
        var team = teams[half], pit = pitchers[half], code = team.code;
        var bases = [null, null, null];
        var outs = 0, runsThisInning = 0, hitsThisInning = 0, errThisInning = 0;
        while (outs < 3) {
          var bi = idx[half] % 9;
          var bat = team.lineup[bi];
          var ev = simPA(bat, pit, bases, rng);
          if (ev.inPlay && !ev.hit && rng() < 0.02) { ev.error = true; errThisInning++; }
          if (ev.hit) hitsThisInning++;
          if (ev.outs) outs += ev.outs;
          runsThisInning += ev.runs;
          // accumulate line totals
          line[code].r += ev.runs; line[code].h += (ev.hit ? 1 : 0);
          var snap = {
            inning: inning, half: half, teamCode: code, teamName: team.name,
            batterIdx: bi, batter: bat,
            onDeck: team.lineup[(bi + 1) % 9], inHole: team.lineup[(bi + 2) % 9],
            pitcher: pit,
            outcome: ev.outcome, location: ev.location, error: !!ev.error,
            runsOnPlay: ev.runs, basesAfter: bases.slice(), outsAfter: outs,
            text: resultText(ev, rng),
            pitches: buildPitchSequence(ev.outcome, rng),
            lineSnapshot: null // filled below
          };
          stream.push(snap);
          idx[half]++;
          if (outs >= 3) break;
        }
        line[code].e += errThisInning;
        line[code].innings[inning - 1] = runsThisInning;
        // attach a line snapshot to the LAST event of this half-inning
        for (var s = stream.length - 1; s >= 0; s--) {
          if (stream[s].inning === inning && stream[s].half === half) { stream[s].endOfHalf = true; break; }
        }
      });
      if (line.mudcats.innings[inning - 1] === undefined) line.mudcats.innings[inning - 1] = 0;
    }
    return { stream: stream, finalLine: line };
  }

  // ---- Pitch sequencing -------------------------------------------------
  // The PA outcome is ALREADY decided by log5 (simPA). Here we only fabricate a
  // believable count path that ARRIVES at that outcome. This does NOT touch the
  // outcome distribution -- it consumes its own rng draws purely for cosmetics.
  var PITCH_TYPES = [
    { code: 'FB', name: 'FASTBALL', lo: 88, hi: 96 },
    { code: 'SI', name: 'SINKER',   lo: 86, hi: 93 },
    { code: 'SL', name: 'SLIDER',   lo: 82, hi: 88 },
    { code: 'CB', name: 'CURVE',    lo: 72, hi: 80 },
    { code: 'CH', name: 'CHANGEUP', lo: 78, hi: 85 }
  ];
  function randPitch(rng) {
    var pt = PITCH_TYPES[(rng() * PITCH_TYPES.length) | 0];
    var sp = pt.lo + Math.round(rng() * (pt.hi - pt.lo));
    return { type: pt.name, code: pt.code, speed: sp };
  }
  // Returns an array of pitch descriptors. Each: {speed,type,code,call,balls,strikes,terminal,desc}
  // call is one of: 'BALL','STRIKE','FOUL','INPLAY'. balls/strikes are the count AFTER the pitch.
  function buildPitchSequence(outcome, rng) {
    var seq = [];
    var b = 0, s = 0;
    function emit(call) {
      var pp = randPitch(rng);
      if (call === 'BALL') b++;
      else if (call === 'STRIKE') s++;
      else if (call === 'FOUL') { if (s < 2) s++; } // fouls don't advance past 2 strikes
      seq.push({ speed: pp.speed, type: pp.type, code: pp.code, call: call,
                 balls: b, strikes: s, terminal: false });
    }
    if (outcome === 'BB') {
      // 4 balls, interspersed with up to 2 strikes / occasional fouls, final ball ends it.
      var strikesToAdd = (rng() < 0.55) ? ((rng() * 3) | 0) : 0; // 0..2 strikes mixed in
      var plan = [];
      for (var i = 0; i < 4; i++) plan.push('BALL');
      for (var k = 0; k < strikesToAdd; k++) plan.push(rng() < 0.5 ? 'STRIKE' : 'FOUL');
      // shuffle but keep a BALL last
      var last = 'BALL'; plan.splice(plan.lastIndexOf('BALL'), 1);
      for (var j = plan.length - 1; j > 0; j--) { var r = (rng() * (j + 1)) | 0; var tmp = plan[j]; plan[j] = plan[r]; plan[r] = tmp; }
      plan.push(last);
      // guard: never let strikes reach 3 before the walk; if it would, convert that strike to a foul (caps at 2)
      plan.forEach(function (c) { emit(c); });
    } else if (outcome === 'K') {
      // reach 3 strikes; allow balls (<=3) and fouls (cap at strike 2) along the way.
      var ballsToAdd = (rng() * 4) | 0;     // 0..3 balls mixed in
      var foulsToAdd = (rng() < 0.5) ? ((rng() * 3) | 0) : 0; // 0..2 foul-offs at 2 strikes
      var plan2 = ['STRIKE', 'STRIKE'];     // first two strikes
      for (var bi = 0; bi < ballsToAdd; bi++) plan2.push('BALL');
      // shuffle the first part
      for (var j2 = plan2.length - 1; j2 > 0; j2--) { var r2 = (rng() * (j2 + 1)) | 0; var t2 = plan2[j2]; plan2[j2] = plan2[r2]; plan2[r2] = t2; }
      plan2.forEach(function (c) { emit(c); });
      for (var f = 0; f < foulsToAdd; f++) emit('FOUL'); // battle at 2 strikes
      emit('STRIKE'); // strike three
    } else {
      // Ball in play (1B/2B/3B/HR/OUT): plausible count buildup, ends on a swing (INPLAY).
      var depth = rng();
      var preBalls = 0, preStrikes = 0;
      if (depth < 0.30) { preBalls = 0; preStrikes = 0; }       // first-pitch swing
      else if (depth < 0.65) { preBalls = (rng() * 2) | 0; preStrikes = (rng() * 2) | 0; }
      else { preBalls = (rng() * 3) | 0; preStrikes = (rng() < 0.5) ? 2 : ((rng() * 2) | 0); } // deeper
      var pre = [];
      for (var pb = 0; pb < preBalls; pb++) pre.push('BALL');
      for (var ps = 0; ps < preStrikes; ps++) pre.push(rng() < 0.5 ? 'STRIKE' : 'FOUL');
      for (var j3 = pre.length - 1; j3 > 0; j3--) { var r3 = (rng() * (j3 + 1)) | 0; var t3 = pre[j3]; pre[j3] = pre[r3]; pre[r3] = t3; }
      pre.forEach(function (c) { emit(c); });
      // terminal pitch: a swing put in play
      var pp = randPitch(rng);
      seq.push({ speed: pp.speed, type: pp.type, code: pp.code, call: 'INPLAY',
                 balls: b, strikes: s, terminal: true });
    }
    // mark the last pitch terminal (for BB/K)
    if (seq.length) seq[seq.length - 1].terminal = true;
    return seq;
  }

  // ---- Engine state machine (drives the screen) -------------------------
  // ---- Pace tiers (all ADJUSTABLE) -------------------------------------
  // pitch : play each pitch; perPitch delay between pitches, postPA after a PA resolves
  // batter: resolve whole PA at once (the medium tier), perPA delay
  // rapid : whole PA at once, minimal delay
  var PACE = {
    pitch:  { perPitch: 1000, postPA: 650 }, // ~1.0s per pitch, brief beat after the PA
    batter: { perPA: 1800 },                 // ~1.8s per at-bat
    rapid:  { perPA: 400 }                   // ~0.4s per at-bat
  };
  var GAME = {
    stream: [], pos: -1, playing: false, timer: null,
    line: { mudcats: { innings: [], r: 0, h: 0, e: 0 }, acorns: { innings: [], r: 0, h: 0, e: 0 } },
    mode: 'batter',      // 'pitch' | 'batter' | 'rapid'  (default = medium tier)
    pitchIdx: -1         // index into current PA's pitch sequence (pitch mode only)
  };

  function applyEvent(ev, skipCount) {
    // Inning indicator
    setInning(ev.inning, ev.half);
    // Outs from the event; B/S already resolved (we show a representative final count)
    // Show a small "final count" flavor: walks -> 4 balls, K -> strike 3.
    var b = 0, s = 0;
    if (ev.outcome === 'BB') { b = 4; s = (Math.random() * 3) | 0; }
    else if (ev.outcome === 'K') { s = 3; b = (Math.random() * 3) | 0; }
    else { b = (Math.random() * 3) | 0; s = (Math.random() * 2) | 0; }
    if (!skipCount) setCount(b, s, ev.outsAfter % 3);
    else setText('count-o', ev.outsAfter % 3);

    // Panels: AT BAT / ON DECK / IN THE HOLE
    setPanel('atbat-box', ev.batter.name, ev.batter.avg, ev.batter.hr, ev.batter.rbi);
    setPanel('panel-ondeck', ev.onDeck.name, ev.onDeck.avg, ev.onDeck.hr, ev.onDeck.rbi);
    setPanel('panel-inhole', ev.inHole.name, ev.inHole.avg, ev.inHole.hr, ev.inHole.rbi);
    // Pitching box
    setPanel('pitching-box', ev.pitcher.name, ev.pitcher.era, ev.pitcher.w, ev.pitcher.l);

    // Runners on base
    showRunners(ev.basesAfter);

    // Pitch info (cosmetic): last pitch speed/type
    var speeds = [88, 91, 93, 78, 84, 95, 72];
    var types = ['FASTBALL', 'CURVE', 'SLIDER', 'CHANGEUP', 'SINKER'];
    if (!skipCount) {
      setText('last-pitch-speed', speeds[(Math.random() * speeds.length) | 0]);
      setText('last-pitch-type', types[(Math.random() * types.length) | 0]);
    }

    // Result line
    setText('result-line', ev.text);

    // Linescore: recompute running totals up to this event
    updateLinescore(ev);
  }

  function updateLinescore(ev) {
    // Track per-inning runs as we advance.
    var L = GAME.line;
    var code = ev.teamCode;
    // ensure inning bucket
    if (L[code].innings[ev.inning - 1] === undefined) L[code].innings[ev.inning - 1] = 0;
    L[code].innings[ev.inning - 1] += ev.runsOnPlay;
    L[code].r += ev.runsOnPlay;
    if (ev.outcome === '_1B' || ev.outcome === '_2B' || ev.outcome === '_3B' || ev.outcome === 'HR') L[code].h += 1;
    if (ev.error) {
      // error charged to fielding team (the other team)
      var other = code === 'mudcats' ? 'acorns' : 'mudcats';
      L[other].e += 1;
    }
    // paint cells
    setLinescoreCell(code, ev.inning, L[code].innings[ev.inning - 1]);
    setLinescoreCell(code, 'r', L[code].r);
    setLinescoreCell(code, 'h', L[code].h);
    setLinescoreCell('mudcats', 'e', L.mudcats.e);
    setLinescoreCell('acorns', 'e', L.acorns.e);
  }

  // ---- Pitch-mode helpers ----------------------------------------------
  // Render one pitch of the current PA: update B/S count + pitch-info box.
  function applyPitch(ev, pitch) {
    setInning(ev.inning, ev.half);
    setText('count-b', pitch.balls);
    setText('count-s', pitch.strikes);
    setText('count-o', (ev.outsAfter - (ev.terminalOuts || 0)) % 3 < 0 ? 0 : ((ev.outsBefore != null ? ev.outsBefore : 0) % 3));
    // keep the at-bat panels current while pitches tick
    setPanel('atbat-box', ev.batter.name, ev.batter.avg, ev.batter.hr, ev.batter.rbi);
    setPanel('panel-ondeck', ev.onDeck.name, ev.onDeck.avg, ev.onDeck.hr, ev.onDeck.rbi);
    setPanel('panel-inhole', ev.inHole.name, ev.inHole.avg, ev.inHole.hr, ev.inHole.rbi);
    setPanel('pitching-box', ev.pitcher.name, ev.pitcher.era, ev.pitcher.w, ev.pitcher.l);
    setText('last-pitch-speed', pitch.speed);
    setText('last-pitch-type', pitch.type);
    // small live call in the result line as the count builds
    var callWord = pitch.call === 'BALL' ? 'BALL' : pitch.call === 'FOUL' ? 'FOUL' :
                   pitch.call === 'STRIKE' ? 'STRIKE' : 'SWING';
    if (!pitch.terminal) {
      setText('result-line', ev.batter.name + ' \u2014 ' + pitch.type + ' ' + pitch.speed +
        ' MPH \u2014 ' + callWord + '  (' + pitch.balls + '-' + pitch.strikes + ')');
    }
  }

  // STEP semantics:
  //   pitch mode  -> advance ONE pitch (resolving the PA on its terminal pitch)
  //   batter/rapid-> advance ONE plate appearance
  function step() {
    if (GAME.mode === 'pitch') return stepPitch();
    return stepPA();
  }

  function stepPA() {
    if (GAME.pos + 1 >= GAME.stream.length) { stopAuto(); flashDone(); return false; }
    GAME.pos++;
    GAME.pitchIdx = -1;
    applyEvent(GAME.stream[GAME.pos]);
    return true;
  }

  // Advance a single pitch within the current PA; when the terminal pitch lands,
  // resolve the PA via applyEvent (skipping its own count/pitch-info writes).
  function stepPitch() {
    // need a current PA? (also self-heal if pos/stream slot is missing, e.g. right after NEW GAME)
    if (GAME.pitchIdx < 0 || GAME.pos < 0 || !GAME.stream[GAME.pos]) {
      if (GAME.pos + 1 >= GAME.stream.length) { stopAuto(); flashDone(); return false; }
      GAME.pos++;
      GAME.pitchIdx = 0;
      GAME._outsBefore = currentOutsBefore(GAME.pos);
    }
    var ev = GAME.stream[GAME.pos];
    if (!ev) { stopAuto(); flashDone(); return false; }   // guard: no at-bat to advance
    var seq = ev.pitches || [];
    var pitch = seq[GAME.pitchIdx];
    if (!pitch) {
      // no pitches (shouldn't happen) -> resolve as PA
      applyEvent(ev);
      GAME.pitchIdx = -1;
      return true;
    }
    ev.outsBefore = GAME._outsBefore;
    if (pitch.terminal) {
      // resolve the whole PA (result line, outs, runners, linescore) but keep our count display
      setText('count-b', pitch.balls);
      setText('count-s', pitch.strikes);
      setText('last-pitch-speed', pitch.speed);
      setText('last-pitch-type', pitch.type);
      applyEvent(ev, true);          // skipCount=true -> preserves built count
      GAME.pitchIdx = -1;            // PA done; next call starts a new PA
    } else {
      applyPitch(ev, pitch);
      GAME.pitchIdx++;
    }
    return true;
  }

  // outs already recorded BEFORE the given stream index, within its half-inning.
  function currentOutsBefore(pos) {
    var ev = GAME.stream[pos];
    var prev = GAME.stream[pos - 1];
    if (!prev || prev.inning !== ev.inning || prev.half !== ev.half) return 0;
    return prev.outsAfter % 3;
  }

  // delay (ms) until the next scheduled tick, given what just happened.
  function nextDelay(justResolvedPA) {
    if (GAME.mode === 'pitch') return justResolvedPA ? PACE.pitch.postPA : PACE.pitch.perPitch;
    if (GAME.mode === 'rapid') return PACE.rapid.perPA;
    return PACE.batter.perPA;
  }

  function startAuto() {
    if (GAME.playing) return;
    GAME.playing = true;
    setBtnLabel();
    var tick = function () {
      if (GAME.pos + 1 >= GAME.stream.length && GAME.pitchIdx < 0) { stopAuto(); flashDone(); return; }
      var resolvedPA;
      if (GAME.mode === 'pitch') {
        var wasTerminalComing = GAME.pitchIdx >= 0 &&
          GAME.stream[GAME.pos] && GAME.stream[GAME.pos].pitches &&
          GAME.stream[GAME.pos].pitches[GAME.pitchIdx] &&
          GAME.stream[GAME.pos].pitches[GAME.pitchIdx].terminal;
        stepPitch();
        resolvedPA = (GAME.pitchIdx < 0); // PA just finished
      } else {
        stepPA();
        resolvedPA = true;
      }
      if (GAME.playing) {
        clearTimeout(GAME.timer);
        GAME.timer = setTimeout(tick, nextDelay(resolvedPA));
      }
    };
    GAME.timer = setTimeout(tick, 60);
  }
  function stopAuto() {
    GAME.playing = false;
    if (GAME.timer) { clearTimeout(GAME.timer); clearInterval(GAME.timer); GAME.timer = null; }
    setBtnLabel();
  }
  function toggleAuto() { GAME.playing ? stopAuto() : startAuto(); }

  function resetGame(seed) {
    stopAuto();
    var built = buildPlayStream(seed);
    GAME.stream = built.stream;
    GAME.pos = -1;
    GAME.pitchIdx = -1;        // reset partial PA so first STEP/PLAY builds the first batter's pitch sequence
    GAME._outsBefore = 0;
    GAME.line = { mudcats: { innings: [], r: 0, h: 0, e: 0 }, acorns: { innings: [], r: 0, h: 0, e: 0 } };
    clearLinescore();
    showRunners([null, null, null]);
    setText('result-line', 'PLAY BALL!');
  }

  function flashDone() {
    var L = GAME.line;
    var msg = 'FINAL — MUDCATS ' + L.mudcats.r + ', ACORNS ' + L.acorns.r;
    setText('result-line', msg);
  }

  // ---- Control panel (fixed, outside the scaled stage) ------------------
  var playBtn;
  function setBtnLabel() { if (playBtn) playBtn.textContent = GAME.playing ? '⏸ PAUSE' : '▶ PLAY'; }
  function makeBtn(label) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font-family:monospace;font-size:13px;font-weight:bold;color:#fff;' +
      'background:#1c7a34;border:2px solid #0d3f1b;border-radius:6px;padding:7px 12px;' +
      'cursor:pointer;letter-spacing:1px;';
    return b;
  }
  function buildControls() {
    if ($('sim-controls')) return;
    var bar = document.createElement('div');
    bar.id = 'sim-controls';
    bar.style.cssText = 'position:fixed;bottom:12px;left:12px;' +
      'z-index:100000;display:flex;gap:10px;align-items:center;background:rgba(10,10,20,0.88);' +
      'padding:8px 12px;border-radius:10px;border:2px solid #f6c81e;box-shadow:0 4px 14px rgba(0,0,0,0.5);';
    playBtn = makeBtn('▶ PLAY');
    playBtn.onclick = toggleAuto;
    var stepBtn = makeBtn('STEP ▶');
    stepBtn.style.background = '#2453a6'; stepBtn.style.borderColor = '#11295c';
    stepBtn.onclick = function () { stopAuto(); step(); };
    var resetBtn = makeBtn('↺ NEW GAME');
    resetBtn.style.background = '#7a1c1c'; resetBtn.style.borderColor = '#3f0d0d';
    resetBtn.onclick = function () { resetGame(); };
    // ---- Pace tier selector (3 tiers) ----
    var paceLbl = document.createElement('span');
    paceLbl.textContent = 'PACE';
    paceLbl.style.cssText = 'color:#f6c81e;font-family:monospace;font-size:11px;font-weight:bold;';
    var pace = document.createElement('select');
    pace.style.cssText = 'font-family:monospace;font-size:12px;padding:4px;border-radius:4px;';
    [['PITCH-BY-PITCH', 'pitch'], ['BATTER-BY-BATTER', 'batter'], ['RAPID', 'rapid']].forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o[1]; opt.textContent = o[0];
      if (o[1] === GAME.mode) opt.selected = true;
      pace.appendChild(opt);
    });
    pace.onchange = function () {
      var wasPlaying = GAME.playing;
      stopAuto();
      GAME.mode = pace.value;
      GAME.pitchIdx = -1;           // reset any partial PA so the new mode starts clean
      if (wasPlaying) startAuto();
    };
    bar.appendChild(playBtn); bar.appendChild(stepBtn); bar.appendChild(resetBtn);
    bar.appendChild(paceLbl); bar.appendChild(pace);
    document.body.appendChild(bar);
  }

  // ---- Attach after the screen's framework has built the DOM -----------
  function attach() {
    if (!$('result-line') || !$('atbat-box') || !$('count-o')) {
      return setTimeout(attach, 120); // wait for framework to finish
    }
    buildControls();
    resetGame(Math.floor(Math.random() * 1e9));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(attach, 200); });
  } else {
    setTimeout(attach, 200);
  }

  // expose for headless / debugging
  window.__simEngine = { GAME: GAME, step: step, startAuto: startAuto, stopAuto: stopAuto, resetGame: resetGame, buildPlayStream: buildPlayStream };

})();

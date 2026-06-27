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
  // A ground ball is fielded by an INFIELDER. Map the batted-ball ZONE (which already
  // reflects pull/spray/oppo tendency) to the infielder who'd field it on the ground.
  // pull -> left side (3B/SS); spray -> up the middle (SS/2B); oppo -> right side (2B/1B).
  var ZONE_TO_INFIELDER = {
    'LEFT': '3B', 'LEFT-CENTER': 'SS', 'CENTER': '2B', 'RIGHT-CENTER': '2B', 'RIGHT': '1B'
  };
  // Full position words for spoken-style commentary.
  var POS_WORD = {
    'P': 'PITCHER', 'C': 'CATCHER', '1B': 'FIRST', '2B': 'SECOND', '3B': 'THIRD', 'SS': 'SHORTSTOP'
  };
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

  // ----- Depot lineup-builder hand-off: route the solo (visitor) team through the
  // SAME robust applyDepotTeam loader the ?match path uses (tolerates null rates). -----
  (function(){
    try {
      if(typeof window!=="undefined" && window.__DEPOT_MATCH_MODE) return; // match mode: skip the solo hand-off; applied lineups are the source of truth
      var raw = (typeof window!=="undefined" && window.__DEPOT_USER_TEAM) || null;
      if(!raw && typeof sessionStorage!=="undefined"){ var j=sessionStorage.getItem("depot_user_team"); if(j) raw=JSON.parse(j); }
      if(!raw || !raw.lineup || raw.lineup.length!==9) return; // no user team built -> demo team is correct
      var ok = applyDepotTeam(MUDCATS, raw); // identical loader to the match path; null/un-modelable rates are tolerated
      if(ok){
        if(typeof window!=="undefined") window.__DEPOT_TEAM_LOADED = MUDCATS.name;
      } else if(typeof console!=="undefined"){
        // NOT the null-rates case (applyDepotTeam handles that). Only a structurally invalid payload lands here.
        console.warn("[DepotLineup] solo hand-off: payload rejected by applyDepotTeam (invalid structure), using demo team");
      }
    } catch(e){ if(typeof console!=="undefined") console.warn("[DepotLineup] solo hand-off failed (unexpected error), using demo team:", e); }
  })();

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
    var ev = { batter: bat.name, outcome: outcome, runs: 0, hit: false, location: null, outType: null, scored: [] };

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
      // Ball IN PLAY: classify as ground-ball or air out (fly/line/pop).
      // ~48% ground outs; ground outs draw a SHORT line into the infield,
      // air outs a longer line to the outfield (see showFlightLine).
      ev.outType = (rng() < 0.48) ? 'GB' : 'AIR';
      // Ground out: pick the infielder by hit zone; he throws the batter out at first.
      ev.infielder = (ev.outType === 'GB') ? (ZONE_TO_INFIELDER[ev.location] || 'SS') : null;
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
      ev.endHalf = (outs >= 3);
      ev.basesAfter = ev.endHalf ? [null, null, null] : bases.slice();
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

  // ====================================================================
  //  RETRO ANNOUNCER VOICE  (Option A: browser TTS, pitched + crunchy)
  //  Text stays on screen; this is purely additive. Default OFF; the
  //  player's choice persists in localStorage. Speech uses the Web Speech
  //  API (speechSynthesis) pitched down + sped up for a robotic read, with
  //  a short 8-bit square-wave "blip" burst layered in for NES crunch
  //  (browsers don't expose the TTS stream to Web Audio, so the retro
  //  texture is added via synthesized blips alongside the spoken line).
  // ====================================================================
  var __voiceOn = false;
  // FIX 3: becomes true once the user DELIBERATELY toggles the sound button,
  // so fast/rapid pace will not auto-mute a user who explicitly turned sound ON.
  var __voiceUserChose = false;
  try { __voiceOn = (localStorage.getItem("depot_voice") === "1"); } catch (e) {}
  var __ac = null;
  // commentary speech-gate state (Change 1: pacing waits for speech)
  var __speechActive = false;
  function __audioCtx() {
    if (!__ac) { try { __ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { __ac = null; } }
    return __ac;
  }
  function __pickVoice() {
    try {
      var vs = window.speechSynthesis.getVoices() || [];
      var pref = vs.filter(function (v) { return /en[-_]/i.test(v.lang); });
      return (pref[0] || vs[0] || null);
    } catch (e) { return null; }
  }
  function __blip(nSyl) {
    var ac = __audioCtx(); if (!ac) return;
    try { if (ac.state === "suspended") ac.resume(); } catch (e) {}
    var t0 = ac.currentTime, step = 0.045, n = Math.max(2, Math.min(8, nSyl || 4));
    for (var i = 0; i < n; i++) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(180 + ((i * 53) % 240), t0 + i * step);
      g.gain.setValueAtTime(0.0001, t0 + i * step);
      g.gain.exponentialRampToValueAtTime(0.05, t0 + i * step + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * step + step * 0.9);
      o.connect(g); g.connect(ac.destination);
      o.start(t0 + i * step); o.stop(t0 + i * step + step);
    }
  }
  function __voiceSpeak(text) {
    if (!__voiceOn || !text) return;
    if (!("speechSynthesis" in window)) return;
    try {
      var say = String(text).replace(/--/g, ",").replace(/\s+/g, " ").trim();
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(say);
      // Change 2: lighter register (was pitch 0.4 ~ heavy smoker). Tunable.
      var VOICE_PITCH = 0.4; // low register (smoky), per Nick  // ~an octave up from old 0.4
      var VOICE_RATE  = 1.3;  // reads clearly (1.2-1.35 band)
      u.pitch = VOICE_PITCH;
      u.rate = VOICE_RATE;
      u.volume = 1.0;
      var v = __pickVoice(); if (v) u.voice = v;
      __blip((say.split(/\s+/).length) + 2);
      __speechActive = true;
      u.onend = u.onerror = function () { __speechActive = false; };
      try { window.speechSynthesis.cancel(); } catch (e2) {}
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  function __setVoice(on) {
    __voiceOn = !!on;
    try { localStorage.setItem("depot_voice", __voiceOn ? "1" : "0"); } catch (e) {}
    var b = document.getElementById("voice-toggle");
    if (b) {
      b.textContent = __voiceOn ? "\uD83D\uDD0A SOUND: ON" : "\uD83D\uDD07 SOUND: OFF";
      b.style.background = __voiceOn ? "#2b6b2b" : "#000";
    }
    if (!__voiceOn) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }
  function __ensureVoiceToggle() {
    if (document.getElementById("voice-toggle")) return;
    var box = document.getElementById("result-line");
    var host = (box && box.parentNode) ? box.parentNode : document.body;
    var b = document.createElement("button");
    b.id = "voice-toggle";
    b.type = "button";
    b.textContent = __voiceOn ? "\uD83D\uDD0A SOUND: ON" : "\uD83D\uDD07 SOUND: OFF";
    b.style.cssText = "position:absolute;left:auto;right:520px;top:1230px;" +
      "font-family:'Press Start 2P',monospace;font-size:12px;color:#f6c81e;" +
      "background:" + (__voiceOn ? "#2b6b2b" : "#000") + ";border:3px solid #f6c81e;" +
      "padding:6px 12px;cursor:pointer;z-index:40;white-space:nowrap;";
    b.addEventListener("click", function () {
      try { var ac = __audioCtx(); if (ac && ac.state === "suspended") ac.resume(); } catch (e) {}
      __voiceUserChose = true; // FIX 3: user made a deliberate sound choice
      __setVoice(!__voiceOn);
      if (__voiceOn) __voiceSpeak("Sound on. Try to keep up.");
    });
    host.appendChild(b);
  }
  try { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = function () {}; } catch (e) {}


  // ---- DOM helpers ------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function setText(id, v) { var e = $(id); if (e) e.textContent = String(v); }

// ---- Pitch-stat tracking (PC / K / BB) + pitch speed unit ------------
var PITCH = { pc: 0, k: 0, bb: 0, byPitcher: {}, active: null, pcSpan: null, kSpan: null, bbSpan: null, speedSpan: null, resolved: false };
function resolvePitchSpans() {
  if (PITCH.resolved) return;
  var speedLine = $('last-pitch-speed');
  if (speedLine) PITCH.speedSpan = speedLine.querySelector('span');
  var pcLine = speedLine ? speedLine.previousElementSibling : null;
  if (pcLine) {
    pcLine.style.whiteSpace = 'nowrap';
      pcLine.style.fontSize = '20px';
      pcLine.style.letterSpacing = '0px';
      pcLine.style.lineHeight = '1';
      pcLine.style.display = 'flex';
      pcLine.style.flexDirection = 'column';
      pcLine.style.gap = '6px';
      var _box = $('pitch-info');
      if (_box) { _box.style.width = '134px'; _box.style.height = '150px'; _box.style.left = '474px'; _box.style.padding = '13px'; _box.style.gap = '8px'; _box.style.alignItems = 'flex-start'; }
      var _spd = $('last-pitch-speed');
      if (_spd) { _spd.style.fontSize = '14px'; _spd.style.whiteSpace = 'nowrap'; _spd.style.letterSpacing = '0px'; var _ptype = _spd.nextElementSibling; if (_ptype) { _ptype.style.fontSize = '12px'; _ptype.style.whiteSpace = 'nowrap'; _ptype.style.letterSpacing = '0px'; } }
      pcLine.innerHTML = '<div style="display:flex;align-items:center"><span style="display:inline-block;width:2.4em">PC</span><span id="pc-val" style="color:#fff;">0</span></div><div style="display:flex;align-items:center"><span style="display:inline-block;width:2.4em">K</span><span id="k-val" style="color:#fff;">0</span></div><div style="display:flex;align-items:center"><span style="display:inline-block;width:2.4em">BB</span><span id="pitch-bb-span" style="color:#fff;">0</span></div>';
      PITCH.pcSpan = $('pc-val'); PITCH.kSpan = $('k-val'); PITCH.bbSpan = $('pitch-bb-span');
  }
  PITCH.resolved = !!(PITCH.pcSpan && PITCH.kSpan && PITCH.bbSpan);
}
function renderPitchStats() {
  resolvePitchSpans();
  if (PITCH.pcSpan) PITCH.pcSpan.textContent = PITCH.pc;
  if (PITCH.kSpan) PITCH.kSpan.textContent = PITCH.k;
  if (PITCH.bbSpan) PITCH.bbSpan.textContent = PITCH.bb;
}
function setPitchSpeed(mph) {
  resolvePitchSpans();
  if (PITCH.speedSpan) { PITCH.speedSpan.textContent = mph; }
  else { setText('last-pitch-speed', mph + ' MPH'); }
}
function __pitchKey(p) { return (p && p.name) ? String(p.name) : "__unknown__"; }
function __pitchRec(key) { if (!PITCH.byPitcher[key]) PITCH.byPitcher[key] = { pc: 0, k: 0, bb: 0 }; return PITCH.byPitcher[key]; }
// Point the live PC box at a specific pitcher (by identity). A new (relief) pitcher naturally starts at 0.
function setActivePitcher(sideKey, p) { var key = String(sideKey == null ? '__noside__' : sideKey); PITCH.active = key; var r = __pitchRec(key); var id = __pitchKey(p); if (r.id !== undefined && r.id !== id) { r.pc = 0; r.k = 0; r.bb = 0; } r.id = id; PITCH.pc = r.pc; PITCH.k = r.k; PITCH.bb = r.bb; renderPitchStats(); }
function __activeRec() { return __pitchRec(PITCH.active == null ? "__unknown__" : PITCH.active); }
function incPC(n) { var r = __activeRec(); r.pc += (n || 1); PITCH.pc = r.pc; renderPitchStats(); }
function addK() { var r = __activeRec(); r.k += 1; PITCH.k = r.k; renderPitchStats(); }
function addBB() { var r = __activeRec(); r.bb += 1; PITCH.bb = r.bb; renderPitchStats(); }
function resetPitchStats() { PITCH.byPitcher = {}; PITCH.active = null; PITCH.pc = 0; PITCH.k = 0; PITCH.bb = 0; renderPitchStats(); }
function pitchesInPA(ev) { return (ev && ev.pitches && ev.pitches.length) ? ev.pitches.length : 1; }
// ---- Ball-flight line overlay (static dotted line: home -> hit field) -
var HOME_PT = { x: 1000, y: 1180 };
var FIELD_ENDPOINTS = {
  'LEFT': { x: 470, y: 470 }, 'LEFT-CENTER': { x: 735, y: 420 }, 'CENTER': { x: 1000, y: 400 },
  'RIGHT-CENTER': { x: 1265, y: 420 }, 'RIGHT': { x: 1530, y: 470 }
};
// Ground-out targets: SHORT lines into the infield (~42% from home to the
// matching outfield point), distinct from the longer outfield endpoints above.
var INFIELD_ENDPOINTS = {
  'LEFT': { x: 777, y: 882 }, 'LEFT-CENTER': { x: 889, y: 861 }, 'CENTER': { x: 1000, y: 852 },
  'RIGHT-CENTER': { x: 1111, y: 861 }, 'RIGHT': { x: 1223, y: 882 }
};
function ensureFlightLine() {
  if ($('ball-flight-svg')) return $('ball-flight-line');
  var stage = $('stage');
  if (!stage) { var r1 = $('sprite-runner-1b'); stage = r1 ? r1.parentElement : document.body; }
  var svgNS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(svgNS, 'svg');
  svg.id = 'ball-flight-svg';
  svg.setAttribute('viewBox', '0 0 2000 1333');
  svg.setAttribute('style', 'position:absolute;left:0;top:0;width:2000px;height:1333px;pointer-events:none;z-index:40;');
  var line = document.createElementNS(svgNS, 'line');
  line.id = 'ball-flight-line';
  line.setAttribute('stroke', '#ffe14d');
  line.setAttribute('stroke-width', '6');
  line.setAttribute('stroke-dasharray', '14 12');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('x1', HOME_PT.x); line.setAttribute('y1', HOME_PT.y);
  line.setAttribute('x2', HOME_PT.x); line.setAttribute('y2', HOME_PT.y);
  line.style.display = 'none';
  svg.appendChild(line);
  stage.appendChild(svg);
  return line;
}
function showFlightLine(loc, outType) {
  var line = ensureFlightLine();
  if (!line) return;
  // Ground outs land in the infield (short line); hits and air outs reach the outfield.
  var ENDS = (outType === 'GB') ? INFIELD_ENDPOINTS : FIELD_ENDPOINTS;
  var end = ENDS[loc] || ENDS['CENTER'];
  line.setAttribute('x1', HOME_PT.x); line.setAttribute('y1', HOME_PT.y);
  line.setAttribute('x2', end.x); line.setAttribute('y2', end.y);
  line.style.display = 'block';
}
function clearFlightLine() {
  var line = $('ball-flight-line');
  if (line) line.style.display = 'none';
}


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
  // ---- Per-player face library (consistent per player, varied across lineup) ----
  var FACE_FILES = ["assets/faces/face_01_light_clean_blonde.png", "assets/faces/face_02_light_mustache_brown.png", "assets/faces/face_03_light_beard_red.png", "assets/faces/face_04_light_stubble_black.png", "assets/faces/face_05_light_goatee_auburn.png", "assets/faces/face_06_medlight_clean_sandy.png", "assets/faces/face_07_medlight_full_brown.png", "assets/faces/face_08_medlight_mustache_black.png", "assets/faces/face_09_med_beard_black.png", "assets/faces/face_10_med_clean_dkbrown.png", "assets/faces/face_11_med_goatee_black.png", "assets/faces/face_12_medtan_stubble_black.png", "assets/faces/face_13_medtan_full_black.png", "assets/faces/face_14_medtan_clean_black.png", "assets/faces/face_15_brown_beard_black.png", "assets/faces/face_16_brown_mustache_black.png", "assets/faces/face_17_brown_clean_black.png", "assets/faces/face_18_dkbrown_goatee_black.png", "assets/faces/face_19_dkbrown_full_black.png", "assets/faces/face_20_dark_clean_black.png", "assets/faces/face_21_dark_beard_gray.png", "assets/faces/face_22_med_clean_gray.png"];
  function faceHash(name) { var h = 0; name = String(name || ""); for (var i = 0; i < name.length; i++) { h = (h * 31 + name.charCodeAt(i)) >>> 0; } return h; }
  function faceForPlayer(name) { /* Tone-aware, deterministic, self-contained. The cards carry no skin-tone/photo field, so we group the face library by the tone token in each filename and use two independent name-hashes: one picks a tone bucket (realistic spread across the lineup), the other picks a face within it. Same name => same face (consistent), varied across the lineup, and no individual's real appearance is fabricated. */ if (!faceForPlayer._buckets) { var ORDER = ["light","medlight","med","medtan","brown","dkbrown","dark"]; var byTone = {}; for (var t = 0; t < ORDER.length; t++) byTone[ORDER[t]] = []; for (var i = 0; i < FACE_FILES.length; i++) { var m = FACE_FILES[i].match(/face_\d+_([a-z]+)_/); var tone = (m && byTone[m[1]]) ? m[1] : "med"; byTone[tone].push(FACE_FILES[i]); } var buckets = []; for (var k = 0; k < ORDER.length; k++) { if (byTone[ORDER[k]].length) buckets.push(byTone[ORDER[k]]); } faceForPlayer._buckets = buckets; } var B = faceForPlayer._buckets; if (!B.length) return FACE_FILES[faceHash(name) % FACE_FILES.length]; var s = String(name || ""), th = 5381; for (var j = 0; j < s.length; j++) { th = (th * 33 + s.charCodeAt(j)) >>> 0; } var bucket = B[th % B.length]; return bucket[faceHash(name) % bucket.length]; }
  function setFace(panelId, name) { var p = $(panelId); if (!p) return; var img = p.querySelector("img"); if (img && name) img.src = faceForPlayer(name); }
  // ---- Display name formatter: fit names into narrow NES boxes ----
  // Keep short names as-is; otherwise render first-initial + FULL last name
  // (e.g. CARNEY LANSFORD -> C. LANSFORD). Only ellipsis-truncate if even that
  // overflows. Display-only: underlying lineup/sim data is untouched.
  // Lineup-column name: ALL-CAPS, LAST NAME ONLY, suffix-aware (Jr./Sr./II/III/IV/V).
  // On-field lineup columns only; the AT BAT/on-deck/in-the-hole panels still use fmtName.
  function fmtLineupName(name){
    var n = String(name == null ? '' : name).trim();
    if (!n) return '';
    var parts = n.split(/\s+/);
    var SUFFIX = { JR:1, SR:1, II:1, III:1, IV:1, V:1 };
    while (parts.length > 1) {
      var tail = parts[parts.length-1].toUpperCase().replace(/[.,]+$/,'');
      if (SUFFIX[tail]) { parts.pop(); } else { break; }
    }
    return (parts[parts.length-1] || n).toUpperCase();
  }

  function fmtName(name, max){
    max = max || 12;
    var n = String(name == null ? '' : name).trim();
    if (n.length <= max) return n;
    var parts = n.split(/\s+/);
    if (parts.length < 2) {
      return n.length > max ? n.slice(0, max - 1) + '\u2026' : n;
    }
    var last = parts[parts.length - 1];
    var abbr = parts[0].charAt(0) + '. ' + last;
    if (abbr.length <= max) return abbr;
    // even 'F. LASTNAME' too long: keep initial + truncated last name with ellipsis
    var room = max - 3; // account for 'F. ' prefix
    if (room < 1) return abbr.slice(0, max - 1) + '\u2026';
    return parts[0].charAt(0) + '. ' + last.slice(0, room - 1) + '\u2026';
  }
  function setPanel(panelId, name, s1, s2, s3) {
    var L = panelLeaves(panelId);
    if (!L || L.length < 4) return;
    L[0].textContent = fmtName(name);
    setFace(panelId, name);
    if (panelId === "atbat-box") { L[0].style.color = "#ffffff"; L[0].style.fontWeight = "normal"; L[0].style.textShadow = "none"; }
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
  // ---- Invented retro-game ad tile (replaces energy-drink tile; original IP) ----
  function renderAdTile() {
    var ad = $("tile-ad"); if (!ad) return;
    ad.style.background = "#0d2438"; ad.style.borderColor = "#2bb6e0"; ad.style.color = "#dff3ff";
    ad.innerHTML = "" +
        '<div style="color:#ffe14d;font-size:18px;letter-spacing:1px;font-weight:bold;text-shadow:2px 2px 0 #7a4d00;">YOUR AD HERE</div>' +
        '<div style="color:#9fdcff;font-size:9px;letter-spacing:2px;margin-top:10px;">AD SPACE AVAILABLE</div>';
  }
  function showRunners(bases) {
    ensureRunnerSprites();
    renderAdTile();
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
    // FIX 2: leave per-inning run cells BLANK until that inning is actually played.
    // updateLinescore() fills them left-to-right as play reaches each half-inning;
    // a played inning with no runs still shows '0' (it gets repainted there).
    for (var i = 1; i <= 9; i++) { setLinescoreCell('mudcats', i, ''); setLinescoreCell('acorns', i, ''); }
    ['r', 'h', 'e'].forEach(function (k) { setLinescoreCell('mudcats', k, '0'); setLinescoreCell('acorns', k, '0'); });
  }

  // ---- Result line + flavor --------------------------------------------
  function fieldWord(loc) {
    return { 'LEFT': 'LEFT', 'LEFT-CENTER': 'LEFT-CENTER', 'CENTER': 'CENTER',
             'RIGHT-CENTER': 'RIGHT-CENTER', 'RIGHT': 'RIGHT' }[loc] || 'CENTER';
  }
  // ====================================================================
  //  MOOD-DRIVEN ANNOUNCER  (additive; sim math untouched)
  //  Original character: "Chip Dungaree" -- a deadpan, dryly-disgusted,
  //  comedically-underwhelmed old-school booth voice. NOT based on any
  //  real broadcaster or film character. All lines original.
  //  USER TEAM = mudcats (bats top). Opponent = acorns (home).
  // ====================================================================
  var ANNOUNCER_NAME = "Chip Dungaree";

  var __lastLine = {};
  function moodPick(key, pool, rng) {
    if (!pool || !pool.length) return "";
    if (pool.length === 1) return pool[0];
    var idx = Math.floor(rng() * pool.length);
    if (pool[idx] === __lastLine[key]) idx = (idx + 1) % pool.length;
    __lastLine[key] = pool[idx];
    return pool[idx];
  }

  // Mood from live state: smug / weary / tense / restless / neutral.
  function moodOf(ctx) {
    var diff = ctx.us - ctx.them;
    var late = ctx.inning >= 7;
    var absd = Math.abs(diff);
    if (late && absd <= 2) return "tense";
    if (diff >= 6) return "smug";
    if (diff <= -3) return "weary";
    if (diff >= 3) return "smug";
    if (ctx.dry >= 6) return "restless";
    return "neutral";
  }


  var LINE = {
    K_SWING: { smug:["Swung right through it. Bless him.","He swung at a rumor.","Big hack, no contact. Classic.","Whiff. He'll feel that one tomorrow."], weary:["Strike three swinging. Sure.","He swung. I'd have ducked.","Another swing-and-miss. Of course.","Down on strikes. We move on."], tense:["He chases ball four! Oh no.","Swings through it! Big spot, big miss.","Strikeout swinging. That stings.","He went fishing. Tough inning."], restless:["Swing, miss, yawn. Next.","Whiff. Wake me up.","He swung. Riveting stuff.","Strike three. I've seen paint dry."], any:["Swinging strike three.","He missed. Badly.","Whiff for the third strike."] },
    K_LOOK: { smug:["Caught looking. Bold strategy.","Watched it go by. Lovely.","He let strike three visit.","Frozen. Just admiring the seams."], weary:["Called strike three. Walk it off.","He took it. Of course he did.","Looking. Bat never left his shoulder.","Punched out watching. Sigh."], tense:["Caught looking in a huge spot!","He froze! That's brutal.","Strike three, didn't swing. Ouch.","Took the pitch. Inning over."], restless:["Stood there. Strike three.","He watched it. Thrilling.","Called out looking. Cinema.","Bat on shoulder, walking back."], any:["Called strike three.","He watched it for strike three.","Frozen on the corner."] },
    BB: { smug:["Four pitches near the zone, none in it.","A walk. The pitcher's gift.","Free pass. How generous.","He walks. Effort: minimal."], weary:["Ball four. We're here a while.","A walk. Naturally.","Free base. Sure, why not.","Walk. The pitcher's losing it."], tense:["Walk puts the go-ahead on!","Ball four in a spot like this. Yikes.","He walks him. Dangerous.","Free pass at the worst time."], restless:["Walk. Riveting television.","Ball four. Stretch your legs.","A walk. The crowd checks phones.","Free base. Nobody cares."], any:["Ball four, take your base.","A walk.","He draws the walk."] },
    H1: { smug:["A single. They'll throw a parade.","Bloop falls in. Skill, surely.","Found a hole. Even he's surprised.","A knock. Mark the calendar."], weary:["Single. Fine. It counts.","Base hit. Sure.","He singles. The game continues.","A hit. We acknowledge it."], tense:["Single, and here come the runners!","Base knock in a big spot!","He punches one through! Trouble.","Single keeps the line moving."], restless:["A single. Be still my heart.","Base hit. Wow. A whole base.","Single. The plot thickens slightly.","He reaches first. Slow news day."], any:["Base hit, into the outfield.","A single.","He lines one for a hit."] },
    H2: { smug:["A double. He's quite proud.","Into the gap. Look at him chug.","Two bases. He's winded already.","Stand-up double. Practically jogged."], weary:["Double. Good for him.","Two bases. Sure, why not.","Into the gap. We allow it.","He doubles. The day drags on."], tense:["Double, and that's a run scoring!","Gapper! This could get ugly.","Two bases in a huge spot!","He rips a double. Here we go."], restless:["A double. Now we're slightly awake.","Two bases. Stop the presses.","Gap double. Mild applause.","He chugs into second. Adorable."], any:["A double into the gap.","Two-bagger.","He doubles to the wall."] },
    H3: { smug:["A triple. Someone misplayed it.","Three bases. He may need oxygen.","Triple. The outfield apologizes.","He's at third, gasping. Worth it."], weary:["Triple. Rare. Anyway.","Three bases. Long way to run.","He triples. Lungs permitting.","A triple. Don't see those much."], tense:["Triple! That clears the bases!","Three bases and the crowd's up!","He rips it to the corner! Huge!","Triple in a spot like this. Wow."], restless:["A triple. Now THIS is something.","Three whole bases. Finally.","Triple. I felt a pulse.","He's gassed at third. Cute."], any:["A triple to the corner.","Three bases.","He legs out a triple."] },
    HR: { smug:["Gone. The pitcher hates that one.","See ya. Hang it, pay for it.","Out of here. Predictable, really.","A homer. He'll be insufferable now."], weary:["Home run. Add it to the pile.","Gone. Of course it is.","That'll leave. Naturally.","Over the wall. The day continues."], tense:["GONE! That's a back-breaker!","Home run! The roof comes off!","He crushes it! Game-changer!","Out of here in a massive spot!"], restless:["A homer. Finally, content.","Gone. Now we're talking.","Over the wall. I'm awake.","Souvenir for somebody. Lucky them."], any:["Home run, way back and gone.","That ball is gone.","He goes deep."] },
    GO: { smug:["Routine grounder. Thrilling.","Chopper, easy out. He tried.","Grounder. Defense barely woke up.","Rolls over. Thanks for coming."], weary:["Groundout. Of course.","Grounder, one away. Onward.","He grounds out. We trudge on.","Two hops, out. Riveting."], tense:["Grounder, they get him! Whew.","Chopped, one away in a big spot.","Groundout. Every out counts now.","He grounds it. Dodged one."], restless:["Groundout. Another victim.","Two-hopper, out. More of this.","Rolls over weakly. Sigh.","Grounder. Wake me at the homer."], any:["Grounds out to the infield.","Routine groundout.","Chopped, out at first."] },
    AO: { smug:["Lazy fly, caught. Mailing it in.","Pops up. Nobody jogged.","Routine fly. Barely tested the glove.","Can of corn. He'll take credit."], weary:["Flies out. Why would I lie.","Pop-up, caught. Agony goes on.","Lined right at someone. Sure.","Fly ball, out. The day endures."], tense:["Flied out! They squeeze it!","Lined right at him! Close one!","Pop-up, caught. Big exhale.","Fly out in a tense spot. Phew."], restless:["Lazy fly, caught. Nap resumes.","Pop-up. Milking nine innings.","Flies out. Crowd checks phones.","Routine fly. I've aged a year."], any:["Fly ball, caught.","Pops it up, easy out.","Flies out to the outfield."] },
    DP: { smug:["Two for the price of one. Tidy.","Double play. He hit into help.","Around the horn, double dip.","Twin killing. Defense says thanks."], weary:["Double play. Rally over. Typical.","Two outs, one swing. Of course.","He grounds into two. Sigh.","Double play wipes it out."], tense:["Double play! Escapes the jam!","Two on one play in a huge spot!","Turned two! Crisis averted!","DP ends the threat. Massive."], restless:["Double play. Twice the boredom.","Two outs in a blink. Onward.","He hits into two. Efficient, I guess.","Twin killing. Back to napping."], any:["Grounds into a double play.","Two on one play.","They turn two."] },
    ERR: { smug:["Boots it. Use a glove, friend.","Error. The glove was decorative.","Kicks it around. Marvelous.","Misplays it. That's a choice."], weary:["Error. Of course. This defense. Lord.","He drops it. Naturally.","Misplay. We expected nothing less.","Error. Same old story."], tense:["Error in a huge spot! Costly!","He kicks it! That could hurt!","Misplay opens the door! Yikes!","Error, and the runner's moving!"], restless:["Error. New ways to lose.","He boots it. Creative.","Misplay. At least it's different.","Drops it. Something happened, finally."], any:["Reaches on an error.","The ball is misplayed.","Error on the play."] }
  };


  var SITU = {
    NEW_INNING: { any:["Fresh inning. New chances to disappoint.","New frame. Same heroes, sadly.","Inning flips. Hope springs, briefly."] },
    NEW_PITCHER: { any:["New arm in. We'll see, I guess.","Pitching change. Stretch your legs.","Fresh pitcher. Same strike zone, hopefully."] },
    LEADOFF: { any:["Leadoff man up. Set the table or don't.","Top of the order. Try to start something.","Leadoff. A man, a bat, low expectations."] },
    BASES_LOADED: { any:["Bases juiced. Don't waste it. Please.","Loaded up. This is the part they fumble.","Sacks full. A grand chance to strand them."] },
    RISP: { any:["Runner in scoring spot. Cue the strikeout.","Ducks on the pond. Bring 'em home, maybe.","Runner in scoring position. Don't strand him."] },
    BLOWOUT: { any:["This is a massacre. Mercy, please.","It's a blowout. I'm billing overtime.","Lopsided. The hot dog line is the real game."] },
    COMEBACK: { any:["A comeback brewing? I don't believe it.","They're crawling back. Suspicious.","Rally afoot. Don't get my hopes up."] },
    TIE: { any:["All knotted up. Now it gets interesting.","Tie game. Somebody do something.","Even score. The drama nobody asked for."] }
  };


  // ---- Change 3: edgier / cruder / funnier variants (additive merge) -----
  // Crude & savage about BASEBALL and the fictional players/teams only.
  // No slurs, nothing sexual/explicit, no punching down at protected groups,
  // no real-person names, no verbatim copyrighted catchphrases. Mild profanity ok.
  var EDGE_LINE = {};
  var EDGE_SITU = {};
  (function mergeEdge(){
    function merge(dst, src){
      for (var ev in src){ if(!dst[ev]) dst[ev]={};
        for (var m in src[ev]){
          var add = src[ev][m] || [];
          dst[ev][m] = (dst[ev][m] || []).concat(add);
        }
      }
    }
    try { merge(LINE, EDGE_LINE); merge(SITU, EDGE_SITU); } catch(e){}
  })();
  function bankLine(bank, mood, rng, key) {
    if (!bank) return "";
    var pool = bank[mood] || bank.any;
    return moodPick(key + ":" + mood, pool, rng);
  }
  function situLine(bank, mood, rng, key) {
    if (!bank) return "";
    var pool = bank[mood] || bank.any;
    return moodPick("S:" + key + ":" + mood, pool, rng);
  }
  function kFlavor(rng) { return rng() < 0.6 ? "K_SWING" : "K_LOOK"; }
  function rbiTag(n) { if (!n) return ""; return n === 1 ? " (1 in)" : " (" + n + " in)"; }
  function pickSitu(ctx, rng) {
    if (ctx.newPitcher) return "NEW_PITCHER";
    if (ctx.newInning && rng() < 0.7)  return "NEW_INNING";
    if (ctx.justTied && rng() < 0.9)   return "TIE";
    if (ctx.comeback && rng() < 0.5)   return "COMEBACK";
    if (ctx.basesLoaded && rng() < 0.6) return "BASES_LOADED";
    if (ctx.blowout && rng() < 0.18)   return "BLOWOUT";
    if (ctx.leadoff && rng() < 0.4)    return "LEADOFF";
    if (ctx.risp && rng() < 0.3)       return "RISP";
    return null;
  }
  var __lastIntro = '';
  var __situOnly = false;
  function dedupeName(introTxt, txt, b) {
    if (!b || !b.name || !introTxt || !txt) return txt;
    var nm = b.name; var last = nm.split(/\s+/).pop();
    if (introTxt.toLowerCase().indexOf(last.toLowerCase()) < 0) return txt;
    var out = txt; var DASH = " -- ";
    if (out.indexOf(nm + DASH) === 0) out = out.slice((nm + DASH).length);
    else if (out.indexOf(DASH + nm) >= 0) out = out.replace(DASH + nm, '');
    else if (out.indexOf(nm + ' ') === 0) out = out.slice((nm + ' ').length);
    out = out.replace(/^\s+/, '');
    if (out && /^[a-z]/.test(out)) out = out.charAt(0).toUpperCase() + out.slice(1);
    return out;
  }
  // Conversational batter intro: name + a stat or two, dry voice, varied.
  function introTag(b, rng) {
    if (!b || !b.name) return '';
    var r = (typeof rng === 'function') ? rng : Math.random;
    var nm = b.name; var avg = b.avg || ''; var hr = (b.hr|0); var rbi = (b.rbi|0);
    // short last name for snappier reads
    var parts = nm.split(/\s+/); var last = parts[parts.length-1];
    var hot = (parseFloat(avg) >= 0.300); var cold = (parseFloat(avg) > 0 && parseFloat(avg) < 0.235);
    var pop = (hr >= 25);
    var opts = [];
    opts.push(last + '.');
    opts.push(last + ' up.');
    opts.push('Here\u2019s ' + last + '.');
    opts.push('Now ' + last + '.');
    opts.push(last + ' digs in.');
    if (pop) { opts.push(last + ', ' + hr + ' bombs.'); opts.push('Big bopper ' + last + '.'); }
    if (rbi >= 40) { opts.push(last + ', ' + rbi + ' RBI.'); }
    if (hot) { opts.push(last + ', hot.'); }
    if (cold) { opts.push(last + ', cold.'); }
    // pick, avoiding immediate repeat
    var pick = opts[(r() * opts.length) | 0];
    if (pick === __lastIntro && opts.length > 1) pick = opts[((r() * opts.length) | 0)];
    __lastIntro = pick;
    return pick + ' ';
  }
  function resultText(ev, rng, ctx) {
    ctx = ctx || { us:0, them:0, inning:1, half:"top", batting:"us",
                   outs:0, bases:[null,null,null], runsOnPlay:ev.runs||0,
                   leadoff:false, dry:0 };
    var mood = moodOf(ctx);
    var k = ev.outcome, who = ev.batter, call;
    if (k === "BB")       call = bankLine(LINE.BB, mood, rng, "BB") + " -- " + who;
    else if (k === "K")   call = who + " -- " + bankLine(LINE[kFlavor(rng)], mood, rng, "K");
    else if (k === "OUT") {
      if (ev.error)            call = who + " reaches -- " + bankLine(LINE.ERR, mood, rng, "ERR");
      else if (ev.dp)          call = who + " -- " + bankLine(LINE.DP, mood, rng, "DP");
      else if (ev.outType === "GB") call = who + " -- " + bankLine(LINE.GO, mood, rng, "GO");
      else                     call = who + " -- " + bankLine(LINE.AO, mood, rng, "AO");
    } else {
      var hb = (k === "_1B") ? LINE.H1 : (k === "_2B") ? LINE.H2
             : (k === "_3B") ? LINE.H3 : LINE.HR;
      var line = bankLine(hb, mood, rng, k);
      var tail = (k === "HR") ? "" : (ev.error ? " (E!)" : "");
      call = line + " -- " + who + rbiTag(ev.runs) + tail;
    }
    var s = pickSitu(ctx, rng);
    if (s) {
      var sb = situLine(SITU[s], mood, rng, s);
      // FIX(commentary-sync): gate side-change flavor to a clean state so it can never
      // contradict the displayed outs/count. NEW_INNING ("inning flips") may only show on a
      // genuine leadoff PA with no outs before and no out recorded this PA (O will read 0).
      if (sb && s === "NEW_INNING" && (ctx.outs > 0 || ev.outs)) sb = "";
      if (sb) {
        var joined = sb + "  " + call;
        // Only PREPEND flavor when it fits; never discard the authoritative outcome line.
        if (joined.length <= 52) { __situOnly = false; return joined; }
      }
    }
    __situOnly = false; return call;
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
    // --- mood/announcer tracking (additive; no effect on sim math) ---
    var __dry = 0;
    var __prevPit = { top: null, bot: null };
    var __firstOfHalf = { top: true, bot: true };
    for (var inning = 1; inning <= 9; inning++) {
      ['top', 'bot'].forEach(function (half) {
        if (half === 'bot' && inning === 9 && line.acorns.r > line.mudcats.r) return; // walk-off skip
        var team = teams[half], pit = pitchers[half], code = team.code;
        var bases = [null, null, null];
        var outs = 0, runsThisInning = 0, hitsThisInning = 0, errThisInning = 0;
        while (outs < 3) {
          var bi = idx[half] % 9;
          var bat = team.lineup[bi];
          var __basesBefore = bases.slice();
          var __outsBefore = outs;
          var __isLeadoff = (__firstOfHalf[half] && bi === 0) ||
                            (__outsBefore === 0 && !__basesBefore[0] && !__basesBefore[1] && !__basesBefore[2]);
          var __newInning = __firstOfHalf[half];
          var __newPitcher = (__prevPit[half] !== null && __prevPit[half] !== pit);
          __prevPit[half] = pit; __firstOfHalf[half] = false;
          var ev = simPA(bat, pit, bases, rng);
          if (ev.inPlay && !ev.hit && rng() < 0.02) { ev.error = true; errThisInning++; }
          if (ev.hit) hitsThisInning++;
          if (ev.outs) outs += ev.outs;
          runsThisInning += ev.runs;
          var __usBefore = line.mudcats.r, __themBefore = line.acorns.r;
          // accumulate line totals
          line[code].r += ev.runs; line[code].h += (ev.hit ? 1 : 0);
          var __us = line.mudcats.r, __them = line.acorns.r;
          var __b = __basesBefore;
          var __risp = !!(__b[1] || __b[2]);
          var __loaded = !!(__b[0] && __b[1] && __b[2]);
          var __diffBefore = __usBefore - __themBefore, __diffAfter = __us - __them;
          var __justTied = (__diffBefore < 0 && __diffAfter === 0);
          var __comeback = (__diffBefore <= -3 && __diffAfter > __diffBefore && __diffAfter < 0 && ev.runs > 0 && code === 'mudcats');
          var __blowout = (Math.abs(__diffAfter) >= 8);
          var __ctx = { us: __us, them: __them, inning: inning, half: half,
            batting: (code === 'mudcats' ? 'us' : 'them'), outs: __outsBefore, bases: __b,
            runsOnPlay: ev.runs, leadoff: __isLeadoff, newInning: __newInning, newPitcher: __newPitcher,
            dry: __dry, risp: __risp, basesLoaded: __loaded, justTied: __justTied,
            comeback: __comeback, blowout: __blowout };
          var snap = {
            inning: inning, half: half, teamCode: code, teamName: team.name,
            batterIdx: bi, batter: bat,
            onDeck: team.lineup[(bi + 1) % 9], inHole: team.lineup[(bi + 2) % 9],
            pitcher: pit,
            outcome: ev.outcome, location: ev.location, outType: ev.outType, infielder: ev.infielder, error: !!ev.error,
            runsOnPlay: ev.runs, scored: (ev.scored ? ev.scored.slice() : []), basesAfter: (outs >= 3 ? [null, null, null] : bases.slice()), outsAfter: outs,
            text: resultText(ev, rng, __ctx),
            situOnly: __situOnly,
            pitches: buildPitchSequence(ev.outcome, rng),
            lineSnapshot: null // filled below
          };
          stream.push(snap);
          if (ev.hit || ev.runs > 0 || ev.error) __dry = 0; else __dry++;
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
  var BATTER_PACE_MS = 3300; // fixed consistent beat between plays (batter/play mode); same on or off
  var PACE = {
    pitch:  { perPitch: 1000, postPA: 650 }, // ~1.0s per pitch, brief beat after the PA
    batter: { perPA: BATTER_PACE_MS },                 // ~1.8s per at-bat
    rapid:  { perPA: 400 }                   // ~0.4s per at-bat
  };
  var GAME = {
    stream: [], pos: -1, playing: false, timer: null,
    line: { mudcats: { innings: [], r: 0, h: 0, e: 0 }, acorns: { innings: [], r: 0, h: 0, e: 0 } },
    mode: 'batter',      // 'pitch' | 'batter' | 'rapid'  (default = medium tier)
    pitchIdx: -1         // index into current PA's pitch sequence (pitch mode only)
  };

  // ---- Lineup-column highlight: single source of truth = batting team + batterIdx ----
  function lineupColumns() {
    var stage = $("stage") || document.body;
    var cols = Array.prototype.filter.call(stage.querySelectorAll("div"), function(d){
      if (d.children.length !== 9) return false;
      for (var i=0;i<9;i++){ if (d.children[i].children.length !== 2) return false; }
      return true;
    });
    return cols;
  }
  function nameSpanOf(row){
    // Row has a position label (1-2 char code) and a player name; order differs
    // between left/right columns. Pick the child that is NOT a position code.
    var POS = { "P":1,"C":1,"1B":1,"2B":1,"3B":1,"SS":1,"LF":1,"CF":1,"RF":1,"DH":1 };
    var kids = row.children, cand = null;
    for (var i=0;i<kids.length;i++){
      var t = kids[i].textContent.trim();
      if (!POS[t]) { cand = kids[i]; break; }
    }
    return cand || kids[kids.length - 1];
  }
  // Complement of nameSpanOf: the row child whose text IS a position code.
  function posCellOf(row){
    var POS = { "P":1,"C":1,"1B":1,"2B":1,"3B":1,"SS":1,"LF":1,"CF":1,"RF":1,"DH":1 };
    var kids = row.children;
    for (var i=0;i<kids.length;i++){ if (POS[kids[i].textContent.trim()]) return kids[i]; }
    return null;
  }
  // ----- Depot: paint visitor (Mudcats/left) lineup-column names from MUDCATS.lineup (once) -----
  var _depotNamesPainted=false;
  function paintDepotVisitorNames(){
    try{
      if(_depotNamesPainted) return;
      if(typeof window==="undefined" || !window.__DEPOT_TEAM_LOADED || window.__DEPOT_MATCH_MODE) return; // only when user team loaded; never in a match
      var cols=lineupColumns(); if(!cols.length) return;
      var ordered=cols.slice().sort(function(a,b){ return a.getBoundingClientRect().left-b.getBoundingClientRect().left; });
      var col=ordered[0]; // visitor = left column = Mudcats
      if(!col || !MUDCATS.lineup) return;
      for(var i=0;i<9 && i<col.children.length;i++){ var row=col.children[i]; var ld=MUDCATS.lineup[i]; if(!ld) continue; var sp=nameSpanOf(row); if(sp) sp.textContent=fmtLineupName(ld.name); var pc=posCellOf(row); if(pc && ld.pos) pc.textContent=ld.pos; }
      _depotNamesPainted=true;
    }catch(e){}
  }

  // ----- Depot: drive every USER-team (visitor/Mudcats) name display from MUDCATS.name -----
// Replaces the hardcoded "MUDCATS" in the scoreboard linescore label and the big bottom
// team name. Opponent (ACORNS/home) is left untouched. Size-to-fit keeps long names from
// overflowing their boxes.
function fitText(el, maxW, basePx, minPx){
  if(!el) return;
  el.style.fontSize = basePx + "px";
  var px = basePx;
  while(px > minPx && el.scrollWidth > maxW){ px -= 1; el.style.fontSize = px + "px"; }
}
function applyTeamName(){
  try{
    if(typeof window==="undefined" || !window.__DEPOT_TEAM_LOADED || window.__DEPOT_MATCH_MODE) return; // never in a match
    var nm = MUDCATS.name || "MUDCATS";
    var lbl = $("team-mudcats");
    if(lbl){ lbl.textContent = nm; lbl.style.whiteSpace="nowrap"; lbl.style.overflow="hidden"; fitText(lbl, 214, 22, 12); }
    var big = $("bigname-mudcats");
    if(big){ big.textContent = nm; big.style.whiteSpace="nowrap"; fitText(big, 560, 78, 30); }
  }catch(e){}
}
function highlightLineup(teamCode, batIdx) {
    var cols = lineupColumns();
    if (!cols.length) return;
    // Clear name highlight on every row of every detected lineup column.
    cols.forEach(function(col){
      for (var i=0;i<9;i++){ nameSpanOf(col.children[i]).style.color = "#ffffff"; }
    });
    // Decide which column belongs to the batting team.
    // mudcats = left column (lower X), acorns = right column (higher X).
    var ordered = cols.slice().sort(function(a,b){ return a.getBoundingClientRect().left - b.getBoundingClientRect().left; });
    var col = (teamCode === "acorns") ? ordered[ordered.length-1] : ordered[0];
    if (col && batIdx >= 0 && batIdx < 9) {
      nameSpanOf(col.children[batIdx]).style.color = "#f6c81e";
    }
  }
  // ---- Result/commentary ticker: never wrap; marquee-scroll over-long lines ----
  function ensureMarqueeStyle() {
    if (document.getElementById("rl-marquee-style")) return;
    var st = document.createElement("style");
    st.id = "rl-marquee-style";
    st.textContent = "@keyframes rlScroll { 0%{transform:translateX(0);} 100%{transform:translateX(var(--rl-shift));} }";
    document.head.appendChild(st);
  }
  function setResultLine(msg) {
    var box = $("result-line");
    if (!box) return;
    ensureMarqueeStyle();
    // Make the box single-line + overflow-robust + a bit wider.
    box.style.whiteSpace = "nowrap";
    box.style.overflow = "hidden";
    box.style.width = "960px";
    box.style.padding = "0 14px";
    box.style.boxSizing = "border-box";
    // Inner span carries the text so we can measure/scroll it.
    var span = box.querySelector(".rl-text");
    if (!span) { box.textContent = ""; span = document.createElement("span"); span.className = "rl-text"; span.style.display = "inline-block"; box.appendChild(span); }
    span.style.animation = "none";
    span.style.setProperty("--rl-shift", "0px");
    span.textContent = String(msg == null ? "" : msg);
    // Measure: if the text is wider than the visible box, marquee it; else center it.
    var avail = box.clientWidth - 28; // minus padding
    var need = span.scrollWidth;
    if (need > avail) {
      box.style.justifyContent = "flex-start";
      var shift = (need - avail) + 40;
      span.style.setProperty("--rl-shift", (-shift) + "px");
      var dur = Math.max(4, (shift / 60)); // ~60px/sec
      span.style.animation = "rlScroll " + dur.toFixed(1) + "s linear infinite alternate";
    } else {
      box.style.justifyContent = "center";
    }
  }
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
    setPanel('pitching-box', ev.pitcher.name, ev.pitcher.era, ev.pitcher.w, ev.pitcher.l); setActivePitcher(ev.half === 'top' ? 'home' : 'away', ev.pitcher); /* PC box keyed on the defensive SIDE (collision-proof), label uses pitcher name */
    // Sync lineup-column highlight to the current batter (same source as AT BAT/ON DECK/IN THE HOLE)
    highlightLineup(ev.teamCode, ev.batterIdx);
    paintDepotVisitorNames();
		applyTeamName();

    // Runners on base
    showRunners(ev.basesAfter);

    // Pitch info (cosmetic): last pitch speed/type
  var speeds = [88, 91, 93, 78, 84, 95, 72];
  var types = ['FASTBALL', 'CURVE', 'SLIDER', 'CHANGEUP', 'SINKER'];
  if (!skipCount) {
    var lastP = (ev.pitches && ev.pitches.length) ? ev.pitches[ev.pitches.length - 1] : null;
    setPitchSpeed(lastP ? lastP.speed : speeds[(Math.random() * speeds.length) | 0]);
    setText('last-pitch-type', lastP ? lastP.type : types[(Math.random() * types.length) | 0]);
  }
  // Pitch-count tally. In batter/rapid the PA resolves whole here; in pitch
  // mode the pitches were already counted (skipCount=true) so don't re-add.
  if (!skipCount) {
    incPC(pitchesInPA(ev));
    if (ev.outcome === 'K') addK();
    else if (ev.outcome === 'BB') addBB();
  }
  // Ball-flight line: draw toward the hit field on a ball in play; else clear.
  if (ev.location && ev.outcome !== 'BB' && ev.outcome !== 'K') showFlightLine(ev.location, ev.outType);
  else clearFlightLine();

  // Result line (lead with a conversational batter intro + stats)
    var __said;
    if (ev.situOnly) {
      __said = ev.text;
    } else if (ev.batter) {
      var __intro = introTag(ev.batter);
      __said = __intro + dedupeName(__intro, ev.text, ev.batter);
    } else {
      __said = ev.text;
    }
    setResultLine(__said);
    __ensureVoiceToggle();
    __voiceSpeak(__said);

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
    setPanel('pitching-box', ev.pitcher.name, ev.pitcher.era, ev.pitcher.w, ev.pitcher.l); setActivePitcher(ev.half === 'top' ? 'home' : 'away', ev.pitcher); /* PC box keyed on the defensive SIDE (collision-proof), label uses pitcher name */
  // Sync lineup-column highlight to the current batter EVERY pitch (same source as AT BAT) so it never lags until the PA resolves
  highlightLineup(ev.teamCode, ev.batterIdx);
  setPitchSpeed(pitch.speed);
  setText('last-pitch-type', pitch.type);
  incPC(1);            // count this pitch
  clearFlightLine();   // new pitch incoming -> clear prior ball-flight line
  // small live call in the result line as the count builds
    var callWord = pitch.call === 'BALL' ? 'BALL' : pitch.call === 'FOUL' ? 'FOUL' :
                   pitch.call === 'STRIKE' ? 'STRIKE' : 'SWING';
    if (!pitch.terminal) {
      setResultLine(ev.batter.name + ' \u2014 ' + pitch.type + ' ' + pitch.speed +
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
    setPitchSpeed(pitch.speed);
    setText('last-pitch-type', pitch.type);
    incPC(1);                               // count the terminal pitch
    if (ev.outcome === 'K') addK();         // applyEvent skips these (skipCount)
    else if (ev.outcome === 'BB') addBB();
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
        var __base = nextDelay(resolvedPA);
        GAME.timer = setTimeout(tick, __base); // fixed consistent beat; not gated on speech
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
    resetPitchStats();   // PC/K/BB -> 0 (per-pitcher; pitching change resets too)
    clearFlightLine();
    setResultLine('PLAY BALL!');
  }

  // ===== POST-GAME BOX SCORE (additive; derived from GAME.stream + GAME.line) =====
  // The engine does NOT accumulate per-player stats; we derive them by walking the
  // SAME event stream that drives the scoreboard, so box totals reconcile with the
  // line score (sum of batting R == team R == line-score R; sum of H == H column).
  function __bxEnsureStyle(){
    if (document.getElementById('boxscore-style')) return;
    var st = document.createElement('style');
    st.id = 'boxscore-style';
    st.textContent =
      '#boxscore-overlay{position:fixed;inset:0;z-index:300000;background:rgba(0,0,0,0.82);' +
        'display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:28px 12px;}' +
      '#boxscore-overlay.show{display:flex;}' +
      '#boxscore-panel{background:#000;border:4px solid #f6c81e;box-shadow:0 0 0 4px #000,0 8px 28px rgba(0,0,0,0.7);' +
        'max-width:980px;width:100%;color:#fff;font-family:\'Press Start 2P\',monospace;padding:20px 18px 26px;}' +
      '#boxscore-panel h2{color:#f6c81e;font-size:16px;margin:0 0 4px;letter-spacing:1px;text-align:center;}' +
      '#boxscore-panel .bx-sub{color:#9fdcff;font-size:9px;text-align:center;margin-bottom:16px;letter-spacing:1px;}' +
      '#boxscore-panel .bx-sec{color:#f6c81e;font-size:11px;margin:16px 0 6px;border-bottom:2px solid #f6c81e;padding-bottom:4px;letter-spacing:1px;}' +
      '#boxscore-panel table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;}' +
      '#boxscore-panel th,#boxscore-panel td{padding:4px 3px;text-align:center;white-space:nowrap;}' +
      '#boxscore-panel th{color:#9fdcff;border-bottom:1px solid #444;}' +
      '#boxscore-panel td.bx-name,#boxscore-panel th.bx-name{text-align:left;color:#fff;}' +
      '#boxscore-panel tr.bx-tot td{color:#f6c81e;border-top:1px solid #444;font-weight:bold;}' +
      '#boxscore-panel .bx-pos{color:#888;}' +
      '#boxscore-line{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;}' +
      '#boxscore-line td,#boxscore-line th{border:1px solid #444;padding:4px 5px;text-align:center;}' +
      '#boxscore-line th{color:#9fdcff;}' +
      '#boxscore-line td.bx-rhe{color:#f6c81e;font-weight:bold;}' +
      '#boxscore-close{display:block;margin:18px auto 0;font-family:\'Press Start 2P\',monospace;font-size:12px;' +
        'color:#f6c81e;background:#7a1c1c;border:3px solid #f6c81e;padding:10px 22px;cursor:pointer;letter-spacing:1px;}' +
      '#boxscore-result{text-align:center;color:#fff;font-size:12px;margin:10px 0 4px;letter-spacing:1px;}';
    document.head.appendChild(st);
  }
  // Walk the stream (up to position `upto`, default whole game) and derive stats.
  function __bxDerive(stream, upto){
    if (upto == null) upto = stream.length - 1;
    var teams = {
      mudcats: { name: MUDCATS.name, code:'mudcats', bat: {}, order: [], pitcher: { name: ACORNS.pitcher.name, team: ACORNS.name, ip_outs:0, h:0, r:0, bb:0, k:0 } },
      acorns:  { name: ACORNS.name,  code:'acorns',  bat: {}, order: [], pitcher: { name: MUDCATS.pitcher.name, team: MUDCATS.name, ip_outs:0, h:0, r:0, bb:0, k:0 } }
    };
    // R (runs scored) is credited by scorer NAME; tally a name->team+count first.
    function batRec(t, idx, b){
      if (!t.bat[idx]) { t.bat[idx] = { idx:idx, name:b.name, pos:(b.pos||''), ab:0, r:0, h:0, rbi:0, hr:0, _2B:0, _3B:0, bb:0, k:0 }; t.order.push(idx); }
      return t.bat[idx];
    }
    var scorers = {}; // name -> count (across whole game)
    for (var i=0; i<=upto && i<stream.length; i++){
      var ev = stream[i];
      var t = teams[ev.teamCode]; if (!t) continue;
      var oppPit = (ev.teamCode === 'mudcats') ? teams.mudcats.pitcher : teams.acorns.pitcher; // pitcher that FACED this batter
      var rec = batRec(t, ev.batterIdx, ev.batter);
      var oc = ev.outcome;
      var isHit = (oc==='_1B'||oc==='_2B'||oc==='_3B'||oc==='HR');
      var isOutPA = (oc==='K'||oc==='OUT');
      if (oc==='BB'){ rec.bb++; oppPit.bb++; }
      else { rec.ab++; }              // K, OUT, and all hits count as AB
      if (isHit){ rec.h++; oppPit.h++; if(oc==='HR') rec.hr++; else if(oc==='_2B') rec._2B++; else if(oc==='_3B') rec._3B++; }
      if (oc==='K'){ rec.k++; oppPit.k++; }
      rec.rbi += (ev.runsOnPlay||0);
      oppPit.r += (ev.runsOnPlay||0);
      if (isOutPA) oppPit.ip_outs++;  // each K/OUT is one out recorded by the pitcher
      // runs scored: credit each scorer name
      var sc = ev.scored || [];
      for (var s=0; s<sc.length; s++){ var nm=sc[s]; scorers[nm]=(scorers[nm]||0)+1; }
    }
    // Apply scorer counts to the matching batter (by name) on each team.
    ['mudcats','acorns'].forEach(function(code){
      var t = teams[code];
      t.order.forEach(function(idx){ var rec=t.bat[idx]; if(scorers[rec.name]) rec.r = scorers[rec.name]; });
    });
    return teams;
  }
  function __bxIP(outs){ return Math.floor(outs/3) + '.' + (outs%3); }
  function __bxBatTable(t){
    var rows = '';
    var tot = { ab:0, r:0, h:0, _2B:0, _3B:0, rbi:0, hr:0, bb:0, k:0 };
    t.order.sort(function(a,b){ return a-b; }).forEach(function(idx){
      var p = t.bat[idx];
      tot.ab+=p.ab; tot.r+=p.r; tot.h+=p.h; tot._2B+=(p._2B||0); tot._3B+=(p._3B||0); tot.rbi+=p.rbi; tot.hr+=p.hr; tot.bb+=p.bb; tot.k+=p.k;
      rows += '<tr><td class="bx-name">'+__bxEsc(p.name)+' <span class="bx-pos">'+__bxEsc(p.pos||'')+'</span></td>'+
        '<td>'+p.ab+'</td><td>'+p.r+'</td><td>'+p.h+'</td><td>'+(p._2B||0)+'</td><td>'+(p._3B||0)+'</td><td>'+p.hr+'</td><td>'+p.rbi+'</td><td>'+p.bb+'</td><td>'+p.k+'</td></tr>';
    });
    rows += '<tr class="bx-tot"><td class="bx-name">TOTALS</td><td>'+tot.ab+'</td><td>'+tot.r+'</td><td>'+tot.h+'</td><td>'+tot._2B+'</td><td>'+tot._3B+'</td><td>'+tot.hr+'</td><td>'+tot.rbi+'</td><td>'+tot.bb+'</td><td>'+tot.k+'</td></tr>';
    return '<div class="bx-sec">'+__bxEsc(t.name)+' \u2014 BATTING</div>'+
      '<table><thead><tr><th class="bx-name">BATTER</th><th>AB</th><th>R</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>RBI</th><th>BB</th><th>K</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }
  function __bxPitTable(t){
    var p = t.pitcher;
    return '<div class="bx-sec">'+__bxEsc(p.team||t.name)+' \u2014 PITCHING</div>'+
      '<table><thead><tr><th class="bx-name">PITCHER</th><th>IP</th><th>H</th><th>R</th><th>BB</th><th>K</th></tr></thead><tbody>'+
      '<tr><td class="bx-name">'+__bxEsc(p.name)+'</td><td>'+__bxIP(p.ip_outs)+'</td><td>'+p.h+'</td><td>'+p.r+'</td><td>'+p.bb+'</td><td>'+p.k+'</td></tr>'+
      '</tbody></table>';
  }
  function __bxEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function __bxLineScore(line){
    var hdr = '<tr><th class="bx-name"></th>';
    for (var i=1;i<=9;i++) hdr += '<th>'+i+'</th>';
    hdr += '<th class="bx-rhe">R</th><th class="bx-rhe">H</th><th class="bx-rhe">E</th></tr>';
    function row(name, side){
      var r = '<tr><td class="bx-name">'+__bxEsc(name)+'</td>';
      for (var i=0;i<9;i++){ var v=side.innings[i]; r += '<td>'+(v==null?'':v)+'</td>'; }
      r += '<td class="bx-rhe">'+side.r+'</td><td class="bx-rhe">'+side.h+'</td><td class="bx-rhe">'+side.e+'</td></tr>';
      return r;
    }
    return '<div class="bx-sec">LINE SCORE</div><table id="boxscore-line"><thead>'+hdr+'</thead><tbody>'+
      row(MUDCATS.name, line.mudcats)+row(ACORNS.name, line.acorns)+'</tbody></table>';
  }
  function __bxOverlay(){
    var ov = document.getElementById('boxscore-overlay');
    if (ov) return ov;
    __bxEnsureStyle();
    ov = document.createElement('div'); ov.id='boxscore-overlay';
    var panel = document.createElement('div'); panel.id='boxscore-panel';
    ov.appendChild(panel);
    ov.addEventListener('click', function(e){ if (e.target===ov) __bxHide(); });
    document.body.appendChild(ov);
    return ov;
  }
  function __bxHide(){ var ov=document.getElementById('boxscore-overlay'); if(ov) ov.classList.remove('show'); }
  function renderBoxScore(stream, line, upto){
    try {
      stream = stream || GAME.stream; line = line || GAME.line;
      if (!stream || !stream.length) return;
      var teams = __bxDerive(stream, upto);
      var mr = line.mudcats.r, ar = line.acorns.r;
      var winner = mr>ar ? MUDCATS.name : ar>mr ? ACORNS.name : null;
      var resultLine = winner ? (winner + ' WIN, ' + Math.max(mr,ar) + '\u2013' + Math.min(mr,ar)) : ('TIE, ' + mr + '\u2013' + ar);
      var ov = __bxOverlay();
      var panel = document.getElementById('boxscore-panel');
      panel.innerHTML =
        '<h2>BOX SCORE</h2>'+
        '<div class="bx-sub">'+__bxEsc(MUDCATS.name)+' VS '+__bxEsc(ACORNS.name)+'</div>'+
        '<div id="boxscore-result">FINAL \u2014 '+__bxEsc(resultLine)+'</div>'+
        __bxLineScore(line)+
        __bxBatTable(teams.mudcats)+ __bxPitTable(teams.acorns)+
        __bxBatTable(teams.acorns)+  __bxPitTable(teams.mudcats);
      var close = document.createElement('button'); close.id='boxscore-close'; close.type='button'; close.textContent='\u2715 CLOSE';
      close.onclick = __bxHide; panel.appendChild(close);
      ov.classList.add('show');
    } catch(e){ if(typeof console!=='undefined') console.warn('[BoxScore] render failed:', e); }
  }
  if (typeof window!=='undefined'){ window.__renderBoxScore = renderBoxScore; }

  function flashDone() {
    var L = GAME.line;
    var msg = 'FINAL — ' + MUDCATS.name + ' ' + L.mudcats.r + ', ' + ACORNS.name + ' ' + L.acorns.r;
    setResultLine(msg);
    try{ if(typeof window!=="undefined" && typeof window.__onMatchComplete==="function"){ window.__onMatchComplete(GAME.line); } }catch(__e){}
    try{ if(typeof window!=="undefined" && typeof window.__renderBoxScore==="function"){ window.__renderBoxScore(GAME.stream, GAME.line); } }catch(__e2){}
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
    bar.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);' +
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
      // FIX 3: the fast/rapid pace tier garbles TTS, so default sound OFF when
      // the selected pace is 'rapid' -- unless the user has deliberately turned it ON.
      if (GAME.mode === 'rapid' && !__voiceUserChose && __voiceOn) { __setVoice(false); }
      GAME.pitchIdx = -1;           // reset any partial PA so the new mode starts clean
      if (wasPlaying) startAuto();
    };
    var boxBtn = makeBtn('BOX SCORE');
    boxBtn.style.background = '#7a5a1c'; boxBtn.style.borderColor = '#3f2f0d';
    boxBtn.onclick = function () { if (typeof window.__renderBoxScore === 'function') window.__renderBoxScore(GAME.stream, GAME.line); };
    bar.appendChild(playBtn); bar.appendChild(stepBtn); bar.appendChild(resetBtn); bar.appendChild(boxBtn);
    bar.appendChild(paceLbl); bar.appendChild(pace);
    document.body.appendChild(bar);
  }

  // ---- Attach after the screen's framework has built the DOM -----------
  function attach() {
    if (!$('result-line') || !$('atbat-box') || !$('count-o')) {
      return setTimeout(attach, 120); // wait for framework to finish
    }
    buildControls();
    var __ms=(typeof window!=="undefined"&&window.__DEPOT_MATCH_SEED!=null)?(window.__DEPOT_MATCH_SEED>>>0):Math.floor(Math.random()*1e9); resetGame(__ms);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(attach, 200); });
  } else {
    setTimeout(attach, 200);
  }

  // expose for headless / debugging

  // ===== MULTIPLAYER ASYNC PLAY: apply both lineups + match seed ============
  // Reuses the same batter()/R() mapping the solo hand-off uses. A match lineup
  // is {teamName|name, batters|lineup:[9], pitcher}. Maps either side onto a
  // team object (MUDCATS = challenger slot, ACORNS = opponent slot).

  // ===== MULTIPLAYER ASYNC PLAY: repaint BOTH teams (visitor=challenger, home=opponent) =====
  // Solo wiring only renames the visitor; for a match we also rename the home side.
  function repaintMatchTeams(){
    try {
      var cols = lineupColumns(); if(!cols || !cols.length) return;
      var ordered = cols.slice().sort(function(a,b){ return a.getBoundingClientRect().left - b.getBoundingClientRect().left; });
      var visCol = ordered[0];
      var homeCol = ordered[ordered.length-1];
      function paintCol(col, team){
        if(!col || !team || !team.lineup) return;
        for(var i=0;i<9 && i<col.children.length;i++){
          var row=col.children[i]; var ld=team.lineup[i]; if(!ld) continue;
          var sp=nameSpanOf(row); if(sp) sp.textContent=fmtLineupName(ld.name);
          var pc=posCellOf(row); if(pc && ld.pos) pc.textContent=ld.pos;
        }
      }
      paintCol(visCol, MUDCATS);
      if(homeCol!==visCol) paintCol(homeCol, ACORNS);
      // scoreboard linescore labels
      var tm=$("team-mudcats"); if(tm){ tm.textContent=MUDCATS.name; tm.style.whiteSpace="nowrap"; tm.style.overflow="hidden"; fitText(tm,214,22,12); }
      var ta=$("team-acorns"); if(ta){ ta.textContent=ACORNS.name; ta.style.whiteSpace="nowrap"; ta.style.overflow="hidden"; fitText(ta,214,22,12); }
      // bottom big visitor name (home big name is static markup; leave as-is)
      var bm=$("bigname-mudcats"); if(bm){ bm.textContent=MUDCATS.name; bm.style.whiteSpace="nowrap"; fitText(bm,560,78,30); } /* home big wordmark has no id in the static markup; find the matching large-font sibling on the home (right) side and drive it from ACORNS.name so the field name matches the applied opponent (single source of truth). */ var hb=null; if(bm && bm.parentElement){ var bl=bm.getBoundingClientRect(); var kids=bm.parentElement.children; for(var hi=0;hi<kids.length;hi++){ var k=kids[hi]; if(k===bm) continue; if(k.children && k.children.length) continue; var fs=parseFloat((k.currentStyle||window.getComputedStyle(k)).fontSize)||0; var kr=k.getBoundingClientRect(); if(fs>=40 && kr.left>bl.left){ hb=k; break; } } } if(hb){ hb.textContent=ACORNS.name; hb.style.whiteSpace="nowrap"; fitText(hb,560,78,30); }
    } catch(e){ if(typeof console!=="undefined") console.warn("[MatchPlay] repaintMatchTeams failed:", e); }
  }
  function applyDepotTeam(team, raw){
    try {
      if(!team || !raw) return false;
      var bl = raw.lineup || raw.batters;
      if(!bl || bl.length!==9) return false;
      var lu = bl.map(function(p){
        // null / un-modelable rates (low-PA or out-of-range AVG hitters) -> league-average so the batter is PLAYABLE
        var r = (p.rates && typeof p.rates === 'object') ? p.rates : { BB:LG.BB, K:LG.K, HR:LG.HR, _2B:LG._2B, _3B:LG._3B, _1B:LG._1B };
        var b = batter(p.name||"PLAYER", p.avg||".000", p.hr||0, p.rbi||0,
                       R(r.BB, r.K, r.HR, r._2B, r._3B, r._1B), p.tendency||"spray");
        b.pos = p.pos || "\u2014";
        return b;
      });
      team.lineup = lu;
      var nm = raw.teamName || raw.name;
      if(nm) team.name = String(nm).toUpperCase().slice(0,12);
      if(raw.pitcher){
        var pp = raw.pitcher;
        team.pitcher = { name: pp.name||team.pitcher.name, era: pp.era||team.pitcher.era,
                         w: (pp.w!=null?pp.w:team.pitcher.w), l: (pp.l!=null?pp.l:team.pitcher.l),
                         BB:(pp.BB!=null?pp.BB:team.pitcher.BB), K:(pp.K!=null?pp.K:team.pitcher.K),
                         HR:(pp.HR!=null?pp.HR:team.pitcher.HR), _2B:(pp._2B!=null?pp._2B:team.pitcher._2B),
                         _3B:(pp._3B!=null?pp._3B:team.pitcher._3B), _1B:(pp._1B!=null?pp._1B:team.pitcher._1B) };
      }
      return true;
    } catch(e){ if(typeof console!=="undefined") console.warn("[MatchPlay] applyDepotTeam failed:", e); return false; }
  }
  window.__simEngine = { GAME: GAME, step: step, startAuto: startAuto, stopAuto: stopAuto, resetGame: resetGame, buildPlayStream: buildPlayStream, applyDepotTeam: applyDepotTeam, repaintMatchTeams: repaintMatchTeams, MUDCATS: MUDCATS, ACORNS: ACORNS };

})();

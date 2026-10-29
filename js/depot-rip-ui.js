/* js/depot-rip-ui.js — THE DAILY RIP: screens and wiring.
 * Logic lives in js/depot-rip-engine.js (window.DepotRip). This file only
 * loads data, draws the screens, and keeps today's result in localStorage.
 * No auth, no Supabase: the front door is meant to be playable in 10 seconds.
 */
(function () {
  'use strict';
  var R = window.DepotRip;
  // AGENTS.md data-path rule: anchor data fetches to this script's own URL.
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  function dataURL(f) { return new URL('../data/' + f, SCRIPT_SRC).href; }
  var app = document.getElementById('app');
  var qs = new URLSearchParams(location.search);
  var TODAY = R.localDateKey();
  var DATE = /^\d{4}-\d{2}-\d{2}$/.test(qs.get('date') || '') ? qs.get('date') : TODAY;
  var OFFICIAL = DATE === TODAY;              // archive/test dates never overwrite today's run
  var KEY = 'rip:v1:' + DATE;
  var STAT_KEY = 'rip:stat:v1:';
  var S = { pack: null, byId: {}, picks: { slots: {}, rotation: [null, null] } };
  var FIELD = R.SLOTS, ROT = ['SP1', 'SP2'];
  var SLOT_NAME = { C: 'Catcher', '1B': 'First base', '2B': 'Second base', '3B': 'Third base', SS: 'Shortstop', LF: 'Left field', CF: 'Center field', RF: 'Right field', DH: 'Designated hitter', SP1: 'Starter, odd games', SP2: 'Starter, even games' };

  document.getElementById('ripNum').textContent = 'Rip #' + R.ripNumber(DATE) + (OFFICIAL ? '' : ' (archive)');

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200); }
  function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }); }
  /* The frame is the card's PRESTIGE band (js/depot-prestige.js): its cachet
   * as a collectible, the same number the binder and Lineup show. OVR is the
   * separate on-field number. */
  function tier(c) { return (c.prestige && c.prestige.band) || 'plain'; }
  function withTimeout(p, ms, label) {
    return Promise.race([p, new Promise(function (res) { setTimeout(function () { console.warn('[rip] ' + label + ' timed out after ' + ms + 'ms; continuing without it'); res(null); }, ms); })]);
  }
  /* Dress a dealt card with its cachet: prestige, marquee tier, library art. */
  function dress(c) {
    try {
      var P = window.DepotPrestige;
      if (P) {
        c.tier = P.tierFor(c.name) || 'COMMON';
        c.prestige = P.compute({ name: c.name, yr: c.year, year: c.year, set: c.set, tier: c.tier });
      } else console.warn('[rip] DepotPrestige missing; cards render without prestige');
      if (typeof window.depotResolveCardArt === 'function') {
        var a = window.depotResolveCardArt({ year: c.year, set: c.set, number: c.number }, 'front');
        c.art = a && a.url || null;
      } else console.warn('[rip] depotResolveCardArt missing; cards render without art');
    } catch (e) { console.warn('[rip] dress failed for ' + c.name, e); }
  }
  function artHTML(c) {
    var initials = String(c.name || '').split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 3).toUpperCase();
    return '<div class="art"><span class="glyph" aria-hidden="true">' + esc(initials) + '</span>' +
      (c.art ? '<img src="' + esc(c.art) + '" alt="' + esc(c.year + ' ' + c.set + ' ' + c.name) + '" loading="lazy" onerror="this.remove()">' : '') +
      '</div>';
  }
  function fmtLine(c) {
    if (!c.line) return '';
    if (c.line.none) return c.role === 'P' ? 'No MLB line. Pitches as a mop-up arm.' : 'No MLB line. Bats like a bench scrub.';
    var L = c.line;
    return c.role === 'P'
      ? c.season + ': ' + L.ERA + ' ERA, ' + (L.W != null ? L.W + '-' + L.L + ', ' : '') + L.SO + ' K'
      : c.season + ': ' + L.AVG + ', ' + L.HR + ' HR, ' + L.OPS + ' OPS';
  }
  function cardHTML(c, extra) {
    var resolved = !!c.line, star = resolved && R.isMarquee(c);
    return artHTML(c) +
      '<div class="chips"><span class="ovr" title="On-field rating">' + (resolved ? c.ovr : '··') + '</span>' +
      (c.prestige ? '<span class="pres" title="Prestige">' + c.prestige.total + '</span>' : '') +
      '<span class="pos' + (c.role === 'P' ? ' p' : '') + '">' + esc(c.role === 'P' ? (c.reliever ? 'RP' : 'SP') : c.pos) + '</span></div>' +
      '<div class="body"><div class="nm">' + (star ? '<span class="star" title="Marquee player">★</span> ' : '') + esc(c.name) + '</div>' +
      '<div class="meta">' + esc(c.year + ' ' + c.set + (c.number ? ' #' + c.number : '')) + '</div>' +
      (resolved ? '<div class="line' + (c.line.none ? ' none' : '') + '">' + esc(fmtLine(c)) + '</div>' : '<div class="load">Pulling stats…</div>') +
      (extra || '') + '</div>';
  }
  function paintCard(el, c) { el.dataset.tier = tier(c); el.innerHTML = cardHTML(c); }

  /* ---------- boot ---------- */
  function boot() {
    var saved = lsGet(KEY);
    if (saved && saved.season) return renderResult(saved, false);
    var year = R.yearFor(DATE);
    var idx = (window.DepotLibraryIndex && window.DepotLibraryIndex.load) ? withTimeout(window.DepotLibraryIndex.load(), 9000, 'art index') : Promise.resolve(null);
    var pres = (window.DepotPrestige && window.DepotPrestige.ready) ? withTimeout(window.DepotPrestige.ready(), 6000, 'prestige tables') : Promise.resolve(null);
    Promise.all([getJSON(dataURL('cards-' + year + '.json')), getJSON(dataURL('player_positions.json')), idx, pres]).then(function (res) {
      var positions = (res[1] && res[1].positions) || {};
      var norm = window.depotNormName || function (x) { return String(x).toLowerCase(); };
      var clean = window.depotCleanName || function (x) { return String(x).trim(); };
      /* Art gate, same rule as the pack shop: no image, no deal. Fails OPEN
       * (unfiltered catalog) if the index can't be read, exactly like
       * DepotShop.loadCatalog, so a slow index can't kill the daily game. */
      var rows = res[0], keys = res[2];
      if (keys && keys.size && typeof window.depotCatalogArtKey === 'function') {
        var gated = rows.filter(function (r) { r.year = r.year || year; return keys.has(window.depotCatalogArtKey(r)); });
        console.info('[rip] art-backed deal pool ' + gated.length + '/' + rows.length);
        if (gated.length) rows = gated;
        else console.warn('[rip] art gate emptied ' + year + '; dealing the unfiltered catalog');
      } else console.warn('[rip] no art index; dealing the unfiltered catalog');
      var pack = R.drawPack(DATE, year, rows, function (name) { return positions[norm(name)] || null; }, window.depotIsPlayable, clean);
      if (!pack) throw new Error('No set deep enough to deal from ' + year);
      S.pack = pack; pack.cards.forEach(function (c) { dress(c); S.byId[c.id] = c; });
      renderIntro();
    }).catch(function (e) {
      console.error('[rip] boot failed', e);
      app.innerHTML = '<div class="panel err"><h2>Today\'s pack didn\'t load</h2><p>The card catalog didn\'t come through. Check your connection and try again.</p><p><button class="btn small" id="retry">Try again</button></p></div>';
      document.getElementById('retry').onclick = function () { location.reload(); };
    });
  }

  /* ---------- 1. intro: the pack ---------- */
  function renderIntro() {
    var p = S.pack;
    app.innerHTML =
      '<section class="panel intro">' +
      '<h1>The Daily Rip</h1>' +
      '<p class="sub">Everyone gets the same pack today. Build a nine and a two-man rotation from it, then play an 8-game gauntlet. Your record is your score.</p>' +
      '<div class="pack" id="pack" role="button" tabindex="0" aria-label="Rip open today\'s ' + esc(p.year + ' ' + p.set) + ' pack">' +
      '<div class="tear"></div><div class="crimp t"></div><div class="crimp b"></div>' +
      '<div class="label"><span class="yr">' + p.year + '</span><span class="set">' + esc(p.set) + '</span><span class="ct">' + p.cards.length + ' cards</span></div></div>' +
      '<button class="btn" id="rip">Rip the pack</button>' +
      '</section>';
    var go = function () {
      var pk = document.getElementById('pack'); pk.classList.add('ripping');
      setTimeout(renderRip, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 480);
    };
    document.getElementById('rip').onclick = go;
    var pk = document.getElementById('pack');
    pk.onclick = go; pk.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  }

  /* ---------- 2. the rip: deal cards, resolve stats ---------- */
  function renderRip() {
    var p = S.pack;
    app.innerHTML = '<section class="panel"><h2>' + esc(p.year + ' ' + p.set) + '</h2>' +
      '<p class="progress" id="prog">Pulling stats for 0 of ' + p.cards.length + ' cards…</p>' +
      '<div class="grid" id="grid"></div>' +
      '<div class="actions" style="margin-top:16px"><button class="btn" id="toBuild" disabled>Build your nine</button></div></section>';
    var grid = document.getElementById('grid');
    p.cards.forEach(function (c, i) {
      var el = document.createElement('div'); el.className = 'card deal'; el.id = 'card-' + c.id; el.style.animationDelay = (i * 45) + 'ms';
      paintCard(el, c); grid.appendChild(el);
    });
    var done = 0, total = p.cards.length;
    var resolvePerson = window.depotResolvePerson || null;
    function one(c) {
      var ck = STAT_KEY + c.year + '|' + c.name + '|' + c.role, hit = lsGet(ck);
      if (hit && hit.rates) { Object.assign(c, hit); return Promise.resolve(c); }
      return R.resolveCard(c, resolvePerson).then(function (r) {
        if (r && !r.line.none) lsSet(ck, { personId: r.personId, role: r.role, pos: r.pos, season: r.season, rates: r.rates, line: r.line, ovr: r.ovr, reliever: r.reliever });
        return r;
      });
    }
    var queue = p.cards.slice(), active = 0;
    function pump() {
      while (active < 5 && queue.length) {
        var c = queue.shift(); active++;
        one(c).catch(function (e) { console.warn('[rip] resolve failed', c.name, e); return R.resolveCard(c, null); })
          .then(function (c2) {
            var cc = c2 || c; var el = document.getElementById('card-' + cc.id); if (el) paintCard(el, cc);
            done++; active--;
            document.getElementById('prog').textContent = done < total ? 'Pulling stats for ' + done + ' of ' + total + ' cards…' : 'Every card has a line. Pick your nine.';
            if (done === total) ripDone(); else pump();
          });
      }
    }
    pump();
  }
  function ripDone() {
    var none = S.pack.cards.filter(function (c) { return c.line && c.line.none; }).length;
    var btn = document.getElementById('toBuild');
    // The builder opens EMPTY. Playtest 2026-10-29: a pre-filled lineup was
    // within ~0.2 wins of the best one, so the game played itself.
    btn.disabled = false; btn.onclick = function () { S.picks = { slots: {}, rotation: [null, null] }; renderBuilder(); };
    if (none > S.pack.cards.length / 2) {
      var w = document.createElement('div'); w.className = 'err'; w.style.marginTop = '14px';
      w.innerHTML = '<b>The stats service didn\'t answer for ' + none + ' cards.</b> They\'d play as replacement-level. <button class="btn small" id="reresolve">Try the stats again</button>';
      btn.parentNode.parentNode.insertBefore(w, btn.parentNode);
      document.getElementById('reresolve').onclick = function () { S.pack.cards.forEach(function (c) { if (c.line && c.line.none) { c.line = null; c.rates = null; } }); renderRip(); };
    }
  }

  /* ---------- 3. the builder ---------- */
  function slotCard(slot) { var id = ROT.indexOf(slot) >= 0 ? S.picks.rotation[ROT.indexOf(slot)] : S.picks.slots[slot]; return id ? S.byId[id] : null; }
  function setSlot(slot, id) {
    // A card lives in one slot at a time. If it was already playing somewhere,
    // the two players swap spots, so the lineup never springs a hole.
    var isRot = ROT.indexOf(slot) >= 0;
    var prev = isRot ? S.picks.rotation[ROT.indexOf(slot)] : S.picks.slots[slot];
    if (isRot) {
      var j = S.picks.rotation.indexOf(id);
      if (j >= 0) S.picks.rotation[j] = prev || null;
      S.picks.rotation[ROT.indexOf(slot)] = id;
    } else {
      FIELD.forEach(function (s) { if (S.picks.slots[s] === id) { if (prev) S.picks.slots[s] = prev; else delete S.picks.slots[s]; } });
      S.picks.slots[slot] = id;
    }
  }
  function pickedIds() {
    var ids = []; FIELD.forEach(function (s) { if (S.picks.slots[s]) ids.push(S.picks.slots[s]); });
    S.picks.rotation.forEach(function (id) { if (id) ids.push(id); }); return ids;
  }
  function starCount(ids) { return (ids || pickedIds()).filter(function (id) { return R.isMarquee(S.byId[id]); }).length; }
  function complete() { return FIELD.every(function (s) { return S.picks.slots[s]; }) && S.picks.rotation[0] && S.picks.rotation[1] && starCount() <= R.MARQUEE_MAX; }
  /* Fill only the EMPTY spots, greedily, around whatever the player already set. */
  function fillRest() {
    var used = {}; pickedIds().forEach(function (id) { used[id] = 1; });
    var stars = starCount();
    var arms = S.pack.cards.filter(function (c) { return c.role === 'P' && !used[c.id]; }).sort(function (a, b) { return b.ovr - a.ovr; });
    [0, 1].forEach(function (i) {
      if (S.picks.rotation[i]) return;
      var p = arms.find(function (c) { return !used[c.id] && (!R.isMarquee(c) || stars < R.MARQUEE_MAX); });
      if (p) { S.picks.rotation[i] = p.id; used[p.id] = 1; if (R.isMarquee(p)) stars++; }
    });
    ['C', 'SS', 'CF', '2B', '3B', '1B', 'LF', 'RF', 'DH'].forEach(function (slot) {
      if (S.picks.slots[slot]) return;
      var best = null, bv = -1;
      S.pack.cards.forEach(function (c) {
        if (c.role !== 'H' || used[c.id] || (R.isMarquee(c) && stars >= R.MARQUEE_MAX)) return;
        var v = (c.ovr || 0) * R.fitFactor(c.pos, slot); if (v > bv) { bv = v; best = c; }
      });
      if (best) { S.picks.slots[slot] = best.id; used[best.id] = 1; if (R.isMarquee(best)) stars++; }
    });
  }
  function slotHTML(slot) {
    var c = slotCard(slot), isRot = ROT.indexOf(slot) >= 0;
    if (!c) return '<button class="slot empty" data-slot="' + slot + '"><span class="code">' + slot + '</span><span class="who"><b>Empty</b><small>' + SLOT_NAME[slot] + '</small></span></button>';
    var f = isRot ? 1 : R.fitFactor(c.pos, slot), lab = R.fitLabel(f);
    var sub = isRot ? (c.reliever ? 'Reliever, tires as a starter' : fmtLine(c)) : (lab ? 'Plays ' + c.pos + ', ' + lab : fmtLine(c));
    var warn = lab || (isRot && c.reliever);
    return '<button class="slot" data-slot="' + slot + '" data-tier="' + tier(c) + '"><span class="code">' + slot + '</span>' +
      (c.art ? '<img class="thumb" src="' + esc(c.art) + '" alt="" loading="lazy" onerror="this.remove()">' : '') +
      '<span class="who"><b>' + (R.isMarquee(c) ? '<span class="star" title="Marquee player">★</span> ' : '') + esc(c.name) + '</b><small' + (warn ? ' class="warn"' : '') + '>' + esc(sub) + '</small></span><span class="o">' + c.ovr + '</span></button>';
  }
  function renderBuilder() {
    var stars = starCount(), over = stars > R.MARQUEE_MAX;
    app.innerHTML = '<section class="panel builder">' +
      '<div><h2>Set your nine</h2><p class="muted">Tap a spot to pick who plays it. Out of position hurts, catcher and shortstop most. Your two starters alternate games.</p></div>' +
      '<p class="stars' + (over ? ' over' : '') + '"><b>★ ' + stars + ' of ' + R.MARQUEE_MAX + ' marquee spots used.</b> ' + (over ? 'Too many stars: bench one to play.' : 'Hall of Famers, superstars and historic seasons count. You can\'t play them all.') + '</p>' +
      '<div class="slots">' + FIELD.map(slotHTML).join('') + '</div>' +
      '<div><h2>Rotation</h2></div>' +
      '<div class="slots">' + ROT.map(slotHTML).join('') + '</div>' +
      '<div class="actions"><button class="btn" id="play"' + (complete() ? '' : ' disabled') + '>Play the season</button>' +
      '<button class="btn ghost small" id="auto">Fill the rest for me</button></div>' +
      '<p class="muted" style="font-size:14px">One official season per day. The same lineup always gets the same result, so set it how you want it.</p>' +
      '</section>';
    app.querySelectorAll('.slot').forEach(function (b) { b.onclick = function () { openPicker(b.dataset.slot); }; });
    document.getElementById('auto').onclick = function () { fillRest(); renderBuilder(); };
    document.getElementById('play').onclick = function () { if (complete()) playSeason(); };
  }
  function openPicker(slot) {
    var isRot = ROT.indexOf(slot) >= 0;
    var used = {}; FIELD.forEach(function (s) { if (S.picks.slots[s]) used[S.picks.slots[s]] = s; }); S.picks.rotation.forEach(function (id, i) { if (id) used[id] = ROT[i]; });
    var occupant = slotCard(slot);
    var starsElsewhere = starCount(pickedIds().filter(function (id) { return !occupant || id !== occupant.id; }));
    var list = S.pack.cards.filter(function (c) { return isRot ? c.role === 'P' : c.role === 'H'; }).map(function (c) {
      var f = isRot ? 1 : R.fitFactor(c.pos, slot); return { c: c, f: f, v: (c.ovr || 0) * f };
    }).sort(function (a, b) { return b.v - a.v; });
    var sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', 'Pick a player for ' + SLOT_NAME[slot]);
    sh.innerHTML = '<div class="inner"><div class="head"><h2>' + esc(SLOT_NAME[slot]) + '</h2><button class="btn small ghost" id="closeSheet">Close</button></div><div class="grid">' +
      list.map(function (x) {
        var lab = R.fitLabel(x.f), where = used[x.c.id];
        // a star sitting elsewhere in the lineup is a swap, so it never breaks the cap
        var capped = R.isMarquee(x.c) && !where && starsElsewhere >= R.MARQUEE_MAX;
        return '<button class="card" data-tier="' + tier(x.c) + '" data-id="' + x.c.id + '"' + (capped ? ' disabled' : '') + '>' + cardHTML(x.c,
          (capped ? '<div class="fitnote">All 3 star spots used</div>' : '') +
          (lab ? '<div class="fitnote">' + esc(lab) + '</div>' : '') + (isRot && x.c.reliever ? '<div class="fitnote">Reliever, tires as a starter</div>' : '') +
          (where && where !== slot ? '<div class="meta" style="margin-top:4px">Now at ' + where + '</div>' : '')) + '</button>';
      }).join('') + '</div></div>';
    document.body.appendChild(sh);
    function close() { sh.remove(); document.removeEventListener('keydown', onKey); var b = app.querySelector('[data-slot="' + slot + '"]'); if (b) b.focus(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    sh.addEventListener('click', function (e) { if (e.target === sh) close(); });
    document.getElementById('closeSheet').onclick = close;
    sh.querySelectorAll('button.card').forEach(function (b) { b.onclick = function () { setSlot(slot, b.dataset.id); close(); renderBuilder(); }; });
    var first = sh.querySelector('button.card'); if (first) first.focus();
  }

  /* ---------- 4. the season ---------- */
  function playSeason() {
    var entries = FIELD.map(function (s) { return { card: S.byId[S.picks.slots[s]], slot: s }; });
    var rot = S.picks.rotation.map(function (id) { return S.byId[id]; });
    var season = R.playSeason(DATE, entries, rot, S.pack.cards);
    var rec = {
      date: DATE, pack: { year: S.pack.year, set: S.pack.set },
      lineup: entries.map(function (e) { return { slot: e.slot, name: e.card.name, pos: e.card.pos, ovr: e.card.ovr } }),
      rotation: rot.map(function (c) { return c.name; }),
      season: season
    };
    if (OFFICIAL) lsSet(KEY, rec);
    renderResult(rec, true);
  }

  function renderResult(rec, animate) {
    var s = rec.season, diff = s.rf - s.ra;
    var share = R.shareText(rec.date, rec.pack, s);
    var FINAL = '<div id="final"' + (animate ? ' class="hidden"' : '') + '>' +
      '<div class="record">' + s.w + '-' + s.l + '</div>' +
      '<div class="verdict">' + esc(R.verdict(s.w)) + '</div>' +
      '<p class="muted">Run differential ' + (diff >= 0 ? '+' : '') + diff + (s.mvp ? '. MVP: ' + esc(s.mvp.name) + ', ' + s.mvp.line.H + '-for-' + s.mvp.line.AB + ', ' + s.mvp.line.HR + ' HR, ' + s.mvp.line.RBI + ' RBI.' : '.') + '</p>' +
      '<div class="actions" style="margin-top:12px"><button class="btn" id="share">Share your record</button>' +
      (OFFICIAL ? '' : '<a class="btn ghost small" href="rip.html">Play today\'s pack</a>') + '</div>' +
      (OFFICIAL ? '<p class="next" id="next"></p>' : '') +
      '</div>';
    app.innerHTML = '<section class="panel result-grid">' +
      '<div><h2>' + esc(rec.pack.year + ' ' + rec.pack.set) + ' season</h2></div>' +
      FINAL +
      '<div class="games" id="games">' + s.games.map(function (g) {
        var star = g.star && g.star.line ? g.star.name + ' ' + g.star.line.H + '-for-' + g.star.line.AB + (g.star.line.HR ? ', ' + g.star.line.HR + ' HR' : '') + (g.star.line.RBI ? ', ' + g.star.line.RBI + ' RBI' : '') : '';
        return '<div class="game ' + (g.win ? 'w' : 'l') + (animate ? ' pending' : '') + '" data-n="' + g.n + '">' +
          '<span class="wl" aria-label="' + (g.win ? 'Win' : 'Loss') + '">' + (g.win ? 'W' : 'L') + '</span>' +
          '<span class="opp"><b>' + (g.home ? 'vs ' : 'at ') + esc(g.opp) + '</b><small>' + esc((g.sp ? g.sp + ' started. ' : '') + star + (g.innings > 9 ? ' (' + g.innings + ' inn)' : '')) + '</small></span>' +
          '<span class="sc">' + g.my + '-' + g.their + '</span></div>';
      }).join('') + '</div></section>';
    document.getElementById('share').onclick = function () {
      if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) { navigator.share({ text: share }).catch(function () {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(share) : Promise.reject()).then(function () { toast('Copied. Paste it in the group chat.'); }, function () { prompt('Copy your result:', share); });
    };
    if (OFFICIAL) tick();
    if (animate) {
      var rows = app.querySelectorAll('.game'), i = 0, rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      (function next() {
        if (i < rows.length) { rows[i++].classList.remove('pending'); setTimeout(next, rm ? 0 : 420); }
        else document.getElementById('final').classList.remove('hidden');
      })();
    }
  }
  function tick() {
    var el = document.getElementById('next'); if (!el) return;
    var now = new Date(), mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var sec = Math.max(0, Math.floor((mid - now) / 1000)), h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s2 = sec % 60;
    el.textContent = 'Next pack in ' + h + 'h ' + (m < 10 ? '0' : '') + m + 'm ' + (s2 < 10 ? '0' : '') + s2 + 's.';
    if (sec === 0) { setTimeout(function () { location.reload(); }, 1500); return; }
    setTimeout(tick, 1000);
  }

  boot();
})();

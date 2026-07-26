/*
 * js/depot-position.js  --  position truth for every card.
 *
 * WHY THIS EXISTS. 'pos' used to be set only when a human typed it into the
 * Add-a-Card form, and 'type' was defaulted to 'hitter' on every row ever
 * written. cardType() trusted 'type' first, so the position fallback was dead
 * code and every pitcher in the depot rendered a season BATTING line. The old
 * unknown-position sentinel was an em dash, which has already been through a
 * lossy encode somewhere (one row carries the mojibake 'a-hat'), so any string
 * comparison against it is unsafe by construction.
 *
 * This module is the single source of position truth:
 *   - normalize    : anything that is not a real position token becomes null
 *   - resolve      : ask MLB StatsAPI for a player's primary position
 *   - notes meta   : read/write the meta block that rides inside cards.notes
 *   - backfill     : one-time pass over existing rows
 *
 * Loaded by index.html (binder, Add-a-Card, backfill) and game/shop.html
 * (post-grant pack enrichment). No pos column yet: Group By Position is
 * client-side over a 26-card COLLECTION. A real 'pos text' column plus SQL
 * migration is logged as a future item for when server-side queries matter.
 */
(function () {
  var TAG = '[depot] position:';
  var MLB = 'https://statsapi.mlb.com/api/v1';

  /* Notes meta markers. These MUST match index.html's META_MARK / META_END,
   * which sit next to packNotes()/unpackNotes(). We keep a copy because this
   * module is also loaded by game/shop.html, where index.html's inline script
   * does not exist. Bare globals are NOT window properties in this repo, so the
   * drift alarm below reads them with typeof and never through window. */
  var MARK = '\n\n<!--DEPOT_META:';
  var END = '-->';
  try {
    if (typeof META_MARK !== 'undefined' && META_MARK !== MARK) console.warn(TAG + ' META_MARK drift vs index.html');
    if (typeof META_END !== 'undefined' && META_END !== END) console.warn(TAG + ' META_END drift vs index.html');
  } catch (e) {}

  /* ---------- vocabulary ---------- */
  var PITCHER = { P: 1, SP: 1, RP: 1, LHP: 1, RHP: 1 };
  var VALID = {
    P: 1, SP: 1, RP: 1, LHP: 1, RHP: 1, TWP: 1, C: 1, '1B': 1, '2B': 1, '3B': 1,
    SS: 1, LF: 1, CF: 1, RF: 1, OF: 1, DH: 1, IF: 1, UT: 1
  };
  var BY_NAME = {
    'Pitcher': 'P', 'Starting Pitcher': 'SP', 'Relief Pitcher': 'RP',
    'Catcher': 'C', 'First Base': '1B', 'Second Base': '2B', 'Third Base': '3B',
    'Shortstop': 'SS', 'Left Field': 'LF', 'Center Field': 'CF', 'Right Field': 'RF',
    'Outfield': 'OF', 'Outfielder': 'OF', 'Designated Hitter': 'DH',
    'Two-Way Player': 'TWP', 'Infielder': 'IF', 'Utility': 'UT'
  };

  /* Normalize on read AND on write. Anything that is not a real position token
   * lands as null: the em-dash sentinel, its mojibake variants, free text, ''.
   * A null can never survive into a === comparison and quietly mean 'hitter'. */
  function normPos(v) {
    if (v == null) return null;
    var raw = String(v).trim();
    if (!raw) return null;
    if (BY_NAME[raw]) return BY_NAME[raw];
    var up = raw.toUpperCase();
    if (VALID[up]) return up;
    return null;
  }

  function isPitcherPos(v) { var p = normPos(v); return !!(p && PITCHER[p]); }
  function isTwoWayPos(v) { return normPos(v) === 'TWP'; }

  /* type derived from position: position is the primary signal. */
  function typeForPos(v) {
    var p = normPos(v);
    if (!p) return null;
    if (p === 'TWP') return 'two-way';
    return PITCHER[p] ? 'pitcher' : 'hitter';
  }

  /* ---------- MLB resolution ---------- */
  var personCache = {};

  /* ---- shared name helpers (accent-aware) -------------------------------
   * ONE implementation, exported for index.html so the add-card form and this
   * probe can never disagree about what a player is called.
   *
   * cleanName(): trims a raw/OCR'd string down to the person tokens while
   * PRESERVING accented Latin letters. The old ASCII-only token test
   * (/^[A-Za-z'.-]+$/) rejected "Beltre" with an acute e and broke out of the
   * loop, so cleanPlayerName("Adrian Beltre") returned just "Adrian".
   * normName(): folds accents/punctuation for COMPARISON only -- never store
   * its output, it is lossy by design.
   * ---------------------------------------------------------------------- */
  var NAME_SUF   = { 'Jr': 1, 'Jr.': 1, 'Sr': 1, 'Sr.': 1, 'II': 1, 'III': 1, 'IV': 1, 'V': 1 };
  var NAME_TOKEN = /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F'\u2019.\-]+$/;
  var NAME_UPPER = /^[A-Z\u00C0-\u00D6\u00D8-\u00DE]/;
  var NAME_LOWER = /[a-z\u00DF-\u00F6\u00F8-\u024F]/;

  function normName(x) {
    x = String(x == null ? '' : x).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    x = x.toLowerCase().replace(/\./g, ' ');
    x = x.replace(/\b(junior|jr)\b/g, 'jr').replace(/\b(senior|sr)\b/g, 'sr');
    return x.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isNameTok(w) {
    if (NAME_SUF[w]) return true;
    if (/^(?:[A-Z]\.){1,3}$/.test(w)) return true;
    return NAME_TOKEN.test(w) && NAME_UPPER.test(w) && NAME_LOWER.test(w);
  }

  function cleanName(n) {
    var raw = String(n == null ? '' : n);
    var s = raw.split(/[:\/|]/)[0];
    var toks = s.trim().split(/\s+/), out = [], core = 0, i, w;
    for (i = 0; i < toks.length; i++) {
      w = toks[i].replace(/^[ ,;()]+|[ ,;()]+$/g, '');
      if (!w) continue;
      if (!isNameTok(w)) break;
      if (core === 2) { if (NAME_SUF[w]) out.push(w); break; }
      out.push(w);
      if (!NAME_SUF[w]) core++;
    }
    return out.join(' ').replace(/\s+/g, ' ').trim() || raw.replace(/\s+/g, ' ').trim();
  }

  function searchPerson(name) {
    var nm = cleanName(name);
    if (!nm) return Promise.resolve(null);
    var byNames = MLB + '/people/search?names=' + encodeURIComponent(nm);
    var byQ = MLB + '/people/search?q=' + encodeURIComponent(nm);
    return fetch(byNames).then(function (r) {
      return r.ok ? r.json() : { people: [] };
    }).then(function (j) {
      var people = (j && j.people) || [];
      if (people.length) return people;
      return fetch(byQ).then(function (r2) {
        return r2.ok ? r2.json() : { people: [] };
      }).then(function (j2) { return (j2 && j2.people) || []; });
    }).then(function (people) {
      if (!people.length) return null;
      /* Prefer an exact full-name match, else the first hit. */
      var exact = null, i;
      for (i = 0; i < people.length; i++) {
        if (cleanName(people[i].fullName).toLowerCase() === nm.toLowerCase()) { exact = people[i]; break; }
      }
      return exact || people[0];
    }).catch(function () { return null; });
  }

  function resolvePerson(name) {
    var nm = cleanName(name).toLowerCase();
    if (!nm) return Promise.resolve(null);
    if (personCache[nm]) return personCache[nm];
    personCache[nm] = searchPerson(name);
    return personCache[nm];
  }

  /* Promise<string|null> -- the normalized primary position for a player name. */
  function resolvePosition(name) {
    return resolvePerson(name).then(function (p) {
      if (!p || !p.primaryPosition) return null;
      return normPos(p.primaryPosition.abbreviation) || normPos(p.primaryPosition.name);
    });
  }

  /* ---------- notes meta codec ---------- */
  function unpackNotes(notes) {
    notes = notes || '';
    var i = notes.indexOf(MARK);
    if (i < 0) return { bio: notes, meta: {} };
    var bio = notes.slice(0, i);
    var meta = {};
    var j = notes.indexOf(END, i);
    if (j > i) {
      try { meta = JSON.parse(notes.slice(i + MARK.length, j)); } catch (e) { meta = {}; }
    }
    return { bio: bio, meta: meta || {} };
  }

  /* Merge a patch into the meta block, preserving the bio text verbatim -- that
   * is where the pack receipt ('packseed:<seed>') and any catalog note live. */
  function withMeta(notes, patch) {
    var u = unpackNotes(notes);
    var meta = u.meta || {};
    var k;
    for (k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) meta[k] = patch[k]; }
    return u.bio + MARK + JSON.stringify(meta) + END;
  }

  /* ---------- season stats ---------- */
  /* A batting line masquerading as a pitcher's season: AB/AVG present, no ERA. */
  function looksLikeBattingLine(stats) {
    if (!stats) return false;
    var has = function (k) { return stats[k] != null && stats[k] !== ''; };
    if (has('ERA') || has('IP') || has('WHIP') || has('W') || has('L')) return false;
    return has('AB') || has('AVG') || has('OBP') || has('SLG') || has('OPS');
  }

  /* Map an MLB season split onto the depot's stat labels. STAT_MAP_PIT and
   * STAT_MAP_HIT are bare globals declared by index.html -- read with typeof,
   * never through window (they are not window properties). */
  function statMap(group) {
    try {
      if (group === 'pitching') return (typeof STAT_MAP_PIT !== 'undefined') ? STAT_MAP_PIT : null;
      return (typeof STAT_MAP_HIT !== 'undefined') ? STAT_MAP_HIT : null;
    } catch (e) { return null; }
  }

  function seasonStats(personId, year, group) {
    var map = statMap(group);
    if (!personId || !year || !map) return Promise.resolve(null);
    var url = MLB + '/people/' + personId + '/stats?stats=season&group=' + group + '&season=' + year;
    return fetch(url).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (j) {
      var splits = (j && j.stats && j.stats[0] && j.stats[0].splits) || [];
      if (!splits.length) return null;
      /* Traded seasons return one split per team: take the busiest, same rule
       * the Add-a-Card stat pull already uses. */
      var split = splits.length === 1 ? splits[0] : splits.reduce(function (a, b) {
        return ((b.stat && b.stat.gamesPlayed) || 0) > ((a.stat && a.stat.gamesPlayed) || 0) ? b : a;
      });
      var st = (split && split.stat) || {};
      var out = {}, k;
      for (k in map) {
        if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
        if (st[k] == null || st[k] === '' || st[k] === '-.--') continue;
        out[map[k]] = String(st[k]);
      }
      return Object.keys(out).length ? out : null;
    }).catch(function () { return null; });
  }

  /* ---------- post-grant enrichment (pack shop) ---------- */
  /* Deliberately NOT part of the money-safety insert path. The grant row and the
   * card insert land first; this runs afterwards, fire-and-forget. Any failure
   * leaves the rows exactly as inserted and the backfill can pick them up. */
  function enrichRows(client, ids) {
    if (!client || !ids || !ids.length) return Promise.resolve(0);
    return client.from('cards').select('id,player,notes').in('id', ids).then(function (sel) {
      if (sel.error || !sel.data) return 0;
      var done = 0;
      return sel.data.reduce(function (chain, row) {
        return chain.then(function () {
          return resolvePosition(row.player).then(function (pos) {
            if (!pos) return;
            var notes = withMeta(row.notes, { pos: pos, type: typeForPos(pos) });
            if (notes === row.notes) return;
            return client.from('cards').update({ notes: notes }).eq('id', row.id).then(function (u) {
              if (!u.error) done++;
            });
          });
        }).catch(function () {});
      }, Promise.resolve()).then(function () {
        if (done) console.log(TAG + ' enriched ' + done + ' new card(s) with a position');
        return done;
      });
    }).catch(function () { return 0; });
  }

  /* ---------- one-time backfill ---------- */
  /* Usage from the console while signed in:
   *   await depotBackfillPositions({ dryRun: true })   // report only
   *   await depotBackfillPositions()                   // write
   * Pitchers carrying a batting line (Vida Blue) get their season re-fetched
   * with group=pitching so they land fully correct rather than merely blank. */
  function backfill(opts) {
    opts = opts || {};
    var dry = !!opts.dryRun;
    var client = null;
    try { client = (typeof window.depotSB === 'function') ? window.depotSB() : null; } catch (e) { client = null; }
    if (!client) return Promise.reject(new Error('no supabase client -- sign in first'));
    return client.from('cards').select('id,player,year,notes').then(function (sel) {
      if (sel.error) throw new Error(sel.error.message);
      var rows = sel.data || [];
      var report = [];
      return rows.reduce(function (chain, row) {
        return chain.then(function () { return backfillOne(client, row, dry, report); });
      }, Promise.resolve()).then(function () {
        console.log(TAG + (dry ? ' DRY RUN -- ' : ' ') + report.length + ' row(s) examined');
        if (console.table) console.table(report); else console.log(report);
        return report;
      });
    });
  }

  function backfillOne(client, row, dry, report) {
    var u = unpackNotes(row.notes);
    var meta = u.meta || {};
    var before = meta.pos;
    return resolvePosition(row.player).then(function (pos) {
      var patch = { pos: pos, type: pos ? typeForPos(pos) : (meta.type || null) };
      var refetch = !!(pos && isPitcherPos(pos) && looksLikeBattingLine(meta.stats));
      var pre = refetch ? resolvePerson(row.player).then(function (p) {
        return p ? seasonStats(p.id, row.year, 'pitching') : null;
      }) : Promise.resolve(null);
      return pre.then(function (pit) {
        if (pit) patch.stats = pit;
        var notes = withMeta(row.notes, patch);
        var line = {
          card: cleanName(row.player) + ' ' + (row.year || ''),
          pos_before: (before == null ? '(none)' : String(before)),
          pos_after: pos || '(unresolved)',
          type: patch.type || '(none)',
          stats: refetch ? (pit ? 're-fetched as pitching' : 'refetch failed -- left as-is') : ''
        };
        if (dry || notes === row.notes) {
          line.wrote = dry ? 'dry-run' : 'no change';
          report.push(line);
          return;
        }
        return client.from('cards').update({ notes: notes }).eq('id', row.id).then(function (up) {
          line.wrote = up.error ? ('FAILED: ' + up.error.message) : 'written';
          report.push(line);
        });
      });
    }).catch(function (e) {
      report.push({ card: cleanName(row.player), pos_after: 'ERROR', wrote: String((e && e.message) || e) });
    });
  }

  /* ---------- exports ---------- */
  window.depotNormalizePos = normPos;
  window.depotPosIsPitcher = isPitcherPos;
  window.depotPosIsTwoWay = isTwoWayPos;
  window.depotTypeForPos = typeForPos;
  window.depotResolvePosition = resolvePosition;
  window.depotResolvePerson = resolvePerson;
  window.depotSeasonStats = seasonStats;
  window.depotNotesWithMeta = withMeta;
  window.depotNotesUnpack = unpackNotes;
  window.depotCleanName = cleanName;
  window.depotNormName = normName;
  window.depotEnrichPositions = enrichRows;
  window.depotBackfillPositions = backfill;
  console.debug(TAG + ' ready');
})();

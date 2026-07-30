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

  /* Does this person's MLB career plausibly cover the given card year?
   * Returns TRUE when we have no span data at all -- absence of evidence must
   * not be treated as evidence of a bad match. */
  function spanCovers(p, year) {
    var y = parseInt(year, 10);
    if (!isFinite(y)) return true;
    var debut = (p && p.mlbDebutDate) ? parseInt(String(p.mlbDebutDate).slice(0, 4), 10) : NaN;
    var last  = (p && p.lastPlayedDate) ? parseInt(String(p.lastPlayedDate).slice(0, 4), 10) : NaN;
    if (!isFinite(debut) && !isFinite(last)) return true;
    if (isFinite(debut) && y < debut) return false;
    if (isFinite(last) && y > last) return false;
    return true;
  }
  /* Every official spelling MLB itself publishes for a person, accent-folded for
   * comparison only. This exists because card fronts and MLB do not always agree
   * on a first name: the 1999 Topps card says "Bob Abreu", MLB's record says
   * fullName "Bobby Abreu" -- with firstName "Bob". Matching the card against
   * the person's OWN variants is still an exact match, not a fuzzy one. */
  function nameVariants(p) {
    var out = [];
    function push(v) { var c = cleanName(v || ''); if (c) out.push(normName(c)); }
    if (!p) return out;
    push(p.fullName); push(p.nameFirstLast); push(p.firstLastName);
    if (p.lastName) { push((p.firstName || '') + ' ' + p.lastName); push((p.useName || '') + ' ' + p.lastName); }
    if (p.useLastName) { push((p.useName || '') + ' ' + p.useLastName); push((p.firstName || '') + ' ' + p.useLastName); }
    return out;
  }

  /* Last resort before giving up: search the SURNAME alone and accept a person
   * only when exactly one candidate both matches an official variant of the card
   * name and has a career span covering the card year. Two candidates, or none,
   * is a refusal -- ambiguity must never become a stats write. The generic
   * ?q= search is deliberately not used for this: asked for "Bob Abreu" it
   * returns Freddie Freeman, Andrew McCutchen and Manny Machado. */
  function surnameRetry(name, year) {
    var nm = cleanName(name), key = normName(nm);
    var toks = nm.split(/\s+/);
    var last = toks.length > 1 ? toks[toks.length - 1] : '';
    if (!last) return Promise.resolve(null);
    return fetch(MLB + '/people/search?names=' + encodeURIComponent(last)).then(function (r) {
      return r.ok ? r.json() : { people: [] };
    }).then(function (j) {
      var people = (j && j.people) || [], hits = [], i, v;
      for (i = 0; i < people.length; i++) {
        v = nameVariants(people[i]);
        if (v.indexOf(key) >= 0 && spanCovers(people[i], year)) hits.push(people[i]);
      }
      if (hits.length === 1) {
        console.log(TAG + ' surname retry matched "' + nm + '" to ' + hits[0].fullName + ' #' + hits[0].id + ' via an official name variant');
        return hits[0];
      }
      if (hits.length > 1) console.warn(TAG + ' surname retry refused "' + nm + '": ' + hits.length + ' people share that name and cover ' + year);
      return null;
    }).catch(function (e) { console.warn(TAG + ' surname retry failed for "' + nm + '": ' + ((e && e.message) || e)); return null; });
  }

  function searchPerson(name, year) {
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
      /* Prefer an exact full-name match, accent-folded via the shared helper.
       * An exact name match is trusted on its own: a 1993 Jeter card is still
       * Derek Jeter even though he debuted in 1995. That is a stats-provenance
       * problem, not an identity problem, and it is handled on the stats side. */
      var key = normName(nm), exact = null, i;
      for (i = 0; i < people.length; i++) {
        if (normName(cleanName(people[i].fullName)) === key) { exact = people[i]; break; }
      }
      if (exact) return exact;
      /* No exact fullName match. Before falling back to a positional guess, ask
       * MLB by surname and require an exact match on one of ITS OWN spellings. */
      return surnameRetry(nm, year).then(function (alt) {
        if (alt) return alt;
      /* No exact match, so people[0] is only a guess. Accept it ONLY if the
       * career span can cover this card year; otherwise return null and let the
       * caller report "unresolved" honestly. This is what stops a plain
       * "Dante Bichette" card resolving to Dante Bichette Jr. at index [0]. */
      return (people[0] && spanCovers(people[0], year)) ? people[0] : null;
      });
    }).catch(function () { return null; });
  }

  function resolvePerson(name, year) {
    var nm = cleanName(name).toLowerCase();
    if (!nm) return Promise.resolve(null);
    /* Cache key includes the year: the same name can resolve differently for
       different card years now that the fallback is span-guarded. */
    var ck = nm + '|' + (year == null || year === '' ? '' : String(year));
    if (personCache[ck]) return personCache[ck];
    personCache[ck] = searchPerson(name, year);
    return personCache[ck];
  }

  /* Promise<string|null> -- the normalized primary position for a player name. */
  function resolvePosition(name, year) {
    return resolvePerson(name, year).then(function (p) {
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

  /* Same pull as seasonStats(), but it also reports the team the chosen split belongs
   * to, so a caller can persist stats provenance. seasonStats() delegates to it and
   * keeps its original shape for existing callers. */
  function seasonStatsProv(personId, year, group) {
    var map = statMap(group);
    if (!personId || !year || !map) return Promise.resolve({ stats: null, team: null });
    var url = MLB + '/people/' + personId + '/stats?stats=season&group=' + group + '&season=' + year;
    return fetch(url).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (j) {
      var splits = (j && j.stats && j.stats[0] && j.stats[0].splits) || [];
      if (!splits.length) return { stats: null, team: null };
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
      return { stats: Object.keys(out).length ? out : null, team: (split && split.team && split.team.name) || null };
    }).catch(function () { return { stats: null, team: null }; });
  }

  function seasonStats(personId, year, group) {
    return seasonStatsProv(personId, year, group).then(function (r) { return (r && r.stats) || null; });
  }

  /* ---------- post-grant enrichment (pack shop) ---------- */
  /* Deliberately NOT part of the money-safety insert path. The grant row and the
   * card insert land first; this runs afterwards, fire-and-forget. Any failure
   * leaves the rows exactly as inserted and the backfill can pick them up. */
  function enrichRows(client, ids) {
    if (!client || !ids || !ids.length) return Promise.resolve(0);
    return client.from('cards').select('id,player,year,notes').in('id', ids).then(function (sel) {
      if (sel.error || !sel.data) return 0;
      var done = 0;
      return sel.data.reduce(function (chain, row) {
        return chain.then(function () {
          return resolvePosition(row.player, row.year).then(function (pos) {
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
    return resolvePosition(row.player, row.year).then(function (pos) {
      var patch = { pos: pos, type: pos ? typeForPos(pos) : (meta.type || null) };
      var refetch = !!(pos && isPitcherPos(pos) && looksLikeBattingLine(meta.stats));
      var pre = refetch ? resolvePerson(row.player, row.year).then(function (p) {
        if (!p) { console.warn('[depot] backfill: pitching refetch skipped, person unresolved for ' + row.player + ' ' + row.year); return null; }
        return seasonStatsProv(p.id, row.year, 'pitching').then(function (r) {
          if (!r || !r.stats) { console.warn('[depot] backfill: no pitching split for ' + row.player + ' ' + row.year); return null; }
          return { stats: r.stats, personId: p.id, season: row.year, team: r.team };
        });
      }) : Promise.resolve(null);
      return pre.then(function (pit) {
        if (pit) {
          patch.stats = pit.stats;
          /* Provenance travels with every stats write: whose line, which season, which team. */
          patch.statPersonId = pit.personId;
          patch.statSeason = pit.season;
          patch.statTeam = pit.team;
        }
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

  /* ---------- stats re-pull sweep ---------- */

  /* Give a provenance-less stats block its identity back.
   *
   * A line is rewritten only when the pull is trustworthy end to end: the person resolves
   * to an exact accent-folded full-name match, that person's career span covers the card
   * year, and the API actually has a split for that season. Anything short of that is
   * SKIPPED with a reason and the card is left exactly as it was. A guessed line is worse
   * than a blank one -- that is the whole lesson of the Jeter/Thomas incident.
   *
   * Writes go through withMeta(), never a from-scratch meta rebuild, so ratesMeta, the
   * pack receipt in the bio and every other key this sweep does not know about survive.
   */
  function repullOne(client, row, dry, report, allowEmpty) {
    var meta = unpackNotes(row.notes).meta || {};
    var name = cleanName(row.player);
    var line = { card: row.year + ' ' + name, group: '', person: '', team: '', cells: 0, wrote: '', reason: '' };

    function skip(why) {
      line.wrote = 'SKIPPED';
      line.reason = why;
      console.warn(TAG + ' repull SKIP [' + line.card + ']: ' + why);
      report.push(line);
    }

    var nHit = meta.stats ? Object.keys(meta.stats).length : 0;
    var nPit = meta.statsPit ? Object.keys(meta.statsPit).length : 0;
    if (!nHit && !nPit && !allowEmpty) { skip('no stats block to re-pull'); return Promise.resolve(); }
    if (nHit && nPit) { skip('both stats and statsPit populated -- ambiguous, resolve by hand'); return Promise.resolve(); }
    if (meta.statPersonId != null && meta.statSeason != null && (nHit || nPit)) { skip('already carries provenance'); return Promise.resolve(); }
    if (!row.year) { skip('card has no year to pull'); return Promise.resolve(); }

    /* Two-way players are hitter-primary in the depot: a TWP card shows the batting line,
     * so it pulls from the hitting group like any position player. */
    var pos = meta.pos || '';
    var group = (!isTwoWayPos(pos) && (isPitcherPos(pos) || meta.type === 'pitcher')) ? 'pitching' : 'hitting';
    line.group = group;

    return searchPerson(row.player, row.year).then(function (p) {
      if (!p) { skip('no exact person match for ' + name); return; }
      /* searchPerson trusts an exact name match on its own -- identity and provenance are
       * different questions there. On the stats side the span IS the question: a season
       * outside a career cannot have a real line behind it. */
      if (!spanCovers(p, row.year)) {
        skip('span fail: ' + p.fullName + ' (' + String(p.mlbDebutDate || '?').slice(0, 4) + '-' + String(p.lastPlayedDate || '?').slice(0, 4) + ') does not cover ' + row.year);
        return;
      }
      /* A row that has not been position-enriched yet -- every fresh add is in that
     * state -- carries no pos, and pulling a pitcher from the hitting group returns
     * either nothing or a token four-at-bat line. Take the group from the person MLB
     * itself resolved when the card cannot say. */
    if (!pos && p.primaryPosition) {
      var pp = normPos(p.primaryPosition.abbreviation) || normPos(p.primaryPosition.name);
      if (pp && !isTwoWayPos(pp) && isPitcherPos(pp)) { group = 'pitching'; line.group = group; }
    }
    line.person = p.fullName + ' #' + p.id;
      return seasonStatsProv(p.id, row.year, group).then(function (r) {
        var cells = (r && r.stats) ? Object.keys(r.stats).length : 0;
        if (!cells) { skip('no ' + group + ' split for ' + row.year); return; }
        line.cells = cells;
        line.team = r.team || '';
        var notes = withMeta(row.notes, {
          stats: r.stats,
          statPersonId: p.id,
          statSeason: parseInt(row.year, 10),
          statTeam: r.team || null
        });
        if (dry || notes === row.notes) { line.wrote = dry ? 'dry-run' : 'no change'; report.push(line); return; }
        return client.from('cards').update({ notes: notes }).eq('id', row.id).then(function (up) {
          line.wrote = up.error ? ('FAILED: ' + up.error.message) : 'written';
          if (up.error) console.warn(TAG + ' repull write FAILED [' + line.card + ']: ' + up.error.message);
          report.push(line);
        });
      });
    }).catch(function (e) {
      skip('ERROR: ' + String((e && e.message) || e));
    });
  }

  /* Sweep every card that has a stats block but no provenance.
   * opts.dryRun reports without writing; opts.ids limits the sweep to specific card ids. */
  function repull(opts) {
    opts = opts || {};
    var dry = !!opts.dryRun;
    var only = (opts.ids && opts.ids.length) ? opts.ids : null;
    /* includeEmpty widens the sweep from 'stats with no provenance' to 'no stats
     * at all' -- the backfill case for rows the add flow never filled. */
    var empty = !!opts.includeEmpty;
    var client = null;
    try { client = (typeof window.depotSB === 'function') ? window.depotSB() : null; } catch (e) { client = null; }
    if (!client) return Promise.reject(new Error('no supabase client -- sign in first'));
    return client.from('cards').select('id,player,year,notes').then(function (sel) {
      if (sel.error) throw new Error(sel.error.message);
      var rows = (sel.data || []).filter(function (r) {
        if (only && only.indexOf(r.id) < 0) return false;
        var m = unpackNotes(r.notes).meta || {};
        var has = (m.stats && Object.keys(m.stats).length) || (m.statsPit && Object.keys(m.statsPit).length);
        if (!has) return empty;
      return !(m.statPersonId != null && m.statSeason != null);
      });
      rows.sort(function (a, b) { return (a.year || 0) - (b.year || 0); });
      var report = [];
      return rows.reduce(function (chain, row) {
        return chain.then(function () { return repullOne(client, row, dry, report, empty); });
      }, Promise.resolve()).then(function () {
        var wrote = 0, skipped = 0, i;
        for (i = 0; i < report.length; i++) {
          if (report[i].wrote === 'written') wrote++;
          if (report[i].wrote === 'SKIPPED') skipped++;
        }
        console.log(TAG + (dry ? ' REPULL DRY RUN -- ' : ' REPULL -- ') + report.length + ' candidate(s), ' + wrote + ' written, ' + skipped + ' skipped');
        if (console.table) console.table(report); else console.log(report);
        return report;
      });
    });
  }

    /* ---------- post-add / post-grant stats enrichment ---------- */

  /* The safety net for a row that lands with no season line at all.
   *
   * Same contract as enrichRows() above: it runs AFTER the insert, fire and
   * forget, and never sits in front of an add or a grant. Stats drive the sim's
   * probabilities, so a stat-less card is a broken game piece -- but a WRONG
   * line is worse than a blank one, so this reuses repullOne()'s guards
   * unchanged: exact accent-folded name, career span must cover the card year,
   * and the API must actually have a split. Anything short of that is skipped
   * with a reason (a 1993 Jeter card and Bo Jackson's lost 1992 season are
   * genuine no-data rows, not failures).
   *
   * Writes go through withMeta(), so ratesMeta, the pack receipt in the bio and
   * every other key survive, and the provenance triple travels with the line. */
  function enrichStats(client, ids) {
    if (!client) { console.warn(TAG + ' stats enrichment skipped: no supabase client'); return Promise.resolve(0); }
    if (!ids || !ids.length) { console.warn(TAG + ' stats enrichment skipped: no card ids given'); return Promise.resolve(0); }
    return client.from('cards').select('id,player,year,notes').in('id', ids).then(function (sel) {
      if (sel.error) { console.warn(TAG + ' stats enrichment read failed: ' + sel.error.message); return 0; }
      var rows = (sel.data || []).filter(function (r) {
        var m = unpackNotes(r.notes).meta || {};
        var has = (m.stats && Object.keys(m.stats).length) || (m.statsPit && Object.keys(m.statsPit).length);
        return !has;
      });
      if (!rows.length) { console.debug(TAG + ' stats enrichment: none of the ' + ids.length + ' row(s) landed stat-less'); return 0; }
      var report = [];
      return rows.reduce(function (chain, row) {
        return chain.then(function () { return repullOne(client, row, false, report, true); });
      }, Promise.resolve()).then(function () {
        var wrote = 0, i;
        for (i = 0; i < report.length; i++) { if (report[i].wrote === 'written') wrote++; }
        console.log(TAG + ' stats enrichment: filled ' + wrote + ' of ' + rows.length + ' stat-less row(s)');
        return wrote;
      });
    }).catch(function (e) { console.warn(TAG + ' stats enrichment threw: ' + ((e && e.message) || e)); return 0; });
  }

  /* ---------- exports ---------- */
  window.depotNormalizePos = normPos;
  window.depotPosIsPitcher = isPitcherPos;
  window.depotPosIsTwoWay = isTwoWayPos;
  window.depotTypeForPos = typeForPos;
  window.depotResolvePosition = resolvePosition;
  window.depotResolvePerson = resolvePerson;
  window.depotSeasonStats = seasonStats;
  window.depotSeasonStatsProv = seasonStatsProv;
  window.depotNotesWithMeta = withMeta;
  window.depotNotesUnpack = unpackNotes;
  window.depotCleanName = cleanName;
  window.depotNormName = normName;
  window.depotEnrichPositions = enrichRows;
  window.depotBackfillPositions = backfill;
  window.depotRepullStats = repull;
  window.depotEnrichStats = enrichStats;
  console.debug(TAG + ' ready');
})();

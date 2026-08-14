/* js/depot-playability.js — GATE 2: is this card a card of ONE PLAYER?
 *
 * Nick's rule (docs/PULL_POLICY.md 1.3, DECIDED 2026-08-12): only cards of a
 * single player belong in a pack. Two-player cards, team cards, checklists and
 * manager cards do not work with the game, so they do not come out of packs.
 *
 * WHY THIS FILE EXISTS AT ALL. The rule has been decided policy since
 * 2026-08-12 and had ZERO lines of implementation anywhere in the tree.
 * PULL_POLICY 1.3.3 says so in as many words -- "What does not exist is
 * anywhere to store the answer" -- and flags compute-at-roll-time vs
 * materialise-into-a-column as an open implementation question. This is the
 * compute-at-roll-time half, and it is deliberately ONE definition in ONE file
 * so that the eventual is_playable column has something to be checked against
 * rather than a second opinion to disagree with. ONBOARDING_PATH_SPEC section 4
 * is emphatic about that and it is right: a duplicated gate is a gate that
 * drifts.
 *
 * WHAT USES IT TODAY: the starter box roll, and nothing else. Wiring it into
 * DepotShop.loadCatalog() would make it pool-level as PULL_POLICY intends, but
 * that NARROWS the catalog the paid packs roll from, and rollPack is
 * deterministic in (seed, catalog, tier) -- so every historical seed would
 * reproduce differently. That is a non-additive change to a live money path and
 * AGENTS.md section 2 requires human sign-off for it. One line, whenever it is
 * given.
 *
 * STRUCTURAL, NOT STRICT (PULL_POLICY 1.3.2). The question is what KIND of card
 * this is -- not whether the player on it resolves to a position in
 * data/player_positions.json. A single-player card with no position entry stays
 * playable: that is a gap in our data, not a property of the card. 4,382 rows
 * (5.19% of the art-backed pool) are exactly that case and they stay in.
 *
 * THE PARSE TRAP, and it is not hypothetical. A catalog player string describes
 * a CARD FRONT, not a person, and the errata prose after a colon is full of
 * slashes and capitals:
 *     "Doyle Alexander UERUER: Born 9/5, should be 9/4"   <- ONE player
 *     "Phil Niekro / Joe Niekro RB"                       <- two players
 * A naive indexOf('/') calls the first one multi-player and drops a perfectly
 * good card. So every test here runs on the HEAD -- the substring before the
 * first colon or pipe -- which is the same slice window.depotCleanName uses.
 *
 * KNOWN RESIDUAL, recorded rather than papered over (PULL_POLICY 1.3.2): the
 * MGR code UNDERCOUNTS managers. "Tony La Russa" and "Jim Frey" sit in the pool
 * as ordinary single-player strings with no code at all, so some managers will
 * be pullable. 471 manager-only rows is a FLOOR, not a count. Anyone tightening
 * this should tighten the DETECTION and leave the RULE alone.
 *
 * EXPOSES
 *   window.depotIsPlayable(card|string) -> boolean
 *   window.depotPlayableReason(card)    -> null when playable, else a reason tag
 *   window.DepotPlayability.filter(rows)-> rows, playable only, + .stats()
 */
(function () {
  'use strict';

  var TAG = '[depot][playability]';
  function log() { try { (window.depotLog || function () {}).apply(null, [TAG].concat([].slice.call(arguments))); } catch (e) {} }

  /* Non-player SUBJECTS, by the words the card front prints. PULL_POLICY 1.3.1's
   * measured predicate. Word-bounded so "Leadersville" cannot match. */
  var SUBJECT_RE = /\b(checklist|team\s+card|leaders?|highlights?|all[- ]star\s+team|world\s+series)\b/i;

  /* Hobby subset codes that mark a non-player card, matched as STANDALONE
   * UPPERCASE tokens only. Substring matching here would eat CLemens and LLoyd.
   *   TC  team card      CL  checklist      LL  league leaders     MGR manager
   * NOT in this list on purpose: SP. In this hobby SP is SHORT PRINT (373 in the
   * catalog) and has nothing to do with starting pitchers. */
  var CODE = { TC: 1, CL: 1, LL: 1, MGR: 1 };

  function rawOf(card) {
    if (card == null) return '';
    if (typeof card === 'string') return card;
    return String(card.player != null ? card.player : (card.name != null ? card.name : ''));
  }

  /* The name region: everything before the first colon or pipe. Mirrors
   * depotCleanName's own slice so the two can never disagree about where the
   * person's name stops and the card's errata starts. */
  function headOf(raw) {
    var i = raw.search(/[:|]/);
    return (i < 0 ? raw : raw.slice(0, i)).trim();
  }

  /* Returns null when the card is playable, otherwise WHY it is not. The reason
   * is returned rather than a bare false so a caller can log what it dropped --
   * a filter that removes 5% of a pool silently is a filter nobody can audit. */
  function reasonFor(card) {
    var raw = rawOf(card).trim();
    if (!raw) return 'blank';

    var head = headOf(raw);
    if (!head) return 'blank';

    /* Multi-player: a slash INSIDE THE NAME REGION. */
    if (head.indexOf('/') >= 0) return 'multi-player';

    /* Non-player subject, by printed words. Tested on the head so that errata
     * prose mentioning "highlights" does not condemn a real player's card --
     * "Career Highlights on back" is a real string in this catalog. */
    if (SUBJECT_RE.test(head)) return 'non-player-subject';

    /* Hobby codes, standalone uppercase tokens in the head. */
    var toks = head.split(/[^A-Za-z0-9']+/);
    for (var i = 0; i < toks.length; i++) {
      if (CODE[toks[i]] === 1) return 'code:' + toks[i];
    }

    /* A head that carries no lower-case letter at all is not a person's name --
     * it is a code, an all-caps subject line, or a fragment ("VAR", "AS RECORD
     * BREAKER"). Cheap, and it catches the blank-ish class 1.3.1 counted at 31. */
    if (!/[a-z]/.test(head)) return 'no-name-tokens';

    return null;
  }

  function isPlayable(card) { return reasonFor(card) === null; }

  var _stats = null;

  function filter(rows) {
    if (!rows || !rows.length) {
      console.warn(TAG + ' filter called with an empty list; returning it unchanged');
      return rows || [];
    }
    var out = [], reasons = {}, i, r;
    for (i = 0; i < rows.length; i++) {
      r = reasonFor(rows[i]);
      if (r === null) { out.push(rows[i]); continue; }
      reasons[r] = (reasons[r] || 0) + 1;
    }
    _stats = { input: rows.length, kept: out.length, dropped: rows.length - out.length, reasons: reasons };
    log('gate 2: kept ' + out.length + '/' + rows.length + ' (' +
        (out.length / rows.length * 100).toFixed(2) + '%), dropped ' + _stats.dropped, reasons);
    /* Unlike the art gate, this one does NOT fail open on an empty result: an
     * empty playable pool means the predicate is broken, and shipping the
     * unfiltered catalog would put team cards in somebody's starter box. The
     * caller decides what to do with an empty list; it is not silently undone. */
    if (!out.length) console.error(TAG + ' gate 2 emptied the pool -- the predicate is wrong. NOT failing open.');
    return out;
  }

  window.depotIsPlayable = isPlayable;
  window.depotPlayableReason = reasonFor;
  window.DepotPlayability = { isPlayable: isPlayable, reasonFor: reasonFor, filter: filter, stats: function () { return _stats; } };
  log('loaded (structural gate, one definition)');
})();

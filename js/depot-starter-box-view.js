/* js/depot-starter-box-view.js — chapter 02b, the ceremony.
 *
 * The box, the five waves, the tray, and the pointer at the free pack.
 * js/depot-starter-box.js owns the roll and the grant; this file owns the
 * moment. It writes nothing to the database and calls no RPC of its own.
 *
 * WHY THE CEREMONY IS NOT 25 REVEALS. design/STARTER_BOX.md 6 and chapter 02b
 * both refuse it in the same words: the five-card rip pacing does not stretch
 * to 25, and clicking twenty-five flips before you can reach the lineup builder
 * "is not five times as good; it is a hostage situation." Five beats, not
 * twenty-five. A wave lands as ONE beat — the cards inside it pop 0.12s apart,
 * the same rd-cardpop the rip uses — and then you advance.
 *
 *   1 INFIELD   C 1B 2B 3B SS      5   ->  5
 *   2 OUTFIELD  LF CF RF DH        4   ->  9
 *   3 ROTATION                     5   -> 14   <- chapter 02b's drawn counter
 *   4 BULLPEN                      5   -> 19
 *   5 THE BENCH & YOUR HIT       5+1   -> 25   <- the hit is revealed last
 *
 * THE BENCH HAS NO WAVE IN THE DESIGN, and that is the design's arithmetic, not
 * a liberty taken here. Chapter 02b's five-dot rail reads Infield · Outfield ·
 * Rotation · Bullpen · The hit; its wave-3 counter reads 14/25, which pins the
 * first three waves at 5/4/5. Five bench cards have to ride in wave 4 or wave
 * 5. They ride in 5, with the hit still revealed last so the sequence keeps its
 * peak, and the wave is labelled for what it actually contains.
 *
 * SKIPPABLE AT ANY POINT, always — "Skip to the tray" is on every wave and on
 * the box itself, and the tray is also where the sequence ends naturally. There
 * is no path where the player cannot reach the builder in one click.
 *
 * EVERY NAME GOES THROUGH depotCleanName (spec section 5). Twenty-five cards is
 * twenty-five chances to print a sentence of hobby errata at the exact moment a
 * stranger is deciding whether this is a real product — the free pull's reveal
 * printed "Yonathan Daza SP, VARVAR: Running" across two lines on a card face,
 * and that is the whole reason this requirement is written down. The guard is
 * the house style: cleaner if present, trim() if not, and the cleaner is not
 * assumed to always succeed (5.1's still-open caveat).
 *
 * THE ONE localStorage FLAG IN HERE, AND WHY IT IS NOT THE BANNED ONE.
 * "Has this player SEEN their box?" is a different question from "has this
 * player CLAIMED their box?" (spec 2.1, note 1) and the spec says not to
 * overload the grant row with both. CLAIMED is answered by the server and only
 * by the server — no flag, ever; that is the read-then-write pattern AGENTS.md
 * 4 bans and it is how a bronze pack got granted twice. SEEN only decides
 * whether an animation replays. Losing it replays a ceremony, which is harmless
 * and arguably nice. It is scoped BY UID on purpose: unscoped client state has
 * already leaked one account's pack history to the next user of the same
 * browser, and a second instance of that bug would be a pattern, not a quirk.
 *
 * ENDS POINTED AT THE FREE PACK. The tray's closing panel is the next thing to
 * do, not a dead end.
 */
(function () {
  'use strict';

  var TAG = '[depot][starter-view]';
  var SEEN = 'depot_starter_seen:';         /* + uid. NEVER the claim gate. */

  function log()  { try { (window.depotLog || function () {}).apply(null, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* The display invariant. Never assume the cleaner succeeded — it falls back to
   * the raw string by design, so a future malformation reaches the face. */
  function cleanNm(v) {
    var fn = (typeof window.depotCleanName === 'function') ? window.depotCleanName : null;
    var out = fn ? fn(v) : '';
    out = String(out == null ? '' : out).trim();
    if (!out) out = String(v == null ? '' : v).trim();
    return out || 'Unknown';
  }
  function reduced() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches); }
    catch (e) { return false; }
  }
  function seenKey(uid) { return SEEN + (uid || 'anon'); }
  function markSeen(uid) { try { localStorage.setItem(seenKey(uid), '1'); } catch (e) { log('could not persist the seen flag; the ceremony will replay next load'); } }
  function hasSeen(uid) { try { return !!localStorage.getItem(seenKey(uid)); } catch (e) { return false; } }

  /* ---------------------------------------------------------------- *
   * card tile
   * ---------------------------------------------------------------- */
  function artFor(card) {
    try {
      if (typeof window.depotLibraryArtURL === 'function') return window.depotLibraryArtURL(card, 'front');
    } catch (e) { /* placeholder path below */ }
    return null;
  }
  function bandOf(card) {
    try {
      var P = window.DepotPrestige;
      if (!P || !P.compute) return null;
      var shaped = (window.DepotShop && window.DepotShop.cardToShape) ? window.DepotShop.cardToShape(card, card.year) : card;
      var r = P.compute(shaped);
      return (r && r.band) || null;
    } catch (e) { return null; }
  }

  function tileHTML(card, i, opts) {
    opts = opts || {};
    var nm = cleanNm(card.player || card.name);
    var url = artFor(card);
    var delay = reduced() ? 0 : (i * 0.12);
    var slot = opts.slot || card._slot || '';
    var band = opts.hit ? (bandOf(card) || 'bronze') : null;
    /* Rule 4: missing art is a DESIGNED placeholder (band + year + name), never
     * a broken-image state. The well already carries the scan hatching; onerror
     * simply removes the img and leaves the designed state showing. */
    var well = url
      ? '<img src="' + esc(url) + '" alt="' + esc(nm) + '" loading="lazy" onerror="this.remove()">'
      : '<span class="rd-sb__micro">scan</span>';
    return '<div class="rd-sb__card' + (opts.hit ? ' rd-sb__card--hit' : '') + '" style="animation-delay:' + delay.toFixed(2) + 's">' +
      (opts.hit && !reduced() ? '<span class="rd-sb__burst"></span>' : '') +
      (band ? '<span class="rd-sb__band">' + esc(band.toUpperCase()) + '</span>' : '') +
      '<div class="rd-sb__well">' + well + '</div>' +
      '<div class="rd-sb__nm">' + esc(nm) + '</div>' +
      '<div class="rd-sb__yr">' + esc(card.year || '') + '</div>' +
      (slot ? '<span class="rd-sb__pos">' + esc(slot) + '</span>' : '') +
      '</div>';
  }
  function gridHTML(cards, opts) {
    opts = opts || {};
    var h = '', i;
    for (i = 0; i < cards.length; i++) {
      h += tileHTML(cards[i], i, { slot: opts.slots ? opts.slots[i] : null, hit: opts.hit && i === cards.length - 1 });
    }
    return '<div class="rd-sb__grid">' + h + '</div>';
  }

  /* ---------------------------------------------------------------- *
   * the overlay
   * ---------------------------------------------------------------- */
  var _root = null, _uid = null, _groups = null, _wave = 0;

  var WAVES = [
    { key: 'infield',  label: 'Infield',   title: 'The infield 🧤' },
    { key: 'outfield', label: 'Outfield',  title: 'The outfield 🌾' },
    { key: 'rotation', label: 'Rotation',  title: 'The rotation ⚾' },
    { key: 'bullpen',  label: 'Bullpen',   title: 'The bullpen 🔥' },
    { key: 'last',     label: 'The hit',   title: 'The bench — and your hit ✦' }
  ];

  function mount() {
    if (_root) return _root;
    _root = document.createElement('div');
    _root.className = 'rd-sb';
    _root.setAttribute('role', 'dialog');
    _root.setAttribute('aria-label', 'Your Starter Box');
    document.body.appendChild(_root);
    return _root;
  }
  function unmount() { if (_root && _root.parentNode) _root.parentNode.removeChild(_root); _root = null; }
  function paint(html) { mount().innerHTML = '<div class="rd-sb__stage">' + html + '</div>'; }
  function on(sel, fn) {
    var el = _root && _root.querySelector(sel);
    if (!el) { warn('control ' + sel + ' not found; that step is unreachable'); return; }
    el.addEventListener('click', fn);
  }

  function railHTML(now) {
    var h = '', i;
    for (i = 0; i < WAVES.length; i++) {
      h += '<span class="rd-sb__dot ' + (i < now ? 'is-done' : (i === now ? 'is-now' : '')) + '">' +
           '<i></i><span>' + esc(WAVES[i].label) + '</span></span>';
    }
    return '<div class="rd-sb__rail">' + h + '</div>';
  }

  /* ---- 1. the closed box ---- */
  function showBox() {
    paint(
      '<div class="rd-sb__panel">' +
        '<h2 class="rd-sb__h">Your club is waiting 📦</h2>' +
        '<p class="rd-sb__sub">Twenty-five cards &mdash; a fieldable nine, a rotation, a bullpen and a bench.</p>' +
        '<div class="rd-sb__box">' +
          '<div class="rd-sb__boxmark">THE DEPOT</div>' +
          '<div class="rd-sb__boxname">STARTER<br>BOX</div>' +
          '<div class="rd-sb__boxcount">25 CARDS</div>' +
          '<div class="rd-sb__seal">⚾</div>' +
        '</div>' +
        '<div class="rd-sb__shape">' +
          '<span class="rd-sb__shapechip">9 FIELDERS</span>' +
          '<span class="rd-sb__shapechip">5 STARTERS</span>' +
          '<span class="rd-sb__shapechip">5 RELIEVERS</span>' +
          '<span class="rd-sb__shapechip">5 BENCH</span>' +
          '<span class="rd-sb__shapechip">1 GUARANTEED HIT</span>' +
        '</div>' +
        '<div class="rd-sb__acts">' +
          '<button class="rd-btn rd-btn--gold rd-btn--lg" type="button" data-sb-open>Open the box ✂</button>' +
        '</div>' +
        '<p class="rd-sb__sub" style="margin:12px 0 0"><span class="rd-sb__micro">One time only · every card is library art and born verified</span></p>' +
      '</div>'
    );
    on('[data-sb-open]', function (e) {
      var b = e.currentTarget;
      b.disabled = true; b.textContent = 'Opening…';
      open();
    });
  }

  /* ---- the fail-closed state. A DELAY, not a breakage (spec 4.1) ---- */
  function showNotReady(msg) {
    paint(
      '<div class="rd-sb__panel rd-sb__wait">' +
        '<h2 class="rd-sb__h">Your Starter Box is not ready yet</h2>' +
        '<p class="rd-sb__sub">The card library is still coming up. Nothing has been claimed and nothing has been used &mdash; ' +
          'your box is still yours, and it will open as soon as the library answers. Try again in a moment.</p>' +
        '<div class="rd-sb__seal">⏳</div>' +
        '<div class="rd-sb__acts">' +
          '<button class="rd-btn rd-btn--gold" type="button" data-sb-retry>Try again</button>' +
        '</div>' +
        '<p class="rd-sb__sub" style="margin-top:12px"><span class="rd-sb__micro">' + esc(msg || '') + '</span></p>' +
      '</div>'
    );
    on('[data-sb-retry]', function () { showBox(); });
  }

  /* ---- 2. claim, then the waves ---- */
  function open() {
    if (!window.DepotStarterBox) { warn('DepotStarterBox missing; cannot open'); showNotReady('the roller module did not load'); return; }
    window.DepotStarterBox.claim().then(function (res) {
      if (!res || !res.cards || !res.cards.length) {
        warn('claim returned no cards to show');
        showNotReady('the box was claimed but its cards could not be read back');
        return;
      }
      _groups = res.groups || groupsFromRows(res.cards);
      _wave = 0;
      showWave();
    }).catch(function (e) {
      /* Fail loud, and say which half failed. Nothing was claimed on this path:
       * the roll refuses BEFORE the RPC when a gate is not satisfied. */
      console.error(TAG + ' claim failed: ' + (e && (e.message || e)));
      showNotReady((e && e.message) ? String(e.message).slice(0, 180) : 'unknown error');
    });
  }

  /* Resume path: the ledger hands back card ROWS, not catalog rows, and in the
   * order they were granted — which is the order they were rolled. Regroup by
   * that order rather than re-deriving positions, and never by re-rolling. */
  function groupsFromRows(rows) {
    var slots = window.DepotStarterBox ? window.DepotStarterBox.FIELD_SLOTS : ['C','1B','2B','3B','SS','LF','CF','RF','DH'];
    var i;
    for (i = 0; i < 9 && i < rows.length; i++) { rows[i]._slot = slots[i]; }
    return {
      infield:  rows.slice(0, 5),
      outfield: rows.slice(5, 9),
      rotation: rows.slice(9, 14),
      bullpen:  rows.slice(14, 19),
      bench:    rows.slice(19, 24),
      hit:      rows[24] || null
    };
  }

  function waveCards(i) {
    var g = _groups;
    if (i === 0) return g.infield || [];
    if (i === 1) return g.outfield || [];
    if (i === 2) return g.rotation || [];
    if (i === 3) return g.bullpen || [];
    return (g.bench || []).concat(g.hit ? [g.hit] : []);
  }
  function shownThrough(i) {
    var n = 0; for (var k = 0; k <= i; k++) n += waveCards(k).length; return n;
  }

  function showWave() {
    var w = WAVES[_wave], cards = waveCards(_wave), last = (_wave === WAVES.length - 1);
    var slots = cards.map(function (c) { return c._slot || null; });
    paint(
      '<div class="rd-sb__panel">' +
        railHTML(_wave) +
        '<div class="rd-sb__wavehead">' +
          '<div><span class="rd-sb__micro">WAVE ' + (_wave + 1) + ' OF ' + WAVES.length + '</span>' +
            '<h2 class="rd-sb__h" style="text-align:left;margin:4px 0 0">' + esc(w.title) + '</h2></div>' +
          '<div class="rd-sb__count">' + shownThrough(_wave) + ' / 25</div>' +
        '</div>' +
        gridHTML(cards, { slots: slots, hit: last }) +
        '<div class="rd-sb__acts">' +
          (last
            ? '<button class="rd-btn rd-btn--gold rd-btn--lg" type="button" data-sb-tray>See the full tray ✦</button>'
            : '<button class="rd-btn rd-btn--gold" type="button" data-sb-next>Next wave &mdash; ' + esc(WAVES[_wave + 1].label.toLowerCase()) + ' →</button>') +
          '<button class="rd-sb__skip" type="button" data-sb-skip>Skip to the tray ⏭</button>' +
        '</div>' +
      '</div>'
    );
    if (!last) on('[data-sb-next]', function () { _wave++; showWave(); });
    else on('[data-sb-tray]', function () { showTray(); });
    on('[data-sb-skip]', function () { showTray(); });
  }

  /* ---- 3. the tray, and the pointer at the free pack ---- */
  function showTray() {
    var g = _groups || {};
    var nine = (g.infield || []).concat(g.outfield || []);
    function group(title, sub, cards, opts) {
      if (!cards || !cards.length) return '';
      return '<div class="rd-sb__group"><div class="rd-sb__grouph"><b>' + esc(title) + '</b>' +
             '<span class="rd-sb__micro">' + esc(sub) + '</span></div>' +
             gridHTML(cards, opts || {}) + '</div>';
    }
    paint(
      '<div class="rd-sb__panel">' +
        '<h2 class="rd-sb__h">Your club is ready ✦</h2>' +
        '<p class="rd-sb__sub">25 cards · roster-shaped · all born verified</p>' +
        '<div class="rd-sb__tray">' +
          group('THE NINE', '9 fielders', nine, { slots: nine.map(function (c) { return c._slot || null; }) }) +
          group('ROTATION', '5 starters', g.rotation) +
          group('BULLPEN', '5 relievers', g.bullpen) +
          group('BENCH', '5 + your hit', (g.bench || []).concat(g.hit ? [g.hit] : []), { hit: true }) +
        '</div>' +
        '<div class="rd-sb__next">' +
          '<b>One more thing — your free pack is waiting.</b>' +
          '<span class="rd-sb__micro">A free pack every day, on the house. Rip it whenever you like.</span>' +
        '</div>' +
        '<div class="rd-sb__acts">' +
          '<a class="rd-btn rd-btn--gold rd-btn--lg" href="game/builder.html">Set my lineup ⚾</a>' +
          '<a class="rd-btn rd-btn--primary" href="game/shop.html">Rip my free pack ✂</a>' +
          '<button class="rd-btn rd-btn--quiet" type="button" data-sb-done>Take me to the binder</button>' +
        '</div>' +
      '</div>'
    );
    markSeen(_uid);
    on('[data-sb-done]', function () {
      unmount();
      /* The binder's first load is 25 real cards. Reload so it reads them
       * rather than re-deriving a view that was painted before the grant. */
      try { location.reload(); } catch (e) { warn('reload blocked; the binder may show a stale count'); }
    });
  }

  /* ---------------------------------------------------------------- *
   * boot
   * ---------------------------------------------------------------- */
  var _decided = false;
  function decide() {
    /* Two callers on purpose (see boot): the hook settling, and a timed belt for
     * the already-onboarded case where the hook has nothing to announce. Only
     * the first one may paint — a second pass would rebuild the overlay under a
     * player who is already mid-wave. */
    if (_decided) { log('decide() already ran; ignoring the second caller'); return; }
    _decided = true;
    if (!window.DepotStarterBox) { log('roller not present on this page; nothing to do'); return; }
    window.DepotStarterBox.status().then(function (st) {
      _uid = st && st.uid;
      if (st.claimed === false) { log('unclaimed -> showing the box'); showBox(); return; }
      if (st.claimed === true) {
        if (hasSeen(_uid)) { log('claimed and already seen -> the ceremony stays out of the way'); return; }
        /* Claimed but never finished: resume from the ledger, NEVER a re-roll. */
        log('claimed but unseen -> resuming the ceremony from the ledger');
        window.DepotStarterBox.resume().then(function (r) {
          if (!r || !r.cards || !r.cards.length) {
            warn('resume found no cards; not showing a ceremony over nothing');
            return;
          }
          _groups = groupsFromRows(r.cards); _wave = 0; showWave();
        }).catch(function (e) { warn('resume failed: ' + (e && (e.message || e))); });
        return;
      }
      log('claim state unknown (' + (st && st.reason) + '); showing nothing rather than guessing');
    }).catch(function (e) { warn('status check threw: ' + (e && (e.message || e))); });
  }

  function boot() {
    /* Driven by the session hook, so the ceremony can never run before
     * depot_ensure_onboarding has had its chance — the RPC raises P0001 with a
     * message naming that dependency if the collection is missing. */
    if (window.DepotSession && typeof window.DepotSession.ready === 'function') {
      window.DepotSession.ready(function () { decide(); });
      /* And a belt for the already-onboarded case, where the hook settles with
       * created_* false and nothing else would fire. */
      setTimeout(decide, 2500);
      return;
    }
    warn('DepotSession missing; falling back to a plain user check');
    setTimeout(decide, 1500);
  }

  window.DepotStarterBoxView = { showBox: showBox, showTray: showTray, decide: decide, unmount: unmount };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  log('loaded');
})();

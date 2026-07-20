/* js/depot-library-art.js
 * Shared Card-Image Library — client-side art resolver (Slice B consumption).
 *
 * Three-tier resolution, per card, per side:
 *   1) personal   — the owner's own scan (existing signed-URL machinery: card.photoFront / card.photoBack)
 *   2) library    — the public card-library bucket, keyed on catalog identity (year/set/number)
 *   3) placeholder — the existing pixel-art fallback (this module returns null; caller keeps its placeholder)
 *
 * Path convention (VERIFIED against the live public bucket, 2026-07):
 *   {year}/{brand}/{setSlug}/{number}_{side}.jpg   with brand == setSlug (lowercased),
 *   number = leading-zeros-stripped, letter suffix KEPT  (5 not 005; 1b not 001b).
 * Library reads are PLAIN PUBLIC URLs (browser-cacheable) — never signed URLs.
 *
 * Surfaces render card art as CSS background-image (binder tiles, spotlight front) or as an
 * <img> (spotlight back), so fall-through cannot rely on a single <img onerror>. Instead we
 * PROBE the candidate library URL with a throwaway Image(): on load we swap; on error we leave
 * the existing placeholder (no broken-image icon, one debug log). Lazy/per-render; no prefetch.
 *
 * Cards whose {year}/{set}/{number} derive to a 404 stay on placeholder — correct while
 * ingestion is mid-flight; they self-heal as sets land (no code change on new sets).
 *
 * COLLECTION is closure-scoped in index.html, so the page passes it (or the card) into the
 * enhancers explicitly; we also fall back to window.COLLECTION if present.
 */
(function () {
  'use strict';

  var BUCKET = 'card-library';

  function supaUrl() {
    try { if (window.DEPOT_SUPABASE_CONFIG && window.DEPOT_SUPABASE_CONFIG.url) return window.DEPOT_SUPABASE_CONFIG.url; } catch (e) {}
    try { if (typeof SUPABASE_URL === 'string' && SUPABASE_URL) return SUPABASE_URL; } catch (e) {}
    try { if (window.SUPABASE_URL) return window.SUPABASE_URL; } catch (e) {}
    return null;
  }

  // brand == setSlug: trim, lowercase, spaces -> '-', drop chars outside [a-z0-9-].
  function slug(s) {
    if (s == null) return '';
    return String(s).trim().toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '')
      .replace(/\-+/g, '-')
      .replace(/^\-|\-$/g, '');
  }

  // number: strip leading zeros, KEEP trailing letter suffix; keep combo hyphens ("1-2").
  function normNum(n) {
    if (n == null) return '';
    var s = String(n).trim().toLowerCase().replace(/\s+/g, '');
    var m = s.match(/^0*([0-9]+)([a-z].*)?$/);
    if (m) return m[1] + (m[2] || '');
    if (/^[0-9\-]+$/.test(s)) {
      return s.split('-').map(function (p) { return p.replace(/^0+(?=\d)/, ''); }).join('-');
    }
    return s;
  }

  function yearOf(card) {
    var y = card && (card.yr != null ? card.yr : card.year);
    if (y == null) return '';
    var m = String(y).trim().match(/(\d{4})/);
    return m ? m[1] : '';
  }

  // Catalog identity. Uses the SET field (NOT the polluted brand column: cardToRow packs
  // brand := c.set, so brand is unreliable). brand == setSlug by design.
  function catalogParts(card) {
    if (!card) return null;
    var year = yearOf(card);
    var setV = card.set != null ? card.set : card.brand;
    var setSlug = slug(setV);
    var num = normNum(card.num != null ? card.num : card.number);
    if (!year || !setSlug || !num) return null;
    return { year: year, brand: setSlug, setSlug: setSlug, num: num };
  }

  function libraryURL(card, side) {
    var base = supaUrl();
    if (!base) { console.debug('[depot] library: no supabase url; skip'); return null; }
    var p = catalogParts(card);
    if (!p) return null;
    var s = (side === 'back') ? 'back' : 'front';
    return base.replace(/\/+$/, '') + '/storage/v1/object/public/' + BUCKET +
           '/' + p.year + '/' + p.brand + '/' + p.setSlug + '/' + p.num + '_' + s + '.jpg';
  }

  function personalURL(card, side) {
    if (!card) return null;
    if (side === 'back') return card.photoBack || null;
    return card.photoFront || card.photo || null;
  }

  // { tier: 'personal'|'library'|'placeholder', url, key }. 'library' url is a CANDIDATE
  // confirmed lazily by the enhancer's Image() probe. Fail-loud per AGENTS.md 4.
  function depotResolveCardArt(card, side) {
    side = (side === 'back') ? 'back' : 'front';
    var p = catalogParts(card);
    var key = p ? (p.year + '|' + p.brand + '|' + p.setSlug + '|' + p.num) : null;
    var personal = personalURL(card, side);
    if (personal) return { tier: 'personal', url: personal, key: key };
    var lib = libraryURL(card, side);
    if (lib) { console.debug('[depot] library-try ' + key + ' (' + side + ')'); return { tier: 'library', url: lib, key: key }; }
    console.debug('[depot] placeholder ' + (key || '(no-key)') + ' (' + side + ')');
    return { tier: 'placeholder', url: null, key: key };
  }

  var _probeCache = {};

  // ---- Rendering helpers -------------------------------------------------
  // A background-image value counts as 'empty' when it is absent, 'none', or url("").
  function bgIsEmpty(el) {
    if (!el) return true;
    var v = '';
    try { v = getComputedStyle(el).backgroundImage; } catch (e) { v = ''; }
    return !v || v === 'none' || v === 'url("")' || v === "url('')";
  }

  // Apply a library background to the app's real photo layer as a clean card scan.
  function applyBg(el, url) {
    if (!el) return;
    el.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")';
    el.style.backgroundSize = 'cover';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';    var _tile = el.closest ? el.closest('.dc-tile') : null;    if (_tile) { _tile.classList.add('has-art'); }
  }

  // Locate the app's ACTUAL photo layer inside a binder tile: the absolutely-
  // positioned inset:0 overlay the tile leaves empty when there is no personal
  // photo. Returns that layer ONLY when it is genuinely empty (personal wins).
  function emptyPhotoLayer(root) {
    if (!root) return null;
    var cands = root.querySelectorAll('div, section, figure');
    var fallback = null;
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      var covers = cs.position === 'absolute' && cs.top === '0px' && cs.left === '0px' && cs.right === '0px' && cs.bottom === '0px';
      if (covers) {
        if (bgIsEmpty(el)) return el;   // empty overlay -> safe to fill
        return null;                    // overlay already painted (personal) -> never overwrite
      }
      if (!fallback && bgIsEmpty(el)) fallback = el;
    }
    return fallback;
  }

  // Swap a background image only after confirming the candidate loads.
  function probeAndSwap(el, url, key) {
    if (!el || !url) return;
    if (_probeCache[url] === 'fail') return;
    if (_probeCache[url] === 'ok') { applyBg(el, url); return; }
    var img = new Image();
    img.onload = function () { _probeCache[url] = 'ok'; applyBg(el, url); console.debug('[depot] library-hit', key); };
    img.onerror = function () { _probeCache[url] = 'fail'; console.debug('[depot] library-miss', key); };
    img.src = url;
  }

  // Swap an <img> src only after confirming the candidate loads; leaves onerror chain intact.
  function probeImg(imgEl, url, key) {
    if (!imgEl || !url) return;
    if (_probeCache[url] === 'fail') return;
    if (_probeCache[url] === 'ok') { imgEl.src = url; return; }
    var t = new Image();
    t.onload = function () { _probeCache[url] = 'ok'; imgEl.src = url; console.debug('[depot] library-hit', key); };
    t.onerror = function () { _probeCache[url] = 'fail'; console.debug('[depot] library-miss', key); };
    t.src = url;
  }

  // Enhance binder tiles (.dc-tile[data-idx]) within root, reading col[idx].
  // DOM-truth guard: fill library art ONLY when the tile's photo layer is
  // genuinely empty. A painted personal photo is never overwritten.
  function enhanceTiles(root, col) {
    root = root || document;
    col = col || window.COLLECTION;
    if (!Array.isArray(col)) { console.debug('[depot] library: no collection, skip tiles'); return; }
    var tiles = root.querySelectorAll('.dc-tile[data-idx]');
    for (var i = 0; i < tiles.length; i++) {
      var tile = tiles[i];
      var idx = parseInt(tile.getAttribute('data-idx'), 10);
      if (isNaN(idx)) continue;
      var card = col[idx];
      if (!card) continue;
      var url = libraryURL(card, 'front');
      if (!url) continue;                       // card has no derivable library path
      var panel = emptyPhotoLayer(tile);
      if (!panel) continue;                     // personal photo painting -> personal wins
      if (tile.getAttribute('data-lib-front') === url) continue; // idempotent
      tile.setAttribute('data-lib-front', url);
      probeAndSwap(panel, url, (card && card.name) || idx);
    }
  }

  // Enhance the open spotlight for one card. openSpot injects into #spotFront /
  // #spotBack. Front photo is an <img class="photo"> (or a .photo bg); back is an
  // <img> inside .spot-back-img. Fill library art ONLY when the target is empty
  // or failed to load, so personal front/back always wins.
  function imgIsEmpty(im) {
    return !im || !im.getAttribute('src') || (im.complete && im.naturalWidth === 0);
  }
  function enhanceSpotlight(card) {
    if (!card) return;
    var frontURL = libraryURL(card, 'front');
    if (frontURL) {
      var fr = document.getElementById('spotFront');
      if (fr) {
        var frontImg = fr.querySelector('img.photo, img');
        if (frontImg) {
          if (imgIsEmpty(frontImg)) probeImg(frontImg, frontURL, ((card.name || '') + ' front'));
        } else {
          var frontPanel = fr.querySelector('.photo') || fr;
          if (bgIsEmpty(frontPanel)) probeAndSwap(frontPanel, frontURL, ((card.name || '') + ' front'));
        }
      }
    }
    var backURL = libraryURL(card, 'back');
    if (backURL) {
      var bk = document.getElementById('spotBack');
      if (bk) {
        var backWrap = bk.querySelector('.spot-back-img') || bk;
        var backImg = backWrap.querySelector('img');
        if (backImg) {
          if (imgIsEmpty(backImg)) probeImg(backImg, backURL, ((card.name || '') + ' back'));
        } else if (bgIsEmpty(backWrap)) {
          probeAndSwap(backWrap, backURL, ((card.name || '') + ' back'));
        }
      }
    }
  }

  window.depotResolveCardArt = depotResolveCardArt;
  window.depotLibraryArtURL = libraryURL;
  window.depotEnhanceCardArt = function (root, col) { try { enhanceTiles(root, col); } catch (e) { console.debug('[depot] library: enhance tiles failed', e && e.message); } };
  window.depotEnhanceSpotlightArt = function (card) { try { enhanceSpotlight(card); } catch (e) { console.debug('[depot] library: enhance spotlight failed', e && e.message); } };

  console.debug('[depot] library-art resolver ready');
})();

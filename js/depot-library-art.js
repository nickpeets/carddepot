/* js/depot-library-art.js
 * Shared Card-Image Library — client-side art resolver (Slice B consumption).
 *
 * Three-tier resolution, per card, per side:
 *   1) personal  — the owner's own scan (existing signed-URL machinery: card.photoFront / card.photoBack)
 *   2) library   — the public card-library bucket, keyed on catalog identity (year/set/number)
 *   3) placeholder — the existing pixel-art fallback (this module returns null; the caller keeps its placeholder)
 *
 * Path convention (VERIFIED against the live public bucket, 2026-07):
 *   {year}/{brand}/{setSlug}/{number}_{side}.jpg   with brand == setSlug (lowercased),
 *   number = leading-zeros-stripped, letter suffix KEPT  (5 not 005; 1b not 001b).
 * Library reads are PLAIN PUBLIC URLs (browser-cacheable) — never signed URLs.
 *
 * Binder tiles and the spotlight render the card image as a CSS background-image
 * (not an <img>), so fall-through cannot use <img onerror>. Instead we PROBE the
 * candidate library URL with a throwaway Image(): on load we swap the tile background;
 * on error we leave the existing placeholder (no broken-image icon, one debug log).
 * Resolution is lazy/per-render — no speculative prefetching.
 *
 * Cards whose {year}/{set}/{number} derive to a 404 stay on placeholder — correct while
 * ingestion is mid-flight; they self-heal as sets land (no code change on new sets).
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

  // number: strip leading zeros, KEEP trailing letter suffix; keep combo hyphens.
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

  function applyBg(el, url) {
    if (!el) return;
    el.style.backgroundImage = 'url("' + url.replace(/"/g, '\\"') + '")';
    el.style.backgroundSize = el.style.backgroundSize || 'cover';
    el.style.backgroundPosition = el.style.backgroundPosition || 'center';
  }

  function probeAndSwap(el, url, key) {
    if (!el || !url) return;
    if (_probeCache[url] === 'fail') return;
    if (_probeCache[url] === 'ok') { applyBg(el, url); return; }
    var img = new Image();
    img.onload = function () { _probeCache[url] = 'ok'; applyBg(el, url); console.debug('[depot] library-hit ' + key); };
    img.onerror = function () { _probeCache[url] = 'fail'; console.debug('[depot] library-miss ' + key); };
    img.src = url;
  }

  function photoPanel(root) {
    if (!root) return null;
    var cands = root.querySelectorAll('div,section,figure');
    for (var i = 0; i < cands.length; i++) {
      var st = cands[i].getAttribute('style') || '';
      if (/background/i.test(st)) return cands[i];
    }
    return root.firstElementChild || root;
  }

  function enhanceTiles(root) {
    root = root || document;
    var col = window.COLLECTION;
    if (!Array.isArray(col)) { console.debug('[depot] library: COLLECTION not ready; skip tiles'); return; }
    var tiles = root.querySelectorAll('.dc-tile[data-idx]');
    for (var i = 0; i < tiles.length; i++) {
      var tile = tiles[i];
      var idx = parseInt(tile.getAttribute('data-idx'), 10);
      if (isNaN(idx)) continue;
      var card = col[idx];
      if (!card) continue;
      var res = depotResolveCardArt(card, 'front');
      if (res.tier !== 'library') continue;
      if (tile.getAttribute('data-lib-front') === res.url) continue;
      tile.setAttribute('data-lib-front', res.url);
      probeAndSwap(photoPanel(tile), res.url, res.key);
    }
  }

  function enhanceSpotlight(card, root) {
    root = root || document.querySelector('.spot-card') || document;
    if (!card) return;
    ['front', 'back'].forEach(function (side) {
      var res = depotResolveCardArt(card, side);
      if (res.tier !== 'library') return;
      var faceSel = side === 'back' ? '[data-face="back"],.spot-back,.card-back' : '[data-face="front"],.spot-front,.card-front';
      var panel = root.querySelector(faceSel) || (side === 'front' ? photoPanel(root) : null);
      if (!panel) return;
      probeAndSwap(panel, res.url, res.key);
    });
  }

  window.depotResolveCardArt = depotResolveCardArt;
  window.depotLibraryArtURL = libraryURL;
  window.depotEnhanceCardArt = function (root) { try { enhanceTiles(root); } catch (e) { console.debug('[depot] library enhance tiles failed: ' + (e && e.message)); } };
  window.depotEnhanceSpotlightArt = function (card, root) { try { enhanceSpotlight(card, root); } catch (e) { console.debug('[depot] library enhance spotlight failed: ' + (e && e.message)); } };

  console.debug('[depot] library-art resolver ready');
})();

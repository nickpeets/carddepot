/* ===========================================================================
   The Depot — Outfield billboard ad rotator.
   Display-only.  Draws 5 distinct creatives at random from the ad library
   (game/billboards/ad-*.html) and renders them into the 5 staggered, upright
   outfield wall boards.  Refreshes on every new FULL inning (inning-number
   change) and on game start.  Listens for inning changes via the scoreboard
   inning indicator (#count-inning) — it never touches the sim's inning logic.
   =========================================================================== */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  // ---- Ad library (flat paths; manifest's slots/ prefix is stale) ----------
  // ad-open is the "YOUR AD HERE" placeholder: fallback only, never in the pool.
  var AD_IDS = [
  'ad-21stave','ad-alpenrose','ad-berbatis','ad-bullseye','ad-dragon',
  'ad-dublin','ad-efny','ad-enchanted','ad-farrells','ad-gobytrain',
  'ad-hungfarlow','ad-jimmymaks','ad-laluna','ad-larrysteele','ad-leroys',
  'ad-malibu','ad-mavericks','ad-millennium','ad-oakspark','ad-omsi',
  'ad-powells','ad-renners','ad-saltworks','ad-saturdaymarket','ad-satyricon',
  'ad-scholls','ad-skyline','ad-taborview','ad-taylors','ad-tonic',
  'ad-tophat','ad-weinhards','ad-whitestag','ad-yantzen','ad-yem'];
  var FALLBACK_ID = 'ad-open';
  var BASE = 'billboards/';

  // Native creative size (every creative authored natively at 290x96).
  var CREATIVE_W = 290, CREATIVE_H = 96;

  var POOL = {};        // id -> inner markup string of <div id="ad-*">
  var poolReady = false;
  var SLOTS = [];       // the 5 board elements, left->right
  var lastInning = null;

  function $(id){ return document.getElementById(id); }

  // ---- Build the in-memory pool: fetch each creative once, keep inner div ---
  function loadPool(done){
    var ids = AD_IDS.concat([FALLBACK_ID]);
    var pending = ids.length;
    if (!pending){ poolReady = true; return done && done(); }
    ids.forEach(function(id){
      fetch(BASE + id + '.html').then(function(r){ return r.ok ? r.text() : ''; })
        .then(function(html){
          try {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var ad = doc.querySelector('div[id^="ad-"]');
            if (ad){
              // Neutralize the creative's own absolute sizing so it scales cleanly.
              ad.style.position = 'relative';
              ad.style.margin = '0';
              POOL[id] = ad.outerHTML;
            }
          } catch(e){}
        })
        .catch(function(){})
        .then(function(){ if (--pending === 0){ poolReady = true; done && done(); } });
    });
  }

  // ---- Locate the 5 upright wall boards (290x96, staggered, in #stage) ------
  function findSlots(){
    var stage = $('stage'); if (!stage) return [];
    function px(st, p){ var m=(st||'').match(new RegExp(p+':\\s*([\\-\\d.]+)px')); return m?parseFloat(m[1]):null; }
    var out = [];
    Array.prototype.forEach.call(stage.children, function(d){
      if (d.tagName !== 'DIV') return;
      var st = d.getAttribute('style') || '';
      if (!/position:\s*absolute/.test(st)) return;
      var w = px(st,'width'), h = px(st,'height'), top = px(st,'top'), left = px(st,'left');
      if (w === 341 && h === 113 && top !== null && left !== null && top >= 380 && top <= 420) {
        out.push({ el: d, left: left });
      }
    });
    out.sort(function(a,b){ return a.left - b.left; });
    return out.map(function(o){ return o.el; });
  }

  // ---- Prepare a board: clear hardcoded content, add a centered scaled screen
  function prepBoard(board){
    if (board.__bbScreen) return board.__bbScreen;
    // Keep the board's frame (its own position/size/border); host the creative inside.
    board.innerHTML = '';
    board.style.display = 'flex';
    board.style.alignItems = 'center';
    board.style.justifyContent = 'center';
    board.style.padding = '0';
    board.style.overflow = 'hidden';
    var screen = document.createElement('div');
    // Scale 360x120 to fit the inner board area (board content box, minus borders).
    function px(st,p){ var m=(st||'').match(new RegExp(p+':\\s*([\\-\\d.]+)px')); return m?parseFloat(m[1]):0; }
    var st = board.getAttribute('style') || '';
    var bW = px(st,'width'), bH = px(st,'height');
    var bdr = (st.match(/border:\s*([\d.]+)px/) || [0,5])[1]; bdr = parseFloat(bdr) || 5;
    var innerW = bW, innerH = bH; // slot is edgeless now: fill full box
    var scale = Math.min(innerW / CREATIVE_W, innerH / CREATIVE_H); // preserve 360:120 ratio
    screen.style.cssText =
      'width:' + CREATIVE_W + 'px;height:' + CREATIVE_H + 'px;' +
      'transform:scale(' + scale.toFixed(4) + ');transform-origin:center center;' +
      'flex:0 0 auto;overflow:hidden;';
    board.appendChild(screen);
    board.__bbScreen = screen;
    return screen;
  }

  // ---- Random distinct draw of n ids from the real-sponsor pool ------------
  function drawN(n, excludeId){
    var avail = AD_IDS.filter(function(id){ return POOL[id] && id !== excludeId; });
    // shuffle (Fisher-Yates)
    for (var i = avail.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = avail[i]; avail[i] = avail[j]; avail[j] = t;
    }
    var picks = avail.slice(0, n);
    // fallback only if we somehow lack enough real creatives
    while (picks.length < n && POOL[FALLBACK_ID]) picks.push(FALLBACK_ID);
    return picks;
  }

  // ---- Render a fresh set of 5 distinct ads into the boards -----------------
  function refresh(){
    if (!poolReady) return;
    if (!SLOTS.length) SLOTS = findSlots();
    if (SLOTS.length < 5) return;
    // FIX 1: pin ad-yantzen to the far-LEFT slot (slot 1) every inning;
    // the other 4 slots rotate among the remaining ads (yantzen excluded so it never doubles).
    var YANTZEN_ID = 'ad-yantzen';
    var picks = (POOL[YANTZEN_ID])
      ? [YANTZEN_ID].concat(drawN(4, YANTZEN_ID))
      : drawN(5);
    for (var i = 0; i < 5 && i < SLOTS.length; i++){
      var screen = prepBoard(SLOTS[i]);
      screen.innerHTML = POOL[picks[i]] || '';
    }
    if (typeof window !== 'undefined') window.__billboardsNow = picks;
  }

  // ---- Inning-change listener: refresh on a new FULL inning (number change) -
  function readInning(){
    var ci = $('count-inning');
    return ci ? parseInt(ci.textContent, 10) : null;
  }
  function watchInning(){
    var ci = $('count-inning');
    if (!ci) { return setTimeout(watchInning, 200); }
    lastInning = readInning();
    var obs = new MutationObserver(function(){
      var n = readInning();
      if (n !== null && n !== lastInning){ lastInning = n; refresh(); }
    });
    obs.observe(ci, { childList: true, characterData: true, subtree: true });
  }

  // ---- Boot ----------------------------------------------------------------
  function attach(){
    if (!$('stage') || !$('count-inning')) { return setTimeout(attach, 150); }
    SLOTS = findSlots();
    if (SLOTS.length < 5) { return setTimeout(attach, 150); }
    loadPool(function(){
      refresh();        // first inning's set
      watchInning();    // refresh on every subsequent full inning
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(attach, 250); });
  } else {
    setTimeout(attach, 250);
  }

  // expose for verification / debugging
  window.__billboards = {
    refresh: refresh,
    pool: POOL,
    slots: function(){ return SLOTS; },
    poolSize: function(){ return Object.keys(POOL).length; }
  };
})();

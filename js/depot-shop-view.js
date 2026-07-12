/*
 * js/depot-shop-view.js -- SHARED pack-shop PRESENTATION (ADDITIVE, no logic fork).
 * ONE renderer mounted by BOTH game/shop.html AND the index.html PACK SHOP tab.
 * All LOGIC stays in DepotShop (buy/claimFree/getBalance/cardToShape) + DepotPackEngine.
 * This module draws tiles, runs the band-scaled reveal ceremony, wires buttons to that logic.
 * DepotShop.claimFree(catalog, ui) takes an injected ui -> binder & shop share one reveal.
 *
 * DepotShopView.mount(opts) -> controller
 *   opts.gridEl (req) container; opts.statusEl; opts.balEl; opts.context 'shop'|'binder'
 *   opts.catalog; opts.onClaimed fn(card,band,nextClaimAt) called AFTER the ceremony
 *   controller.refresh(); controller.destroy()
 */
(function () {
  "use strict";
  var TAG = "[depot] shop-view:";
  var Shop = window.DepotShop;
  var Eng  = window.DepotPackEngine;
  var CUR  = (window.DepotWallet && window.DepotWallet.CURRENCY) || "DD";
  var DOT  = " \u00b7 ";
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}

  /* ---- computed odds (never hand-typed) ---------------------------------- */
  function paidOddsHtml(tier, catalog) {
    var o = null;
    try { o = (catalog && catalog.length) ? Eng.estimateOdds(tier, catalog, window.DepotPrestige, 250) : null; }
    catch (e) { console.warn(TAG + " odds calc failed for " + tier, e && e.message); }
    var hb = o && o.hitBandPct;
    if (!hb) return "Odds unavailable";
    return "Hit odds: <b>" + (hb.gold||0) + "%</b> gold" + DOT + "<b>" + (hb.silver||0) + "%</b> silver" + DOT + "<b>" + (hb.bronze||0) + "%</b> bronze";
  }
  function freeOddsHtml() {
    var o = null;
    try { o = (Eng && Eng.estimateOdds) ? Eng.estimateOdds("free") : null; } catch (e) { o = null; }
    var p = (o && o.hitBandPct) || { plain:90, bronze:8, silver:1.5, gold:0.5 };
    return "Published odds: <b>~" + p.plain + "%</b> plain" + DOT + "<b>~" + p.bronze + "%</b> bronze" + DOT + "<b>~" + p.silver + "%</b> silver" + DOT + "<b>~" + p.gold + "%</b> gold";
  }

  /* ---- tile HTML (card-sized; tier color as the back) -------------------- */
  function paidTileHtml(tier, catalog, balance) {
    var copy = Shop.TIER_COPY[tier] || { name: tier.toUpperCase()+" PACK", desc: "" };
    var price = (Eng.tierConfig ? Eng.tierConfig(tier).price : 0);
    var afford = (balance != null && balance >= price);
    var gap = (!afford && balance != null) ? '<span class="dsv-gap">Need ' + (price-balance) + ' more ' + CUR + '</span>' : '';
    return '' +
      '<div class="dsv-tile tier-' + tier + (afford ? '' : ' cant-afford') + '" data-tier="' + tier + '">' +
        '<div class="dsv-back"><span class="dsv-wrap">' + esc(copy.name.replace(" PACK","")) + '<br>PACK</span></div>' +
        '<div class="dsv-info">' +
          '<div class="dsv-name">' + esc(copy.name) + '</div>' +
          '<div class="dsv-price">' + price + ' ' + CUR + '</div>' +
          '<div class="dsv-odds">' + paidOddsHtml(tier, catalog) + '<br>5 cards' + DOT + '5th is the hit slot</div>' +
        '</div>' +
        '<div class="dsv-foot"><button class="dsv-btn buy" data-tier="' + tier + '"' + (afford?'':' disabled') + '>BUY</button>' + gap + '</div>' +
      '</div>';
  }
  function freeTileHtml(nextClaimAt) {
    var onCd = nextClaimAt && (new Date(nextClaimAt).getTime() > Date.now());
    var btn = onCd ? '<button class="dsv-btn claim-free" disabled>ON COOLDOWN</button>' : '<button class="dsv-btn claim-free">CLAIM</button>';
    return '' +
      '<div class="dsv-tile tier-free" data-tier="free">' +
        '<div class="dsv-back free"><span class="dsv-ribbon">FREE' + DOT + 'DAILY</span><span class="dsv-wrap">FREE<br>PULL</span></div>' +
        '<div class="dsv-info">' +
          '<div class="dsv-name">FREE DAILY PACK</div>' +
          '<div class="dsv-price">On the house</div>' +
          '<div class="dsv-odds">' + freeOddsHtml() + '<br>1 card' + DOT + 'once every 24h</div>' +
        '</div>' +
        '<div class="dsv-foot">' + btn + '<div class="dsv-cd" aria-live="polite"></div></div>' +
      '</div>';
  }

  /* ---- band-scaled REVEAL CEREMONY --------------------------------------- */
  // The card knows what it is before you do: anticipation scales to the rolled band.
  // plain = simple flip; bronze = shine; silver = shimmer + pause; gold = full ceremony.
  var CEREMONY = {
    plain:  { anticip: 420,  hold: 120,  klass: "plain"  },
    bronze: { anticip: 620,  hold: 260,  klass: "bronze" },
    silver: { anticip: 900,  hold: 520,  klass: "silver" },
    gold:   { anticip: 1300, hold: 900,  klass: "gold"   }
  };
  function pixelFrontSrc(card, pr) {
    try { return window.DepotPixelCard.renderDataURL(card, pr, { w: 250, h: 350 }); }
    catch (e) { return ""; }
  }
  // Build the reveal overlay node for one pulled card. Returns { node, band }.
  function buildReveal(card, band) {
    var shaped = (Shop.cardToShape ? Shop.cardToShape(card, card.year) : card);
    var pr = (window.DepotPrestige && window.DepotPrestige.compute) ? window.DepotPrestige.compute(shaped) : { band: band || "plain", total: 0 };
    var b = pr.band || band || "plain";
    var cfg = CEREMONY[b] || CEREMONY.plain;
    var src = pixelFrontSrc(shaped, pr);
    var name = shaped.player || shaped.name || "Unknown";
    var meta = [shaped.year, shaped.brand, shaped.set].filter(Boolean).join(DOT);
    var wrap = document.createElement("div");
    wrap.className = "dsv-reveal band-" + b + " ceremony-" + cfg.klass;
    wrap.innerHTML = '' +
      '<div class="dsv-scrim"></div>' +
      '<div class="dsv-burst" aria-hidden="true"></div>' +
      '<div class="dsv-stage">' +
        '<div class="dsv-card">' +
          '<div class="dsv-face dsv-cardback"></div>' +
          '<div class="dsv-face dsv-cardfront">' + (src ? '<img alt="" src="' + src + '">' : '') + '</div>' +
        '</div>' +
        '<div class="dsv-chip band-' + b + '">' + b.toUpperCase() + '</div>' +
        '<div class="dsv-cap"><b>' + esc(name) + '</b><br>' + esc(meta) + '</div>' +
      '</div>';
    return { node: wrap, band: b, cfg: cfg, shaped: shaped, pr: pr, src: src };
  }
  // Play the ceremony: tease -> anticipation (wiggle/glow) -> flip -> band landing.
  // Resolves when the ceremony has visually settled (before the grid-landing handoff).
  function playCeremony(rev) {
    return new Promise(function (resolve) {
      var node = rev.node, cfg = rev.cfg;
      // 1) tease: back showing. 2) anticipation after a beat.
      requestAnimationFrame(function () {
        node.classList.add("teasing");
        setTimeout(function () {
          node.classList.add("anticipating");   // wiggle/glow scaled by ceremony-<band>
          setTimeout(function () {
            node.classList.remove("anticipating");
            node.classList.add("flipping");      // the flip
            setTimeout(function () {
              node.classList.add("landed");      // band-scaled landing (shine/shimmer/burst)
              setTimeout(resolve, cfg.hold + 300);
            }, 520);
          }, cfg.anticip);
        }, 260);
      });
    });
  }

  function pad(n){ return (n<10?"0":"") + n; }
  function fmtCountdown(ms){ if(ms<0)ms=0; var s=Math.floor(ms/1000); var h=Math.floor(s/3600); var m=Math.floor((s%3600)/60); var ss=s%60; return pad(h)+":"+pad(m)+":"+pad(ss); }

  /* ---- mount: one controller both surfaces use -------------------------- */
  function mount(opts) {
    opts = opts || {};
    var gridEl = opts.gridEl;
    if (!gridEl) { console.error(TAG + " mount needs opts.gridEl"); return null; }
    var statusEl = opts.statusEl || null;
    var balEl = opts.balEl || null;
    var context = opts.context || "shop";
    var onClaimed = (typeof opts.onClaimed === "function") ? opts.onClaimed : null;
    var catalog = opts.catalog || null;
    var balance = null;
    var nextClaimAt = null;
    var cdTimer = null;

    function setStatus(kind, html) {
      if (!statusEl) return;
      statusEl.className = "dsv-status " + (kind || "");
      statusEl.innerHTML = html || "";
    }
    function clearStatus(){ if (statusEl){ statusEl.className="dsv-status"; statusEl.innerHTML=""; } }
    function setBal(v){ balance=v; if(balEl) balEl.textContent = (v==null?"\u2014":v) + ""; }

    // Reveal, then hand the card to the grid (binder) or leave it (shop page).
    function runReveal(card, band) {
      var rev = buildReveal(card, band);
      var host = document.createElement("div");
      host.className = "dsv-reveal-host";
      host.appendChild(rev.node);
      document.body.appendChild(host);
      // dismiss on click after landed
      rev.node.addEventListener("click", function(){ if(rev.node.classList.contains("landed")) close(); });
      var closed = false;
      function close(){
        if (closed) return; closed = true;
        rev.node.classList.add("dismissing");
        setTimeout(function(){ if(host.parentNode) host.parentNode.removeChild(host); }, 320);
        // Hand off to the grid AFTER the ceremony: the card settles into the collection.
        if (onClaimed) { try { onClaimed(card, rev.band, nextClaimAt); } catch(e){ console.warn(TAG+" onClaimed", e && e.message); } }
      }
      playCeremony(rev).then(function(){
        // auto-settle after the hold; user can also click to dismiss sooner
        setTimeout(close, (CEREMONY[rev.band]||CEREMONY.plain).hold + 900);
      });
    }

    var freeUi = {
      pending:   function(){ setStatus("warn", "Opening your free daily pack\u2026"); },
      claimed:   function(card, band, nca){ if(nca) nextClaimAt=new Date(nca); clearStatus(); runReveal(card, band); startTicker(); render(); },
      cooldown:  function(nca){ if(nca) nextClaimAt=new Date(nca); setStatus("warn", "That free pull is on cooldown."); render(); startTicker(); },
      notSignedIn: function(){ setStatus("err", "Please sign in to claim your free card."); render(); },
      offline:   function(){ setStatus("warn", "Free pack service is offline. No cooldown was used."); render(); },
      fail:      function(m){ setStatus("err", "Could not claim: " + esc(m||"unknown error")); render(); }
    };
    function makeBuyUi(tier){
      return {
        pending:   function(){ setStatus("warn", "Opening " + tier.toUpperCase() + " pack\u2026"); },
        insufficient: function(cost, bal, raw){ setStatus("err", "<b>" + esc(raw||"Insufficient funds.") + "</b> No pack purchased, no " + CUR + " spent."); if(bal!=null) setBal(bal); render(); },
        offline:   function(){ setStatus("warn", "Shop is temporarily offline. No " + CUR + " spent."); render(); },
        savedNoRip:function(nb){ if(nb!=null) setBal(nb); setStatus("ok", "<b>Pack purchased.</b> Saved to your collection."); render(); },
        fail:      function(m){ setStatus("err", "Purchase failed: " + esc(m||"error")); render(); }
      };
    }

    function render() {
      var html = "";
      Shop.TIER_ORDER.forEach(function(t){ html += paidTileHtml(t, catalog, balance); });
      html += freeTileHtml(nextClaimAt);
      gridEl.innerHTML = html;
      var buys = gridEl.querySelectorAll("button.buy");
      for (var i=0;i<buys.length;i++){ (function(btn){ btn.addEventListener("click", function(){ var t=btn.getAttribute("data-tier"); clearStatus(); if(!catalog||!catalog.length){ setStatus("err","Catalog not loaded yet."); return; } Shop.buy(t, catalog, balance, makeBuyUi(t)); }); })(buys[i]); }
      var cf = gridEl.querySelector("button.claim-free");
      if (cf) cf.addEventListener("click", function(){ clearStatus(); if(!catalog||!catalog.length){ setStatus("err","Catalog not loaded yet."); return; } cf.disabled=true; Shop.claimFree(catalog, freeUi); });
      startTicker();
    }

    function startTicker(){
      if (cdTimer){ clearInterval(cdTimer); cdTimer=null; }
      var cdEl = gridEl.querySelector(".dsv-cd");
      if (!cdEl || !nextClaimAt) return;
      function tick(){ var ms = nextClaimAt.getTime() - Date.now(); if (ms<=0){ clearInterval(cdTimer); cdTimer=null; render(); return; } cdEl.textContent = "Next free card in " + fmtCountdown(ms); }
      tick(); cdTimer = setInterval(tick, 1000);
    }

    function probeCooldown(){
      try {
        if (Shop.probeFreeCooldown) { Shop.probeFreeCooldown().then(function(nca){ if(nca){ nextClaimAt=new Date(nca); render(); } }).catch(function(){}); }
      } catch(e){}
    }

    function boot(){
      setBal(null);
      var ready = (window.DepotPrestige && window.DepotPrestige.ready) ? window.DepotPrestige.ready() : Promise.resolve();
      var catP = catalog ? Promise.resolve(catalog) : Shop.loadCatalog();
      Promise.all([catP, ready]).then(function(r){
        catalog = r[0] || [];
        Promise.resolve(Shop.getBalance()).then(function(b){ setBal(b); render(); }).catch(function(){ setBal(null); render(); });
        probeCooldown();
      }).catch(function(e){ setStatus("err","Shop failed to load."); console.error(TAG+" boot", e && e.message); });
    }

    boot();
    return {
      refresh: render,
      destroy: function(){ if(cdTimer){ clearInterval(cdTimer); cdTimer=null; } gridEl.innerHTML=""; },
      setBalance: setBal,
      setCatalog: function(c){ catalog=c; render(); }
    };
  }

  window.DepotShopView = { mount: mount, buildReveal: buildReveal, playCeremony: playCeremony };
})();

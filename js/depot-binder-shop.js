/*
 * js/depot-binder-shop.js -- IN-BINDER PACK SHOP integration (ADDITIVE).
 * Classic script (NOT a module) so it shares index.html's global lexical scope:
 * it can see ERAS / ERA_ORDER / COLLECTION / USER_CARDS / renderBinder / cardHTML / rebuild.
 *
 * Adds a "THE PACK SHOP" era-style tab. When selected, the binder grid hosts the
 * SHARED DepotShopView (same tiles + reveal the standing shop page uses -- no fork).
 * Also makes photoless (pack) cards render the retuned DepotPixelCard front INSIDE
 * the exact .card frame, and settles a freshly-claimed card into the grid.
 */
(function () {
  "use strict";
  var TAG = "[depot] binder-shop:";
  function G(name){ try { return eval(name); } catch(e){ return undefined; } }

  function ready(cb, tries){
    tries = tries || 0;
    var okScope = (typeof G("ERAS") === "object" && typeof G("ERA_ORDER") === "object" && typeof window.renderBinder === "function" && typeof window.cardHTML === "function");
    var okDeps  = window.DepotShopView && window.DepotShop && window.DepotPackEngine && window.DepotPixelCard;
    if (okScope && okDeps) { cb(); return; }
    if (tries > 100) { console.warn(TAG + " gave up waiting for scope/deps", {okScope:okScope, okDeps:!!okDeps}); return; }
    setTimeout(function(){ ready(cb, tries+1); }, 60);
  }

  ready(function () {
    var ERAS = G("ERAS"), ERA_ORDER = G("ERA_ORDER");

    // 1) register the PACK SHOP era (mutate the const object/array -- allowed).
    if (!ERAS.packshop) {
      ERAS.packshop = { title: "THE PACK SHOP", range: "daily + buy", skin: "skin-modern",
        blurb: "Your free daily pull and the Bronze / Silver / Gold packs \u2014 open them right here in the binder." };
      if (ERA_ORDER.indexOf("packshop") === -1) ERA_ORDER.push("packshop");
    }

    // 2) shared-view controller (mounted lazily when the tab is shown).
    var view = null;
    function mountShop() {
      var grid = document.getElementById("binderGrid");
      if (!grid) return;
      grid.classList.add("dsv-grid", "rd-shop-grid");
    var _pt = document.querySelector(".era-tab.packshop");
    if (_pt) _pt.classList.add("rd-shop-tab"); // the tab keeps its gold spine after the dissolve
      // a status line above the tiles
      var status = document.getElementById("dsvStatus");
      if (!status) {
        status = document.createElement("div");
        status.id = "dsvStatus"; status.className = "dsv-status rd-shop-status";
        grid.parentNode.insertBefore(status, grid);
      }
      if (view) view.destroy();
      view = window.DepotShopView.mount({
        gridEl: grid, statusEl: status, context: "binder",
        onClaimed: settleClaimedCard,
        onClaimedBatch: settleClaimedCards
      });
    }

    // Build the in-memory binder row for a pulled catalog card. Display only:
    // the card itself was already granted server-side.
    function packCardToBinderCard(catCard, band) {
      var yr = parseInt(catCard.year || catCard.yr, 10) || 0;
      var eraFromYear = window.eraFromYear || function(){ return "modern"; };
      return {
        id: (catCard.card_id || catCard.id || ("pack-" + Date.now() + "-" + Math.random().toString(36).slice(2,7))),
        name: catCard.player || catCard.name || "Unknown",
        pos: "\u2014", team: catCard.team || "\u2014", yr: yr,
        set: catCard.brand || catCard.set || "Pack Pull",
        num: (catCard.number != null ? String(catCard.number) : ""), numSort: 0,
        era: eraFromYear(yr) || "modern",
        type: "hitter", rare: false, photoFront: "", photoBack: "",
        source: "pack", _band: band || "plain"
      };
    }

    // 3b) design 4.7: the WHOLE pack settles into the binder grid at once,
    // using the existing dsv-settle animation. One rebuild, one era jump (the
    // best pull's era), every landed slot flashed.
    function settleClaimedCards(cards, bands) {
      if (!cards || !cards.length) { console.warn(TAG + " settle batch: no cards handed over"); return; }
      var USER_CARDS = G("USER_CARDS");
      var made = [], i;
      for (i = 0; i < cards.length; i++) made.push(packCardToBinderCard(cards[i], bands && bands[i]));
      try { if (USER_CARDS && USER_CARDS.push) { for (i = 0; i < made.length; i++) USER_CARDS.push(made[i]); } }
      catch (e) { console.warn(TAG + " settle batch: USER_CARDS push failed: " + (e && e.message)); }
      try { if (typeof window.rebuild === "function") window.rebuild(); }
      catch (e) { console.warn(TAG + " settle batch: rebuild failed: " + (e && e.message)); }
      var RANK = { plain:0, bronze:1, silver:2, gold:3 };
      var best = 0;
      for (i = 1; i < made.length; i++) { if ((RANK[made[i]._band]||0) > (RANK[made[best]._band]||0)) best = i; }
      if (typeof window.selectEra === "function") window.selectEra(made[best].era);
      // The v2 binder renders tiles as .dc-tile[data-idx] (the inherited '.card' +
      // aria-label match silently matched nothing, so dsv-settle never played).
      // Index into the live COLLECTION instead: the pushed objects are the same
      // references rebuild() re-collects. The era view paginates at PER_PAGE, so
      // walk forward with the binder's own turnPage() until the pull is on screen.
      function flashLanded(tries) {
        var COLLECTION = G("COLLECTION") || [];
        var landed = 0;
        for (var k = 0; k < made.length; k++) {
          var idx = COLLECTION.indexOf(made[k]);
          if (idx < 0) continue;
          var tile = document.querySelector('#binderGrid .dc-tile[data-idx="' + idx + '"], #binderGrid .card[data-idx="' + idx + '"]');
          if (!tile) continue;
          tile.classList.add("just-landed", "rd-shop-landed");           // dsv-settle (css/depot-shop-view.css)
          if (!landed) { try { tile.scrollIntoView({ behavior:"smooth", block:"center" }); } catch (e) {} }
          landed++;
        }
        if (landed) {
          (window.depotLog||function(){})(TAG + " settle batch: " + landed + "/" + made.length + " slot(s) flashed with dsv-settle");
          return;
        }
        if (tries < 12 && typeof window.turnPage === "function") {
          window.turnPage(1);                          // the binder's own pager
          setTimeout(function () { flashLanded(tries + 1); }, 90);
          return;
        }
        console.warn(TAG + " settle batch: none of the " + made.length +
          " pulls could be located in the binder grid (paged " + tries + " time(s)); cards ARE granted, only the flash was missed");
      }
      setTimeout(function () { flashLanded(0); }, 260);
    }

    // 3) a freshly-claimed card SETTLES into the collection grid.
    function settleClaimedCard(catCard, band, nextClaimAt) {
      var USER_CARDS = G("USER_CARDS");
      var yr = parseInt(catCard.year || catCard.yr, 10) || 0;
      var eraFromYear = window.eraFromYear || function(){ return "modern"; };
      var newCard = {
        id: (catCard.card_id || catCard.id || ("pack-" + Date.now())),
        name: catCard.player || catCard.name || "Unknown",
        pos: "\u2014", team: catCard.team || "\u2014", yr: yr,
        set: catCard.brand || catCard.set || "Pack Pull",
        num: "", numSort: 0, era: eraFromYear(yr) || "modern",
        type: "hitter", rare: false, photoFront: "", photoBack: "",
        source: "pack", _band: band || "plain"
      };
      try { if (USER_CARDS && USER_CARDS.push) USER_CARDS.push(newCard); } catch(e){}
      try { if (typeof window.rebuild === "function") window.rebuild(); } catch(e){}
      // jump to the card's era so the player can watch it land in the grid.
      if (typeof window.selectEra === "function") window.selectEra(newCard.era);
      // flash the just-landed slot.
      setTimeout(function () {
        var COLLECTION = G("COLLECTION");
        var idx = COLLECTION ? COLLECTION.indexOf(newCard) : -1;
        var btns = document.querySelectorAll("#binderGrid .card");
        // best-effort: match by player name on the freshly rendered grid
        for (var i=0;i<btns.length;i++){
          if (btns[i].getAttribute("aria-label") && btns[i].getAttribute("aria-label").indexOf(newCard.name) === 0) {
            btns[i].classList.add("just-landed", "rd-shop-landed");
            btns[i].scrollIntoView({ behavior:"smooth", block:"center" });
            break;
          }
        }
      }, 120);
    }

    // 4) renderBinder wrap: packshop tab hosts the shared view.
    var _renderBinder = window.renderBinder;
    window.renderBinder = function () {
      var curEra = G("curEra");
      if (curEra === "packshop") {
        if (typeof window.showEraChrome === "function") window.showEraChrome(true);
        if (typeof window.renderEraTabs === "function") window.renderEraTabs();
        var e = ERAS.packshop;
        // The redesigned shop screen owns its heading copy (design section 6 copy
        // deck) and renders its own h1 only on the standing shop page, so here the
        // binder's era heading carries it instead -- one heading, not two. The era
        // TAB label (ERAS.packshop.title) is untouched.
        var t = document.getElementById("eraTitle"); if (t) t.textContent = "RIP A PACK";
        var bl = document.getElementById("eraBlurb"); if (bl) bl.textContent = "Five cards a pack. The last one is always the hit slot.";
        // hide pager for the shop
        ["pageDots","prevPage","nextPage"].forEach(function(id){ var el=document.getElementById(id); if(el) el.style.visibility="hidden"; });
        mountShop();
        return;
      }
      // leaving the shop: tear it down + restore pager
      if (view) { view.destroy(); view = null; }
      var grid = document.getElementById("binderGrid"); if (grid) grid.classList.remove("dsv-grid", "rd-shop-grid", "pks-host", "rd-shop-host");
      var st = document.getElementById("dsvStatus"); if (st && st.parentNode) st.parentNode.removeChild(st);
      ["pageDots","prevPage","nextPage"].forEach(function(id){ var el=document.getElementById(id); if(el) el.style.visibility=""; });
      return _renderBinder.apply(this, arguments);
    };

    // 5) cardHTML wrap: photoless (pack) cards wear the pixel front INSIDE the .card frame.
    var _cardHTML = window.cardHTML;
    window.cardHTML = function (card, idx, skin) {
      var html = _cardHTML.apply(this, arguments);
      var hasPhoto = card && (card.photoFront || card.photo);
      if (hasPhoto) return html;
      // build a pixel front for this card and inject it as the .photo background.
      try {
        var shaped = { player: card.name, year: card.yr, brand: card.set, team: card.team, number: card.num, position: card.pos };
        var pr = (window.DepotPrestige && window.DepotPrestige.compute)
          ? window.DepotPrestige.compute({ player: card.name, year: card.yr, brand: card.set, team: card.team, rookie_year: (card._band ? card.yr : null) })
          : { band: card._band || "plain", total: 0 };
        if (card._band) pr = { band: card._band, total: pr.total || 0 };
        var url = window.DepotPixelCard.renderDataURL(shaped, pr, { w: 225, h: 315 });
        if (url) {
          // replace the placeholder .photo style with the pixel-front image
          html = html.replace(/<div class="photo" style="[^"]*"><\/div>/,
            '<div class="photo pixel-front" style="background-image:url(&quot;' + url + '&quot;);background-size:cover;background-position:center"></div>');
        }
      } catch (e) { console.warn(TAG + " pixel front failed", e && e.message); }
      return html;
    };

    (window.depotLog||function(){})(TAG + " in-binder pack shop ready (PACK SHOP tab registered).");
  });
})();

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
  var _catalogRef = null;  // shared catalog for cosmetic REPLAY re-rolls

  // --- Auth-gated pending-pack redemption (fixes the pre-auth silent no-op) ---
  // boot()/mount() used to call Shop.redeemPending immediately at load, BEFORE the
  // Supabase session was restored -> getUser() null -> redeem bailed -> silent catch.
  // Now we run it only once we KNOW there is a signed-in user (already-authed OR on
  // SIGNED_IN / INITIAL_SESSION), and we log loudly at every branch.
  function _sbClient(){
    try { return (typeof window.depotSB === 'function') ? window.depotSB() : (window.supabaseClient || null); }
    catch (e) { return null; }
  }
  function redeemPendingWhenAuthed(catalog, ctx){
    ctx = ctx || {};
    if (!Shop.redeemPending){ console.warn(TAG + ' auto-redeem: Shop.redeemPending missing (build/export bug)'); return; }
    var fired = false;
    function fire(reason){
      if (fired) return; fired = true;
      (window.depotLog||function(){})(TAG + ' auto-redeem firing (' + reason + ')');
      try {
        Shop.redeemPending(catalog, window.DepotShopView, { render: ctx.render, revealOne: ctx.revealOne })
          .then(function(res){
            if (res && res.redeemed){
              (window.depotLog||function(){})(TAG + ' auto-redeem OK: pack opened (' + ((res.cards && res.cards.length) || '?') + ' cards)');
              if (ctx.onOpened) ctx.onOpened(res);
            } else {
              (window.depotLog||function(){})(TAG + ' auto-redeem: no pending pack to open');
            }
          })
          .catch(function(e){
            // Post-debit failure: cards may not have inserted, but the RECEIPT IS KEPT.
            console.error(TAG + ' auto-redeem POST-DEBIT FAILURE (receipt kept, money safe): ' + (e && (e.message || e)));
          });
      } catch (e) {
        console.error(TAG + ' auto-redeem threw synchronously (receipt kept): ' + (e && (e.message || e)));
      }
    }
    var c = _sbClient();
    if (!c || !c.auth){ console.warn(TAG + ' auto-redeem: no auth client yet, will not redeem this load'); return; }
    // Fire now if already signed in
    try {
      c.auth.getUser().then(function(r){
        if (r && r.data && r.data.user){ fire('already-authed'); }
        else { (window.depotLog||function(){})(TAG + ' auto-redeem: no user yet, waiting for sign-in'); }
      }).catch(function(e){ console.warn(TAG + ' auto-redeem getUser failed: ' + (e && (e.message || e))); });
    } catch (e) { console.warn(TAG + ' auto-redeem getUser threw: ' + (e && (e.message || e))); }
    // Re-fire once auth is (re)established
    try {
      if (c.auth.onAuthStateChange){
        c.auth.onAuthStateChange(function(evt, session){
          if ((evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION') && session && session.user){ fire(evt); }
        });
      }
    } catch (e) { console.warn(TAG + ' auto-redeem onAuthStateChange wiring failed: ' + (e && (e.message || e))); }
  }

  var Eng  = window.DepotPackEngine;
  var CUR  = (window.DepotWallet && window.DepotWallet.CURRENCY) || "DD";
  var DOT  = " \u00b7 ";
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}

  /* ONE definition of "print a player name" for this whole view.
     depotCleanName falls back to the RAW STRING when it finds no name token, so
     cleaning is allowed to be a no-op -- never assume it shortened anything.
     See ONBOARDING_PATH_SPEC.md 5.2 and RD_CH0607_SHOP_SCOPE.md 2.1. Do not add
     a second copy of this guard: a second definition is a second thing to drift. */
  function cleanNm(v){
    var f = (typeof window.depotCleanName === 'function') ? window.depotCleanName : function (x) { return String(x || '').trim(); };
    var out = f(v);
    if (!out) { console.warn('[depot] shop-view: depotCleanName returned empty for "' + v + '"; printing the raw value'); return v; }
    return out;
  }

  /* ===================================================================== */
  /* PACK SHOP + RIP REDESIGN (feat/pack-shop-redesign)                    */
  /* Design: handoff-pack-shop/README.md. Presentation ONLY -- every money  */
  /* call below is the SAME call it was before: Shop.buy (depot_purchase_   */
  /* pack RPC), Shop.claimFree (depot_claim_free_pack RPC), Shop.           */
  /* redeemPending (pack_grants ledger + card insert). The rip is pure      */
  /* THEATRE over cards that are already granted.                          */
  /* ===================================================================== */

  /* ---- bands: what the ENGINE can actually roll ------------------------
     depot-pack-engine.js: BAND_RANK = { plain:0, bronze:1, silver:2, gold:3 }.
     There is NO Diamond band anywhere in the engine, so GOLD is the real top
     band: it wears the hit treatment and every "hit" string is derived from
     gold. The Diamond visual language ships in css/pack-shop-v2.css but no
     Diamond tier card is rendered (see db/proposals/FUTURE_ITEMS.md). */
  var BAND_RANK  = { plain:0, bronze:1, silver:2, gold:3 };
  var BAND_LABEL = { plain:"COMMON", bronze:"BRONZE", silver:"SILVER", gold:"GOLD" };
  var BAND_NOUN  = { plain:"Common", bronze:"Bronze", silver:"Silver", gold:"Gold" };
  var TOP_BAND   = "gold";
  function bandOf(card){
    try {
      var shaped = (Shop.cardToShape ? Shop.cardToShape(card, card.year) : card);
      var b = (window.DepotPrestige && window.DepotPrestige.compute)
        ? (window.DepotPrestige.compute(shaped).band || "plain") : "plain";
      return (BAND_RANK[b] == null) ? "plain" : b;
    } catch(e){ console.warn(TAG + " bandOf failed: " + (e && e.message) + " -- falling back to plain"); return "plain"; }
  }
  function bestBandIdx(bands, prefer){
    var bi = 0;
    for (var i = 1; i < bands.length; i++){ if ((BAND_RANK[bands[i]]||0) > (BAND_RANK[bands[bi]]||0)) bi = i; }
    // a tie goes to the hit slot -- that card is the pack's headline
    if (prefer != null && prefer >= 0 && prefer < bands.length &&
        (BAND_RANK[bands[prefer]]||0) === (BAND_RANK[bands[bi]]||0)) bi = prefer;
    return bi;
  }
  function yy(v){ var s = String(v == null ? "" : v); return s.length >= 2 ? "\u2019" + s.slice(-2) : s; }
  function money(n){ try { return Number(n).toLocaleString(); } catch(e){ return String(n); } }

  /* ---- hooks: the mounted controller lends the theatre its live wiring.
     playPackSession is ALSO called straight from depot-shop.js (the money
     path), which passes no callbacks -- so the theatre reads them from here
     instead of changing that signature. Fail loud when one is missing. */
  var _hooks = { balance:null, signedIn:null, buyTier:null, settle:null, refresh:null };

  function signedInSync(){
    try { if (window.depotUserCached) return true; } catch(e){}
    try { if (window.DEPOT_USER && window.DEPOT_USER.id) return true; } catch(e){}
    return false;
  }

  /* ===================================================================== */
  /* REAL ART -- probe-gated exactly like the binder (depot-library-art.js).*/
  /* Paint only on laid-out LIVE nodes; a superseded reveal never paints a  */
  /* stale node; a probe MISS renders the 4.5 designed placeholder; never a */
  /* broken image. DepotPixelCard stays the fallback beneath the probe when */
  /* the resolver/probe pair is not on the page at all.                    */
  /* ===================================================================== */
  var _phaseTok = 0;                 // bumped on every phase / reveal step
  function phaseTok(){ return _phaseTok; }
  function bumpPhase(){ _phaseTok++; return _phaseTok; }

  function noArtHtml(){
    return '<div class="prip-noart">' +
             '<div class="prip-noart-tile">D</div>' +
             '<div class="prip-noart-lab">NO IMAGE YET</div>' +
             '<div class="prip-noart-say">Card\u2019s confirmed \u2014 add a scan and it\u2019ll paint.</div>' +
           '</div>';
  }
  function paintNoArt(well){
    if (!well || !well.isConnected) return;
    well.classList.add("is-noart");
    well.innerHTML = noArtHtml();
  }
  // Legacy fallback: the pixel front, used ONLY when the library-art module is
  // absent from the page (fail-loud, and never a broken image).
  function paintPixelFallback(well, card){
    if (!well) return;
    try {
      var shaped = (Shop.cardToShape ? Shop.cardToShape(card, card.year) : card);
      var pr = (window.DepotPrestige && window.DepotPrestige.compute) ? window.DepotPrestige.compute(shaped) : { band:"plain", total:0 };
      var url = window.DepotPixelCard ? window.DepotPixelCard.renderDataURL(shaped, pr, { w:250, h:350 }) : "";
      if (url){ well.style.backgroundImage = 'url("' + url + '")'; well.style.backgroundSize = "cover"; well.style.backgroundPosition = "center"; }
      else { console.warn(TAG + " pixel fallback produced no data URL"); }
    } catch(e){ console.warn(TAG + " pixel fallback failed: " + (e && e.message)); }
  }
  function isLive(el){
    if (!el || !el.isConnected) return false;
    return el.offsetWidth > 0 && el.offsetHeight > 0;
  }
  // well = the .prip-well of a card front that is ALREADY in the document.
  function fillArt(well, card, tok){
    if (!well) return;
    var resolve = window.depotResolveCardArt, probe = window.depotProbeCardArt;
    if (typeof resolve !== "function" || typeof probe !== "function"){
      console.warn(TAG + " art: depotResolveCardArt/depotProbeCardArt missing on this page -- DepotPixelCard fallback");
      paintPixelFallback(well, card);
      return;
    }
    var r = null;
    try { r = resolve(card, "front"); } catch(e){ console.warn(TAG + " art resolve threw: " + (e && e.message)); }
    if (!r || !r.url || r.tier === "placeholder"){ paintNoArt(well); return; }
    Promise.resolve(probe(card, "front")).then(function(ok){
      if (tok !== phaseTok()) return;                 // superseded: never paint a stale node
      if (!isLive(well)) return;                      // laid-out live nodes only
      if (!ok){ paintNoArt(well); return; }
      var im = document.createElement("img");
      im.alt = ""; im.setAttribute("aria-hidden", "true");
      im.onerror = function(){ if (tok === phaseTok() && isLive(well)) paintNoArt(well); };
      im.src = r.url;
      well.appendChild(im);
    }).catch(function(e){
      console.warn(TAG + " art probe rejected: " + (e && e.message));
      if (tok === phaseTok() && isLive(well)) paintNoArt(well);
    });
  }

  /* ---- 4.4 card front anatomy (band strip / photo well / nameplate) ---- */
  function frontHtml(card, band){
    var shaped = (Shop.cardToShape ? Shop.cardToShape(card, card.year) : card);
    var name = shaped.player || shaped.name || "Unknown";
    var pos  = shaped.position || shaped.pos || "";
    var team = shaped.team || "";
    var sub  = [pos, team].filter(Boolean).join(DOT);
    if (!sub) console.debug(TAG + " front: no position/team on " + name);
    return '<div class="prip-front pk-b-' + band + '">' +
             '<div class="prip-band"><span class="prip-band-lab">' + BAND_LABEL[band] + '</span>' +
             '<span class="prip-band-yr">' + esc(yy(shaped.year)) + '</span></div>' +
             '<div class="prip-well"></div>' +
             '<div class="prip-plate"><b>' + esc(name) + '</b><span>' + esc(sub) + '</span></div>' +
           '</div>';
  }

  /* ===================================================================== */
  /* ODDS + FLOOR COPY -- DERIVED from estimateOdds(), never transcribed.   */
  /* The spec's numbers name a Diamond band that does not exist, so every   */
  /* number below comes out of the live engine at render time.              */
  /* ===================================================================== */
  function oddsOf(tier, catalog){
    try { return (catalog && catalog.length) ? Eng.estimateOdds(tier, catalog, window.DepotPrestige, 8000) : null; }
    catch(e){ console.warn(TAG + " odds calc failed for " + tier + ": " + (e && e.message)); return null; }
  }
  // Honest floor language for a BOUNDED 40-try re-roll with a best-so-far
  // fallback (rollPack returns floorMet precisely because it CAN be false).
  // Never the word "guaranteed".
  function floorCopy(o){
    var f = o && o.hitFloorBand;
    if (!f || f === "plain"){ console.debug(TAG + " floor copy: tier has no band floor"); return ""; }
    return (BAND_NOUN[f] || f) + " floor on the hit slot.";
  }
  function topBandCopy(o){
    var pct = (o && o.hitBandPct) ? o.hitBandPct[TOP_BAND] : null;
    if (pct == null){ console.warn(TAG + " odds copy: no " + TOP_BAND + " share in the odds payload"); return ""; }
    if (pct <= 0)  return BAND_NOUN[TOP_BAND] + " hit is a longshot.";
    if (pct >= 50) return BAND_NOUN[TOP_BAND] + " hit in about " + Math.round(pct) + "% of packs.";
    return BAND_NOUN[TOP_BAND] + " hit about 1 in " + Math.round(100 / pct) + ".";
  }
  function topBandShort(o){
    var pct = (o && o.hitBandPct) ? o.hitBandPct[TOP_BAND] : null;
    if (pct == null || pct <= 0) return "";
    if (pct >= 50) return BAND_NOUN[TOP_BAND] + " ~" + Math.round(pct) + "%";
    return BAND_NOUN[TOP_BAND] + " ~1 in " + Math.round(100 / pct);
  }
  var TIER_FLAVOUR = { bronze:"The everyday rip.", silver:"Better paper.", gold:"" };
  function oddsHtml(tier, catalog){
    var o = oddsOf(tier, catalog);
    if (!o) return '<span class="pks-d">Odds unavailable</span><span class="pks-m">Odds unavailable</span>';
    var lead = TIER_FLAVOUR[tier] || "";
    var long = [lead, floorCopy(o), topBandCopy(o)].filter(Boolean).join(" ");
    var nCards = (o.cards || 5) + " card" + ((o.cards === 1) ? "" : "s");
    var shortTxt = [nCards, topBandShort(o)].filter(Boolean).join(DOT);
    return '<span class="pks-d">' + esc(long) + '</span><span class="pks-m">' + esc(shortTxt) + '</span>';
  }
  function freeOddsText(){
    var o = null;
    try { o = (Eng && Eng.estimateOdds) ? Eng.estimateOdds("free") : null; } catch(e){ o = null; }
    var p = (o && o.hitBandPct) || null;
    if (!p){ console.warn(TAG + " free odds unavailable"); return ""; }
    return "Free pack odds: " + ["plain","bronze","silver","gold"].map(function(b){ return "~" + p[b] + "% " + b; }).join(DOT) + ".";
  }

  /* ---- 2.1 wrapper: one recipe, every tier ---------------------------- */
  function wrapHtml(kind, plate, count, o){
    o = o || {};
    return '<div class="pk-wrap pk-wrap--' + kind + (o.breathe ? " pk-wrap--breathe" : "") + '" aria-hidden="true">' +
             '<span class="pk-sheen"></span>' +
             '<span class="pk-crimp pk-crimp--t"></span>' +
             '<span class="pk-crimp pk-crimp--b"></span>' +
             '<span class="pk-wrap-mark">THE DEPOT</span>' +
             (o.gem ? '<span class="pk-gem"></span>' : "") +
             '<span class="pk-plate">' + esc(plate) + '</span>' +
             '<span class="pk-wrap-count">' + esc(count) + '</span>' +
           '</div>';
  }

  function fmtClock(d){
    try { return d.toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" }).replace(/\s?([AP])M/i, function(m,g){ return g.toLowerCase() + "m"; }); }
    catch(e){ return ""; }
  }

  /* ---- 3.1 / 3.2 / 3.5 tier card ------------------------------------- */
  function tierCardHtml(tier, catalog, balance, signedIn){
    var cfg = Eng.tierConfig ? Eng.tierConfig(tier) : null;
    if (!cfg) console.warn(TAG + " tier card: no engine config for " + tier);
    var price = cfg ? cfg.price : 0;
    var nCards = cfg ? cfg.cards : 5;
    var nice = tier.charAt(0).toUpperCase() + tier.slice(1) + " Pack";
    var label, dis = false;
    if (!signedIn){ label = "Log in to buy"; dis = true; }
    else if (balance != null && balance < price){ label = "Need " + money(price - balance) + " more"; dis = true; }
    else { label = "Buy" + DOT + money(price); }
    return '<div class="pks-tier tier-' + tier + '" data-tier="' + tier + '">' +
             wrapHtml(tier, tier.toUpperCase(), nCards + " CARDS") +
             '<div class="pks-tier-txt">' +
               '<div class="pks-tier-name">' + esc(nice) + '</div>' +
               '<div class="pks-odds">' + oddsHtml(tier, catalog) + '</div>' +
               '<button type="button" class="pks-btn buy" data-tier="' + tier + '"' + (dis ? " disabled" : "") + '>' + esc(label) + '</button>' +
             '</div>' +
           '</div>';
  }

  /* ---- 06a: the DESIGNED-but-GATED Diamond panel -----------------------
 * The design keeps Diamond on the shelf, reading "Locked - economy pass
 * pending" (chapter 06 SPEC). It is not a tier the engine sells: no price,
 * no odds slot, no buy hook, nothing clickable -- a designed door rather
 * than a dead one, with its reason beside it (README rule 6).
 */
function diamondTileHtml(){
  return '<div class="pks-tier tier-diamond" data-tier="diamond" aria-disabled="true">' +
    wrapHtml("diamond", "DIAMOND", "ECONOMY PASS", { gem:true }) +
    '<div class="pks-tier-txt">' +
      '<div class="pks-tier-name">Diamond</div>' +
      '<div class="pks-odds">Designed, held back until the economy work lands.</div>' +
      '<div class="pks-locked">Locked \u2014 economy pass pending</div>' +
    '</div>' +
  '</div>';
}

/* ---- 3.3 / 3.4 / 3.5 FREE DAILY panel -- ONE card (the live RPC) ---- */
  var FREE_WINDOW_MS = 24 * 60 * 60 * 1000;
  function freePanelHtml(nextClaimAt, signedIn){
    var now = Date.now();
    var onCd = !!(nextClaimAt && nextClaimAt.getTime() > now);
    var head, sub, label, dis = true, breathe = false, cdRow = "";
    if (!signedIn){
      head  = "Your free daily pack is waiting";
      sub   = "Log in and claim one card a day, on the house.";
      label = "Log in to claim";
    } else if (onCd){
      var left = nextClaimAt.getTime() - now;
      var claimedAt = new Date(nextClaimAt.getTime() - FREE_WINDOW_MS);
      var pct = Math.max(0, Math.min(100, ((FREE_WINDOW_MS - left) / FREE_WINDOW_MS) * 100));
      head  = '<span class="pks-d">Back tomorrow for another</span><span class="pks-m">Back tomorrow</span>';
      sub   = '<span class="pks-d">You claimed today at ' + esc(fmtClock(claimedAt)) + '. Next one recharges below.</span>' +
              '<span class="pks-m">Next in <b class="pks-cdt">' + fmtCountdown(left) + '</b></span>';
      label = "Next pack in " + fmtCountdown(left);
      cdRow = '<div class="pks-cdrow pks-d"><div class="pks-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
              '<div class="pks-cd pks-cdt">' + fmtCountdown(left) + '</div></div>';
    } else {
      head  = "Today\u2019s free pack is ready";
      sub   = "One card, on the house. Comes back every 24 hours.";
      label = "Open free pack"; dis = false; breathe = true;
    }
    return '<div class="pks-free" data-tier="free">' +
             wrapHtml("free", "FREE", "1 CARD", { breathe: breathe }) +
             '<div class="pks-free-body">' +
               '<div class="pks-chip">ON THE HOUSE</div>' +
               '<div class="pks-free-head">' + head + '</div>' +
               '<div class="pks-free-sub">' + sub + '</div>' +
               cdRow +
               '<button type="button" class="pks-btn pks-btn--green pks-btn--free claim-free"' + (dis ? " disabled" : "") + '>' + esc(label) + '</button>' +
             '</div>' +
           '</div>';
  }

  /* ---- head row: h1 + sub + guest strip + coin / log-in pill (3.5) ---- */
  function headHtml(balance, signedIn){
    var wallet = signedIn
      ? '<div class="pks-coin" title="Depot Dollars"><i></i><b class="pks-bal">' + esc(balance == null ? "\u2014" : money(balance)) + '</b></div>'
      : '<button type="button" class="pks-login">Log in</button>';
    var guest = signedIn ? "" :
      '<div class="pks-guest">\ud83d\udc40 Browsing as a guest \u2014 log in to buy or claim.</div>';
    return '<div class="pks-head">' +
             '<div class="pks-head-txt">' +
                              '<p class="pks-sub">Five cards a pack. The last one is always the hit slot.</p>' +
             '</div>' + guest +
             '<div class="pks-wallet">' + wallet + '</div>' +
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
    // AUTH-GATED auto-redeem for the IN-BINDER tab (this mount() path had none).
    // Deferred so render/runReveal (hoisted) are ready; helper waits for auth itself.
    setTimeout(function(){ redeemPendingWhenAuthed(catalog, {
      render: render, revealOne: runReveal,
      onOpened: function(res){ try { setStatus("ok", "<b>Your saved pack was opened.</b>"); } catch(e){} try { Promise.resolve(Shop.getBalance()).then(function(b){ setBal(b); render(); }); } catch(e){} }
    }); }, 0);
    var balance = null;
    var nextClaimAt = null;
    var cdTimer = null;

    function setStatus(kind, html) {
      if (!statusEl) return;
      statusEl.className = "dsv-status rd-shop-status " + (kind || "");
      statusEl.innerHTML = html || "";
    }
    function clearStatus(){ if (statusEl){ statusEl.className="dsv-status rd-shop-status"; statusEl.innerHTML=""; } }
    function setBal(v){ balance=v; if(balEl) balEl.textContent = (v==null?"\u2014":v) + ""; }

    // Reveal, then hand the card to the grid (binder) or leave it (shop page).
    function runReveal(card, band) {
      var rev = buildReveal(card, band);
      var host = document.createElement("div");
      host.className = "dsv-reveal-host rd-shop";
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
      claimed:   function(card, band, nca, cardId){ if(nca) nextClaimAt=new Date(nca); clearStatus();
          var _fseed = (typeof cardId!=='undefined' && cardId!=null) ? cardId : ((Date.now())>>>0);
          try { recordPackHistory({ tier:'free', seed:_fseed, count:1 }); } catch(e){}
          playPackSession([card], 0, { tier:'free', held:false, seed:_fseed }).then(function(){ render(); }); startTicker(); render(); },
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
        savedNoRip:function(nb){ if(nb!=null) setBal(nb); setStatus("ok", "<b>PACK PURCHASED - SAVED.</b> Opening will begin next time you open the shop."); render(); },
        // Honor the paid pack NOW: grant the 5 cards + play the rip ceremony.
        rip:function(nb, receipt){
          if(nb!=null) setBal(nb);
          setStatus("ok", "<b>PACK PURCHASED - OPENING...</b>");
          Shop.redeemPending(catalog, window.DepotShopView, { render: render, revealOne: runReveal }).then(function(res){
            if(res && res.redeemed){ setStatus("ok", "<b>Pack opened.</b> Cards added to your collection."); }
            else { setStatus("warn", "<b>Pack saved.</b> Opening will retry next shop load."); }
            render();
          });
        },
        fail:      function(m){ setStatus("err", "Purchase failed: " + esc(m||"error")); render(); }
      };
    }

    function fmtWhen(iso){
      try { var d=new Date(iso); return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
      catch(e){ return ''; }
    }
    // A shelf of packs: tier + date + count only. Contents hidden until REPLAY.
    function renderHistoryHtml(){
      var list = historyList();
      var inner = '';
      if(!list.length){
        inner = '<div class="dpc-hist-empty">No packs opened yet. Rip one above \u2014 it lands here for replay.</div>';
      } else {
        inner = '<div class="dpc-hist-list">';
        for(var i=0;i<list.length;i++){
          var e = list[i];
          var t = (e.tier||'bronze');
          var label = (t==='free'?'DAILY':t.toUpperCase())+' PACK';
          inner += '<div class="dpc-hist-row" data-idx="'+i+'">' +
            '<div class="dpc-hist-item dpc-hist-'+t+'" data-idx="'+i+'">' +
              '<div class="dpc-hist-spine"></div>' +
              '<div class="dpc-hist-meta">' +
                '<div class="dpc-hist-tier">'+label+'</div>' +
                '<div class="dpc-hist-when">'+fmtWhen(e.at)+DOT+(e.count||5)+' card'+(((e.count||5)===1)?'':'s')+'</div>' +
              '</div>' +
              '<button type="button" class="dpc-cardsbtn" data-idx="'+i+'" aria-expanded="false">CARDS</button>' +
              '<button type="button" class="dpc-replaybtn" data-idx="'+i+'">REPLAY</button>' +
            '</div>' +
            '<div class="dpc-hist-cards" data-idx="'+i+'" hidden></div>' +
          '</div>';
        }
        inner += '</div>';
      }
      return '<div class="dpc-history"><h3>Pack History</h3>'+inner+'</div>';
    }
    /* ---- pack contents (feat/pack-history-cards) -------------------------
   * The shelf is localStorage + the pack_grants ledger, so a pack opened in
   * another browser -- or before this shelf existed -- still shows up. Each row
   * expands to the cards that pack actually produced, read from the binder rows
   * that carry its seed, and each card opens its own spotlight.
   * -------------------------------------------------------------------- */
  /* The shelf itself is MODULE state now (see _shelf / historyList below):
       a pack the ceremony records has to be visible to every mounted surface,
       and recordPackHistory() lives at module scope. Only "has THIS mount
       hydrated from the ledger yet" is per-mount. */
    var _shelfHydrated = false;

    /* Repaint just the Pack History block, leaving the rest of the shop alone
       (a full render() during a rip would yank the surface out from under the
       ceremony). Returns false when this surface has no shelf to repaint. */
    function paintHistoryInPlace(){
      var host = gridEl.querySelector(".dpc-history");
      if(!host){ console.warn(TAG+" history shelf not on this surface; nothing to repaint"); return false; }
      var tmp = document.createElement("div");
      tmp.innerHTML = renderHistoryHtml();
      if(!tmp.firstChild){ console.warn(TAG+" history markup came back empty; leaving the shelf alone"); return false; }
      host.parentNode.replaceChild(tmp.firstChild, host);
      wireHistory();
      return true;
    }

    /* force=true re-reads the pack_grants ledger and drops the contents memo:
       the collect path uses it so the row that just landed answers CARDS from
       real binder rows instead of the re-roll fallback. */
    function hydrateShelf(force){
      if(_shelfHydrated && !force) return Promise.resolve(false);
      _shelfHydrated = true;
      var PH = window.DepotPackHistory;
      if(!PH){ console.warn(TAG+" pack-history module absent; shelf stays local-only"); return Promise.resolve(false); }
      if(force && typeof PH.reset === "function") PH.reset();
      return PH.shelf(loadHistory()).then(function(list){
        _shelf = list;
        return paintHistoryInPlace();
      }).catch(function(e){ console.warn(TAG+" shelf hydrate failed: "+((e&&e.message)||e)); return false; });
    }

    registerHistorySink(gridEl, function(opts){
      if(opts && opts.rehydrate) hydrateShelf(true); // async: repaints again when the ledger answers
      return paintHistoryInPlace();                  // immediate, from the shelf we already hold
    });

  function cardsPanelHtml(res){
    if(!res || !res.cards || !res.cards.length){
      return '<div class="dpc-hist-none">Could not read this pack\u2019s cards. Sign in on the binder and try again.</div>';
    }
    var h = '';
    if(res.source === 'reroll'){
      h += '<div class="dpc-hist-note">No binder rows carry this seed, so this is a re-roll of TODAY\u2019s pool \u2014 indicative, not the pack itself.</div>';
    }
    h += '<ul class="dpc-hist-cardlist">';
    for(var i=0;i<res.cards.length;i++){
      var c = res.cards[i];
      var meta = esc(String(c.year||'')) + ' ' + esc(c.set||'') + (c.number!=null && c.number!=='' ? ' #' + esc(String(c.number)) : '');
      h += '<li class="dpc-hist-card' + (c.id ? ' is-linked" data-card="' + esc(String(c.id)) + '" role="button" tabindex="0" title="Open in the binder' : '') + '">' +
             '<span class="dpc-hist-cardname">' + esc(cleanNm(c.player)||'(unnamed)') + '</span>' +
             '<span class="dpc-hist-cardmeta">' + meta + '</span>' +
             (c.id ? '<span class="dpc-hist-go">VIEW</span>' : '') +
           '</li>';
    }
    return h + '</ul>';
  }

  function wireCardLinks(panel){
    var items = panel.querySelectorAll('.dpc-hist-card.is-linked');
    for(var i=0;i<items.length;i++){ (function(el){
      function go(){
        var id = el.getAttribute('data-card');
        var PH = window.DepotPackHistory;
        if(!PH){ console.warn(TAG+' cannot open card '+id+': pack-history module absent'); return; }
        PH.openCard(id);
      }
      el.addEventListener('click', go);
      el.addEventListener('keydown', function(ev){
        if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); go(); }
      });
    })(items[i]); }
  }

  function wireHistoryCards(){
    var btns = gridEl.querySelectorAll('.dpc-cardsbtn');
    var list = historyList();
    for(var i=0;i<btns.length;i++){ (function(btn){
      btn.addEventListener('click', function(){
        var idx = parseInt(btn.getAttribute('data-idx'),10);
        var entry = list[idx];
        if(!entry){ console.warn(TAG+' history: no shelf entry at row '+idx); return; }
        var panel = gridEl.querySelector('.dpc-hist-cards[data-idx="'+idx+'"]');
        if(!panel){ console.warn(TAG+' history: no cards panel for row '+idx); return; }
        if(!panel.hasAttribute('hidden')){ panel.setAttribute('hidden',''); btn.setAttribute('aria-expanded','false'); return; }
        panel.removeAttribute('hidden'); btn.setAttribute('aria-expanded','true');
        if(panel.getAttribute('data-loaded') === '1') return;
        panel.innerHTML = '<div class="dpc-hist-note">Reading the ledger\u2026</div>';
        var PH = window.DepotPackHistory;
        if(!PH){ panel.innerHTML = '<div class="dpc-hist-none">Pack-history module missing.</div>'; console.warn(TAG+' DepotPackHistory missing'); return; }
        PH.contents(entry, _catalogRef || []).then(function(res){
          panel.setAttribute('data-loaded','1');
          panel.innerHTML = cardsPanelHtml(res);
          wireCardLinks(panel);
          (window.depotLog||function(){})(TAG+' history: row '+idx+' -> '+res.cards.length+' card(s) from '+res.source);
        });
      });
    })(btns[i]); }
  }

  function wireHistory(){
    wireHistoryCards();
    hydrateShelf(false);
      var btns = gridEl.querySelectorAll('.dpc-replaybtn');
      var list = historyList();
      for(var i=0;i<btns.length;i++){ (function(btn){
        btn.addEventListener('click', function(){
          var idx = parseInt(btn.getAttribute('data-idx'),10);
          var e = list[idx];
          if(!e) return;
          replayPack(e);   // cosmetic re-roll from seed, ZERO DB writes
        });
      })(btns[i]); }
    }


    /* ---- REDESIGNED SHOP RENDER (feat/pack-shop-redesign) --------------
       Same wiring as before: .buy -> Shop.buy(tier,...) and .claim-free ->
       Shop.claimFree(catalog, freeUi). Only the markup changed. */
    var _sin = signedInSync();

    function loginPrompt(){
      // Route to the page that actually owns the auth chrome. Never a modal, never a blur (3.5).
      var btn = document.querySelector("[data-depot-account] button, .depot-account button, #loginBtn, .btn-google");
      if (btn){ btn.click(); return; }
      var href = /\/game\//.test(location.pathname || "") ? "../index.html" : "index.html";
      console.warn(TAG + " no in-page auth control found; sending the guest to " + href);
      location.href = href;
    }

    function render() {
      gridEl.classList.add("pks-host", "rd-shop-host");
      var tiers = "";
      Shop.TIER_ORDER.forEach(function(t){ tiers += tierCardHtml(t, catalog, balance, _sin); });
      var foot = "Odds are per pack. Cards land in your binder the moment you collect. " +
                 "The free pack comes back 24 hours after you claim it.";
      var freeOdds = freeOddsText();
      gridEl.innerHTML =
        '<div class="pks rd-shop' + (context === "binder" ? " pks--binder" : "") + '">' +
          headHtml(balance, _sin) +
          freePanelHtml(nextClaimAt, _sin) +
          '<div class="pks-grid">' + tiers + diamondTileHtml() + '</div>' +
          '<div class="pks-foot">' + esc(foot) + (freeOdds ? " " + esc(freeOdds) : "") + '</div>' +
          renderHistoryHtml() +
        '</div>';
      wireHistory();
      var buys = gridEl.querySelectorAll("button.buy");
      for (var i = 0; i < buys.length; i++){ (function(btn){
        btn.addEventListener("click", function(){
          var t = btn.getAttribute("data-tier");
          clearStatus();
          if (!catalog || !catalog.length){ setStatus("err", "Catalog not loaded yet."); return; }
          Shop.buy(t, catalog, balance, makeBuyUi(t));   // UNCHANGED money path
        });
      })(buys[i]); }
      var cf = gridEl.querySelector("button.claim-free");
      if (cf) cf.addEventListener("click", function(){
        clearStatus();
        if (!catalog || !catalog.length){ setStatus("err", "Catalog not loaded yet."); return; }
        cf.disabled = true;
        Shop.claimFree(catalog, freeUi);                 // UNCHANGED free-daily RPC path
      });
      var lg = gridEl.querySelector(".pks-login");
      if (lg) lg.addEventListener("click", loginPrompt);
      startTicker();
    }

    /* ---- 3.4 live countdown: ticks the label, the LED clock and the bar */
    function startTicker(){
      if (cdTimer){ clearInterval(cdTimer); cdTimer = null; }
      if (!nextClaimAt) return;
      var btn = gridEl.querySelector("button.claim-free");
      var bar = gridEl.querySelector(".pks-bar > i");
      function tick(){
        var ms = nextClaimAt.getTime() - Date.now();
        if (ms <= 0){ clearInterval(cdTimer); cdTimer = null; render(); return; }
        var txt = fmtCountdown(ms);
        var clocks = gridEl.querySelectorAll(".pks-cdt");
        for (var i = 0; i < clocks.length; i++) clocks[i].textContent = txt;
        if (btn){ btn.disabled = true; btn.textContent = "Next pack in " + txt; }
        if (bar) bar.style.width = Math.max(0, Math.min(100, ((FREE_WINDOW_MS - ms) / FREE_WINDOW_MS) * 100)).toFixed(1) + "%";
      }
      tick();
      cdTimer = setInterval(tick, 1000);
    }

    /* ---- REAL cooldown: mirror the RPC's own clock, read-only ----------
       depot_claim_free_pack computes next_claim_at as
         max(created_at) where reason='free_pack'  +  interval '24 hours'
       (db/proposals/free_daily_pack_fix.sql). We reproduce that from the
       ledger with a SELECT so the countdown is live on load instead of only
       after a refusal. NO writes. Fail-loud at every bail. */
    function probeCooldown(){
      settleAuth();
      var c = _sbClient();
      if (!c || !c.from){ console.warn(TAG + " cooldown probe skipped: no supabase client"); return; }
      Promise.resolve((typeof window.depotUser === "function") ? window.depotUser() : null).then(function(u){
        var uid = (u && u.id) || (u && u.data && u.data.user && u.data.user.id) || null;
        if (!uid){ (window.depotLog||function(){})(TAG + " cooldown probe: no signed-in user; free panel stays in its signed-out state"); return; }
        return c.from("wallet_transactions").select("created_at").eq("owner_id", uid)
          .eq("reason", "free_pack").order("created_at", { ascending:false }).limit(1)
          .then(function(r){
            if (r && r.error){ console.warn(TAG + " cooldown probe failed: " + r.error.message); return; }
            var rows = (r && r.data) || [];
            if (!rows.length){ (window.depotLog||function(){})(TAG + " cooldown probe: no free_pack claim on record -- pack is ready"); return; }
            var next = new Date(rows[0].created_at).getTime() + FREE_WINDOW_MS;
            if (next > Date.now()){ nextClaimAt = new Date(next); (window.depotLog||function(){})(TAG + " cooldown until " + nextClaimAt.toISOString()); }
            else { nextClaimAt = null; (window.depotLog||function(){})(TAG + " last free claim has lapsed -- pack is ready"); }
            render();
          });
      }).catch(function(e){ console.warn(TAG + " cooldown probe threw: " + (e && e.message)); });
    }

    /* Auth settles asynchronously; 3.5 is a display state, so re-render when
       it lands and on every later auth change. */
    function settleAuth(){
      // Balance AND signed-in state both have to be re-read once auth lands: the
      // first getBalance() in boot() runs pre-auth and comes back null, which is
      // why the wallet used to read "--" and every tier button stayed buyable.
      function apply(v){
        var was = _sin; _sin = !!v;
        if (_sin){
          Promise.resolve(Shop.getBalance())
            .then(function(b){ setBal(b); render(); })
            .catch(function(e){ console.warn(TAG + " post-auth balance read failed: " + (e && e.message)); render(); });
        } else if (was !== _sin){ render(); }
      }
      try {
        Promise.resolve((typeof window.depotUser === "function") ? window.depotUser() : null)
          .then(function(u){ apply(u && (u.id || (u.data && u.data.user))); })
          .catch(function(e){ console.warn(TAG + " auth settle failed: " + (e && e.message)); });
      } catch(e){ console.warn(TAG + " auth settle threw: " + (e && e.message)); }
      try {
        var c = _sbClient();
        if (c && c.auth && c.auth.onAuthStateChange){
          c.auth.onAuthStateChange(function(evt, session){
            _sin = !!(session && session.user);
            Promise.resolve(Shop.getBalance()).then(function(b){ setBal(b); render(); }).catch(function(){ render(); });
          });
        } else { console.warn(TAG + " auth settle: no auth client to subscribe to"); }
      } catch(e){ console.warn(TAG + " auth subscribe failed: " + (e && e.message)); }
    }

    /* ---- lend the rip theatre this mount's live wiring ----------------- */
    _hooks.balance  = function(){ return balance; };
    _hooks.signedIn = function(){ return _sin; };
    _hooks.refresh  = function(){
      Promise.resolve(Shop.getBalance()).then(function(b){
        setBal(b);
        // Repaint the shop ONLY if the shop is still what is in the grid. A collect
        // that settles into the binder navigates this container to the binder grid,
        // and this callback resolves after that -- repainting here would yank the
        // player straight back out of the binder they were just sent to.
        if (gridEl && gridEl.querySelector(".pks")) render();
        else (window.depotLog||function(){})(TAG + " refresh: grid has moved on (settled into the binder); balance updated, no repaint");
      }).catch(function(e){ console.warn(TAG + " refresh balance read failed: " + (e && e.message)); });
    };
    _hooks.buyTier  = function(tier){
      if (!catalog || !catalog.length){ setStatus("err", "Catalog not loaded yet."); return; }
      Shop.buy(tier, catalog, balance, makeBuyUi(tier));   // UNCHANGED money path
    };
    // 4.7: the granted cards settle into the binder grid via the EXISTING
    // collect path (dsv-settle). The standing shop page has no binder grid to
    // settle into -- say so instead of failing silently.
    _hooks.settle = function(cards, bands){
      if (typeof opts.onClaimedBatch === "function"){
        try { opts.onClaimedBatch(cards, bands, nextClaimAt); return true; }
        catch(e){ console.warn(TAG + " onClaimedBatch threw: " + (e && e.message)); return false; }
      }
      if (onClaimed){
        var ok = true;
        for (var i = 0; i < cards.length; i++){
          try { onClaimed(cards[i], bands[i], nextClaimAt); }
          catch(e){ ok = false; console.warn(TAG + " onClaimed threw: " + (e && e.message)); }
        }
        return ok;
      }
      (window.depotLog||function(){})(TAG + " settle: this surface has no binder grid; cards are already granted server-side");
      return false;
    };

    function boot(){
      setBal(null);
      var ready = (window.DepotPrestige && window.DepotPrestige.ready) ? window.DepotPrestige.ready() : Promise.resolve();
      var catP = catalog ? Promise.resolve(catalog) : Shop.loadCatalog();
      Promise.all([catP, ready]).then(function(r){
        catalog = r[0] || []; _catalogRef = catalog;
        // Auto-honor a debited-but-unopened pack (money-safety recovery).
      // AUTH-GATED: fire only once a signed-in user exists (already-authed OR on
      // SIGNED_IN/INITIAL_SESSION). The old code fired at load pre-auth and bailed silently.
      redeemPendingWhenAuthed(catalog, {
        render: render, revealOne: runReveal,
        onOpened: function(res){ setStatus("ok", "<b>Your saved pack was opened.</b>"); Promise.resolve(Shop.getBalance()).then(function(b){ setBal(b); render(); }); }
      });
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

    /* ===================================================================== */
  /* PACK CEREMONY v2 + PACK HISTORY (feat/pack-ceremony-and-history)       */
  /* Held, blocking, player-paced rip. Fixes the invisible-ceremony bug:    */
  /* the old runReveal auto-played over a transparent scrim and auto-       */
  /* dismissed. Here the pack opens HELD ("PACK IS READY / RIP IT"), the    */
  /* player starts it, cards flip player-paced (hit last), and the player   */
  /* closes it via COLLECT. Free daily keeps auto-reveal but gets the same  */
  /* centered blocking modal. REPLAY re-rolls from the stored seed and      */
  /* plays the full ceremony with ZERO DB writes.                           */
  /* --------------------------------------------------------------------- */
  var HISTORY_KEY = "depot.packHistory";
  var TIER_CARDS  = { bronze: 5, silver: 5, gold: 5, free: 1 };

  /* ---- the shelf is MODULE state, and it has to be able to repaint -------
   * PR #200 moved _shelf/historyList() inside mount() but left
   * recordPackHistory() out here at module scope, so every call to it threw
   * "historyList is not defined" -- silently, because both call sites wrap it
   * in try/catch. Nothing was ever shelved locally; a just-ripped pack only
   * appeared after a reload re-read the pack_grants ledger (and a free daily,
   * which the ledger does not carry, never appeared at all).
   * The shelf lives here now, and each mounted surface registers a repaint
   * sink so the completion/collect path can re-render Pack History in place.
   */
  var _shelf = null;    // merged ledger+local shelf, shared by every mount
  var _histSinks = [];  // [{ el: gridEl, paint: function(opts) -> bool }]
  function historyList(){ return _shelf || loadHistory(); }
  function registerHistorySink(el, paint){
    for (var i = 0; i < _histSinks.length; i++){
      if (_histSinks[i].el === el){ _histSinks[i].paint = paint; return; }
    }
    _histSinks.push({ el: el, paint: paint });
  }
  function refreshHistorySurfaces(opts){
    opts = opts || {};
    var painted = 0;
    for (var i = 0; i < _histSinks.length; i++){
      try { if (_histSinks[i].paint(opts) !== false) painted++; }
      catch(e){ console.warn(TAG + " history refresh sink failed: " + ((e && e.message) || e)); }
    }
    (window.depotLog||function(){})(TAG + " history refresh (" + (opts.reason || "?") + "): " + painted + "/" + _histSinks.length + " surface(s) repainted");
    return painted;
  }

  function loadHistory(){
    try { var raw = window.localStorage.getItem(HISTORY_KEY); var a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; }
    catch(e){ console.warn(TAG+" history read failed: "+(e&&e.message)); return []; }
  }
  function saveHistory(list){
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0,60))); }
    catch(e){ console.warn(TAG+" history write failed: "+(e&&e.message)); }
  }
  // Record a pack in history (idempotent per seed+tier). Stores ONLY tier/seed/date/count
  // -- never the contents. Contents are re-rolled from the seed at REPLAY time.
  function recordPackHistory(entry){
    if(!entry || (entry.seed==null)) return;
    var key = entry.tier+":"+entry.seed;
    var known = historyList();
    for(var i=0;i<known.length;i++){ if((known[i].tier+":"+known[i].seed)===key) return; } // already shelved
    var row = { tier: entry.tier||"bronze", seed: entry.seed,
                count: entry.count || TIER_CARDS[entry.tier] || 5,
                at: entry.at || new Date().toISOString() };
    var local = loadHistory();                 // localStorage keeps LOCAL receipts only
    local.unshift(row);
    saveHistory(local);
    if(_shelf) _shelf = [row].concat(_shelf);  // and the live shelf carries it immediately
    (window.depotLog||function(){})(TAG+" history: shelved "+key+" ("+local.length+" local receipt(s))");
    refreshHistorySurfaces({ reason: "record" });
  }

/* THE RIP -- four phases: held -> reveal xN -> all N -> added (README 4).
 * Pure THEATRE: every card handed in here is ALREADY granted (paid path:
 * pack_grants ledger + card insert inside Shop.redeemPending; free path: the
 * depot_claim_free_pack RPC). Nothing in this function writes to the DB, and
 * the promise it returns is the same promise the money path awaits.
 *
 * cards    = the granted cards, in pull order
 * hitIndex = the hit slot (-1 / out of range for the 1-card free variant)
 * opts     = { tier, held, seed, replay }
 */
function playPackSession(cards, hitIndex, opts){
  opts = opts || {};
  var tier     = opts.tier || "bronze";
  var held     = (opts.held !== false);      // paid = held; free daily passes held:false
  var isReplay = !!opts.replay;
  var n        = (cards && cards.length) || 0;
  var single   = (n === 1);                  // the FREE DAILY variant: held -> one reveal -> added
  if (!n){ console.warn(TAG + " playPackSession called with no cards; nothing to play"); return Promise.resolve({ revealed:false }); }

  var bands = [];
  for (var bi = 0; bi < n; bi++) bands.push(bandOf(cards[bi]));
  var hit = (typeof hitIndex === "number" && hitIndex >= 0 && hitIndex < n) ? hitIndex : (single ? -1 : n - 1);

  // reveal order: everything except the hit, then the hit LAST
  var order = [];
  for (var oi = 0; oi < n; oi++){ if (oi !== hit) order.push(oi); }
  if (hit >= 0) order.push(hit);

  var seen = {};                             // idx -> band, for the dots + tray
  var cfgPrice = (Eng.tierConfig && Eng.tierConfig(tier)) ? Eng.tierConfig(tier).price : 0;

  return new Promise(function(resolve){
    var root = document.createElement("div");
    root.className = "prip rd-shop prip-tier-" + tier;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", (tier === "free" ? "Free daily" : tier) + " pack rip");

    var top  = document.createElement("div"); top.className = "prip-top";
    var chip = document.createElement("div"); chip.className = "prip-tier tier-" + tier;
    chip.textContent = (tier === "free" ? "DAILY" : tier.toUpperCase()) + " PACK";
    var dots = document.createElement("div"); dots.className = "prip-dots";
    var close = document.createElement("button");
    close.type = "button"; close.className = "prip-close"; close.textContent = "Close";
    top.appendChild(chip); top.appendChild(dots); top.appendChild(close);

    var body = document.createElement("div"); body.className = "prip-body";
    root.appendChild(top); root.appendChild(body);
    document.body.appendChild(root);
    // Show it on the next frame OR the next tick, whichever the browser gives us
    // first: a throttled tab never fires rAF, which left the theatre at opacity 0.
    function showRoot(){ root.classList.add("prip-in"); }
    requestAnimationFrame(showRoot);
    setTimeout(showRoot, 32);

    var done = false;
    var phaseAt = 0;                          // debounce: one advance per click, ever
    function markPhase(){ phaseAt = Date.now(); return bumpPhase(); }
    function tooSoon(){ return (Date.now() - phaseAt) < 260; }
    function finish(){
      if (done) return; done = true;
      bumpPhase();                            // any in-flight art probe is now stale
      root.classList.remove("prip-in");
      setTimeout(function(){ if (root.parentNode) root.parentNode.removeChild(root); }, 300);
      // COLLECT / close: the cards are already granted and the pack is
      // shelved, so Pack History repaints HERE, in place, on every mounted
      // surface -- and re-reads the ledger so the new row's CARDS button is
      // live immediately instead of after a manual refresh.
      refreshHistorySurfaces({ reason: "collect", rehydrate: true });
      resolve({ revealed:true });
    }
    close.addEventListener("click", finish);

    // progress dots: unrevealed / current / revealed-in-that-card's-band
    function paintDots(curIdx){
      if (single){ dots.innerHTML = ""; return; }
      var html = "";
      for (var i = 0; i < n; i++){
        var cls = "prip-dot";
        if (seen[i]) cls += " band-" + seen[i];
        else if (i === curIdx) cls += " is-cur";
        html += '<span class="' + cls + '"></span>';
      }
      dots.innerHTML = html;
    }

    function nameOf(card){
      var s = (Shop.cardToShape ? Shop.cardToShape(card, card.year) : card);
      return cleanNm(s.player || s.name || "Unknown");
    }
    function isNarrow(){
      try { return !!(window.matchMedia && window.matchMedia("(max-width: 520px)").matches); } catch(e){ return false; }
    }
    // 4.2 tray: slot 5 is dashed in the hit colour and labelled HIT SLOT from
    // the very first card -- the tease is on screen the whole way down.
    function trayHtml(){
      if (single) return "";
      var h = '<div class="prip-tray">';
      for (var i = 0; i < n; i++){
        if (seen[i]){
          h += '<div class="prip-slot is-open pk-b-' + seen[i] + '">' +
                 '<div class="prip-slot-lab">' + BAND_LABEL[seen[i]] + '</div>' +
                 '<div class="prip-slot-name">' + esc(nameOf(cards[i])) + '</div>' +
               '</div>';
        } else if (i === hit){
          h += '<div class="prip-slot is-hitslot"><span class="q">HIT SLOT</span></div>';
        } else {
          h += '<div class="prip-slot"><span class="q">?</span></div>';
        }
      }
      return h + '</div>';
    }

    /* ------------------------------------------------------- 4.1 HELD ---- */
    function phaseHeld(){
      markPhase();
      dots.innerHTML = "";                    // dots are reveal-phase only
      body.innerHTML =
        (isReplay ? '<div class="prip-replay">REPLAY</div>' : "") +
        '<div class="prip-held-wrap">' +
          wrapHtml(tier === "free" ? "free" : tier,
                   tier === "free" ? "FREE" : tier.toUpperCase(),
                   n + " CARD" + (single ? "" : "S") + " SEALED",
                   { breathe:true }) +
        '</div>' +
        '<div class="prip-head">Sealed. Nobody\u2019s seen ' + (single ? "this one" : "these") + '.</div>' +
        '<div class="prip-kicker">' + (single ? "ONE CARD \u00b7 ON THE HOUSE" : "FIVE CARDS \u00b7 HIT IN THE LAST SLOT") + '</div>' +
        '<button type="button" class="prip-cta prip-cta--gold prip-rip">RIP IT OPEN</button>';
      // Nothing auto-plays. Tapping the wrapper itself also starts the rip.
      var go = function(ev){
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (tooSoon()) return;
        phaseReveal();
      };
      var b = body.querySelector(".prip-rip"); if (b) b.addEventListener("click", go);
      var w = body.querySelector(".prip-held-wrap"); if (w) w.addEventListener("click", go);
    }

    /* ----------------------------------------------------- 4.2 REVEAL ---- */
    function phaseReveal(){
      var pos = 0;
      function step(){
        var tok = markPhase();
        var idx = order[pos];
        var band = bands[idx];
        var isHitSlot = (idx === hit);
        var isTop = (band === TOP_BAND);      // gold is the real top band -> the hit treatment
        paintDots(idx);
        var counter = single ? "" :
          (isHitSlot ? '<div class="prip-counter is-hit">HIT SLOT</div>'
                     : '<div class="prip-counter">CARD ' + (pos + 1) + ' OF ' + n + '</div>');
        var escCls = " esc-" + band + (isTop ? " esc-hit" : "");
        body.innerHTML =
          counter +
          '<div class="prip-stage">' +
            (isTop ? '<div class="prip-rays" aria-hidden="true"></div>' : "") +
            '<div class="prip-card' + escCls + '">' +
              '<div class="prip-back"><div class="prip-back-tile">D</div><div class="prip-back-mark">THE DEPOT</div></div>' +
              frontHtml(cards[idx], band) +
            '</div>' +
          '</div>' +
          '<div class="prip-prompt">' + (isNarrow() ? "TAP TO REVEAL" : "CLICK THE CARD TO REVEAL") + '</div>' +
          trayHtml();
        var rays = body.querySelector(".prip-rays"); if (rays) rays.style.display = "none";
        var card = body.querySelector(".prip-card");
        var prompt = body.querySelector(".prip-prompt");
        var flipped = false;

        function flip(){
          flipped = true;
          card.classList.add("is-flipped");
          seen[idx] = band;
          paintDots(idx);
          // real art, probe-gated, only on this live laid-out node
          var well = card.querySelector(".prip-well");
          fillArt(well, cards[idx], tok);
          // 4.3 escalation: a common gets NOTHING extra
          if (isTop){
            if (rays) rays.style.display = "";
            var conf = document.createElement("div"); conf.className = "prip-confetti"; conf.setAttribute("aria-hidden","true");
            var cols = ["#5bc0eb","#ffd23e","#ffffff","#7be36b","#f4823c"];
            for (var c = 0; c < 8; c++){
              var chip = document.createElement("i");
              chip.style.left = (6 + c * 12) + "%";
              chip.style.width = (9 + (c % 4)) + "px";
              chip.style.height = (12 + (c % 5)) + "px";
              chip.style.background = cols[c % cols.length];
              chip.style.animationDuration = (2.4 + (c % 5) * 0.2).toFixed(1) + "s";
              chip.style.animationDelay = (0.05 + c * 0.09).toFixed(2) + "s";
              conf.appendChild(chip);
            }
            card.appendChild(conf);
            var stamp = document.createElement("div"); stamp.className = "prip-stamp"; stamp.textContent = "HIT!";
            card.appendChild(stamp);
          }
          var last = (pos >= order.length - 1);
          prompt.textContent = last
            ? (isNarrow() ? "TAP TO FINISH" : (single ? "CLICK TO FINISH" : "CLICK TO SEE THE WHOLE PACK"))
            : (isNarrow() ? "TAP FOR NEXT" : "CLICK FOR THE NEXT CARD");
          // repaint the tray with this slot now open
          var tray = body.querySelector(".prip-tray");
          if (tray){ var tmp = document.createElement("div"); tmp.innerHTML = trayHtml(); tray.parentNode.replaceChild(tmp.firstChild, tray); }
        }
        function advance(ev){
          if (ev && ev.stopPropagation) ev.stopPropagation();
          if (tooSoon()) return;
          phaseAt = Date.now();
          if (!flipped){ flip(); return; }
          pos++;
          if (pos >= order.length){ phaseAll(); return; }
          step();
        }
        card.addEventListener("click", advance);
        if (prompt) prompt.addEventListener("click", advance);
      }
      step();
    }

    /* ---------------------------------------------------- 4.6 ALL FIVE ---- */
    function bandSummary(){
      var counts = { gold:0, silver:0, bronze:0, plain:0 }, i;
      for (i = 0; i < n; i++) counts[bands[i]] = (counts[bands[i]] || 0) + 1;
      var out = [];
      ["gold","silver","bronze","plain"].forEach(function(b){
        if (!counts[b]) return;
        out.push(counts[b] + " " + BAND_NOUN[b] + (counts[b] > 1 ? "s" : ""));
      });
      return out.join(DOT);
    }
    function phaseAll(){
      var tok = markPhase();
      dots.innerHTML = "";
      var row = "", i;
      for (i = 0; i < n; i++){
        row += '<div class="prip-mini" data-i="' + i + '">' + frontHtml(cards[i], bands[i]) + '</div>';
      }
      var addLabel = single ? "Add to binder" : ("Add all " + n + " to binder");
      var ctas = isReplay
        ? '<button type="button" class="prip-cta prip-close2">Back to shop</button>'
        : '<button type="button" class="prip-cta prip-cta--green prip-add">' + esc(addLabel) + '</button>' + ripAnotherHtml();
      body.innerHTML =
        '<div class="prip-done-head">' + (single ? "Free card claimed! \ud83c\udf89" : "Pack ripped! \ud83c\udf89") + '</div>' +
        '<div class="prip-summary">' + esc(bandSummary()) + '</div>' +
        '<div class="prip-row">' + row + '</div>' +
        '<div class="prip-ctas">' + ctas + '</div>';
      // every front in the row gets the same probe-gated real art
      var minis = body.querySelectorAll(".prip-mini .prip-well");
      for (i = 0; i < minis.length; i++){
        var mi = parseInt(minis[i].closest(".prip-mini").getAttribute("data-i"), 10);
        fillArt(minis[i], cards[mi], tok);
      }
      var add = body.querySelector(".prip-add");
      if (add) add.addEventListener("click", function(){
        // "Added" runs through the EXISTING collect path: the cards are already
        // granted, this settles them into the binder grid (dsv-settle).
        // Refresh the shop FIRST, settle LAST: the settle navigates the binder to
        // the pull's era and re-renders the grid, and a shop re-render after that
        // would clobber the binder right back into the shop.
        var settled = _hooks.settle ? _hooks.settle(cards, bands) : false;
        if (!settled) (window.depotLog||function(){})(TAG + " collect: nothing to settle on this surface (cards already granted)");
        if (_hooks.refresh) _hooks.refresh();
        phaseAdded();
      });
      wireRipAnother();
      var c2 = body.querySelector(".prip-close2"); if (c2) c2.addEventListener("click", finish);
    }

    /* "Rip another" carries the price so re-ripping needs no thinking. It goes
       through the SAME Shop.buy money path -- no new purchase writes here. */
    function ripAnotherHtml(){
      if (tier === "free" || !_hooks.buyTier) return "";
      var sin = _hooks.signedIn ? _hooks.signedIn() : signedInSync();
      var bal = _hooks.balance ? _hooks.balance() : null;
      if (!sin) return '<button type="button" class="prip-cta" disabled>Log in to buy</button>';
      if (bal != null && bal < cfgPrice) return '<button type="button" class="prip-cta" disabled>Need ' + esc(money(cfgPrice - bal)) + ' more</button>';
      return '<button type="button" class="prip-cta prip-again">Rip another' + DOT + esc(money(cfgPrice)) + '</button>';
    }
    function wireRipAnother(){
      var again = body.querySelector(".prip-again");
      if (!again) return;
      again.addEventListener("click", function(){
        finish();
        try { _hooks.buyTier(tier); } catch(e){ console.warn(TAG + " rip-another buy threw: " + (e && e.message)); }
      });
    }

    /* -------------------------------------------------------- 4.7 ADDED --- */
    function phaseAdded(){
      markPhase();
      dots.innerHTML = "";
      var bIdx = bestBandIdx(bands, hit);
      var shaped = (Shop.cardToShape ? Shop.cardToShape(cards[bIdx], cards[bIdx].year) : cards[bIdx]);
      var best = nameOf(cards[bIdx]) + " " + yy(shaped.year);
      var line = n + " card" + (single ? "" : "s") + " added" + DOT + best + " is your best pull yet.";
      body.innerHTML =
        '<div class="prip-check">\u2714</div>' +
        '<div class="prip-added-head">Filed in your binder.</div>' +
        '<div class="prip-added-line">' + esc(line) + '</div>' +
        '<div class="prip-ctas">' + ripAnotherHtml() +
          '<button type="button" class="prip-cta prip-toshop">Back to shop</button></div>';
      wireRipAnother();
      var back = body.querySelector(".prip-toshop"); if (back) back.addEventListener("click", finish);
    }

    // Kick off. The 1-card FREE variant is held too (decision 4: held -> one
    // reveal -> added); nothing in this theatre ever auto-plays.
    if (held || single) phaseHeld(); else phaseReveal();
  });
}


  // Regenerate a pack from a stored seed and play it cosmetically. ZERO DB writes.
  function replayPack(entry){
    if(!entry) return Promise.resolve();
    var cat = _catalogRef || [];
    try {
      var pack = window.DepotPackEngine.rollPack({ tier: entry.tier, catalog: cat, seed: entry.seed, prestige: window.DepotPrestige });
      var cards = pack.cards || [];
      var hi = (typeof pack.hitIndex==="number") ? pack.hitIndex : (cards.length-1);
      (window.depotLog||function(){})(TAG+" REPLAY: re-rolled "+cards.length+" card(s) from seed "+entry.seed+" (cosmetic, no DB writes)");
      return playPackSession(cards, hi, { tier: entry.tier, held: true, seed: entry.seed, replay: true });
    } catch(e){
      console.error(TAG+" REPLAY failed for seed "+entry.seed+": "+(e&&e.message));
      return Promise.resolve();
    }
  }

window.DepotShopView = { mount: mount, buildReveal: buildReveal, playCeremony: playCeremony, playPackSession: playPackSession, recordPackHistory: recordPackHistory, loadPackHistory: loadHistory, replayPack: replayPack };
})();

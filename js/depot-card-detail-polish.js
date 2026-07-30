/* ============================================================================
   depot-card-detail-polish.js - Task B card-detail polish.
   ----------------------------------------------------------------------------
   ADDITIVE, presentation-only. Loads AFTER js/depot-card-detail-2b.js and
   layers four things on the existing spotlight:
     1. ORIENTATION - per-face aspect detection (naturalWidth vs naturalHeight,
        or a probe of the background-image URL when art is painted as a bg).
        Landscape faces are letterboxed upright, never stretched or cropped.
     2. FLIP - 0.5s ease-out with a scale beat, matching the rip's dFlip feel;
        prefers-reduced-motion gets a shortened flip and no beat.
     3. BACK FACE - the name / brand / number text overlay is hidden; the back
        is the scan. A designed placeholder covers "no back scan yet".
     4. ZOOM - click-to-zoom on either face so backs are readable. Esc and
        click-out exit the zoom BEFORE the spotlight closes.
   Touches no resolver, no prestige engine, no owner-control handlers.
   ========================================================================== */
(function () {
  "use strict";
  var TAG = "[depot][card-polish]";
  var LAND = 1.02; // width must beat height by 2% before we call it landscape

  /* ---------------------------------------------------------------- styles */
  function injectStyles() {
    if (document.getElementById("dc-polish-styles")) return;
    var css = [
      /* 1. orientation: contain, never crop; landscape letterboxes upright */
      ".spotlight.dc2b .spot-face .frame{align-items:center;justify-content:center;}",
      ".spotlight.dc2b .spot-face img{object-fit:contain !important;object-position:center center !important;}",
      ".spotlight.dc2b #spotFront img.photo{width:100%;height:100%;min-height:0;}",
      ".spotlight.dc2b .spot-face.is-landscape{background:#0d2d5c;}",
      ".spotlight.dc2b .spot-face.is-landscape img{width:100%;height:auto;max-height:100%;}",
      ".spotlight.dc2b #spotBack .spot-back-img{height:100%;max-height:none;}",
      ".spotlight.dc2b #spotBack .spot-back-img img{height:100%;max-height:none;}",
      /* 2. flip: 0.5s ease-out + scale beat (rip dFlip quality bar) */
      ".spotlight.dc2b .spot-inner{transition:transform .5s cubic-bezier(.2,.85,.25,1) !important;}",
      "@keyframes dcFlipPop{0%{transform:scale(1);}38%{transform:scale(1.055);}100%{transform:scale(1);}}",
      ".spotlight.dc2b .spot-card.is-flipping{animation:dcFlipPop .5s ease-out;}",
      ".spotlight.dc2b .spot-card.is-flipping .spot-face{box-shadow:0 22px 44px rgba(7,44,71,.45);}",
      /* 3. back face = art only */
      ".spotlight.dc2b #spotBack .back-head,.spotlight.dc2b #spotBack .back-sub{display:none !important;}",
      ".spotlight.dc2b #spotBack{padding:0 !important;}",
      ".spotlight.dc2b .spot-back-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:18px;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:.86rem;color:#5b7f97;background:#eaf5fd;}",
      ".spotlight.dc2b .spot-back-empty small{display:block;font-weight:600;font-size:.72rem;color:#8fb2c6;}",
      ".spotlight.dc2b #spotBack.has-art .spot-back-empty{display:none;}",
      /* 4. zoom */
      ".spotlight.dc2b .dc-zoom-btn{position:absolute;bottom:8px;right:8px;z-index:4;display:inline-flex;align-items:center;gap:5px;border:2px solid #10456b;border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 3px 0 #10456b;color:#10456b;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:.68rem;line-height:1;padding:5px 10px;cursor:zoom-in;}",
      ".spotlight.dc2b .dc-zoom-btn:hover{background:#fff;transform:translateY(2px);box-shadow:0 1px 0 #10456b;}",
      ".spotlight.dc2b .dc-zoom-btn[disabled]{opacity:.45;cursor:default;box-shadow:none;}",
      "#dcZoom{position:fixed;inset:0;z-index:70;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:24px;background:rgba(7,44,71,.94);cursor:zoom-out;}",
      "#dcZoom.open{display:flex;}",
      "#dcZoom img{max-width:94vw;max-height:84vh;width:auto;height:auto;object-fit:contain;border:4px solid #10456b;border-radius:12px;background:#0d2d5c;box-shadow:0 24px 60px rgba(0,0,0,.5);}",
      "#dcZoom .dc-zoom-cap{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:.84rem;color:#dff1fb;text-align:center;}",
      "#dcZoom .dc-zoom-cap small{display:block;font-weight:600;color:#9dc9e2;font-size:.72rem;margin-top:3px;}",
      "#dcZoom .dc-zoom-x{position:absolute;top:16px;right:18px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:3px solid #10456b;border-radius:999px;background:#fff;box-shadow:0 4px 0 #10456b;color:#10456b;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:1rem;cursor:pointer;}",
      "@media (prefers-reduced-motion:reduce){",
      "  .spotlight.dc2b .spot-inner{transition:transform .2s linear !important;}",
      "  .spotlight.dc2b .spot-card.is-flipping{animation:none !important;}",
      "}"
    ].join("\n");
    var s = document.createElement("style");
    s.id = "dc-polish-styles";
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ----------------------------------------------------- 1. orientation */
  var _aspect = {}; // url -> "landscape" | "portrait"

  function bgUrl(el) {
    if (!el) return "";
    var bg = "";
    try { bg = (el.style && el.style.backgroundImage) || ""; } catch (e) {}
    if (!bg || bg === "none") { try { bg = getComputedStyle(el).backgroundImage || ""; } catch (e2) {} }
    if (!bg || bg === "none") return "";
    var m = /url\((['"]?)(.*?)\1\)/.exec(bg);
    return m ? m[2] : "";
  }

  function mark(face, mode) {
    if (!face) return;
    face.classList.toggle("is-landscape", mode === "landscape");
    face.classList.toggle("is-portrait", mode === "portrait");
  }

  function probeAspect(url, cb) {
    if (!url) return;
    if (_aspect[url]) { cb(_aspect[url]); return; }
    var t = new Image();
    t.onload = function () {
      _aspect[url] = (t.naturalWidth > t.naturalHeight * LAND) ? "landscape" : "portrait";
      cb(_aspect[url]);
    };
    t.onerror = function () { /* orientation stays unset; presentation unchanged */ };
    t.src = url;
  }

  /* Returns true once this face has been classified. Handles all three paint
     paths: personal <img>, library <img> swap, and background-image swap. */
  function orientFace(id) {
    var face = document.getElementById(id);
    if (!face) return false;
    var img = face.querySelector("img");
    if (img && img.naturalWidth > 0) {
      mark(face, img.naturalWidth > img.naturalHeight * LAND ? "landscape" : "portrait");
      return true;
    }
    var host = face.querySelector(".photo, .spot-back-img") || face;
    var u = bgUrl(host) || bgUrl(face);
    if (u) {
      if (_aspect[u]) { mark(face, _aspect[u]); return true; }
      probeAspect(u, function (m) { mark(face, m); });
    }
    return false;
  }

  function backHasArt() {
    var back = document.getElementById("spotBack");
    if (!back) return false;
    var im = back.querySelector(".spot-back-img img, img");
    if (im && im.getAttribute("src") && !(im.complete && im.naturalWidth === 0)) return true;
    return !!(bgUrl(back.querySelector(".spot-back-img")) || bgUrl(back));
  }

  function syncBack() {
    var back = document.getElementById("spotBack");
    if (!back) return;
    if (!back.querySelector(".spot-back-empty")) {
      var ph = document.createElement("div");
      ph.className = "spot-back-empty";
      ph.innerHTML = "No back scan yet<small>Add one from Add a card, or it will paint when the library catches up.</small>";
      back.appendChild(ph);
    }
    back.classList.toggle("has-art", backHasArt());
  }

  function orientWatch() {
    var n = 0;
    var iv = setInterval(function () {
      n++;
      var a = orientFace("spotFront"), b = orientFace("spotBack");
      syncBack();
      syncZoomBtn();
      if ((a && b) || n > 14) clearInterval(iv);
    }, 220);
  }

  /* ------------------------------------------------------------ 4. zoom */
  function faceIsBack() {
    var card = document.getElementById("spotCard");
    return !!(card && card.classList.contains("flipped"));
  }

  function currentFaceArt() {
    var back = faceIsBack();
    var face = document.getElementById(back ? "spotBack" : "spotFront");
    if (!face) return null;
    var im = face.querySelector("img");
    var src = (im && im.getAttribute("src")) || "";
    if (src && im.complete && im.naturalWidth === 0) src = "";
    if (!src) src = bgUrl(face.querySelector(".photo, .spot-back-img")) || bgUrl(face);
    return src ? { url: src, side: back ? "back" : "front" } : null;
  }

  function zoomEl() {
    var z = document.getElementById("dcZoom");
    if (z) return z;
    z = document.createElement("div");
    z.id = "dcZoom";
    z.setAttribute("role", "dialog");
    z.setAttribute("aria-label", "Card scan, zoomed");
    z.innerHTML = '<button type="button" class="dc-zoom-x" aria-label="Close zoom">\u2715</button>'
      + '<img alt="card scan, zoomed">'
      + '<div class="dc-zoom-cap"></div>';
    z.addEventListener("click", function (e) { e.stopPropagation(); closeZoom(); });
    document.body.appendChild(z);
    return z;
  }

  function openZoom(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    var art = currentFaceArt();
    if (!art) return;
    var z = zoomEl();
    var im = z.querySelector("img");
    im.src = art.url;
    var name = "";
    try {
      var n = document.querySelector("#spotMeta .spot-name");
      name = n ? n.textContent.trim() : "";
    } catch (e2) {}
    z.querySelector(".dc-zoom-cap").innerHTML =
      (name ? name + " \u00b7 " : "") + (art.side === "back" ? "back" : "front")
      + "<small>Esc or click anywhere to leave the zoom</small>";
    z.classList.add("open");
  }

  function closeZoom() {
    var z = document.getElementById("dcZoom");
    if (z) z.classList.remove("open");
  }

  function zoomIsOpen() {
    var z = document.getElementById("dcZoom");
    return !!(z && z.classList.contains("open"));
  }

  function syncZoomBtn() {
    var card = document.getElementById("spotCard");
    if (!card) return;
    var btn = card.querySelector(".dc-zoom-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dc-zoom-btn";
      btn.setAttribute("data-no-flip", "1"); // flipSpot already skips buttons
      btn.innerHTML = "\u2922 Zoom";
      btn.addEventListener("click", openZoom);
      card.appendChild(btn);
    }
    var art = currentFaceArt();
    if (art) { btn.removeAttribute("disabled"); btn.title = "Zoom the " + art.side + " scan"; }
    else { btn.setAttribute("disabled", ""); btn.title = "No scan on this side yet"; }
  }

  /* Esc must leave the ZOOM before it closes the spotlight. The page's own
     Escape handler is a bubble-phase document listener, so intercept in the
     capture phase and stop it there. */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && zoomIsOpen()) {
      e.stopImmediatePropagation();
      e.preventDefault();
      closeZoom();
    }
  }, true);

  /* ------------------------------------------------------------- 2. flip */
  function hookFlip() {
    if (typeof window.flipSpot !== "function" || window.flipSpot.__polish) return true;
    var orig = window.flipSpot;
    var wrapped = function () {
      var card = document.getElementById("spotCard");
      var before = card ? card.classList.contains("flipped") : null;
      var r = orig.apply(this, arguments);
      if (card && card.classList.contains("flipped") !== before) {
        card.classList.remove("is-flipping");
        void card.offsetWidth; // restart the beat on rapid re-flips
        card.classList.add("is-flipping");
        setTimeout(function () { card.classList.remove("is-flipping"); }, 560);
        closeZoom();
        syncZoomBtn();
      }
      return r;
    };
    wrapped.__polish = true;
    window.flipSpot = wrapped;
    return true;
  }

  /* -------------------------------------------------------------- wiring */
  function afterOpen() {
    injectStyles();
    var cap = document.querySelector("#spotlight .spot-flip-cap");
    if (cap) cap.textContent = "\u21bb click card to flip \u00b7 \u2922 zoom \u00b7 Esc to close";
    syncZoomBtn();
    syncBack();
    orientFace("spotFront"); orientFace("spotBack");
    orientWatch();
  }

  function hookOpen() {
    if (typeof window.openSpot !== "function" || window.openSpot.__polish) return true;
    var orig = window.openSpot;
    var wrapped = function () {
      closeZoom();
      var r = orig.apply(this, arguments);
      try { afterOpen(); } catch (e) { console.warn(TAG, "afterOpen failed:", e); }
      return r;
    };
    wrapped.__polish = true;
    window.openSpot = wrapped;
    console.log(TAG, "openSpot + flipSpot wrapped (orientation, flip, clean back, zoom)");
    return true;
  }

  function boot() {
    injectStyles();
    var overlay = document.getElementById("spotlight");
    if (overlay) {
      /* Library art swaps src long after open; a capture-phase load listener
         re-classifies whichever face just painted. */
      overlay.addEventListener("load", function () {
        orientFace("spotFront"); orientFace("spotBack"); syncBack(); syncZoomBtn();
      }, true);
    }
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var a = hookOpen(), b = hookFlip();
      if (a && b) clearInterval(iv);
      else if (tries > 40) { clearInterval(iv); console.warn(TAG, "gave up waiting for openSpot/flipSpot"); }
    }, 150);
  }

  window.dcZoomOpen = zoomIsOpen;
  window.dcZoomClose = closeZoom;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

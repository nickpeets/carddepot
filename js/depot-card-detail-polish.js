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
      ".spotlight.dc2b #spotBack .spot-back-img{flex:1 1 0;min-height:0;height:auto;max-height:100%;margin:0 !important;aspect-ratio:auto;}",
      ".spotlight.dc2b #spotBack .spot-back-img img{width:100%;height:100%;max-height:100%;}",
      /* 2. flip: 0.5s ease-out + scale beat (rip dFlip quality bar) */
      ".spotlight.dc2b .spot-inner{transition:transform .5s cubic-bezier(.2,.85,.25,1) !important;}",
      "@keyframes dcFlipPop{0%{transform:scale(1);}38%{transform:scale(1.055);}100%{transform:scale(1);}}",
      ".spotlight.dc2b .spot-card.is-flipping{animation:dcFlipPop .5s ease-out;}",
      ".spotlight.dc2b .spot-card.is-flipping .spot-face{box-shadow:0 22px 44px rgba(7,44,71,.45);}",
      /* 3. back face = art only */
      ".spotlight.dc2b #spotBack .back-head,.spotlight.dc2b #spotBack .back-sub{display:none !important;}",
      ".spotlight.dc2b .spot-face{overflow:hidden !important;}",
      ".spotlight.dc2b #spotBack{padding:0 !important;overflow:hidden !important;gap:0 !important;}",
      ".spotlight.dc2b #spotBack .spot-back-scroll{flex:0 1 auto;min-height:0;overflow:hidden !important;margin:0 !important;}",
      ".spotlight.dc2b #spotBack .statgrid-wrap{overflow:hidden !important;margin:0 !important;}",
      ".spotlight.dc2b .spot-back-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:18px;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:.86rem;color:#5b7f97;background:#eaf5fd;}",
      ".spotlight.dc2b .spot-back-empty small{display:block;font-weight:600;font-size:.72rem;color:#8fb2c6;}",
      ".spotlight.dc2b #spotBack.has-art .spot-back-empty{display:none;}",
      /* 4. zoom */
      ".spotlight.dc2b .dc-zoom-btn{position:absolute;bottom:8px;right:8px;z-index:4;display:inline-flex;align-items:center;gap:5px;border:2px solid #10456b;border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 3px 0 #10456b;color:#10456b;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:.68rem;line-height:1;padding:5px 10px;cursor:zoom-in;}",
      ".spotlight.dc2b .dc-zoom-btn:hover{background:#fff;transform:translateY(2px);box-shadow:0 1px 0 #10456b;}",
      ".spotlight.dc2b .dc-zoom-btn[disabled]{opacity:.45;cursor:default;box-shadow:none;}",
      "#dcZoom{position:fixed;inset:0;z-index:70;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:24px;background:rgba(7,44,71,.94);cursor:zoom-out;}",
      "#dcZoom.open{display:flex;}",
      "#dcZoom .dc-zoom-stage{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;border:4px solid #10456b;border-radius:12px;background:#0d2d5c;box-shadow:0 24px 60px rgba(0,0,0,.5);cursor:zoom-in;touch-action:none;}",
      "#dcZoom.is-mag .dc-zoom-stage{cursor:grab;}",
      "#dcZoom.is-panning .dc-zoom-stage{cursor:grabbing;}",
      "#dcZoom img{display:block;max-width:none;max-height:none;width:auto;height:auto;object-fit:contain;transition:transform .18s ease-out,width .18s ease-out,height .18s ease-out;}",
      "#dcZoom .dc-zoom-lvl{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:.72rem;color:#9dc9e2;}",
      "#dcZoom .dc-zoom-cap{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:.84rem;color:#dff1fb;text-align:center;}",
      "#dcZoom .dc-zoom-cap small{display:block;font-weight:600;color:#9dc9e2;font-size:.72rem;margin-top:3px;}",
      "#dcZoom .dc-zoom-x{position:absolute;top:16px;right:18px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:3px solid #10456b;border-radius:999px;background:#fff;box-shadow:0 4px 0 #10456b;color:#10456b;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:1rem;cursor:pointer;}",
      "@media (prefers-reduced-motion:reduce){",
      "  .spotlight.dc2b .spot-inner{transition:transform .2s linear !important;}",
      "  .spotlight.dc2b .spot-card.is-flipping{animation:none !important;}",
      "  #dcZoom img{transition:none !important;}",
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

    /* ---- zoom engine: fit <-> magnified, drag pan, wheel, pinch --------- */
  var Z = { nw: 0, nh: 0, scale: 0, tx: 0, ty: 0, drag: null, pinch: null, moved: false, lastTap: 0 };

  function zoomBounds() {
    var maxW = Math.max(120, window.innerWidth * 0.94);
    var maxH = Math.max(120, window.innerHeight * 0.84);
    var fit = (Z.nw && Z.nh) ? Math.min(maxW / Z.nw, maxH / Z.nh) : 1;
    if (!isFinite(fit) || fit <= 0) fit = 1;
    return { maxW: maxW, maxH: maxH, fit: fit,
             mag: Math.max(2, fit * 2),   /* the genuinely magnified level */
             start: Math.max(fit, 2),     /* open at fit-to-viewport OR 2x natural, whichever is larger */
             lo: Math.min(fit, 1), hi: Math.max(fit * 4, 6) };
  }

  function touchDist(t) {
    var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function paintZoom() {
    var z = document.getElementById("dcZoom");
    if (!z || !Z.nw || !Z.scale) return;
    var stage = z.querySelector(".dc-zoom-stage"), im = z.querySelector("img");
    if (!stage || !im) return;
    var B = zoomBounds();
    var w = Math.round(Z.nw * Z.scale), h = Math.round(Z.nh * Z.scale);
    var sw = Math.min(w, Math.round(B.maxW)), sh = Math.min(h, Math.round(B.maxH));
    stage.style.width = sw + "px"; stage.style.height = sh + "px";
    im.style.width = w + "px"; im.style.height = h + "px";
    var mx = Math.max(0, (w - sw) / 2), my = Math.max(0, (h - sh) / 2);
    if (Z.tx > mx) Z.tx = mx;
    if (Z.tx < -mx) Z.tx = -mx;
    if (Z.ty > my) Z.ty = my;
    if (Z.ty < -my) Z.ty = -my;
    im.style.transform = "translate(" + Z.tx.toFixed(1) + "px," + Z.ty.toFixed(1) + "px)";
    z.classList.toggle("is-mag", Z.scale > B.fit * 1.01);
    var lvl = z.querySelector(".dc-zoom-lvl");
    if (lvl) lvl.textContent = Math.round(Z.scale * 100) + "% of scan \u00b7 " + w + "\u00d7" + h + " px";
  }

  function setZoomScale(s, keepPan) {
    var B = zoomBounds();
    if (!(s > 0)) s = B.start;
    if (s < B.lo) s = B.lo;
    if (s > B.hi) s = B.hi;
    Z.scale = s;
    if (!keepPan) { Z.tx = 0; Z.ty = 0; }
    paintZoom();
  }

  function measureZoom(im) {
    if (!im || !im.naturalWidth) return;
    Z.nw = im.naturalWidth; Z.nh = im.naturalHeight;
    setZoomScale(zoomBounds().start, false);
  }

  function toggleZoomLevel() {
    if (!Z.nw) return;
    var B = zoomBounds();
    setZoomScale(Z.scale > B.fit * 1.01 ? B.fit : B.mag, false);
  }

  function onStage(e) {
    var t = e.target;
    return !!(t && t.closest && t.closest(".dc-zoom-stage"));
  }

  function bindZoom(z) {
    z.addEventListener("click", function (e) {
      e.stopPropagation();
      if (Z.moved) { Z.moved = false; return; }
      if (onStage(e)) toggleZoomLevel(); else closeZoom();
    });
    z.addEventListener("wheel", function (e) {
      if (!Z.nw) return;
      e.preventDefault();
      setZoomScale(Z.scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18), true);
    }, { passive: false });
    z.addEventListener("mousedown", function (e) {
      if (!Z.nw || e.button !== 0 || !onStage(e)) return;
      Z.drag = { x: e.clientX, y: e.clientY, tx: Z.tx, ty: Z.ty };
      Z.moved = false;
      z.classList.add("is-panning");
      e.preventDefault();
    });
    document.addEventListener("mousemove", function (e) {
      if (!Z.drag) return;
      var dx = e.clientX - Z.drag.x, dy = e.clientY - Z.drag.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) Z.moved = true;
      Z.tx = Z.drag.tx + dx; Z.ty = Z.drag.ty + dy;
      paintZoom();
    });
    document.addEventListener("mouseup", function () {
      if (!Z.drag) return;
      Z.drag = null;
      var zz = document.getElementById("dcZoom");
      if (zz) zz.classList.remove("is-panning");
    });
    z.addEventListener("touchstart", function (e) {
      if (!Z.nw) return;
      if (e.touches.length === 2) { Z.pinch = { d: touchDist(e.touches), s: Z.scale }; Z.drag = null; }
      else if (e.touches.length === 1) { Z.drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: Z.tx, ty: Z.ty }; Z.moved = false; }
    }, { passive: true });
    z.addEventListener("touchmove", function (e) {
      if (!Z.nw) return;
      if (Z.pinch && e.touches.length === 2) {
        e.preventDefault();
        if (Z.pinch.d > 0) setZoomScale(Z.pinch.s * (touchDist(e.touches) / Z.pinch.d), true);
      } else if (Z.drag && e.touches.length === 1) {
        e.preventDefault();
        var dx = e.touches[0].clientX - Z.drag.x, dy = e.touches[0].clientY - Z.drag.y;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) Z.moved = true;
        Z.tx = Z.drag.tx + dx; Z.ty = Z.drag.ty + dy;
        paintZoom();
      }
    }, { passive: false });
    z.addEventListener("touchend", function (e) {
      Z.pinch = null;
      var wasDrag = Z.moved;
      Z.drag = null;
      if (!wasDrag && e.changedTouches && e.changedTouches.length === 1) {
        var t = Date.now();
        if (t - Z.lastTap < 320) { toggleZoomLevel(); Z.lastTap = 0; } else Z.lastTap = t;
      }
      Z.moved = false;
    }, { passive: true });
    window.addEventListener("resize", function () { if (zoomIsOpen()) paintZoom(); });
  }

  function zoomEl() {
    var z = document.getElementById("dcZoom");
    if (z) return z;
    z = document.createElement("div");
    z.id = "dcZoom";
    z.setAttribute("role", "dialog");
    z.setAttribute("aria-label", "Card scan, zoomed");
    z.innerHTML = '<button type="button" class="dc-zoom-x" aria-label="Close zoom">\u2715</button>'
      + '<div class="dc-zoom-stage"><img alt="card scan, zoomed"></div>'
      + '<div class="dc-zoom-cap"></div>' + '<div class="dc-zoom-lvl"></div>';
    bindZoom(z);
    document.body.appendChild(z);
    return z;
  }

  function openZoom(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    var art = currentFaceArt();
    if (!art) return;
    var z = zoomEl();
    var im = z.querySelector("img");
    Z.nw = 0; Z.nh = 0; Z.scale = 0; Z.tx = 0; Z.ty = 0;
    im.removeAttribute("style");
    im.onload = function () { measureZoom(im); };
    im.src = art.url;
    if (im.complete && im.naturalWidth) measureZoom(im);
    var name = "";
    try {
      var n = document.querySelector("#spotMeta .spot-name");
      name = n ? n.textContent.trim() : "";
    } catch (e2) {}
    z.querySelector(".dc-zoom-cap").innerHTML =
      (name ? name + " \u00b7 " : "") + (art.side === "back" ? "back" : "front")
      + "<small>Click the card to magnify \u00b7 drag to pan \u00b7 Esc or click outside to close</small>";
    z.classList.add("open");
  }

  function closeZoom() {
    var z = document.getElementById("dcZoom");
    if (z) { z.classList.remove("open"); z.classList.remove("is-mag"); z.classList.remove("is-panning"); }
    Z.nw = 0; Z.nh = 0; Z.scale = 0; Z.tx = 0; Z.ty = 0; Z.drag = null; Z.pinch = null; Z.moved = false;
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
    (window.depotLog||function(){})(TAG, "openSpot + flipSpot wrapped (orientation, flip, clean back, zoom)");
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

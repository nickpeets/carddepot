/* ============================================================================
   depot-card-detail-2b.js  -  Card Detail redesign to canonical option 2b
   ----------------------------------------------------------------------------
   ADDITIVE, presentation-only. Restructures the existing spotlight (the
   click-into-a-card screen) into the 2b two-column layout WITHOUT touching:
     - photo resolution (frontPhoto / backPhoto / depotResolveCardPhotos)  [RESOLVER]
     - the prestige ENGINE / how prestige is computed (js/depot-prestige.js) [FROZEN]
     - what grade / star / notes DO (d4SetGrade / d4ToggleStar / d4SetCond)
   It relocates + restyles DOM the existing runtime already produces, and swaps
   the grade <select> for a pill stepper that writes the SAME grade values.
   ========================================================================== */
(function () {
  "use strict";
  var TAG = "[depot][card2b]";

  // grade value set: byte-identical to the current dropdown. " " (blank) shows
  // as an em-dash; the stepper writes these exact strings via d4SetGrade, so
  // saved data + prestige reads are unchanged (mechanics frozen).
  var GRADES = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "GEM 10", "AUTH"];

  function gradeIndex(v) {
    var i = GRADES.indexOf(v == null ? "" : String(v));
    return i < 0 ? 0 : i;
  }

  function injectStyles() {
    if (document.getElementById("dc2b-styles")) return;
    var css = [
      ".spotlight.dc2b .spot-shell{position:relative;display:flex;align-items:flex-start;justify-content:center;}",
      ".spotlight.dc2b .spot-shell{background:#2eb2e6;border:4px solid #10456b;border-radius:26px;box-shadow:0 8px 0 #0c3556;padding:16px;flex-direction:column;gap:12px;max-width:760px;width:min(760px,94vw);}",
      ".dc2b .spot-2b-head{display:flex;align-items:center;justify-content:flex-start;width:100%;padding:2px 4px 0;}",
      ".dc2b .spot-back-to-binder{display:inline-flex;align-items:center;gap:6px;border:3px solid #10456b;border-radius:999px;background:#fff;box-shadow:0 4px 0 #10456b;color:#10456b;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:.82rem;padding:6px 14px;cursor:pointer;line-height:1;}",
      ".dc2b .spot-back-to-binder:hover{transform:translateY(2px);box-shadow:0 2px 0 #10456b;}",
      ".spotlight.dc2b .spot-shell .spot-2col{width:100%;}",
      ".dc2b .spot-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:2px 0 0;}",
      ".dc2b .spot-chip{display:inline-flex;align-items:baseline;gap:4px;border:2px solid #10456b;border-radius:999px;background:#dff1fb;color:#10456b;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:.62rem;letter-spacing:.02em;padding:3px 9px;line-height:1.2;}",
      ".dc2b .spot-chip b{font-weight:800;color:#10456b;}",
      ".dc2b .spot-chip .k{color:#5b7f97;font-weight:800;}",
      ".dc2b .spot-2col{display:grid;grid-template-columns:266px minmax(0,420px);gap:20px;align-items:start;background:#fff;border:4px solid #10456b;border-radius:20px;box-shadow:0 7px 0 #10456b;padding:20px;max-height:92vh;overflow:auto;font-family:'Baloo 2',sans-serif;}",
      ".dc2b .spot-close{position:absolute;top:-16px;right:-16px;left:auto;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:#fff;border:3px solid #10456b;box-shadow:0 4px 0 #10456b;color:#10456b;font-weight:800;font-size:1rem;cursor:pointer;z-index:5;font-family:'Baloo 2',sans-serif;}",
      ".dc2b .spot-close:hover{transform:translateY(2px);box-shadow:0 2px 0 #10456b;}",
      ".dc2b .spot-col-left{display:flex;flex-direction:column;align-items:stretch;gap:10px;width:266px;}",
      ".dc2b .spot-card{position:relative;perspective:1000px;width:266px;aspect-ratio:5/7;cursor:pointer;margin:0;}",
      ".dc2b .spot-inner{transition:transform .6s;}",
      ".dc2b .spot-flip-cap{display:block;text-align:center;font-size:.72rem;font-weight:700;color:#5b7f97;}",
      ".dc2b .spot-prestige:empty{display:none;}",
      ".dc2b .spot-prestige .depot-prestige-breakdown{margin:0;padding:12px 14px;border:3px solid #072c47;border-radius:16px;background:#10456b;box-shadow:0 4px 0 #072c47;font-family:'Baloo 2',sans-serif;color:#dff1fb;}",
      ".dc2b .spot-prestige .dp-head{display:flex;align-items:baseline;gap:8px;margin:0 0 8px;font-weight:800;}",
      ".dc2b .spot-prestige .dp-head .dp-total{font-family:'VT323',monospace;font-size:2.2rem;line-height:1;color:#ffd23e;}",
      ".dc2b .spot-prestige .dp-head .dp-lab{font-size:.7rem;letter-spacing:.06em;color:#c8ecfb;}",
      ".dc2b .spot-prestige .dp-head .dp-lab::before{content:\"🏆 \";}",
      ".dc2b .spot-prestige .dp-row{display:inline-flex;justify-content:space-between;gap:6px;margin:3px 4px 0 0;padding:3px 9px;border:1px solid #0c3556;border-radius:999px;background:#0c3556;font-size:.72rem;}",
      ".dc2b .spot-prestige .dp-k{color:#8fb2c6;font-weight:700;}",
      ".dc2b .spot-prestige .dp-v{color:#fff;font-weight:800;margin-left:4px;}",
      ".dc2b .spot-prestige .dp-total-row{display:block;width:100%;border:none;background:none;margin-top:6px;color:#ffd23e;font-weight:800;}",
      ".dc2b .spot-prestige .dp-note{display:block;width:100%;color:#8fb2c6;font-size:.66rem;margin-top:6px;}",
      ".dc2b .spot-col-right{display:flex;flex-direction:column;gap:14px;min-width:0;}",
      ".dc2b .spot-meta{background:none;border:none;box-shadow:none;padding:0;border-radius:0;color:#10456b;}",
      ".dc2b .spot-meta .spot-name{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:1.15rem;color:#10456b;margin-bottom:2px;}",
      ".dc2b .spot-meta .spot-set-sub{font-size:.8rem;color:#5b7f97;font-weight:700;margin-bottom:8px;}",
      ".dc2b .spot-meta .hint{display:none;}",
      ".dc2b .spot-statblock{background:#f2f9fd;border:3px solid #10456b;border-radius:14px;box-shadow:0 4px 0 #10456b;padding:10px 12px;}",
      ".dc2b .spot-statblock .statblock-head{font-family:'Press Start 2P',monospace;font-size:.62rem;color:#10456b;margin-bottom:8px;letter-spacing:.02em;}",
      ".dc2b .v2-d4{background:#fff7df;border:3px solid #ffd23e;border-radius:16px;box-shadow:0 4px 0 #e9be2f;padding:12px 14px;display:flex;flex-direction:column;gap:10px;}",
      ".dc2b .v2-d4-tray-head{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:.85rem;color:#7a5b00;margin:0 0 2px;}",
      ".dc2b .v2-d4-row{display:flex;align-items:center;gap:10px;}",
      ".dc2b .v2-d4-lab{flex:0 0 54px;font-size:.7rem;font-weight:800;text-transform:uppercase;color:#7a5b00;letter-spacing:.04em;}",
      ".dc2b .v2-grade-step{display:inline-flex;align-items:center;border:2px solid #10456b;border-radius:999px;background:#fff;box-shadow:0 3px 0 #10456b;overflow:hidden;}",
      ".dc2b .v2-grade-step button{border:none;background:#dff1fb;color:#10456b;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:1rem;width:30px;height:28px;line-height:1;cursor:pointer;}",
      ".dc2b .v2-grade-step button:hover{background:#bfe4f7;}",
      ".dc2b .v2-grade-step .v2-grade-val{min-width:64px;text-align:center;padding:0 10px;font-weight:800;color:#10456b;font-size:.82rem;background:#fff;}",
      ".dc2b .v2-grade-step .v2-grade-val.is-blank{color:#8fb2c6;}",
      ".dc2b .v2-star-toggle{cursor:pointer;border:2px solid #10456b;border-radius:999px;padding:5px 14px;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:.8rem;box-shadow:0 3px 0 #10456b;background:#fff;color:#10456b;}",
      ".dc2b .v2-star-toggle[aria-pressed=\"true\"]{background:linear-gradient(#fff8,#fff0 45%),#ffd23e;color:#7a5b00;}",
      ".dc2b .v2-star-toggle:hover{transform:translateY(2px);box-shadow:0 1px 0 #10456b;}",
      ".dc2b .v2-d4-row.notes{align-items:flex-start;}",
      ".dc2b .v2-cond-input{flex:1;min-height:60px;border:2px solid #10456b;border-radius:12px;background:#fff;color:#10456b;font-family:'Baloo 2',sans-serif;font-size:.8rem;padding:8px 10px;resize:vertical;}",
      ".dc2b .v2-d4-status{font-size:.72rem;color:#1d6b2a;font-weight:700;min-height:1em;}",
      "@media (max-width:640px){.dc2b .spot-2col{grid-template-columns:1fr;width:min(390px,92vw);gap:14px;padding:16px;}.dc2b .spot-col-left,.dc2b .spot-card{width:100%;}.dc2b .spot-card{max-width:266px;margin:0 auto;}.dc2b .spot-close{top:-14px;right:-6px;}}",
      "@media (prefers-reduced-motion:reduce){.dc2b .spot-inner{transition:none !important;}}"
    ].join("\n");
    var s = document.createElement("style");
    s.id = "dc2b-styles";
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---- 2. one-time DOM restructure into the 2b two-column shell ----
  function ensureStructure() {
    var overlay = document.getElementById("spotlight");
    if (!overlay || overlay.classList.contains("dc2b")) return true;
    var card = document.getElementById("spotCard");
    var meta = document.getElementById("spotMeta");
    var close = overlay.querySelector(".spot-close");
    if (!card || !meta) { console.warn(TAG, "missing spotCard/spotMeta; skipping restructure"); return false; }

    var shell = document.createElement("div");
    shell.className = "spot-shell";
    var grid = document.createElement("div");
    grid.className = "spot-2col";
    var left = document.createElement("div");
    left.className = "spot-col-left";
    var right = document.createElement("div");
    right.className = "spot-col-right";

    // close X becomes a direct child of the shell (outside the card, upper-right)
    // 2b header: "back to binder" affordance pill (mirrors the design header)
    var head2b = document.createElement("div");
    head2b.className = "spot-2b-head";
    var backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "spot-back-to-binder";
    backBtn.innerHTML = "\u2039 Back to binder";
    backBtn.addEventListener("click", function () {
      var x = document.querySelector("#spotlight .spot-close");
      if (x) x.click(); else { overlay.classList.remove("open"); }
    });
    head2b.appendChild(backBtn);
    shell.appendChild(head2b);
    if (close) shell.appendChild(close);
    shell.appendChild(grid);
    grid.appendChild(left);
    grid.appendChild(right);

    // LEFT: flip card, caption, prestige panel
    left.appendChild(card);
    var cap = document.createElement("span");
    cap.className = "spot-flip-cap";
    cap.textContent = "\u21bb click card to flip \u00b7 Esc to close";
    left.appendChild(cap);
    // 2b left-column stat chips (populated in refreshMeta from the card meta)
    var chips = document.createElement("div");
    chips.className = "spot-chips";
    chips.id = "spotChips";
    left.appendChild(chips);
    var prest = document.createElement("div");
    prest.className = "spot-prestige";
    prest.id = "spotPrestige";
    left.appendChild(prest);

    // RIGHT: the meta panel (stat block + owner tray get arranged in refresh())
    right.appendChild(meta);

    overlay.appendChild(shell);
    overlay.classList.add("dc2b");
    return true;
  }

  // ---- 3. relocate the engine-injected prestige breakdown into #spotPrestige ----
  function relocatePrestige() {
    var host = document.getElementById("spotPrestige");
    if (!host) return;
    // the prestige ENGINE injects .depot-prestige-breakdown somewhere in the overlay;
    // move it verbatim into our navy panel. Presentation only; engine untouched.
    var overlay = document.getElementById("spotlight");
    var bd = overlay ? overlay.querySelector(".depot-prestige-breakdown") : null;
    if (bd && bd.parentNode !== host) {
      host.innerHTML = "";
      host.appendChild(bd);
      // mirror the gold band flag so the score colours correctly
      if (bd.classList.contains("is-gold") || /band-(gold|elite|legendary)/.test(bd.className)) host.classList.add("is-gold");
      else host.classList.remove("is-gold");
    }
  }

  // ---- 4. build the grade STEPPER (replaces the <select>, same values) ----
  function buildStepper(meta) {
    var sel = meta.querySelector("#d4GradeSel");
    var val = meta.querySelector("#d4GradeVal");
    if (!sel || sel.dataset.dc2b) return;
    var cur = sel.value;
    var wrap = document.createElement("span");
    wrap.className = "v2-grade-step";
    wrap.setAttribute("data-no-flip", "1"); // belt: flipSpot already skips buttons
    var minus = document.createElement("button");
    minus.type = "button"; minus.textContent = "\u2013"; minus.setAttribute("aria-label", "lower grade");
    var out = document.createElement("span");
    out.className = "v2-grade-val" + (cur ? "" : " is-blank");
    out.id = "d4GradeValStep"; // was "d4GradeVal" -> caused DUPLICATE id; step()/d4SetGrade grabbed the wrong node
    out.textContent = cur ? cur : "\u2014";
    var plus = document.createElement("button");
    plus.type = "button"; plus.textContent = "+"; plus.setAttribute("aria-label", "raise grade");

    function step(dir, e) {
      if (e) e.stopPropagation();
      var i = gradeIndex(sel.value);
      i = (i + dir + GRADES.length) % GRADES.length; // cycle
      var next = GRADES[i];
      // drive the SAME save path the dropdown used
      if (typeof window.d4SetGrade === "function") window.d4SetGrade(next);
      // d4SetGrade rebuilds #d4GradeVal text/class; keep the hidden select in sync too
      sel.value = next;
      var live = out; // direct ref to the span we built (was querySelector("#d4GradeVal") -> hit the wrong duplicate)
      if (live) { live.textContent = next ? next : "\u2014"; live.className = "v2-grade-val" + (next ? "" : " is-blank"); }
    }
    minus.addEventListener("click", function (e) { step(-1, e); });
    plus.addEventListener("click", function (e) { step(1, e); });

    wrap.appendChild(minus); wrap.appendChild(out); wrap.appendChild(plus);
    // hide the native select, keep it in the DOM as the value mirror
    sel.style.display = "none";
    sel.dataset.dc2b = "1";
    if (val && val !== out) val.style.display = "none"; // old display span
    sel.parentNode.insertBefore(wrap, sel);
  }

  // ---- 5. arrange the RIGHT column: name/set, stat block, owner tray ----
  function refreshMeta() {
    var meta = document.getElementById("spotMeta");
    var back = document.getElementById("spotBack");
    if (!meta) return;

    // name + set line at the top (name already emitted by openSpot as .spot-name)
    // spotIdx and COLLECTION are BARE globals (script-scoped let/const in the page),
    // NOT window properties. Reading them off window always gave null, which is why
    // the .spot-set-sub line below never rendered. Resolve with the typeof pattern.
    var idx = null, col = null;
    try {
      idx = (typeof spotIdx === "number") ? spotIdx : null;
      col = (typeof COLLECTION !== "undefined") ? COLLECTION : null;
    } catch (e) { idx = null; col = null; }
    var c = (idx != null && col) ? col[idx] : null;
    var nameEl = meta.querySelector(".spot-name");
    if (c && nameEl && !meta.querySelector(".spot-set-sub")) {
      var sub = document.createElement("div");
      sub.className = "spot-set-sub";
      var bits = [];
      if (c.yr) bits.push(c.yr);
      if (c.set) bits.push(c.set);
      if (c.num) bits.push("#" + c.num);
      sub.textContent = bits.join(" \u00b7 ");
      nameEl.insertAdjacentElement("afterend", sub);
    }

    // STAT BLOCK: relocate the season stat grids (built by statTable on the back)
    // into the right column, under a "YEAR season - batting line" heading, so the
    // card back is just the back scan (2b: back = back-scan).
    if (!meta.querySelector(".spot-statblock")) {
      var scroll = back ? back.querySelector(".spot-back-scroll") : null;
      var block = document.createElement("div");
      block.className = "spot-statblock";
      var head = document.createElement("div");
      head.className = "statblock-head";
      // c is resolved with the typeof pattern at the top of refreshMeta, so the
      // heading now sees the real card instead of always reading "batting line".
      var statCard = c;
      var yr = statCard && statCard.yr ? statCard.yr : "";
      var kind = (statCard && typeof window.cardType === "function" && window.cardType(statCard) === "pitcher") ? "pitching line" : "batting line";
      head.textContent = (yr ? (yr + " SEASON \u2014 ") : "SEASON \u2014 ") + kind;
      block.appendChild(head);
      if (scroll) { block.appendChild(scroll); } // move the grids verbatim
      else { var ns = document.createElement("div"); ns.className = "no-stats"; ns.textContent = "No stats recorded yet."; block.appendChild(ns); }
      // insert stat block ABOVE the owner tray
      var tray = meta.querySelector(".v2-d4");
      if (tray) meta.insertBefore(block, tray); else meta.appendChild(block);
    }

    // OWNER-CONTROLS TRAY: add a heading + notes-row class + build the stepper
    var tray = meta.querySelector(".v2-d4");
    if (tray && !tray.querySelector(".v2-d4-tray-head")) {
      var th = document.createElement("div");
      th.className = "v2-d4-tray-head";
      th.textContent = "Your copy";
      tray.insertBefore(th, tray.firstChild);
    }
    if (tray) {
      var rows = tray.querySelectorAll(".v2-d4-row");
      // mark the notes row (the one containing the textarea) for align-items:flex-start
      var taRow = tray.querySelector(".v2-cond-input");
      if (taRow && taRow.closest(".v2-d4-row")) taRow.closest(".v2-d4-row").classList.add("notes");
    }
    // 2b: populate left-column stat chips from the card meta already in the DOM
    try {
      var chipHost = document.getElementById("spotChips");
      if (chipHost) {
        chipHost.innerHTML = "";
        // Task B: the back face no longer carries a text overlay, so the
        // chips read the resolved card directly instead of scraping .back-sub.
        var chipYear = (c && c.yr) ? String(c.yr) : "";
        var chipSet = (c && c.set) ? String(c.set).toUpperCase() : "";
        function addChip(k, v) {
          if (!v) return;
          var el = document.createElement("span");
          el.className = "spot-chip";
          el.innerHTML = "<span class=\"k\">" + k + "</span> <b>" + v + "</b>";
          chipHost.appendChild(el);
        }
        addChip("YEAR", chipYear);
        addChip("SET", chipSet);
        var gsel = document.getElementById("d4GradeSel");
        var gval = gsel ? (gsel.value || "").trim() : "";
        if (gval && /^(\d{1,2}|GEM 10|AUTH)$/i.test(gval)) addChip("GRADE", gval);
        chipHost.style.display = chipHost.children.length ? "flex" : "none";
      }
    } catch (e) { console.warn(TAG, "chip build failed:", e); }
    buildStepper(meta);
  }

  function afterOpen() {
    injectStyles();
    if (!ensureStructure()) return;
    refreshMeta();
    relocatePrestige();
  }

  // ---- 6. wrap openSpot (runs AFTER the original builds spotFront/Back/Meta) ----
  function hook() {
    if (typeof window.openSpot !== "function") { console.warn(TAG, "openSpot not present; retrying"); return false; }
    if (window.openSpot.__dc2b) return true;
    var orig = window.openSpot;
    var wrapped = function (idx) {
      var r = orig.apply(this, arguments);
      try { afterOpen(); } catch (e) { console.warn(TAG, "afterOpen failed:", e); }
      return r;
    };
    wrapped.__dc2b = true;
    window.openSpot = wrapped;
    console.log(TAG, "openSpot wrapped (2b layout active)");
    return true;
  }

  // The prestige engine ALSO wraps openSpot and injects the breakdown; wrap order
  // is not guaranteed, so also watch the overlay and relocate on any injection.
  function watchPrestige() {
    var overlay = document.getElementById("spotlight");
    if (!overlay) return;
    var mo = new MutationObserver(function () {
      if (overlay.classList.contains("dc2b")) relocatePrestige();
    });
    mo.observe(overlay, { childList: true, subtree: true });
  }

  function boot() {
    injectStyles();
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var ok = hook();
      if (ok) { watchPrestige(); clearInterval(iv); }
      else if (tries > 40) { clearInterval(iv); console.warn(TAG, "gave up waiting for openSpot after 40 tries"); }
    }, 150);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

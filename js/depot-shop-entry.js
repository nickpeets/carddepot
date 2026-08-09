/*
 * js/depot-shop-entry.js  --  Header PACK SHOP entry button (ADDITIVE).
 *
 * Injects a ghost-button-in-chrome into the shell header, next to
 * .depot-account, on every page that loads this file. Does NOT touch the
 * 4-tab nav (TABS[] in depot-shell.js) -- the nav is unchanged, so its
 * measured height/wrap and the season-writeback nav guard are untouched.
 *
 * Because it is a normal departure <a href>, the shell's writeback guard
 * (depot-*-shell.js) automatically holds navigation while a season writeback
 * is pending -- exactly the behavior we want.
 *
 * Idempotent + self-healing: the shell re-renders its chrome on a clock, so we
 * re-assert the button from a MutationObserver + interval, mirroring the
 * defensive pattern in the game shell (phantom-reference-bug family, AGENTS.md).
 */
(function () {
  var TAG = '[depot] shop-entry:';
  var BTN_ID = 'depotShopEntry';

  // Resolve the shop URL relative to where this page lives. Shell pages live at
  // repo root (index.html) and under game/ (game/index.html, game/builder.html).
  function shopHref() {
    var p = (location.pathname || '');
    // if we're under /game/, shop.html is a sibling; else it's game/shop.html
    return /\/game\//.test(p) ? 'shop.html' : 'game/shop.html';
  }

  function ensureButton() {
    var header = document.querySelector('.depot-shell__header');
    if (!header) return false; // shell not mounted yet
    if (document.getElementById(BTN_ID)) return true; // already present
    var acct = header.querySelector('[data-depot-account]') ||
               header.querySelector('.depot-account');
    var a = document.createElement('a');
    a.id = BTN_ID;
    a.className = 'btn-ghost depot-shop-entry';
    a.setAttribute('role', 'button');
    a.href = shopHref();
    a.innerHTML = '<span class="coin" aria-hidden="true">&#36;</span> PACK SHOP';
    a.title = 'Open the Pack Shop';
    // Place just before the account block so it sits in the header chrome.
    if (acct && acct.parentNode) { acct.parentNode.insertBefore(a, acct); }
    else { header.appendChild(a); }
    return true;
  }

  function start() {
    var ok = ensureButton();
    // Re-assert against shell re-renders (idempotent; only creates if missing).
    try {
      var obs = new MutationObserver(function () { ensureButton(); });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { /* observer unavailable: fall back to interval only */ }
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      ensureButton();
      if (tries > 40) clearInterval(iv); // ~stop after a while; observer carries on
    }, 500);
    try { (window.depotLog||function(){})(TAG + ' entry button ' + (ok ? 'mounted' : 'deferred (shell not ready)')); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }
})();

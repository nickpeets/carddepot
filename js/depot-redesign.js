/* js/depot-redesign.js - THE DEPOT REDESIGN, FOUNDATION RUNTIME (Phase 1)
 *
 * Pairs with css/depot-redesign.css. Chapters 01 (nav & header), 02 (log in +
 * locked collection) and 12 (the state library) from build_package.
 *
 * SHAPE OF THIS MODULE - it is an ENHANCER, not a replacement.
 *   js/depot-shell.js still owns the shell, still resolves the franchise, still
 *   paints the account cluster. This file re-dresses what the shell mounted and
 *   MOVES the shell's own nodes into the new frame instead of re-creating them,
 *   so every data hook the shell queries ([data-depot-email], [data-depot-logout],
 *   [data-depot-navtitle]) and every inline onclick in index.html survives.
 *   Same for the auth modal: the inputs, #authSubmitBtn and #authToggleLink are
 *   the ORIGINAL nodes, re-parented. Nothing is cloned - cloning would drop the
 *   listeners and that is exactly the class of bug AGENTS.md 3 is about.
 *
 * It also lands one thing the shell has always wanted and never had: a
 * [data-depot-franchise] identity plate. depot-shell.js's setFranchise() has
 * been querying for one since session 1 and warning "no identity block" on every
 * surface because shellHtml() never rendered it. Chapter 01 draws it, so this
 * file supplies it and the existing painter starts working with no change to it.
 *
 * Fail-loud per AGENTS.md 4: every bail names the missing thing.
 * Kill switch: ?rd=0 in the URL, or localStorage depot_rd_off=1.
 */
(function () {
  'use strict';

  var TAG = '[depot-rd]';
  function warn(m, x){ try { console.warn(TAG + ' ' + m, (x === undefined ? '' : x)); } catch (e) {} }
  function log(m){ try { console.log(TAG + ' ' + m); } catch (e) {} }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c){
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c];
    });
  }

  function enabled(){
    try {
      if (/[?&]rd=0(&|$)/.test(location.search)){ log('redesign disabled by ?rd=0'); return false; }
      if (window.localStorage && localStorage.getItem('depot_rd_off') === '1'){
        log('redesign disabled by localStorage depot_rd_off=1'); return false;
      }
    } catch (e){ warn('kill-switch read threw; staying ENABLED:', e && e.message); }
    return true;
  }

  /* prefers-reduced-motion, read live (a user can flip it mid-session) */
  function reduced(){
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e){ warn('matchMedia unavailable; assuming motion is fine:', e && e.message); return false; }
  }

  /* ---- the coin ---------------------------------------------------------
   * Two backface-hidden faces + a glint pixel. One full flip every 4.5s, and
   * under reduced motion the animation classes are simply not attached (the
   * CSS media query would neutralise them anyway - this saves the work).
   */
  function coinFace(back){
    return '<div class="rd-coin__face' + (back ? ' rd-coin__face--b' : '') + '">' +
             '<div class="rd-coin__ring"><span class="rd-coin__mark">$</span></div>' +
             '<span class="rd-coin__px rd-coin__px--1"></span>' +
             '<span class="rd-coin__px rd-coin__px--2"></span>' +
           '</div>';
  }
  function coinHTML(){
    var m = reduced();
    return '<span class="rd-coin" aria-hidden="true">' +
             '<span class="rd-coin__spin' + (m ? '' : ' rd-m-coinspin') + '">' +
               coinFace(false) + coinFace(true) +
               '<span class="rd-coin__glint' + (m ? '' : ' rd-m-coinglint') + '"></span>' +
             '</span>' +
           '</span>';
  }

  function walletHTML(){
    return '<span class="rd-wallet is-anon" data-rd-wallet>' + coinHTML() +
             '<span class="rd-wallet__val">' +
               '<span class="rd-wallet__amt" data-rd-balance>\u2014</span>' +
               '<span class="rd-wallet__unit">coins</span>' +
             '</span>' +
           '</span>';
  }

  /* Balance. Read-only: getBalance() is a SELECT. Nothing in phase 1 moves a
   * coin - the money path is phase 4 and it is sacred (RUNBOOK 4). */
  function paintBalance(n){
    var nodes = document.querySelectorAll('[data-rd-balance]');
    if (!nodes.length){ warn('paintBalance: no [data-rd-balance] node; balance not shown'); return; }
    var txt = (n == null) ? '\u2014' : Number(n).toLocaleString();
    for (var i = 0; i < nodes.length; i++){
      nodes[i].textContent = txt;
      var w = nodes[i].closest ? nodes[i].closest('.rd-wallet') : null;
      if (w){ w.classList.toggle('is-anon', n == null); }
    }
  }
  function refreshBalance(){
    if (!window.DepotWallet || typeof window.DepotWallet.getBalance !== 'function'){
      warn('refreshBalance: window.DepotWallet.getBalance missing; wallet stays "\u2014"');
      paintBalance(null); return Promise.resolve(null);
    }
    return window.DepotWallet.getBalance().then(function (bal){
      paintBalance(bal);
      return bal;
    }).catch(function (e){
      warn('refreshBalance: getBalance threw; wallet stays "\u2014":', e && e.message);
      paintBalance(null); return null;
    });
  }

  /* ======================================================================
     CHAPTER 01 - dress the shell header
     ====================================================================== */
  function ce(tag, cls){ var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  function plateHTML(){
    /* The class names the SHELL queries (.name / .record / [data-depot-season]
       / [data-depot-streak]) are kept verbatim so depot-shell.js paints this
       with no change to depot-shell.js. */
    return '<div class="rd-plate is-anon" data-depot-franchise>' +
             '<span class="rd-plate__id">' +
               '<span class="rd-plate__team name"></span>' +
               '<span class="rd-plate__line">' +
                 '<span class="rd-plate__rec record"></span>' +
                 '<span class="rd-plate__season" data-depot-season></span>' +
                 '<span class="rd-plate__streak is-empty" data-depot-streak></span>' +
               '</span>' +
             '</span>' +
             '<span class="rd-plate__rule" aria-hidden="true"></span>' +
             walletHTML() +
           '</div>';
  }

  function dressHeader(){
    var host = document.querySelector('.depot-shell__header');
    if (!host){ warn('dressHeader: no .depot-shell__header in the document; chapter 01 not applied'); return false; }
    if (host.getAttribute('data-rd-dressed') === '1'){ return false; }  /* already dressed - no work done */

    var wordmark = host.querySelector('.depot-wordmark');
    var tile     = host.querySelector('.v2-logo-tile');
    var subtitle = host.querySelector('[data-depot-subtitle]');
    var account  = host.querySelector('[data-depot-account]') || host.querySelector('.depot-account');
    var email    = host.querySelector('[data-depot-email]');
    var logout   = host.querySelector('[data-depot-logout]');
    var bell     = host.querySelector('.depot-bell');

    var left = ce('span', 'rd-header__left');
    if (tile){ tile.className = 'rd-logo'; left.appendChild(tile); }
    else { left.insertAdjacentHTML('beforeend', '<span class="rd-logo" aria-hidden="true">D</span>');
           warn('dressHeader: no .v2-logo-tile to reuse; rendered a fresh logo tile'); }
    if (wordmark){ wordmark.className = 'rd-wordmark'; left.appendChild(wordmark); }
    else { left.insertAdjacentHTML('beforeend', '<span class="rd-wordmark">THE <b>DEPOT</b></span>');
           warn('dressHeader: no .depot-wordmark to reuse; rendered a fresh wordmark'); }

    var plate = ce('span', 'rd-header__mid');
    plate.innerHTML = plateHTML();

    var right = ce('span', 'rd-header__right');
    if (email){ email.classList.add('rd-header__email'); right.appendChild(email); }
    else { warn('dressHeader: no [data-depot-email]; the address never renders on this surface'); }
    if (logout){ logout.className = 'rd-btn rd-btn--ghost'; logout.setAttribute('data-rd-signedin-only',''); right.appendChild(logout); }
    else { warn('dressHeader: no [data-depot-logout]; this surface has no Log out control'); }

    /* The + Add a card action is drawn in the BAR in 01-nav-header.png, not in
       the mode row. Move the shell's own <a> so its href and depth-correct
       navBase() survive - do not re-create it. */
    var add = document.querySelector('[data-depot-addcard]');
    if (add){ add.className = 'rd-btn rd-btn--primary depot-add-card'; right.appendChild(add); }
    else { warn('dressHeader: no [data-depot-addcard] link to relocate; the bar has no add action'); }

    /* Nodes we keep for the shell's sake but the design does not draw. */
    /* Nodes we keep for the shell's sake but the design does not draw. The
       v2 spacer in particular is flex:1 - leave it in the flow and it shoves
       the whole redesigned cluster to the right edge of the bar. */
    if (subtitle){ subtitle.classList.add('rd-hide'); }
    if (bell){ bell.classList.add('rd-hide'); }
    if (account){ account.classList.add('rd-hide'); }  /* emptied; kept so [data-depot-account] still resolves */
    var leftovers = host.querySelectorAll('.v2-wordmark-wrap, .v2-spacer');
    for (var li = 0; li < leftovers.length; li++){ leftovers[li].classList.add('rd-hide'); }

    host.classList.add('rd-header', 'rd-on-dark');
    /* Insert in drawn order at the TOP of the bar rather than appending after
       whatever the old shell left behind. */
    host.insertBefore(right, host.firstChild);
    host.insertBefore(plate, host.firstChild);
    host.insertBefore(left,  host.firstChild);
    host.setAttribute('data-rd-dressed', '1');

    log('chapter 01 header dressed');
    return true;
  }

  /* the mode row: pills on #0c3556, active one gold. The shell still owns
     setActive() and aria-current; the CSS keys off aria-current. */
  function dressNav(){
    var nav = document.querySelector('[data-depot-nav]');
    if (!nav){ warn('dressNav: no [data-depot-nav]; mode pills not dressed'); return false; }
    if (nav.getAttribute('data-rd-dressed') === '1'){ return false; }
    nav.classList.add('rd-nav');
    var title = nav.querySelector('[data-depot-navtitle]');
    if (title){ title.classList.add('rd-pagetitle'); }
    else { warn('dressNav: no [data-depot-navtitle]; page title not dressed'); }
    var tabs = nav.querySelectorAll('.depot-tab');
    if (!tabs.length){ warn('dressNav: no .depot-tab pills found in the mode row'); }
    for (var i = 0; i < tabs.length; i++){
      tabs[i].classList.remove('v2-pill', 'v2-pill--orange');
      tabs[i].classList.add('rd-navpill');
    }
    nav.setAttribute('data-rd-dressed', '1');
    log('chapter 01 mode row dressed (' + tabs.length + ' pills)');
    return true;
  }

  /* signed-out chrome: plate hides, wallet reads em-dash, actions collapse to
     one Log in pill (chapter 01 states). */
  function setSignedOut(isOut){
    var host = document.querySelector('.rd-header');
    if (!host){ warn('setSignedOut: header not dressed yet; nothing to switch'); return; }
    host.classList.toggle('is-signed-out', !!isOut);
    if (isOut){ paintBalance(null); }
  }

  /* ======================================================================
     CHAPTER 02 - log in, and the locked collection
     Re-parents the ORIGINAL #authEmailInput / #authPassInput / #authSubmitBtn /
     #authToggleLink / #authMsg nodes into the drawn frame. Their inline
     onclick attributes and the Enter-key handler in index.html keep working
     because they are the same nodes.
     ====================================================================== */
  function dressAuthModal(){
    var overlay = document.getElementById('authOverlay');
    if (!overlay){ log('dressAuthModal: no #authOverlay on this surface; nothing to dress'); return false; }
    if (overlay.getAttribute('data-rd-dressed') === '1'){ return false; }

    var modal = overlay.querySelector('.auth-modal');
    if (!modal){ warn('dressAuthModal: #authOverlay has no .auth-modal; chapter 02 not applied'); return false; }

    var closeBtn = modal.querySelector('.auth-close');
    var title    = modal.querySelector('#authTitle');
    var sub      = modal.querySelector('#authSub');
    var emailLbl = modal.querySelector('label[for="authEmailInput"]');
    var passLbl  = modal.querySelector('label[for="authPassInput"]');
    var emailIn  = modal.querySelector('#authEmailInput');
    var passIn   = modal.querySelector('#authPassInput');
    var submit   = modal.querySelector('#authSubmitBtn');
    var msg      = modal.querySelector('#authMsg');
    var toggle   = modal.querySelector('#authToggle');

    if (!emailIn || !passIn || !submit){
      warn('dressAuthModal: missing one of #authEmailInput / #authPassInput / #authSubmitBtn; leaving the modal alone rather than half-dressing it');
      return false;
    }

    overlay.classList.add('rd-scrim');
    modal.className = 'rd-modal';

    var bar = ce('div', 'rd-modal__bar');
    var id  = ce('div', 'rd-modal__id');
    id.insertAdjacentHTML('beforeend', '<span class="rd-modal__logo" aria-hidden="true">D</span>');
    if (title){ title.className = 'rd-modal__title'; id.appendChild(title); }
    else { id.insertAdjacentHTML('beforeend', '<span class="rd-modal__title">Log in</span>');
           warn('dressAuthModal: no #authTitle; rendered a static title'); }
    bar.appendChild(id);
    if (closeBtn){ closeBtn.className = 'rd-modal__x'; bar.appendChild(closeBtn); }
    else { warn('dressAuthModal: no .auth-close; the modal has no X'); }

    var body = ce('div', 'rd-modal__body');
    if (sub){ sub.className = 'rd-modal__lede'; body.appendChild(sub); }
    if (msg){ msg.classList.add('rd-modal__msg'); }

    function field(labelNode, input, fallbackKey){
      var f = ce('label', 'rd-field');
      var k = ce('span', 'rd-field__k');
      k.textContent = (labelNode ? labelNode.textContent : fallbackKey).toUpperCase();
      if (labelNode && labelNode.parentNode){ labelNode.parentNode.removeChild(labelNode); }
      f.setAttribute('for', input.id);
      input.className = 'rd-input';
      f.appendChild(k); f.appendChild(input);
      return f;
    }
    body.appendChild(field(emailLbl, emailIn, 'Email'));
    body.appendChild(field(passLbl,  passIn,  'Password'));

    submit.className = 'rd-btn rd-btn--primary rd-btn--block rd-btn--lg';
    body.appendChild(submit);
    if (msg){ body.appendChild(msg); }
    if (toggle){ toggle.className = 'rd-modal__foot'; body.appendChild(toggle); }

    /* drop the now-empty original children, then install the frame */
    while (modal.firstChild){ modal.removeChild(modal.firstChild); }
    modal.appendChild(bar); modal.appendChild(body);
    overlay.setAttribute('data-rd-dressed', '1');
    log('chapter 02 auth modal dressed');
    return true;
  }

  /* The locked collection. Chapter 02 is explicit that this is a gold CAUTION
     card that says what to do next, NOT an error. The copy is the designed
     copy; the old "Not available / This collection isn't available." line said
     nothing actionable. */
  function dressLockedCollection(){
    var host = document.getElementById('sharedUnavailable');
    if (!host){ log('dressLockedCollection: no #sharedUnavailable on this surface'); return false; }
    if (host.getAttribute('data-rd-dressed') === '1'){ return false; }
    var card = host.querySelector('.su-card');
    if (!card){ warn('dressLockedCollection: #sharedUnavailable has no .su-card; not dressed'); return false; }
    card.className = 'rd-locked-card';
    card.innerHTML =
      '<div class="rd-locked-card__k">DUGOUT\'S LOCKED</div>' +
      '<div class="rd-locked-card__t">This collection isn\'t public. Ask the owner for a share link, or start your own Depot.</div>';
    host.setAttribute('data-rd-dressed', '1');
    log('chapter 02 locked-collection card dressed');
    return true;
  }

  /* The login-required gate (#loginGate) is the signed-out variant of the whole
     binder: browsable chrome, one committing action. */
  function dressLoginGate(){
    var gate = document.getElementById('loginGate');
    if (!gate){ log('dressLoginGate: no #loginGate on this surface'); return false; }
    if (gate.getAttribute('data-rd-dressed') === '1'){ return false; }
    var card = gate.querySelector('.lg-card');
    var btn  = gate.querySelector('.lg-btn');
    if (!card){ warn('dressLoginGate: #loginGate has no .lg-card; not dressed'); return false; }
    card.classList.add('rd-panel', 'rd-gate__card');
    var t = gate.querySelector('.lg-title'); if (t){ t.className = 'rd-gate__title'; }
    var s = gate.querySelector('.lg-sub');   if (s){ s.className = 'rd-gate__sub'; }
    if (btn){ btn.className = 'rd-btn rd-btn--primary rd-btn--lg'; }
    else { warn('dressLoginGate: no .lg-btn; the gate has no log-in action'); }
    gate.setAttribute('data-rd-dressed', '1');
    log('chapter 02 login gate dressed');
    return true;
  }

  /* ======================================================================
     CHAPTER 12 - the state library, as callable helpers
     Phases 2-5 call these instead of hand-rolling a state. "No bespoke
     variants" only holds if there is one place to get them from.
     ====================================================================== */

  /* LOCKED WITH REASON. Override rule 6 is enforced here, not just described:
     a lock without a reason is refused and says so. */
  function lock(btn, reason){
    if (!btn){ warn('lock: no control given; nothing locked'); return null; }
    if (!reason){
      warn('lock: refused to lock ' + (btn.id || btn.className || 'a control') +
           ' with no reason - override rule 6 says every disabled control carries its reason. Control left ENABLED.');
      return null;
    }
    btn.classList.add('is-locked');
    btn.setAttribute('aria-disabled', 'true');
    var wrap = btn.parentNode;
    if (!wrap){ warn('lock: control has no parent; reason not placed'); return null; }
    if (!wrap.classList.contains('rd-state--locked-with-reason')){ wrap.classList.add('rd-state--locked-with-reason'); }
    var node = wrap.querySelector(':scope > .rd-reason[data-rd-for="' + (btn.id || '_') + '"]');
    if (!node){
      node = ce('div', 'rd-reason');
      node.setAttribute('data-rd-for', btn.id || '_');
      if (btn.nextSibling){ wrap.insertBefore(node, btn.nextSibling); } else { wrap.appendChild(node); }
    }
    node.innerHTML = '<span>' + esc(reason) + '</span>';
    return node;
  }
  function unlock(btn){
    if (!btn){ warn('unlock: no control given'); return; }
    btn.classList.remove('is-locked');
    btn.removeAttribute('aria-disabled');
    var wrap = btn.parentNode;
    if (!wrap){ return; }
    var node = wrap.querySelector('.rd-reason[data-rd-for="' + (btn.id || '_') + '"]');
    if (node && node.parentNode){ node.parentNode.removeChild(node); }
  }

  function checkingHTML(label){
    return '<div class="rd-state--checking">' +
             '<span class="rd-spinner' + (reduced() ? '' : ' rd-m-spin') + '"></span>' +
             '<span>' + esc(label || 'Checking\u2026') + '</span>' +
           '</div>';
  }
  function shimmerHTML(n){
    var out = '<div class="rd-shimrow">', i;
    for (i = 0; i < (n || 3); i++){ out += '<div class="rd-shim rd-m-shimmer"></div>'; }
    return out + '</div>';
  }
  function emptyHTML(o){
    o = o || {};
    if (!o.action){ warn('emptyHTML: no next action given - "empty states always offer the next action". Rendering the sentence alone.'); }
    return '<div class="rd-state--empty">' +
             (o.icon ? '<div class="rd-state__icon">' + esc(o.icon) + '</div>' : '') +
             '<div class="rd-state__t">' + esc(o.title || 'Nothing here yet') + '</div>' +
             '<div class="rd-state__s">' + esc(o.sub || '') + '</div>' +
             (o.action ? '<button type="button" class="rd-btn rd-btn--primary rd-btn--sm" data-rd-action>' + esc(o.action) + '</button>' : '') +
           '</div>';
  }
  function noResultsHTML(o){
    o = o || {};
    return '<div class="rd-state--no-results">' +
             '<div class="rd-state__t">' + esc(o.title || 'Nothing matches') + '</div>' +
             '<div class="rd-state__s">' + esc(o.sub || '') + '</div>' +
             '<button type="button" class="rd-btn rd-btn--ghost rd-btn--sm" data-rd-reset>' + esc(o.reset || 'Clear filters') + '</button>' +
           '</div>';
  }
  /* Errors state the CONSEQUENCE first - what did or did not happen. */
  function errorHTML(o){
    o = o || {};
    if (!o.consequence){ warn('errorHTML: no consequence given - chapter 12 requires the error to say what did or did not happen before it offers retry.'); }
    return '<div class="rd-state--error">' +
             '<div class="rd-state__t">\u26A0 ' + esc(o.title || 'Something went wrong') + '</div>' +
             '<div class="rd-state__s">' + esc(o.consequence || '') + '</div>' +
             '<div class="rd-state__acts">' +
               '<button type="button" class="rd-btn rd-btn--danger rd-btn--sm" data-rd-retry>' + esc(o.retry || 'Try again') + '</button>' +
               (o.back ? '<button type="button" class="rd-btn rd-btn--quiet rd-btn--sm" data-rd-back>' + esc(o.back) + '</button>' : '') +
             '</div>' +
           '</div>';
  }
  function signedOutHTML(o){
    o = o || {};
    return '<div class="rd-state--signed-out">' +
             '<div class="rd-state__browsable">' + esc(o.note || 'browsable content still renders') + '</div>' +
             '<div class="rd-state__acts">' +
               '<button type="button" class="rd-btn rd-btn--gold rd-btn--sm" data-rd-login>' + esc(o.action || 'Log in') + '</button>' +
               '<span class="rd-chip-anon">\uD83E\uDE99 \u2014</span>' +
             '</div>' +
           '</div>';
  }
  function placeholderHTML(o){
    /* Override rule 4: missing art is a DESIGNED band with year and name. */
    o = o || {};
    return '<div class="rd-ph">' +
             '<span class="rd-ph__year">' + esc(o.year || '') + '</span>' +
             '<span class="rd-ph__name">' + esc(o.name || 'no scan') + '</span>' +
             (o.set ? '<span>' + esc(o.set) + '</span>' : '') +
           '</div>';
  }
  function cooldownHTML(o){
    o = o || {};
    var pct = Math.max(0, Math.min(100, Number(o.pct == null ? 0 : o.pct)));
    return '<div class="rd-state--cooldown">' +
             '<div class="rd-cool__head">' +
               '<span class="rd-cool__t">' + esc(o.title || 'Free daily') + '</span>' +
               '<span class="rd-cool__clock" data-rd-clock>' + esc(o.clock || '--h --m') + '</span>' +
             '</div>' +
             '<div class="rd-bar"><div class="rd-bar__fill" data-rd-fill style="width:' + pct + '%"></div></div>' +
           '</div>';
  }

  function paint(host, html, what){
    if (!host){ warn('paint: no host element for ' + (what || 'a state') + '; nothing rendered'); return null; }
    host.innerHTML = html;
    return host;
  }

  /* ======================================================================
     BOOT
     depot-shell.js mounts on DOMContentLoaded, and on some surfaces later than
     that, so we watch instead of assuming. Fail-loud 20s watchdog, same shape
     as js/depot-game-shell.js (AGENTS.md 9).
     ====================================================================== */
  function dressAll(){
    var did = false;
    try { did = dressHeader() || did; } catch (e){ warn('dressHeader threw:', e && e.message); }
    try { did = dressNav() || did; }    catch (e){ warn('dressNav threw:', e && e.message); }
    try { dressAuthModal(); }           catch (e){ warn('dressAuthModal threw:', e && e.message); }
    try { dressLockedCollection(); }    catch (e){ warn('dressLockedCollection threw:', e && e.message); }
    try { dressLoginGate(); }           catch (e){ warn('dressLoginGate threw:', e && e.message); }
    if (did){
      try { if (window.DepotShell && DepotShell.refreshFranchise){ DepotShell.refreshFranchise(); } }
      catch (e){ warn('post-dress refreshFranchise threw:', e && e.message); }
      refreshBalance();
    }
    return did;
  }

  var _mo = null, _pending = false;

  function allDressed(){
    var headerOk = !!document.querySelector('.depot-shell__header[data-rd-dressed="1"]');
    var modal    = document.getElementById('authOverlay');
    var modalOk  = !modal || modal.getAttribute('data-rd-dressed') === '1';
    var gate     = document.getElementById('loginGate');
    var gateOk   = !gate || gate.getAttribute('data-rd-dressed') === '1';
    return headerOk && modalOk && gateOk;
  }

  /* The binder renders thousands of nodes. An observer that calls dressAll()
     on every mutation is a page-freeze, so: coalesce to one call per frame,
     and disconnect the moment there is nothing left to dress. */
  function schedule(){
    if (_pending){ return; }
    _pending = true;
    var run = function (){
      _pending = false;
      dressAll();
      if (_mo && allDressed()){ _mo.disconnect(); _mo = null; log('observer disconnected - every phase-1 surface on this page is dressed'); }
    };
    if (window.requestAnimationFrame){ window.requestAnimationFrame(run); } else { setTimeout(run, 16); }
  }

  /* ----------------------------------------------------------------------
   The session settles AFTER the header dresses.

   dressAll() samples the balance once, and the moment every phase-1 surface
   is dressed the watchdog interval clears and the observer disconnects -- so
   on a signed-in reload the balance was read while depotUserCached was still
   empty, painted the em-dash, and was never read again. depot-wallet.js
   solves this same race for its own chip by subscribing to auth; the
   redesigned header has to do it too, or it quietly lies about the balance.

   Read-only: this re-runs a SELECT. Nothing here moves a coin (RUNBOOK 4).
---------------------------------------------------------------------- */
var _rdAuthSubbed = false;

function sbClient(){
  try { return (typeof depotSB === 'function') ? depotSB() : (window.depotSB && window.depotSB()); }
  catch (e){ return null; }
}

/* getBalance() reads window.depotUserCached, which depot-core fills on its own
   schedule, so a SIGNED_IN that lands first can still resolve to null. Bounded
   retry: 5 tries over ~1.6s, then it stays at the em-dash exactly as it would
   have before. */
function refreshBalanceSoon(tries){
  tries = tries || 0;
  return refreshBalance().then(function (bal){
    if (bal == null && tries < 4){
      setTimeout(function (){ refreshBalanceSoon(tries + 1); }, 400);
    }
    return bal;
  });
}

function armAuthRefresh(){
  if (_rdAuthSubbed){ return true; }
  var client = sbClient();
  if (!client || !client.auth || typeof client.auth.onAuthStateChange !== 'function'){ return false; }
  try {
    client.auth.onAuthStateChange(function (event, session){
      setSignedOut(!session);
      if (event === 'SIGNED_OUT'){ paintBalance(null); return; }
      refreshBalanceSoon(0);
    });
    _rdAuthSubbed = true;
    log('auth subscription armed - the wallet and the signed-out chrome follow the session');
    return true;
  } catch (e){
    warn('armAuthRefresh: onAuthStateChange threw; the balance stays at its first paint:', e && e.message);
    _rdAuthSubbed = true; /* do not spin on a client that throws */
    return true;
  }
}

/* The client is injected by depot-core, which may not have run yet. */
function armAuthRefreshWhenReady(){
  if (armAuthRefresh()){ return; }
  var n = 0;
  var ai = setInterval(function (){
    n++;
    if (armAuthRefresh()){ clearInterval(ai); return; }
    if (n >= 40){
      clearInterval(ai);
      warn('armAuthRefresh: 20s elapsed with no supabase auth client; the wallet will not follow sign-in on this load. If this surface has no auth, that is expected.');
    }
  }, 500);
}

function boot(){
    if (!enabled()){ return; }
    document.documentElement.classList.add('depot-rd');
  armAuthRefreshWhenReady();
    dressAll();

    var tries = 0;
    var iv = setInterval(function (){
      tries++;
      if (allDressed()){ clearInterval(iv); return; }
      dressAll();
      if (tries >= 40){
        clearInterval(iv);
        warn('watchdog: 20s elapsed and something is still undressed. Missing: ' +
             (document.querySelector('.depot-shell__header[data-rd-dressed="1"]') ? '' : 'header ') +
             ((!document.getElementById('authOverlay') || document.getElementById('authOverlay').getAttribute('data-rd-dressed') === '1') ? '' : 'auth-modal ') +
             ((!document.getElementById('loginGate') || document.getElementById('loginGate').getAttribute('data-rd-dressed') === '1') ? '' : 'login-gate') +
             '. If this page never mounts DepotShell that is expected.');
      }
    }, 500);

    if (allDressed()){ return; }
    try {
      _mo = new MutationObserver(schedule);
      _mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e){ warn('MutationObserver setup failed; falling back to the interval only:', e && e.message); }
  }

  window.DepotRD = {
    /* chrome */
    dressAll: dressAll, dressHeader: dressHeader, dressNav: dressNav,
    dressAuthModal: dressAuthModal, dressLockedCollection: dressLockedCollection,
    dressLoginGate: dressLoginGate, setSignedOut: setSignedOut,
    /* wallet (read-only in phase 1) */
    coinHTML: coinHTML, walletHTML: walletHTML, setBalance: paintBalance, refreshBalance: refreshBalance,
  armAuthRefresh: armAuthRefresh,
    /* the state library */
    lock: lock, unlock: unlock, paint: paint,
    checkingHTML: checkingHTML, shimmerHTML: shimmerHTML, emptyHTML: emptyHTML,
    noResultsHTML: noResultsHTML, errorHTML: errorHTML, signedOutHTML: signedOutHTML,
    placeholderHTML: placeholderHTML, cooldownHTML: cooldownHTML,
    /* utilities */
    reduced: reduced, esc: esc, enabled: enabled
  };

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', boot); }
  else { boot(); }

  log('depot-redesign.js loaded');
})();

/* ===========================================================================
   js/depot-auth.js - the ONE shared auth modal (ch16: "reachable from every
   locked action, not just the header").

   Extracted verbatim-in-behaviour from the inline block that used to live only
   in index.html (markup ~820-843, logic ~847-1040, CSS ~1042-1060). Every shell
   that includes this file gets the same single component: one state machine,
   four modes (login / signup / forgot / reset).

   Construction rules this file deliberately follows:
     - the modal is built with document.createElement on a detached node and
       appended ONCE. No innerHTML rebuild of #authOverlay, ever. PR #242
       (the dressAuthModal wipe) came from exactly that pattern.
     - js/depot-redesign.js dressAuthModal() MOVES these nodes into .rd-modal
       and rewrites classNames. It must find #authOverlay already in the DOM
       when it boots, so this script has to run BEFORE depot-redesign.js does.
       depot-redesign boots immediately when it is `defer`red (readyState is
       'interactive' by then), so a DOMContentLoaded hook here would be too
       late. Include this file as a CLASSIC script at the top of <body>.
   =========================================================================== */
(function(){
  'use strict';

  var SUPABASE_URL = 'https://nuymzokvbdntbvinsnda.supabase.co';
  // publishable (anon) key, client-safe / RLS-protected; assembled from parts
  var SUPABASE_KEY = ['sb','publishable','IiTsIBqYgGTIEnwdvQEXPA','4rmQdYVo'].join('_');
  window.DEPOT_SUPABASE_CONFIG = window.DEPOT_SUPABASE_CONFIG || { url: SUPABASE_URL, key: SUPABASE_KEY };

  function $(id){ return document.getElementById(id); }

  /* ---------------------------------------------------------------- styles
     Guarded by id so a double include (index.html + a partial) is a no-op.

     NOTE: only the MODAL rules moved here. The header-chrome rules that shared
     the old block (.auth-area / .auth-email / bare .auth-btn) stay in
     index.html, because only index.html has that header. Injecting a bare
     .auth-btn rule on every shell would restyle buttons this file does not
     own - js/depot-season-shell.js builds its Log out button with
     className 'auth-btn'. The modal's own button rules are scoped under
     .auth-modal so they cannot reach it. */
  function injectStyles(){
    if(document.getElementById('depotAuthStyles')) return;
    var st = document.createElement('style');
    st.id = 'depotAuthStyles';
    st.textContent = [
      '.auth-overlay{display:none;position:fixed;inset:0;background:rgba(20,12,6,.78);z-index:9999;align-items:center;justify-content:center}',
      '.auth-overlay.open{display:flex}',
      '.auth-modal{background:var(--leather,#2a1c10);border:3px solid var(--brass,#c8a24a);border-radius:6px;padding:24px;width:320px;max-width:90vw;box-shadow:0 8px 40px rgba(0,0,0,.6)}',
      '.auth-modal h2{margin:0 0 4px;font-size:16px;color:var(--brass)}',
      '.auth-modal .sub{font-size:11px;opacity:.8;margin:0 0 16px}',
      '.auth-modal label{display:block;font-size:11px;margin:10px 0 4px;opacity:.85}',
      '.auth-modal input{width:100%;box-sizing:border-box;font-family:inherit;font-size:13px;padding:8px;border:2px solid var(--brass);border-radius:3px;background:rgba(0,0,0,.25);color:var(--ink)}',
      '.auth-modal .row{display:flex;gap:8px;margin-top:18px}',
      '.auth-modal .auth-btn{font-family:inherit;font-size:11px;border:2px solid var(--brass);background:var(--brass);color:#000;font-weight:600;padding:4px 10px;cursor:pointer;border-radius:3px}',
      '.auth-modal .auth-btn:hover{background:var(--sb-blue);color:var(--brass)}',
      '.auth-modal .row .auth-btn{flex:1;text-align:center}',
      '.auth-modal .auth-btn.primary{background:var(--brass);color:var(--leather)}',
      '.auth-msg{font-size:11px;margin-top:12px;min-height:14px}',
      '.auth-msg.err{color:#e08a8a}',
      '.auth-msg.ok{color:#8ad08a}',
      '.auth-close{float:right;cursor:pointer;color:var(--brass);font-size:18px;line-height:1;border:none;background:none}',
      '.auth-toggle{font-size:11px;margin-top:14px;text-align:center;opacity:.85}',
      '.auth-toggle a{color:var(--brass);cursor:pointer;text-decoration:underline}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------------------------------------------------------- markup
     Detached-node construction, appended once. Returns early if an #authOverlay
     already exists (double include, or a shell that still has inline markup) -
     this is also what keeps a reload from leaving two overlays behind. */
  function el(tag, props, text){
    var n = document.createElement(tag);
    if(props){ for(var k in props){ if(Object.prototype.hasOwnProperty.call(props, k)) n.setAttribute(k, props[k]); } }
    if(text != null) n.textContent = text;
    return n;
  }

  function injectMarkup(){
    if(document.getElementById('authOverlay')) return;

    var overlay = el('div', { 'class':'auth-overlay', 'id':'authOverlay' });
    var modal   = el('div', { 'class':'auth-modal', 'role':'dialog', 'aria-modal':'true' });

    var close = el('button', { 'class':'auth-close', 'type':'button', 'aria-label':'Close' }, '×');
    modal.appendChild(close);

    modal.appendChild(el('h2', { 'id':'authTitle' }, 'Log in'));
    modal.appendChild(el('p', { 'class':'sub', 'id':'authSub' }, 'Sign in to sync your collection across devices.'));

    modal.appendChild(el('label', { 'for':'authEmailInput' }, 'Email'));
    modal.appendChild(el('input', { 'type':'email', 'id':'authEmailInput', 'autocomplete':'email', 'placeholder':'you@example.com' }));

    modal.appendChild(el('label', { 'for':'authPassInput' }, 'Password'));
    modal.appendChild(el('input', { 'type':'password', 'id':'authPassInput', 'autocomplete':'current-password', 'placeholder':'password' }));

    var row = el('div', { 'class':'row' });
    var submit = el('button', { 'class':'auth-btn primary', 'id':'authSubmitBtn', 'type':'button' }, 'Log in');
    row.appendChild(submit);
    modal.appendChild(row);

    modal.appendChild(el('div', { 'class':'auth-msg', 'id':'authMsg' }));

    var toggle = el('div', { 'class':'auth-toggle', 'id':'authToggle' });
    toggle.appendChild(el('span', { 'id':'authToggleText' }, 'No account?'));
    toggle.appendChild(document.createTextNode(' '));
    var toggleLink = el('a', { 'id':'authToggleLink' }, 'Sign up');
    toggle.appendChild(toggleLink);
    modal.appendChild(toggle);

    var forgotRow = el('div', { 'class':'auth-toggle', 'id':'authForgotRow' });
    var forgotLink = el('a', { 'id':'authForgotLink' }, 'Forgot password?');
    forgotRow.appendChild(forgotLink);
    modal.appendChild(forgotRow);

    var backRow = el('div', { 'class':'auth-toggle', 'id':'authBackRow', 'style':'display:none' });
    var backLink = el('a', { 'id':'authBackLink' }, 'Back to log in');
    backRow.appendChild(backLink);
    modal.appendChild(backRow);

    overlay.appendChild(modal);

    /* The old markup carried inline onclick="DepotAuth.x()" attributes. Same
       behaviour, bound as listeners so the handlers survive the dresser
       rewriting className (it moves these nodes; it does not clone them). */
    overlay.addEventListener('click', function(ev){ if(ev.target === overlay) window.DepotAuth && window.DepotAuth.closeModal(); });
    close.addEventListener('click',      function(){ window.DepotAuth && window.DepotAuth.closeModal(); });
    submit.addEventListener('click',     function(){ window.DepotAuth && window.DepotAuth.submit(); });
    toggleLink.addEventListener('click', function(){ window.DepotAuth && window.DepotAuth.toggleMode(); });
    forgotLink.addEventListener('click', function(){ window.DepotAuth && window.DepotAuth.forgotMode(); });
    backLink.addEventListener('click',   function(){ window.DepotAuth && window.DepotAuth.backToLogin(); });

    (document.body || document.documentElement).appendChild(overlay);
  }

  /* Re-assertable, not run-once. game/index.html is a bundled app that does
     document.documentElement.replaceWith(...) on DOMContentLoaded, which throws
     away everything injected before it - overlay and <style> both. document
     itself survives (so the keydown listener does), and so does this closure,
     so the cheap fix is to make injection idempotent and re-assert it at the
     moment the modal is actually needed. Both functions no-op when their node
     is already present. */
  function ensureDom(){ injectStyles(); injectMarkup(); }

  ensureDom();

  /* ------------------------------------------------------------------ boot
     Every shell already ships the supabase-js CDN tag, so this normally finds
     window.supabase already there and initialises synchronously, exactly as the
     inline block did. The conditional add is the fallback for a shell that does
     not carry the tag. */
  function start(){
    if(!window.supabase || !window.supabase.createClient){
      console.warn('[DepotAuth] supabase-js failed to load; auth disabled, card flow unaffected.');
      return;
    }

    /* REUSE the page's client if it already made one. dugout / play / vs /
       game / shop / marketplace each call createClient() in their own head
       block and set window.supabaseClient. A second GoTrueClient over the same
       storage key logs "Multiple GoTrueClient instances detected in the same
       browser context" and races the session between the two. */
    var sb = window.supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.supabaseClient = sb;
    try{ if(!window.sb) window.sb = sb; }catch(_e){}

    init(sb);
  }

  if(window.supabase && window.supabase.createClient){
    start();
  } else {
    var cdn = document.createElement('script');
    cdn.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    cdn.onload = start;
    cdn.onerror = function(){ console.warn('[DepotAuth] supabase-js failed to load; auth disabled, card flow unaffected.'); };
    (document.head || document.documentElement).appendChild(cdn);
  }

  /* ----------------------------------------------------------------- logic
     Moved unchanged from index.html except where a comment says otherwise. */
  function init(sb){
    var mode = 'login'; // or 'signup'

    function setMsg(t, cls){ var m=$('authMsg'); if(!m) return;
        /* fix/signup-flow: the redesign dresser adds .rd-modal__msg to this node at
           dress time (js/depot-redesign.js chapter 02) and setMsg used to blow the whole
           className away, so the FIRST message a visitor ever saw fell out of the parts
           language back to the legacy 11px line - part of why a refusal reads as nothing
           happening. Keep the part, swap only the ok/err state class. */
        var dressed = m.classList.contains('rd-modal__msg');
        m.textContent=t||''; m.className='auth-msg'+(cls?(' '+cls):'');
        if(dressed){ m.classList.add('rd-modal__msg'); } }

    function reflectMode(){
      /* [auth recovery] four modes now: login / signup / forgot (send reset link)
         / reset (arrived via the email link; a recovery session is live). */
      var login = mode==='login', signup = mode==='signup', forgot = mode==='forgot', reset = mode==='reset';
      $('authTitle').textContent   = login ? 'Log in' : signup ? 'Sign up' : forgot ? 'Reset password' : 'Set a new password';
      $('authSub').textContent     = login  ? 'Sign in to sync your collection across devices.'
                                   : signup ? 'Create an account to sync your collection across devices.'
                                   : forgot ? 'Enter your email and we\'ll send a reset link.'
                                   :          'You followed a reset link - choose a new password.';
      $('authSubmitBtn').textContent = login ? 'Log in' : signup ? 'Sign up' : forgot ? 'Send reset link' : 'Set password';
      $('authToggleText').textContent = login ? 'No account?' : 'Have an account?';
      $('authToggleLink').textContent = login ? 'Sign up' : 'Log in';
      $('authPassInput').setAttribute('autocomplete', (login||forgot) ? 'current-password' : 'new-password');
      var passLabel = document.querySelector('label[for="authPassInput"]');
      var emailLabel = document.querySelector('label[for="authEmailInput"]');
      // forgot needs no password; reset needs no email (the recovery session knows who)
      [$('authPassInput'), passLabel].forEach(function(el){ if(el) el.style.display = forgot ? 'none' : ''; });
      [$('authEmailInput'), emailLabel].forEach(function(el){ if(el) el.style.display = reset ? 'none' : ''; });
      var tog=$('authToggle');       if(tog)  tog.style.display  = (forgot||reset) ? 'none' : '';
      var fr =$('authForgotRow');    if(fr)   fr.style.display   = login ? '' : 'none';
      var back=$('authBackRow');     if(back) back.style.display = forgot ? '' : 'none';
    }

    var DepotAuth = {
      openModal: function(){ ensureDom(); setMsg(''); mode='login'; reflectMode(); $('authOverlay').classList.add('open'); var e=$('authEmailInput'); if(e) e.focus(); },
      closeModal: function(){ $('authOverlay').classList.remove('open'); },
      forgotMode: function(){ mode='forgot'; setMsg(''); reflectMode(); var e=$('authEmailInput'); if(e){ try{ e.focus(); }catch(_e){} } },
      backToLogin: function(){ mode='login'; setMsg(''); reflectMode(); },
      /* [auth recovery] called off the PASSWORD_RECOVERY auth event: the visitor
         arrived from the reset email and holds a live recovery session. */
      recoveryMode: function(){ ensureDom(); mode='reset'; setMsg(''); reflectMode(); $('authOverlay').classList.add('open'); var p=$('authPassInput'); if(p){ p.value=''; try{ p.focus(); }catch(_e){} } },
      toggleMode: function(){ mode = (mode==='login') ? 'signup' : 'login'; setMsg(''); reflectMode();
        /* fix/signup-flow: switching INTO sign-up wipes whatever the browser autofilled.
           One #authEmailInput / #authPassInput pair serves BOTH modes, so Chrome drops the
           saved LOGIN pair into the sign-up form. The visitor then registers an address
           that already has an account, Supabase answers 'User already registered', and the
           button reads as dead. A sign-up now carries only what was typed. */
        if(mode==='signup'){ var __e=$('authEmailInput'), __p=$('authPassInput'); if(__e) __e.value=''; if(__p) __p.value=''; if(__e){ try{ __e.focus(); }catch(_e){} } }
      },
      submit: async function(){
        var email = ($('authEmailInput').value||'').trim();
        var pass = $('authPassInput').value||'';
        if(mode==='forgot'){ if(!email){ setMsg('Enter your email.', 'err'); return; } }
        else if(mode==='reset'){ if(!pass){ setMsg('Enter a new password.', 'err'); return; } }
        else if(!email || !pass){ setMsg('Enter email and password.', 'err'); return; }
        setMsg('Working...'); $('authSubmitBtn').disabled = true;
        try{
          var res;
          if(mode==='forgot'){
            /* [auth recovery] redirect back to THIS origin+path; index owns the
               set-new-password modal. Supabase answers OK whether or not the address
               exists, so the copy must not promise a mail is coming. */
            var fr2 = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
            if(fr2.error){ console.warn('[DepotAuth] resetPasswordForEmail refused: status=' + (fr2.error.status||'?') + ' msg=' + (fr2.error.message||'')); setMsg(fr2.error.message || 'Could not send the reset link. Please try again.', 'err'); }
            else { setMsg('If that address has an account, a reset link is on its way. Check your email.', 'ok'); }
            return;
          }
          if(mode==='reset'){
            var up = await sb.auth.updateUser({ password: pass });
            if(up.error){ console.warn('[DepotAuth] updateUser(password) refused: status=' + (up.error.status||'?') + ' msg=' + (up.error.message||'')); setMsg(up.error.message || 'Could not set the new password. Please try again.', 'err'); }
            else { (window.depotLog||function(){})('[DepotAuth] password updated off the recovery session'); setMsg('Password updated - you are signed in.', 'ok'); setTimeout(DepotAuth.closeModal, 1200); }
            return;
          }
          if(mode==='signup'){
            /* fix/signup-flow: emailRedirectTo was ABSENT, so every confirmation and
               recovery link fell back to the project Site URL (now https://thedepot.cards
               after the cutover). A sign-up begun on any other origin came back to the
               wrong place. Pass THIS origin + path explicitly, never a query string. */
            res = await sb.auth.signUp({ email: email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } });
          }
          else { res = await sb.auth.signInWithPassword({ email: email, password: pass }); }
          if(res.error){
            var __m = (res.error.message||'')+'';
            console.warn('[DepotAuth] ' + mode + ' refused by Supabase: status=' + (res.error.status||'?') + ' code=' + (res.error.code||'?') + ' msg=' + __m);
            /* The commonest sign-up refusal is an address that already has an account.
               Name it and move the visitor to Log in with the email kept, instead of
               leaving a bare server string under the button (a silent bounce). */
            if(/already registered|already exists|already been registered/i.test(__m)){
              mode='login'; reflectMode();
              var __p2=$('authPassInput'); if(__p2){ __p2.value=''; try{ __p2.focus(); }catch(_e){} }
              setMsg('That email already has an account - switched you to Log in. Enter your password.', 'err');
            } else { setMsg(__m || 'That did not go through. Please try again.', 'err'); }
          }
          else if(mode==='signup' && res.data && res.data.session===null){
            var __u = (res.data && res.data.user) || null;
            if(__u && __u.identities && __u.identities.length === 0){
              /* Supabase obfuscates an existing address while confirmations are ON: it
                 answers with an identity-less user and NO session instead of an error. */
              console.warn('[DepotAuth] sign-up returned an identity-less user -> that email already has an account');
              mode='login'; reflectMode();
              setMsg('That email already has an account - switched you to Log in. Enter your password.', 'err');
            } else {
              console.log('[DepotAuth] sign-up returned no session -> email confirmation is ON for this project; the visitor must confirm before logging in');
              setMsg('Account created. Check your email to confirm, then come back and log in.', 'ok');
            }
          } else {
            console.log('[DepotAuth] ' + mode + ' succeeded with a live session; the gate lifts on the SIGNED_IN event');
            setMsg(mode==='signup' ? 'Account created - you are signed in.' : 'Success.', 'ok'); setTimeout(DepotAuth.closeModal, 900);
          }
        }catch(err){ setMsg(String(err && err.message || err), 'err'); }
        finally{ $('authSubmitBtn').disabled = false; }
      },
      logout: async function(){ try{ await sb.auth.signOut(); }catch(e){ console.warn('[DepotAuth] signOut', e); } }
    };
    window.DepotAuth = DepotAuth;

    /* renderSession paints the HEADER auth chrome (#authEmail / #authLoginBtn /
       #authLogoutBtn). Only index.html has those nodes.

       CHANGED, and it has to change: the inline version re-queued itself with
       setTimeout(...,0) whenever #authEmail was missing and the document had
       finished loading. On index.html that always resolved on the next tick. On
       a shell that has no #authEmail at all - which is all six of the others -
       it never resolves, and the 0ms re-queue becomes an unbounded loop that
       pegs the main thread silently, with a clean console. It is entered twice
       per page (initAuthChrome + onAuthStateChange) and once more per auth
       event. So: the retry is bounded, then it gives up quietly. The login
       modal itself does not depend on any of this.
       #authLoginBtn / #authLogoutBtn also get the same per-element guard that
       playBtn / seasonBtn already had. */
    var __authChromeAbsent = false;
    function renderSession(session, tries){
      tries = tries || 0;
      var loggedIn = !!(session && session.user);
      var emailEl=$('authEmail'), loginBtn=$('authLoginBtn'), logoutBtn=$('authLogoutBtn'), playBtn=$('homePlayBtn'); var seasonBtn=$('depotSeasonBtn');
      if(!emailEl){
        if(document.readyState === 'loading'){
          document.addEventListener('DOMContentLoaded', function(){ renderSession(session, tries); }, { once:true });
        } else if(tries < 40){                      // ~1s of grace for a late mount
          setTimeout(function(){ renderSession(session, tries + 1); }, 25);
        } else if(!__authChromeAbsent){
          __authChromeAbsent = true;
          (window.depotLog||function(){})('[DepotAuth] no #authEmail header chrome on this surface; nothing to paint. The modal is still available.');
        }
        return;
      }
      if(loggedIn){
        emailEl.textContent = session.user.email || 'signed in';
        emailEl.style.display=''; if(loginBtn) loginBtn.style.display='none'; if(logoutBtn) logoutBtn.style.display=''; if(playBtn) playBtn.style.display=''; if(seasonBtn) seasonBtn.style.display='';
      } else {
        emailEl.style.display='none'; if(loginBtn) loginBtn.style.display=''; if(logoutBtn) logoutBtn.style.display='none'; if(playBtn) playBtn.style.display='none'; if(seasonBtn) seasonBtn.style.display='none';
      }
    }

    // NOTE: Phase 1 does NOT gate the card UI. Cards still load/save via localStorage, untouched.
    sb.auth.onAuthStateChange(function(event, session){
      console.log('[DepotAuth] onAuthStateChange:', event);
      if(event === 'PASSWORD_RECOVERY'){
        /* [auth recovery] the visitor arrived off the reset email; open the modal
           in set-new-password mode against the live recovery session. */
        (window.depotLog||function(){})('[DepotAuth] PASSWORD_RECOVERY -> set-new-password modal');
        try{ DepotAuth.recoveryMode(); }catch(e){ console.warn('[DepotAuth] recoveryMode failed:', e && e.message); }
      }
      renderSession(session);
    });

    // Initial auth chrome render: run exactly once, AFTER the auth-area DOM exists.
    // getSession() resolves from cached storage almost immediately (a microtask), which can
    // beat the HTML parser reaching #authArea. Running it inline would call renderSession
    // against not-yet-parsed elements and bail via `if(!emailEl) return`, leaving the auth
    // chrome hidden (the PR #34 regression: all controls default to display:none).
    var __depotAuthChromeInit = false;
    function initAuthChrome(){
      if(__depotAuthChromeInit) return;
      __depotAuthChromeInit = true;
      Promise.resolve()
        .then(function(){ return sb.auth.getSession(); })
        .then(function(r){ renderSession(r && r.data ? r.data.session : null); })
        .catch(function(e){
          console.warn('[DepotAuth] getSession failed; failing open to Log in.', e);
          renderSession(null); // fail open: show the Log in button rather than nothing
        });
    }
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', initAuthChrome, { once: true });
    } else {
      initAuthChrome();
    }

    // Enter key submits from modal inputs
    document.addEventListener('keydown', function(e){
      if(e.key==='Enter' && $('authOverlay') && $('authOverlay').classList.contains('open')){
        var a=document.activeElement;
        if(a && (a.id==='authEmailInput' || a.id==='authPassInput')){ e.preventDefault(); DepotAuth.submit(); }
      }
      if(e.key==='Escape' && $('authOverlay') && $('authOverlay').classList.contains('open')){ DepotAuth.closeModal(); }
    });
  }
})();

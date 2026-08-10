/* js/depot-index-shell.js - Session 2 of the reskin (DESIGN.md IMPLEMENTATION_PLAN).
 *
 * Wires the shared shell (css/depot-style.css + js/depot-shell.js) into the ROOT
 * BINDER (index.html). Mounts DepotShell chrome (bunting + header + mode nav, with
 * THE BINDER active), relocates the binder's context nav + content into the shell
 * stage, moves the live auth controls into the shell account cluster, and retires the
 * ad-hoc topbar chrome. This is chrome unification only - the binder body (era
 * filters, By Set, card grid, Add a Card) is untouched.
 *
 * Additive-first + fail-loud per AGENTS.md: every early return logs why, tagged
 * [depot]. Node moves (appendChild) preserve existing event listeners, so the
 * binder's app JS keeps working after relocation.
 */
(function () {
    'use strict';

   function init() {
         if (!window.DepotShell) {
                 console.warn('[depot] index-shell: window.DepotShell missing (depot-shell.js not loaded); binder keeps ad-hoc chrome');
                 return;
         }
         var frame = document.getElementById('appFrame');
         if (!frame) {
                 console.warn('[depot] index-shell: #appFrame missing; cannot mount shell');
                 return;
         }
         if (frame.querySelector('.depot-shell')) {
                 console.warn('[depot] index-shell: shell already mounted; skipping');
                 return;
         }

      window.DepotShell.mount({ el: frame, active: 'binder' });
         var stage = window.DepotShell.stageEl();
         if (!stage) {
                 console.warn('[depot] index-shell: shell stage missing after mount; aborting relocate');
                 return;
         }

      // Relocate binder context nav + both stage views into the shell stage.
      var modes = frame.querySelector('.modes');
         if (modes) { stage.appendChild(modes); }
         else { console.warn('[depot] index-shell: .modes context nav not found'); }

      var binderStage = document.getElementById('binderStage');
         if (binderStage) { stage.appendChild(binderStage); }
         else { console.warn('[depot] index-shell: #binderStage not found'); }

      var carouselStage = document.getElementById('carouselStage');
         if (carouselStage) { stage.appendChild(carouselStage); }
         else { console.warn('[depot] index-shell: #carouselStage not found'); }

      // Move the live auth controls into the shell account cluster.
      // Node moves preserve listeners, so Log in / Log out keep working.
      var acct = frame.querySelector('.depot-account');
         if (acct) {
                 // Log out is now shell-owned markup (one 8-bit treatment on all four
                 // surfaces), so only the Log in affordance is relocated. #authLogoutBtn stays
                 // in the retired topbar -- hidden, listeners intact -- and the shell button
                 // delegates its click to it, so DepotAuth.logout() is still the only handler.
                 ['authLoginBtn'].forEach(function (id) {
                           var b = document.getElementById(id);
                           if (b) { acct.appendChild(b); }
                           else { console.warn('[depot] index-shell: #' + id + ' not found to relocate'); }
                 });
         } else {
                 console.warn('[depot] index-shell: .depot-account cluster missing; auth buttons stay in topbar');
         }

      // Retire the ad-hoc topbar chrome (wordmark/tagline/count now live in the shell).
      // Kept hidden in the DOM because #countChip / #authEmail are still updated by app JS.
      var topbar = frame.querySelector('.topbar');
         if (topbar) { topbar.style.display = 'none'; }
         else { console.warn('[depot] index-shell: .topbar not found to retire'); }

       // Fold the binder's own "+ Add a card" into the unified shell header: hide the
       // redundant #m-add in the .modes context nav and wire the shell pill to openForm().
       var mAdd = document.getElementById('m-add');
       if (mAdd) { mAdd.style.display = 'none'; }
       else { console.warn('[depot] index-shell: #m-add not found to fold into header'); }
       var addPill = frame.querySelector('[data-depot-addcard]');
       if (addPill) {
           addPill.addEventListener('click', function (e) {
               if (typeof window.openForm === 'function') { e.preventDefault(); window.openForm(); }
               else { console.warn('[depot] index-shell: window.openForm missing; header + Add a card falls back to href'); }
           });
       } else { console.warn('[depot] index-shell: header [data-depot-addcard] pill not found; add-card lives only in .modes'); }
       

      // BUG FIX (fix/v2-header-panel-column-email-repaint): the visible header email is the
  // v2 shell span [data-depot-email], painted ONLY by DepotShell.refreshFranchise() which
  // runs ONCE at mount. On a fresh sign-in, depotUserCached is null at mount, so resolveRecord
  // returns null -> setAnonymous() blanks the email, and NOTHING repaints it until a manual
  // page refresh. (Prior fixes edited the retired display:none #authEmail/renderSession path,
  // which has no visible effect.) Fix: re-run refreshFranchise() on auth-state changes so the
  // email lands without a refresh. Traced live: blanking the span and firing INITIAL_SESSION/
  // SIGNED_IN via this listener repaints it (0 -> populated). Fail-loud per AGENTS.md.
  try {
    var _sb = (typeof window.depotSB === 'function') ? window.depotSB() : null;
    if (!_sb || !_sb.auth || typeof _sb.auth.onAuthStateChange !== 'function') {
      console.warn('[depot] index-shell: no depotSB auth channel; header email will not repaint on sign-in');
    } else {
      _sb.auth.onAuthStateChange(function (event) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
          if (window.DepotShell && typeof window.DepotShell.refreshFranchise === 'function') {
            window.DepotShell.refreshFranchise();
          } else {
            console.warn('[depot] index-shell: auth change ' + event + ' but DepotShell.refreshFranchise missing; header not repainted');
          }
        }
      });
      (window.depotLog||function(){})('[depot] index-shell: header repaint wired to auth-state changes');
    }
  } catch (e) {
    console.warn('[depot] index-shell: failed to wire auth-state header repaint:', e);
  }

  (window.depotLog||function(){})('[depot] index-shell: binder wearing shared shell (active=binder)');
   }

   if (document.readyState === 'loading') {
         document.addEventListener('DOMContentLoaded', init);
   } else {
         init();
   }
})();

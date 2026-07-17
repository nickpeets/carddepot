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
                 ['authLoginBtn', 'authLogoutBtn'].forEach(function (id) {
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
       

      console.log('[depot] index-shell: binder wearing shared shell (active=binder)');
   }

   if (document.readyState === 'loading') {
         document.addEventListener('DOMContentLoaded', init);
   } else {
         init();
   }
})();

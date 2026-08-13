/* js/depot-root-route.js — funnel item 1: the front door routes strangers to
 * welcome.html instead of a login wall.
 *
 * index.html is the BINDER — a signed-in surface. An anonymous visitor landing
 * on it today gets a wall, which is the exact first-ten-seconds failure ch16
 * exists to fix. This module, loaded ONLY by index.html, sends a visitor with
 * no session to welcome.html.
 *
 * THE LOOP GUARD, because welcome.html routes signed-in visitors back to the
 * hub and its Starter Box CTA points here: the bounce is SKIPPED when
 *   1. the URL carries ?auth — the visitor came here ON PURPOSE to log in
 *      (welcome's CTA and any locked-action link use this), or
 *   2. the referrer is welcome.html itself — whatever they clicked there
 *      meant "take me to the app", and bouncing them straight back would be
 *      a door that reopens into the room you just left, or
 *   3. a hash intent is present (#add etc) — deep links keep their meaning.
 *
 * Fail-open on uncertainty: if depot-core never resolves, we DO NOT redirect.
 * A stranger seeing the old login wall is a worse-dressed truth; a signed-in
 * collector bounced off their binder by a flaky auth check is a lie.
 */
(function () {
  'use strict';
  var TAG = '[root-route]';
  function warn(){ try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }

  try {
    if (/[?&]auth\b/.test(location.search)){ return; }
    if (location.hash){ return; }
    if (/welcome\.html/.test(document.referrer || '')){ return; }
  } catch (e) { return; }

  var tries = 0;
  function check(){
    if (window.depotUserCached){ return; }           /* signed in: stay */
    if (typeof window.depotUser === 'function'){
      window.depotUser().then(function (u){
        if (u){ return; }
        (window.depotLog || function(){})(TAG + ' anonymous at the front door -> welcome.html');
        location.replace('welcome.html');
      }).catch(function (e){ warn('auth check threw; NOT redirecting:', e && e.message); });
      return;
    }
    if (++tries < 40){ setTimeout(check, 150); return; }
    warn('depot-core never appeared; NOT redirecting');
  }
  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', function(){ check(); }); }
  else { check(); }
})();

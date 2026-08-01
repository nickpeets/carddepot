/* ============================================================================
 * js/depot-roles.js -- the admin-detection shim.
 *
 * ONE question, asked once per session: is the signed-in collector an admin?
 *
 * WHY A SHIM AND NOT JUST A READ. There is no roles table in the live schema
 * yet -- db/proposals/MIGRATION_roles.sql creates it and is QUEUED for Nick,
 * not executed (AGENTS.md 2). So this file has to work in three worlds:
 *   1. table + RPC present       -> ask the server, the server is truth
 *   2. table present, RPC absent -> read your own user_roles row
 *   3. neither present (TODAY)   -> resolve FALSE for everybody, except the
 *      founding-admin fallback below, so Nick's workflow does not break while
 *      the migration sits in review.
 *
 * DARK-SAFE BY CONSTRUCTION. Every failure path resolves FALSE, never true. A
 * shim that guessed "admin" on a network error would turn the Add-a-Card scan
 * gate off for everyone the first time PostgREST hiccuped, and per
 * design/GRADE_PRESTIGE.md 7.3 that gate is the entire reason the scanned door
 * means anything.
 *
 * NOT A SECURITY BOUNDARY, AND IT SAYS SO OUT LOUD. GRADE_PRESTIGE 7.4 is
 * explicit that the bypass must be server-enforced: a bypass that mints
 * library-art cards is a mint, so it has to be checked where RLS is checked,
 * not in JavaScript that anyone can edit. This shim decides what the UI
 * OFFERS. The invariant that matters lands with the RLS policies in the
 * migration. Anyone can flip depotIsAdminCached from a console today; that is
 * a known, accepted property of the interim state and it is why the interim
 * state is interim.
 *
 * API (mirrors depot-core's shape on purpose -- one async, one sync cache):
 *   window.depotIsAdmin()        -> Promise<boolean>, memoised per user id
 *   window.depotIsAdminCached    -> boolean, false until the promise settles
 *   window.DepotRoles.reset()    -> drop the memo (auth changes call this)
 *   window.DepotRoles.source()   -> 'rpc' | 'table' | 'fallback' | 'anon'
 *   window event 'depot:admin-resolved' -> detail {admin, source}
 *
 * Fail-loud per AGENTS.md 4: every bail logs the reason and the missing value.
 * ==========================================================================*/
(function () {
  'use strict';
  var TAG = '[depot] roles:';

  /* FOUNDING ADMIN FALLBACK.
   * Nick. Hardcoded on purpose, and ONLY consulted when the roles table cannot
   * answer -- so the moment MIGRATION_roles.sql runs, the table is the
   * authority and this list stops mattering. Tim
   * (9861ce0d-e081-4123-b445-041dfed6cf34) is deliberately ABSENT: he is the
   * test case for the standard scan-required flow, and an accidental admin
   * would silently invalidate that test. */
  var FOUNDING_ADMINS = ['9e4e47d2-8836-4100-b846-fe1bb059fded'];

  var _promise = null;   // in-flight or settled resolution
  var _forUid  = null;   // the uid the memo belongs to
  var _source  = null;   // where the answer came from

  window.depotIsAdminCached = false;

  function client() {
    try { return (typeof window.depotSB === 'function') ? window.depotSB() : null; }
    catch (e) { console.warn(TAG, 'depotSB() threw:', e && e.message); return null; }
  }

  function userId() {
    try {
      var u = window.depotUserCached || null;
      if (u && u.id) return Promise.resolve(u.id);
      if (typeof window.depotUser === 'function') {
        return Promise.resolve(window.depotUser()).then(function (uu) { return (uu && uu.id) || null; });
      }
      var legacy = window.DEPOT_USER && window.DEPOT_USER.id;
      if (!legacy) console.warn(TAG, 'no user id source (depotUserCached, depotUser(), DEPOT_USER all empty)');
      return Promise.resolve(legacy || null);
    } catch (e) {
      console.warn(TAG, 'user lookup threw:', e && e.message);
      return Promise.resolve(null);
    }
  }

  function settle(admin, source, why) {
    admin = !!admin;
    _source = source;
    window.depotIsAdminCached = admin;
    console.log(TAG, 'admin=' + admin + ' (source: ' + source + ')' + (why ? ' -- ' + why : ''));
    try {
      window.dispatchEvent(new CustomEvent('depot:admin-resolved', { detail: { admin: admin, source: source } }));
    } catch (e) { /* no CustomEvent: the cached flag is still correct */ }
    return admin;
  }

  /* Tier 3: the fallback list. Never consulted while the table can answer. */
  function fromFallback(uid, why) {
    return settle(FOUNDING_ADMINS.indexOf(uid) >= 0, 'fallback', why);
  }

  /* Tier 2: read your OWN role row. The migration's RLS allows exactly this and
   * nothing else -- no insert, no update, no reading anybody else's row. */
  function fromTable(c, uid, whyRpcFailed) {
    return c.from('user_roles').select('role').eq('user_id', uid).maybeSingle()
      .then(function (r) {
        if (r.error) {
          return fromFallback(uid, 'user_roles unreadable (' + r.error.message + ') and depot_is_admin() unavailable (' + whyRpcFailed + ') -- migration probably not run yet');
        }
        return settle(!!(r.data && r.data.role === 'admin'), 'table',
                      'depot_is_admin() unavailable (' + whyRpcFailed + '); read user_roles directly');
      })
      .catch(function (e) { return fromFallback(uid, 'user_roles read threw (' + (e && e.message) + ')'); });
  }

  /* Tier 1: ask the server. depot_is_admin() is SECURITY DEFINER and reads
   * auth.uid() itself, so a client cannot ask on somebody else's behalf. */
  function resolveFor(uid) {
    var c = client();
    if (!c) return Promise.resolve(fromFallback(uid, 'no supabase client (is DEPOT_SUPABASE_CONFIG set on this page? AGENTS.md 8)'));
    return c.rpc('depot_is_admin')
      .then(function (r) {
        if (r.error) return fromTable(c, uid, r.error.message);
        if (typeof r.data !== 'boolean') return fromTable(c, uid, 'rpc returned ' + (typeof r.data));
        return settle(r.data, 'rpc', 'server-authoritative');
      })
      .catch(function (e) { return fromTable(c, uid, 'rpc threw (' + (e && e.message) + ')'); });
  }

  function depotIsAdmin() {
    if (_promise) return _promise;
    _promise = userId().then(function (uid) {
      _forUid = uid;
      if (!uid) return settle(false, 'anon', 'signed out; nobody is admin');
      return resolveFor(uid);
    }).catch(function (e) {
      return settle(false, 'anon', 'resolution threw (' + (e && e.message) + ')');
    });
    return _promise;
  }

  function reset(why) {
    _promise = null; _forUid = null; _source = null;
    window.depotIsAdminCached = false;
    console.log(TAG, 'memo reset' + (why ? ' (' + why + ')' : ''));
  }

  /* Re-resolve when the session changes. Same shape depot-wallet.js uses and
   * for the same reason: the shell mounts before auth settles, so without this
   * the first answer ('anon') would stand forever. */
  var _subbed = false;
  function subscribeAuth() {
    if (_subbed) return;
    var c = client();
    if (!c || !c.auth || typeof c.auth.onAuthStateChange !== 'function') {
      console.warn(TAG, 'no auth subscription (no client or no onAuthStateChange); the admin flag will not follow sign-in');
      return;
    }
    try {
      c.auth.onAuthStateChange(function (event, session) {
        var newUid = (session && session.user && session.user.id) || null;
        if (event === 'SIGNED_OUT') { reset('SIGNED_OUT'); return; }
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
          /* Guard the documented INITIAL_SESSION double-fire (AGENTS.md 4). Two
           * events in the same millisecond would otherwise fire two RPCs and
           * two 'depot:admin-resolved' events. Nothing here grants anything, so
           * a double-fire is only waste -- but the whole repo treats that race
           * as real, and a listener that re-renders on the event should not be
           * handed the same answer twice. */
          if (_promise && _forUid && newUid && _forUid === newUid) {
            console.log(TAG, event + ' ignored: already resolved for this uid (double-fire guard)');
            return;
          }
          reset(event);
          depotIsAdmin();
        }
      });
      _subbed = true;
      console.log(TAG, 'auth re-resolve subscription armed');
    } catch (e) { console.warn(TAG, 'subscribeAuth failed:', e && e.message); }
  }

  window.depotIsAdmin = depotIsAdmin;
  window.DepotRoles = {
    isAdmin: depotIsAdmin,
    reset: reset,
    source: function () { return _source; },
    foundingAdmins: FOUNDING_ADMINS.slice()
  };

  subscribeAuth();
  depotIsAdmin();
  console.log(TAG, 'loaded');
})();

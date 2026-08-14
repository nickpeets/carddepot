/* js/depot-session-hook.js — funnel item 2: the session hook.
 *
 * WHAT THIS IS
 * The single home for "something happened to the session, and the account may
 * need repairing before any other surface can work." Today it does exactly one
 * thing: it calls depot_ensure_onboarding on every auth state change.
 *
 * WHY IT HAS TO EXIST (docs/ONBOARDING_PATH_SPEC.md section 1)
 * depot_handle_new_user — the trigger on auth.users — wraps its whole body in
 * `exception when others then raise warning`. That is the right call: a failing
 * trigger would break signup. But it means an account can land in auth.users
 * with no role row, no collection and no franchise, and the only trace is a
 * warning in a Postgres log nobody reads. Every other RPC in the product
 * resolves the caller's collection and RAISES if there is none — no starter
 * box, no pack purchase, no free pack. Such an account can sign in and do
 * nothing, permanently, because depot_ensure_onboarding has had ZERO callers.
 * This file is the missing caller.
 *
 * THE GATE IS THE SERVER, AND ONLY THE SERVER.
 * depot_ensure_onboarding takes pg_advisory_xact_lock keyed on the owner. Its
 * own comment names the reason: "Two INITIAL_SESSION events in the same
 * millisecond is the documented failure mode." So there is NO localStorage
 * "have I run this" flag here, deliberately — that is the read-then-write
 * pattern AGENTS.md section 4 bans, and it is the exact shape that granted
 * Nick's bronze pack twice. The window-scoped in-flight latch below is the
 * belt; the advisory lock is the suspenders (design/STARTER_BOX.md 5.2).
 *
 * ADDITIVE, AND DELIBERATELY NOT A CONSOLIDATION.
 * Nine other .onAuthStateChange( subscriptions exist across seven files
 * (game/builder.html, index.html x2, depot-shop-view.js x2, depot-index-shell.js,
 * depot-roles.js, depot-redesign.js, depot-wallet.js). This module does not
 * touch, wrap or remove ANY of them. Touching live auth wiring is how people
 * get logged out. It is built as the home they should eventually consolidate
 * INTO — hence DepotSession.subscribe(), which is a real API today with one
 * internal caller, not a stub — but that consolidation is a separate concern on
 * a separate branch, one file at a time, live-verified per AGENTS.md 8.
 *
 * NO p_team_name IS PASSED. The default applies. Naming the franchise is
 * section 3's job, the function never overwrites an existing name, and a hook
 * that silently renamed a club on every page load would be a bug.
 *
 * FAIL LOUD, FAIL HARMLESS. If the RPC errors, it is logged and the page
 * carries on. Onboarding repair failing must never block a surface.
 *
 * EXPOSES
 *   window.DepotSession.subscribe(fn)  -> fn(event, session); returns unsubscribe
 *   window.DepotSession.ensure()       -> Promise<result|null>, idempotent
 *   window.DepotSession.ready(fn)      -> fn(result) once onboarding is settled
 *   window.DepotSession.state()        -> a snapshot, for diagnosis
 *   document event 'depot:onboarding'  -> detail = the RPC result
 */
(function () {
  'use strict';

  var TAG = '[depot][session]';
  var RPC = 'depot_ensure_onboarding';
  var AUTH_EVENTS = { INITIAL_SESSION: 1, SIGNED_IN: 1, USER_UPDATED: 1, TOKEN_REFRESHED: 1 };

  function log()  { try { (window.depotLog || function () {}).apply(null, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }

  /* ---- state. Window-scoped ON PURPOSE: it dies with the tab, so it can never
   * become a stale "already done" claim the way a localStorage flag would. ---- */
  var _inflight = {};      /* uid -> Promise, the belt against a double INITIAL_SESSION */
  var _result   = null;    /* last settled RPC result */
  var _uid      = null;    /* uid the result belongs to */
  var _subs     = [];      /* consolidation target: fn(event, session) */
  var _readyQ   = [];
  var _wired    = false;
  var _tries    = 0;

  /* ---- the RPC call itself ---- */
  function callEnsure(uid) {
    var sb = (typeof window.depotSB === 'function') ? window.depotSB() : null;
    if (!sb || typeof sb.rpc !== 'function') {
      warn('cannot call ' + RPC + ': no supabase client (depotSB unavailable); the account is NOT repaired this load');
      return Promise.resolve(null);
    }
    log('calling ' + RPC + ' for ' + uid);
    /* p_team_name: null IS the default (spec section 1, requirement 5 -- naming is
     * section 3's job and the server never overwrites an existing name). It is
     * passed EXPLICITLY rather than omitted because PostgREST resolves overloads
     * by NAMED ARGUMENT, and MIGRATION_roles.sql line 598 documents this exact
     * literal as the intended call site:
     *   await depotSB().rpc('depot_ensure_onboarding', { p_team_name: null })
     * An omitted argument is how you get PGRST202 instead of a result. */
    return sb.rpc(RPC, { p_team_name: null }).then(function (res) {
      if (res && res.error) {
        warn(RPC + ' failed: ' + (res.error.message || res.error) +
             ' -- the page continues; a broken account stays broken until the next session event');
        return null;
      }
      var data = (res && res.data) ? res.data : null;
      if (!data) { warn(RPC + ' returned no payload; treating as unrepaired'); return null; }
      if (data.created_collection || data.created_franchise) {
        /* Unconditional: this is the swallowed-trigger case actually firing, and
         * it has never been observed in the wild. It should be loud when it is. */
        console.warn(TAG + ' REPAIRED an incomplete account -- created_collection=' +
                     !!data.created_collection + ' created_franchise=' + !!data.created_franchise +
                     ' (depot_handle_new_user swallowed an exception for this user)');
      } else {
        log('onboarding already complete', data);
      }
      return data;
    }).catch(function (e) {
      warn(RPC + ' threw: ' + (e && (e.message || e)) + ' -- page continues');
      return null;
    });
  }

  function ensureFor(uid) {
    if (!uid) { warn('ensure skipped: no uid on the session'); return Promise.resolve(null); }
    if (_inflight[uid]) { log('ensure already in flight for ' + uid + ' -> sharing it (race latch)'); return _inflight[uid]; }
    var p = callEnsure(uid).then(function (data) {
      delete _inflight[uid];
      if (data) { _result = data; _uid = uid; settle(data); }
      return data;
    }, function (e) {
      delete _inflight[uid];
      warn('ensure chain rejected: ' + (e && (e.message || e)));
      return null;
    });
    _inflight[uid] = p;
    return p;
  }

  function settle(data) {
    var q = _readyQ; _readyQ = [];
    for (var i = 0; i < q.length; i++) {
      try { q[i](data); } catch (e) { warn('ready callback threw: ' + (e && (e.message || e))); }
    }
    try {
      document.dispatchEvent(new CustomEvent('depot:onboarding', { detail: data }));
    } catch (e) { warn('could not dispatch depot:onboarding: ' + (e && (e.message || e))); }
  }

  /* ---- the ONE subscription this module owns ---- */
  function fanout(event, session) {
    for (var i = 0; i < _subs.length; i++) {
      try { _subs[i](event, session); } catch (e) { warn('subscriber threw on ' + event + ': ' + (e && (e.message || e))); }
    }
  }

  function onAuth(event, session) {
    var uid = (session && session.user && session.user.id) || null;
    log('auth event ' + event + (uid ? ' uid=' + uid : ' (no session)'));
    fanout(event, session);

    if (event === 'SIGNED_OUT') {
      /* Drop the latch and the cached result. A DIFFERENT account signing in on
       * the same tab must get its own ensure -- this is the unscoped-state bug
       * class that already leaked one user's pack history to the next. */
      _inflight = {}; _result = null; _uid = null;
      return;
    }
    if (!AUTH_EVENTS[event]) { log('event ' + event + ' is not an onboarding trigger; ignored'); return; }
    if (!uid) { log('event ' + event + ' carried no session; nothing to ensure'); return; }
    if (_uid === uid && _result) { log('onboarding already settled for ' + uid + ' this page load'); return; }
    ensureFor(uid);
  }

  function wire() {
    if (_wired) return true;
    var sb = (typeof window.depotSB === 'function') ? window.depotSB() : null;
    if (!sb || !sb.auth || typeof sb.auth.onAuthStateChange !== 'function') return false;
    try {
      sb.auth.onAuthStateChange(function (event, session) { onAuth(event, session); });
      _wired = true;
      log('subscribed (the single home; nine legacy sites left untouched by design)');
    } catch (e) {
      warn('onAuthStateChange wiring threw: ' + (e && (e.message || e)) + ' -- falling back to a one-shot user check');
      _wired = true;
      kick();
    }
    return true;
  }

  /* Belt for the case where the page loaded with a session already established
   * and the library does not replay INITIAL_SESSION. Costs one cached call. */
  function kick() {
    if (typeof window.depotUser !== 'function') return;
    window.depotUser().then(function (u) {
      if (!u) { log('no signed-in user at boot; nothing to ensure'); return; }
      if (_uid === u.id && _result) return;
      log('boot user present and no auth event seen yet -> ensuring');
      ensureFor(u.id);
    }).catch(function (e) { warn('boot user check threw: ' + (e && (e.message || e))); });
  }

  function boot() {
    if (wire()) { setTimeout(kick, 1200); return; }
    if (++_tries < 40) { setTimeout(boot, 150); return; }
    warn('depot-core never appeared after ' + _tries + ' tries; onboarding will NOT be ensured on this page');
  }

  window.DepotSession = {
    subscribe: function (fn) {
      if (typeof fn !== 'function') { warn('subscribe ignored: not a function'); return function () {}; }
      _subs.push(fn);
      return function () { var i = _subs.indexOf(fn); if (i >= 0) _subs.splice(i, 1); };
    },
    ensure: function () {
      if (_uid && _result) return Promise.resolve(_result);
      if (typeof window.depotUser !== 'function') { warn('ensure(): depotUser unavailable'); return Promise.resolve(null); }
      return window.depotUser().then(function (u) { return u ? ensureFor(u.id) : null; });
    },
    ready: function (fn) {
      if (typeof fn !== 'function') { warn('ready ignored: not a function'); return; }
      if (_result) { try { fn(_result); } catch (e) { warn('ready callback threw: ' + (e && (e.message || e))); } return; }
      _readyQ.push(fn);
    },
    state: function () {
      return { wired: _wired, uid: _uid, settled: !!_result, inflight: Object.keys(_inflight), subscribers: _subs.length };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  log('loaded');
})();

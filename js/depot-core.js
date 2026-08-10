/* js/depot-core.js — additive shared Supabase core for The Depot.
 *
 * PURPOSE (additive cutover, phase 1):
 *   Provide ONE Supabase client + cached user resolution behind a stable
 *   global API so the three pages can migrate off their per-page,
 *   IIFE-trapped clients over time. This module does NOT remove any
 *   existing per-page client, window.sb, DEPOT_USER, or buildTeamPayload
 *   mirror yet — see AGENTS.md 'Depot-core cutover'.
 *
 * CONFIG: reads window.DEPOT_SUPABASE_CONFIG = { url, key }, which each
 *   page sets from its own in-scope SUPABASE_URL / SUPABASE_KEY constants
 *   (public anon key by design). No secrets live in this file.
 *
 * EXPOSES:
 *   window.depotSB()        -> the shared SupabaseClient (or null, logged)
 *   window.depotUser()      -> async: resolves + caches the auth user, returns user object or null
 *   window.depotUserCached  -> sync cached user object (null until first resolve)
 *
 * Fail-loud: every early return logs why, tagged [depot].
 */
(function () {
  'use strict';

  /* [console hygiene] gated INFO channel. console.warn / console.error stay
   * UNCONDITIONAL everywhere - fail-loud (AGENTS.md 4) is about guards naming
   * why they bailed, and that must never be silenced. What IS gated is routine
   * narration ("module ready", "client initialised", per-paint notes), which
   * had grown to ~70 lines per load and buried the warns it exists to serve.
   * Opt in from any console: localStorage.setItem('depot_debug','1'); reload.
   * NOT routed here on purpose: js/version.js's '[depot] build <hash>' - the
   * deploy live-verify ritual (AGENTS.md 5) reads it unconditionally. */
  function depotLog() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('depot_debug')) {
        console.log.apply(console, arguments);
      }
    } catch (e) { /* storage blocked (private mode etc): the optional channel stays quiet */ }
  }
  window.depotLog = depotLog;

  var _client = null;
  var _clientTried = false;
  var _configWarned = false;
  var _userCached = null;
  var _userPromise = null;

  function getClient() {
    if (_client) return _client;
    if (_clientTried) return _client; // already tried and failed; stay quiet after first log
    try {
      var cfg = window.DEPOT_SUPABASE_CONFIG;
      if (!cfg || !cfg.url || !cfg.key) {
        if (!_configWarned) { _configWarned = true;
        console.warn('[depot] depotSB: no DEPOT_SUPABASE_CONFIG (url/key) present on page; client unavailable');
        }
        return null;
      }
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        console.warn('[depot] depotSB: supabase-js lib not loaded (window.supabase.createClient missing)');
        _clientTried = true;
        return null;
      }
      _client = window.supabase.createClient(cfg.url, cfg.key);
      depotLog('[depot] depot-core client initialised');
      return _client;
    } catch (e) {
      console.warn('[depot] depotSB: createClient threw:', e);
      _clientTried = true;
      return null;
    }
  }

  function depotSB() {
    return getClient();
  }

  function depotUser() {
    if (_userCached) return Promise.resolve(_userCached);
    if (_userPromise) return _userPromise;
    var sb = getClient();
    if (!sb || !sb.auth || typeof sb.auth.getUser !== 'function') {
      console.warn('[depot] depotUser: no client/auth available; returning null');
      return Promise.resolve(null);
    }
    _userPromise = sb.auth.getUser().then(function (res) {
      var u = (res && res.data && res.data.user) ? res.data.user : null;
      if (!u) {
        console.warn('[depot] depotUser: getUser returned no user (not signed in?)');
      } else {
        _userCached = u;
        window.depotUserCached = u;
      }
      _userPromise = null;
      return u;
    }).catch(function (e) {
      console.warn('[depot] depotUser: getUser threw:', e);
      _userPromise = null;
      return null;
    });
    return _userPromise;
  }

  /* [record-integrity] ONE franchise resolver for every consumer.
   * Before this existed, depot-shell resolveRecord() read the NEWEST franchise
   * (created_at desc) while season.js ensureFranchise() played under the
   * OLDEST (asc) — with more than one franchises row the header showed a
   * different club's record than the one being played. Gameplay writes under
   * the oldest row, so the OLDEST is canonical and both sides now come here.
   * Returns Promise<franchise row|null>; never creates a row (creation stays
   * in season.js ensureFranchise, which falls back when this yields null). */
  var _franCached = null;
  var _franPromise = null;
  function depotFranchise() {
    if (_franCached) return Promise.resolve(_franCached);
    if (_franPromise) return _franPromise;
    var sb = getClient();
    if (!sb) { console.warn('[depot] depotFranchise: no client; returning null'); return Promise.resolve(null); }
    _franPromise = depotUser().then(function (u) {
      if (!u) { console.warn('[depot] depotFranchise: no user; returning null'); _franPromise = null; return null; }
      return sb.from('franchises').select('*').eq('owner_id', u.id)
        .order('created_at', { ascending: true }).limit(1)
        .then(function (res) {
          _franPromise = null;
          if (res.error) { console.warn('[depot] depotFranchise: franchises query failed:', res.error.message); return null; }
          var row = (res.data && res.data[0]) ? res.data[0] : null;
          if (!row) { console.warn('[depot] depotFranchise: no franchise row for user'); return null; }
          _franCached = row;
          return row;
        });
    }).catch(function (e) {
      console.warn('[depot] depotFranchise threw:', e);
      _franPromise = null;
      return null;
    });
    return _franPromise;
  }

  window.depotSB = depotSB;
  window.depotUser = depotUser;
  window.depotFranchise = depotFranchise;
  window.depotUserCached = window.depotUserCached || null;

  // Kick off a best-effort user resolve so depotUserCached warms up for sync callers (e.g. season.js UID()).
  try { depotUser(); } catch (e) { console.warn('[depot] depot-core warm-up threw:', e); }

  depotLog('[depot] depot-core.js loaded');
})();

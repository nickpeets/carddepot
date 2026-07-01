/* ============================================================================
 * season.js  —  Season Mode Slice 1 (pure logic module)
 *
 * Fresh-lineup, AI-opponent, fixed 8-game season with an accumulating record.
 * Reuses the existing matches pipeline (Option A): a season "game" is played by
 * creating a normal accepted match (opponent lineup pre-filled) and letting the
 * existing sim + __onMatchComplete writeback run.  This module only owns the
 * season bookkeeping tables (franchises / seasons / season_games).
 *
 * Ground-truth notes (verified against the repo + confirmed DDL):
 *   - Supabase client via depotSB(); current user via DEPOT_USER (DEPOT_USER.id).
 *   - Owner scoping: every row carries owner_id = DEPOT_USER.id (RLS enforced).
 *   - Schema source: the confirmed CREATE TABLE DDL (no live DB introspection
 *     was available in the codespace — see build report).
 *       franchises   (id, owner_id, team_name, created_at)
 *       seasons      (id, owner_id, franchise_id, status, games_total,
 *                     wins, losses, created_at)
 *       season_games (id, owner_id, season_id, game_number, opponent_name,
 *                     result, user_score, opp_score, match_id, played_at;
 *                     unique(season_id, game_number))
 *   - Sim team contract (from sim.js): team {name, code, lineup[9], pitcher};
 *     batter {name, avg, hr, rbi, rates:{BB,K,HR,_2B,_3B,_1B}, tendency}.
 * ==========================================================================*/
(function(){
  "use strict";

  var GAMES_TOTAL = 8;
  var SCTX_KEY = 'depot_season_ctx';

  /* ---- tiny helpers ---------------------------------------------------- */
  function SB(){ try { return (typeof depotSB === 'function') ? depotSB() : (window.sb || null); } catch(e){ return null; } }
  function UID(){ try { return (window.DEPOT_USER && window.DEPOT_USER.id) || null; } catch(e){ return null; } }

  // deterministic PRNG (mulberry32) so an opponent is stable per game_number
  function seededRand(seed){
    var t = seed >>> 0;
    return function(){
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s){
    var h = 2166136261 >>> 0;
    s = String(s || '');
    for (var i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ---- opponent generator --------------------------------------------- *
   * Deterministic per (season_id, game_number).  Produces a team object in
   * the EXACT sim contract: {name, code, lineup:[9 batters], pitcher}, each
   * batter {name, avg, hr, rbi, rates:{BB,K,HR,_2B,_3B,_1B}, tendency}.
   * avgToRates() is the single difficulty knob (isolated here).
   * -------------------------------------------------------------------- */
  var OPP_NAMES = [
    'RIVER RATS','SANDLOT KINGS','DUST DEVILS','IRON PIGS','NIGHT OWLS',
    'RAILROADERS','MUD HENS','SEA DOGS','CHAIN GANG','THUNDER BUGS',
    'GRIT CITY','BAYOU BANDITS','HILL TOPPERS','CANNON BALLS','FROST GIANTS','COAL CRACKERS'
  ];
  var OPP_CODES = ['RVR','SLK','DST','IRN','OWL','RRD','MUD','SEA','CHN','THB','GRT','BYU','HLT','CNB','FRG','COA'];

  // map a target batting average -> a plausible rate profile (per-PA-ish shares)
  function avgToRates(avg, rnd){
    // avg centered ~.255; spread modest.  These are the difficulty dials.
    var k   = 0.16 + (0.30 - avg) * 0.5 + (rnd()-0.5)*0.03;   // more K for weaker avg
    var bb  = 0.07 + (rnd()-0.5)*0.03;
    var hr  = 0.020 + (avg-0.240)*0.10 + (rnd()-0.5)*0.010;
    var _2b = 0.045 + (avg-0.240)*0.10 + (rnd()-0.5)*0.010;
    var _3b = 0.005 + (rnd()-0.5)*0.003;
    var _1b = Math.max(0.05, avg*0.62 + (rnd()-0.5)*0.02);
    function c(x,lo,hi){ return Math.max(lo, Math.min(hi, x)); }
    return {
      BB:  c(bb,  0.03, 0.14),
      K:   c(k,   0.10, 0.34),
      HR:  c(hr,  0.005,0.055),
      _2B: c(_2b, 0.02, 0.09),
      _3B: c(_3b, 0.001,0.02),
      _1B: c(_1b, 0.05, 0.24)
    };
  }

  function makeOpponentLineup(seasonId, gameNumber){
    var seed = (hashStr(String(seasonId)) ^ (gameNumber * 2654435761)) >>> 0;
    var rnd = seededRand(seed);
    var nameIdx = Math.floor(rnd() * OPP_NAMES.length);
    var teamName = OPP_NAMES[nameIdx];
    var code = OPP_CODES[nameIdx];
    var lineup = [];
    for (var i=0;i<9;i++){
      var avg = 0.220 + rnd()*0.075;                 // ~.220-.295
      var rates = avgToRates(avg, rnd);
      var hr = Math.round(8 + rnd()*24);
      var rbi = Math.round(35 + rnd()*55);
      lineup.push({
        name: 'AI ' + code + ' ' + (i+1),
        avg: avg.toFixed(3).replace(/^0/,''),         // ".257" style, matching card avg strings
        hr: hr,
        rbi: rbi,
        rates: rates,
        tendency: (rnd() < 0.5 ? 'contact' : 'power')
      });
    }
    var pRates = avgToRates(0.235 + rnd()*0.03, rnd);
    var pitcher = {
      name: 'AI ' + code + ' P',
      avg: '.180', hr: 2, rbi: 8,
      rates: pRates,
      tendency: 'contact'
    };
    // sim team contract: {name, code, lineup[9], pitcher}
    return { name: teamName, code: code, lineup: lineup, pitcher: pitcher, teamName: teamName };
  }

  /* ---- franchise / season lifecycle ----------------------------------- */

  // create franchise if none (prompt team name); else reuse most-recent.
  async function ensureFranchise(sb, uid){
    var q = await sb.from('franchises').select('*').eq('owner_id', uid)
                    .order('created_at', { ascending: true }).limit(1);
    if (q.error) throw q.error;
    if (q.data && q.data.length) return q.data[0];
    var name = null;
    try { name = window.prompt('Name your franchise (team name):', 'MY CLUB'); } catch(e){}
    if (name == null) return null;                    // user cancelled
    name = String(name).trim().slice(0,40) || 'MY CLUB';
    var ins = await sb.from('franchises').insert({ owner_id: uid, team_name: name }).select().single();
    if (ins.error) throw ins.error;
    return ins.data;
  }

  // resume active season (no dupes) or create a fresh one with 8 pending games.
  async function ensureSeason(sb, uid, franchise){
    var q = await sb.from('seasons').select('*')
                    .eq('owner_id', uid).eq('franchise_id', franchise.id).eq('status','active')
                    .order('created_at', { ascending: false }).limit(1);
    if (q.error) throw q.error;
    if (q.data && q.data.length) return q.data[0];

    var ins = await sb.from('seasons').insert({
      owner_id: uid, franchise_id: franchise.id,
      status: 'active', games_total: GAMES_TOTAL, wins: 0, losses: 0
    }).select().single();
    if (ins.error) throw ins.error;
    var season = ins.data;

    // create 8 pending season_games (idempotent via unique(season_id,game_number))
    var rows = [];
    for (var n=1;n<=GAMES_TOTAL;n++){
      var opp = makeOpponentLineup(season.id, n);
      rows.push({
        owner_id: uid, season_id: season.id, game_number: n,
        opponent_name: opp.name, result: 'pending',
        user_score: null, opp_score: null, match_id: null, played_at: null
      });
    }
    var gi = await sb.from('season_games').insert(rows);
    if (gi.error && !/duplicate|unique/i.test(gi.error.message||'')) throw gi.error;
    return season;
  }

  async function startOrResumeSeason(){
    var sb = SB(), uid = UID();
    if (!sb || !uid) return null;
    var fr = await ensureFranchise(sb, uid);
    if (!fr) return null;
    var season = await ensureSeason(sb, uid, fr);
    return { franchise: fr, season: season };
  }

  // first still-pending game (lowest game_number), or null if season done.
  async function nextPendingGame(seasonId){
    var sb = SB(), uid = UID();
    if (!sb || !uid || !seasonId) return null;
    var q = await sb.from('season_games').select('*')
                    .eq('owner_id', uid).eq('season_id', seasonId).eq('result','pending')
                    .order('game_number', { ascending: true }).limit(1);
    if (q.error) throw q.error;
    return (q.data && q.data.length) ? q.data[0] : null;
  }

  async function loadSeasonGames(seasonId){
    var sb = SB(), uid = UID();
    if (!sb || !uid || !seasonId) return [];
    var q = await sb.from('season_games').select('*')
                    .eq('owner_id', uid).eq('season_id', seasonId)
                    .order('game_number', { ascending: true });
    if (q.error) throw q.error;
    return q.data || [];
  }

  // set the season context the builder divert reads, then open the builder.
  function launchSeasonGame(ctx){
    try { sessionStorage.setItem(SCTX_KEY, JSON.stringify(ctx)); } catch(e){}
    // builder lives at game/builder.html relative to the depot root
    window.location.href = 'game/builder.html';
  }

  function readSeasonCtx(){
    try { var s = sessionStorage.getItem(SCTX_KEY); return s ? JSON.parse(s) : null; } catch(e){ return null; }
  }
  function clearSeasonCtx(){ try { sessionStorage.removeItem(SCTX_KEY); } catch(e){} }

  // store the created match_id on the season_game row.
  async function attachMatchToSeasonGame(seasonGameId, matchId){
    var sb = SB(), uid = UID();
    if (!sb || !uid || !seasonGameId || !matchId) return;
    var u = await sb.from('season_games').update({ match_id: matchId })
                    .eq('owner_id', uid).eq('id', seasonGameId);
    if (u.error) throw u.error;
  }

  // idempotent writeback: only fires when the row is still pending.
  async function recordSeasonResult(seasonGameId, userScore, oppScore){
    var sb = SB(), uid = UID();
    if (!sb || !uid || !seasonGameId) return;
    userScore = userScore|0; oppScore = oppScore|0;
    var result = (userScore > oppScore) ? 'win' : 'loss';

    // guard: read current row; bail if already recorded (idempotent).
    var g = await sb.from('season_games').select('*')
                    .eq('owner_id', uid).eq('id', seasonGameId).single();
    if (g.error) throw g.error;
    var row = g.data;
    if (!row || row.result !== 'pending') return;     // already written -> no double count

    var upd = await sb.from('season_games').update({
        result: result, user_score: userScore, opp_score: oppScore,
        played_at: new Date().toISOString()
      })
      .eq('owner_id', uid).eq('id', seasonGameId).eq('result','pending').select();
    if (upd.error) throw upd.error;
    if (!upd.data || !upd.data.length) return;        // lost the race -> already counted

    // increment the season W-L off the confirmed write.
    var s = await sb.from('seasons').select('*')
                    .eq('owner_id', uid).eq('id', row.season_id).single();
    if (s.error) throw s.error;
    var season = s.data;
    var wins = (season.wins|0) + (result === 'win' ? 1 : 0);
    var losses = (season.losses|0) + (result === 'loss' ? 1 : 0);
    var played = wins + losses;
    var patch = { wins: wins, losses: losses };
    if (played >= (season.games_total|0 || GAMES_TOTAL)) patch.status = 'complete';
    var su = await sb.from('seasons').update(patch).eq('owner_id', uid).eq('id', season.id);
    if (su.error) throw su.error;
    return { result: result, wins: wins, losses: losses };
  }

  // Resolve a season_game by its match_id, then record the result.
  // Called from index.html __onMatchComplete (which knows match_id, not sgId).
  async function recordSeasonResultByMatch(matchId, userScore, oppScore){
    var sb = SB(), uid = UID();
    if (!sb || !uid || !matchId) return;
    var q = await sb.from('season_games').select('*')
                    .eq('owner_id', uid).eq('match_id', matchId).limit(1);
    if (q.error) throw q.error;
    if (!q.data || !q.data.length) return;   // not a season game -> no-op
    return await recordSeasonResult(q.data[0].id, userScore, oppScore);
  }

  /* ---- expose ---------------------------------------------------------- */
  window.DepotSeason = {
    GAMES_TOTAL: GAMES_TOTAL,
    SCTX_KEY: SCTX_KEY,
    startOrResumeSeason: startOrResumeSeason,
    nextPendingGame: nextPendingGame,
    loadSeasonGames: loadSeasonGames,
    launchSeasonGame: launchSeasonGame,
    readSeasonCtx: readSeasonCtx,
    clearSeasonCtx: clearSeasonCtx,
    attachMatchToSeasonGame: attachMatchToSeasonGame,
    recordSeasonResult: recordSeasonResult,
    recordSeasonResultByMatch: recordSeasonResultByMatch,
    makeOpponentLineup: makeOpponentLineup,
    avgToRates: avgToRates
  };
})();

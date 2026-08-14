/* ============================================================================
   tools/audit_binder.js -- ITEM 1.5: the binder audit, headless, DRY-RUN ONLY.
   ----------------------------------------------------------------------------
   Runs the REAL resolver (the item-1 ladder version) over every card in the
   signed-in account's binder and prints docs/BINDER_AUDIT.md's table. ZERO
   WRITES: no card-row update, no persist, no RPC. The backfill write is a
   separate, Nick-gated step; this tool must stay runnable before that ruling.

   HOW TO RUN: open any signed-in page on thedepot.cards, paste this file into
   the console (or inject it), then:   await depotAuditBinder()
   The markdown lands in window.__BINDER_AUDIT_MD and on the console.

   FIDELITY: the resolver section below (between the EXTRACT markers) is a
   VERBATIM MACHINE EXTRACTION of game/builder.html's STAT RESOLUTION section
   (normPos + lineToRates .. fmtAvg) on this branch. Do not hand-edit it --
   re-extract after any resolver change, or the audit audits a fiction. The
   page's own depotCleanName / depotIsPlayable / depotPlayableReason are used
   live, so name-cleaning and the structural gate are the real ones, not
   copies. bldCleanNm's depotCleanName probe resolves against the real page.
   ========================================================================== */
(function(){
'use strict';
var MLB_BASE='https://statsapi.mlb.com/api/v1';
var META_MARK='\n\n<!--DEPOT_META:'; var META_END='-->';
/* ---- BEGIN EXTRACT game/builder.html (normPos; STAT RESOLUTION) ---- */
/* (also extracted: BAT_POS line 431; the shared ID-override map, line 672) */
    var BAT_POS=['C','1B','2B','3B','SS','LF','CF','RF','DH']; // valid positions a batter can occupy
  var ROOKIE_ID_OVERRIDES = { 'Mike Piazza': 120536, 'Tony Gwynn': 115270, 'Matt Williams': 124326, 'Mike Stanton': 122681 };
    function normPos(raw){ var r=String(raw||'').toUpperCase().trim();
      if(BAT_POS.indexOf(r)>=0) return r;
      if(r==='OF'){ return 'LF'; }
      if(r==='IF'){ return '1B'; }
      if(r.length>=2 && r[0]>='1' && r[0]<='9'){ var f=['1B','2B','3B','SS'].filter(function(x){return r.indexOf(x)>=0;}); return f.length?f[0]:''; }
      if(r==='LHP'||r==='RHP'||r==='SP'||r==='RP'||r==='TWP'||r==='P') return 'P';
      return ''; }
  // ===== STAT RESOLUTION =====
  // Map a full season hitting line to per-PA log5 rates {BB,K,HR,_2B,_3B,_1B} (OUT = remainder).
  function lineToRates(L){
    var AB=+L.AB||0, H=+L.H||0, d2=+L['2B']||0, t3=+L['3B']||0, hr=+L.HR||0, bb=+L.BB||0, so=+L.SO||0, hbp=+L.HBP||0, sf=+L.SF||0;
    var PA=+L.PA|| (AB+bb+hbp+sf) || 0;
    if(PA<50) return null; // too few PA to model reliably
    var singles=Math.max(0, H-d2-t3-hr);
    var r={ BB:(bb+hbp)/PA, K:so/PA, HR:hr/PA, _2B:d2/PA, _3B:t3/PA, _1B:singles/PA };
    return clampRates(r);
  }
  // Sparse fallback: only AVG (+HR,RBI) known. Assume league-baseline shape.
  function avgToRates(avg,hr,rbi){
    avg=parseFloat(avg)||0; hr=parseInt(hr,10)||0;
    if(avg<=0||avg>=1) return null;
    var PA=600, AB=545;            // league-ish full season
    var H=Math.round(avg*AB);
    var hrPA=Math.min(hr,H)/PA;    // HR per PA from the card's HR
    // League-baseline hit-type distribution among non-HR hits: ~ 2B 20%, 3B 2%, 1B 78%
    var nonHrH=Math.max(0,H-hr);
    var d2=nonHrH*0.20, t3=nonHrH*0.02, s1=nonHrH*0.78;
    var bbRate=0.085, kRate=0.200; // league baseline walk/strikeout per PA
    var r={ BB:bbRate, K:kRate, HR:hrPA, _2B:d2/PA, _3B:t3/PA, _1B:s1/PA };
    return clampRates(r);
  }
  function clampRates(r){
    ['BB','K','HR','_2B','_3B','_1B'].forEach(function(k){ if(!isFinite(r[k])||r[k]<0) r[k]=0; });
    var sum=r.BB+r.K+r.HR+r._2B+r._3B+r._1B;
    if(sum>0.97){ var sc=0.97/sum; ['BB','K','HR','_2B','_3B','_1B'].forEach(function(k){ r[k]*=sc; }); } // leave >=3% OUT room
    return r;
  }
  // Parse card stat-line text like 'AVG:.264, HR:16, RBI:61, OPS:.748' (order-free, case-insensitive).
  function parseStatLine(txt){
    if(!txt) return {};
    var out={}; var re=/([A-Za-z0-9]+)\s*[:=]\s*\.?(\d*\.?\d+)/g; var m;
    while((m=re.exec(String(txt)))){ out[m[1].toUpperCase()]=m[0].split(/[:=]/)[1].trim(); }
    return out;
  }
  // Pull AVG/HR/RBI from the card's stats sidecar (object or free-text placeholder).
  function cardStatFields(card){
    var s=card.stats||{};
    var avg=s.AVG||s.avg, hr=s.HR||s.hr, rbi=s.RBI||s.rbi;
    if((avg==null||hr==null) && (s.placeholder||s.line||s.text)){
      var p=parseStatLine(s.placeholder||s.line||s.text);
      avg=avg||p.AVG; hr=hr||p.HR; rbi=rbi||p.RBI;
    }
    return { avg:avg, hr:hr, rbi:rbi };
  }

  // ----- MLB Stats API (keyless, CORS-open) -----
  function cleanName(s){ return String(s||'').toLowerCase().replace(/[.,'`\u2019]/g,'').replace(/\s+jr\b|\s+sr\b|\s+ii+\b|\s+iv\b/g,'').replace(/\s+/g,' ').trim(); }
  // PERF: in-memory name->person cache. Two cards of the same player in one load
  // share a single lookup. Stores the in-flight PROMISE so concurrent pool workers
  // don't each fire the same search. Lives for the page session only.
  /* One definition of the MLB lookup key for this page.
     depotCleanName comes from js/depot-position.js, included above. It falls back
     to the RAW STRING when it finds no name token, so cleaning is allowed to be a
     no-op -- never assume it shortened anything.
     WHY THIS IS NOT COSMETIC: mlbFindPlayer keys the MLB people search on this
     value. "Yonathan Daza SP, VARVAR: Running" returns ZERO matches; "Yonathan
     Daza" returns one. An unresolved card is not blocked from a lineup -- sim.js
     substitutes league-average rates so the batter stays playable -- so the card
     silently plays as an average major leaguer while the tile reads .000.
     See docs/ONBOARDING_PATH_SPEC.md 5.2. Do NOT add a second copy of this guard. */
  function bldCleanNm(v){
    var f = (typeof window.depotCleanName === 'function') ? window.depotCleanName : null;
    if (!f) { console.warn('[depot] builder: depotCleanName unavailable; MLB lookup falls back to the raw name'); return String(v||'').trim(); }
    var out = f(v);
    if (!out) { console.warn('[depot] builder: depotCleanName returned empty for "' + v + '"; MLB lookup falls back to the raw name'); return String(v||'').trim(); }
    return out;
  }
  var MLB_PLAYER_CACHE={};
  function mlbFindPlayer(rawName){
    var name=bldCleanNm(rawName);
    var key=String(name||'').trim().toLowerCase();
    if(Object.prototype.hasOwnProperty.call(MLB_PLAYER_CACHE,key)) return MLB_PLAYER_CACHE[key];
    var p=(async function(){
      // [audit cat. c] ID overrides FIRST: a name pinned in ROOKIE_ID_OVERRIDES
      // resolves to that exact person with no search -- the search is what returns
      // two Mike Stantons and calls it ambiguous. Raw string checked before the
      // cleaned one because the map is keyed on card-front names.
      var ov = ROOKIE_ID_OVERRIDES[String(rawName||'').trim()]; if(ov==null) ov=ROOKIE_ID_OVERRIDES[name];
      if(ov!=null){
        try{ var ro=await fetch(MLB_BASE+'/people/'+ov); if(ro.ok){ var jo=await ro.json(); var po=jo&&jo.people&&jo.people[0]; if(po) return po; } }catch(e){}
      }
      var q=encodeURIComponent(name);
      // primary: people/search
      try{
        var r=await fetch(MLB_BASE+'/people/search?names='+q);
        if(r.ok){ var j=await r.json(); if(j&&j.people&&j.people.length) return pickPerson(j.people,name); }
      }catch(e){}
      try{
        var r2=await fetch(MLB_BASE+'/people/search?q='+q);
        if(r2.ok){ var j2=await r2.json(); if(j2&&j2.people&&j2.people.length) return pickPerson(j2.people,name); }
      }catch(e){}
      return null;
    })();
    // Cache the promise; drop it on rejection so a transient failure can be retried.
    MLB_PLAYER_CACHE[key]=p;
    p.catch(function(){ if(MLB_PLAYER_CACHE[key]===p) delete MLB_PLAYER_CACHE[key]; });
    return p;
  }
  function pickPerson(people,name){
    var cn=cleanName(name);
    var exact=people.filter(function(p){ return cleanName(p.fullName)===cn; });
    var pool=exact.length?exact:people;
    if(pool.length>1 && exact.length!==1) return { ambiguous:true, count:pool.length };
    return pool[0];
  }
  async function mlbSeasonHitting(personId,year){
    var url=MLB_BASE+'/people/'+personId+'/stats?stats=season&group=hitting&season='+year;
    try{
      var r=await fetch(url); if(!r.ok) return null; var j=await r.json();
      var splits=(j&&j.stats&&j.stats[0]&&j.stats[0].splits)||[];
      if(!splits.length) return null;
      // prefer the aggregate / largest-AB split if multiple (traded mid-year)
      var best=splits[0], bestAB=-1;
      splits.forEach(function(sp){ var ab=(sp.stat&&+sp.stat.atBats)||0; if(ab>bestAB){ bestAB=ab; best=sp; } });
      var st=best.stat||{};
      return { AB:st.atBats, H:st.hits, '2B':st.doubles, '3B':st.triples, HR:st.homeRuns, BB:st.baseOnBalls, SO:st.strikeOuts, HBP:st.hitByPitch, SF:st.sacFlies, PA:st.plateAppearances, AVG:st.avg, RBI:st.rbi };
    }catch(e){ return null; }
  }

  // ===== [pitcher fix] PITCHING RESOLUTION (docs/RESOLVER_COVERAGE.md section 2) =====
  // The season-stats call the builder never made. Before this, mlbSeasonHitting was
  // the ONLY season-stats call in the file: resolveCard identified the player, held
  // the personId, then asked for hitting -- for everybody -- and 21 of Nick's 126
  // cards (55% of the no-line bucket) were pitchers with real careers the code
  // never asked about.
  // "84.2" innings = 84 and 2/3. parseIP folds statsapi's .1/.2 thirds notation.
  function parseIP(ip){ var m=String(ip==null?'':ip).match(/^(\d+)(?:\.(\d))?$/); if(!m) return 0; return (+m[1])+((+m[2]||0)/3); }
  // Map a season pitching line to the SAME six per-PA keys the sim's log5 blend
  // expects, measured per batter faced: what a plate appearance against this
  // pitcher yields. Mirrors lineToRates' shape and its small-sample floor so the
  // two sides of the blend stay symmetric.
  function pitchLineToRates(L){
    var H=+L.H||0, d2=+L['2B']||0, t3=+L['3B']||0, hr=+L.HR||0, bb=+L.BB||0, so=+L.SO||0, hbp=+L.HBP||0;
    var BF=+L.BF||0;
    if(!BF){ BF=Math.round(parseIP(L.IP)*3)+H+bb+hbp; } // pre-modern rows can lack battersFaced; reconstruct
    if(BF<50) return null; // too few batters faced to model reliably (mirrors PA<50)
    var singles=Math.max(0, H-d2-t3-hr);
    var r={ BB:(bb+hbp)/BF, K:so/BF, HR:hr/BF, _2B:d2/BF, _3B:t3/BF, _1B:singles/BF };
    return clampRates(r);
  }
  async function mlbSeasonPitching(personId,year){
    var url=MLB_BASE+'/people/'+personId+'/stats?stats=season&group=pitching&season='+year;
    try{
      var r=await fetch(url); if(!r.ok) return null; var j=await r.json();
      var splits=(j&&j.stats&&j.stats[0]&&j.stats[0].splits)||[];
      if(!splits.length) return null;
      // Prefer the no-team season-TOTAL split statsapi emits for traded years;
      // else the largest-BF slice (same convention as mlbSeasonHitting's largest-AB).
      var best=null;
      splits.forEach(function(sp){ if(!sp.team && !best) best=sp; });
      if(!best){ var bestBF=-1; splits.forEach(function(sp){ var bf=(sp.stat&&+sp.stat.battersFaced)||0; if(bf>bestBF){ bestBF=bf; best=sp; } }); }
      var st=best.stat||{};
      return { BF:st.battersFaced, H:st.hits, '2B':st.doubles, '3B':st.triples, HR:st.homeRuns, BB:st.baseOnBalls, SO:st.strikeOuts, HBP:st.hitByPitch, ERA:st.era, W:st.wins, L:st.losses, IP:st.inningsPitched };
    }catch(e){ return null; }
  }

  // ===== [ladder rung 2] BEST SEASON (decided 2026-08-12, amended 2026-08-14) =====
  // When the declared season has no modelable line, the player's BEST season plays
  // -- a 1993 Jeter plays as peak Jeter, a 1988 Schulze as his fullest real year --
  // and every surface that shows the line LABELS it, because a card quietly playing
  // a different year than its face is the display/engine divergence again.
  //   Hitters:  best OPS among seasons with PA >= 200.
  //   Pitchers: best (lowest) ERA among seasons with IP >= 50. ERA is Nick's
  //             INTERIM metric ruling (2026-08-14, "ERA until he says otherwise");
  //             swap ONE comparator below when he picks another.
  // The floors keep a 12-PA September call-up or a 3-inning cameo from winning
  // "best"; when NO season clears its floor, the FULLEST season (most PA / most
  // batters faced) plays, so rung 2 still lands before falling to rungs 3-4
  // (MiLB / manual stats -- not built here, see GRANT_AUTHORITY queue).
  // Per-season totals: the no-team TOT split wins over team slices -- a season's
  // line is the season's line, not the biggest team-slice of it.
  // sportId (optional) points the same scan at a minor league level for rung 3;
  // absent = MLB, exactly as before. Returns {year, line, score, size}: score is
  // the comparator value when the picked season cleared its floor (null when the
  // pick fell to the fullest season), size its PA/BF -- rung 3 compares across
  // levels with them.
  async function mlbBestSeason(personId, group, sportId){
    var url=MLB_BASE+'/people/'+personId+'/stats?stats=yearByYear&group='+group+(sportId?('&sportId='+sportId):'');
    try{
      var r=await fetch(url); if(!r.ok) return null; var j=await r.json();
      var splits=(j&&j.stats&&j.stats[0]&&j.stats[0].splits)||[];
      if(!splits.length) return null;
      var bySeason={};
      splits.forEach(function(sp){
        if(!sp.season || !sp.stat) return;
        var size=(group==='pitching')?(+sp.stat.battersFaced||0):(+sp.stat.atBats||0);
        var cur=bySeason[sp.season];
        if(!cur){ bySeason[sp.season]={ sp:sp, size:size, total:!sp.team }; return; }
        if(cur.total) return;
        if(!sp.team){ bySeason[sp.season]={ sp:sp, size:size, total:true }; return; }
        if(size>cur.size){ bySeason[sp.season]={ sp:sp, size:size, total:false }; }
      });
      var years=Object.keys(bySeason); if(!years.length) return null;
      var best=null, bestScore=null, fullest=null, fullestSize=-1;
      years.forEach(function(yr){
        var st=bySeason[yr].sp.stat;
        if(group==='pitching'){
          var bf=+st.battersFaced||0;
          if(bf>fullestSize){ fullestSize=bf; fullest=yr; }
          if(parseIP(st.inningsPitched)>=50){
            var era=parseFloat(st.era);
            if(isFinite(era) && (bestScore==null || era<bestScore)){ bestScore=era; best=yr; }
          }
        } else {
          var pa=+st.plateAppearances||0;
          if(pa>fullestSize){ fullestSize=pa; fullest=yr; }
          if(pa>=200){
            var ops=parseFloat(st.ops);
            if(isFinite(ops) && (bestScore==null || ops>bestScore)){ bestScore=ops; best=yr; }
          }
        }
      });
      var pick=best||fullest; if(!pick) return null;
      var st2=bySeason[pick].sp.stat;
      var line=(group==='pitching')
        ? { BF:st2.battersFaced, H:st2.hits, '2B':st2.doubles, '3B':st2.triples, HR:st2.homeRuns, BB:st2.baseOnBalls, SO:st2.strikeOuts, HBP:st2.hitByPitch, ERA:st2.era, W:st2.wins, L:st2.losses, IP:st2.inningsPitched }
        : { AB:st2.atBats, H:st2.hits, '2B':st2.doubles, '3B':st2.triples, HR:st2.homeRuns, BB:st2.baseOnBalls, SO:st2.strikeOuts, HBP:st2.hitByPitch, SF:st2.sacFlies, PA:st2.plateAppearances, AVG:st2.avg, RBI:st2.rbi };
      var pickedSize=(group==='pitching')?(+st2.battersFaced||0):(+st2.plateAppearances||0);
      return { year:(parseInt(pick,10)||pick), line:line, score:((pick===best)?bestScore:null), size:pickedSize };
    }catch(e){ return null; }
  }

  // ===== [ladder rung 3] MiLB BEST SEASON (amended ruling 2026-08-14) =====
  // A player with NO MLB line at all (the Bibbs class) plays his best MINOR-league
  // season -- real numbers, MARKED as MiLB on every surface that shows them.
  // sportIds per the ruling: 11 AAA, 12 AA, 13 High-A, 14 Single-A. Queried one
  // level at a time: statsapi ignores a plural sportIds= on this endpoint
  // (measured 2026-08-14: Bibbs 451682 sportId=12 returns his two Huntsville
  // years; sportIds=11,12,13,14 returns zero splits).
  var MILB_SPORT_IDS=[11,12,13,14];
  async function mlbBestMiLBSeason(personId, group){
    var cands=[];
    for(var i=0;i<MILB_SPORT_IDS.length;i++){
      var b=await mlbBestSeason(personId, group, MILB_SPORT_IDS[i]);
      if(b) cands.push(b);
    }
    if(!cands.length) return null;
    // Cross-level pick, same comparators as rung 2: floor-cleared seasons compete
    // on score (hitters max OPS, pitchers min ERA); only when NO level cleared its
    // floor does the fullest season anywhere play.
    var scored=cands.filter(function(c){ return c.score!=null; });
    var pool=scored.length?scored:cands, pick=pool[0];
    for(var k=1;k<pool.length;k++){
      if(scored.length){ if(group==='pitching' ? (pool[k].score<pick.score) : (pool[k].score>pick.score)) pick=pool[k]; }
      else { if(pool[k].size>pick.size) pick=pool[k]; }
    }
    return pick;
  }

  // ----- Master resolver: API by name+year -> card-text fallback -> unusable -----
  async function resolveCard(card){
    var out={ status:'pending', note:'', team:card.team||'', tendency:'spray', avg:'.000', hr:0, rbi:0, rates:null, pos:card.pos||'', era:'', w:null, l:null };
    // GAP1 read order step 0: stored rich rates short-circuit the network call.
    // A previously-persisted genuine MLB-API resolution (ratesMeta with the six keys, matching
    // the card year) is preferred over a fresh API hit or the flat avgToRates fallback.
    try{
      var rm = card.ratesMeta || (card._meta && card._meta.ratesMeta) || null;
      if(rm && rm.rates && (rm.year==null || String(rm.year)===String(card.yr))){
        var rr = rm.rates, keys=['BB','K','HR','_2B','_3B','_1B'], okr=true;
        for(var ki=0;ki<keys.length;ki++){ var vv=rr[keys[ki]]; if(typeof vv!=='number'||!isFinite(vv)||vv<0){ okr=false; break; } }
        if(okr){
          out.status='api'; out.rates={ BB:rr.BB, K:rr.K, HR:rr.HR, _2B:rr._2B, _3B:rr._3B, _1B:rr._1B };
          // Restore the persisted fielding position so a warm load keeps its position with no API call.
          if(rm.pos!=null && rm.pos!=='') out.pos=rm.pos;
          // [pitcher fix]/[ladder] Restore which QUESTION was asked (group) and which
          // SEASON answered it, so a warm load labels itself exactly like a cold one.
          if(rm.group==='pitching') out.group='pitching';
          if(rm.season!=null) out.season=rm.season;
          if(rm.seasonSource) out.seasonSource=rm.seasonSource;
          if(rm.league) out.league=rm.league;
          var _ln=rm.line||null;
          if(_ln){
            if(out.group==='pitching'){
              // A pitching line's H/HR/BB are ALLOWED numbers -- never let them
              // masquerade as a batting display line.
              if(_ln.ERA!=null&&_ln.ERA!=='') out.era=String(_ln.ERA);
              if(_ln.W!=null) out.w=String(_ln.W);
              if(_ln.L!=null) out.l=String(_ln.L);
            } else {
              if(_ln.AVG!=null) out.avg=fmtAvg(_ln.AVG); out.hr=+_ln.HR||0; out.rbi=+_ln.RBI||0;
            }
          }
          out.note='stored MLB rates'+(rm.year!=null?(' '+rm.year):'')+((rm.seasonSource==='milb'&&rm.season!=null)?(' · MiLB line '+rm.season):((rm.seasonSource==='best'&&rm.season!=null)?(' · best season '+rm.season):'')); out._stored=true;
          return out;
        }
      }
    }catch(_e0){}
      try{ var _cs=card.stats||{}; if(_cs.ERA!=null) out.era=String(_cs.ERA); if(_cs.W!=null) out.w=String(_cs.W); if(_cs.L!=null) out.l=String(_cs.L); }catch(_e){}
    // 1) MLB API by player name + declared season (default: printed year)
    if(card.player && card.yr){
      var person=await mlbFindPlayer(card.player);
      if(person && !person.ambiguous && person.id){
        // Capture the player's actual fielding position from the same API lookup.
        out.pos=(person.primaryPosition && person.primaryPosition.abbreviation) || '';
        // [ladder] rung 1 = the card's declared season (meta.season override, else
        // the printed year). rung 2 = the player's best season when rung 1 has no
        // modelable line. Rungs 3-4 (MiLB best season / manual stats) are queued,
        // not built here. Every rung routes through the SAME rates derivation; the
        // sim never needs to know which rung fired, but the DISPLAY does -- hence
        // out.season / out.seasonSource ride on every non-rung-1 resolution.
        var seasonWanted=(card.season!=null)?card.season:card.yr;
        if(normPos(out.pos)==='P'){
          // [pitcher fix] Ask the question that matches the player. group=pitching
          // for pitchers (incl. TWP) -- the lookup used to ask for hitting for
          // EVERYBODY (docs/RESOLVER_COVERAGE.md 2.1: 'group=pitching' appeared
          // zero times in this file), which is why 21 of Nick's 126 sat at "no MLB
          // line" while the resolver held their personId the whole time.
          var pline=await mlbSeasonPitching(person.id, seasonWanted);
          var prates=pline?pitchLineToRates(pline):null;
          var pyear=seasonWanted;
          if(!prates){
            var pbest=await mlbBestSeason(person.id,'pitching');
            if(pbest){ var pbr=pitchLineToRates(pbest.line); if(pbr){ pline=pbest.line; prates=pbr; pyear=pbest.year; } }
          }
          if(!prates){
            // [ladder rung 3] no MLB line at any season -- his best MiLB season plays.
            var pmilb=await mlbBestMiLBSeason(person.id,'pitching');
            if(pmilb){ var pmr=pitchLineToRates(pmilb.line); if(pmr){ pline=pmilb.line; prates=pmr; pyear=pmilb.year; out.league='MiLB'; } }
          }
          if(prates){
            out.status='api'; out.group='pitching'; out.rates=prates;
            if(pline.ERA!=null&&pline.ERA!=='') out.era=String(pline.ERA);
            if(pline.W!=null) out.w=String(pline.W);
            if(pline.L!=null) out.l=String(pline.L);
            out.season=pyear;
            if(out.league==='MiLB'){ out.seasonSource='milb'; out.note='MiLB pitching, best season '+pyear; }
            else {
              if(String(pyear)!==String(card.yr)){ out.seasonSource=(card.season!=null&&String(pyear)===String(card.season))?'declared':'best'; }
              out.note=(out.seasonSource==='best')?('MLB API pitching, best season '+pyear):('MLB API pitching '+pyear);
            }
            out._freshLine=pline; out._freshRates=prates; return out;
          }
          out.note='MLB API: no pitching line for '+seasonWanted+' or any season, MLB or MiLB';
        } else {
          var line=await mlbSeasonHitting(person.id, seasonWanted);
          var rates=line?lineToRates(line):null;
          var hyear=seasonWanted;
          if(!rates){
            // [ladder rung 2] No modelable line for the declared season -- the test
            // is "is there a line", not "why is there not", so this covers both
            // failure shapes: printed year outside the career (Jeter 1993, Ruth
            // legacy inserts) AND inside-career years with no line (Bo Jackson
            // 1992, the hip). See RESOLVER_COVERAGE.md 4.3.
            var hbest=await mlbBestSeason(person.id,'hitting');
            if(hbest){ var hbr=lineToRates(hbest.line); if(hbr){ line=hbest.line; rates=hbr; hyear=hbest.year; } }
          }
          if(!rates){
            // [ladder rung 3] no MLB line at any season (the Bibbs class) -- his
            // best MiLB season plays, real numbers, marked MiLB wherever shown.
            var hmilb=await mlbBestMiLBSeason(person.id,'hitting');
            if(hmilb){ var hmr=lineToRates(hmilb.line); if(hmr){ line=hmilb.line; rates=hmr; hyear=hmilb.year; out.league='MiLB'; } }
          }
          if(rates){
            out.status='api'; out.rates=rates; out.avg=fmtAvg(line.AVG); out.hr=+line.HR||0; out.rbi=+line.RBI||0;
            out.season=hyear;
            if(out.league==='MiLB'){ out.seasonSource='milb'; out.note='MiLB line, best season '+hyear; }
            else {
              if(String(hyear)!==String(card.yr)){ out.seasonSource=(card.season!=null&&String(hyear)===String(card.season))?'declared':'best'; }
              out.note=(out.seasonSource==='best')?('MLB API, best season '+hyear):('MLB API '+hyear);
            }
            out._freshLine=line; out._freshRates=rates; return out;
          }
          out.note='MLB API: no '+seasonWanted+' hitting line, MLB or MiLB';
        }
      } else if(person && person.ambiguous){ out.note='MLB API: ambiguous name'; }
      else { out.note='MLB API: no match'; }
    } else { out.note='missing name or year'; }
    // 2) Fallback: card stat-line text (AVG/HR/RBI)
    var cf=cardStatFields(card);
    if(cf.avg){
      var fr=avgToRates(cf.avg,cf.hr,cf.rbi);
      if(fr){ out.status='card'; out.rates=fr; out.avg=fmtAvg(cf.avg); out.hr=parseInt(cf.hr,10)||0; out.rbi=parseInt(cf.rbi,10)||0; out.note=(out.note?out.note+'; ':'')+'card stat-line (approx)'; return out; }
    }
    // 3) Unusable
    out.status='bad'; out.note=(out.note?out.note+'; ':'')+'no usable stats'; out.rates=null; return out;
  }
  function fmtAvg(a){ a=parseFloat(a); if(!isFinite(a)) return '.000'; return a.toFixed(3).replace(/^0/,''); }
/* ---- END EXTRACT ---- */

function unpackNotes(notes){ notes=notes||''; var i=notes.indexOf(META_MARK); if(i<0) return { bio:notes, meta:{} }; var j=notes.indexOf(META_END,i); var meta={}; if(j>i){ try{ meta=JSON.parse(notes.slice(i+META_MARK.length,j)); }catch(e){ meta={}; } } return { bio:notes.slice(0,i), meta:meta }; }
function rowToCard(r){ var u=unpackNotes(r.notes); var yr=parseInt(r.year,10)||null; return { id:r.id, player:r.player||'', team:r.team||'', yr:yr, source:r.source||'', brand:r.brand||'', set:r.set||'', number:r.number||'', pos:(u.meta&&u.meta.pos)||'', type:(u.meta&&u.meta.type)||'hitter', season:((u.meta&&u.meta.season!=null)?(parseInt(u.meta.season,10)||null):null), stats:(u.meta&&u.meta.stats)||{}, _meta:(u.meta||{}), ratesMeta:((u.meta&&u.meta.ratesMeta)||null) };
}

/* Classification per the item-1.5 brief (categories a-f), computed from the
   resolver's OWN output -- never from re-reading the name. */
function classify(c, rv){
  var reason = (window.depotPlayableReason ? window.depotPlayableReason(c.player) : null);
  if(reason) return { cat:'d-structural', root:'no single player ('+reason+')', fix:'honest "collectible, not fieldable" label', status:'BY DESIGN' };
  if(rv.status==='api'){
    if(rv.seasonSource==='milb') return { cat:'e-zero-mlb', root:'no MLB career; MiLB line found', fix:'rung 3 (MiLB best season) -- RESOLVED, marked MiLB', status:'RESOLVED (MiLB '+rv.season+')' };
    if(rv.group==='pitching' && rv.seasonSource==='best') return { cat:'b-career-year', root:'pitcher; printed year has no line', fix:'rung 2 best season (pitching)', status:'RESOLVED (best '+rv.season+')' };
    if(rv.group==='pitching') return { cat:'a-pitcher', root:'pitching lookup (item 1)', fix:'rung 1 group=pitching', status:'RESOLVED ('+rv.season+')' };
    if(rv.seasonSource==='best') return { cat:'b-career-year', root:'printed year has no modelable line', fix:'rung 2 best season', status:'RESOLVED (best '+rv.season+')' };
    return { cat:'ok', root:'', fix:'', status:'RESOLVED ('+(rv.season!=null?rv.season:c.yr)+(rv._stored?' stored':'')+')' };
  }
  if(/ambiguous/i.test(rv.note||'')) return { cat:'c-ambiguous', root:'name matches more than one person', fix:'ID override, decided by debut year vs card era', status:'NEEDS OVERRIDE' };
  if(/no match/i.test(rv.note||'')) return { cat:'f-other', root:'MLB people search returns nobody', fix:'inspect name; possibly MiLB-only spelling or non-player', status:'UNRESOLVED' };
  if(/no pitching line|no .* hitting line/i.test(rv.note||'')) return { cat:'e-zero-mlb', root:'person found, no line MLB or MiLB', fix:'rung 4 manual stats -- Nick call per card', status:'LISTED FOR NICK' };
  if(rv.status==='card') return { cat:'f-other', root:'resolved from card stat-line text only', fix:'none needed unless a real line exists', status:'FLAT (card text)' };
  return { cat:'f-other', root:(rv.note||'unknown'), fix:'name it, do not force-fit', status:'UNRESOLVED' };
}

async function depotAuditBinder(){
  var sb = window.depotSB ? window.depotSB() : null;
  if(!sb){ throw new Error('no depotSB client on this page'); }
  var u = await window.depotUser();
  if(!u){ throw new Error('not signed in'); }
  console.log('[audit] running as', u.email, u.id, '-- READS ONLY, zero writes');
  var coll = await sb.from('collections').select('id').eq('owner_id',u.id).order('created_at',{ascending:true}).limit(1);
  if(coll.error) throw coll.error;
  if(!coll.data||!coll.data.length) throw new Error('no collection for this account');
  var res = await sb.from('cards').select('*').eq('collection_id',coll.data[0].id).order('created_at',{ascending:true});
  if(res.error) throw res.error;
  var cards=(res.data||[]).map(rowToCard);
  console.log('[audit]', cards.length, 'cards; resolving with the ladder resolver (rungs 1-3)…');
  var rows=[], tally={};
  for(var i=0;i<cards.length;i++){
    var c=cards[i];
    var rv; try{ rv=await resolveCard(c); }catch(e){ rv={status:'bad', note:'resolver threw: '+(e&&e.message)}; }
    var cl=classify(c, rv);
    tally[cl.cat]=(tally[cl.cat]||0)+1;
    rows.push('| '+[(c.player||'(unnamed)').replace(/\|/g,'/'), (c.yr||'?'), (c.brand||''), (c.number||''), (c.source||'?'), (cl.cat==='d-structural'?'structural':(rv.group==='pitching'?'pitcher':'hitter')), (rv.status||'?')+(rv._stored?'/stored':''), cl.root, cl.fix, cl.status].join(' | ')+' |');
    if((i+1)%10===0) console.log('[audit]', (i+1)+'/'+cards.length);
  }
  var md='# BINDER_AUDIT.md — measured '+new Date().toISOString().slice(0,10)+' on '+u.email+' ('+cards.length+' cards), ladder resolver, DRY RUN (zero writes)\n\n'
    +'Tally: '+JSON.stringify(tally)+'\n\n'
    +'| card | year | brand | # | source | type | resolve | root cause | fix path | status |\n'
    +'|---|---|---|---|---|---|---|---|---|---|\n'
    +rows.join('\n')+'\n';
  window.__BINDER_AUDIT_MD = md;
  console.log(md);
  console.log('[audit] done. Markdown in window.__BINDER_AUDIT_MD');
  return tally;
}
window.depotAuditBinder = depotAuditBinder;
})();

/* depot-add-card-search.js — Add-a-Card image half (feat/add-card-search)
 * Additive layer over the existing rolodex (steps 1-3). Renders the real card
 * rows for a chosen brand with library-art badges, probes art on row-click,
 * paints the preview slots, and gates ADD on a confirmed-painting front image.
 * Reuses depotResolveCardArt / depotLibraryArtURL / depotProbeCardArt and the
 * existing upload machinery. No new Supabase client. Fail-loud [depot] logs.
 */
(function(){
  'use strict';
  var TAG='[depot][addcard]';
  function log(){ try{ var a=['%c'+TAG,'color:#0a7'].concat([].slice.call(arguments)); console.debug.apply(console,a); }catch(e){} }
  function warn(){ try{ console.warn.apply(console,[TAG].concat([].slice.call(arguments))); }catch(e){} }

  // Build the catalog identity key the resolver uses: year|setslug|setslug|number.
  // We mirror the art module's slug/normNum so the key matches card_library rows.
  function slug(s){ return String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
  function normNum(n){ var s=String(n==null?'':n).trim(); var m=s.match(/^0*([0-9].*)$/); return m?m[1]:s; }
  function catalogKeyFor(year, setName, number){
    var sg=slug(setName); var nn=normNum(number);
    if(!year||!sg||nn==='') return null;
    return String(year)+'|'+sg+'|'+sg+'|'+nn;
  }

  // Batch-query public.card_library for which (key,side) images exist, so we can
  // badge rows front+back / front-only / no-image without probing every one.
  // depotProbeCardArt remains the authoritative gate before ADD unlocks.
  function libBase(){
    try{ if(window.DEPOT_SUPABASE_CONFIG && window.DEPOT_SUPABASE_CONFIG.url) return window.DEPOT_SUPABASE_CONFIG.url; }catch(e){}
    try{ if(typeof window.SUPABASE_URL==='string' && window.SUPABASE_URL) return window.SUPABASE_URL; }catch(e){}
    return null;
  }
  function libAnonKey(){
    // The app config exposes the anon key as DEPOT_SUPABASE_CONFIG.key.
    try{ var c=window.DEPOT_SUPABASE_CONFIG; if(c && (c.key||c.anonKey)) return c.key||c.anonKey; }catch(e){}
    try{ if(typeof window.SUPABASE_ANON_KEY==='string') return window.SUPABASE_ANON_KEY; }catch(e){}
    return null;
  }
  function batchLibrary(keys){
    // Returns a Promise<Map key -> {front:bool, back:bool}>. Never rejects; on
    // failure resolves empty and callers fall back to per-row probe (fail-loud).
    var out={};
    var base=libBase(); var anon=libAnonKey();
    var uniq=[]; var seen={};
    for(var i=0;i<keys.length;i++){ var k=keys[i]; if(k && !seen[k]){ seen[k]=1; uniq.push(k); } }
    if(!base || !anon || !uniq.length){ if(!base||!anon) warn('no supabase config for batch; will probe per-row'); return Promise.resolve(out); }
    var inList=uniq.map(function(k){ return '"'+k.replace(/"/g,'')+'"'; }).join(',');
    var url=base.replace(/\/+$/,'')+'/rest/v1/card_library?select=catalog_key,side&catalog_key=in.('+encodeURIComponent(inList)+')';
    return fetch(url,{headers:{apikey:anon,Authorization:'Bearer '+anon}}).then(function(r){
      if(!r.ok){ warn('card_library batch http '+r.status+'; will probe per-row'); return out; }
      return r.json().then(function(rows){
        for(var j=0;j<rows.length;j++){ var row=rows[j]; var k=row.catalog_key; if(!k) continue; if(!out[k]) out[k]={front:false,back:false}; if(row.side==='front') out[k].front=true; else if(row.side==='back') out[k].back=true; }
        return out;
      });
    }).catch(function(e){ warn('card_library batch failed; will probe per-row', e&&e.message); return out; });
  }

  // ---- ADD-gate state -------------------------------------------------------
  // frontConfirmed is true when either the library front probed TRUE for the
  // selected row, or the user attached a front scan. ADD is enabled iff true.
  var _frontConfirmed=false;
  function addBtn(){ return document.getElementById('addCardBtn') || document.getElementById('f-save') || document.querySelector('[data-role="add-card-save"]'); }
  function setAddEnabled(on){
    _frontConfirmed=!!on;
    var b=addBtn(); if(!b) return;
    if(on){ b.classList.remove('disabled'); b.removeAttribute('aria-disabled'); b.removeAttribute('disabled'); }
    else { b.classList.add('disabled'); b.setAttribute('aria-disabled','true'); }
  }
  // A personal upload always wins (resolver order personal->library). When the
  // user attaches a front scan, unlock ADD regardless of library state.
  function userAttachedFront(){ var el=document.getElementById('f-photo'); return !!(el && el.value && /^data:/.test(el.value)); }
  function refreshGateFromUpload(){ if(userAttachedFront()) setAddEnabled(true); }
  window.depotAddCardRefreshGate=refreshGateFromUpload;
  // Functional ADD gate consulted by saveCard on EVERY save path (legacy inline onclick included).
  // True only when a front image is confirmed: library probe TRUE (_frontConfirmed) OR the user attached a front scan.
  window.depotAddCardGateOk=function(){ try{ return !!(_frontConfirmed || userAttachedFront()); }catch(e){ return true; } };

  // ---- Row thumbnails -------------------------------------------------------
// Recognition thumbs: the SAME library front the CARD IMAGES panel will show,
// painted small so a collector spots their card by sight. Same probe-gated
// discipline as the binder tiles: the row keeps its designed "no image yet"
// tile face until a real Image() load succeeds, so a 404 can never surface a
// broken image. Generation-guarded, so rapid brand-switching cannot paint a
// stale thumb. These are full-size library JPEGs rendered small; see
// FUTURE_ITEMS on whether resized derivatives are worth building.
var _gen = 0;                 // bumped per render(); older loads are stale
var _inflight = 0, _queue = [], MAX_THUMBS = 4;
var _thumbState = {};         // url -> 'ok' | 'fail'
var _io = null;

function paintThumb(slot, url){
  if(!slot || !slot.isConnected) return;
  slot.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")';
  if(slot.parentNode && slot.parentNode.classList) slot.parentNode.classList.add('has-thumb');
}
function pumpThumbs(){
  while(_inflight < MAX_THUMBS && _queue.length){
    var job = _queue.shift();
    if(job.gen !== _gen) continue;   // superseded brand pick: never paint it
    _inflight++;
    (function(j){
      var im = new Image();
      im.onload = function(){ _inflight--; _thumbState[j.url] = 'ok'; if(j.gen === _gen) paintThumb(j.slot, j.url); pumpThumbs(); };
      im.onerror = function(){ _inflight--; _thumbState[j.url] = 'fail'; log('thumb miss', j.url); pumpThumbs(); };
      im.src = j.url;
    })(job);
  }
}
function queueThumb(slot, cardObj, gen){
  if(!slot || gen !== _gen) return;
  var url = window.depotLibraryArtURL ? window.depotLibraryArtURL(cardObj, 'front') : null;
  if(!url){ warn('no library url for thumb; row keeps its empty tile'); return; }
  if(_thumbState[url] === 'fail') return;
  if(_thumbState[url] === 'ok'){ paintThumb(slot, url); return; }
  _queue.push({ slot: slot, url: url, gen: gen });
  pumpThumbs();
}
// Lazy: a thumb only starts loading once its row is on (or near) screen.
function observeThumb(slot, cardObj, gen){
  if(!slot || gen !== _gen) return;
  if(typeof window.IntersectionObserver !== 'function'){ queueThumb(slot, cardObj, gen); return; }
  if(!_io){
    _io = new window.IntersectionObserver(function(entries){
      for(var i=0;i<entries.length;i++){
        if(!entries[i].isIntersecting) continue;
        var s = entries[i].target;
        _io.unobserve(s);
        if(s.__thumbJob) queueThumb(s, s.__thumbJob.card, s.__thumbJob.gen);
      }
    }, { rootMargin: '200px' });
  }
  slot.__thumbJob = { card: cardObj, gen: gen };
  _io.observe(slot);
}
function resetThumbs(){
  _queue.length = 0;
  if(_io){ _io.disconnect(); _io = null; }
}

// ---- Row list with badges -------------------------------------------------
  function listEl(){ return document.getElementById('rolo-card-list'); }
  function currentYear(){ var y=document.getElementById('f-yr'); return y?parseInt(y.value,10)||0:0; }

  function settleBadge(badge, cardObj, onState){ var done=false; function finish(st){ if(done) return; done=true; badge.className='rcr-badge rcr-'+st; badge.textContent=badgeText(st); if(onState){ try{ onState(st); }catch(e){ warn('thumb hook failed', e&&e.message); } } } var to=setTimeout(function(){ finish('none'); }, 4000); try{ if(!window.depotProbeCardArt){ clearTimeout(to); finish('none'); return; } Promise.resolve(window.depotProbeCardArt(cardObj,'front')).then(function(hf){ return Promise.resolve(hf?window.depotProbeCardArt(cardObj,'back'):false).then(function(hb){ clearTimeout(to); finish(hf?(hb?'both':'front'):'none'); }); }).catch(function(){ clearTimeout(to); finish('none'); }); }catch(e){ clearTimeout(to); finish('none'); } }

  function badgeText(state){ return state==='both'?'front + back':(state==='front'?'front only':'no image yet'); }

  function makeCardObj(row, year){
    // Mirror the write contract: art resolver reads .set (brand==set by design).
    return { set: row.set!=null?row.set:row.brand, brand: row.brand, number: row.number, yr: year, year: year, player: row.player };
  }

  function clearPreviews(){
    try{ if(typeof setPreview==="function"){ setPreview("front",""); setPreview("back",""); } }catch(e){ warn("clear preview failed", e&&e.message); }
  }
  function paintPreviewFromLibrary(cardObj){
    // Show library art in BOTH preview slots without writing #f-photo, so the
    // saved row keeps empty photo paths (resolver paints from library). If the
    // user uploads afterwards, onFile fills #f-photo and their scan wins.
    try{
      var f=window.depotLibraryArtURL?window.depotLibraryArtURL(cardObj,'front'):null;
      var b=window.depotLibraryArtURL?window.depotLibraryArtURL(cardObj,'back'):null;
      if(typeof setPreview==='function'){ if(f) setPreview('front', f); if(b) setPreview('back', b); }
    }catch(e){ warn('paint preview failed', e&&e.message); }
  }

  function onRowPick(row, year, keyState){
    // Sync the form fields verbatim (set & number exactly as the catalog row).
    var fset=document.getElementById('f-set'); if(fset) fset.value = (row.set!=null?row.set:row.brand)||'';
    var fnum=document.getElementById('f-num'); if(fnum) fnum.value = row.number!=null?String(row.number):'';
    var rn=document.getElementById('rolo-num'); if(rn) rn.value = row.number!=null?String(row.number):'';
    // team: catalog row's team when non-empty (else MLB split fills later, else NULL).
    if(row.team){ var ft=document.getElementById('f-team'); if(ft && !ft.value.trim()) ft.value=row.team; }
    // Record the catalog_key for the write contract (nullable, additive).
    window.DEPOT_PENDING_CATALOG_KEY = catalogKeyFor(year, (row.set!=null?row.set:row.brand), row.number);

    var cardObj=makeCardObj(row, year);
    // Authoritative gate: probe the real bucket (table can run ~2 objects behind).
    setAddEnabled(false);
    clearPreviews();
    var uploadHint=document.getElementById('rolo-upload-hint');
    if(!window.depotProbeCardArt){ warn('no probe fn; leaving locked'); return; }
    Promise.resolve(window.depotProbeCardArt(cardObj,'front')).then(function(hasFront){
      if(hasFront){
        paintPreviewFromLibrary(cardObj);
        if(uploadHint) uploadHint.style.display='';   // shown, NOT disabling upload
        setAddEnabled(true);
        log('front art confirmed for', window.DEPOT_PENDING_CATALOG_KEY);
      } else {
        // No library front: friendly prompt + existing upload affordances stay live.
        if(uploadHint){ uploadHint.style.display=''; }
        var msg=document.getElementById('rolo-noimg-msg');
        if(msg){ msg.style.display=''; }
        // ADD stays locked until the user attaches a front scan (refreshGate).
        refreshGateFromUpload();
        log('no library front; awaiting user scan for', window.DEPOT_PENDING_CATALOG_KEY);
      }
    }).catch(function(e){ warn('probe failed; leaving locked', e&&e.message); refreshGateFromUpload(); });
  }

  function render(brand){
    var host=listEl(); if(!host){ return; }
    var rows=(typeof ROLO_YEAR_CARDS!=='undefined' && Array.isArray(ROLO_YEAR_CARDS))?ROLO_YEAR_CARDS:[];
    if(brand){ rows=rows.filter(function(c){ return c.brand===brand; }); }
    var myGen=++_gen; resetThumbs(); /* this render owns _gen: older thumb loads are stale */ host.innerHTML='';
    if(!rows.length){ host.style.display='none'; return; }
    host.style.display='';
    var year=currentYear();
    // Detect shared art keys within this render so we can note 'same image'.
    var keyCount={}; var rowKeys=[];
    rows.forEach(function(r){ var k=catalogKeyFor(year,(r.set!=null?r.set:r.brand),r.number); rowKeys.push(k); if(k){ keyCount[k]=(keyCount[k]||0)+1; } });
    batchLibrary(rowKeys).then(function(map){ if(myGen!==_gen){ log('stale brand render dropped'); return; }
      rows.forEach(function(r,idx){
        var k=rowKeys[idx];
        var info=(k && map[k])?map[k]:null;
        var state = info ? (info.front && info.back ? 'both' : (info.front ? 'front' : 'none')) : 'unknown';
        var el=document.createElement('button'); el.type='button'; el.className='rolo-card-row'; el.setAttribute('data-num', r.number==null?'':String(r.number));
        var label=document.createElement('span'); label.className='rcr-set'; label.textContent=(r.set!=null?r.set:r.brand)||'';
        var num=document.createElement('span'); num.className='rcr-num'; num.textContent='#'+(r.number==null?'':r.number);
        var badge=document.createElement('span'); badge.className='rcr-badge rcr-'+state; badge.textContent = state==='unknown'?'checking…':badgeText(state);
        var thumb=document.createElement('span'); thumb.className='rcr-thumb'; thumb.setAttribute('aria-hidden','true'); el.appendChild(thumb); /* the thumb leads the row */ el.appendChild(label); el.appendChild(num); el.appendChild(badge); if(state==='unknown'){ settleBadge(badge, makeCardObj(r, year), function(st){ if(st==='front'||st==='both') observeThumb(thumb, makeCardObj(r, year), myGen); }); } else if(state==='front'||state==='both'){ observeThumb(thumb, makeCardObj(r, year), myGen); } // never rest on checking…
        if(k && keyCount[k]>1){ var same=document.createElement('span'); same.className='rcr-same'; same.textContent='same image'; el.appendChild(same); }
        el.onclick=function(){
          var sib=host.querySelectorAll('.rolo-card-row'); for(var i=0;i<sib.length;i++){ sib[i].classList.remove('sel'); }
          el.classList.add('sel');
          onRowPick(r, year, state);
        };
        host.appendChild(el);
      });
    });
  }

  // Hook: called at the end of roloBrandPick(v). Guarded so a missing host or
  // data layer never throws into the legacy flow.
  // A new player or a new season invalidates the step-4 list. Clear it (and
// bump the thumb generation with it) instead of leaving the previous
// player's rows -- and now their thumbs -- sitting under a fresh search.
window.depotAddCardResetList=function(){
  try{ ++_gen; resetThumbs(); var host=listEl(); if(host){ host.innerHTML=''; host.style.display='none'; } }
  catch(e){ warn('reset list failed', e&&e.message); }
};

window.depotAddCardEnhance=function(brand){
    try{ render(brand); }catch(e){ warn('enhance failed', e&&e.message); }
  };

  // Keep the ADD gate honest if the user uploads after a no-image row.
  document.addEventListener('change', function(ev){
    var t=ev.target; if(t && (t.id==='f-photo' || t.id==='f-file')) refreshGateFromUpload();
  }, true);

  log('add-card-search module ready');
})();

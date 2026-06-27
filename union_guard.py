import json, glob, os, collections

COMMITTED="/tmp/committed"
DATA="data"

def load(d):
    out={}
    for f in glob.glob(os.path.join(d,"cards-*.json")):
        y=os.path.basename(f)[6:10]
        out[y]=json.load(open(f))
    return out

committed=load(COMMITTED)   # baseline (has some urls, more cards via union sources)
regen=load(DATA)            # fresh build from new CSV (url/team rich, fewer cards)

def ident(c):
    return (c.get("brand",""),c.get("set",""),str(c.get("number","")),c.get("player",""),c.get("notes",""))

years=sorted(set(committed)|set(regen), key=lambda y:int(y))
report=[]
fail=False
tot_before=tot_after=cov_before=cov_after=0
brand_tot=collections.Counter(); brand_cov=collections.Counter()
brand_tot_b=collections.Counter(); brand_cov_b=collections.Counter()

for y in years:
    cm=committed.get(y,[])
    rg=regen.get(y,[])
    # index regen by identity -> first record (preserve duplicates via counter)
    rg_by=collections.defaultdict(list)
    for c in rg: rg_by[ident(c)].append(c)
    used=collections.Counter()
    union=[]
    # start from committed order; enrich url/team from regen
    for c in cm:
        k=ident(c)
        lst=rg_by.get(k)
        nc=dict(c)
        if lst:
            i=min(used[k], len(lst)-1)
            r=lst[i]; used[k]+=1
            # prefer regen url/team; fall back to committed
            if r.get("url"): nc["url"]=r["url"]
            elif "url" not in nc: nc["url"]=c.get("url","")
            if r.get("team"): nc["team"]=r["team"]
            elif "team" not in nc: nc["team"]=c.get("team","")
        else:
            nc.setdefault("url", c.get("url",""))
            nc.setdefault("team", c.get("team",""))
        union.append(nc)
    # add regen-only cards (identities present in regen beyond committed multiplicity)
    cm_by=collections.Counter(ident(c) for c in cm)
    rg_all=collections.Counter(ident(c) for c in rg)
    for k,cnt in rg_all.items():
        extra=cnt-cm_by.get(k,0)
        if extra>0:
            lst=rg_by[k]
            for j in range(cnt-extra, cnt):
                union.append(dict(lst[j]))
    # guard
    before=len(cm); after=len(union)
    if after < before:
        fail=True
    # coverage tallies
    cb=sum(1 for c in cm if c.get("url"))
    ca=sum(1 for c in union if c.get("url"))
    tot_before+=before; tot_after+=after; cov_before+=cb; cov_after+=ca
    for c in cm:
        b=c.get("brand",""); brand_tot_b[b]+=1
        if c.get("url"): brand_cov_b[b]+=1
    for c in union:
        b=c.get("brand",""); brand_tot[b]+=1
        if c.get("url"): brand_cov[b]+=1
    report.append((y,before,after,cb,ca))
    # write union back
    json.dump(union, open(os.path.join(DATA,f"cards-{y}.json"),"w",encoding="utf-8"),
              ensure_ascii=False, separators=(",",":"))

print("YEAR  before after | url_before url_after  DELTA")
for y,b,a,cb,ca in report:
    flag="" if a>=b else "  <-- DECREASE!"
    print(f"{y}  {b:6d} {a:6d} | {cb:6d} {ca:6d}   {a-b:+d}{flag}")
print(f"TOTAL cards {tot_before} -> {tot_after}  (delta {tot_after-tot_before})")
print(f"URL coverage {cov_before} ({100*cov_before/tot_before:.1f}%) -> {cov_after} ({100*cov_after/tot_after:.1f}%)")
print("NO_YEAR_DECREASE =", not fail)
print("--- PER BRAND (after) ---")
for b in sorted(brand_tot):
    print(f"{b:12s} {brand_cov_b[b]:6d}/{brand_tot_b[b]:6d} -> {brand_cov[b]:6d}/{brand_tot[b]:6d}  ({100*brand_cov[b]/brand_tot[b]:.0f}%)")
if fail:
    raise SystemExit("GUARD FAILED: a year lost cards")

import json, glob, os, datetime, unicodedata, re
DATA="data"
def norm_name(s):
    s=unicodedata.normalize("NFKD",s); s="".join(c for c in s if not unicodedata.combining(c))
    s=s.lower().replace(".", " ")
    s=re.sub(r"\b(junior|jr)\b","jr",s); s=re.sub(r"\b(senior|sr)\b","sr",s)
    s=re.sub(r"[^a-z0-9 ]"," ",s); s=re.sub(r"\s+"," ",s).strip(); return s
by_year={}
for f in glob.glob(os.path.join(DATA,"cards-*.json")):
    y=os.path.basename(f)[6:10]; by_year[y]=json.load(open(f))
years=sorted(by_year, key=lambda y:int(y))
counts={y:len(by_year[y]) for y in years}
total=sum(counts.values())
players={}
for y in years:
    for c in by_year[y]:
        p=(c.get("player") or "").strip()
        if not p: continue
        n=norm_name(p)
        if not n: continue
        d=players.setdefault(n, {"display":p, "years":set()}); d["years"].add(y)
json.dump({"years":years,"counts":counts,"total":total,
    "generated":datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00","Z")},
    open(os.path.join(DATA,"index.json"),"w",encoding="utf-8"), ensure_ascii=False, indent=2)
pj={n:{"display":v["display"],"years":sorted(v["years"],key=lambda y:int(y))} for n,v in players.items()}
json.dump(pj, open(os.path.join(DATA,"players.json"),"w",encoding="utf-8"), ensure_ascii=False, separators=(",",":"))
print("INDEX_TOTAL=",total,"YEARS=",len(years),"PLAYERS=",len(pj))

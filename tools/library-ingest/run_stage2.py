#!/usr/bin/env python3
"""Stage 2 driver: process all card-set zips oldest->newest.
Per zip: dry-run (base-gate), then --commit if base_rate>=0.95.
Pre-1980 clean-abort (exit 2) is logged as SKIP-catalog, not failure.
Resumable via the pipeline's manifest (already-done files self-skip).
Progress report every 25 zips. Full report at end.
"""
import os, re, sys, subprocess, glob, json, time

ZIPDIR="zips"
OUT="review"
LOG="stage2_progress.log"
DONE_ALREADY={"1980-Topps.zip","2021-Topps.zip","1952_Topps_cards.zip"}  # Stage 1

def parse(name):
    m=re.match(r'^(\d{4})[-_]([A-Za-z][A-Za-z-]*?)(?:_cards)?\.zip$', name)
    if not m: return None
    year=int(m.group(1)); brand=m.group(2)
    return year, brand

def brand_norm(b):
    return b.strip().lower().replace('-', '-')

def run(zip_name, year, brand, commit):
    setn=brand.strip().lower()
    args=["python","ingest.py","--zip",os.path.join(ZIPDIR,zip_name),
          "--year",str(year),"--brand",brand,"--set",setn,"--out-dir",OUT]
    if commit: args.append("--commit")
    p=subprocess.run(args,capture_output=True,text=True)
    return p.returncode, p.stdout+p.stderr

def extract(out):
    d={}
    for pat,key in [(r'BASE MATCH RATE ([\d.]+)%','base'),(r'MATCH RATE ([\d.]+)%','overall'),
                    (r'INGEST done: uploaded=(\d+) skipped=(\d+) failed=(\d+) unmapped=(\d+) bytes=(\d+)','ingest'),
                    (r'variants_excluded=(\d+)','var')]:
        m=re.search(pat,out)
        if m: d[key]=m.groups() if key=='ingest' else m.group(1)
    return d

def log(msg):
    line="[{}] {}".format(time.strftime('%H:%M:%S'),msg)
    print(line,flush=True)
    open(LOG,'a').write(line+"\n")

zips=sorted([os.path.basename(z) for z in glob.glob(os.path.join(ZIPDIR,'*.zip'))],
            key=lambda n:(parse(n)[0] if parse(n) else 9999, n))

results=[]
n=0
log("STAGE2 START: {} zips total ({} already-done Stage1 will self-skip)".format(len(zips),len(DONE_ALREADY)))
for z in zips:
    pr=parse(z)
    if not pr:
        log("SKIP-UNPARSEABLE {}".format(z)); results.append((z,None,None,'skip-unparseable',{})); continue
    year,brand=pr
    n+=1
    # dry-run first
    rc,out=run(z,year,brand,commit=False)
    info=extract(out)
    if rc==2:  # catalog not found (pre-1980)
        log("CLEAN-ABORT {} (pre-catalog, exit2) -- logged".format(z))
        results.append((z,year,brand,'clean-abort',info)); 
        if n%25==0: log("PROGRESS {}/{}".format(n,len(zips)))
        continue
    base=float(info.get('base',0) or 0)
    if base < 95.0:
        log("SKIP-BELOW-GATE {} base={}% -- logged, not committed".format(z,info.get('base')))
        results.append((z,year,brand,'skip-below-gate',info));
        if n%25==0: log("PROGRESS {}/{}".format(n,len(zips)))
        continue
    # commit
    rc2,out2=run(z,year,brand,commit=True)
    info2=extract(out2)
    status='committed' if rc2==0 else 'commit-error(rc={})'.format(rc2)
    ing=info2.get('ingest')
    log("{} {} base={}% {}".format('COMMIT-OK' if rc2==0 else 'COMMIT-ERR',z,info2.get('base'),
        ('up={} skip={} fail={} unmapped={} bytes={}'.format(*ing) if ing else '')))
    results.append((z,year,brand,status,info2))
    if n%25==0: log("PROGRESS {}/{} processed".format(n,len(zips)))

json.dump([{'zip':r[0],'year':r[1],'brand':r[2],'status':r[3],'info':r[4]} for r in results],
          open('stage2_results.json','w'),indent=1,default=str)
log("STAGE2 COMPLETE: {} zips iterated. results -> stage2_results.json".format(n))

#!/usr/bin/env python3
"""
ingest.py -- one-zip end-to-end ingestion for the Card Depot shared card library.

Implements the LIBRARY_PHASE0.md 4 pipeline for a SINGLE zip:

    census -> parse (per-era) -> dry-run vs catalog -> [gate] -> resize -> upload
            -> manifest ledger (resumable) -> unmapped review CSV

Design decisions locked by Nick (see LIBRARY_PHASE0.md 7):
  * canonical size = 1000px on the LONG edge, JPEG q82, DOWNSCALE-ONLY
    (target = min(1000, source_long_edge); re-encoding never invents detail).
  * pilot zip = 1989-Fleer.zip (family C).
  * Supabase tier = Pro (bucket 'card-library', public-read).

Safety / correctness rails from AGENTS.md:
  * 4 fail-loud: every skip/bail LOGS its reason + the value name, never silent.
  * 4 idempotency-at-the-right-unit: the dedupe UNIT is the SOURCE FILE
    ({source_zip}/{source_file}); resumability is a MANIFEST LOOKUP, not a
    re-derive. A 'done' row is skipped on rerun. A failure is logged, not fatal.
  * 5.1 writes go through the SERVICE ROLE (bypasses RLS). The service key is
    read from the environment (SUPABASE_SERVICE_ROLE_KEY); it is NEVER hard-coded,
    logged, or embedded in a URL (AGENTS.md 7).

DRY-RUN GATE: with --dry-run (default), NOTHING is uploaded and no manifest row is
written. It prints the census, the true match rate, and the complete unmapped list.
Uploading requires BOTH --commit AND a match rate >= --min-match (default 0.95),
mirroring the report's '>=95% -> proceed' rule. Below threshold the run aborts
loud so a bad parser can never silently ship a half-matched set.

Usage:
    # dry-run (safe; no network writes):
    python ingest.py --zip ./zips/1989-Fleer.zip --year 1989 --brand Fleer --set Fleer

    # real ingest (after a clean dry run):
    export SUPABASE_URL=...                 # project URL
    export SUPABASE_SERVICE_ROLE_KEY=...    # service role key (elevated; never commit)
    python ingest.py --zip ./zips/1989-Fleer.zip --year 1989 --brand Fleer --set Fleer \
        --commit

Requires: Pillow (resize), supabase (upload) -- see requirements.txt. Both are
imported lazily so a pure dry-run works with only the stdlib + Pillow.
"""

import re
import argparse
import csv
import io
import json
import os
import sys
import zipfile
from collections import Counter
from pathlib import Path

import recover
from normalize import norm_number, norm_text, catalog_key
from parsers import FAMILIES, family_for, detect_family

LONG_EDGE = 1000
JPEG_QUALITY = 82
BUCKET = "card-library"


def log(tag, msg):
    print("[{}] {}".format(tag, msg), file=sys.stderr)


# ---------------------------------------------------------------- catalog ----
def load_catalog_numbers(catalog_path, set_name):
    """Return the set of NORMALIZED catalog numbers for {set_name} in a
    data/cards-YYYY.json file. Year is injected by the caller from the filename;
    the record's own brand column is NOT trusted (AGENTS.md 3 'brand = c.set' quirk):
    membership is filtered on the 'set' field, which is the real set identity."""
    with open(catalog_path, encoding="utf-8") as fh:
        rows = json.load(fh)
    target = norm_text(set_name)
    numbers = set()
    for r in rows:
        if norm_text(r.get("set", "")) == target:
            n = norm_number(r.get("number", ""))
            if n is not None:
                numbers.add(n)
    return numbers


# ------------------------------------------------------------------ census ---
def census(zf, year, brand):
    """Enumerate the zip fully (Drive preview capped at ~200; this is the real
    census). Return (records, stats). records: list of ParsedFile. stats: dict."""
    names = [n for n in zf.namelist() if n.lower().endswith((".jpg", ".jpeg"))]
    # Content-based family auto-detection (replaces the year-only router,
    # which mis-forced 1981 hyphen-format zips to family C -> 0% match).
    leaves = [n.split("/")[-1] for n in names]
    detected, detect_info = detect_family(leaves, year=year, brand=brand)
    year_guess = detect_info["year_guess"]
    # Use the confident content winner; fall back to the year-guess when no
    # family clears the sanity floor (that zip then fails the base-gate and
    # is skipped+logged as an unknown format rather than silently ingested).
    fam = detected if detected is not None else year_guess
    parse = FAMILIES[fam]
    records, unparsed = [], []
    sides = Counter()
    for full in names:
        leaf = full.split("/")[-1]
        if not leaf:
            continue
        pf = parse(leaf)
        if pf is None:
            unparsed.append(full)
            continue
        pf.source_file = full  # keep the in-zip path for the manifest key
        records.append(pf)
        sides[pf.side] += 1
    stats = {
        "family": fam,
        "image_files": len(names),
        "parsed": len(records),
        "unparsed": unparsed,
        "front": sides["front"],
        "back": sides["back"],
        "detect": detect_info,
    }
    return records, stats


def size_distribution(zf, sample_names):
    """True per-file byte sizes + image dimensions (requires reading the entries;
    Drive exposes neither). Uses Pillow for dimensions. Returns list of dicts."""
    from PIL import Image
    out = []
    for name in sample_names:
        info = zf.getinfo(name)
        with zf.open(name) as fh:
            data = fh.read()
        try:
            im = Image.open(io.BytesIO(data))
            w, h = im.size
        except Exception as e:  # noqa: BLE001 -- report, never crash the census
            w = h = None
            log("census", "dimension read failed for {}: {}".format(name, e))
        out.append({"file": name, "bytes": info.file_size, "w": w, "h": h})
    return out


# ------------------------------------------------------------------- match ---
_VAR_NUM_RE = re.compile(r"^\d+[a-z]$", re.IGNORECASE)

def is_variant(pf):
    """Family-D letter-variant / (VAR) parallel. Base-gate rule (Nick):
    these are non-blockers -- logged to the review CSV for a later catalog
    enrichment pass, never counted against the base-card match gate."""
    src = getattr(pf, "source_file", "") or ""
    if "(var)" in src.lower():
        return True
    tok = (getattr(pf, "number_token", "") or "").strip()
    return bool(_VAR_NUM_RE.match(tok))


def dry_run(records, catalog_numbers, year, brand, set_name, titles=None):
    """Parse every record's number to catalog form, test membership, and split
    into matched / unmapped. Returns (matched, unmapped). Each unmapped row carries
    a reason so it can go straight into the review CSV (LIBRARY_PHASE0.md 4.4).

    norm_number() already returns None for combo/leader numbers ('1-2') and any
    token it cannot reduce to a single catalog number, so the combo case is just
    the 'norm is None' branch -- no special-casing needed here."""
    matched, unmapped = [], []
    claimed = {}
    titles = titles or {}
    pending = []

    def take(pf, norm, note):
        slot = (norm, pf.side)
        if slot in claimed:
            unmapped.append((pf, norm, "duplicate {} image for '{}' -- kept '{}'".format(pf.side, norm, claimed[slot])))
            return
        claimed[slot] = pf.source_file
        if note:
            log("recover", "{} : '{}' -> '{}' via {}".format(pf.source_file, pf.number_token, norm, note))
        matched.append((pf, norm, catalog_key(year, brand, set_name, norm)))

    # pass 0 - repair filenames whose LEADING token is a valid catalog number
    # but is not this card's number (the 1993 '{n}_{sourceid}_' dialect). These
    # look like clean direct hits, so the correction has to land before pass 1
    # or the file claims someone else's slot and overwrites real art.
    forced = {}
    for pf in records:
        fix = recover.override_number(pf.source_file, catalog_numbers, titles)
        if fix is not None:
            forced[pf.source_file] = fix
            log("override", "{} : token '{}' -> '{}' via OV1".format(
                pf.source_file, pf.number_token, fix))

    # pass 1 -- a number that IS in the catalog owns its slot outright.
    for pf in sorted(records, key=lambda r: r.source_file):
        norm = forced.get(pf.source_file) or norm_number(pf.number_token)
        if norm is not None and norm in catalog_numbers:
            take(pf, norm, None)
        else:
            pending.append((pf, norm))

    # pass 2 -- guarded recovery, and only into slots pass 1 left empty, so a
    # recovered file can never displace a card that resolved on its own.
    for pf, norm in pending:
        cand, rule = recover.recover_number(
            pf.number_token, pf.source_file, catalog_numbers, titles)
        if cand is None:
            if norm is None:
                unmapped.append((pf, None, "combo/leader or unparseable number: '{}'".format(pf.number_token)))
            else:
                unmapped.append((pf, norm, "number '{}' not in catalog set '{}'".format(norm, set_name)))
            continue
        if (cand, pf.side) in claimed:
            unmapped.append((pf, cand, "'{}' recovers to '{}' ({}) but that slot is held by '{}'".format(pf.number_token, cand, rule, claimed[(cand, pf.side)])))
            continue
        take(pf, cand, rule)
    return matched, unmapped


def object_path(year, brand, set_name, norm_num, side, scheme="human"):
    """Storage object path. Two stable renderings (LIBRARY_PHASE0.md 5 path note):
      human : {year}/{brandSlug}/{setSlug}/{number}_{side}.jpg  (legible, pilot default)
      token : {catalog_key_token}_{side}.jpg                    (design 2)
    Pick one and keep it stable across the corpus."""
    if scheme == "token":
        tok = catalog_key(year, brand, set_name, norm_num).replace("|", "_").replace(" ", "-")
        return "{}_{}.jpg".format(tok, side)
    bslug = norm_text(brand).replace(" ", "-")
    sslug = norm_text(set_name).replace(" ", "-")
    return "{}/{}/{}/{}_{}.jpg".format(year, bslug, sslug, norm_num, side)


# ------------------------------------------------------------------ resize ---
def resize_downscale_only(data: bytes) -> bytes:
    """Downscale to LONG_EDGE on the long side, JPEG q82. NEVER upscales
    (target = min(LONG_EDGE, source_long_edge)); re-encodes at q82 regardless so
    output size is predictable. Returns JPEG bytes."""
    from PIL import Image
    im = Image.open(io.BytesIO(data))
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    w, h = im.size
    long_edge = max(w, h)
    target = min(LONG_EDGE, long_edge)          # downscale-only
    if target < long_edge:
        scale = target / float(long_edge)
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue()


# --------------------------------------------------------------- manifest ----
class Manifest:
    """Resumability ledger. Prefers the Postgres table public.card_library_manifest
    (unique on source_zip, source_file); falls back to a local JSONL when running
    dry / offline. On rerun a 'done' row is SKIPPED (idempotent lookup, not re-derive
    -- AGENTS.md 4). A failed row is retried next pass."""

    def __init__(self, client, jsonl_path):
        self.client = client
        self.jsonl_path = jsonl_path
        self._done = set()
        if client is None and Path(jsonl_path).exists():
            with open(jsonl_path, encoding="utf-8") as fh:
                for line in fh:
                    try:
                        row = json.loads(line)
                        if row.get("status") == "done":
                            self._done.add((row["source_zip"], row["source_file"]))
                    except Exception:  # noqa: BLE001
                        continue

    def already_done(self, source_zip, source_file):
        if self.client is not None:
            res = (
                self.client.table("card_library_manifest")
                .select("status")
                .eq("source_zip", source_zip)
                .eq("source_file", source_file)
                .eq("status", "done")
                .execute()
            )
            return bool(res.data)
        return (source_zip, source_file) in self._done

    def write(self, row):
        if self.client is not None:
            # upsert on the unique (source_zip, source_file) -- the ledger is the gate
            self.client.table("card_library_manifest").upsert(
                row, on_conflict="source_zip,source_file"
            ).execute()
        else:
            with open(self.jsonl_path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(row) + "\n")


# --------------------------------------------------------------- uploader ----
def make_client():
    """Service-role client (bypasses RLS -- 5.1). Key from env, never hard-coded."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        log("depot", "no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env; cannot commit")
        return None
    from supabase import create_client
    return create_client(url, key)


def upload_object(client, path, jpeg_bytes):
    client.storage.from_(BUCKET).upload(
        path,
        jpeg_bytes,
        {"content-type": "image/jpeg", "x-upsert": "true"},
    )


def public_url(client, path):
    return client.storage.from_(BUCKET).get_public_url(path)


# ------------------------------------------------------------------- main ----
def main(argv=None):
    ap = argparse.ArgumentParser(description="Card Depot library one-zip ingester")
    ap.add_argument("--zip", required=True, help="path to a locally-staged card-set zip")
    ap.add_argument("--year", required=True, type=int)
    ap.add_argument("--brand", required=True)
    ap.add_argument("--set", dest="set_name", required=True)
    ap.add_argument("--catalog", help="path to data/cards-YYYY.json (default: repo data/)")
    ap.add_argument("--path-scheme", choices=["human", "token"], default="human")
    ap.add_argument("--min-match", type=float, default=0.95)
    ap.add_argument("--commit", action="store_true", help="actually upload (else dry-run)")
    ap.add_argument("--out-dir", default=".", help="dir for review CSV + JSONL ledger")
    args = ap.parse_args(argv)

    catalog_path = args.catalog or str(
        Path(__file__).resolve().parents[2] / "data" / "cards-{}.json".format(args.year)
    )
    if not Path(catalog_path).exists():
        log("depot", "catalog not found: {} -- abort".format(catalog_path))
        return 2

    with open(catalog_path, encoding="utf-8") as _fh:
        catalog_rows = json.load(_fh)
    canon = recover.resolve_set_name(catalog_rows, args.set_name)
    if canon and norm_text(canon) != norm_text(args.set_name):
        log("depot", "set '{}' resolved to catalog set '{}' (separator-insensitive)".format(args.set_name, canon))
        args.set_name = canon
        args.brand = canon
    catalog_numbers = load_catalog_numbers(catalog_path, args.set_name)
    titles_by_number = recover.catalog_titles(catalog_rows, args.set_name)
    log("depot", "catalog '{}' {}: {} normalized numbers".format(args.set_name, args.year, len(catalog_numbers)))

    zip_name = Path(args.zip).name
    with zipfile.ZipFile(args.zip) as zf:
        records, stats = census(zf, args.year, args.brand)
        log("census", "family={} image_files={} parsed={} front={} back={} unparsed={}".format(
            stats["family"], stats["image_files"], stats["parsed"], stats["front"], stats["back"], len(stats["unparsed"])))
        di = stats["detect"]
        log("detect", "{} -> family {} ({:.1%}), year-guess was {} [A={} B={} C={} D={} floor_ok={}]".format(
            zip_name, stats["family"], di["winner_rate"], di["year_guess"],
            di["counts"]["A"], di["counts"]["B"], di["counts"]["C"], di["counts"]["D"], di["confident"]))
        for u in stats["unparsed"]:
            log("census", "UNPARSED filename (no family-{} match): {}".format(stats["family"], u))

        # true size/dimension census on a sample (extend to full in a heavier audit)
        sample = [pf.source_file for pf in records[:12]]
        dist = size_distribution(zf, sample)
        for d in dist:
            log("census", "sample {} {}x{} {}B".format(d["file"], d["w"], d["h"], d["bytes"]))

        matched, unmapped = dry_run(records, catalog_numbers, args.year, args.brand, args.set_name, titles_by_number)
        # Base-gate rule (Nick): variants (family-D letter-suffix / (VAR))
        # are non-blockers -- excluded from gate denominator, logged to CSV.
        unmapped_var = [u for u in unmapped if is_variant(u[0])]
        unmapped_base = [u for u in unmapped if not is_variant(u[0])]
        base = len(matched) + len(unmapped)
        rate = (len(matched) / base) if base else 0.0
        base_denom = len(matched) + len(unmapped_base)
        base_rate = (len(matched) / base_denom) if base_denom else 0.0
        log("depot", "MATCH RATE {:.2%}  matched={} unmapped={} of {}".format(rate, len(matched), len(unmapped), base))
        log("depot", "BASE MATCH RATE {:.2%}  base_matched={} base_unmapped={} of {}  (variants_excluded={})".format(base_rate, len(matched), len(unmapped_base), base_denom, len(unmapped_var)))

        # write the review CSV (LIBRARY_PHASE0.md 4.4 -- never silently drop)
        review_csv = Path(args.out_dir) / "unmapped_{}.csv".format(Path(zip_name).stem)
        with open(review_csv, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["source_file", "parsed_number", "guessed_set", "reason"])
            for pf, norm, reason in unmapped:
                w.writerow([pf.source_file, norm if norm is not None else "", args.set_name, reason])
        log("depot", "review CSV: {} ({} rows)".format(review_csv, len(unmapped)))

        if not args.commit:
            log("depot", "DRY-RUN complete; no uploads, no manifest writes. Re-run with --commit to ingest.")
            return 0 if base_rate >= args.min_match else 1

        if base_rate < args.min_match:
            log("depot", "base match rate {:.2%} < min {:.2%} -- ABORT (real parse failures on base cards)".format(base_rate, args.min_match))
            return 1

        client = make_client()
        if client is None:
            log("depot", "commit requested but no service client; ABORT (see env vars)")
            return 2

        manifest = Manifest(client, str(Path(args.out_dir) / "manifest_{}.jsonl".format(Path(zip_name).stem)))
        uploaded = skipped = failed = 0
        total_bytes = 0
        for pf, norm, key in matched:
            if manifest.already_done(zip_name, pf.source_file):
                skipped += 1
                log("depot", "skip (already done): {}".format(pf.source_file))
                continue
            path = object_path(args.year, args.brand, args.set_name, norm, pf.side, args.path_scheme)
            try:
                with zf.open(pf.source_file) as fh:
                    small = resize_downscale_only(fh.read())
                upload_object(client, path, small)
                # canonical index row (first-scan-wins; service role write)
                client.table("card_library").upsert(
                    {"catalog_key": key, "side": pf.side, "object_path": path, "is_canonical": True, "status": "active"},
                    on_conflict="catalog_key,side",
                ).execute()
                manifest.write({
                    "source_zip": zip_name, "source_file": pf.source_file,
                    "catalog_key": key, "side": pf.side, "object_path": path,
                    "status": "done", "reason": None,
                })
                uploaded += 1
                total_bytes += len(small)
            except Exception as e:  # noqa: BLE001 -- log, mark failed, continue (not fatal)
                failed += 1
                log("depot", "FAILED {}: {}".format(pf.source_file, e))
                manifest.write({
                    "source_zip": zip_name, "source_file": pf.source_file,
                    "catalog_key": key, "side": pf.side, "object_path": path,
                    "status": "failed", "reason": str(e),
                })

        # record unmapped in the ledger too (never silently dropped)
        for pf, norm, reason in unmapped:
            manifest.write({
                "source_zip": zip_name, "source_file": pf.source_file,
                "catalog_key": None, "side": getattr(pf, "side", None),
                "object_path": None, "status": "unmapped", "reason": reason,
            })

        log("depot", "INGEST done: uploaded={} skipped={} failed={} unmapped={} bytes={}".format(
            uploaded, skipped, failed, len(unmapped), total_bytes))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

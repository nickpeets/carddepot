#!/usr/bin/env python3
"""
run_batch.py -- Stage 2 driver: ingest many zips oldest->newest, unattended.

Wraps ingest.py per zip with the batch rules Nick set:
  * dry-run FIRST for every zip; if match rate < --min-match (0.95) -> SKIP + log,
    never force-upload.
  * on a clean dry-run -> ingest (--commit).
  * failures are logged, not fatal; the batch continues.
  * RESUMABLE: ingest.py's manifest skips files already 'done', so re-running
    run_batch.py after a crash resumes cheaply.
  * progress every --report-every zips (default 25): zip count, files uploaded,
    cumulative GB, running review-CSV size.
  * pre-1980 zips (no catalog) self-skip via ingest.py's 'catalog not found' exit.

Zip-name -> (year, brand, set) mapping is derived from the filename
'{year}-{Brand}.zip' (e.g. 1989-Fleer.zip, 1991-Upper-Deck.zip). For flagship
sets the catalog 'set' equals the brand; the two known renamings are handled in
BRAND_TO_SET. A zip whose brand/set is unknown is dry-run anyway and will simply
report a low match / catalog-miss and be skipped -- never force-uploaded.

Usage (dry-run the WHOLE batch first, no uploads at all):
    python run_batch.py --zips-dir ./zips --dry-run-only

    # real batch (after Stage 1 sign-off):
    export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
    python run_batch.py --zips-dir ./zips

Everything ingest.py prints per zip is preserved; run_batch.py adds the roll-up.
"""

import argparse
import glob
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Catalog 'set' name for a given brand token, when it differs from the brand.
# Most flagship zips: set == brand (Topps, Fleer, Bowman, Donruss).
BRAND_TO_SET = {
    "Upper-Deck": ("Upper Deck", "Upper Deck"),
    "UpperDeck": ("Upper Deck", "Upper Deck"),
    "Fleer-Tradition": ("Fleer", "Fleer Tradition"),  # verify vs catalog set names
}

ZIP_RE = re.compile(r"^(\d{4})-(.+?)(?:_cards)?\.zip$", re.IGNORECASE)


def parse_zip_name(fname):
    """'1989-Fleer.zip' -> (1989, 'Fleer', 'Fleer'). Returns None if unrecognized."""
    m = ZIP_RE.match(Path(fname).name)
    if not m:
        return None
    year = int(m.group(1))
    brand_token = m.group(2)
    if brand_token in BRAND_TO_SET:
        brand, set_name = BRAND_TO_SET[brand_token]
    else:
        brand = brand_token.replace("-", " ")
        set_name = brand
    return year, brand, set_name


def run_one(zip_path, year, brand, set_name, out_dir, commit, min_match):
    """Invoke ingest.py once. Returns (action, rc) where action in
    {'ingested','skipped_lowmatch','skipped_nocatalog','failed','dryrun_ok','dryrun_low'}."""
    cmd = [
        sys.executable, str(HERE / "ingest.py"),
        "--zip", str(zip_path),
        "--year", str(year), "--brand", brand, "--set", set_name,
        "--out-dir", out_dir, "--min-match", str(min_match),
    ]
    if commit:
        cmd.append("--commit")
    print("\n=== {}  (year={} brand='{}' set='{}')".format(Path(zip_path).name, year, brand, set_name), flush=True)
    rc = subprocess.call(cmd)
    # ingest.py exit codes: 0 ok/ingested or dry-run>=gate; 1 below gate; 2 no catalog/no client
    if rc == 2:
        return ("skipped_nocatalog", rc)
    if not commit:
        return ("dryrun_ok" if rc == 0 else "dryrun_low", rc)
    if rc == 0:
        return ("ingested", rc)
    if rc == 1:
        return ("skipped_lowmatch", rc)
    return ("failed", rc)


def dir_size_gb(path):
    total = 0
    for p in Path(path).rglob("*"):
        if p.is_file():
            total += p.stat().st_size
    return total / (1024 ** 3)


def review_rows(out_dir):
    rows = 0
    for csvf in glob.glob(str(Path(out_dir) / "unmapped_*.csv")):
        with open(csvf, encoding="utf-8") as fh:
            rows += max(0, sum(1 for _ in fh) - 1)  # minus header
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description="Stage 2 batch ingester")
    ap.add_argument("--zips-dir", default="./zips")
    ap.add_argument("--out-dir", default="./out")
    ap.add_argument("--min-match", type=float, default=0.95)
    ap.add_argument("--report-every", type=int, default=25)
    ap.add_argument("--dry-run-only", action="store_true",
                    help="dry-run every zip; never uploads (batch smoke test)")
    ap.add_argument("--skip", nargs="*", default=[],
                    help="zip filenames to skip (e.g. already Stage-1 validated)")
    args = ap.parse_args(argv)

    Path(args.out_dir).mkdir(parents=True, exist_ok=True)
    commit = not args.dry_run_only

    zips = sorted(
        glob.glob(str(Path(args.zips_dir) / "*.zip")),
        key=lambda p: Path(p).name.lower(),   # oldest->newest since names start YYYY
    )
    # exclude the redesign concept zip and any explicit skips
    zips = [z for z in zips
            if "redesign" not in Path(z).name.lower()
            and Path(z).name not in args.skip]

    tally = {}
    processed = 0
    for zp in zips:
        parsed = parse_zip_name(zp)
        if parsed is None:
            print("SKIP unrecognized zip name: {}".format(Path(zp).name), flush=True)
            tally["skipped_badname"] = tally.get("skipped_badname", 0) + 1
            continue
        year, brand, set_name = parsed
        action, rc = run_one(zp, year, brand, set_name, args.out_dir, commit, args.min_match)
        tally[action] = tally.get(action, 0) + 1
        processed += 1
        if processed % args.report_every == 0:
            print("\n----- PROGRESS after {} zips -----".format(processed), flush=True)
            print("  tally: {}".format(dict(sorted(tally.items()))), flush=True)
            print("  review CSV rows so far: {}".format(review_rows(args.out_dir)), flush=True)
            print("  out/ size: {:.2f} GB".format(dir_size_gb(args.out_dir)), flush=True)

    print("\n===== BATCH COMPLETE =====", flush=True)
    print("  zips processed: {} of {} found".format(processed, len(zips)), flush=True)
    print("  tally: {}".format(dict(sorted(tally.items()))), flush=True)
    print("  total review-CSV rows: {}".format(review_rows(args.out_dir)), flush=True)
    print("  NOTE: uploaded bytes / object count / has_back census come from the",
          "manifest (card_library_manifest) + Storage, not local out/.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

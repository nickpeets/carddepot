# tools/library-ingest

One-zip ingestion pipeline for the Card Depot **shared card-image library**
(see `../../LIBRARY_PHASE0.md` and `../../SHARED_LIBRARY_DESIGN.md`).

Flow per zip (LIBRARY_PHASE0.md 4):

```
census -> per-era parse -> dry-run vs catalog -> [>=95% gate] -> downscale
        -> upload (card-library) -> manifest ledger (resumable) -> unmapped CSV
```

## Files

| file | role |
|------|------|
| `normalize.py` | shared catalog-key normalizer (single source of truth: strip role suffixes RC/SV/MGR/HL, KEEP letter variants, drop (VAR), combo numbers -> None) |
| `parsers.py` | per-era filename parsers A/B/C/D + `family_for(year, brand)` router. Pilot uses family C |
| `ingest.py` | the pipeline. Dry-run by default; `--commit` uploads |
| `test_ingest.py` | self-tests (no zip needed); assertions validated vs real `data/cards-1989.json` |
| `requirements.txt` | Pillow (resize) + supabase (upload) |

## Locked decisions (Nick)

- canonical size **1000px long-edge, JPEG q82, downscale-only** (`target = min(1000, source_long_edge)`)
- pilot zip **1989-Fleer.zip** (family C)
- Supabase **Pro**, bucket **`card-library`**, public-read
- DDL already run (bucket + `catalog_key` column + `card_library` + `card_library_manifest`, manifest RLS-locked)

## Running the pilot (in the Codespace / any machine with the zip staged)

### 1. Get the zip into the workspace (the Drive hand-off)

The Codespace terminal cannot authenticate to Nick's Google Drive directly, so the
zip is downloaded through **Nick's authed browser session** and placed in the
workspace. Method used for the pilot (repeat 196x for the bulk run):

1. Open the Drive folder `baseball_cards` in the authed browser.
2. Download `1989-Fleer.zip` (right-click -> Download) to the local machine.
3. Move it into the workspace, e.g. `tools/library-ingest/zips/1989-Fleer.zip`
   (the `zips/` dir is gitignored; never commit corpus binaries).

> Bulk-run note: 197 zips ~6.24 GB total. For the bulk run, prefer a scripted
> pull with `rclone` (`rclone copy gdrive:baseball_cards ./zips`) or the Drive API
> with a service account, so the 196 remaining zips do not need manual clicks.
> The pilot used the manual browser download because it is one file.

### 2. Dry-run (safe: no network writes)

```bash
cd tools/library-ingest
pip install -r requirements.txt
python ingest.py --zip ./zips/1989-Fleer.zip --year 1989 --brand Fleer --set Fleer
```

Prints the census (family, file count, front/back split, true dimensions/bytes on a
sample), the **match rate**, and writes `unmapped_1989-Fleer.csv`. Nothing uploads.
Exit code 0 iff match rate >= `--min-match` (default 0.95).

### 3. Commit (upload) -- only after a clean dry-run

```bash
export SUPABASE_URL=...                  # project URL
export SUPABASE_SERVICE_ROLE_KEY=...     # service role key (elevated; NEVER commit/log)
python ingest.py --zip ./zips/1989-Fleer.zip --year 1989 --brand Fleer --set Fleer --commit
```

Uploads downscaled JPEGs to `card-library` at
`{year}/{brand}/{set}/{number}_{side}.jpg`, upserts `card_library` rows, and
appends the `card_library_manifest` ledger. **Resumable:** a rerun skips any
source file already marked `done` (ledger lookup, not re-derive -- AGENTS.md 4).
Failures are logged and marked `failed`, not fatal; unmapped files are logged too.

### 4. Verify

Sample ~10 uploaded objects by their public URL
(`{SUPABASE_URL}/storage/v1/object/public/card-library/1989/fleer/fleer/106_front.jpg`):
confirm the image serves, the card identity is right, and front/back are paired.
Then eyeball a dozen in the binder before authorizing the bulk 197-zip run.

## Tests

```bash
cd tools/library-ingest
python test_ingest.py          # stdlib runner, no pytest needed
# or: python -m pytest test_ingest.py -q
```

The parser/normalizer assertions and the 703-number 1989-Fleer catalog membership
were validated against the live `data/cards-1989.json` before this was committed.

## Safety rails (AGENTS.md)

- **Service-role only** for writes (5.1); key from env, never hard-coded/logged/URL'd (7).
- **Fail-loud** everywhere: every skip/bail logs its reason + value (4).
- **Idempotency at the file unit**: the manifest `(source_zip, source_file)` unique key
  is the dedupe gate; a rerun is a no-op on `done` rows (4).
- **Downscale-only**: never upscales small scans (LIBRARY_PHASE0.md 4.1).
- **Additive tooling**: touches only `tools/`; no working-path or schema change here.

## Scope of this branch

This branch adds the **pipeline code only**. Running the pilot (download, extract,
upload) happens in the Codespace, where a terminal + the service-role key are
available. The dry-run gate and self-tests let you prove correctness before any
upload. The bulk run across the remaining 196 zips is a **separate approval**.

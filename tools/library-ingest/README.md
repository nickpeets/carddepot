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
| `normalize.py` | shared catalog-key normalizer (strip role suffixes RC/SV/MGR/HL, KEEP letter variants, drop (VAR), combo numbers -> None) |
| `parsers.py` | per-era parsers A/B/C/D + `family_for(year, brand)` router |
| `ingest.py` | the pipeline. Dry-run by default; `--commit` uploads |
| `test_ingest.py` | self-tests (no zip needed); validated vs real 1980/1989/2021 catalogs |
| `requirements.txt` | Pillow (resize) + supabase (upload) |

## Parser family status (pre-validated against real catalogs)

| family | grammar | sample year | status |
|--------|---------|-------------|--------|
| A | `{NNN}_{side}.jpg` numeric-only, no name | 1952 Topps | parser correct STRUCTURALLY; **no catalog for pre-1980** so not matchable |
| B | `{NNN}-{Name}[-HL]-{side}.jpg` hyphen, combos | 1980 Topps | **proven** vs 726-number catalog |
| C | `{num}_{Name}[-RC]_{side}.jpg` unpadded | 1989 Fleer | **proven** by the pilot |
| D | `{NNN}[a-z]_{Name}[_(VAR)]_{side}.jpg` | 2021 Topps | **proven** vs 933-number catalog (letter variants matched, (VAR) dropped) |

### !! CATALOG COVERAGE (plan-affecting)

There is a `data/cards-YYYY.json` for **1980-2026 only** (47 files). **No catalog
exists for 1952-1979.** Consequences:

- The family-A pilot zip `1952-Topps` **cannot be dry-run/matched** -- `ingest.py`
  aborts it cleanly with `catalog not found` (exit 2), never uploading.
- In the bulk run, every pre-1980 vintage zip (~28 zips, 1952-1979, Topps-only) will
  hit the same clean skip. They are un-ingestable until a catalog is authored for them.
- So the ingestable universe is the **~169 zips from 1980 on**, not all 197. This is
  design (the join key is the catalog number), not a bug -- flagged so the batch's
  skip count is expected, not alarming.

## Locked decisions (Nick)

- canonical size **1000px long-edge, JPEG q82, downscale-only** (`target = min(1000, source_long_edge)`)
- Supabase **Pro**, bucket **`card-library`**, public-read
- DDL already run (bucket + `catalog_key` + `card_library` + `card_library_manifest`, manifest RLS-locked)
- 5 missing 1989-Fleer backs accepted as scan-reality (has_back=false); manifest picks them up if ever scanned

## One-time setup: pull the corpus with rclone (do this in the Codespace terminal)

Run these **one command at a time**. When rclone opens a browser step, **you** complete
the Google sign-in/consent yourself; the assistant never authorizes it for you.

**1. Install rclone** (Codespaces are Debian-based):

```bash
curl https://rclone.org/install.sh | sudo bash
rclone version   # expect: rclone v1.6x.x
```

**2. Start config for a new Google Drive remote:**

```bash
rclone config
```

Answer the prompts literally:

- `n`  (New remote)
- name> `gdrive`
- Storage> type `drive` (Google Drive) and press Enter
- `client_id>` press Enter (blank -- uses rclone's default)
- `client_secret>` press Enter (blank)
- `scope>` type `1` (full access) -- or `2` for read-only, which is safer for a pure pull
- `service_account_file>` press Enter (blank)
- `Edit advanced config?` `n`
- `Use auto config?` -> **`n`** (a Codespace has no local browser)

**3. Complete the OAuth on YOUR machine.** rclone prints a command to run locally
(it looks like `rclone authorize "drive"`). On your own laptop (with rclone
installed), run that exact command; a browser opens, you sign in to the Google account
that owns `baseball_cards` and click Allow. rclone prints a token blob. **Copy the
whole token** and paste it back into the Codespace prompt (`config_token>`).

- `Configure this as a Shared Drive (Team Drive)?` `n` (it is a My Drive folder)
- Review the summary -> `y` (yes this is OK)
- `q` (quit config)

**4. Sanity-check the remote sees the folder:**

```bash
rclone lsd gdrive:baseball_cards | head   # should list nothing (files, not dirs)
rclone ls gdrive:baseball_cards | grep -c '\.zip'   # expect ~197
```

**5. Pull every zip into `./zips` (resumable; re-run to resume):**

```bash
cd tools/library-ingest
mkdir -p zips
rclone copy "gdrive:baseball_cards" ./zips --include "*.zip" -P
# -P shows live progress. ~6.24 GB total; the redesign concept zip is tiny and harmless.
```

That single copy replaces all 197 manual browser downloads. `zips/` is gitignored.

## Running one zip

### Dry-run (safe: no network writes)

```bash
cd tools/library-ingest
pip install -r requirements.txt
python ingest.py --zip ./zips/1989-Fleer.zip --year 1989 --brand Fleer --set Fleer
```

Prints the census (family, file count, front/back split, sample dimensions/bytes), the
**match rate**, and writes `unmapped_1989-Fleer.csv`. Nothing uploads. Exit 0 iff
match rate >= `--min-match` (default 0.95).

### Commit (upload) -- only after a clean dry-run

```bash
export SUPABASE_URL=...                  # project URL
export SUPABASE_SERVICE_ROLE_KEY=...     # service role key (elevated; NEVER commit/log)
python ingest.py --zip ./zips/1989-Fleer.zip --year 1989 --brand Fleer --set Fleer --commit
```

Uploads downscaled JPEGs to `card-library` at `{year}/{brand}/{set}/{number}_{side}.jpg`,
upserts `card_library`, appends `card_library_manifest`. **Resumable:** a rerun
skips any source file already `done` (ledger lookup, not re-derive). Failures are
logged + marked `failed`, not fatal; unmapped files logged too.

### Verify

Sample ~10 objects by public URL
(`{SUPABASE_URL}/storage/v1/object/public/card-library/1989/fleer/fleer/106_front.jpg`):
image serves, identity right, front/back paired. Then eyeball a dozen in the binder.

## Bulk run (Stage 2) -- ordered oldest->newest, unattended

After all four families are proven, ingest the rest with the manifest doing resumability.
A driver loop should, per zip: run dry-run first; if match rate < 0.95 **skip + log**
(never force-upload); else `--commit`; keep going on failure; report every ~25 zips
(zip count, files uploaded, cumulative GB, review-CSV size). Pre-1980 zips self-skip on
`catalog not found`. If the Codespace dies, re-run -- `done` rows are skipped.

## Tests

```bash
cd tools/library-ingest
python test_ingest.py          # stdlib runner, no pytest needed
```

Parser + normalizer + catalog membership (1980=726, 1989 Fleer=703, 2021=933) were all
validated against the live `data/cards-*.json` before shipping.

## Safety rails (AGENTS.md)

- **Service-role only** for writes (5.1); key from env, never hard-coded/logged/URL'd (7).
- **Fail-loud** everywhere (4). **Idempotency at the file unit** via manifest unique key (4).
- **Downscale-only**: never upscales small scans. **Additive tooling**: only `tools/`.

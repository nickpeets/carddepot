# URL Recovery — NOTES / PLAN (feat/url-join-recover)

## What is in this commit
- data/url_recovery_map.json  — computed mapping {year:{brand:{number:[url,team]}}}, 114,250 entries.
- data/master_checklist.xlsx  — source workbook (197 tabs), now git-tracked on this branch.
- This NOTES file.

This commit adds COMPUTED DATA ONLY. It does NOT regenerate or rewrite the
cards-<year>.json dataset, the CSV, or build_card_data.py. No card is added or removed.

## Join recipe (reproducible)
- Parse data/master_checklist.xlsx, all 197 tabs. Tab name = "<Year> <Brand>".
  Per-tab columns: Card # | Player / Variation | Team | Card Page URL.
  Odd tabs handled: 1980 Topps (trailing empty col) + 2025 Bowman (wide junk header) -> take cols 0..3 only.
- PRIMARY KEY: year + brand + number (exact string match).
  - checklist "Fleer Tradition" tab is ALSO indexed under brand "Fleer".
- NAME TIEBREAK (only when >1 checklist rows share a key): normName(player) equality.
- SUFFIX TAGS STRIPPED from BOTH sides before the name compare:
  FB, FBC, HL, RC, VAR, and any trailing ALL-CAPS token (2+ letters).
- normName: NFKD strip-accents; lowercase; '.'->space; jr/sr normalize; keep [a-z0-9 ]; collapse spaces.

## Dry-run results (verified, not yet applied to dataset)
- checklist rows parsed: 112,284   mappings emitted: 114,250
- coverage 18.1% -> 91.5%   (no card added/removed)
- per brand recovered: Bowman 11,754 | Donruss 18,593 | Fleer 16,512 | Topps 50,948 | Upper Deck 16,443
- unmatched: Score 8,335 (no tab, by design) + 4,981 (no checklist key, incl. 2026 Bowman 100)
- spot check: 1997 Bowman #194 (Adrian Beltre, "FBC, RC") -> sid/862/cid/153044/1997-Bowman-194-Adrian-Beltre

## SHELL STEP TO RUN LATER (when Python + git CLI available — DO NOT run in-browser)
1. Build a NEW canonical CSV  baseball_cards_with_urls.csv  (do NOT overwrite
   baseball_cards_6brands_all_sets_1980-present.csv). Add columns: Card Page URL, Team.
   Populate from data/url_recovery_map.json keyed on year+brand+number; keep existing
   urls where a card already had one.
2. Rewire build_card_data.py: SRC -> baseball_cards_with_urls.csv; emit url + team into
   each record dict; keep index.json / players.json behavior unchanged.
3. Regenerate data/*.json.
4. UNION against committed data with a HARD no-year-decrease guard: for every year,
   new card count >= committed count (1996>=1713, 2020>=1604, 1989>=7488, ...). STOP if any year drops.
5. Verify in-app: 1997 Beltre Bowman #194 -> FIND CARD enabled -> .../cid/153044/...; spot-check
   several FBC-suffixed cards + a Bowman + an Upper Deck resolve; Score still disabled;
   type-ahead + season picker intact. Then report before/after coverage. Preview, no merge.

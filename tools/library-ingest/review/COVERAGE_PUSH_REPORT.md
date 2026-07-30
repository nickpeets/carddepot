# Coverage push - library ingest session (branch library/ingest-pilot-1989-fleer)

Scope: Supabase `card-library` bucket + `card_library` / `card_library_manifest`
tables only. No app-code changes, no PR, no manifest regeneration.
Code touched: `tools/library-ingest/ingest.py`, new `tools/library-ingest/recover.py`.

## Before / after

| metric | before | after |
|---|---|---|
| bucket objects (manifest `done`) | 176,246 | 179,767 |
| card_library rows | 176,210 | 179,731 |
| distinct cards with art | 88,120 | 89,880 |
| front+back pairs | 88,090 | 89,849 |
| manifest `unmapped` | 478 | 438 |
| manifest `failed` | 2 | 0 |
| zips with zero coverage | 36 of 197 | 34 of 197 |
| coverage vs catalog keys (139,019) | 63.39% | 64.65% |

+3,521 images, +1,760 cards.

## Bugs found and fixed

1. `_VAR_NUM_RE` in ingest.py was `r"^\\d+[a-z]$"` - a double-escaped backslash,
   so it matched nothing and `variants_excluded` was always 0. The base-card
   gate therefore counted letter-variant files as base-card misses. This alone
   held 1990-Upper-Deck at 76.82% and below the 95% gate.
2. Set resolution was separator-sensitive: `1993-UpperDeck.zip` -> set token
   `upperdeck`, which `norm_text` folds to `upperdeck` while the catalog label
   `Upper Deck` folds to `upper deck`. The zip resolved against an EMPTY set
   (0 catalog numbers -> 0.00% match -> gate abort). `recover.resolve_set_name`
   now matches on a squashed key and rewrites brand/set to the catalog's own
   label, so keys and object paths stay identical to every other Upper Deck year.
3. "Multiples of 11": the 1983-86 scan batches wrote the repeated-digit card
   numbers 11,22,...,99 as `1-2_`, `2-2_`, ... `9-2_`. `_COMBO_RE` read those as
   combo/leader numbers and dropped them - exactly 9 cards x 2 sides = 18 images
   per affected set. Not an ingest batching defect; a source filename encoding
   the parser mis-classified. Corpus audit found it in 9 zips only.
4. Two more filename encodings in the same family: `201-1979_` (league-leader
   cards carrying the stat year) and `100-2_` (checklist / corrected-plate
   second versions).

`recover.py` handles all of these as GUARDED rules: a candidate number is only
accepted when the catalog's own player/title text for that number also appears
in the filename. That guard is what stops `3-2_Checklist-235-338-CL` in
1986-Donruss from being mis-read as card 33 (Andres Galarraga).
Resolution is two-pass: numbers that resolve directly claim their slot first,
recovery may only fill slots the direct pass left empty, and one image per
(catalog_key, side) is enforced so a recovered file can never overwrite a card
that resolved on its own.

## Per-zip recoveries committed

| zip | uploaded | note |
|---|---|---|
| 1993-UpperDeck.zip | 1,680 | 0.00% -> 100.00%, filename/set-resolution fix |
| 1990-Upper-Deck.zip | 1,593 | 76.82% -> 100.00% base, variant fix; 206 dupes logged |
| 1980-Topps / 1981-Topps / 1982-Topps | 14 / 24 / 16 | leader cards with year suffix |
| 1983-Fleer / 1983-Topps / 1984-Topps | 18 / 18 / 18 | multiples-of-11 |
| 1985-Donruss / 1985-Fleer / 1985-Topps | 28 / 18 / 18 | multiples-of-11 |
| 1986-Donruss / 1986-Fleer / 1986-Topps | 16 / 18 / 18 | multiples-of-11 |
| 1989-Upper-Deck | 20 | letter variants |
| 1990-Bowman | 2 | letter variants |
| 2020-Donruss | 2 | retry of 2 transient HTTP 522 failures |

## Still missing (true corpus / catalog gaps - NOT bugs)

- 28 pre-1980 Topps zips (1952-1979), ~30k images. No `data/cards-YYYY.json`
  exists before 1980, so there is no join key. Un-ingestable by design.
- 6 zips whose set has NO catalog rows at all for that year:
  1992-Bowman (1,411 imgs), 1994-Bowman (398), 1995-Bowman (876),
  1996-Bowman (770), 1995-Upper-Deck (990), 1996-Upper-Deck (1,020).
  These were on the worklist as parser failures; they are not. The parser
  reads them fine, the catalog simply has no Bowman rows for 1992/1994/95/96
  and no Upper Deck rows for 1995/96.
- 438 individual images still unmapped: 240 are second copies of a slot already
  filled (photo variants / parallels the catalog does not model), 152 are card
  numbers genuinely absent from the catalog set, 46 have number tokens nothing
  can resolve. Full list: `review/CONSOLIDATED_unmapped.csv`.
- Score, Topps Tiffany, Topps All-Star Glossy, Bowman Tiffany, Fleer
  "Printed in Canada" and the other subset/parallel sets: present in the
  catalog, no zips on disk at all. Scan-session shopping list.

## Nick-asks

1. Catalog gaps: 1992/1994/1995/1996 Bowman and 1995/1996 Upper Deck need
   catalog rows before ~5,465 images already on disk can be ingested. This is
   the single biggest remaining unlock and it is a data job, not a code job.
2. 1986-Donruss numbers its checklists 2,3,4,5,6 - colliding with the base
   player cards of the same numbers. 10 images stay unmapped until the catalog
   models them distinctly.
3. 1993-Bowman has 36 bucket objects where two different source files claim the
   same (catalog_key, side); the second overwrote the first before the dedupe
   guard existed. Worth a re-ingest once the source numbering is settled.
4. Coverage denominator: 54.1% could not be reproduced from anything in the
   repo. Measured against the 139,019 distinct catalog keys in data/cards-*.json
   the library went 63.39% -> 64.65%. Confirm which denominator you want.
5. `1993-UpperDeck.zip` is the only zip missing the brand hyphen. The parser now
   copes, but renaming it keeps the corpus uniform.

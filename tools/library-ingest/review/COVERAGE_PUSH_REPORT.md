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

---

# FOLLOW-UP PASS — answers to Nick's five asks

Same session, same write scope (card-library bucket + card_library / manifest
tables only). No repo app code touched.

## 1. Branch pushed

`e11940a` is on `origin/library/ingest-pilot-1989-fleer` (608bf15..e11940a).
No PR opened. The work now survives Codespace deletion.

## 2. Coverage — two fractions, labelled distinctly

Both denominators reproduce exactly from `data/cards-*.json`:
155,844 catalog ROWS, 139,019 distinct catalog KEYS, 16,825 rows sharing a key.

| metric | definition | pre-session | post-session | delta |
|---|---|---|---|---|
| **PACK-ROLL POOL** | art-backed catalog ROWS / 155,844 rows | 97,040 (62.27%) | **98,867 (63.44%)** | +1,827 (+1.17 pp) |
| PACK-ROLL POOL (both sides) | rows with front AND back | 97,008 (62.25%) | 98,836 (63.42%) | +1,828 |
| **CORPUS KEY COVERAGE** | art-backed distinct KEYS / 139,019 keys | 83,950 (60.39%) | **85,729 (61.67%)** | +1,779 (+1.28 pp) |
| CORPUS KEY COVERAGE (both sides) | keys with front AND back | 83,921 (60.37%) | 85,700 (61.65%) | +1,779 |

"pre-session" is reconstructed from `card_library.created_at < 2026-07-30`,
which lands on 176,210 rows — the exact baseline row count in the first report,
so the split is trustworthy.

**Correction to the first report.** It quoted corpus key coverage as
63.39% -> 64.65%. That divided *all* library front keys (88,119 then 89,880)
by 139,019 without checking those keys exist in the catalog. 4,169 of them do
not (see F1 below), and the first report's claim of "0 front keys outside the
catalog" was wrong. The intersection-correct figures are the table above.

**The 54.1% baseline could not be reproduced.** The denominator matches to the
digit, the numerator does not: no reconstructible DB state yields 84,272
art-backed rows (the earliest reconstructible state, 2026-07-20, is already
above it). The closest figure in the whole computation is 83,950 — the
pre-session distinct-KEY count — which suggests 54.1% may have divided distinct
KEYS by catalog ROWS. Flagged as an ask; the deltas above are internally
consistent regardless of which baseline is correct.

## 3. Catalog rows for the six gap sets

Not executed. Scoped as its own task in `review/CATALOG_GAP_PLAN.md` for
green-light, per the ask.

## 4a. The overwritten 1993 objects — fixed, and they were NOT what they looked like

The 36 objects were **18 in 1993-Bowman and 18 in 1993-Donruss**, not 36 in
Bowman. Diagnosing them turned up a third dialect of the multiples-of-11 defect:

```
1993_Bowman/1_98761_Lou-Whitaker_front.jpg      -> really card #11
1993_Donruss/9_100099_Kevin-Ritz_front.jpg      -> really card #99
```

`{n}_{sourceid}_{Player}_{side}.jpg`, where the real number is n*11. Unlike the
`1-2_` dialect (1986 Topps) these files were never unmapped — the leading token
is itself a valid catalog number, so they resolved as clean *direct hits* onto
#1..#9 and silently overwrote the real #1..#9 art. That is why it surfaced as a
collision rather than an unmapped row, and why the dedupe guard alone would not
have fixed it: the guard stops the second writer, but it cannot tell which of
the two writers is the impostor.

Fix: `recover.override_number()` (rule OV1), called from a new **pass 0** in
`ingest.py` — before matching, not as a second-chance recovery. Triple-guarded:
structural shape, n*11 must exist in the set catalog, and the catalog title at
n*11 must agree with the filename's player. If the name cannot be confirmed the
parsed token wins, so a bad guess can never displace a real card. All 18
name-confirmed independently; the 9 sourceids in each zip also step by exactly
11, corroborating.

Corpus-wide audit: 192 files match the `N_LONGID_` shape across 10 zips, but
OV1 fires on exactly **36** — the two 1993 zips. The other 156 (2004/2005/2011/
2012/2013/2016 Topps, 1982 Fleer, 2001 Topps) are `327_2004_..._FS_front.jpg`
league-leader/future-stars files whose leading token is already correct; n*11
is not in their catalog, so OV1 declines them.

Repair: 72 manifest rows restaged, both zips re-run with `--commit`.
Result `uploaded=36 skipped=1380 failed=0 unmapped=0` (Bowman) and
`uploaded=36 skipped=1548 failed=0 unmapped=0` (Donruss) — 36 slots corrected
in place, 36 new slots created at #11..#99.

Verified after:
```
1993|bowman|bowman|1   front <- 1_Glenn-Davis_front.jpg          (was Lou Whitaker)
1993|bowman|bowman|11  front <- 1_98761_Lou-Whitaker_front.jpg    (was EMPTY)
1993|donruss|donruss|1 front <- 1_Craig-Lefferts_front.jpg        (was Manny Alexander)
1993|donruss|donruss|99 front <- 9_100099_Kevin-Ritz_front.jpg    (was EMPTY)
```
**Colliding (catalog_key, side) slots corpus-wide: 0.**

## 4b. 1986-Donruss checklist collisions — confirmed, logged

Current behaviour is what the ask describes, and it is enforced twice over:

* the R1 name guard refuses `3-2_Checklist-235-338-CL` -> #33, because catalog
  #33 is Andres Galarraga and no token of that title appears in the filename;
* the pass-1/pass-2 slot ownership then refuses R3's fallback `3-2` -> #3,
  because #3 is already held by `3_Willie-McGee-DK`.

So the checklists stay unmapped rather than being mis-assigned onto the base
player cards. All 10 remaining 1986-Donruss unmapped rows are checklists —
`2-3`, `3-2`, `4-3`, `5-3`, `6-3` Checklist-CL, front and back. No player card
is displaced. This is the intended outcome until the catalog models Donruss's
checklist numbering distinctly from its base numbering.

## 5. Zip renamed

`1993-UpperDeck.zip` -> `1993-Upper-Deck.zip` on disk **and** in Drive
(`rclone moveto gdrive:baseball_cards/...`, server-side, 1 file, 49.2 MiB).
The 1,680 manifest rows were re-keyed to the new `source_zip` in the same pass,
so resumability survived the rename — verified by a `--commit` re-run returning
`uploaded=0 skipped=1680 failed=0`.

## F1. NEW FINDING — Fleer Tradition is keyed under the wrong brand

Not one of the asks; found while rebuilding the coverage numbers.

4,169 front keys (and their backs) in `card_library` do not exist in the
catalog at all. Every one is Fleer Tradition, 1998-2006:

```
library key : 1998|fleer tradition|fleer tradition|1
catalog key : 1998|fleer|fleer tradition|1
```

`run_stage2.py` derives both brand and set from the zip filename
(`1998-Fleer-Tradition.zip` -> brand `Fleer-Tradition`), but the catalog carries
these as brand **Fleer**, set **Fleer Tradition**. The *set* half normalises to
a match, so the ingest ran clean at a high match rate and looked completely
healthy — but the brand half is wrong, so the resolver's key never matches and
none of this art is reachable by the app.

Scale: 1998 600, 1999 600, 2000 450, 2001 484, 2002 500, 2003 485, 2004 500,
2005 350, 2006 200 = 4,169 fronts, ~8,338 objects.

Not fixed here because the clean fix is a re-key (rewrite `catalog_key` and move
the objects), which is a destructive/non-additive operation and falls under
AGENTS.md §2 human sign-off. See asks below.

## Nick-asks (round 2)

1. **Fleer Tradition re-key (F1).** 4,169 cards' worth of art is in the bucket
   but invisible to the app. Two ways to fix it:
   *(a) additive* — re-ingest the nine zips with `--brand Fleer`, which writes
   correct keys and correct paths and touches nothing that exists. Costs ~8,338
   extra objects of storage and leaves the mis-keyed set behind as dead weight.
   *(b) clean re-key* — rewrite `catalog_key` on 8,338 `card_library` rows, copy
   each object to its correct path, delete the old one. Non-additive, involves
   deletes; needs your sign-off under AGENTS.md §2.
   I did neither. Which do you want? (b) is the right answer if you are willing
   to sign off on the deletes; (a) is safe and reversible if you are not.

2. **Is 54.1% definitely rows-over-rows?** See §2 — I can reproduce your
   denominator exactly but not your numerator, and 83,950 (distinct KEYS,
   pre-session) is suspiciously close to your 84,272. If 54.1% was
   keys-over-rows then the pack-pool number to quote today is 55.01%, not
   63.44%. Confirm which and I will restate the one line.

3. **Should `run_stage2.py` learn brand/set separately?** F1's root cause is
   that stage 2 sets `brand = set = <filename slug>`. Fleer Tradition is the
   only corpus case today, but Topps Chrome, Bowman's Best, Donruss Diamond
   Kings etc. are all in the catalog as `brand != set` and any future zip named
   after the *set* will reproduce the bug silently. A small brand/set lookup
   table in stage 2 would close the family. Repo-code change, so not mine to
   make this session.

4. **1993 sourceids.** The `{n}_{sourceid}_` files carry TCDB-looking ids that
   step by exactly 11. If those ids are stable, a future ingest could key off
   them directly instead of inferring n*11. Worth knowing where the 1993 scans
   came from.

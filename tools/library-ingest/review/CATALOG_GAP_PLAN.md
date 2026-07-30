# CATALOG GAP PLAN — 1992/94/95/96 Bowman + 1995/96 Upper Deck

**Status: PLAN ONLY. Nothing executed. Awaiting Nick's green-light.**

Raised as ask #3 of the coverage-push follow-up. Scoped as its own task because
the catalog feeds Add-a-Card, pack rolls and the art resolver, so additions need
the same player-at-number rigor as everything else.

## 1. What is actually missing

These six sets have zips on disk, images that parse cleanly, and **zero**
catalog rows to match against — so `ingest.py` reports a 0.00% match rate and
the 95% gate correctly refuses to commit them.

| set | images on disk | catalog rows today |
|---|---|---|
| 1992 Bowman | 1,411 | 0 |
| 1994 Bowman | 398 | 0 |
| 1995 Bowman | 876 | 0 |
| 1996 Bowman | 770 | 0 |
| 1995 Upper Deck | 990 | 0 |
| 1996 Upper Deck | 1,020 | 0 |
| **total** | **5,465** | **0** |

Verified twice: absent from `data/cards-YYYY.json` *and* absent from the
upstream source `baseball_cards_with_urls.csv` (127,566 rows). So this is not a
normalisation miss or a name-variant miss — the rows were never pulled.

Scale of the unlock: 5,465 images is roughly +2,730 distinct cards, i.e. about
+1.8 pp of pack-roll pool, the largest single remaining win in the corpus.

## 2. Where the data would come from

The catalog is TCDB-derived. `build_card_data.py` reads
`baseball_cards_with_urls.csv` (`Year,Brand,Set,Card Number,Player,Notes,
Card Page URL,Team`) and fans it out to `data/cards-YYYY.json`. Every row
carries its provenance in the URL:

```
https://www.tcdb.com/ViewCard.cfm/sid/82/cid/31601/1980-Topps-1-Lou-Brock/...
```

`sid` is the TCDB set id, `cid` the card id. So the shape of the work is
identical to the original build: pull the six checklists from TCDB, append rows
to the source CSV in the existing column order, re-run `build_card_data.py`.

Three options, in order of preference:

1. **Re-run the original pull for the six sids.** Highest fidelity, matches how
   every other row in the corpus was produced, and the output is diff-able
   against the existing CSV. Needs whatever script/credentials did the original
   TCDB pull — that tooling is not in this repo, which is the main unknown.
2. **Derive the checklist from the scans themselves.** The zips already encode
   number and player in every filename (`117_Chipper-Jones_front.jpg`). This
   costs nothing and needs no network, but it is circular: it would make the
   catalog agree with the scans by construction, so the ingest match rate stops
   being an independent check. Acceptable only as a cross-check against (1).
3. **A second published checklist source**, reconciled against (1) or (2).

Recommendation: (1) as the source of truth, (2) as an automated cross-check.
Do not ship (2) alone.

## 3. Risk of polluting the catalog

This is the part that needs the sign-off, because catalog rows are load-bearing
in three places at once (Add-a-Card lookup, pack rolls, art resolution) and a
bad row is worse than a missing one — a missing card cannot be pulled from a
pack, but a wrong card can be pulled, collected and displayed forever.

Specific hazards:

* **Wrong player at a number.** Silently mis-attributes art. This is exactly
  the failure the name guards in `recover.py` exist to prevent, and it would be
  introduced upstream of them where they cannot see it.
* **Subset/parallel rows leaking into the base set.** 1992 Bowman has foil
  parallels; Upper Deck has Electric Diamond. If those land as `set = Bowman`
  they inflate the denominator and create catalog keys no scan will ever fill,
  which *lowers* measured coverage while looking like more data.
* **Number-format drift.** Bowman and Upper Deck both use plain integers here,
  but any `1a`/`1b`/`SP` tokens must normalise the same way `normalize.py` does
  or they become permanently unmatchable.
* **Duplicate rows.** The catalog already has 16,825 rows sharing a key; adding
  more inflates pack-roll weighting for those cards.

## 4. Proposed acceptance gates

No merge unless all five pass, on a branch of its own, additive-only:

1. **Count check.** Row count per set within tolerance of the published set
   size (1992 Bowman 705, 1994 Bowman 682, 1995 Bowman 439, 1996 Bowman 440,
   1995 Upper Deck 450, 1996 Upper Deck 450 — figures to be confirmed against
   the pull, not asserted from memory).
2. **Contiguity check.** Numbers form a dense 1..N run with a listed, reviewed
   exception set. Any hole is a pull error until proven otherwise.
3. **Independent name agreement.** Run the scans against the new rows with the
   existing `recover._title_agrees` guard and require >=98% player-name
   agreement. This is the real test: the scans and TCDB are independent sources,
   so agreement at that rate means both are right. Every disagreement gets
   eyeballed individually — that list is the deliverable, not a footnote.
4. **No key collisions.** New keys must not collide with existing catalog keys.
5. **Gate check.** Dry-run all six zips; each must clear 95% base match on its
   own merit. If a set cannot clear the gate, its rows do not ship.

## 5. Rollback

Catalog additions are one commit touching `baseball_cards_with_urls.csv` and
six `data/cards-YYYY.json` files, nothing else — revert the commit and the
catalog is byte-identical to today. Library rows ingested against bad catalog
rows are the harder half: those would need the same re-key treatment as F1, so
**the ingest must not run until the catalog rows are merged and reviewed.**
Catalog first, sign-off, then ingest. Not in one pass.

## 6. What I need from Nick

* Green-light, and the answer to: does the original TCDB pull tooling still
  exist somewhere, or should this be rebuilt?
* Confirmation of the six published set sizes to check the pull against.
* Whether parallels/subsets should be pulled at all, or base-only for now.

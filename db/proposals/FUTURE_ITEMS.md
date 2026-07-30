# Future items (logged, not implemented)

Nothing in this file has been applied. It exists so these two ideas are not
re-discovered from scratch. Both were raised while shipping fix/card-position
and fix/free-pull-enrichment.

## 1. Provenance marker for free-daily-pull cards (RPC side)

Paid pack cards are inserted client-side by cardRow(), which stamps a
`packseed:<seed>` bio into cards.notes. That marker is how a card is later
identified as pack-granted rather than manually added.

The free daily pull takes a different route entirely: public.depot_claim_free_pack
(see free_daily_pack_fix.sql, the `insert into public.cards`) inserts the row
server-side and writes no notes at all. Free-pull cards therefore land with
notes = '' and carry no provenance whatsoever. Observed live: Ricky Ledee
2000 Upper Deck #183, claimed 2026-07-25, notes length 0.

Proposal: have the RPC write a packseed-equivalent provenance marker into notes
on insert -- e.g. a `freepull:<claim_timestamp>` token, or a DEPOT_META key such
as {"src":"free"} -- so free cards are as traceable as paid ones.

Why it is deferred: it is a SQL/RPC change, and the RPC is SECURITY DEFINER and
sits next to the money ledger. It wants its own branch, its own review, and a
migration. It is also not blocking anything: position enrichment for free-pull
cards is now handled client-side, post-grant, in claimFree().

Care required if implemented: whatever the RPC writes must not collide with the
DEPOT_META comment that the client later rewrites during enrichment. The client
preserves the leading bio text and replaces only the trailing META comment, so a
plain-text token before the comment is safe; a second META comment is not.

## 2. A real cards.pos column

Position currently rides inside cards.notes as JSON in the DEPOT_META comment,
read back through depotNormalizePos() (which maps the retired em-dash sentinel
and any other non-position string to null).

That is fine today: the collection is 25 cards, and Group By Position is computed
client-side over COLLECTION. It stops being fine as soon as position needs to be
filtered, sorted, or aggregated server-side, because notes is opaque text.

Sketch, for whenever that day comes:

    alter table public.cards add column pos text;
    create index cards_owner_pos_idx on public.cards (owner_id, pos);

plus a one-time migration lifting DEPOT_META.pos out of notes into the column.

Notes on doing it properly: the column should be nullable with no default (never
a sentinel string); normalize-on-read must stay for rows written before the
migration; and notes should remain the source of truth until the migration is
verified, so the two can be cross-checked rather than trusted blindly.

## 3. Share personal scan to the public card-library (Option B, from feat/add-card-search)

The Add-a-Card flow ships with the HYBRID decision: a user's personal scan always writes to the
private card-images/{user}/{collection}/{cardId}_{side}.jpg path (existing machinery, zero DDL)
and paints via the personal->library->placeholder resolver order. A future "Share to library"
toggle would also populate the public card-library bucket / public.card_library catalog.

Prerequisites before any bucket-write ships (do NOT attempt a bucket-write policy change casually):

- Storage insert policy on card-library, OR an Edge Function doing the privileged write server-side
  (preferred: keeps the service role off the client).
- First-scan-wins: the first accepted image for a catalog_key+side wins; later submissions never
  silently overwrite a canonical image.
- Explicit opt-in consent toggle at add-time (off by default) before anything leaves the private bucket.
- Report / remove path so a bad or mislabeled shared image can be flagged and taken down.

## 4. renderGrouped mojibake team comparison (one-line fix)

saveCard writes the team default as a double-encoded mojibake em-dash sentinel; renderGrouped
compares against that same mojibake, while rowToCard uses a clean U+2014. feat/add-card-search
deliberately writes NULL (never the sentinel) for unresolved team. Separately, renderGrouped's
comparison should be normalized to the clean em-dash (or an explicit null/empty check) so grouped
view stops depending on the mojibake sentinel. Out of scope for feat/add-card-search.

## 5. Rolodex meta: card-year span presented as unlabeled career span

The roloSuggest player-list meta builds its year range from idx[normName].years
(the years the player has CARDS in the checklist) and renders it bare as
"YYYY-YYYY N yrs" with NO qualifier. Live repro: Mark McGwire shows
"1985-2024 24 yrs" where 2024 is a reprint/insert year, not a playing season.
Reads as a career span but is a card-year span. Fix (future): label explicitly
as "card years", or source true debut/lastPlayed from the MLB pull for a real
career label. Out of scope for fix/add-card-polish -- logged per instruction.

## 6. DIAMOND: a fourth prestige band + a fourth pack tier (scoping)

Raised by the pack-shop redesign handoff (`handoff-pack-shop/README.md`), which designs a
**Diamond** tier at **2,000** with the copy "Every pack lands a Diamond in the hit slot."
**There is no Diamond band in the engine.** `js/depot-pack-engine.js` has
`BAND_RANK = { plain:0, bronze:1, silver:2, gold:3 }` and three paid tiers (bronze/silver/gold);
`js/depot-prestige.js` scores into those four bands only. feat/pack-shop-redesign therefore ships
**three tiers**, keeps the Diamond visual language in `css/pack-shop-v2.css` (foil, crimp, pixel
diamond, `GUARANTEED HIT` ribbon, `--pk-band-diamond`, the hit treatment) and renders **no Diamond
tier card**. Gold is the real top band and wears the hit ceremony.

Shipping Diamond for real needs all of:

1. **A new prestige band.** `depot-prestige.js` must be able to *score* a card as diamond -- a new
   threshold above gold, with a defensible definition (what makes a card diamond and not gold?).
   Today the band ladder tops out at gold, so a Diamond tier would have nothing to land.
2. **`BAND_RANK` entry** (`diamond: 4`) in `depot-pack-engine.js`. Every floor comparison, the
   `sampleHitBands` counter object, `estimateOdds().hitBandPct` and the free-pack band table read
   this map, so the addition has to be made in one place and verified in all four.
3. **Tier config** in `TIERS`: price, `cards`, `eraWeight`, `starBias`, `hitFloorBand:'diamond'`,
   `hitStarBias`. Note the hit slot is a **bounded 40-try re-roll with a best-so-far fallback**
   (`rollPack` returns `floorMet` precisely because it can be false), so a Diamond tier can NOT
   honestly promise "every pack lands a Diamond" unless the re-roll is made unbounded or the draw
   is made band-first like the free pack (`FREE_BAND_ODDS` / `drawFreeIndex` is the existing
   pattern for exact, publishable odds).
4. **Server-side purchase validation.** `depot_purchase_pack(p_cost, p_tier)` takes the cost from
   the CLIENT. Today the three prices are low and the tier list is fixed; a 2,000 tier makes the
   unvalidated cost parameter worth closing: validate `p_tier` against a server-side price table
   inside the RPC (and reject unknown tiers) before adding it. This is a **schema/DDL change** and
   needs Nick's sign-off per AGENTS.md section 2.
5. **The 2,000-vs-earn-rate question.** `ECONOMY_DESIGN.md` sets the earn rate; the handoff itself
   flags 2,000 as a placeholder (its section 8.1). At an exhibition win of 25 DD, 2,000 is 80 wins
   per pack. Either the price or the earn rate has to move; that is an economy decision, not a UI one.

## 7. Dupes: a "dupe -> coins" chip during the reveal

The handoff's open question 4. Current behaviour (unchanged by feat/pack-shop-redesign) is
**silent**: a pull already in the binder is inserted again and simply shows up as a second copy --
no chip, no coins, no dedupe. Designing this needs a decision on whether a duplicate converts to
currency (a wallet CREDIT, i.e. money path, i.e. an RPC + ledger reason) or is purely cosmetic
("DUPE" chip on the card front during the reveal). If it credits coins it must be atomic with the
grant, which means it belongs in the same RPC as the insert, not in the client.

## 8. Sound: rip / flip / hit sting

The handoff's open question 5, deliberately out of scope. The ceremony is built to carry it: the
phase boundaries in `playPackSession` (held -> reveal -> all-five -> added) and the escalation
branch (`isTop`) are the natural cue points, and `prefers-reduced-motion` already has a parallel
in `prefers-reduced-transparency`/muted-by-default audio policy: browsers block autoplaying audio
until a user gesture, and the rip is entirely gesture-driven, so the cues would actually be
allowed to play. Needs assets and a mute affordance before it is worth building.

## 9. Static art-key manifest (kill the 89 round trips)

`js/depot-library-index.js` reads the art-backed key set straight from
`card_library` because PostgREST caps a page at 1000 rows: 89 requests, 8 lanes,
~2.2s measured, ~3MB uncompressed, once per page load. Correct and always current,
but wasteful for a set that changes only when the ingest pipeline runs.

Follow-up: have the ingest pipeline emit `data/library-art-keys.json` (or one file
per year, mirroring `data/cards-YYYY.json`) whenever it lands a set, and let
`DepotLibraryIndex.load()` prefer the static file and fall back to the live query
when the file is missing or older than the newest `card_library.created_at`. Same
filter, zero round trips, and it stays honest because the fallback is still there.

## 10. Library coverage gaps the art filter exposes (data work, not code)

Measured against the full 155,844-row pack catalog on 2026-07-29: **84,272 rows
(54.1%) have an active `side='front'` row in `card_library`.** `card_library` holds
88,119 fronts, so 3,847 library keys belong to cards that are not in the pack
catalog at all (subsets/variants).

Worth a targeted ingest pass, biggest gaps first: 1988 Donruss (1,279 rows
missing), 2006-2009 Upper Deck (~4,100 across four years), 1991/1992 Score
(~1,785), 1993 Upper Deck (840), 1998 Fleer Tradition (832), 1989-1991 Upper Deck
(~2,400). Year coverage swings hard: 2024 is 96%, 1986 is 85%, 1989 is 42%.

Two specific oddities:
* **1986 Topps is missing exactly the multiples of 11** - #11 Ojeda, #22 Walker,
  #33 Lahti, #44 McCullers, #55 Lynn, #66 Forsch, #77 Leibrandt, #88 Nieto,
  #99 Biancalana. Nine cards, one arithmetic pattern; that smells like an ingest
  batching bug rather than nine bad scans. Everything else in the set (961 of 974)
  has art.
* **The catalog carries two junk rows**: `1986 Topps #51` and `#171` have the
  player name `"Skipped | See #57 (b)"`. They were pullable from a pack before this
  filter. The filter drops them (no art), but the checklist data should not have
  them either.

## 11. Server-side free roll + the card_library join (SQL, NOT shipped)

Audited for Task D: **the free daily pack is NOT selected server-side.**
`depot_claim_free_pack(p_card jsonb)` (see `free_daily_pack.sql` +
`free_daily_pack_fix.sql`) enforces the 24h cadence, resolves the caller's
collection, inserts the card **from the client payload** and stamps the ledger.
`depot_purchase_pack(p_cost, p_tier)` only moves money. So the client-side art
filter in `DepotShop.loadCatalog()` covers the paid path *and* the free path, and
no SQL change is required to enforce Nick's rule today.

The hardening already logged in `docs/free-daily-pack-design` (server-side roll
before league mode) is where the art rule would need SQL, and it should carry the
join when it happens:

```sql
-- sketch only; needs a server-side catalog table first (the roll pool lives in
-- data/cards-YYYY.json today, which Postgres cannot see).
select c.* from pack_catalog c
join card_library l
  on l.catalog_key = c.catalog_key and l.side = 'front' and l.status = 'active'
where ...band/weight selection...
```

Two prerequisites, both real work: (1) the catalog has to exist in Postgres, and
(2) the weighting/prestige model would have to be reimplemented server-side or
frozen into a table. Until then the client filter is the enforcement point and the
ledger remains the record of truth.

## 12. The art filter moves the ECONOMY, not just the art

Narrowing the roll pool to art-backed cards changes the band mix, because the
library ingest went after notable sets and notable players first. Re-derived from
`estimateOdds()` on the filtered pool, the shop's own copy moved:

| tier | before (155,844 rows) | after (84,272 rows) |
| --- | --- | --- |
| Bronze | gold hit about 1 in 21 | gold hit about **1 in 16** |
| Silver | gold hit about 1 in 9 | gold hit about **1 in 7** |
| Gold | gold hit in about 97% of packs | unchanged |

The copy re-derives itself (it always reads `estimateOdds`), so nothing is
misreported. But pack VALUE went up at a fixed price, which is an
`ECONOMY_DESIGN.md` question, not a rendering one: either accept the richer pull
(and revisit prices/earn rate), or re-tune `cardWeight`/band rates against the
filtered pool so the published odds hold steady. Nick's call.

### 12a. Measured A/B (high-sample, 2026-07-30, main @ b20a57d)

The table above came off the shop's render-time estimate, which rolls only 250
packs. Re-measured with the same engine at 20,000 rolls per tier against both
catalogs -- the art-backed pool as shipped, and the raw pool obtained by making
the art index return nothing so `filterToArtBacked()` takes its fail-open path:

| tier | raw pool (155,844 rows) | art-backed pool (84,272 = 54.1%) | gold-hit delta |
| --- | --- | --- | --- |
| Free | 90 / 8 / 1.5 / 0.5 plain/bronze/silver/gold | identical | none -- free floors at plain |
| Bronze | gold 4.0% (1 in 25) | gold 5.6% (1 in 18) | +1.6 pts, +40% relative |
| Silver | gold 12.6% (1 in 8) | gold 15.2% (1 in 7) | +2.6 pts, +21% relative |
| Gold | gold 97.2% | gold 96.6% | flat -- already at the band ceiling |

Method: `DepotPackEngine.estimateOdds(tier, catalog, DepotPrestige, 20000)` in the
live shop; filtered catalog from `DepotShop.loadCatalog()`, raw catalog from the
same loader with `DepotLibraryIndex.load` temporarily resolving null. Read-only:
no pack was bought, no receipt written, no DD spent.

### 12b. Sample count: the printed copy was not noisy, it was biased

`estimateOdds` is deterministic -- it seeds its own RNG, so repeated calls at any
sample count return the identical number. The printed odds therefore never
wobbled between loads. The defect was accuracy, not stability: 250 rolls is a
biased read of the same pool.

| samples | bronze gold-hit | printed as | ms per tier |
| --- | --- | --- | --- |
| 250 | 6.4% | 1 in 16 | 1 |
| 500 | 5.8% | 1 in 17 | 2 |
| 1,000 | 4.9% | 1 in 20 | 2 |
| 2,000 | 5.2% | 1 in 19 | 6 |
| 4,000 | 5.3% | 1 in 19 | 8 |
| 8,000 | 5.4% | 1 in 19 | 11 |
| 16,000 | 5.5% | 1 in 18 | 48 |

Fixed in this PR: `oddsOf()` in `js/depot-shop-view.js` goes 250 -> 8,000 rolls.
Four tiers at ~11 ms is ~45 ms per shop render, and bronze's printed value
settles from "1 in 16" onto a stable "1 in 19".

Still open, copy rather than math: the "1 in N" integer rounding flips silver
between 1 in 6 and 1 in 7, because the true value (15.2-15.7%) straddles the
100 / 6.5 = 15.4% rounding boundary. One decimal place, or an honest range,
would stop the flip. Not changed here -- that is a copy call, not a bug.

### 12c. Decision (Nick, 2026-07-30): retune DEFERRED

Accept the richer pull for now. The economy retune -- prices, earn rate, or
`cardWeight` / band rates -- lands alongside the Diamond-tier work in section 6,
so the whole curve gets priced once instead of twice.

## 13. Pack provenance view / "Group By Pack" (scoping)

Shipped in `feat/pack-history-cards`: a Pack History row expands to the cards
that pack produced, each linking to its binder spotlight. That closes the
discoverability hole (Nick's July bronze pack looked "missing" for two weeks
while all five cards sat in the binder) with the smallest possible surface.

Still open, the fuller idea. Nick leans toward it living in the Pack Shop
rather than the binder:

- **Group By Pack** in the binder's existing group-by control: one shelf per
  pack, unpacked cards grouped under their pack, singles/scans under "Added by
  hand". Needs `pack_seed` on the client card shape (it is not in `rowToCard()`
  today) and a grouping mode in `renderGrouped()`.
- **Provenance chip in the spotlight**: "from a BRONZE pack, 13 Jul 2026" with a
  link back to the pack row. Needs the same `pack_seed` plumbing plus a grant
  lookup, or a denormalised tier/date on the card row.
- **Pack detail page** in the Pack Shop: the pack as an object -- tier, date,
  cost, the five cards with their prestige bands, the hit slot marked, and the
  ceremony replay button. This is where a "what did I get" question naturally
  goes, and it is the one Nick keeps describing.

### 13a. Two data facts any of the above must respect

1. **A seed is not a stable name for a pack.** `rollPack` is deterministic in
   (seed, catalog, tier), and the catalog is not constant: the art gate (#194)
   cut the pool 155,844 -> 84,272. Measured 2026-07-30: seed `1335568119`
   re-rolled against the July pool returns Nick's exact five; against today's
   pool it returns five entirely different cards (Hatteberg / Clark / Walker /
   Jimenez / Pujols). Provenance therefore reads `cards.pack_seed` and
   `pack_grants`, never a re-roll. REPLAY still re-rolls -- it is a ceremony,
   not a record -- but it should say so on screen; logged below.
2. **Free daily packs have no provenance at all.** `depot_claim_free_pack`
   inserts the card with `source='pack'` but leaves `pack_seed` NULL and writes
   no `pack_grants` row, so three free-pack cards (Mayne 16 Jul, Ledee 25 Jul,
   Bass 29 Jul) cannot be traced to a pull server-side. The shelf works around
   it by storing the granted `card_id` as the entry's "seed". A real fix stamps
   a seed (or a grant row) inside the RPC -- schema work, needs sign-off.

### 13b. REPLAY says "replay" but performs a re-roll

`replayPack()` re-rolls from the seed against today's pool, so for any pack
older than the art gate it plays a ceremony for cards the collector never
owned. Cheap fix: feed REPLAY the ledger rows when they exist and keep the
re-roll only for seedless local receipts. Not done here to keep the branch to
one concern.

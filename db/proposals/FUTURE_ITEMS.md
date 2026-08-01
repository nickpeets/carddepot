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

## 14. Admin testing wallets + admin spend out of economy analytics

Raised 2026-07-30 while funding Nick's wallet for live paid-pack testing.

- The grant was made the app's own way: one owner-scoped `wallet_transactions`
  row (`reason 'admin_grant'`, `amount 100000`, meta flagging it as an admin
  testing grant) followed by `depot_apply_payout`, the same ledger-then-apply
  pair `writePayout()` in `js/depot-wallet.js` uses. Worth knowing before the
  next one: `franchises.balance` is a STORED column, not a view over the
  ledger, and no trigger mirrors inserts into it -- a ledger row alone does not
  move the wallet chip. Ledger sum and balance agreed before (0 / 0) and agree
  after (100000 / 100000).
- When the roles table lands, admin accounts should get a testing wallet as
  part of that work: a documented grant path (or a seeded balance for accounts
  flagged admin) instead of a hand-run credit per session.
- Admin grants and admin spend must be flagged OUT of economy analytics. The
  `reason = 'admin_grant'` value and the `meta.exclude_from_economy_analytics`
  flag are the hooks; any sink/faucet or pack-price tuning query should exclude
  admin-flagged rows and the spend they funded, or the section 12 numbers get
  quietly poisoned by test purchases.
- Open, same pass: nothing enforces `balance = sum(amount)`, so the column and
  the ledger can drift. A reconciliation check (or a derived balance) belongs
  with the roles work. Schema change -- needs sign-off.

- Second grant, 2026-07-31, same pair, for the second tester
  (`timwstout@gmail.com`, `9861ce0d-...-041dfed6cf34`): ledger row then
  `depot_apply_payout`, 0 / 0 before, 100000 / 100000 after, and Nick's own
  95450 / 95450 untouched. That grant could not be made as written, though:
  the account had NO `franchises` row, and the balance column lives there, so
  there was nothing for the apply step to move. See section 17 -- the missing
  row is not a wallet problem, it is an onboarding one.

## 15. Does the pack pool need a stat-resolvability filter? (measured, NOT built)

Raised 2026-07-30 on `fix/subset-name-stats`, after Nick's pack-pulled
"Darin Erstad GG" landed with no season line. Nick's standard is "don't deal
cards we can't get stats for", so the question is whether the art-backed pack
pool should ALSO filter on "this name resolves to an MLB person whose career
covers the card year". Deliberately not built on that branch: it moves the
economy (see section 12) and it needs a number first. Here is the number.

**Measurement.** 500 cards sampled (seeded, reproducible) from the live
art-backed pool -- `DepotShop.loadCatalog()` filtered by
`DepotLibraryIndex.load()`, 84,452 cards of the 155,802 catalog rows -- run
through the NEW resolution on game/shop.html, counting a card as resolvable
only when it reaches an MLB person whose `mlbDebutDate`/`lastPlayedDate` span
covers the card year (the same gate `repullOne()` applies before it writes):

- **438 / 500 (87.6%) resolve span-valid.**
- **62 / 500 (12.4%) do not.** That residual splits in two:
  - **27 (5.4%) resolve to nobody.** 16 of those are not players at all --
    checklists, team cards, league leaders, multi-player subsets ("Rangers
    Leaders / Checklist (Buddy Bell / Rick Honeycutt) TL, CL", "Cleveland
    Indians TC", "Super Siblings (Roberto Alomar / Sandy Alomar, Jr.) SSS").
    The other 11 are individuals: minor leaguers who never reached MLB
    (Ronnie Walden, Mark Mangum, Chris O'Riordan) plus a **nickname gap** --
    the card front's short form is not among the official spellings MLB
    publishes. "Mike LaValliere" (MLB: Michael LaValliere, firstName AND
    useName "Michael") and "Bobby Ojeda" (MLB: Bob Ojeda) both refuse,
    correctly, under exact-match discipline.
  - **35 (7.0%) resolve to the right person, wrong year.** Prospect and draft
    cards printed before the debut (Miguel Cabrera 2002, Sean Burroughs 1999,
    Shane Andrews 1991 FRDP RC), retired-legend inserts (Brooks Robinson 2020
    SP, Tony Lazzeri 2026, Darryl Strawberry R86 2020), and post-career or
    lost seasons (Tom Henke 1996, Josh Hamilton 2016). These are honest
    no-data rows, exactly like Nick's Jeter '93 and Beltre '97.
- Of the 79 sampled names carrying trailing subset codes, 62 (78.5%) now
  resolve span-valid; the 17 that do not are mostly the non-player subsets
  above ("Athletics Leaders TL", "Angels vs. Mariners UWS, FOIL").

**The open question.** A stat-resolvability gate on the pool would remove
roughly one card in eight, but the three residual classes want different
answers and a single filter would treat them the same:

- The 16 non-player cards (checklists, team cards, leaders) arguably should
  never have been in a pack pool at all -- that is a POOL-QUALITY fix, and it
  is the one piece of this that looks unambiguously right.
- The 35 wrong-year cards are real players on real cards. Filtering them out
  would delete every prospect RC and every legend insert from the pool, which
  is a large slice of what makes packs fun. The alternative is showing a
  CAREER line (or the nearest season) instead of a blank, with provenance
  saying which -- a display decision, not a pool decision.
- The nickname gap is a resolution question, not a pool question, and it must
  not be answered by loosening the matcher. If it is worth closing, close it
  with an explicit, auditable alias table (card-front form -> MLB personId),
  never with substring or fuzzy matching. The whole Jeter/Thomas lesson is
  that a guessed line is worse than a blank one.

Also worth deciding before any filter: it would have to run at CATALOG BUILD
time, not at rip time. Resolution is a network call per card; gating a live
pack rip on statsapi puts the money path behind a third party, which the
section 7 money-safety rules forbid.

## 16. A real thumbnail pipeline for the library (measured, NOT built)

Raised 2026-07-30 building the Add-a-Card list thumbnails (feat/card-list-thumbs).

The list thumbs reuse the SAME object the CARD IMAGES panel shows -- the
full-size library front -- rendered into an ~80x112 tile. That is wasteful in
principle, so it was measured before deciding:

- 40 library fronts sampled across the bucket: p50 20,050 bytes, max 22,611,
  mean 18,894. Not the 50-200KB the feature brief assumed; the ingest already
  writes modest JPEGs.
- A player-season-brand list is 1-10 rows. The worst live case found (Carlton
  Fisk, 1991, Topps) is 7 rows / 5 distinct images = ~118KB, and the panel
  would have fetched one of those anyway. Mobile 390 shows 4 per row.
- The thumbs are lazy (IntersectionObserver, 200px margin) and capped at 4
  concurrent loads, and they are plain public URLs, so the browser cache and
  the CDN absorb repeats. Selecting a row costs no second fetch.

Conclusion: resized derivatives in the bucket are NOT worth building at this
scale. Revisit if either of these changes: a list surface starts showing
hundreds of rows at once (a set browser, a full-checklist view), or the ingest
starts writing high-resolution scans. The shape it would take: a `thumb` side
alongside `front`/`back` in card_library, written at ingest, with
depotLibraryArtURL growing a size argument -- so no caller changes.

Also seen while sampling: one of the 40 sampled catalog_key rows returned an
88-byte error body instead of a JPEG, i.e. the card_library table lists a key
whose derived object is not in the bucket. The probe-gate means the UI is
unharmed (that row just keeps its "no image yet" tile), but the table/bucket
drift is the same one the row-click gate already works around, and it deserves
a reconciliation pass with the section 14 balance-drift check.

## 17. Franchise creation has exactly one path, and it is a `window.prompt`

Raised 2026-07-31 while funding the second testing wallet. The account had no
`franchises` row at all, which is not an edge case -- it is the default state
of every account that has not entered Season Mode.

- `ensureFranchise()` in `game/season.js` is the ONLY code in the repo that
  inserts into `franchises`. It runs from `startOrResumeSeason()`, and it asks
  for the team name with `window.prompt`, so the row is created as a side
  effect of starting a season and cannot be created any other way. Nothing on
  sign-up, nothing on first shop visit, nothing on first binder load. At the
  time of writing the whole table held one row (Nick's "MY CLUB") against five
  auth users.
- The consequence is a silently broken wallet for everyone else. `getBalance()`
  in `js/depot-wallet.js` reads `franchises.balance` with `.maybeSingle()`, so
  no row is not an error -- it returns null and the chip renders 0. A payout
  then half-lands: the `wallet_transactions` row inserts fine (it is keyed on
  `owner_id`, not on a franchise), and the apply step has no row to move, so
  the ledger and the chip disagree from that user's very first credit. Nothing
  fails loudly at any point.
- The roles/onboarding work should own creation properly -- an on-signup or
  on-first-shop-visit ensure, server-side if the roles table lands with it --
  and THE STARTER BOX needs it doubly, because a starter grant on day one has
  to have somewhere to land before the new collector has ever seen Season Mode.
- While in there: there is no rename affordance anywhere. The team name is
  captured once, in that prompt, and never editable again. The second tester's
  row was seeded as "Tim's Club" by hand and he cannot change it in the app.
  A rename belongs with the same onboarding pass (franchise settings, or the
  account panel), and it is a one-column UPDATE -- no schema change.

## 18. Free daily receipts are localStorage-only (no `pack_grants` row)

Raised 2026-07-31 on `fix/pack-history-refresh`, after driving the free 1-card
variant end to end on both surfaces. The refresh fix makes the just-claimed free
pack appear immediately; it does not make it durable, because there is nothing
server-side to re-read.

- Pack History has two sources and the free path only writes one of them.
  `ledgerShelf()` in `js/depot-pack-history.js` reads `pack_grants`;
  `loadHistory()` reads this browser's `localStorage['depot.packHistory']`;
  `mergeShelf()` unions them on a `tier:seed` key, ledger first, keeping local
  receipts the ledger does not know rather than dropping them. The PAID path
  writes both halves -- `js/depot-shop.js:345` inserts the `pack_grants` row
  inside `redeemPending`. The FREE path writes only the local half.
- `depot_claim_free_pack` (`db/proposals/free_daily_pack_fix.sql`) makes exactly
  two server-side writes: the `cards` insert (`source='pack'`, `pack_seed` left
  NULL) and a 0-amount `wallet_transactions` cooldown stamp (`reason
  'free_pack'`, meta `{tier, card_id, player}`). It never touches `pack_grants`.
  So the only durable trace of a free pull is a rate-limiting stamp, and the
  shelf entry representing it is written client-side by `recordPackHistory()`
  with the granted `card_id` standing in for a seed.
- Measured live 2026-07-31 on Nick's account: FIVE free claims exist server-side
  (`wallet_transactions` where `reason='free_pack'` -- 12, 16, 25, 29, 30 Jul)
  against EIGHT `pack_grants` rows, all of them paid. This browser's
  `depot.packHistory` holds ONE free receipt (Kevin Bass, 29 Jul). Four of the
  five free pulls are therefore already invisible in Pack History on this
  machine; on a second device, a different browser, or after a cache clear, all
  five are, along with their CARDS expansion. The cards themselves are safe --
  they are in the binder and always were -- they just cannot be traced to a pull.

Scoping the fix, cheapest first:

1. **Interim, client-only, no SQL.** Have `ledgerShelf()` also read
   `wallet_transactions` where `reason='free_pack'` and synthesize one shelf
   entry per row: `tier:'free'`, `seed: meta.card_id`, `count: 1`,
   `at: created_at`. The rows are already there, already owner-scoped by RLS,
   and already carry the card id, and `mergeShelf`'s `tier:seed` key is exactly
   what a local free receipt already uses, so existing local rows dedupe against
   the synthesized ones instead of doubling. That restores cross-device
   visibility and lets CARDS resolve from the server. It is a workaround: it
   mines the cooldown stamp for a receipt the stamp never promised to be, and it
   would have to be re-pointed the day the RPC starts recording grants properly.
2. **Durable, server-side, SQL and a sign-off.** Have the RPC record the grant
   the way the paid path does -- a `pack_grants` row (`card_count 1`, the tier it
   already derives, a seed) plus `cards.pack_seed` stamped to match, inside the
   same transaction as the card insert. Then both variants have ONE source of
   truth, the free path inherits the double-tap protection the paid path gets
   from the unique key on `(collection_id, pack_seed)`, and sections 1 and 13a.2
   close with it.
   One blocker found while scoping, so it is not discovered late: **`pack_grants.pack_seed` is `bigint`**
   (probed 2026-07-31: filtering it by a non-numeric value returns
   `22P02 invalid input syntax for type bigint`, and the live rows are integers
   such as `2974096866`). The free path has a card UUID, not an integer, so the
   card id CANNOT simply be written into that column. The RPC would need to roll
   and store a real integer seed for the free pull, or the table needs a
   nullable card reference alongside the seed and the unique key needs rethinking.
   That is schema/RPC work under AGENTS.md section 2 -- its own branch, its own
   review, its own migration, not a drive-by on a UI fix.

Related: section 1 (free cards carry no provenance marker at all), section 13a.2
(the same missing grant row, seen from the provenance side), section 13b (REPLAY
re-rolls precisely because the record is this thin).

## 19. Dead render code the redesign walked past, and the two placeholders it could not finish

Found while wiring chapters 03/04 to the shared parts (feat/rd-binder-parts).
None of it is broken, so none of it was fixed in a phase branch: a removal has
no visual proof attached to it and does not belong inside a reskin diff. This
is the removal PR Nick owes, listed so it is one branch instead of four.

**19a. `dcBinderHTML()` in index.html is dead, and it is 11 inline styles long.**
It builds a whole second binder -- search field, five filter pills, panel,
pager, grid -- with every value written into `style=""`, and nothing calls it.
It was the extraction scaffold from the first Phase 2 pass. It still carries
`dcFILTERS`, which is where the Stars pill's gold lived as dead data for a
month before 03b was read closely enough to notice (see the commit that landed
visual diff #2). While it exists, a future session can reasonably believe it is
the binder. Delete `dcBinderHTML` and `dcFILTERS` together.

**19b. `preview-phase2.html` has a third tile copy.** The tile is now described
once, in `css/depot-redesign-binder.css`, as `.rd-tile--binder`. The Phase-1
preview (`preview.html`) uses the shared sheet. `preview-phase2.html` does not:
it carries its own sample-data transcription of the same tile, so it will drift
silently the first time the real tile changes and then be cited as the target.
Either repoint it at the shared sheet or delete it -- it was a gate for a
preview that has already been signed off.

**19c. The `#eraTabs` inline writer.** `index.html` still carries CSS written
for the pre-redesign era tabs -- `#eraTabs`, `#eraTabs .era-tab`,
`#eraTabs .era-tab small`, and a mobile rule that forces `width:auto !important`
and `flex:0 0 auto !important` onto `#eraTabs .dc-fpill, #eraTabs .era-tab`.
Neither `.era-tab` nor `.dc-fpill` is emitted any more; `renderEraTabs` writes
`.rd-pill` into a `.rd-pillrow`. The rules are unreachable, and the two
`!important`s would out-rank the shared parts if anything ever put those class
names back.

**19d. The designed no-scan placeholder is specified but not reachable.**
Override rule 4 says a card with no art shows a designed band -- year, name,
"no scan" -- and 03b/`mobile-390/binder.png` both draw it. It is not shipped,
and the CSS for it was deliberately deleted rather than left dead, because a
tile cannot know a card has no art at render time. Resolution is
personal scan -> library art -> placeholder, and the library step is async in
`js/depot-library-art.js`, which today has a hit path (`applyBg` + `has-art`)
and a `console.debug('library-miss')` but **no miss callback into the tile**.
Shipping the placeholder needs that callback first. That is a render-path
change, not a skin change, which is why it is here and not in a phase branch.

**19e. 4-per-page at 390.** `exports/mobile-390/binder.png` is captioned
"2-across at 390 - 4 per page". The 2-across landed (CSS). The 4-per-page did
not: `PER_PAGE` is a module constant read by `turnPage`, `renderBinder` and the
page label, so making it viewport-aware changes pagination arithmetic and the
label, and it wants a resize listener. Small, but it is behaviour, not layout.

**19d. The add-card rules stranded in `style#responsive-fixes`.** Chapter 05's
dress (`css/depot-redesign-addcard.css`) now owns the modal at every width,
including 390, so the seven add-card rules still sitting in index.html's
`style#responsive-fixes` block - `.form-scrim`, `.form-card`, `.form-body`,
`.form-left, .form-right`, `.rolo-brand select, .rolo-brand input#rolo-brand-custom`,
`.form-foot`, `.form-foot .btn-ghost, .form-foot .btn-solid` - are dead weight.
They were left in place deliberately: they are inert (verified live at 390 -
every contested property resolves to the dress, `.form-left` computes
`display:contents`, `.form-foot` computes the sticky seam), and `#responsive-fixes`
also holds non-modal rules, so removing a sub-block belongs in the same cleanup
branch as 19a-19c rather than inside a reskin diff. They are a landmine only if
someone edits them believing they still paint.

**19e. "n cards missing images - show anyway" is drawn but not built.** Chapter
05's spec text and 05a both show a pill under the catalog list that hides no-art
rows until the collector asks for them; the phrase appears nowhere in
`index.html` or `js/`. Today every row is listed and the no-art ones are dimmed
with a NO IMAGE badge. The part is already dressed as `.rolo-showall` in
`css/depot-redesign-addcard.css`, so this is a JS-only item: filter the rows,
add the toggle, and it arrives wearing the right clothes. A dress branch does
not invent behaviour, which is why it is here and not in PR.

### 19f. The pre-`pks` shop tile and the pre-`prip` ceremony, both dead

The chapter 06/07 dissolve deleted three sheets. Two of them carried whole
layers that nothing has rendered since the shared `DepotShopView` landed:

- `css/depot-shop-view.css`: `.dsv-tile`, `.dsv-back`, `.dsv-wrap`, `.dsv-ribbon`,
  `.dsv-info`, `.dsv-name`, `.dsv-price`, `.dsv-odds`, `.dsv-foot`, `.dsv-btn`,
  `.dsv-gap`, `.dsv-cd` -- the tile the shop drew before `.pks-tier`; and
  `.dpc-modal`, `.dpc-panel`, `.dpc-held`, `.dpc-packback`, `.dpc-pblabel`,
  `.dpc-head`, `.dpc-sub`, `.dpc-ripbtn`, `.dpc-stagewrap`, `.dpc-progress`,
  `.dpc-tapcue`, `.dpc-cardslot`, `.dpc-collect`, `.dpc-replaytag` -- the
  ceremony `.prip` replaced.
- `css/shop.css` (all 66 lines): `.pack`, `.pack .wrapart/.pname/.pdesc/.odds/
  .coin/.buy/.gap`, `.pack.free`, `.free-ribbon`, `.shop-head`, `.shop-bal`,
  `.reveal-wrap`, `.reveal-card`, `.rc-back/.rc-front`, `.reveal-cap`,
  `.band-tag`. `game/shop.html` stopped rendering that markup when it moved to
  the shared view; only `.shop-grid` / `.shop-status` still had elements, and
  both are now described by the redesign sheet.

Nothing was carried into `css/depot-redesign-shop.css`. If a future surface
wants a compact tile again, it gets a designed one, not this.

### 19g. The in-binder PACK SHOP tab has no door any more

`js/depot-binder-shop.js` still wraps `renderBinder` and mounts the shared view
when `curEra === "packshop"` -- it works, and this branch verified the dressed
surface renders there. But the Phase-2 binder dress replaced the old
`.era-tab` rail with `.rd-pill` era buttons (All / Vintage / Junk Wax / Modern /
Stars), and none of them selects `packshop`. The only way in today is
`selectEra('packshop')` from the console; the header PACK SHOP pill navigates to
`game/shop.html` instead.

So the second surface is real, mounted and now dressed, but unreachable by
click. Either the era rail gets its pill back or the tab is retired and the
standing page becomes the only shop. That is a product call, not a dress call.
The `.rd-shop-tab` hook in the dress keeps the old tab's gold spine working the
moment a pill returns.

### 19h. `js/depot-shop-entry.js` is loaded by nobody

Noted while inventorying chapter 06: the file exists (67 lines) and
`game/shop.html` explains in a comment that its header entry link "was an
unstyled self-link here and is unwired". No shell includes it. It is dead
weight, not a dress problem -- delete it in the 19a-19c cleanup branch.

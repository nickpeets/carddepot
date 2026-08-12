# PULL_POLICY.md — what a pack may produce, and how the server will know

Status: **policy, not implementation.** Nothing here is built by this document
and nothing here is a migration. It exists so the V2 server-side roll has a spec
to be written against, and it answers the three decisions
`docs/GRANT_AUTHORITY.md` §6 left marked NICK'S CALL.

Written 2026-08-12 from the deployed build. Every claim about current behaviour
was read out of the live site, not out of the repo alone: SHA-256 of
`js/depot-shop.js`, `js/depot-pack-engine.js`, `js/depot-library-index.js`,
`js/depot-shop-view.js` and `game/shop.html` on thedepot.cards were compared
against `main` and all five are byte-identical. Where a number was measured
against production it says so; where it is read from source it says that
instead.

**The governing rule of this document: shipped copy is the spec.** The pack
tiles already promise a user specific things. The server must be made to honour
what the product says, not the other way round. Where a design doc and the
shipped copy disagree, the doc is wrong — §2.4 records the one place that
happens.

---

## 1. Eligibility — the whole library, minus anything without art

### The rule

**If it cannot be shown, it cannot be pulled.** This is not a new rule invented
here. It is the design constitution's Rule 1 — no image, no entry — applied to
the roll, and it is ~~already the shipped behaviour~~ **implemented in the
shipped client but NOT IN FORCE IN PRODUCTION as of 2026-08-12. See 1.1.**

`js/depot-shop.js` carries it under the heading *"Task D — ART GATE ON THE ROLL
POOL"*, with the comment *"Nick's rule: any card grabbable via pack shop must
have an image."* The filter runs once, on the catalog, **before** `rollPack`,
`rollFree` or `redeem` ever see it, so every path inherits it for free.

There is no curated list. There never should be. A curated list is a second
thing to maintain that goes stale the day the library grows; the art index
already grows with the library by construction.

### 1.1 The gate is off right now, and it turned itself off

Corrected 2026-08-12, a few hours after the paragraph above was first written.
The sentence said "already the shipped behaviour". That was true of the code and
false of the running system, and those are different claims.

Observed on `game/shop.html`, signed in, live console:

```
[depot][library-index] load failed: Error -- catalog ships unfiltered
[depot] shop: no art index; rolling the UNFILTERED catalog (155844 rows)
```

`DepotLibraryIndex.load()` resolved `null`, so the shop rolled the whole
**155,844-row catalog** instead of the **84,452-row** art-backed pool. Cards with
no art are pullable today.

**This is by design, and the design is defensible.** The module says so in its
own header: *"FAILS OPEN. If the index cannot be read we resolve null and the
caller ships the unfiltered catalog: a missing image is a blemish, a dead shop is
an outage."* That is a reasonable trade for a client. The problem is not the
fallback; the problem is that nothing above the console knows it happened.

Note also that the error is unreadable. The log line contains the bare string
`Error` with no message attached, so there is nothing to diagnose from even for
somebody who *is* watching the console.

**Not diagnosed, and deliberately not chased from a browser.** The failure did
not reproduce by hand: the head count returns 89,898, page 0 returns 1,000 rows,
the last page returns its trailing 898. Paging the whole index manually at **4
lanes** completed all 90 pages with **zero errors** in under 20 seconds. The
shipped module uses **8 lanes**. One failure at 8 and one success at 4 is a
correlation and nothing more — it is where to start, not an answer, and it wants
a repro loop rather than a browser session.

**Third instance of the unread-detector pattern, and a category above the other
two.** `docs/GRANT_AUTHORITY.md` section 10 names the pattern against two
examples — `RECORD DRIFT` and the trigger's `raise warning`. Both of those report
**drift**. This one reports a **safety rule switching itself off**, into the same
void. A detector nobody reads is bad; a *guard* that disables itself and reports
it to nobody is worse, and the distinction belongs in the pattern.

### 1.2 Open question for the server-side roll: fail open, or fail closed?

**This is a product decision and it is Nick's, not the build agent's.** It is
recorded here because the server roll cannot be written without answering it.

Client-side, fail-open is right: a missing image is a blemish, a dead shop is an
outage, and the worst case is one ugly card.

Server-side the calculus changes. The server is the thing that is supposed to be
authoritative — that is the entire point of moving the roll — and a server that
quietly grants art-less cards when its index is unavailable is not authoritative,
it is just a slower client. The alternative is to **fail closed**: refuse the
pull, surface a real error to the player, and let the shop be briefly broken
rather than briefly wrong.

The recommendation from here is fail closed, with the caveat that it makes the
art index a hard dependency of the money path, which is exactly the kind of
coupling the fail-open comment was written to avoid. Whoever decides should
decide it knowingly.


### Where the eligible set lives

`public.card_library`, filtered:

```sql
select catalog_key
  from public.card_library
 where side = 'front'
   and status = 'active';
```

`side = 'front'` because a card with only a back scan cannot paint a reveal.
`status = 'active'` because a withdrawn scan should stop being pullable the
moment it is withdrawn.

Measured against production 2026-08-12:

| | rows |
|---|---:|
| `card_library`, all | 179,767 |
| `card_library` where `side = 'front'` | 89,898 |
| …and `status = 'active'` | 89,898 |

So `status` is currently a no-op on fronts. Keep the predicate anyway — it is
the withdrawal mechanism, and the day it stops being a no-op is the day it
matters.

Columns are `catalog_key, side, object_path, is_canonical, status, contributor,
created_at`. A key looks like `1980|topps|topps|1` — that is
`year|brand|set|number`.

### The correction GRANT_AUTHORITY §4 needs

§4 says `card_library` is *"the authority for what a pull produces."* That is
half right and the missing half blocks the build.

**`card_library` is the ART index, not the card universe.** It tells you which
keys are showable. It does not carry a player name, a team, or anything the
prestige engine scores on. The universe is still the static
`data/cards-YYYY.json` files, with the year span read from `data/index.json`
(1980–2026) and never hardcoded.

So the eligible set is an **intersection** of a static file set and a Postgres
table, and **a server-side roll cannot be written against `card_library`
alone — there are no names in it.**

`card_library_manifest` does not close the gap. It is 180,202 rows of
`id, source_zip, source_file, catalog_key, side, object_path, status, reason,
created_at` — an ingest log for the art import pipeline, not a card universe.
Read from the dashboard 2026-08-12.

**Therefore, the blocking dependency for the server-side roll is a card
universe in Postgres that does not exist yet.** Whoever builds §4 has to land
that first: the catalog rows, keyed on `catalog_key`, carrying at minimum
`year, brand, set, number, player, team` so prestige can be computed
server-side. Everything else in this document is cheap; that is not, and it
should be scoped before anyone commits to a date.

### One more thing the roll must start doing

`public.cards.catalog_key` exists and is **NULL on granted cards.** Measured:
the free pull performed for this document landed with `catalog_key = null`. So
a card in someone's binder cannot currently be joined back to the art index it
was drawn from. The server-side roll must stamp it. It is one column and it
turns provenance from a text-parsing exercise into a join.

---

## 2. Odds

### 2.1 The tiles already state odds, so the tiles are the spec

Read live 2026-08-12, verbatim:

> Five cards a pack. The last one is always the hit slot.
>
> **FREE · 1 CARD · ON THE HOUSE** — "One card, on the house. Comes back every 24 hours."
>
> **BRONZE · 5 CARDS** — "The everyday rip. Silver floor on the hit slot. Gold hit about 1 in 17."
>
> **SILVER · 5 CARDS** — "Better paper. Silver floor on the hit slot. Gold hit about 1 in 6."
>
> **GOLD · 5 CARDS** — "Gold floor on the hit slot. Gold hit in about 97% of packs."
>
> **DIAMOND · ECONOMY PASS** — "Designed, held back until the economy work lands." *(locked)*
>
> Odds are per pack. Cards land in your binder the moment you collect. The free
> pack comes back 24 hours after you claim it. Free pack odds: ~90% plain ·
> ~8% bronze · ~1.5% silver · ~0.5% gold.

Prices, from `depot-pack-engine.js` `TIERS` and confirmed against the buttons at
a zero balance: **bronze 150, silver 400, gold 900, free 0.**

### 2.2 Those tier numbers are computed, not written — so this document pins the model

This is the important structural point and it is why there is no odds table
here for the paid tiers.

`depot-shop-view.js` `oddsHtml()` composes each tier line from
`DepotPackEngine.estimateOdds(tier, catalog, DepotPrestige, 8000)`. "about 1 in
17" is literally `Math.round(100 / pct)`. The numbers on those tiles move when
the catalog moves.

**Writing fixed percentages into this document would create a second source of
truth that goes stale silently the first time a catalog year lands.** That is
the failure mode this repo keeps rediscovering. So:

**THE MODEL IS THE SPEC.** The server-side roll must reproduce it, and the
published odds must keep being generated from it so the two cannot disagree.

The model, in full:

1. **Pool.** The eligible set from §1.
2. **Weighted draw** over the whole pool for cards 1–4, weights from
   `TIERS[tier]`:

   | tier | price | cards | vintage | junkwax | modern | starBias | hitFloorBand | hitStarBias |
   |---|---:|:-:|---:|---:|---:|---:|---|---:|
   | bronze | 150 | 5 | 0.6 | 3.0 | 1.0 | 0.5 | silver | 1.0 |
   | silver | 400 | 5 | 1.2 | 1.0 | 1.0 | 1.0 | silver | 1.6 |
   | gold | 900 | 5 | 2.0 | 0.7 | 1.0 | 1.5 | gold | 2.4 |
   | free | 0 | 1 | 0.5 | 3.0 | 1.0 | 0.2 | *(band-first, see 2.3)* | 1.0 |

3. **Bands** come from `DepotPrestige.compute()`: **60+ gold, 30+ silver,
   10+ bronze, else plain.** Era points: ≤1985 vintage 20, 1986–1993 junk wax 0,
   1994+ modern 6, plus the star/rookie components.
4. **The hit slot.** The 5th card re-rolls until it meets the tier's
   `hitFloorBand` — a **bounded 40-try loop with a best-so-far fallback**.
5. **Determinism.** `rollPack` is deterministic in `(seed, catalog, tier)`.
   Narrowing the catalog changes what a historical seed reproduces; the grant
   record, not the seed, is the record of what was actually granted.

### 2.3 The free pack is different in kind, and it is the one tunable table

The free pack does **not** use the weighted draw. It is **band-first**: pick the
band from a literal table, then pick a card inside that band. `FREE_BAND_ODDS`
in `depot-pack-engine.js`:

| band | shipped p | proposed rebalance |
|---|---:|---:|
| plain (common) | **0.90** | 0.70 |
| bronze | **0.08** | 0.22 |
| silver | **0.015** | 0.07 |
| gold | **0.005** | 0.01 |

The left column is what is live today. The right column is a **proposed
rebalance, not the spec** — recorded here so the diff is visible and the change
is Nick's to take or leave. It makes the daily rip roughly four times more
likely to produce something above common.

The shape is already correct and worth protecting: **the free pack can produce
anything, just rarely.** A daily rip with no ceiling is why someone comes back.
Note that `estimateOdds('free')` returns this table directly with `exact: true`
— the free odds on the tile are the table, not a simulation.

### 2.4 A dated snapshot, and the doc conflict it exposes

Measured output, read off the live tiles 2026-08-12. **This is output, not
definition** — it is here so a future reader can tell whether the model has
drifted, and it is expected to change:

| tier | gold-band hit, as published |
|---|---|
| bronze | ~1 in 17 |
| silver | ~1 in 6 |
| gold | ~97% of packs |

Monte Carlo at 8,000 samples, so the last digit is noise.

**The conflict.** `ECONOMY_DESIGN.md` §7.2 says the hit slot is *"guaranteed"* —
"guaranteed ≥1 SILVER-band", "guaranteed a GOLD-band". The shipped copy never
uses that word, and `depot-shop-view.js` carries a deliberate comment saying
why: the re-roll is bounded at 40 tries with a best-so-far fallback, and
`rollPack` returns `floorMet` **precisely because it can be false.**

The shipped copy is the honest one. **§7.2 should be corrected, not the copy.**
"Floor on the hit slot" is what the code does; "guaranteed" is what someone
hoped it did.

---

## 3. The starter box is separate, fixed, and not governed by §2

The starter box is **not** subject to the odds table. Its composition is fixed
by position, from `db/proposals/MIGRATION_starter_box.sql`:

- **25 cards** — 9 fielders, 5 SP, 5 RP, 5 bench
- **one guaranteed bronze-or-better**
- **once per account, forever**, enforced as `starter_box_grants` PRIMARY KEY on
  `owner_id` — a constraint, never a check
- grant row inserted **first**; a 23505 means already claimed and inserts **no
  cards**

The art gate from §1 still applies to it. Everything else about §2 does not.

**And it has never run.** `depot_claim_starter_box` is deployed. The migration
documents a `window.DepotStarterBox.rollPayload()` call site. **That module does
not exist** — no `.js` or `.html` file in the repo references it, and a
brand-new account created 2026-08-12 has `starter_box_grants` = 0 rows and an
empty binder. See `docs/FLOW_A_OBSERVED.md`.

**It is not alone, and that is the finding.** Enumerating every `.rpc(` call site
across every `.js` and `.html` in the repo returns exactly eight, all string
literals: `depot_apply_payout` (×2), `depot_purchase_pack`,
`depot_claim_free_pack`, `depot_is_admin`, `share_collection`,
`unshare_collection`, `get_shared_collection`, `get_shared_cards`. Three deployed
functions that the new-player path depends on are absent from that list:

| function | what it does | callers |
|---|---|---:|
| `depot_ensure_onboarding` | creates the collection and franchise if the signup trigger's swallowed exception ate them | **0** |
| `depot_claim_starter_box` | the 25-card welcome | **0** |
| `depot_rename_franchise` | the only way to change the hardcoded `'MY CLUB'` | **0** |

All three are `SECURITY DEFINER`, all three are carefully built — advisory locks,
23505 no-ops, error messages that name their own remedy — and none of them is
connected to anything. The hard half of onboarding was built three times and
wired up zero times. See `docs/GRANT_AUTHORITY.md` section 10 for the
consequence: with no caller for `depot_ensure_onboarding`, a half-created account
is permanently broken rather than briefly broken.

That is not this document's problem to fix, but no spec for the pull path is
honest without saying that the largest single grant in the product is
unreachable.

---

## 4. Provenance — nothing in anyone's binder changes

### The commitment

**No re-roll. No badge. No visible difference on any existing card.** A card
someone already owns stays exactly what it is. Whatever the server starts doing,
it starts doing it to new pulls only.

### Does that need a migration? Measured answer: no, but the premise needs fixing

The proposed reasoning was: once the server rolls, every pull writes a roll
record, so cards without one are pre-V2 by definition — the absence is the flag.
The shape is right. The current state does not support it yet, and this was
measured rather than assumed.

A real free pull was performed against a brand-new account on 2026-08-12. What
it wrote:

| table | result |
|---|---|
| `cards` | 1 row. `source = 'pack'`, **`pack_seed` = NULL**, **`catalog_key` = NULL**, `notes` contains only a `DEPOT_META` position comment — no seed |
| `pack_grants` | **0 rows.** The free path writes no roll record at all |
| `wallet_transactions` | 1 row, `amount = 0`, `reason = 'free_pack'` |
| `franchises.balance` | unchanged, 0 |

So today:

- **`source` does not distinguish free from paid.** A free pull is `source =
  'pack'`. `'starter'` exists in the migration but has never been written
  because §3. In practice the column has two live values, `'scan'` (the default,
  for scanned cards) and `'pack'`.
- **`cards.pack_seed` is not populated by any path that has ever executed.** Paid
  packs stamp the seed into `notes` as the text `packseed:<n>`
  (`depot-shop.js` `cardRow()`); the free path stamps nothing. Meanwhile
  `depot-pack-history.js` queries `.eq('pack_seed', s)` and its own comment
  claims "paid packs stamp cards.pack_seed at grant time."
  **Comment and code disagree, and the code is what runs.**
  The wording matters, though: **`depot_claim_starter_box` does stamp it
  correctly.** Its deployed body inserts
  `cards (..., source, notes, pack_seed)` with `source = 'starter'` and
  `pack_seed = p_seed`. It is the only grant path in the schema that gets this
  right, and it is the one that has never run — see §3. So the column is not
  vestigial and the convention is not undecided; the correct implementation
  already exists and simply has no caller.
- **The roll record already exists as a table.** `public.pack_grants` —
  `owner_id, collection_id, pack_seed, tier, card_count`, unique on
  `(collection_id, pack_seed)`, written by the client grant-row-first with 23505
  treated as a clean no-op. This is the same discipline `match_settlements` uses
  and it is already right. V2 moves its **writer** from the client to the
  server; it does not need a new table.

**The conclusion, stated carefully.** No schema change is needed for
provenance — `pack_grants` is the record and `cards.catalog_key` already exists
to point at the art. But *"no roll record means pre-V2"* is only true **after**
two things are fixed, and they are the cheapest items in this document:

1. **The free path must write a `pack_grants` row too.** Today it does not, so
   absence currently means "pre-V2 **or** a free pull", which is not a flag.
2. **The roll must stamp `cards.pack_seed` and `cards.catalog_key`.** Both
   columns exist and both are NULL. Filling them costs nothing at write time and
   removes the need to parse `notes` forever.

Do those two and the absence of a `pack_grants` row becomes a clean,
zero-migration marker for every card granted before the cutover. Skip them and
the flag lies.

---

## 5. What this unblocks

This document answers `docs/GRANT_AUTHORITY.md` §6 — the three decisions marked
NICK'S CALL — and therefore unblocks §4, the hard half where the server owns the
roll. §6's marker should be struck and pointed here.

The one thing worth saying twice, because it is easy to plan around and expensive
to discover late: **the roll record specified in §4 above and the "honest pack
history" feature are the same record.** `pack_grants` is what a real pack history
reads — as opposed to `localStorage`, which is what it reads today, and which is
why a brand-new account can be shown someone else's packs
(`docs/FLOW_A_OBSERVED.md`). One piece of work, two features. Build it once.

The build order that falls out:

1. **The card universe in Postgres** (§1). Everything else waits on it.
2. **The server-side roll** reproducing the model in §2, gated by §1's predicate.
3. **The roll record**: free path writes `pack_grants` too; stamp `pack_seed`
   and `catalog_key` (§4).
4. **Pack history reads `pack_grants`** instead of `localStorage`. Falls out of 3.
5. **A starter box client** (§3), or a decision to drop it.

---

## 6. Known gaps in this document

- **Nothing here was implemented or tested as a server-side roll.** The model is
  described from the client that runs today. Whether Postgres can reproduce
  `DepotPrestige` faithfully — the star tiers come from
  `data/player_tiers.json`, a static file — is unexamined and is the second
  unscoped dependency after the card universe.
- **The measured snapshot in §2.4 is read off the rendered tiles**, not
  recomputed independently. It reflects the catalog on 2026-08-12.
- **One data-quality defect surfaced and is not this document's to fix.** The
  card granted in §4's test rendered with the player name
  `Yonathan Daza SP, VARVAR: Running` — parsing debris from the checklist
  pipeline, visible to the user on the card face. If the pull pool is the
  library, the library's text quality becomes user-facing copy.

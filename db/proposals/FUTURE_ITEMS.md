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

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

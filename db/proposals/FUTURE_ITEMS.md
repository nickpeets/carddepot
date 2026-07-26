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

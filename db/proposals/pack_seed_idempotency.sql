-- =====================================================================
-- Pack-seed idempotency: one grant per (collection, pack seed)
-- =====================================================================
-- WHY: The client did a read-then-insert idempotency check ("are there
-- already N cards for this seed?"). Two concurrent auth events both read
-- zero and both inserted -> a double-grant (Nick's bronze pack, seed
-- 1335568119, landed twice). A read-then-write check can NEVER dedupe a
-- race. Only the database can, via a unique constraint that rejects the
-- second insert atomically.
--
-- WHAT THIS DOES:
--   1. Adds a normalized pack_seed bigint column to public.cards.
--   2. Backfills it from the existing "packseed:<n>" tag in notes.
--   3. Adds a PARTIAL unique index on (collection_id, pack_seed) that only
--      applies where pack_seed IS NOT NULL -- so ordinary (non-pack) cards
--      and legacy pack cards without a seed tag are untouched.
--
-- SAFETY:
--   - Run this in a transaction. If the backfill would create a duplicate
--     (i.e. a double-grant still exists), the CREATE UNIQUE INDEX will FAIL
--     LOUDLY and roll back -- clean the duplicates first, then re-run.
--   - Nick's collection currently has exactly one row per seed card
--     (duplicates already deleted), so this should apply cleanly.
--
-- RUN AS: Nick, in the Supabase SQL editor. DO NOT let the agent run this.
-- =====================================================================

BEGIN;

-- 1. Normalized column (nullable; only pack cards get a value).
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS pack_seed bigint;

-- 2. Backfill from the notes tag "packseed:<digits>".
--    substring() pulls the first run of digits after the tag.
UPDATE public.cards
   SET pack_seed = (substring(notes from 'packseed:([0-9]+)'))::bigint
 WHERE notes ~ 'packseed:[0-9]+'
   AND pack_seed IS NULL;

-- 3. Partial unique index: at most one row per (collection, seed).
--    WHERE pack_seed IS NOT NULL keeps it scoped to real pack grants.
CREATE UNIQUE INDEX IF NOT EXISTS cards_collection_pack_seed_uidx
  ON public.cards (collection_id, pack_seed)
  WHERE pack_seed IS NOT NULL;

COMMIT;

-- =====================================================================
-- OPTIONAL VERIFICATION (read-only) after commit:
--   SELECT collection_id, pack_seed, count(*)
--     FROM public.cards
--    WHERE pack_seed IS NOT NULL
--    GROUP BY 1,2 HAVING count(*) > 1;   -- expect zero rows
-- =====================================================================

-- =====================================================================
-- Pack-grant idempotency: ONE grant per (collection, pack seed)
-- =====================================================================
-- WHY (v2 redesign): The idempotency UNIT is the PACK, not the card row.
-- A 5-card pack legitimately produces five cards that all share the same
-- seed, so a unique index on cards(collection_id, pack_seed) can NEVER
-- coexist with multi-card packs -- it rejects cards 2..5 of a valid pack.
-- (Nick's table proved this: 5 correct rows, one per player, all seed
-- 1335568119.)
--
-- The correct gate is a separate LEDGER table with one row PER PACK:
--   public.pack_grants, unique on (collection_id, pack_seed).
-- Redemption inserts the grant row FIRST. A 23505 there means "pack
-- already granted" -> clean no-op, insert no cards. Otherwise the grant
-- row lands and the 5 cards follow. Two concurrent redemptions collide
-- on the grant row BEFORE any card is written -> atomic at the pack level.
--
-- The cards table keeps its pack_seed column for provenance/joins, but
-- carries NO unique constraint on it.
--
-- SAFETY:
--   - Idempotent: uses IF NOT EXISTS / IF EXISTS / ON CONFLICT throughout.
--   - Nothing is deleted. Nick's 5 cards stay exactly as they are.
--   - Runs in a transaction.
--
-- RUN AS: Nick, in the Supabase SQL editor. DO NOT let the agent run this.
-- =====================================================================

BEGIN;

-- 0. Undo the flawed v1 index if it ever got created (it can't have, since
--    it fails on any real pack -- but IF EXISTS makes this a safe no-op).
DROP INDEX IF EXISTS public.cards_collection_pack_seed_uidx;

-- 1. Cards keep a normalized pack_seed for provenance (NO unique on it).
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS pack_seed bigint;

--    Backfill from the notes tag "packseed:<digits>".
UPDATE public.cards
   SET pack_seed = (substring(notes from 'packseed:([0-9]+)'))::bigint
 WHERE notes ~ 'packseed:[0-9]+'
   AND pack_seed IS NULL;

-- 2. The idempotency LEDGER: one row per granted pack.
CREATE TABLE IF NOT EXISTS public.pack_grants (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id uuid        NOT NULL,
  pack_seed     bigint      NOT NULL,
  tier          text,
  card_count    integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 3. THE GATE: at most one grant per (collection, seed). A concurrent
--    second insert hits this and fails with Postgres 23505.
CREATE UNIQUE INDEX IF NOT EXISTS pack_grants_collection_seed_uidx
  ON public.pack_grants (collection_id, pack_seed);

-- 4. RLS: an owner sees and writes only their own grant rows.
ALTER TABLE public.pack_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pack_grants_select_own ON public.pack_grants;
CREATE POLICY pack_grants_select_own ON public.pack_grants
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS pack_grants_insert_own ON public.pack_grants;
CREATE POLICY pack_grants_insert_own ON public.pack_grants
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- 5. Backfill ONE grant row for Nick's already-redeemed bronze pack
--    (seed 1335568119) from his existing cards. ON CONFLICT DO NOTHING
--    keeps this safe to re-run.
INSERT INTO public.pack_grants (owner_id, collection_id, pack_seed, tier, card_count)
SELECT c.owner_id,
       c.collection_id,
       1335568119::bigint     AS pack_seed,
       'bronze'               AS tier,
       count(*)::int          AS card_count
  FROM public.cards c
 WHERE c.notes ~ 'packseed:1335568119'
 GROUP BY c.owner_id, c.collection_id
ON CONFLICT (collection_id, pack_seed) DO NOTHING;

COMMIT;

-- =====================================================================
-- OPTIONAL VERIFICATION (read-only) after commit:
--   -- exactly one grant row for the bronze pack, card_count = 5:
--   SELECT collection_id, pack_seed, tier, card_count
--     FROM public.pack_grants WHERE pack_seed = 1335568119;
--   -- the 5 cards are untouched:
--   SELECT count(*) FROM public.cards WHERE notes ~ 'packseed:1335568119';
-- =====================================================================

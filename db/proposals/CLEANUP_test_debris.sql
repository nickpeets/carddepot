-- =============================================================================
-- Card Depot -- TEST-DEBRIS CLEANUP.  DESTRUCTIVE.  PROPOSAL -- NOT EXECUTED.
--
-- AGENTS.md 2: this is a data-loss change -> it ships only with Nick's explicit
-- sign-off, run by Nick in the Supabase SQL editor, AFTER
-- db/proposals/INVENTORY_test_debris.sql has been run and read.
--
-- SCOPE -- deliberately narrow. This file deletes ONLY rows no surface can
-- reach and no ledger references:
--   Section 1: dead challenge links  -- status 'pending', opponent NULL, >7 days
--   Section 2: orphaned UNPLAYED season self-matches (attach-0-rows debris)
--   Section 3: orphaned PLAYED season self-matches -- COMMENTED OUT; Nick's call
-- It NEVER touches: seasons, season_games, franchises, any two-party match,
-- any match referenced by season_games, wallet_transactions, or
-- match_settlements. It does NOT adjust any W-L counter -- record repair is a
-- separate decision that follows from inventory section E, not part of this.
--
-- Idempotent by construction: every DELETE re-derives its candidate set; a
-- second run deletes 0 rows. Each section SELECTs its count first (RUNBOOK
-- fail-loud: know what you deleted, not "some rows").
--
-- 2026-08-09 hardening, after inventory G2 came back NON-ZERO in production:
-- 6 orphaned PLAYED self-matches carry match_settlements rows (the self-match
-- settlement incident - see REVERSAL_self_match_settlements.sql). Those 6 were
-- already out of Sections 1-2's reach (S1 wants status 'pending', S2 wants
-- result null; settled matches are 'played' with a result) and the FK's
-- on delete RESTRICT is the hard backstop - but the settlement guard is now
-- EXPLICIT in Sections 1-2 too, so no future edit can widen a candidate set
-- onto a settled match without deleting a guard line on purpose. This file
-- therefore assumes public.match_settlements EXISTS (true in production since
-- 2026-08-02); on a DB without it these sections error loudly instead of
-- deleting - acceptable, per fail-loud.
-- =============================================================================

begin;

-- ---------- Section 1: dead challenge links (>7 days, never accepted) -------
with doomed as (
  select m.id from public.matches m
   where m.status = 'pending'
     and m.opponent_id is null
     and m.created_at < now() - interval '7 days'
     and not exists (select 1 from public.season_games       sg where sg.match_id = m.id)
     and not exists (select 1 from public.wallet_transactions w  where w.match_id  = m.id)
     and not exists (select 1 from public.match_settlements  ms where ms.match_id  = m.id)
)
select 'S1: dead pending links to delete' as action, count(*) as rows from doomed;

delete from public.matches m
 where m.status = 'pending'
   and m.opponent_id is null
   and m.created_at < now() - interval '7 days'
   and not exists (select 1 from public.season_games       sg where sg.match_id = m.id)
   and not exists (select 1 from public.wallet_transactions w  where w.match_id  = m.id)
   and not exists (select 1 from public.match_settlements  ms where ms.match_id  = m.id);

-- ---------- Section 2: orphaned UNPLAYED season self-matches ----------------
-- challenger_id = opponent_id (only the season pipeline creates these), no
-- season_games row points at them (the documented attach failure), and they
-- were never played. Invisible to every surface: the season screen lists via
-- season_games, the VS list is two-party, replays need a link nobody has.
with doomed as (
  select m.id from public.matches m
   where m.challenger_id = m.opponent_id
     and m.result is null
     and not exists (select 1 from public.season_games       sg where sg.match_id = m.id)
     and not exists (select 1 from public.wallet_transactions w  where w.match_id  = m.id)
     and not exists (select 1 from public.match_settlements  ms where ms.match_id  = m.id)
)
select 'S2: orphaned unplayed self-matches to delete' as action, count(*) as rows from doomed;

delete from public.matches m
 where m.challenger_id = m.opponent_id
   and m.result is null
   and not exists (select 1 from public.season_games       sg where sg.match_id = m.id)
   and not exists (select 1 from public.wallet_transactions w  where w.match_id  = m.id)
   and not exists (select 1 from public.match_settlements  ms where ms.match_id  = m.id);

commit;

-- ---------- Section 3: orphaned PLAYED self-matches -- NICK'S CALL ----------
-- These were played to completion but the attach never wrote match_id, so no
-- season_game (and no record tick) ever referenced them. They are equally
-- unreachable, but they carry a result/box score, i.e. history. Deleting them
-- is safe for the app and loses only that. Uncomment ONLY after inventory
-- class D showed what they are and Nick has said yes.
--
-- begin;
-- with doomed as (
--   select m.id from public.matches m
--    where m.challenger_id = m.opponent_id
--      and m.result is not null
--      and not exists (select 1 from public.season_games       sg where sg.match_id = m.id)
--      and not exists (select 1 from public.wallet_transactions w  where w.match_id  = m.id)
--      and not exists (select 1 from public.match_settlements  ms where ms.match_id  = m.id)
-- )
-- select 'S3: orphaned PLAYED self-matches to delete' as action, count(*) as rows from doomed;
-- delete from public.matches m
--  where m.challenger_id = m.opponent_id
--    and m.result is not null
--    and not exists (select 1 from public.season_games       sg where sg.match_id = m.id)
--    and not exists (select 1 from public.wallet_transactions w  where w.match_id  = m.id)
--    and not exists (select 1 from public.match_settlements  ms where ms.match_id  = m.id);
-- commit;

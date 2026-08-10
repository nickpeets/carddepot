-- =============================================================================
-- Card Depot -- TEST-DEBRIS INVENTORY.  READ-ONLY.  It changes nothing.
--
-- STATUS: PROPOSAL. NOT EXECUTED. Nick pastes the whole file into the Supabase
-- SQL editor and runs it once. Run this BEFORE CLEANUP_test_debris.sql -- the
-- cleanup's sections are gated on what this returns.
--
-- WHAT COUNTS AS DEBRIS (derived from the code paths, AGENTS.md 0 style):
--   The app creates `matches` rows from exactly three places:
--     1. Challenge creation (builder.html ~1159): {challenger_id, lineup, seed}
--        -> status 'pending', opponent NULL until someone accepts the link.
--        Dead test links from exercising this flow are class A.
--     2. Season play (builder.html __depotSeasonPlay ~1571): SELF-match --
--        challenger_id = opponent_id = user, AI lineup pre-filled, status
--        'accepted'. The match id is then written onto season_games.match_id
--        by attachMatchToSeasonGame. That attach has a DOCUMENTED 0-rows
--        failure mode (season.js ~214), which strands the match row with no
--        season_game pointing at it: classes C/D (orphans).
--     3. Nothing else inserts matches. Exhibitions (no ?match=) never touch it.
--   Live-verify rituals (AGENTS.md 6.3: "one full season game writes back and
--   the record ticks") play REAL season games under the tester's own account,
--   so agent/dev verification games are indistinguishable from real play in
--   `matches` alone -- section E therefore reconciles the RECORD instead, and
--   section F lists S-games with timestamps so Nick can eyeball which games he
--   actually played.
--
-- Known accounts (MIGRATION_roles.sql):
--   Nick 9e4e47d2-8836-4100-b846-fe1bb059fded
--   Tim  9861ce0d-e081-4123-b445-041dfed6cf34
-- =============================================================================

-- ---------- A. Dead challenge links: pending, no opponent, by age ----------
select 'A: pending challenge, no opponent' as class,
       case when created_at < now() - interval '7 days' then 'stale (>7d)'
            else 'recent (<=7d)' end        as bucket,
       count(*)                             as rows,
       min(created_at)                      as oldest,
       max(created_at)                      as newest
  from public.matches
 where status = 'pending' and opponent_id is null
 group by 2;

-- ---------- B. Accepted but never played --------------------------------
select 'B: accepted, no result' as class,
       case when challenger_id = opponent_id then 'self (season start abandoned)'
            else 'two-party' end as bucket,
       count(*) as rows, min(created_at) as oldest, max(created_at) as newest
  from public.matches
 where status = 'accepted' and result is null
 group by 2;

-- ---------- C/D. Season self-matches: attached vs ORPHANED ----------------
-- Orphan = no season_games row points at it (the attach-0-rows incident).
select case when sg.match_id is null and m.result is null  then 'C: ORPHAN self-match, unplayed'
            when sg.match_id is null                        then 'D: ORPHAN self-match, PLAYED'
            when m.result is null                           then 'attached, unplayed (in-flight)'
            else                                                 'attached + played (legit season game)'
       end                as class,
       count(*)           as rows,
       min(m.created_at)  as oldest,
       max(m.created_at)  as newest
  from public.matches m
  left join public.season_games sg on sg.match_id = m.id
 where m.challenger_id = m.opponent_id
 group by 1;

-- ---------- E. RECORD RECONCILIATION: stored counters vs ground truth -----
-- The header W-L ("S1 · 8-0") is the STORED seasons.wins/losses counters,
-- incremented client-side by read-then-write (season.js ~243-255). This
-- compares them against a COUNT over season_games -- any drift row here is a
-- confirmed record-integrity defect.
select s.id                                   as season_id,
       s.owner_id,
       row_number() over (partition by s.owner_id, s.franchise_id
                          order by s.created_at)              as season_ord,
       s.status,
       s.wins  as stored_wins,   s.losses as stored_losses,
       count(*) filter (where sg.result = 'win')              as counted_wins,
       count(*) filter (where sg.result = 'loss')             as counted_losses,
       count(*) filter (where sg.result = 'pending')          as still_pending,
       case when s.wins   is distinct from count(*) filter (where sg.result='win')
              or s.losses is distinct from count(*) filter (where sg.result='loss')
            then 'DRIFT (!)' else 'consistent' end            as verdict
  from public.seasons s
  left join public.season_games sg on sg.season_id = s.id
 group by s.id, s.owner_id, s.franchise_id, s.status, s.wins, s.losses, s.created_at
 order by s.owner_id, s.created_at;

-- ---------- F. Per-game audit trail (who/when actually played S1..Sn) -----
-- played_at + user/opp score per game. Agent live-verify games show up here as
-- games played at times Nick knows he wasn't playing. This is the only honest
-- way to separate them -- the rows themselves carry no test marker.
select s.owner_id, s.id as season_id, sg.game_number, sg.opponent_name,
       sg.result, sg.user_score, sg.opp_score, sg.played_at,
       (sg.match_id is not null) as has_match
  from public.season_games sg
  join public.seasons s on s.id = sg.season_id
 order by s.owner_id, s.created_at, sg.game_number;

-- ---------- G. Cleanup guards: money/settlement references ----------------
-- Any candidate match referenced by wallet_transactions or match_settlements
-- must NOT be deleted (settlements FK is on delete RESTRICT anyway; wallet is
-- set-null, but we keep provenance). Expect 0 rows in both before cleanup.
select 'G1: candidate matches with wallet rows' as guard, count(*) as rows
  from public.matches m
 where exists (select 1 from public.wallet_transactions w where w.match_id = m.id)
   and ( (m.status = 'pending' and m.opponent_id is null)
      or (m.challenger_id = m.opponent_id
          and not exists (select 1 from public.season_games sg where sg.match_id = m.id)) );

select 'G2: candidate matches with settlement rows' as guard, count(*) as rows
  from public.matches m
 where exists (select 1 from public.match_settlements ms where ms.match_id = m.id)
   and ( (m.status = 'pending' and m.opponent_id is null)
      or (m.challenger_id = m.opponent_id
          and not exists (select 1 from public.season_games sg where sg.match_id = m.id)) );
-- NOTE: G2 errors with "relation does not exist" if MIGRATION_vs_mode.sql has
-- not run -- that is itself the answer (no settlements exist); skip G2 then.

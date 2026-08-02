-- =============================================================================
-- Card Depot -- MIGRATION STATE CHECK.  READ-ONLY.  It changes nothing.
--
-- Paste the whole file into the Supabase SQL editor and run it once. It returns
-- ONE result table of 14 rows telling you exactly which parts of
--   db/proposals/MIGRATION_roles.sql
--   db/proposals/MIGRATION_starter_box.sql
--   db/proposals/MIGRATION_vs_mode.sql
-- are present in this database, before you re-run anything.
--
-- Safe on a database where NONE of them have run: no table is referenced
-- directly, so a missing object reports as ABSENT instead of erroring. Every
-- row prints what it looked at (RUNBOOK 3.6).
--
-- Verified against PostgreSQL 16 in three states: nothing applied, roles-only
-- with a failed starter box, and all three applied.
-- =============================================================================
with c as (
  select
    to_regclass('public.user_roles')                                as t_roles,
    to_regclass('public.starter_box_grants')                        as t_starter,
    to_regclass('public.match_settlements')                         as t_vs,
    to_regclass('public.cards')                                     as t_cards,
    to_regclass('public.franchises')                                as t_fran,
    to_regclass('public.collections')                               as t_coll,
    to_regprocedure('public.depot_is_admin()')                      as f_admin0,
    to_regprocedure('public.depot_is_admin(uuid)')                  as f_admin1,
    to_regprocedure('public.depot_ensure_onboarding(text)')         as f_ensure,
    to_regprocedure('public.depot_claim_starter_box(jsonb,bigint)') as f_claim
),
scalar as (
  select c.*,
    case when c.t_roles is null then null else
      (xpath('/row/v/text()', query_to_xml(
        'select count(*) as v from public.user_roles where role = ''admin''',
        false, true, '')))[1]::text end                             as admin_rows,
    case when c.t_roles is null then null else
      (xpath('/row/v/text()', query_to_xml(
        'select coalesce(string_agg(user_id::text || '' = '' || role, '', '' order by role, user_id), ''(none)'') as v
           from public.user_roles
          where user_id in (''9e4e47d2-8836-4100-b846-fe1bb059fded'',
                            ''9861ce0d-e081-4123-b445-041dfed6cf34'')',
        false, true, '')))[1]::text end                             as nick_tim,
    case when c.t_starter is null then null else
      (xpath('/row/v/text()', query_to_xml(
        'select count(*) as v from public.starter_box_grants', false, true, '')))[1]::text end as starter_rows,
    case when c.t_vs is null then null else
      (xpath('/row/v/text()', query_to_xml(
        'select count(*) as v from public.match_settlements', false, true, '')))[1]::text end  as vs_rows,
    case when c.t_cards is null then null else
      (xpath('/row/v/text()', query_to_xml(
        'select count(*) as v from public.cards where source = ''starter''', false, true, '')))[1]::text end as starter_cards,
    case when c.t_fran is null then null else
      (xpath('/row/v/text()', query_to_xml(
        'select count(*) as v from public.franchises', false, true, '')))[1]::text end as fran_rows,
    case when c.t_coll is null then null else
      (xpath('/row/v/text()', query_to_xml(
        'select count(*) as v from public.collections', false, true, '')))[1]::text end as coll_rows,
    case when c.t_roles is null then null else
      (xpath('/row/v/text()', query_to_xml(
        'select count(*) as v from public.user_roles', false, true, '')))[1]::text end as role_rows
  from c
)
select * from (
  select  1 as n, 'public.user_roles table' as item,
          case when t_roles is null then 'ABSENT' else 'present' end as state,
          coalesce((select case when relrowsecurity then 'RLS enabled' else 'RLS OFF (!)' end
                      from pg_class where oid = t_roles), 'MIGRATION_roles.sql has not run') as detail
    from scalar
  union all
  select  2, 'depot_is_admin() functions',
          case when f_admin0 is null and f_admin1 is null then 'ABSENT'
               when f_admin0 is null or  f_admin1 is null then 'PARTIAL' else 'present' end,
          concat_ws(' + ', case when f_admin0 is not null then 'depot_is_admin()' end,
                           case when f_admin1 is not null then 'depot_is_admin(uuid)' end)
    from scalar
  union all
  select  3, 'admin role rows',
          coalesce(admin_rows || ' admin row(s)', 'n/a - no user_roles table'),
          coalesce(nick_tim, 'n/a') from scalar
  union all
  select  4, 'cards.source column',
          case when t_cards is null then 'no cards table'
               when exists (select 1 from information_schema.columns
                             where table_schema='public' and table_name='cards' and column_name='source')
               then 'present' else 'ABSENT' end,
          coalesce((select data_type from information_schema.columns
                     where table_schema='public' and table_name='cards' and column_name='source'), '-')
    from scalar
  union all
  select  5, 'cards.source CHECK constraint',
          coalesce((select case when pg_get_constraintdef(k.oid) like '%''starter''%'
                                then 'present, ALREADY lists starter'
                                else 'present, does NOT list starter' end
                      from pg_constraint k where k.conrelid = t_cards and k.contype='c'
                       and pg_get_constraintdef(k.oid) like '%source%' limit 1),
                   'ABSENT - no source check on cards'),
          coalesce((select pg_get_constraintdef(k.oid)
                      from pg_constraint k where k.conrelid = t_cards and k.contype='c'
                       and pg_get_constraintdef(k.oid) like '%source%' limit 1), '-')
    from scalar
  union all
  select  6, 'public.starter_box_grants table',
          case when t_starter is null then 'ABSENT' else 'present' end,
          coalesce(starter_rows || ' grant row(s)', 'MIGRATION_starter_box.sql has not completed')
    from scalar
  union all
  select  7, 'depot_claim_starter_box() RPC',
          case when f_claim is null then 'ABSENT' else 'present' end, '-' from scalar
  union all
  select  8, 'public.match_settlements table',
          case when t_vs is null then 'ABSENT' else 'present' end,
          coalesce(vs_rows || ' settlement row(s)', 'MIGRATION_vs_mode.sql has not run')
    from scalar
  union all
  select  9, 'wallet_transactions.match_id column',
          case when exists (select 1 from information_schema.columns
                             where table_schema='public' and table_name='wallet_transactions'
                               and column_name='match_id') then 'present' else 'ABSENT' end,
          'added by MIGRATION_vs_mode.sql' from scalar
  union all
  select 10, 'franchises_owner_uidx (one franchise per account)',
          case when exists (select 1 from pg_indexes where schemaname='public'
                             and indexname='franchises_owner_uidx') then 'present' else 'ABSENT' end,
          'MIGRATION_roles.sql 2.0' from scalar
  union all
  select 11, 'signup trigger depot_on_auth_user_created',
          case when exists (select 1 from pg_trigger where tgname='depot_on_auth_user_created'
                             and not tgisinternal) then 'present' else 'ABSENT' end,
          'MIGRATION_roles.sql 2.2' from scalar
  union all
  select 12, 'depot_ensure_onboarding(text) RPC',
          case when f_ensure is null then 'ABSENT' else 'present' end, '-' from scalar
  union all
  select 13, 'onboarding coverage',
          (select count(*)::text from auth.users) || ' auth users',
          'franchises=' || coalesce(fran_rows,'n/a')
          || ', collections=' || coalesce(coll_rows,'n/a')
          || ', role rows='  || coalesce(role_rows,'n/a')
          || '   (all four should match)'
    from scalar
  union all
  select 14, 'cards already carrying source=starter',
          coalesce(starter_cards, 'n/a'), 'expect 0 unless the box has been claimed'
    from scalar
) r order by n;

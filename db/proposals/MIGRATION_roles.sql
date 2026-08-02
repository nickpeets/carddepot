-- =============================================================================
-- Card Depot -- MIGRATION: ROLES + FRANCHISE-ON-SIGNUP + BALANCE RECONCILIATION
--
-- STATUS: PROPOSAL. **NOT EXECUTED.** Nick runs this in the Supabase SQL editor.
-- Per AGENTS.md Sec 2 and RUNBOOK Sec 4.6 the agent does not execute DDL, RPC
-- definitions, or RLS policy changes. This file is the ready-to-run artifact.
--
-- WHY THIS FILE EXISTS -- three documents point at the same missing table:
--   design/GRADE_PRESTIGE.md Sec 7.4  (admin bypass for the Add-a-Card scan gate)
--   db/proposals/FUTURE_ITEMS.md Sec 14 (admin testing wallets, out of analytics)
--   SHARED_LIBRARY_DESIGN.md Sec 9      (the admin model, open since Phase 0)
-- plus two onboarding holes found while funding the second testing wallet:
--   FUTURE_ITEMS.md Sec 17  franchise creation has exactly ONE path and it is a
--                           window.prompt inside startOrResumeSeason()
--   FUTURE_ITEMS.md Sec 14  nothing enforces franchises.balance = sum(ledger)
--
-- WHAT IT DOES
--   1. public.user_roles + RLS + public.depot_is_admin()      (the roles table)
--   2. franchise + collection on signup: trigger, idempotent RPC, backfill,
--      and a rename affordance                                (kills the prompt)
--   3. balance = ledger-sum reconciliation: a read-only check function and an
--      admin-only repair                                       (drift detector)
--   4. depot_admin_grant(): the Sec 14 testing wallet as a documented RPC
--      instead of a hand-run pair of statements, analytics-flagged by default
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   - It does not touch cards, pack_grants, depot_claim_free_pack, or
--     depot_purchase_pack. The money path already works; this only adds.
--   - It does not create the starter box or the VS-mode tables. Those are
--     separate concerns on separate branches (AGENTS.md Sec 1, one per branch):
--       db/proposals/MIGRATION_starter_box.sql
--       db/proposals/MIGRATION_vs_mode.sql
--   - It does not grant anybody coins. Sec 4 installs the path; running it
--     grants nothing until Nick calls it.
--
-- SAFETY
--   - Additive only. No DROP TABLE, no DELETE, no UPDATE of user data except
--     the explicitly-labelled Sec 2.4 backfill (inserts only) and the Sec 3.3
--     repair, which Nick must call by hand, per owner, and which only ever
--     moves balance toward the ledger.
--   - Every object uses IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF
--     EXISTS, so the whole file is safe to re-run.
--   - Sections 1-4 run as ONE transaction. Verification (Sec 5) is read-only
--     and runs separately. Rollback is Sec 6.
-- =============================================================================

begin;

-- =============================================================================
-- SECTION 1. THE ROLES TABLE
-- =============================================================================
-- Shape follows the sketch in GRADE_PRESTIGE.md Sec 7.4 exactly: user_id as the
-- primary key (one role row per account), a checked text role, self-read RLS,
-- and NO client write path at all. A role is not something a client may assert;
-- an admin bypass that mints library-art cards IS a mint, so it has to be
-- checked where RLS is checked.

create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'user' check (role in ('admin','user')),
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.user_roles is
  'One role row per account. Read-only from the client (self-read RLS). Written by Nick or by a service-role job only. See design/GRADE_PRESTIGE.md Sec 7.4.';

alter table public.user_roles enable row level security;

-- Read your OWN row. No insert, update or delete policy exists on purpose:
-- with RLS enabled and no policy for a command, that command is denied for
-- every non-service role. That is the whole point.
drop policy if exists user_roles_self_read on public.user_roles;
create policy user_roles_self_read on public.user_roles
  for select to authenticated using (user_id = auth.uid());

-- The one server-side truth. SECURITY DEFINER so an ordinary caller can ask
-- "am I admin" without being able to read anybody else's role row, and so RLS
-- policies elsewhere can call it. STABLE: same answer within a statement.
create or replace function public.depot_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$fn$;

revoke all on function public.depot_is_admin() from public;
grant execute on function public.depot_is_admin() to authenticated;

-- Overload for policy use: is THIS user an admin. Not callable by the client.
create or replace function public.depot_is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user and role = 'admin'
  );
$fn$;

revoke all on function public.depot_is_admin(uuid) from public;

-- 1.1 THE FOUNDING ADMIN ROW.
-- Nick. This id is already hardcoded as the founding-admin fallback in the
-- client shim (js/depot-roles.js), which is how the Add-a-Card bypass keeps
-- working before this file is run. Once this row exists the shim resolves it
-- from the table and the hardcoded fallback stops mattering.
insert into public.user_roles (user_id, role, note)
values ('9e4e47d2-8836-4100-b846-fe1bb059fded', 'admin', 'founding admin (Nick)')
on conflict (user_id) do update set role = 'admin';

-- 1.2 TIM'S ADMIN ROW -- a REVERSAL, on the record.
-- Tim was seeded here as a plain 'user' and deliberately left out of the
-- client fallback list so the standard scan-required Add-a-Card flow had a
-- live test subject. Nick has since granted him the add-bypass, so this row
-- and FOUNDING_ADMINS in js/depot-roles.js were changed together and still
-- agree -- which is the whole point of keeping both in one commit.
--
-- SCOPE WARNING: 'admin' here bundles the Add-a-Card bypass with every other
-- admin power this file defines (depot_admin_grant, depot_wallet_repair, the
-- analytics exclusion). If Tim should hold ONLY the bypass, that is a
-- role-granularity split -- FUTURE_ITEMS Sec 21. Flagged, not built.
insert into public.user_roles (user_id, role, note)
values ('9861ce0d-e081-4123-b445-041dfed6cf34', 'admin', 'admin (Tim) -- add-bypass granted by Nick')
on conflict (user_id) do update set role = 'admin';

-- =============================================================================
-- SECTION 2. FRANCHISE (AND COLLECTION) ON SIGNUP -- kill the window.prompt path
-- =============================================================================
-- FUTURE_ITEMS.md Sec 17: ensureFranchise() in game/season.js is the ONLY code
-- in the repo that inserts into franchises, it runs from startOrResumeSeason(),
-- and it asks for the team name with window.prompt. So the row only exists for
-- accounts that have entered Season Mode -- one row against five auth users.
--
-- The consequence is a silently broken wallet: getBalance() reads
-- franchises.balance with .maybeSingle(), so no row is not an error -- it
-- returns null, the chip renders 0, and a payout half-lands (the ledger row
-- inserts fine because it is keyed on owner_id, and depot_apply_payout has no
-- row to move). The ledger and the chip disagree from that user's first credit.
--
-- The starter box needs this doubly: a 25-card grant on day one has to have
-- somewhere to land before the collector has ever seen Season Mode.

-- 2.0 ONE FRANCHISE PER OWNER, enforced where it belongs.
-- This is already an implicit requirement: getBalance() uses .maybeSingle(),
-- which ERRORS on two rows, and ensureFranchise() silently takes the oldest.
-- Pushing it into the DB is what makes the on-conflict clauses below race-safe
-- (RUNBOOK Sec 4.2 -- read-then-write is not idempotency).
--
-- Guarded: if any owner somehow already has two franchises, the index is NOT
-- created and a notice tells Nick to resolve it by hand. It never deletes.
do $blk$
declare v_dupes int;
begin
  select count(*) into v_dupes from (
    select owner_id from public.franchises group by owner_id having count(*) > 1
  ) d;
  if v_dupes > 0 then
    -- STOP. This used to be a notice, which read as harmless and was not:
    -- Sec 2.1 (depot_ensure_onboarding) and Sec 2.4 (the backfill) both use
    -- ON CONFLICT (owner_id), which REQUIRES the unique index this branch just
    -- declined to create. Carrying on hit 42P10 'there is no unique or exclusion
    -- constraint matching the ON CONFLICT specification' 160 lines later and
    -- rolled the whole file back anyway -- with a reassuring NOTICE on screen.
    -- Fail here instead, where the message is actionable.
    raise exception 'franchises_owner_uidx NOT created: % owner(s) hold more than one franchise row. Nothing has been changed. Resolve the duplicates by hand, then re-run this file.', v_dupes;
  else
    create unique index if not exists franchises_owner_uidx
      on public.franchises (owner_id);
    raise notice 'franchises_owner_uidx present (one franchise per account).';
  end if;
end
$blk$;

-- 2.1 THE IDEMPOTENT ENSURE. Callable by the client, safe to call on every
-- load, creates at most one collection and at most one franchise per account.
-- Returns both ids plus a flag per side saying whether THIS call created it,
-- so the client can log the truth instead of guessing (AGENTS.md Sec 4).
create or replace function public.depot_ensure_onboarding(p_team_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_owner        uuid := auth.uid();
  v_collection   uuid;
  v_franchise    uuid;
  v_made_coll    boolean := false;
  v_made_fran    boolean := false;
  v_name         text;
begin
  if v_owner is null then
    raise exception 'depot_ensure_onboarding: not authenticated' using errcode = 'P0001';
  end if;

  -- Serialise concurrent callers for THIS owner only. Two INITIAL_SESSION auth
  -- events in the same millisecond is the documented failure mode (AGENTS.md
  -- Sec 4); the advisory lock is the belt, the unique index is the suspenders.
  perform pg_advisory_xact_lock(hashtextextended('depot_onboarding:' || v_owner::text, 0));

  -- collection: the app's own oldest-collection convention, same shape the
  -- client uses in index.html ({ owner_id, name: 'My Collection' }).
  select id into v_collection
    from public.collections
   where owner_id = v_owner
   order by created_at asc
   limit 1;

  if v_collection is null then
    insert into public.collections (owner_id, name)
    values (v_owner, 'My Collection')
    returning id into v_collection;
    v_made_coll := true;
  end if;

  -- franchise: the row that holds balance. Never overwrite an existing name.
  select id into v_franchise
    from public.franchises
   where owner_id = v_owner
   order by created_at asc
   limit 1;

  if v_franchise is null then
    v_name := nullif(btrim(coalesce(p_team_name, '')), '');
    if v_name is null then v_name := 'MY CLUB'; end if;
    v_name := left(v_name, 40);

    insert into public.franchises (owner_id, team_name)
    values (v_owner, v_name)
    on conflict (owner_id) do nothing
    returning id into v_franchise;

    if v_franchise is null then
      -- lost the race to a concurrent caller: read the winner's row.
      select id into v_franchise from public.franchises where owner_id = v_owner limit 1;
    else
      v_made_fran := true;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'collection_id', v_collection,
    'franchise_id',  v_franchise,
    'created_collection', v_made_coll,
    'created_franchise',  v_made_fran
  );
end;
$fn$;

revoke all on function public.depot_ensure_onboarding(text) from public;
grant execute on function public.depot_ensure_onboarding(text) to authenticated;

-- 2.2 SIGNUP TRIGGER. Belt for the RPC's suspenders: every new auth user gets
-- a role row, a collection and a franchise the moment the account exists, so
-- the wallet is never half-there and the starter box always has a landing pad.
-- Runs as the definer (postgres), so there is no auth.uid() here -- NEW.id is
-- the owner. Never raises: a failure here must not be able to block a signup,
-- so every insert is on-conflict-safe and the whole body is exception-guarded
-- with a WARNING (fail-loud, but not fail-shut -- the RPC will catch up).
create or replace function public.depot_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  begin
    insert into public.user_roles (user_id, role)
    values (new.id, 'user')
    on conflict (user_id) do nothing;

    insert into public.collections (owner_id, name)
    select new.id, 'My Collection'
    where not exists (select 1 from public.collections where owner_id = new.id);

    insert into public.franchises (owner_id, team_name)
    values (new.id, 'MY CLUB')
    on conflict (owner_id) do nothing;
  exception when others then
    raise warning 'depot_handle_new_user: onboarding rows not created for % (%): %',
      new.id, sqlstate, sqlerrm;
  end;
  return new;
end;
$fn$;

drop trigger if exists depot_on_auth_user_created on auth.users;
create trigger depot_on_auth_user_created
  after insert on auth.users
  for each row execute function public.depot_handle_new_user();

-- 2.3 RENAME, the affordance FUTURE_ITEMS.md Sec 17 says does not exist
-- anywhere. One column, owner-scoped, no schema change.
create or replace function public.depot_rename_franchise(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare v_owner uuid := auth.uid(); v_name text;
begin
  if v_owner is null then
    raise exception 'depot_rename_franchise: not authenticated' using errcode = 'P0001';
  end if;
  v_name := left(nullif(btrim(coalesce(p_name,'')), ''), 40);
  if v_name is null then
    raise exception 'depot_rename_franchise: a team name cannot be blank' using errcode = 'P0001';
  end if;
  update public.franchises set team_name = v_name where owner_id = v_owner;
  if not found then
    raise exception 'depot_rename_franchise: no franchise for this account -- call depot_ensure_onboarding() first' using errcode = 'P0001';
  end if;
  return v_name;
end;
$fn$;

revoke all on function public.depot_rename_franchise(text) from public;
grant execute on function public.depot_rename_franchise(text) to authenticated;

-- 2.4 BACKFILL the accounts that predate the trigger. INSERTS ONLY -- it never
-- touches an existing row, so re-running is a no-op. This is the statement
-- that fixes the live hole: five auth users, one franchise row.
insert into public.user_roles (user_id, role)
select u.id, 'user' from auth.users u
where not exists (select 1 from public.user_roles r where r.user_id = u.id);

insert into public.collections (owner_id, name)
select u.id, 'My Collection' from auth.users u
where not exists (select 1 from public.collections c where c.owner_id = u.id);

insert into public.franchises (owner_id, team_name)
select u.id, 'MY CLUB' from auth.users u
where not exists (select 1 from public.franchises f where f.owner_id = u.id)
on conflict (owner_id) do nothing;

-- =============================================================================
-- SECTION 3. BALANCE = LEDGER-SUM RECONCILIATION
-- =============================================================================
-- FUTURE_ITEMS.md Sec 14, last bullet, and RUNBOOK Sec 4.4: franchises.balance is
-- a STORED column, not a view over wallet_transactions, and NO trigger mirrors
-- ledger inserts into it. Nothing enforces balance = sum(amount). There is no
-- reconciliation job, no constraint, no check. The only thing standing between
-- the ledger and the balance is that every writer remembered to move both.
--
-- This section does NOT add a trigger. A trigger would be a non-additive change
-- to the money path and would double-count against every existing writer that
-- already calls depot_apply_payout. What it adds is a DETECTOR (3.2), which is
-- the thing that was missing, plus an explicit admin-only repair (3.3).

-- 3.1 The drift view. One row per franchise: what the column says, what the
-- ledger says, and the difference. A non-zero drift is a bug in a writer.
create or replace view public.depot_balance_drift with (security_invoker = true) as
select f.owner_id,
       f.team_name,
       coalesce(f.balance, 0)                     as balance_column,
       coalesce(l.ledger_sum, 0)                  as ledger_sum,
       coalesce(f.balance, 0) - coalesce(l.ledger_sum, 0) as drift,
       l.ledger_rows
  from public.franchises f
  left join (
        select owner_id, sum(amount) as ledger_sum, count(*) as ledger_rows
          from public.wallet_transactions
         group by owner_id
       ) l on l.owner_id = f.owner_id;

comment on view public.depot_balance_drift is
  'balance-column vs ledger-sum per franchise. drift <> 0 means a writer moved one side and not the other. See RUNBOOK Sec 4.4.';

-- security_invoker = true is load-bearing, not decoration. A plain Postgres
-- view executes as its OWNER, so without it this view is read with postgres's
-- rights and RLS on franchises + wallet_transactions never applies to it.
-- Measured on a local PG16 with own-row RLS in place: a plain 'authenticated'
-- caller saw 1 row in public.franchises and 5 rows -- everybody -- through the
-- view. With security_invoker the view is evaluated as the caller and the base
-- table policies apply, so a collector sees only their own line. Requires
-- PG15+; Supabase is well past that. Admins still read the whole fleet through
-- 3.2, which is SECURITY DEFINER and role-gated on purpose.

-- 3.2 The check function. Self by default; the whole fleet for an admin.
-- Read-only: it reports, it never repairs.
create or replace function public.depot_wallet_check()
returns table (owner_id uuid, team_name text, balance_column bigint, ledger_sum bigint, drift bigint, ledger_rows bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  select d.owner_id, d.team_name,
         d.balance_column::bigint, d.ledger_sum::bigint, d.drift::bigint,
         coalesce(d.ledger_rows, 0)::bigint
    from public.depot_balance_drift d
   where public.depot_is_admin() or d.owner_id = auth.uid()
   order by abs(d.drift) desc, d.team_name;
$fn$;

revoke all on function public.depot_wallet_check() from public;
grant execute on function public.depot_wallet_check() to authenticated;

-- 3.3 The repair. ADMIN ONLY, one owner at a time, called by hand, and it only
-- ever moves the COLUMN toward the LEDGER -- never the other way. The ledger is
-- the record of truth (RUNBOOK Sec 4.1); the column is a cache of it.
create or replace function public.depot_wallet_repair(p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare v_before bigint; v_sum bigint;
begin
  if not public.depot_is_admin() then
    raise exception 'depot_wallet_repair: admin only' using errcode = 'P0001';
  end if;
  select coalesce(balance,0) into v_before from public.franchises where owner_id = p_owner;
  if v_before is null then
    raise exception 'depot_wallet_repair: no franchise row for %', p_owner using errcode = 'P0001';
  end if;
  select coalesce(sum(amount),0) into v_sum from public.wallet_transactions where owner_id = p_owner;
  update public.franchises set balance = v_sum where owner_id = p_owner;
  return jsonb_build_object('owner_id', p_owner, 'balance_before', v_before,
                            'ledger_sum', v_sum, 'balance_after', v_sum,
                            'moved', v_sum - v_before);
end;
$fn$;

revoke all on function public.depot_wallet_repair(uuid) from public;
grant execute on function public.depot_wallet_repair(uuid) to authenticated;

-- =============================================================================
-- SECTION 4. ADMIN TESTING WALLETS, THE APP'S OWN WAY
-- =============================================================================
-- FUTURE_ITEMS.md Sec 14 records the mechanism used by hand twice already: one
-- owner-scoped wallet_transactions row (reason 'admin_grant', meta flagging it
-- as a testing grant) followed by depot_apply_payout -- the same ledger-then-
-- apply pair writePayout() uses, because balance is a stored column.
-- This turns that hand-run pair into one role-gated RPC so the next grant
-- cannot get half-done, and so it always carries the analytics flag.

create or replace function public.depot_admin_grant(p_owner uuid, p_amount bigint, p_note text default 'admin testing grant')
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare v_before bigint; v_after bigint; v_tx uuid;
begin
  if not public.depot_is_admin() then
    raise exception 'depot_admin_grant: admin only' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'depot_admin_grant: amount must be non-zero' using errcode = 'P0001';
  end if;

  -- The grant needs somewhere to land. FUTURE_ITEMS.md Sec 14, second bullet:
  -- the 2026-07-31 grant to Tim could not be made as written because the
  -- account had NO franchises row, and the balance column lives there.
  if not exists (select 1 from public.franchises where owner_id = p_owner) then
    raise exception 'depot_admin_grant: no franchise row for % -- run Sec 2.4 backfill or depot_ensure_onboarding() first', p_owner
      using errcode = 'P0001';
  end if;

  select coalesce(balance,0) into v_before from public.franchises where owner_id = p_owner;

  -- LEDGER FIRST (RUNBOOK Sec 4.1).
  insert into public.wallet_transactions (owner_id, amount, reason, meta)
  values (p_owner, p_amount, 'admin_grant',
          jsonb_build_object('exclude_from_economy_analytics', true,
                             'granted_by', auth.uid(),
                             'note', p_note))
  returning id into v_tx;

  -- THEN the column, in the same transaction, so they can never disagree.
  update public.franchises set balance = coalesce(balance,0) + p_amount
   where owner_id = p_owner
   returning balance into v_after;

  return jsonb_build_object('ok', true, 'tx_id', v_tx, 'owner_id', p_owner,
                            'amount', p_amount,
                            'balance_before', v_before, 'balance_after', v_after);
end;
$fn$;

revoke all on function public.depot_admin_grant(uuid, bigint, text) from public;
grant execute on function public.depot_admin_grant(uuid, bigint, text) to authenticated;

-- 4.1 The analytics exclusion, as a view instead of a rule nobody remembers.
-- FUTURE_ITEMS.md Sec 14: admin grants AND THE SPEND THEY FUND must be flagged out
-- of every economy analytic, or the Sec 12 numbers get quietly poisoned by test
-- purchases. "The spend they funded" is not traceable row-by-row, so this view
-- takes the honest coarse cut: every row belonging to an account flagged admin
-- is out, plus any row anywhere carrying the explicit flag. Documented so the
-- next person tuning prices knows exactly what was excluded and why.
create or replace view public.depot_economy_ledger with (security_invoker = true) as
select w.*
  from public.wallet_transactions w
  left join public.user_roles r on r.user_id = w.owner_id
 where coalesce(r.role, 'user') <> 'admin'
   and w.reason <> 'admin_grant'
   and coalesce(w.meta->>'exclude_from_economy_analytics', 'false') <> 'true';

comment on view public.depot_economy_ledger is
  'wallet_transactions minus every admin account and every analytics-flagged row. Use this, not the raw table, for sink/faucet and pack-price tuning. See FUTURE_ITEMS.md Sec 14.';

commit;

-- =============================================================================
-- SECTION 5. VERIFICATION -- run this AFTER the commit, read-only, one block.
-- =============================================================================
-- Paste the whole block. Every query prints what it checked, per RUNBOOK Sec 3.6:
-- a green result that does not say what it looked at is worth nothing.
--
-- 5.1 The roles table exists, RLS is on, and there is exactly one admin.
--   select relname, relrowsecurity from pg_class where relname = 'user_roles';
--   -- expect: user_roles | t
--   select user_id, role, note from public.user_roles order by role, created_at;
--   -- expect: 9e4e47d2-... admin (Nick) AND 9861ce0d-... admin (Tim, Sec 1.2);
--   --         every other auth user reads as 'user'.
--   select count(*) as admins from public.user_roles where role = 'admin';
--   -- expect: 2  -- Nick and Tim
--
-- 5.2 depot_is_admin() answers for the CALLER, not for the table.
--   -- Run signed in as Nick in the SQL editor's "run as" or from the app console:
--   select public.depot_is_admin();          -- expect: true  (as Nick)
--   -- and from Tim's session:                  expect: true (Tim is an admin as of Sec 1.2)
--   -- Client-side equivalent (browser console, signed in):
--   --   await depotSB().rpc('depot_is_admin')
--
-- 5.3 The client cannot write a role. This MUST fail.
--   -- From the app console signed in as Tim:
--   --   await depotSB().from('user_roles').insert({user_id: (await depotUser()).id, role:'admin'})
--   -- expect: an RLS error (new row violates row-level security policy).
--   -- If this SUCCEEDS, stop and tell Claude: the gate is open.
--
-- 5.4 Every auth user now has a franchise and a collection. This is the Sec 17
--     hole closing; before this file ran it was 1 franchise against 5 users.
--   select (select count(*) from auth.users)          as users,
--          (select count(*) from public.franchises)   as franchises,
--          (select count(*) from public.collections)  as collections,
--          (select count(*) from public.user_roles)   as role_rows;
--   -- expect: users = franchises = collections = role_rows
--   select u.id, u.email, f.team_name
--     from auth.users u left join public.franchises f on f.owner_id = u.id
--    order by u.created_at;
--   -- expect: no NULL team_name
--
-- 5.5 The one-per-account invariant is real.
--   select indexname from pg_indexes
--    where tablename = 'franchises' and indexname = 'franchises_owner_uidx';
--   -- expect: one row. If EMPTY, the Sec 2.0 guard skipped it -- read the
--   -- NOTICE from the run, resolve the duplicate owner by hand, re-run.
--
-- 5.6 The signup trigger is armed.
--   select tgname, tgrelid::regclass from pg_trigger
--    where tgname = 'depot_on_auth_user_created';
--   -- expect: depot_on_auth_user_created | auth.users
--
-- 5.7 The ensure RPC is idempotent. Call it TWICE from a signed-in session.
--   --   await depotSB().rpc('depot_ensure_onboarding', { p_team_name: null })
--   -- expect first call:  created_collection/created_franchise false for an
--   --                     existing account (Sec 2.4 already backfilled it)
--   -- expect second call: identical ids, both created_* false. Same ids twice
--   --                     is the whole claim.
--
-- 5.8 BALANCE = LEDGER SUM, the four numbers RUNBOOK Sec 4.4 asks for.
--   select * from public.depot_wallet_check();
--   -- expect: drift = 0 on EVERY row.
--   -- Known-good reference from FUTURE_ITEMS.md Sec 14: Nick 95450/95450 and
--   -- Tim 100000/100000 at the time those grants were made.
--   -- A non-zero drift is NOT fixed by re-running this file. It means a writer
--   -- moved one side only. Find the writer first, then Sec 3.3.
--
-- 5.9 The analytics view actually excludes something.
--   select (select count(*) from public.wallet_transactions)      as all_rows,
--          (select count(*) from public.depot_economy_ledger)     as economy_rows,
--          (select count(*) from public.wallet_transactions
--            where reason = 'admin_grant')                        as admin_grants;
--   -- expect: economy_rows < all_rows, and the gap covers the admin rows.
--
-- 5.10 The admin grant path works and is role-gated.
--   -- as Nick:  select public.depot_admin_grant('<owner-uuid>'::uuid, 1000, 'smoke test');
--   --           then: select * from public.depot_wallet_check();  -- drift still 0
--   -- as any NON-ADMIN id (Tim is an admin as of Sec 1.2):
--   --   select public.depot_admin_grant('<any-uuid>'::uuid, 1000);
--   --           expect: ERROR depot_admin_grant: admin only

-- =============================================================================
-- SECTION 6. ROLLBACK -- exact inverse, run as one batch. Drops only what this
-- file created. It does NOT delete franchises, collections, cards, ledger rows
-- or anything a collector owns: those are user data and this file only ever
-- INSERTED them where they were missing. Removing the trigger and the roles
-- table returns the app to its pre-migration behaviour (client shim resolves
-- non-admin except the hardcoded founding-admin fallback, and franchise
-- creation falls back to the window.prompt path).
-- =============================================================================
-- begin;
-- drop trigger if exists depot_on_auth_user_created on auth.users;
-- drop function if exists public.depot_handle_new_user();
-- drop function if exists public.depot_ensure_onboarding(text);
-- drop function if exists public.depot_rename_franchise(text);
-- drop function if exists public.depot_admin_grant(uuid, bigint, text);
-- drop function if exists public.depot_wallet_repair(uuid);
-- drop function if exists public.depot_wallet_check();
-- drop view if exists public.depot_economy_ledger;
-- drop view if exists public.depot_balance_drift;
-- drop function if exists public.depot_is_admin(uuid);
-- drop function if exists public.depot_is_admin();
-- drop index if exists public.franchises_owner_uidx;
-- drop table if exists public.user_roles;   -- role rows only; no user data
-- commit;
--
-- NOTE on partial rollback: if you only want to disable the ADMIN BYPASS and
-- keep the onboarding fix, do not drop anything -- just
--   update public.user_roles set role = 'user' where role = 'admin';
-- and every client resolves non-admin on its next load.
-- =============================================================================

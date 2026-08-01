-- =============================================================================
-- Card Depot -- MIGRATION: THE STARTER BOX GRANT
--
-- STATUS: PROPOSAL. **NOT EXECUTED.** Nick runs this. AGENTS.md 2 / RUNBOOK 4.6.
--
-- DEPENDENCY, AND IT IS A HARD ONE: run db/proposals/MIGRATION_roles.sql FIRST.
-- The box grants 25 cards on day one, and a card row needs a collection_id while
-- the wallet marker needs a franchise row to exist. FUTURE_ITEMS.md 17 is exactly
-- this: the second tester's grant could not be made because the account had NO
-- franchises row. MIGRATION_roles.sql section 2 is what guarantees both exist.
-- This file's RPC re-checks anyway and refuses loudly rather than half-granting.
--
-- THE IDEMPOTENCY UNIT IS THE ACCOUNT. Not the card, not a seed. AGENTS.md 4's
-- canonical incident is precisely this scenario: two INITIAL_SESSION auth events
-- in the same millisecond, both read zero, both inserted, and a bronze pack was
-- granted twice. Account creation is the MOST likely moment for a double auth
-- event, so "have we already granted one?" read in the client will eventually
-- grant fifty cards. The gate is owner_id as a PRIMARY KEY -- one row, one
-- account, forever -- expressed as a constraint, never as a check.
-- Grant row FIRST; a 23505 there means "already claimed" -> clean no-op that
-- inserts NO cards (STARTER_BOX.md 5.1, 5.2).
-- =============================================================================

begin;

-- 1. THE LEDGER. owner_id as PK *is* the one-per-account rule.
create table if not exists public.starter_box_grants (
  owner_id      uuid primary key references auth.users(id) on delete cascade,
  collection_id uuid not null,
  seed          bigint not null,
  card_count    int not null default 25,
  created_at    timestamptz not null default now()
);

alter table public.starter_box_grants enable row level security;

-- Read your own row (the client needs it to decide whether to show the waiting
-- box). No INSERT policy: only the SECURITY DEFINER RPC below may write it.
drop policy if exists starter_box_self_read on public.starter_box_grants;
create policy starter_box_self_read on public.starter_box_grants
  for select to authenticated using (owner_id = auth.uid());

-- 2. cards.source needs to admit 'starter'.
-- STARTER_BOX.md 5.3: do NOT repeat the free-pull mistake. Free cards land with
-- empty notes, no marker and no pack_seed, so three cards in Nick's binder
-- cannot be traced to a pull server-side (FUTURE_ITEMS.md 1, 13a). The box must
-- not add a fourth untraceable class. A distinct source is what lets the band
-- bump EXCLUDE the box (GRADE_PRESTIGE.md 6.2) and lets analytics separate
-- onboarding grants from earned pulls.
--
-- The existing constraint's value list is read out of the catalog and EXTENDED,
-- never replaced with a guessed list. If it cannot be extended safely the whole
-- transaction raises, so nothing half-lands.
do $blk$
declare
  v_name text;
  v_def  text;
  v_new  text;
begin
  select c.conname, pg_get_constraintdef(c.oid)
    into v_name, v_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'cards' and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%source%'
   limit 1;

  if v_name is null then
    raise notice 'cards.source carries NO check constraint -- nothing to extend, source=''starter'' will be accepted as-is.';
  elsif v_def like '%''starter''%' then
    raise notice 'cards.source check (%) already permits ''starter'' -- no change.', v_name;
  else
    raise notice 'cards.source check (%) currently: %', v_name, v_def;
    -- Extend the IN/ANY list by inserting 'starter' before its closing paren.
    v_new := regexp_replace(v_def, '\)\s*\)\s*$', ', ''starter''::text))');
    if v_new = v_def then
      raise exception 'Could not extend cards.source check automatically. Definition was: %. Run the ALTER by hand, adding ''starter'' to the list, then re-run this file.', v_def;
    end if;
    execute format('alter table public.cards drop constraint %I', v_name);
    execute format('alter table public.cards add constraint %I %s', v_name, v_new);
    raise notice 'cards.source check (%) extended to: %', v_name, v_new;
  end if;
end
$blk$;

-- 3. THE CLAIM RPC. Mirrors depot_claim_free_pack's shape exactly: SECURITY
-- DEFINER, search_path = public, auth.uid() guard, revoke from public, grant to
-- authenticated. One transaction, so there is no such thing as a partial roster.
--
-- The client rolls the 25 cards (the pool, the prestige weights and the art gate
-- all live in the browser today -- FUTURE_ITEMS.md 11 audited exactly this and
-- concluded the client filter is the enforcement point until a catalog table
-- exists in Postgres). This RPC owns what only the server can own: the
-- one-per-account gate, the atomic insert, and the ledger marker.
create or replace function public.depot_claim_starter_box(p_cards jsonb, p_seed bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_owner      uuid := auth.uid();
  v_collection uuid;
  v_n          int;
  v_card       jsonb;
  v_ids        uuid[] := '{}';
  v_id         uuid;
begin
  if v_owner is null then
    raise exception 'depot_claim_starter_box: not authenticated' using errcode = 'P0001';
  end if;

  if p_cards is null or jsonb_typeof(p_cards) <> 'array' then
    raise exception 'depot_claim_starter_box: p_cards must be a jsonb array' using errcode = 'P0001';
  end if;
  v_n := jsonb_array_length(p_cards);
  if v_n <> 25 then
    raise exception 'depot_claim_starter_box: expected 25 cards, got %', v_n using errcode = 'P0001';
  end if;

  -- the app's own oldest-collection convention, same as depot_claim_free_pack.
  select id into v_collection from public.collections
   where owner_id = v_owner order by created_at asc limit 1;
  if v_collection is null then
    raise exception 'depot_claim_starter_box: no collection for this account -- run MIGRATION_roles.sql section 2 (depot_ensure_onboarding) first'
      using errcode = 'P0001';
  end if;

  -- GRANT ROW FIRST (RUNBOOK 4.1). The PK on owner_id is the gate. A concurrent
  -- second claim collides HERE, before a single card exists.
  begin
    insert into public.starter_box_grants (owner_id, collection_id, seed, card_count)
    values (v_owner, v_collection, p_seed, v_n);
  exception when unique_violation then
    -- 23505 = already claimed. Clean no-op. Insert NOTHING. Say why.
    raise notice 'depot_claim_starter_box: 23505 on starter_box_grants for % -- box already claimed, no cards inserted', v_owner;
    return jsonb_build_object('ok', false, 'already_claimed', true, 'inserted', 0);
  end;

  -- THEN the cards. source='starter' so the box is traceable and excludable.
  for v_card in select * from jsonb_array_elements(p_cards) loop
    insert into public.cards
      (owner_id, collection_id, year, brand, set, number, player, team,
       rookie_year, source, notes, pack_seed)
    values
      (v_owner, v_collection,
       nullif(v_card->>'year','')::int,
       v_card->>'brand', v_card->>'set', v_card->>'number',
       v_card->>'player', v_card->>'team',
       nullif(v_card->>'rookie_year','')::int,
       'starter',
       coalesce(v_card->>'notes',''),
       p_seed)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  -- AND the 0-amount ledger marker, consistent with free_pack being a marker
  -- rather than a transaction. reason 'starter_box'. It moves no money, so there
  -- is no depot_apply_payout call and franchises.balance is untouched -- which is
  -- the correct behaviour and the reason STARTER_BOX.md 8 says the box seeds no DD.
  insert into public.wallet_transactions (owner_id, amount, reason, meta)
  values (v_owner, 0, 'starter_box',
          jsonb_build_object('seed', p_seed, 'card_count', v_n,
                             'card_ids', to_jsonb(v_ids),
                             'excluded_from_pull_band_bump', true));

  return jsonb_build_object('ok', true, 'already_claimed', false,
                            'inserted', v_n, 'seed', p_seed,
                            'collection_id', v_collection,
                            'card_ids', to_jsonb(v_ids));
end;
$fn$;

revoke all on function public.depot_claim_starter_box(jsonb, bigint) from public;
grant execute on function public.depot_claim_starter_box(jsonb, bigint) to authenticated;

commit;

-- =============================================================================
-- 4. VERIFICATION -- after the commit, read-only unless stated.
-- =============================================================================
-- 4.1 The gate exists and is a PRIMARY KEY on the owner, not a check.
--   select conname, contype, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.starter_box_grants'::regclass;
--   -- expect: a PRIMARY KEY on (owner_id). That IS the once-per-account rule.
--   select relname, relrowsecurity from pg_class where relname = 'starter_box_grants';
--   -- expect: t
--
-- 4.2 cards.source admits 'starter'.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.cards'::regclass and contype='c'
--      and pg_get_constraintdef(oid) like '%source%';
--   -- expect: the list contains 'starter'. Compare against the NOTICE the DO
--   -- block printed -- it prints the before AND the after on purpose.
--
-- 4.3 THE DOUBLE-TAP TEST. This is the one that matters; run it.
--   -- From a signed-in browser console, fire two claims CONCURRENTLY with the
--   -- same payload and do NOT await the first:
--   --   const p = window.DepotStarterBox.rollPayload();   // 25 cards + seed
--   --   const a = depotSB().rpc('depot_claim_starter_box', p);
--   --   const b = depotSB().rpc('depot_claim_starter_box', p);
--   --   console.log(await a, await b);
--   -- expect: exactly ONE {ok:true, inserted:25} and one
--   --         {ok:false, already_claimed:true, inserted:0}.
--   select count(*) from public.starter_box_grants;                        -- 1 per account
--   select count(*) from public.cards where source='starter';              -- EXACTLY 25
--   select count(*) from public.wallet_transactions where reason='starter_box'; -- 1
--   -- 50 cards means the gate is not working. Stop and say so.
--
-- 4.4 The box moved no money.
--   select * from public.depot_wallet_check();   -- from MIGRATION_roles.sql
--   -- expect: drift STILL 0. The marker is 0-amount by design.
--
-- 4.5 Provenance is real (STARTER_BOX.md 5.3 -- the thing free pulls got wrong).
--   select id, player, year, source, pack_seed from public.cards
--    where source = 'starter' order by created_at limit 5;
--   -- expect: source='starter' AND a non-null pack_seed on every row. Unlike a
--   -- free pull, every one of these can be traced to its grant.
--
-- =============================================================================
-- 5. ROLLBACK. Note the ORDER: dropping the grant row is what makes the box
-- claimable again, so if you want to RE-TEST an account, delete only its grant
-- row and its 25 cards -- do not drop the table.
-- =============================================================================
-- -- re-test one account (destructive to that account's starter cards ONLY):
-- --   delete from public.cards where owner_id = '<uuid>' and source = 'starter';
-- --   delete from public.wallet_transactions where owner_id='<uuid>' and reason='starter_box';
-- --   delete from public.starter_box_grants where owner_id = '<uuid>';
--
-- -- full rollback of this file:
-- begin;
-- drop function if exists public.depot_claim_starter_box(jsonb, bigint);
-- drop table if exists public.starter_box_grants;   -- grant rows only
-- -- the cards.source check keeps 'starter' in its list; harmless, and dropping it
-- -- would orphan any card already granted. Leave it.
-- commit;
-- =============================================================================

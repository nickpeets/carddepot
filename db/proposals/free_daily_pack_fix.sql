-- =============================================================================
-- Card Depot -- FREE DAILY PACK RPC FIX (collection_id NOT NULL violation)
-- PROPOSAL DDL -- Nick runs this in Supabase (SQL editor). Claude does NOT run DDL.
--
-- BUG: depot_claim_free_pack inserted collection_id from the CLIENT payload
--   (p_card->>'collection_id'), but the shop client never sends it -> NULL ->
--   "null value in column collection_id of relation cards violates not-null
--   constraint". The whole RPC is one transaction, so the failed claim rolled
--   back cleanly (verified read-only: 0 free_pack ledger rows, 0 source='pack'
--   cards, no cooldown stamped -- the claim is still available).
--
-- FIX: resolve the caller's collection INSIDE the function using the app's own
--   oldest-collection convention (select id from collections where
--   owner_id = auth.uid() order by created_at asc limit 1), raise a clear
--   exception if the caller has no collection, and insert that id. The client
--   payload no longer supplies collection_id at all.
--
-- Everything else (cooldown clock, tier, ledger stamp, return shape) is UNCHANGED.
-- Run as ONE batch.
-- =============================================================================
begin;

create or replace function public.depot_claim_free_pack(p_card jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner      uuid := auth.uid();
  v_collection uuid;
  v_last       timestamptz;
  v_next       timestamptz;
  v_window     interval := interval '24 hours';
  v_tier       text;
  v_card_id    uuid;
begin
  -- auth guard
  if v_owner is null then
    raise exception 'depot_claim_free_pack: not authenticated' using errcode = 'P0001';
  end if;

  -- resolve caller's collection: the app's own oldest-collection convention.
  -- Every card row hangs off a collection via collection_id (NOT NULL); the app
  -- queries cards by collection, so the granted card must join Nick's collection.
  select id into v_collection
    from public.collections
   where owner_id = v_owner
   order by created_at asc
   limit 1;
  if v_collection is null then
    raise exception 'depot_claim_free_pack: no collection for this account -- create a collection first'
      using errcode = 'P0001';
  end if;

  -- cooldown clock = the most recent free_pack ledger row for this owner
  select max(created_at) into v_last
  from public.wallet_transactions
  where owner_id = v_owner and reason = 'free_pack';

  if v_last is not null and (now() - v_last) < v_window then
    -- still on cooldown: refuse WITHOUT inserting (idempotent under double-tap)
    v_next := v_last + v_window;
    return jsonb_build_object('ok', false, 'next_claim_at', v_next);
  end if;

  -- tier is derivable from the rolled card's prestige band; trust the client only
  -- for card identity, never for money. Default to 'bronze' if absent.
  v_tier := coalesce(p_card->>'tier', 'bronze');

  -- (a) GRANT: insert one owner-scoped card, source='pack' (the Part 3 grant path)
  insert into public.cards
    (owner_id, collection_id, year, brand, set, number, player, team,
     rookie_year, source)
  values
    (v_owner,
     v_collection,
     nullif(p_card->>'year','')::int,
     p_card->>'brand',
     p_card->>'set',
     p_card->>'number',
     p_card->>'player',
     p_card->>'team',
     nullif(p_card->>'rookie_year','')::int,
     'pack')
  returning id into v_card_id;

  -- (b) COOLDOWN STAMP: 0-amount ledger row, reason 'free_pack', meta = tier+card
  insert into public.wallet_transactions (owner_id, amount, reason, meta)
  values (v_owner, 0, 'free_pack',
          jsonb_build_object('tier', v_tier, 'card_id', v_card_id,
                             'player', p_card->>'player'));

  v_next := now() + v_window;
  return jsonb_build_object('ok', true, 'card_id', v_card_id,
                            'tier', v_tier, 'next_claim_at', v_next);
end;
$$;

revoke all on function public.depot_claim_free_pack(jsonb) from public;
grant execute on function public.depot_claim_free_pack(jsonb) to authenticated;

commit;

-- =============================================================================
-- AUTHORITATIVE NOT-NULL AUDIT (read-only) -- run this SEPARATELY to confirm the
-- insert column list covers every NOT NULL column on public.cards that has no
-- default. Any row this returns (other than the columns the RPC already sets:
-- owner_id, collection_id, year, brand, set, number, player, team, rookie_year,
-- source) is a column the insert would still violate and must be added.
--
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name  = 'cards'
--     and is_nullable = 'NO'
--     and column_default is null
--   order by ordinal_position;
--
-- Expected: only id (has gen default), owner_id, collection_id, player -- and any
-- of those the RPC already supplies. If it lists e.g. 'notes' or a photo column
-- with no default, tell Claude and the insert will be extended. (Empirical spot-
-- check over existing rows found tcdb_url and photo_back_path already hold NULLs,
-- i.e. definitively nullable; this query is the authoritative check for the rest.)
-- =============================================================================

-- ============================================================================
-- Card Depot — FREE DAILY PACK + insufficient-funds fold-in
-- PROPOSAL DDL — Nick runs this in Supabase (SQL editor). Claude does NOT run DDL.
-- Design: ECONOMY_DESIGN.md sections 7.1 (free pack) and 7.2 (fold-in).
--
-- Money-safety conventions (match depot_purchase_pack):
--   - SECURITY DEFINER, revoke all from public, grant execute to authenticated
--   - owner-scoped via auth.uid(), ledger-first, one transaction
--   - ledger = wallet_transactions(owner_id, amount, reason, meta jsonb, created_at)
--   - the ledger IS the cooldown clock (no new table)
--
-- IMPORTANT — where the roll happens:
--   The card identity (player/year/brand/set/number/team/rookie_year + tier) is
--   rolled CLIENT-SIDE by the shipped, published pack engine (depot-pack-engine.js),
--   consistent with section 7 ("odds live in shipped client config, not a table").
--   The client passes the rolled card into this RPC as a jsonb payload; the server
--   enforces the 24h cadence and performs the cooldown-stamp + card INSERT
--   ATOMICALLY so grant and clock can never diverge. The server does NOT trust the
--   payload for anything money-bearing (amount is hard-coded 0).
-- ============================================================================

-- Run everything below as ONE batch. ------------------------------------------
begin;

-- (1) FOLD-IN: make depot_purchase_pack's insufficient-funds message authoritative
--     (section 7.2). Only the raised message changes; logic is unchanged.
--     Replace ONLY the floor-check exception line inside your existing function.
--     If you prefer to re-create the whole function, keep every other line as-is
--     and change the raise to the form below:
--
--        raise exception 'insufficient funds: balance % DD, cost % DD',
--              v_balance, p_cost using errcode = 'P0001';
--
--     (This is a drop-in for the current bare `raise exception 'insufficient funds'`.
--      The shop refusal will then read the RPC's own numbers.)

-- (2) FREE DAILY PACK claim RPC (section 7.1). --------------------------------
create or replace function public.depot_claim_free_pack(p_card jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner    uuid := auth.uid();
  v_last     timestamptz;
  v_next     timestamptz;
  v_window   interval := interval '24 hours';
  v_tier     text;
  v_card_id  uuid;
begin
  -- auth guard
  if v_owner is null then
    raise exception 'depot_claim_free_pack: not authenticated' using errcode = 'P0001';
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
     nullif(p_card->>'collection_id','')::uuid,
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

-- ============================================================================
-- VERIFY (read-only, run after commit):
--   select public.depot_claim_free_pack('{"player":"TEST ROOKIE","year":"1989",
--     "brand":"Test","set":"Base","number":"1","team":"TST","tier":"bronze"}'::jsonb);
--   -- first call -> { ok:true, card_id, tier, next_claim_at }
--   -- immediate second call -> { ok:false, next_claim_at }
--   select owner_id, amount, reason, meta, created_at
--     from public.wallet_transactions where reason='free_pack'
--     order by created_at desc limit 3;
--   -- (clean up the test card + test ledger row afterward if desired)
-- ============================================================================

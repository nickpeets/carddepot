-- =============================================================================
-- Card Depot -- SELF-MATCH SETTLEMENT REVERSAL.  PROPOSAL -- NOT EXECUTED.
--
-- THE INCIDENT (confirmed from production data, 2026-08-09): the VS settle
-- sweep settled SEASON SELF-MATCHES - matches where challenger_id = opponent_id,
-- i.e. the season pipeline's own plumbing rows (builder __depotSeasonPlay) -
-- and paid the full 100-coin friendly purse for playing yourself. 13 such
-- settlements exist (June-July season matches swept when settlement went live
-- 2026-08-02): ~1,300 coins minted from solo season play.
--
-- The CLIENT fix ships in js/depot-vs.js (self-matches excluded from the sweep
-- candidates AND refused inside settle()). This file is the LEDGER's half:
-- negative reversal entries so the ledger can tell the truth. Nick's coins,
-- play money, Nick's call whether to run it.
--
-- DESIGN:
--   * The erroneous match_settlements rows STAY - they are audit rows by design
--     ("a settlement is an audit row, not state", MIGRATION_vs_mode.sql), and
--     they are what this file joins against. Nothing is deleted.
--   * Reversal = one NEGATIVE wallet_transactions row per erroneous settlement,
--     reason 'self_match_settlement_reversal', same match_id for provenance.
--   * IDEMPOTENT: a reversal row is inserted only where none exists yet for
--     that (owner_id, match_id, reason). A second run inserts 0 rows.
--   * IDS ARE DERIVED, NOT TRUSTED FROM MEMORY: the authoring session had no DB
--     access, so the 13 are pinned two ways - the candidate set is derived by
--     the join (settlement on a challenger_id = opponent_id match), and the
--     transaction ABORTS unless the candidate count is EXACTLY 13. If
--     production has moved, the file refuses to run; re-verify, adjust the
--     pinned count consciously, re-run. Run the SELECT below first and eyeball
--     the 13 ids it prints.
--   * Balance: applied through the existing convention - depot_apply_payout(),
--     the same RPC the client credit path uses, with a negative amount. If the
--     RPC's auth guard refuses a SQL-editor run, the DO block prints the exact
--     per-owner deltas instead of failing silently.
-- =============================================================================

-- ---------- STEP 0 (read-only): eyeball the candidates FIRST ----------------
select ms.match_id, ms.owner_id, ms.amount, ms.won, ms.created_at as settled_at,
       m.created_at as match_created, m.status
  from public.match_settlements ms
  join public.matches m on m.id = ms.match_id
 where m.challenger_id = m.opponent_id
 order by ms.created_at;
-- Expect EXACTLY 13 rows, all owner_id = Nick
-- (9e4e47d2-8836-4100-b846-fe1bb059fded), amounts summing ~1,300.

-- ---------- STEP 1: the reversal (one transaction, aborts on drift) ---------
begin;

do $$
declare
  v_count integer;
  v_inserted integer;
  r record;
  v_rpc_ok boolean := true;
begin
  select count(*) into v_count
    from public.match_settlements ms
    join public.matches m on m.id = ms.match_id
   where m.challenger_id = m.opponent_id;

  if v_count <> 13 then
    raise exception 'self-match settlement count is % (pinned expectation: 13). Production moved since this file was written - re-verify with STEP 0 before adjusting the pin.', v_count;
  end if;

  insert into public.wallet_transactions (owner_id, amount, reason, match_id)
  select ms.owner_id, -ms.amount, 'self_match_settlement_reversal', ms.match_id
    from public.match_settlements ms
    join public.matches m on m.id = ms.match_id
   where m.challenger_id = m.opponent_id
     and not exists (
           select 1 from public.wallet_transactions w
            where w.owner_id = ms.owner_id
              and w.match_id = ms.match_id
              and w.reason   = 'self_match_settlement_reversal');
  get diagnostics v_inserted = row_count;
  raise notice 'reversal ledger rows inserted: % (0 on a re-run = already reversed, clean no-op)', v_inserted;

  -- balance deltas via the existing convention (depot_apply_payout, negative).
  -- Applied ONLY for owners whose reversal rows were inserted THIS run, so a
  -- re-run cannot double-debit.
  if v_inserted > 0 then
    for r in
      select ms.owner_id, -sum(ms.amount) as delta
        from public.match_settlements ms
        join public.matches m on m.id = ms.match_id
       where m.challenger_id = m.opponent_id
       group by ms.owner_id
    loop
      begin
        perform public.depot_apply_payout(r.owner_id, r.delta::integer);
        raise notice 'balance adjusted via depot_apply_payout: owner % delta %', r.owner_id, r.delta;
      exception when others then
        v_rpc_ok := false;
        raise notice 'depot_apply_payout REFUSED for owner % (%). Apply delta % by the RPC''s own path or the dashboard - the ledger rows above are already the durable truth.', r.owner_id, sqlerrm, r.delta;
      end;
    end loop;
  end if;

  if not v_rpc_ok then
    raise notice 'NOTE: one or more balance adjustments did not apply in this run (see notices above). Ledger is complete; only the cached balance needs the printed deltas.';
  end if;
end $$;

commit;

-- ---------- STEP 2 (read-only): verify --------------------------------------
select reason, count(*) as rows, sum(amount) as coins
  from public.wallet_transactions
 where reason in ('challenge_win','challenge_tie','challenge_loss','self_match_settlement_reversal')
 group by reason order by reason;
-- Expect self_match_settlement_reversal: 13 rows, coins ~ -1,300.

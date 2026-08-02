-- MIGRATION_vs_mode.sql - VS MODE v1 (friendly stakes). QUEUED, NOT EXECUTED.
--
-- Nothing in this file has been run. The client (js/depot-vs.js + vs.html) is
-- dark-safe against every object below: if the table is absent the settlement
-- logs why and moves no coins, and the VS surface still lists and plays matches.
--
-- WHY THE KEY IS (match_id, owner_id) AND NOT match_id ALONE.
-- AGENTS.md 4, the canonical incident: the unique key must sit at the
-- granularity of the thing being deduped. The thing being deduped here is ONE
-- PAYOUT PER PARTY PER CHALLENGE - both the winner and the loser settle exactly
-- once. A single-column unique on match_id would reject the second party's row,
-- which is the unique-on-pack_seed mistake wearing a different hat.
-- The ledger row is inserted FIRST; a 23505 means already settled and the client
-- returns a clean no-op that transfers nothing.
--
-- Card wagers are NOT here. v1 is friendly stakes only: a fixed coin purse.
-- Card transfer needs server-authoritative settlement + OAuth (GAME_MODES.md 6).

begin;

create table if not exists public.match_settlements (
  match_id   uuid        not null references public.matches(id) on delete restrict,
  owner_id   uuid        not null references auth.users(id)     on delete restrict,
  role       text        not null check (role in ('challenger','opponent')),
  amount     integer     not null check (amount >= 0),
  won        boolean     not null default false,
  created_at timestamptz not null default now(),
  primary key (match_id, owner_id)
);

comment on table public.match_settlements is
  'One settled payout per party per challenge. Inserted BEFORE any coin moves; 23505 = already settled, clean no-op.';

alter table public.match_settlements enable row level security;

create policy match_settlements_select_own on public.match_settlements
  for select using (owner_id = auth.uid());

create policy match_settlements_insert_own on public.match_settlements
  for insert with check (owner_id = auth.uid());

-- No update/delete policy on purpose: a settlement is an audit row, not state.

-- Provenance on the money ledger. Non-unique on purpose: a match can produce two
-- wallet rows (one per party), exactly as a pack produces five cards that share
-- one seed. The dedupe lives in match_settlements, not here.
alter table public.wallet_transactions
  add column if not exists match_id uuid references public.matches(id) on delete set null;

create index if not exists wallet_transactions_match_idx
  on public.wallet_transactions (match_id);

commit;

-- ---------------------------------------------------------------------------
-- DEFERRED, and deliberately not in the transaction above: the server-
-- authoritative settlement. v1 settles client-side, per party, under RLS -
-- the same trust model every other payout in this app already uses
-- (wallet_transactions inserts from depot-wallet.js). That is acceptable for a
-- friendly coin purse among five known users and NOT acceptable the moment
-- cards can change owner. When card wagers land, settlement moves here:
--
-- create or replace function public.depot_settle_match(p_match uuid)
--   returns void language plpgsql security definer as $$
--   begin
--     -- read the match, decide the winner from result->'final', insert BOTH
--     -- match_settlements rows in one statement (23505 = already settled),
--     -- then apply both balance deltas. One writer, one transaction.
--   end; $$;

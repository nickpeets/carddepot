-- =============================================================================
-- Card Depot -- MIGRATION: SAVED TEAMS (build package v2, chapter 18)
--
-- STATUS: PROPOSAL. **NOT EXECUTED.** Nick runs this. AGENTS.md 2 / RUNBOOK 4.6.
-- The agent that wrote this cannot run SQL and did not.
--
-- WHY THIS IS FIRST. The V2 constitution's build order says it in one line:
-- "Saved teams are the pivot: build them before the hub, the builder or VS, or
-- all three get rebuilt." Chapters 19, 20 and 21 all consume a saved team.
-- Chapter 19 already shipped in its drawn "no saved team yet" state precisely so
-- that it would not have to be rebuilt when this lands.
--
-- THE ONE RULE THAT SHAPES THE SCHEMA. Chapter 18: "A card can sit in several
-- saved teams at once -- teams reference cards, they do not consume them."
-- So slots hold a REFERENCE, and nothing here ever moves, locks or deletes a
-- card. A saved team is a view onto the collection, not a container.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   * No FK from a slot to the cards table. The card tables are not in db/ and
--     this file will not guess their name or their PK type. The slot stores the
--     card id as text plus enough denormalised identity (name, year) to render
--     an honest INVALID row when the card is gone -- which is the whole point of
--     the invalid state, and it cannot be done if the reference is all we keep.
--   * No trigger that repairs a broken team. OQ-3 is answered as drawn --
--     invalid-with-a-fix-button -- and that is a USER action, not a cascade.
--     A trigger that silently auto-filled a sold card's slot would change a
--     lineup behind a player's back between one game and the next.
--   * No coupling to VS or to settlement. Chapter 18 says VS *reads* a saved
--     team; it never writes one. The settlement path is not touched here.
-- =============================================================================

begin;

-- 1. THE TEAM ---------------------------------------------------------------
-- name: 24 chars is a DESIGN constraint (it is printed on the scoreboard), so
-- it is enforced here as well as in the input, not instead of it.
-- prestige / games_used / record are DENORMALISED counters. They are display
-- facts, refreshed by the client that owns the surface; nothing settles or pays
-- from them. AGENTS.md 4's read-then-write ban applies to money and to the
-- season record, neither of which lives here.
create table if not exists public.saved_teams (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 24),
  is_default   boolean not null default false,
  rule_set     text,
  prestige     int  not null default 0,
  games_used   int  not null default 0,
  wins         int  not null default 0,
  losses       int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- THE CAP IS 10 AND IT IS A CONSTRAINT, NOT A CHECK IN THE CLIENT.
-- AGENTS.md 4's canonical incident is a client-side "have we already?" read that
-- lost a race and granted twice. A cap read in JS has exactly that shape, so the
-- eleventh insert is refused by the database or it is not refused at all.
create or replace function public.saved_teams_cap() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.saved_teams where owner_id = new.owner_id) >= 10 then
    raise exception 'saved team cap reached (10)' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists saved_teams_cap_trg on public.saved_teams;
create trigger saved_teams_cap_trg
  before insert on public.saved_teams
  for each row execute function public.saved_teams_cap();

-- EXACTLY ONE DEFAULT PER ACCOUNT, as a partial unique index. "Make default is
-- one tap" (ch18) means the client flips one row and clears the other; this
-- index is what makes a lost race fail loudly instead of leaving two defaults
-- and letting Season pick whichever it read first.
create unique index if not exists saved_teams_one_default_uidx
  on public.saved_teams (owner_id) where is_default;

create index if not exists saved_teams_owner_idx on public.saved_teams (owner_id, updated_at desc);

-- 2. THE SLOTS ---------------------------------------------------------------
-- Nine fielders plus bench and bullpen; slot_no is ordinal within its kind so
-- the batting order is stored, not re-derived. card_id is TEXT on purpose: this
-- file does not know the card table's key type and will not assume it.
create table if not exists public.saved_team_slots (
  team_id     uuid not null references public.saved_teams(id) on delete cascade,
  slot_kind   text not null check (slot_kind in ('lineup','bench','bullpen')),
  slot_no     int  not null check (slot_no >= 1),
  card_id     text not null,
  pos         text,
  -- denormalised identity, so a team whose card is gone can still say WHICH card
  -- broke. Without this the invalid row can only say "a card is missing".
  card_name   text,
  card_year   text,
  primary key (team_id, slot_kind, slot_no)
);

create index if not exists saved_team_slots_card_idx on public.saved_team_slots (card_id);

-- 3. RLS ---------------------------------------------------------------------
alter table public.saved_teams      enable row level security;
alter table public.saved_team_slots enable row level security;

drop policy if exists saved_teams_self_all on public.saved_teams;
create policy saved_teams_self_all on public.saved_teams
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Slots inherit the parent's ownership. Checked by EXISTS rather than by a
-- denormalised owner_id column, so the two can never disagree.
drop policy if exists saved_team_slots_self_all on public.saved_team_slots;
create policy saved_team_slots_self_all on public.saved_team_slots
  for all using (
    exists (select 1 from public.saved_teams t where t.id = team_id and t.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.saved_teams t where t.id = team_id and t.owner_id = auth.uid())
  );

-- 4. updated_at ---------------------------------------------------------------
create or replace function public.saved_teams_touch() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists saved_teams_touch_trg on public.saved_teams;
create trigger saved_teams_touch_trg
  before update on public.saved_teams
  for each row execute function public.saved_teams_touch();

commit;

-- =============================================================================
-- VERIFICATION, to run after this file (RUNBOOK 4.6 -- read the result, do not
-- assume it):
--
--   select count(*) from public.saved_teams;                    -- expect 0
--   select indexname from pg_indexes
--     where tablename = 'saved_teams';                          -- expect the
--                                                               -- one_default
--                                                               -- partial index
--   -- the cap should refuse the 11th, loudly:
--   -- insert 10 rows for one owner, then an 11th, and expect P0001.
--   -- the partial index should refuse a second default:
--   -- update two rows to is_default = true and expect 23505.
--
-- Both of those are the point of the migration. If either succeeds silently,
-- this file did not do its job and the client's cap and default logic are
-- running on nothing.
-- =============================================================================

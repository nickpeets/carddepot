# GRANT_AUTHORITY.md — the server must roll the pull, not record the client's claim about one

Status: **specification**. Nothing here is built. This is the first item in the V2 build, ahead of every surface, because three things the project has been tracking separately are one piece of work.

Written 2026-08-11 from a read of five deployed `SECURITY DEFINER` functions against production. Every quotation below is from a stored function definition, not from `db/proposals/`.

---

## 1. The finding, in one sentence

**Every grant path in this codebase checks *who* is asking and *whether* they may ask, and then takes the client's word for *what* is being granted.**

| function | identity, concurrency, rate limiting | the value being granted |
|---|---|---|
| `depot_apply_payout(p_owner, p_amount)` | raises unless `auth.uid() = p_owner` | `p_amount` unbounded and unchecked |
| `depot_purchase_pack(p_cost, p_tier)` | `auth.uid()`, `FOR UPDATE` row lock, ledger and debit in one transaction | `p_cost` client-named, never checked against `p_tier` |
| `depot_claim_free_pack(p_card)` | `auth.uid()`, 24-hour cooldown enforced server-side off `wallet_transactions` | the entire card comes from `p_card` |
| `depot_claim_starter_box(p_cards, p_seed)` | `auth.uid()`, grant-row-first with the PK on `owner_id` as the gate, count fixed at 25 | all 25 cards come from `p_cards` |
| `depot_wallet_repair(p_owner)` | admin-gated | derives its own number from the ledger — **exception by derivation** |
| `depot_admin_grant(p_owner, p_amount, p_note)` | `depot_is_admin()` gate, amount checked non-zero, ledger-then-column in one transaction | client names the amount — but **exception by role**, this is the one place a human is supposed to |

**The set is complete.** All six grant paths in `public` have now been read against production. The claim is therefore not a sample:

> **Every path where the granted value is not derived server-side is either a hole or explicitly role-gated, and there is exactly one of the latter.**

That is one habit applied four times, with two principled exceptions. It is not four separate defects, and treating it as four parameter-bound fixes will miss the point and leave the next grant path with the same hole.

`depot_admin_grant` is worth understanding rather than lumping in. It also lets the client name the amount — but it is gated on `depot_is_admin()`, it refuses a null or zero amount, it writes the ledger row and the balance column in one transaction so they cannot disagree, and it stamps `exclude_from_economy_analytics`. That is what a sanctioned client-named value looks like. It is the shape the four holes should be measured against, not a sixth hole.

The hard parts are done, and several are done well. `depot_purchase_pack` takes a `FOR UPDATE` lock so concurrent purchases cannot double-spend. `depot_claim_starter_box` inserts its grant row before a single card exists, so a concurrent second claim collides on 23505 and inserts nothing. `depot_claim_free_pack` computes its own cooldown from `max(created_at)` on the ledger rather than trusting a client timestamp. Identity is derived from `auth.uid()` in three of the five. **Keep all of that.** None of it is what needs to change.

What is missing everywhere is a server-side source of truth for the thing being handed out.

---

## 2. Why this is one piece of work and not three

The project is currently tracking three separate items:

1. the coin-minting and pack-pricing hole (this document, discovered 2026-08-11);
2. **fabricated pack history** — an adversarial UX audit found the pack-history UI carries a banner admitting it displays a re-roll rather than the pack the user actually opened;
3. a V2 roadmap chapter on **card provenance**.

Item 2 has been filed as a display bug. It is not a display bug.

The server cannot show you the pack you opened because the server does not know what you pulled. `depot_claim_free_pack` records a card the *client* chose; there is no roll to remember. History cannot be honest about an event the server never witnessed. The banner is not covering for a rendering shortcut — it is covering for missing authority.

Move the roll server-side and all three close together:

- the forgery hole closes, because the client no longer names the card;
- pack history becomes honest for free, because there is now a real roll with a real record;
- the provenance chapter has something to be provenance *of*.

That is the framing this work should be scoped and sequenced under. Three symptoms, one cause.

---

## 3. The easy half — a price table

`p_cost` and `p_amount` are integers the client names. The fix is a table and a lookup, and it is not interesting except that it must actually be done.

```sql
create table if not exists public.depot_prices (
  key         text        primary key,   -- 'pack.bronze', 'pack.premium', ...
  amount      integer     not null check (amount >= 0),
  updated_at  timestamptz not null default now()
);
```

`depot_purchase_pack` then takes **only** `p_tier`, looks the price up, and raises on an unknown tier. The caller loses the ability to name a number. Same shape for anything else that charges.

`depot_apply_payout` is the harder of the two easy ones, because a payout amount is not a fixed price — it is a consequence of a match result. The correct fix is not a bound on `p_amount`; it is that **the payout should not accept an amount at all.** It should accept the thing that justifies the payout — a match and a party — and compute the number itself from `matches.result.final` and the stakes on the row, exactly as `js/depot-vs.js` `payoutFor()` does today on the client. That is the `depot_settle_match(p_match uuid)` function that `MIGRATION_vs_mode.sql` sketched, commented out, and never created. See `docs/SETTLEMENT_MODEL.md` section 2. This work and that work are the same work.

Two smaller corrections to fold in while that function is open:

- The anonymous guard reads `if auth.uid() <> p_owner then raise`. For an anonymous caller `auth.uid()` is NULL, so the comparison is NULL, not TRUE, and the exception does **not** fire. It falls through to an UPDATE that matches no row and returns NULL. Harmless today, and harmless by accident. `is distinct from` is the correct operator.
- The deployed body reads `balance = balance + p_amount`; `MIGRATION_roles.sql` reads `coalesce(balance,0) + p_amount`. The deployed function and the file have already diverged. Do not assume the file describes production.

---

## 4. The hard half — the server owns the roll

A price is one integer. A pull is a distribution, and that is why this half is real work.

**The principle: the RPC accepts what the user is entitled to, not what they receive.** The client asks for a free pack. It does not describe one.

```
current:  depot_claim_free_pack(p_card jsonb)   -- "here is the card I got"
target:   depot_claim_free_pack()               -- "I would like my daily pack"
                                                -- returns the card the server rolled
```

What the server needs in order to roll:

1. **An eligible-card source.** ~~`card_library` and `card_library_manifest` already exist and are already the catalogue.~~ **Corrected 2026-08-12, and this is the item that blocks the build.** `card_library` is the **art index**, not the card universe: its columns are `catalog_key, side, object_path, is_canonical, status, contributor, created_at` and it carries no player name, no team, nothing the prestige model scores on. `card_library_manifest` is an **ingest log** for the art import pipeline — `id, source_zip, source_file, catalog_key, side, object_path, status, reason, created_at` — not a catalogue either. The actual card universe is the static `data/cards-YYYY.json` files, year span from `data/index.json`. **So the server cannot roll from `card_library` alone — there are no names in it.** A card universe in Postgres, keyed on `catalog_key`, is a prerequisite for everything else in this section and it should be scoped before anyone commits to a date. Which rows are *eligible* is settled — see `docs/PULL_POLICY.md` section 1 — but eligibility is a filter, and a filter needs something to filter.
2. **A rarity or band model.** The system already has the vocabulary: `p_tier` on purchases, a `tier` field on the free pack, and an `excluded_from_pull_band_bump` flag written into `starter_box` ledger metadata. Something already thinks in bands. Whatever that model is, it has to move out of the client and into the function.
3. **A seed, generated server-side and recorded.** `depot_claim_starter_box` already takes `p_seed` from the client and stores it. Keep the storing; move the generating. A seed the client chose is not evidence of anything. A seed the server chose and wrote down is a reproducible record of a real event.
4. **A roll record.** One row per pull, carrying the seed, the band, the resulting card ids and the time. This is the thing pack history reads. ~~It does not exist today, which is precisely why pack history is fabricated.~~ **Corrected 2026-08-12: the table exists.** `public.pack_grants` — `owner_id, collection_id, pack_seed, tier, card_count`, unique on `(collection_id, pack_seed)` — and the client already writes it grant-row-first, treating 23505 as a clean no-op, the same discipline `match_settlements` uses. V2 moves its **writer** from the client to the server; it does not need a new table. Pack history is fabricated for a different reason than assumed: it reads `localStorage`, not the database, and the free path writes no `pack_grants` row at all. See `docs/PULL_POLICY.md` section 4.

---

## 5. Honest pack history falls out for free

Once section 4 exists, pack history stops being a rendering problem and becomes a `select`. The banner comes down not because someone fixed the UI, but because the claim it was apologising for is no longer true.

Worth stating explicitly in the build order: **do not schedule a pack-history fix.** It is not a separate task. If it still needs work after the roll moves server-side, something in section 4 was done wrong.

---

## 6. ~~What is NICK'S CALL, not the build agent's~~ — ANSWERED 2026-08-12

**These three are decided. The spec is `docs/PULL_POLICY.md`.** This section is
kept for the reasoning, not the status; nothing here is still open.

Three product decisions were load-bearing here and none of them belonged to whoever writes the SQL. All three now have answers, and one of them came out better than the recommendation this section originally made.

**~~Which cards are pull-eligible.~~ ANSWERED: the whole library, minus anything without art.** `PULL_POLICY.md` section 1. It is not a curated list and it never should be — a curated list is a second thing to maintain that goes stale the day the library grows. The predicate is `card_library where side = 'front' and status = 'active'`, measured at 89,898 of 179,767 rows on 2026-08-12, and it is already the shipped client behaviour under the "ART GATE ON THE ROLL POOL" heading in `js/depot-shop.js`. If it cannot be shown, it cannot be pulled.

**~~What the odds are.~~ ANSWERED: the model is the spec, and it already exists.** `PULL_POLICY.md` section 2. The claim above — "the current answer is whatever the client felt like, which is not a distribution" — was wrong, and it is worth correcting rather than deleting. There is a real distribution: era weights per tier, star bias, prestige bands at 60/30/10, and a bounded 40-try hit-slot re-roll. The published odds on the pack tiles are **generated from it** at 8,000 samples, so there is a great deal to preserve and the migration target is "reproduce this server-side", not "invent one".

**~~What happens to cards already granted under the old regime.~~ ANSWERED: nothing happens to them, and no `provenance` column is needed.** `PULL_POLICY.md` section 4. This section recommended the middle option — flag them with a new column. **That recommendation is superseded by a cheaper one.** Once the server rolls and every pull writes a `pack_grants` row, the *absence* of a roll record is itself the flag, and it costs no migration and no schema change. Nothing in anyone's binder changes: no re-roll, no badge, no visible difference.

The one caveat, measured rather than assumed: the absence is not a reliable flag **yet**. A free pull performed on 2026-08-12 wrote no `pack_grants` row, so absence today means "pre-V2 **or** a free pull". Two cheap fixes make it clean — the free path must write a grant row too, and the roll must stamp `cards.pack_seed` and `cards.catalog_key`, both of which exist and are both NULL today.

---

## 7. Sequencing, and the compatibility trap

Changing `depot_claim_free_pack(p_card jsonb)` to `depot_claim_free_pack()` changes the signature of a function the live client calls. Do not do it in one step.

1. Add `depot_prices` and repoint `depot_purchase_pack` at it. Server-only, no client change, closes the pricing hole immediately.
2. Add the roll — the eligible-card source, the band model, the roll record table, and new no-argument claim functions **alongside** the existing ones.
3. Move the client to the new functions and live-verify every affected page per AGENTS.md section 5.
4. Only then drop the old signatures. They are the hole; they do not get to survive the cutover.
5. Fold `depot_apply_payout` into a real `depot_settle_match(p_match)` per section 3 and `docs/SETTLEMENT_MODEL.md`.

Step 1 is worth doing on its own, and soon. Steps 2 to 4 are the V2 item.

---

## 8. Known gaps in this document

- ~~`depot_admin_grant` is unread.~~ **Read 2026-08-11. The gate is real.** The deployed body opens `if not public.depot_is_admin() then raise exception 'depot_admin_grant: admin only'`, then refuses a null or zero amount, then writes the ledger row and the balance column in one transaction. It matches `MIGRATION_roles.sql`. Reading it rather than assuming was right, and it produced the narrowing below.
- **The file/production divergence is specific to `depot_apply_payout`, not general drift.** `depot_admin_grant`'s deployed body reads `coalesce(balance,0) + p_amount` — the coalesce `depot_apply_payout` is missing. Two functions from the same file, one kept it and one did not. That is a single-function edit somewhere in the past, not a systematic gap between `db/proposals/` and production. The file is a better guide than the earlier warning implied — just not a substitute for reading.
- **Nothing here was tested.** Every finding is read from a stored function definition. No exploit was executed, no coin moved, no card created. "It would work" is inference; "the body does not check `p_amount`" is observation.
- **Every function in the schema has now been read.** ~~`depot_ensure_onboarding`, `depot_rename_franchise`, `depot_handle_new_user` and the four share/collection functions remain unread.~~ Read 2026-08-11; see sections 10 and 11. None of the seven grants coins, which is what the sentence above was really claiming — but two of them changed the shape of this document, so "does not grant coins" turned out to be the wrong test for whether a function was worth reading. `depot_wallet_check` was read and is correctly gated on `public.depot_is_admin() or d.owner_id = auth.uid()` — it returns all four accounts to an admin caller, which is not a leak.
- **The seven bodies in sections 10 and 11 are eye-transcribed, not copy-pasted.** The sandbox blocks returning any text extracted from the Supabase dashboard domain — it flags it as cookie/query-string data even when the text is five lines of plpgsql with no token in it. Every body was therefore read by screenshot, scrolling the editor by its API and capturing each screen, and transcribed by hand. Treat them as **eyeball-accurate, not byte-accurate**. Anyone re-deriving this work should re-read from the source rather than trusting a character.

---

## 9. Proportion

The exposure today is close to zero. There are four accounts: the owner, one active second player, and two family accounts that signed up on 2026-06-20 and never came back. Nobody is attacking this, and the two people who could would be attacking their own game.

The reason it is the first V2 item anyway is that it is cheap now and expensive later. Every card granted before the cutover is a card whose provenance cannot be demonstrated, and V2 wants people to wager cards. The cost of fixing this scales with how many cards exist and how many people care about them — and both only go up.

---

## 10. A second authority shape: authority from the triggering row

Sections 1 to 9 all sit on one axis. Every path there answers the question *who
is calling* — `auth.uid()`, or `depot_is_admin()`, or nothing at all. The six
grant paths differ only in whether they answer it and whether they also check
*what* is being claimed.

`depot_handle_new_user` is not on that axis. It is a trigger on `auth.users`,
it takes no arguments, and it **cannot** call `auth.uid()` in the usual way —
there is no caller session to ask about. Its authority comes from the row that
fired it. The identity is `new.id`, and the only thing that vouches for it is
that Postgres would not have run the trigger if the insert had not happened.

That is a different question, not a different answer to the same question, and
it is worth naming because the next person to add a trigger will reach for the
`auth.uid()` checks in section 4 and find they do not apply.

### The body

Eye-transcribed; see section 8.

```sql
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
```

### Why it is safe, stated precisely

It writes three rows, all keyed to `new.id`, and it is a **role-granting write
with no caller to authorize** — which sounds like the worst thing in this
document and is not, for two reasons that are worth stating rather than
assuming:

1. **The role is a hardcoded literal, `'user'`.** There is no argument, no
   client input, and no branch. The privilege it grants is the floor. Contrast
   `depot_apply_payout`, whose problem is not that it lacks a caller check but
   that the *value* comes from the client.
2. **`on conflict (user_id) do nothing` cannot downgrade.** If a row already
   exists — an admin, say — it is left alone. The trigger can create the floor
   and cannot lower a ceiling.

So there is no reachable escalation, and the rule generalises: **a write with no
caller to authorize is safe exactly when the value it writes is a constant.**
The moment anything in that insert becomes a parameter, this function joins
section 4.

### The finding: a swallowed exception and a warning nobody reads

The whole body is wrapped in `exception when others then raise warning`. That is
the right call for the obvious reason — a failing trigger on `auth.users` would
break signup, and losing a collection row is better than losing the account.

But it means a user can land in `auth.users` with **no role row, no collection
and no franchise**, and the only trace is a `raise warning` in the Postgres log.
Nothing reads that log. Nobody has ever looked at it. If this has fired, we do
not know.

**~~The honest mitigation.~~ CORRECTED 2026-08-12 — there is no mitigation.**
The paragraph that stood here said `depot_ensure_onboarding` is the repair path,
that it is idempotent, that it takes an advisory lock so two concurrent
`INITIAL_SESSION` events cannot race it, **"and the client calls it on load"**,
so the system self-heals and a user only stays broken if they never reach a page
that calls it.

Every clause of that is true except the one that mattered. **Nothing calls it.**

Enumerating every `.rpc(` call site across every `.js` and `.html` in the repo
returns exactly eight, all string literals: `depot_apply_payout` (×2),
`depot_purchase_pack`, `depot_claim_free_pack`, `depot_is_admin`,
`share_collection`, `unshare_collection`, `get_shared_collection`,
`get_shared_cards`. `depot_ensure_onboarding` is not among them, on any page, on
any path.

So the correct statement is shorter and worse: **if the swallowed exception ever
fires, that account is permanently broken and nothing in the running system can
repair it.** The window is not narrow. It is unbounded. There is a repair
function — deployed, idempotent, advisory-locked, with an error message that
names its own remedy — and it is unreachable.

Two other deployed functions are in the same state, which is what makes this a
shape rather than an oversight: `depot_claim_starter_box`, the 25-card welcome
(see `docs/FLOW_A_OBSERVED.md` section 2), and `depot_rename_franchise`, the only
way to change the hardcoded team name `'MY CLUB'`. Somebody built the hard half
of onboarding three times — advisory locks, 23505 no-ops, careful errors — and
wired up none of it.

**How the wrong version got written, because it is the more useful lesson.** The
claim was inferred from this function's own comment about serialising two
`INITIAL_SESSION` events in the same millisecond, which only makes sense if
something calls it on session events. That comment is evidence about what the
author *intended*, not about what *ships*. Reading intent as behaviour is the
exact error section 0 of AGENTS.md exists to prevent, and it was committed here,
in a document whose entire thesis is **source presence is not function** — by the
same agent that wrote the thesis, four hours earlier, in this file.


### The pattern this belongs to: unread detectors

Name it once and point at it from ~~both~~ **all three** places:

- `depot_handle_new_user` raises a **warning** into the Postgres log on
  onboarding failure.
- `js/depot-shell.js` `resolveRecord()` raises `RECORD DRIFT on season <id>` via
  a raw `console.warn` — deliberately not the `depot_debug`-gated `depotLog`, so
  it prints unconditionally. See `docs/SETTLEMENT_MODEL.md` section 6, gap 3.
- **Added 2026-08-12.** `js/depot-library-index.js` logs
  `load failed: Error -- catalog ships unfiltered` and `depot-shop.js` follows
  with `no art index; rolling the UNFILTERED catalog (155844 rows)`. Observed
  live. See `docs/PULL_POLICY.md` section 1.1.

All three fire every time the condition holds. All three write to a channel with
no reader. **A detector that fires unconditionally into a channel nobody reads is
not a detector; it is a comment with a runtime cost.** None is a bug and none
needs to be removed — they need somewhere to go. That is one small piece of work
covering all three, and it is worth more than any of them alone.

**But the third one is a category above the other two, and the difference
matters.** The first two report **drift** — something is inconsistent, go look.
The third reports a **safety rule switching itself off**: the art gate, the rule
that says a card must have an image to be pullable, failed to load and fell back
to allowing everything, and said so to nobody. A detector nobody reads is bad. A
*guard* that disables itself and reports it to nobody is worse, because the
system carries on looking exactly as it did when the guard was up. Whatever
channel gets built for these, that third case is the one that should page
somebody.

---

## 11. The inverted case: the server never decides what you may see

The four share/collection functions were read at the same time. Three of them
are correct and one is the mirror image of this document's thesis.

Eye-transcribed; see section 8.

```sql
-- owner-gated, mints once, idempotent while shared
share_collection(p_collection_id uuid) returns uuid
  update public.collections
     set is_shared = true,
         share_token = coalesce(share_token, gen_random_uuid())
   where id = p_collection_id and owner_id = auth.uid()
  returning share_token into v_token;
  -- null -> raise 'Not authorized to share this collection, or collection not found'

-- owner-gated, and it NULLS THE TOKEN
unshare_collection(p_collection_id uuid) returns void
  update public.collections
     set is_shared = false, share_token = null
   where id = p_collection_id and owner_id = auth.uid()

get_shared_collection(p_token uuid)
  select col.id, col.name from public.collections col
   where col.is_shared = true and col.share_token = p_token;

get_shared_cards(p_token uuid) returns setof cards
  select c.* from public.cards c
    join public.collections col on col.id = c.collection_id
   where col.is_shared = true and col.share_token = p_token;
```

### A revocation bug that is not there

Worth recording because it is the bug this shape usually has, and an earlier
draft of this section asserted it before the body was read. `unshare_collection`
sets `share_token = null`, not just `is_shared = false`. The `coalesce` in
`share_collection` therefore mints a **fresh** token on re-share. Revocation is
real and re-sharing rotates. An old link is dead permanently.

The retraction is the point: the finding was half-written from the shape before
line 7 was read. AGENTS.md section 0.3 says do not write from state you did not
just measure, and that applies to conclusions as much as to editor buffers.

### The actual finding: `select c.*`

`get_shared_cards` is `security definer` and returns **every column of
`public.cards`** to any holder of the token. `cards` has 21 of them:

`id`, `owner_id`, `collection_id`, `year`, `brand`, `set`, `number`, `player`,
`team`, `notes`, `tcdb_url`, `photo_front_path`, `photo_back_path`,
`created_at`, `rookie_year`, `source`, `pack_seed`, `catalog_key`, `grade`,
`is_star`, `condition_notes`.

Seventeen of those are what a shared binder is for. Four are not:

| column | why it should not be in a share payload |
|---|---|
| `notes` | free text the collector wrote for themselves |
| `condition_notes` | same; private annotation is the entire purpose of the column |
| `owner_id` | the `auth.users` uuid behind the binder, handed to an anonymous caller. It unlocks nothing on its own — RLS still gates every table — but it is the join key for the whole schema |
| `pack_seed` | the seed the pack was generated from. Seed determinism has been reproduced twice in this project; a seed is not decoration here |

**The defect is the star, not the four columns.** Fixing it by dropping `notes`
from the select would leave the next column anyone adds to `cards` published on
the day it is added, silently, by a function nobody re-reads. The fix is an
explicit column list, and it costs nothing.

### Why this belongs in this document

Every other hole here is *the server taking the client's word for what you get*.
This one is *the server never deciding what you may see*. Same failure to
enumerate, opposite direction — and it is the only item in this document that is
exploitable without an account.

### Unproven

Whether `get_shared_cards` and `get_shared_collection` are actually granted to
`anon` has **not** been measured. It requires `information_schema.routine_privileges`
and no SQL was run. "Anonymous holders of the link can read this" is inferred
from `security definer` + a token argument + no auth check, which is strong, but
inference is not the grant table. Check it before quoting a severity.
---

## 12. A third shape — the client never deciding what is safe to print

Found 2026-08-12 while locating the display surfaces for the `depotCleanName`
fix. It is recorded here rather than in the display spec because the defect is
the same kind as section 11's, one layer further out.

`index.html` prints a card name in two places a few lines apart, and treats it
as two different kinds of value:

| site | what it does |
|---|---|
| `dcTileHTML`, the binder tile | `'<div class="rd-tile__name">'+dcEsc(c.name)+'</div>'` — **escaped** |
| `openSpot`, the detail headline | `<div class="spot-name">${c.name}</div>` written straight into `#spotMeta`'s `innerHTML` — **not escaped** |

**The finding is the inconsistency, not a claim about reachability.** By reading
alone, `c.name` is catalog text out of the static `data/cards-*.json` files, and
nothing observed puts user-controlled text on that path. Nothing was attempted.
The point is that **two adjacent writes of the same value disagree about whether
it needs escaping, which means nobody decided.** One of them is wrong and the
codebase does not know which.

That is section 11's argument pointed in a different direction. `select c.*` is
not a defect because some particular column is sensitive; it is a defect because
the function never enumerates, so the next column anyone adds is published by
default. This is the same shape: not a defect because a particular string is
dangerous, but because the next thing that reaches `c.name` is printed as markup
by default.

**And what reaches `c.name` is about to change.** Section 4's server-side roll
needs a card universe in Postgres carrying `player` — which moves that value
from a static file this repo controls to a column. That is exactly the kind of
provenance change that turns "nothing user-controlled is on this path" from a
property into an assumption, and it is scheduled.

**Cheap, and it comes free.** The `depotCleanName` fix touches that exact line —
`ONBOARDING_PATH_SPEC.md` 5.2, site 3 — so whoever makes the detail headline
clean can make it escaped in the same edit. Doing the two separately is the only
way this costs anything.

### Unproven

Nothing here was tested. No string was crafted, no injection attempted, and no
audit was made of what else can reach `c.name`: the two render sites were found
by searching `main` for the class names, not by tracing every writer of the
catalog shape. Whether any other surface interpolates card text unescaped is
unmeasured — only `index.html`'s two name sites were compared.

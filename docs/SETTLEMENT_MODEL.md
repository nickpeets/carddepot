# SETTLEMENT_MODEL.md — how coins actually move in Card Depot

Status: **description of what is deployed**, not a proposal. Nothing here is a fix and nothing here is queued. Read it before you touch the money path.

Written 2026-08-11, after a session spent misdiagnosing this architecture as broken when it is not. The misdiagnosis is recorded in section 7 on purpose, because the shape of the mistake is more instructive than the conclusion.

Every claim below was read out of the deployed build: the live files were SHA-256'd against the repo and came back byte-identical, seven for seven. Where a claim comes from a `db/proposals/*.sql` file rather than from the database itself, it is marked **UNCONFIRMED AGAINST PRODUCTION**.

---

## 1. Settlement is a PULL, not a push

There is no server-side actor that decides a match is over and pays both parties. No trigger, no cron, no edge function, no `depot_settle_match`.

Instead: **each party settles their own side, from their own browser, the next time they open the VS surface.**

The whole of it is `vs.html`, in the paint loop:

```js
rows.forEach(function(m){
  if(m.status!=='played'){ return; }
  window.DepotVs.settle(m).then(function(r){ /* paint the result into the row */ });
});
```

`js/depot-vs.js` `settle(row)` then:

1. refuses season SELF-matches (`challenger_id === opponent_id`) — see section 5;
2. refuses anything whose `status !== 'played'`;
3. resolves the caller's own uid;
4. derives the outcome for **that uid only** — `roleOf(row, me)` and `scoresOf(row)`, read off `matches.result.final`;
5. inserts **one** `match_settlements` row, for that uid;
6. and only if that insert succeeded, credits `wallet_transactions` and calls `depot_apply_payout`.

Payouts are fixed and declared in one place, `js/depot-vs.js`:

```js
var PURSE = 100;
var CONSOLATION = 15;
```

Win pays 100. Loss pays 15. A tie pays 15 (`challenge_tie`). The house pays; nothing is taken from the other party. A match with both parties settled costs the house 115 coins, or 30 on a tie.

### The consequence that surprises people

A party who never opens `vs.html` is never paid. Not paid late — not paid at all, until the day they load that page. Their side of every match they have ever played sits unclaimed, and nothing anywhere notices.

This is not a bug in the sense of code doing something other than what it says. It is the honest consequence of a pull model, and it is stated here as **gap 1** (section 6) so the next reader does not rediscover it as an emergency.

---

## 2. Why the client cannot pay the other side even if it wanted to

From `db/proposals/MIGRATION_vs_mode.sql`. **UNCONFIRMED AGAINST PRODUCTION:**

```sql
alter table public.match_settlements enable row level security;

create policy match_settlements_select_own on public.match_settlements
  for select using (owner_id = auth.uid());

create policy match_settlements_insert_own on public.match_settlements
  for insert with check (owner_id = auth.uid());

-- No update/delete policy on purpose: a settlement is an audit row, not state.
```

`with check (owner_id = auth.uid())` is the load-bearing line. A settlement row whose `owner_id` is not the caller is rejected by the database. Any "fix" that adds a second client-side insert for the opponent will fail against RLS — and it will fail into the DDL-missing warning branch, which is quieter than it should be.

If two-sided settlement is ever wanted, it has to move server-side, into a `security definer` function. The migration file already sketches it and deliberately leaves it undone:

```sql
-- create or replace function public.depot_settle_match(p_match uuid)
--   returns void language plpgsql security definer as $$
--   begin
--     -- read the match, decide the winner from result->'final', insert BOTH
--     -- match_settlements rows in one statement (23505 = already settled),
--     -- then apply both balance deltas. One writer, one transaction.
--   end; $$;
```

The reasoning for deferring it is worth keeping: v1 settles client-side under RLS, "the same trust model every other payout in this app already uses... That is acceptable for a friendly coin purse among five known users and NOT acceptable the moment cards can change owner."

---

## 3. The composite primary key is load-bearing

**UNCONFIRMED AGAINST PRODUCTION.** Confirming it is the single most valuable query anyone can run against this schema, because it is the entire idempotency guarantee for a sweep that re-runs on every page paint.

```sql
create table if not exists public.match_settlements (
  match_id   uuid        not null references public.matches(id) on delete restrict,
  owner_id   uuid        not null references auth.users(id)     on delete restrict,
  role       text        not null check (role in ('challenger','opponent')),
  amount     integer     not null check (amount >= 0),
  won        boolean     not null default false,
  created_at timestamptz not null default now(),
  primary key (match_id, owner_id)
);
```

The migration file's own argument for the composite key, reproduced verbatim because it is the exact reasoning a future agent is most likely to get backwards:

> WHY THE KEY IS (match_id, owner_id) AND NOT match_id ALONE.
> AGENTS.md 4, the canonical incident: the unique key must sit at the
> granularity of the thing being deduped. The thing being deduped here is ONE
> PAYOUT PER PARTY PER CHALLENGE - both the winner and the loser settle exactly
> once. A single-column unique on match_id would reject the second party's row,
> which is the unique-on-pack_seed mistake wearing a different hat.
> The ledger row is inserted FIRST; a 23505 means already settled and the client
> returns a clean no-op that transfers nothing.

### The 23505 no-op

Ledger-first is the discipline. The `match_settlements` insert happens **before** any coin moves, and its failure mode is the safety mechanism:

```js
if (ins.error.code === '23505') {
  // 'settle: match ... already settled for this party - clean no-op, no coins moved'
  return { ok: true, noop: true, amount: pay.amount, label: pay.label };
}
```

`credit()` is only reachable on a successful insert. That is why `vs.html` can re-run the sweep on every paint without minting anything, and why the sweep is safe to leave running.

Note the asymmetry that makes it work: the settlement insert is the idempotency key, and `wallet_transactions` is deliberately **not** unique on `match_id` —

> Non-unique on purpose: a match can produce two wallet rows (one per party),
> exactly as a pack produces five cards that share one seed. The dedupe lives in
> match_settlements, not here.

---

## 4. Where a balance actually lives

Four objects, and only one of them is a table anyone should treat as truth.

| object | kind | role |
|---|---|---|
| `franchises.balance` | **stored integer column** | the balance. What the coin chip renders. |
| `wallet_transactions` | table | the ledger: `(owner_id, amount, reason, match_id, meta)` |
| `depot_economy_ledger` | **view** | analytics cut of `wallet_transactions` |
| `depot_balance_drift` | **view** | reconciliation report, franchises vs ledger sum |

`franchises.balance` has **at least three writers**, not one. Confirmed against production
2026-08-11: `depot_apply_payout`, `depot_purchase_pack` and `depot_admin_grant` all update the
column, and the latter two do it directly rather than by calling the payout RPC. An earlier
revision of this document claimed a single writer; that was wrong, and it made the
"nothing enforces `balance = sum(ledger)`" problem below look smaller than it is. More writers
means more places to forget the ledger half.

The canonical one is the RPC `depot_apply_payout(p_owner, p_amount)`:

```sql
update public.franchises set balance = coalesce(balance,0) + p_amount
 where owner_id = p_owner;
```

It is called from `js/depot-vs.js` (settlement) and `js/depot-wallet.js` (everything else: packs, the exhibition trickle, admin grants). It is called **from the client**, with the client naming both arguments.

From `MIGRATION_roles.sql` section 3, verbatim, and this is the sentence to remember:

> franchises.balance is a STORED column, not a view over wallet_transactions,
> and NO trigger mirrors ledger inserts into it. Nothing enforces
> balance = sum(amount). There is no reconciliation job, no constraint, no
> check. The only thing standing between the ledger and the balance is that
> every writer remembered to move both.

### And nothing enforces a floor

Read off the dashboard 2026-08-11, `public.franchises` has five columns — `id`,
`owner_id` (unique, FK), `team_name`, `created_at`, `balance`. `balance` is
`int8`, `not null`, **default 0**, and the constraints column shows only
`NON-NULLABLE`. There is no `check (balance >= 0)`.

Two useful things follow. The first is reassuring: a new account starts at zero,
so **onboarding is not a grant path**. Neither `depot_handle_new_user` nor
`depot_ensure_onboarding` names a balance; they insert `(owner_id, team_name)`
and take the default. That closes a question this document used to leave open.

The second is not. Three facts compose:

1. no `check (balance >= 0)` on the column;
2. `depot_apply_payout` accepts any `p_amount`, positive or negative, with no
   validation — see gap 4 and `docs/GRANT_AUTHORITY.md`;
3. `depot_wallet_repair` sets `balance = sum(amount)` over the ledger, with no
   floor of its own.

So a negative balance is representable, reachable from the client, and
reachable from the repair tool that exists to fix balances. Nothing would raise,
nothing would log, and the coin chip would render it. This is not a live problem
— the reversal in `db/proposals/REVERSAL_self_match_settlements.sql` uses
`depot_apply_payout` with a negative amount **on purpose**, per that file's own
comment, which is exactly why the column cannot simply be constrained without
thinking about it first.

**Repair shape:** decide whether negative is legal before adding the check. If
it is not, the constraint belongs on the column and the reversal needs a
different mechanism. If it is, say so here and stop treating it as an oversight.
What is not defensible is the current state, where nobody has decided.

### An empty `depot_economy_ledger` does not mean an empty ledger

State this plainly, because getting it wrong cost a session:

```sql
create or replace view public.depot_economy_ledger with (security_invoker = true) as
select w.*
  from public.wallet_transactions w
  left join public.user_roles r on r.user_id = w.owner_id
 where coalesce(r.role, 'user') <> 'admin'
   and w.reason <> 'admin_grant'
   and coalesce(w.meta->>'exclude_from_economy_analytics', 'false') <> 'true';
```

It is a **view**, and it excludes every row belonging to an admin account. On a project with five users, one of whom is the admin who has played nearly every game, an empty `depot_economy_ledger` is the *expected* reading. It is not evidence that no money has moved. To find out whether money has moved, query `wallet_transactions`.

`depot_balance_drift` is likewise a view, not a table: one row per franchise with `balance_column`, `ledger_sum`, `drift`, `ledger_rows`. It exists precisely because nothing reconciles automatically. Repair is manual and admin-gated — `depot_wallet_repair(uuid)`, which sets `balance = sum(amount)` and returns before/after as JSON.

---

## 5. Season self-matches never settle

Season Mode rides the `matches` pipeline. A season game is a **self-match**: `challenger_id === opponent_id`. Settling one pays the full friendly purse for playing yourself, and once did:

> production minted ~1,300 coins across 13 self-settlements when settlement went
> live 2026-08-02.

The fix is defence in depth, deliberately in two places: `listMine()` drops self-matches from the candidate query, and `settle()` refuses them again on the way in, "whatever path delivered it (settleById, a future caller, a stale cached row)."

Anything that adds a new caller into the settlement path must carry the same refusal. It is not optional and it is not a filter you can move.

---

## 6. The genuine gaps

These are gaps, not bugs. Nothing here is code failing to do what it says.

**Gap 1 — a party who never returns is never paid.** Settlement is a pull, so balances are correct only for *active* users. An inactive party's coins are not lost and not owed to anyone else; they simply have not been minted yet, and the system has no way to notice or to tell anyone. The first login of a long-absent player settles everything at once. That is correct behaviour, but it is not obviously *intended* behaviour to anyone reading a balance chip today, and it should be expected rather than discovered.

**Gap 2 — nothing reconciles against `match_settlements`.** `depot_balance_drift` compares `franchises.balance` to `sum(wallet_transactions.amount)`. It cannot see a settlement that inserted its `match_settlements` row and then failed to reach `franchises.balance`, because in that scenario the wallet row is missing too, so column and ledger still agree and drift reads zero. `match_settlements` is the only record that a payout was *owed*, and no detector reads it. A left join from `match_settlements` to `wallet_transactions` on `(match_id, owner_id)`, looking for the null side, would close this.

**Gap 3 — `seasons.wins` / `seasons.losses` can be silently wrong.** They are denormalised counters maintained client-side by read-then-write in `game/season.js` `recordSeasonResult()` — the pattern AGENTS.md section 4 bans. Nothing displays them: `js/depot-shell.js` `resolveRecord()` deliberately **counts** `season_games` rows instead, and says why —

> the displayed W-L is COUNTED from season_games, not read from
> seasons.wins/losses. Those columns are denormalized counters maintained
> client-side by read-then-write (season.js recordSeasonResult) - the section 4
> banned pattern - so they can drift silently. Counting the game rows is always
> true.

So the chip cannot lie, and the stored counters can be wrong indefinitely without anyone noticing. There *is* a detector: `resolveRecord()` logs `RECORD DRIFT on season <id> - stored A-B vs counted C-D` whenever they disagree, and it logs through a raw `console.warn`, not through the `depot_debug`-gated `depotLog`. It is unconditional, it has been able to print on every page load for as long as it has existed, and nobody has ever read it. The detector is not the problem. Reading it is. This is one of two unread detectors in the system — the other is the `raise warning` inside `depot_handle_new_user`, which reports a half-created account into the Postgres log. The pattern is named once in `docs/GRANT_AUTHORITY.md` section 10, and closing both is one piece of work.

**Repair shape for gap 3:** recount from `season_games` and write the result back into `seasons` — the same computation `resolveRecord()` already performs on every page load. Cheap, and idempotent by construction.

**Gap 4 — every grant path checks *who* and takes the client's word for *what*.**
Five `SECURITY DEFINER` RPCs were read against production on 2026-08-11. All five authenticate
correctly and all five authorise correctly. None of them validates the value being granted:

| function | identity / concurrency | value |
|---|---|---|
| `depot_apply_payout` | `auth.uid() <> p_owner` raises | `p_amount` unbounded, unchecked |
| `depot_purchase_pack` | `auth.uid()`, `FOR UPDATE` lock, one transaction | `p_cost` client-named, never checked against `p_tier` |
| `depot_claim_free_pack` | `auth.uid()`, 24h cooldown enforced server-side | the entire card comes from `p_card` |
| `depot_claim_starter_box` | `auth.uid()`, PK-gated once-only, count fixed at 25 | all 25 cards come from `p_cards` |
| `depot_wallet_repair` | admin-gated | derives its own number from the ledger — the exception |

This is one habit applied five times, not five defects. The hard parts — identity, idempotency,
row locking, rate limiting — are done, and several are done well. The easy part is missing
everywhere: there is no server-side source of truth for the thing being handed out.

Two notes on the deployed bodies, because they matter more than the summary. `depot_apply_payout`
guards with `if auth.uid() <> p_owner`, which evaluates to NULL rather than TRUE for an anonymous
caller, so the exception does not fire; the UPDATE then matches no row and it returns NULL.
Harmless today, and harmless by accident — `is distinct from` is the correct guard. The deployed
body also reads `balance = balance + p_amount` where `MIGRATION_roles.sql` reads
`coalesce(balance,0) + p_amount`, so the deployed function and the proposal file have already
diverged.

**Repair shape for gap 4:** a server-side price table for `p_cost` and `p_amount`, and
`card_library` as the authority for what a pull produces. See `docs/GRANT_AUTHORITY.md`.

---

## 7. The misdiagnosis, recorded

On 2026-08-11 a session observed that all 17 rows in `match_settlements` belonged to one uid, that the second player's uid appeared zero times, and concluded that settlement was one-sided: that only the user who pressed the button was ever paid, that the 100/15 pair had never both existed, and that the settlement path was the top defect in the codebase and needed a server-authoritative rebuild.

Every observation was accurate. The conclusion was wrong.

What the row distribution actually showed was a **second player who had not opened the VS surface
since those matches were played**. Under a pull model that produces exactly the distribution
observed, and it produces it from a system working as designed.

A first pass at this correction went too far the other way and asserted the second player had
*never logged in*. That is also false, and it is recorded here because being wrong twice about
the same person is the instructive part. Authentication → Users on 2026-08-11 shows
`timwstout@gmail.com` created 2026-06-20 21:06:13 -0700 with a last sign-in of
**2026-08-05 18:07:40 -0700** — six weeks later, so a real return session and not the auto-login
that stamps signup. The dates are what close it: sixteen of the seventeen settlement rows were
written in one second on 2026-08-02, and the newest match was played 2026-08-10. His 5 August
visit fell in the gap. He has logged in; he has not been to `vs.html` with anything settleable
waiting.

The lesson is narrow and worth stating: **a distribution of rows is evidence about the population that wrote them, not only about the code that writes them.** Before concluding that a writer is broken, establish that everyone who should have invoked it actually could.

The correction came from reading two lines of DDL — the RLS insert policy and the composite primary key — neither of which is visible from the data.

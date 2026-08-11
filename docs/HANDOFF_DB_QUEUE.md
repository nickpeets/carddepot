# HANDOFF_DB_QUEUE.md — the database work the browser agent could not do

Status: **handoff to the codespace agent.** Written 2026-08-11. Everything here is measured; nothing here is written yet.

---

## 0. Two things to know before you start

**The Supabase SQL editor does not work in the browser path.** Fifteen attempts across three tabs and two reload strategies, including a hard reload with cache bypass. It renders its toolbar — Run, Role postgres, Limit 100 rows, Autosave enabled — then two spinners that never resolve, `document.querySelector('.cm-content')` stays null past sixty seconds, and eventually `document.body.innerText` is length zero. No console errors on any attempt. Every other dashboard surface loads fine on the same session: Database → Functions, Indexes, Policies, and the Table Editor all returned data. It is that one bundle. **Do not spend a cycle rediscovering this.** Use psql-shaped access and ignore the dashboard.

**`db/proposals/` describes intent, not deployment.** Both `MIGRATION_vs_mode.sql` and `MIGRATION_roles.sql` said QUEUED / NOT EXECUTED while every object in them existed in production; both headers have now been corrected to say so. The proof that this is not merely a stale label: the deployed `depot_apply_payout` body reads `balance = balance + p_amount` where `MIGRATION_roles.sql` reads `coalesce(balance,0) + p_amount`, and its guard uses `<>` where `is distinct from` is correct. **Read the stored definition before trusting any function body in that directory.**

---

## 1. The target — item 6, the self-match settlement reversal

Measured by reading rows in the Table Editor, not by group-by. Treat every number below as an **expected result to verify**, not as an input to a write.

`public.match_settlements` holds **17 rows**, every one with `owner_id = 9e4e47d2-8836-4100-b846-fe1bb059fded` (Nick). Sixteen were created `2026-08-02 21:24:26`–`27`, inside one second — the settle sweep firing once when settlement went live and back-settling everything then. The seventeenth is `46ff69f7`, created `2026-08-10 18:12:00`.

**Four are genuine VS matches against Tim** (`9861ce0d-e081-4123-b445-041dfed6cf34`):

| match | challenger | opponent | Nick's row |
|---|---|---|---|
| `46ff69f7-4d0e-4d02-9d70-5a26e496da4e` | Nick | Tim | 100, `won = TRUE` |
| `7769b479-3ac9-414b-b826-8275d310...` | Nick | Tim | 15, `won = FALSE` |
| `af16f852-33eb-43cd-bf7d-e0bd08959...` | Nick | Tim | 15, `won = FALSE` |
| `e074bcd1-a1d6-4f77-a112-021e4f3555...` | **Tim** | Nick | 15, `won = FALSE`, `role = 'opponent'` |

**The other 13 are self-matches** — `challenger_id = opponent_id` — all `100 / won = TRUE`, all written in that one second on 2026-08-02. Season games riding the matches pipeline. `js/depot-vs.js` describes the incident in its own words: "production minted ~1,300 coins across 13 self-settlements when settlement went live 2026-08-02." 13 × 100 = 1,300. The arithmetic closes exactly.

The filter that prevents a recurrence is deployed — `listMine()` drops self-matches from the candidate query and `settle()` refuses them again as defence in depth. The money the incident already minted was never taken back. That is what `db/proposals/REVERSAL_self_match_settlements.sql` is for.

### The reversal is worth more than it looks

Those same 13 rows are why the VS record chip reads **14-3**: fourteen settlement rows with `won = TRUE`, three with `won = FALSE`. Thirteen of the fourteen are Nick beating himself. **His real VS record is 1-3** — Tim leads 3-1. The reversal corrects the coin balance and the displayed record in one operation. Both distortions have the same cause and the same fix.

---

## 2. Verify before writing — seven queries

None of these writes. Run them all, and reconcile against the expected results before touching anything.

1. **The split.** Group `match_settlements` joined to `matches`, partitioned on `challenger_id = opponent_id`. Expect **13 self, 4 real**.
2. **The amount.** Sum `amount` over those 13. Expect **1,300**.
3. **Tim's exposure.** Played matches he is a party to, excluding self-matches, with his side's outcome. Expect **4 matches and 315 coins owed** — three wins at 100, one loss at 15. This gates the Resend decision, so it wants to be right.
4. **`select * from public.depot_wallet_check()`** — the drift detector, which has a callable form nobody has ever run. Same shape as the `depot_balance_drift` view.
5. **Season counter drift.** Count `season_games` per season by `result` and compare against `seasons.wins` / `seasons.losses`. Those columns are maintained client-side by read-then-write and **nothing displays them** — `resolveRecord()` counts the rows instead — so they can have been wrong indefinitely with nobody noticing. Repair is the same recount the renderer already performs.
6. **Gap 2 made visible.** Left join `match_settlements` to `wallet_transactions` on `(match_id, owner_id)` and look for the null side: a settlement that was recorded as owed and never reached `franchises.balance`. No detector reads `match_settlements` today, so this has never been checked.
7. **`depot_admin_grant` body.** The one grant path in the set that was never read. See `docs/GRANT_AUTHORITY.md` section 8.

---

## 3. Rules for the write

**There is no point-in-time recovery on this project.** The before-state printout IS the backup. Print all 13 rows in full — every column, no truncation — before anything is written, and keep the output.

The reversal SQL in `db/proposals/REVERSAL_self_match_settlements.sql` was written before this measurement existed. Read it against the numbers above before running it; its notion of the target should match 13 rows and 1,300 coins, and if it does not, that discrepancy is the first thing to resolve.

Balance adjustments go through the existing convention — `depot_apply_payout` with a negative amount — per that file's own comment. Note that the function returns NULL rather than raising if there is no franchise row, and that its `<>` guard does not fire for a NULL `auth.uid()`; neither matters for an admin-run reversal, but both are worth knowing before relying on its return value.

---

## 4. What is already confirmed, so you don't re-derive it

Read off the Supabase dashboard 2026-08-11:

- `match_settlements_pkey` is composite on **`(match_id, owner_id)`**. No unique on `match_id` alone exists anywhere in the schema. This is the whole idempotency guarantee for the settle sweep.
- `match_settlements` has RLS enabled with exactly two policies, `match_settlements_insert_own` (INSERT) and `match_settlements_select_own` (SELECT). No UPDATE, no DELETE — settlements are audit rows.
- `franchises_owner_uidx` exists on `franchises (owner_id)` — one franchise per owner is enforced.
- `wallet_transactions_match_idx` on `(match_id)` is non-unique, as designed.
- `depot_balance_drift` and `depot_economy_ledger` are **views, not tables**. An empty `depot_economy_ledger` means every ledger row belongs to an admin account or carries the analytics-exclusion flag — **not** that no money has moved. That misreading cost a session.
- `depot_settle_match` **does not exist** in production. Confirmed against the full function list.
- 4 auth users, not 5: Nick, Tim, and two accounts created 2026-06-20 whose `last_sign_in_at` equals their `created_at` to the second. Tim's last sign-in is 2026-08-05 18:07:40 -0700.

---

## 5. Related work, already specced

- `docs/SETTLEMENT_MODEL.md` — how settlement actually works, and its four gaps.
- `docs/GRANT_AUTHORITY.md` — the grant-path validation hole. First item in the V2 build.
- `docs/RESTAMP_SPEC.md` — the cache-bust stamps. 91 tags across seven files, low priority, scripted.

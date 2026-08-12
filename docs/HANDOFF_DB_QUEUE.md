# HANDOFF_DB_QUEUE.md — the database work the browser agent could not do

Status: **handoff to the codespace agent.** Written 2026-08-11. Everything here is measured; nothing here is written yet.

---

## 0. Three things to know before you start

**The numbers in section 1 are CONFIRMED, not tallied.** An earlier revision of this file said they were read off Table Editor rows by eye. They have since been re-derived with real group-bys — see section 2A for how, and for why the SQL editor was never the only way in.

### The other two

**The Supabase SQL editor does not work in the browser path.** Fifteen attempts across three tabs and two reload strategies, including a hard reload with cache bypass. It renders its toolbar — Run, Role postgres, Limit 100 rows, Autosave enabled — then two spinners that never resolve, `document.querySelector('.cm-content')` stays null past sixty seconds, and eventually `document.body.innerText` is length zero. No console errors on any attempt. Every other dashboard surface loads fine on the same session: Database → Functions, Indexes, Policies, and the Table Editor all returned data. It is that one bundle. **Do not spend a cycle rediscovering this.** Use psql-shaped access and ignore the dashboard.

**`db/proposals/` describes intent, not deployment.** Both `MIGRATION_vs_mode.sql` and `MIGRATION_roles.sql` said QUEUED / NOT EXECUTED while every object in them existed in production; both headers have now been corrected to say so. The proof that this is not merely a stale label: the deployed `depot_apply_payout` body reads `balance = balance + p_amount` where `MIGRATION_roles.sql` reads `coalesce(balance,0) + p_amount`, and its guard uses `<>` where `is distinct from` is correct. **Read the stored definition before trusting any function body in that directory.**

---

## 1. The target — item 6, the self-match settlement reversal

**CONFIRMED 2026-08-11 by group-by** (see section 2A). These are results, not estimates. Re-check them anyway before writing — but expect them to hold.

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

## 2A. How to query without the SQL editor

The Supabase SQL editor never hydrated. That is a broken **path**, not an unreachable **resource**, and the distinction cost forty minutes before it was noticed.

Nick's browser is signed in to thedepot.cards, and every page carries an authenticated Supabase client. From the page console:

    const sb = depotSB();
    const m = await sb.from('matches').select('*');
    const w = await sb.rpc('depot_wallet_check');

That runs as Nick, under RLS, and it is how every number in section 1 was confirmed. `depot_wallet_check()` returns all four accounts because Nick is flagged `role = 'admin'` in `user_roles` and the function gates on `public.depot_is_admin() or d.owner_id = auth.uid()`. It is correctly gated; the all-rows result is not a leak.

Use it. It will not cover writes or anything RLS hides from Nick, but it covers most of section 2.

---

## 2B. Wallet state as of 2026-08-11

    owner                     team          balance   ledger_sum   drift   rows
    Nick    9e4e47d2...       MY CLUB        93,945      93,945      0      49
    Tim     9861ce0d...       Tim's Club     91,850      91,850      0      14
            e04ef721...       MY CLUB             0           0      0       0
            0e6e7dcd...       MY CLUB             0           0      0       0

**Drift is zero on all four.** The reconciliation gap in SETTLEMENT_MODEL.md is real as a design flaw and clean as a fact today.

Nick's 49 ledger rows by reason, summing to 93,945:

    admin_grant       1    +100,000
    challenge_win    14      +1,400     <- 13 of these are the self-match incident
    challenge_loss    3         +45
    exhibition_win    6        +150
    free_pack         9           0
    pack_purchase    16      -7,650

**After the reversal, challenge_win should read 1 row / +100 and Nick's balance 92,645.** That is the acceptance check.

`select id from depot_economy_ledger` returns **0 rows** — observed. Nick is the only account with ledger rows and he is flagged admin, so the analytics view excludes everything. Expected, not alarming.

---

## 2C. Three corrections to earlier statements in this repo

1. **Match dates.** The Nick-vs-Tim matches were created 2026-06-26 to 06-30. The `2026-08-10` figure carried in the session constants is the **settlement** timestamp, not the play date. That matters: the 2026-08-02 sweep back-settled games that were months old.
2. **"MY CLUB" is a stored value, not a fallback.** `resolveRecord()` returns it because `franchises.team_name` literally contains it on three rows, not because the `|| 'MY CLUB'` default fired.
3. **Tim is not a ghost account.** Franchise "Tim's Club", 91,850 coins, 14 ledger rows, last sign-in 2026-08-05. He has been playing. What he has not done is open `vs.html` since those four matches were played.

---

## 2D. Item 0 — the auth trail for Tim, and a contradiction left standing

Two events in the Supabase Auth logs, read 2026-08-11. Raw, unedited:

```
{"level":"info","msg":"mail.send","mail_type":"recovery","mail_from":"noreply@mail.app.supabase.io","time":"2026-08-11T20:14:53Z"}
{"level":"info","msg":"mail.send","mail_type":"recovery","mail_from":"noreply@mail.app.supabase.io","time":"2026-08-10T17:56:28Z"}
```

**`mail.send` at level info is a handoff record, not a delivery receipt.** It says
GoTrue handed the message to the SMTP provider. It says nothing about whether the
provider accepted it, whether it was queued, throttled, bounced, or dropped into a
spam folder. Reading it as proof of delivery is the same class of error as reading
source presence as function.

Org membership, read from the platform API the same day:

```
The Depot            (Pro,  klbdfqbjisukpnbonknf) -> ["nickpeets@gmail.com"]
nickpeets's Org      (Free, fnezbapbopvdukgvpuvb) -> ["nickpeets@gmail.com"]
```

**Both organizations have exactly one member.** Tim is not an org member of either.

### The contradiction

This does not fit the standing correction recorded in this repo, which held that
Tim receives auth mail because he is an org member and the project is on the
default Supabase SMTP, whose delivery is restricted to org members. Two readings
survive the evidence and the evidence does not choose between them:

1. **Nick's testimony is right and the mechanism is misdescribed.** Nick reports
   Tim received mail. If that happened, org membership is not what allowed it,
   because Tim has none. Something else governs delivery — a project-level
   allowance, a setting nobody has read, or the restriction not applying the way
   the correction assumed.
2. **The mail was handed off and never arrived.** The log lines are consistent
   with this too, since `mail.send` at info is a handoff, and the restriction
   would then be doing exactly what it says.

**Correction, and it is pointed at the agent, not at Nick.** The "org member by
design" line was written by an agent as an explanation and then carried forward
in this repo as though it were an observation. It was never verified against the
member list. It is now contradicted by it.

This is recorded as **unresolved**. Hypothesis 2 is not the safe default just
because it is tidier; hypothesis 1 rests on a person saying what he saw, and a
membership list cannot overturn a report of receipt — it can only show that the
stated mechanism was wrong.

### The residue that survives either way

**Whatever governs delivery to Tim, it is not org membership, because he has none.**
Any plan that depends on Tim getting an email — the Resend cutover, a recovery
link, an invite — cannot lean on the org-member argument. It has to be tested.

**The test is one text message, not a query.** Ask Tim whether the mail arrived
and when. No amount of SQL settles this, because the thing in question happened
outside the database.

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
- `docs/BOXSCORE_RUN_ATTRIBUTION.md` — the box score headline disagrees with its own line score. Display-only, no money affected, but it contains a real sim-engine defect: a run credited to a batter who was never on base.

# FLOW_A_OBSERVED.md — what a brand-new player actually gets

Status: **observation, not design.** This is the first time anyone has watched
the new-player path on this product from the outside. It is written down because
V2's Flow A was specified to replace a surface nobody had ever looked at.

Observed 2026-08-12 against production, signed in as a real account created the
night before. Every number below was read out of the database or off the screen.
Nothing here is inferred from source unless it says so.

---

## 0. The account

| field | value |
|---|---|
| email | `wbatlee2020@gmail.com` |
| uid | `baf715ac-a5ff-477d-934a-e141ebebdcb4` |
| `created_at` | 2026-08-12T00:51:25.164695Z |
| `email_confirmed_at` | 2026-08-12T00:51:25.260034Z |
| first return sign-in | 2026-08-12T15:51:23Z |

Confirmation landed **96 milliseconds** after creation, so nothing about this
account waited on an email. That matters: it means the observations below are of
a *clean* signup, not of one that limped through the delivery problem recorded
elsewhere in this repo.

---

## 1. What the trigger did — it worked

`depot_handle_new_user` fired and did its whole job.

| table | row |
|---|---|
| `franchises` | 1 — `team_name` **"MY CLUB"**, `balance` **0**, created 00:51:25.159997Z |
| `collections` | 1 — **"My Collection"**, `is_shared` false, created 00:51:25.159997Z |
| `user_roles` | not readable from a normal session; the insert is unconditional in the trigger body |

Both rows carry the *same* timestamp to the microsecond, and both are stamped
**five milliseconds before** the `auth.users` row's own `created_at` — which is
what you expect from rows written inside the same transaction. The
swallowed-exception path documented in `docs/GRANT_AUTHORITY.md` section 10 did
not fire here.

**So the half-created-account risk is real but did not happen.** Good. It is
still worth noting that if it *had*, nothing on this page would look different
until the user tried to do something.

---

## 2. What the binder held: nothing

`cards` — **zero rows.**
`starter_box_grants` — **zero rows.**
`wallet_transactions` — **zero rows.**
`pack_grants` — **zero rows.**

A brand-new player's binder is empty.

### Why: the starter box has never been called by anything

This is the largest finding on this page and it is not a bug in the usual sense.

- `depot_claim_starter_box` **is deployed** — it is in the production function
  list, `SECURITY DEFINER`, signature `(p_cards jsonb, p_seed bigint)`.
- `db/proposals/MIGRATION_starter_box.sql` **documents its call site**, right
  down to the line the client is supposed to run:
  `const p = window.DepotStarterBox.rollPayload();   // 25 cards + seed`
- **`window.DepotStarterBox` does not exist.** No `.js` and no `.html` file in
  the repo references it. `js/` contains 26 modules and none of them is the
  starter box.

So the 25 cards a new player is designed to receive — 9 fielders, 5 SP, 5 RP,
5 bench, one guaranteed bronze-or-better — have never been granted to anyone,
because the module that would ask for them was never written. The server half
is finished and waiting.

---

## 3. What the player can actually do on day one

Balance is 0. Bronze costs 150, Silver 400, Gold 900. Diamond is locked behind
"economy pass pending".

The three paid tiles render as **"Need 150 more" / "Need 400 more" / "Need 900
more"**, which is a good failure — it names the gap rather than greying out.

That leaves exactly one available action: **one free card.**

> **FREE · 1 CARD · ON THE HOUSE**
> "Today's free pack is ready"
> "One card, on the house. Comes back every 24 hours."

That is the entire first session. Empty binder, zero coins, a 0-0 record, a team
called MY CLUB that they did not name, three packs they cannot afford, one
locked tile, and one card.

---

## 4. The first pull, watched end to end

The free pack was claimed at 2026-08-12T16:09:41Z and every side effect
recorded.

### The RPC call

```
depot_claim_free_pack({ p_card: {
  year: "2020", brand: "Topps", set: "Topps", number: "567b",
  player: "Yonathan Daza SP, VARVAR: Running",
  team: "Colorado Rockies", rookie_year: "", tier: "plain" } })
```

```
-> { ok: true, tier: "plain",
     card_id: "30fe8058-b723-4154-88ea-25d30d220951",
     next_claim_at: "2026-08-13T16:09:41.55777+00:00" }
```

Note what that first line is: **the client told the server which card it got.**
This is `docs/GRANT_AUTHORITY.md`'s thesis, visible in one line of traffic.

### What it wrote

| table | result |
|---|---|
| `cards` | 1 row. `source = 'pack'`, `pack_seed` **NULL**, `catalog_key` **NULL**, `notes` = only a `DEPOT_META` position comment — no seed |
| `pack_grants` | **0 rows** — the free path writes no roll record |
| `wallet_transactions` | 1 row, `amount = 0`, `reason = 'free_pack'` |
| `franchises.balance` | unchanged at 0 |

These measurements are what `docs/PULL_POLICY.md` section 4 is built on.

### The ceremony, and the order it happens in

After the RPC returned, the shop showed a sealed pack — *"Sealed. Nobody's seen
this one."* — with a **RIP IT OPEN** button, then a face-down card reading
**CLICK THE CARD TO REVEAL**, then the card itself.

**The grant completes before the reveal begins.** The row was already in `cards`
while the pack was still sealed on screen. If the player closes the tab at the
"Sealed" step, the card is in their binder and they have never seen it. Nothing
is lost — which is the right trade, and it is the opposite of the money-safety
ordering used for paid packs — but the ceremony is decoration over a settled
fact, and anyone changing this flow should know that.

### The card

It rendered with **real photography**, not the pixel-art placeholder: a photo of
the player in a Rockies uniform, band **COMMON**, year tag **'20**. So the art
gate in `docs/PULL_POLICY.md` section 1 works end to end — the roll pool was
filtered to art-backed keys and the pull landed on one.

The free-pack tile then flipped to **"Back tomorrow for another — You claimed
today at 9:09am"** with a live countdown, *"Next pack in 23:57:58"*. The cooldown
works.

The binder showed the card in the first pocket of a nine-pocket page, with the
other eight reading **"empty pocket"**.

---

## 5. What would confuse a stranger

Ranked by how likely someone is to bounce on it.

1. **The binder is empty and nothing explains why.** There is no "welcome",
   no "claim your starter box", no indication that 25 cards were ever meant to
   arrive. A collector app whose first screen is an empty binder has to earn the
   second session on one card.
2. **Pack History shows packs they never opened.** On first load this account's
   Pack History listed two **GOLD PACK · Aug 11, 2026 · 5 cards** entries. The
   account was created Aug 12 and had opened nothing. The list is read from
   `localStorage` key `depot.packHistory`, not from the database, and it is not
   scoped to a uid — so it survives sign-out and shows the previous user of that
   browser their successor's screen. Raw value at the time:
   `[{"tier":"gold","seed":3917564482,"count":5,"at":"2026-08-12T00:18:26.568Z"},{"tier":"gold","seed":2238736776,"count":5,"at":"2026-08-12T00:17:50.543Z"}]`
   Both rips happened half an hour before the account existed. Same browser
   profile, so this is not a cross-user leak over the network — but the product
   tells a stranger those were theirs, and offers CARDS and REPLAY buttons for
   packs they do not own.
3. **"MY CLUB" is a name nobody chose.** It is the hardcoded literal in
   `depot_handle_new_user`. `depot_rename_franchise` exists and works, but
   nothing on the first-run path invites the player to use it. The one piece of
   identity a franchise game hands you is a placeholder.
4. **The card's own name is broken.** The player field read
   **`Yonathan Daza SP, VARVAR: Running`** — parsing debris from the checklist
   pipeline, printed on the card face in the reveal and in the binder. The very
   first card this account will ever own displays corrupted text. If the pull
   pool is the library, the library's text quality *is* user-facing copy.
5. **The record chip says 0-0 with nothing to play.** Truthful, and it points at
   a Play Ball surface that needs a lineup the player cannot field from one
   card.

---

## 6. What is unproven

- **`user_roles`** was not read. It is not exposed to a normal session and the
  trigger's insert is unconditional, so it is assumed present. Assumed, not
  measured.
- **One click did nothing and I cannot explain it.** The first press of "Open
  free pack" produced no console output, no network call and no state change.
  The second press, roughly a minute later, worked. There is no evidence of a
  failed request — there is no evidence of a request at all — so the likeliest
  explanation is that the first click did not land on the control. Recorded
  because "the button silently did nothing once" is worth someone watching for,
  not because it is diagnosed.
- **This is one account on one browser.** The `localStorage` pack-history
  finding in particular would look different on a fresh profile, where the list
  would simply be empty. It is a real defect in the sense that the data is not
  account-scoped; how often anyone hits it is unmeasured.
- **Nothing here was tested on mobile.**

---

## 7. The short version

The trigger works. The onboarding rows are created. The free pack works, the
cooldown works, the art gate works, and the reveal is genuinely nice.

And a new player still arrives at an empty binder, because the one feature
designed to fill it — a 25-card starter box, fully specified, with its RPC
deployed and its ledger table waiting — has no client and has never once been
called.

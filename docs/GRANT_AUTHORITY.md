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
| `depot_wallet_repair(p_owner)` | admin-gated | derives its own number from the ledger — **the only one that does** |

This is one habit applied five times. It is not five defects, and treating it as five parameter-bound fixes will miss the point and leave the next grant path with the same hole.

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

1. **An eligible-card source.** `card_library` and `card_library_manifest` already exist and are already the catalogue. Whether every row in them is pull-eligible is a product question, not a technical one — see section 6.
2. **A rarity or band model.** The system already has the vocabulary: `p_tier` on purchases, a `tier` field on the free pack, and an `excluded_from_pull_band_bump` flag written into `starter_box` ledger metadata. Something already thinks in bands. Whatever that model is, it has to move out of the client and into the function.
3. **A seed, generated server-side and recorded.** `depot_claim_starter_box` already takes `p_seed` from the client and stores it. Keep the storing; move the generating. A seed the client chose is not evidence of anything. A seed the server chose and wrote down is a reproducible record of a real event.
4. **A roll record.** One row per pull, carrying the seed, the band, the resulting card ids and the time. This is the thing pack history reads. It does not exist today, which is precisely why pack history is fabricated.

---

## 5. Honest pack history falls out for free

Once section 4 exists, pack history stops being a rendering problem and becomes a `select`. The banner comes down not because someone fixed the UI, but because the claim it was apologising for is no longer true.

Worth stating explicitly in the build order: **do not schedule a pack-history fix.** It is not a separate task. If it still needs work after the roll moves server-side, something in section 4 was done wrong.

---

## 6. What is NICK'S CALL, not the build agent's

Three product decisions are load-bearing here and none of them belong to whoever writes the SQL.

**Which cards are pull-eligible.** `card_library` is a catalogue, not a drop table. Some of it is presumably too good to hand out daily. Somebody has to say where the line is, and until they do, the roll has no domain.

**What the odds are.** A distribution is a design decision with an economy attached. The current answer is whatever the client felt like, which is not a distribution, so there is nothing to preserve or migrate from.

**What happens to cards already granted under the old regime.** Every card with `source = 'pack'` or `source = 'starter'` in `public.cards` today was chosen by a client. Most were almost certainly chosen honestly, by the app's own UI doing a fair local roll. But none of them can be *shown* to have been, and V2 wants cards to be wagerable. Three options: leave them and accept that pre-cutover provenance is unverifiable; flag them with a `provenance` column so the difference is visible; or re-roll them, which destroys collections people care about. **This is Nick's call, and the recommendation from here is the middle one** — a flag is honest, cheap, and takes nothing away from anyone.

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

- **`depot_admin_grant` is unread.** It is the one grant path in the set whose deployed body has not been examined. It is admin-gated in `MIGRATION_roles.sql`, and `depot_is_admin` exists in production in both a zero-argument and a `p_user uuid` form, so the gate it needs is there — but `depot_apply_payout` has already been shown to diverge from its file, so this should be read rather than assumed.
- **Nothing here was tested.** Every finding is read from a stored function definition. No exploit was executed, no coin moved, no card created. "It would work" is inference; "the body does not check `p_amount`" is observation.
- **Not every function was read.** `depot_ensure_onboarding`, `depot_rename_franchise`, `depot_handle_new_user`, `depot_wallet_check` and the four share/collection functions were out of scope. The pattern held five times out of five, so the prior should be that it holds elsewhere too — but that is a prior, not a finding.

---

## 9. Proportion

The exposure today is close to zero. There are four accounts: the owner, one active second player, and two family accounts that signed up on 2026-06-20 and never came back. Nobody is attacking this, and the two people who could would be attacking their own game.

The reason it is the first V2 item anyway is that it is cheap now and expensive later. Every card granted before the cutover is a card whose provenance cannot be demonstrated, and V2 wants people to wager cards. The cost of fixing this scales with how many cards exist and how many people care about them — and both only go up.

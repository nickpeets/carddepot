# THE STARTER BOX — the first five minutes

**Status: DESIGN — proposed, not implemented.** New docs-only file on `docs/design-updates`, cut from `main` at `0bd86d5`. No code, no schema, no shells, no §6 cache-bust tags. The DDL sketches below are **proposals for Nick to run**, not migrations — per AGENTS.md §2 nothing here touches a working path without sign-off.

Companion docs: `design/GRADE_PRESTIGE.md` (identity model, prestige, bands) and `design/GAME_MODES.md` (caps, the bench-only rule).

---

## 1. What it is, and why it exists

**A one-time, 25-card box granted at account creation.** Twenty-five is not an arbitrary number — it is an MLB active roster, so the box reads as "here is your team" rather than "here are some cards."

The purpose is narrow and worth stating as a test: **a new player should be able to field a legal lineup and play a game inside their first five minutes, before they have found a scanner, earned a coin, or bought anything.**

Three things in the current design make this necessary rather than merely nice:

The **scan gate** (`GRADE_PRESTIGE.md` §7.3) puts real friction on the scanned door. A new account with an empty binder and a camera requirement is a dead start. The starter box is what makes the gate survivable — the pulled door is thrown wide open on day one.

The **bench-only rule** (`GAME_MODES.md` §7) means a card with no resolvable stat line cannot bat. A random 25-card grant could hand someone a pile of checklists and managers and no fieldable nine. A roster-shaped roll is the fix, and it has to be a guarantee, not an average.

The **lineup requires nine plus a pitcher.** Today's free daily pack grants one card. At one card a day, a new player waits a week and a half to field a team. That is not an onboarding path.

---

## 2. Shape

| Property | Value |
|---|---|
| Size | 25 cards |
| Cost | free, one-time |
| Frequency | **once per account, ever** — enforced in the database (§5), not the client |
| Provenance | **PULLED** — library art, born verified (`GRADE_PRESTIGE.md` §0, §7.2) |
| Band mix | mostly plain, with **one guaranteed bronze-or-better hit** |
| Composition | roster-shaped: a fieldable nine, a bench, and pitching (§3) |
| Trigger | account creation, claimed on first load of the binder |
| Prestige band bump | **excluded** — the box is onboarding, not a pack (`GRADE_PRESTIGE.md` §6.2) |

Deliberately *not* generous. The box is a functional starting roster, not a jackpot: one hit gives it a moment, and everything else is the everyday cardboard the junk-wax modes are built around. A new player should finish the box wanting a pack, not feeling finished.

---

## 3. The roster-shaped roll

### 3.1 Target composition — **DRAFT**

| Group | Count | Rule |
|---|---|---|
| The fieldable nine | 9 | one each at C, 1B, 2B, 3B, SS, LF, CF, RF, DH — **every one must resolve a stat line** |
| The bench | 7 | any position, duplicates allowed |
| The arms | 9 | pitchers, at least 5 of them startable |
| **Total** | **25** | |

The counts are DRAFT and want one round of playtesting. What is **not** draft is the guarantee: the nine core slots must each come back with a real position and a real season line, because the entire point of the box is that the lineup builder is usable the moment it opens. A box that hands a new player a bench-only card in the leadoff slot has failed at its only job.

Two smaller rules that fall out. Duplicates are fine and stay fine — `ECONOMY_DESIGN.md` §7.3 already allows them, and a second copy of a decent bat is genuinely useful under a cap. And the box should be **era-agnostic**: no era filter, so a new binder has a bit of everything and the era-locked modes (`GAME_MODES.md` §3) all feel at least partly playable.

### 3.2 Cap check

The nine core cards should be mostly plain and bronze, so a starter lineup lands somewhere in the region of 60–120 raw prestige. That comfortably clears **Sandlot (150)** and sits well under **Bush League (300)** — the two lowest rungs of the `GAME_MODES.md` §2.1 ladder are therefore playable from the first session with nothing bought. This is the intended relationship and it runs both ways: if the ladder moves, the box composition is re-checked against it, and vice versa.

---

## 4. What the engine actually needs

This is the honest part. The roll the box requires does not exist today, and the reason is specific.

### 4.1 Position at roll time — the real gap

**Today, position is resolved *after* the grant, not before.** `js/depot-position.js` is the single source of position truth and its `resolvePosition(name, year)` asks the MLB StatsAPI for a player's primary position; `js/depot-shop.js` runs that enrichment **post-grant, client-side and fire-and-forget** for free-pull cards; the resulting value rides inside `cards.notes` as JSON in the `DEPOT_META` block, read back through `depotNormalizePos()`. `FUTURE_ITEMS.md` §2 proposes a real `cards.pos` column for exactly the reason that bites here: `notes` is opaque text, so position cannot be filtered, sorted or selected on.

More to the point, the **roll pool has no position at all.** The pack catalog is `data/cards-YYYY.json`, and those rows carry player, year, brand, number — not position. A position-aware roll cannot read a field that is not there.

Three ways out:

**(a) Resolve live during the roll.** Twenty-five-plus StatsAPI calls before the first card appears, on a network the player may not have. Wrong for onboarding — this is the one moment where latency is fatal.

**(b) Ship a static position table.** `data/player_positions.json`, keyed by the same normalized name (`normName`) that `player_tiers.json`, `set_tiers.json` and the rolodex already use, value = normalized position token. **Recommended.** It is additive, needs no schema, grows the same way the tier tables grow (unlisted defaults to null), stays versioned in git, and follows a pattern this repo has already used twice. It also composes cleanly with the art gate: the roll pool becomes *art-backed ∩ position-known*, both client-side filters over the same catalog.

**(c) Roll, enrich, re-roll the gaps.** Self-defeating — it is (a) with extra steps and a worse failure mode.

A useful side effect of (b): if the table is generated from the MLB person record, then *position-known implies player-exists*, which is most of the way to the stat-line guarantee in §3.1. The two filters largely collapse into one.

### 4.2 The guaranteed hit must be band-first, not a re-roll

The paid packs get their hit by re-rolling the 5th slot to a band floor, **bounded at 40 tries with a best-so-far fallback** — which is precisely why `rollPack` returns `floorMet`, and why it can be `false`. That is fine for a purchased pack that promises odds. It is not fine for a box that promises *a* hit.

The free daily pack already solved this: it **picks a band first at published rates, then draws within that band** (`FREE_BAND_ODDS` / `drawFreeIndex`), which makes the odds exact by construction. The starter box should use the same band-first mechanism with the band pinned to bronze-or-better for the hit slot. Same pattern, no new invention, and `FUTURE_ITEMS.md` §6 already identifies band-first as the honest way to make a guarantee that actually holds.

### 4.3 Art

The pool is restricted to art-backed rows via `DepotLibraryIndex` — the same gate as #194 — because a pulled card is defined by having library art (`GRADE_PRESTIGE.md` §0). Coverage is 84,272 of 155,844 catalog rows, 54.1% (`FUTURE_ITEMS.md` §10), which is ample.

Worth flagging honestly: the art-backed pool is **richer** than the raw pool, because the ingest went after notable sets and notable players first. The measured effect on packs was a real band shift (`FUTURE_ITEMS.md` §12a: bronze gold-hit from ~1 in 25 to ~1 in 18). The starter box inherits that skew, so its "mostly plain" target should be verified against the filtered pool rather than assumed.

---

## 5. The grant — one per account, enforced in the database

### 5.1 The hazard is already documented

AGENTS.md §4's canonical incident is this exact scenario: **two concurrent `INITIAL_SESSION` auth events fired in the same millisecond**, both read zero rows, both inserted, and Nick's bronze pack was granted twice. Account creation is the *most* likely moment for a double auth event. A starter box guarded by "have we already granted one?" read in the client will eventually grant fifty cards.

The lesson's second half applies directly: **the unique key must match the idempotency unit.** For a pack that unit is the pack, so `pack_grants` is unique on `(collection_id, pack_seed)`. For the starter box **the unit is the account**, so the unique key is the owner. One row, one account, forever — expressed as a primary key, not as a check.

### 5.2 Proposed DDL sketch (Nick runs it; nothing executed here)

```sql
-- one row per account, ever. owner_id as PK IS the "one per account" rule.
create table public.starter_box_grants (
  owner_id      uuid primary key references auth.users on delete cascade,
  collection_id uuid not null,
  seed          bigint not null,
  card_count    int not null default 25,
  created_at    timestamptz not null default now()
);
alter table public.starter_box_grants enable row level security;
create policy starter_box_self_read on public.starter_box_grants
  for select to authenticated using (owner_id = auth.uid());
```

The claim RPC mirrors `depot_claim_free_pack`: `SECURITY DEFINER`, `search_path = public`, `auth.uid()` guard, `revoke all from public`, `grant execute to authenticated`. **Grant row first**; a Postgres `23505` there means "already claimed" and returns a clean no-op that inserts **no cards**. Then the 25 card rows and a 0-amount `wallet_transactions` marker with `reason = 'starter_box'` — consistent with `free_pack` being a 0-amount marker rather than a transaction — all inside one transaction, so there is no partial roster.

A window-scoped in-flight latch on the client is the belt; the primary key is the suspenders. Both, per AGENTS.md §4.

### 5.3 Provenance — do not repeat the free-pull mistake

`FUTURE_ITEMS.md` §1 and §13a document that free-pull cards land with **empty `notes`, no marker, no `pack_seed` and no grant row** — three free cards in Nick's binder cannot be traced to a pull server-side at all. The starter box must not add a fourth untraceable class.

Proposal: stamp the box explicitly. Either a distinct `cards.source = 'starter'` (the column already exists with a `check` constraint that would need the new value) or, at minimum, a provenance token in `notes` written by the RPC itself. This matters for three separate reasons: the band bump has to be able to *exclude* the box (`GRADE_PRESTIGE.md` §6.2), economy analytics has to be able to separate onboarding grants from earned pulls the same way it separates `admin_grant` rows (`GRADE_PRESTIGE.md` §8.2), and "where did this card come from" is a question the Pack History work (#200, `FUTURE_ITEMS.md` §13) is already trying to answer for everything else.

---

## 6. The reveal

The existing ceremony is built for five: cards pop out staggered ~0.12s apart, you click each to flip, the hit lands last, and the session moves through `held → reveal → all-five → added`. The vocabulary (`tearoff`, `cardpop`, `starburst`, `twinkle`, and the reduced-motion branch) is specced in `design/redesign-v2/README.md` §7, option 4a.

**Twenty-five is five times that, and it lands in the first five minutes of someone's first session.** A 25-card version of the 5-card ceremony is not five times as good; it is a hostage situation. Clicking twenty-five individual flips before you can reach the lineup builder actively works against the box's only purpose.

Proposed shape: **themed waves.** Reveal in three or five batches with a beat between them, each wave labelled so the roster shape is the story — "YOUR LINEUP" (the nine), "THE BENCH" (seven), "THE ARMS" (nine) — with the guaranteed hit held for the last wave so there is still a peak. Every wave is **skippable**, with a persistent "Reveal all" that dumps the remainder straight to a grid, and `prefers-reduced-motion` gets a static branch as it already does everywhere else.

**Dependency:** the 25-card reveal should be specced properly in the incoming design chapter rather than invented here. This section is the constraint list that chapter needs to satisfy — waves, skippable, hit last, reduced-motion, and no path where the player cannot reach the builder in one click — not a final animation spec.

---

## 7. Today vs proposed

| | Exists today | Proposed here |
|---|---|---|
| Free grant path | `depot_claim_free_pack`, 1 card / 24h, server-side insert | one-time 25-card grant, its own RPC |
| Idempotency | `pack_grants` unique on (collection, seed) | `starter_box_grants` keyed on the **owner** |
| Roll | band-first (free) / bounded hit re-roll (paid) | band-first for the guaranteed hit |
| Position | resolved post-grant, client-side, stored in `notes` | needed **at roll time** — static `player_positions.json` |
| Art gate | `DepotLibraryIndex`, art-backed pool (#194) | unchanged, reused |
| Ledger | `free_pack` / `pack_purchase` / `admin_grant` reasons | new `starter_box` 0-amount marker |
| Reveal | 5-card ceremony (redesign §7 / 4a) | 25-card waved reveal, skippable |

---

## 8. Open

> ### OQ-D · Reveal pacing
> How many waves, and grouped how? Three roster-shaped waves (lineup / bench / arms) tell the clearest story; five waves of five reuse the existing five-card rhythm exactly and need less new animation work. Does the hit get its own beat, or land inside the final wave? Is a skip remembered for future big reveals, or offered fresh each time? And does the box end on the binder or drop the player straight into the lineup builder with the nine pre-filled — which would be the most direct possible answer to "playable in five minutes"?
> This is a design-chapter question, not an engineering one; §6 lists the constraints any answer has to satisfy.

Also DRAFT and wanting one playtest: the 9 / 7 / 9 split in §3.1, the "mostly plain with one bronze-or-better" band mix in §2, and whether the box should also seed a small DD balance so the shop is reachable on day one (proposed: **no** — the first pack should be earned, and the free daily pack already covers the "something to rip tomorrow" hook, now at two claims per 24h per `GRADE_PRESTIGE.md` §8.1).

---

## 9. What this document does not do

It changes no code, no schema, no odds and no shipped behaviour. No table is created, no RPC exists, no card is granted. The position table, the `starter_box_grants` table and the claim RPC are all proposals requiring Nick's §2 sign-off, and the roll cannot be built at all until position exists at roll time (§4.1). No §6 cache-bust stamping applies: this branch ships no assets and moves no build.

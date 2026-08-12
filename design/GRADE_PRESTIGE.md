# GRADE & PRESTIGE — what a card does, what it is worth, and what a grade multiplies

**Status: DESIGN — revision 2.** Docs-only file on `docs/design-updates`, cut from `main` at `0bd86d5` (the merge of #201, which landed revision 1). No code, no schema, no shells, no §6 cache-bust tags. Per AGENTS.md §2 nothing marked PROPOSED here may be built or merged into a working path without Nick's sign-off; items marked **DRAFT** are numbers still awaiting his call.

Companion docs: `design/GAME_MODES.md` (salary-cap / era / stakes modes) and `design/STARTER_BOX.md` (the 25-card onboarding grant).

## Decisions landed since revision 1

| # | Decision | Lands in |
|---|---|---|
| 1 | The Depot is a **collection game first**, tracker within. Cards enter **PULLED** or **SCANNED**. | §0 (new) |
| 2 | **Add-a-Card is scan-required** for standard users; library art assists identification but no longer auto-feeds an add. Per-user, server-enforced **admin bypass**; Nick is founding admin. Ships after the redesign phases. | §7.3, §7.4 |
| 3 | The **free pack cadence widens to two claims per 24h** alongside the gate. | §8.1 |
| 4 | **Caps count raw prestige** (former OQ-B). | `GAME_MODES.md` §8 + propagated |
| 5 | **The challenge model is the Dugout pill flow** as specced (former OQ-1). Evidence standards stay open sub-questions. | §7.6 |
| 6 | **Admin testing wallets**: ledger-credited balances, admin spend excluded from economy analytics. | §8.2 |

Still open and carried forward as boxes in §9: pack band weight, prestige→coin exchange rate, and one new question — the **scan premium**.

---

## 0. Identity — the Depot is a collection game first

**The Depot is a collection game with a tracker inside it, not a tracker with a game bolted on.** That ordering decides every ambiguous call below. The binder still has to be a genuinely good place to keep a real collection — but when the two goals disagree, the game wins, with one hard constraint: **the game may never make honest cataloguing worse.** Any design where scanning your real cards is the punished path is wrong by construction.

Cards enter the Depot through exactly two doors.

| | **PULLED** | **SCANNED** |
|---|---|---|
| Origin | packs, the starter box, trades, wagers, the marketplace | a physical card you photographed in |
| Art | library art — born art-backed | your own scan |
| Verification | **born verified** — the server minted the grant, there is nothing to dispute | **earned** — the card has to prove itself (§7.5) |
| Grade | whatever the grant says; in practice ungraded | self-reported, and therefore challengeable |
| Character | **liquid** | **prestigious** |

**Pulled is liquid.** It came from the game's own economy, its provenance is a ledger row, and it can move again — traded, wagered, sold — without anyone having to trust anybody. **Scanned is prestigious.** It is a claim about the physical world, which is exactly why it is worth more socially and exactly why it can be challenged.

Three things fall out of this and are load-bearing for the rest of the document. Verification is a *scanned-card problem by construction* — a pulled card has nothing to verify, because the server minted it (§7.2). Liquidity defaults differ between the two doors, which is why `GAME_MODES.md` §6 can make pulled cards wager-eligible by default and scanned cards opt-in. And the same card can now exist both ways in two different binders, which is precisely why the **scan premium** (OQ-C) is a real question with real numbers attached.

---

## 1. The three-axis rule

Card Depot has three separate systems and they must never bleed into each other.

**STATS decide how a card PLAYS.** The season line — AVG / HR / RBI and, where available, the full rate shape — is the only input to the sim.

**PRESTIGE decides what a card is WORTH.** A transparent point sum over player tier, rookie, era, set and manual flags. No market data.

**GRADE MULTIPLIES WORTH, and only worth.** A grade never touches the sim, never changes a rate, never adds or removes a point in the prestige sum. It scales the worth number that prestige produces.

This extends the sacred rule already written into `ECONOMY_DESIGN.md`: prestige and money never touch how a card plays. Grade joins that list, and so does provenance — a pulled Griffey and a scanned Griffey play identically, because they are the same 1989 player.

---

## 2. STATS — how a card plays (exists in code today)

`game/builder.html` resolves every card in the lineup to a rate profile and holds it in `RESOLVED` (`cardId -> {status:'api'|'card'|'bad'|'pending', team, rates, avg, hr, rbi, tendency, pos, note}`). When only a sparse line is known it falls back to `avgToRates(avg, hr, rbi)`.

`game/sim.js` builds each hitter with `batter(name, avg, hr, rbi, rates, tendency)`. The sim reads the stat line and nothing else — no prestige argument, no money argument, no grade argument, no provenance argument anywhere in the signature.

`game/season.js` carries its own `avgToRates(avg, rnd)` for AI opponents, with the comment that those constants are "the difficulty dials."

Stat quality has been hardened across #181 (provenance persisted on every write, never mislabel a season), #182 (span-guarded re-pull sweep), #183 (stale-identity latch removed, identity validated before any stats write) and #199 (every add gets its season line or a logged reason).

---

## 3. PRESTIGE — what a card is worth (exists in code today)

Engine: `js/depot-prestige.js`. Spec: `ECONOMY_DESIGN.md` §1 as amended by §1.5.

```
prestige = STAR_tier + ROOKIE + ERA(U-curve) + TRANSCENDENCE + GEM + ERROR + SET_TIER   (floored at 5)
```

| Component | Source | Points |
|---|---|---|
| Player tier | `data/player_tiers.json` | HOF 40 · SUPERSTAR 30 · STAR 20 · REGULAR 8 · COMMON 0 |
| Rookie | card year == MLB debut year, cached on the row | +30 |
| Era (U-curve) | card year | Vintage ≤1985 +20 · Junk Wax 1986–1993 +0 · Modern ≥1994 +6 |
| Transcendence | rookie AND (SUPERSTAR or HOF) | +30, junk-wax era line renders +0 rather than a penalty |
| Gem / Error | manual flags | +15 / +25 |
| Set tier | `data/set_tiers.json` | ICONIC +20 · PREMIUM +12 · NOTABLE +6 |

Bands (fixed — `js/depot-pack-engine.js` `BAND_RANK` depends on them and they are never renamed): **GOLD ≥ 60 · SILVER 30–59 · BRONZE 10–29 · plain < 10.**

`ECONOMY_DESIGN.md` §1.5E ruled condition and grading out of scope for prestige, because prestige rates the *card identity* rather than the individual copy. That still stands, and §0 sharpens it: **identity does not enter the point sum either.** Whether a card was pulled or scanned changes nothing about what it is. The two proposals that touch this — the band bump (§6) and the scan premium (OQ-C) — are both deliberately framed as small, separable layers rather than new terms in the identity sum.

---

## 4. GRADE — what exists in code today

The ladder ships in `js/depot-card-detail-2b.js` as `GRADES = ["", "1" … "10", "GEM 10", "AUTH"]`, empty string meaning ungraded, with the file's own note that "saved data + prestige reads are unchanged (mechanics frozen)."

The column arrived with REDESIGN_V2 decision **D4** (grade, star flag, condition notes — nullable, additive). `index.html` persists it through `d4SetGrade`; `rowToCard` maps it onto the card object. It renders as a chip on card detail and a pill in the binder grid, and the Add-a-Card form has a GRADE select.

**Grade is display-only today.** Everything from §5 onward is proposed.

---

## 5. PROPOSED — the grade multiplier

```
worth = prestige × grade_multiplier
```

Applied at the worth boundary, never inside the prestige sum, and always rendered as its own line:

```
1989 UD Griffey   HOF 40 + ROOKIE 30 + TRANSCENDENCE 30 + JUNK WAX +0  =  100 PRESTIGE
GRADE  GEM 10  ×3.0                                                    =  300 WORTH
```

### 5.1 Invariants (not draft)

Monotonic: a higher grade is never worth less than a lower one. Ungraded is the **1.00× baseline**, never a penalty. AUTH is not a rung on the numeric ladder; it is a separate premium. The multiplier always renders as its own labelled line. And it is worth-only: no code path may pass it into the builder's rate resolution or into `sim.js`.

One consequence of §0 worth stating plainly: **pulled cards are ungraded by default, so they sit at 1.00×.** The grade multiplier is, in practice, a scanned-card axis — which is a large part of what makes the scanned door prestigious, and part of why OQ-C has to be answered carefully rather than stacked on top.

### 5.2 The curve — **DRAFT, pending Nick**

| Grade | Multiplier | Note |
|---|---|---|
| (blank / raw) | **1.00×** | baseline — the default state of the binder, and of every pulled card |
| 1 | 0.70× | below baseline: a known-bad copy is worth less than an unknown one |
| 2 | 0.75× | |
| 3 | 0.80× | |
| 4 | 0.88× | |
| 5 | 0.95× | |
| 6 | 1.05× | |
| 7 | 1.25× | first grade that clearly beats raw |
| 8 | 1.55× | the common "nice copy" grade |
| 9 | 2.10× | |
| 10 | 2.60× | |
| GEM 10 | **3.00×** | ceiling |
| AUTH | ×1.40 premium on the raw baseline | authenticated but ungradable — a distinct thing, not a low grade |

Open shape questions: whether the sub-baseline band (1–5) should exist at all, or whether the floor should simply be 1.00× everywhere so grading can only help; and whether AUTH is a multiplier or a flat additive premium.

Ceiling check, now easier since decision 4: because **caps count raw prestige**, a ×3.0 GEM 10 no longer distorts lineup legality at all — it only moves payouts and wager stakes. That removes the sharpest objection to the ×3.0 ceiling that revision 1 raised in this section.

> **REVISED 2026-08-12 — this paragraph is no longer the plan.** Nick has since
> ruled that prestige should behave as an **Overall rating that affects play**,
> paired with a **marquee cap** on how many high-prestige cards may be fielded at
> once. That reverses the sentence above in a controlled form: grade is intended
> to distort lineup strength, and a roster limit rather than the absence of an
> effect is what bounds it. **Design intent, not built** — measured the same day,
> `grade` appears zero times in `game/sim.js`, `game/builder.html`,
> `game/season.js`, `js/depot-prestige.js` and `js/depot-shop-view.js`. The
> reasoning, the open multiplier-versus-composite question and the marquee
> sub-questions are in `docs/RESOLVER_COVERAGE.md` section 6. Do not plan from
> the paragraph above without reading it.

---

## 6. PROPOSED — pack band feeds prestige a small bump

### 6.1 What exists

Bands are load-bearing in the pack engine. The free daily pack draws band-first at published rates (plain ~90% · bronze ~8% · silver ~1.5% · gold ~0.5% — the literal `FREE_BAND_ODDS`, returned verbatim by `estimateOdds('free')`). Paid tiers (Bronze 150 / Silver 400 / Gold 900 DD) re-roll the 5th "hit" slot to a band floor, bounded at 40 tries with a best-so-far fallback, which is why `rollPack` returns `floorMet`. Provenance: `cards.source` separates `'pack'` from `'scan'`, and `pack_grants` holds one row per pack with tier and seed.

Two known provenance gaps, both already logged in `db/proposals/FUTURE_ITEMS.md`: free-pull cards land with empty `notes` and no marker (§1), and free packs write no `pack_grants` row and leave `pack_seed` NULL (§13a). **Any band bump depends on knowing which band a card came from, so those gaps are a prerequisite, not a detail.**

### 6.2 The proposal

| Pull band | Bump — **DRAFT** |
|---|---|
| gold | +6 |
| silver | +3 |
| bronze | +1 |
| plain | 0 |
| scanned (`source = 'scan'`) | 0 |

Small on purpose: pack rolls are already weighted by the prestige system's own tiers, so band correlates with prestige before any bump. A large bump double-counts that and inflates payouts on exactly the cards the shop sells. Suggested hard rule, also DRAFT: the bump may never promote a card into a higher band than its base sum earns.

**Starter-box interaction (new).** `STARTER_BOX.md` grants 25 cards at once, mostly plain with one bronze-or-better hit. Under the draft weights that is a one-time bump of roughly +1 to +6 total, which is harmless — but it is worth deciding explicitly whether the starter box counts as a "pull band" at all. Proposed: **it does not.** The starter box is onboarding, not a pack, and excluding it keeps the bump meaning "you got lucky in the shop."

Weight is OQ-A.

---

## 7. Provenance and verification

### 7.1 Today

Grade is whatever the owner picks from the select. No evidence requirement, no check. Fine single-player — the same reasoning `ECONOMY_DESIGN.md` §7.4 applies to client-rolled packs. It stops being fine the moment grade multiplies worth *and* worth is compared between players.

### 7.2 Pulled cards are born verified

A pulled card's provenance is a server row, not a claim. `depot_claim_free_pack` inserts server-side; paid packs debit through `depot_purchase_pack` and record a `pack_grants` row; the starter box adds a third grant type (`STARTER_BOX.md` §4). Nothing about a pulled card needs to be believed, so nothing about it can be challenged. Its art is library art, which is already curated and gated (`card_library`, and the art-backed roll gate from #194).

### 7.3 The Add-a-Card scan gate — **DECIDED**

**Standard users must attach a scan to add a card.** Library art may be shown to help identify and confirm what you are adding, but selecting a library image no longer completes an add on its own.

This is the rule that makes §0 true. If library art can fill a card, then "scanned" stops meaning "I hold this card," the verified axis collapses, and anyone can mint prestigious cards straight out of the catalog without owning cardboard. The gate is the entire reason the scanned door means anything.

What already exists to build on: the add flow ships the HYBRID decision (`FUTURE_ITEMS.md` §3) — a personal scan writes to the private `card-images/{user}/{collection}/{cardId}_{side}.jpg` path with zero DDL, and painting resolves personal → library → placeholder. So the private-scan path is live machinery; the gate is a requirement change on top of it, not new plumbing.

**Sequencing: ships after the redesign phases.** The Add-a-Card surface is redesign option 3b and has already moved three times (#186 reskin, #189 v2.1 four-step funnel, #191 simplify). Gating before the skin settles means building the gate twice.

Open sub-questions, none blocking: front-only or front+back (the back drives the stats lookup per the redesign spec §4)? And what happens to rows already added without a scan — proposed: **grandfathered, never retroactively invalidated**, but they read as unverified rather than silently passing.

### 7.4 Admin bypass — **DECIDED** (shape proposed)

A per-user, **server-enforced** flag. Not a client boolean: a bypass that mints library-art cards is a mint, so it has to be checked where RLS is checked, not in JavaScript that anyone can edit.

There is no roles table today. `FUTURE_ITEMS.md` §14 already anticipates one ("when the roles table lands") for the testing wallets in §8.2, and `SHARED_LIBRARY_DESIGN.md` §9 has carried "admin model" as an open question since Phase 0, with `LIBRARY_PHASE0.md` noting that replace/remove is admin-only via the service role. **Three separate documents are pointing at the same missing table.** It should land once, on its own branch, with its own review — per AGENTS.md §1, one concern per branch.

Proposed DDL sketch (for Nick to run; nothing executed here):

```sql
create table public.user_roles (
  user_id    uuid primary key references auth.users on delete cascade,
  role       text not null check (role in ('admin','user')) default 'user',
  created_at timestamptz not null default now()
);
-- read your own row; never write it from the client
alter table public.user_roles enable row level security;
create policy user_roles_self_read on public.user_roles
  for select to authenticated using (user_id = auth.uid());

create or replace function public.depot_is_admin() returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from public.user_roles
                 where user_id = auth.uid() and role = 'admin');
$$;
```

Nick is the founding admin row. Bypassed users keep library-auto-feed — an admin can add a card from library art alone, which is what makes curation and live testing possible at all.

Sub-question worth settling early: does an admin-added, library-fed card read as PULLED or as SCANNED-unverified? **Proposed: neither — a third provenance value, `'admin'`.** Honest by construction, and trivially excluded from analytics the same way `admin_grant` ledger rows are (§8.2).

### 7.5 Scanned cards earn verification

**SELF-REPORTED → EVIDENCE → CHALLENGED → VERIFIED (or DOWNGRADED).**

A scanned card starts self-reported. The owner may attach evidence — the existing front/back scan slots, ideally a raking-light shot. Any player may challenge from the card's Dugout thread. Resolution produces a verified badge, or a downgrade to the community-agreed grade. Unresolved claims simply stay self-reported; nothing is ever deleted.

### 7.6 The challenge model — **DECIDED**

**The Dugout pill flow is the model.** `design/redesign-v2/README.md` §2 (option 2b, marked *Final*) already ships it: every Dugout comment carries an orange **"⚔ Challenge USERNAME"** pill, and "challenges from the Dugout drop into your schedule as exhibition games," surfacing in the Play Ball hub (§5) as a pending match. The mockup's own sample copy is the user story — MULLET_82 disputes a PSA 8, says the corners look like a 7, and asks for a raking-light scan; WAXPACK_WES answers a card claim with "Play Ball mode, best of 3."

So a grade challenge is not a new surface. It is the existing pill with a grade claim attached, and it resolves through the match the pill already creates.

Sub-questions that stay open (they are evidence-standard details, not model choices): what counts as sufficient evidence — is a raking-light front-and-back required, or is any second scan enough? Is there a cost to challenging (a DD ante) to stop nuisance challenges? Can a verified grade be re-challenged on new evidence? And does a downgrade retroactively change worth already banked in past payouts — **proposed answer: no, never retroactive.**

**Dependency, unchanged:** the Dugout is REDESIGN_V2 decision **D5**, deferred to Phase 6, and its plan "MUST include OAuth/social sign-in and a rollout sequence." There is no community verification before there is a community.

### 7.7 Interim safety rule

Until verification ships, any mode that compares worth between players (league, VS, wagers) reads **unverified grades at 1.00×**. Solo play, the binder and the spotlight show the full multiplier.

---

## 8. Economy notes

### 8.1 Free cadence widens to two claims per 24h — **DECIDED** (rhythm TBD)

Today: one claim per 24h, server-enforced, with the clock being the most recent `wallet_transactions` row where `reason = 'free_pack'` (`ECONOMY_DESIGN.md` §7.1). Widening to two is a rhythm change, not a mechanism change — the same ledger clock works if the refusal branch **counts rows in the trailing 24h** instead of reading only the latest one.

Two shapes to choose between: two independent claims on a rolling window (count-based, generous, drifts earlier each day), or two fixed slots per day (predictable, more ritual, harsher if you miss one). Exact rhythm lands with economy tuning, because it interacts with the art filter's measured value bump (`FUTURE_ITEMS.md` §12a: bronze gold-hit moved from ~1 in 25 to ~1 in 18 on the filtered pool) and with the retune Nick deferred in §12c.

**Why it moves with the gate:** the scan gate raises friction on the scanned door, so the pulled door widens to compensate. A new player without a scanner in front of them is not stuck at zero cards.

### 8.2 Admin testing wallets — **DECIDED**

`FUTURE_ITEMS.md` §14 already records the mechanism, from funding Nick's wallet live: one owner-scoped `wallet_transactions` row (`reason 'admin_grant'`, meta flagging it as a testing grant) followed by `depot_apply_payout` — the same ledger-then-apply pair `writePayout()` uses — because `franchises.balance` is a **STORED column with no trigger mirroring the ledger**, so a ledger row alone does not move the wallet chip.

Decision: this becomes part of the roles work in §7.4 rather than a hand-run credit per session. Admin accounts get a documented testing balance when their role row lands.

Two requirements carried over verbatim, because they are the part that silently breaks things: **admin grants and the spend they fund must be excluded from every economy analytic** (`reason = 'admin_grant'` and `meta.exclude_from_economy_analytics` are the hooks) or the sink/faucet and pack-price numbers get poisoned by test purchases; and nothing enforces `balance = sum(amount)`, so a reconciliation check (or a derived balance) belongs in the same pass.

---

## 9. OPEN QUESTIONS

Resolved since revision 1: the challenge model (§7.6) and the cap-counting question (`GAME_MODES.md` §8). The three below remain.

> ### OQ-A · Pack band weight *(carried forward)*
> Are the §6.2 draft bumps (gold +6 / silver +3 / bronze +1) the right size, or should the band bump be zero? The case for zero: band already correlates with prestige by construction, so the bump partly double-counts, and it means two identical cards can carry different prestige based on how they entered the binder — which cuts against "prestige rates the card identity" (§1.5E) and against §0's rule that identity stays out of the point sum.
> The case for keeping it: it makes a gold-pack pull matter permanently.
> Sub-questions: does the starter box count as a pull band (**proposed: no**, §6.2)? Does a scanned card ever earn one (proposed: no)? Does the free pack's gold band count the same as the paid Gold tier's guaranteed hit (proposed: yes)?
> **Prerequisite either way:** the free-pull provenance gaps in `FUTURE_ITEMS.md` §1 and §13a must close first, or the bump has no band to read.

> ### OQ-B · Prestige → coin exchange rate *(carried forward)*
> Today the only conversion is the win purse: `WIN = 100 + round(lineup_prestige × 1.8)`. With a grade multiplier, a band bump and now a starter box in play, that 1.8 multiplies a larger and more variable number, and the cap modes invert the incentive (an underdog pays *more* for *less*).
> Does 1.8 stay, drop, or switch to cap-relative prestige? And is there ever a *direct* prestige→DD conversion — selling or trading in a card for coins? **Proposed default: prestige never sells directly; the only exchange rate is the purse.**
> Note the new pressure from decision 1: a marketplace is now explicitly one of the PULLED doors (§0), and a marketplace needs a price. If cards can be listed for DD, this question stops being theoretical.

> ### OQ-C · The scan premium — verified-physical vs pulled twin *(new)*
> §0 says pulled is liquid and scanned is prestigious. Nothing yet makes that true in numbers. The same card can exist through both doors — a 1989 UD Griffey pulled from a Gold pack, and a 1989 UD Griffey scanned out of a shoebox and verified.
> Options: **(a)** no premium — identical prestige, the difference is narrative and liquidity only; **(b)** a flat verified premium in prestige points; **(c)** a premium at the worth layer only, so caps stay identical and only payouts and wagers move — the option most consistent with decision 4 and with §3's rule that identity stays out of the point sum; **(d)** inverted — pulled cards carry a small discount instead, keeping the honest binder as the baseline.
> Watch-outs: any premium is an incentive to claim cards you don't hold, so it must never exceed the cost of losing a challenge. It stacks with the grade multiplier, because a verified scan is also the only card that can carry a *challengeable* grade — (b) plus §5.2 could compound into a very large number on one card. And per §0's hard constraint, whatever the answer is, it must not make honest cataloguing feel like the worse deal.

---

## 10. What this document does not do

It changes no code, no schema, no odds and no shipped behaviour. The sim is untouched. `js/depot-prestige.js` is untouched. Grade remains display-only, the scan gate and admin bypass ship after the redesign phases and behind a roles table that does not exist yet, and community verification remains blocked on D5 / OAuth. No §6 cache-bust stamping applies to this branch: it ships no assets and moves no build.

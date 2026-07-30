# GRADE & PRESTIGE — what a card does, what it is worth, and what a grade multiplies

**Status: DESIGN — proposed, not implemented.** This is a docs-only file on `docs/design-specs`, cut from `main` at `36c6b30`. It touches no code, no schema, no shells, and no §6 cache-bust tags. Per AGENTS.md §2 nothing described as PROPOSED here may be built or merged into a working path without Nick's sign-off; the items marked **DRAFT** are numbers awaiting his call, not decisions.

Companion doc: `design/GAME_MODES.md` (salary-cap / era / stakes modes), which consumes the definitions below.

---

## 0. The three-axis rule

Card Depot has three separate systems and they must never bleed into each other.

**STATS decide how a card PLAYS.** The season line — AVG / HR / RBI and, where available, the full rate shape — is the only input to the sim.

**PRESTIGE decides what a card is WORTH.** A transparent point sum over player tier, rookie, era, set and manual flags. No market data.

**GRADE MULTIPLIES WORTH, and only worth.** A grade never touches the sim, never changes a rate, never adds or removes a point in the prestige sum. It scales the worth number that prestige produces.

This extends the sacred rule already written into `ECONOMY_DESIGN.md`: prestige and money never touch how a card plays. Grade joins that list. A GEM 10 Griffey and a beat-up raw Griffey play *identically*, because they are the same 1989 player. What differs is what they are worth to you, and what they cost you under a cap.

---

## 1. STATS — how a card plays (exists in code today)

What is live on `main` right now:

`game/builder.html` resolves every card in the lineup to a rate profile and holds it in `RESOLVED` (`cardId -> {status:'api'|'card'|'bad'|'pending', team, rates, avg, hr, rbi, tendency, pos, note}`). When only a sparse line is known it falls back to `avgToRates(avg, hr, rbi)`, which maps a batting average onto a plausible league-baseline shape.

`game/sim.js` builds each hitter with `batter(name, avg, hr, rbi, rates, tendency)`. The sim reads the stat line and nothing else — there is no prestige argument, no money argument, and no grade argument anywhere in the signature.

`game/season.js` carries its own `avgToRates(avg, rnd)` for AI opponents, with the comment that those constants are "the difficulty dials."

Stat quality has been hardened over the last several PRs: provenance is persisted on every write and a season is never mislabelled (#181), a span-guarded re-pull sweep backfills provenance-less lines (#182), the stale-identity latch was removed and identity is validated before any stats write (#183), and every add now gets its season line or a logged reason (#199).

**Design consequence:** any future proposal that would let worth, money, grade or pack luck alter a rate is out of scope by construction. The sim stays untouched.

---

## 2. PRESTIGE — what a card is worth (exists in code today)

The engine is `js/depot-prestige.js`; the authoritative spec is `ECONOMY_DESIGN.md` §1 as amended by §1.5. The component sum:

```
prestige = STAR_tier + ROOKIE + ERA(U-curve) + TRANSCENDENCE + GEM + ERROR + SET_TIER   (floored at 5)
```

| Component | Source | Points |
|---|---|---|
| Player tier | `data/player_tiers.json` | HOF 40 · SUPERSTAR 30 · STAR 20 · REGULAR 8 · COMMON 0 |
| Rookie | card year == MLB debut year, cached on the row | +30 |
| Era (U-curve) | card year | Vintage ≤1985 +20 · Junk Wax 1986–1993 +0 · Modern ≥1994 +6 |
| Transcendence | rookie AND (SUPERSTAR or HOF) | +30, and the junk-wax era line renders +0 rather than a penalty |
| Gem / Error | manual flags | +15 / +25 |
| Set tier | `data/set_tiers.json` | ICONIC +20 · PREMIUM +12 · NOTABLE +6 |

Bands (fixed, and the pack engine depends on them — never rename them): **GOLD ≥ 60 · SILVER 30–59 · BRONZE 10–29 · plain < 10.**

`ECONOMY_DESIGN.md` §1.5E explicitly ruled condition and grading **out of scope** for prestige, on the grounds that prestige rates the *card identity* rather than the individual copy, and that a scan cannot establish condition. That ruling stands. This document does not reopen it: grade does not enter the point sum. It lands one layer out, as a multiplier on the result — which is exactly the "individual copy" axis prestige deliberately refuses to model.

Legibility (§1.5F) also stands: every component renders, including informative zero lines. A multiplier must render as its own line for the same reason.

---

## 3. GRADE — what exists in code today

Grade is already a real, stored, self-entered field:

The ladder ships in `js/depot-card-detail-2b.js` as `GRADES = ["", "1" … "10", "GEM 10", "AUTH"]`, with the empty string meaning ungraded. The same file notes that "saved data + prestige reads are unchanged (mechanics frozen)" — i.e. grade is deliberately inert today.

The column arrived with REDESIGN_V2 decision **D4** (card schema gains grade, star flag, condition notes — nullable, additive). `index.html` persists it through `d4SetGrade`, and `rowToCard` maps it onto the card object.

The redesign spec renders it in two places: a stat chip on card detail ("GRADE PSA 8", `design/redesign-v2/README.md` §2) and a navy pill in the binder grid (§3). The Add-a-Card form has a GRADE select (§4).

**So today grade is display-only.** It is captured, stored, shown, and consumed by nothing. Everything in §4 onward is proposed.

---

## 4. PROPOSED — the grade multiplier

```
worth = prestige × grade_multiplier
```

Applied at the worth boundary, never inside the prestige sum. The card spotlight renders it as its own line, so the arithmetic stays visible end to end:

```
1989 UD Griffey   HOF 40 + ROOKIE 30 + TRANSCENDENCE 30 + JUNK WAX +0  =  100 PRESTIGE
GRADE  GEM 10  ×3.0                                                    =  300 WORTH
```

### 4.1 Invariants (not draft)

Monotonic: a higher grade is never worth less than a lower one. Ungraded is the **1.00× baseline**, never a penalty — most of a real binder is raw, and the game must not punish the default state of collecting. AUTH is not a point on the numeric ladder; it is a separate premium. The multiplier is legible: it always renders as its own labelled line beside the prestige breakdown. And it is worth-only: no code path may pass a grade multiplier into the builder's rate resolution or into `sim.js`.

### 4.2 The curve — **DRAFT, pending Nick**

| Grade | Multiplier | Note |
|---|---|---|
| (blank / raw) | **1.00×** | baseline — the default state of the binder |
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
| AUTH | ×1.40× premium, applied to the raw baseline | authenticated but ungradable (altered, trimmed, autographed) — a distinct thing, not a low grade |

Open shape questions folded into OQ-1: whether the sub-baseline band (1–5) should exist at all, or whether the floor should simply be 1.00× everywhere so that grading can only ever help; and whether AUTH should be a flat multiplier or a flat additive premium.

Ceiling check: at ×3.0 a GEM 10 Griffey is worth 300 against a raw commons-bin card at 5. That is a 60:1 spread inside one binder, which is roughly the real hobby's shape but is aggressive for a salary cap (see `GAME_MODES.md` §2 — a single GEM 10 marquee card would consume most of a mid-tier cap on its own). If the caps feel unplayable in testing, the ceiling comes down before the caps go up.

---

## 5. PROPOSED — pack band feeds prestige a small bump

### 5.1 What exists

Bands are already load-bearing in the pack engine. The free daily pack draws band-first at published rates (plain ~90% · bronze ~8% · silver ~1.5% · gold ~0.5%, the literal `FREE_BAND_ODDS` in `js/depot-pack-engine.js`, returned verbatim by `estimateOdds('free')`). The paid tiers (Bronze 150 / Silver 400 / Gold 900 DD) re-roll their 5th "hit" slot until it meets that tier's band floor. Provenance is durable: `cards.source` distinguishes `'pack'` from `'scan'`, and the `pack_grants` ledger holds one row per pack with tier and seed.

### 5.2 The proposal

The band a card was **pulled from** grants a small additive prestige bump on top of the normal sum — the "I pulled this out of a gold pack" story, made durable.

| Pull band | Bump — **DRAFT** |
|---|---|
| gold | +6 |
| silver | +3 |
| bronze | +1 |
| plain | 0 |
| scanned (source = scan) | 0 |

**Small on purpose.** Pack rolls are already weighted by the prestige system's own tiers, so band correlates with prestige before any bump is applied. A large bump double-counts that correlation, inflates lineup prestige, and — because the win purse scales with lineup prestige — quietly inflates payouts on the exact cards the shop sells. Keep it flavour-sized: visible on the breakdown line, never enough to move a card across a band boundary on its own. Suggested hard rule, also DRAFT: the bump may never promote a card into a higher band than its base sum earns.

Weight is OQ-2.

---

## 6. PROPOSED — verification: self-reported now, community challenge later

### 6.1 Today

Grade is whatever the owner picks from the select. There is no evidence requirement and no check. In single-player that is entirely fine — the same reasoning `ECONOMY_DESIGN.md` §7.4 applies to client-rolled packs: forging cards into your own binder only cheats yourself.

It stops being fine the moment grade multiplies worth *and* worth is compared between players — league standings, VS payouts, and prestige-denominated wagers (`GAME_MODES.md` §6). §7.4's documented hardening item is the precedent: the roll moves server-side before league mode. Same class of problem, same answer.

### 6.2 The path

**SELF-REPORTED → EVIDENCE → CHALLENGED → VERIFIED (or DOWNGRADED).**

A card starts self-reported (today's behaviour, no friction, no gate). The owner may attach evidence — the existing front/back scan slots, ideally a raking-light shot, which is precisely what the mockup copy already asks for. Any player may then challenge the claim from the card's Dugout thread. Resolution produces a verified badge on the grade chip, or a downgrade to the community-agreed grade. Unresolved claims simply stay self-reported; nothing is ever deleted.

### 6.3 Reuse the Dugout challenge flow — it is already designed

`design/redesign-v2/README.md` §2 (option 2b, marked *Final*) already ships the mechanism: every Dugout comment carries an orange **"⚔ Challenge USERNAME"** pill, and "challenges from the Dugout drop into your schedule as exhibition games" — they surface in the Play Ball hub (§5) as a pending exhibition match.

The mockup's own sample copy is this feature's user story, near enough verbatim: MULLET_82 disputes a PSA 8, says the corners look like a 7, and asks for a raking-light scan. WAXPACK_WES answers a card claim with "Play Ball mode, best of 3." The design canvas also carries a parked exploration note about adding a grade-vote poll to 2b.

So the grade challenge is not a new surface. It is the existing challenge pill with a grade claim attached to it, and it can resolve one of two ways — by community vote, or by playing the match the challenge already creates. Which one is OQ-1.

**Dependency, unavoidable:** The Dugout is REDESIGN_V2 decision **D5** — deferred to the final phase (Phase 6), and its plan "MUST include OAuth/social sign-in and a rollout sequence." There is no community verification before there is a community. Until then, self-reported is the only state that exists.

### 6.4 Interim safety rule

Until verification ships, any mode that compares worth between players (league, VS, wagers) reads **unverified grades at 1.00×**. Solo play, the binder, and the spotlight show the full multiplier. This keeps the feature shippable single-player without creating a payout exploit the day multiplayer lands.

---

## 7. OPEN QUESTIONS — Nick's calls

> ### OQ-1 · Challenge model
> How does a contested grade actually resolve? **(a)** community vote from the Dugout thread (needs a quorum rule, a tie rule, and an anti-brigading rule); **(b)** the challenge match the pill already creates — winner's claim stands (fun, thematic, but it settles a factual question with a baseball game); **(c)** evidence-only — a raking-light scan plus N upvotes promotes to verified, with no adversarial step; **(d)** owner-final, with challenges recorded as visible dissent and no forced change.
> Sub-questions: what does a successful challenge *do* — downgrade, or just strip the verified badge? Is there a cost to challenging (a DD ante) to stop nuisance challenges? Can a verified grade be re-challenged after new evidence? Does a downgrade retroactively change worth already banked in past payouts (proposed answer: no — never retroactive)?
> Blocked behind D5 / OAuth either way.

> ### OQ-2 · Pack band weight
> Are the §5.2 draft bumps (gold +6 / silver +3 / bronze +1) the right size, or should the band bump be zero? The case for zero: band already correlates with prestige by construction, so the bump is partly double-counting, and it means two identical cards can carry different prestige based on how they entered the binder — which cuts against "prestige rates the card identity" (§1.5E).
> The case for keeping it: it makes a gold-pack pull *matter* permanently, and it gives the shop a reason to exist beyond raw card acquisition.
> If kept: does a scanned card ever earn a band bump (proposed: no)? Does the free pack's gold band count the same as the paid Gold tier's guaranteed hit (proposed: yes — a gold is a gold)?

> ### OQ-3 · Prestige → coin exchange rate
> Today the only conversion is the win purse: `WIN = 100 + round(lineup_prestige × 1.8)` (`ECONOMY_DESIGN.md` §2). With a grade multiplier and a band bump in play, that 1.8 is now multiplying a *larger and more variable* number, and the salary-cap modes in `GAME_MODES.md` invert the incentive entirely (an underdog bonus pays *more* for *less* prestige).
> The call: does 1.8 stay as-is, does it drop to compensate for grade-inflated worth, or does the payout switch from raw prestige to cap-relative prestige? And separately — is there ever a *direct* prestige→DD conversion (sell/trade-in a card for coins at some rate), or does prestige only ever convert through winning games? Proposed default: prestige never sells directly; the only exchange rate is the purse. Nick to confirm.

---

## 8. What this document does not do

It changes no code, no schema, no odds, and no shipped behaviour. The sim is untouched. `js/depot-prestige.js` is untouched. Grade remains display-only until Nick signs off on §4, and community verification remains blocked behind D5/OAuth. No §6 cache-bust stamping applies to this branch: it ships no assets and moves no build.

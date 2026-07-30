# GAME MODES — salary caps, era locks, and stakes

**Status: DESIGN — proposed, not implemented.** Docs-only file on `docs/design-specs`, cut from `main` at `36c6b30`. No code, no schema, no shells, no §6 cache-bust tags. Everything below marked **DRAFT** is a number awaiting Nick's call. Per AGENTS.md §2, none of the multiplayer or transfer mechanics here may be built into a working path without sign-off.

Companion doc: `design/GRADE_PRESTIGE.md`, which defines prestige, bands, and the proposed grade multiplier this document spends.

---

## 0. The problem this solves

Right now a bigger collection is strictly better. Lineup prestige is a straight sum, the win purse scales with it (`WIN = 100 + round(lineup_prestige × 1.8)`), and nothing anywhere pushes back. The optimal lineup is simply your nine highest-prestige cards, forever. There is no reason to ever play the junk-wax copy again once a better card enters the binder.

**A cap fixes that in one move.** If a mode says "your nine cards may total at most 400 prestige," then Griffey at 100 is a quarter of your budget and he had better earn it — because stats decide how a card plays and prestige decides what it costs. A 1991 Score regular who hit .318 costs 8 points. Suddenly the junk-wax box is a resource, not a shelf.

That is the whole design: **stats are the product, prestige is the price, and the cap is the market.**

---

## 1. What exists in code today

`game/season.js` runs a fixed 8-game season against an AI opponent with an accumulating record and an owner-scoped writeback.

`game/builder.html` assembles the 9 batting slots plus a pitcher and owns `buildTeamPayload`. It already resolves each card's playability status (`'api' | 'card' | 'bad' | 'pending'`).

Lineup prestige already exists as a concept and a rendered number: "sum of prestige across the 9 batting-order slots" (`ECONOMY_DESIGN.md` §2), shown in the builder alongside the projected purse.

Payouts: win = 100 + round(lineup_prestige × 1.8) + bonuses (shutout-ish +50, streak +15 per win capped at +120); loss = 15 flat; AI exhibition win = 25 flat with no prestige scaling and no bonuses (`ECONOMY_DESIGN.md` §3).

**Not shipped — mockups only:** `mockups/nextgen/vs.html` (challenge-a-friend create/accept, "Win pays 888 DD at this lineup's prestige"), `mockups/nextgen/league.html` (standings table with PRESTIGE and DD BANKED columns), and the Play Ball hub in `design/redesign-v2/README.md` §5 with its footnote that Dugout challenges drop into the schedule as exhibition games.

**There is no cap of any kind today, in any mode.** Everything from §2 down is proposed.

---

## 2. Salary-cap modes — the core mechanic

Each mode declares a single number:

```
MAX_LINEUP_PRESTIGE
```

A lineup is legal iff the sum of prestige across its filled slots is at or under the cap. The builder shows a live cap meter (used / remaining), marks the lineup illegal the moment it goes over, and refuses PLAY BALL while it is — with a logged reason, per the fail-loud rule (AGENTS.md §4), never a silent bail:

```
[depot] play blocked: lineup prestige 468 over cap 400 (mode: bush-league)
```

### 2.1 DRAFT cap ladder

| Mode | Cap | Feel |
|---|---|---|
| Sandlot | 150 | commons and regulars only; one bronze-band card is a splurge |
| Bush League | 300 | one silver-band star, or three solid regulars |
| Double-A | 500 | one gold, or a deep balanced nine |
| The Show | 900 | most binders fit; the cap only bites at the top |
| Open | none | today's behaviour, kept as the default mode |

All five numbers are DRAFT. They interact directly with the grade multiplier ceiling in `GRADE_PRESTIGE.md` §4.2 — if worth is what counts against the cap, a GEM 10 marquee card at 300 blows through three of these five caps by itself. Which quantity the cap counts (raw prestige, or grade-multiplied worth) is a real decision and is listed in §8.

### 2.2 Rules that fall out of the cap

The pitcher counts against the cap or he does not, and the answer changes the mode completely (see §8). Empty slots are not legal — a nine-card lineup is still required; you cannot buy cap room by fielding eight. The cap is checked at lock-in and again at first pitch, because a card's prestige can change underneath a saved lineup (the rookie resolver upgrades a card the moment its debut year resolves — `ECONOMY_DESIGN.md` §7.4 notes exactly this, Ohtani '18 going 36 to 96). A lineup that becomes illegal through no fault of the player must say so plainly, not silently drop a card.

---

## 3. Era-restricted modes

Era is already a first-class concept: the binder ships era filters, and the prestige engine's U-curve buckets card years into Vintage (≤1985), Junk Wax (1986–1993) and Modern (≥1994).

**Junk Wax Only (1986–1993).** The thematic heart of the whole game. The era bonus for this bucket is zero by design, so lineups are cheap in prestige terms and a low cap goes a long way — you can field a genuinely good team of overproduced cardboard. This is the mode where a shoebox beats a safe deposit box. Note the one exception that keeps it interesting: the transcendence rule means a marquee junk-wax rookie (the '89 UD Griffey at 100) still costs a fortune, so even here the box has a king.

**Vintage Only (≤1985).** Expensive by construction — every card carries +20 era before anything else — so the same cap buys far fewer players. A vintage mode's cap has to be set higher for the same roster depth, or the mode becomes a nine-commons exercise.

**Modern Only (≥1994).** Cheap era bonus (+6) but this is where the tiered stars and set-tier bonuses cluster.

**Single-year and single-set locks** (a 1987 Topps mode; a "one brand" mode) are the same filter with a tighter predicate, and are the natural home for a weekly rotating challenge.

Era locks compose with caps: a mode is (era predicate, cap, band rules). Every combination is legal; the interesting ones get names.

---

## 4. Band-cap flavour rules

Bands are fixed and load-bearing — GOLD ≥60, SILVER 30–59, BRONZE 10–29, plain <10 — and the pack engine depends on them never being renamed. That makes them a good second axis for mode rules, because a band cap is legible in a way a point cap is not: "at most one gold" needs no arithmetic.

| Rule | Constraint | Flavour |
|---|---|---|
| One Gold | max 1 gold-band card | you get one hero; build around him |
| No Golds | gold-band cards ineligible | the depth-chart mode |
| Commons Night | plain and bronze only | pure junk-wax shoebox baseball |
| Bronze Brigade | at least 6 bronze-or-below | forces the bench to matter |
| Gold Rush | min 3 gold-band | the flex mode, for stacked binders |

Band rules stack on top of a point cap rather than replacing it — "One Gold, cap 300" is a much sharper constraint than either alone.

---

## 5. Underdog coin bonus

Under a cap, today's payout formula points the wrong way: the purse rises with lineup prestige, so the optimal play is to spend the cap to the last point. The cap constrains, but it does not *reward*.

**Proposal:** multiply the win purse by an underdog factor derived from cap headroom.

```
underdog = 1 + k × (1 − lineup_prestige / cap)          [DRAFT: k = 0.6]
win_purse = (BASE_WIN + round(lineup_prestige × 1.8) + bonuses) × underdog
```

Worked example at cap 400, k = 0.6: a maxed lineup (400) pays ×1.00; a 300-prestige lineup pays ×1.15; a 200-prestige lineup pays ×1.30; a 120-prestige shoebox nine pays ×1.42. So the junk-wax team that wins at half the cap out-earns the stacked team that wins at the cap — which is exactly the story the mode is trying to tell.

**Guard rails.** Losing is never profitable: the loss consolation stays flat at 15 and the underdog factor applies to the win purse only. The anti-farming rules stand unchanged (`ECONOMY_DESIGN.md` §3): AI exhibitions stay at a flat 25 with no scaling and no bonuses, so the underdog multiplier can never be farmed against a punching bag. And the factor is bounded — with k = 0.6 the ceiling is ×1.6 at a theoretical zero-prestige lineup, which the 5-point prestige floor makes unreachable anyway.

Open: does the underdog factor use raw prestige or grade-multiplied worth? Same fork as §2.1.

---

## 6. Card-wager stakes, denominated in prestige

**This supersedes the earlier "up to 5 cards" formulation.**

A card count is not a unit of value. Five commons (about 25 prestige total) and five gold-band stars (400+) are the same headline and wildly different bets, so "up to 5 cards" is unpriceable — you cannot agree to a stake you cannot measure. Prestige is the game's own worth currency and the whole reason it exists is to price a card without market data. Stakes should be denominated in it.

**Shape.** The challenger declares a stake — "up to 120 prestige." The acceptor must hold enough eligible cards to cover it, or the challenge cannot be accepted. Both sides see the number before the first pitch. On completion the winner selects cards from the loser's eligible pool, up to but not over the stake total. The stake is a ceiling, not a lot: if the best fit is 118, the winner takes 118 and no change is given.

**Why this is the right unit.** It composes with everything else in the system. A stake is comparable across binders, it scales with the grade multiplier if worth (rather than raw prestige) is what is being wagered, and it makes a genuine tension: your best card is also your most expensive card to risk.

**Hard requirements before any of this ships.** A card transfer is a grant, and the canonical incident in AGENTS.md §4 is unambiguous about grants — a read-then-write check cannot dedupe a race, and the uniqueness key must sit at the granularity of the thing being deduped. So: a wager ledger with one row per settled challenge, unique on the challenge id, the ledger row inserted first, a 23505 on it meaning "already settled" and returning a clean no-op that transfers nothing. Never a client-side "does he still own it" check. Additionally the roll and the settlement must be server-authoritative for the same reason `ECONOMY_DESIGN.md` §7.4 requires the pack roll to move server-side before league mode — a client that can forge cards into its own binder is harmless single-player and catastrophic the moment those cards can be taken from someone else. And it needs OAuth, which is REDESIGN_V2 decision D5, deferred to Phase 6.

**Safety.** Stakes are opt-in per match and never the default. A no-stakes challenge is always available and is the path of least resistance in the UI. Cards flagged as untradeable by their owner are outside the eligible pool. Nothing is ever deleted — a transfer is a change of owner, and both sides keep a ledger row.

---

## 7. Stat-less cards are bench-only

**The finding (documented, not theoretical).** PR #199 (`fix/stabilize`, merged as `36c6b30`) verified enrichment live against the real collection: of 43 rows, 39 carry stats and 4 are blank — and all 4 are genuine no-data. Enrichment fired against those 4 and correctly wrote nothing, logging a reason for each. That sits on top of #181 (provenance persisted on every write, refuse to mislabel a season), #182 (span-guarded re-pull sweep for provenance-less lines) and #183 (kill the stale-identity latch, validate before any stats write).

The conclusion those four PRs earn: **a stat-less card is not a bug waiting to be fixed. It is a permanent class of card.** Manager cards, team cards, checklists, league leaders, prospects who never played a big-league game, non-MLB issues — none of them will ever resolve a season line, no matter how many times enrichment runs.

**The rule.** A card with no resolvable stat line cannot occupy one of the nine batting slots or the mound. It can be owned, displayed, spotlighted, prestiged, pulled from a pack, and wagered. It can sit on the bench. It just cannot bat, because the sim's only input is the stat line (`batter(name, avg, hr, rbi, rates, tendency)`) and there is nothing honest to hand it.

**Fail-loud, per AGENTS.md §4** — the builder must say which card and why, never silently refuse:

```
[depot] slot rejected: no stat line for card <id> (status: bad, reason: no-data)
```

The hook already exists: the builder's `RESOLVED` map carries `status: 'api' | 'card' | 'bad' | 'pending'`. Bench-only is the `'bad'` branch given a name and a UI state, plus a distinction worth drawing — `'pending'` means "not resolved yet, try again," while genuine no-data means "never will, stop asking."

**Prestige is unaffected.** A stat-less card is worth exactly what its components say it is worth. A high-tier player's checklist card still scores, still counts against a cap if it is on the bench, and is still a legitimate wager. This is the cleanest demonstration of the three-axis rule in `GRADE_PRESTIGE.md` §0: worth without play.

---

## 8. OPEN QUESTIONS — Nick's calls

> ### OQ-A · The soft add gate
> When a card is added and no stat line resolves, what should the Add-a-Card flow do?
> **(a) Silent** — add it, no comment; the player discovers it is bench-only later in the builder. Least friction, worst surprise.
> **(b) Soft gate (proposed default)** — add it exactly as requested, but surface a non-blocking note at add time: "No season line found for this card — it can live in the binder and on the bench, but it can't take a lineup slot." Optionally a "check again" affordance, since #182's sweep can backfill later. Nothing is prevented; the player is simply told before it matters.
> **(c) Hard gate** — refuse the add. Almost certainly wrong: the collection is the collection, and a checklist card is a real card. Listed only to be ruled out explicitly.
> Sub-questions: does the note distinguish "no data exists" from "lookup failed, retry later" (it should — #199's enrichment already logs a distinct reason per card)? Does a bench-only card get a visible badge in the binder grid, or only in the builder? Cross-ref #199's "every add gets its season line, or a logged reason."

> ### OQ-B · What does the cap actually count?
> Raw prestige, or grade-multiplied worth (`GRADE_PRESTIGE.md` §4)? Counting worth is more honest — your GEM 10 really is a bigger asset — but it means grading your own cards makes your lineup *more expensive*, which perversely punishes the player for improving their collection. Counting raw prestige keeps the cap stable and makes grade purely an out-of-game bragging axis. Proposed default: **caps count raw prestige; grade multiplies payouts and wagers only.** Nick to confirm, because this single answer also settles the same fork in §2.1, §5 and §6.
> Bundled with it: does the pitcher count against the cap? Proposed: yes, with a separate smaller pitcher allowance, so a mode cannot be gamed by hiding all the value on the mound.

> ### OQ-C · Cap ladder numbers and mode roster
> Are the §2.1 draft caps (150 / 300 / 500 / 900 / open) the right rungs, and is `k = 0.6` the right underdog slope? Both need one real binder's worth of playtesting before they mean anything. Related: which modes ship first — is the season the thing that gains a cap, or does a capped mode sit beside the existing uncapped 8-game season as a separate schedule?

---

## 9. What this document does not do

It changes no code, no schema, no odds, and no shipped behaviour. The 8-game season, the builder, the sim, the payout formula and the pack engine are all exactly as they were. No cap is enforced anywhere. The wager and league mechanics are blocked behind D5 / OAuth and the server-authoritative requirements in §6, and nothing here may land in a working path without Nick's §2 sign-off.

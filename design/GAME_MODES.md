# GAME MODES — salary caps, era locks, and stakes

**Status: DESIGN — revision 2.** Docs-only file on `docs/design-updates`, cut from `main` at `0bd86d5` (the merge of #201, which landed revision 1). No code, no schema, no shells, no §6 cache-bust tags. Items marked **DRAFT** are numbers awaiting Nick's call. Per AGENTS.md §2, none of the multiplayer or transfer mechanics here may be built into a working path without sign-off.

Companion docs: `design/GRADE_PRESTIGE.md` (identity, prestige, bands, grade multiplier) and `design/STARTER_BOX.md` (the 25-card onboarding grant).

## Decisions landed since revision 1

**Caps count raw prestige** — the former OQ-B, answered in favour of the proposed default. Propagated through §2.0, §5 and §6, and recorded in §9. The immediate effect: the grade multiplier and any future scan premium are *payout and stake* mechanics, not *roster legality* mechanics. A cap means the same thing to every player regardless of how well-graded or well-verified their binder is, which is the property that makes a cap fair.

Also folded in from the identity decision (`GRADE_PRESTIGE.md` §0): cards enter the Depot **PULLED** or **SCANNED**, pulled is liquid and scanned is prestigious. That distinction now sets the default eligibility rule for wagers (§6) and gives the starter box its shape (§8).

---

## 0. The problem this solves

Right now a bigger collection is strictly better. Lineup prestige is a straight sum, the win purse scales with it (`WIN = 100 + round(lineup_prestige × 1.8)`), and nothing pushes back. The optimal lineup is your nine highest-prestige cards, forever. There is no reason to ever play the junk-wax copy again once a better card enters the binder.

**A cap fixes that in one move.** If a mode says "your nine cards may total at most 400 prestige," then Griffey at 100 is a quarter of your budget and he had better earn it — because stats decide how a card plays and prestige decides what it costs. A 1991 Score regular who hit .318 costs 8 points. Suddenly the junk-wax box is a resource, not a shelf.

That is the whole design: **stats are the product, prestige is the price, and the cap is the market.**

---

## 1. What exists in code today

`game/season.js` runs a fixed 8-game season against an AI opponent with an accumulating record and an owner-scoped writeback.

`game/builder.html` assembles the 9 batting slots plus a pitcher and owns `buildTeamPayload`. It already resolves each card's playability status (`'api' | 'card' | 'bad' | 'pending'`).

Lineup prestige already exists as a concept and a rendered number: "sum of prestige across the 9 batting-order slots" (`ECONOMY_DESIGN.md` §2), shown in the builder alongside the projected purse.

Payouts: win = 100 + round(lineup_prestige × 1.8) + bonuses (shutout-ish +50, streak +15 per win capped at +120); loss = 15 flat; AI exhibition win = 25 flat with no prestige scaling and no bonuses (`ECONOMY_DESIGN.md` §3).

**Not shipped — mockups only:** `mockups/nextgen/vs.html` (challenge-a-friend create/accept, "Win pays 888 DD at this lineup's prestige"), `mockups/nextgen/league.html` (standings with PRESTIGE and DD BANKED columns), and the Play Ball hub in `design/redesign-v2/README.md` §5, whose footnote already says Dugout challenges drop into the schedule as exhibition games.

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

### 2.0 What the cap counts — DECIDED: raw prestige

The cap counts the **raw prestige sum** defined in `GRADE_PRESTIGE.md` §3 — player tier, rookie, era, transcendence, manual flags, set tier. It does **not** count the grade multiplier, and it will not count a scan premium if one is adopted.

Two reasons this is the right answer and not merely the simple one. First, counting worth would mean **grading your own cards makes your lineup more expensive to field** — the game would punish you for improving your collection, which is backwards. Second, a cap is a fairness device, and it only works if 400 means the same thing to every player. Under raw prestige it does. Grade and verification stay where they belong: on payouts, stakes and bragging rights.

### 2.1 DRAFT cap ladder

| Mode | Cap | Feel |
|---|---|---|
| Sandlot | 150 | commons and regulars only; one bronze-band card is a splurge |
| Bush League | 300 | one silver-band star, or three solid regulars |
| Double-A | 500 | one gold, or a deep balanced nine |
| The Show | 900 | most binders fit; the cap only bites at the top |
| Open | none | today's behaviour, kept as the default mode |

All five numbers are DRAFT. Revision 1 flagged that a ×3.0 GEM 10 marquee card at 300 worth would blow through three of these five caps by itself — **the raw-prestige decision removes that problem entirely.** The Griffey costs 100 in every mode, graded or not. The ladder now only has to be tuned against the prestige sum, which is a far more stable target.

A useful sanity check for the ladder: the starter box (`STARTER_BOX.md`) is deliberately built to field a legal nine in the **Sandlot** band, so 150 is not an arbitrary floor — it is the number the onboarding grant has to clear.

### 2.2 Rules that fall out of the cap

Empty slots are not legal — a nine-card lineup is still required; you cannot buy cap room by fielding eight. The cap is checked at lock-in and again at first pitch, because a card's prestige can change underneath a saved lineup: the rookie resolver upgrades a card the moment its debut year resolves (`ECONOMY_DESIGN.md` §7.4 notes exactly this, Ohtani '18 going 36 to 96). A lineup that becomes illegal through no fault of the player must say so plainly, not silently drop a card.

Whether the pitcher counts against the same cap or against a separate smaller allowance is still open (§9, OQ-B').

---

## 3. Era-restricted modes

Era is already a first-class concept: the binder ships era filters, and the prestige engine's U-curve buckets card years into Vintage (≤1985), Junk Wax (1986–1993) and Modern (≥1994).

**Junk Wax Only (1986–1993).** The thematic heart of the game. The era bonus for this bucket is zero by design, so lineups are cheap in prestige terms and a low cap goes a long way — you can field a genuinely good team of overproduced cardboard. This is the mode where a shoebox beats a safe deposit box. The one exception keeps it interesting: the transcendence rule means a marquee junk-wax rookie (the '89 UD Griffey at 100) still costs a fortune, so even here the box has a king.

**Vintage Only (≤1985).** Expensive by construction — every card carries +20 era before anything else — so the same cap buys far fewer players. A vintage mode's cap has to run higher for the same roster depth, or the mode becomes a nine-commons exercise.

**Modern Only (≥1994).** Cheap era bonus (+6), but this is where the tiered stars and set-tier bonuses cluster.

**Single-year and single-set locks** (a 1987 Topps mode; a one-brand mode) are the same filter with a tighter predicate, and are the natural home for a weekly rotating challenge.

Era locks compose with caps: a mode is (era predicate, cap, band rules). Every combination is legal; the interesting ones get names.

---

## 4. Band-cap flavour rules

Bands are fixed and load-bearing — GOLD ≥60, SILVER 30–59, BRONZE 10–29, plain <10 — and the pack engine's `BAND_RANK` depends on them never being renamed. That makes them a good second axis, because a band cap is legible in a way a point cap is not: "at most one gold" needs no arithmetic.

| Rule | Constraint | Flavour |
|---|---|---|
| One Gold | max 1 gold-band card | you get one hero; build around him |
| No Golds | gold-band cards ineligible | the depth-chart mode |
| Commons Night | plain and bronze only | pure junk-wax shoebox baseball |
| Bronze Brigade | at least 6 bronze-or-below | forces the bench to matter |
| Gold Rush | min 3 gold-band | the flex mode, for stacked binders |

Band rules stack on top of a point cap rather than replacing it — "One Gold, cap 300" is a much sharper constraint than either alone.

Because bands are read off raw prestige, band rules inherit the same fairness property: a card's band never moves because someone had it graded.

---

## 5. Underdog coin bonus

Under a cap, today's payout formula points the wrong way: the purse rises with lineup prestige, so the optimal play is to spend the cap to the last point. The cap constrains, but it does not *reward*.

**Proposal:** multiply the win purse by an underdog factor derived from cap headroom.

```
underdog = 1 + k × (1 − lineup_prestige / cap)          [DRAFT: k = 0.6]
win_purse = (BASE_WIN + round(lineup_prestige × 1.8) + bonuses) × underdog
```

`lineup_prestige` here is **raw prestige**, the same quantity the cap counts. That is what makes the ratio meaningful: both halves of `lineup_prestige / cap` are measured in the same units, and nobody can manufacture headroom by leaving cards ungraded.

Worked example at cap 400, k = 0.6: a maxed lineup (400) pays ×1.00; 300 pays ×1.15; 200 pays ×1.30; a 120-prestige shoebox nine pays ×1.42. The junk-wax team that wins at half the cap out-earns the stacked team that wins at the cap — exactly the story the mode is trying to tell.

**Guard rails.** Losing is never profitable: the loss consolation stays flat at 15 and the factor applies to the win purse only. Anti-farming stands unchanged (`ECONOMY_DESIGN.md` §3): AI exhibitions stay at a flat 25 with no scaling and no bonuses, so the multiplier can never be farmed against a punching bag. And the factor is bounded — at k = 0.6 the ceiling is ×1.6 at a theoretical zero-prestige lineup, which the 5-point prestige floor makes unreachable.

Where grade *does* land: on the purse, through whatever `GRADE_PRESTIGE.md` OQ-B settles for the prestige→coin rate. Payouts are the right home for it precisely because they are not roster legality.

---

## 6. Card-wager stakes, denominated in prestige

**This supersedes the earlier "up to 5 cards" formulation.**

A card count is not a unit of value. Five commons (about 25 prestige total) and five gold-band stars (400+) are the same headline and wildly different bets, so "up to 5 cards" is unpriceable — you cannot agree to a stake you cannot measure. Prestige is the game's own worth currency and the whole reason it exists is to price a card without market data.

**Shape.** The challenger declares a stake — "up to 120 prestige." The acceptor must hold enough eligible cards to cover it, or the challenge cannot be accepted. Both sides see the number before the first pitch. On completion the winner selects cards from the loser's eligible pool, up to but not over the stake total. The stake is a ceiling, not a lot: if the best fit is 118, the winner takes 118 and no change is given.

**Denominated in raw prestige, for consistency with the cap** — the same number does the same job in both places, and a stake cannot be inflated by grading the cards you are risking. Whether *settlement* should consider worth rather than raw prestige is left to `GRADE_PRESTIGE.md` OQ-B and OQ-C; the stake declaration itself stays raw.

**Eligibility follows the identity model** (`GRADE_PRESTIGE.md` §0). Proposed default: **PULLED cards are wager-eligible by default; SCANNED cards are opt-in.** Pulled cards are liquid — the server minted them, their provenance is a ledger row, and moving them again costs nobody any trust. A scanned card is a claim about a physical object sitting in someone's shoebox, and no sane person wants to auto-stake their real Griffey because they clicked accept. Opt-in is the safe default, and it also makes the two doors *feel* different, which is the point of the identity model.

**Hard requirements before any of this ships.** A card transfer is a grant, and the canonical incident in AGENTS.md §4 is unambiguous about grants — a read-then-write check cannot dedupe a race, and the uniqueness key must sit at the granularity of the thing being deduped. So: a wager ledger with one row per settled challenge, unique on the challenge id, inserted first, with a 23505 meaning "already settled" and returning a clean no-op that transfers nothing. Never a client-side "does he still own it" check. Settlement must be server-authoritative for the same reason `ECONOMY_DESIGN.md` §7.4 requires the pack roll to move server-side before league mode: a client that can forge cards into its own binder is harmless single-player and catastrophic the moment those cards can be taken from someone else. And it needs OAuth — REDESIGN_V2 decision D5, Phase 6.

**Safety.** Stakes are opt-in per match and never the default. A no-stakes challenge is always available and is the path of least resistance in the UI. Nothing is ever deleted — a transfer is a change of owner, and both sides keep a ledger row.

---

## 7. Stat-less cards are bench-only

**The finding (documented, not theoretical).** PR #199 (`fix/stabilize`) verified enrichment live against the real collection: of 43 rows, 39 carry stats and 4 are blank — and all 4 are genuine no-data. Enrichment fired against those 4 and correctly wrote nothing, logging a reason for each. That sits on top of #181, #182 and #183.

The conclusion those four PRs earn: **a stat-less card is not a bug waiting to be fixed. It is a permanent class of card.** Manager cards, team cards, checklists, league leaders, prospects who never played a big-league game, non-MLB issues — none will ever resolve a season line, no matter how many times enrichment runs.

**The rule.** A card with no resolvable stat line cannot occupy one of the nine batting slots or the mound. It can be owned, displayed, spotlighted, prestiged, pulled from a pack, and wagered. It can sit on the bench. It just cannot bat, because the sim's only input is the stat line (`batter(name, avg, hr, rbi, rates, tendency)`) and there is nothing honest to hand it.

**Fail-loud, per AGENTS.md §4** — the builder must say which card and why, never silently refuse:

```
[depot] slot rejected: no stat line for card <id> (status: bad, reason: no-data)
```

The hook already exists: the builder's `RESOLVED` map carries `status: 'api' | 'card' | 'bad' | 'pending'`. Bench-only is the `'bad'` branch given a name and a UI state, plus a distinction worth drawing — `'pending'` means "not resolved yet, try again," while genuine no-data means "never will, stop asking."

**Prestige is unaffected.** A stat-less card is worth exactly what its components say. It still counts against a cap if it is on the bench, and it is still a legitimate wager. This is the cleanest demonstration of the three-axis rule: worth without play.

**New-player interaction.** The starter box exists partly because of this rule: a roster-shaped roll guarantees a *fieldable* nine, so a new player cannot open their first cards and discover that none of them can bat. See `STARTER_BOX.md` §3.

---

## 8. The Starter Box

Specced in full in **`design/STARTER_BOX.md`**. Summary, because it is a game-mode concern as much as an economy one: a one-time, 25-card, roster-shaped grant at account creation — 25 being an MLB active roster — position-aware so it yields a fieldable nine plus a bench and pitching, mostly plain with one guaranteed bronze-or-better hit, all library art, all born verified, one per account through an idempotent `starter_box` ledger grant.

Its purpose is the first five minutes: **a new player should field a lineup and play a game before they have to find a scanner.** That is also what makes the scan gate (`GRADE_PRESTIGE.md` §7.3) survivable — the pulled door is wide open on day one, so the added friction on the scanned door never blocks onboarding.

Its cap interaction is deliberate: a starter-box lineup should comfortably clear the Sandlot cap (150) and sit well under Bush League (300), so the two lowest rungs of the §2.1 ladder are playable from the first session with nothing bought.

---

## 9. OPEN QUESTIONS

> ### OQ-A · The soft add gate *(carried forward, narrowed)*
> When a card is added and no stat line resolves, what should the Add-a-Card flow do?
> **(a) Silent** — add it, no comment; the player discovers it is bench-only later in the builder. Least friction, worst surprise.
> **(b) Soft gate (proposed default)** — add it exactly as requested, but surface a non-blocking note: "No season line found for this card — it can live in the binder and on the bench, but it can't take a lineup slot." Optionally a "check again" affordance, since #182's sweep can backfill later.
> **(c) Hard gate** — refuse the add. Almost certainly wrong: the collection is the collection, and a checklist card is a real card. Listed to be ruled out explicitly.
> **What changed in revision 2:** the add flow is now scan-gated (`GRADE_PRESTIGE.md` §7.3), so this note would land inside a flow that already asks something of the user. That is an argument for keeping it soft — two blocking gates on one screen is one too many — but the scan gate does **not** answer this question, because a scanned card can still be a manager card.
> Sub-questions: does the note distinguish "no data exists" from "lookup failed, retry later" (it should — #199's enrichment already logs a distinct reason per card)? Does a bench-only card get a visible badge in the binder grid, or only in the builder?

> ### OQ-B' · Does the pitcher count against the cap? *(the surviving half of the old OQ-B)*
> The cap-counting question itself is **decided** — raw prestige, §2.0. What is still open is the pitcher's treatment: one shared cap across all ten slots, or nine batting slots against `MAX_LINEUP_PRESTIGE` plus a separate smaller pitcher allowance?
> Proposed: **a separate allowance.** A single shared cap lets a mode be gamed by hiding all the value on the mound, and in reverse it makes an ace unaffordable in a low-cap mode where pitching still has to exist. A second small number is one more thing to tune, but it keeps both halves of the roster honest.

> ### OQ-C · Cap ladder numbers and mode roster *(carried forward)*
> Are the §2.1 caps (150 / 300 / 500 / 900 / open) the right rungs, and is `k = 0.6` the right underdog slope? Both need one real binder's worth of playtesting before they mean anything — and now they also need checking against a starter-box lineup, which is the one roster every new player will have.
> Related: which modes ship first? Does the existing 8-game season gain a cap, or does a capped mode sit beside it as a separate schedule?

---

## 10. What this document does not do

It changes no code, no schema, no odds and no shipped behaviour. The 8-game season, the builder, the sim, the payout formula and the pack engine are all exactly as they were. No cap is enforced anywhere. The wager and league mechanics are blocked behind D5 / OAuth and the server-authoritative requirements in §6, and nothing here may land in a working path without Nick's §2 sign-off.

# ECONOMY_DESIGN.md  -  The Franchise Economy

> **Status:** Design pinned from the approved mockups (PR #99, mockups/economy/).
> ECONOMY_DESIGN.md never landed before; these are the tightened rules the mockups imply.
> Part 2 DDL is **proposed for Nick to run**  -  no schema/RLS executed by this session
> (AGENTS.md 2). Currency name placeholder: **DEPOT DOLLARS (DD)**  -  Nick's to rename.
>
> **The sacred rule (unchanged):** prestige and money **never** touch how a card plays.
> Cards always perform as their card-year selves. Prestige is *desirability*; it only
> scales how much you **earn** per win.

---

## 1. Prestige formula (transparent points, no market data)

Prestige is a small sum of legible components computed from card data + a shipped
tier table + a rookie determination. No live pricing, no market feeds.

    prestige = STAR_tier + ROOKIE_bonus + VINTAGE_bonus + GEM_bonus
    (floored at 5)

**STAR tier**  -  from a static, repo-shipped table data/player_tiers.json
(keyed by normalized player name; see 1.4):

| Tier       | Points | Meaning                                   |
|------------|-------:|-------------------------------------------|
| HOF        |     40 | Hall-of-Fame calibre                      |
| SUPERSTAR  |     30 | Perennial all-star / MVP-tier active      |
| STAR       |     20 | Established, notable                      |
| REGULAR    |      8 | Everyday player, not a name draw          |
| COMMON     |      0 | Commons-bin (default when unlisted)       |

**ROOKIE bonus: +30**  -  awarded when card year == player's MLB debut year.
Debut year is resolvable via the **MLB Stats API** and, once determined, is **cached on
the card row** (rookie_year int + rookie_checked bool, see Part 2 note) so we resolve
it at most once per card. If the API is unreachable, rookie defaults to false, fail-loud
([depot] rookie lookup skipped), and can be re-resolved later.

**VINTAGE bonus**  -  by era bucket of the card year:

| Era bucket        | Points | Label   |
|-------------------|-------:|---------|
| pre-1980          |     20 | VINTAGE |
| 1980-1989         |     10 | VINTAGE |
| 1990-1994         |      6 | ERA     |
| 1995 and later    |      0 |  -        |

**GEM bonus: +15**  -  a **manual flag** (gem bool, admin/owner-set). Off by default;
a hook for standout copies (autos, rare parallels) without any market data.

**Floor:** any real card scores at least **5** (a commons-bin modern card sits at 5-8).

### 1.1 Worked example  -  the mockup's legibility target
1989 Upper Deck #1 Ken Griffey Jr.: HOF **40** + ROOKIE **30** (1989 debut, 1989 card)
+ VINTAGE **10** (1980s) = **80 PRESTIGE** -> GOLD tier. Matches the spotlight mockup's
ceiling.

### 1.2 Tier bands (badge color, per mockup)
GOLD >= 60 - SILVER 30-59 - BRONZE 10-29 - (below 10 = plain badge).
These drive the gold/silver/bronze corner gem + the star-rating fill on cards.

### 1.3 Prestige for Nick's real collection anchors (formula applied)
HOF vintage stars land ~46-50; Griffey is the ceiling at 80; commons at 5-8. Full
per-card table for all 18 cards is produced live in the session report.

### 1.4 The tier table  -  data/player_tiers.json, how it grows
Shipped seed keyed by normalized name (lowercase, NFKD, punctuation-stripped  -  same
normName the rolodex uses), value = tier string. Seeded with HOF/superstar/star tiers
for the marquee names across the checklist's players.json (and every player in Nick's
binder). **Growth:** unlisted players default to COMMON (0); to promote a player, add a
"normalized name": "TIER" entry and merge (docs/data are additive). No per-card editing.

---

### 1.5 Amendment (hobby-research corrections)  -  supersedes the era model in section 1 and the section 1.1 example

Real-hobby feedback tightened the formula. Where this section conflicts with the
VINTAGE table above or the section 1.1 worked example, **this section wins**; the engine
(js/depot-prestige.js) implements the rules below.

**A. Era is a U-curve, not a descending ramp.** Overproduction made the "junk wax"
years the hobby's least-valuable era, so its era bonus is zero  -  not a middle tier.

| Era bucket            | Points | Label           |
|-----------------------|-------:|-----------------|
| Vintage (<= 1985)     |     20 | VINTAGE         |
| Junk Wax (1986-1993)  |      0 | JUNK WAX ERA    |
| Modern (>= 1994)      |      6 | MODERN          |

**B. Transcendence rule.** A card that is BOTH a rookie AND a marquee player
(SUPERSTAR or HOF tier) earns a **+30 TRANSCENDENCE** bonus, and the junk-wax era
penalty is overridden (the era line renders +0, not negative). This is the
1989 Upper Deck Griffey rookie case  -  the most valuable junk-wax card in the real
hobby  -  which must land at or near the top of any collection holding it.

Revised worked example: 1989 UD Griffey = HOF **40** + ROOKIE **30** +
TRANSCENDENCE **30** + JUNK WAX **+0** = **100 PRESTIGE** (ceiling, GOLD).
Verify on Nick's real collection: Griffey is the highest card.

**C. ERROR flag: +25**  -  a manual flag (error bool, set at add-time or by admin)
for famous error/variation cards (the Frank Thomas "no name on front" class). Off by
default; no market data involved.

**D. SET TIER  -  data/set_tiers.json.** A small curated table of iconic sets grants a
set bonus so brand-within-year matters (1993 SP >> 1993 Topps). Keyed by normalized
"YEAR brand/set"; unlisted sets default to 0. Bonuses: ICONIC +20, PREMIUM +12,
NOTABLE +6. Grows the same additive way as player_tiers.json.

Revised component sum:

    prestige = STAR_tier + ROOKIE_bonus + ERA_bonus (U-curve) + TRANSCENDENCE
             + GEM_bonus + ERROR_bonus + SET_TIER_bonus   (floored at 5)

**E. Explicitly out of scope (and why).**
- **Condition / grading:** a scan cannot establish condition, and prestige rates the
  card *identity*, not the individual copy. No condition input exists, so none is used.
- **Live market pricing:** volatile, paid, and would make payouts unpredictable
  match-to-match. Prestige stays a fixed, transparent point sum.

**F. Legibility.** The spotlight breakdown renders every component, including
informative zero-lines (e.g. "JUNK WAX ERA +0"), so the U-curve is visible to players.

## 2. Earnings

Money is paid on game completion:

    WIN  payout = BASE_WIN (100) + round(lineup_prestige x 1.8) + bonuses
    LOSS payout = LOSS_CONSOLATION (15), flat, no prestige scaling

**Bonuses (win only), matching the payday mockup:**
- SHUTOUT-ish (opponent scored <= 1): **+50**
- UNBEATEN STREAK: **+15 x current win streak** (capped at x8 = +120)

**Scale check (the builder/payday mockup):** lineup_prestige **440** ->
100 + round(440 x 1.8 = 792) = **892** base win purse -> the builder's
"LINEUP PRESTIGE 440 -> WIN PAYS ~889" (rounded). With the mockup's stacked bonuses
(shutout +50, streak x4 = +60) the payday = **$1,002 DD**, new balance $2,129  - 
exactly the payout screen.

lineup_prestige = sum of prestige across the 9 batting-order slots.

---

## 3. Anti-farming

- **Full payout only for season / league games.** Ranked, one-per-slot games
  (idempotent writeback already enforces one record per season_games row).
- **AI-exhibition wins pay a capped trickle:** EXHIBITION_WIN = 25 flat (no prestige
  scaling, no bonuses). Enough to feel alive, too small to farm.
- **Repeat-opponent diminishing returns: deferred to league mode.** Noted for
  **LEAGUE_DESIGN.md**: repeated wins vs the same opponent within a window should taper
  (e.g. 100% -> 60% -> 30%). Not implemented in v1.

---

## 4. Sinks

- **v1 primary sink (Slice B): card packs** drawing from the catalog checklist. Pack art
  uses the **shared library image when available** (per SHARED_LIBRARY_DESIGN.md), else
  the **pixel-art placeholder**. Tiered pack prices.
- **Secondary sink (Slice C): cosmetics** (franchise flair) + contribution bounties.
- **SINKS ARE NOT BUILT IN SLICE A.** Slice A only makes *earning* exist and feel good.
- Currency name **DEPOT DOLLARS (DD)** is a placeholder until Nick renames.

---

## 5. Slice plan

- **Slice A (this session):** prestige engine + prestige badges/spotlight + lineup
  prestige & projected payout in the builder + wallet chip + **payout-on-win** writeback.
  Wallet UI **graceful-hidden** until Part 2 DDL is run.
- **Slice B:** pack shop + pack-rip reveal (the first sink), library/placeholder art.
- **Slice C:** cosmetics + contribution bounties.

---

## 6. Part 2 pointer  -  storage

The wallet + ledger DDL (franchise balance + wallet_transactions, owner-scoped RLS,
payout written via the same authenticated path as the season writeback) is specified in
the **session report** for Nick to run in the Supabase SQL editor. Slice A code must
**fail-loud and hide the wallet chip** until those tables exist.

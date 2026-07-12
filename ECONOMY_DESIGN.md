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


---

## 7. Slice B — The Pack Shop (the DD sink)

> **Status:** design pinned; Part 2 DDL below is **proposed for Nick to run** — no
> > schema/RLS executed by this session (AGENTS.md §2). Purchase-path code does not merge
> > > until Nick confirms the DDL is run. Prices/odds below match the approved mockups
> > > > (mockups/economy/shop.html + pack.html, mockups/nextgen/shop.html).
> > > >
> > > > ### 7.1 Packs grant REAL collection cards
> > > > A pack purchase inserts real rows into the `cards` table — owner-scoped, playable in
> > > > lineups, visible in the binder — drawn from the checklist catalog (the static
> > > > `data/cards-YYYY.json` universe, year from filename; see SHARED_LIBRARY_DESIGN.md §0).
> > > > The collection **is** the roster, so the money sink must feed the same table earning
> > > > feeds off. Pack rows are flagged `source:'pack'` so scanned cards and pulled cards stay
> > > > distinguishable (scans stay `source:'scan'`, the default).
> > > >
> > > > Pack-granted cards have **no scan image**. They render with an original **8-bit
> > > > pixel-art card front** generated client-side in the Depot style: player name, year,
> > > > brand, position on a stylized pixel card, plus the prestige gem. **No copyrighted
> > > > imagery and no real card art is fetched from anywhere** — the front is drawn from card
> > > > text only. Per SHARED_LIBRARY_DESIGN.md §5 the resolution order is
> > > > **personal image → shared-library image → pixel placeholder**; the shared library is
> > > > unbuilt, so today pack cards always resolve to the pixel placeholder, and the library
> > > > later upgrades that art in place when scans exist.
> > > >
> > > > ### 7.2 Tiers, pricing, odds (tuned to the earnings curve)
> > > > Season win ≈ 300–450 DD at the current lineup (§2). Prices come straight from the
> > > > approved mockups (shop.html / nextgen/shop.html both show 150 / 400 / 900 DD). These
> > > > supersede the rough 100/250/500 first-pass figures: a Bronze is a fraction of one win,
> > > > a Gold is ~2–3 wins, so the earn→spend→grow loop stays tight (the mockup's own note:
> > > > "balance after a GOLD pack … win two more games and you're back in gold range").
> > > >
> > > > | Tier   | Price   | Cards | Pool / weighting                                   | Guarantee / hit slot |
> > > > |--------|--------:|:-----:|----------------------------------------------------|----------------------|
> > > > | Bronze | 150 DD  |   5   | junk-wax-weighted (1986–1993 heavy), low star odds | small shot at a SILVER-band hit |
> > > > | Silver | 400 DD  |   5   | all eras, moderate star/rookie odds                | guaranteed ≥1 SILVER-band, better vintage odds |
> > > > | Gold   | 900 DD  |   5   | vintage + rookie-weighted                          | guaranteed a GOLD-band (prestige ≥ 60) hit |
> > > >
> > > > **Structure:** 5 cards per pack; the **5th card is the "hit" slot** with tier-scaled
> > > > odds and the reveal ceremony. Draws are weighted by the prestige system's own tiers so
> > > > pack excitement tracks the game's real value system: the roll biases toward
> > > > `player_tiers.json` STAR/SUPERSTAR/HOF names, the rookie determination (card year ==
> > > > debut year), and the era U-curve (§1.5 — vintage ≤1985 and marquee rookies score high;
> > > > junk-wax commons score low). The hit slot re-rolls until it meets the tier's band floor
> > > > (Bronze→SILVER 30+, Silver→SILVER 30+ with higher rookie odds, Gold→GOLD 60+).
> > > >
> > > > **Published odds (legibility rule, §1.5F):** the shop UI prints each tier's card count,
> > > > guarantee, and hit-band odds on the pack card, so the value system is visible before
> > > > purchase — no hidden rates.
> > > >
> > > > ### 7.3 Duplicates
> > > > Duplicates are **allowed** — real collecting has dupes, and a second copy of a star is
> > > > still lineup-useful and still desirable. Future **trade-in sink** (turn N dupes into DD
> > > > or a tier token) is noted for a later slice; **not built in v1.**
> > > >
> > > > ### 7.4 Anti-abuse
> > > > v1 is single-user reality, so pack **contents are client-rolled** in v1. But the
> > > > **DEBIT must be server-atomic**: the existing `depot_apply_payout` RPC has **no floor
> > > > check**, so a client-side "balance ≥ cost" check alone would allow a negative balance
> > > > under a race or a tampered client. Part 2 proposes a `depot_purchase_pack` RPC that,
> > > > in one transaction, checks `balance >= cost`, debits, writes the ledger row, and returns
> > > > the new balance — refusing (no debit, no ledger row) when funds are short.
> > > >
> > > > **League-mode hardening (deferred, noted):** move the pack **roll** server-side (RPC
> > > > returns the rolled catalog keys) so contents can't be client-tampered. v1 keeps the roll
> > > > client-side and only hardens the debit; this is the documented hardening item.
> > > > **Modern gold is deferred to the collection (Part 3 obligation):** catalog prestige is
> > > > pre-rookie. Catalog rows have no `rookie_year`, so catalog scoring can't see ROOKIE/
> > > > TRANSCENDENCE and a modern star scores "silver" in a pack. But a PULLED card lands in the
> > > > collection and flows through `persistRookieYear`, where a true rookie of a tiered player
> > > > upgrades exactly like Ohtani '18 did (36->96 gold) -- a second reveal in the binder, a
> > > > feature not a gap. Part 3 MUST wire the rip so its inserted rows trigger the rookie
> > > > resolver. Gold-band pack HITS stay vintage-HOF (thematically right); hit logic unchanged.
> > > > **Purchase-service error classification (Part 3 obligation):** `depot-shop.js` must
> > > > distinguish network / undefined-function errors ("offline" -- show the offline banner)
> > > > from Postgres exceptions raised by `depot_purchase_pack` ("exists" -- surface the message,
> > > > e.g. insufficient funds). Today both wear the offline banner, so a genuine outage and a
> > > > real RPC bug are indistinguishable. (Prompted by the missing-config bug fixed in fix/shop-supabase-config.)
> > > >
> > > > ### 7.5 Part 2 — proposed DDL for the shop (Nick runs; not executed here)
> > > >
> > > > Same pattern as the wallet DDL (§6): `SECURITY DEFINER`, `auth.uid()` guard like
> > > > `depot_apply_payout`, owner-scoped, ledger-first. The RPC is the only new server object
> > > > strictly required; the `source` column is a small additive column; a pack-log table is
> > > > **argued unnecessary** (derive from `wallet_transactions`).
> > > >
> > > > ```sql
> > > > -- (1) cards.source — distinguish scanned vs pack-granted cards. Additive, default keeps
> > > > --     every existing row correct as a scan. No backfill needed.
> > > > alter table public.cards
> > > >   add column if not exists source text not null default 'scan';
> > > > -- optional guard: constrain to known values
> > > > alter table public.cards
> > > >   add constraint cards_source_chk check (source in ('scan','pack')) not valid;
> > > >
> > > > -- (2) depot_purchase_pack — server-atomic debit with a balance floor.
> > > > --     Mirrors depot_apply_payout's auth guard, but ADDS the floor check the payout RPC
> > > > --     lacks, and writes the negative-amount ledger row in the SAME transaction as the
> > > > --     debit so a purchase can never leave a row/balance mismatch.
> > > > create or replace function public.depot_purchase_pack(p_cost integer, p_tier text)
> > > > returns integer               -- returns the NEW balance
> > > > language plpgsql
> > > > security definer
> > > > set search_path = public
> > > > as $$
> > > > declare
> > > >   v_owner uuid := auth.uid();
> > > >   v_balance integer;
> > > > begin
> > > >   if v_owner is null then
> > > >     raise exception 'depot_purchase_pack: not authenticated';
> > > >   end if;
> > > >   if p_cost is null or p_cost <= 0 then
> > > >     raise exception 'depot_purchase_pack: invalid cost %', p_cost;
> > > >   end if;
> > > >
> > > >   -- lock the franchise row for this owner so the check+debit is atomic
> > > >   select balance into v_balance
> > > >     from public.franchises
> > > >    where owner_id = v_owner
> > > >    for update;
> > > >
> > > >   if v_balance is null then
> > > >     raise exception 'depot_purchase_pack: no franchise for owner';
> > > >   end if;
> > > >
> > > >   -- THE FLOOR CHECK the payout RPC lacks: refuse, do not go negative
> > > >   if v_balance < p_cost then
> > > >     raise exception 'depot_purchase_pack: insufficient funds (balance %, cost %)',
> > > >       v_balance, p_cost using errcode = 'P0001';
> > > >   end if;
> > > >
> > > >   -- ledger row first (negative amount), then debit, one transaction
> > > >   insert into public.wallet_transactions (owner_id, amount, reason, meta)
> > > >   values (v_owner, -p_cost, 'pack_purchase',
> > > >           jsonb_build_object('tier', p_tier));
> > > >
> > > >   update public.franchises
> > > >      set balance = balance - p_cost
> > > >    where owner_id = v_owner
> > > >   returning balance into v_balance;
> > > >
> > > >   return v_balance;
> > > > end;
> > > > $$;
> > > >
> > > > revoke all on function public.depot_purchase_pack(integer, text) from public;
> > > > grant execute on function public.depot_purchase_pack(integer, text) to authenticated;
> > > > ```
> > > >
> > > > **Pack-log / pack-odds table — not needed (documented decision).** A purchase is fully
> > > > recoverable from `wallet_transactions`: reason `'pack_purchase'`, negative `amount`, and
> > > > the tier in `meta`. Which cards were pulled is recoverable from `cards where source='pack'`
> > > > (with `created_at`). Odds live in shipped client config + this doc, not a table, so they
> > > > stay legible and versioned in git. Adding a `pack_log` table would duplicate derivable
> > > > state; **deferred to league mode** (when server-side rolls need an audit trail).
> > > >
> > > > > **Note on `wallet_transactions.meta`:** the RPC assumes a `meta jsonb` column exists on
> > > > > > `wallet_transactions` (used to stamp the tier). If the wallet DDL as run does **not**
> > > > > > > have `meta`, drop the `meta` arg from the insert (the tier is still derivable from the
> > > > > > > > pack contents); Nick to confirm which shape shipped.
> > > > > > > > 

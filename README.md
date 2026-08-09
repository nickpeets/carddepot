# The Depot — build package

Everything the build agent needs. Read this file first, then work chapter by chapter.

## What's in here

- `Depot - Complete Design.dc.html` — the design document. Open it in a browser. Cover → design language → 15 chapters, each with a SPEC panel (what's live today vs. the target, behavior, and the states) beside the screen itself. Interactive chapters (game, spotlight, lineup) actually run — click them.
- `exports/desktop/*.png` — one render per screen, at design width, 2x. These are the visual targets. Verify against these.
- `exports/mobile-390/*.png` — true 390px renders (captured at 390 CSS px, exported 2x — not downscaled desktop).
- `Card Depot Redesign.dc.html` — the exploration canvas the document was built from, if you need to see rejected alternatives.

## Rules that override any screen

1. **No image, no entry.** A card can't be added and a listing can't go live without a confirmed front image. A user's own scan always beats library art.
2. **Stats are pulled truth.** Season lines come from records and are read-only everywhere. There is no path where a user types a stat.
3. **Odds are computed.** Pack odds render from the engine at display time. Never write a percentage into a design or a string.
4. **Placeholders are designed.** Missing art shows a band with year and name. There is no broken-image state anywhere.
5. **390 is first-class.** Every surface is its own layout at 390, not a squeezed desktop. 44px minimum touch targets.
6. **Locked says why.** Every disabled control carries its reason next to it.
7. **One header, one line, everywhere.** A single 60px navy bar carries D tile · THE DEPOT · Binder · Pack Shop · Play Ball · Marketplace · club status · account · the one "+ Add a card". Page mocks never draw their own logo, nav row, second Add button, or page title — the active gold nav pill names the surface. Mobile is the same line with nav dropped to a strip beneath it.
8. **One spacing unit, 20px.** Header → first control row → content panel sit exactly 20px apart on every surface.

## Build order

Shape parts first (button, panel, card tile, stat cell) → nav → binder + spotlight → **the Starter Box** (a new account needs cards before anything else is testable) → add a card → pack shop + rip → play ball hub → lineup → game. Every screen is those four parts rearranged.

## Chapter → export map

| # | Chapter | Status | Desktop PNG | Mobile PNG |
|---|---|---|---|---|
| 01 | Nav & header (ONE bar) | live | `01a-header-one-bar.png`, `01b-header-signedout-and-390.png` | included in `01b` |
| 02 | Log in & locked collection | live | `02-login.png` | — |
| 02b | **The Starter Box** (new account, 25 cards) | target | `02b-1-starter-box.png`, `02b-2-wave-reveal.png`, `02b-3-full-tray.png`, `02b-4-binder-first-load.png` | `starter-box.png` |
| 03 | The Binder (home) | live | `03a-binder.png`, `03b-binder-controls.png` | `binder.png` |
| 04 | Card spotlight | live | `04a-spotlight.png`, `04b-stat-variants.png` | `spotlight.png` |
| 05 | Add a card | live | `05a-add-four-gates.png`, `05b-add-modal.png` | `add-a-card.png` |
| 06 | Pack Shop | live | `06a-shop-tiers.png`, `06b-shop-tiles.png` | `pack-shop.png` |
| 07 | The Rip | live | `07-rip.png` | `rip.png` |
| 08 | Play Ball — hub | target | `08-playball-hub.png` | `playball-hub.png` |
| 09 | Lineup builder | live | `09-lineup.png` | — |
| 10 | The game | live | `10a-game-batting.png`, `10b-game-pitching.png`, `10c-substitution.png` | `game.png` |
| 11 | Mobile — 390 | required | — | all of `exports/mobile-390/` |
| 12 | State library | required | `12-states.png` | — |
| 13 | The Dugout | roadmap | `13-dugout.png` | — |
| 14 | Marketplace | roadmap | `14-marketplace.png` | `marketplace.png` |
| 15 | Pack provenance | roadmap | `15-pack-provenance.png` | — |

Status legend: **live** = the surface exists, this is its redesign. **target** = designed, not built. **required** = cross-cutting, applies to every surface. **roadmap** = concept for a future surface.

## Header spec (read before building anything else)

Everything else inherits from this bar, and it is where the current build diverges most.

- **One line, 60px tall, `box-sizing:border-box`.** Left to right: 30px gold D tile → "THE DEPOT" (Baloo 800, 19px, DEPOT in gold) → hairline divider → nav → flex spacer → club status → hairline → account cluster.
- **Nav is text, not buttons.** Only the active surface gets a gold pill (`#ffd23e`, navy text); the others are plain `#c8ecfb` labels that tint white on a faint hover wash. Four outlined pills in a row is what made the old bar loud.
- **Club status is understated:** bare numerals directly on the navy — VT323 record ("8-0") in green, Press Start 2P season chip ("S1") in `#5f89a8`, the 19px spinning coin, then the balance in VT323 gold. No white card, no "MY CLUB" heading, no boxed panel. Hairline `rgba(255,255,255,.14)` dividers separate groups.
- **Email and Log out are 8-bit:** Press Start 2P at 7–8px, `#8fb2c6` / `#5f89a8`. That pixel type is what makes an email read as part of the game rather than an account setting.
- **"+ Add a card" is the only filled button and the only green in the bar**, anchoring the right end.
- **No page title anywhere below it.** The page's own first control row (e.g. search + filters) starts one 20px step under the header.

## Design tokens

Colors: sky `#2eb2e6` · primary navy `#10456b` (all borders + hard shadows) · deep navy `#072c47` · cream `#fff7df` · gold `#ffd23e` · orange `#f4823c` · green `#7be36b` · red `#e2543e` · blue `#3a7bd5` · grass `#41a14b` · field tint `#f2f9fd` · muted text `#5b7f97` / `#8fb2c6`.

Type: **Baloo 2** (500–800) all UI · **Press Start 2P** micro-labels only (6.5–10px, line-height 1.5–1.7) · **VT323** every scoreboard/stat numeral.

Shape: panels `border:4px solid #10456b; border-radius:20px; box-shadow:0 7px 0 #10456b` (hard, never blurred). Sub-cards 3px border, radius 12–14, `0 4px 0`. Buttons are pills with `linear-gradient(#fff8,#fff0 45%)` gloss over the fill; hover presses down `translateY(2px)` and the shadow shrinks to `0 2px 0`. Scan placeholders: `repeating-linear-gradient(45deg, rgba(16,69,107,.09) 0 9px, transparent 9px 18px)` + 2px dashed border.

Motion: `floaty` (idle lift) · `twinkle` (sparkle) · `cardpop` (staggered reveal, 0.12s apart) · `tearoff` (wrapper) · `starburst` (hit ring) · `bannerpop` / `outshake` (results) · `windup` + `pitchfly` (pitch) · `coinspin` + `coinglint` (coin, one flip every 4.5s) · card flips `rotateY(180deg)` 0.5–0.7s with `backface-visibility:hidden`. All of it degrades to cross-fades under `prefers-reduced-motion` — nothing is communicated by movement alone.

## Known gaps

- Batter's-box boosts (Step out / Guess pitch, 3 per game) are specified in chapter 10 but not drawn.
- Coin payout animation (bounce + count-up) is specified, not drawn.
- Grade mechanics are frozen pending redesign — build the control as drawn, don't invent scoring.
- Marketplace listing *creation* flow (setting price/auction terms) isn't designed; only browse and detail.
- Starter Box generation rules are specified by shape (9 fielders / 5 SP / 5 RP / 5 bench + 1 guaranteed bronze-or-better in the last slot, all with library art, all born verified) but the card-selection algorithm — which players from the catalog, era weighting — is not designed. Don't invent odds; the hit band is guaranteed, the rest are mostly plain.

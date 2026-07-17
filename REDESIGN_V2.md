# REDESIGN_V2.md - Card Depot "The Depot" GBA Reskin

Authored this session. Working plan of record for the v2 visual + interaction redesign. Maps the handoff package (design/redesign-v2/) onto the live codebase, records Nick's binding decisions, logs the conflicts found, and sets the phase order.

Read alongside AGENTS.md (conventions) and design/redesign-v2/README.md (the handoff, with the full design-token spec) plus design/redesign-v2/Card Depot Redesign.dc.html (the canvas; canonical options only: 1b, 2b, 3a, 3b, 3c, 3d, 4a, 8a, 9a, 9b).

---

## 0. Provenance / repo state at authoring

- Ground truth beat the handoff summary (AGENTS.md section 0). The prior session's claimed work never landed: no .nojekyll, no REDESIGN_V2.md, no package move; main was at 50c8b2a with Pages run #235 FAILED. There is no run #241.
- Fixed this session before authoring: added .nojekyll (build green at run #236), moved the handoff package to design/redesign-v2/, restored the clobbered root README (green at run #239). See the conflict ledger (section 4) for the file-naming mixup found during the move.

---

## 1. Nick's binding decisions (D1-D6)

**D1 - Currency renames to COINS as a DISPLAY-LAYER change only.** DB tables, transaction reasons, RPCs, live pricing (150/400/900) and published odds are UNTOUCHED - only labels/formatting change ("DD" becomes the coin label everywhere, shown with the coin emoji). Centralize the rename: route every surface through DepotWallet.CURRENCY / one formatter so a future re-brand is a single edit.

**D2 - The playable game (8a) replaces the auto-sim as Play Ball, WITH card-stat modulation.** Outcome probabilities must be modulated by the batter's real card-year stats (cards play as themselves - the design's fixed probabilities are the baseline curve; each batter's real AVG/power shifts it). Phase 4 work; recorded now.

**D3 - Phase order as recommended here (see section 5). Nick-approved, use verbatim.**

**D4 - Card schema gains grade, star flag, condition notes (nullable, additive).** DDL proposed in this session's report for Nick to run whenever. It gates Phase 2's card-detail screen, NOT Phase 1.

**D5 - The Dugout defers to the final phase.** Its plan must include OAuth/social sign-in and a rollout sequence. Noted here (section 5, Phase 6); no build now.

**D6 - Superseded skins accepted as sunk; mechanics survive.** The wax-pack preview and pixel-front styling explorations are retired as visuals; their mechanics (pack rip, pixel card render) carry forward.

---

## 2. Screen-to-system map

How each canonical handoff option lands on the live architecture (AGENTS.md section 3). "Working path" = requires section 2 sign-off to merge.

| Option | Screen | Lands on | Modules touched | Working path |
|---|---|---|---|---|
| 1b | Hero / header / nav | index.html shell | depot-shell.js (render), depot-index-shell.js, new css/depot-v2.css | Yes |
| 2b | Card detail + The Dugout | card-detail view on index.html | depot-index-shell.js, comments (new), depot-pixel-card.js | Yes |
| 3a | The Binder | index.html binder grid | depot-index-shell.js, depot-pixel-card.js | Yes |
| 3b | Add a Card | add-card form on index.html | depot-index-shell.js | Yes |
| 3c | Play Ball hub | Season overlay | depot-season-shell.js, game/season.js | Yes |
| 3d | Pack Shop | game/shop.html | depot-shop-view.js, depot-shop.js, depot-shop-entry.js | Yes |
| 4a | Pack rip reveal | shop rip flow | depot-pack-engine.js, depot-shop-view.js | Yes |
| 8a | Playable game (broadcast field) | game/index.html | depot-game-shell.js (runtime inject, section 9), sim modulation | Yes |
| 9a | Lineup Card | game/builder.html | depot-builder-shell.js | Yes |
| 9b | Substitution overlay | in-game (8a) + builder | depot-game-shell.js, depot-builder-shell.js | Yes |

Shared chrome across all four shells (index.html, game/builder.html, game/index.html, game/shop.html): depot-shell.js renders .depot-bunting + .depot-shell__header (.depot-wordmark, .depot-franchise name/record via resolveRecord, .depot-account auth cluster) + .depot-nav (.depot-tab) + .depot-stage. The wallet chip lives in depot-wallet.js (window.DepotWallet, has CURRENCY). Data paths route through depot-core.js (depotSB()/depotUser()); never a per-page client (section 3, section 8).

---

## 3. Design tokens (source of truth)

Full spec in design/redesign-v2/README.md under "Design Tokens"; implemented verbatim in css/depot-v2.css (Phase 1). Summary:

- Palette: #2eb2e6 sky (page bg), #10456b navy (borders/shadows/text), #072c47 darker navy (scoreboard), #0c3556 panel inner row, #fff surfaces, #f2f9fd light tint, #dff1fb / #bfe4f7 / #cde6f4 chips, #c8ecfb subtitle-on-sky, #5b7f97 / #8fb2c6 muted text, #2c4a5c comment body, #ffd23e gold (+ #fff7df / #7a5b00), #f4823c orange (+ #c9560f), #7be36b green (+ #e8fbe4 / #1d6b2a), #3a7bd5 blue, #e2543e red; plus ballpark field colors.
- Type: Baloo 2 (500-800) all UI; Press Start 2P pixel accents; VT323 LED numerals. Google Fonts.
- Shape (chunky plastic): panels 4px navy border / radius 20 / hard shadow 0 7px 0 #10456b; sub-tiles 3px / radius 12-14 / 0 4px 0; pill buttons radius 999, glossy sheen linear-gradient(#fff8, #fff0 45%), press-down hover (translateY 2-3px + shadow shrink to 0 2px 0).
- Animation vocabulary: floaty, twinkle, bannerpop, outshake, ripshake, tearoff, cardpop, starburst, pitchfly, windup, baselight, and the 3D rotateY(180deg) card-flip pattern.

---

## 4. Conflict / discrepancy ledger

1. Handoff summary vs reality (resolved). "main at/past .nojekyll, green at #241" was false. Believed reality per section 0; fixed forward.
2. File-naming mixup in commit 50c8b2a (resolved during the move). The three handoff files had contents that did NOT match their names: root support.js (20KB) actually held the markdown handoff doc, relocated to design/redesign-v2/README.md; root README.md (164KB) actually held a byte-identical duplicate of the HTML canvas (the clobber of the original 44-byte root README), deleted and the original restored from parent 95bc3fd; Card Depot Redesign.dc.html (164KB) = the HTML canvas, relocated to design/redesign-v2/Card Depot Redesign.dc.html. Files were relocated by CONTENT ROLE (not their wrong names) so the package is correct going forward.
3. No real support.js exists in the handoff. The canvas references a ./support.js include, but the only file so-named was the markdown. The handoff README says support.js is prototype runtime only, ignore for implementation. No JS asset was fabricated; the canvas interactions live in its single inline script and are reference-only for mechanics/timings.
4. DD to coins is display-only (D1). Do not touch DB/RPC/pricing/odds. If any surface prints "DD" directly instead of via DepotWallet.CURRENCY, that is a bug to centralize during D1.
5. Game page is hostile to static assets (AGENTS.md section 9). 8a and the 9b overlay on game/index.html must inject styles at runtime, read the html element fresh, and re-assert scope classes. depot-v2.css cannot be a static link there; it is injected via depot-game-shell.js.
6. No responsive spec in the handoff. Desktop-first at 760-1100px. Mobile follows the existing site's approach; the preview gate checks desktop + mobile explicitly.

---

## 5. Phase plan (D3 - Nick-approved, verbatim)

- Phase 1 - Tokens + shell. css/depot-v2.css token system; reskin depot-shell.js render (option 1b header/nav) + the wallet coin pill (depot-wallet.js, D1 display rename); apply shell + background/tokens to all four pages. Internal screen content untouched this phase (old components on new canvas). game/index.html via section 9 runtime injection.
- Phase 2 - Binder + card detail. Option 3a binder grid + 2b card-detail with flip + stat strip. Gated by the D4 schema DDL (grade/star/condition) being live.
- Phase 3 - Pack shop + rip reskin. Options 3d + 4a; pricing/odds unchanged (D1); rip state machine idle to open to done.
- Phase 4 - The playable game. Option 8a replaces the auto-sim as Play Ball (D2), with probabilities modulated by each batter's real card-year stats over the design's baseline curve. Section 9 runtime rules.
- Phase 5 - Lineup card + substitutions. Options 9a + 9b; swap/bullpen interactions; persists into the game.
- Phase 6 (deferred) - The Dugout (D5). Community comments on card detail. MUST include OAuth / social sign-in and a rollout sequence: (a) land OAuth provider(s) via existing Supabase auth, human-gated, keeping email fallback; (b) read-only comments render; (c) authed posting + upvote/reply behind rate limits and RLS owner_id; (d) the challenge to exhibition-game hook into the Play Ball hub. No build until Phases 1-5 are in.

---

## 6. Phase 1 build spec (this session)

1. css/depot-v2.css - the complete token system from the handoff README verbatim (palette, Baloo 2 / Press Start 2P / VT323 scale, chunky-plastic shapes, the full animation vocabulary). Fonts via Google Fonts.
2. Reskin the shell RENDER (not data paths): depot-shell.js header per 1b (gold "D" logo tile, "The Depot" Baloo wordmark, card-count subtitle, green "+ Add a card" pill, nav pills including orange "PLAY BALL"). resolveRecord, the wallet chip (now the coin pill, D1), and the auth cluster keep working.
3. Apply shell + page background/tokens to all four pages; restyle only what the shell/tokens reach naturally.
4. game/index.html via AGENTS.md section 9 runtime-injection.
5. PREVIEW GATE before any working-path merge: live preview (binder minimum, desktop + mobile) for Nick's taste; then section 2 sign-off, one no-ff merge with the branch-tip label + cache-bust ritual (AGENTS section 6), deploy, live-verify all four pages + no console errors + wallet/auth/season paths intact.

Phase 1 does NOT require the D4 schema (that gates Phase 2).

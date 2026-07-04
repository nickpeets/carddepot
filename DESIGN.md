# Card Depot — Unified Design Direction (Continuity Pass)

> **Scope:** Continuity only. The existing 8-bit / RBI-Baseball pixel aesthetic
> (navy + gold + pinstripe, Press Start 2P) is **already correct and stays as-is.**
> This document does **not** propose a new look. It (1) *inventories* the existing
> style into one shared spec, (2) defines a single header/nav **shell** worn by all
> four screens, (3) specifies the **normalization pass** that removes the drift where
> screens currently disagree, and (4) sets the **mobile** rules and the **order** to
> apply the reskin. North star: The Depot should feel like one game with rooms
> (collection -> builder -> season -> game), the way NES Baseball Stars did — not four
> separate sites.

---

## 0. Current State — audited, not assumed

Four live screens were loaded and inspected (computed styles read from the DOM):

| Aspect | **Binder** (root, reference) | Builder (game/builder.html) | Season view (overlay on binder) | Game (game/index.html) |
|---|---|---|---|---|
| Body background | \`#1a1a2e\` navy | \`#16321f\` dark green | \`#0b1418\` near-black | \`#0a0a0a\` black |
| Panel / bar background | \`#0d2d5c\` navy | \`#1f7a3e\` green | (none) | fixed game canvas |
| Accent gold | \`#f8d000\` | border \`#f6c81e\` | muted \`#caa14a\` | border \`#f6c81e\` |
| Cream / paper | \`#e8e4d0\` | \`#f7f0db\` | — | — |
| Type | Press Start 2P | Press Start 2P | **Courier New** | **monospace / Times** |
| Pinstripe bunting | **yes** | no | no | no |
| Persistent nav | **yes** (Binder / By Set / Season / Play Ball) | back-only | close-only | back-only |
| Franchise + record in chrome | partial (email only) | email only | "2 - 0" only | in-game only |
| Hard pixel shadow | \`3px 3px 0 #000\` | \`0 0 0 4px\` inset | none | none |

**Hardening pass status (checked on main and on the \`rbi-nes-reskin\` branch):**
\`js/depot-core.js\`, \`version.js\`, and \`AGENTS.md\` are **not present on either branch.**
The hardening pass has **not landed.** The \`rbi-nes-reskin\` branch is a stale
(2026-06-19) CSS-only reskin that was never merged and does not contain these files.
This document assumes a shared client does not yet exist; the shell CSS below is
authored to be droppable in ahead of, or alongside, that future work.

**Takeaways driving this pass**

- The **binder is the reference.** Its palette, pixel type, bunting, gold tiles, and
  hard \`3px 3px 0 #000\` shadow are the "best existing version." Everything else drifts
  toward its own palette (builder = green, season = black + Courier, game = black).
- **The Season view is the worst offender** — it is essentially unstyled (Courier New,
  muted gold, no shell, no pixel treatment). It reads as a placeholder.
- **The Builder** is a self-contained green app: right font, wrong palette, wrong chrome.
- **The Game** is correctly the most "NES" screen, but it has *no shared chrome* and
  renders postage-stamp on phones.
- **Transitions are hard \`<a>\` jumps** between totally different chrome, which is what
  makes it feel like four sites.

---

## 1. Design System — INVENTORY (extracted from the current pages)

This is the existing look written down, to be centralized in \`mockups/depot-style.css\`
(and later a production \`depot-style.css\`). Nothing here is new; values are the
binder's current tokens, adopted as the single source of truth.

### 1.1 Palette (the one palette — binder-derived)

\`\`\`
--depot-navy-bg     #1a1a2e   /* app background (behind panels) */
--depot-navy        #0d2d5c   /* primary panel / bar fill (was --sb-blue) */
--depot-navy-lite   #15407f   /* raised panel / hover (was --sb-blue-lite) */
--depot-gold        #f8d000   /* primary accent, active tiles, wordmark (--brass) */
--depot-gold-deep   #c9a800   /* gold pressed / border-deep (--brass-deep) */
--depot-cream       #e8e4d0   /* card faces, light text panels (--cream/--paper) */
--depot-ink         #16110a   /* text on gold/cream */
--depot-green       #2d6a2d   /* felt / field green (--felt/--leather) */
--depot-green-dark  #1d4a1d   /* felt shadow */
--depot-black       #000000   /* borders + hard pixel shadow (--rbi-black) */
--depot-red         #b02020   /* bunting red + destructive ("remove") */
--depot-white       #ffffff   /* bunting white + high-contrast text */
--depot-shadow      rgba(0,0,0,.55)
\`\`\`

Rule: **greens are for the field and card felt only.** Chrome (bars, panels, nav) is
navy + gold + black. This is the single biggest normalization: the builder and season
screens must stop using green/black as their *chrome* color.

### 1.2 Type scale (Press Start 2P everywhere in chrome)

One family for all chrome and headings: **'Press Start 2P'** (fallback \`Oswald, monospace\`).
Body/stat microcopy may fall back to \`'JetBrains Mono', monospace\` where Press Start 2P
is too wide, but never Courier/Times.

\`\`\`
--fs-wordmark  20px   /* "THE DEPOT" wordmark */
--fs-h1        16px   /* screen title inside shell */
--fs-h2        13px   /* section headers (YOUR COLLECTION, BATTING ORDER) */
--fs-nav       11px   /* nav + header buttons */
--fs-body      11px   /* labels, controls */
--fs-micro      9px   /* stat lines, era tile subtext */
\`\`\`

Line-height 1.5 minimum for Press Start 2P legibility; letter-spacing \`normal\`
(the pixel font already has built-in spacing).

### 1.3 Components (existing binder treatments, promoted to shared)

- **Panel / tile:** \`background: var(--depot-navy); border: 3px solid #000;
  box-shadow: 3px 3px 0 #000; border-radius: 0;\` — the tile look from the era filter.
- **Gold button (primary):** \`background: var(--depot-gold); color: #000;
  border: 3px solid #000; box-shadow: 3px 3px 0 #000;\` active tiles use the same.
- **Ghost button (secondary):** navy fill, gold 3px border, gold text.
- **Destructive ("remove"):** red text/border on cream — already consistent in builder;
  keep it.
- **Card face:** cream \`#e8e4d0\` panel on green felt tray, black border.
- **Bunting strip:** the red/white pinstripe bar. Currently binder-only; it becomes
  the top edge of the **shell** (section 2) so it appears on every screen.
- **Hard pixel shadow** \`3px 3px 0 #000\` is the shared depth cue. No soft/blurred
  shadows, no rounded corners anywhere in chrome.

### 1.4 Spacing

8px base grid: \`4 / 8 / 16 / 24 / 32\`. Bar padding \`24px 32px\`; panel gap \`16px\`;
tile padding \`10px\`. These match the binder's current \`25.6px 32px\` bar padding
(rounded to the grid).

---

## 2. The Shell — one frame worn by all four modes

The core of the continuity fix. Baseball Stars kept every mode inside one persistent
menu frame; Card Depot gets the same. The shell is a single markup+CSS block that is
**identical on every screen** (even though the screens remain separate files). When the
chrome is byte-for-byte the same, moving between modes *feels* like the same app even
across a full page load.

### 2.1 Anatomy (top to bottom)

1. **Bunting strip** — the red/white/navy pinstripe bar, full width, ~12px tall.
   Pure decoration; pulled from the binder. Appears on all screens.
2. **Header bar** (\`.depot-shell__header\`, navy \`#0d2d5c\`, \`border-bottom: 4px solid #000\`,
   \`box-shadow: 0 4px 0 #000\`):
   - Left: **wordmark** "THE **DEPOT**" (DEPOT in gold).
   - Center-left: **franchise identity block** — *franchise name* + *season record*
     (e.g. "PORTLAND MUDCATS · 2-0"). **Always visible once signed in.** This is the
     single element that makes every screen feel like the same franchise's game. When
     signed out it collapses to a "LOG IN" affordance.
   - Right: **account cluster** — notifications bell, user email, "LOG OUT".
3. **Mode nav** (\`.depot-shell__nav\`): the four modes as tabs/tiles, gold = active,
   navy+gold-border = inactive:
   \`THE BINDER\` · \`LINEUP\` · \`SEASON\` · \`PLAY BALL\`
   (plus context actions like \`+ ADD A CARD\` right-aligned when in the binder).
   This nav is present on every screen; only the active tile changes. That is the
   "one consistent menu system."
4. **Mode stage** (\`.depot-shell__stage\`): the swappable content region. Each of the
   four screens renders its body here and nothing else touches the chrome.

### 2.2 Franchise + record data

The shell reads franchise name and W-L from the same source the season overlay already
uses ("MY CLUB - Season 2 - 0"). Contract for implementation: expose
\`window.DepotShell.setFranchise({name, wins, losses})\`; the shell renders it in the
identity block. Until wired, mockups hardcode "PORTLAND MUDCATS · 2-0".

---

## 3. Screen-by-screen — how each mode lives in the shell

Each screen keeps its **body/logic unchanged**; the work is swapping its bespoke header
for the shared shell and normalizing its body panels to the shared tokens.

### 3.1 The Binder (reference — least change)

Already the closest. Changes: (a) lift its existing top bar into the canonical shell
markup so the *other* screens can reuse it verbatim; (b) add the franchise+record block
to the identity slot (today it shows only the email). Era tiles, card tray, By Set, and
pagination stay exactly as they are.

### 3.2 The Lineup Builder

Biggest palette normalization. Swap the **green chrome for the shell** (navy header,
bunting, mode nav with LINEUP active). Body panels (\`YOUR COLLECTION\`, \`PITCHER\`,
\`BATTING ORDER\`) move from green fills to the shared **navy tile + cream card** pattern.
The status banner ("9/9 hitters set...") becomes a gold tile with ink text (matches the
"ALL" gold callout in the binder). "remove" stays red. Selects get the shared control
style. No layout/logic change — this is a palette + chrome reskin only.

### 3.3 The Season screen (most change)

Currently near-unstyled (Courier New, muted gold, black). Rebuild the view *inside the
shell* using shared tokens: SEASON header becomes an \`.h1\` in Press Start 2P; the
"MY CLUB - Season" line becomes the shell's franchise block (so it's redundant to repeat
it — show the schedule instead); the big "2 - 0" record becomes a gold-tile scoreboard;
"PLAY NEXT GAME" becomes the primary gold button; "CLOSE" becomes the shell nav
returning to the binder. Schedule/games list uses navy tiles. This screen goes from
"placeholder" to "obviously the same game."

### 3.4 The Game screen (last, riskiest)

> **Nick's review amendment (approved direction):** the live game's in-game
> presentation stays **exactly as-is** — the RBI diamond, field, HUD/scoreboard,
> MUDCATS/ACORNS nameplates, play-by-play, and every in-game panel are the aesthetic
> north star and are **not restyled**. The **only** visual change adopted on this
> screen is the **controls**, which take the mockup's new control treatment (the shell
> button/tile styling shown in `mockups/game.html`). So: shell chrome around the stage
> + mockup controls, in-game aesthetic untouched.

Wrap the game in a **thin shell**: the bunting + a slim header (wordmark left,
franchise+record center, BACK/nav right) above the game stage, so entering a game still
reads as the same app. The in-game field, panels, HUD (scoreboard, MUDCATS/ACORNS
nameplates), and overall in-game aesthetic are left **untouched** — do not restyle them.
Apply the mockup's control treatment to the game **controls only** (the action buttons —
swing, box score, pause, back — adopt the shared shell button/tile look). The other real
fix here is **mobile scaling** (section 4): the stage scales to fit the viewport instead
of rendering postage-stamp, and the controls move to a fixed bottom bar with 44px
targets. Do this screen last because the game loop is the riskiest working path to
disturb.

---

## 4. Mobile plan

Two concrete bugs observed at ~390px: the **game renders postage-stamp** (fixed game
area sits tiny in a sea of black; bottom action buttons clip), and **builder controls
overflow** (header wordmark clips off-screen, status banner wraps, controls don't
restack).

### 4.1 Breakpoints

\`\`\`
Desktop     >= 900px   full shell: wordmark + franchise + nav on one row
Tablet    600-899px    nav wraps to a second row under the header
Phone       < 600px    shell condenses (see 4.2); design target width 390px
\`\`\`

### 4.2 Shell on phone

- Header collapses to two rows: row 1 = wordmark + account (bell/logout as icons);
  row 2 = **franchise name + record** (never dropped — it's the identity).
- Mode nav becomes a horizontally scrollable tile strip **or** a bottom tab bar
  (four tabs: Binder / Lineup / Season / Play). Bottom tab bar is preferred — it keeps
  the four modes one thumb-tap apart, reinforcing "one game."
- **Touch targets >= 44x44px.** Current 8.8px-font era tiles and 11px nav buttons get
  min-height 44px and larger tap padding on phone (font size stays; hit-area grows).

### 4.3 Fixing the two bugs

- **Game postage-stamp:** the fixed game stage must scale to fit the viewport. Wrap it
  in a container that scales via \`transform: scale()\` (or \`width:100%\` with
  \`aspect-ratio\`) so the diamond fills phone width; move action buttons (NEW GAME /
  BOX SCORE / ...) into a fixed bottom bar with 44px targets instead of clipping.
- **Builder overflow:** the shell header wordmark truncates gracefully (already handled
  by 4.2 row split); \`YOUR COLLECTION\` and \`BATTING ORDER\` stack to a single column
  under 600px; selects go full-width; the status banner uses \`text-wrap: balance\`
  and smaller micro type rather than overflowing.

---

## 5. Transitions — mode switches, not page jumps

Pages remain separate files, so real navigation is still a load. Continuity comes from
**identical chrome** across that load plus a light transition veneer:

- **Identical shell** on both the outgoing and incoming page means the bunting, header,
  franchise block, and nav appear unmoved across the load — the eye reads it as the
  same frame with the stage swapped.
- **Active-tile carry:** clicking a mode nav tile paints it active *before* navigating,
  so the destination opens with that tile already lit (no flash of the old active state).
- **Optional stage crossfade:** a short (120ms) fade on \`.depot-shell__stage\` only
  (never the chrome) on load, so content settles while the frame stays put.
- Later (post-continuity, out of scope here): a shared client could swap stages without
  a full reload for true SPA feel. Not required for this pass.

---

## 6. IMPLEMENTATION_PLAN — order to apply the reskin

Additive-first, lowest-risk-first. Each step is scoped as its own agent session so a
single session never touches more than one working path.

**Session 1 — Shared CSS + shell (foundation).**
Promote \`mockups/depot-style.css\` to a production \`depot-style.css\` and add the shell
markup + \`window.DepotShell\` helper (franchise/record API, active-tile setter). Wire the
shell into **one** page (the binder, since it's the reference and lowest risk) to prove
it renders identically to today. No other page changes. Ship + eyeball.

> **✅ Session 1 COMPLETE (build `f680863`).** Shipped as the shared foundation only —
> additive, no working paths touched. Per the operator's scope for this session, the shell
> was **not** wired into the binder yet (that moves to Session 2); instead a standalone
> `shell-preview.html` harness was added so the shell is live-verifiable on its own.
> Delivered: `css/depot-style.css` (production tokens + shell + components + breakpoints,
> adapted from `mockups/depot-style.css`; mockup-only `.mock-note` and the fake in-game
> diamond dropped — the real in-game aesthetic stays untouched per Nick's amendment),
> `js/depot-shell.js` (`window.DepotShell` mount/setFranchise/setActive/refreshFranchise,
> franchise+record via depot-core with anonymous fallback + fail-loud `[depot]` logging),
> and `shell-preview.html`. Commits: css `6f0c038`, shell `fc7abdc`, preview `cf0d7ca`;
> foundation merge `f680863` (PR #61); version bump `06a70b9` / merge `33cf871` (PR #62).
> Live preview for eyeballing: `/shell-preview.html` (append `?franchise=1` for the
> signed-in identity block with dummy data).

**Session 2 — Binder normalization.**
Fully adopt the shell on the binder; add the franchise+record identity block; confirm
era tiles / By Set / pagination unchanged. This locks the reference.
> ✅ Session 2 COMPLETE (live build `0f5e8fd`). The binder (index.html) now fully wears the shared shell, locking the reference. index.html loads `css/depot-style.css` + `js/depot-shell.js` and mounts `DepotShell` (active tab: THE BINDER) via a new `js/depot-index-shell.js`; the ad-hoc topbar is retired and its live auth controls (Log in / Log out) move into the shell account cluster. The franchise+record identity block renders real data via depot-core ("MY CLUB · 3-0") and degrades to a LOG IN affordance when signed out. The binder body — era filters, group-by, By Set, card grid, Add a Card — is relocated into the shell stage unchanged (chrome unification, not a redesign); node moves preserve listeners, fail-loud `[depot]` logging on every guard. Mobile (<600px) inherits the shared bottom tab bar + stacked header with the card grid intact. SEASON and PLAY BALL stay reachable from the shell tabs (`index.html?season=1`, `game/index.html`). Delivered: `js/depot-index-shell.js` (090289d), index.html wiring (dab00b7); feature merge `0f5e8fd` (PR #64); version bump 3421e30 / merge b5824b9 (PR #65). Live-verified: `[depot] build 0f5e8fd`, shell renders signed-in AND anonymous, card fetch renders the full binder, era filters + group-by + By Set work, Add a Card opens, and `window.depotSB()` returns a client.

**Session 3 — Season screen.**
Rebuild the season overlay inside the shell using shared tokens (kill Courier New / muted
gold / black). Highest visual payoff, and low logic risk (season.js logic untouched;
only its rendered chrome changes).
> ✅ Session 3 COMPLETE (live build `94ff9b7`). The Season screen — previously the least-styled view (Courier New / muted gold / black placeholder overlay) — now wears the shared shell and the `mockups/season.html` treatment, presentation only. When `#depotSeasonView` opens and its schedule has rendered, `js/depot-season-shell.js` reparents the existing season nodes (`#depotSeasonRecord` / `#depotSeasonSched` / `#depotSeasonPlayNext` / `#depotSeasonMsg` — listeners preserved, never recreated) into shell chrome (bunting + header + mode-nav with SEASON active + stage) and applies `css/season.css`: the `SEASON — 8-GAME RUN` `.h1`, a gold-tile scoreboard for the record, navy schedule tiles (wins = gold with score, pending = dim), and the primary gold `PLAY NEXT GAME` button. Franchise + record render real data via depot-core ("MY CLUB · 4-0"); anonymous degrades to a LOG IN affordance; fail-loud `[depot]` logging. `game/season.js` logic is untouched — `startOrResumeSeason` / `loadSeasonGames` / `PLAY NEXT GAME → builder with depot_season_ctx` / the G1–G8 W/L/pending states all behave exactly as before. Mobile (<600px) stacks the schedule to one column under the shared bottom tab bar. Delivered: `css/season.css` (55b7ed0), `js/depot-season-shell.js` (551d056), index.html wiring (b9f10a6); feature merge `94ff9b7` (PR #67); version bump 15614f9 / merge 2a40621 (PR #68). Live-verified on build `94ff9b7`: the season screen wears the shell against the real DB (3-0 at start: G1 W 1-0, G2 W 2-0, G3 W 7-0, G4–G8 pending), `PLAY NEXT GAME` launched the builder with `depot_season_ctx` intact (game_number 4), and one full season game (vs DUST DEVILS, won 5-0) played through with the `[season]` writeback chain firing (season_games UPDATE applied + seasons W-L update 1 row) and the record ticking 3-0 → 4-0 (G4 now shows W 5-0). Anonymous state degrades gracefully to LOG IN.

**Session 4 — Lineup Builder.**
Swap green chrome for the shell; normalize panels to navy-tile + cream-card; restyle the
status banner and selects. Palette/chrome only — no builder logic changes. Add the
builder mobile restack (< 600px single column, full-width selects).

> ✅ Session 4 COMPLETE (live build `60e9a44`). The Lineup Builder (game/builder.html) — the biggest palette drifter (a self-contained green app: right font, wrong palette/chrome) — now wears the shared shell, presentation only. builder.html loads `js/version.js` + `js/depot-core.js` + `css/depot-style.css` + `js/depot-shell.js`, and a new `js/depot-builder-shell.js` mounts `DepotShell` (active tab: LINEUP): it reparents the login + builder views (`#loginView` / `#builderView` — listeners preserved via node moves) and the live auth/notif controls (`#notifWrap` / `#whoami` / `#logoutBtn`) into the shell chrome (bunting + navy header + mode nav) and retires the ad-hoc green `<header>`; the `/game/` nav hrefs are rewritten page-relative. The green palette is normalized to the shared navy/gold per `mockups/builder.html`: navy-tile + cream-card panels (YOUR COLLECTION / PITCHER / BATTING ORDER), the "9/9 hitters set" status banner as a gold tile, shared select chrome, red "remove" kept. Franchise + record render real data ("MY CLUB · 4-0"); anonymous degrades to LOG IN; fail-loud `[depot]` logging on every guard. **No builder logic changed** — Supabase collection load, 9-slot fill + DH, separate pitcher selection, position dropdowns, the 9-usable-players block, PLAY BALL launch (exhibition + season via `depot_season_ctx` / `depotSeasonPlay`), the season attach writeback, `buildTeamPayload` (PR #39) and the `depotSeasonPlay` season-divert (PR #38) all behave exactly as before. Mobile (<600px) gets the single-column restack + full-width selects under the shared bottom tab bar (44px targets). Delivered: `js/depot-builder-shell.js` (`e3541ab`), builder.html reskin + shell wiring + mobile restack (`b4f479b`); feature merge `4f174b4` (PR #70); version bump `ca11b2e` / merge `ec09752` (PR #71).
>
> ⚠️ **FOUC guard shipped separately.** The Session 4 builder merge (PR #70/#71) landed *before* the Season FOUC guard (PR #72), so it did **not** include the hide-until-dressed protection. The builder FOUC guard was added in a follow-up mirroring PR #72: `js/depot-builder-shell.js` marks `<html class="depot-builder">` at script-eval and `.depot-builder-dressed` on successful mount, with a one-shot 3s fail-loud `.depot-builder-reveal-fallback` (+ `[depot]` warn); `css/depot-style.css` keeps `#loginView` / `#builderView` / `body>header` invisible until dressed (navy body bg still paints — no white flash), scoped to the builder page only. Commits `33d45b3` (JS) + `f653759` (CSS); FOUC merge `60e9a44` (PR #74); version bump `71ec1ca` / merge `96a0c88` (PR #75). Live-verified on build `60e9a44`: builder wears the shell signed-in with the full collection rendering, lineup filled to 9 + pitcher, `buildTeamPayload` live, no FOUC on load (armed→`visibility:hidden` with navy bg, dressed→visible, forced fallback reveals + warns), and the shell guard is inert on the binder/season pages.

**Session 5 — Game screen (last, riskiest): shell chrome + mockup controls only.**
Wrap the RBI diamond in the thin shell and adopt the mockup's control treatment for the
game **controls only** (action buttons -> shared shell button/tile look). Do **not**
restyle the in-game field, panels, HUD, or aesthetic — per Nick's review, the in-game
presentation stays exactly as-is. Do not touch the game loop. Implement the mobile
scaling fix (scale-to-fit stage + bottom action bar, 44px targets). Test the full season
-> builder -> game -> back-to-season round trip on desktop and 390px before merge.

> ✅ Session 5 COMPLETE (live build `71c30c2`). The Game screen (game/index.html) — the last and riskiest working path — now wears the shared shell, and its controls adopt the shared treatment, per Nick's locked amendment (§3.4): the in-game presentation (RBI diamond, field, HUD/scoreboard, MUDCATS/ACORNS nameplates, play-by-play, the 2000px scaled `#stage`) is the aesthetic north star and is **left exactly as-is**. A new `js/depot-game-shell.js` mounts `DepotShell` (bunting + slim header + mode nav, PLAY BALL active) fixed above the stage, relocates the existing `#backToDepot` link into the shell nav (node move preserves its listener + href + label — the BACK / BACK-TO-SEASON behavior is untouched), and adds the shared `.btn` / `.btn.ghost` / `.sel` classes to the existing `#sim-controls` buttons + pace select (styling only — the controls do exactly what they did). To make room for the thin shell without touching the stage's scale, `css/depot-style.css` translates the game's full-viewport backdrop (`.sc-host > div`) DOWN by a JS-measured `--depot-game-chrome-h` — a pure position offset, so the `#stage` transform stays byte-identical. Franchise + record render real data ("MY CLUB · 5-0"); anonymous degrades to LOG IN; fail-loud `[depot]` logging. **No sim / `__onMatchComplete` / season-writeback / nav / stage-scaling logic changed** — presentation only. Chrome-only FOUC guard mirrors PR #72/#74: css keeps `.depot-bunting` + `.depot-shell` hidden until `.depot-game-dressed` (3s fail-loud `.depot-game-reveal-fallback`), and the game stage/controls are NEVER gated by it (the sim renders immediately).
>
> ⚠️ **Runtime-bundle handling.** Live-verify on the deployed game revealed game/index.html is a runtime (React) bundle that clears `<body>`, resets the `<html>` class, and STRIPS the static `<link>`/`<script>` from the shipped head during init. So `depot-game-shell.js` injects `css/depot-style.css` at runtime and WAITS (MutationObserver + interval, 20s fail-loud) for the game UI (`#sim-controls` + stage) to exist before mounting, re-asserts `.depot-game`, and keeps a watchdog to re-mount if a later re-render removes the shell. Delivered: `js/depot-game-shell.js` (`ec19dc0`), `css/depot-style.css` game section + `game/index.html` head wiring; feature merge `bab5a15` (PR #77, version bump `f5952ad` / PR #78), bundle-timing + stylesheet-injection fix merge `71c30c2` (PR #79, version bump `daaee32` / PR #80). Live-verified on build `71c30c2`: the game wears the shell (PLAY BALL active, "MY CLUB · 5-0") with the stage shifted below it and the in-game visuals pixel-identical (same scale matrix, un-clipped), controls restyled and functionally identical (PLAY advances the sim), no FOUC (chrome hidden until dressed, stage never gated), and `#backToDepot` preserved. G6+ season play-through left to Nick.

**Session 6 — Mobile polish + transitions.**
Bottom tab bar, 44px touch targets across all four, active-tile carry + optional stage
crossfade. Regression-test every mode switch.

> Rationale for ordering: shared CSS/shell first (everything depends on it) -> binder
> (reference, safe) -> season (unstyled, high payoff, low risk) -> builder (palette-only)
> -> game **last** because it is the riskiest working path. Mobile/transition polish
> lands after all four wear the shell so it can be tuned once, globally.

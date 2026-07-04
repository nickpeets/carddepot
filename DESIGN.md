# Test line 1
function x(){ return [1,2]; }
  indented line
<div class="a">hi</div># Card Depot — Unified Design Direction (Continuity Pass)

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

Keep the RBI diamond exactly as rendered — it is the aesthetic north star. Wrap it in a
**thin shell**: the bunting + a slim header (wordmark left, franchise+record center,
BACK/nav right) above the game stage, so entering a game still reads as the same app.
The in-game HUD (scoreboard, MUDCATS/ACORNS nameplates) is untouched. The one real fix
here is **mobile scaling** (section 4). Do this screen last because the game loop is the
riskiest working path to disturb.

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

**Session 2 — Binder normalization.**
Fully adopt the shell on the binder; add the franchise+record identity block; confirm
era tiles / By Set / pagination unchanged. This locks the reference.

**Session 3 — Season screen.**
Rebuild the season overlay inside the shell using shared tokens (kill Courier New / muted
gold / black). Highest visual payoff, and low logic risk (season.js logic untouched;
only its rendered chrome changes).

**Session 4 — Lineup Builder.**
Swap green chrome for the shell; normalize panels to navy-tile + cream-card; restyle the
status banner and selects. Palette/chrome only — no builder logic changes. Add the
builder mobile restack (< 600px single column, full-width selects).

**Session 5 — Game screen (last, riskiest).**
Wrap the RBI diamond in the thin shell; do **not** touch the game loop or HUD. Implement
the mobile scaling fix (scale-to-fit stage + bottom action bar). Test the full season ->
builder -> game -> back-to-season round trip on desktop and 390px before merge.

**Session 6 — Mobile polish + transitions.**
Bottom tab bar, 44px touch targets across all four, active-tile carry + optional stage
crossfade. Regression-test every mode switch.

> Rationale for ordering: shared CSS/shell first (everything depends on it) -> binder
> (reference, safe) -> season (unstyled, high payoff, low risk) -> builder (palette-only)
> -> game **last** because it is the riskiest working path. Mobile/transition polish
> lands after all four wear the shell so it can be tuned once, globally.

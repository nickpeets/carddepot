# Chapter 01 (revised) - ONE BAR: measurement record

Branch: `feat/rd-header-one-bar` off `main` (7497816).
Design truth: the revised bundle committed to main as "Card Depot redesign concept (1).zip"
(1e9f5bf), extracted over the untracked `build_package/` and the zip removed from main in
7497816. `build_package/` stays untracked and gitignored (.gitignore:3).

## 1. What the revised bundle actually changed

`diff -rq` old-vs-new, before the overlay:

| Path | Delta |
|---|---|
| `README.md` | CHANGED - Rule 7, Rule 8 and a whole "Header spec" section are new; build order now names the Starter Box; chapter map gains 02b and re-points chapter 01 |
| `Depot - Complete Design.dc.html` | CHANGED - ch01 rewritten (one bar), ch02b inserted (lines 333-799) |
| `exports/desktop/01-nav-header.png` | REMOVED (superseded) |
| `exports/desktop/01a-header-one-bar.png` | NEW |
| `exports/desktop/01b-header-signedout-and-390.png` | NEW |
| `exports/desktop/02b-1-starter-box.png` .. `02b-4-binder-first-load.png` | NEW (4) |
| `exports/desktop/03a-binder.png` | CHANGED |
| `exports/mobile-390/starter-box.png` | NEW |

Nothing else moved. The old `01-nav-header.png` - the two-row header the current build was
built to - no longer exists in the package.

## 2. The two new override rules (verbatim intent)

- **Rule 7 - one header, one line, everywhere.** A single 60px navy bar carries D tile, THE
  DEPOT, Binder, Pack Shop, Play Ball, Marketplace, club status, account, and the one
  "+ Add a card". No page mock draws its own logo, nav row, second Add button or page title.
  The active gold nav pill names the surface. Mobile is the same line with nav dropped to a
  strip beneath it.
- **Rule 8 - one spacing unit, 20px.** Header, first control row and content panel sit exactly
  20px apart on every surface.

## 3. The bar, measured (ch01 markup in the design document, lines 183-284)

Not eyeballed off the PNG - these are the inline values in `shot-01-1` / `shot-01-2`.

### 3a. The bar itself (signed in)

```
bar        box-sizing:border-box; background:#10456b; display:flex; align-items:center;
           gap:18px; padding:0 20px; height:60px; width:100%
brand      display:flex; align-items:center; gap:10px; flex:none
  D tile   30x30; border-radius:8px; background:#ffd23e; Press Start 2P 11px; color:#10456b
  wordmark 800 19px 'Baloo 2'; #fff; letter-spacing:.2px; "THE " + <b>DEPOT</b> in #ffd23e
divider    width:1px; height:24px; background:rgba(255,255,255,.14); flex:none
nav        display:flex; gap:2px; align-items:center; flex:none
  active   800 13px; color:#10456b; background:#ffd23e; radius 999; padding:7px 16px
  rest     700 13px; color:#c8ecfb; radius 999; padding:7px 16px;
           hover -> color:#fff; background:rgba(255,255,255,.09)
  order    Binder | Pack Shop | Play Ball | Marketplace
spacer     flex:1
club       display:flex; align-items:center; gap:7px; flex:none; white-space:nowrap
  record   VT323 17px #7be36b  ("8-0")
  season   Press Start 2P 7px #5f89a8  ("S1")
  hairline width:1px; height:18px; rgba(255,255,255,.14); margin:0 3px
  coin     19x19; perspective:200px; coinspin 4.5s; plain rim (no detail ring at this size)
  balance  VT323 19px #ffd23e
divider    width:1px; height:24px; rgba(255,255,255,.14)
account    display:flex; align-items:center; gap:12px; flex:none; white-space:nowrap
  email    Press Start 2P 8px #8fb2c6; letter-spacing:-.3px
  LOG OUT  Press Start 2P 7px #5f89a8; hover #fff
  Add      800 13px; color:#10456b; linear-gradient(#fff8,#fff0 45%),#7be36b;
           border:2px solid #072c47; radius 999; box-shadow:0 3px 0 #072c47; padding:7px 15px;
           hover translateY(2px) + box-shadow 0 1px 0
```

Under the bar, in the same mock: `background:#2eb2e6; padding:20px`, the control row
(search pill flex:1 + four filter pills), then `margin-top:20px` and the content panel.
That is Rule 8, drawn.

### 3b. Signed out

Same bar. Record, season, coin, balance, email, LOG OUT and Add all drop. One pill takes
their place: Press Start 2P 8px, `color:#10456b; background:#ffd23e; radius 999;
padding:8px 14px`, text "LOG IN". Nav stays - browsing is public.

### 3c. 390

```
bar     height:54px; padding:0 12px; gap:10px
D tile  28x28; radius 8; Press Start 2P 10px
wordmark 800 16px
spacer  flex:1
coin    16x16 + balance VT323 16px
Add     38x38 square; radius:10px; same green gloss/border/shadow; "+" 800 19px
strip   background:#0c3556; display:flex; gap:3px; padding:7px 12px; overflow:hidden
        labels shorten to Binder | Shop | Play | Market, same pill styles
```

Caption: "record moves into Play Ball; email and Log out move into the account sheet."

## 4. What is actually in the build today

### 4a. Ownership

| Thing | File | Notes |
|---|---|---|
| shell chrome (header + nav row + stage) | `js/depot-shell.js` (303 lines) | `DepotShell.mount({el,active,wordmark})`; `TABS` = binder/shop/game only; `TITLES` map feeds the nav-row page title |
| the phase-1 dress | `js/depot-redesign.js` (616 lines) | ENHANCER - re-parents the shell's own nodes, never clones. `dressHeader()` builds `.rd-header__left/__mid/__right`; `dressNav()` dresses a SEPARATE row |
| the sheet | `css/depot-redesign.css` (650 lines) | ch01 block at 320-402, enhancer glue at 605-650, 390 block at 571-598 |
| surfaces mounting the shell | `index.html`, `game/shop.html`, `game/index.html`, `game/builder.html` | plus the `shell-preview.html` / `preview-double-shell.html` harnesses |
| per-surface shell glue | `js/depot-index-shell.js`, `js/depot-game-shell.js`, `js/depot-builder-shell.js` | each repoints the header Add link and folds the surface's own add control away |

### 4b. Contracts the dress must not break

- `[data-depot-email]`, `[data-depot-logout]`, `[data-depot-navtitle]`, `[data-depot-account]`,
  `[data-depot-addcard]`, `[data-depot-nav]`, `[data-depot-stage]` - all queried by
  `depot-shell.js`. The dress MOVES these nodes; it never recreates them.
- `[data-depot-franchise]` with `.name` / `.record` / `[data-depot-season]` /
  `[data-depot-streak]` inside - `setFranchise()` / `setAnonymous()` paint into it. The plate
  is supplied by `depot-redesign.js`; without it the shell warns "no identity block" on every
  paint (the ~15 transient warnings in the backlog).
- `attachNavCarry()` delegates clicks on `[data-depot-nav]`; the tabs must stay INSIDE that
  element or the pre-navigation active-tile carry dies.
- `armAuthRefresh()` + `refreshBalanceSoon()` - the wallet's auth-settle fix. Balance is
  read-only (`DepotWallet.getBalance()` is a SELECT).
- `.rd-plate .depot-wallet-chip{display:none}` - depot-wallet.js keeps mounting its legacy
  chip into `[data-depot-franchise]`; it is hidden, not removed, because a JS-time hide races
  its async re-mount.
- `js/depot-index-shell.js:75` already folds the binder's own "+ Add a card" into the header
  one, so there is exactly one Add today. That must stay true.

### 4c. Rule 7 / Rule 8 violations in the current build (the work list)

1. TWO rows: `.depot-shell__header` (16px 24px padding, ~80px tall) then `.depot-nav` (another
   16px 24px row). Rule 7 wants one 60px line.
2. A PAGE TITLE in the nav row (`.rd-pagetitle`, 24px, from `TITLES`) on every surface.
3. The club status is a BOXED WHITE PANEL (`.rd-plate`: white fill, 3px navy border, 0 5px 0
   shadow) with a "MY CLUB" Press Start 2P heading and a gold pill wallet. Rule 7 wants bare
   numerals on the navy with hairline dividers.
4. Nav pills are four heavy outlined buttons (`.rd-navpill`: #0c3556 fill, 3px border, hard
   shadow) - the exact "loud" treatment the spec rejects. Only the active one may be a pill.
5. NO Marketplace tab anywhere (`TABS` has three entries) and no marketplace surface.
6. `game/builder.html:315` draws its own `<h1>THE DEPOT - LINEUP BUILDER</h1>` (a second
   wordmark AND a page title).
7. `game/shop.html` draws a "Rip a pack" page title under the bar.
8. `index.html:566-590` constrains the header and nav to the binder's centered 760px column;
   a one-line bar is full-bleed.
9. Rhythm: binder header -> search row measures ~100px today, not 20px.

## 5. The approach

Still an enhancer. `depot-redesign.js` keeps re-parenting the shell's own nodes; the change
is WHERE they land and WHAT they wear.

1. `depot-shell.js` gains a fourth tab (`market` -> `marketplace.html`) and the drawn labels
   ("Binder", "Pack Shop", "Play Ball", "Marketplace"). The season label it writes changes
   from `SEASON n` to the drawn `Sn`. Nothing else in the shell moves.
2. `dressHeader()` builds ONE row: brand, hairline, the WHOLE `[data-depot-nav]` element moved
   into the bar (so `attachNavCarry` keeps working), flex spacer, club group, hairline,
   account group. `.rd-pagetitle` is display:none - the gold pill is the page label.
3. The plate loses its box: `.rd-plate` on the bar is transparent, no border, no shadow; team
   name hidden (kept in the DOM for `setFranchise`), record/season bare, hairline, coin,
   balance in VT323 gold. `.rd-wallet` loses its gold pill chrome inside the bar.
4. A new `marketplace.html` mounts the shell with `active:'market'` and renders a DESIGNED
   "coming soon" panel from the state library (never a dead door - the same rule as the
   Play Ball hub tiles).
5. Rule 8 is a single `--rd-step:20px` applied under the bar on each surface.

## 6. Chapter 02b - The Starter Box: SCOPED, NOT BUILT

Not part of this pass, by instruction. Recorded here and in FUTURE_ITEMS as the next feature.
Design truth: `02b-1-starter-box.png`, `02b-2-wave-reveal.png`, `02b-3-full-tray.png`,
`02b-4-binder-first-load.png`, `mobile-390/starter-box.png`, and ch02b of the design document
(lines 333-799). It needs backend work before any of it can be dressed: a position-aware roll,
a `starter_box` grant type on the money path, and the franchise-creation prerequisite already
logged in FUTURE_ITEMS. The README itself says the selection algorithm is undesigned - the
shape is specified (9 fielders / 5 SP / 5 RP / 5 bench + 1 guaranteed bronze-or-better in the
last slot, all with library art, all born verified) but which players and what era weighting
is not. Don't invent odds.

## 7. Deviations from the PNGs, with reasons

1. **The bar spans its container, not the viewport.** 01a draws the bar edge to
   edge. On the binder the shell lives inside `#appFrame`, which is a centred
   `max-width:1100px` cabinet, so the bar is 1100px there and full width on the
   shop / builder / Play Ball / marketplace (which mount the shell on `<body>`).
   Breaking out of the cabinet needs `width:100vw`, and `100vw` counts the
   scrollbar - it puts a horizontal scroller on every long page. Nick-ask: retire
   the 1100px cabinet on the binder and the bar goes edge to edge everywhere.
2. **390 Add button is 44x44, drawn 38x38.** Override rule 5 sets a 44px minimum
   touch target and it is one of the six acceptance criteria; the drawn 38 loses
   to it. Same reason the 390 nav strip is 58px tall rather than the drawn ~45 -
   `min-height:44px` on the pills.
3. **390 keeps a hamburger the mock does not draw.** 01b's caption says "email
   and Log out move into the account sheet" but the drawn 390 bar has no trigger
   for it. Without one a signed-in collector cannot log out on a phone, so the
   bar carries a bare Press Start 2P glyph and the same email + Log out nodes
   become the sheet (`display:contents` on desktop). No new nodes; nothing moved
   twice.
4. **390 hides the record and the season chip.** That matches the drawn 01b bar
   exactly - but the caption says they "move into Play Ball", and the Play Ball
   hub is chapter 08, a TARGET surface that is not built. Logged as FUTURE_ITEMS
   19j rather than invented.
5. **The pack shop still draws its own COINS chip.** Chapter 06 draws it and
   chapter 06 was not re-issued in the revised bundle, so the shop now shows the
   balance twice - once in the bar, once on the surface. Logged as FUTURE_ITEMS
   19k; it is a product call.
6. **The lineup builder lights Play Ball.** Chapter 09 has no nav pill of its own
   and rule 7 says the active gold pill names the surface. A mode with no pill
   lights its parent rather than leaving the bar unlabelled.

## 8. Gates

- `tools/rd_check.py css/depot-redesign.css` - ALL CHECKS PASSED; 0 unscoped
  selectors, 0 box-shadows with a blur radius, one distinct cache-bust hash
  across six shells (marketplace.html joined the list).
- `tools/cssom_probe` (structural CSSOM differ, 41 properties over `#binderGrid`
  / `#spotlight` / `#formScrim`, `git archive origin/main` as the reference):
  189 nodes vs 189, **0 changed / 0 added / 0 removed at 1280 AND at 390**.
  Nothing below the header moved.
- `node --check` on depot-redesign.js, depot-shell.js, depot-shop-view.js,
  depot-index-shell.js, depot-wallet.js - clean.
- HTML parse on index.html, marketplace.html, game/shop.html, game/builder.html -
  clean. game/index.html's bundle blocks were not touched (cache-bust tags only).
- Live: binder / pack shop / lineup builder / Play Ball / marketplace at 1280,
  signed-in and signed-out, and the binder iframe-pinned at true 390. Bar height
  60 exactly; bar -> controls -> panel measured 20 / 20; four pills with one gold;
  no page title anywhere; no horizontal overflow at either width; the LOG IN pill
  opens the auth modal; the 390 account sheet opens and its Log out is 44px.

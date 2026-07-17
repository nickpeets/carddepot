# Handoff: Card Depot Redesign — "The Depot"

## Overview
A full visual + interaction redesign of Card Depot (https://nickpeets.github.io/carddepot/), a personal baseball-card collection site with a mini-game. The chosen direction is a **Game Boy Advance–era "chunky plastic gloss"** aesthetic: bright sky-blue backgrounds, white cards with thick navy borders and hard drop shadows, glossy pill buttons, rounded friendly type, and light arcade juice (sparkles, float animations, card flips, pop-in banners).

Screens covered: card detail page with community comments ("The Dugout"), the Binder (collection), Add a Card, Play Ball season hub, Pack Shop with a working pack-rip reveal, a playable pitch-by-pitch baseball game on a full broadcast-style ball field, a Lineup Card page, and an in-game Substitution overlay.

## About the Design Files
The file in this bundle (`Card Depot Redesign.dc.html`) is a **design reference created in HTML** — a prototype showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in the target codebase's environment** using its established patterns and libraries — or, if no environment exists yet (the current site is static HTML/CSS/JS on GitHub Pages), choose an appropriate lightweight framework (e.g. React or vanilla JS + components) and implement the designs there.

The prototype file is an exploration canvas containing multiple iterations grouped in "turns." **Implement only the option IDs listed below**; earlier options (1a, 1c, 1d, 2a, 5a, 6a, 7a) are superseded explorations kept for reference.

## What to implement (canonical options)
| Screen | Option ID in file | Status |
|---|---|---|
| Visual language / hero | 1b | Chosen direction |
| Card detail + The Dugout comments | 2b | Final (flip-to-back + stats strip, challenge pill, no flair tags) |
| The Binder (collection) | 3a | Final |
| Add a Card | 3b | Final |
| Play Ball season hub | 3c | Final |
| Pack Shop | 3d | Final |
| Pack rip reveal | 4a | Final |
| Playable game (broadcast field) | 8a | Final (7a/6a/5a are earlier versions) |
| Lineup Card page | 9a | Final |
| Substitution overlay | 9b | Final (also embedded live in 8a) |

## Fidelity
**High-fidelity.** Colors, typography, spacing, borders, shadows, copy, and interactions are final intent. Recreate pixel-perfectly with the codebase's patterns. Card images are dashed-border placeholders — production should show real card scans in those slots.

## Design Tokens

### Colors
- `#2eb2e6` — page background (sky blue)
- `#10456b` — primary navy: all borders, hard shadows, dark panels, primary text on white
- `#072c47` — darker navy: scoreboard panel borders/backgrounds, shadow under navy panels
- `#0c3556` — navy panel inner-row background
- `#fff` — card/panel surfaces
- `#f2f9fd` — light blue tint (comment bubbles, input fields, list rows)
- `#dff1fb` — lighter blue chip background; `#bfe4f7` hover; `#cde6f4` subtle borders
- `#c8ecfb` — subtitle text on sky blue
- `#5b7f97` — secondary text on white; `#8fb2c6` — tertiary/muted text
- `#2c4a5c` — comment body text
- `#ffd23e` — gold/yellow (accents, coin, highlights, scoreboard numbers); `#fff7df` gold tint bg; `#7a5b00` text on gold
- `#f4823c` — orange (hot actions, challenge, power swing, star border); `#c9560f` dark orange
- `#7be36b` — green (confirm/success, positive stats); `#e8fbe4` green tint; `#1d6b2a` text on green tint
- `#3a7bd5` — blue (informational banners, Sub button)
- `#e2543e` — red (outs, strikeouts)
- Field: `#41a14b` grass (with `rgba(0,0,0,.05)` mowing stripes every 40px), `#a8683a`/`#c98a4b`/`#cf9254` dirt (radial gradients), `#b5793f→#a8683a` warning track, `#1d5fa8` outfield wall + `#ffd23e` 4px home-run line, `#0d2440` crowd band (random colored dots)
- Scoreboard numbers use `#7be36b` (you), `#ffd23e` (target/gold), `#ff7d6b` (outs)

### Typography
- **Baloo 2** (Google Fonts; weights 500–800) — all UI text. Headings 800, body/labels 600–700. Page titles 24–28px with `text-shadow: 0 3px 0 #10456b` on sky blue.
- **Press Start 2P** — pixel accents only: scoreboard labels (7–10px), lineup names on field (9–12px), team wordmarks (26px), pack wrapper labels. Small sizes need generous line-height (1.5–1.7).
- **VT323** — LED/stat numerals: scoreboard digits (20–34px), stat lines (15–22px).

### Shape system ("chunky plastic")
- Panels: `border: 4px solid #10456b; border-radius: 20px; box-shadow: 0 7px 0 #10456b` (hard shadow, no blur)
- Sub-cards/tiles: 3px border, radius 12–14px, `box-shadow: 0 4px 0 #10456b`
- Buttons: pill (`border-radius: 999px`), 3px border, `box-shadow: 0 4px 0 #10456b`; glossy sheen via `linear-gradient(#fff8, #fff0 45%)` layered over the fill color
- Button press/hover: `transform: translateY(2-3px)` + shadow shrinks to `0 2px 0` (the "press down" effect)
- Navy scoreboard panels: bg `#10456b`, border 3px `#072c47`, shadow `0 4px 0 #072c47`
- Player card tiles: mini trading-card, ~3:4 ratio (e.g. 56×74px), 2px navy border, gradient fill by role — batter `linear-gradient(160deg,#7be36b,#2e9e46)`, pitcher `(#f4823c,#c9560f)`, bench `(#5bc0eb,#2a7db5)` — with 2-letter Press Start 2P initials
- Image placeholders: `repeating-linear-gradient(45deg, rgba(16,69,107,.08) 0 8px, transparent 8px 16px)` + 2px dashed border

### Animation vocabulary
- `floaty` — translateY 0→-7px→0, 3–3.2s ease-in-out infinite (featured cards, VS badge)
- `twinkle` — sparkle ✦ scale .4→1 + rotate, opacity 0→1→0, 1.4–2s infinite (star elements)
- `bannerpop` — scale .4 rotate -4° → 1.12 → 1, ~0.6s (HR/double/walk banners)
- `outshake` — translateX jitter ±7px, 0.5s (outs, losses)
- `ripshake` — rotate ±3°, 1.8s infinite (unopened pack)
- `tearoff` — translate(90px,-140px) rotate(38°) + fade, 0.7s (pack wrapper top)
- `cardpop` — translateY(46px) scale(.6) → overshoot → settle, 0.5s staggered ~0.12s per card
- `starburst` — expanding gold ring, scale .3→2.4 fade, 0.8s (star pull)
- `pitchfly` — ball translateY toward plate + slight scale-up, 0.65s ease-in
- `windup` — pitcher rotate -14°→10°→0, 0.7s
- `baselight` — gold glow pulse on occupied bases, 1.4s infinite
- Card flips: 3D `rotateY(180deg)`, 0.5–0.7s, `perspective: 700-900px`, `backface-visibility: hidden`
- Hover on card tiles: `translateY(-5px)` + slight rotate(1deg), 0.15s

## Screens / Views

### 1. Hero / Home (option 1b)
- Header: 52px gold rounded-square logo tile ("D" in Press Start 2P) + "The Depot" 32px Baloo 800 white with navy text-shadow + subtitle "1,248 cards and counting!"; green glossy "+ Add a card" pill right.
- Nav pills below: "▶ Play Ball" (orange), "The Binder", "By Set" (white).
- Content row: left, 230px "Card of the Day" panel (floats via `floaty`, two twinkle sparkles, card scan placeholder, name + set); right, 3-column grid of card tiles (scan placeholder, name 13px Baloo 700, set 11px muted).

### 2. Card Detail + The Dugout (option 2b)
- Header: "The Depot" wordmark + white "‹ Back to binder" pill.
- Left column (230px, floats): flip container — front = card scan; click flips 3D to **back of card scan** (0.6s). Caption below: "↻ click to flip the card over". Below: player name 18px, set line 13px muted, stat chips (pill, `#dff1fb` bg, 2px navy border, 11px: "YEAR 1989", "ERA JUNK WAX", "GRADE PSA 8", "POS CF"). Then a navy strip (radius 12px): gold "1989 SEASON" label 12px + wrapped stat pairs (label `#8fb2c6` / value white, 12px): AVG .264, HR 16, RBI 61, SB 16, GAMES 127.
- Right column: white panel "The Dugout 💬" with Hottest/Newest sort pills (active = navy bg white text). Comments: 34px rounded-square avatar (colored bg, 3px navy border, white initial), then bubble (`#f2f9fd` bg, `#cde6f4` 2px border, radius 14px) with username 13px 800 navy, timestamp 11px muted, body 13.5px, action row: `▲ 14` upvote, `Reply`, and **"⚔ Challenge USERNAME"** as an orange pill button (white text, 2px navy border, 11px, hover darker orange). Composer: pill input "Talk your talk…" + green glossy "Send".
- Sample comments (copy): MULLET_82 "PSA 8? Those corners say 7 to me. Post a raking-light scan and prove it." / DIMEBOX_DAN "The card of the era, full stop. Instant top shelf. Centering is honestly better than most 8s." / WAXPACK_WES "My '80 Henderson vs this. Play Ball mode, best of 3. Loser rides the bench a week. ⚔"
- **No flair/tag pills on comments** (removed by decision).
- Challenge behavior: challenges a *commenter* to a Play Ball match; challenges surface in the Play Ball hub as exhibition games.

### 3. The Binder (3a)
- Header row: logo tile + "The Binder" title; "▶ Play Ball" and green "+ Add a card" pills.
- Filter row: pill search input ("🔍 Search players, sets, years…") + filter chips: All (navy, active), Topps, Upper Deck, Donruss (white), "★ Stars" (gold).
- Main white panel: "Page 4 of 139 · Junk Wax Era" + ‹ › square pager buttons (32px, `#dff1fb`). 3-col grid of card tiles: scan placeholder (★ orange corner badge on stars), name, set, and grade pill (navy, white text, e.g. "PSA 8") right-aligned.
- Pagination is a binder-page metaphor; keep grid 3×3 per page.

### 4. Add a Card (3b)
- Title "Add a card ✨" + white "‹ Back" pill. Single white panel:
- Two side-by-side dashed drop zones (150px tall, dashed `#2eb2e6` 3px border, hover navy): "📸 Scan the front" / "🔄 Scan the back".
- Form fields: label 12px 800 navy uppercase above filled input (`#f2f9fd` bg, 3px navy border, radius 12px). PLAYER (full width), SET, CARD # , GRADE (select w/ ▾), CONDITION NOTES.
- Gold callout (gold tint bg, 3px gold border): "⚡ Season stats auto-fill from the year on the card — '89 line found: .264 / 16 HR / 61 RBI" — the back-of-card year triggers a stats lookup that populates the card-detail season strip.
- Full-width green glossy CTA: "Slide it into the binder ✦".

### 5. Play Ball hub (3c)
- Title "Play Ball! ⚾" + "Season 3 · Game 12 of 24" subtitle.
- Left navy panel "TONIGHT'S MATCHUP": two card slots (your card vs their card placeholders) labeled with card name + owner record, floating "VS" in Press Start 2P gold between; gold glossy "▶ First pitch" CTA.
- Right white panel "Standings": rank, username, record rows (your row highlighted gold tint; 🔥 for hot streaks). Footnote: "Challenges from the Dugout drop into your schedule as exhibition games."

### 6. Pack Shop (3d)
- Title "Pack Shop 🛒" + subtitle "Win games, earn coins, rip wax". Header right: gold coin balance pill ("🪙 340") + Back.
- 3 pack cards (white panels): floating wrapper art (110×150, gradient fill, 3px navy border, emoji + Press Start 2P label, twinkle sparkle), name 16px, description 12px, green glossy price button "🪙 50 · Rip it".
- Packs: Commons Pack (blue wrap, ⚾, "5 cards · everyday binder fillers", 50) / Junk Wax Rip (orange wrap, 🌟, "8 cards · one guaranteed star insert", 120, "HOT 🔥" orange badge) / Vintage Cello (purple wrap `#8a6dd1→#5a3fa0`, 🏆, "3 cards · pre-1975 odds boosted", 250).
- Economy: coins earned from Play Ball wins (e.g. "+120 coins" on a win).

### 7. Pack Rip (4a)
State machine: `idle → open → done`.
- **Idle**: pack (150×205) shakes (`ripshake`), notched foil top (lighter band + dashed line); click pack or gold "RIP IT OPEN ✂" pill.
- **Open**: wrapper top tears away (`tearoff`), 5 cards pop out staggered (`cardpop`, 0.12s apart) **face-down** (navy diagonal-stripe backs with gold "?"), hint "Click each card to flip it over…". Click flips each (3D, 0.5s). Star pull gets gold-tint face, orange border, expanding `starburst` ring + twinkle. Header subtitle counts "n of 5 flipped", then "STAR PULL! Griffey rookie ✦".
- **Done**: green "Slide all 5 into the binder ✦" + text link "Rip another". "↺ New pack" resets.
- Sample pulls: W. Boggs '89 Topps, B. Jackson '89 Score, **K. Griffey Jr. '89 UD #1 (star)**, G. Maddux '89 Donruss, R. Sandberg '89 Fleer.

### 8. Playable game — broadcast field (8a) — THE Play Ball in-game screen
1100px-wide layout, three zones:

**Top scoreboard row** (three navy panels):
- AT BAT card (250px): gold "AT BAT" label + muted "BENCH 3" count right; 56×74 green player tile; name 18px white, "AVG .301" 22px VT323 green, "HR 16 · RBI 61" 19px muted.
- Center: line score grid — TEAM | innings 1..N | R | H. Cells `#072c47` bg, VT323 17px; team names Press Start 2P 8px (DEPOT ✦ gold / WAXPACKS white). Below: ON DECK / IN THE HOLE rows (next two batters, name + AVG) + "🪙 POT 120" gold chip.
- PITCHING card (250px): mirrors AT BAT with orange tile, "PEN 2" count, ERA/W-L.

**Field** (600px tall, full ballpark scene):
- Crowd band (24px, dark navy with random 3-color dots) → billboard wall (46px `#1d5fa8`, 5 white mini-billboards in Press Start 2P 6.5px: "🛒 PACK SHOP", "💬 THE DUGOUT", "🪙 DEPOT COINS", "WAX + RELAX", "MULLET'S CARDS") with 4px gold HR line → dirt warning track (14px) → grass with horizontal mowing stripes.
- Foul lines: 2px white, starting at 1B/3B corners and running outward to the wall only (never inside/along the diamond).
- Diamond: 190×190 rotated square, 3px white lines; dirt circles at each base + big home plate circle + center mound circle; bases 20px white squares (rotated 45°) that turn gold + pulse (`baselight`) with a 🏃 runner emoji when occupied; home plate white square.
- Defense: 9 fielder sprites (26×32 white rounded tiles with 🧢, 2px navy border) at LF/CF/RF (LF and RF pulled off the lines toward the gaps at ~26% and 74% width), 2B/SS on the infield grass corners, 1B/3B, pitcher on the mound (32×40, animates `windup` on pitch), catcher (🧤 gray tile) behind home plate.
- Batter: 34×44 gold-tint tile ⚾ beside the plate + orange name pill "GRIFFEY JR. ✦" (tracks current batter); two batter's boxes (white outlines) flank the plate.
- Lineups ON the grass, both sides: left = home lineup (POS gold 9px + NAME white 12px Press Start 2P, 2px navy text-shadow; current batter's row highlighted with orange bg); right = away lineup mirrored (name then POS).
- Ball: 14px white circle animating from mound to plate (`pitchfly`) during a pitch.
- Bottom of field: big team wordmarks "DEPOT✦" / "WAXPACKS" (Press Start 2P 26px gold, 3px navy shadow) in the corners; centered ticker capsule between them (`#072c47` bg, VT323 18px green) with play-by-play text.
- Info boxes flanking the plate area: left "PC / K / BB" + last pitch "94 MPH / FASTBALL"; right "INN 2 OF 3" + "B/S/O" stacked (VT323; colors: balls green, strikes orange, outs red).
- Banner overlay: full-field dim + centered Press Start 2P banner, color-coded (HR orange `bannerpop`, DOUBLE/WALK blue, OUT/K red `outshake`, win green / loss navy).

**Controls row** (below field): "💥 Power swing" (orange), "🎯 Contact swing" (green), "👀 Take the pitch" (white), "⇄ Sub" (blue glossy), "↺ New game" (small white). Buttons dim to 45% opacity while the pitch animates.

**Game rules (engine)**:
- Beat opponent's fixed 4 runs before the game ends; win at any moment score passes 4 (walk-off). Default **3 innings**, with a 9-inning option (make it a settings toggle; line score and INN OF x adapt).
- 3 outs per inning; bases/count reset between innings; 9-man batting order rotates and persists across innings; current batter drives AT BAT card, field name pill, lineup highlight, ON DECK/IN THE HOLE.
- Each pitch: buttons lock, pitcher winds up, ball flies (~0.65s), then resolve:
  - Power: 20% HR, 12% double, 8% single, 25% flyout, 35% swinging strike
  - Contact: 35% single, 10% double, 25% groundout, 15% foul (no 3rd strike), 15% strike
  - Take: 55% ball, 45% called strike
- Walks on 4 balls (runners force), K on 3 strikes; singles advance runners 1 base, doubles 2, HR clears; runs count runners crossing home.
- Pitch metadata randomized for flavor: type (FASTBALL/CURVEBALL/SLIDER/CHANGE-UP/HEATER) + MPH (76–83 offspeed, 88–97 hard). PC/K/BB accumulate.
- Ticker narrates each result with batter name; banners fire ~1.1s then unlock buttons.
- Win: green "WALK-OFF! DEPOT n-4 ✦✦" banner + coin reward in ticker ("🪙 +120 coins"). Loss: navy "WAXPACKS WIN 4-n".

### 9. Lineup Card page (9a)
- Title "Lineup card 📋" + "Season 3 · Game 13 · vs WAXPACK_WES"; team name plates right ("DEPOT ✦" navy / "WAXPACKS" orange, Press Start 2P 9px).
- Gold hint bar explains the interaction; it updates contextually ("👆 Tap a bench or bullpen card…" → "Now click a batting-order slot to swap him in." in orange → confirmation note).
- Left panel "Batting order": 9 rows — number, mini card tile (green), name 14px 800, POS pill (navy), AVG (VT323 green), HR·RBI line, ⇄ affordance. When a bench player is selected, all valid rows highlight gold-tint/orange-border.
- Right column: "The bench · pinch hitters" (3 blue-tile cards: Yount .318 SS, Brett .329 3B, Murray .284 1B); "On the bump · + bullpen" (current pitcher card with ERA + 2 pen arms: Gooden 3.19, Clemens 3.13); navy "Scouting: WAXPACKS" panel (their 9: POS, name, AVG in 2-col grid); gold CTA "Lock it in — Play Ball ⚾".
- **Swap interaction**: tap bench card (selects, gold highlight) → tap order slot → swap (displaced starter goes to bench); tap bullpen arm → mound slot highlights → tap to hand him the ball. Selecting again deselects. Hint bar narrates each result ("Yount in, Mattingly to the bench.").
- Wes's roster: Canseco RF .307, McGwire 1B .260, B. Jackson LF .246, Sax 2B .277, Fernandez SS .287, E. Davis CF .281, Santiago C .248, Pendleton 3B .264, Henderson P (ERA 3.02).

### 10. Substitution overlay (9b / in-game via ⇄ Sub)
- Dimmed field behind (`rgba(7,44,71,.6)`); centered 520px white modal (4px navy border, radius 20, hard shadow).
- Header: "Substitution" + live context right ("INN 2 · 1 out · Gwynn due").
- Tabs: "🏏 Pinch hitter" / "🧤 Pitching change" (active = navy pill).
- Body: left card = outgoing player ("DUE UP" or "ON THE MOUND" — reflects live batter/pitcher), orange ⇄, right = candidate cards (bench or pen; selected = gold tint + orange border).
- Warning line: pinch hitter — "Pinch hitter takes the lineup spot for the rest of the game."; pitching — "Starter is done for the day — no re-entry."
- Confirm: green "Send him in" (45% opacity until a pick is made) → green success bar "✔ Yount steps in for Mattingly. The dugout approves." + "Back to the game" closes.

## State Management
- **Collection**: cards (player, set, year, number, grade, condition notes, front/back scans, star flag, season-stat line), organized into binder pages of 9; filters by set + stars; search.
- **Card detail**: flip state; comments (user, avatar color, timestamp, body, upvotes, replies); sort mode; challenge action → creates a pending exhibition game vs that commenter.
- **Season**: schedule (game n of 24), standings (user, W-L, streak), coin balance.
- **Lineup**: batting order (9 refs), bench (3), bullpen (2), active pitcher; selection state for swap; persists into game.
- **Game**: inning, total innings (3 default / 9 option), runs, per-inning runs, hits, outs, balls, strikes, bases[3], batterIdx, PC/K/BB, last pitch (type, mph), phase (`ready | pitching | banner | gameover`), banner, ticker text; sub overlay (open, tab, pick, confirmation).
- **Pack rip**: coin balance decrement, phase (`idle | open`), revealed set, pulled cards → append to collection.

## Interactions & Behavior summary
- All buttons: hover = press-down (translateY + shadow shrink); card tiles hover-lift.
- Card flips everywhere use the same 3D rotateY pattern.
- Play Ball buttons lock during pitch animation and banner display.
- The site is desktop-first at the widths shown (760–1100px content cards); no responsive spec was designed — follow the existing site's approach.

## Assets
- No raster assets. Fonts from Google Fonts: **Baloo 2** (500–800), **Press Start 2P**, **VT323**.
- Emoji used as sprites/icons throughout (⚾ 🧢 🧤 🏃 ✦ ⚔ 💥 🎯 👀 ⇄ 🪙 🌟 🏆 📸 🔄 💬 ⚡) — intentional, part of the GBA-toy look.
- Card scans: user-provided images at runtime (front/back per card); all dashed placeholder boxes become scan slots.
- Player names/stats in the prototype are sample data.

## Files
- `Card Depot Redesign.dc.html` — the full design exploration canvas. Canonical options: **1b, 2b, 3a, 3b, 3c, 3d, 4a, 8a, 9a, 9b** (see table above). It runs standalone in a browser; the working game/rip/lineup logic in it is reference for the intended mechanics (probabilities, state transitions, animation timings).
- `support.js` — prototype runtime only; ignore for implementation.

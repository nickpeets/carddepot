# Handoff: "Yantzen — Now Diving" Scoreboard Tile

## Overview
A single scoreboard panel tile for a retro pixel-art baseball game. The tile is one of the
sponsor/promo panels in the top scoreboard strip (alongside "Live Music", etc.). It reads
**NOW DIVING / YANTZEN / SWIM & DIVE** and features a pixel-art **female swan diver** sprite.

The only thing that changed in this engagement was the diver sprite: the original art was an
ambiguous blob and has been replaced with a clean, continuous pixel rendering of a female swan
diver (red cap, red one-piece suit, arms spread like wings, legs together with pointed toes),
derived from a supplied reference photo.

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing the
intended look and behavior, **not** production code to copy verbatim. The task is to **recreate
this tile in the game's existing codebase / rendering environment** (canvas, DOM, sprite atlas,
or whatever the scoreboard already uses) following its established patterns. In practice the
only deliverable that must ship is **the new diver sprite** (`assets/diver_sprite.png`) dropped
into the existing tile; the surrounding panel chrome already exists in the game. The HTML mock is
provided so you can see exact colors, type, and layout if you need to rebuild the whole tile.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and the sprite are production-intent.
Recreate pixel-perfectly using the game's existing scoreboard rendering. The sprite is the
authoritative asset — use the PNG directly rather than re-tracing it.

## Screens / Views

### Screen: "Now Diving" tile
- **Name**: Yantzen "Now Diving" scoreboard tile
- **Purpose**: A static promo/sponsor panel in the scoreboard strip. No user interaction; purely
  decorative/informational, matching neighboring tiles like "Live Music".
- **Layout** (vertical stack, centered):
  - Outer frame: green bezel `#0a5b23`, `4px` padding, `3px` radius, with an outer ring
    `box-shadow: 0 0 0 2px #073d18` (matches the scoreboard's green chassis).
  - Inner panel: navy `#0d2339`, `3px` solid border `#1f9fce`, `2px` radius.
    Fixed size **300 × 228 px**. `padding: 14px 12px 16px`. `box-sizing: border-box`.
    `display:flex; flex-direction:column; align-items:center;`
  - Row 1 — headline "NOW DIVING".
  - Row 2 — diver sprite, in a `flex:1` centered region (`display:flex; align-items:center;
    justify-content:center; width:100%`).
  - Row 3 — wordmark "YANTZEN".
  - Row 4 — tagline "SWIM & DIVE" (`margin-top: 9px`).
- **Components**:
  - **Headline** — text `NOW DIVING`. Color `#ffcb1e` (gold). Font Press Start 2P, `13px`,
    `letter-spacing:1px`, `text-shadow: 2px 2px 0 #7a4d00`. Blinks (see Interactions).
  - **Diver sprite** — `assets/diver_sprite.png`, displayed at `width:240px` (height auto),
    `image-rendering: pixelated`, `display:block`, `filter: drop-shadow(2px 3px 0 rgba(0,0,0,0.35))`.
    Idle bob animation (see Interactions).
  - **Wordmark** — text `YANTZEN`. Color `#eef3fb` (near-white). Font Press Start 2P, `30px`,
    `letter-spacing:1px`, `line-height:1`, `text-shadow: 3px 3px 0 #16365a`.
  - **Tagline** — text `SWIM & DIVE`. Color `#7fd0ec` (cyan). Font Press Start 2P, `11px`,
    `letter-spacing:3px`.

## Interactions & Behavior
- **Headline blink** — `NOW DIVING` blinks: opacity holds at 1 for ~55% of the cycle, then drops
  to 0.18. Keyframes `scbBlink`, `1.1s steps(1, end) infinite`. (Toggleable; default ON.)
- **Diver idle bob** — sprite translates vertically `0 → -4px → 0`. Keyframes `scbBob`,
  `2.6s ease-in-out infinite`. (Toggleable; default ON.)
- No hover/click/focus states, no navigation, no loading or error states. Static tile.
- Toggles in the prototype (`blink`, `bob`) are convenience props; in-game they can be hardcoded ON
  or wired to the existing scoreboard animation system.

## State Management
None. The tile is stateless and static aside from the two CSS keyframe animations. Two optional
boolean props exist in the prototype (`blink`, `bob`, both default `true`) to enable/disable the
animations; no data fetching.

## Design Tokens
Colors:
- Panel navy: `#0d2339`
- Panel border (cyan): `#1f9fce`
- Outer bezel green: `#0a5b23`
- Outer bezel ring: `#073d18`
- Headline gold: `#ffcb1e`  (shadow `#7a4d00`)
- Wordmark near-white: `#eef3fb`  (shadow `#16365a`)
- Tagline cyan: `#7fd0ec`
- Page backdrop (mock only): `#0a0a0a`

Sprite palette (5 colors, indexed):
- Suit/cap red: `#d62a22`
- Suit/cap dark red (shadow): `#9c1a15`
- Skin light: `#f4ceac`
- Skin mid: `#dca87e`
- Skin dark (shadow): `#b67c54`

Typography:
- Family: **Press Start 2P** (Google Fonts) for all three text rows.
- Sizes: headline `13px`, wordmark `30px`, tagline `11px`.
- Letter-spacing: headline `1px`, wordmark `1px`, tagline `3px`.

Spacing / shape:
- Panel size `300 × 228px`; padding `14px 12px 16px`.
- Bezel padding `4px`; radii: bezel `3px`, panel `2px`.
- Tagline top margin `9px`.

Shadows:
- Headline text: `2px 2px 0 #7a4d00`
- Wordmark text: `3px 3px 0 #16365a`
- Bezel ring: `0 0 0 2px #073d18`
- Sprite: `drop-shadow(2px 3px 0 rgba(0,0,0,0.35))`

Animation:
- `scbBlink`: `1.1s steps(1, end) infinite` — opacity 1 (0–55%) → 0.18 (56–100%).
- `scbBob`: `2.6s ease-in-out infinite` — translateY 0 → -4px (50%) → 0.

## Assets
- `assets/diver_sprite.png` — **the deliverable.** 95 × 27 px transparent PNG, 5-color indexed
  pixel art of the female swan diver. Render with nearest-neighbor / `image-rendering: pixelated`
  and never apply smoothing or bilinear scaling (it will blur the pixels). Scale by integer
  factors where possible.
- `assets/diver_sprite@4x.png` — 4× nearest-neighbor upscale for easy inspection only; not for
  production.
- `assets/reference_diver.png` — the original supplied reference photo the sprite was traced from.
- Font: **Press Start 2P** via Google Fonts
  (`https://fonts.googleapis.com/css2?family=Press+Start+2P`). Use the codebase's existing font
  loading mechanism.

## Files
- `Yantzen Tile.dc.html` — the HTML prototype of the full tile (open in a browser to see it live).
  Contains the exact markup, inline styles, keyframes, and the sprite inlined as a base64 data URL.
- `assets/diver_sprite.png` — production sprite.
- `assets/diver_sprite@4x.png` — inspection-only upscale.
- `assets/reference_diver.png` — source reference photo.

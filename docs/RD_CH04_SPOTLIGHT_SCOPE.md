# Chapter 04 (Card spotlight) - re-dress scope, measured

**Status: measurement, not a decision.** Written by the Repo Agent at the top of the
Phase-3 pass, after AGENTS.md section 0 verification turned up a merge-chain gap
and the chapter-04 surface turned out to be twice the shape the handoff described.
Everything below was read out of the tree at `feat/rd-foundation` tip `1f20d84`
(= PR #216's head) on 2026-07-31. Counts were produced by a script, not recalled.

## 0. Why this file exists

The standing order for chapter 04 is *the spotlight must not ship half-parts*.
That is a real hazard here, because the spotlight is **not** a CSS re-dress: two
runtime scripts own its structure and four CSS layers own its skin. A pass that
re-dresses the markup without dissolving both wrappers ships a surface where the
design and the runtime fight, and the loser is silent. This file is the inventory
so the next pass starts from measurement instead of paying the discovery tax again.

## 1. The base is not what the handoff said (verified, then repaired)

| PR | head -> base | merged (UTC) | in `main`? |
|---|---|---|---|
| #212 | feat/rd-deinline-binder -> feat/rd-foundation | 12:33:02 | yes |
| #213 | feat/rd-ch02-lede -> feat/rd-deinline-binder | 12:33:22 | **no** |
| #214 | feat/rd-binder-parts -> feat/rd-foundation | 16:38:49 | **no** |
| #215 | feat/rd-foundation -> main | 16:38:30 | yes (head `b785c99`) |

Both misses are the same shape twice: the parent merged **19-20 seconds before**
the child landed on it, so the child never rode along.

```
git merge-base --is-ancestor 2c5315c origin/main             -> NO
git merge-base --is-ancestor 2c5315c origin/feat/rd-foundation -> YES
```

So `main` today carries chapters 01/02 + the de-inline transcription sheet, and
does **not** carry `css/depot-redesign-binder.css`, the chapter-02 lede, or the
Phase-2 wiring (stripe token, gold inactive Stars pill). **PR #216** takes
foundation's real tip to `main` and closes both gaps. Chapter 04 work must be cut
from `1f20d84` (or from `main` after #216 lands), never from `main` as it stands.

Section 6 at `1f20d84`, counted fresh with `tools/rd_stamp.py`'s file list:
**73 tags at `2c5315c`** - index 28, shop 20, game 12, builder 12, preview 1;
`js/version.js` BUILD `2c5315c`; one distinct hash. `tools/rd_check.py` with
explicit lists (`css/depot-redesign.css` + `css/depot-redesign-binder.css`, five
shells): 420 selectors, **0 unscoped**, 45 box-shadow declarations, **0 blurred**.
ALL CHECKS PASSED.

## 2. What actually owns the spotlight today

### 2.1 Two runtime wrappers, both structural

Both wrap `window.openSpot` after it runs, so the DOM the user sees is not the DOM
`index.html` describes.

* **`js/depot-card-detail-2b.js`** (346 lines) - *restructures*. `ensureStructure()`
  builds a `.spot-shell` / `.spot-2col` wrapper, injects its own stylesheet, adds a
  "Back to binder" button, **and adds the `dc2b` class to `#spotlight`**. It also
  builds its own grade **stepper** (`buildStepper`), re-writes the meta panel
  (`refreshMeta`), adds meta **chips**, and **relocates the prestige breakdown**
  (`relocatePrestige`) out of the back face into the shell. It is, in effect, an
  undocumented runtime draft of 04a.
* **`js/depot-card-detail-polish.js`** (~450 lines) - *behaviour*: per-face
  orientation (`probeAspect`, landscape letterboxing), the flip beat, the art-only
  back with its designed "No back scan yet" placeholder, and the whole zoom/pan
  engine (`#dcZoom`, `window.dcZoomOpen` / `dcZoomClose`).

**The trap:** every rule in polish's injected sheet is prefixed `.spotlight.dc2b`,
and that class is applied by 2b. **Retiring 2b silently un-styles all of polish** -
orientation, letterboxing, the back placeholder and the zoom chrome - with no error
anywhere. Either keep `dc2b` as a static compatibility marker on the overlay (and
say so in a comment) or re-scope polish in the same commit. Not later.

**Second trap:** `js/depot-prestige.js` `renderSpotlightBreakdown()` appends into
`#spotBack` (host order: `#spotBack` -> `#spotCard` -> `#spotlight`). Prestige only
reaches the user because 2b relocates it. Retire 2b with no new mount and prestige
is appended into an art-only, `overflow:hidden` back face - computed, injected, and
invisible. 04a draws it as a left-column panel under the card, so the re-dress
owes it an explicit mount (`#spotPrestige`) and a one-line host preference in
`depot-prestige.js`. That is a dressing change; the formula is untouched.

### 2.2 Four CSS layers, 85 rules, all in index.html's first `<style>`

Counted by script over the inline blocks (not eyeballed):

| Region (line, at `1f20d84`) | Layer | Rules |
|---|---|---|
| 203-297 | original leather/paper spotlight | 30 |
| 499-564 | "v2" skin overrides (`!important` borders) | 21 |
| 741-798 | "SPOTLIGHT VERTICAL STACK" re-layout | 24 |
| 813-825 | "Phase 2 cutover: card-detail (2b) demo skin" | 10 |

**85 spotlight-ish rules total**, plus **12 `#formScrim .spot-close` rules** in the
add-card blocks. The redesign sheets are linked at index.html lines 14-15, i.e.
*before* all of it, so a plain `rd-` class **cannot** out-rank these; the Phase-2
sheet already says its two `!important` rules "come off when openSpot is rebuilt
from the parts." The re-dress therefore has to **delete** these rules, in the same
commit that stops relying on them - which is exactly the shape of PR #212 for the
binder, transcription sheet and CSSOM probe included.

**Shared-selector hazard:** `.spot-close` is not the spotlight's alone. Add a Card
uses it too (`index.html` line ~1140, `<button class="spot-close">`, styled by the
12 `#formScrim` rules). Deleting `.spot-close` rules regresses **chapter 05**, a
surface that has not been redesigned yet. The clean move is a new `.rd-spot__x`
plus widening `closeSpot()`'s target test (it currently reads
`e.target.classList.contains('spot-close')`), and leaving the add-card rules alone.

## 3. Load-bearing hooks - break one of these and the failure is silent

| Consumer | Needs, exactly |
|---|---|
| library enhancer (`depot-library-art.js`) | `#spotFront` `img.photo, img`; `#spotBack .spot-back-img img`; empty-`src` `<img class="dc-lib-pending">` for the library path; binder tiles stay `.dc-tile[data-idx]` with a **background-div** art layer (an `<img>` layer is invisible to `emptyPhotoLayer` and fails silently) |
| polish (`depot-card-detail-polish.js`) | `.spotlight.dc2b`; `#spotFront` / `#spotBack` / `#spotCard`; `.spot-face`, `.spot-back-img`, `.photo`; `#spotMeta .spot-name` (zoom caption); `.spot-flip-cap`; `.dc-zoom-btn` appended to `#spotCard` |
| flip / close / Esc | `#spotCard.flipped`, `.spot-inner`, `#spotlight.open`; `closeSpot` matches `#spotlight` or `.spot-close`; Esc handler calls `refreshSpotTile()` |
| owner controls (already persist) | `#d4GradeVal`, `#d4GradeSel`, `#d4StarBtn`, `#d4CondInput`, `#d4Status` - `d4SetGrade/d4ToggleStar/d4SetCond` write through these ids |
| tile refresh (#206 + close) | `refreshSpotTile()` -> `#binderGrid [data-idx]` + `window.cardHTML` + `depotEnhanceCardArt`; `cardHTML` injects `onclick` + `data-idx` with a class-list-tolerant matcher that **warns loudly** on failure |
| art-truth gate | the Google-Images escape hatch is gated on `depotProbeCardArt()` (paint outcome), never on resolver tier; 04b: it appears only when a card has no art anywhere |

## 4. Recommended sequence (three commits, one PR each, stacked)

1. **Dissolve** - transcribe the 85 rules into a scoped sheet, retire the 2b
   restructure (keeping `dc2b` as a documented marker or re-scoping polish), add
   `#spotPrestige` + the `depot-prestige.js` host preference. Prove it with
   `tools/cssom_probe.js` before/after: **zero deltas**, spotlight included. No
   visual change ships in this commit.
2. **Re-dress to 04a** - header bar (name + `.rd-starchip` + sub + `.rd-spot__x`),
   `.rd-spot__cols` (left: face, `.rd-hint`, prestige panel / right: stat line,
   `.rd-copy` with `.rd-stepper` + `.rd-startoggle` + `.rd-notes`, `.rd-spot__acts`).
   Every class already exists, unwired, in `css/depot-redesign-binder.css`.
3. **04b stat variants** - hitter / pitcher (`W-L ERA IP SO WHIP SV`, never a
   batting line) / two-way (hitter-primary + an `ALSO PITCHED` sub-panel, because
   the two column sets collide on G/H/BB/SO) / the designed no-stats panel. The
   type decision already exists and is position-first (`cardType()`); the
   provenance gate (`statProvenanceOK`) already refuses to label a line it cannot
   prove, and that behaviour is load-bearing - keep it.

## 5. Deviations from the PNGs to expect, with reasons

* **Front face fits `contain`, not `cover`.** The sheet's `.rd-spot__face img` says
  `cover`; shipped polish forces `contain !important` on both faces so no card is
  cropped. Shipped behaviour wins and the sheet should be ADAPTED to match, with
  the note - override rule 4's spirit, and 04b's own "landscape backs letterbox
  instead of cropping".
* **"Save changes" is a flush, not a save gate.** Grade, star and notes already
  persist on change (`d4Set*`). 04a draws a Save button; making it the only writer
  would invent a new persistence path on a surface that already has one. Ship the
  drawn control, wire it to flush the notes field, gold via `.rd-btn--save.is-dirty`.
* **Zoom is the existing engine.** 04b's magnifier is `polish`'s `.dc-zoom-btn` +
  `#dcZoom` (true-resolution, drag-pan, pinch). Dress it; do not rewrite it.

## 6. Nick-asks

1. **Merge PR #216 first.** Everything in Phase 3+ is cut from `1f20d84`.
2. **Order matters more than speed on stacked merges.** Both misses above were
   ~20-second races. Landing child-then-parent, or waiting for the parent's PR page
   to show the child's commit before clicking, prevents the whole class.
3. A signed-in session on the forwarded origin (Supabase sessions are origin-bound,
   RUNBOOK 3.3) is needed to walk the spotlight's four render paths live.

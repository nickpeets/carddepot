# Chapter 05 (Add a card) - what was measured, what was dressed, what deviates

Companion to `css/depot-redesign-addcard.css`. Written so the next session does
not re-derive any of this. Targets: `build_package/exports/desktop/05a-add-four-gates.png`,
`05b-add-modal.png`, `build_package/exports/mobile-390/add-a-card.png`, plus the
`#ch05` spec text and both `.pg-screen` inline-style trees in
`build_package/Depot - Complete Design.dc.html`.

## 1. The ground (verified, not assumed)

`#formScrim` has exactly two children and they are **siblings**: `.form-card`
(head + body) and `.form-foot`. The scrim is a flex **column** that seams them.
The dress keeps that quirk and only moves the seam: `.form-body` is the panel's
top (4px navy, radius 20 20 0 0, no bottom border) and `.form-foot` is the lip
that closes it (no top border, radius 0 0 20 20, hard shadow `0 7px 0`). Not one
node moved, and the actions still read as inside one panel, as 05b draws them.

## 2. The four gates, mapped to real nodes

| gate | drawn as | app node | number chip |
|---|---|---|---|
| 1 find the player | search + suggestion list | `.rolo-row` + `#rolo-players .rolo-player` | `.rolo-row::before` |
| 2 pick the season | season pills + read-only stat line | `.rolo-years .rolo-yr` (`.sel`, `.nocard`) | `.rolo-years::before` |
| 3 brand, then the card | brand + number + catalog rows with art badges | `.rolo-brand`, `#rolo-card-list .rolo-card-row` | `.rolo-brand::before` |
| 4 confirm the image | scan slots + upload affordances | `.form-right` (`.slot-tabs`, `.preview`, `.img-pane`) | `.form-right > label::before` |

The ADD button is the last gate: `[data-role="add-card-save"]` wears `.disabled`
+ `aria-disabled="true"` (set by `setAddEnabled(false)` the instant a catalog row
is picked, cleared when `depotProbeCardArt` confirms a front or the user attaches
one). It stays **clickable** - no `pointer-events:none`, no `[disabled]` - so the
click still reaches `saveCard()` and the gate can toast why, and
`.rd-addcard__reason` shows in the foot beside it while it is shut.

## 3. Every state that is styled

locked-with-reason - checking (`.rolo-status.checking` spinner and the pulsing
`.rcr-badge.rcr-unknown` "checking...") - ok / err status lines - no-image note
(`.rolo-noimg`) and upload hint (`.rolo-uphint`) - all three upload affordances
(file input, drag `.drop-hot`, clipboard paste) - art badges FRONT + BACK /
FRONT ONLY / NO IMAGE - `.rcr-same` "same image" - PR #206 row thumbnails
(`.rcr-thumb`, blank until the library front actually loads) - the read-only
details strip with its navy VT323 stat line - `.preview.has-img` - `.ph-text.err`.

## 4. Deviations from the PNGs, with reasons

1. **The scrim is a wash, not a page.** 05a/05b are drawn as standalone sky
   pages. The modal really sits over the binder, so the scrim is sky at 93% with
   the chapter-02 white stripe over it. No blur anywhere (the legacy skin used a
   26px/64px blurred drop shadow; the redesign bans blur).
2. **GRADE is not in the details strip.** 05b draws six cells including a
   `GRADE PSA 8` control. The app's strip has Player / Pos / Team / Year / Set /
   Card #, and grade mechanics are FROZEN, so no control was invented. The strip
   is dressed for six cells the moment one is added.
3. **The stat line is one string, not a 7-column grid.** 05b lays the season
   line out as seven k/v scoreboard cells. The app persists it as a single
   `AVG:.303, HR:9, ...` string (`#acsStats`), so it is dressed as one navy
   scoreboard block with VT323 numerals. Splitting it needs JS, which a dress
   branch does not write.
4. **"n cards missing images - show anyway" does not exist in the app.** The
   phrase appears nowhere in `index.html` or `js/`; today no-art rows are simply
   listed (dimmed, NO IMAGE badge). The part is dressed (`.rolo-showall`) so the
   day the behaviour ships it is already drawn - logged as FUTURE_ITEMS 19e.
5. **Gate titles stay in the app's words.** 05a titles the gates "Find the
   player" / "Pick the season" / "Brand, then the card" / "Confirm the image".
   The app already labels them ("PICK A SEASON:", "Brand & number:", "Card
   images"); the dress numbers them and styles them rather than rewriting copy
   through CSS `content`.
6. **390: the Find pill sits under the field.** The export draws search and Find
   on one row; at a true 375-390 the field cannot hold a placeholder and a 44px
   pill side by side, so Find drops to its own full-width row (README rule 5,
   44px targets, wins over one-row fidelity).
7. **Five external `!important` rules had to be answered** (see section 8 of the
   sheet): the retro block forces Press Start 2P on `.form-head h2`,
   `.rolodex-head`, `.ph-text` and a border on `.rolo-row button` / `.btn-ghost`,
   and `css/depot-spotlight-legacy.css` forces `.spot-close`'s border. The dress
   answers them scoped, exactly as the legacy transcription did.

## 5. Verification performed on feat/rd-addcard-dress

- `tools/cssom_probe.js`, main-on-disk vs branch-on-disk, same session, fonts
  settled both sides, roots `#binderGrid` (74 nodes) + `#spotlight` (7):
  **1280x2200 - 81 nodes, 81 identical, 0/0/0** and **390x2400 - 81 nodes, 81
  identical, 0/0/0**. The two surfaces this chapter does not own did not move.
- Live gate walk, signed in at 1280: Rickey Henderson -> 1980 (of 38 seasons) ->
  Topps -> catalog rows with real thumbnails -> locked ADD + reason -> both scan
  slots painting library art -> the stat line filled from records.
- True 390 in an iframe (a window resize floors at 500): all four badge states
  visible in one render, gate chips 1-3, the gold inline season pill, 44px
  targets, the sticky foot.

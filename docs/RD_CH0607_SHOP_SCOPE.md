# Chapters 06 + 07 -- what owns the Pack Shop and the Rip

Measured on `feat/rd-shop` off `main@488e5a2`, before any dress commit. Written
first so the dress can be checked against something.

## 1. One renderer, two surfaces

`js/depot-shop-view.js` (1242 lines) is the only thing that draws a pack shop.
It is mounted twice, never forked:

| surface | mount | grid element | context |
|---|---|---|---|
| `game/shop.html` | inline boot script, line 83 | `#shopGrid` inside `main.depot-stage` | `shop` |
| binder PACK SHOP tab | `js/depot-binder-shop.js` `mountShop()` | `#binderGrid` (+ `.dsv-grid`, status `#dsvStatus` injected) | `binder` |

`render()` writes one tree into the grid element:

```
#shopGrid|#binderGrid.pks-host
  .pks[.pks--binder]
    .pks-head    .pks-head-txt > .pks-h1 + .pks-sub | .pks-guest | .pks-wallet > .pks-coin > i + b.pks-bal | button.pks-login
    .pks-free    .pk-wrap--free + .pks-free-body > .pks-chip + .pks-free-head + .pks-free-sub + [.pks-cdrow > .pks-bar > i + .pks-cd] + button.pks-btn.pks-btn--green.pks-btn--free.claim-free
    .pks-grid    .pks-tier.tier-<t>[data-tier] * 3 -> .pk-wrap--<t> + .pks-tier-txt > .pks-tier-name + .pks-odds + button.pks-btn.buy[data-tier]
    .pks-foot
    .dpc-history (Pack History, section 4)
```

The `--binder` variant hides `.pks-h1` / `.pks-sub` because the binder header
already says RIP A PACK, and the era strip supplies the chrome.

## 2. The rip is its own theatre

`playPackSession(cards, hitIndex, opts)` appends `.prip.prip-tier-<tier>` to
`document.body` (role=dialog, aria-modal) and runs four phases in place:

- **held** -- `.prip-held-wrap` (a `.pk-wrap--<t>` at 230x318), `.prip-head`,
  `.prip-kicker`, `button.prip-cta.prip-cta--gold.prip-rip`. Nothing auto-plays.
- **reveal** -- one card at a time: `.prip-counter[.is-hit]`, `.prip-stage` >
  `.prip-card.esc-<band>[.esc-hit]` > `.prip-back` + `.prip-front.pk-b-<band>`
  (`.prip-band` > `.prip-band-lab` + `.prip-band-yr`, `.prip-well`, `.prip-plate`),
  `.prip-prompt`, `.prip-tray` of `.prip-slot`. Gold adds `.prip-rays`,
  `.prip-confetti i` and `.prip-stamp`; a common gets nothing extra.
- **all five** -- `.prip-done-head`, `.prip-summary`, `.prip-row > .prip-mini`,
  `.prip-ctas` with `.prip-add` / `.prip-again` / `.prip-close2`.
- **added** -- `.prip-check`, `.prip-added-head`, `.prip-added-line`.

Progress dots live in `.prip-top` (`.prip-dot.band-<b>` / `.is-cur`) and are
reveal-phase only. The 1-card free daily uses the same theatre with `single`
true: held -> one reveal -> added, no dots, no tray.

Art is probe-gated: `fillArt()` paints `.prip-well` only for a live laid-out
node whose phase token is still current, and falls back to `.prip-noart`
(tile + NO IMAGE YET + a sentence) -- never a broken image (README rule 4).

### 2.1 Display requirement -- every name in the rip routes through `depotCleanName`

Carried here in full from `docs/ONBOARDING_PATH_SPEC.md` section 5 rather than
cross-referenced, so that whichever of the rip and the onboarding starter box
ships first does not inherit a dependency on the other shipping.

**Today nothing in this chapter calls it.** `js/depot-shop-view.js` `nameOf()` is
literally `return s.player || s.name || "Unknown"`, and there is no truncation in
`depot-pixel-card.js`, `depot-binder-browse.js`, `depot-shop-view.js` or
`depot-card-detail-2b.js`. *Read by the session that wrote
`ONBOARDING_PATH_SPEC.md` section 5 on 2026-08-12; carried across, not
re-verified here.* It is why the free pull observed that day printed
`Yonathan Daza SP, VARVAR: Running` across two lines on the card face, in the
reveal, at the moment the card is the only thing on screen.

**Requirement.** Every surface in this chapter that prints a player string routes
it through `window.depotCleanName`, with the guard that is already house style:

```js
var cn = (typeof window.depotCleanName === 'function') ? window.depotCleanName : function (x) { return String(x || '').trim(); };
// ...
cn(card.player)
```

Which nodes those are -- the `.prip-front` plate, the `.prip-mini` summary row,
and the `.dpc-hist-cardname` rows in section 4 -- is read off the trees in
sections 1, 2 and 4 above, not off a grep of the view. Treat the list as the
places to check rather than as a proven complete set.

Measured impact, carried from `ONBOARDING_PATH_SPEC.md` section 5: **2.5%** of
the eligible pool carries the doubled-code prose bug (`UERUER:`, `VARVAR:`) and
a further **8.2%** carries trailing subset codes. Worst in junk wax at 2.5% --
which is exactly what a Bronze pack is weighted toward -- and cleanest in vintage
at 1.3%.

**And the cleaner is not guaranteed to succeed.** `depotCleanName` falls back to
**the raw string** when it finds no name token. That is the right fallback -- a
messy name beats an empty card -- but it means the reveal must not assume that
cleaning shortens anything. The 2.5% doubled-code class is covered; any *future*
malformation is not, and it will arrive at the card face at full length.
Whatever the plate does about overflow, it has to do without relying on the
cleaner having succeeded.

This is the same open item as `ONBOARDING_PATH_SPEC.md` section 5's third
bullet, recorded in both chapters on purpose.

#### Observed on the live binder 2026-08-12, and it sharpens the requirement

Read off the running site, not from source. The binder tile writes the raw
string into `.rd-tile__name`, and `depot-card-detail-2b.js` prints it as the
panel headline -- `YONATHAN DAZA SP, VARVAR: RUNNING`, uppercase, the largest
text on the panel. Full detail in `ONBOARDING_PATH_SPEC.md` 5.1.

The part that lands on this chapter: the binder tile looks clean only because
`.rd-tile--binder.has-art .rd-tile__name { display: none; }` hides the name
**when the card has a picture**. The protection is accidental and backwards --
the string is suppressed where the art already identifies the card, and exposed
where the name is all there is.

**Section 2's `.prip-noart` fallback is that same case, inside the rip.**
`fillArt()` paints a tile plus NO IMAGE YET plus a sentence whenever there is no
live art, which means the reveal's no-art path identifies the card **by name
alone**. That is the frame where an uncleaned string costs the most, and it is
the frame the fallback exists to produce. If the cleaning lands in one place
first, land it there.

## 3. The single-card ceremony (still used)

`buildReveal()` + `playCeremony()` build `.dsv-reveal-host > .dsv-reveal.band-<b>.ceremony-<b>`
with `.dsv-scrim`, `.dsv-burst`, `.dsv-stage > .dsv-card > .dsv-face.dsv-cardback|.dsv-cardfront`,
`.dsv-chip.band-<b>`, `.dsv-cap`, and the state classes `teasing / anticipating /
flipping / landed / dismissing`. It is the ceremony the binder uses when a claim
settles a single card, and `.card.just-landed` (`dsv-settle`) is the landing
flash on the binder tile itself.

## 4. Pack History (PR #208) -- what must survive

- `renderHistoryHtml()` -> `.dpc-history > h3 + .dpc-hist-list` of
  `.dpc-hist-row > .dpc-hist-item.dpc-hist-<tier>` (`.dpc-hist-spine`,
  `.dpc-hist-meta > .dpc-hist-tier + .dpc-hist-when`, `button.dpc-cardsbtn`,
  `button.dpc-replaybtn`) plus a hidden `.dpc-hist-cards` panel per row.
- Expanding a row reads the ledger (`DepotPackHistory`) and prints
  `.dpc-hist-cardlist > .dpc-hist-card[.is-linked]` with `.dpc-hist-cardname`,
  `.dpc-hist-cardmeta`, `.dpc-hist-go`; a re-roll gets `.dpc-hist-note`.
- **In-place refresh:** `paintHistoryInPlace()` repaints only `.dpc-history`, and
  `refreshHistorySurfaces({reason:'collect', rehydrate:true})` fires from the
  rip's `finish()`. A full `render()` during a rip would yank the surface out
  from under the ceremony -- so the dress must not need one.
- The shelf is module state merged with the `pack_grants` ledger, so a pack
  opened in another browser still appears.

## 5. Money path -- read-only for this branch

The view wires **nothing** to the RPCs. Buying goes
`button.buy -> Shop.buy(tier, catalog, balance, makeBuyUi(tier))`; the free daily
goes `button.claim-free -> Shop.claimFree(catalog, freeUi)`; an unopened debit is
recovered by `Shop.redeemPending(...)`. Rolling is
`DepotPackEngine.rollPack`, odds are `estimateOdds()` at display time, and
`replayPack()` re-rolls a stored seed with zero DB writes. Nothing in this
chapter touches `depot_purchase_pack`, `pack_grants`, the free-daily RPC or the
ledger-first order. The rip is theatre over cards that are already granted.

## 6. Odds copy is derived, never transcribed

`oddsHtml()` prints two variants into every tier card -- `.pks-d` (desktop
sentence) and `.pks-m` (390 short form) -- from `estimateOdds()`. The words
"guaranteed" and any hard-coded percentage stay out: the floor language comes
from `hitFloorBand`, the top-band share from `hitBandPct`. The design's own
numbers name a Diamond band the engine does not have, which is exactly why the
copy is computed (README rule 3).

## 7. CSS authority today (the dissolve target)

| sheet | lines | what it really owns |
|---|---|---|
| `css/pack-shop-v2.css` | 584 | the live skin: `.pks-*` (64), the `.pk-wrap` wax family (39), `.prip-*` (130), plus a Pack History reskin (20) |
| `css/depot-shop-view.css` | 214 | `.dsv-reveal*` ceremony, `.dsv-status`, `.dsv-grid`, `.card.just-landed`, `.era-tab.packshop` -- **and** two dead layers: `.dsv-tile/.dsv-back/.dsv-btn` (the pre-`pks` tile) and `.dpc-modal/.dpc-held/.dpc-packback/.dpc-ripbtn/.dpc-stagewrap/.dpc-collect` (the pre-`prip` ceremony) |
| `css/shop.css` | 66 | entirely dead: `.pack`, `.pack .wrapart/.pname/.pdesc/.odds/.buy`, `.free-ribbon`, `.reveal-card`, `.band-tag`, `.shop-head/.shop-bal`. `game/shop.html` renders none of it since the shared view landed |

No `<style>` block in `index.html` and no JS-injected sheet touches these
classes (`grep` for `pks-|prip-|pk-wrap|dsv-|dpc-` in `index.html` = 0), so the
three sheets above are the whole authority. That is what makes chapters 06/07 a
clean dissolve-and-replace instead of a layering job.

The live skin is already close to the design language -- navy borders, hard
`0 4px 0` shadows, Baloo 2 / Press Start 2P / VT323, pill buttons with a gloss.
It predates the redesign branch, so it uses its own `--pk-*` variables instead
of the chapter-00 tokens in `css/depot-redesign.css`. The dress replaces those
private variables with the shared tokens and the shared parts, and drops the
dead layers rather than carrying them across.

## 8. Scope classes the dress adds

`tools/rd_check.py` requires every selector in a redesign sheet to be scoped,
so the dress adds one class token per root the view creates -- markup only, no
hook changes:

- `.rd-shop` on the `.pks` root (both surfaces at once, and it disappears with
  the surface because `render()` rewrites it).
- `.rd-shop` on the `.prip` rip root and on `.dsv-reveal-host` (both are
  `document.body` children, so they cannot inherit a page scope).
- `.rd-shop-grid` beside `.dsv-grid` on `#binderGrid`, and `.rd-shop-status` on
  the injected `#dsvStatus`, so the two binder-side hooks can be described
  without an unscoped selector.

## 9. Where the build differs from the PNGs (to be closed by the dress)

1. `06a-shop-tiers.png` draws **four** tier panels -- Bronze / Silver / Gold /
   Diamond, the last one tinted, badged GATED and reading "Locked -- economy
   pass pending". The build renders three (`Shop.TIER_ORDER`). The dress adds
   the Diamond panel as a designed locked tile: no price, no buy hook, no odds
   slot, reason next to it (README rule 6).
2. The free-daily row in the design is one wide panel with the art at the left,
   a 14px progress bar, `next rip in` + a VT323 clock, and a "Come back
   tomorrow / cooling down - 24h" pill at the right. The build has the bar and
   the clock but no right-hand pill.
3. `pack-shop.png` (390) is a **row** layout: art tile left, name + one-line
   description, full-width pill under each row -- not a squeezed 3-up grid.
4. **Closed by the dress:** the Diamond panel now renders (gated, no hooks);
   the 390 layout is rows; the tier pills are green as drawn.
5. **Kept as a deviation:** the design's right-hand "Come back tomorrow /
   cooling down - 24h" pill is not drawn. The live countdown is the button's
   own label and the ticker owns that string every second; splitting it in two
   would mean two clocks. The bar, the `next rip in` label and the LED clock
   all render, so the wait stays legible.
6. **Kept as a deviation:** the design's per-tier emoji art (box / star /
   trophy / gem) stays as the `.pk-wrap` wax wrapper the build already had --
   a real pack front with crimped edges, a plate and a sheen. It is closer to
   06b's "shop tiles" panel than an emoji would be, and it is the same object
   the rip holds in its held phase.
7. **Found by the walk, logged not fixed:** the binder PACK SHOP tab has no
   entry point since the Phase-2 era rail landed (FUTURE_ITEMS 19g).

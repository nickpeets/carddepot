# Phase 5, deliverable 1: what Play Ball actually supports today

Measured on `feat/rd-playball` (off `feat/rd-shop`), **before any dressing**, so
chapter 08's hub can tell the truth about which doors open. Nothing in the sim
was touched to produce this; it is a read.

## 1. The modes

| mode | state today | what backs it |
|---|---|---|
| **Exhibition (solo vs ACORNS)** | **LIVE** | `game/index.html` with no `match` param. The sim runs against a fixed AI club and `DepotWallet.recordExhibitionResult(null, mudcats.r, acorns.r)` pays it out. Every multiplayer failure path also falls back here with a banner. |
| **Season (franchise)** | **LIVE, thin** | `game/season.js` (289 lines) over three tables: `franchises`, `seasons`, `season_games`. `startOrResumeSeason` -> `ensureFranchise` -> `ensureSeason`; `nextPendingGame`; `launchSeasonGame(ctx)` writes a sessionStorage context and sends the user to `game/builder.html`; `attachMatchToSeasonGame` then `recordSeasonResult` / `recordSeasonResultByMatch` write the result back. Opponents are synthetic: `makeOpponentLineup(seasonId, gameNumber)` seeds `seededRand`/`hashStr` and turns a batting average into rates with `avgToRates`. Entry point is `#depotSeasonBtn` -> `window.__depotOpenSeason()`. |
| **VS (multiplayer)** | **PARTIAL** | `game/index.html` reads a `match` row (`challenger_lineup`, `opponent_lineup`, `status` in pending/accepted/declined/played) and plays it. Every refusal is explicit and falls back to the solo demo. The challenge/accept surfaces live on their own branches; I did **not** verify a live challenge round-trip this session. |
| **Dugout / Marketplace / Pack provenance** | **NOT BUILT** | chapters 13/14/15 are marked roadmap in the build package README. |

Chapter 08 therefore has exactly two doors that open (Exhibition, Season), one
that opens only with a match id (VS), and the rest are designed "coming soon"
tiles -- never dead doors.

## 2. Sim-engine hook inventory (all of it lives in `game/builder.html`)

- `RESOLVED` (line 419): `cardId -> { status:'api'|'card'|'bad'|'pending', team,
  rates, avg, hr, rbi, tendency, pos, note }`. The single source of truth for
  whether a card can play.
- `isUsableHitter(id)` (498): `status === 'api' || status === 'card'`. The
  **bench-only stat-less rule** is enforced by `addToOrder` (980), which returns
  early for an unusable card, so a stat-less card can sit in the collection and
  on the bench but never in the nine.
- `naturalPosFor(id)` (430) + `normPos` / `nextFreePos` / `usedPositions`: the
  out-of-position flag (`outOfPos`) on every `ORDER` slot.
- `ORDER[9]` + `PITCHER`: the lineup state. `renderAll` repaints from them.
- The play gate (1100): `ORDER.every(slot => isUsableHitter(slot.id))`.
- The hand-off (1083-1118): the lineup is serialised into the match-row JSON
  shape from `ORDER` / `PITCHER` / `RESOLVED` / `cardById`.
- Season divert: `DepotSeason.readSeasonCtx()` is what makes the builder open in
  season mode; `clearSeasonCtx()` closes it.

**None of these may move for a dress.** Chapter 09 dresses the builder's
markup around `ORDER` / `PITCHER` / `RESOLVED`; chapter 10 dresses the game
screen around the sim's existing DOM.

## 3. What chapter 08's hub can honestly offer

- **Lineup** -> `game/builder.html` (live).
- **Season** -> `window.__depotOpenSeason()` (live; note FUTURE_ITEMS 17 -
  franchise creation is still one `window.prompt`).
- **Exhibition** -> `game/index.html` with no match param (live).
- **VS** -> designed "coming soon" tile until a challenge surface is verified;
  the mode plays, but there is no in-app way to create the match row that a
  player would need. That is the honest state, and rule 6 says the tile has to
  say why.

## 4. Chapter 10's two specified-not-drawn items

The build package README lists them as known gaps and chapter 10 specifies them
in TEXT only:

- **Batter's-box boosts** (Step out / Guess pitch, 3 per game) -- these are game
  logic, not chrome: they change how a plate appearance resolves. The sim is
  frozen for this phase, so they are **specified-not-implemented** and belong in
  FUTURE_ITEMS, not in a dress commit.
- **Coin payout animation** (bounce + count-up) -- pure chrome over
  `recordExhibitionResult`, safe to dress when chapter 10 lands.

## 5. What this branch has NOT done

Chapters 08, 09 and 10 are **not dressed**. This branch carries the audit only.
The next unit is the chapter 08 hub, and it starts from the table in section 1.

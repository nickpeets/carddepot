# BOXSCORE_RUN_ATTRIBUTION.md — the box score headline lies, and why

Status: **measured defect, unfixed.** Two replays, both read-only. Display-only impact — no stored result and no settlement has ever used the wrong number.

Found 2026-08-11 while closing item 5(a).

---

## 1. The symptom

The box score headline disagrees with the line score printed directly beneath it.

| | match `46ff69f7` | match `af16f852` |
|---|---|---|
| banner | ASSHEAD 10, TIMWSTOUT 6 | CRAPPERS 1, DEUCERS 4 |
| line score | 10 – 6 | 1 – 4 |
| both pitching lines | 10 – 6 | 1 – 4 |
| `GAME.line` on the engine | 10 – 6 | 1 – 4 |
| stored `matches.result.final` | 10 – 6 | 1 – 4 |
| **box score headline** | **12 – 9** | **4 – 2** |

Five readings agree. One does not, and it is the one printed largest.

---

## 2. The headline is computed from the batting table, and the batting table over-counts runs

### Match `46ff69f7` (seed 1052721976)

    LINE SCORE   1 2 3 4 5 6 7 8 9   R   H   E
    ASSHEAD      0 0 0 0 2 0 3 0 5   10  18  0
    TIMWSTOUT    1 0 2 1 0 2 0 0 0    6  12  0

    ASSHEAD   batting totals   AB 45  R 12  H 18  2B 4  3B 0  HR 3  RBI 10  BB 3  K 9
    TIMWSTOUT batting totals   AB 39  R  9  H 12  2B 1  3B 0  HR 2  RBI  6  BB 4  K 8

    Randy Johnson  (ASSHEAD P)    9.0 IP  12 H   6 R  4 BB  8 K
    Dwight Gooden  (TIMWSTOUT P)  9.0 IP  18 H  10 R  3 BB  9 K

Innings sum correctly: 0+0+0+0+2+0+3+0+5 = 10, and 1+0+2+1+0+2+0+0+0 = 6. The pitching lines agree crosswise — Johnson allowed 6, which is TIMWSTOUT's line-score total; Gooden allowed 10, which is ASSHEAD's. Over-count: **+2 and +3**.

### Match `af16f852` (seed 385391966)

    LINE SCORE   1 2 3 4 5 6 7 8 9   R   H   E
    CRAPPERS     0 0 0 0 0 0 0 0 1    1   4  0
    DEUCERS      0 1 0 0 0 1 2 0      4  10  0

    CRAPPERS batting totals   AB 31  R 2  H 4  2B 0  3B 0  HR 1  RBI 1  BB 0  K 10

Over-count: **+1 for the visitor, +0 for the home side.**

### Therefore the offset is not constant

+2 / +3 in one game, +1 / +0 in the next. **It is a per-event bug, not a fixed offset**, and it can be zero. Anyone patching this should not expect a single wrong constant.

---

## 3. The smoking gun — a run credited to a player who was never on base

In `af16f852`, CRAPPERS scored exactly one run: Ichiro Suzuki's solo home run in the 9th. His line is correct:

    ICHIRO SUZUKI LF    AB 4   R 1   H 1   2B 0   3B 0   HR 1   RBI 1   BB 0   K 0

And then there is this, from the same table, same game:

    RYNE SANDBERG 2B    AB 3   R 1   H 0   2B 0   3B 0   HR 0   RBI 0   BB 0   K 1

**One run. Zero hits. Zero walks. Zero errors in the game on either side (E=0, E=0).** He never reached base, and he is credited with scoring.

This rules out simple misattribution. If the run had merely been credited to the wrong player the team total would still read 1; it reads 2. **These are extra credits, not moved ones.**

---

## 4. RBI is right in the same table that gets R wrong

| | actual runs | batting R | batting RBI |
|---|---|---|---|
| ASSHEAD | 10 | 12 | **10** |
| TIMWSTOUT | 6 | 9 | **6** |
| CRAPPERS | 1 | 2 | **1** |

With `E = 0` on every side of both games, every run was driven in, so RBI must equal runs — and RBI does. Hits are also correct throughout: ASSHEAD's batting H of 18 matches the line score's 18 and Gooden's 18 allowed.

So the batting table is right about hits, right about RBI, and wrong about R. **The defect is narrow: it lives in per-batter run attribution and nowhere else in the box score.**

---

## 5. The fix separates cleanly into two pieces

**Piece one — derive the headline from `GAME.line`.** One-line change. It kills the visible lie immediately and, more importantly, removes the second source of truth permanently. The line score, the banner, the pitching lines and the database all already read from the same place; the headline is the only consumer of the batting totals. There is no reason for it to be.

**Piece two — find the phantom credit.** This is a `game/sim.js` read and it belongs to whoever owns that file, not to a display patch. The shape to look for: something increments a batter's run counter on a scoring event in addition to incrementing the runner's, or credits the batter at the plate rather than only the runner who crossed. The Sandberg row is the case to reproduce against — 3 AB, no times on base, one run.

Do piece one first. It is safe, it is small, and it makes the box score honest while piece two is being investigated.

---

## 6. What this does NOT affect

**No money and no record.** The stored `matches.result.final` carries the line-score numbers, and settlement reads `result.final`. Nick's settlement row on `46ff69f7` is 100 / `won = true`, which is 10 > 6 — correct. On `af16f852` it is 15 / `won = false`, which is 1 < 4 — correct. **No payout has ever been computed from the wrong number.** The bug is confined to one rendered string.

---

## 7. Seed determinism, confirmed in passing

Both replays reproduced their stored results exactly, months after the fact:

    46ff69f7  played 2026-06-26, seed 1052721976, replayed 2026-08-11 → 10-6 ✓
    af16f852  played 2026-06-30, seed  385391966, replayed 2026-08-11 →  1-4 ✓

This is the property all of VS mode rests on and it had never been tested. It holds.

---

## 8. Method note

Both measurements come from pressing REPLAY on a played match while signed in, which writes nothing. Console during each run, complete:

    [season] writeback fired
    [season] byMatch: NO season_game row for match_id <id> - attach never wrote match_id, or wrong owner/RLS
    [season] writeback complete

The season writeback fires ahead of the `firstPlay` guard by design and returns without writing because a VS match has no `season_games` row. No settle call, no `matches` UPDATE, banner reads "(replay)" and never "(saving…)".

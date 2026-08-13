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
---

## 9. Piece one, specced for the codespace agent — and why it is FINAL-ONLY

Written 2026-08-12 by the browser agent, which located the site and then did not
touch it: `game/sim.js` is the game engine, `AGENTS.md` section 2 requires
sign-off for it, and that agent cannot run tests.

### 9.1 The exact site

`renderBoxScore(stream, line, upto)` in `game/sim.js`:

```js
function __sumR(t){ var s = 0; t.order.forEach(function(idx){ s += (t.bat[idx] && t.bat[idx].r) || 0 }); return s }
var mr = __sumR(teams.mudcats), ar = __sumR(teams.acorns)
```

`mr` and `ar` feed both the `winner` test and `resultLine` — the string printed
largest. **The authoritative number is already in scope in the same function**,
as `line.mudcats.r` and `line.acorns.r`, which is what `__bxLineScore(line)`
prints directly underneath. Section 2's defect is that one panel reads two
sources.

### 9.2 ▶ The wrinkle section 5 did not know about: `renderBoxScore` takes `upto`

Section 5 calls piece one "one-line" and "safe". It was written about the FINAL
box score and it did not account for the third argument. `renderBoxScore`
computes `__isFinal` from `upto` and renders an **in-progress** panel headed
`IN PROGRESS — T5` and similar.

`line.mudcats.r` is the total for the WHOLE GAME. **So the naive swap makes an
in-progress box score print the final score** — a worse defect than the one being
fixed, shipped as a safe one-liner.

### 9.3 Why summing `innings[]` does not rescue the in-progress case

Measured: the innings array IS written per half-inning —
`line[code].innings[inning - 1] = runsThisInning` — so summing completed innings
is well-defined. But the array is fully populated for a completed game, so at a
cut in the MIDDLE of an inning, `innings[cutInning - 1]` already holds runs that
have not happened yet at the cut. Summing to the cut inning inclusive
over-reports; summing exclusive under-reports the current inning entirely.

Closing that gap needs the runs scored **within** the current half-inning up to
the cut, and the only per-event source for that is the same per-batter `r` the
batting table derives — **the value section 3 proves is over-counted.**

**Therefore: the in-progress headline cannot be made correct by piece one. It is
blocked on piece two.** That is a real finding and it is why this section exists.

### 9.4 The spec

1. **Final:** when `__isFinal`, take `mr = line.mudcats.r` and `ar = line.acorns.r`.
   Exact, and it removes the second source of truth for the case that is stored,
   settled and shown to a player after every game.
2. **In progress:** keep `__sumR` — do NOT change behaviour — and **log the
   divergence deliberately**:

```js
if (!__isFinal) {
  var lr = line.mudcats.r, la = line.acorns.r;
  if (__sumR(teams.mudcats) > lr || __sumR(teams.acorns) > la) {
    console.warn('[sim] box score: batting-table runs exceed the line score '
      + '(mudcats ' + __sumR(teams.mudcats) + ' vs ' + lr + ', acorns '
      + __sumR(teams.acorns) + ' vs ' + la + '); see docs/BOXSCORE_RUN_ATTRIBUTION.md piece two');
  }
}
```

3. **Do not touch `__bxDerive` or anything in `simHalf`.** Piece two is a
   separate change with a separate owner.

**On the warning.** This repo has named the unread-detector pattern three times —
`RECORD DRIFT`, the signup trigger's `raise warning`, and the art index switching
itself off (`GRANT_AUTHORITY.md` section 10, `PULL_POLICY.md` 1.1). Adding a
fourth detector is only defensible because this one is aimed at somebody who is
actively hunting piece two and will be watching for it. **It is a lead, not a
guard.** If piece two is not scheduled, do not add it — log nothing rather than
log into the void again.

### 9.5 Acceptance

- A completed match: the headline and the line score agree, on the two matches in
  section 2 (`46ff69f7` seed 1052721976, and `af16f852` seed 385391966) whose
  correct answers are 10–6 and 1–4.
- An in-progress render at the same seeds: the headline is UNCHANGED from today's
  behaviour, and the warning fires.
- Nothing else in the panel moves.

---

## 10. CORRECTION (2026-08-13) — §9.2 is wrong, and §9.4/§9.5 would ship the bug

Written on first builder contact. Nobody had read this document against the code
before: §9 was authored by a browser agent that located the site and could not
run anything, and the correction below is what an hour with the tree says.

**§9.2's central claim is false.** It reads: *"`line.mudcats.r` is the total for
the WHOLE GAME. So the naive swap makes an in-progress box score print the final
score."* The `line` argument is `GAME.line`, and `GAME.line` is a **running
total** that advances with `GAME.pos`:

    game/sim.js:1382   GAME.line = { mudcats:{innings:[],r:0,h:0,e:0}, acorns:{...} }
    game/sim.js:1177   function updateLinescore(ev)
    game/sim.js:1184     L[code].r += ev.runsOnPlay;      // L = GAME.line

`updateLinescore` is called from `applyEvent` as playback advances, so at any cut
`GAME.line[code].r` is the score *at that cut*. Both call sites pass it:

    game/sim.js:1544   window.__renderBoxScore(GAME.stream, GAME.line, GAME.pos)
    game/sim.js:1597   window.__renderBoxScore(GAME.stream, GAME.line, GAME.pos)

The whole-game line §9.2 is thinking of is a **different object** — the `line`
local built inside the sim generator and returned as `finalLine`
(`game/sim.js:884`, `:893`). It is never assigned to `GAME.line`.

**Consequences, in order.**

1. **§9.3 collapses.** Its argument quotes `line[code].innings[inning-1] =
   runsThisInning`, which is `:884` — the `finalLine` object, not `GAME.line`.
   `GAME.line.innings` is accumulated with `+=` per event at `:1183`. There is no
   gap to close: the correct in-progress number is already in scope and is
   already painted in the R column by `__bxLineScore` at `:1491`, two lines below
   the headline it disagrees with.
2. **§9.4's `__isFinal` branch is unnecessary.** `mr = line.mudcats.r,
   ar = line.acorns.r` is correct at *every* cut. Piece one really is the
   one-line change §5 said it was.
3. **§9.5 must change.** Its second bullet — *"an in-progress render … the
   headline is UNCHANGED from today's behaviour"* — makes the defect an
   acceptance criterion. Anyone who satisfies §9.5 as written has certified the
   bug this document exists to fix.

**And piece two is not an investigation. It is five lines, and §9.4 step 3
forbids looking at them.**

§5 sends piece two to `simHalf`; `game/sim.js:1391` says in its own comment that
the engine does not accumulate per-player stats. The defect is in `__bxDerive`:

    game/sim.js:1436   var scorers = {};   // name -> count (across whole game)
    game/sim.js:1453     for (…) { var nm = sc[s]; scorers[nm] = (scorers[nm]||0)+1; }
    game/sim.js:1458   t.order.forEach(function(idx){ var rec=t.bat[idx];
                         if(scorers[rec.name]) rec.r = scorers[rec.name]; });

Two defects in three lines. `scorers` is built in **one loop over both teams'
events**, so it is not per-team — a name that appears in both lineups accumulates
the combined count. Then `rec.r =` is an **assignment**, applied to every
batting-order slot bearing that name on **either** side, so both slots receive
the full total.

That is §3's Sandberg row exactly — a slot with 0 H and 0 BB credited with a run,
because someone *else* of that name scored — and it is why §2.3 found the offset
is not constant: it depends on how many names collide in the two lineups drawn
for that seed. `rec.rbi` at `:1448` and `oppPit.r` at `:1449` both use `+=` per
event, which is why §4 found RBI correct in the same table.

**Revised spec, replacing §9.4 and §9.5.**

1. Piece one: `var mr = line.mudcats.r, ar = line.acorns.r`. No `__isFinal`
   branch, no divergence warning — the fourth unread detector §9.4 already
   argued against is not needed once the number is right at every cut.
2. Piece two: make `scorers` per-team and accumulate rather than assign. Same
   change, same afternoon, same owner — `game/sim.js` still needs §2 sign-off.
3. **Delete step 3.** "Do not touch `__bxDerive`" fences off the only place the
   phantom credit demonstrably lives.

**Acceptance, revised.** The completed-match check in §9.5 stands as written
(`46ff69f7` → 10–6, `af16f852` → 1–4). Replace the in-progress bullet with: at a
mid-game cut the headline **equals** the R column of the line score directly
beneath it. Add: a seed whose two lineups share a player name renders that name's
run total on one team only.

**What §9 got right and should be kept.** §9.1's site quote is exact, its
"one panel reads two sources" diagnosis is the correct frame, and its instinct to
stop and spec rather than patch a game engine it could not test was the right
call. The reasoning failed on one object identity — `GAME.line` versus
`finalLine` — and everything downstream inherited it. That is worth recording as
precisely as the finding itself, per §0.2's standard: the error is legible, and
so is who made it and why.

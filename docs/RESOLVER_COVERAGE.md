# RESOLVER_COVERAGE.md — why a card ends up with no line, measured on a real binder

Status: **measured defect report, nothing fixed by this document.** Written
2026-08-12 against Nick's own account (126 cards) after the display-cleaning work
landed. Every number here is read out of the running builder or out of the MLB
Stats API, and each says which.

The short version: **name cleaning was the cause we went looking for and it is
now the smallest one.** What is left are two things nobody had named and one
decision nobody has made.

---

## 1. The measurement

`game/builder.html` prints its own coverage tally on every load. Verbatim, from
Nick's binder on 2026-08-12, after `0cc790b`:

```
[GAP1 coverage] 126 cards | rich (api+stored): 77 (fresh 11, stored 66) | flat avgToRates: 11 | no MLB line: 38
```

**38 of 126 — 30.2% — resolve to no hitting line.** The builder prints `.000 AVG
· 0 HR · 0 RBI` for those cards, and `game/sim.js` substitutes league-average
rates so the batter stays playable. The screen and the engine give two different
answers and neither is the card's real line.

### 1.1 What the 38 actually are

Classified by querying the MLB Stats API for each one — primary position, debut
year, last-played year — rather than by reading the names, because reading the
names produced a different and wrong answer first:

| cause | count | share of the 38 |
|---|---:|---:|
| **pitcher** (primary position P) | **21** | 55% |
| **card year outside the player's career** | **10** | 26% |
| ambiguous / no single match on my test | 5 | 13% |
| other | 2 | 5% |

**Dirty player names are not on this list.** They were the cause this morning.
`0cc790b` cleans the lookup key and the specimens that used to fail now resolve:
`Mookie Wilson RC` returns zero people from the MLB search as a raw string and
one as a cleaned one, and the builder logged
`[GAP2] rookie-year set Mookie Wilson RC 1981 => rookie_year 1980 id 124434`.
A card whose stored name is literally a sentence describing the back of the card
— `Andrew Benintendi R84Front view facing left, black baseball on upper left
back` — also resolved, to the right player.

### 1.2 Two classifiers, two answers, and the builder's is the one that counts

Recorded because it is instructive rather than because it changes much. My
classifier calls 5 of the 38 ambiguous; the builder's own log calls 3. The
difference is both `Jack Morris` cards: my test asks whether the name returns
exactly one person, and the builder's `pickPerson()` filters the returned list by
exact cleaned-name equality first and only reports ambiguity if more than one
survives. **The builder disambiguates better than my test does.** Its three are
the `Angels Future Stars` multi-player card, the `Seattle Mariners` team card,
and `Travis Wade`.

Note that two of those three are a team card and a multi-player card — exactly
what `PULL_POLICY.md` 1.3's playability gate removes from the pull pool. The gate
takes out two thirds of the remaining name failures as a side effect.

### 1.3 Why there is an `other` bucket: Bo Jackson, 1992

`Bo Jackson (1992)`: primary position LF, career 1986–1994. The card year is
**inside** his career, so it is not a career-year failure — and he did not play
in 1992 at all, so there is no line. **"Outside the player's career" and "played
nowhere that year" are different tests**, and only the first is cheap. Any fix
that reasons from debut and last-played dates will misfile this class.

---

## 2. The pitcher gap — three broken layers, not one

This is the largest single cause and it appears on no other list in this repo.
A pitcher card has **no path to a real line anywhere in the system.**

### 2.1 The builder never asks for pitching stats

Counted in `game/builder.html` on `main`: `group=pitching` appears **zero**
times. There is no `mlbSeasonPitching`. `mlbSeasonHitting(personId, year)` is the
only season-stats call in the file.

So `resolveCard` **identifies the player successfully** — it holds the personId,
the name lookup worked — and then asks for hitting, and only hitting, for
everybody, without ever checking what kind of player it just found.

### 2.2 The pitcher box does not cover for it

`buildTeamPayload` fills `pitcher.era`, `.w` and `.l` from `resolveCard`'s
`out.era / out.w / out.l`, and those are read from `card.stats.ERA / .W / .L` —
**the stats saved on the card row, not the API.** `js/depot-shop.js` `cardRow()`
writes no stats at all, so a pack-pulled pitcher card has no line in the batting
list *and* no line in the pitcher box.

### 2.3 The type filter exists, and it matches nothing

The card load reads:

```js
CARDS = (res.data||[]).map(rowToCard).filter(function(c){ return c.type !== 'pitching' })
```

So the builder intends to keep pitching-type cards out of the batting list. It
removed exactly zero of Nick's 126. Two reasons, both measured by parsing the
`DEPOT_META` comment out of `cards.notes` for all 126 rows:

| `meta.type` | rows |
|---|---:|
| absent entirely | 119 |
| `hitter` | 4 |
| **`pitcher`** | **3** |

1. **119 of 126 carry no type at all.** `rowToCard` defaults those to `'hitter'`:
   `type:(u.meta&&u.meta.type)||'hitter'`.
2. **The 3 that do carry one say `pitcher`, and the filter tests `pitching`.**
   `'pitcher' !== 'pitching'`, so the filter can never fire. `index.html` — the
   writer — contains the string `pitcher` eight times and `pitching` once;
   `game/builder.html` contains `pitcher` zero times and `pitching` once, in the
   filter. *Inference from string counts, not from tracing the writer to the
   reader.*

### 2.4 The shape

The hard half is built in all three layers and one obvious step is missing in
each: the lookup knows who the player is and does not ask what he does; the
pitcher box has a field for every number and no source that fills it; the filter
has the right idea and the wrong string. This is the same shape
`docs/GRANT_AUTHORITY.md` describes for onboarding — careful work with nothing
connected to it.

---

### 2.5 The two type fixes are different sizes and different owners

Worth separating, because "fix the type filter" sounds like one job:

| fix | size | owner |
|---|---|---|
| the **word** — `'pitching'` vs `'pitcher'` | one line | codespace, one-liner |
| the **pack path writing a type at all** | a column on every granted row | the server-side roll, phase 2 |

The word only helps three cards. **The 119 unmarked rows are the bigger half**,
and they are the same has-it-versus-doesn't split as stats: the add-a-card flow
populates `DEPOT_META`, the pack flow does not, and everything downstream assumes
both do. Same row, same writer, same gap — so it belongs with stats in
`docs/PULL_POLICY.md` section 4's list of what the roll must start stamping,
not in a display patch.


---

## 3. ▶ The open question the fix cannot be specced without — NICK'S CALL

**What should a pitcher's numbers mean to the simulated game?**

Fixing the lookup is straightforward: when the resolved person's primary position
is `P`, ask `group=pitching` and map ERA/W/L/IP/K/BB into whatever the sim wants.
The part that cannot be written without a ruling is what the sim *wants*. A
pitcher in the batting order and a pitcher in the pitching box are different
questions, and `game/sim.js` currently models a batter with per-PA rates
`{BB, K, HR, _2B, _3B, _1B}` and nothing else.

This is a game design question, not an implementation detail. It is recorded here
rather than decided.

## 4. ~~▶ The career-year population is a DECISION, not a defect~~ DECIDED 2026-08-12

Ten of Nick's 126 cards are printed for a year the player did not play: a 1993
`Derek Jeter` (debut 1995), a 1997 `Adrian Beltre` (debut 1998), a 2004
`Mike Rouse` (debut 2006), a 2022 `Babe Ruth`, a 2024 `Wade Boggs`, a 2020
`Carlton Fisk`, a 2020 `Lou Gehrig`. These are real cards — prospect cards,
legends inserts, retro sets — and no fix makes a line appear for the year printed
on them.

### 4.1 The rule

> **A card names the SEASON its stats come from. That season is stored on the
> card and is separate from the printed year.**

Where the two match — **116 of 126** — nothing changes and nothing is stored that
is not already implied. Where they differ, **the card declares it** rather than
the resolver guessing every time.

**Nick's reason, and it is the point of the rule: it makes legacy inserts
PLAYABLE.** A 1989 Babe Ruth becomes Ruth at his peak rather than a collectible
that cannot be fielded. The alternative on the table was marking them
collectible-but-not-fieldable, the shape `PULL_POLICY.md` 1.3 uses for team cards
and checklists, and it was rejected for that reason.

### 4.2 The default when nothing is declared

**Fall back to the player's BEST SEASON.** Automatic, and overridable per card —
the declared season wins when there is one.

- **Hitters: best by OPS.**
- **Pitchers: by ERA or WAR — UNCHOSEN.** Flagged here rather than picked,
  because it is a game-design question and because section 3's larger pitcher
  question is open anyway. Whoever answers section 3 should answer this in the
  same breath.

### 4.3 It covers both failure shapes, which are different tests

| shape | example | test |
|---|---|---|
| printed year **outside** the career entirely | Ruth 1989, Jeter 1993, Beltre 1997 | card year vs debut / last-played |
| printed year **inside** the career with no line for it | Bo Jackson 1992, the hip injury | the season query returns no splits |

Section 1.3 exists because those two are not the same test and only the first is
cheap. **The rule covers both**, because it keys on "is there a line for the
declared season" rather than on why there is not.

### 4.4 ▶ Still open: where the season lives

Three candidates, not chosen here:

- a column on `cards`,
- the `DEPOT_META` comment in `cards.notes`, where `type` already lives,
- computed at resolve time and never stored.

**Note what this joins.** `stats`, `type` and now `season` are **three gaps in
one insert path with one writer** — `js/depot-shop.js` `cardRow()` writes none of
them, and the add-a-card flow writes some. They should be filled **together**, in
the server-side roll (`docs/PULL_POLICY.md` section 4), rather than as three
separate patches to the same INSERT. Filling one of them alone is the expensive
way to do this.

---

## 5. Two findings from the same measurement, recorded here rather than scattered

Neither is about resolver coverage. Both were measured while it was, and both are
the same drift family, so they are kept together with a pointer rather than filed
in three places.

### 6.1 Three name cleaners, no shared source

| where | what it is |
|---|---|
| `js/depot-position.js` | `window.depotCleanName` — the real one, audited against 47 catalog files |
| `index.html` | `cleanPlayerName()` — **delegates** to `depotCleanName` when present, with its own fallback |
| `game/builder.html` | `pickPerson()`'s local `cleanName()` — **does not delegate** |

Three definitions of one idea, three behaviours, no shared source. This is
`PULL_POLICY.md` 1.3's drift argument — *a second definition is a second thing to
drift* — **already realised in the codebase rather than predicted.** It is the
reason `js/depot-shop-view.js`'s `cleanNm()` and `game/builder.html`'s
`bldCleanNm()` were each written as ONE module-level definition rather than a
guard inlined per call site.

**Recorded, deliberately not consolidated.** Consolidating three cleaners is a
multi-file change to working paths and it needs somebody to decide which
behaviour is the right one first.

### 6.2 Opening a page writes to the database

`game/builder.html`'s GAP2 rookie-year resolver persists `cards.rookie_year` as a
**side effect of rendering**. Observed on 2026-08-12, in Nick's account, from
nothing more than loading the builder:

```
[GAP2] rookie-year set Mookie Wilson RC 1981 => rookie_year 1980  id 124434
[GAP2] rookie-year set Darin Erstad GG 2005 => rookie_year 1996  id 113889
[GAP2] rookie-year set Andrew Benintendi R84Front view... 2018 => rookie_year 2016  id 643217
```

The values are correct and the write is owner-scoped and idempotent — it skips
rows that already have one. **The finding is not that it is wrong. It is that a
read surface writes, and nobody knew.** A resolver that persists derived values
while rendering is a thing that should be deliberate rather than discovered,
particularly on a page a player opens to look at their cards.

It also means any future rule of the form "this agent may not write to the
database" is already false in practice for anyone who opens the builder.

---

## 6. What this document does not know

- **It does not prove that a pitcher card renders empty in the pitcher box.** The
  payload branch was read and `era/w/l` traced back to `card.stats`. Nobody put a
  pitcher card in the box and looked.
- **The 21/10/5/2 split uses `primaryPosition` as the pitcher test.** A two-way
  player or a position change would be misfiled, and `Babe Ruth` is in this list.
- **The type-filter mismatch is inferred from string counts** in two files, not
  from tracing the write path that produces `meta.type` to the read path that
  consumes it.
- **Nothing here was measured on more than one binder.** 126 cards, one account,
  one day. The proportions are that binder's, not the product's.
- **The `.000` the builder prints and the league-average the engine substitutes
  were read from source and from the screen respectively**; no match was played
  to confirm what a stat-less card actually does over nine innings.

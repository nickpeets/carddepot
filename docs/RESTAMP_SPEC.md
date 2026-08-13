# RESTAMP_SPEC.md — the cache-bust stamps, and the real tag count

Status: **spec for the codespace agent.** Small, mechanical, and explicitly not a job for the browser agent — a multi-file restamp has died by hand in this repo before.

---

## 1. The real number is 91 across SEVEN files

Counted at `cd73b68`, re-counted after the vs.html fix. **One owner per fact, added 2026-08-12.** `AGENTS.md` section 6 defines the
ritual; **this document carries the census.** Neither restates the other's
numbers, and neither should: quoting the other document's count is what put two
figures in two places and left one of them stale for weeks. If you arrived here
from section 6, this table is the number. If you arrived here first, section 6
is the procedure and its amendment is the rule.

(`cafa045`'s message says "74 tags across 5 shells". That is quoted below as
evidence of what that commit did, not as a count to check this table against.)

| file | tags | stamp before this session | stamp now |
|---|---|---|---|
| `index.html` | 31 | f11c871 | f11c871 |
| `game/shop.html` | 18 | f11c871 | f11c871 |
| `game/index.html` | 12 | f11c871 | f11c871 |
| `game/builder.html` | 12 | f11c871 | f11c871 |
| `vs.html` | 9 | f920409 | **cd73b68** — fixed, PR #243 |
| `marketplace.html` | 8 | f920409 | **cd73b68** — fixed, `e486046` |
| `preview.html` | 1 | f11c871 | f11c871 |
| **total** | **91** | | |

The arithmetic that explains it: `9a30ee0` had it right and said so — "all 91 ?v= tags (index 31, shop 18, game 12, builder 12, preview 1, market 8, vs 9)". `cafa045` then restamped 31+18+12+12+1 = 74 and left `marketplace.html` (8) and `vs.html` (9) behind. 74 + 17 = 91. Two shells were missed, not one, and the message undercounted seven files as five shells.

**AGENTS.md section 6 is ALREADY CORRECTED — do not redo it.** A correction block dated 2026-08-11, written by someone other than the author of this file, is already in AGENTS.md. It carries the same 91-across-seven table and records the previous figure as 55 across five files. That half of the job is done.

### 1A. But the tree does not match the claim (recorded 2026-08-11)

That same AGENTS.md block cites `25c0bea` as having "stamped all 91 across seven files". The tree says otherwise. Census taken at `main` after the vs.html fix:

| file | tags | stamp in the tree right now |
|---|---|---|
| `index.html` | 31 | f11c871 |
| `game/shop.html` | 18 | f11c871 |
| `game/index.html` | 12 | f11c871 |
| `game/builder.html` | 12 | f11c871 |
| `vs.html` | 9 | cd73b68 |
| `marketplace.html` | 8 | **f920409** |
| `preview.html` | 1 | f11c871 |
| `js/version.js` | — | BUILD = cd73b68 |

**Three distinct stamps are live in the tree**, and `marketplace.html` is still on the oldest of them.

So the real remaining job is not simply "restamp seven files". It is: **establish whether `25c0bea` stamped all seven and was partly undone by a later merge, or never covered them.** Those are different problems. AGENTS.md 2.4 exists precisely because a landing merge once silently discarded a superset — `cc311f8`, which took `index.html` wholesale from its branch side and threw away two days of password-recovery work that had merged clean one commit earlier. That failure mode has happened here before and it is invisible on GitHub.

### 1B. RESOLVED — no merge ate anything. `cafa045` narrowed the ritual (2026-08-11)

The history question above is answered. It took one `git log` and it should not have been handed on.

**`25c0bea` did exactly what its message said.** Read at that commit, all seven files carry `?v=4d09934` and nothing else — index 31, shop 18, game 12, builder 12, preview 1, market 8, vs 9, plus the `BUILD` bump. 92 insertions, 92 deletions, eight files. The message was accurate and the AGENTS.md §6 block that cites it is accurate.

**It is also old, and several full restamps followed it.** The ritual has run repeatedly — `7a5c0b2` → f92e1ce, `86f3229` → 0df4cd3, `9a30ee0` → f920409 — each stamping all 91 across all seven.

**The regression is `cafa045`, and it is a scope regression, not a clobber.** Its own message says it: *"stamp branch tip f11c871 — 74 tags across 5 shells."* It restamped index (31), shop (18), game (12), builder (12) and preview (1) = 74, and left `marketplace.html` (8) and `vs.html` (9) sitting at f920409 from `9a30ee0`. 74 + 17 = 91. Nobody noticed the ritual had quietly shrunk from seven files to five.

So there is **no silent superset discard here**, and §2.4 is not implicated. That hypothesis is closed. The failure was simpler and more ordinary: a recurring chore ran with a smaller file list than the one before it, and its commit message honestly reported the smaller number without anyone comparing it to the previous run.

**What actually remains:** `marketplace.html` is the only file still adrift, at f920409. `vs.html` was fixed to cd73b68 by PR #243. Everything else sits at f11c871. Bring all seven and `js/version.js` to one SHA and the count back to 91.

**The lesson worth keeping is about the commit message, not the stamps.** "74 tags across 5 shells" was true and was the warning. A chore whose scope shrinks silently reports its own regression in the one place nobody diffs against the previous run. If this ritual stays manual, the acceptance check in section 4 — all seven files carrying one identical stamp — is what catches it, and it should be run as a check rather than trusted as an outcome.

---

## 2. What the stamps actually do, which is less than anyone assumed

Measured on the live site 2026-08-11, `fetch(..., {cache:'no-store'})`:

    /js/depot-redesign.js   cache-control: max-age=600   etag: W/"6a7b9082-8c4e"
    /js/version.js          cache-control: max-age=600   etag: W/"6a7b9082-280"
    /index.html             cache-control: max-age=600   etag: W/"6a7b9082-300b2"
    /vs.html                cache-control: max-age=600   etag: W/"6a7b9082-22b3"

Ten minutes, plus ETag revalidation. GitHub Pages will not let any browser hold a stale asset longer than that, and the ETag changes when the bytes change. **The `?v=` stamps cannot pin a stale asset on this host.**

That matters for scoping. Earlier in the same session the stale `vs.html` stamp was argued to be serving a pre-`8ce1346` dress layer to returning browsers. It was not, and the header is why. The restamp is a correctness-of-record fix, not a live-consequence fix. **Do not schedule it as urgent.** Schedule it because a stamp that says `f920409` on a file whose siblings say `cd73b68` is a lie in the repo, and the next agent will reason from it exactly as this one did.

It would become a real consequence the day this project moves off GitHub Pages onto a host with far-future caching. Worth knowing before that migration, not after.

---

## 3. `DEPOT_BUILD` is not inert

Five references in the repo. One sets it (`js/version.js`). The other four are all in `js/depot-game-shell.js` and all compose `?v=` **at runtime**:

    :115  link.href = '../depot-v2.css' + (window.DEPOT_BUILD ? ('?v=' + window.DEPOT_BUILD) : '');
    :132  link.href = '../css/depot-style.css' + (window.DEPOT_BUILD ? ('?v=' + window.DEPOT_BUILD) : '');
    :145  var v = window.DEPOT_BUILD ? ('?v=' + window.DEPOT_BUILD) : '';
          -> applied to ../css/depot-redesign.css and ../js/depot-redesign.js

So bumping `BUILD` cache-busts four runtime-injected assets on the game page. The static `?v=` tags in the HTML are hardcoded strings and are untouched by it. Bumping `BUILD` and restamping the HTML are two separate operations and both are needed.

`BUILD` is currently `cd73b68` (commit `68ef43d`). It had been `f11c871` for five commits, which is how the whole session started carrying a wrong constant.

---

## 4. The job

One commit, scripted, one diff to review. Do not hand-edit.

1. Pick the target SHA: the branch tip at the moment of the edit, matching the convention `cafa045` used.
2. `sed -i 's/?v=[a-f0-9]\{7\}/?v=<TARGET>/g'` across the seven files in the table above. Nothing else in the repo carries a `?v=` tag that should move — verify with `git ls-files '*.html' | xargs grep -c '?v='` before and after.
3. Bump `var BUILD='...'` in `js/version.js` to the same SHA.
4. Re-run the census and put the real per-file numbers in the commit message. If the total is not 91, something else changed and the diff needs reading before it lands.
5. ~~Correct AGENTS.md section 6.~~ **Already done** by another author — see §1A. Do not redo it.

**Scope note, because it has already been got wrong once.** "marketplace.html is the only anomalous file" and "marketplace.html is the only file to change" are different claims. Stamping it alone leaves three distinct values live — five files on f11c871, `vs.html` on cd73b68, and marketplace on whatever is current. **No single-file edit can satisfy the acceptance check, by construction.** §1B changed the diagnosis; it did not shrink the fix. All seven plus `js/version.js`, one SHA, one commit.

Acceptance: `grep -o '?v=[a-f0-9]\{7\}' <each file> | sort -u` returns exactly one value, the same value, in all seven files, and `js/version.js` agrees with it.

---

## 5. Why the browser agent did not do this

Seven files is seven single-file GitHub web edits, each with its own dialog and its own chance to swallow a click. Two dialogs failed silently during this session already — once the commit-message keystrokes went into the file body instead. The failure mode is quiet, and the value of the change is low. A scripted commit with one reviewable diff is the right shape for it.

`vs.html` was done by hand as PR #243 because at the time it was believed to have a live consequence. It did not. The diff was verified as exactly 9 additions and 9 deletions before merging, which is the standard the scripted version should also meet.
---

## 6. UPDATED 2026-08-12 — the job is now FIVE files and 74 tags

`marketplace.html` was restamped by hand in `e486046`: 8 tags, `f920409` ->
`cd73b68`, verified as 8 occurrences before, 8 after, and zero `f920409`
remaining. It was done for the same reason `vs.html` was done in #243 — one
file, one guarded replacement, a diff whose exact shape was known before the
edit, and a stranding that had already survived two restamps.

**What is left for the codespace agent:**

| file | tags | stamp |
|---|---:|---|
| `index.html` | 31 | `f11c871` |
| `game/shop.html` | 18 | `f11c871` |
| `game/index.html` | 12 | `f11c871` |
| `game/builder.html` | 12 | `f11c871` |
| `preview.html` | 1 | `f11c871` |
| **total** | **74** | all one hash, the stale one |

`vs.html` (9) and `marketplace.html` (8) are already at `cd73b68`. So the census
is now **two** values rather than three — 74 stale, 17 current. Section 4's
scope note warned that stamping `marketplace.html` alone would leave three
distinct values live; that is answered rather than ignored. It left two, and the
second is the group `js/version.js` is already on.

**Two corrections to section 4, from the `AGENTS.md` section 6 amendment of the
same day:**

1. **Step 3 is no longer part of this job.** The amendment separates the two
   values: BUILD tracks HEAD, and the stamps only have to agree **with each
   other**. Bumping `js/version.js` in the same commit is still allowed, but it
   is no longer required, and section 4's acceptance line — "and
   `js/version.js` agrees with it" — is **superseded**. Acceptance is now: every
   shell carries one identical value.
2. **Do not stamp "the seven files in the table above", or the five in the table
   here.** Stamp whatever the glob returns. Three files have now been stranded
   by three different hard-coded lists — `preview.html`, `vs.html`,
   `marketplace.html` — and this document naming five is the same mistake in a
   smaller size. The correct step 2 is `git ls-files '*.html'`, keep the ones
   containing a `?v=` tag, stamp all of them, and accept only if every file the
   glob returned carries one identical value. The table above is a description
   of today, not the scope.

**And the target is now a choice rather than a lookup.** Because the stamps no
longer have to match BUILD, the target is only "one value, everywhere." Stamping
the remaining 74 to `cd73b68` closes the split with the smallest diff. Stamping
all 91 to a fresh branch tip is equally valid and costs 17 more lines. Either
satisfies the acceptance check; neither is more correct than the other.

---

## 7. UPDATED 2026-08-13 — the census is now DISCOVERED, and today it is 102 across EIGHT

Section 6's tables were stale twice over by the time the scripted ritual ran:
game/builder.html has carried 13 tags, not 12, since 250979e added
depot-wallet.js (so the pre-merge tree was 92 across seven, not 91), and the
chapter-19 hub added play.html with 10 more. tools/restamp.sh now discovers the
scope per the section 6 amendment and refuses to accept a split; the census it
printed at landing, all stamped to one value in the same commit as this note:

  index.html 31 · game/shop.html 18 · game/builder.html 13 · game/index.html 12
  play.html 10 · vs.html 9 · marketplace.html 8 · preview.html 1 = 102, 8 shells

Every table above is a description of its own day. If you need today's number,
run tools/restamp.sh with no arguments and believe what it returns.

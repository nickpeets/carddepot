# RESTAMP_SPEC.md — the cache-bust stamps, and the real tag count

Status: **spec for the codespace agent.** Small, mechanical, and explicitly not a job for the browser agent — a multi-file restamp has died by hand in this repo before.

---

## 1. The real number is 91 across SEVEN files

Counted at `cd73b68`, re-counted after the vs.html fix. AGENTS.md section 6 says 64. `cafa045` says "74 tags across 5 shells". Both are wrong.

| file | tags | stamp before this session | stamp now |
|---|---|---|---|
| `index.html` | 31 | f11c871 | f11c871 |
| `game/shop.html` | 18 | f11c871 | f11c871 |
| `game/index.html` | 12 | f11c871 | f11c871 |
| `game/builder.html` | 12 | f11c871 | f11c871 |
| `vs.html` | 9 | f920409 | **cd73b68** — fixed, PR #243 |
| `marketplace.html` | 8 | f920409 | f920409 |
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
5. Correct AGENTS.md section 6 in the same commit or the one after.

Acceptance: `grep -o '?v=[a-f0-9]\{7\}' <each file> | sort -u` returns exactly one value, the same value, in all seven files, and `js/version.js` agrees with it.

---

## 5. Why the browser agent did not do this

Seven files is seven single-file GitHub web edits, each with its own dialog and its own chance to swallow a click. Two dialogs failed silently during this session already — once the commit-message keystrokes went into the file body instead. The failure mode is quiet, and the value of the change is low. A scripted commit with one reviewable diff is the right shape for it.

`vs.html` was done by hand as PR #243 because at the time it was believed to have a live consequence. It did not. The diff was verified as exactly 9 additions and 9 deletions before merging, which is the standard the scripted version should also meet.

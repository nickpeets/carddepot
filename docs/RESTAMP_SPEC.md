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

**Correct AGENTS.md section 6 to 91 across seven files** as part of this work.

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

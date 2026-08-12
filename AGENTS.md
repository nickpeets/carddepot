# AGENTS.md — Standing Conventions for Card Depot

Read this first, every session. It encodes hard-won rules from real incidents in this repo (most notably a family of eight phantom-reference bugs). Follow it exactly.

---

## 0. Trust nothing — verify repo state yourself

- **Never trust a handoff summary.** Prompts often say "main is at X" or "feature Y landed." They are frequently wrong or stale. Before doing anything, verify against the actual repo: current `main` HEAD, whether the files/branches in question exist, and the real contents of any file you will edit.
- Concretely: check the default branch HEAD and the file tree (GitHub API `/git/trees/main?recursive=1`), and read the raw file(s) you intend to change from `raw.githubusercontent.com` on `main` before editing. Diff your assumptions against reality and adjust.
- If the summary and reality disagree, believe reality and note the discrepancy in your report.

### 0.1 A blocked path is not an unreachable resource (added 2026-08-11)

**Before declaring a resource unavailable, enumerate the other paths to it.**

The incident: the Supabase SQL editor would not hydrate. An agent retried it fifteen times across three tabs and two reload strategies over forty minutes, then routed the entire database queue to a different agent as unreachable. The database was reachable the whole time. Nick's browser was signed in to thedepot.cards, every page on the site carries an authenticated Supabase client, and `depotSB()` from the page console runs RLS-scoped `SELECT`s and RPCs as the signed-in user. Every number that had been "tallied by eye from the Table Editor" was confirmed by real group-by within two minutes of someone thinking of it.

Worse, the same session had *already been using* three other paths to the same database — Database > Functions, Database > Indexes, Database > Policies and the Table Editor all loaded fine and returned data. The evidence that only one bundle was broken was on screen and went unread as evidence.

The rule, concretely:

1. When a path fails twice, stop retrying and **list the paths**. For this project's database that list is: the SQL editor; the Table Editor; the Database > * metadata pages; `depotSB()` from any signed-in page on the live site; and psql from a codespace.
2. Ask which of them the failure actually rules out. "The editor bundle will not load" rules out one client, not the resource.
3. Only escalate or hand off once the list is exhausted, and say which paths were tried when you do.

The generalisation beyond the database: a broken tool, a stale credential, a rate limit and a missing permission all present identically as "cannot do the thing." They have different path-lists. Enumerate before concluding.

### 0.2 The tree moves under you (added 2026-08-11)

**Another agent may be on `main` right now.** Before any whole-file web edit, fetch the file fresh and diff your intended content against what is actually there **at this moment** — not against what you read earlier in the session.

A fetch-and-replace against a stale read silently discards whatever landed in between, and GitHub will not warn you. There is no conflict, no prompt, no red text. The commit looks clean and the diff looks like your change.

This is §2.4's failure at a smaller scale, and it has already nearly happened. On 2026-08-11 an agent fetched `AGENTS.md`, edited its local copy, and committed a whole-file replacement. A §6 correction block written by a *different* author the same day happened to be present in that fetch, so it survived. Had it landed thirty seconds later it would have been erased, by a commit whose message said "no other section touched."

Practically:

1. Fetch immediately before writing, not at the start of the task.
2. Prefer anchored string replacement over whole-file replacement — assert the anchor exists and fail loudly if it does not. An anchor miss is the signal that the file moved.
3. After committing, read the landed diff and confirm it contains only your change. `git show <sha> --stat` and a count of removed lines is enough.
4. If you are making several edits to one file, re-fetch between each one.

The companion failure is the same shape from the other direction: on the same day, two GitHub commit dialogs failed to open, and on one of them the commit-message keystrokes went into the file body instead. **Whole-file web edits have quiet failure modes in both directions.** Verify the landed result, always.

### 0.3 Never commit from editor state you did not just write and just measure (added 2026-08-11)

**The GitHub web editor is a hostile surface. Treat its contents as untrusted
input, not as your own work.**

Two incidents on the same day, at opposite ends of the same failure:

1. **Stale content built in.** An agent constructed a replacement for
   `docs/GRANT_AUTHORITY.md` using an unguarded `indexOf` anchor. The anchor text
   was wrong — the file read `"a prior, not a finding"`, the search was for
   `"not a finding."` — so `indexOf` returned `-1`, `indexOf('\n', -1)` resolved
   to an early newline, and the slice **doubled the file, 12,925 to 25,272
   characters.** It was caught only because the length was logged.

2. **Foreign content appearing from nowhere.** A commit dialog on
   `docs/HANDOFF_DB_QUEUE.md` closed without committing, and the commit-message
   keystrokes landed in the file body. The editor was then holding exactly 61
   characters — a commit message — where an 11 KB handoff document had been. One
   more click would have replaced the document with one sentence, as a clean
   single-file commit on `main`, and nothing about it would have looked wrong.

Different causes, one shape: **the editor was lying about its contents, and a
length check was the only thing that caught it.** §0.2 rule 2's anchor assertion
is a symptom-level fix for the first case and does nothing for the second. This
is the mechanism-level rule.

### The detection discipline that actually worked

Reproducible, and cheap enough that there is no excuse for skipping it:

1. **Compute the expected delta independently, before opening the editor.** Build
   the new content somewhere you control, and record `before`, `after`, and
   `delta` in characters. If you cannot state the expected delta, you are not
   ready to edit.
2. **Guard every replacement, not just the first.** An unguarded `indexOf`
   returning `-1` silently produces a valid-looking index:

   ```js
   function put(str, anchor, repl){
     const i = str.indexOf(anchor);
     if (i < 0) throw new Error('ANCHOR MISS: ' + anchor.slice(0,60));
     if (str.indexOf(anchor, i+1) > -1) throw new Error('ANCHOR NOT UNIQUE');
     return str.slice(0,i) + repl + str.slice(i + anchor.length);
   }
   ```

3. **Build the content in the page from a fresh fetch, not from editor state and
   not from memory.** Fetch the file, apply the guarded replacement, then
   `selectAll` + `insertText` the result. This satisfies §0.2 rule 1 at the
   moment of writing rather than at the start of the task.
4. **Verify three ways before opening the commit dialog:**
   - **character delta** matches the number you computed in step 1, exactly;
   - **line count** — read the last real line number from the CodeMirror gutter
     (`.cm-lineNumbers .cm-gutterElement`; ignore the oversized spacer element)
     and compare it to the expected line count;
   - **last rendered line** matches the expected last line of the document.

   CodeMirror virtualizes, so `innerText` and `getSelection()` read short. A short
   readback is **not** a failure signal and must not be treated as one — that is
   why the three checks above are indirect.

**And in this editor the three-way check is really a two-way check. Added
2026-08-12.** CodeMirror 6 does not expose its `EditorView` on the DOM here —
`document.querySelector('.cm-editor').cmView` is undefined and `.cm-content`
carries only `cmTile` — so there is no way to ask the document its own length
before committing. **Character delta cannot be verified pre-commit.** Do not
write a check that pretends it can. What actually works, and what was used for
`fe9c853`, `400c599` and `26b7fc7`:

- **Before the commit:** line count read from the gutter — ignore the oversized
  spacer, which renders as `999` — plus the last rendered line, both compared to
  numbers computed from the fresh fetch.
- **After the commit:** exact character length from the contents API **and** a
  byte-equality check of the landed body against the string you built. Equality
  is strictly stronger than a length match and costs nothing, because the string
  is still in the page.

Note what that trade means: the strongest check now runs **after** the write, so
it detects rather than prevents. A corrupted body lands and is then caught.

**One caveat on the byte check, from its first outing.** If the edit appends to
the end of the file, preserve the trailing newline the file already had. Drop it
and your expected length is short by exactly one, the editor silently puts it
back, and the equality check fails on a difference that does not matter.
Observed on `4141c90`: expected 37,090, landed 37,091, and the whole difference
was a final `\n`. Expect the off-by-one before concluding something went wrong.
5. **Set the commit message and description with a native value setter, never by
   typing.** Typing into that dialog is the corruption mechanism in incident 2:

   ```js
   const setter = Object.getOwnPropertyDescriptor(
     window.HTMLInputElement.prototype, 'value').set;
   setter.call(el, val);
   el.dispatchEvent(new Event('input', {bubbles:true}));
   ```

6. **If the editor holds anything you did not just put there, discard it.** Do not
   repair it. Reload the edit page and start from step 1. Repairing corrupted
   editor state is how corrupted state gets committed.

### Verify the landed commit from the contents API, not from raw

`raw.githubusercontent.com` served the **pre-commit** body of a file for at least
a minute after the commit was live and visible in the commits list. Verifying a
commit from `raw` can therefore show you the old file and tell you nothing.

Use the contents API, which is not behind that cache:

```js
const j = await (await fetch(
  'https://api.github.com/repos/<owner>/<repo>/contents/<path>?ref=main')).json();
const text = decodeURIComponent(escape(atob(j.content.replace(/\n/g,''))));
```

Then check three things on the landed result: the **additions/deletions counts**
from the commit API (`deletions: 0` is what "additive" means, per §0.2 rule 3),
the **character length** against your expected `after`, and an **occurrence count
of a unique marker** — your new heading, the document H1, and the anchor you
replaced should each appear exactly once. Duplication is the failure mode that
looks most like success.

**Correction 2026-08-12: the contents API is cached too, and a NEGATIVE read
from it cannot be trusted.** Measured, not inferred. Three and a half seconds
after a confirmed commit (`400c599`), the commits API already reported
`+46/-0` while the contents API returned the **pre-commit** body — 9,388
characters where 11,834 were expected, with the new heading absent. A second
read 2.5 seconds later, with a cache-busting query parameter, returned 11,834
and a byte-exact match.

So:

- A **positive** result from the contents API can be believed. It will not
  invent your content.
- A **negative** cannot. Before concluding that a commit failed or landed wrong,
  **read a second time with a cache-buster**, and check the commits API, which
  was correct immediately in both observations.

Believing a first negative is how this ends badly: "the commit did not land"
leads to re-editing a file that is already correct, which is the opening move of
the doubling incident this section exists to prevent.

### Operational notes on this editor

- **Most commits need the "Commit changes…" button clicked twice** before the
  dialog opens. This is not a diagnosis, it is a documented workaround.
- **The dialog is not a `<dialog open>` element** — `querySelector('dialog[open]')`
  returns `null` while it is plainly on screen. Find its fields by id
  (`#commit-message-input`, `#commit-description-input`) instead of by walking
  down from a dialog root.
- **The commit dialog autofills itself, asynchronously, and it will overwrite
  you.** Added 2026-08-12. GitHub generates a commit message and description a
  second or two after the dialog opens, and that generated text lands *after* a
  native-setter write and silently replaces it. Observed: a message set to
  `docs(onboarding): 4 - gate 2 restated structurally` read back as
  `Clarify Gate 2 playability requirements for cards`. Rule 5's native setter is
  necessary and not sufficient — **set, wait, read back, and re-set until it
  sticks**, then assert the message one final time in the same call that clicks
  commit.
- **`raw.githubusercontent.com` serves a CSP that blocks `fetch` outright.** All
  in-page scripting — the fresh fetch, the guarded replacement, the contents-API
  verification — must run from a `github.com` origin. The same script that works
  on a repo or edit page fails on a raw page with no useful error.

---

### 0.4 Before recording a measurement, find out which document already owns it (added 2026-08-12)

A correction was written into §6 recording a live cache-stamp census and the fact
that `DEPOT_BUILD` is not inert. **Both were already in
`docs/RESTAMP_SPEC.md`**, which had been tracking the same census for a day and
was more current than §6 was. The correction said "not recorded here before",
which is true of *this* file and was accurate by luck rather than by diligence —
the other document had not been read.

The rule is one line: **before recording a measurement, check whether another
document already owns it.** If one does, point at it and add nothing. If none
does, say so, and you have just made yourself the owner.

This is a *different* failure from the stale-list problem §6's amendment fixes.
That one is about a list of filenames going out of date. This one is about a
fact with two homes, where nothing points either home at the other and only one
of them gets updated. Two documents holding the same number is cheaper to
prevent than to adjudicate.

Current ownership, offered as an example rather than as a registry to maintain:
`AGENTS.md` §6 owns the cache-bust **ritual**; `docs/RESTAMP_SPEC.md` owns the
**census**.

---

## 1. Git rules

- **Explicit staging.** Stage only the files you intend to change. Never blanket-commit; never sweep unrelated working-tree changes into a commit.
- **Merge commits, always `--no-ff`.** Every branch lands on `main` via a real merge commit (`Merge pull request #N ...`), never a fast-forward, squash, or rebase-merge. History must show the branch topology.
- **Keep branches.** Do **not** delete branches after merge. They are the audit trail and are cheap. (On the GitHub PR "merged" screen, do not click "Delete branch".)
- **One concern per branch/PR.** Doc edits, version bumps, fail-loud logging, and the depot-core refactor are separate branches.
- **Additive-first.** Prefer adding files/lines over rewriting working paths. When you must touch a working path, isolate the change and verify live before merging.

---

## 2. Merge policy

- **Self-merge is allowed for low-risk, additive changes**: docs (`DESIGN.md`, `AGENTS.md`), `mockups/`, `js/version.js` bumps, and fail-loud **logging-only** additions that don't change control flow.
- **Pause and get explicit human sign-off before merging** anything that:
  - alters a **schema / DDL** (tables, columns, indexes, RLS policies),
  - can cause **data loss** (deletes, truncations, destructive migrations, overwriting user rows),
  - is a **non-additive change to a working path** (index.html / game/index.html / game/builder.html / season.js behavior, auth, the sim, or the season writeback).
- For working-path changes that are permitted, **live-verify every affected page first** (see §5) and only then merge with a merge commit.

### 2.4 The per-hunk superset gate (LAW — added after the cc311f8 incident)

**Blanket `--ours` and blanket `--theirs` are banned.** So is any whole-file
resolution (`git checkout --ours <file>`, "take the branch copy", accepting a
web-UI "use this version" button) on a file both sides have edited.

When merging `main` into a stale branch — or landing a stale branch onto `main` —
classify **every conflict hunk** into exactly one of four buckets, and record the
classification in the merge commit body:

| bucket | test | resolution |
|---|---|---|
| **EQUAL** | both sides identical once `?v=<sha>` stamps are normalized out | take either; note it is stamp-only |
| **OURS-SUPERSET** | our side contains everything theirs does, plus more | take **ours** |
| **THEIRS-SUPERSET** | their side contains everything ours does, plus more | take **theirs** |
| **TRUE-CONFLICT** | neither contains the other | **stop** — resolve by hand, line by line, and say so in the merge body |

Take the superset side **per hunk**. Never per file. A file is not a unit of
intent; a hunk is.

**The incident.** `cc311f8` (the #236 landing merge) took `index.html` wholesale
from its branch side. The branch had already merged `main` into itself and
resolved that file to its own older copy, so the landing merge was faithful
transport of an already-reverted tree — it looked innocent on GitHub, and nothing
flagged it. It silently discarded `main`'s superset, including all of PR #235's
password-recovery and sign-up work, which had merged clean one commit earlier at
`29ca202`. The feature was gone from production for two days and a real user was
handed a dead password-reset link. Recovery took PR #241 plus a follow-up
(#242) for the redesign layer.

**The tell, and how to check for it before you merge.** If a merge claims to
resolve a file and

    git diff <branch-side-parent> <merge-commit> -- <file>

is **EMPTY**, that merge took the file wholesale from the branch. On a file
`main` also advanced, that is the cc311f8 signature. Run it on every conflicted
file before pushing the merge; an empty diff is a stop condition, not a green
light.


---

## 3. Architecture map

**Pages (three real, working HTML entry points):**
- `index.html` — **The Depot / binder** (root). Collection view, era filters, By Set, auth chrome, and the Season overlay (`SeasonView`/`SeasonRecord`/...). Loads `game/season.js`.
- `game/builder.html` — **Lineup Builder**. Assembles batting order + pitcher; owns `buildTeamPayload`. Loads `season.js`.
- `game/index.html` — **Play Ball / the game**. RBI-style sim + in-game HUD. Loads `sim.js`, `billboards.js`, `season.js`.

**Shared logic:**
- `game/season.js` — season-mode logic module (fixed 8-game run, AI opponent, accumulating record). Reused across pages via the matches pipeline. Exposes `SB()` / `UID()` helpers.
- `game/sim.js`, `game/billboards.js` — game internals.

**Mockups (static, non-shipping):**
- `mockups/` — design continuity mockups (hardcoded content, `depot-style.css`). Not wired to live data. Safe to touch freely; never a "working path."

**Data / backend (Supabase):**
- Tables: `seasons`, `season_games`, `franchises` (plus card data under `data/*.json`).
  - **Catalog ↔ prestige shape:** catalog rows (`data/cards-*.json`) carry `.player`; the prestige engine (`depot-prestige.js`) reads `.name`. Adapt via the engine’s mapper `catalogCardToPrestigeShape()` (in `depot-shop.js`) — any future consumer (pack rip, shared library, league draft) MUST route catalog rows through it.
- **RLS**: row ownership is enforced by an owner column — `owner_id` (matches `auth.uid()`). Any query/insert into owned tables must set/scope `owner_id` or it will be silently rejected by RLS. Treat a "0 rows affected" writeback as a **bug to log**, not a no-op (see §4).

**Client bootstrap (the recurring hazard):**
- Each page historically created its **own** Supabase client inside an IIFE, plus ad-hoc `window.sb` / `DEPOT_USER` / `buildTeamPayload` mirrors. Because the clients/globals were IIFE-scoped, references from another scope (e.g. `season.js` calling a bare `sb` or `buildTeamPayload`) resolved to `undefined` at call time — the **phantom-reference** bug class (latest: bare `sb` PR #38, bare `buildTeamPayload` PR #39). The fix is `js/depot-core.js`: one client + cached user, exposed as `window.depotSB()` / `window.depotUser()`, loaded first by all three pages, with `season.js` delegating to it. **Never introduce a new per-page client or a bare global mirror.** Route through depot-core.

---

### Data-path rule (anchor fetches to the script URL, never page-relative)

Any module that fetches repo data (`data/*.json`, tier tables, catalogs) MUST anchor its
paths to its OWN script URL via the `_dataURL` pattern (`new URL('../data/' + f,
document.currentScript.src)`), NEVER page-relative. Page-relative paths break the moment a
second page at a different depth mounts the module. This has now bitten TWICE: depth-down
(PR #108, prestige tables 404ing from `game/`) and depth-up (the shop catalog 404ing from
the root binder tab). Two instances of the same class is a convention.

---

## 4. Fail-loud rule (no silent guards)

Silent `if (!x) return;` guards are banned in the season/game/builder paths. They are how the phantom-reference bugs hid for so long — a missing client or user just bailed with no trace.

- **Every guard must log why it bailed**, then return. Example:
```js
if (!sb) { console.warn('[depot] season writeback skipped: no supabase client'); return; }
if (!uid) { console.warn('[season] no user id at attach; bailing'); return; }
```
- Use tag prefixes so logs are greppable: **`[depot]`** for client/auth/bootstrap, **`[season]`** for season-mode logic.
- Log the **reason and the missing value's name**, not just "return." A bail on a writeback (attach/record/seasons) must state which one and why (e.g. null client, null uid, RLS 0-rows).
- Applies to new code and to any silent guard you touch. Do not add a silent guard, ever.

- **Canonical incident — read-then-write is NOT idempotency, and the uniqueness key must match the idempotency UNIT (the pack), not the row.** Nick's bronze pack (seed `1335568119`) was granted TWICE. The client's guard was: `SELECT` cards for the seed → if count `< N`, `INSERT`. Two concurrent `INITIAL_SESSION` auth events fired at the same millisecond; both read zero, both inserted → ten cards instead of five. A read-then-write check *cannot* dedupe a race — the read is stale the instant another writer commits. The **first fix attempt was itself wrong**: a unique index on `cards(collection_id, pack_seed)` can never coexist with a 5-card pack, because those five rows legitimately share one seed — the constraint would reject cards 2–5 of a valid pack. The lesson's second half: **the unique key must be at the granularity of the thing you're deduping.** The idempotency unit is the PACK, so the gate is a separate `public.pack_grants` ledger with one row per pack, unique on `(collection_id, pack_seed)` (see `db/proposals/pack_seed_idempotency.sql`). Redemption inserts the grant row FIRST; a Postgres `23505` there means "pack already granted" → clean no-op, insert no cards. The cards keep a non-unique `pack_seed` for provenance. A window-scoped in-flight latch is the belt; the ledger constraint is the suspenders. If you ever write "check, then act" on money or grants, stop — push the invariant into the DB, at the right unit.

---

## 5. Deploy rules (GitHub Pages)

Pages deploys are flaky **server-side** in this repo — builds sometimes queue for a long time or fail with "try again later." Treat deploy as a step that must be **verified**, not assumed.

- **After every merge, verify the live build actually updated before declaring done.** The mechanism: `js/version.js` logs `[depot] build <hash>` on load. Load the live page, read the console, and confirm `<hash>` matches the just-merged commit short-hash. Only then is the work "done."
- **Every merge bumps `js/version.js`** to the new deployed commit short-hash. That is what makes the live-build check meaningful.
- **If Pages flakes** — a failed/"try again later" build, or a build still queued after **~15 minutes** — push an **additive** bump to `REDEPLOY.md` (a no-op marker change) to trigger a fresh Pages deploy. Repeat if needed. Never force a non-additive change just to poke the deployer.
- **Direct terminal git push to `main` does NOT trigger a Pages build.** The legacy `pages-build-deployment` workflow only fires on **web-UI commits** and **PR merges done via the web UI**. If you push from a terminal/Codespace, the live build will silently stay stale — either open+merge a PR in the web UI, or land a small web-UI commit (e.g. a REDEPLOY.md nudge or the `js/version.js` bump) to fire the deploy. In practice the web-editor `js/version.js` bump you already do after each merge doubles as that deploy trigger. Always live-verify `js/version.js` afterward.
- Do not report a task complete on the basis of a green merge alone. Green merge + verified live `[depot] build <hash>` = done.

---

## 6. Quick checklist per session

1. Verify `main` HEAD + file/branch reality (don't trust the summary).
2. Branch per concern; explicit staging.
3. Working-path change? Live-verify each affected page first (load, auth chrome, card fetch, and — if season is touched — one full season game writes back and the record ticks).
4. Schema / data-loss / non-additive working-path change? **Pause for sign-off.**
5. Merge with a `--no-ff` merge commit; **keep the branch**.
6. Bump `js/version.js`; after merge, confirm live `[depot] build <hash>` matches.

**BRANCH-TIP LABEL (supersedes the multi-file post-merge bump):** Put the label INSIDE the fix branch. Commit `js/version.js` BUILD + ALL `?v=` query strings on the branch itself (a plain terminal commit is fine), using the BRANCH TIP SHA as the label (known at commit time). Then the web-UI `--no-ff` merge is itself the web-UI action that fires the Pages deploy — one merge, one deploy, label and queries atomic by construction, with NO post-merge bump commit and NO multi-file web commit. Label semantics = feature-tip hash (not merge hash), which is fine and honest. This permanently eliminates both the label-drift bug and the OAuth/multi-file-web-commit problem. Label convention, **AMENDED 2026-08-12 — see the amendment at the end of this
section**: BUILD tracks **HEAD**, docs-only commits included. It answers one
question — *what is deployed* — and it must never be knowingly stale. (The
superseded convention was BUILD = the last SUBSTANTIVE code/asset commit, on the
reasoning that a docs-only commit does not change deployed asset hashes. It does
not — but a label that lies about what is live costs more than a label that
moves for nothing.) A label commit still cannot contain its own hash, so the
branch-tip mechanic above is unchanged.

**CACHE-BUST RITUAL (atomic, added after the pack-redemption incident):** Every deploy bump updates `js/version.js` AND the `?v=<hash>` cache-bust query strings on every `js/*.js` and `css/*.css` include across ALL shells — **enumerated, never named**; see the amendment at the end of this section — together, in the SAME merge/bump. A `?v=` that drifts from the deployed build silently recreates the stranded-cache bug: clients keep serving old bundles even after a green deploy. This bit us on the pack-redemption deploy (`0fc08af` shipped; Nick's browser ran `55f832a`, so the new `redeemPending` never loaded and his paid pack silently no-opped). The include tags carry no cache-busting otherwise, and GitHub Pages caches `js`/`css`. Ritual: in the web-editor bump commit, find-and-replace the OLD `?v=<oldhash>` with the NEW `<newhash>` across all five HTML files in one multi-file commit, and set `js/version.js` BUILD to the same hash. The stamps must agree **with each other** — every shell carries one identical
value. **BUILD and the stamps are allowed to differ**, and routinely will; see
the amendment at the end of this section. The CDN Supabase `<script>` is left unversioned on purpose.
7. Report: files, commit hashes, and the live-verified build hash.

## 7. Known tooling notes

- **`game/index.html` embeds base64 card art** (and every page embeds Supabase
  URL/anon-key constants). Reading these files wholesale can trip content/secret
  filters and truncate tooling output. **Edit surgically:** target the specific
  lines/regions, mask keys before logging, and prefer an editor's document API over
  dumping the whole file. Never paste Supabase keys into logs, issues, URLs, or chat.

## 8. Depot-core cutover

`js/depot-core.js` provides ONE shared Supabase client + cached user behind a stable global API (`window.depotSB()` sync, `window.depotUser()` async, `window.depotUserCached` sync). It is loaded FIRST (after `version.js`) by all three pages, and each page sets `window.DEPOT_SUPABASE_CONFIG = { url, key }` from its own in-scope `SUPABASE_URL` / `SUPABASE_KEY` constants (public anon key). `season.js` `SB()`/`UID()` now try depot-core first (`depotSB()` / `depotUserCached`) with every existing fallback (`depotSB`, `window.sb`, `DEPOT_USER`) kept intact beneath.

This is phase 1 (additive) only. Nothing has been removed: the per-page `createClient` clients and the `window.sb` / `DEPOT_USER` / `buildTeamPayload` mirrors are all still in place.

**Migration rule for future sessions:** cut over ONE page at a time to depot-core-only. For each page, remove that page's own `createClient` and its ad-hoc `window.sb` / `DEPOT_USER` / `buildTeamPayload` mirror, route everything through `depotSB()` / `depotUser()`, and LIVE-VERIFY that page (page loads, auth chrome renders, card fetch works, and a full season game writes back with the record ticking past 1-0) BEFORE moving to the next page. Do not batch multiple pages in one cutover.

**New-page config rule (earned its bullet):** every NEW page that loads `depot-core.js` MUST set `window.DEPOT_SUPABASE_CONFIG` in an inline script BEFORE the shell loads -- mirror the config block from `game/builder.html`. Symptom of forgetting: `depotSB()` returns null, anonymous shell, `— DD` balance (never renders the signed-in amount), and features misdiagnosing as offline. This is the second new-page config miss (game/shop.html in fix/shop-supabase-config; the depot-core rollout hit the ordering version of it).

The per-page clients and the `window.sb` / `DEPOT_USER` / `buildTeamPayload` mirrors are removed ONLY after all three pages have been individually cut over and live-verified. Until then they remain as the fallback path.

## 9. Game page runtime bundle (game/index.html)

Session 5/6 lesson. `game/index.html` is a runtime React bundle with destructive load behavior. Static asset includes and cached DOM references do not survive it:

- **Clears `<body>` on mount** — anything mounted at `DOMContentLoaded` is wiped.
- **Strips static `<link>` and `<script>` tags** from the document — static asset includes do not survive; stylesheets must be injected at runtime.
- **Replaces the entire `<html>` element** — any cached `document.documentElement` reference goes stale and writes hit an orphaned node. Never cache `documentElement`; read it fresh on every access (see the `html()` helper in `js/depot-game-shell.js`).
- **Resets the `<html>` class after mount** — scope classes like `.depot-game` must be re-asserted (observer + interval pattern).

Rule: any chrome/shell/style work on the game page must go through `js/depot-game-shell.js`'s runtime-injection + fresh-read + re-assert pattern. Never assume static assets or cached DOM references survive on this page. Mount waits for the game UI to exist (MutationObserver + interval, fail-loud 20s watchdog).

> **§6 correction (2026-07-28).** The shell list above said four files for a long time and left out `preview.html`, which carries one `?v=` tag of its own. Because it was not on the list it was not stamped, and it sat at `4af61d3` while the other 54 tags moved on -- a stranded cache of exactly the kind this ritual exists to prevent. It was picked up incidentally by the stats-provenance branch (#181) and is current again.
>
> Do not trust any hard-coded count, including this one. **Count the tags fresh at your branch tip** before stamping -- `git ls-files -z '*.html'` and match `?v=`, do not assume the file list. If your count disagrees, believe your count and update this line.
>
> **§6 correction (2026-08-11).** The count recorded here was **55 across five
> files** and the ritual paragraph above still names only five shells. Both are
> stale, and in the same direction as the 2026-07-28 miss. Counted fresh at
> `9526744`, the real figure is **91 tags across SEVEN files**:
>
> | file | tags |
> |---|---|
> | `index.html` | 31 |
> | `game/shop.html` | 18 |
> | `game/index.html` | 12 |
> | `game/builder.html` | 12 |
> | `marketplace.html` | 8 |
> | `vs.html` | 9 |
> | `preview.html` | 1 |
> | **total** | **91** |
>
> `marketplace.html` and `vs.html` carry 17 tags between them and appear on **no**
> shell list in this document, which is precisely the condition that stranded
> `preview.html` at `4af61d3`. Stamping practice is already ahead of the doc --
> `25c0bea` stamped all 91 across seven files -- so treat **seven files** as the
> ritual's scope and this table as the current count.
>
> **§6 correction (2026-08-12): the tags are not all on one hash, and this
> section's two rules cannot both hold.** Counted fresh at `0673b6c`, as the
> paragraph above instructs. The 91-across-seven figure is right. The unstated
> assumption underneath it — that they are all stamped the same — is not:
>
> | file | tags | stamp |
> |---|---:|---|
> | `index.html` | 31 | `f11c871` |
> | `game/shop.html` | 18 | `f11c871` |
> | `game/index.html` | 12 | `f11c871` |
> | `game/builder.html` | 12 | `f11c871` |
> | `preview.html` | 1 | `f11c871` |
> | `vs.html` | 9 | `cd73b68` |
> | `marketplace.html` | 8 | `f920409` |
> | **total** | **91** | **three hashes** |
>
> `js/version.js` BUILD is `cd73b68`. Live on thedepot.cards the same day,
> `window.DEPOT_BUILD` read `cd73b68` against 31 tags at `f11c871` on the binder.
>
> **`marketplace.html` is stranded, and it is `preview.html` happening again.**
> Its eight tags have sat at `f920409` since 2026-08-10 while everything else
> moved twice. `cafa045` stamped "74 tags across 5 shells" — exactly the 74 now
> at `f11c871` — and #243 restamped `vs.html` alone. `marketplace.html` was on
> neither list. Second file stranded by a hard-coded shell list, which is what
> the 2026-07-28 correction predicted would keep happening.
>
> **The rule conflict.** This section says BUILD is the last **substantive**
> commit, and separately says never let `?v=` and `version.js` diverge.
> `68ef43d` (2026-08-11) moved BUILD from `f11c871` to `cd73b68` **alone**, and
> its message states the reason: the marker was five commits stale and "has been
> misleading every diagnosis that read it." But `cd73b68` is docs-only, so under
> the substantive rule it should not have moved the label at all — and under a
> BUILD-tracks-HEAD practice every docs commit reopens the divergence the other
> rule bans. The rest of the history is consistent the other way: earlier bumps
> read "stamp BUILD + all 91 tags to substantive `<sha>`" and moved both
> together. **`68ef43d` is the outlier, and it was deliberate.**
>
> Also from that commit, and not recorded here before: **`DEPOT_BUILD` is not
> inert.** `js/depot-game-shell.js` composes cache-bust query strings from it at
> runtime for four assets on the game page, so moving BUILD alone does bust
> cache — for those four and only those four.
>
> **Left open deliberately:** which rule wins. BUILD tracks HEAD and the
> never-diverge rule narrows to the stamps alone; or BUILD stays substantive and
> a knowingly stale marker is accepted. Both are defensible, and choosing is not
> a correction's job. What is **not** open: `marketplace.html` is two days stale
> on any reading. And any session that read the build marker as "what is live"
> before `68ef43d` was reading one that was five commits stale, by that commit's
> own account.

---

### §6 AMENDMENT (2026-08-12) — the label rule, the stamp rule, and the end of the shell list

Three changes, all falling out of the census in the correction block above.

**1. BUILD tracks HEAD, docs-only commits included.** It answers one question —
*what is deployed* — and it must never be knowingly stale. `68ef43d` moved BUILD
alone for exactly this reason and its message is the argument: the marker had
been five commits behind and "has been misleading every diagnosis that read it."
That commit stops being the outlier and becomes the precedent.

**2. The never-diverge rule narrows: the stamps must agree with EACH OTHER.**
The invariant that matters is that every shell carries one identical `?v=`
value, because a split census is what strands files. **BUILD and the stamps are
allowed to differ, and routinely will.** That sentence is the point of this
amendment. Without it the next agent measures the difference, reports it as a
defect, and this gets rewritten again — which is how it got written the first
time.

**3. Enumerate the shells. Never name them.** Three files have now been stranded
by three different hard-coded lists: `preview.html` (2026-07-28), `vs.html`
(missed by `cafa045`, restamped by #243), and `marketplace.html` (missed by
both). A list that has to be maintained is a list that will be wrong, and this
document has now been wrong three times in the same way **while containing a
correction saying it would keep happening.** Another correction is not the fix.

So the ritual's scope is **discovered, not declared**:

1. Glob every `*.html` in the tree — `git ls-files -z '*.html'` — excluding
   `mockups/`.
2. Keep the ones containing a `?v=` query string. **Those are the shells**, by
   definition, whatever they are called and however many there are.
3. Stamp all of them, in the same commit.
4. **Acceptance check: every shell the glob returned carries one identical
   value.** Not "these seven agree" — *every file found* agrees. If the count
   disagrees with any number written in this document, believe the count and
   correct the document.

**And BUILD is not inert, which is why change 1 is not free.**
`js/depot-game-shell.js` composes cache-bust query strings from `DEPOT_BUILD` at
runtime for four assets on the game page — `depot-v2.css`, `css/depot-style.css`,
`css/depot-redesign.css`, `js/depot-redesign.js`. Moving BUILD alone **does**
bust cache, for those four and only those four. Recorded so that nobody moves
the label believing it is a comment.

**Where the numbers live.** This section owns the **ritual**.
`docs/RESTAMP_SPEC.md` owns the **census** — the per-file tag counts and their
current stamps. Neither restates the other's numbers, deliberately; see §0.4 for
why. If you need a count, go there. If you need the procedure, it is here.

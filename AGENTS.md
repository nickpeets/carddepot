# AGENTS.md — Standing Conventions for Card Depot

Read this first, every session. It encodes hard-won rules from real incidents in this repo (most notably a family of eight phantom-reference bugs). Follow it exactly.

---

## 0. Trust nothing — verify repo state yourself

- **Never trust a handoff summary.** Prompts often say "main is at X" or "feature Y landed." They are frequently wrong or stale. Before doing anything, verify against the actual repo: current `main` HEAD, whether the files/branches in question exist, and the real contents of any file you will edit.
- Concretely: check the default branch HEAD and the file tree (GitHub API `/git/trees/main?recursive=1`), and read the raw file(s) you intend to change from `raw.githubusercontent.com` on `main` before editing. Diff your assumptions against reality and adjust.
- If the summary and reality disagree, believe reality and note the discrepancy in your report.

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
- **RLS**: row ownership is enforced by an owner column — `owner_id` (matches `auth.uid()`). Any query/insert into owned tables must set/scope `owner_id` or it will be silently rejected by RLS. Treat a "0 rows affected" writeback as a **bug to log**, not a no-op (see §4).

**Client bootstrap (the recurring hazard):**
- Each page historically created its **own** Supabase client inside an IIFE, plus ad-hoc `window.sb` / `DEPOT_USER` / `buildTeamPayload` mirrors. Because the clients/globals were IIFE-scoped, references from another scope (e.g. `season.js` calling a bare `sb` or `buildTeamPayload`) resolved to `undefined` at call time — the **phantom-reference** bug class (latest: bare `sb` PR #38, bare `buildTeamPayload` PR #39). The fix is `js/depot-core.js`: one client + cached user, exposed as `window.depotSB()` / `window.depotUser()`, loaded first by all three pages, with `season.js` delegating to it. **Never introduce a new per-page client or a bare global mirror.** Route through depot-core.

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

The per-page clients and the `window.sb` / `DEPOT_USER` / `buildTeamPayload` mirrors are removed ONLY after all three pages have been individually cut over and live-verified. Until then they remain as the fallback path.

## 9. Game page runtime bundle (game/index.html)

Session 5/6 lesson. `game/index.html` is a runtime React bundle with destructive load behavior. Static asset includes and cached DOM references do not survive it:

- **Clears `<body>` on mount** — anything mounted at `DOMContentLoaded` is wiped.
- **Strips static `<link>` and `<script>` tags** from the document — static asset includes do not survive; stylesheets must be injected at runtime.
- **Replaces the entire `<html>` element** — any cached `document.documentElement` reference goes stale and writes hit an orphaned node. Never cache `documentElement`; read it fresh on every access (see the `html()` helper in `js/depot-game-shell.js`).
- **Resets the `<html>` class after mount** — scope classes like `.depot-game` must be re-asserted (observer + interval pattern).

Rule: any chrome/shell/style work on the game page must go through `js/depot-game-shell.js`'s runtime-injection + fresh-read + re-assert pattern. Never assume static assets or cached DOM references survive on this page. Mount waits for the game UI to exist (MutationObserver + interval, fail-loud 20s watchdog).

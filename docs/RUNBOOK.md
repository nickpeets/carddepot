# RUNBOOK.md — How This Repo Is Operated

**Status: operational reference. Descriptive, not a new rule set.** Where this doc and `AGENTS.md` disagree about a *convention*, AGENTS.md wins and this doc is wrong — fix it here. Everything else below is the operating knowledge that has, until now, lived only in chat history and agent memory, so every fresh session has paid a recovery tax to rediscover it.

**How to read the tags.** Every claim is marked:

* **[repo]** — verifiable in this repository right now, at the cited path. Go look.
* **[practice]** — learned in session, true, and written down here for the first time because there is nowhere else to cite it.

**Verified state at authoring (AGENTS.md §0 — verified, not assumed):**

| Fact | Value | How checked |
|---|---|---|
| `main` HEAD | `13d1e83` — "Merge pull request #203 from nickpeets/docs/design-updates" | commits API, `sha=main` |
| `js/version.js` BUILD | `7eb4b0d` | contents API at `ref=main` |
| Cache-bust tags on main | **64**, all at `7eb4b0d` | counted fresh: index.html 25 · game/shop.html 18 · game/index.html 10 · game/builder.html 10 · preview.html 1 |
| Branches | 260, none deleted | branches API, 3 pages |

Label and query strings agree, which is the state §6 exists to hold.

---

## 1. THE LANES

Three agent lanes run against this one repo, sometimes at the same time. They do not share files. The session handles are cosmetic; the **touch set** is the contract.

| Lane | Handle | Branch prefixes | Owns | Never touches | §6 obligation |
|---|---|---|---|---|---|
| **Repo Agent** | verbose zebra | `feat/` `fix/` `chore/` | app code: the shells, `js/`, `game/`, `css/` | the library bucket + ingest pipeline; other lanes' branches | **Full.** Bumps `js/version.js`, stamps every tag, live-verifies |
| **Library Agent** | fuzzy fortnight | `library/` | the `card-library` bucket, `card_library` + contributions tables, the ingest pipeline, art-key data artifacts | app code, shells, `js/*.js`, `js/version.js` | **None.** Ships no browser assets |
| **Docs Agent** | — | `docs/` | `*.md` only | code, schema, assets, stamps | **None.** No restamp, ever |

### 1.1 Repo Agent (verbose zebra)

The only lane that changes what a browser downloads, and therefore the only lane that carries the full §5/§6 deploy discipline: stamp at the branch tip, merge via the web UI so Pages actually builds, then read the live console and confirm `[depot] build <hash>` matches. **[repo]** AGENTS.md §5, §6.

May touch: `index.html`, `game/shop.html`, `game/index.html`, `game/builder.html`, `preview.html`, everything under `js/`, `game/`, `css/`. Must route all Supabase access through `js/depot-core.js` — never a new per-page client, never a bare global mirror **[repo]** AGENTS.md §3, §8.

Never touches: the ingest pipeline or bucket policy (that is the Library lane, and it is service-role work); `design/*.md` beyond adding a link.

### 1.2 Library Agent (fuzzy fortnight)

Corpus work: parse, resize, upload, manifest, report. Runs where the bandwidth and CPU are, never in the browser **[repo]** `LIBRARY_PHASE0.md` §4.

May touch: the `card-library` bucket and its metadata tables, ingest scripts, the art-key data artifacts it emits, and its own corpus docs (`LIBRARY_PHASE0.md`, the manifest ledger).

Never touches: app code, the five shells, `js/version.js`, or a `?v=` tag. New art changes what the app *renders* but not what it *downloads*, so there is nothing to bust. Its deliverable is data plus a review report, and unmappable files are written to a report, never silently dropped **[repo]** `LIBRARY_PHASE0.md` §4.4.

One caveat that is easy to miss: a Library run **can** move the economy without touching a line of code, because the pack pool is filtered to art-backed rows. See §5.6.

### 1.3 Docs Agent

`.md` only. Zero code, zero schema, zero stamps, no collision surface. Default posture is **§2 HOLD**: write it, open the PR, hand over the link, do not self-merge. AGENTS.md §2 permits self-merging low-risk additive docs; this lane holds anyway because the docs it writes are decision records that Nick signs off on.

### 1.4 Collision rules

One concern per branch and PR **[repo]** AGENTS.md §1. Lanes are separated by touch set, so a genuine conflict means someone crossed a line. The exception that is legitimate and recurring is the cache-bust stamp: two Repo-lane branches both stamp all five shells and both will conflict. That is a merge-chain problem with a mechanical answer — §2.4.

**Branches are never deleted.** They are the audit trail and they are cheap. 260 of them, and that is fine **[repo]** AGENTS.md §1.

### 1.5 The shared surface

`AGENTS.md` belongs to no lane. Any lane may correct it — the §6 file-list correction of 2026-07-28 landed from a `chore/` branch — but a PR that changes AGENTS.md must say so in its title or body, because every other lane reads it at session start.

---

## 2. THE RITUALS

### 2.1 §0 — verify, don't trust

The rule is one line: *never trust a handoff summary; verify against the repo, and if they disagree, believe reality and note the discrepancy in your report* **[repo]** AGENTS.md §0. What follows is what that looks like in practice.

**(a) Count the tags fresh.** Never trust a hard-coded count — including the one printed in AGENTS.md, including the one printed above in this document. Enumerate the shells, match the tags, count what you get at *your* branch tip. AGENTS.md says this about itself: "If your count disagrees, believe your count and update this line" **[repo]** AGENTS.md §6.

**(b) Patch-id comparison before closing a PR.** **[practice]** The same fix lands twice under two branch names more often than you would think. Before closing an older PR as redundant, compare the actual change — patch-id or a real diff against current `main` — not the title, not the description. Then close it citing the commit that carries the change. Closing on a title match is how a fix gets thrown away because something that *looked* like it had already landed.

**(c) Reconstruct baselines from `created_at`.** **[practice]** When a question is "what did this look like before the change," do not reach for a remembered number. Order the rows by `created_at`, cut at the deploy timestamp, and count each side. The before-number is derivable from the data; a recalled one is a guess wearing a number's clothes. The §14 wallet grant is the small version of the same habit: ledger sum and balance were read *before* (0 / 0) and *after* (100000 / 100000) **[repo]** `db/proposals/FUTURE_ITEMS.md` §14.

**(d) Session start, every time.** Current `main` HEAD; do the branches and files in the prompt actually exist; read the real contents of anything you are about to edit. Ten minutes that saves an afternoon.

### 2.2 Parse-check gotchas

**[practice]** Three ways a checker lies to you:

**Explicit file lists.** Any check that walks "all the files" by its own inference will silently under-cover. Pass the list explicitly and make the tool print it. This is not theoretical: `preview.html` was left off the §6 shell list for a long time, so its single tag was never stamped and it sat stranded at an old hash while the other 54 moved on **[repo]** AGENTS.md §6 correction, 2026-07-28.

**`__bundler` blocks are JSON.** They live inside the HTML and look like script, but they are data. Run them through a JS parser and you get either a spurious failure or, worse, a pass that means nothing. Parse them as JSON.

**A green check that checked nothing.** See §3.6 — it earned its own trap entry.

### 2.3 §6 mechanics

**What the label means.** `BUILD` is the hash of the last **substantive** commit — code or assets. Not a merge commit. Not a docs-only commit. Not the label commit itself, which cannot contain its own hash. A docs-only commit on top does not change any deployed asset, so it does not move the label **[repo]** AGENTS.md §6.

**What needs no restamp.** Data-only changes and doc-only changes. Nothing a browser caches changed, so busting the cache would be noise. This is why the Docs and Library lanes carry no §6 obligation at all.

**Where the stamp lives.** Inside the fix branch, at the tip, committed with `js/version.js` and every `?v=` string together. Then the web-UI `--no-ff` merge is itself the action that fires Pages: one merge, one deploy, label and queries atomic by construction, no post-merge bump commit **[repo]** AGENTS.md §6 branch-tip label.

**Count, don't trust — and the history of why the number moved.** The count is not a constant. It has taken eight different values across seventeen stamp commits in four days:

| Count | Commit | What moved it |
|---|---|---|
| 54 | `f6c292d` | the four-file shell list |
| 55 | `109bad9` → `012c441` | `preview.html` added to the list (§6 correction); its 1 stranded tag rejoined the ritual |
| 59 | `0784783`, `6057829` | +4 as the add-card and cleanup work added includes |
| 60 | `9a34dd9`, `7ec8c4b` | +1 include |
| 61 | `f2749ae` | +1 include |
| 63 | `bceabf6`, `63b4f65` | +2 includes |
| **62** | `51c6125` | **went down — see below** |
| 64 | `95d99cc` | current: index 25 · shop 18 · game 10 · builder 10 · preview 1 |

The dip from 63 to 62 is the most useful entry in the table, because it is not an error. `51c6125` stamped 62 honestly: its branch tip (`3d1c5f2`) was cut before a `game/shop.html` include landed on main, so at *that* tip there were 62 tags (shop 17, not 18). **A tag count is a property of your branch tip, not of the project.** `95d99cc` then stamped 64 at the merged tip and the number came back up. If your count disagrees with the last commit message, you are probably right and you should say why.

**The reason all of this exists.** A `?v=` that drifts from the deployed build silently recreates the stranded-cache bug: a green deploy that users never receive. It happened on the pack-redemption deploy — the fix shipped, Nick's browser kept running the old bundle, and his paid pack silently no-opped **[repo]** AGENTS.md §6.

### 2.4 The merge-chain drill

Two Repo-lane branches, both stamped, both targeting main. The second one to land will conflict in all five shells. The resolution is mechanical:

1. **Union by resource, not by hunk.** Key each include on its resource path (`js/depot-foo.js`), take the union of resources across both sides, and keep every one. Never resolve a stamp conflict by taking "ours" or "theirs" wholesale — that is exactly how a resource silently disappears from a shell, and the 63-vs-62 shape above is what it looks like from the outside.
2. **Whichever PR lands second restamps.** After the merge, recount at the merged tip and stamp every file and `js/version.js` to the second branch's substantive tip, in one commit.
3. **Expect the count to change**, and put the new count and the per-file breakdown in the commit message. That message is the audit trail the table in §2.3 was reconstructed from.

---

## 3. THE ENVIRONMENT TRAPS

All **[practice]**. Every one of these has cost a session at least an hour.

### 3.1 Idle stops wipe `/tmp`

The workspace persists; `/tmp` does not. Anything staged there — extracted zips, half-built manifests, the tool you just wrote — is gone after an idle stop, and it will vanish mid-run rather than politely between runs. **Keep tooling and intermediates in a persistent path inside the workspace.** Long jobs need to be resumable from disk regardless (see the manifest-ledger pattern, §4.2).

### 3.2 The keep-alive loop

A long ingest or sweep will idle the machine out from under itself while it is busy waiting on I/O. Run a heartbeat alongside it. Keep it cheap and keep it *logging*, so that a dead keep-alive is visible in the output instead of being indistinguishable from a slow job.

### 3.3 Port-forward auth and origin-bound sessions

Two separate traps that present as one confusing symptom.

The forwarded port carries **its own auth cookie**. A fresh browser context hitting the forwarded URL gets an authentication wall, not the app — that is the port forwarder talking, not your code.

Supabase sessions are **origin-bound**. A session established on the Pages origin does not exist on the forwarded origin, and the reverse. The symptom is an anonymous shell with a signed-out chrome on a build you know is fine. Sign in again *on the origin you are actually testing* before you diagnose anything. Note the adjacent code-level version of the same shape: a new page that forgets `window.DEPOT_SUPABASE_CONFIG` also renders an anonymous shell and a blank DD balance **[repo]** AGENTS.md §8.

### 3.4 The terminal-vs-editor-buffer incident

A file was written from the terminal. The editor still held the pre-write buffer. A later editor save wrote the stale buffer back on top, silently reverting the change — and `git status` was clean in between, so nothing looked wrong until the behaviour was missing.

**Rule: one writer at a time.** After any terminal write, reload the file in the editor before touching it. If you are going to edit from both, close the editor buffer first. Never assume a clean status means your change survived; check the content.

### 3.5 CDN staleness on unpinned raw reads

Reading a file from a raw/CDN URL without pinning to a commit can hand you a cached older copy. You will then "verify" that a fix is already applied when it is not, or that it is missing when it is not. **Pin the read to a commit SHA**, or read through the API at an explicit ref. This is the read-side twin of the stranded-cache bug in §2.3: same cause, different victim.

### 3.6 "ALL INLINE OK" with no arguments

A checker was invoked without file arguments. It printed a confident green **ALL INLINE OK** and exited 0. It had checked zero files.

**Green output only means something if it also prints what it checked.** Make every checker echo its file list and its count, and treat an empty list as a hard failure rather than a vacuous pass. This is AGENTS.md §4's fail-loud rule applied to tooling: a silent bail is banned in code, and a silent bail dressed as a success is worse.

### 3.7 Terminal pushes do not deploy

A direct terminal `git push` to main does **not** trigger a Pages build; the legacy workflow only fires on web-UI commits and web-UI PR merges. Push from a terminal and the live site stays stale with no error anywhere **[repo]** AGENTS.md §5.

---

## 4. THE MONEY-PATH LAW

Anything that grants a card, moves a coin, or creates a wallet row obeys all of this. It is not negotiable and it is not a style preference — every clause below is scar tissue.

### 4.1 Ledger first

Insert the **grant row before the granted thing**. Redemption writes the ledger row, and only then the cards. A Postgres `23505` on that insert means "already granted" → clean no-op, insert nothing, log why **[repo]** AGENTS.md §4, `db/proposals/pack_seed_idempotency.sql`.

### 4.2 Idempotency at the correct unit

The uniqueness key must match the **unit of the thing you are deduping**:

| Grant | Unit | Key |
|---|---|---|
| Pack | the pack | `(collection_id, pack_seed)` on a `pack_grants` ledger — one row per pack |
| Starter box | the **account** | `owner_id` — one row per account, ever |
| Free claim | the window | free-claim rows counted in the trailing period |
| Ingest | the **file** | `{zip}/{inner_filename}` in the manifest ledger |

The canonical incident, in full **[repo]** AGENTS.md §4: Nick's bronze pack (seed `1335568119`) was granted twice. The guard was `SELECT cards for the seed → if count < N, INSERT`. Two `INITIAL_SESSION` auth events fired in the same millisecond, both read zero, both inserted — ten cards instead of five. **Read-then-write is not idempotency**; the read is stale the instant another writer commits. And the first attempted fix was itself wrong: a unique index on `cards(collection_id, pack_seed)` can never coexist with a five-card pack, because those five rows legitimately share one seed — the constraint would reject cards 2–5 of a *valid* pack.

If you ever find yourself writing "check, then act" on money or grants: stop, and push the invariant into the database at the right unit. A window-scoped in-flight latch is the belt; the ledger constraint is the suspenders.

### 4.3 Grants are atomic

One grant is one ledger row plus its effects, together. There is no such thing as a partially granted pack. If the effects cannot be completed, the grant did not happen.

### 4.4 `franchises.balance` is a STORED column

This is the clause people get wrong, so it gets its own heading.

`franchises.balance` is **not** a view over `wallet_transactions` and **no trigger mirrors ledger inserts into it**. A ledger row alone does not move the wallet chip. Both must move together — the ledger-then-apply pair, exactly as `writePayout()` in `js/depot-wallet.js` does it: write the owner-scoped `wallet_transactions` row, then `depot_apply_payout` **[repo]** `db/proposals/FUTURE_ITEMS.md` §14.

And the part that should make you careful: **nothing enforces `balance = sum(amount)`.** There is no reconciliation job, no constraint, no check. The only thing standing between the ledger and the balance is that every writer remembered to move both. So: read both sides before, read both sides after, and put the four numbers in your report. The §14 grant did (0 / 0 before, 100000 / 100000 after) and that is why we know it was clean.

### 4.5 Admin conventions

* Admin credits are ordinary ledger rows with `reason = 'admin_grant'`, made the app's own way rather than by hand-editing a balance.
* Admin rows carry meta flagging them as testing grants, and admin **spend** is flagged out of economy analytics — `meta.exclude_from_economy_analytics` — so a test wallet cannot pollute the numbers the economy is tuned against.
* Today this is hand-run per session. It should fold into the roles-table work: accounts flagged admin get a documented grant path or a seeded testing balance **[repo]** `db/proposals/FUTURE_ITEMS.md` §14.
* There is **no roles table and no admin flag in the schema today.** Three documents already point at the same missing table (`FUTURE_ITEMS` §14, `SHARED_LIBRARY_DESIGN` §9, `LIBRARY_PHASE0`), so it lands once, on its own branch.

### 4.6 Sign-off

Every clause above touches schema, DDL, or money. That means **pause for explicit human sign-off before merging** — AGENTS.md §2 is not satisfied by "it's additive." Propose the SQL in `db/proposals/`, do not execute it.

---

## 5. THE DATA DISCIPLINES

### 5.1 Identity resolution: exact name plus span, never fuzzy

Two rules, and they are deliberately different from each other:

* `searchPerson(name, cardYear)` requires an **exact, accent-folded, full-name match**. It deliberately does *not* apply a span check, because identity and provenance are different questions.
* `spanCovers(person, cardYear)` must hold before anything writes a stat line. On the stats side the span **is** the question, so the caller applies it itself.

Anything short of both is **skipped with a logged reason** and the row is left exactly as it was **[repo]** commit `8c62381`, "span-guarded re-pull sweep for provenance-less stat lines."

**The Jeter incident is why.** A stats block carried no record of whose line it was or which season it covered, so the detail renderer labelled it with the *card* year. That is how a 1990 Frank Thomas line displayed as **1993 SEASON on a Derek Jeter card** **[repo]** commit `852958d`. The same reasoning is why fuzzy matching was rejected outright for the shared library: a false join shows the wrong player's scan on someone's card, and a wrong-but-confident join is worse than a placeholder **[repo]** `SHARED_LIBRARY_DESIGN.md` §1.

Corollary, and it bit twice: **editing a resolved name invalidates the identity behind it.** Typing over a resolved name drops the resolved player, the provenance capture, and the three fields the rolodex owns. Programmatic writes from the picker do not fire input events, so picking a player never trips it **[repo]** commit `0495fe8`.

### 5.2 The provenance triple on every stat write

Every stats write persists three keys into `DEPOT_META` beside the stats:

```
statPersonId   — WHOSE line this is
statSeason     — WHICH season it covers
statTeam       — the team on the split it used
```

Both write paths do it — the pack/notes path and `depot-position.js`'s backfill — and `rowToCard` surfaces them. The capture is **re-validated at save**: provenance is persisted only if the stats box still holds exactly what the pull wrote, for exactly the year on the form. A manual edit or a year change **drops provenance rather than faking it** **[repo]** commit `852958d`.

The read side is the other half: it **refuses to label** a stats block that cannot prove whose line it is. No provenance means no label — a blank, not a guess. That correctly blanked every pre-provenance card, which is what the one-shot span-guarded sweep in §5.1 exists to repair.

The general form: **a value and its justification are written together, or neither is written.**

### 5.3 `withMeta` semantics, not rebuild

`packNotes()` used to rebuild `DEPOT_META` from a fixed object literal, which silently dropped every key it did not own — including `ratesMeta`, present on 14 of 27 cards **[repo]** PR #185.

The correct semantics, and the pattern for any writer that owns part of a shared blob:

1. **Seed** the meta from the card's existing notes.
2. **Delete only the keys this writer owns.**
3. **Overlay** the new values.

Unknown keys survive byte-intact, and key order is kept stable so an unchanged re-save is **byte-identical rather than merely equivalent** — which is what makes differential verification possible. That verification was itself done the right way: run old and new against real production rows with **zero writes** and compare hashes. Byte-identical on the card with meta, byte-identical on the null case, and the old path demonstrably destroying 357 bytes of `ratesMeta`.

### 5.4 Art keys and slug rules

Path convention, verified against the live public bucket **[repo]** `js/depot-library-art.js`:

```
{year}/{brand}/{setSlug}/{number}_{side}.jpg
```

* **`brand` equals `setSlug`, by design.** The row's `brand` column is not trustworthy — `cardToRow` populates it from the card's `set`, so brand and set are effectively the same value on a row. Derive from the set, never from `brand` **[repo]** `SHARED_LIBRARY_DESIGN.md` §0.
* **`slug()` — the dash form:** trim, lowercase, spaces to `-`, drop every character outside `[a-z0-9-]`. Memoised, because it runs across a 155,844-row catalog.
* **Number: strip leading zeros, KEEP the letter suffix.** `5` not `005`; `1b` not `001b`. This is not cosmetic — in 2021 Topps alone, 333 catalog rows carry a letter-variant suffix, and a parser that strips the letter collapses all 333 onto their base numbers and collides **[repo]** `LIBRARY_PHASE0.md` §3.
* **Library reads are plain public URLs**, browser-cacheable, never signed. Signed URLs do not scale for art that every viewer loads for every card **[repo]** `SHARED_LIBRARY_DESIGN.md` §2.
* Resolution order per card, per side: **personal scan → library art → placeholder**, with each fall-through logged rather than silently blank (§4 fail-loud).

### 5.5 The two coverage metrics — always say which one you mean

They are different numbers and they get confused constantly.

**Pack-pool coverage %** = pack-catalog rows that have an active `front` row in `card_library` ÷ total pack-catalog rows. *This is the one that moves the economy*, because the pack pool is filtered to art-backed rows.

**Key coverage %** = distinct art keys held in `card_library` ÷ distinct catalog keys. Always the more flattering of the two, because `card_library` holds keys that are not in the pack catalog at all — 3,847 of them at the last measurement, being subsets and variants.

**Both published figures are RETIRED.** `54.1%` (84,272 of 155,844, measured 2026-07-29, recorded in `FUTURE_ITEMS` §10) and `64.65%` are historical snapshots superseded by later ingest. Cite either one only *with its date, as history*. **Re-measure before quoting a coverage number**, and state which of the two metrics you measured.

Year coverage also swings hard enough that a global average hides the truth — 2024 at 96%, 1986 at 85%, 1989 at 42% at that same measurement.

### 5.6 The art filter is an economy input

Filtering the pack pool to art-backed rows cut the pool from 155,844 to 84,272 and **moved the odds**: the bronze gold-hit rate went from roughly 1 in 25 to roughly 1 in 18. A data-lane change with no code in it changed the published economy. A retune was considered and deliberately deferred **[repo]** `db/proposals/FUTURE_ITEMS.md` §12, §12a, §12c.

The lesson for lane discipline: **the Library lane can move the economy without touching code.** An ingest pass that materially changes coverage should say so in its report.

---

## 6. INDEX OF TRUTH

**The rule: cite, don't reconstruct.** If a decision is listed here, quote it and move on. If you cannot find it here, it is chat-only — and the correct response is to write it into this file, not to re-derive it next session.

### 6.1 Conventions and operating rules

| Where | What lives there |
|---|---|
| `AGENTS.md` §0 | Trust nothing — verify repo state yourself |
| `AGENTS.md` §1 | Git rules: explicit staging, `--no-ff` merge commits, keep branches, one concern per PR, additive-first |
| `AGENTS.md` §2 | Merge policy — what may be self-merged, what pauses for sign-off |
| `AGENTS.md` §3 | Architecture map: the three shells, shared logic, data/backend, depot-core bootstrap, the data-path rule |
| `AGENTS.md` §4 | Fail-loud rule + the pack double-grant incident (idempotency unit) |
| `AGENTS.md` §5 | Deploy rules, Pages flakiness, the live build-hash check |
| `AGENTS.md` §6 | Session checklist, branch-tip label, the cache-bust ritual, the shell list and its correction |
| `AGENTS.md` §7 | Tooling notes — surgical edits, never paste keys |
| `AGENTS.md` §8 | depot-core cutover, one page at a time; the new-page config rule |
| `AGENTS.md` §9 | The game page runtime bundle and its destructive load behaviour |
| `docs/RUNBOOK.md` | This file — lanes, rituals in practice, environment traps, money-path law, data disciplines |

### 6.2 Economy and game design

| Where | What lives there |
|---|---|
| `ECONOMY_DESIGN.md` §1 | Prestige formula (transparent points, no market data) |
| `ECONOMY_DESIGN.md` §2 | Earnings — win/loss/exhibition payouts |
| `ECONOMY_DESIGN.md` §3 | Anti-farming |
| `ECONOMY_DESIGN.md` §4 | Sinks |
| `ECONOMY_DESIGN.md` §5 | Slice plan |
| `ECONOMY_DESIGN.md` §6 | Pointer to storage (part 2) |
| `ECONOMY_DESIGN.md` §7 | Slice B — the Pack Shop, tiers, free claim, band-first odds |
| `design/GRADE_PRESTIGE.md` | Identity model (pulled vs scanned), the three-axis rule, grade as a worth multiplier, the challenge/verification path, remaining open questions |
| `design/GAME_MODES.md` | Salary-cap modes, era restrictions, band-cap flavour, underdog bonus, prestige-denominated wagers, the stat-less bench rule |
| `design/STARTER_BOX.md` | The one-time 25-card box: roster-shaped roll, guaranteed hit, account-unit idempotency, reveal pacing question |
| `REDESIGN_V2.md` | D1–D6 binding decisions, screen-to-system map, design tokens, conflict ledger, phase plan, Phase 1/2 build specs |
| `design/redesign-v2/README.md` | The redesign spec proper — option 2b Dugout and the challenge pill flow |
| `DESIGN.md` | Unified design direction, the shell, continuity pass |

### 6.3 Data, library, and schema proposals

| Where | What lives there |
|---|---|
| `SHARED_LIBRARY_DESIGN.md` §0–1 | Current storage model; the catalog key and why fuzzy matching was rejected |
| `SHARED_LIBRARY_DESIGN.md` §2–4 | Storage architecture (copy, not reference), contribution flow, consumption/resolution order |
| `SHARED_LIBRARY_DESIGN.md` §5–8 | Moderation, proposed RLS/DDL, slice plan |
| `SHARED_LIBRARY_DESIGN.md` §9 | Open questions — including the admin model |
| `LIBRARY_PHASE0.md` §1–2 | Corpus inventory and the naming forensics (variants A–D — a per-era parser family, not one regex) |
| `LIBRARY_PHASE0.md` §3–5 | Match-rate dry run, ingest pipeline, proposed bucket policy and DDL |
| `db/proposals/FUTURE_ITEMS.md` | The numbered backlog — see 6.4 |
| `db/proposals/*.sql` | Proposed DDL. **Proposed. Not executed.** |
| `data/URL_RECOVERY_NOTES.md` | Catalog URL recovery notes |
| `REDEPLOY.md` | The no-op marker used to nudge a flaky Pages build |

### 6.4 `db/proposals/FUTURE_ITEMS.md` by number

Cite these by number; they are stable.

1. Provenance marker for free-daily-pull cards (RPC side)
2. A real `cards.pos` column — position currently rides in `cards.notes`
3. Share personal scan to the public card-library
4. `renderGrouped` mojibake team comparison
5. Rolodex meta — card-year span presented as an unlabeled career span
6. DIAMOND — a fourth prestige band and pack tier (scoping)
7. Dupes — a dupe-to-coins chip during the reveal
8. Sound — rip / flip / hit sting
9. Static art-key manifest (kill the 89 round trips)
10. Library coverage gaps the art filter exposes — **the retired 54.1% measurement lives here**
11. Server-side free roll and the `card_library` join (SQL, not shipped)
12. The art filter moves the ECONOMY, not just the art — 12a measured A/B, 12b sampling bias, 12c retune deferred
13. Pack provenance view / "Group By Pack" (scoping)
14. Admin testing wallets and admin spend out of economy analytics — **the stored-balance gotcha lives here**

### 6.5 Git history as a source

Commit bodies in this repo carry full incident write-ups. They are citable and they are often the only place a diagnosis is written down:

* `852958d` — stats provenance persisted on every write; the Jeter mislabel
* `8c62381` — the span-guarded re-pull sweep; exact-name vs `spanCovers`
* `0495fe8` — the stale-identity latch; name edits invalidate resolution
* PR #185 / `cca16bf` — `withMeta` semantics and the differential byte-identical verification
* `95d99cc` — the current 64-tag stamp, with the per-file breakdown
* `51c6125` — the 62-tag stamp that shows a count is a property of a branch tip

---

## 7. VERIFICATION LOG FOR THIS DOCUMENT

Per AGENTS.md §0, here is what was actually checked rather than assumed while writing this:

* `main` HEAD read live: `13d1e83`, the merge of PR #203. The task handoff said this pass would branch off main "after #203 merges" — verified merged, no discrepancy.
* `js/version.js` BUILD read at `ref=main`: `7eb4b0d`.
* Cache-bust tags **counted fresh** across the five shells, not taken from any commit message or from AGENTS.md: **64 tags, every one at `7eb4b0d`** (25 / 18 / 10 / 10 / 1). Label and queries agree.
* The §2.3 count history was reconstructed from the actual `chore(cache-bust)` commits in `main`'s history in chronological order, including the 63 → 62 → 64 sequence and the branch tips those stamps were taken at.
* Branch inventory: 260 branches, prefixes `fix` 87, `feat` 78, `chore` 42, `docs` 14+3, `library` 1, plus 28 unprefixed. Consistent with the never-delete rule.
* Every **[repo]** claim above was read out of the cited file or commit at `main` during this pass.

### 7.1 What in this document is chat-only

Marked **[practice]** throughout, and listed here so a future session knows exactly which parts have no other source and should be corrected here first if they turn out to be wrong:

* §1 — the lane handles (verbose zebra, fuzzy fortnight) and the lane touch-set table as a formal contract.
* §2.1(b) patch-id comparison and §2.1(c) reconstructing baselines from `created_at`.
* §2.2 — the parse-check gotchas (explicit file lists, `__bundler` blocks are JSON).
* §2.4 — the merge-chain drill as a written procedure.
* §3 — all seven environment traps.
* §5.5 — the `64.65%` figure, which appears nowhere in the repo.

Everything else carries a path, a section, or a commit hash. That was the point of writing this down.

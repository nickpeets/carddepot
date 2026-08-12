# ONBOARDING_PATH_SPEC.md — wiring up the onboarding that already exists

Status: **spec, not implementation.** Written for the codespace agent. Nothing
here was built by this document; the browser agent that wrote it is limited to
single-file edits and this is a three-file change at minimum.

Written 2026-08-12, after the first end-to-end observation of the new-player
path (`docs/FLOW_A_OBSERVED.md`).

---

## 0. The premise, in one paragraph

A brand-new player gets an empty binder, zero coins, a 0-0 record, a team called
**MY CLUB** they did not name, three packs they cannot afford, and one free card.
That is the whole first session, and it was measured on a real account, not
inferred.

It is not because the onboarding is unbuilt. It is because the onboarding is
built and **not connected to anything.** Three deployed `SECURITY DEFINER`
functions — careful ones, with advisory locks, 23505 no-ops, and error messages
that name their own remedies — have **zero callers** anywhere in the repo:

| function | what it does | callers |
|---|---|---:|
| `depot_ensure_onboarding(p_team_name text default null)` | creates the collection and franchise if the signup trigger's swallowed exception ate them | **0** |
| `depot_claim_starter_box(p_cards jsonb, p_seed bigint)` | the 25-card welcome | **0** |
| `depot_rename_franchise(p_name text)` | the only way to change `'MY CLUB'` | **0** |

Enumerating every `.rpc(` call site across every `.js` and `.html` in the repo
returns exactly eight, all string literals: `depot_apply_payout` (×2),
`depot_purchase_pack`, `depot_claim_free_pack`, `depot_is_admin`,
`share_collection`, `unshare_collection`, `get_shared_collection`,
`get_shared_cards`. None of the three above appears.

**So this is not a build. It is a wiring job with three call sites, and the
server half is finished and good.** That is the whole reason this is one spec
rather than three tickets: they share a moment, they share a session, and they
would be built together or not at all.

---

## 1. The session-time onboarding hook

### What it is

Something that fires on auth state change, calls `depot_ensure_onboarding`, and
is safe to call every single time.

### Why it is first

`depot_handle_new_user` — the trigger on `auth.users` — wraps its whole body in
`exception when others then raise warning`. That is the right call: a failing
trigger would break signup, and losing a collection row is better than losing the
account. But it means a user can land in `auth.users` with **no role row, no
collection and no franchise**, and the only trace is a `raise warning` in a
Postgres log nobody reads.

With no caller for `depot_ensure_onboarding`, **that account is permanently
broken.** Every other item in this spec — the starter box, the rename, the shop —
resolves the caller's collection with
`select id from public.collections where owner_id = ... order by created_at asc limit 1`
and raises if there is none. A user without a collection row cannot claim a
starter box, cannot buy a pack, and cannot claim a free pack. They can sign in
and do nothing.

The observed account (2026-08-12) came through cleanly, so this has not been seen
to fire. The point is that if it ever does, there is currently no way back.

### The contract, as deployed

Read off the deployed body, not the migration file.

- `v_owner := auth.uid()`; raises `P0001 'depot_ensure_onboarding: not authenticated'` if null.
- **Takes an advisory transaction lock** keyed on the owner:
  `pg_advisory_xact_lock(hashtextextended('depot_onboarding:' || v_owner::text, 0))`.
  Its own comment says why: *"Serialise concurrent callers for THIS owner only.
  Two INITIAL_SESSION events in the same millisecond is the documented failure
  mode."*
- Creates `'My Collection'` if the owner has none.
- Creates a franchise with `on conflict (owner_id) do nothing`, then re-reads on
  a lost race.
- `p_team_name` is sanitised — `nullif(btrim(coalesce(p_team_name,'')),'')`, then
  `'MY CLUB'`, then `left(..., 40)` — and **never overwrites an existing name.**
- Returns
  `{ok, collection_id, franchise_id, created_collection, created_franchise}`.

**Read that advisory lock as a message from the author.** It only makes sense if
something calls this on session events. The function was written expecting the
hook this spec describes. The hook is the missing half.

### Requirements

1. **Fire on auth state change**, not on page load. `INITIAL_SESSION` and
   `SIGNED_IN` both need to reach it; the advisory lock exists precisely because
   they can arrive together.
2. **Idempotent by construction.** The RPC already is. The client must not add
   its own "have I run this" flag in `localStorage` — that is the
   read-then-write pattern AGENTS.md section 4 bans, and the server already
   solves it.
3. **One place, not per-page.** It belongs wherever the shared shell wires auth,
   so every surface inherits it. Today `onAuthStateChange` is wired
   independently in `index.html`, `game/builder.html`, `js/depot-shop-view.js`
   and `js/depot-index-shell.js` — four call sites, which is exactly the
   duplication this hook should not join.
4. **Fail loud, fail harmless.** If the RPC errors, log it through the fail-loud
   convention and carry on. Onboarding repair failing must never block a page.
5. **Do not pass `p_team_name` from the hook.** Let the default apply. Naming is
   section 3's job and the function will not overwrite an existing name anyway.

### Acceptance

Sign up a fresh account, then — separately — delete a test account's
`collections` row by hand and reload. The row comes back, exactly one row comes
back, and reloading five times still produces exactly one.

---

## 2. The starter box

### The deployed contract

Read off the deployed body of `depot_claim_starter_box(p_cards jsonb, p_seed
bigint)` on 2026-08-12, 74 lines. Eye-transcribed from screenshots — the sandbox
blocks text extraction from that domain — so treat the wording as
**eyeball-accurate, not byte-accurate**, and re-read before relying on a
character.

What the server enforces, in order:

1. `auth.uid()` or `P0001 'depot_claim_starter_box: not authenticated'`.
2. `p_cards` must be a jsonb **array** or `P0001 'p_cards must be a jsonb array'`.
3. `jsonb_array_length(p_cards)` must be **exactly 25** or
   `P0001 'expected 25 cards, got %'`.
4. Resolves the oldest collection; if none,
   `P0001 'no collection for this account -- run MIGRATION_roles.sql section 2 (depot_ensure_onboarding) first'`.
   **That error message is section 1's dependency stated by the server itself.**
5. **GRANT ROW FIRST.** `insert into public.starter_box_grants (owner_id,
   collection_id, seed, card_count)`. Its comment: *"second claim collides HERE,
   before a single card exists."* `exception when unique_violation` → a notice
   and `{ok:false, already_claimed:true, inserted:0}` — **no cards inserted.**
6. Only then loops `jsonb_array_elements(p_cards)` inserting into `cards (...,
   source, notes, pack_seed)` with **`source = 'starter'`** and
   **`pack_seed = p_seed`**, collecting ids.
7. Writes a 0-amount ledger marker: `wallet_transactions (owner_id, amount,
   reason, meta)` = `(v_owner, 0, 'starter_box', {seed, card_count, card_ids,
   excluded_from_pull_band_bump: true})`.
8. Returns `{ok:true, already_claimed:false, inserted, seed, collection_id, ...}`.

The once-per-account rule is the **PRIMARY KEY on `starter_box_grants.owner_id`**
— a constraint, never a check.

### The thing the spec must not gloss over

**The server validates the count and nothing else.** It checks that there are 25
elements. It never checks positions, bands, or art. So *9 fielders / 5 SP / 5 RP
/ 5 bench* and *one guaranteed bronze-or-better* are **client-side promises with
zero server enforcement.** This function is `docs/GRANT_AUTHORITY.md`'s thesis in
its purest form: twenty-five cards named by the client and written down by the
server.

That is acceptable for v1 on the same reasoning every other grant path uses, and
it is **not** acceptable once cards can change owner. Whoever moves the roll
server-side per `docs/PULL_POLICY.md` should move this one at the same time; it
is the largest single grant in the product.

### Requirements for `window.DepotStarterBox`

The migration documents the intended call site literally:
`const p = window.DepotStarterBox.rollPayload();   // 25 cards + seed`. That
module does not exist. Build it as:

1. **`rollPayload()` → `{cards: [25], seed}`**, deterministic in the seed, drawing
   from **the same eligible pool the shop rolls from** — see section 4.
2. **Composition: 9 fielders, 5 SP, 5 RP, 5 bench.** Position comes from
   `js/depot-position.js` and `data/player_positions.json`, keyed by
   `window.depotNormName`. Resolution order is exact-key, never fuzzy
   (`js/depot-binder-browse.js` header, STARTER_BOX 4.1 / RUNBOOK 5.1).
3. **One guaranteed bronze-or-better**, band from `DepotPrestige.compute()`
   (60+ gold, 30+ silver, 10+ bronze, else plain). Use the same **bounded**
   re-roll shape `rollPack` uses and return whether the floor was met, rather
   than looping forever. Do not use the word "guaranteed" in user-facing copy if
   the loop is bounded — `js/depot-shop-view.js` carries a deliberate comment
   about exactly this.
4. **Never call the RPC with fewer or more than 25.** The server will reject it
   with `P0001` and the player sees an error instead of a welcome.
5. **Trigger:** on the first surface load after a session where
   `starter_box_grants` has no row for this owner. Do not gate on a
   `localStorage` flag; gate on the server's answer, and treat
   `already_claimed:true` as a normal, silent no-op.

### Requirements for the surface

- **Something must happen visibly.** Twenty-five cards arriving silently into a
  binder is indistinguishable from a bug.
- **The reveal must route every name through `window.depotCleanName`** — see
  section 5. Twenty-five cards is twenty-five chances to print a sentence of
  hobby errata, at the exact moment a stranger is deciding whether this is a real
  product.
- **Decide the ordering question in section 2.1 before building the ceremony.**

### 2.1 ~~A real product decision~~ DECIDED 2026-08-12: grant first, resumable

Measured on the free pull, 2026-08-12: the card row was already in `cards` while
the pack was still sealed on screen. The ceremony is decoration over a settled
fact.

**Nick has ruled: cards land immediately, and the ceremony resumes at next login
if it is interrupted.** The grant is never held hostage to the animation, and
the moment is never lost.

Why the question had to be asked at all: if a new player closes the tab
mid-ceremony under a grant-first-reveal-after design, they own 25 cards they have
never seen, **and the box can never be claimed again** — the PRIMARY KEY on
`owner_id` makes it once-per-account, permanently. There is no re-open.

The three options, kept because the reasoning is worth more than the verdict:

| option | consequence | |
|---|---|---|
| **Grant first, reveal after** (today's shape for the free pack) | Simplest. A player who bounces mid-ceremony silently loses the moment forever, though not the cards. | rejected |
| **Reveal first, grant on completion** | The player always sees what they got. But a crash mid-ceremony means no cards at all, and the money-safety ordering used for paid packs exists precisely because that is worse. | rejected |
| **Grant first, reveal resumable** | The box is re-openable as a *ceremony* until the player finishes it. Nothing is ever lost in either direction. | **CHOSEN** |

**Why it is cheap.** The deployed RPC already writes `card_ids` into
`wallet_transactions.meta` alongside the seed and the count. The data needed to
replay a reveal is being stored today, by a function that has never run.
Somebody thought about the mid-ceremony bounce before anyone had hit it.

Implementation notes, not decisions:

1. **"Has the player seen their box?" is a separate question from "has the player
   claimed their box?"** The second is already answered by
   `starter_box_grants`. The first needs somewhere to live — a flag, or a
   derived check, or simply "show the ceremony until they reach the end of it
   once." Whoever builds it should not overload the grant row to mean both.
2. **Resume from the ledger, not from a re-roll.** The card ids are recorded;
   read those rows back and reveal them. Never re-run `rollPayload()` to
   reconstruct a box that has already been granted — that is the
   `depot-pack-history.js` re-roll fallback's mistake, and it is labelled as such
   everywhere it surfaces there.
3. **Resuming is not re-claiming.** The RPC will return
   `{already_claimed:true, inserted:0}` and insert nothing, which is correct and
   should be treated as a normal path rather than an error.
---

## 3. A rename affordance

`depot_rename_franchise(p_name text)` is deployed, correct, and has no callers.
**There is currently no way for any user to change their team name, on any
screen, ever.** Every franchise in the database that reads `MY CLUB` reads it
because nothing has ever been able to write anything else.

The deployed contract: `auth.uid()` gated; `v_name := left(nullif(btrim(coalesce(p_name,'')),''), 40)`;
raises `P0001 'a team name cannot be blank'`; updates `where owner_id = v_owner`;
raises `P0001 'no franchise for this account -- call depot_ensure_onboarding() first'`
if not found; returns the stored name.

Requirements:

1. **One entry point is enough** — the franchise identity block in the shared
   shell is the obvious home.
2. **Prompt at least once during onboarding.** A franchise game that names your
   team for you and never asks has given away its one piece of identity. This is
   the cheapest item in this document and probably the highest ratio of
   first-impression to effort.
3. **Echo the server's returned name**, do not echo the input. The server clamps
   to 40 characters and the player should see what was actually stored.
4. **The blank case is a real error**, not a silent no-op — the server already
   raises for it.

---

## 4. The eligibility dependency, and the worst case that decided the rule

**Read this section as a requirement, not a description.** No starter box roller
exists, so there is no current behaviour to describe. The sentence below —
"rolls from the same pool the shop rolls from" — is something whoever builds
section 2 must *make* true. It is stated in the present tense for readability and
that is exactly how a reader in a hurry could take it for an observation.

The starter box **must roll from the same pool the shop rolls from**, so that it
inherits both of `docs/PULL_POLICY.md` section 1's gates:

- **Gate 1, art.** A card must have an image to be pullable.
- **Gate 2, playability.** A card must depict exactly one player. Multi-player
  cards, team cards, checklists and manager cards are collectible but not
  pullable — `PULL_POLICY.md` section 1.3. The test is **structural**: it asks
  what kind of card this is, **not** whether the player on it resolves to a
  position in `data/player_positions.json`. Single-player cards missing from that
  file stay pullable (`PULL_POLICY.md` 1.3.2), and that gap is tracked on its own
  terms in 1.3.4.

**No special-case filter for the box.** This is worth stating because the
obvious instinct is to write a lineup-legality check into `rollPayload()` — after
all, the box is position-filled, so it clearly needs playable cards. Do not.
Playability is a **pool-level** rule now, applied everywhere, and duplicating it
in the box roller would create a second definition to drift. The box gets legal
cards because the pool only contains legal cards.

### 4.1 The case that decided fail-closed

**The art gate was not in force in production when this was written.**
`DepotLibraryIndex.load()` was observed failing on 2026-08-12, resolving `null`,
and the shop fell back to the unfiltered 155,844-row catalog instead of the
84,452-row art-backed pool (`PULL_POLICY.md` section 1.1). It failed open by
design.

**So: if the art index fails open during a starter box roll, a brand-new
player's twenty-five-card welcome arrives full of blank cards** — and because of
the PRIMARY KEY, **it cannot be re-rolled.** The box is claimed.

That case is what decided the general question. `PULL_POLICY.md` section 1.2 is
no longer open: **Nick has ruled fail closed everywhere.** If the art index is
unavailable, packs do not open and the starter box does not fire, and the player
sees a real error rather than a silent fallback.

**Requirement, unchanged and now redundant with the general rule rather than
narrower than it:** if the art index is unavailable, do not roll, do not call the
RPC, and show the player a real message saying their welcome box is not ready
yet. A delayed welcome is recoverable. A claimed one full of blanks is not.

**And a consequence the builder needs to plan for.** Under fail-closed, an index
outage is no longer a degraded experience — it is **no onboarding at all** for
anyone who signs up during it. The error state is therefore not a corner case to
bolt on at the end; it is a state a brand-new player will actually see, and it
should read like a delay rather than a breakage.
---

## 5. Display invariant: route names through `depotCleanName`

**Requirement for the starter box reveal, stated here in full rather than
deferred**, because whichever of onboarding or the rip chapter is built first
should not inherit a dependency on the other shipping. The rip chapter carries
the identical requirement for the pack reveal.

`window.depotCleanName` already exists, in `js/depot-position.js`. It is not a
stub — its header documents an audit of all 47 catalog files, *"155,802 player
strings, 2,882 of them multi-player: 11,889 strings end in one or more trailing
subset codes, drawn from a vocabulary of 118 distinct tokens."*

It works. Verified live against real catalog strings:

| stored | rendered |
|---|---|
| `Yonathan Daza SP, VARVAR: Running` | `Yonathan Daza` |
| `Rowland Office UERUER: "Greatest catch" was in 1975…` | `Rowland Office` |
| `Greg Pryor ERRERR: No name on front` | `Greg Pryor` |
| `Jerry Narron RC` | `Jerry Narron` |
| `Ken Griffey Jr. RC` | `Ken Griffey Jr.` |
| `Adrian Beltre` | `Adrian Beltre` |
| `Lou Brock / Carl Yastrzemski HL` | `Lou Brock` |

**And nothing that displays an owned card calls it.** Every existing call site is
in `index.html`, and every one is for *matching* — `roloSameName`, the suggestion
list, the player-index lookup. `js/depot-shop-view.js` `nameOf()` is literally
`return s.player || s.name || "Unknown"`, which is why the free pull's reveal
printed `Yonathan Daza SP, VARVAR: Running` across two lines on the card face.
There is no truncation anywhere in `depot-pixel-card.js`,
`depot-binder-browse.js`, `depot-shop-view.js` or `depot-card-detail-2b.js`.

### 5.1 Observed on the live binder, 2026-08-12 — and the tile's protection is accidental and inverted

The paragraph above was read from source. This was read from the running site,
signed in, against the one card in the observed account — `Yonathan Daza SP,
VARVAR: Running`, the free pull from that morning.

- **The binder tile writes the raw string.** `.rd-tile__name` holds it character
  for character. No cleaning, no truncation, no ellipsis.
- **`depot-card-detail-2b.js` prints it as the panel headline.** Clicking the
  card renders `YONATHAN DAZA SP, VARVAR: RUNNING` in uppercase as the largest
  text on the panel, above `2020 · Topps · #567b`. That surface is now an
  **observed** offender rather than a suspected one.
- **The tile only looks clean because of a CSS rule, and the rule is backwards.**
  `.rd-tile--binder.has-art .rd-tile__name { display: none; }`, read out of the
  live stylesheet, hides the name **exactly when the card has a picture.** With
  `has-art` removed the raw string paints in full, two lines, under the art well.
  *That state was forced in-page in order to observe it; it is not a state a user
  has been seen hitting.*

**The third bullet changes the scope of the fix, so it is not a curiosity.** The
garbled string is suppressed on the cards that need a printed name least, and
exposed on the cards where the name is the *only* identification the card has.
Nobody designed that. A styling rule is doing safety work it does not know it is
doing, and it is doing it backwards. Routing through `depotCleanName` is
therefore not cosmetic polish on a hidden node: on an art-less card it is the
difference between identifiable and garbage.

**And the art-less case does not disappear with `PULL_POLICY.md` 1.2.**
Fail-closed stops art-less cards being *pulled*. It does nothing about the ones
already in binders, and the gate governs pulling rather than rendering by
construction — 1.2 says so in as many words. Whatever is already owned still has
to render, so this requirement outlives the rule that would have prevented it.

**The fix is one line per surface**, with the guard that is already the house
style:

```js
var cn = (typeof window.depotCleanName === 'function') ? window.depotCleanName : function (x) { return String(x || '').trim(); };
// ...
cn(card.player)
```

Measured impact: **2.5%** of the eligible pool carries the doubled-code prose bug
(`UERUER:`, `VARVAR:`), and a further **8.2%** carries trailing subset codes.
`depotCleanName` covers both. Worst in junk wax at 2.5% — which is what a Bronze
pack is weighted toward — and cleanest in vintage at 1.3%.

One caveat to decide, and one that Nick's ruling has already settled:

- ~~**Multi-player cards lose the second player.** `Lou Brock / Carl Yastrzemski`
  renders as `Lou Brock`. Decide whether a two-player card shows one name or
  both.~~ **Moot as of 2026-08-12.** Multi-player cards are not playable and
  therefore not pullable (`PULL_POLICY.md` section 1.3), so no reveal will ever
  land on one. The question survives only for cards somebody already owns, where
  the answer is whatever the binder already does — this gate governs pulling, not
  rendering.
- ~~**Non-player subjects render oddly.** Consider excluding non-player subjects
  from the starter box pool entirely.~~ **Decided, and more broadly than
  suggested.** Checklists and team cards are excluded from the *entire pull
  pool*, not just the box — `PULL_POLICY.md` section 1.3. So the rarity band
  under the word "Checklist" is not a thing anyone will meet in a pack.
- **Still open: what a reveal does with a name that cleans to nothing useful.**
  `depotCleanName` falls back to the raw string when it cannot find a name token,
  which is correct — better a messy name than an empty card — but it means the
  2.5% doubled-code class is covered and any *future* malformation is not. The
  reveal should not assume the cleaner always succeeds.

---

## 6. Build order, and what is deliberately not here

1. **The session hook** (section 1). Everything else raises without it.
2. **The rename affordance** (section 3). Smallest, and the highest
   first-impression return in this document.
3. **The starter box** (section 2), after 2.1 is decided.
4. **`depotCleanName` on every display surface** (section 5). Independent of all
   of the above; can land first if convenient.

**Not in scope here:** the server-side roll, `depot_settle_match`, the card
universe in Postgres, and the art-index failure itself. The first three are
`docs/PULL_POLICY.md`; the fourth wants a repro loop rather than a browser
session — paging the index at 4 lanes succeeded where the shipped module's 8
lanes failed, which is where to start and is not a diagnosis.

## 7. Known gaps in this document

- **The `depot_claim_starter_box` and `depot_ensure_onboarding` bodies are
  eye-transcribed from dashboard screenshots**, not copy-pasted. The sandbox
  blocks returning text extracted from that domain. Re-read before relying on a
  character.
- **The `.rpc(` enumeration is a grep** over `.js` and `.html`, excluding
  `mockups/`, on `main` only. A dynamically-constructed RPC name would not
  appear; all eight matches are string literals, which suggests the codebase does
  not do that, but it was not proven.
- **Nothing here was built or tested.** Every claim about current behaviour is
  read from a deployed function body, a deployed file, or a measurement against
  production — and each is labelled which.

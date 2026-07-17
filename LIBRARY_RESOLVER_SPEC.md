# LIBRARY_RESOLVER_SPEC.md — Resolver Integration Spec (app-side payoff of the shared library)

> **Status:** DESIGN / BUILD-PROMPT. Docs-only, additive, self-merge (no js/version.js bump).
> Nothing here is built. This spec is the cold-start build prompt for the **resolver
> slice** — the app-side changes that make the ingested shared library actually show up
> everywhere cards render. It is written to be buildable by a fresh session with no prior
> context. It assumes the ingestion pipeline (tools/library-ingest/) has landed and the
> `card-library` public bucket + `card_library` table (SHARED_LIBRARY_DESIGN.md §7) exist
> and are populated.
>
> **Scope guard (AGENTS.md):** this slice adds a read path. It must NOT alter the existing
> personal-photo storage model, the `cards` schema beyond the additive `catalog_key`
> column already proposed in SHARED_LIBRARY_DESIGN.md §7.1, or any css/js owned by the
> parallel redesign session. Every fallback step logs fail-loud, tagged `[depot]`.

---

## 0. Grounding — the current image code path (audited, not assumed)

Verified against main (raw source + file tree), consistent with SHARED_LIBRARY_DESIGN.md §0.

- **Personal storage (unchanged):** one private bucket `card-images`; owner-scoped path
  `{DEPOT_USER.id}/{DEPOT_COLLECTION_ID}/{cardId}_{side}.jpg`. Card rows persist the
  **path**, not a URL, in columns `photo_front_path` / `photo_back_path`.
- **The resolver today:** `depotResolveCardPhotos()` in `index.html` turns those stored
  paths into displayable URLs by minting a **per-view signed URL** — `createSignedUrl(path, 3600)`
  (1-hour expiry, re-minted every render). This is the single choke point every binder
  render funnels through.
- **The placeholder today:** `js/depot-pixel-card.js` exposes `window.DepotPixelCard` with
  `render(card, prestigeRes, opts) -> canvas` and `renderDataURL(...) -> PNG data URL`. It
  is a **text-only, procedurally generated FRONT** (player/year/brand/number/gem), used
  whenever a card has no real photo path (notably `source:'pack'` pulls). It renders a
  front only — there is no pixel "back".
- **The row mappers:** `cardToRow` / `rowToCard` (in `index.html`) translate between the
  card object and the DB row. **Quirk (must respect):** `cardToRow` writes `brand: c.set`,
  so on a row `brand` and `set` are effectively the same value. The resolver must NOT
  trust the row's `brand` column for key derivation — derive from the confirmed checklist
  match instead (see §1).
- **The builder / game surfaces** (`game/builder.html`, `game/index.html`) are React
  bundles; `js/depot-*-shell.js` only wrap chrome around them and `game/sim.js` is
  art-agnostic. There is **no existing named symbol** `hydrateLineupArt` or "convergence"
  resolver in the source today — those names describe the *conceptual* lineup-art
  hydration point the bundle uses when it paints a card face. The builder work in this
  slice is to route that face-painting through the same resolver defined here.

**Design consequence:** the shared library resolver is a **new, single function** that
extends the existing personal-photo resolution with a library tier in the middle, and is
called from every surface that currently paints a card face.

---

## 1. Catalog-key derivation from a card row (the join handle)

The library is keyed on **catalog identity**, never on `cards.id`. The key is produced by
exactly the same normalizer the ingestion used (`tools/library-ingest/normalize.py`), so a
row and an ingested object land on the identical string. Port these rules to the client
(JS) verbatim — a single shared JS module, mirrored from the Python:

    catalog_key = lower( norm(year) + '|' + norm(brand) + '|' + norm(set) + '|' + norm(number) )

- `norm()` (year/brand/set): trim, collapse internal whitespace, strip diacritics (NFKD),
  lowercase, drop punctuation except digits/letters/spaces (then collapse spaces).
- `norm_number()` (number only): drop the `(VAR)` token; strip a trailing ROLE suffix
  (`RC`, `SV`, `MGR`, `HL`); lowercase; left-strip leading zeros but **KEEP** a single
  trailing letter variant (`007A` -> `7a`). A combo/leader number (`1-2`) has no single
  catalog row -> yields no key -> the card simply does not resolve to library art.

**Where year/brand/set/number come from on a card row:**
- `year`: the row's `year` (int). Trustworthy — it is the catalog year.
- `set`: the row's `set` field. This is the real set identity and is what selects the
  catalog set (matches the ingestion's membership filter on the `set` field).
- `brand`: **do not read the row's `brand` column** (the `brand = c.set` quirk). For the
  key, use the same value the ingestion used for that set (base sets: brand == set;
  inserts/subsets: the set string carries the divergence, e.g.
  `1989|upper deck|upper deck high number|25`).
- `number`: the row's `number`, passed through `norm_number()`.

**When the key is NULL:** if the card was free-typed and never confirmed against a
checklist row, `catalog_key` stays NULL (per SHARED_LIBRARY_DESIGN.md §1 — no fuzzy
guessing). A NULL-key card **never** pulls library art; it goes straight to personal photo
or pixel front. This is the safe default and must be preserved.

**Bucket path convention (must match the ingester exactly).** The ingester
(`tools/library-ingest/ingest.py`, `object_path()`) writes one of two stable renderings;
the resolver must read whichever scheme the corpus was ingested under (pick one and keep
it stable across the whole corpus — the pilot default is **human**):

- **human** (pilot default): `{year}/{brandSlug}/{setSlug}/{number}_{side}.jpg`
  where `brandSlug`/`setSlug` = `norm()` of brand/set with spaces -> `-`.
- **token**: `{catalog_key_token}_{side}.jpg` where `catalog_key_token` = the catalog key
  with `|` -> `_` and spaces -> `-`.

The resolver should NOT re-derive paths from scratch on the read side beyond this: the
authoritative object path for a `(catalog_key, side)` lives in the `card_library` table
(`object_path` column). Prefer a lookup of `card_library` by `catalog_key` + `side`
(`is_canonical = true`, `status = 'active'`); fall back to deriving the path from the
convention only if a table read is unavailable.

---

## 2. The resolution order (everywhere cards render)

Define **one** new async resolver, e.g. `depotResolveCardArt(card, side)`, that returns a
URL string (or a pixel data-URL) and never returns blank. Resolution order **per card,
per side**:

1. **Personal photo (highest priority).** If the card has `photo_front_path` /
   `photo_back_path` for this side, resolve it via the EXISTING path —
   `depotResolveCardPhotos()` / `createSignedUrl(path, 3600)` against `card-images`.
   Personal scans always win; the library never overrides a user's own photo.
2. **Library public URL by catalog key (new middle tier).** Else, if the card has a
   non-NULL `catalog_key`, look up `card_library` for `(catalog_key, side)`; if an active
   canonical row exists, return its **public** URL (see §4 — plain public path, no signed
   URL). Log a `[depot] library-hit <catalog_key> <side>` on hit.
3. **Pixel front fallback (unchanged).** Else, for the FRONT, return
   `DepotPixelCard.renderDataURL(card, prestigeRes, opts)`. For the BACK, there is no pixel
   back — return the existing back placeholder behavior (blank/cardback asset as today).
   Log `[depot] library-miss <catalog_key> <side>` then `[depot] pixel-front <cardId>`.

Fail-loud requirement (AGENTS.md §4): every fallback STEP logs its reason with the key/id;
the resolver must never silently return an empty string. A NULL `catalog_key` skips step 2
entirely and logs `[depot] no-catalog-key <cardId> -> pixel/back`.

This is purely additive: step 1 and step 3 are today's behavior; step 2 is inserted
between them. Cards with a personal photo or a NULL key behave exactly as they do now.

---

## 3. Surfaces to change (each mapped to its current code path)

All four surfaces currently paint a card face from the same card object. The change is to
route each face-paint through `depotResolveCardArt(card, side)` instead of calling the
personal-photo resolver (or the pixel renderer) directly.

- **3.1 Add-a-Card (index.html).** See §5 — the headline win, with its own auto-fill
  behavior. Integration point: the confirmed-checklist-match handler where the card
  object is finalized before the photo upload UI is shown.
- **3.2 Binder (index.html).** The binder grid renders each owned card. Today each tile's
  image comes from `depotResolveCardPhotos()` (signed URL) or the pixel front. **Additive
  point:** swap the tile's image source to `depotResolveCardArt(card, side)`. Because
  library reads are plain public URLs, binder scrolling gets *cheaper* (no per-tile hourly
  signed-URL minting for library-backed cards). No layout/css change — same `<img>`, new
  `src`.
- **3.3 Builder (game/builder.html + js/depot-builder-shell.js).** The builder is a React
  bundle painting a lineup of card faces (the "lineup art hydration" point). There is no
  existing `hydrateLineupArt` symbol; the build step is to locate where the bundle sets a
  lineup card's face image and have it call `depotResolveCardArt(card, side)`. Because the
  bundle re-creates DOM on its own render clock (documented in `depot-game-shell.js`), the
  integration must be **idempotent and re-assertable** (resolve on each render, cache by
  catalog_key — see §4), not a one-shot mutation.
- **3.4 Game (game/index.html + game/sim.js).** `game/sim.js` is art-agnostic (verified:
  no photo/art symbols), so the sim itself is untouched. Card faces shown in the game HUD /
  nameplates / rip surfaces come from the bundle; route those the same way as the builder
  (§3.3). Pack pulls (`source:'pack'`) with a resolvable `catalog_key` now get **library
  art instead of the pixel placeholder** — the pack-art payoff noted in
  SHARED_LIBRARY_DESIGN.md §6; when no library art exists the pixel front still renders.

**Convergence note:** all four surfaces converge on the single `depotResolveCardArt`
resolver. That convergence is the point — one function to change if the resolution order,
bucket, or caching strategy ever moves. Do not fork per-surface logic.

---

## 4. Cache / URL strategy for public library images

Library images are **public-read** (SHARED_LIBRARY_DESIGN.md §2/§7.4), so consumption is a
plain public URL — **no signed URLs, no per-view minting**.

- **URL form:** a stable public URL for `card-library/{object_path}` (Supabase Storage
  `getPublicUrl`, or the equivalent stable public base + object path). The URL is
  **deterministic** for a given `(catalog_key, side)`, so it is safe to compute once and
  reuse — unlike the 1-hour signed personal URLs.
- **Browser-cacheable:** because the URL is stable and public, the browser HTTP cache and
  any CDN in front of Storage cache it for free across renders, surfaces, and sessions.
  Do not append cache-busting parameters to library URLs (that defeats the cache and, per
  privacy rules, keeps data out of the URL anyway).
- **In-memory memo (app side):** memoize `catalog_key -> {front,back} object_path/url`
  (e.g. a `Map`) so binder/builder/game re-renders and the bundle's re-render clock don't
  re-read `card_library` for the same card. Invalidate the memo only on an explicit
  library refresh (rare). This is what makes step 2 cheap under the builder/game re-render
  churn described in §3.3.
- **First-scan-wins immutability helps caching:** canonical library objects are stable
  (replaced only by an admin pointer flip, SHARED_LIBRARY_DESIGN.md §5), so long-lived
  browser/CDN caching is safe; a moderation replace is a new object path, which naturally
  cache-busts by URL.
- **Personal photos stay signed.** Do NOT convert `card-images` to public — it is private,
  owner-scoped, and stays on `createSignedUrl`. Only the library tier is public.

---

## 5. Add-a-Card auto-fill (the "friends don't re-scan" win)

When a rolodex/checklist pick resolves to a confirmed catalog match:

1. Derive `catalog_key` from the match (§1) and store it on the card (the additive
   `cards.catalog_key` column, SHARED_LIBRARY_DESIGN.md §7.1).
2. Immediately look up `card_library` for `(catalog_key, 'front')` and
   `(catalog_key, 'back')`. If library art exists, **show it immediately** in the
   Add-a-Card preview and **skip the upload step** — the card is complete without the user
   scanning anything.
3. **Upload remains available as an override.** The user can still choose to upload their
   own scan; if they do, it becomes their **personal** photo (`photo_*_path`, step 1 of the
   resolver, which outranks library art for that user). If the library slot for this
   `(catalog_key, side)` is empty, their upload may also auto-contribute per the
   contribution flow (SHARED_LIBRARY_DESIGN.md §3) — that is the ingestion/contribution
   slice, not this resolver slice; here we only *consume*.
4. If the pick has NO library art (miss), behave exactly as today: prompt for upload, and
   show the pixel front as the live preview until a scan is added.

UX intent: a confirmed pick with library art should feel "already done" — art appears, no
upload nag — while preserving full control to override with a personal scan.

---

## 6. Build order for the resolver slice (fresh-session checklist)

1. **Shared normalizer (JS).** Port `normalize.py` rules to a small client module; unit-test
   against the same fixtures the Python `test_ingest.py` uses (round-trip a handful of
   real numbers incl. `007A`->`7a`, an `RC`/`SV` strip, a `(VAR)` drop, a `1-2` combo->null).
2. **`catalog_key` on add.** Compute + persist `catalog_key` on confirmed checklist match
   (additive column already speced in SHARED_LIBRARY_DESIGN.md §7.1). Backfill existing
   rows with a one-off that reuses the same normalizer.
3. **`depotResolveCardArt(card, side)`.** Implement the 3-tier order (§2) with the memo/cache
   (§4) and fail-loud logs. Personal tier delegates to the existing
   `depotResolveCardPhotos`/`createSignedUrl`; pixel tier delegates to `DepotPixelCard`.
4. **Binder swap (§3.2).** Point binder tiles at the new resolver. Verify library-backed
   tiles load via public URL (no signed-URL request in the network panel) and personal
   photos still resolve.
5. **Add-a-Card auto-fill (§5).**
6. **Builder + Game face-paint routing (§3.3 / §3.4).** Idempotent, re-assertable against
   the bundle's render clock; memo-backed.
7. **Regression guards:** NULL-key cards -> pixel/back unchanged; personal photo always
   wins; pack pulls with a key now show library art, without a key still show pixel front.

---

## 7. Non-goals for this slice (explicit)

- Not the ingestion/contribution/upload-to-library path (that is tools/library-ingest/ +
  SHARED_LIBRARY_DESIGN.md §3 — a separate slice). This slice is **read/consume only**.
- No moderation UI (report/replace/remove — SHARED_LIBRARY_DESIGN.md §5).
- No schema change beyond the additive `cards.catalog_key` column already proposed.
- No change to `card-images` privacy, the personal signed-URL path, `game/sim.js`, or any
  css/js owned by the parallel redesign session.
- No economy values (the pack-art *hook* is noted; rewards live in ECONOMY_DESIGN.md).

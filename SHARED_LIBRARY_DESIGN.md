# SHARED_LIBRARY_DESIGN.md — The Shared Card Image Library

> **Status:** DESIGN-FIRST. Nothing here is built. All DDL, Storage bucket, and
> RLS/policy changes below are **proposed for Nick to run** — no schema or
> bucket-policy change has been executed by this session (per AGENTS.md §2:
> schema/DDL/RLS changes require human sign-off).
> **Merge:** docs-only, additive, no js/version.js bump.

---

## 0. Current state — audited, not assumed

Verified against main (file tree + raw source), not from the prompt.

**Storage model (today, in index.html):**
- One private bucket: card-images.
- Upload path is **owner-scoped**: {DEPOT_USER.id}/{DEPOT_COLLECTION_ID}/{cardId}_{side}.jpg
  (side = front | back), upsert: true, contentType image/jpeg.
- Reads use **per-view signed URLs**: createSignedUrl(path, 3600) — 1-hour expiry,
  minted every render. (This is exactly why signed URLs won't scale for a shared,
  broadly-read library: every viewer would mint a fresh URL for every card, every hour.)
- Card rows persist the storage path, not the URL: columns photo_front_path,
  photo_back_path. The signed URL is derived on load in depotResolveCardPhotos().

**The cards table (mapped in cardToRow / rowToCard):**
id, owner_id, collection_id, year (int), brand, set, number, player, team,
notes (packed JSON: pos/type/rare/stats/bio), tcdb_url, photo_front_path,
photo_back_path, created_at.

Two findings that matter for this design:
1. **There is no normalized catalog key on card rows.** The catalog identity
   (Year + Brand + Set + Number) exists only as **loose, free-text fields**
   (year, brand, set, number) filled at add time. Nothing guarantees they
   match a real checklist row, and nothing joins two users' "same card" together.
2. **A data quirk:** cardToRow sets brand: c.set — i.e. the row's brand column
   is populated from the card object's *set* field, and set is also c.set. So
   today brand and set on a row are effectively the same value. Any catalog-key
   normalization must not blindly trust the existing brand column; derive from the
   checklist match instead. **(Open question for Nick — see 9.)**

**The catalog / checklist (the natural shared key source):**
- A keyless, static rolodex: data/players.json + per-year data/cards-YYYY.json
  (arrays of {brand, set, number, player, team, notes, url}; **year comes from the
  filename**, not the record). 47 files, 1980–2026, ~155.8k rows total.
- Loaded lazily for Add-a-Card auto-fill; **year is injected from the file** the row
  came from. So the composite key is assembled as {fileYear}|{brand}|{set}|{number}.
- It is **static/read-only** (served from GitHub Pages), not a DB table today.

**Implication:** the shared library needs a *stable, canonical* catalog key that both
(a) the static checklist and (b) owned card rows can be reconciled to. That key does
not exist yet and is the first thing to define.

---

## 1. Problem 1 — Identity binding (the catalog key)

**Goal:** shared images must key on **catalog identity** (year/brand/set/number),
never on an owner's cards.id.

**Canonical key — recommendation.** Define a normalized, deterministic
catalog_key string:

    catalog_key = lower(
      norm(year) + '|' + norm(brand) + '|' + norm(set) + '|' + norm(number)
    )
    norm(): trim, collapse internal whitespace, strip diacritics (NFKD),
            lowercase, drop punctuation except digits/letters, and for number
            left-strip leading zeros but keep suffix letters (e.g. '007A' -> '7a').

Example: 1983 Topps #482 Tony Gwynn -> 1983|topps|topps|482
(brand and set are both "Topps" for base Topps; for inserts/subsets set diverges,
e.g. 1989|upper deck|upper deck high number|25).

**Where the key lives — recommendation:** add a nullable catalog_key text column to
cards (normalized **on the client at add time** from the checklist match, or
backfilled by a one-off script). It is *derived*, not user-typed. Keep the loose
year/brand/set/number fields as-is for display; catalog_key is the join handle.

**Cards that don't match the catalog (typos / off-catalog cards):**
- At add time, Add-a-Card already does checklist auto-fill. **Only compute
  catalog_key from a confirmed checklist match.** If the user free-types a card that
  matches no checklist row, leave catalog_key NULL -> that card simply never
  participates in the library (it can't be shared and won't pull library art). This is
  the safe default: **no fuzzy guessing binds two cards together.**
- Provide a lightweight "is this <checklist candidate>?" confirm step so near-misses
  can be snapped to canonical identity deliberately, not automatically.

**Alternatives considered:**
- *Hash the key* (store a UUID/sha256 of the composite) — cleaner as a storage
  filename, but opaque for debugging/admin. Recommendation: keep the human-readable
  composite as the logical key and, if a filesystem-safe token is needed, derive a
  short hash **for the path only**, keeping catalog_key legible in the DB.
- *A first-class catalog table* with a surrogate catalog_id PK that owned cards FK
  to. Cleanest long-term (see 8 Slice C) but heavier than v1 needs; the string key
  gets us there without a data-migration of the static checklist yet.
- *Fuzzy/ML matching for typos* — rejected for v1: false joins would show the wrong
  player's scan on someone's card. Explicit confirm only.

---

## 2. Problem 2 — Storage architecture

**Recommendation: a separate, public-read library prefix, populated by COPY.**

- New bucket **card-library** (or prefix library/ in a public bucket), **public read**.
- Object path keyed on catalog identity, **not** owner/collection:
  card-library/{catalog_key_token}_{side}.jpg where catalog_key_token is a
  filesystem-safe rendering of the key (slugified, or a short hash of catalog_key
  to avoid path-length/charset issues). One canonical object per (catalog card, side).
- **Public-read** (or a single long-lived/CDN URL), **not** per-view signed URLs.
  Rationale: a shared library is read by everyone, for every catalog card, constantly;
  minting hourly signed URLs per viewer per card does not scale and defeats caching.
  Public art is the norm for a community checklist (TCDB-style) and the images are, by
  design, non-private once contributed.
- **Writes only via a controlled path** (server-side / SECURITY DEFINER function or a
  narrow authenticated-insert policy on the library prefix — see 7). No arbitrary
  client writes to library paths.

**COPY vs REFERENCE — recommendation: COPY (independent object).**
The library object is an **independent copy** of the contributor's scan, written to
card-library/... The owner keeps their own card-images/{owner}/... object untouched.

Why copy, decisively:
- **Deletion safety:** if a user deletes their personal card (or their account), the
  library must not lose the image. A reference model would strip community art on a
  private delete — unacceptable for a shared collection.
- **Access-model mismatch:** personal objects live under owner-scoped, RLS-private
  paths; the library needs public-read. You can't cleanly "share" a private-scoped
  object without copying it into the public prefix anyway.
- Cost of duplication is small (one extra JPEG per *catalog* card, not per user).

**Alternatives considered:**
- *Reference the owner's object* — rejected (deletion/permission coupling above).
- *One public bucket, two prefixes* (personal/ private via RLS, library/ public)
  — viable and reduces bucket count; the tradeoff is getting per-prefix policies exactly
  right. Recommendation notes this as an acceptable substitute for a second bucket.

---

## 3. Problem 3 — Contribution flow

**Recommendation (simplest real v1): auto-contribute with opt-out, first-scan-wins.**

- **Seed:** Nick's existing ~18-card collection seeds the library on day one (a one-off
  backfill script copies each of Nick's scans that has a resolvable catalog_key into
  card-library/).
- **Ongoing:** every new upload with a confirmed catalog_key **auto-contributes** to
  the library **if no library image exists yet for that (catalog_key, side)**
  (**first-scan-wins**). A per-upload **"share to library" toggle, default ON** gives a
  clean opt-out for users who don't want a given scan public.
- **Two users, same card:** first contribution wins the canonical slot. A later,
  different scan of an already-covered card is **kept as an alternate** (see versioning
  below) but does **not** overwrite the canonical image in v1. No silent last-write
  clobber.

**Versioning — recommendation:** record every contribution as a row in
card_library_contributions (who, when, which object, status). The canonical image for
a (catalog_key, side) is chosen by an explicit is_canonical flag (default = first
accepted). "Best image selection" and community voting are **future** — v1 is
first-wins + admin override. This keeps a full audit trail and makes moderation
(replace/remove) a pointer change, not a destructive edit.

**Alternatives considered:**
- *Every upload silently auto-contributes, no toggle* — simplest, but no user control
  over making their scan public; rejected on privacy grounds.
- *Fully manual "contribute" button* — safest for consent, but starves the library;
  auto-with-opt-out is the better growth/consent balance for v1.
- *Last-write-wins* — rejected: lets a worse or wrong scan clobber a good canonical one.

---

## 4. Problem 4 — Consumption flow

**Resolution order per card, per side:** **personal image -> library image -> placeholder.**

- **Add-a-Card:** on a confirmed checklist match, look up the library by catalog_key
  and **pre-fill front/back** from library art automatically (the "friends don't
  re-scan" win). User can still replace with their own scan (which becomes their
  personal image, and may contribute if the slot is empty).
- **Binder / Builder / Game:** when a card has no personal photo_front_path /
  photo_back_path, render the **library image** for its catalog_key; if neither
  exists, render the existing **pixel-art placeholder**.
- **Mechanics:** because library art is public-read, consumption is a plain
  getPublicUrl (or a cached long-lived URL) keyed by catalog_key — no per-view
  signed-URL minting, so binder/builder scrolling stays cheap.

**Note on fail-loud (AGENTS.md 4):** the resolver must **log** each fallback step
([depot] library-miss <catalog_key>, [depot] placeholder <catalog_key>) rather than
silently returning a blank — consistent with the no-silent-guards rule.

---

## 5. Problem 5 — Trust & safety (moderation)

User scans visible to all users is a moderation surface. **Keep it minimal but real:**

- **Report:** any authenticated user can flag a library image (card_library_reports:
  reporter, catalog_key, side, reason, created_at). A flag does **not** auto-remove.
- **Replace:** because contributions are versioned (card_library_contributions),
  "replace" = flip is_canonical to a different accepted contribution (admin action,
  or auto-promote the next contribution if the canonical one is removed).
- **Admin (Nick) removal:** admin-only path to unset is_canonical / soft-delete a
  contribution (mark status='removed', hide the object; do **not** hard-delete in v1 —
  keep the audit trail; hard purge is a separate, deliberate admin action).
- **Client cannot delete library objects** (see 7): removal is admin-only, server-side.

This is deliberately small: report + admin replace/remove, backed by the contributions
table. No public voting/queues in v1.

---

## 6. Problem 6 — Economy interaction (hooks only, not designed here)

Flagging the seams to the (separate) economy design; **not designing the economy here.**
- **Packs granting catalog cards** can render **library art when it exists**, and the
  **pixel-art placeholder when it doesn't** — the library becomes the pack art source.
- **"First to scan this card"** is a natural **prestige / reward hook**: a bounty for
  contributing a missing scan (fills the library, earns the contributor something).
- **Coverage** (how many catalog cards have library art) is a community progress metric
  the economy could surface. Hooks noted; values/rewards belong in the economy doc.

---

## 7. Problem 7 — RLS / policy spec (PROPOSED — for Nick to run)

> **NOT EXECUTED.** Review, then run in Supabase yourself. Nick's call on names.
> Keys/URLs intentionally omitted.

**7.1 cards — add the derived key (additive column):**

    alter table public.cards add column if not exists catalog_key text;
    create index if not exists cards_catalog_key_idx on public.cards (catalog_key);

**7.2 Library metadata tables:**

    create table if not exists public.card_library (
      catalog_key   text not null,
      side          text not null check (side in ('front','back')),
      object_path   text not null,
      is_canonical  boolean not null default true,
      status        text not null default 'active'
                     check (status in ('active','removed')),
      contributor   uuid references auth.users(id),
      created_at    timestamptz not null default now(),
      primary key (catalog_key, side)
    );

    create table if not exists public.card_library_contributions (
      id            uuid primary key default gen_random_uuid(),
      catalog_key   text not null,
      side          text not null check (side in ('front','back')),
      object_path   text not null,
      contributor   uuid not null references auth.users(id),
      status        text not null default 'accepted'
                     check (status in ('accepted','removed')),
      is_canonical  boolean not null default false,
      created_at    timestamptz not null default now()
    );

    create table if not exists public.card_library_reports (
      id            uuid primary key default gen_random_uuid(),
      catalog_key   text not null,
      side          text not null,
      reporter      uuid not null references auth.users(id),
      reason        text,
      created_at    timestamptz not null default now()
    );

**7.3 RLS on metadata:**

    alter table public.card_library enable row level security;
    alter table public.card_library_contributions enable row level security;
    alter table public.card_library_reports enable row level security;

    -- library: world-readable (public checklist), no client writes
    create policy card_library_read on public.card_library
      for select using (true);

    -- contributions: contributor can see/insert own
    create policy clc_insert_own on public.card_library_contributions
      for insert to authenticated
      with check (contributor = auth.uid());
    create policy clc_read_own on public.card_library_contributions
      for select to authenticated
      using (contributor = auth.uid());  -- admin read via service role

    -- reports: any authenticated user may file; read own only
    create policy clr_insert on public.card_library_reports
      for insert to authenticated with check (reporter = auth.uid());
    create policy clr_read_own on public.card_library_reports
      for select to authenticated using (reporter = auth.uid());

> card_library canonical writes/updates happen **only** via a security definer
> function (contribution acceptance / admin replace), never via a client insert policy.
> Admin (Nick) actions run through the service role or an is_admin(auth.uid()) guard.

**7.4 Storage bucket + policies (card-library, public read):**

    -- create bucket as PUBLIC (public read) in dashboard or:
    insert into storage.buckets (id, name, public)
      values ('card-library','card-library', true)
      on conflict (id) do nothing;

    -- public read of library objects
    create policy card_library_public_read on storage.objects
      for select using ( bucket_id = 'card-library' );

    -- authenticated insert ONLY into the library prefix (first-scan-wins
    -- enforced server-side; this policy is the coarse guard)
    create policy card_library_auth_insert on storage.objects
      for insert to authenticated
      with check ( bucket_id = 'card-library' );

    -- NO client update/delete policy on card-library objects:
    -- removal/replace is admin-only via service role

> Personal card-images policies are **unchanged** (still owner-scoped, private,
> signed-URL read). This design only *adds* the public library alongside them.

---

## 8. Problem 8 — Slice plan

**Slice A — "friends don't re-upload" (playable immediately when league mode brings real second users).**
1. Add catalog_key column (7.1) + client-side normalizer; compute on confirmed
   checklist match at add time.
2. Create card-library public bucket + card_library table (7.2/7.4).
3. One-off backfill: copy Nick's ~18 scans (those with resolvable catalog_key) into
   the library, seed card_library.
4. Add-a-Card: on match, pre-fill front/back from library art (consumption via public URL).
   -> **Result:** the moment a second real user adds a card Nick already scanned, the
   image is there automatically.

**Slice B — auto-contribute + fallback rendering.**
1. "Share to library" toggle (default ON); first-scan-wins auto-contribution writes to
   card-library + card_library_contributions.
2. Binder/Builder/Game resolver: personal -> library -> placeholder, with fail-loud logs.

**Slice C — trust/safety + (optional) catalog table.**
1. Report + admin replace/remove (5), card_library_reports, admin promote/soft-remove.
2. *Optional* promotion of the static checklist into a first-class catalog table with a
   surrogate catalog_id that cards.catalog_key (or a FK) resolves to — only if/when
   the economy or league work needs server-side catalog queries.

---

## 9. Open questions for Nick

1. **The brand = c.set quirk:** today the cards.brand column is written from the
   card object's *set* value (cardToRow), so brand and set are effectively
   identical on rows. Should the key normalizer derive brand/set purely from the matched
   checklist record (recommended), and should we backfill/repair existing rows?
2. **Currency of consent:** default the "share to library" toggle **ON** (opt-out) as
   recommended, or **OFF** (explicit opt-in)? Opt-out grows the library faster; opt-in is
   more conservative on user consent.
3. **Public bucket vs signed long-lived:** OK to make card-library fully public-read
   (recommended, TCDB-style), or do you want library reads gated behind auth with a
   long-lived/CDN-cached signed URL instead?
4. **One bucket, two prefixes** (personal/ private + library/ public) **vs a second
   bucket** card-library? Fewer buckets vs simpler per-bucket policies.
5. **Backfill scope:** seed only cards with a clean checklist match, or also let you
   hand-map any of your ~18 that don't auto-match to canonical identity?
6. **Admin model:** is admin = a hardcoded is_admin(uid) allow-list (just Nick for now)
   via service role, or a profiles.role column? Affects the moderation policies in 7.
7. **Key collisions across sets:** confirm the 4-part key (year|brand|set|number) is
   granular enough for your checklist's insert/subset naming, or whether set needs a
   sub-qualifier for parallels/variations.

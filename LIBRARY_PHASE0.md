# LIBRARY_PHASE0.md — Shared Card-Image Library, Phase 0 (Discovery + Pipeline Design)

> **Status: DISCOVERY / DESIGN ONLY.** No uploads, no DDL executed, no ingestion run.
> This report inspects Nick's Google Drive card-set corpus and the repo catalog, then
> *proposes* an ingestion pipeline and the DDL/bucket policy for Nick to run. Nothing in
> the app, database, or Storage was changed by this session.
> **Merge:** docs-only, additive, self-merge per AGENTS.md §2. No js/version.js bump.
> **Companion:** SHARED_LIBRARY_DESIGN.md (identity/key/RLS design). This doc adds the
> real-world corpus evidence and the ingestion pipeline that design implies.

## 0. Repo state — verified, not assumed (AGENTS.md §0)

- main HEAD at audit: \`4f310d7\` — "docs(redesign): add REDESIGN_V2.md ...", author nickpeets,
  2026-07-17. That commit is the **parallel redesign session's** work (REDESIGN_V2.md +
  css/js/html). This report touches NONE of it; the only file added here is this doc.
- Confirmed present: \`data/index.json\`, \`data/cards-YYYY.json\` (47 year files 1980–2026),
  \`data/players.json\`, \`db/proposals/*.sql\`. \`LIBRARY_PHASE0.md\` did not previously exist.
- Catalog identity is loose free-text on card rows today; catalog_key does not exist yet
  (see SHARED_LIBRARY_DESIGN §0–1). This report's parsing targets that future key.

---

## 1. INVENTORY — Nick's Drive corpus

Source: Google Drive folder \`baseball_cards\` (Nick's authed session). Account storage shows
43.57 GB of 100 GB used, so a Google **100 GB (Google One)** tier is already in place.

- **Card-set zips: 197**, spanning **1952–2026 (75 distinct years)**.
- **Total corpus size (as stored, ZIP-compressed): ~6,392 MB = ~6.24 GB.**
- Excluded from the corpus count: \`Card Depot redesign concept.zip\` (52 KB) — that is the
  parallel redesign session's asset, **not** a card set.

**Per-brand zip counts:** Topps 75 · Bowman 37 · Donruss 36 · Upper-Deck 22 (21 "Upper-Deck"
+ 1 "UpperDeck") · Fleer 18 · Fleer-Tradition 9.

**Coverage shape:** 1952–1980 = Topps only (one zip/year). 1981+ adds Donruss/Fleer; 1989+
adds Score/Bowman/Upper Deck; late-90s Fleer becomes "Fleer-Tradition". Modern years
(2011–2026) are mostly Topps + Bowman + Donruss.

**Largest zips (ingest cost hot-spots):** 1989-Donruss 174.9 MB · 1990-Donruss 160.4 MB ·
1991-Donruss 147.1 MB · 1991-Upper-Deck 122.2 MB · 1987-Donruss 113.7 MB. **Smallest:**
2021-Bowman 4.4 MB · 2019-Bowman 4.5 MB · 2024-Bowman 4.5 MB.

Full per-zip name+size list was captured during the audit; the corpus is regular
\`{year}-{Brand}.zip\` except the variants noted in §2.

---

## 2. NAMING FORENSICS — verbatim evidence (the critical step)

Every zip unpacks to a **single top-level folder** \`{year}_{Brand}/\` (underscore),
containing paired \`_front.jpg\` / \`_back.jpg\` images. Format is **JPEG** throughout. Google
Drive's ZIP preview reports per-file size as "-" (not exposed) and caps the visible listing
at ~200 items per folder, so exact per-image dimensions/bytes require extraction in the
Codespace (the pilot step, §4). **Front/back pairing convention is universal:** identical
stem + \`_front.jpg\` / \`_back.jpg\`.

**There is NOT one naming convention. Four distinct families were found across the samples.
They are documented separately below — do NOT average them into one parser.**

### Variant A — Vintage numeric-only (sample: 1952_Topps_cards.zip → 1952_Topps/)
Zero-padded 3-digit number, **no player name**, underscore separator:
\`\`\`
001_back.jpg      001_front.jpg
002_back.jpg      002_front.jpg
010_back.jpg      010_front.jpg
\`\`\`
Grammar: \`{NNN}_{side}.jpg\`. Note the zip itself is oddly named \`1952_Topps_cards.zip\`
(underscores + trailing \`_cards\`) — the only zip using that pattern; its inner folder is
still \`1952_Topps/\`.

### Variant B — Vintage named, hyphen-joined (sample: 1980-Topps.zip → 1980_Topps/)
Zero-padded number joined to the name with a **hyphen**, name parts hyphenated, suffix token,
multi-player combos concatenate both names:
\`\`\`
001-Lou-Brock-Carl-Yastrzemski-HL-back.jpg    001-...-HL-front.jpg
004-Pete-Rose-HL-back.jpg                     004-Pete-Rose-HL-front.jpg
010-Denny-Martinez-back.jpg                   010-Denny-Martinez-front.jpg
\`\`\`
Grammar: \`{NNN}-{Name-Parts}[-{SUFFIX}]-{side}.jpg\`. Suffix seen: \`HL\` (Highlight).

### Variant C — 80s named, unpadded + underscore-after-number (samples: 1983-Topps, 1989-Fleer)
**Unpadded** number, underscore after the number, hyphens within the name, suffix token:
\`\`\`
1-2_Billy-Gardner-MGR_back.jpg      1-2_Billy-Gardner-MGR_front.jpg   (1983 Topps)
100_Pete-Rose_back.jpg              100_Pete-Rose_front.jpg           (1983 Topps)
101_Pete-Rose-SV_back.jpg          101_Pete-Rose-SV_front.jpg        (1983 Topps)
106_Eric-Bullock-RC_back.jpg        106_Eric-Bullock-RC_front.jpg     (1989 Fleer)
10_Dave-Henderson_back.jpg          10_Dave-Henderson_front.jpg       (1989 Fleer)
\`\`\`
Grammar: \`{number}_{Name-Parts}[-{SUFFIX}]_{side}.jpg\`. Suffixes seen: \`MGR\` (manager),
\`SV\` (Super Veteran), \`RC\` (Rookie Card). Combo/leader cards use a hyphenated **number**
like \`1-2\`. Files sort lexically (…, 100, 101, …, 10, 11) confirming numbers are unpadded.

### Variant D — Modern underscore-everywhere + (VAR) parallels (sample: 2021-Topps.zip → 2021_Topps/)
Zero-padded number **with a lowercase letter variant suffix**, underscores throughout the
name (name parts NOT hyphenated), a \`(VAR)\` token on variations, "Jr." keeps its period:
\`\`\`
001_Fernando_Tatis_Jr._back.jpg            001_Fernando_Tatis_Jr._front.jpg
001b_Fernando_Tatis_Jr._(VAR)_back.jpg     001b_..._(VAR)_front.jpg
001c_Fernando_Tatis_Jr._(VAR)_back.jpg     001c_..._(VAR)_front.jpg
003b_Matt_Chapman_(VAR)_back.jpg           004b/004c/004d_David_Bote_(VAR)_...
\`\`\`
Grammar: \`{NNN}[a-z]_{Name_Parts}[_(VAR)]_{side}.jpg\`. Multiple lettered variations per base
number (\`001b\`, \`001c\`, \`004b\`, \`004c\`, \`004d\`).

**Summary of the moving parts a parser must handle, and they vary independently by era:**
number padding (padded A/B/D vs unpadded C); number/name separator (\`_\` A/C/D vs \`-\` B);
name-internal separator (\`-\` B/C vs \`_\` D); presence of a name at all (absent in A);
letter variant on the number (D only); a \`(VAR)\` token (D only); trailing role suffixes
\`HL/MGR/SV/RC\` (B/C); hyphenated combo numbers like \`1-2\` (C). **This is a per-era parser
family, not one regex.**

---

## 3. MATCH-RATE DRY RUN — sampled filenames vs the checklist catalog

**Method + honesty note.** A true file-by-file diff needs the full in-zip file list, which
Drive's preview caps at ~200 and which is only fully enumerable after extraction in the
Codespace (the pilot). So this dry run is **structural**: for each sampled zip I parsed the
observed filename grammar into a catalog number using the SHARED_LIBRARY_DESIGN normalizer
(trim, lowercase, **left-strip leading zeros but keep any trailing letter suffix**, drop
player name and role suffixes and the \`(VAR)\` token), then tested membership against the
actual \`data/cards-YYYY.json\` number set for that {year, set}. The percentages below are the
expected base-set match rate; exact tail counts come from the pilot.

### 1983-Topps  →  catalog set "Topps" (data/cards-1983.json)
- Catalog "Topps" rows: **792**, all plain integers, **zero letter-suffix numbers**.
- Every straight numeric filename (\`100\`, \`101\`, …) parses and **matches**.
- **Expected match: ~99% of base-set files.**
- **Fallout — combo/leader numbering:** filename \`1-2_...\` (a two-number leader card) has no
  \`1-2\` row; the catalog holds \`1\` and \`2\` separately. A handful of these per vintage set.
  Category: **set-numbering mismatch (combo cards)**.

### 1989-Fleer  →  catalog set "Fleer" (data/cards-1989.json)
- Catalog "Fleer" rows: **703** (44 carry a letter suffix). All sampled files
  (\`100\`, \`101\`, \`106-RC\`, \`10\`) parse and **match** — the \`RC\` role suffix is dropped and the
  base number \`106\` is in the catalog.
- **Expected match: ~97–99% of base-set files.**
- **Fallout — role suffix (\`RC\`/\`SV\`/\`MGR\`):** never appears in the catalog \`number\` field
  (it lives in \`notes\`), so the parser MUST strip it or it will miss. Correctly handled = no
  loss. Category noted so the parser rule is explicit.
- The 1989 catalog year has **32 sets across 6 brands** (Topps Tiffany, Bowman, subsets…),
  but the zip is one brand's flagship set. So the library will **cover the base set and leave
  subsets on placeholder** — that is coverage scope, not a mismatch.

### 2021-Topps  →  catalog set "Topps" (data/cards-2021.json)
- Catalog year has 3 sets (Bowman/Donruss/Topps), 1,948 rows; **"Topps" = 933 unique
  normalized numbers, of which 333 carry a letter-variant suffix** (\`1b\`, \`1c\`, \`3b\`,
  \`660b\`, \`660c\`, …). This is the crucial finding: **the catalog already models the \`(VAR)\`
  parallels** as suffixed numbers.
- Filename \`001b_..._(VAR)\` → normalize \`001b\`→\`1b\` → **matches catalog \`1b\`**. So the
  variant files are matchable *if and only if* the parser keeps the letter suffix and drops
  \`(VAR)\` + the name.
- **Expected match: ~95%+**, contingent on the letter-suffix rule. If a naive parser stripped
  the letter, all 333 variants would collapse onto their base number and mismatch/collide.

**Verdict:** with a correct per-era parser this is **a script, not a cleanup project** —
base-set match rates are ~95–99%. The residual fallout is small and *categorical*, not noise:
1. **Combo/leader numbers** (\`1-2\`) — vintage, a few per set → review report.
2. **Role suffixes** (\`RC/SV/MGR/HL\`) — solved by a strip rule, not fallout if handled.
3. **Letter-variant numbers + \`(VAR)\`** — matchable *only* with keep-suffix normalization.
4. **Subset coverage gap** — zips are flagship sets; catalog subsets stay on placeholder.
5. **Player-name variants** — irrelevant to matching here: the join key is number, not name;
   the name in the filename is decorative and discarded (so name spelling never blocks a match).

---

## 4. PIPELINE PROPOSAL — ingestion in the Codespace

Flow per zip: **download zip → per-era parse to catalog_key → verify against catalog →
compress → upload to \`card-library\` → append manifest ledger row**. Runs in the Codespace
(bandwidth + CPU), never in the browser.

**4.1 Canonical library image size — recommendation: 1000 px on the LONG edge, JPEG q82.**
Reasoning: personal scans compress to 600 px because they are a per-user override, not the
source of truth. The library is the canonical, community-facing art, rendered in the binder
grid and enlarged in Add-a-Card, so it needs more than 600 px but not print resolution.
900–1200 px long-edge is the sweet spot for a ~2.5×3.5" card viewed on screen; **1000 px**
sits in the middle and keeps storage sane. **Hard constraint discovered in §2:** the Drive
scans are already small (corpus avg ≈ 24 KB/file), so the source resolution is modest — the
pipeline must **downscale-only, never upscale**: \`target = min(1000, source_long_edge)\`.
Re-encoding cannot invent detail the scan never had.

**4.2 Storage math (corpus's actual scan sizes vs Supabase tiers).**
- Corpus as stored on Drive (ZIP/JPEG): **~6.24 GB** — already **6× the Supabase Free 1 GB**
  bucket. Free tier is a non-starter for the full corpus regardless of resize.
- Estimated canonical objects (front+back across ~197 sets): **~276k–394k JPEGs**
  (≈700–1000 cards/set × 2). At empirical card-JPEG sizes:
  - 600 px (~40 KB): **~10.5–15 GB**
  - **1000 px (~110 KB): ~29–41 GB**  ← recommended target band
  - 1200 px (~150 KB): **~40–56 GB**
- **Conclusion:** the library needs **Supabase Pro (100 GB included)**. At the recommended
  ~1000 px the library lands ~30–40 GB — comfortably inside Pro with headroom for personal
  scans and growth. (Because source scans are small, real output may skew to the low end.)

**4.3 Resumability — a manifest ledger, keyed per file.**
Append-only JSONL (or a Postgres table) with **one row per source image**, keyed on
\`{zip}/{inner_filename}\`. Status ∈ \`done | skipped | failed | unmapped\`. On rerun the pipeline
**skips any row already \`done\`** (idempotent — mirrors the AGENTS.md §4 lesson: the dedupe
unit is the individual file, and the skip check is a ledger lookup, not a re-derive). A
failure is **logged, not fatal** — the run continues and the file is retried next pass.

**4.4 Unmappable files — never silently dropped.**
Any file whose parse yields no catalog match is written to a **review report**
(\`unmapped_{zip}.csv\`: filename, parsed number, guessed set, reason) and marked \`unmapped\`
in the ledger. Nick reviews these (combo numbers, off-catalog inserts, typos) and can
hand-map or skip. Consistent with AGENTS.md §4 "fail loud, log the reason."

**4.5 Rollout — ONE zip end-to-end as the pilot before any bulk run.**
Recommended pilot: **1989-Fleer.zip** (mid-size, named files, has RC suffix and a subset-heavy
year — exercises the parser's hard cases without being a 175 MB monster). Run it fully:
download → parse → resize → upload → manifest → review report. Nick eyeballs a dozen resulting
\`card-library\` objects against the binder before authorizing the bulk 197-zip run.

---

## 5. DDL / BUCKET-POLICY PROPOSAL (for Nick to run — DO NOT execute; per AGENTS.md §2)

> These are proposed only. Names are Nick's call. Aligned with SHARED_LIBRARY_DESIGN §7.
> **Path note:** the prompt's human-readable path \`{year}/{brand}/{setSlug}/{cardNumber}_front.jpg\`
> is used below for legibility/debuggability; it is functionally equivalent to the design's
> \`{catalog_key_token}_{side}.jpg\` (both are a deterministic rendering of catalog identity).
> Pick one and keep it stable. A short hash fallback avoids charset/length issues if a
> setSlug is nasty.

\`\`\`sql
-- 5.1 Storage bucket: public-read library (NOT signed-URL; shared art is read constantly)
insert into storage.buckets (id, name, public)
values ('card-library', 'card-library', true)
on conflict (id) do nothing;

-- public read of every library object
create policy card_library_public_read on storage.objects
  for select using ( bucket_id = 'card-library' );

-- WRITE is restricted: ingestion runs via the service role (Codespace), which bypasses RLS.
-- Do NOT add a broad client insert policy. If you want authenticated first-scan-wins later,
-- gate it behind a SECURITY DEFINER function, not a raw client insert.
-- NO client update/delete policy: replace/remove is admin-only via service role.

-- 5.2 Derived catalog key on card rows (additive, nullable; computed on confirmed match)
alter table public.cards add column if not exists catalog_key text;
create index if not exists cards_catalog_key_idx on public.cards (catalog_key);

-- 5.3 Canonical library index (one row per catalog card + side)
create table if not exists public.card_library (
  catalog_key  text not null,
  side         text not null check (side in ('front','back')),
  object_path  text not null,
  is_canonical boolean not null default true,
  status       text not null default 'active' check (status in ('active','removed')),
  contributor  uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  primary key (catalog_key, side)
);
alter table public.card_library enable row level security;
create policy card_library_read on public.card_library for select using (true);
-- writes only via service role / SECURITY DEFINER (no client insert policy)

-- 5.4 Ingestion manifest ledger (resumability, one row per SOURCE file)
create table if not exists public.card_library_manifest (
  id            bigint generated always as identity primary key,
  source_zip    text not null,
  source_file   text not null,
  catalog_key   text,
  side          text check (side in ('front','back')),
  object_path   text,
  status        text not null check (status in ('done','skipped','failed','unmapped')),
  reason        text,
  created_at    timestamptz not null default now(),
  unique (source_zip, source_file)
);
\`\`\`

---

## 6. APP-SIDE RESOLVER INTEGRATION (spec only — do not build)

Resolution order **per card, per side: personal → library → pixel-art placeholder**
(SHARED_LIBRARY_DESIGN §4). Anchored to the module's own script URL via the AGENTS.md
\`_dataURL\` rule — never page-relative — so it survives being mounted from root (\`index.html\`)
and from \`game/\` at different depths (the bug that bit twice).

- **personal:** existing owner-scoped \`card-images/{owner}/{collection}/{cardId}_{side}.jpg\`
  via signed URL (unchanged; \`photo_front_path\`/\`photo_back_path\`).
- **library:** if no personal path, \`getPublicUrl('card-library', pathFor(catalog_key, side))\`
  — a plain public URL, cacheable, no per-view signed-URL minting (that is why the library is
  public-read and why binder/builder scrolling stays cheap).
- **placeholder:** if neither, the current pixel-art front.
- **Fail-loud (AGENTS.md §4):** log each fallback — \`[depot] library-hit <key>\`,
  \`[depot] library-miss <key>\`, \`[depot] placeholder <key>\` — never a silent blank.
- Catalog rows carry \`.player\`; any consumer routes through
  \`catalogCardToPrestigeShape()\` (AGENTS.md §3), including this resolver's Add-a-Card prefill.

---

## 7. NUMBERED DECISIONS FOR NICK

1. **Approve the corpus scope:** 197 zips, 1952–2026, ~6.24 GB. Ingest all, or start with a
   subset (e.g. Topps flagships only) for v1?
2. **Canonical library size:** approve **1000 px long-edge, JPEG q82, downscale-only**? Or
   pick 900 or 1200 (storage bands in §4.2). Note scans are small; upscaling is impossible.
3. **Supabase tier:** confirm **Pro (100 GB)** — Free (1 GB) cannot hold even the compressed
   corpus. The library lands ~30–40 GB at 1000 px.
4. **Path scheme:** human-readable \`{year}/{brand}/{setSlug}/{number}_{side}.jpg\` (this doc)
   vs the design's \`{catalog_key_token}_{side}.jpg\`. Pick one canonical form.
5. **Parser strategy:** accept a **per-era parser family** (four grammars, §2) with a strict
   **keep-letter-suffix / strip-role-suffix / drop-(VAR)** number normalizer. Confirm the
   normalizer rule so 2021 \`(VAR)\` parallels match their \`1b/1c\` catalog rows.
6. **Fallout handling:** confirm unmapped files go to a **review CSV** (combo numbers, off-
   catalog inserts) and are never silently dropped; you hand-map or skip.
7. **Run the DDL in §5 yourself** (bucket + \`catalog_key\` column + \`card_library\` +
   manifest). This session did not and will not execute schema/bucket changes.
8. **Approve the pilot:** run **1989-Fleer.zip** end-to-end first; verify a dozen objects in
   the binder before the bulk 197-zip run.
9. **Contribution/consent + admin model:** the open questions in SHARED_LIBRARY_DESIGN §9
   (share-toggle default, public vs signed, one-bucket-two-prefixes, admin model) still stand
   — they gate Slice B/C, not this Phase-0 pilot.

---

**STOP.** Ingestion begins only after Nick (a) runs the DDL in §5, (b) approves the pipeline
and canonical size, and (c) approves the pilot zip. This session performed discovery and
design only: no uploads, no DDL, no ingestion.

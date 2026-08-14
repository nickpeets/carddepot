# BINDER_AUDIT.md — item 1.5, the full binder audit

Status: **harness built and dry-run verified; the real run is PENDING one
action from Nick.** Written 2026-08-14. ZERO writes anywhere — the backfill
write to card rows remains gated on Nick's one-word approval and this audit
runs dry regardless.

## What this is

The 2026-08-14 amended ruling: **every single-player card is PLAYABLE** —
"couldn't find stats" is always a bug, never an answer. This audit enumerates
the gap between that ruling and the binder, one row per card, by running the
REAL resolver (the item-1 ladder version: pitching lookup, rungs 1–3) headless
over all 126 cards and classifying every outcome into the brief's categories:

- **a — PITCHER**: should RESOLVE after item 1. Any pitcher still failing is
  an item-1 acceptance failure; the tool flags it loud.
- **b — CAREER-YEAR**: printed year has no line; resolves via rung 2 (best
  season), labelled.
- **c — AMBIGUOUS NAME**: needs an ID override in `ROOKIE_ID_OVERRIDES`
  (which now feeds stat resolution too). Mike Stanton is pinned already;
  Sandy Alomar / Frank Thomas / Ramon Castro wait for this audit's card
  years — era decides, not name.
- **d — STRUCTURAL**: checklists, team cards, multi-player, managers. NOT
  playable BY DESIGN; the honest "collectible, not fieldable" label, never
  "no stats recorded yet". Detected with the page's real
  `depotPlayableReason`, not a copy.
- **e — ZERO-MLB** (the Bibbs class): rung 3 resolves these to their best
  MiLB season, marked MiLB. Anything rung 3 also misses is LISTED FOR NICK —
  manual stats is the floor, his call per card.
- **f — OTHER**: new failure modes get named, never force-fit.

## How to run it

Open any signed-in page on **thedepot.cards**, paste `tools/audit_binder.js`
into the console, then:

    await depotAuditBinder()

The markdown table lands in `window.__BINDER_AUDIT_MD` and on the console;
paste it over the PENDING section below. The tool makes **no writes of any
kind** — no card-row update, no persist, no RPC.

## Why the real run has not happened yet

The audit reads the binder through the live site's authenticated Supabase
client (the AGENTS.md §0.1 path), so it sees whichever account the browser
is signed in as. At harness-build time the browser session was signed in as
`lastcall.love.app@gmail.com` (uid 425464ec…), **not Nick's account**
(9e4e47d2…). RLS correctly scopes cards to the signed-in owner, so running
then would have audited the wrong binder. **Nick: sign in to thedepot.cards
as your own account and say go** — the run itself takes ~2–3 minutes of
statsapi round-trips for 126 cards.

## Acceptance (from the brief)

After fixes land and the audit re-runs: every card is either RESOLVED with
real numbers or STRUCTURAL/ZERO-MLB with an honest label. Zero cards resting
at "no line" for fixable reasons. Named specimens: Schulze (rung 2 via
pitching lookup — already verified resolving to best-season 1986, 5.00 ERA),
a Bibbs-class card if the binder has one (rung 3 — Bibbs himself verified
resolving to his 2005 AA line, marked MiLB), the Francona (structural, honest
label), Mike Stanton (override — verified resolving to the reliever's real
1993, 4.67 ERA).

## RESULTS — PENDING THE REAL RUN

*(paste `window.__BINDER_AUDIT_MD` here)*

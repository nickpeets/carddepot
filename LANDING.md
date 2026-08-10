# Carddepot P0 wave — landed-branches bundle (fallback landing path)

The cloud session applied and verified the entire v3 wave but the session's git
proxy has no push credential for nickpeets/carddepot. This bundle contains the
**finished branches** (not patches) — fetch and push, nothing to re-apply.

Built off `origin/main` @ `3055fa4`. All five code branches were restamped
FRESH at their true substantive tips (the v3 zip's stamps embedded the
7f61a73-era tips; base moved again, so per the addendum the stamps were dropped
and re-cut). Verified per branch: 91 `?v=` tags / 7 shells / 1 distinct hash,
`BUILD` == substantive tip, `rd_check --css css/depot-redesign.css` ALL CHECKS
PASSED, `node --check` green on every changed JS file.

## Refs in the bundle

| ref | tip | substantive tip / note |
|---|---|---|
| fix/record-integrity-vs-hygiene | 8bf7d56 | dc9482b (record fix → settlement self-match fix → stamp) |
| feat/auth-recovery-signup | 7331862 | 7661b05 |
| feat/share-site-chrome | 2df8445 | 499f1c5 |
| feat/shop-boot-skeleton | bf94054 | 782d51b |
| chore/console-hygiene | 9d395e9 | 34a909c |
| chore/remove-zips | 4c1da1b | verbatim message from the notes |
| chore/remove-wave-handoff-zips | e01fbb1 | removes ALL THREE handoff zips (patches, v2, v3) |
| design-assets | 2a3e277 | orphan branch, complete history — push, **NEVER merge** |

## Land it (from the Codespace, repo at origin/main 3055fa4 or later)

```bash
git bundle verify carddepot-p0-wave-landed.bundle
git fetch carddepot-p0-wave-landed.bundle 'refs/heads/*:refs/heads/*'
git push origin fix/record-integrity-vs-hygiene feat/auth-recovery-signup \
  feat/share-site-chrome feat/shop-boot-skeleton chore/console-hygiene \
  chore/remove-zips chore/remove-wave-handoff-zips design-assets
```

Then open PRs for the seven code/chore branches (design-assets gets NO PR — it
never merges).

## Merge order (Nick merges, --no-ff, web UI)

1. fix/record-integrity-vs-hygiene
2. feat/auth-recovery-signup
3. feat/share-site-chrome
4. feat/shop-boot-skeleton
5. chore/remove-zips, chore/remove-wave-handoff-zips (any time)
6. chore/console-hygiene LAST — overlaps PR-D in depot-core/depot-shell/
   season.js/depot-vs.js. Module hunks are disjoint; the stamp commits WILL
   conflict on every merge after the first. Do not hand-resolve 91 tags:
   rerun `python3 tools/rd_stamp.py <new tip>` and commit fresh. If
   depot-vs.js conflicts, redo the mechanical PR-E transform
   (`console.log(` → `(window.depotLog||function(){})(`) rather than fight
   the hunk.

## db/proposals — NEVER execute from a session

INVENTORY_test_debris.sql (read-only), CLEANUP_test_debris.sql (destructive,
gated), REVERSAL_self_match_settlements.sql (13 self-match payouts, pinned
count, idempotent). They land as files in fix/record-integrity-vs-hygiene and
are Nick-runs-in-SQL-editor proposals only.

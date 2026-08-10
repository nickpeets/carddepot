PASTE THIS TO THE CODESPACE AGENT
(after the zip is uploaded to https://github.com/nickpeets/carddepot/upload/main)
================================================================

V2 DESIGN HANDOFF — Claude Design's build_package v2 is on main as a zip. Land it durably; do NOT build from it yet.

1. Pull, extract to build_package/ at the repo root, replacing v1 (v1 is superseded but stays recoverable on origin/design-assets). Keep build_package/ untracked per .gitignore. Verify: "Depot - Complete Design v2.dc.html", 51 PNGs across exports/desktop and exports/mobile-390, README.md with the ten rules and the OQ table. Report file count and any PNG decode failures.

2. git rm the zip from main, commit the removal, push.

3. DURABLE COPY: commit the extracted v2 package to the design-assets orphan branch (v1 must remain recoverable in that branch's history). Report the branch tip.

4. READ AND REPORT BACK, verbatim: the ten rules; the full chapter-to-export map with status badges; Chapter 21's retired-vs-canon table; and all seven OQ boxes with whatever options each sketches. Nick answers those before any build starts.

No building, no stamps, no PRs beyond the zip removal.

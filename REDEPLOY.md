Redeploy marker to trigger a fresh GitHub Pages build/deploy of the current main tree. Additive, no code changes.
Redeploy attempt 2: superseding stuck deploy run #102/attempt2 (server-side Pages queue). Additive, no code changes.
Redeploy attempt 3: Session 3 version bump deploy (pages-build-deployment #132 for PR #68 failed server-side); re-trigger so js/version.js publishes 94ff9b7. Additive, no code changes.
Redeploy attempt 4: Session 4 builder merge (PR #70) + version bump PR #71 deploy failed server-side (pages-build-deployment for ec09752); re-trigger so js/version.js publishes 4f174b4. Additive, no code changes.
Redeploy attempt 5: PR #93 version bump (js/version.js -> a125075, the PR #92 game-controls fix merge) deployed the code (depot-game-shell.js is live) but the version.js marker stayed cached at 888b61e past the ~15min window; re-trigger so js/version.js publishes a125075. Additive, no code changes.

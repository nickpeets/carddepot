/* js/version.js — Card Depot build marker.
 *
 * Loaded FIRST by all three pages (index.html, game/builder.html, game/index.html).
 * Logs the deployed commit short-hash on load so the live build can be verified after
 * every merge (see AGENTS.md section 5). BUMP THIS on every merge to the new deployed
 * commit short-hash.
 */
(function () {
  // Deployed commit short-hash. Bumped on every merge (AGENTS.md section 5).
  var BUILD='28b1810';
  window.DEPOT_BUILD = BUILD;
  try {
    (window.depotLog||function(){})('[depot] build ' + BUILD);
  } catch (e) {
    /* console unavailable: still expose window.DEPOT_BUILD */
  }
})();

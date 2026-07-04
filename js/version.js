/* js/version.js — deployed build marker.
 * Holds the deployed commit short-hash; loaded first by all three pages
 * (index.html, game/index.html, game/builder.html). Logs the build on load.
 * Convention (AGENTS.md): every merge to main bumps DEPOT_BUILD to the new
 * deployed short-hash, so the live console proves which commit is serving.
 */
(function () {
  "use strict";
  var DEPOT_BUILD = "PENDING";
  window.DEPOT_BUILD = DEPOT_BUILD;
  try { console.log("[depot] build " + DEPOT_BUILD); } catch (e) {}
})();

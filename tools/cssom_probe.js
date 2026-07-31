/* tools/cssom_probe.js - the redesign's before/after computed-style witness.
 *
 * The de-inline pass moves styling out of inline style="" attributes and into
 * shared classes. "It still looks right" is not a check. The check is that
 * every element's used geometry AND computed style are unchanged, so:
 *
 *   fetch('tools/cssom_probe.js').then(function(r){return r.text()}).then(eval)
 *   __rdProbe.save('before')          // on the parent commit
 *   ...edit, hard reload...
 *   __rdProbe.diff('before')          // {same, changed[], added[], removed[]}
 *
 * Keys are STRUCTURAL (tag + child index), never class-based, because the
 * entire point of the change is that class names move. If the DOM shape
 * shifts, the key sets stop matching and the diff reports added/removed
 * instead of silently comparing two different nodes.
 *
 * Geometry is stored RELATIVE to each root, so scroll position cannot show up
 * as a false delta.
 *
 * RUNBOOK 3.6: it prints what it compared, and an empty snapshot is a HARD
 * FAILURE rather than a vacuous pass.
 */
(function (global) {
  'use strict';

  var PROPS = ('display position top right bottom left float clear box-sizing ' +
    'width height min-width min-height max-width max-height ' +
    'margin-top margin-right margin-bottom margin-left ' +
    'padding-top padding-right padding-bottom padding-left ' +
    'border-top-width border-right-width border-bottom-width border-left-width ' +
    'border-top-style border-right-style border-bottom-style border-left-style ' +
    'border-top-color border-right-color border-bottom-color border-left-color ' +
    'border-top-left-radius border-top-right-radius ' +
    'border-bottom-right-radius border-bottom-left-radius ' +
    'background-color background-image background-size background-position ' +
    'background-repeat background-clip background-origin ' +
    'box-shadow opacity filter mix-blend-mode ' +
    'color font-family font-size font-weight font-style line-height ' +
    'letter-spacing text-align text-transform text-decoration-line ' +
    'white-space text-overflow word-break ' +
    'flex-direction flex-wrap flex-grow flex-shrink flex-basis ' +
    'align-items align-self justify-content order gap row-gap column-gap ' +
    'grid-template-columns grid-template-rows grid-auto-flow ' +
    'aspect-ratio object-fit object-position ' +
    'overflow-x overflow-y visibility z-index cursor pointer-events ' +
    'transform transform-origin perspective backface-visibility ' +
    'animation-name animation-duration transition-property transition-duration ' +
    'outline-width outline-style outline-color').split(/\s+/);

  var DEFAULT_ROOTS = ['.rd-header', '.depot-shell__nav', '#eraTabs',
                       '#binderGrid', '#spotlight'];
  var CAP = 4000;

  function r2(n) { return Math.round(n * 100) / 100; }

  function pathOf(el, root, name) {
    var parts = [];
    var n = el;
    while (n && n !== root) {
      var p = n.parentNode;
      if (!p) { break; }
      var i = 0, k = 0;
      for (; k < p.children.length; k++) { if (p.children[k] === n) { i = k; break; } }
      parts.unshift(n.tagName.toLowerCase() + '[' + i + ']');
      n = p;
    }
    return name + (parts.length ? '>' + parts.join('>') : '');
  }

  function snap(roots, doc) {
    doc = doc || document;
    roots = roots || DEFAULT_ROOTS;
    var win = doc.defaultView || global;
    var out = { meta: { w: win.innerWidth, h: win.innerHeight, roots: [], n: 0 }, nodes: {} };
    var count = 0;

    for (var ri = 0; ri < roots.length; ri++) {
      var sel = roots[ri];
      var root = doc.querySelector(sel);
      if (!root) { out.meta.roots.push(sel + ' MISSING'); continue; }
      var rootRect = root.getBoundingClientRect();
      var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
      for (var i = 0; i < all.length; i++) {
        if (count >= CAP) { out.meta.capped = true; break; }
        var el = all[i];
        var cs = win.getComputedStyle(el);
        var rect = el.getBoundingClientRect();
        var s = {};
        for (var pi = 0; pi < PROPS.length; pi++) { s[PROPS[pi]] = cs.getPropertyValue(PROPS[pi]); }
        out.nodes[pathOf(el, root, sel)] = {
          r: [r2(rect.left - rootRect.left), r2(rect.top - rootRect.top),
              r2(rect.width), r2(rect.height)],
          s: s
        };
        count++;
      }
      out.meta.roots.push(sel + ' (' + all.length + ' nodes)');
    }
    out.meta.n = count;
    return out;
  }

  /* Snapshots of a grouped binder run to hundreds of nodes x ~95 properties,
     which blows the 5MB localStorage quota. The parent page is never reloaded
     (only the measured iframe is), so memory is both the correct store and the
     cheap one. localStorage stays available via persist=true for the case where
     the measured page IS the page you have to reload. */
  var _mem = {};

  function save(key, roots, doc, persist) {
    var s = snap(roots, doc);
    if (!s.meta.n) { throw new Error('cssom_probe: snapshot is EMPTY - none of the roots resolved: ' + s.meta.roots.join(' | ')); }
    _mem[key] = s;
    if (persist) { localStorage.setItem('rdprobe:' + key, JSON.stringify(s)); }
    console.log('[cssom_probe] saved "' + key + '": ' + s.meta.n + ' nodes @ ' + s.meta.w + 'x' + s.meta.h);
    console.log('[cssom_probe] roots: ' + s.meta.roots.join(' | '));
    return s.meta;
  }

  function diff(key, roots, doc) {
    var before = _mem[key];
    if (!before) {
      var raw = localStorage.getItem('rdprobe:' + key);
      if (!raw) { throw new Error('cssom_probe: no saved snapshot "' + key + '"'); }
      before = JSON.parse(raw);
    }
    var after = snap(roots, doc);
    if (!after.meta.n) { throw new Error('cssom_probe: AFTER snapshot is EMPTY'); }
    if (before.meta.w !== after.meta.w) {
      console.warn('[cssom_probe] viewport differs (' + before.meta.w + ' -> ' + after.meta.w + '); geometry deltas below are NOT meaningful');
    }

    var res = { key: key, viewport: after.meta.w + 'x' + after.meta.h,
                comparedBefore: before.meta.n, comparedAfter: after.meta.n,
                same: 0, changed: [], added: [], removed: [] };

    for (var k in after.nodes) { if (!(k in before.nodes)) { res.added.push(k); } }
    for (var k2 in before.nodes) { if (!(k2 in after.nodes)) { res.removed.push(k2); } }

    for (var p in before.nodes) {
      if (!(p in after.nodes)) { continue; }
      var b = before.nodes[p], a = after.nodes[p], deltas = [];
      for (var g = 0; g < 4; g++) {
        if (b.r[g] !== a.r[g]) { deltas.push(['xywh'[g], b.r[g], a.r[g]]); }
      }
      for (var prop in b.s) {
        if (b.s[prop] !== a.s[prop]) { deltas.push([prop, b.s[prop], a.s[prop]]); }
      }
      if (deltas.length) { res.changed.push({ path: p, deltas: deltas }); } else { res.same++; }
    }

    console.log('[cssom_probe] ' + key + ' @ ' + res.viewport + ' -- compared ' + res.comparedBefore +
                ' nodes: ' + res.same + ' identical, ' + res.changed.length + ' changed, ' +
                res.added.length + ' added, ' + res.removed.length + ' removed');
    if (!res.changed.length && !res.added.length && !res.removed.length) {
      console.log('[cssom_probe] ZERO COMPUTED-STYLE DELTAS');
    }
    return res;
  }

  global.__rdProbe = { snap: snap, save: save, diff: diff, keys: function(){ return Object.keys(_mem); }, PROPS: PROPS, ROOTS: DEFAULT_ROOTS };
  console.log('[cssom_probe] ready - ' + PROPS.length + ' properties per node');
})(window);

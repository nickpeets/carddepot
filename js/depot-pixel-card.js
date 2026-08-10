/*
 * js/depot-pixel-card.js  --  8-bit pixel-art card FRONT renderer (ADDITIVE).
 *
 * Draws a card front from CARD TEXT ONLY (player, year, brand, position/team,
 * prestige gem). NO copyrighted imagery, NO external images, NO photo of any
 * player -- everything is generated procedurally from the card's own text so it
 * is safe to ship. Depot navy/gold styling.
 *
 * Two outputs:
 *   render(card, prestigeRes, opts) -> HTMLCanvasElement (for binder/builder/rip)
 *   renderDataURL(card, prestigeRes, opts) -> PNG data URL string
 *
 * This is the pixel PLACEHOLDER used whenever a card has no real photoPath
 * (e.g. source:'pack' pulls). It must never produce a black box.
 *
 * Exposes window.DepotPixelCard. Pure/deterministic: same card+band => same art.
 */
(function () {
  var TAG = '[depot] pixel-card:';

  // Depot palette (navy / gold house style).
  var PAL = {
    navy:   '#0d2d5c',
    navy2:  '#15407f',
    gold:   '#f8d000',
    goldDk: '#c9a800',
    cream:  '#e8e4d0',
    ink:    '#16110a',
    silver: '#c9d2e0',
    bronze: '#c8853b',
    plain:  '#5a6784'
  };

  function bandGem(band) {
    if (band === 'gold') return PAL.gold;
    if (band === 'silver') return PAL.silver;
    if (band === 'bronze') return PAL.bronze;
    return PAL.plain;
  }

  // Deterministic hash from a string -> 32-bit uint (for stable per-card motifs).
  function hashStr(s) {
    s = String(s || '');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    var a = parts[0] ? parts[0][0] : '?';
    var b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase();
  }

  // Draw a symmetric 8x8 "sprite" motif from a hash, mirrored L/R, into a box.
  function drawMotif(ctx, x, y, cell, seed, color) {
    var h = seed;
    for (var row = 0; row < 8; row++) {
      for (var col = 0; col < 4; col++) {
        h = (Math.imul(h ^ (row * 7 + col * 13), 2654435761)) >>> 0;
        if (h & 0x10000) {
          ctx.fillStyle = color;
          // left half
          ctx.fillRect(x + col * cell, y + row * cell, cell, cell);
          // mirrored right half
          ctx.fillRect(x + (7 - col) * cell, y + row * cell, cell, cell);
        }
      }
    }
  }

  function pxText(ctx, text, x, y, size, color, align) {
    ctx.fillStyle = color;
    ctx.font = size + "px 'Courier New', monospace";
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }

  /*
   * render(card, prestigeRes, opts) -> canvas
   *   card        { player, year, brand, team, number, position }
   *   prestigeRes { band, total } (optional; drives the gem + border)
   *   opts        { w, h, scale } (defaults 250x350)
   */
  function render(card, prestigeRes, opts) {
    card = card || {};
    prestigeRes = prestigeRes || { band: 'plain', total: 0 };
    opts = opts || {};
    var W = opts.w || 250, H = opts.h || 350;
    var canvas = (opts.canvas) || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!canvas) throw new Error(TAG + ' no canvas available (need DOM or opts.canvas)');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var band = prestigeRes.band || 'plain';
    var gem = bandGem(band);
    var seed = hashStr((card.player || '') + '|' + (card.year || '') + '|' + (card.brand || ''));

    // Background: navy with a subtle 2-tone checker (pixel texture).
    ctx.fillStyle = PAL.navy;
    ctx.fillRect(0, 0, W, H);
    var t = 10;
    for (var yy = 0; yy < H; yy += t) {
      for (var xx = 0; xx < W; xx += t) {
        if (((xx / t) + (yy / t)) % 2 === 0) { ctx.fillStyle = PAL.navy2; ctx.fillRect(xx, yy, t, t); }
      }
    }

    // Gold band border (thickness scales slightly with prestige band).
    var bw = band === 'gold' ? 10 : band === 'silver' ? 7 : 5;
    ctx.fillStyle = gem;
    ctx.fillRect(0, 0, W, bw); ctx.fillRect(0, H - bw, W, bw);
    ctx.fillRect(0, 0, bw, H); ctx.fillRect(W - bw, 0, bw, H);

    // Portrait window: cream panel with a mirrored pixel motif + initials plate.
    var pad = 22;
    var pw = W - pad * 2, ph = 150;
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(pad, 46, pw, ph);
    ctx.fillStyle = PAL.cream;
    ctx.fillRect(pad + 4, 50, pw - 8, ph - 8);
    // motif centered in the window
    var cell = 12;
    var mx = pad + (pw - cell * 8) / 2;
    var my = 50 + (ph - 8 - cell * 8) / 2;
    drawMotif(ctx, mx, my, cell, seed, PAL.navy);
    // initials plate over motif
    ctx.fillStyle = gem;
    ctx.fillRect(mx + cell * 2, my + cell * 2, cell * 4, cell * 4);
    pxText(ctx, initials(card.player), mx + cell * 4, my + cell * 4 + 14, 34, PAL.ink, 'center');

    // Name plate.
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(pad, 206, pw, 30);
    pxText(ctx, String(card.player || 'UNKNOWN').toUpperCase(), W / 2, 227, 16, PAL.ink, 'center');

    // Meta line: YEAR . BRAND
    pxText(ctx, [card.year || '', (card.brand || '').toUpperCase()].filter(Boolean).join('  .  '),
           W / 2, 258, 13, PAL.cream, 'center');
    // Position / team line.
    var posTeam = [card.position || '', card.team || ''].filter(Boolean).join('  ');
    if (posTeam) pxText(ctx, posTeam.toUpperCase(), W / 2, 278, 11, PAL.silver, 'center');
    // Card number, small, corner.
    if (card.number) pxText(ctx, '#' + card.number, W - bw - 6, H - bw - 8, 11, PAL.gold, 'right');

    // Prestige gem badge (bottom-left) with band label + total.
    var gx = pad, gy = H - 46;
    ctx.fillStyle = PAL.ink; ctx.fillRect(gx, gy, 96, 26);
    ctx.fillStyle = gem;
    // diamond gem
    var cx = gx + 15, cy = gy + 13, r = 8;
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
    pxText(ctx, band.toUpperCase() + ' ' + (prestigeRes.total || 0), gx + 30, gy + 17, 12, gem, 'left');

    // "PIXEL" watermark so it is clearly a generated placeholder, not a missing photo.
    pxText(ctx, 'DEPOT PIXEL', W - bw - 6, 62, 9, 'rgba(244,193,75,0.5)', 'right');

    return canvas;
  }

  function renderDataURL(card, prestigeRes, opts) {
    return render(card, prestigeRes, opts).toDataURL('image/png');
  }

  window.DepotPixelCard = {
    render: render,
    renderDataURL: renderDataURL,
    bandGem: bandGem,
    initials: initials,
    PAL: PAL
  };
  try { (window.depotLog||function(){})(TAG + ' ready (text-only, no external imagery)'); } catch (e) {}
})();

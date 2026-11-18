/* ============================================================
   map.js — THE PIXEL MAP (HTML5 Canvas)
   ------------------------------------------------------------
   Draws the network 60 times a second in the style of an
   early-2000s handheld game. It only READS the game state.

   How the look is built, with no image files at all:
   1. Each sprite is painted with rectangles on a tiny 24x24
      off-screen canvas, using 3 tones (light, base, dark) so
      it looks lit from the top-left.
   2. A dark OUTLINE is added automatically around the shape.
   3. The tiny canvas is blown up 3x with smoothing switched
      off, which gives crisp chunky pixels.
   4. Finished sprites are cached, so this work happens once.

   What you see depends on state.view:
     'red'    attacker's fog of war: only discovered nodes
     'blue'   defender's view: compromise is shown only where
              the Scout (or a tripwire) has looked
     'reveal' the truth (title and end screens)
   ============================================================ */
window.GM = window.GM || {};

(function () {
  var M = GM.Map = {};
  var cv, ctx, W = 960, H = 600;
  var bgCache = null;            // the static background, drawn once
  var sprites = {};              // cache: "kind|palette|frame" -> canvas
  var particles = [];            // little sparks { x, y, vx, vy, t0, col }
  var SCALE = 3;                 // one sprite pixel = 3x3 screen pixels
  var FONT = '"Press Start 2P", "Courier New", monospace';
  var OUTLINE = '#05070f';

  /* Colour sets. l = light, b = base, d = dark, k = deep shadow. */
  var PAL = {
    normal: { l: '#a8dcff', b: '#4f8fd6', d: '#2b4f8f', k: '#0f1a38', led: '#5dff6a', scr: '#0b2b2b', txt: '#5dff6a' },
    owned:  { l: '#ffb4ba', b: '#e8485f', d: '#8f1d3c', k: '#2b0a16', led: '#ffd447', scr: '#2c0b13', txt: '#ff7d8c' },
    off:    { l: '#a2abbd', b: '#5c6578', d: '#373e4f', k: '#171b26', led: '#6b7387', scr: '#1a1d26', txt: '#6b7387' },
    net:    { l: '#e6ceff', b: '#9a6fe0', d: '#5a3a9c', k: '#1c1238', led: '#ff5d7a', scr: '#1c1238', txt: '#ff5d7a' }
  };
  var C = { green: '#5dff6a', red: '#ff3355', amber: '#ffd447', cyan: '#5fe8ff', grey: '#8690ad', white: '#f4f7ff', purple: '#c9a2ff' };

  /* Coloured floor plates, one per network zone. */
  var ZONES = [
    { name: 'EDGE ZONE', x: 200, y: 74,  w: 180, h: 468, fill: '#0b2230', tile: '#0e2b3b', edge: '#2a8f98', hi: '#59d6dc' },
    { name: 'OFFICE LAN', x: 440, y: 176, w: 180, h: 366, fill: '#131a40', tile: '#182152', edge: '#4259c4', hi: '#8ea0ff' },
    { name: 'CORE ZONE', x: 690, y: 74,  w: 180, h: 468, fill: '#27113a', tile: '#301647', edge: '#9a4abf', hi: '#dc9cff' }
  ];

  M.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    // Redraw the cached background once the pixel font has loaded.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { bgCache = null; });
  };

  /* ---------- sprite recipes: r(x, y, w, h, colour) on a 24x24 grid.
     p = palette, f = animation frame (0 or 1) ---------- */
  var RECIPES = {
    internet: function (r, p) {                // a storm cloud
      r(8, 5, 8, 3, p.l); r(5, 8, 14, 3, p.b); r(3, 11, 18, 5, p.b); r(5, 16, 14, 1, p.d);
      r(9, 6, 4, 1, C.white); r(6, 9, 3, 1, p.l); r(4, 14, 16, 2, p.d); r(3, 11, 1, 3, p.l);
      r(8, 12, 2, 2, p.k); r(14, 12, 2, 2, p.k); r(10, 17, 2, 3, p.led); r(12, 19, 2, 2, p.led);
    },
    router: function (r, p, f) {               // flat box with two antennas
      r(6, 4, 1, 9, p.l); r(17, 4, 1, 9, p.l); r(5, 3, 3, 1, f ? p.led : p.d); r(16, 3, 3, 1, f ? p.d : p.led);
      r(3, 13, 18, 7, p.b); r(3, 13, 18, 1, p.l); r(3, 13, 1, 7, p.l); r(20, 14, 1, 6, p.d); r(4, 19, 17, 1, p.d);
      r(5, 16, 1, 1, p.led); r(7, 16, 1, 1, f ? p.led : p.k); r(9, 16, 1, 1, p.led); r(11, 16, 1, 1, f ? p.k : p.led);
      r(14, 15, 5, 3, p.k); r(15, 16, 3, 1, p.d); r(4, 20, 3, 1, p.d); r(17, 20, 3, 1, p.d);
    },
    web: function (r, p, f) {                  // tall rack server with four bays
      r(5, 2, 14, 20, p.b); r(5, 2, 14, 1, p.l); r(5, 2, 1, 20, p.l); r(17, 3, 2, 19, p.d); r(4, 21, 16, 1, p.d);
      for (var i = 0; i < 4; i++) {
        var y = 4 + i * 4;
        r(7, y, 9, 3, p.k); r(8, y + 1, 1, 1, (i + f) % 2 ? p.led : p.d); r(10, y + 1, 5, 1, p.d);
      }
      r(8, 0, 8, 2, C.cyan); r(9, 0, 2, 1, C.white);     // cyan cap marks it as the web box
    },
    workstation: function (r, p, f) {          // chunky CRT monitor and keyboard
      r(4, 2, 16, 13, p.b); r(4, 2, 16, 1, p.l); r(4, 2, 1, 13, p.l); r(19, 3, 1, 12, p.d); r(5, 14, 15, 1, p.d);
      r(6, 4, 12, 9, p.scr); r(7, 5, 6, 1, p.txt); r(7, 7, 9, 1, p.txt); r(7, 9, 4, 1, p.txt);
      r(f ? 12 : 7, 11, 2, 1, C.white);                  // blinking cursor
      r(16, 4, 2, 1, p.l);                               // glass glint
      r(10, 15, 4, 2, p.d); r(7, 17, 10, 2, p.b); r(7, 17, 10, 1, p.l);
      r(4, 20, 16, 2, p.l); r(4, 21, 16, 1, p.d); r(6, 20, 1, 1, p.d); r(9, 20, 1, 1, p.d); r(12, 20, 1, 1, p.d); r(15, 20, 1, 1, p.d);
    },
    fileserver: function (r, p, f) {           // wide cabinet with two drawers
      r(3, 4, 18, 17, p.b); r(3, 4, 18, 1, p.l); r(3, 4, 1, 17, p.l); r(20, 5, 1, 16, p.d); r(4, 20, 17, 1, p.d);
      r(5, 6, 14, 6, p.k); r(5, 13, 14, 6, p.k);
      r(10, 9, 4, 1, p.l); r(10, 16, 4, 1, p.l);
      r(6, 7, 4, 1, C.amber); r(6, 14, 4, 1, C.amber);   // folder labels
      r(17, 7, 1, 1, f ? p.led : p.d); r(17, 14, 1, 1, f ? p.d : p.led);
      r(4, 21, 3, 1, p.d); r(17, 21, 3, 1, p.d);
    },
    database: function (r, p, f) {             // three stacked discs
      for (var i = 0; i < 3; i++) {
        var y = 2 + i * 6;
        r(7, y, 10, 1, p.l); r(5, y + 1, 14, 1, p.l); r(4, y + 2, 16, 3, p.b);
        r(4, y + 2, 2, 3, p.l); r(17, y + 2, 3, 3, p.d); r(5, y + 5, 14, 1, p.d);
        r(8, y + 3, 1, 1, (i + f) % 2 ? p.led : p.d); r(10, y + 3, 4, 1, p.d);
      }
    }
  };
  function ghostRecipe(body, shade) {          // the attacker's marker, 12x12
    return function (r, p, f) {
      r(3, 0, 6, 1, body); r(2, 1, 8, 1, body); r(1, 2, 10, 8, body); r(10, 3, 1, 7, shade); r(2, 9, 8, 1, shade);
      if (f) { r(1, 10, 1, 1, body); r(3, 10, 2, 1, body); r(7, 10, 2, 1, body); r(10, 10, 1, 1, body); }
      else { r(1, 10, 2, 1, body); r(5, 10, 2, 1, body); r(9, 10, 2, 1, body); }
      r(3, 4, 2, 3, OUTLINE); r(7, 4, 2, 3, OUTLINE); r(3, 4, 1, 1, C.white); r(7, 4, 1, 1, C.white);
    };
  }
  function crownRecipe(r) {                    // marks the crown jewel, 12x8
    r(1, 5, 10, 2, C.amber); r(1, 2, 2, 3, C.amber); r(5, 0, 2, 5, C.amber); r(9, 2, 2, 3, C.amber);
    r(1, 6, 10, 1, '#c98a1a'); r(5, 5, 2, 1, C.red); r(2, 5, 1, 1, C.white); r(9, 5, 1, 1, C.white);
  }

  /* Paint a recipe on a tiny canvas, then trace a 1-pixel outline:
     any empty pixel touching a filled one becomes the outline colour. */
  function build(recipe, size, pal, frame) {
    var n = size + 2;                           // 1px margin for the outline
    var c = document.createElement('canvas'); c.width = c.height = n;
    var x = c.getContext('2d');
    recipe(function (px, py, w, h, col) { x.fillStyle = col; x.fillRect(px + 1, py + 1, w, h); }, pal, frame);
    var d = x.getImageData(0, 0, n, n).data, edge = [];
    function solid(ix, iy) { return ix >= 0 && iy >= 0 && ix < n && iy < n && d[(iy * n + ix) * 4 + 3] > 0; }
    for (var iy = 0; iy < n; iy++) for (var ix = 0; ix < n; ix++) {
      if (!solid(ix, iy) && (solid(ix - 1, iy) || solid(ix + 1, iy) || solid(ix, iy - 1) || solid(ix, iy + 1))) edge.push([ix, iy]);
    }
    x.fillStyle = OUTLINE;
    edge.forEach(function (e) { x.fillRect(e[0], e[1], 1, 1); });
    return c;
  }
  function sprite(key, recipe, size, pal, frame) {
    if (!sprites[key]) sprites[key] = build(recipe, size, pal, frame);
    return sprites[key];
  }
  function blit(img, cx, cy, scale) {           // draw a cached sprite centred on (cx, cy)
    var s = img.width * scale;
    ctx.drawImage(img, Math.round(cx - s / 2), Math.round(cy - s / 2), s, s);
  }

  /* ---------- static background (cached) ---------- */
  function seeded(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
  function drawBackground() {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'), i, x, y;
    // Sky: flat colour bands blended with a checker dither, the classic
    // trick for faking a gradient with very few colours.
    var bands = ['#070a1c', '#090e26', '#0b1330', '#0d1838', '#0e1d3d', '#0d2040'];
    var bh = H / bands.length;
    for (i = 0; i < bands.length; i++) {
      g.fillStyle = bands[i]; g.fillRect(0, i * bh, W, bh + 1);
      if (i > 0) { g.fillStyle = bands[i]; for (y = 0; y < 8; y += 2) for (x = (y / 2 % 2) * 2; x < W; x += 4) g.fillRect(x, i * bh - 8 + y, 2, 2); }
    }
    // Circuit-board traces with solder pads.
    var rnd = seeded(7);
    for (i = 0; i < 26; i++) {
      x = Math.floor(rnd() * 40) * 24; y = Math.floor(rnd() * 25) * 24;
      var len = (2 + Math.floor(rnd() * 6)) * 24, vert = rnd() > 0.5;
      g.fillStyle = '#121c46';
      g.fillRect(x, y, vert ? 2 : len, vert ? len : 2);
      g.fillRect(vert ? x : x + len, vert ? y + len : y, vert ? 48 : 2, vert ? 2 : 48);
      g.fillStyle = '#1b2a66'; g.fillRect(x - 2, y - 2, 6, 6);
    }
    // Faint dot grid.
    g.fillStyle = '#16204d';
    for (x = 12; x < W; x += 24) for (y = 12; y < H; y += 24) g.fillRect(x, y, 2, 2);

    // Zone floor plates.
    ZONES.forEach(function (z) {
      g.fillStyle = OUTLINE; g.fillRect(z.x + 6, z.y + 6, z.w, z.h);                 // drop shadow
      g.fillStyle = z.fill; g.fillRect(z.x, z.y, z.w, z.h);
      g.fillStyle = z.tile;                                                          // checker tiles
      for (var ty = 0; ty < z.h; ty += 20) for (var tx = (ty / 20 % 2) * 20; tx < z.w; tx += 40) g.fillRect(z.x + tx, z.y + ty, Math.min(20, z.w - tx), Math.min(20, z.h - ty));
      g.fillStyle = z.edge;                                                          // frame
      g.fillRect(z.x, z.y, z.w, 3); g.fillRect(z.x, z.y + z.h - 3, z.w, 3); g.fillRect(z.x, z.y, 3, z.h); g.fillRect(z.x + z.w - 3, z.y, 3, z.h);
      g.fillStyle = z.hi; g.fillRect(z.x + 3, z.y + 3, z.w - 6, 1); g.fillRect(z.x + 3, z.y + 3, 1, z.h - 6);   // bevel highlight
      g.fillStyle = bands[2];                                                        // clipped corners
      [[0, 0], [z.w - 3, 0], [0, z.h - 3], [z.w - 3, z.h - 3]].forEach(function (k) { g.fillRect(z.x + k[0], z.y + k[1], 3, 3); });
      // Name tab on the bottom edge.
      g.font = '8px ' + FONT;
      var tw = Math.ceil(g.measureText(z.name).width) + 14;
      g.fillStyle = z.edge; g.fillRect(z.x + 10, z.y + z.h - 20, tw, 17);
      g.fillStyle = OUTLINE; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(z.name, z.x + 17, z.y + z.h - 15);
    });
    return c;
  }

  /* ---------- what does the viewer know about a node? ---------- */
  function info(state, id) {
    var o = { visible: true, access: null, isolated: false, alerts: 0, shields: 0, trip: false, here: false, known: null, scanned: true };
    var def = state.def;
    if (state.view === 'red') {
      var att = state.red.att;
      o.visible = !!att.discovered[id];
      o.access = att.access[id] || null;
      o.here = att.pos === id;
      o.scanned = !!att.scanned[id];
    } else if (state.view === 'blue' && state.blue) {
      var b = state.blue;
      o.known = b.known[id] || null;
      o.access = (o.known === 'user' || o.known === 'admin') ? o.known : null;
      o.isolated = !!def.isolated[id];
      o.alerts = b.events.filter(function (e) { return e.node === id && e.flagged && !e.identified; }).length;
      o.shields = b.defenses.filter(function (d) { return d.node === id && d.kind !== 'isolate' && d.kind !== 'tripwire'; }).length;
      o.trip = !!b.trip[id];
    } else {                                    // 'reveal'
      var a = state.ai ? state.ai.att : state.red.att;
      o.access = a.access[id] || null;
      o.here = state.phase === 'end' && a.pos === id;
      o.isolated = !!def.isolated[id];
    }
    return o;
  }

  /* ---------- small drawing helpers ---------- */
  function cable(a, b, dark, light) {            // a thick two-tone pixel cable
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy), d, x, y;
    ctx.fillStyle = OUTLINE;
    for (d = 0; d <= len; d += 3) { x = Math.round(a.x + dx * d / len); y = Math.round(a.y + dy * d / len); ctx.fillRect(x - 3, y - 3, 6, 6); }
    ctx.fillStyle = dark;
    for (d = 0; d <= len; d += 3) { x = Math.round(a.x + dx * d / len); y = Math.round(a.y + dy * d / len); ctx.fillRect(x - 2, y - 2, 4, 4); }
    ctx.fillStyle = light;
    for (d = 0; d <= len; d += 3) { x = Math.round(a.x + dx * d / len); y = Math.round(a.y + dy * d / len); ctx.fillRect(x - 1, y - 2, 2, 1); }
  }
  function dashes(a, b, col, gap, shift) {       // a dotted link (email, or unplugged)
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    for (var d = (shift || 0) % gap; d < len; d += gap) {
      var x = Math.round(a.x + dx * d / len), y = Math.round(a.y + dy * d / len);
      ctx.fillStyle = OUTLINE; ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = col; ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }
  function pip(a, b, t, col) {                    // a data packet travelling along a cable
    var x = Math.round(a.x + (b.x - a.x) * t), y = Math.round(a.y + (b.y - a.y) * t);
    ctx.fillStyle = OUTLINE; ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = col; ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.fillStyle = C.white; ctx.fillRect(x - 3, y - 3, 2, 2);
  }
  function plate(text, x, y, col, px) {           // a name plate with a border
    ctx.font = (px || 10) + 'px ' + FONT;
    var w = Math.ceil(ctx.measureText(text).width) + 12, h = (px || 10) + 8, x0 = Math.round(x - w / 2);
    ctx.fillStyle = OUTLINE; ctx.fillRect(x0 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = col; ctx.fillRect(x0, y, w, h);
    ctx.fillStyle = '#0a0f24'; ctx.fillRect(x0 + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(text, x, y + 4);
  }
  function badge(text, x, y, bg, fg) {            // a solid status badge with outline and shine
    ctx.font = '8px ' + FONT;
    var w = Math.ceil(ctx.measureText(text).width) + 10, x0 = Math.round(x - w / 2);
    ctx.fillStyle = OUTLINE; ctx.fillRect(x0 - 2, y - 2, w + 4, 18);
    ctx.fillStyle = bg; ctx.fillRect(x0, y, w, 14);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x0, y, w, 2);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(text, x, y + 4);
  }
  function burst(x, y, col) {                     // spawn a ring of sparks
    for (var i = 0; i < 14; i++) {
      var a = i / 14 * Math.PI * 2, sp = 50 + (i % 3) * 35;
      particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: performance.now(), col: i % 2 ? col : C.white });
    }
  }

  /* ---------- the main draw call ---------- */
  M.draw = function (state, now) {
    var id;
    if (!bgCache) bgCache = drawBackground();
    ctx.drawImage(bgCache, 0, 0);

    var frame = Math.floor(now / 450) % 2;        // 2-frame sprite animation
    var blink = Math.floor(now / 350) % 2 === 0;

    // Twinkling stars out on the internet side.
    var rnd = seeded(99);
    for (var s = 0; s < 34; s++) {
      var sx = Math.floor(rnd() * 180), sy = Math.floor(rnd() * 560) + 10, ph = rnd() * 6;
      var tw = Math.sin(now / 500 + ph);
      ctx.fillStyle = tw > 0.6 ? C.white : tw > -0.2 ? '#6f7fc4' : '#2a3570';
      ctx.fillRect(sx, sy, 2, 2);
    }

    var inf = {};
    for (id in GM.NODES) inf[id] = info(state, id);
    // On the title screen a ghost wanders the map, just for show.
    if (state.phase === 'title') {
      var tour = ['NET', 'WEB', 'DB', 'FS', 'WS1', 'RTR'];
      inf[tour[Math.floor(now / 1300) % tour.length]].here = true;
    }

    // Cables first, so the machines sit on top of them.
    GM.EDGES.forEach(function (e, i) {
      var A = inf[e.a], B = inf[e.b];
      if (!A.visible || !B.visible) return;
      var a = GM.NODES[e.a], b = GM.NODES[e.b];
      if (A.isolated || B.isolated) { dashes(a, b, '#3a4258', 16, 0); return; }
      if (e.email) { dashes(a, b, C.purple, 18, Math.floor(now / 60)); return; }
      // A cable glows red when the attacker holds both ends of it.
      var ownA = A.access || A.here || (e.a === 'NET' && state.view === 'red');
      var ownB = B.access || B.here;
      var hot = !!(ownA && ownB);
      cable(a, b, hot ? '#8f1d3c' : '#1d5a6b', hot ? '#ff7d8c' : '#5fe8ff');
      var speed = hot ? 1100 : 2600;
      pip(a, b, ((now + i * 700) % speed) / speed, hot ? C.red : C.green);
    });

    // One-off packets fired by an action; they pop into sparks on arrival.
    state.fx.forEach(function (f) {
      var a = GM.NODES[f.from], b = GM.NODES[f.to], t = Math.min(1, (now - f.t0) / 500);
      if (f.from !== f.to) {
        var x = Math.round(a.x + (b.x - a.x) * t), y = Math.round(a.y + (b.y - a.y) * t);
        ctx.fillStyle = OUTLINE; ctx.fillRect(x - 7, y - 7, 14, 14);
        ctx.fillStyle = f.color || C.red; ctx.fillRect(x - 5, y - 5, 10, 10);
        ctx.fillStyle = C.white; ctx.fillRect(x - 5, y - 5, 4, 4);
      }
      if (t >= 1 && !f.done) { f.done = true; burst(b.x, b.y, f.color || C.red); }
    });
    state.fx = state.fx.filter(function (f) { return !f.done; });

    // Machines.
    for (id in GM.NODES) {
      var n = GM.NODES[id], o = inf[id];
      if (!o.visible) continue;
      var palKey = id === 'NET' ? 'net' : o.isolated ? 'off' : o.access ? 'owned' : 'normal';

      // Soft pixel shadow on the floor.
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(n.x - 30, n.y + 30, 60, 6); ctx.fillRect(n.x - 24, n.y + 27, 48, 12);

      // Pulsing ring under a machine the attacker owns.
      if (o.access && !o.isolated) {
        var pr = 40 + (Math.floor(now / 120) % 4) * 2;
        ctx.fillStyle = C.red;
        ctx.fillRect(n.x - pr, n.y + 32, pr * 2, 2); ctx.fillRect(n.x - pr + 6, n.y + 38, pr * 2 - 12, 2);
      }

      // The cloud floats; everything else stands still.
      var bob = id === 'NET' ? Math.round(Math.sin(now / 600) * 3) : 0;
      blit(sprite(n.kind + '|' + palKey + '|' + frame, RECIPES[n.kind], 24, PAL[palKey], frame), n.x, n.y + bob, SCALE);
      if (n.crown) blit(sprite('crown', crownRecipe, 12, null, 0), n.x, n.y - 50 + (blink ? 0 : 1), SCALE);

      if (o.isolated) {                           // big X over an unplugged machine
        for (var k = -27; k <= 27; k += 3) {
          ctx.fillStyle = OUTLINE; ctx.fillRect(n.x + k - 3, n.y + k - 3, 7, 7); ctx.fillRect(n.x + k - 3, n.y - k - 3, 7, 7);
        }
        for (k = -27; k <= 27; k += 3) {
          ctx.fillStyle = C.grey; ctx.fillRect(n.x + k - 2, n.y + k - 2, 5, 5); ctx.fillRect(n.x + k - 2, n.y - k - 2, 5, 5);
        }
      }

      // Selection cursor: four brackets that breathe in and out.
      if (state.selected === id) {
        var q = 44 + (blink ? 0 : 3), L = 12, x0 = n.x - q, y0 = n.y - q, x1 = n.x + q, y1 = n.y + q;
        [[OUTLINE, 1], [C.white, 0]].forEach(function (pass) {
          var g = pass[1]; ctx.fillStyle = pass[0];
          ctx.fillRect(x0 - g, y0 - g, L + g * 2, 4 + g * 2); ctx.fillRect(x0 - g, y0 - g, 4 + g * 2, L + g * 2);
          ctx.fillRect(x1 - L - g, y0 - g, L + g * 2, 4 + g * 2); ctx.fillRect(x1 - 4 - g, y0 - g, 4 + g * 2, L + g * 2);
          ctx.fillRect(x0 - g, y1 - 4 - g, L + g * 2, 4 + g * 2); ctx.fillRect(x0 - g, y1 - L - g, 4 + g * 2, L + g * 2);
          ctx.fillRect(x1 - L - g, y1 - 4 - g, L + g * 2, 4 + g * 2); ctx.fillRect(x1 - 4 - g, y1 - L - g, 4 + g * 2, L + g * 2);
        });
      }

      plate(n.name, n.x, n.y + 44, o.access ? C.red : id === 'NET' ? C.purple : o.isolated ? C.grey : C.green, 10);
      ctx.font = '8px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = OUTLINE; ctx.fillText(o.scanned || id === 'NET' ? n.ip : '?.?.?.?', n.x + 1, n.y + 67);
      ctx.fillStyle = C.grey; ctx.fillText(o.scanned || id === 'NET' ? n.ip : '?.?.?.?', n.x, n.y + 66);

      // Status badges.
      if (o.access) badge(o.access === 'admin' ? 'ADMIN' : 'USER', n.x + 34, n.y - 46, C.red, C.white);
      if (o.isolated) badge('OFFLINE', n.x, n.y - 8, C.grey, OUTLINE);
      if (o.known === 'clean') badge('CLEAN', n.x + 34, n.y - 46, '#1f9d4a', C.white);
      if (o.alerts) badge('! ' + o.alerts, n.x - 36, n.y - 46 - (blink ? 3 : 0), C.amber, OUTLINE);
      if (o.shields) badge('+' + o.shields, n.x - 38, n.y + 14, C.cyan, OUTLINE);
      if (o.trip) badge('TRAP', n.x + 38, n.y + 14, C.purple, OUTLINE);
      if (state.view === 'red' && !o.scanned && id !== 'NET' && !o.access) badge('?', n.x + 34, n.y - 46, C.grey, OUTLINE);

      // The ghost hovers over the node the attacker is working from.
      if (o.here) {
        var red = id !== 'NET' && state.phase !== 'title';
        var gk = 'ghost|' + (red ? 'r' : 'w') + '|' + frame;
        var rec = red ? ghostRecipe('#ff5d75', '#b3243f') : ghostRecipe('#f4f7ff', '#b4c0e6');
        blit(sprite(gk, rec, 12, null, frame), n.x - 34, n.y - 70 + Math.round(Math.sin(now / 250) * 4), SCALE);
      }
    }

    // Sparks.
    particles = particles.filter(function (p) { return now - p.t0 < 520; });
    particles.forEach(function (p) {
      var t = (now - p.t0) / 1000, size = t < 0.3 ? 4 : 2;
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x + p.vx * t), Math.round(p.y + p.vy * t + 120 * t * t), size, size);
    });

    // Caption.
    ctx.font = '8px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    var cap = state.view === 'red' ? 'RED VIEW: you only see what you have discovered'
            : state.view === 'blue' ? 'BLUE VIEW: compromise shows only where you have looked'
            : 'MESHCORP NETWORK';
    ctx.fillStyle = OUTLINE; ctx.fillText(cap, 15, H - 19);
    ctx.fillStyle = C.grey; ctx.fillText(cap, 14, H - 20);
  };

  /* Which node is under canvas pixel (x, y)? */
  M.nodeAt = function (state, x, y) {
    for (var id in GM.NODES) {
      var n = GM.NODES[id];
      if (Math.abs(x - n.x) < 50 && y > n.y - 50 && y < n.y + 78 && info(state, id).visible) return id;
    }
    return null;
  };

  /* Nodes the player may select right now (for keyboard cycling). */
  M.selectable = function (state) {
    return Object.keys(GM.NODES).filter(function (id) {
      if (state.phase === 'blue') return id !== 'NET';
      return info(state, id).visible;
    });
  };
})();

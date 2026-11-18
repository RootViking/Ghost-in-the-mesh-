/* ============================================================
   ui.js — EVERYTHING OUTSIDE THE CANVAS
   ------------------------------------------------------------
   The side panel, message feed, overlay screens, codex and
   tutorial. The one rule: UI.render() rebuilds the panel from
   GM.state every time something changes. Buttons carry
   data-act="..." attributes and ONE click listener on the
   panel routes them to red.js / blue.js. No button holds its
   own state, so nothing can get out of sync.
   ============================================================ */
window.GM = window.GM || {};

(function () {
  var UI = GM.UI = { codexOpen: false, tutOpen: false, acts: [] };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* Build one action button. key = keyboard shortcut shown on it. */
  function btn(o) {
    return '<button class="act ' + (o.cls || '') + '"' + (o.disabled ? ' disabled' : '') +
      (o.act ? ' data-act="' + o.act + '"' : '') + (o.arg !== undefined ? ' data-arg="' + esc(o.arg) + '"' : '') +
      (o.arg2 !== undefined ? ' data-arg2="' + esc(o.arg2) + '"' : '') + (o.key ? ' data-key="' + o.key + '"' : '') + '>' +
      (o.key ? '<kbd>' + (o.key === 'Enter' ? 'ENTER' : o.key) + '</kbd>' : '') +
      '<span class="t">' + esc(o.title) + '</span>' + (o.sub ? '<span class="s">' + esc(o.sub) + '</span>' : '') + '</button>';
  }

  /* Noise shown on buttons, after the difficulty multiplier. */
  function nz(n) { return Math.round(n * GM.state.diff.noiseMul); }

  /* Brief screen effect: 'fx-red' shakes and flashes red, 'fx-green'
     flashes green. Done by adding a CSS class for a moment. */
  var fxTimer = null;
  UI.flash = function (cls) {
    var el = $('stage');
    el.classList.remove('fx-red', 'fx-green');
    void el.offsetWidth;                 // restart the CSS animation
    el.classList.add(cls);
    clearTimeout(fxTimer); fxTimer = setTimeout(function () { el.classList.remove(cls); }, 450);
  };

  /* Keep the settings controls (music, difficulty, best score) in step
     with GM.Settings. */
  var BLURB = {
    easy: 'Quieter attacks, a slower intruder, 14 turns to hold. Score x0.8',
    normal: 'The intended experience. Intruder gets a 2-move head start. Score x1',
    hard: 'Louder attacks, 3-move head start, only 10 turns. Score x1.3'
  };
  UI.syncSettings = function () {
    var S = GM.Settings, label = S.music ? 'MUSIC ON [B]' : 'MUSIC OFF [B]';
    $('btn-music').textContent = label; $('btn-music2').textContent = label;
    $('diffs').innerHTML = Object.keys(GM.DIFFS).map(function (k) {
      return '<button data-diff="' + k + '" class="' + (S.diff === k ? 'sel' : '') + '">' + GM.DIFFS[k].name + '</button>';
    }).join('');
    $('diff-blurb').textContent = BLURB[S.diff];
    var n = Object.keys(S.badges).length;
    $('title-best').textContent = S.best ? 'BEST SCORE ' + S.best + '   BADGES ' + n + ' / 8' : '';
  };
  UI.setDiff = function (key) {
    if (GM.state.phase !== 'title' || !GM.DIFFS[key]) return;
    GM.Settings.diff = key; GM.Settings.save();
    GM.state = GM.State.create();        // a fresh run at the new difficulty
    GM.Audio.play('blip');
    UI.render();
  };

  /* ---------------- tutorial slides ---------------- */
  var SLIDES = [
    { h: 'TWO HATS, ONE NETWORK',
      p: ['You play the same small company network twice.',
          '<b class="r">RED PHASE:</b> you are the attacker. Start on the internet and reach the customer database, <b>DB-01</b>.',
          '<b class="g">BLUE PHASE:</b> you are the defender. An AI attacker replays the exact path you just used, and changes tactics when you block it.',
          'Everything here is simulated. No real systems, no real exploits.'] },
    { h: 'RED: FOUR ACTIONS',
      p: ['<kbd>1</kbd> <b>SCAN</b> A ping sweep finds hosts. A port scan shows a host\'s open services.',
          '<kbd>2</kbd> <b>EXPLOIT</b> Use a weakness to get a first shell on a host.',
          '<kbd>3</kbd> <b>ESCALATE</b> Go from normal user to admin, and loot stored passwords and keys.',
          '<kbd>4</kbd> <b>PIVOT</b> Move to a host you hold, or into a new one using stolen credentials.',
          '<kbd>5</kbd> <b>LIE LOW</b> Wait a turn to cool the detection meter down.',
          'Every action costs a turn and adds <b class="r">noise</b>. If the detection meter reaches 100% you are caught.'] },
    { h: 'BLUE: THREE AGENTS',
      p: ['Each turn you may give one order to each agent, then end the turn.',
          '<kbd>1</kbd> <b>SCOUT</b> reads a node\'s logs and flags anomalies. This is the only way to see where the attacker is.',
          '<kbd>2</kbd> <b>ANALYST</b> names the technique (with its MITRE ATT&amp;CK ID), reveals the weakness, and forecasts the next move.',
          '<kbd>3</kbd>-<kbd>7</kbd> <b>GUARD</b> patches a known weakness, firewalls a port, rotates a credential, isolates a node, or plants a <b>tripwire</b> that raises an alarm the moment the attacker touches that node.',
          'Hold until the turn counter runs out, or leave the attacker with no route, and the network survives.'] },
    { h: 'TYPE REAL COMMANDS',
      p: ['Three actions open a terminal: <b>nmap</b> (port scan), <b>grep</b> (log search) and <b>ufw</b> (firewall).',
          'The first time, you type the command yourself. Hover over the example to see what each part does. Reasonable variations are accepted.',
          'The <b>TERMINAL</b> under the map explains every action as it happens: the command a real operator would run, what it does, why, and its limits. Press <kbd>T</kbd> to make it bigger.',
          'Every technique you use or identify unlocks a <b>CODEX</b> card. Press <kbd>C</kbd> to read them.',
          'Mouse: click a node, then a button. Keyboard: <kbd>Tab</kbd>/arrows pick a node, number keys act, <kbd>H</kbd> shows this help, <kbd>M</kbd> mutes effects, <kbd>B</kbd> toggles music.'] }
  ];
  var tut = { i: 0, onDone: null };
  UI.openTutorial = function (onDone) { tut.i = 0; tut.onDone = onDone || null; UI.tutOpen = true; drawTut(); $('scr-tutorial').hidden = false; };
  function drawTut() {
    var s = SLIDES[tut.i];
    $('tut-body').innerHTML = '<h2>' + s.h + '</h2>' + s.p.map(function (x) { return '<p>' + x + '</p>'; }).join('');
    $('tut-count').textContent = (tut.i + 1) + ' / ' + SLIDES.length;
    $('tut-next').textContent = tut.i === SLIDES.length - 1 ? (tut.onDone ? 'START [ENTER]' : 'CLOSE [ENTER]') : 'NEXT [ENTER]';
    $('tut-back').disabled = tut.i === 0;
  }
  UI.tutNext = function () { if (tut.i < SLIDES.length - 1) { tut.i++; drawTut(); } else UI.closeTutorial(); };
  UI.tutBack = function () { if (tut.i > 0) { tut.i--; drawTut(); } };
  UI.closeTutorial = function () {
    UI.tutOpen = false; $('scr-tutorial').hidden = true;
    var f = tut.onDone; tut.onDone = null; if (f) f();
  };

  /* ---------------- codex ---------------- */
  UI.openCodex = function () {
    UI.codexOpen = true;
    $('codex-count').textContent = GM.Codex.count() + ' / ' + GM.TECH_ORDER.length + ' unlocked';
    $('codex-list').innerHTML = GM.TECH_ORDER.map(function (id) {
      var t = GM.TECH[id];
      if (!GM.Codex.unlocked[id]) return '<div class="card locked"><div class="cid">' + t.id + '</div><div class="cname">LOCKED</div><p>Use this technique as Red, or identify it as Blue, to unlock the card.</p></div>';
      return '<div class="card"><div class="cid">' + t.id + ' <span>' + esc(t.tactic) + '</span></div>' +
        '<div class="cname">' + esc(t.name) + '</div><div class="cnick">' + esc(t.nick) + '</div>' +
        '<p><b>What it is.</b> ' + esc(t.what) + '</p><p><b class="r">How attackers use it.</b> ' + esc(t.attack) + '</p>' +
        '<p><b class="a">How it is detected.</b> ' + esc(t.detect) + '</p><p><b class="g">How defenders stop it.</b> ' + esc(t.defend) + '</p>' +
        '<p class="ingame"><b>In this game.</b> ' + esc(t.ingame) + '</p></div>';
    }).join('');
    $('codex').hidden = false;
  };
  UI.closeCodex = function () { UI.codexOpen = false; $('codex').hidden = true; };

  /* Make the terminal taller (and the map smaller), or back again. */
  UI.toggleTerminal = function () {
    var tall = $('stage').classList.toggle('tall');
    $('btn-expand').textContent = tall ? 'SHRINK [T]' : 'EXPAND [T]';
    var feed = $('feed'); feed.scrollTop = feed.scrollHeight;
  };

  /* ---------------- toast (short pop-up message) ---------------- */
  var toastTimer = null;
  UI.toast = function (text) {
    var t = $('toast'); t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  };

  /* ---------------- side panel: RED ---------------- */
  function redPanel(s) {
    var red = s.red, att = red.att, sel = s.selected, R = GM.Rules;
    var acts = UI.acts = R.actions(att, s.def);
    var h = '';
    var loot = Object.keys(att.loot).map(function (c) { return GM.CREDS[c].label; });
    h += '<div class="hud"><div class="row"><span>TURN</span><b>' + red.turn + ' / ' + red.maxTurns + '</b></div>' +
      '<div class="meter"><div class="fill" style="width:' + red.detection + '%"></div><span>DETECTION ' + red.detection + '%</span></div>' +
      '<div class="row"><span>YOU ARE ON</span><b>' + GM.NODES[att.pos].name + (att.access[att.pos] ? ' (' + att.access[att.pos] + ')' : '') + '</b></div>' +
      '<div class="row"><span>LOOT</span><b>' + (loot.length ? esc(loot.join('; ')) : 'none') + '</b></div></div>';
    h += '<div class="coach">&gt; ' + esc(GM.Red.coach(s)) + '</div>';

    // Selected node details.
    if (sel) {
      var n = GM.NODES[sel];
      h += '<div class="node"><div class="nh">' + n.name + ' <span>' + n.zone + '</span></div><div class="dim">' + esc(n.role) + '</div>';
      if (sel !== 'NET') {
        h += '<div>Access: <b class="' + (att.access[sel] ? 'r' : '') + '">' + (att.access[sel] || 'none') + '</b></div>';
        h += '<div>Services: ' + (att.scanned[sel] ? n.services.map(function (x) { return x.port + '/' + x.name; }).join(', ') : '<span class="dim">unknown (port-scan it)</span>') + '</div>';
        var kw = Object.keys(att.knownWeak).filter(function (w) { return GM.WEAKNESSES[w].node === sel; });
        if (kw.length) h += '<div>Weaknesses:<ul>' + kw.map(function (w) { var x = GM.WEAKNESSES[w]; return '<li>' + esc(x.label) + ' <span class="tid">' + x.tech + '</span></li>'; }).join('') + '</ul></div>';
      }
      h += '</div>';
    } else h += '<div class="node dim">Click a node on the map (or press Tab).</div>';

    function idx(a) { return acts.indexOf(a); }
    var selName = sel ? GM.NODES[sel].name : '';
    h += '<div class="acts"><div class="ah r">RED ACTIONS</div>';

    // 1 SCAN
    var sweep = acts.filter(function (a) { return a.type === 'sweep'; })[0];
    var pscan = acts.filter(function (a) { return a.type === 'portscan' && a.target === sel; })[0];
    if (pscan) h += btn({ act: 'red', arg: idx(pscan), key: '1', cls: 'red', title: 'SCAN: port scan ' + selName, sub: 'T1046 | type the nmap command | +' + nz(6) + ' noise' });
    h += btn({ act: 'red', arg: idx(sweep), key: pscan ? '' : '1', cls: 'red', title: 'SCAN: ping sweep from ' + GM.NODES[att.pos].name, sub: 'T1018 | reveals neighbouring hosts | +' + nz(10) + ' noise' });

    // 2 EXPLOIT
    var ex = acts.filter(function (a) { return a.type === 'exploit' && a.target === sel; });
    ex.forEach(function (a, i) {
      var w = GM.WEAKNESSES[a.weak];
      h += btn({ act: 'red', arg: idx(a), key: i === 0 ? '2' : '', cls: 'red', title: 'EXPLOIT: ' + w.label, sub: w.tech + ' | gives ' + w.grants + ' | +' + nz(w.noise) + ' noise' });
    });
    if (!ex.length) {
      var why = !sel || sel === 'NET' ? 'Select a target host' : att.access[sel] ? 'You already have a shell here'
        : !att.scanned[sel] && !Object.keys(att.knownWeak).some(function (w) { return GM.WEAKNESSES[w].node === sel; }) ? 'Port-scan this host first'
        : R.neighbors(att.pos, s.def).indexOf(sel) === -1 ? 'Out of reach: pivot to a node next to it' : 'No usable weakness found here';
      h += btn({ disabled: true, key: '2', title: 'EXPLOIT', sub: why });
    }

    // 3 ESCALATE
    var es = acts.filter(function (a) { return a.type === 'escalate'; });
    es.forEach(function (a, i) {
      var w = GM.WEAKNESSES[a.weak];
      h += btn({ act: 'red', arg: idx(a), key: i === 0 ? '3' : '', cls: 'red', title: 'ESCALATE on ' + GM.NODES[a.target].name, sub: w.tech + ' | ' + w.label + ' | +' + nz(w.noise) + ' noise' });
    });
    if (!es.length) h += btn({ disabled: true, key: '3', title: 'ESCALATE',
      sub: att.access[att.pos] === 'admin' ? 'Already admin on ' + GM.NODES[att.pos].name : att.access[att.pos] ? 'No way up found on this node' : 'Pivot onto a compromised node first' });

    // 4 PIVOT
    var pv = acts.filter(function (a) { return a.type === 'pivot' && a.target === sel; });
    pv.forEach(function (a, i) {
      h += btn({ act: 'red', arg: idx(a), key: i === 0 ? '4' : '', cls: 'red', title: 'PIVOT to ' + selName,
        sub: a.cred ? GM.CREDS[a.cred].tech + ' | log in with ' + GM.CREDS[a.cred].label + ' | +' + nz(6) + ' noise' : 'Move to your existing shell | +' + nz(2) + ' noise' });
    });
    if (!pv.length) h += btn({ disabled: true, key: '4', title: 'PIVOT', sub: 'Select a node you hold, or a neighbour your loot unlocks' });

    // 5 LIE LOW
    var wait = acts.filter(function (a) { return a.type === 'wait'; })[0];
    h += btn({ act: 'red', arg: idx(wait), key: '5', cls: 'red', disabled: red.detection === 0, title: 'LIE LOW',
      sub: red.detection === 0 ? 'Nobody is looking for you yet' : 'Wait a turn | -12 detection | the AI will copy the pause' });
    h += '</div>';
    return h;
  }

  /* ---------------- side panel: BLUE ---------------- */
  function bluePanel(s) {
    var b = s.blue, sel = s.selected, def = s.def;
    var chip = function (name, used) { return '<span class="chip ' + (used ? 'used' : '') + '">' + name + (used ? ' done' : ' ready') + '</span>'; };
    var h = '<div class="hud"><div class="row"><span>TURN</span><b>' + b.turn + ' / ' + b.maxTurns + '</b></div>' +
      '<div class="meter blue"><div class="fill" style="width:' + Math.round((b.turn - 1) / b.maxTurns * 100) + '%"></div><span>HOLD THE NETWORK</span></div>' +
      '<div class="chips">' + chip('SCOUT', b.used.scout) + chip('ANALYST', b.used.analyst) + chip('GUARD', b.used.guard) + '</div></div>';
    h += '<div class="coach">&gt; ' + esc(GM.Blue.coach(s)) + '</div>';
    if (b.forecast) h += '<div class="forecast">FORECAST: ' + esc(b.forecast) + '</div>';

    if (sel && sel !== 'NET') {
      var n = GM.NODES[sel], st = b.known[sel];
      h += '<div class="node"><div class="nh">' + n.name + ' <span>' + n.zone + '</span></div><div class="dim">' + esc(n.role) + '</div>';
      h += '<div>Status: ' + (!st ? '<span class="dim">unknown (not scouted)</span>' : st === 'clean' ? '<b class="g">clean when last scanned</b>'
        : st === 'isolated' ? '<b>isolated</b>' : '<b class="r">COMPROMISED (' + st + ')</b>') + '</div>';
      h += '<div>Services: ' + n.services.map(function (x) {
        return x.port + '/' + x.name + (def.firewalled[sel + ':' + x.port] ? ' <b class="c">[blocked]</b>' : x.critical ? ' <span class="dim">[critical]</span>' : '');
      }).join(', ') + '</div>';
      var kw = Object.keys(b.knownWeak).filter(function (w) { return GM.WEAKNESSES[w].node === sel; });
      h += '<div>Known weaknesses:' + (kw.length ? '<ul>' + kw.map(function (w) {
        var x = GM.WEAKNESSES[w]; return '<li>' + esc(x.label) + ' <span class="tid">' + x.tech + '</span>' + (def.patched[w] ? ' <b class="g">[patched]</b>' : '') + '</li>';
      }).join('') + '</ul>' : ' <span class="dim">none on file</span>') + '</div></div>';
    } else h += '<div class="node dim">Click a node on the map (or press Tab).</div>';

    var selName = sel && sel !== 'NET' ? GM.NODES[sel].name : '';
    h += '<div class="acts">';

    // SCOUT
    h += '<div class="ah c">SCOUT</div>' + btn({ act: 'scout', key: '1', cls: 'blue', disabled: b.used.scout || !selName,
      title: 'SCAN LOGS' + (selName ? ' on ' + selName : ''), sub: b.used.scout ? 'Done this turn' : selName ? 'Type the grep command' : 'Select a node first' });

    // ANALYST
    h += '<div class="ah c">ANALYST</div>';
    var pend = b.events.filter(function (e) { return e.flagged && !e.identified; });
    pend.slice(0, 4).forEach(function (e, i) {
      h += btn({ act: 'analyst', arg: e.id, key: i === 0 ? '2' : '', cls: 'blue', disabled: b.used.analyst,
        title: 'IDENTIFY on ' + GM.NODES[e.node].name, sub: GM.Logs.anomaly[e.tech] });
    });
    if (!pend.length) h += btn({ disabled: true, key: '2', title: 'IDENTIFY TECHNIQUE', sub: 'No flagged anomalies. Scout first.' });

    // GUARD
    h += '<div class="ah g">GUARD' + (b.used.guard ? ' (done this turn)' : '') + '</div>';
    var g = b.used.guard, any = false;
    if (selName) {
      Object.keys(b.knownWeak).filter(function (w) { return GM.WEAKNESSES[w].node === sel && !def.patched[w]; }).forEach(function (w, i) {
        any = true;
        h += btn({ act: 'patch', arg: w, key: i === 0 ? '3' : '', cls: 'green', disabled: g, title: 'PATCH: ' + GM.WEAKNESSES[w].label, sub: GM.WEAKNESSES[w].fix });
      });
      GM.NODES[sel].services.filter(function (x) { return !x.critical && !def.firewalled[sel + ':' + x.port]; }).forEach(function (x, i) {
        any = true;
        h += btn({ act: 'fw', arg: sel, arg2: x.port, key: i === 0 ? '4' : '', cls: 'green', disabled: g, title: 'FIREWALL ' + x.name + ' (port ' + x.port + ')', sub: 'Type the ufw command' });
      });
      Object.keys(GM.CREDS).filter(function (c) { return GM.CREDS[c].target === sel; }).forEach(function (c) {
        any = true;
        h += btn({ act: 'rotate', arg: c, key: '5', cls: 'green', disabled: g, title: 'ROTATE credential', sub: 'Stolen copies of "' + GM.CREDS[c].label + '" stop working' });
      });
      if (sel !== 'DB' && !def.isolated[sel]) {
        any = true;
        var left = GM.Blue.MAX_ISOLATIONS - b.isolations;
        h += btn({ act: 'isolate', arg: sel, key: '6', cls: 'amber', disabled: g || left <= 0, title: 'ISOLATE ' + selName,
          sub: left > 0 ? 'Evicts the attacker. Costs score. ' + left + ' left' : 'No isolations left' });
      }
    }
    if (selName && !b.trip[sel] && !def.isolated[sel]) {
      any = true;
      var tl = GM.Blue.MAX_TRIPWIRES - Object.keys(b.trip).length;
      h += btn({ act: 'trip', arg: sel, key: '7', cls: 'purple', disabled: g || tl <= 0, title: 'TRIPWIRE on ' + selName,
        sub: tl > 0 ? 'Instant alert when the attacker touches it. ' + tl + ' left' : 'No tripwires left' });
    }
    if (!any) h += btn({ disabled: true, title: 'GUARD ACTIONS', sub: selName ? 'Nothing more to do on this node' : 'Select a node first' });

    h += '<div class="ah">TURN</div>' + btn({ act: 'end', key: 'Enter', cls: 'end', title: 'END TURN', sub: 'The attacker makes one move' });
    h += '</div>';
    return h;
  }

  /* ---------------- render everything ---------------- */
  UI.render = function () {
    var s = GM.state;
    $('phase').textContent = { title: 'TITLE', tutorial: 'BRIEFING', red: 'RED PHASE: ATTACK', brief: 'INTERMISSION', blue: 'BLUE PHASE: DEFEND', end: 'DEBRIEF' }[s.phase];
    $('phase').className = 'phase ' + (s.phase === 'red' ? 'red' : s.phase === 'blue' ? 'blue' : '');
    UI.syncSettings();
    $('scr-title').hidden = s.phase !== 'title';
    $('scr-brief').hidden = s.phase !== 'brief';
    $('scr-end').hidden = s.phase !== 'end';
    $('panel').innerHTML = s.phase === 'red' ? redPanel(s) : s.phase === 'blue' ? bluePanel(s) : '';
    var feed = $('feed');
    // Lines with a label (WHAT / WHY / RESULT ...) get it in a fixed left column.
    feed.innerHTML = s.feed.slice(-300).map(function (f) {
      return f.label ? '<div class="row2 ' + f.cls + '"><span class="lbl">' + esc(f.label) + '</span><span>' + esc(f.text) + '</span></div>'
                     : '<div class="' + f.cls + '">' + esc(f.text) + '</div>';
    }).join('');
    feed.scrollTop = feed.scrollHeight;
  };

  /* Fill the intermission screen between Red and Blue. */
  UI.showBrief = function (s) {
    var red = s.red;
    var head = red.outcome === 'breach' ? 'DATABASE REACHED' : red.outcome === 'caught' ? 'YOU WERE DETECTED' : 'OUT OF TURNS';
    $('brief-body').innerHTML = '<h2 class="' + (red.outcome === 'breach' ? 'r' : 'a') + '">' + head + '</h2>' +
      '<p>Turns used: <b>' + (red.turn - 1) + '</b> &nbsp; Detection: <b>' + red.detection + '%</b> &nbsp; Nodes compromised: <b>' + Object.keys(red.att.access).length + '</b></p>' +
      '<h2 class="g">NOW SWITCH SIDES</h2>' +
      '<p>The network is reset. An AI attacker will replay your ' + red.history.length + ' moves, one per turn. It gets a ' + s.diff.headStart + '-move head start, because real intrusions are not noticed at once.</p>' +
      '<p>You know this path: you found it. Your pentest notes (the weaknesses you saw) are on file for the Guard. When you block the AI it will look for <b>another way in</b>, using weaknesses you may not have found.</p>' +
      '<p>Scout to detect, Analyst to understand, Guard to respond.</p>';
  };

  /* Fill the end screen. */
  UI.showEnd = function (s) {
    var sc = GM.Report.score(s), ok = s.outcome === 'survived';
    $('end-banner').textContent = ok ? 'NETWORK SURVIVED' : 'NETWORK BREACHED';
    $('end-banner').className = 'banner ' + (ok ? 'g' : 'r');
    $('end-why').textContent = s.outcomeWhy;
    $('end-score').innerHTML = 'SCORE <b>' + sc.total + '</b> &nbsp; GRADE <b>' + sc.grade + '</b>';
    $('end-score').innerHTML += s.newBest ? ' &nbsp; <b class="g">NEW BEST!</b>' : ' &nbsp; <span class="dim">BEST ' + GM.Settings.best + '</span>';
    $('badges').innerHTML = GM.Report.badges(s).map(function (bd) {
      var cls = bd.got ? 'got' : GM.Settings.badges[bd.id] ? 'old' : 'no';
      return '<div class="badge ' + cls + '" title="' + esc(bd.desc) + '"><b>' + bd.name + '</b><span>' + esc(bd.desc) + '</span>' +
        '<i>' + (bd.got ? 'EARNED THIS RUN' : cls === 'old' ? 'earned before' : 'locked') + '</i></div>';
    }).join('');
    $('report').innerHTML = GM.Report.build(s);
    $('scr-end').scrollTop = 0;
  };

  /* ---------------- wiring ---------------- */
  UI.init = function () {
    // One listener for every panel button.
    $('panel').addEventListener('click', function (e) {
      var el = e.target.closest('button[data-act]');
      if (!el || el.disabled) return;
      var s = GM.state, a = el.getAttribute('data-act'), arg = el.getAttribute('data-arg'), arg2 = el.getAttribute('data-arg2');
      if (a === 'red') GM.Red.request(s, UI.acts[+arg]);
      else if (a === 'scout') GM.Blue.scout(s, s.selected);
      else if (a === 'analyst') GM.Blue.analyst(s, +arg);
      else if (a === 'patch') GM.Blue.patch(s, arg);
      else if (a === 'fw') GM.Blue.firewall(s, arg, +arg2);
      else if (a === 'rotate') GM.Blue.rotate(s, arg);
      else if (a === 'isolate') GM.Blue.isolate(s, arg);
      else if (a === 'trip') GM.Blue.tripwire(s, arg);
      else if (a === 'end') GM.Blue.endTurn(s);
    });
    $('btn-start').addEventListener('click', function () { GM.Game.begin(); });
    $('btn-defend').addEventListener('click', function () { GM.Game.startBlue(); });
    $('btn-again').addEventListener('click', function () { GM.Game.restart(); });
    $('btn-print').addEventListener('click', function () { window.print(); });
    $('btn-codex').addEventListener('click', UI.openCodex);
    $('btn-codex2').addEventListener('click', UI.openCodex);
    $('codex-close').addEventListener('click', UI.closeCodex);
    $('btn-help').addEventListener('click', function () { UI.openTutorial(null); });
    $('btn-sound').addEventListener('click', function () { $('btn-sound').textContent = GM.Audio.toggle() ? 'SOUND ON [M]' : 'SOUND OFF [M]'; });
    $('btn-music').addEventListener('click', function () { GM.Music.toggle(); UI.syncSettings(); });
    $('btn-music2').addEventListener('click', function () { GM.Music.toggle(); UI.syncSettings(); });
    $('diffs').addEventListener('click', function (e) {
      var el = e.target.closest('button[data-diff]');
      if (el) UI.setDiff(el.getAttribute('data-diff'));
    });
    $('btn-expand').addEventListener('click', UI.toggleTerminal);
    $('tut-next').addEventListener('click', UI.tutNext);
    $('tut-back').addEventListener('click', UI.tutBack);
    $('tut-skip').addEventListener('click', UI.closeTutorial);
  };
})();

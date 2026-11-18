/* ============================================================
   report.js — SCORE AND AFTER-ACTION REPORT
   ------------------------------------------------------------
   Turns the finished run into (a) a score and (b) a document
   laid out like a short penetration-test report: summary,
   attack chain, what the defences did, findings with fixes.
   Everything is computed from GM.state; nothing is stored.
   ============================================================ */
window.GM = window.GM || {};

(function () {
  var Rep = GM.Report = {};
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tech(id) { var t = GM.TECH[id]; return t ? '<b>' + t.id + '</b> ' + esc(t.name) : ''; }

  /* ---------- score: a list of lines that add up ---------- */
  Rep.score = function (state) {
    var red = state.red, b = state.blue, lines = [];
    var turnsUsed = red.turn - 1;
    if (red.outcome === 'breach') {
      lines.push(['Red: reached the database', 400]);
      lines.push(['Red: speed (' + turnsUsed + ' turns)', Math.max(0, (20 - turnsUsed) * 15)]);
      lines.push(['Red: stealth (' + red.detection + '% detection)', (100 - red.detection) * 3]);
    } else {
      lines.push(['Red: nodes compromised before ' + (red.outcome === 'caught' ? 'being caught' : 'time ran out'), Object.keys(red.att.access).length * 50]);
    }
    var owned = Object.keys(state.ai.att.access).length;
    if (state.outcome === 'survived') {
      lines.push(['Blue: network survived', 500]);
      lines.push(['Blue: turns to spare', Math.max(0, b.maxTurns - b.turn + 1) * 20]);
      lines.push(['Blue: nodes still compromised (' + owned + ')', -60 * owned]);
    } else {
      lines.push(['Blue: turns held before the breach', (b.turn - 1) * 20]);
    }
    lines.push(['Blue: techniques identified (' + b.identified + ')', b.identified * 30]);
    if (b.isolateCost) lines.push(['Blue: downtime from isolating nodes', -b.isolateCost]);
    lines.push(['Commands typed by hand (' + state.typed + ')', state.typed * 25]);
    var sum = Math.max(0, lines.reduce(function (s, l) { return s + l[1]; }, 0));
    var total = Math.round(sum * state.diff.scoreMul);
    if (total !== sum) lines.push(['Difficulty ' + state.diff.name + ' (x' + state.diff.scoreMul + ')', total - sum]);
    var grade = total >= 1250 ? 'S' : total >= 1000 ? 'A' : total >= 750 ? 'B' : total >= 450 ? 'C' : 'D';
    return { lines: lines, total: total, grade: grade };
  };

  /* ---------- badges: small goals to chase across runs ---------- */
  Rep.badges = function (state) {
    var red = state.red, b = state.blue, surv = state.outcome === 'survived';
    var breach = red.outcome === 'breach';
    var owned = Object.keys(state.ai.att.access).length;
    var tripped = b.defenses.some(function (d) { return d.kind === 'tripwire' && d.hits > 0; });
    return [
      { id: 'ghost',   name: 'GHOST',          desc: 'Reach the database under 45% detection', got: breach && red.detection < 45 },
      { id: 'speed',   name: 'SMASH AND GRAB', desc: 'Reach the database in 6 turns or fewer', got: breach && red.turn - 1 <= 6 },
      { id: 'typist',  name: 'TOUCH TYPIST',   desc: 'Type 4 commands and never auto-run',     got: state.typed >= 4 && !state.autoRuns },
      { id: 'sherlock',name: 'SHERLOCK',       desc: 'Identify 4 techniques in one run',       got: b.identified >= 4 },
      { id: 'trap',    name: 'GOTCHA',         desc: 'Catch the attacker with a tripwire',     got: tripped },
      { id: 'uptime',  name: 'ALWAYS ON',      desc: 'Survive without isolating a node',       got: surv && b.isolations === 0 },
      { id: 'clean',   name: 'CLEAN HOUSE',    desc: 'Survive with no node still compromised', got: surv && owned === 0 },
      { id: 'hard',    name: 'IRON WALL',      desc: 'Survive on HARD',                        got: surv && state.diff.key === 'hard' }
    ];
  };

  /* ---------- the report document (returns HTML) ---------- */
  Rep.build = function (state) {
    var red = state.red, b = state.blue, sc = Rep.score(state);
    var h = [];
    var survived = state.outcome === 'survived';

    h.push('<div class="rep-head"><div class="rep-title">AFTER-ACTION REPORT</div>' +
      '<div>Engagement: MeshCorp internal network (simulated)</div>' +
      '<div>Reference: ' + state.runId + ' &nbsp;|&nbsp; Difficulty: ' + state.diff.name + ' &nbsp;|&nbsp; Classification: TRAINING</div></div>');

    // 1. Executive summary
    h.push('<h3>1. Executive summary</h3><p>');
    h.push(red.outcome === 'breach'
      ? 'The red team reached the customer database (DB-01) in <b>' + (red.turn - 1) + ' turns</b> at <b>' + red.detection + '% detection</b>. '
      : red.outcome === 'caught' ? 'The red team was detected before reaching the database (meter hit 100%). '
      : 'The red team ran out of turns before reaching the database. ');
    h.push('An automated adversary then replayed that path against the blue team. Result: <b class="' + (survived ? 'ok' : 'bad') + '">' +
      (survived ? 'NETWORK SURVIVED' : 'NETWORK BREACHED') + '</b>. ' + esc(state.outcomeWhy) + '</p>');

    // 2. Red attack chain
    h.push('<h3>2. Attack chain (red team)</h3><table><tr><th>#</th><th>Action</th><th>ATT&amp;CK technique</th><th>Noise</th></tr>');
    red.history.forEach(function (x, i) {
      h.push('<tr><td>' + (i + 1) + '</td><td>' + esc(x.text) + '</td><td>' + (x.techs.map(tech).join('<br>') || '-') + '</td><td>' + (x.noise >= 0 ? '+' : '') + x.noise + '</td></tr>');
    });
    h.push('</table>');

    // 3. Adversary emulation timeline
    h.push('<h3>3. Adversary emulation (what the AI did)</h3><table><tr><th>Turn</th><th>Attacker move</th><th>Result</th></tr>');
    b.timeline.forEach(function (t) {
      var result = t.kind === 'blocked'
        ? '<span class="ok">BLOCKED</span> (' + esc(t.why) + ')' + (t.adaptedTo ? '<br>Adapted to: ' + esc(t.adaptedTo) : '<br>No alternative found')
        : t.kind === 'breach' ? '<span class="bad">DATABASE BREACHED</span>'
        : t.kind === 'stalled' ? '<span class="ok">no progress</span>'
        : t.kind === 'note' ? '<span class="bad">defence bypassed</span>'
        : 'succeeded' + (t.replay ? ' (replay of your move)' : ' (adapted)');
      h.push('<tr><td>' + (t.turn === 0 ? 'pre' : t.turn) + '</td><td>' + esc(t.text) + (t.tech ? '<br><small>' + tech(t.tech) + '</small>' : '') + '</td><td>' + result + '</td></tr>');
    });
    h.push('</table>');

    // 4. Defences
    h.push('<h3>4. Defences deployed</h3>');
    if (!b.defenses.length) h.push('<p>No defensive actions were taken.</p>');
    else {
      h.push('<table><tr><th>Turn</th><th>Action</th><th>Effect</th></tr>');
      b.defenses.forEach(function (d) {
        h.push('<tr><td>' + d.turn + '</td><td>' + esc(d.text) + '</td><td>' +
          (d.kind === 'tripwire' ? (d.hits ? '<span class="ok">FIRED ' + d.hits + 'x: attacker revealed</span>' : 'Planted, never touched')
            : d.hits ? '<span class="ok">WORKED: stopped ' + d.hits + ' attack attempt' + (d.hits > 1 ? 's' : '') + '</span>' : 'In place, not tested by the attacker') + '</td></tr>');
      });
      h.push('</table>');
    }
    var flagged = b.events.filter(function (e) { return e.flagged; }).length;
    h.push('<p>Detection: ' + flagged + ' of ' + b.events.length + ' attacker traces were found by the Scout; ' + b.identified + ' were identified by the Analyst.</p>');

    // 5. Findings: every weakness or credential that was actually abused.
    var used = {};
    red.history.forEach(function (x) { if (x.weak) used[x.weak] = 1; if (x.cred) used['c:' + x.cred] = 1; });
    b.events.forEach(function (e) { if (e.weak) used[e.weak] = 1; if (e.cred) used['c:' + e.cred] = 1; });
    h.push('<h3>5. Findings and recommended fixes</h3>');
    var order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
    var items = Object.keys(used).map(function (k) {
      if (k.indexOf('c:') === 0) {
        var c = GM.CREDS[k.slice(2)];
        return { sev: c.severity, title: c.label + ' (' + GM.NODES[c.target].name + ')', techs: [c.lootTech, c.tech], fix: c.fix,
                 status: state.def.credVersion[c.id] > 1 ? 'Rotated during the incident' : 'OPEN: credential never rotated' };
      }
      var w = GM.WEAKNESSES[k];
      return { sev: w.severity, title: GM.NODES[w.node].name + ': ' + w.label, techs: [w.tech], fix: w.fix,
               status: state.def.patched[k] ? 'Patched during the incident' : 'OPEN: still exploitable' };
    }).sort(function (a, c2) { return order[a.sev] - order[c2.sev]; });
    if (!items.length) h.push('<p>No weaknesses were exploited.</p>');
    items.forEach(function (f, i) {
      h.push('<div class="finding"><div><span class="sev sev-' + f.sev + '">' + f.sev + '</span> <b>F' + (i + 1) + '. ' + esc(f.title) + '</b></div>' +
        '<div>Technique: ' + f.techs.map(tech).join(', ') + '</div>' +
        '<div>Fix: ' + esc(f.fix) + '</div>' +
        '<div>Status: <span class="' + (f.status.indexOf('OPEN') === 0 ? 'bad' : 'ok') + '">' + esc(f.status) + '</span></div></div>');
    });

    // 6. Score
    h.push('<h3>6. Score</h3><table>');
    sc.lines.forEach(function (l) { h.push('<tr><td>' + esc(l[0]) + '</td><td class="num">' + (l[1] >= 0 ? '+' : '') + l[1] + '</td></tr>'); });
    h.push('<tr class="total"><td>TOTAL &nbsp; (grade ' + sc.grade + ')</td><td class="num">' + sc.total + '</td></tr></table>');
    h.push('<p class="fine">All hosts, logs and attacks in this report are simulated. Technique IDs refer to MITRE ATT&amp;CK Enterprise (attack.mitre.org).</p>');
    return h.join('');
  };
})();

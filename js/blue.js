/* ============================================================
   blue.js — BLUE PHASE (the player defends with three agents)
   ------------------------------------------------------------
   Each turn the player may give ONE order to each agent, then
   ends the turn and the AI attacker moves once.

     SCOUT    reads a node's logs and flags anomalies  (detect)
     ANALYST  names the technique behind an anomaly    (analyse)
     GUARD    patches, firewalls, rotates or isolates  (respond)

   Detect -> analyse -> respond is how a real security
   operations centre (SOC) works, and the order matters: the
   Guard can only patch a weakness somebody has identified,
   either you during the Red phase (your "pentest notes") or
   the Analyst during this one.

   The defender does not see the attacker. All Blue knows is
   what the Scout has looked at.
   ============================================================ */
window.GM = window.GM || {};

(function () {
  var B = GM.Blue = {};
  var ISOLATE_COST = { WEB: 200 };  // unplugging the public website hurts most
  B.MAX_ISOLATIONS = 2;
  B.MAX_TRIPWIRES = 2;

  B.init = function (state) {
    state.blue = {
      turn: 1, maxTurns: state.diff.blueTurns,
      trip: {},              // nodeId -> true where a tripwire is planted
      used: { scout: false, analyst: false, guard: false },
      events: [],            // log evidence left by the attacker
      nextId: 1,
      known: {},             // nodeId -> last status the Scout saw: 'clean'|'user'|'admin'|'isolated'
      knownWeak: GM.Rules.clone(state.red.att.knownWeak),   // your pentest notes carry over
      defenses: [],          // every Guard action { turn, kind, key, node, text, hits }
      timeline: [],          // everything the attacker did (shown in the report)
      isolations: 0, isolateCost: 0,
      identified: 0,
      forecast: null         // Analyst's latest prediction (text)
    };
    state.def = GM.Rules.newDefense();
    GM.AI.init(state);

    // Dwell time: real intrusions go unnoticed for a while.
    var HEAD_START = state.diff.headStart;   // moves made before anyone notices
    GM.State.log(state, 'BEFORE THE ALARM  |  what your sensors recorded while nobody was watching', 'head red');
    for (var i = 0; i < HEAD_START; i++) B.handleAI(state, GM.AI.takeTurn(state), 0);
    GM.State.log(state, 'SOC online. The intruder has already made ' + HEAD_START + ' move' + (HEAD_START > 1 ? 's' : '') + ' (the IDS lines above are what your sensors caught).', 'cyan');
    GM.State.log(state, 'Each turn: SCOUT looks, ANALYST explains, GUARD acts, then END TURN.', 'ex', 'HOW');
  };

  /* Store evidence for the Scout to find later. */
  function record(state, ev, turn) {
    var b = state.blue;
    b.events.push({ id: b.nextId++, turn: turn, node: ev.node, tech: ev.tech, src: ev.src,
                    weak: ev.weak || null, cred: ev.cred || null, flagged: false, identified: false });
  }

  /* React to one AI move: store evidence, give IDS hints, check for the end. */
  B.handleAI = function (state, r, turn) {
    var b = state.blue;
    if (r.kind === 'stalled') {
      b.timeline.push({ turn: turn, kind: 'stalled', text: 'No viable route. Attacker probing without progress.' });
      GM.State.log(state, 'IDS: no hostile progress this turn.', 'green');
      GM.State.log(state, GM.Explain.stalled, 'ex', 'MEANS');
      if (state.ai.stalled >= 2) GM.Game.end('survived', 'The attacker ran out of routes and gave up.');
      return;
    }
    var text = GM.Rules.describe(r.action);
    if (r.kind === 'blocked') {
      // Credit the defence that stopped it.
      var d = r.why && b.defenses.filter(function (x) { return x.kind === r.why.kind && x.key === r.why.key; })[0];
      if (d) d.hits++;
      b.timeline.push({ turn: turn, kind: 'blocked', text: text, tech: GM.Rules.techOf(r.action),
                        why: r.why ? r.why.text : 'no longer possible',
                        adaptedTo: r.adaptedTo ? GM.Rules.describe(r.adaptedTo) : null, replay: r.replay });
      GM.State.log(state, '[BLOCKED] Attack on ' + GM.NODES[r.action.target].name + ' failed: ' + (r.why ? r.why.text : 'no longer possible') + '.', 'green');
      if (r.why) GM.State.log(state, GM.Explain.blocked[r.why.kind], 'ex', 'MEANS');
      GM.State.log(state, 'The attacker will now look for another way in.', 'amber', 'NEXT');
      GM.Audio.play('good');
      GM.UI.flash('fx-green');
      return;
    }
    // A successful move.
    b.timeline.push({ turn: turn, kind: r.kind, text: text, tech: GM.Rules.techOf(r.action), replay: r.replay });
    r.res.events.forEach(function (ev) { record(state, ev, turn); });
    if (r.kind === 'breach') { GM.Game.end('breached', 'The attacker reached DB-01 and dumped the customer database.'); return; }
    // TRIPWIRE: a canary on the node the attacker just touched fires at
    // once. It does the Scout's job for free: evidence is flagged and
    // the node's true status is revealed.
    var tn = r.action.target;
    if (b.trip[tn]) {
      var tw = b.defenses.filter(function (x) { return x.kind === 'tripwire' && x.key === tn; })[0];
      if (tw) tw.hits++;
      b.known[tn] = state.ai.att.access[tn] || 'clean';
      GM.State.log(state, '[TRIPWIRE] Canary on ' + GM.NODES[tn].name + ' fired! Attacker activity: ' + text, 'red');
      b.events.forEach(function (e) {
        if (e.node === tn && !e.flagged) { e.flagged = true; GM.State.log(state, '   ! ' + GM.Logs.anomaly[e.tech], 'amber'); }
      });
      GM.Audio.play('alert');
      GM.UI.flash('fx-red');
    }
    // The IDS only notices loud activity, and only roughly where.
    // Quiet moves (phishing, reading a key file) slip under it.
    if (r.res.noise >= 6 && r.res.events.length) {
      GM.State.log(state, 'IDS: unusual activity in the ' + GM.NODES[r.res.events[0].node].zone + ' zone.', 'amber');
      if (!b.toldLoud) { b.toldLoud = true; GM.State.log(state, GM.Explain.idsLoud, 'ex', 'MEANS'); }   // explain once
    } else {
      GM.State.log(state, 'IDS: nothing above the alert threshold.', 'dim');
      if (!b.toldQuiet) { b.toldQuiet = true; GM.State.log(state, GM.Explain.idsQuiet, 'ex', 'MEANS'); }
    }
  };

  /* ---------------- SCOUT: read a node's logs ---------------- */
  B.scout = function (state, node) {
    var b = state.blue;
    if (b.used.scout || !node || node === 'NET') return;
    var n = GM.NODES[node];
    var fresh = b.events.filter(function (e) { return e.node === node && !e.flagged; });

    // Build the terminal output: first the literal grep result, then the wider hunt.
    var out = [];
    var brute = fresh.filter(function (e) { return e.tech === 'T1110.001'; });
    if (brute.length) GM.Logs.lines(brute[0]).forEach(function (l) { out.push(l); });
    else out.push('(no matches: zero failed SSH logins on ' + n.name + ')');
    out.push('--- scout: widening the hunt to all logs on ' + n.name + ' ---');
    var rest = fresh.filter(function (e) { return e.tech !== 'T1110.001'; });
    rest.forEach(function (e) { GM.Logs.lines(e).forEach(function (l) { out.push(l); }); });
    if (!fresh.length) out.push('Nothing unusual. ' + n.name + ' looks clean.');

    GM.Terminal.open('grep', { name: n.name, outLines: out }, !state.typedOnce.grep, function (how) {
      if (!how) return;
      if (how === 'typed') { state.typedOnce.grep = true; state.typed++; }
      b.used.scout = true;
      GM.Explain.scout(state, n);
      // The Scout also learns the node's true status right now.
      b.known[node] = state.def.isolated[node] ? 'isolated' : (state.ai.att.access[node] || 'clean');
      GM.State.log(state, n.name + ': ' + (fresh.length ? fresh.length + ' anomal' + (fresh.length > 1 ? 'ies' : 'y') + ' flagged. Send the Analyst to identify ' + (fresh.length > 1 ? 'them' : 'it') + '.' : 'no anomalies in the logs.'), 'res', 'RESULT');
      fresh.forEach(function (e) {
        e.flagged = true;
        GM.State.log(state, '   ! ' + GM.Logs.anomaly[e.tech], 'amber');
        GM.Logs.lines(e).forEach(function (l) { GM.State.log(state, '     ' + l, 'log'); });
      });
      if (b.known[node] === 'user' || b.known[node] === 'admin')
        GM.State.log(state, '   ' + n.name + ' is COMPROMISED (' + b.known[node] + ' access).', 'red');
      GM.Audio.play(fresh.length ? 'alert' : 'blip');
      GM.UI.render();
    });
  };

  /* ---------------- ANALYST: name the technique -------------- */
  B.analyst = function (state, eventId) {
    var b = state.blue;
    if (b.used.analyst) return;
    var e = b.events.filter(function (x) { return x.id === eventId; })[0];
    if (!e || !e.flagged || e.identified) return;
    b.used.analyst = true;
    e.identified = true;
    b.identified++;
    var t = GM.TECH[e.tech];
    GM.Game.unlock(e.tech);
    GM.Explain.analyst(state, e);
    GM.State.log(state, t.id + ' ' + t.name + '  (tactic: ' + t.tactic + ')', 'res', 'RESULT');
    GM.State.log(state, t.what, 'ex', ' ');

    // Naming the technique exposes the weakness behind it, so the Guard can fix it.
    if (e.weak) {
      b.knownWeak[e.weak] = true;
      GM.State.log(state, '   Root cause: ' + GM.WEAKNESSES[e.weak].label + '. Guard can now PATCH it.', 'green');
    } else if (e.cred) {
      GM.State.log(state, '   Advice: ROTATE the credential on ' + GM.NODES[GM.CREDS[e.cred].target].name + ' (' + GM.CREDS[e.cred].label + ').', 'green');
    } else {
      GM.State.log(state, '   Advice: ' + t.defend, 'dim');
    }

    // Forecast: what the attacker will most likely try next.
    var nxt = GM.AI.peek(state);
    b.forecast = nxt ? GM.Rules.describe(nxt) : 'No route visible to the attacker right now.';
    GM.State.log(state, '   Forecast: next move is likely "' + b.forecast + '"', 'amber');
    GM.Audio.play('good');
    GM.UI.render();
  };

  /* ---------------- GUARD: four ways to respond -------------- */
  function logDefense(state, kind, key, node, text) {
    state.blue.defenses.push({ turn: state.blue.turn, kind: kind, key: key, node: node, text: text, hits: 0 });
    state.blue.used.guard = true;
    GM.Explain.guard(state, kind, key, node, text);
    GM.Audio.play('good');
    GM.UI.render();
  }

  /* PATCH: remove one known weakness. Does NOT evict an attacker
     who is already inside; it only closes the door behind them. */
  B.patch = function (state, weakId) {
    var b = state.blue, w = GM.WEAKNESSES[weakId];
    if (b.used.guard || !w || !b.knownWeak[weakId] || state.def.patched[weakId]) return;
    state.def.patched[weakId] = true;
    logDefense(state, 'patch', weakId, w.node, 'Patched ' + GM.NODES[w.node].name + ': ' + w.fix);
  };

  /* FIREWALL: close a port (typed ufw command). Business-critical
     ports cannot be closed; those have to be patched instead. */
  B.firewall = function (state, node, port) {
    var b = state.blue, n = GM.NODES[node];
    var svc = n.services.filter(function (s) { return s.port === port; })[0];
    if (b.used.guard || !svc || svc.critical || state.def.firewalled[node + ':' + port]) return;
    GM.Terminal.open('ufw', { name: n.name, port: port, service: svc.name }, !state.typedOnce.ufw, function (how) {
      if (!how) return;
      if (how === 'typed') { state.typedOnce.ufw = true; state.typed++; }
      state.def.firewalled[node + ':' + port] = true;
      logDefense(state, 'firewall', node + ':' + port, node, 'Firewalled ' + svc.name + ' (port ' + port + ') on ' + n.name + '.');
    });
  };

  /* ROTATE: change a credential so stolen copies stop working.
     If the attacker is still admin where the secret is stored,
     they can simply read the new one. Evict first, then rotate. */
  B.rotate = function (state, credId) {
    var b = state.blue, c = GM.CREDS[credId];
    if (b.used.guard || !c) return;
    state.def.credVersion[credId]++;
    if (GM.AI.onRotate(state, credId))   // attacker still admin where the secret lives: rotation wasted
      b.timeline.push({ turn: b.turn, kind: 'note', text: 'Rotation of "' + c.label + '" was read straight back: the attacker is still admin where it is stored.' });
    logDefense(state, 'rotate', credId, c.target, 'Rotated credential on ' + GM.NODES[c.target].name + ': ' + c.fix);
  };

  /* ISOLATE: unplug a node. The only action that throws the attacker
     OUT of a machine, but the business loses that machine, so it
     costs score and can only be done twice. */
  B.isolate = function (state, node) {
    var b = state.blue;
    if (b.used.guard || node === 'DB' || node === 'NET' || state.def.isolated[node] || b.isolations >= B.MAX_ISOLATIONS) return;
    state.def.isolated[node] = true;
    b.isolations++;
    b.isolateCost += (ISOLATE_COST[node] || 120);
    b.known[node] = 'isolated';
    GM.AI.onIsolate(state, node);
    logDefense(state, 'isolate', node, node, 'Isolated ' + GM.NODES[node].name + ' from the network (any attacker shell on it is gone).');
  };

  /* TRIPWIRE: plant a canary (a fake file or account nobody should
     ever touch). It stops nothing, but the moment the attacker acts
     on that node you are told, with no Scout needed. Two per run. */
  B.tripwire = function (state, node) {
    var b = state.blue;
    if (b.used.guard || !node || node === 'NET' || b.trip[node] || state.def.isolated[node]) return;
    if (Object.keys(b.trip).length >= B.MAX_TRIPWIRES) return;
    b.trip[node] = true;
    logDefense(state, 'tripwire', node, node, 'Planted a tripwire on ' + GM.NODES[node].name + ': any attacker activity there raises an instant alert.');
  };

  /* ---------------- END TURN: the attacker moves ------------- */
  B.endTurn = function (state) {
    var b = state.blue;
    GM.State.log(state, 'TURN ' + b.turn + '  |  ATTACKER MOVES  |  you only see what your sensors report', 'head red');
    B.handleAI(state, GM.AI.takeTurn(state), b.turn);
    if (state.phase !== 'blue') return;                 // the game ended
    b.turn++;
    b.used = { scout: false, analyst: false, guard: false };
    if (b.turn > b.maxTurns) { GM.Game.end('survived', 'You held the network for ' + b.maxTurns + ' turns. Incident contained.'); return; }
    GM.UI.render();
  };

  B.coach = function (state) {
    var b = state.blue;
    var pending = b.events.filter(function (e) { return e.flagged && !e.identified; }).length;
    if (!b.used.scout) return 'SCOUT: pick a node (follow the IDS zone hints) and scan its logs.';
    if (!b.used.analyst && pending) return 'ANALYST: identify a flagged anomaly to learn the technique and the fix.';
    if (!b.used.guard) return 'GUARD: patch, firewall, rotate a credential, isolate a node, or plant a tripwire.';
    return 'All agents have acted. END TURN and the attacker moves.';
  };
})();

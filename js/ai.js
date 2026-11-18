/* ============================================================
   ai.js — THE AI ATTACKER (replays you, then adapts)
   ------------------------------------------------------------
   The AI is an attacker object pushed through the same rules
   you played by. It has two modes:

   1. REPLAY  Follow the player's recorded Red moves, in order.
   2. ADAPT   The moment a move fails, it stops replaying. It
              notes WHY it failed, then searches for the
              shortest new route to the database.

   The important design choice: the AI is NOT all-knowing. It
   keeps a `belief` about your defences, which starts empty and
   only grows when it walks into one (or loses a shell). So a
   patch it has not met yet still costs it a wasted turn. Every
   blocked attempt buys the defender time, as in real life.

   The route search is a breadth-first search (BFS): try every
   legal move from the current situation, then every move after
   each of those, and so on. The first sequence that reaches
   the database is, by construction, a shortest one.
   ============================================================ */
window.GM = window.GM || {};

(function () {
  var R = GM.Rules;
  var AI = GM.AI = {};

  AI.init = function (state) {
    state.ai = {
      att: R.newAttacker(),
      // The script: the player's moves, stripped to what the rules need.
      script: state.red.history.map(function (h) {
        return { type: h.type, target: h.target, weak: h.weak, cred: h.cred };
      }),
      idx: 0,                 // next script line to replay
      mode: 'replay',         // 'replay' | 'adapt'
      belief: { patched: {}, firewalled: {}, isolated: {} },  // defences it has discovered
      dead: {},               // action keys that failed for an unknown reason (safety net)
      watch: {},              // credId -> true once the AI has re-stolen it and now watches the file
      stalled: 0              // consecutive turns with no route at all
    };
  };

  /* The defences as the AI BELIEVES them to be. Stolen credentials
     are assumed to still work until a login actually fails. */
  function beliefDef(ai, realDef) {
    var cv = {};
    Object.keys(realDef.credVersion).forEach(function (c) {
      cv[c] = (ai.att.loot[c] !== undefined) ? ai.att.loot[c] : realDef.credVersion[c];
    });
    return { patched: ai.belief.patched, firewalled: ai.belief.firewalled, isolated: ai.belief.isolated, credVersion: cv };
  }

  /* Two attackers in the same situation produce the same string,
     so the search never explores the same situation twice. */
  function stateKey(att) {
    var acc = Object.keys(att.access).sort().map(function (k) { return k + ':' + att.access[k]; }).join(',');
    var loot = Object.keys(att.loot).sort().map(function (k) { return k + ':' + att.loot[k]; }).join(',');
    return att.pos + '|' + acc + '|' + loot;
  }

  /* BFS for the shortest list of actions that reaches the database,
     given what the AI believes. Returns null if it sees no way in. */
  AI.plan = function (ai, realDef) {
    var bdef = beliefDef(ai, realDef);
    var start = R.clone(ai.att);
    var seen = {}; seen[stateKey(start)] = true;
    var queue = [{ att: start, path: [] }];
    var guard = 0;
    while (queue.length && guard++ < 20000) {
      var cur = queue.shift();
      if (cur.path.length >= 14) continue;           // give up on absurdly long routes
      var acts = R.actions(cur.att, bdef, { ignoreRecon: true });
      for (var i = 0; i < acts.length; i++) {
        var a = acts[i];
        if (ai.dead[R.key(a)]) continue;
        var next = R.clone(cur.att);                 // simulate on a copy, never the real attacker
        var res = R.apply(next, bdef, a);
        var path = cur.path.concat([a]);
        if (res.win) return path;
        var k = stateKey(next);
        if (seen[k]) continue;
        seen[k] = true;
        queue.push({ att: next, path: path });
      }
    }
    return null;
  };

  /* In ADAPT mode: what to do this turn. The plan ignores recon, so
     if its first step needs a host the AI has not found or scanned
     yet, do that scan first (it costs a turn, as it did for you). */
  AI.nextAdaptive = function (ai, realDef) {
    var plan = AI.plan(ai, realDef);
    if (!plan) return null;
    var step = plan[0];
    if (step.type === 'exploit' && GM.WEAKNESSES[step.weak].needsScan) {
      if (!ai.att.discovered[step.target]) return { action: { type: 'sweep', target: ai.att.pos }, prereqFor: step.target, plan: plan };
      if (!ai.att.scanned[step.target]) return { action: { type: 'portscan', target: step.target }, prereqFor: step.target, plan: plan };
    }
    return { action: step, plan: plan };
  };

  /* What would the AI do next? Used by the Analyst's forecast.
     Changes nothing. */
  AI.peek = function (state) {
    var ai = state.ai;
    if (ai.mode === 'replay' && ai.idx < ai.script.length) return ai.script[ai.idx];
    var n = AI.nextAdaptive(ai, state.def);
    return n ? n.action : null;
  };

  /* The defender unplugged a node. Any shell there dies, and the AI
     notices that (it does not notice isolation of nodes it never held). */
  AI.onIsolate = function (state, node) {
    var ai = state.ai;
    if (ai.att.access[node]) { delete ai.att.access[node]; ai.belief.isolated[node] = true; }
    if (ai.att.pos === node) ai.att.pos = 'NET';    // thrown back outside
  };

  /* The defender rotated a credential. The first time, the AI is
     caught out: its next login fails and it must re-steal the
     secret. After that it WATCHES the file, so while it is still
     admin on a node that stores the secret, every new rotation is
     picked up at once. Lesson: evict first, then rotate. */
  AI.onRotate = function (state, credId) {
    var ai = state.ai;
    if (!ai.watch[credId]) return false;
    var stillAdmin = Object.keys(GM.WEAKNESSES).some(function (id) {
      var w = GM.WEAKNESSES[id];
      return w.loot === credId && ai.att.access[w.node] === 'admin';
    });
    if (stillAdmin) ai.att.loot[credId] = state.def.credVersion[credId];
    return stillAdmin;
  };

  /* ----------------------------------------------------------
     takeTurn(): one AI move. Returns a result object:
       { kind: 'move' | 'breach', action, res }
       { kind: 'blocked', action, why, adaptedTo }
       { kind: 'stalled' }
     ---------------------------------------------------------- */
  AI.takeTurn = function (state) {
    var ai = state.ai, def = state.def;
    var action = null, prereqFor = null;
    var wasReplay = false;

    if (ai.mode === 'replay') {
      if (ai.idx < ai.script.length) { action = ai.script[ai.idx]; wasReplay = true; }
      else ai.mode = 'adapt';            // script ran out before the database: improvise
    }
    if (ai.mode === 'adapt') {
      var n = AI.nextAdaptive(ai, def);
      if (n) { action = n.action; prereqFor = n.prereqFor || null; }
    }

    if (!action) { ai.stalled++; return { kind: 'stalled' }; }
    ai.stalled = 0;

    // Try the move against the REAL defences.
    if (R.isLegal(ai.att, def, action)) {
      var res = R.apply(ai.att, def, action);
      if (wasReplay) ai.idx++;
      if (action.type === 'loot') ai.watch[action.cred] = true;   // from now on it keeps an eye on that file
      // Swept for a host and it still did not show up? It must be offline.
      if (prereqFor && action.type === 'sweep' && !ai.att.discovered[prereqFor]) ai.belief.isolated[prereqFor] = true;
      return { kind: res.win ? 'breach' : 'move', action: action, res: res, replay: wasReplay };
    }

    // The move failed. Learn from it, then switch to adapting.
    var why = R.whyBlocked(ai.att, def, action);
    if (!why) ai.dead[R.key(action)] = true;
    else if (why.kind === 'patch') ai.belief.patched[why.key] = true;
    else if (why.kind === 'firewall') ai.belief.firewalled[why.key] = true;
    else if (why.kind === 'isolate') ai.belief.isolated[why.key] = true;
    else if (why.kind === 'rotate') delete ai.att.loot[why.key];   // that secret is dead
    ai.mode = 'adapt';

    var nxt = AI.nextAdaptive(ai, def);
    return { kind: 'blocked', action: action, why: why, adaptedTo: nxt ? nxt.action : null, replay: wasReplay };
  };
})();

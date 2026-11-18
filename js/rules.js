/* ============================================================
   rules.js — THE ATTACK RULES (shared by the player AND the AI)
   ------------------------------------------------------------
   This is the heart of the simulation. It answers two questions:

     Rules.actions(att, def)  -> what may the attacker do now?
     Rules.apply(att, def, a) -> do it, and report what happened

   `att` is an attacker (position, shells, loot, knowledge).
   `def` is the defender's hardening (patches, firewall rules,
         isolated nodes, credential versions).

   The human in the Red phase and the AI in the Blue phase are
   BOTH just "an attacker object" pushed through these same two
   functions. That is why the AI can replay your moves exactly,
   and why a defence that stops you also stops it.
   ============================================================ */
window.GM = window.GM || {};

(function () {
  var R = GM.Rules = {};

  /* A fresh attacker: outside the network, knowing nothing. */
  R.newAttacker = function () {
    return {
      pos: 'NET',               // node the attacker is working from
      access: {},               // nodeId -> 'user' | 'admin'  (shells held)
      loot: {},                 // credId -> version stolen    (see credVersion)
      discovered: { NET: true },// nodes found by ping sweep
      scanned: {},              // nodes that were port-scanned
      knownWeak: {}             // weaknesses the attacker has learned about
    };
  };

  /* A fresh defender: nothing hardened yet. */
  R.newDefense = function () {
    var cv = {};
    Object.keys(GM.CREDS).forEach(function (id) { cv[id] = 1; });
    return {
      patched: {},      // weaknessId -> true
      firewalled: {},   // "NODE:port" -> true
      isolated: {},     // nodeId -> true (unplugged from the network)
      credVersion: cv   // credId -> number. Rotating a credential adds 1,
                        // so loot stolen at an older version stops working.
    };
  };

  R.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /* A short unique string for an action, used to compare actions. */
  R.key = function (a) { return [a.type, a.target, a.weak || '', a.cred || ''].join('|'); };

  /* Nodes directly connected to `id`. Isolated nodes drop off the
     network. The "email" edge only counts when includeEmail is set. */
  R.neighbors = function (id, def, includeEmail) {
    var out = [];
    if (def.isolated[id]) return out;
    GM.EDGES.forEach(function (e) {
      if (e.email && !includeEmail) return;
      var other = e.a === id ? e.b : (e.b === id ? e.a : null);
      if (other && !def.isolated[other]) out.push(other);
    });
    return out;
  };

  /* ----------------------------------------------------------
     actions(): every legal move for this attacker right now.
     opts.ignoreRecon = true is used by the AI planner: it plans
     as if scanning were already done, then inserts the scans
     it actually still needs when it comes to act (see ai.js).
     ---------------------------------------------------------- */
  R.actions = function (att, def, opts) {
    opts = opts || {};
    var list = [];
    var pos = att.pos;
    var nb = R.neighbors(pos, def, false);

    if (!opts.ignoreRecon) {
      // SCAN (a): ping sweep from where you stand. Always allowed.
      list.push({ type: 'sweep', target: pos });
      // LIE LOW: do nothing for a turn and let the alarms cool down.
      list.push({ type: 'wait', target: pos });
      // SCAN (b): port scan a discovered neighbour you have not scanned yet.
      nb.forEach(function (n) {
        if (n !== 'NET' && att.discovered[n] && !att.scanned[n]) list.push({ type: 'portscan', target: n });
      });
    }

    // EXPLOIT: use an entry weakness to get a first shell on a node.
    Object.keys(GM.WEAKNESSES).forEach(function (id) {
      var w = GM.WEAKNESSES[id];
      if (w.kind !== 'entry') return;
      if (att.access[w.node]) return;                                   // already in
      if (def.isolated[w.node] || def.patched[id]) return;              // defended
      if (w.port && def.firewalled[w.node + ':' + w.port]) return;      // port closed
      if (!w.remote && nb.indexOf(w.node) === -1) return;               // not reachable from here
      if (!opts.ignoreRecon) {
        if (!att.discovered[w.node]) return;                            // never seen it
        if (w.needsScan && !att.scanned[w.node]) return;                // don't know its services yet
      }
      list.push({ type: 'exploit', target: w.node, weak: id });
    });

    // ESCALATE: user -> admin on the node you are standing on.
    Object.keys(GM.WEAKNESSES).forEach(function (id) {
      var w = GM.WEAKNESSES[id];
      if (w.kind !== 'privesc' || w.node !== pos) return;
      if (att.access[pos] !== 'user' || def.patched[id]) return;
      list.push({ type: 'escalate', target: pos, weak: id });
    });

    // PIVOT (a): hop to another node you already hold a shell on.
    Object.keys(att.access).forEach(function (n) {
      if (n !== pos && !def.isolated[n]) list.push({ type: 'pivot', target: n });
    });

    // PIVOT (b): lateral movement into a NEW node using stolen credentials.
    Object.keys(att.loot).forEach(function (cid) {
      var c = GM.CREDS[cid];
      if (att.loot[cid] !== def.credVersion[cid]) return;               // credential was rotated
      if (att.access[c.target] || def.isolated[c.target]) return;
      if (def.firewalled[c.target + ':' + c.port]) return;
      if (nb.indexOf(c.target) === -1) return;                          // must be next door
      list.push({ type: 'pivot', target: c.target, cred: cid });
    });

    // LOOT: re-steal a credential after the defender rotated it. Only
    // possible while still admin on the node where that secret is stored.
    if (att.access[pos] === 'admin') {
      Object.keys(GM.WEAKNESSES).forEach(function (id) {
        var w = GM.WEAKNESSES[id];
        if (w.node === pos && w.loot && att.loot[w.loot] !== def.credVersion[w.loot])
          list.push({ type: 'loot', target: pos, cred: w.loot });
      });
    }
    return list;
  };

  R.isLegal = function (att, def, a) {
    var k = R.key(a);
    return R.actions(att, def).some(function (x) { return R.key(x) === k; });
  };

  /* Becoming admin hands over any secret stored on that node. */
  function takeLoot(att, def, node, res) {
    Object.keys(GM.WEAKNESSES).forEach(function (id) {
      var w = GM.WEAKNESSES[id];
      if (w.node !== node || !w.loot) return;
      var c = GM.CREDS[w.loot];
      att.loot[w.loot] = def.credVersion[w.loot];
      att.discovered[c.target] = true;            // the secret names the host it opens
      res.techs.push(c.lootTech);
      res.events.push({ node: node, tech: c.lootTech, src: GM.NODES[node].ip });
      res.lines.push('LOOT: ' + c.label + ' -> unlocks a pivot into ' + GM.NODES[c.target].name);
    });
  }

  /* Standing on a node lets you look around it: local privilege
     escalation weaknesses become known. */
  function enumerateLocal(att, node) {
    Object.keys(GM.WEAKNESSES).forEach(function (id) {
      var w = GM.WEAKNESSES[id];
      if (w.node === node && w.kind === 'privesc') att.knownWeak[id] = true;
    });
  }

  /* ----------------------------------------------------------
     apply(): carry out one action. MUTATES att. Returns
       noise  : detection meter increase
       techs  : ATT&CK IDs used (unlock codex cards)
       events : log evidence left behind { node, tech, src }
       lines  : human-readable result text
       win    : true if the crown jewel was reached
     ---------------------------------------------------------- */
  R.apply = function (att, def, a) {
    var res = { noise: 0, techs: [], events: [], lines: [], win: false };
    var src = GM.NODES[att.pos].ip;     // where the traffic comes from
    var w = a.weak ? GM.WEAKNESSES[a.weak] : null;
    var c = a.cred ? GM.CREDS[a.cred] : null;
    var name = GM.NODES[a.target].name;

    switch (a.type) {
      case 'sweep': {
        var found = [];
        R.neighbors(att.pos, def, true).forEach(function (n) {
          if (!att.discovered[n]) { att.discovered[n] = true; found.push(GM.NODES[n].name); }
          // Some weaknesses need no port scan (a published email address).
          Object.keys(GM.WEAKNESSES).forEach(function (id) {
            var x = GM.WEAKNESSES[id];
            if (x.node === n && x.kind === 'entry' && !x.needsScan) att.knownWeak[id] = true;
          });
        });
        res.noise = 10; res.techs.push('T1018');
        // Seen from outside, the sweep shows up in the edge router's logs.
        res.events.push({ node: att.pos === 'NET' ? 'RTR' : att.pos, tech: 'T1018', src: src });
        res.lines.push(found.length ? 'Hosts found: ' + found.join(', ') : 'No new hosts answered.');
        break;
      }
      case 'portscan': {
        att.scanned[a.target] = true;
        Object.keys(GM.WEAKNESSES).forEach(function (id) {
          var x = GM.WEAKNESSES[id];
          if (x.node === a.target && x.kind === 'entry') att.knownWeak[id] = true;
        });
        res.noise = 6; res.techs.push('T1046');
        res.events.push({ node: a.target, tech: 'T1046', src: src });
        res.lines.push(name + ' open ports: ' + GM.NODES[a.target].services.map(function (s) { return s.port + ' ' + s.name; }).join(', '));
        break;
      }
      case 'exploit': {
        att.access[a.target] = w.grants;
        att.knownWeak[a.weak] = true;
        res.noise = w.noise; res.techs.push(w.tech);
        res.events.push({ node: a.target, tech: w.tech, src: src, weak: a.weak });
        res.lines.push('Shell on ' + name + ' as ' + w.grants.toUpperCase() + '.');
        if (w.grants === 'admin') takeLoot(att, def, a.target, res);
        break;
      }
      case 'escalate': {
        att.access[a.target] = 'admin';
        res.noise = w.noise; res.techs.push(w.tech);
        res.events.push({ node: a.target, tech: w.tech, src: src, weak: a.weak });
        res.lines.push('Now ADMIN on ' + name + '.');
        takeLoot(att, def, a.target, res);
        break;
      }
      case 'pivot': {
        if (c) {                               // lateral movement with stolen creds
          att.access[a.target] = c.grants;
          res.noise = c.noise; res.techs.push(c.tech);
          res.events.push({ node: a.target, tech: c.tech, src: src, cred: a.cred });
          res.lines.push('Logged in to ' + name + ' with ' + c.label + '.');
          if (a.target === 'DB') { res.win = true; res.lines.push('CROWN JEWEL REACHED: customer database dumped.'); }
        } else {                               // just switching to another shell
          res.noise = 2;
          res.lines.push('Now operating from ' + name + '.');
        }
        att.pos = a.target;
        att.discovered[a.target] = true;
        enumerateLocal(att, a.target);
        break;
      }
      case 'wait': {
        res.noise = -12;                         // negative noise: the meter drops
        res.lines.push('Stayed quiet on ' + name + '. The defenders relax a little.');
        break;
      }
      case 'loot': {
        att.loot[a.cred] = def.credVersion[a.cred];
        res.noise = 3; res.techs.push(c.lootTech);
        res.events.push({ node: a.target, tech: c.lootTech, src: src, cred: a.cred });
        res.lines.push('Re-read the stored secret: ' + c.label + '.');
        break;
      }
    }
    return res;
  };

  /* Why did an action that used to work stop working? Returns the
     defence responsible, so the game can credit it in the report
     and the AI can learn from the failure. */
  R.whyBlocked = function (att, def, a) {
    var w = a.weak ? GM.WEAKNESSES[a.weak] : null;
    var c = a.cred ? GM.CREDS[a.cred] : null;
    if (def.isolated[a.target]) return { kind: 'isolate', key: a.target, text: GM.NODES[a.target].name + ' is isolated' };
    if (w && def.patched[a.weak]) return { kind: 'patch', key: a.weak, text: 'weakness patched' };
    if (w && w.port && def.firewalled[w.node + ':' + w.port]) return { kind: 'firewall', key: w.node + ':' + w.port, text: 'port ' + w.port + ' firewalled' };
    if (c && att.loot[a.cred] !== def.credVersion[a.cred]) return { kind: 'rotate', key: a.cred, text: 'stolen credential was rotated' };
    if (c && def.firewalled[c.target + ':' + c.port]) return { kind: 'firewall', key: c.target + ':' + c.port, text: 'port ' + c.port + ' firewalled' };
    return null;
  };

  /* The ATT&CK technique an action stands for (null for a plain hop). */
  R.techOf = function (a) {
    if (a.type === 'sweep') return 'T1018';
    if (a.type === 'portscan') return 'T1046';
    if (a.type === 'loot') return GM.CREDS[a.cred].lootTech;
    if (a.weak) return GM.WEAKNESSES[a.weak].tech;
    if (a.cred) return GM.CREDS[a.cred].tech;
    return null;
  };

  /* One-line description, used in the feed and the report. */
  R.describe = function (a) {
    var n = GM.NODES[a.target].name;
    switch (a.type) {
      case 'sweep': return 'Ping sweep from ' + n;
      case 'portscan': return 'Port scan of ' + n;
      case 'wait': return 'Lie low on ' + n;
      case 'exploit': return 'Exploit ' + n + ': ' + GM.WEAKNESSES[a.weak].label;
      case 'escalate': return 'Escalate on ' + n + ': ' + GM.WEAKNESSES[a.weak].label;
      case 'loot': return 'Re-steal credential on ' + n + ': ' + GM.CREDS[a.cred].label;
      case 'pivot': return a.cred ? 'Pivot into ' + n + ' using ' + GM.CREDS[a.cred].label
                                  : 'Pivot to existing shell on ' + n;
    }
    return a.type;
  };
})();

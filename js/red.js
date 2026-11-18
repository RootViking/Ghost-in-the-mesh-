/* ============================================================
   red.js — RED PHASE (the player attacks)
   ------------------------------------------------------------
   Thin layer over rules.js. The rules decide what is legal and
   what an action does; this file adds what only matters to the
   human player: the detection meter, the turn counter, the
   recorded history (which the AI will replay later) and the
   typed nmap command for port scans.
   ============================================================ */
window.GM = window.GM || {};

GM.Red = {
  /* Called by the UI when an action button is pressed.
     Port scans go through the terminal mini-game first. */
  request: function (state, action) {
    if (action.type === 'portscan') {
      var n = GM.NODES[action.target];
      var mandatory = !state.typedOnce.nmap;      // first time: you must type it
      GM.Terminal.open('nmap', { name: n.name, ip: n.ip, services: n.services }, mandatory, function (how) {
        if (!how) return;                         // cancelled: no turn spent
        if (how === 'typed') { state.typedOnce.nmap = true; state.typed++; }
        // Skipping uses a noisy default scan: +5 detection.
        GM.Red.perform(state, action, how === 'skipped');
        GM.UI.render();
      });
      return;
    }
    GM.Red.perform(state, action, false);
    GM.UI.render();
  },

  /* Carry out one Red action and update everything that follows. */
  perform: function (state, action, sloppy) {
    var red = state.red;
    var from = red.att.pos;
    var res = GM.Rules.apply(red.att, state.def, action);
    var noise = res.noise;
    // Noisy actions are scaled by the difficulty; lying low (negative) is not.
    if (noise > 0) noise = Math.round((noise + (sloppy ? 5 : 0)) * state.diff.noiseMul);
    red.detection = Math.max(0, Math.min(100, red.detection + noise));

    // Remember the move. The AI attacker replays this list in the Blue phase.
    red.history.push({
      type: action.type, target: action.target, weak: action.weak, cred: action.cred,
      turn: red.turn, noise: noise, techs: res.techs.slice(), text: GM.Rules.describe(action)
    });

    // Explain the move in the terminal: command, what, why, result, cost.
    GM.Explain.red(state, action, res, noise);
    res.techs.forEach(function (t) { GM.Game.unlock(t); });
    GM.State.fx(state, from === action.target ? null : from, action.target, '#ff3355');
    if (action.type === 'exploit' || action.type === 'escalate' || res.win) GM.UI.flash('fx-red');
    GM.Audio.play(res.win ? 'win' : (action.type === 'exploit' || action.type === 'escalate') ? 'hit' : 'blip');

    red.turn++;
    if (res.win) GM.Game.endRed('breach');
    else if (red.detection >= 100) GM.Game.endRed('caught');
    else if (red.turn > red.maxTurns) GM.Game.endRed('timeout');
  },

  /* A one-line nudge for new players, shown in the side panel. */
  coach: function (state) {
    var att = state.red.att;
    var known = Object.keys(att.discovered).length;
    var shells = Object.keys(att.access);
    if (known <= 1) return 'Start with SCAN: a ping sweep shows which hosts are alive.';
    if (Object.keys(att.loot).length) {
      var cid = Object.keys(att.loot)[0], c = GM.CREDS[cid];
      if (!att.access[c.target]) return 'You hold ' + c.label + '. Select ' + GM.NODES[c.target].name + ' and PIVOT in (you must be on a neighbouring node).';
    }
    if (!shells.length) return 'Click a host, port-SCAN it, then EXPLOIT a weakness. Loud moves fill the detection meter.';
    if (att.pos === 'NET' || !att.access[att.pos]) return 'You have a shell. Select that node and PIVOT onto it to work from inside.';
    if (att.access[att.pos] === 'user') return 'You are only a normal user here. ESCALATE to admin to loot credentials.';
    return 'Sweep from here to find new hosts, or pivot toward the database.';
  }
};

/* ============================================================
   state.js — THE GAME STATE (one object holds the whole run)
   ------------------------------------------------------------
   Every fact about the current run lives in ONE plain object,
   GM.state. Logic files (red.js, blue.js, ai.js) change it;
   drawing files (map.js, ui.js) only read it. After any change
   the UI re-renders from scratch, so the screen can never
   disagree with the state. Flow:

     input -> red.js / blue.js -> GM.state -> ui.js + map.js
   ============================================================ */
window.GM = window.GM || {};

/* DIFFICULTY ---------------------------------------------------
   headStart : AI moves before the Blue phase begins
   blueTurns : turns the defender must hold
   noiseMul  : multiplies every noisy Red action
   scoreMul  : multiplies the final score                       */
GM.DIFFS = {
  easy:   { key: 'easy',   name: 'EASY',   headStart: 1, blueTurns: 14, noiseMul: 0.8,  scoreMul: 0.8 },
  normal: { key: 'normal', name: 'NORMAL', headStart: 2, blueTurns: 12, noiseMul: 1,    scoreMul: 1 },
  hard:   { key: 'hard',   name: 'HARD',   headStart: 3, blueTurns: 10, noiseMul: 1.25, scoreMul: 1.3 }
};

/* SETTINGS that survive between visits (difficulty, music on/off,
   best score, badges). Stored in the browser's localStorage. */
GM.Settings = {
  diff: 'normal', music: true, best: 0, badges: {},
  load: function () {
    try {
      var o = JSON.parse(localStorage.getItem('gitm-settings') || '{}') || {};
      if (GM.DIFFS[o.diff]) GM.Settings.diff = o.diff;
      if (typeof o.music === 'boolean') GM.Settings.music = o.music;
      GM.Settings.best = +o.best || 0;
      GM.Settings.badges = o.badges || {};
    } catch (e) { /* storage blocked: defaults are fine */ }
  },
  save: function () {
    try {
      var S = GM.Settings;
      localStorage.setItem('gitm-settings', JSON.stringify({ diff: S.diff, music: S.music, best: S.best, badges: S.badges }));
    } catch (e) { /* ignore */ }
  }
};

GM.State = {
  create: function () {
    return {
      diff: GM.DIFFS[GM.Settings.diff],   // difficulty chosen on the title screen
      autoRuns: 0,           // times a typed command was skipped with AUTO-RUN
      phase: 'title',        // title | tutorial | red | brief | blue | end
      view: 'reveal',        // what the map shows: 'red' (attacker fog),
                             // 'blue' (defender's knowledge), 'reveal' (truth)
      selected: null,        // node the player has highlighted
      def: GM.Rules.newDefense(),   // Blue's hardening (empty during Red)

      red: {
        att: GM.Rules.newAttacker(),
        turn: 1, maxTurns: 20,
        detection: 0,        // 0..100. Reaching 100 means you were caught.
        history: [],         // every action taken; the AI replays this list
        outcome: null        // 'breach' | 'caught' | 'timeout'
      },

      blue: null,            // built by Blue.init() when the phase starts
      ai: null,              // built by AI.init()

      feed: [],              // scrolling message log { text, cls }
      fx: [],                // short map animations { from, to, t0, color }
      typedOnce: {},         // commandId -> true once typed (first time is mandatory)
      typed: 0,              // commands typed correctly (score bonus)
      outcome: null,         // 'survived' | 'breached'
      outcomeWhy: '',
      runId: 'GITM-' + Math.random().toString(36).slice(2, 7).toUpperCase()
    };
  },

  /* Add a line to the message feed. cls picks the colour:
     'red' 'green' 'amber' 'cyan' 'dim' 'log'. */
  log: function (state, text, cls, label) {
    // label (optional) is a short tag such as WHAT / WHY / RESULT shown in front.
    state.feed.push({ text: text, cls: cls || '', label: label || '' });
    if (state.feed.length > 500) state.feed.shift();
  },

  /* Queue a little "packet" animation along an edge of the map. */
  fx: function (state, from, to, color) {
    if (!to) return;
    if (!from) from = to;      // an action on the spot still gets a little burst
    state.fx.push({ from: from, to: to, t0: (typeof performance !== 'undefined' ? performance.now() : 0), color: color });
  }
};

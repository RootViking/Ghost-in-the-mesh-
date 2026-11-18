/* ============================================================
   main.js — STARTS THE GAME AND MOVES IT BETWEEN PHASES
   ------------------------------------------------------------
   Phase order:
     title -> (tutorial) -> red -> brief -> blue -> end
   GM.Game owns those transitions. This file also runs the
   draw loop and translates mouse and keyboard input into
   "select a node" or "press that panel button".
   ============================================================ */
window.GM = window.GM || {};

(function () {
  var Game = GM.Game = {};

  /* Title screen -> tutorial -> Red phase. */
  Game.begin = function () {
    if (GM.Settings.music) GM.Music.start();     // this runs inside a click/key press, so audio is allowed
    GM.UI.openTutorial(function () { Game.startRed(); });
  };

  Game.startRed = function () {
    var s = GM.state;
    s.phase = 'red'; s.view = 'red'; s.selected = 'NET';
    GM.State.log(s, 'RED PHASE  |  you are outside the network  |  target: the customer database (DB-01)', 'head red');
    GM.State.log(s, 'Every action you take is explained here: the command, what it does, why, and what it cost.', 'ex', 'HOW');
    GM.UI.render();
  };

  /* Called by red.js when the Red phase is over. */
  Game.endRed = function (outcome) {
    var s = GM.state;
    s.red.outcome = outcome;
    s.phase = 'brief';
    GM.State.log(s, outcome === 'breach' ? 'Database reached.' : outcome === 'caught' ? 'Detection hit 100%. You were caught.' : 'Out of turns.', 'amber');
    GM.UI.showBrief(s);
    GM.UI.render();
  };

  Game.startBlue = function () {
    var s = GM.state;
    if (s.phase !== 'brief') return;
    s.phase = 'blue'; s.view = 'blue'; s.selected = null; s.fx = [];
    GM.State.log(s, 'BLUE PHASE  |  defend the network you just attacked', 'head blue');
    GM.Blue.init(s);
    GM.UI.render();
  };

  /* Called by blue.js when the run is decided. */
  Game.end = function (outcome, why) {
    var s = GM.state;
    s.outcome = outcome; s.outcomeWhy = why;
    s.phase = 'end'; s.view = 'reveal'; s.selected = null;
    // Save the best score and any badges earned, for the title screen.
    var sc = GM.Report.score(s);
    s.newBest = sc.total > GM.Settings.best;
    if (s.newBest) GM.Settings.best = sc.total;
    GM.Report.badges(s).forEach(function (bd) { if (bd.got) GM.Settings.badges[bd.id] = true; });
    GM.Settings.save();
    GM.UI.flash(outcome === 'survived' ? 'fx-green' : 'fx-red');
    GM.Audio.play(outcome === 'survived' ? 'win' : 'bad');
    GM.UI.showEnd(s);
    GM.UI.render();
  };

  Game.restart = function () {
    GM.state = GM.State.create();
    Game.startRed();              // skip the tutorial on replays (press H for help)
  };

  /* Unlock a codex card and announce it (only the first time). */
  Game.unlock = function (techId) {
    if (GM.Codex.unlock(techId)) GM.UI.toast('CODEX UNLOCKED: ' + techId + ' ' + GM.TECH[techId].name);
  };

  /* ---------------- input ---------------- */
  function clickKey(key) {
    var el = document.querySelector('#panel button[data-key="' + key + '"]:not([disabled])');
    if (el) { el.click(); return true; }
    return false;
  }

  /* Move the selection to the next/previous selectable node. */
  function cycle(dir) {
    var s = GM.state, list = GM.Map.selectable(s);
    if (!list.length) return;
    var i = list.indexOf(s.selected);
    s.selected = list[(i + dir + list.length) % list.length];
    GM.UI.render();
  }

  function onKey(e) {
    var s = GM.state, k = e.key;
    if (GM.Terminal.isOpen) { GM.Terminal.key(e); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (GM.UI.codexOpen) { if (k === 'Escape' || k === 'c' || k === 'C') GM.UI.closeCodex(); return; }
    if (GM.UI.tutOpen) {
      if (k === 'Enter' || k === 'ArrowRight') { e.preventDefault(); GM.UI.tutNext(); }
      else if (k === 'ArrowLeft') GM.UI.tutBack();
      else if (k === 'Escape') GM.UI.closeTutorial();
      return;
    }
    if (k === 'm' || k === 'M') { document.getElementById('btn-sound').click(); return; }
    if (k === 'b' || k === 'B') { GM.Music.toggle(); GM.UI.syncSettings(); return; }
    if (k === 'c' || k === 'C') { GM.UI.openCodex(); return; }

    // Enter on a focused button already "clicks" it; do not act twice.
    var ae = document.activeElement;
    var onButton = ae && ae.tagName === 'BUTTON' && ae.offsetParent !== null;   // visible focused button
    if (s.phase === 'title') {
      var keys = Object.keys(GM.DIFFS), di = keys.indexOf(GM.Settings.diff);
      if (k === 'ArrowRight') GM.UI.setDiff(keys[Math.min(keys.length - 1, di + 1)]);
      else if (k === 'ArrowLeft') GM.UI.setDiff(keys[Math.max(0, di - 1)]);
      else if (k === 'Enter' && !onButton) Game.begin();
      return;
    }
    if (s.phase === 'brief') { if (k === 'Enter' && !onButton) Game.startBlue(); return; }
    if (s.phase === 'end') { if ((k === 'r' || k === 'R')) Game.restart(); return; }

    if (s.phase === 'red' || s.phase === 'blue') {
      if (k === 'h' || k === 'H') { GM.UI.openTutorial(null); return; }
      if (k === 't' || k === 'T') { GM.UI.toggleTerminal(); return; }
      if (k === 'Tab' || k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); cycle(1); return; }
      if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); cycle(-1); return; }
      if (/^[1-9]$/.test(k)) { clickKey(k); return; }
      if ((k === 'Enter' || k === ' ') && !onButton) { e.preventDefault(); clickKey('Enter'); return; }
    }
  }

  function onCanvasClick(e) {
    var s = GM.state;
    if (s.phase !== 'red' && s.phase !== 'blue') return;
    var cv = e.currentTarget, r = cv.getBoundingClientRect();
    // The canvas is drawn at 960x600 but CSS may show it at another size.
    var x = (e.clientX - r.left) * cv.width / r.width;
    var y = (e.clientY - r.top) * cv.height / r.height;
    var id = GM.Map.nodeAt(s, x, y);
    if (id && !(s.phase === 'blue' && id === 'NET')) { s.selected = id; GM.Audio.play('blip'); GM.UI.render(); }
  }

  /* ---------------- boot ---------------- */
  window.addEventListener('DOMContentLoaded', function () {
    GM.Codex.load();
    GM.Settings.load();
    GM.state = GM.State.create();
    var cv = document.getElementById('map');
    GM.Map.init(cv);
    GM.Terminal.init();
    GM.UI.init();
    cv.addEventListener('click', onCanvasClick);
    document.addEventListener('keydown', onKey);
    GM.UI.render();
    // The draw loop: repaint the map every animation frame.
    (function frame(now) { GM.Map.draw(GM.state, now || 0); requestAnimationFrame(frame); })(0);
  });
})();

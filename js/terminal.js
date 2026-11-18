/* ============================================================
   terminal.js — THE TYPING MINI-GAME
   ------------------------------------------------------------
   Opens a fake terminal window, shows the task and a reference
   command whose parts explain themselves on hover, and checks
   what the player types using the validators in
   data-commands.js. Nothing is ever executed.

   Terminal.open(commandId, ctx, mandatory, callback)
     callback('typed')   typed a valid command
     callback('skipped') pressed AUTO-RUN (only if not mandatory)
     callback(null)      cancelled: the action does not happen
   ============================================================ */
window.GM = window.GM || {};

(function () {
  var T = GM.Terminal = { isOpen: false };
  var cur = null;     // { cmd, ctx, cb, done }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  T.open = function (cmdId, ctx, mandatory, cb) {
    var cmd = GM.COMMANDS[cmdId];
    cur = { cmd: cmd, ctx: ctx, cb: cb, done: false };
    T.isOpen = true;

    $('term').className = 'modal term-' + cmd.side;
    $('term-title').textContent = cmd.title;
    $('term-task').textContent = cmd.task(ctx);
    // Reference command: each part is a focusable chip with a tooltip.
    $('term-parts').innerHTML = cmd.parts(ctx).map(function (p) {
      return '<span class="tok" tabindex="0" data-tip="' + esc(p.d) + '">' + esc(p.t) + '</span>';
    }).join(' ');
    $('term-explain').textContent = 'Hover or click a part of the example to see what it does.';
    $('term-prompt').textContent = cmd.prompt;
    $('term-out').innerHTML = '';
    $('term-msg').textContent = mandatory ? 'First time: type it yourself. Variations are accepted.' : 'Type it for a bonus, or auto-run.';
    $('term-msg').className = 'term-msg';
    $('term-skip').style.display = mandatory ? 'none' : '';
    $('term-skip').textContent = cmd.side === 'red' ? 'AUTO-RUN (+5 noise)' : 'AUTO-RUN (no bonus)';
    var input = $('term-input');
    input.value = ''; input.disabled = false;
    $('term').hidden = false;
    setTimeout(function () { input.focus(); }, 0);
  };

  function close(result) {
    var cb = cur.cb;
    cur = null; T.isOpen = false;
    $('term').hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();  // give the keyboard back to the game
    cb(result);
  }

  function submit() {
    if (!cur) return;
    if (cur.done) { close('typed'); return; }          // second Enter: continue
    var input = $('term-input');
    var raw = input.value;
    if (!raw.trim()) return;
    var v = cur.cmd.validate(raw, cur.ctx);
    var msg = $('term-msg');
    if (!v.ok) {
      msg.textContent = 'x  ' + v.msg;
      msg.className = 'term-msg bad';
      GM.Audio.play('bad');
      return;
    }
    // Valid: echo the command, print simulated output, wait for Enter.
    cur.done = true;
    input.disabled = true;
    $('term-out').innerHTML =
      '<div class="echo">' + esc(cur.cmd.prompt + ' ' + raw.trim()) + '</div>' +
      cur.cmd.output(cur.ctx).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');
    msg.textContent = 'OK  Command accepted. Press ENTER to continue.';
    msg.className = 'term-msg good';
    $('term-skip').style.display = 'none';
    GM.Audio.play('good');
    $('term-ok').focus();
  }

  T.init = function () {
    $('term-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    $('term-ok').addEventListener('click', submit);
    $('term-skip').addEventListener('click', function () { if (cur && !cur.done) { GM.state.autoRuns++; close('skipped'); } });
    $('term-cancel').addEventListener('click', function () { if (cur) close(cur.done ? 'typed' : null); });
    // Click or focus a part to show its explanation in a fixed line
    // (works on touch screens and with the keyboard, unlike hover).
    $('term-parts').addEventListener('click', show);
    $('term-parts').addEventListener('focusin', show);
    $('term-parts').addEventListener('mouseover', show);
    function show(e) {
      var el = e.target.closest ? e.target.closest('.tok') : null;
      if (el) $('term-explain').textContent = el.textContent + '  ->  ' + el.getAttribute('data-tip');
    }
  };

  /* Keys while the terminal is open (called from main.js). */
  T.key = function (e) {
    if (e.key === 'Escape') { e.preventDefault(); if (cur) close(cur.done ? 'typed' : null); }
    else if (e.key === 'Enter' && cur && cur.done) { e.preventDefault(); close('typed'); }
  };
})();

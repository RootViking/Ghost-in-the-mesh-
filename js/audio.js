/* ============================================================
   audio.js — SOUND EFFECTS AND BACKGROUND MUSIC (no audio files)
   ------------------------------------------------------------
   Everything you hear is generated live with the Web Audio API.

   GM.Audio  short 8-bit beeps for actions.      Toggle: M
   GM.Music  a looping chiptune made of a bass
             line, an arpeggio and a hi-hat.      Toggle: B

   Browsers only allow sound after the first click or key
   press, so the audio context is created lazily, and music
   starts when you press START (if it is switched on).
   ============================================================ */
window.GM = window.GM || {};

GM.Audio = {
  on: true,
  ctx: null,
  /* One shared audio context for effects and music. */
  getCtx: function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!GM.Audio.ctx) GM.Audio.ctx = new AC();
    if (GM.Audio.ctx.state === 'suspended') GM.Audio.ctx.resume();
    return GM.Audio.ctx;
  },
  /* Each sound is a list of notes: [frequencyHz, seconds]. */
  sounds: {
    blip:  [[440, 0.05]],
    hit:   [[220, 0.06], [330, 0.06], [494, 0.09]],
    good:  [[523, 0.06], [784, 0.10]],
    alert: [[880, 0.07], [660, 0.07], [880, 0.07]],
    bad:   [[196, 0.12], [147, 0.20]],
    win:   [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.18]]
  },
  play: function (name) {
    if (!GM.Audio.on) return;
    try {
      var ctx = GM.Audio.getCtx();
      if (!ctx) return;
      var t = ctx.currentTime;
      (GM.Audio.sounds[name] || []).forEach(function (note) {
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = note[0];
        gain.gain.setValueAtTime(0.04, t);                       // quiet on purpose
        gain.gain.exponentialRampToValueAtTime(0.001, t + note[1]);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + note[1]);
        t += note[1];
      });
    } catch (e) { /* sound is optional: never let it break the game */ }
  },
  toggle: function () { GM.Audio.on = !GM.Audio.on; return GM.Audio.on; }
};

/* ------------------------------------------------------------
   MUSIC: a tiny step sequencer.
   The tune is 4 bars of 16 steps. Each bar has a chord. Every
   step we may play a bass note, one arpeggio note and a hi-hat.
   A timer wakes up often and schedules the notes for the next
   0.2 seconds on the audio clock, which keeps the rhythm tight
   even if the browser is busy drawing.
   ------------------------------------------------------------ */
(function () {
  var Mu = GM.Music = { playing: false };
  var master = null, timer = null, step = 0, nextTime = 0;

  // Chords: [bass note, three arpeggio notes] in Hz. A minor, F, C, G.
  var BARS = [
    { bass: 110.00, arp: [220.00, 261.63, 329.63] },
    { bass: 87.31,  arp: [174.61, 220.00, 261.63] },
    { bass: 130.81, arp: [261.63, 329.63, 392.00] },
    { bass: 98.00,  arp: [196.00, 246.94, 293.66] }
  ];
  var BASS_STEPS = { 0: 1, 3: 1, 6: 1, 8: 1, 11: 1, 14: 1 };   // syncopated bass rhythm
  var ARP_ORDER = [0, 1, 2, 1, 2, 1, 0, 2];                      // which chord tone, per half-beat

  function note(ctx, type, freq, t, dur, vol) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  function hat(ctx, t, vol) {                 // a hi-hat is a very short burst of noise
    var len = Math.floor(ctx.sampleRate * 0.03);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; g.gain.value = vol;
    src.connect(g); g.connect(master); src.start(t);
  }

  function schedule() {
    var ctx = GM.Audio.ctx;
    if (!ctx || !Mu.playing) return;
    // The Blue phase plays a little faster and an octave higher: more tension.
    var blue = GM.state && GM.state.phase === 'blue';
    var stepDur = blue ? 0.125 : 0.145;
    while (nextTime < ctx.currentTime + 0.2) {
      var bar = BARS[Math.floor(step / 16) % BARS.length], s = step % 16;
      if (BASS_STEPS[s]) note(ctx, 'triangle', bar.bass, nextTime, stepDur * 1.8, 0.55);
      if (s % 2 === 0) note(ctx, 'square', bar.arp[ARP_ORDER[(s / 2) % 8]] * (blue ? 2 : 1), nextTime, stepDur * 1.2, 0.13);
      if (s % 4 === 2) hat(ctx, nextTime, 0.12);
      nextTime += stepDur;
      step = (step + 1) % 64;
    }
  }

  /* Start the loop. Must be called from a click or key press. */
  Mu.start = function () {
    try {
      var ctx = GM.Audio.getCtx();
      if (!ctx || Mu.playing) return;
      if (!master) { master = ctx.createGain(); master.connect(ctx.destination); }
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 0.6);   // fade in
      Mu.playing = true;
      step = 0; nextTime = ctx.currentTime + 0.05;
      timer = setInterval(schedule, 60);
    } catch (e) { /* music is optional */ }
  };

  Mu.stop = function () {
    if (!Mu.playing) return;
    Mu.playing = false;
    clearInterval(timer); timer = null;
    try {
      var ctx = GM.Audio.ctx;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.25);  // fade out
    } catch (e) { /* ignore */ }
  };

  /* Flip the saved setting and start or stop accordingly. */
  Mu.toggle = function () {
    GM.Settings.music = !GM.Settings.music;
    GM.Settings.save();
    if (GM.Settings.music) Mu.start(); else Mu.stop();
    return GM.Settings.music;
  };

  // Do not keep playing in a background tab.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) Mu.stop();
      else if (GM.Settings.music && GM.state && GM.state.phase !== 'title') Mu.start();
    });
  }
})();

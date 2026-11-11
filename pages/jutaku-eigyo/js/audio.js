/* ============================================================
 * audio.js : 効果音と BGM（音声ファイルは使わず、その場で音を合成する）
 * ============================================================ */
(function () {
  'use strict';
  const JE = window.JE;
  const A = JE.audio = { ctx: null, master: null, musicGain: null, timer: 0, step: 0 };
  const enabled = () => JE.save && JE.save.settings.sound && !JE.fast;

  // ブラウザの決まりで、音は「最初のクリック」のあとでないと出せない
  A.unlock = () => {
    if (A.ctx || !enabled()) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    A.ctx = new AC(); A.master = A.ctx.createGain(); A.master.gain.value = 0.5; A.master.connect(A.ctx.destination);
    A.musicGain = A.ctx.createGain(); A.musicGain.gain.value = 0; A.musicGain.connect(A.master);
  };
  // 1 音鳴らす
  function tone(freq, t0, dur, type, vol, dest, attack) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + (attack || 0.012)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || A.master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  const SFX = {
    tick:    (t) => tone(880, t, 0.06, 'sine', 0.05),
    select:  (t) => { tone(660, t, 0.09, 'triangle', 0.09); tone(990, t + 0.07, 0.14, 'triangle', 0.08); },
    add:     (t) => { tone(520, t, 0.08, 'sine', 0.1); tone(780, t + 0.06, 0.16, 'sine', 0.09); },
    build:   (t) => { tone(196, t, 0.18, 'triangle', 0.12); tone(294, t + 0.1, 0.22, 'triangle', 0.09); },
    good:    (t) => { tone(784, t, 0.16, 'sine', 0.09); tone(988, t + 0.1, 0.18, 'sine', 0.09); tone(1175, t + 0.2, 0.34, 'sine', 0.08); },
    bad:     (t) => { tone(220, t, 0.22, 'triangle', 0.1); tone(185, t + 0.14, 0.34, 'triangle', 0.1); },
    reveal:  (t) => { tone(1047, t, 0.1, 'sine', 0.06); tone(1319, t + 0.08, 0.22, 'sine', 0.06); },
    success: (t) => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.13, 0.7, 'triangle', 0.09)); },
  };
  A.sfx = (name) => { if (!enabled()) return; A.unlock(); if (!A.ctx) return; if (A.ctx.state === 'suspended') A.ctx.resume(); const f = SFX[name]; if (f) f(A.ctx.currentTime + 0.005); };

  // BGM：ゆっくりした和音と、ときどき鳴る短い音
  const CHORDS = [[261.6, 329.6, 392.0, 493.9], [220.0, 261.6, 329.6, 392.0], [174.6, 261.6, 329.6, 440.0], [196.0, 246.9, 293.7, 392.0]];
  const PENTA = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5];
  function bar() {
    if (!A.ctx || !enabled()) return;
    const t = A.ctx.currentTime + 0.05, ch = CHORDS[A.step % CHORDS.length];
    for (const f of ch) tone(f / 2, t, 4.6, 'sine', 0.05, A.musicGain, 1.2);
    for (let i = 0; i < 3; i++) if (Math.random() < 0.65) tone(PENTA[Math.floor(Math.random() * PENTA.length)], t + 0.6 + i * 1.2 + Math.random() * 0.4, 1.4, 'triangle', 0.028, A.musicGain, 0.02);
    A.step++;
  }
  A.music = (on) => {
    if (!enabled()) on = false; if (on) A.unlock(); if (!A.ctx) return;
    clearInterval(A.timer); A.timer = 0;
    const g = A.musicGain.gain, t = A.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(on ? 1 : 0, t + 1.5);
    if (on) { bar(); A.timer = setInterval(bar, 4200); }
  };
  A.refresh = () => { if (!JE.save.settings.sound) A.music(false); };
  // タブを離れているあいだは BGM を止める
  document.addEventListener('visibilitychange', () => { if (!A.ctx) return; if (document.hidden) A.ctx.suspend(); else if (enabled()) A.ctx.resume(); });
})();

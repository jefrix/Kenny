// Every sound is synthesized, so the game ships no audio files.
let ctx = null, master = null, muted = false, noiseBuf = null;
const last = {};

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export const setMuted = (m) => { muted = m; };
export const isMuted = () => muted;

function noise(dur, freq, vol, type = 'lowpass') {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime;
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur);
}
function tone(wave, f1, f2, dur, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
  o.type = wave; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
}

const SOUNDS = {
  mg: [0.05, () => noise(0.06, 2600, 0.14, 'bandpass')],
  cannon: [0.1, () => { noise(0.2, 900, 0.4); tone('square', 170, 60, 0.14, 0.14); }],
  scatter: [0.1, () => noise(0.24, 1500, 0.45)],
  laser: [0.13, () => tone('sawtooth', 1500, 900, 0.1, 0.035)],
  rail: [0.1, () => { tone('sawtooth', 2500, 90, 0.4, 0.2); noise(0.3, 4000, 0.22, 'highpass'); }],
  rocket: [0.1, () => { noise(0.45, 700, 0.28); tone('sawtooth', 160, 460, 0.32, 0.06); }],
  homing: [0.1, () => { noise(0.4, 900, 0.2); tone('sine', 400, 1200, 0.3, 0.09); }],
  mortar: [0.1, () => tone('sine', 150, 620, 0.3, 0.25)],
  flame: [0.12, () => noise(0.16, 500, 0.15)],
  arc: [0.12, () => { noise(0.1, 5000, 0.14, 'highpass'); tone('square', 900, 200, 0.08, 0.04); }],
  saw: [0.1, () => tone('sawtooth', 800, 720, 0.1, 0.05)],
  boom: [0.06, (r = 5) => { noise(0.35 + r * 0.05, 300 + r * 40, 0.55); tone('sine', 110, 30, 0.35, 0.3); }],
  die: [0.1, () => { noise(0.9, 240, 0.8); tone('sine', 80, 25, 0.8, 0.45); }],
  spark: [0.07, () => noise(0.04, 3400, 0.06, 'highpass')],
  clang: [0.14, () => { tone('square', 240, 110, 0.14, 0.16); noise(0.12, 2000, 0.2, 'bandpass'); }],
  jump: [0.2, () => tone('sawtooth', 120, 500, 0.35, 0.09)],
  click: [0.04, () => tone('square', 660, 500, 0.04, 0.05)],
  win: [1, () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => ctx && tone('triangle', f, f, 0.3, 0.2), i * 110))],
};

export function play(name, arg) {
  if (!ctx || muted || ctx.state !== 'running') return;
  const s = SOUNDS[name]; if (!s) return;
  const now = performance.now() / 1000;
  if (now - (last[name] || 0) < s[0]) return;
  last[name] = now; s[1](arg);
}

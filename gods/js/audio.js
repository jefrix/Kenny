// Every sound is synthesized, so the game ships no audio files.
let ctx = null, master = null, muted = false, noiseBuffer = null, sea = null;
const last = {};

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.4; master.connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuffer.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // The sea, always there underneath: slow-breathing low noise.
  const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
  source.buffer = noiseBuffer; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = 420; gain.gain.value = 0.055;
  lfo.frequency.value = 0.11; depth.gain.value = 0.028; lfo.connect(depth); depth.connect(gain.gain);
  source.connect(filter); filter.connect(gain); gain.connect(master); source.start(); lfo.start(); sea = gain;
}
export function setMuted(value) { muted = value; if (master) master.gain.value = muted ? 0 : 0.4; }
export const isMuted = () => muted;

function noise(duration, frequency, volume, type = 'lowpass', delay = 0) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime + delay;
  s.buffer = noiseBuffer; s.loop = true; f.type = type; f.frequency.value = frequency;
  g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + duration);
}
function tone(wave, f1, f2, duration, volume, delay = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + delay;
  o.type = wave; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + duration);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + duration + 0.02);
}
// A plucked lyre string, for anything good that happens.
const lyre = (frequency, volume = 0.1, delay = 0) => { tone('triangle', frequency, frequency * 0.995, 0.7, volume, delay); tone('sine', frequency * 2, frequency * 2, 0.34, volume * 0.35, delay); };

const SOUNDS = {
  click: [0.04, () => tone('triangle', 520, 400, 0.05, 0.08)],
  deny: [0.25, () => { tone('sawtooth', 130, 92, 0.2, 0.08); }],
  grab: [0.08, () => tone('sine', 240, 420, 0.1, 0.13)],
  drop: [0.08, () => tone('sine', 380, 190, 0.12, 0.1)],
  thud: [0.08, (big) => { noise(0.22, 340, big ? 0.65 : 0.35); tone('sine', 95, 38, 0.22, big ? 0.45 : 0.22); }],
  splash: [0.12, () => { noise(0.42, 1700, 0.26, 'highpass'); noise(0.28, 500, 0.18); }],
  raise: [0.09, () => { noise(0.14, 210, 0.2); tone('sine', 70, 95, 0.12, 0.13); }],
  lower: [0.09, () => { noise(0.14, 170, 0.2); tone('sine', 86, 54, 0.14, 0.14); }],
  thunder: [0.3, () => { noise(0.1, 6000, 0.9, 'highpass'); noise(1.8, 340, 1.05, 'lowpass', 0.03); tone('sine', 64, 26, 1.5, 0.6, 0.03); noise(1.3, 150, 0.7, 'lowpass', 0.45); }],
  fire: [0.3, () => { tone('sawtooth', 520, 66, 0.9, 0.09); noise(0.9, 900, 0.18); }],
  impactBig: [0.2, () => { noise(1.05, 420, 1); tone('sine', 78, 22, 1, 0.72); }],
  quake: [0.28, () => { noise(0.5, 90, 1); tone('sine', 44, 27, 0.45, 0.6); }],
  rain: [1, () => { noise(4.2, 3400, 0.11, 'highpass'); noise(4.2, 900, 0.06, 'bandpass'); }],
  bless: [0.5, () => [392, 494, 587, 784].forEach((f, i) => lyre(f, 0.1, i * 0.09))],
  flood: [1, () => { noise(4, 320, 0.6); noise(3.5, 900, 0.14, 'bandpass', 0.5); tone('sine', 55, 42, 3.6, 0.32); tone('sawtooth', 110, 88, 2.8, 0.035, 0.1); }],
  horn: [2, () => { tone('sawtooth', 147, 147, 1, 0.06); tone('sawtooth', 220, 220, 1, 0.045, 0.02); tone('sawtooth', 147, 110, 0.9, 0.06, 0.95); }],
  built: [0.35, () => lyre(440, 0.07)],
  birth: [0.4, () => lyre(659, 0.035)],
  convert: [0.4, () => { lyre(523, 0.1); lyre(784, 0.1, 0.11); }],
  death: [0.15, () => tone('sine', 300, 120, 0.16, 0.04)],
  hit: [0.09, () => { tone('square', 800, 260, 0.05, 0.035); noise(0.04, 2400, 0.08, 'bandpass'); }],
  collapse: [0.2, () => { noise(0.7, 560, 0.55); tone('sine', 80, 36, 0.5, 0.26); }],
  win: [9, () => [262, 330, 392, 523, 659, 784].forEach((f, i) => lyre(f, 0.15, i * 0.18))],
  lose: [9, () => [262, 233, 196, 147].forEach((f, i) => { tone('sawtooth', f, f * 0.98, 0.8, 0.07, i * 0.34); })],
};

export function play(name, argument) {
  if (!ctx || muted || ctx.state !== 'running') return;
  const s = SOUNDS[name]; if (!s) return;
  const now = performance.now() / 1000; if (now - (last[name] || 0) < s[0]) return;
  last[name] = now; s[1](argument);
}

// Made-up recordings for testing the analysis: sample packs of many kinds of
// sound in every role, at many tempos, laid out like a real recording
// (silence, piece, silence, …), each piece labelled with its role.
import { makeRng } from '../public/engine.mjs';

const TAU = 2 * Math.PI;
const hz = m => 440 * 2 ** ((m - 69) / 12);

// RBJ biquad, applied in place.
function biquad(x, sr, type, f, q = 0.707) {
  const w = TAU * Math.min(f, sr * 0.45) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }   // band-pass
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}

// A small Schroeder reverb's tail, added in place.
function reverb(x, sr, size, wet) {
  const out = new Float32Array(x.length);
  for (const [ms, g] of [[29.7, 0.8], [37.1, 0.78], [41.1, 0.76], [43.7, 0.74]]) {
    const d = Math.round(ms * size * sr / 1000), buf = new Float32Array(d);
    for (let i = 0, p = 0; i < x.length; i++, p = (p + 1) % d) { const y = buf[p]; buf[p] = x[i] + g * y; out[i] += y / 4; }
  }
  for (const ms of [5, 1.7]) {
    const d = Math.round(ms * sr / 1000), buf = new Float32Array(d);
    for (let i = 0, p = 0; i < out.length; i++, p = (p + 1) % d) { const y = buf[p], v = out[i] + 0.5 * y; buf[p] = v; out[i] = y - 0.5 * v; }
  }
  for (let i = 0; i < x.length; i++) x[i] += wet * out[i];
}

export function makeKit(seed, { sr = 48000 } = {}) {
  const r = makeRng(seed), u = (a, b) => r.uniform(a, b), pick = a => r.choice(a);
  const noise = () => r.random() * 2 - 1;
  const bpm = Math.round(u(75, 165)), beat = 60 / bpm, B = beat * sr;
  const buf = secs => new Float32Array(Math.max(1, Math.round(secs * sr)));
  const add = (x, at, y, g = 1) => { const a = Math.round(at * sr); for (let i = 0; i < y.length && a + i < x.length; i++) x[a + i] += g * y[i]; };
  const env = (t, d) => Math.exp(-t / d);

  // ---- Drums ----
  const kickKind = { f1: u(110, 260), f0: u(42, 68), d: u(0.06, 0.22), click: u(0, 0.4), drive: u(1, 3) };
  const kickHit = (k = kickKind) => {
    const x = buf(k.d * 6); let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr; ph += TAU * (k.f0 + (k.f1 - k.f0) * env(t, 0.03)) / sr;
      x[i] = Math.tanh(k.drive * Math.sin(ph) * env(t, k.d)) / Math.tanh(k.drive) + k.click * noise() * env(t, 0.003);
    }
    return x;
  };
  const subHit = () => {
    const f = u(34, 58), d = u(0.5, 1.8), drive = u(1, 2.5), x = buf(d * 4); let ph = 0;
    for (let i = 0; i < x.length; i++) { const t = i / sr; ph += TAU * (f + u(0, 1) * 0 + 40 * env(t, 0.02)) / sr; x[i] = Math.tanh(drive * Math.sin(ph) * env(t, d)) / Math.tanh(drive); }
    return x;
  };
  const snareKind = { body: u(150, 260), bd: u(0.04, 0.12), nd: u(0.08, 0.25), lo: u(700, 1800), hi: u(5000, 10000), mix: u(0.3, 0.8), clap: r.random() < 0.3 };
  const snareHit = (g = 1, k = snareKind) => {
    const x = buf(k.nd * 5), nz = Float32Array.from({ length: x.length }, noise);
    biquad(nz, sr, 'hp', k.lo); biquad(nz, sr, 'lp', k.hi);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const burst = k.clap ? Math.max(env(t, 0.008), t > 0.011 ? env(t - 0.011, 0.008) : 0, t > 0.022 ? env(t - 0.022, k.nd) : 0) : env(t, k.nd);
      x[i] = g * (k.mix * 2.5 * nz[i] * burst + (1 - k.mix) * Math.sin(TAU * k.body * t) * env(t, k.bd));
    }
    return x;
  };
  const metal = r.random() < 0.5, hatHp = u(6000, 9500);
  const hatHit = (d, g = 1) => {   // noise, or 808-style metal: six square waves
    const x = buf(d * 6);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      x[i] = metal ? [205.3, 304.4, 369.6, 522.7, 540, 800].reduce((s, f) => s + Math.sign(Math.sin(TAU * f * 1.7 * t)), 0) / 6 : noise();
    }
    biquad(x, sr, 'hp', hatHp); biquad(x, sr, 'hp', hatHp);
    for (let i = 0; i < x.length; i++) x[i] *= 3 * g * env(i / sr, d);
    return x;
  };
  const tomHit = f => { const x = buf(0.6); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / sr; ph += TAU * f * (1 + 0.5 * env(t, 0.05)) / sr; x[i] = Math.sin(ph) * env(t, 0.18) + 0.15 * noise() * env(t, 0.03); } return x; };

  // ---- Notes ----
  const key = Math.floor(u(0, 12)), scale = pick([[0, 2, 3, 5, 7, 8, 10], [0, 2, 4, 5, 7, 9, 11], [0, 3, 5, 7, 10]]);
  const note = (oct, deg) => 12 * oct + key + scale[((deg % scale.length) + scale.length) % scale.length] + 12 * Math.floor(deg / scale.length);
  const voices = {
    pluck: (f, t, d) => Math.min(1, t / 0.003) * env(t, 0.25) * (Math.sin(TAU * f * t) + 0.5 * Math.sin(2 * TAU * f * t) + 0.3 * Math.sin(3 * TAU * f * t)),
    saw: (f, t, d) => Math.min(1, t / 0.005) * (t < d ? 1 : env(t - d, 0.05)) * [1, 2, 3, 4, 5, 6, 7, 8].reduce((s, h) => s + Math.sin(TAU * f * h * t) / h, 0) * 0.6,
    square: (f, t, d) => Math.min(1, t / 0.005) * (t < d ? 0.8 : 0.8 * env(t - d, 0.05)) * [1, 3, 5, 7, 9].reduce((s, h) => s + Math.sin(TAU * f * h * t) / h, 0),
    bell: (f, t) => env(t, 0.6) * Math.sin(TAU * f * t + 2 * env(t, 0.3) * Math.sin(TAU * f * 3.5 * t)),
    keys: (f, t, d) => Math.min(1, t / 0.002) * env(t, 0.5) * (Math.sin(TAU * f * t) + 0.3 * Math.sin(2 * TAU * f * t)) * (t < d ? 1 : env(t - d, 0.08)),
    pad: (f, t, d) => Math.min(1, t / 0.15) * (t < d ? 1 : env(t - d, 0.3)) * (Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * f * 1.003 * 2 * t) + 0.2 * Math.sin(TAU * f * 3 * t)) * 0.7,
  };
  const melodic = (beats, oct, voice, { chords = false, density = 0.6 } = {}) => {
    const x = buf(beats * beat + 1.5); x.beats = beats;
    for (let s = 0; s < beats * 2; s++) {
      if (s && r.random() > density) continue;
      const d = beat / 2 * (1 + Math.floor(u(0, 2))), deg = Math.floor(u(0, 7));
      const fs = chords ? [0, 2, 4].map(k => hz(note(oct, deg + k))) : [hz(note(oct, deg))];
      const a = Math.round(s * B / 2);
      for (let i = 0; a + i < x.length && i < (d + 1.2) * sr; i++) { const t = i / sr; for (const f of fs) x[a + i] += 0.35 * voices[voice](f, t, d) / fs.length ** 0.5; }
    }
    return x;
  };
  const bassLoop = beats => {
    const kind = pick(['sine', 'saw', 'square']), x = buf(beats * beat + 1); x.beats = beats;
    for (let s = 0; s < beats * 2; s++) {
      if (s && r.random() < 0.3) continue;
      const f = hz(note(pick([2, 3]), pick([0, 0, 4, 3, 5]))), a = Math.round(s * B / 2), d = beat / 2;
      for (let i = 0; a + i < x.length && i < (d + 0.2) * sr; i++) {
        const t = i / sr, e = Math.min(1, t / 0.004) * (t < d ? 1 : env(t - d, 0.03));
        x[a + i] += 0.5 * e * (kind === 'sine' ? Math.sin(TAU * f * t) : kind === 'saw' ? [1, 2, 3, 4].reduce((q, h) => q + Math.sin(TAU * f * h * t) / h, 0) : [1, 3, 5].reduce((q, h) => q + Math.sin(TAU * f * h * t) / h, 0));
      }
    }
    return x;
  };

  // ---- Pieces in their roles ----
  const loopOf = beats => { const x = buf(beats * beat + 1); x.beats = beats; return x; };
  const make = {
    riff: () => melodic(pick([4, 4, 8]), pick([5, 6]), pick(Object.keys(voices)), { chords: r.random() < 0.3 }),
    phrase: () => melodic(pick([1, 2, 2]), pick([5, 6]), pick(Object.keys(voices)), { density: 0.9 }),
    bass: () => bassLoop(pick([4, 4, 8])),
    hat: () => {
      const beats = pick([1, 2, 4, 8]), x = loopOf(beats), step = pick([0.25, 0.5, 0.5]), off = r.random() < 0.3, d = u(0.02, 0.12);
      for (let t = 0; t < beats - 1e-9; t += step) { if (off && t % 1 === 0) continue; add(x, t * beat, hatHit(d, (t / step) % 2 ? 0.6 : 1)); }
      return x;
    },
    fill: () => {
      const x = loopOf(4), toms = r.random() < 0.4;
      for (let q = 0; q < 16; q++) add(x, q * beat / 4, toms ? tomHit(220 - q * 8) : snareHit(0.3 + q * 0.045));
      return x;
    },
    kick: () => kickHit(),
    sub: () => subHit(),
    snare: () => snareHit(),
    tick: () => hatHit(u(0.008, 0.03)),
    roll: () => { const x = buf(beat + 0.3), k = pick([6, 8]); for (let q = 0; q < k; q++) add(x, q * beat / k, snareHit(0.4 + 0.08 * q)); return x; },
  };
  // A pack: a few of each, in a shuffled order.
  const counts = { riff: [2, 6], phrase: [0, 3], bass: [0, 2], hat: [1, 4], fill: [0, 1], kick: [1, 2], sub: [0, 1], snare: [1, 2], tick: [0, 1], roll: [0, 1] };
  const roles = [];
  for (const [role, [a, b]] of Object.entries(counts)) for (let k = r.int(a, b); k > 0; k--) roles.push(role);
  for (let i = roles.length - 1; i > 0; i--) { const j = r.int(0, i); [roles[i], roles[j]] = [roles[j], roles[i]]; }

  // How the pack was recorded: cut to the beat grid (a beat of tail kept,
  // like a DAW export), or left to ring out; maybe some reverb, a noisy
  // phone mic, an mp3's missing top end.
  const grid = r.random() < 0.5, wet = r.random() < 0.5 ? u(0.05, 0.3) : 0, room = u(0.8, 1.6);
  const floor = r.random() < 0.4 ? u(1e-4, 1e-3) : u(5e-5, 1e-4), mp3 = r.random() < 0.3;
  const pieces = roles.map(role => {
    let x = make[role](), beats = x.beats;
    if (wet) reverb(x, sr, room, wet);
    if (mp3) biquad(x, sr, 'lp', 16000);
    if (grid) {   // whole beats: the loop plus a beat, or a one-shot's own beats
      const loopy = ['riff', 'phrase', 'bass', 'hat', 'fill'].includes(role);
      let len = x.length;
      if (loopy) len = (beats + 1) * B;
      else len = Math.max(1, Math.ceil(x.length / B - 0.5)) * B;
      x = x.slice(0, Math.min(x.length, Math.round(len)));
    } else {   // until it's gone
      let last = x.length - 1; while (last > 0 && Math.abs(x[last]) < 1e-4) last--;
      x = x.slice(0, last + 1);
    }
    let top = 0; for (const v of x) top = Math.max(top, Math.abs(v));
    const g = u(0.3, 0.9) / (top || 1);
    return x.map(v => v * g);
  });
  const gap = Math.round(0.5 * sr), L = new Float32Array(pieces.reduce((s, p) => s + p.length + gap, gap));
  let o = gap;
  for (const p of pieces) { for (let k = 0; k < p.length; k++) L[o + k] = p[k] + floor * noise(); o += p.length + gap; }
  return { rec: { sr, L, R: L }, roles, bpm, how: { grid, wet: +wet.toFixed(2), floor: floor > 1e-4, mp3, metal } };
}

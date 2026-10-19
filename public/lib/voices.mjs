// The instruments added for every kind of music (lib/synth.mjs plays them
// beside its first ones): keys, mallets, plucked and bowed strings, reeds
// and winds, voices, synths and 8-bit, basses, and drums from a brush kit,
// a rock kit, an 8-bit kit and the world's hand drums and bells. All made
// here from oscillators, noise and filters, no samples; each note or hit
// made once and kept (the page caches them), so the cost is at the first
// hit. No DOM.
//
//   NOTE_VOICES[inst](x, f, sr, hold, noise, o)  fills x (hold + release long)
//   DRUM_VOICES[drum](sr, noise, o)  -> Float32Array
//   o = { vel: 0..1 how hard it is struck (brighter as it grows), v: 0 or 1 which of the
//   two round-robin takes (another noise, phase and a hair of pitch), ph: a start phase }

const TAU = 2 * Math.PI;

// A small random source for the noisy voices: the same sound every time.
export function noiseOf(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  };
}
// A two-pole resonant band-pass (a state-variable filter).
export function bandpass(x, sr, f, q = 6) {
  const out = new Float32Array(x.length);
  const k = 2 * Math.sin((Math.PI * Math.min(f, sr / 6)) / sr);
  let low = 0;
  let band = 0;
  for (let i = 0; i < x.length; i++) {
    low += k * band;
    const high = x[i] - low - band / q;
    band += k * high;
    out[i] = band;
  }
  return out;
}
// A resonant low-pass whose cutoff may move (the trapezoid state-variable
// filter: stable at any cutoff). cut(i) -> Hz, asked every 32 samples.
function lowpass(x, sr, cut, q = 0.7) {
  let ic1 = 0;
  let ic2 = 0;
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;
  const k = 1 / q;
  for (let i = 0; i < x.length; i++) {
    if (!(i & 31)) {
      const g = Math.tan((Math.PI * Math.min(cut(i), sr * 0.45)) / sr);
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    }
    const v3 = x[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    x[i] = v2;
  }
  return x;
}
// One pole, in place.
function onepole(x, sr, hz, high = false) {
  const c = 1 - Math.exp((-TAU * Math.min(hz, sr * 0.45)) / sr);
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    s += c * (x[i] - s);
    x[i] = high ? x[i] - s : s;
  }
  return x;
}
// Band-limited saw and pulse (PolyBLEP): the edge smoothed so high notes don't alias.
const blep = (t, dt) => {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
};
const saw = (p, dt) => 2 * p - 1 - blep(p, dt);
const pulse = (p, dt, w = 0.5) => saw(p, dt) - saw((p + 1 - w) % 1, dt);
// Sine partials, each dying away on its own: [[Hz, level, seconds to 1/e]],
// added into x. Turned by a rotation each sample (no sin or exp in the
// loop), so a chord of them costs little on a phone.
function partials(x, sr, list) {
  for (const [f, a, d] of list) {
    if (f >= sr * 0.45) continue;
    const w = (TAU * f) / sr;
    const c = Math.cos(w);
    const s = Math.sin(w);
    const k = Math.exp(-1 / (d * sr));
    let re = a;
    let im = 0;
    for (let i = 0; i < x.length; i++) {
      x[i] += im;
      const r = (re * c - im * s) * k;
      im = (re * s + im * c) * k;
      re = r;
    }
  }
  return x;
}
// x shaped in place: held `hold` seconds, then let go over `rel`; an attack of `a` seconds.
function shape(x, sr, hold, rel, a = 0.002) {
  const h = Math.round(hold * sr);
  const k = Math.exp(-3 / (rel * sr));
  const na = Math.max(1, Math.round(a * sr));
  let g = 1;
  for (let i = 0; i < x.length; i++) {
    if (i >= h) g *= k;
    x[i] *= g * (i < na ? i / na : 1);
  }
  return x;
}
// Held `hold` seconds, then let go over `rel`.
const gateOf = (t, hold, rel) => (t < hold ? 1 : Math.exp((-3 * (t - hold)) / rel));
const attack = (t, a) => (t < a ? t / a : 1);
// A vibrato that comes in after `delay` seconds.
const vibOf = (t, rate, depth, delay = 0.25) => 1 + depth * Math.sin(TAU * rate * t) * Math.min(1, Math.max(0, (t - delay) / 0.3));

// A plucked string (Karplus and Strong's): a burst round a loop a period
// long, each pass a little darker. bright: how much of the burst's top is
// kept; decay: the loop's gain.
function pluckString(x, f, sr, hold, { bright = 0.5, decay = 0.996, mute = 0.9, pick = 1 }, noise) {
  const period = Math.max(2, Math.round(sr / f));
  const loop = new Float32Array(period);
  let lp = 0;
  for (let j = 0; j < period; j++) {
    lp += bright * (noise() - lp);
    loop[j] = lp * pick;
  }
  let prev = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const j = i % period;
    const v = loop[j];
    const g = t < hold ? decay : decay * mute;
    loop[j] = g * (0.5 * (v + prev));
    prev = v;
    x[i] = v;
  }
  return x;
}

// Each note: x (its length set by RELEASE), f in Hz, held `hold` seconds.

// ---- The core voices: the ones every song plays (keys, piano, pad, strings, pluck, lead, bass) ----
// Each is built from band-limited oscillators (PolyBLEP) or sines, through a
// filter that moves with its own envelope, and answers `o.vel` with brightness.
const dec = (tau, sr) => Math.exp(-1 / (tau * sr));
// The six squares of a TR-808's metal hats (Hz), the hat's own ratios.
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

export const NOTE_VOICES = {
  keys(x, f, sr, hold, noise, o) {
    // An electric piano (two-operator FM): the body is the note modulating itself, harder struck, more index;
    // on top a tine, a high partial that rings a while, and the bark of the strike.
    const v = o.vel;
    const w = (TAU * f) / sr;
    const dI = dec(0.7, sr);
    const dA = dec(1.1, sr);
    const dT = dec(0.3, sr);
    const dK = dec(0.012, sr);
    const r = Math.min(14, Math.floor((sr * 0.42) / f));   // (the tine, as high a partial as the rate holds)
    let I = 1.1 + 2.2 * v;
    let A = 1;
    let T = 0.25 + 0.9 * v;
    let K = 0.9 * v;
    let ph = o.ph;
    for (let i = 0; i < x.length; i++) {
      ph += w;
      const t = i / sr;
      let y = Math.sin(ph + (0.45 + I) * Math.sin(ph)) * A;
      if (r >= 3) y += 0.4 * T * Math.sin(r * ph + 1.2 * Math.sin(ph));
      y += 0.3 * K * Math.sin(3 * ph + 2 * Math.sin(ph)) + (i < sr * 0.003 ? 0.15 * v * noise() : 0);
      x[i] = y * attack(t, 0.0015) * gateOf(t, hold, 0.5);
      I *= dI; A *= dA; T *= dT; K *= dK;
    }
  },
  rhodes(x, f, sr, hold, noise, o) {
    // A tine: FM whose brightness fades with how hard it was hit, a bell-ish strike, a slow tremolo.
    const v = o.vel;
    const w = (TAU * f) / sr;
    const dI = dec(0.3, sr);
    const dB = dec(0.25, sr);
    const rb = Math.min(11.3, (sr * 0.42) / f);
    const bell = rb >= 3;
    let I = 0.8 + 2.4 * v;
    let B = 0.12 + 0.85 * v;
    let ph = o.ph;
    for (let i = 0; i < x.length; i++) {
      ph += w;
      const t = i / sr;
      const base = 0.5 + 0.28 * v;
      const y = Math.sin(ph + (0.3 + I + base) * Math.sin(ph)) + (bell ? B * 1.3 * Math.sin(rb * ph) : 0) + 0.15 * Math.sin(2 * ph + I * Math.sin(2 * ph)) * (0.4 + I / 3);
      x[i] = Math.tanh(1.1 * y) * (1 + 0.1 * Math.sin(TAU * 4.6 * t + o.ph)) * Math.exp(-t / 1.6) * attack(t, 0.002) * gateOf(t, hold, 0.4);
      I = 0.3 + (I - 0.3) * dI; B *= dB;
    }
  },
  piano(x, f, sr, hold, noise, o) {
    // Two strings a hair apart, a dozen partials a little sharp (stiff strings), the high ones dying first;
    // harder struck, more of the upper partials; the hammer's thud on top.
    const v = o.vel;
    const roll = 7 + 14 * v;
    const list = [];
    for (let k = 1; k <= 16; k++) {
      const fk = f * k * Math.sqrt(1 + 0.0004 * k * k);
      if (fk > sr * 0.42) break;
      const a = (1.1 / k ** 0.6) * Math.exp(-(k - 1) / roll) * (k % 4 === 0 ? 0.7 : 1);
      const d = 2.2 / (1 + 0.3 * k) / (f > 600 ? 1.5 : 1);
      list.push([fk, a, d], [fk * 1.0009, a * 0.6, d]);
    }
    partials(x, sr, list);
    const n = Math.round(sr * 0.012);
    let lp = 0;
    for (let i = 0; i < Math.min(n, x.length); i++) {
      lp += 0.5 * (noise() - lp);
      x[i] += lp * (0.35 + 0.65 * v) * 0.5 * (1 - i / n) ** 2;
    }
    shape(x, sr, hold, 0.35, 0.0012);
  },
  pad(x, f, sr, hold, noise, o) {
    // Three pairs of saws a few cents apart, through a low-pass that opens as the note swells (600 Hz to 3.5 kHz).
    const dets = [-7, -4.2, -1.4, 1.4, 4.2, 7].map(c => 2 ** (c / 1200));
    const dts = dets.map(d => (f * d) / sr);
    const ps = dets.map((_, k) => (k * 0.17 + o.ph * 0.1) % 1);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      let y = 0;
      for (let k = 0; k < 6; k++) {
        ps[k] += dts[k];
        if (ps[k] >= 1) ps[k] -= 1;
        y += saw(ps[k], dts[k]);
      }
      x[i] = y * attack(t, 0.12) * gateOf(t, hold, 0.8);
    }
    const open = 0.75 + 0.25 * o.vel;
    lowpass(x, sr, i => Math.min(7000, (600 + 3400 * (1 - Math.exp(-i / sr / 0.35))) * open + f * 0.5), 0.8);
  },
  strings(x, f, sr, hold, noise, o) {
    // Five saws a little apart, a slow bow and a vibrato that comes in, a low-pass at 4 kHz.
    const dets = [-8, -3.5, 0, 3.5, 8].map(c => 2 ** (c / 1200));
    const ps = dets.map((_, k) => (k * 0.23 + o.ph * 0.1) % 1);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const vib = vibOf(t, 5.2, 0.0035, 0.3);
      let y = 0;
      for (let k = 0; k < 5; k++) {
        const dt = (f * dets[k] * vib) / sr;
        ps[k] += dt;
        if (ps[k] >= 1) ps[k] -= 1;
        y += saw(ps[k], dt);
      }
      x[i] = y * attack(t, 0.14 - 0.06 * o.vel) * gateOf(t, hold, 0.6);
    }
    lowpass(x, sr, () => 1800 + 2200 * o.vel, 0.7);
  },
  pluck(x, f, sr, hold, noise, o) {
    // A saw and a sine through a low-pass that snaps shut (harder struck, wider open), dying away.
    const v = o.vel;
    let p = o.ph * 0.1;
    const dt = f / sr;
    const w = (TAU * f) / sr;
    let ph = o.ph * 0.15;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      p += dt;
      if (p >= 1) p -= 1;
      ph += w;
      x[i] = (0.7 * saw(p, dt) + 0.5 * Math.sin(ph)) * attack(t, 0.002) * Math.exp(-t / 0.26) * gateOf(t, hold, 0.3);
    }
    lowpass(x, sr, i => f * (2.2 + (5 + 13 * v) * Math.exp(-i / sr / 0.09)) + 200, 1.3);
  },
  lead(x, f, sr, hold, noise, o) {
    // A pulse whose width slowly moves (a chorus with no detune), a little saw, a filter that opens at the hit.
    const v = o.vel;
    let p = o.ph * 0.1;
    let q = 0.5 + o.ph * 0.1;
    const dt = f / sr;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      p += dt; if (p >= 1) p -= 1;
      q += dt; if (q >= 1) q -= 1;
      const wd = 0.5 + 0.11 * Math.sin(TAU * 0.9 * t + o.ph);
      x[i] = (pulse(p, dt, wd) * 0.7 + saw(q, dt) * 0.3) * attack(t, 0.006) * gateOf(t, hold, 0.15);
    }
    lowpass(x, sr, i => Math.min(9000, f * (2.5 + 3 * v + (2 + 8 * v) * Math.exp(-i / sr / 0.15)) + 600), 0.9);
  },
  bass(x, f, sr, hold, noise, o) {
    // A saw through a closing low-pass, driven so its second and third harmonics carry on a phone's speaker.
    const v = o.vel;
    let p = o.ph * 0.1;
    const dt = f / sr;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      p += dt; if (p >= 1) p -= 1;
      x[i] = saw(p, dt) * attack(t, 0.003) * gateOf(t, hold, 0.18);
    }
    lowpass(x, sr, i => f * (1.6 + (3 + 6 * v) * Math.exp(-i / sr / 0.07)) + 60, 1.1);
    for (let i = 0; i < x.length; i++) x[i] = Math.tanh(2.2 * x[i]);
  },
  subbass(x, f, sr, hold, noise, o) {
    // A sine with its second harmonic, driven: the 3rd and 5th come out where a small speaker can play them.
    let ph = o.ph;
    const w = (TAU * f) / sr;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      ph += w;
      x[i] = Math.tanh(2.3 * (Math.sin(ph) + 0.3 * Math.sin(2 * ph))) * attack(t, 0.004) * gateOf(t, hold, 0.12);
    }
  },
  clav(x, f, sr, hold, noise) {
    // A struck string with a narrow pulse's bite, through a bright filter, muted fast.
    let p = 0;
    const dt = f / sr;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      p = (p + dt) % 1;
      x[i] = (pulse(p, dt, 0.18) * 0.7 + (i < sr * 0.002 ? noise() * 0.3 : 0)) * Math.exp(-t / 0.35) * gateOf(t, hold, 0.08);
    }
    lowpass(x, sr, i => f * (3 + 9 * Math.exp(-i / sr / 0.05)), 1.4);
    onepole(x, sr, 120, true);
  },
  vibes(x, f, sr, hold) {
    // A bar's note and its fourth partial (as tuned on a vibraphone), the motor's tremolo.
    partials(x, sr, [[f, 1, 1.4], [4 * f, 0.3, 0.22], [10 * f, 0.08, 0.02]]);
    for (let i = 0; i < x.length; i++) x[i] *= 1 - 0.3 * (0.5 + 0.5 * Math.sin((TAU * 5.5 * i) / sr));
    shape(x, sr, hold, 0.5, 0.0015);
  },
  marimba(x, f, sr, hold) {
    const d = f > 500 ? 0.22 : 0.4;
    shape(partials(x, sr, [[f, 1, d], [4 * f, 0.35, 0.035], [9.9 * f, 0.12, 0.011]]), sr, hold, 0.2, 0.001);
  },
  kalimba(x, f, sr, hold, noise) {
    partials(x, sr, [[f, 1, 0.7], [5.4 * f, 0.28, 0.045], [2 * f, 0.1, 0.21]]);
    for (let i = 0; i < Math.round(sr * 0.003); i++) x[i] += noise() * 0.15;
    shape(x, sr, hold, 0.4, 0.0015);
  },
  musicbox(x, f, sr, hold) {
    shape(partials(x, sr, [[f, 1, 0.9], [2 * f, 0.25, 0.28], [4.24 * f, 0.18, 0.07]]), sr, hold, 0.6, 0.001);
  },
  glass(x, f, sr, hold) {
    // FM at an odd ratio: a cold, glassy bell.
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const ph = TAU * f * t;
      x[i] = Math.sin(ph + 2.6 * Math.exp(-t / 0.35) * Math.sin(1.41 * ph)) * Math.exp(-t / 1.5) * attack(t, 0.002) * gateOf(t, hold, 0.9);
    }
  },
  steel(x, f, sr, hold) {
    // A steel pan: the note, its octave and the fifth above that, a small dip in pitch as it's struck.
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      ph += (TAU * f * (1 + 0.012 * Math.exp(-t / 0.02))) / sr;
      const y = Math.sin(ph) + 0.55 * Math.sin(2 * ph) * Math.exp(-t / 0.3) + 0.3 * Math.sin(3 * ph) * Math.exp(-t / 0.12) + 0.12 * Math.sin(4.02 * ph) * Math.exp(-t / 0.05);
      x[i] = y * Math.exp(-t / 0.75) * attack(t, 0.002) * gateOf(t, hold, 0.4);
    }
  },
  harp(x, f, sr, hold, noise) {
    pluckString(x, f, sr, hold, { bright: 0.35, decay: 0.998, mute: 0.995 }, noise);
    onepole(x, sr, 5000);
  },
  nylon(x, f, sr, hold, noise) {
    pluckString(x, f, sr, hold, { bright: 0.28, decay: 0.997, mute: 0.985 }, noise);
    onepole(x, sr, 3800);
  },
  banjo(x, f, sr, hold, noise) {
    pluckString(x, f, sr, hold, { bright: 0.85, decay: 0.991, mute: 0.97 }, noise);
    const b = bandpass(x, sr, 1800, 2);
    for (let i = 0; i < x.length; i++) x[i] = x[i] * 0.7 + b[i] * 0.6;
  },
  guzheng(x, f, sr, hold, noise) {
    // A bright plucked silk string, then the left hand's wobble (揉弦) as it rings.
    const list = [];
    for (let k = 1; k <= 6; k++) list.push([f * k, 1 / k, 1 / (1.2 + 2.2 * k)]);
    partials(x, sr, list);
    for (let i = 0; i < Math.round(sr * 0.004); i++) x[i] += noise() * 0.2;
    // (The wobble: the note read a little ahead and behind, a moving delay.)
    const y = Float32Array.from(x);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const d = (0.0012 * Math.sin(TAU * 5.5 * t) * Math.min(1, Math.max(0, (t - 0.18) / 0.3)) + 0.0012) * sr;
      const at = i - d;
      const j = Math.floor(at);
      const fr = at - j;
      x[i] = j >= 0 && j + 1 < y.length ? y[j] * (1 - fr) + y[j + 1] * fr : 0;
    }
    shape(x, sr, hold, 0.5, 0.0015);
  },
  sitar(x, f, sr, hold, noise) {
    // A plucked string buzzing on its flat bridge (the jawari): the loop's sound bent, bright partials ringing long.
    pluckString(x, f, sr, hold, { bright: 0.7, decay: 0.9975, mute: 0.99 }, noise);
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      x[i] = v + 1.6 * Math.abs(v) * v - 0.4 * v * v;
    }
    onepole(x, sr, 90, true);
    const b = bandpass(x, sr, 2600, 3);
    for (let i = 0; i < x.length; i++) x[i] += 0.5 * b[i];
  },
  pizz(x, f, sr, hold, noise) {
    pluckString(x, f, sr, hold, { bright: 0.4, decay: 0.986, mute: 0.97 }, noise);
    const b = bandpass(x, sr, 500, 1.5);
    for (let i = 0; i < x.length; i++) x[i] = x[i] * 0.8 + b[i] * 0.5;
  },
  erhu(x, f, sr, hold, noise) {
    // Two strings bowed: a saw sliding up into the note, a singer's vibrato, through the snakeskin's nasal formant.
    let p = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const fi = f * 2 ** (-0.7 * Math.exp(-t / 0.05) / 12) * vibOf(t, 6, 0.012, 0.15);
      const dt = fi / sr;
      p = (p + dt) % 1;
      x[i] = (saw(p, dt) + 0.04 * noise()) * attack(t, 0.07) * gateOf(t, hold, 0.18);
    }
    const a = bandpass(x, sr, 1100, 2.5);
    const b = bandpass(x, sr, 2600, 4);
    for (let i = 0; i < x.length; i++) x[i] = a[i] + 0.5 * b[i] + 0.15 * x[i];
  },
  sax(x, f, sr, hold, noise) {
    // A reed: a saw and a square through a filter that opens as it's blown, breath on top.
    let p = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const fi = f * vibOf(t, 5, 0.006, 0.3);
      const dt = fi / sr;
      p = (p + dt) % 1;
      x[i] = (0.6 * saw(p, dt) + 0.4 * pulse(p, dt, 0.42) + 0.06 * noise()) * attack(t, 0.03) * gateOf(t, hold, 0.12);
    }
    lowpass(x, sr, i => f * (2 + 3.5 * Math.min(1, i / sr / 0.06)) + 400, 1.6);
    const b = bandpass(x, sr, 1500, 2);
    for (let i = 0; i < x.length; i++) x[i] = Math.tanh(1.5 * (x[i] + 0.4 * b[i]));
  },
  flute(x, f, sr, hold, noise) {
    // Nearly a sine, its breath and the chiff as it starts.
    let ph = 0;
    let br = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      ph += (TAU * f * vibOf(t, 4.8, 0.005, 0.3)) / sr;
      br += 0.3 * (noise() - br);
      const chiff = Math.exp(-t / 0.03);
      x[i] = (Math.sin(ph) + 0.22 * Math.sin(2 * ph) + 0.06 * Math.sin(3 * ph) + br * (0.12 + 0.5 * chiff)) * attack(t, 0.05) * gateOf(t, hold, 0.12);
    }
  },
  harmonica(x, f, sr, hold, noise) {
    let p = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const fi = f * 2 ** (-0.5 * Math.exp(-t / 0.04) / 12);
      const dt = fi / sr;
      p = (p + dt) % 1;
      x[i] = (pulse(p, dt, 0.3) + 0.05 * noise()) * (1 + 0.15 * Math.sin(TAU * 6 * t) * Math.min(1, t / 0.4)) * attack(t, 0.025) * gateOf(t, hold, 0.1);
    }
    const a = bandpass(x, sr, 1300, 2);
    for (let i = 0; i < x.length; i++) x[i] = 0.4 * x[i] + a[i];
    onepole(x, sr, 4500);
  },
  accordion(x, f, sr, hold) {
    // Three reeds a little apart (the musette's shimmer), the bellows' swell.
    const ps = [0, 0.33, 0.66];
    const det = [1, 1.0045, 0.9955];
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      let y = 0;
      for (let v = 0; v < 3; v++) {
        const dt = (f * det[v]) / sr;
        ps[v] = (ps[v] + dt) % 1;
        y += pulse(ps[v], dt, 0.4);
      }
      x[i] = y * attack(t, 0.04) * (1 + 0.05 * Math.sin(TAU * 1.5 * t)) * gateOf(t, hold, 0.1);
    }
    lowpass(x, sr, () => Math.min(5000, f * 6), 0.9);
  },
  choir(x, f, sr, hold, noise) {
    // Voices singing "aah": three saws apart, each its vibrato, through the vowel's formants.
    const ps = [0, 0.4, 0.8];
    const det = [1, 1.006, 0.994];
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      let y = 0;
      for (let v = 0; v < 3; v++) {
        const dt = (f * det[v] * vibOf(t, 4.5 + v * 0.6, 0.005, 0.1)) / sr;
        ps[v] = (ps[v] + dt) % 1;
        y += saw(ps[v], dt);
      }
      x[i] = (y + 0.1 * noise()) * attack(t, 0.22) * gateOf(t, hold, 0.45);
    }
    const a = bandpass(x, sr, 700, 4);
    const b = bandpass(x, sr, 1150, 5);
    const c = bandpass(x, sr, 2600, 6);
    for (let i = 0; i < x.length; i++) x[i] = a[i] + 0.6 * b[i] + 0.25 * c[i];
  },
  supersaw(x, f, sr, hold) {
    // Five saws spread round the note, the trance and future-pop lead.
    const det = [-0.019, -0.008, 0, 0.009, 0.02];
    const ps = det.map((_, k) => (k * 0.37) % 1);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      let y = 0;
      for (let v = 0; v < 5; v++) {
        const dt = (f * (1 + det[v])) / sr;
        ps[v] = (ps[v] + dt) % 1;
        y += saw(ps[v], dt) * (v === 2 ? 1 : 0.75);
      }
      x[i] = y * attack(t, 0.006) * gateOf(t, hold, 0.3);
    }
    lowpass(x, sr, () => Math.min(9000, 1500 + f * 8), 0.8);
  },
  chip(x, f, sr, hold) {
    // A game console's pulse (band-limited, so it does not alias): a quarter-width square, its loudness in sixteen steps, a vibrato once held.
    let p = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const dt = (f * vibOf(t, 6, 0.01, 0.2)) / sr;
      p += dt;
      if (p >= 1) p -= 1;
      const env = Math.round(15 * attack(t, 0.002) * (0.75 + 0.25 * Math.exp(-t / 0.1)) * gateOf(t, hold, 0.1)) / 15;
      x[i] = pulse(p, dt, 0.25) * env;
    }
  },
  tri(x, f, sr, hold) {
    // The console's triangle, in sixteen steps: the 8-bit bass.
    let p = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      p = (p + f / sr) % 1;
      const tri = Math.round(15 * (p < 0.5 ? p * 2 : 2 - p * 2)) / 7.5 - 1;
      x[i] = tri * gateOf(t, hold, 0.05) * attack(t, 0.002);
    }
  },
  bass808(x, f, sr, hold) {
    // An 808 that slides up into its note, driven warm, held long.
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      ph += (TAU * f * 2 ** (-3 * Math.exp(-t / 0.045) / 12)) / sr;
      x[i] = Math.tanh(2.2 * Math.sin(ph)) * Math.exp(-t / 1.2) * attack(t, 0.003) * gateOf(t, hold, 0.15);
    }
  },
  upright(x, f, sr, hold, noise) {
    // A plucked double bass: round, a finger's thump, the wood's growl dying first.
    partials(x, sr, [[f, 1, 0.9], [2 * f, 0.5, 0.2], [3 * f, 0.25, 0.09], [4 * f, 0.1, 0.045]]);
    const n = Math.round(sr * 0.006);
    for (let i = 0; i < n; i++) x[i] += noise() * 0.25 * (1 - i / n);
    shape(x, sr, hold, 0.08, 0.003);
    onepole(x, sr, 2500);
  },
  acid(x, f, sr, hold) {
    // A 303's squelch: a saw through a resonant filter that snaps shut.
    let p = 0;
    const dt = f / sr;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      p = (p + dt) % 1;
      x[i] = saw(p, dt) * attack(t, 0.002) * gateOf(t, hold, 0.06);
    }
    lowpass(x, sr, i => f * (1.5 + 14 * Math.exp(-i / sr / 0.09)), 5);
    for (let i = 0; i < x.length; i++) x[i] = Math.tanh(1.8 * x[i]);
  },
  reese(x, f, sr, hold) {
    // Two saws just apart, beating against each other, kept low: drum and bass's growl.
    let p1 = 0;
    let p2 = 0.5;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const d1 = f / sr;
      const d2 = (f * 1.008) / sr;
      p1 = (p1 + d1) % 1;
      p2 = (p2 + d2) % 1;
      x[i] = (saw(p1, d1) + saw(p2, d2) + 0.8 * Math.sin(TAU * f * 0.5 * t)) * attack(t, 0.008) * gateOf(t, hold, 0.12);
    }
    lowpass(x, sr, i => 380 + 260 * Math.sin(TAU * 0.7 * (i / sr)), 1.2);
    for (let i = 0; i < x.length; i++) x[i] = Math.tanh(1.6 * x[i]);
  },
  distgtr(x, f, sr, hold, noise) {
    // An electric string through an overdriven amp and its cabinet.
    pluckString(x, f, sr, hold, { bright: 0.6, decay: 0.9992, mute: 0.985 }, noise);
    let peak = 1e-6;
    for (let i = 0; i < Math.min(x.length, 2000); i++) peak = Math.max(peak, Math.abs(x[i]));
    for (let i = 0; i < x.length; i++) x[i] = Math.tanh((7 * x[i]) / peak);
    lowpass(x, sr, () => 3200, 1.1);
    onepole(x, sr, 90, true);
  },
  slap(x, f, sr, hold) {
    // The thumb's pop: a saw opened wide at the hit, closing, a little ring.
    let p = 0;
    const dt = f / sr;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      p = (p + dt) % 1;
      x[i] = (saw(p, dt) * 0.7 + Math.sin(TAU * f * t)) * Math.exp(-t / 0.6) * attack(t, 0.0015) * gateOf(t, hold, 0.07);
    }
    lowpass(x, sr, i => f * (2 + 22 * Math.exp(-i / sr / 0.03)), 1.8);
  }
};
// Each note's ring after it's let go (seconds), and how loud its loudest moment is.
export const RELEASE = { keys: 0.5, pluck: 0.3, bass: 0.18, lead: 0.15, pad: 0.8, strings: 0.6, subbass: 0.12, piano: 0.6, rhodes: 0.6, clav: 0.12, vibes: 0.9, marimba: 0.35, kalimba: 0.6, musicbox: 1, glass: 1.4, steel: 0.6, harp: 1.2, nylon: 0.7, banjo: 0.4, guzheng: 0.9, sitar: 1, pizz: 0.3, erhu: 0.4, sax: 0.2, flute: 0.2, harmonica: 0.18, accordion: 0.15, choir: 0.7, supersaw: 0.45, chip: 0.12, tri: 0.08, bass808: 0.3, upright: 0.15, acid: 0.1, reese: 0.2, distgtr: 0.25, slap: 0.12 };
export const PEAK = { keys: 0.4, pluck: 0.8, bass: 0.45, lead: 0.3, pad: 0.34, strings: 0.36, subbass: 0.44, piano: 0.42, rhodes: 0.4, clav: 0.36, vibes: 0.36, marimba: 0.42, kalimba: 0.38, musicbox: 0.32, glass: 0.3, steel: 0.38, harp: 0.42, nylon: 0.45, banjo: 0.38, guzheng: 0.4, sitar: 0.55, pizz: 0.42, erhu: 0.4, sax: 0.3, flute: 0.32, harmonica: 0.36, accordion: 0.3, choir: 0.45, supersaw: 0.4, chip: 0.22, tri: 0.4, bass808: 0.6, upright: 0.55, acid: 0.36, reese: 0.42, distgtr: 0.24, slap: 0.48 };

// ---- Drums ----
const buf = (sr, s) => new Float32Array(Math.max(1, Math.round(s * sr)));
const ex = (t, d) => Math.exp(-t / d);
// Noise held for a few samples at a time: the 8-bit consoles' noise channel.
function crunch(noise, sr, rate) {
  const every = Math.max(1, Math.round(sr / rate));
  let v = 0;
  let k = 0;
  return () => (k++ % every === 0 ? (v = noise() > 0 ? 1 : -1) : v);
}
// A cymbal or a hat: noise between `lo` and `hi`, and the six squares of the 808's metal (band-limited, so they do not alias),
// high-passed at `lo`, together dying away with `d`.
function cymbal(sr, noise, o, { secs, d, base, metal, hiss, lo, hi, amp, wash = false }) {
  const x = buf(sr, secs);
  const n = x.length;
  const m = new Float32Array(n);
  const dts = METAL.map(f => (f * base) / sr);
  const ps = METAL.map((_, k) => (k * 0.29 + o.ph * 0.07) % 1);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < 6; k++) {
      ps[k] += dts[k];
      if (ps[k] >= 1) ps[k] -= 1;
      s += pulse(ps[k], dts[k]);
    }
    m[i] = s / 6;
    x[i] = noise();
  }
  const bright = 0.85 + 0.3 * o.vel;
  for (let i = 0; i < n; i++) x[i] = hiss * x[i] * 2.4 + metal * 2.2 * m[i];
  onepole(onepole(x, sr, lo * bright, true), sr, lo * bright, true);
  lowpass(x, sr, () => hi * bright, 0.8);
  const dd = d * (o.v ? 1.06 : 0.97);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // (A crash swells for a moment before it decays.)
    const e = (wash ? Math.min(1, t / 0.004) : Math.min(1, t / 0.0008)) * (ex(t, dd) * 0.8 + ex(t, dd * 3.2) * 0.2);
    x[i] *= e;
  }
  // (Brought to a level of its own: `amp`, its RMS over the whole hit.)
  let sq = 0;
  for (let i = 0; i < n; i++) sq += x[i] * x[i];
  const g = sq > 0 ? amp / Math.sqrt(sq / n) : 0;
  for (let i = 0; i < n; i++) x[i] *= g;
  return x;
}
export const DRUM_VOICES = {
  kick(sr, noise, o) {
    // A kick: a sine sweeping down into a driven thump, and the beater's click (a few ms near 3.5 kHz) so a small speaker has something to play.
    const x = buf(sr, 0.5);
    const j = o.v ? 1.03 : 1;
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      ph += (TAU * (47 * j + 125 * ex(t, 0.034))) / sr;
      const click = (0.55 * Math.sin(TAU * 3400 * t) + 0.45 * noise()) * ex(t, 0.0013) * (0.3 + 0.12 * o.vel);
      x[i] = Math.tanh(1.9 * Math.sin(ph) * ex(t, 0.16 * j)) * 0.82 + click;
    }
    return x;
  },
  hat(sr, noise, o) {
    return cymbal(sr, noise, o, { secs: 0.09, d: 0.016, base: 1, metal: 0.8, hiss: 0.5, lo: 6200, hi: 8800, amp: 0.07 });
  },
  open(sr, noise, o) {
    return cymbal(sr, noise, o, { secs: 0.45, d: 0.1, base: 1, metal: 0.8, hiss: 0.5, lo: 6200, hi: 8800, amp: 0.08 });
  },
  crash(sr, noise, o) {
    return cymbal(sr, noise, o, { secs: 1.6, d: 0.42, base: 0.9, metal: 0.8, hiss: 0.55, lo: 4800, hi: 8800, amp: 0.085, wash: true });
  },
  ride(sr, noise, o) {
    // A ride: the bell's ping (a few inharmonic partials) over a quieter wash.
    const x = cymbal(sr, noise, o, { secs: 1.1, d: 0.32, base: 1.5, metal: 0.55, hiss: 0.25, lo: 5000, hi: 9000, amp: 0.045 });
    partials(x, sr, [[523, 0.1, 0.35], [1330, 0.07, 0.25], [2340, 0.05, 0.15], [3700, 0.035, 0.1]]);
    return x;
  },
  shaker(sr, noise, o) {
    // Beads: noise between 4.5 and 11 kHz swelling in and dying away.
    const x = buf(sr, 0.14);
    for (let i = 0; i < x.length; i++) x[i] = noise();
    onepole(onepole(x, sr, 4500, true), sr, 4500, true);
    lowpass(x, sr, () => 9000, 0.8);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      x[i] *= Math.min(1, t / 0.012) * ex(t, 0.035 * (o.v ? 1.1 : 1));
    }
    let sq = 0;
    for (let i = 0; i < x.length; i++) sq += x[i] * x[i];
    const g = sq > 0 ? 0.06 / Math.sqrt(sq / x.length) : 0;
    for (let i = 0; i < x.length; i++) x[i] *= g;
    return x;
  },
  brush(sr, noise) {
    // A brush on the snare: a swish that rises and falls, the wires' hush.
    const x = buf(sr, 0.35);
    let lp = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      lp += 0.35 * (noise() - lp);
      x[i] = lp * Math.min(1, t / 0.012) * ex(t, 0.09) + 0.15 * Math.sin(TAU * 190 * t) * ex(t, 0.03);
    }
    const b = bandpass(x, sr, 3500, 1.2);
    for (let i = 0; i < x.length; i++) x[i] = 0.6 * x[i] + 0.9 * b[i];
    return x;
  },
  rkick(sr, noise) {
    // A rock kick: the beater's click, a short punch, little boom.
    const x = buf(sr, 0.4);
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      ph += (TAU * (55 + 150 * ex(t, 0.025))) / sr;
      x[i] = Math.tanh(2.2 * Math.sin(ph) * ex(t, 0.12)) * 0.68 + (i < sr * 0.003 ? noise() * 0.15 : 0) + 0.12 * Math.sin(TAU * 3000 * t) * ex(t, 0.002);
    }
    return x;
  },
  rsnare(sr, noise) {
    // A rock snare: a fat shell, bright wires, ringing longer.
    const x = buf(sr, 0.45);
    let p = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const w = noise();
      const hi = w - 0.6 * p;
      p = w;
      x[i] = 0.55 * hi * ex(t, 0.13) + 0.5 * (Math.sin(TAU * 180 * t) + 0.6 * Math.sin(TAU * 330 * t)) * ex(t, 0.06);
    }
    for (let i = 0; i < x.length; i++) x[i] = Math.tanh(1.4 * x[i]) * 0.8;
    return x;
  },
  hardkick(sr) {
    // Hardstyle's kick: a fast sweep down into a distorted, tuned tail.
    const x = buf(sr, 0.7);
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      ph += (TAU * (52 + 260 * ex(t, 0.018))) / sr;
      x[i] = Math.tanh(5 * Math.sin(ph)) * ex(t, 0.3) * Math.min(1, t / 0.001);
    }
    lowpass(x, sr, () => 2400, 0.9);
    for (let i = 0; i < x.length; i++) x[i] *= 0.8;
    return x;
  },
  chipk(sr) {
    const x = buf(sr, 0.18);
    let p = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      p = (p + (40 + 200 * ex(t, 0.03)) / sr) % 1;
      x[i] = (p < 0.5 ? 0.8 : -0.8) * Math.round(15 * ex(t, 0.06)) / 15;
    }
    return x;
  },
  chipn(sr, noise) {
    const x = buf(sr, 0.16);
    const n = crunch(noise, sr, 9000);
    for (let i = 0; i < x.length; i++) x[i] = 0.45 * n() * (Math.round(15 * ex(i / sr, 0.05)) / 15);
    return x;
  },
  chiph(sr, noise) {
    const x = buf(sr, 0.05);
    const n = crunch(noise, sr, 22000);
    for (let i = 0; i < x.length; i++) x[i] = 0.3 * n() * (Math.round(15 * ex(i / sr, 0.012)) / 15);
    return onepole(x, sr, 3000, true);
  },
  gong(sr) {
    // A Chinese gong: its partials far from a scale, swelling a moment then ringing long.
    const x = buf(sr, 2.4);
    partials(x, sr, [[110, 1, 0.8], [161.7, 0.6, 0.7], [229.9, 0.45, 0.6], [281.6, 0.35, 0.5], [345.4, 0.25, 0.4], [451, 0.15, 0.3]]);
    const a = Math.round(0.03 * sr);
    for (let i = 0; i < x.length; i++) x[i] *= 0.28 * (i < a ? i / a : 1);
    return x;
  },
  timbale(sr, noise) {
    // A high metal-shelled drum: a bright ring, the stick's crack.
    const x = buf(sr, 0.35);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      x[i] = 0.5 * (Math.sin(TAU * 420 * t) + 0.4 * Math.sin(TAU * 1130 * t) * ex(t, 0.05)) * ex(t, 0.12) + (i < sr * 0.004 ? noise() * 0.3 : 0);
    }
    return x;
  },
  cajon(sr, noise) {
    // A box drum: a low thump, the snare wires behind its front.
    const x = buf(sr, 0.3);
    let lp = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      lp += 0.5 * (noise() - lp);
      x[i] = 0.7 * Math.sin(TAU * (85 + 40 * ex(t, 0.02)) * t) * ex(t, 0.09) + 0.25 * lp * ex(t, 0.05);
    }
    return x;
  },
  tabla(sr) {
    // The tabla's "na": a tuned ring of whole-number partials, a little glide.
    const x = buf(sr, 0.5);
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      ph += (TAU * 340 * (1 + 0.06 * ex(t, 0.03))) / sr;
      x[i] = 0.45 * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) * ex(t, 0.1) + 0.3 * Math.sin(3 * ph) * ex(t, 0.05) + 0.2 * Math.sin(4 * ph) * ex(t, 0.03)) * ex(t, 0.18);
    }
    return x;
  },
  clave(sr) {
    const x = buf(sr, 0.1);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      x[i] = 0.6 * (Math.sin(TAU * 2500 * t) + 0.2 * Math.sin(TAU * 5100 * t)) * ex(t, 0.018);
    }
    return x;
  },
  tamb(sr, noise) {
    // A tambourine: jingles shaken in a quick flurry.
    const x = buf(sr, 0.25);
    let p = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const w = noise();
      const hi = w - p;
      p = w;
      const jingle = 0.6 + 0.4 * Math.sin(TAU * 38 * t);
      x[i] = 0.25 * hi * jingle * Math.min(1, t / 0.003) * ex(t, 0.07);
    }
    const b = bandpass(x, sr, 7000, 2);
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * x[i] + 0.7 * b[i];
    return x;
  },
  guiro(sr, noise) {
    // A güiro: a stick down the ridges, a click at each.
    const x = buf(sr, 0.14);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const ridge = (t * 160) % 1 < 0.25 ? 1 : 0.2;
      x[i] = noise() * ridge * Math.min(1, t / 0.01) * ex(t, 0.06);
    }
    const b = bandpass(x, sr, 3200, 3);
    for (let i = 0; i < x.length; i++) x[i] = b[i] * 0.8;
    return x;
  },
  agogo(sr) {
    const x = buf(sr, 0.35);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      x[i] = 0.45 * (Math.sin(TAU * 940 * t) + 0.5 * Math.sin(TAU * 2410 * t) * ex(t, 0.04) + 0.25 * Math.sin(TAU * 3700 * t) * ex(t, 0.02)) * ex(t, 0.12);
    }
    return x;
  },
  dhol(sr, noise) {
    // The dhol's bass head: deep and booming, the stick's slap on top.
    const x = buf(sr, 0.5);
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      ph += (TAU * (70 + 60 * ex(t, 0.025))) / sr;
      x[i] = 0.6 * Math.tanh(1.6 * Math.sin(ph)) * ex(t, 0.2) + (i < sr * 0.006 ? noise() * 0.2 : 0) + 0.15 * Math.sin(TAU * 260 * t) * ex(t, 0.03);
    }
    return x;
  }
};

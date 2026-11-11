// Orbit Beats: the beat of any recording, heard the way music research hears it,
// so a song, a jam or a drum take with no silences in it still comes apart
// into the pieces a musician would cut: its bars, its repeating patterns, or
// its single hits. No DOM: the tests and the maker's worker run it.
//
// The method is librosa's (ISC licence; McFee et al., librosa 0.10
// `onset.onset_strength`, `feature.tempo`, `beat.beat_track`), written out
// here rather than loaded: a few hundred lines against essentia.js's
// megabytes of WebAssembly (AGPL) or madmom's networks (Python, models not
// for commercial use).
//   - Onset strength: a log-power mel spectrogram's rise, frame to frame, each
//     band against the loudest of its neighbours a frame before (SuperFlux,
//     Böck & Widmer 2013: a note's vibrato isn't a new note).
//   - Tempo: the onset strength's autocorrelation in windows of about nine
//     seconds, averaged (a tempogram), weighed by a log-normal prior around
//     120 BPM, an octave wide (Ellis 2007; Klapuri).
//   - Beats: dynamic programming (Ellis 2007, "Beat tracking by dynamic
//     programming", JNMR 36:1): every frame's best previous beat a period
//     back, penalised by how far that is from the tempo; the best path
//     backwards from the last strong beat.
//   - Downbeats (which beat is a bar's first, 4/4): where the low end hits
//     and where the harmony changes (Goto 2001; Davies & Plumbley 2006).
//   - Patterns: bars as beat-synchronous rhythm and chroma; how many bars
//     a pattern takes is where bars repeat best (Foote's self-similarity),
//     and each different pattern is kept once (its most typical take).
//   - Hits: onsets picked as librosa's `onset_detect` picks them, each cut
//     back to the quiet just before it (`onset_backtrack`).
import { fft } from '../analyze.mjs';

// ---- The sound, as the analysis hears it ----

// A recording as one channel near 22 kHz (librosa's rate): plenty for
// rhythm, and a third of the work at 48 kHz. -> { x: Float32Array, sr, d }
export function monoOf({ sr, L, R = L }) {
  const d = Math.max(1, Math.round(sr / 22050));
  const n = Math.floor(L.length / d);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0, j = i * d; k < d; k++, j++) s += L[j] + R[j];
    x[i] = s / (2 * d);
  }
  return { x, sr: sr / d, d };
}

const MEL = 64;
// (A frame hears a hit a little before it lands: its window reaches it first. Measured on clicks.)
const LAG = 0.008;
const hzToMel = f => 2595 * Math.log10(1 + f / 700);
const melToHz = m => 700 * (10 ** (m / 2595) - 1);
// Triangular mel filters over the FFT's bins: [{ from, w: Float32Array }].
function melBank(N, sr) {
  const bins = N / 2 + 1, top = Math.min(sr / 2, 11000);
  const pts = Array.from({ length: MEL + 2 }, (_, i) => melToHz(hzToMel(30) + ((hzToMel(top) - hzToMel(30)) * i) / (MEL + 1)));
  return Array.from({ length: MEL }, (_, b) => {
    const [lo, mid, hi] = [pts[b], pts[b + 1], pts[b + 2]];
    const from = Math.max(0, Math.floor((lo * N) / sr)), to = Math.min(bins - 1, Math.ceil((hi * N) / sr));
    const w = new Float32Array(to - from + 1);
    for (let k = from; k <= to; k++) {
      const f = (k * sr) / N;
      w[k - from] = Math.max(0, f <= mid ? (f - lo) / (mid - lo) : (hi - f) / (hi - mid));
    }
    return { from, w };
  });
}

// Frame by frame (about 46 ms long, 11.6 ms apart, centred on their time):
// the mel spectrum in dB, the low end's (under 150 Hz) and the top's (over
// 4 kHz) level, the pitch classes (55 Hz to 2 kHz) and the loudness.
export function frames(x, sr) {
  const hop = 2 ** Math.floor(Math.log2(sr * 0.0125)), N = 4 * hop, half = N / 2, bins = half + 1;
  const F = Math.max(1, Math.floor(x.length / hop) + 1);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const bank = melBank(N, sr);
  const hz = sr / N, k150 = Math.ceil(150 / hz), k4k = Math.floor(4000 / hz);
  const pc = new Int8Array(bins).fill(-1);
  for (let k = Math.ceil(55 / hz); k * hz <= 2000 && k < bins; k++) pc[k] = (((Math.round(12 * Math.log2((k * hz) / 440)) + 69) % 12) + 12) % 12;
  const mel = new Float32Array(F * MEL), low = new Float32Array(F), high = new Float32Array(F), chroma = new Float32Array(F * 12), rms = new Float32Array(F);
  const re = new Float64Array(N), im = new Float64Array(N), p = new Float64Array(bins);
  for (let f = 0; f < F; f++) {
    const a = f * hop - half;
    let e = 0;
    for (let i = 0; i < N; i++) {
      const j = a + i;
      const v = j >= 0 && j < x.length ? x[j] : 0;
      re[i] = v * win[i];
      im[i] = 0;
      e += v * v;
    }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    let lo = 0, hi = 0;
    for (let k = 0; k < bins; k++) {
      p[k] = re[k] * re[k] + im[k] * im[k];
      if (k < k150) lo += p[k];
      else if (k >= k4k) hi += p[k];
      if (pc[k] >= 0) chroma[f * 12 + pc[k]] += Math.sqrt(p[k]);
    }
    // (As amplitude, not in dB: in dB a rise out of near silence counts as much as a kick.)
    low[f] = Math.sqrt(lo);
    high[f] = Math.sqrt(hi);
    for (let b = 0; b < MEL; b++) {
      const { from, w } = bank[b];
      let s = 0;
      for (let k = 0; k < w.length; k++) s += w[k] * p[from + k];
      mel[f * MEL + b] = 10 * Math.log10(s + 1e-10);
    }
  }
  // (librosa's top_db: nothing counted more than 80 dB under the loudest.)
  let top = -Infinity;
  for (const v of mel) top = Math.max(top, v);
  for (let i = 0; i < mel.length; i++) mel[i] = Math.max(mel[i], top - 80);
  return { F, hop, fps: sr / hop, mel, low, high, chroma, rms };
}

// Onset strength: each band's rise against the loudest of it and its two
// neighbours a frame before, averaged over the bands. Also the low end's and
// the top's own rises (kicks; hats and snares). -> { env, lowEnv, highEnv }
export function onsets({ F, mel, low, high }) {
  const env = new Float32Array(F), lowEnv = new Float32Array(F), highEnv = new Float32Array(F);
  for (let f = 1; f < F; f++) {
    let s = 0;
    for (let b = 0; b < MEL; b++) {
      const ref = Math.max(mel[(f - 1) * MEL + b], b > 0 ? mel[(f - 1) * MEL + b - 1] : -Infinity, b < MEL - 1 ? mel[(f - 1) * MEL + b + 1] : -Infinity);
      const d = mel[f * MEL + b] - ref;
      if (d > 0) s += d;
    }
    env[f] = s / MEL;
    lowEnv[f] = Math.max(0, low[f] - low[f - 1]);
    highEnv[f] = Math.max(0, high[f] - high[f - 1]);
  }
  return { env, lowEnv, highEnv };
}

// What the beat is followed by: the onset strength with the low end's rise
// as much again. Averaged over every band, the hats' many high bands outweigh
// the kick, and a house beat was followed on its off-beat open hats.
export function pulseOf({ env, lowEnv }, low = PULSE_LOW) {
  const a = std(env) || 1, b = std(lowEnv) || 1;
  return env.map((v, f) => v / a + (low * lowEnv[f]) / b);
}
const PULSE_LOW = 0.5;

// ---- Tempo ----

const std = a => {
  let m = 0;
  for (const v of a) m += v;
  m /= a.length || 1;
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return Math.sqrt(s / Math.max(1, a.length - 1));
};

// The tempogram, averaged: the onset strength's autocorrelation at every lag
// up to `maxLag` frames, in Hann-windowed stretches of `win` frames.
function tempogram(env, maxLag, win = 384, step = 32) {
  const F = env.length, acf = new Float64Array(maxLag + 1);
  const w = new Float64Array(win);
  for (let i = 0; i < win; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / win);
  const seg = new Float64Array(win);
  let count = 0;
  for (let c = 0; c < Math.max(1, F - win / 2); c += step) {
    const a = c - win / 2;
    let any = 0;
    for (let i = 0; i < win; i++) {
      const j = a + i;
      seg[i] = (j >= 0 && j < F ? env[j] : 0) * w[i];
      any += seg[i];
    }
    if (any <= 0) continue;
    const zero = seg.reduce((s, v) => s + v * v, 0) || 1;
    for (let k = 0; k <= maxLag; k++) {
      let s = 0;
      for (let i = 0; i + k < win; i++) s += seg[i] * seg[i + k];
      acf[k] += s / zero;
    }
    count++;
  }
  if (count) for (let k = 0; k <= maxLag; k++) acf[k] /= count;
  return acf;
}

// The tempo (BPM) from the onset strength: the tempogram's best lag under
// the prior, refined between lags. `strength`: how far that peak stands
// over the tempogram's middle (0 nothing steady, about 1 and over clear).
export function tempoOf(env, fps, { lo = 50, hi = 220, centre = 120, octave = 1 } = {}) {
  const maxLag = Math.min(Math.ceil((60 * fps) / lo) + 1, 383);
  const acf = tempogram(env, maxLag);
  let best = -Infinity, at = 0;
  const vals = [];
  for (let k = Math.max(1, Math.floor((60 * fps) / hi)); k <= maxLag; k++) {
    const bpm = (60 * fps) / k;
    if (bpm < lo || bpm > hi) continue;
    vals.push(acf[k]);
    const s = Math.log(Math.max(acf[k], 1e-9)) - 0.5 * ((Math.log2(bpm) - Math.log2(centre)) / octave) ** 2;
    if (s > best) (best = s), (at = k);
  }
  if (!at) return { bpm: null, strength: 0 };
  // (The peak between whole lags: a parabola through it and its neighbours.)
  const y0 = acf[at - 1] ?? acf[at], y1 = acf[at], y2 = acf[at + 1] ?? acf[at];
  const den = y0 - 2 * y1 + y2;
  const lag = at + (den < 0 ? (0.5 * (y0 - y2)) / den : 0);
  vals.sort((a, b) => a - b);
  const mid = vals[Math.floor(vals.length / 2)] || 0;
  return { bpm: (60 * fps) / lag, strength: mid > 0 ? acf[at] / mid - 1 : 0, acf };
}

// ---- Beats ----

// Ellis's dynamic-programming beat tracker on the onset strength, at a
// period of `period` frames. -> beat frames
export function trackBeats(env, period, tightness = 100) {
  const F = env.length, sd = std(env) || 1;
  // The local score: the onset strength smoothed by a Gaussian a 32nd of the period wide.
  const half = Math.round(period), g = new Float64Array(2 * half + 1);
  for (let i = -half; i <= half; i++) g[i + half] = Math.exp(-0.5 * ((i * 32) / period) ** 2);
  const local = new Float64Array(F);
  for (let f = 0; f < F; f++) {
    let s = 0;
    for (let i = -half; i <= half; i++) {
      const j = f + i;
      if (j >= 0 && j < F) s += (env[j] / sd) * g[i + half];
    }
    local[f] = s;
  }
  const from = -2 * Math.round(period), to = -Math.round(period / 2);
  const txwt = [];
  for (let d = from; d <= to; d++) txwt.push(-tightness * Math.log(-d / period) ** 2);
  const cum = new Float64Array(F), back = new Int32Array(F).fill(-1);
  const top = local.reduce((a, b) => Math.max(a, b), 0);
  let first = true;
  for (let f = 0; f < F; f++) {
    let bv = -Infinity, bj = -1;
    for (let i = 0; i < txwt.length; i++) {
      const j = f + from + i;
      const v = txwt[i] + (j >= 0 ? cum[j] : 0);
      if (j >= 0 && v > bv) (bv = v), (bj = j);
    }
    cum[f] = local[f] + (bj >= 0 ? Math.max(0, bv) : 0);
    if (first && local[f] < 0.01 * top) back[f] = -1;
    else (back[f] = bj), (first = false);
  }
  // The last beat: the last of the cumulative score's peaks over half their median.
  const peaks = [];
  for (let f = 1; f < F - 1; f++) if (cum[f] > cum[f - 1] && cum[f] >= cum[f + 1]) peaks.push(f);
  if (!peaks.length) return [];
  const med = peaks.map(f => cum[f]).sort((a, b) => a - b)[Math.floor(peaks.length / 2)];
  let tail = peaks[0];
  for (const f of peaks) if (cum[f] > med / 2) tail = f;
  const beats = [tail];
  while (back[beats.at(-1)] >= 0) beats.push(back[beats.at(-1)]);
  beats.reverse();
  // Weak beats at either end (the music not yet in, or gone) let go.
  const sm = beats.map((b, i) => {
    let s = 0, w = 0;
    for (let d = -2; d <= 2; d++) {
      const k = i + d;
      if (k < 0 || k >= beats.length) continue;
      const h = [0.25, 0.75, 1, 0.75, 0.25][d + 2];
      s += h * local[beats[k]];
      w += h;
    }
    return s / w;
  });
  const thr = 0.5 * Math.sqrt(sm.reduce((a, v) => a + v * v, 0) / (sm.length || 1));
  let a = 0, b = beats.length;
  while (a < b && sm[a] < thr) a++;
  while (b > a && sm[b - 1] < thr) b--;
  return beats.slice(a, b);
}

// The beats moved as one, by up to half a beat, to where the beat and its
// halves and quarters sound most (a metrical template: the beat 1, the
// eighth between 0.5, the sixteenths 0.2). The tracker alone can follow a
// syncopated part (a bass on the "a" of each beat) as well as the beat.
export function onTheBeat(beats, pulse, period) {
  if (beats.length < 4) return beats;
  const at = f => {
    const g = Math.round(f);
    return Math.max(pulse[g - 1] || 0, pulse[g] || 0, pulse[g + 1] || 0);
  };
  const score = d => beats.reduce((s, b) => s + at(b + d) + 0.5 * at(b + d + period / 2) + 0.2 * (at(b + d + period / 4) + at(b + d + (3 * period) / 4)), 0);
  let best = 0, bv = score(0);
  for (let k = -15; k <= 16; k++) {
    const d = (k * period) / 32, v = score(d);
    if (v > bv * 1.02) (bv = v), (best = d);
  }
  return best ? beats.map(b => Math.max(0, Math.round(b + best))) : beats;
}

// A straight line through the beats' times: the tempo they keep, the time of
// beat 0, how far they stray from it (in beats) and how many of the gaps
// between them are a beat (within 15%). A beat the tracker let pass counts
// two, so a skip doesn't bend the line. -> { bpm, t0, spread, even }
export function beatLine(times, period = null) {
  const n = times.length;
  if (n < 2) return null;
  const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
  const p = period || gaps[Math.floor(gaps.length / 2)];
  const idx = [0];
  for (let i = 1; i < n; i++) idx.push(idx[i - 1] + Math.max(1, Math.round((times[i] - times[i - 1]) / p)));
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  times.forEach((t, i) => ((sx += idx[i]), (sy += t), (sxx += idx[i] ** 2), (sxy += idx[i] * t)));
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), t0 = (sy - slope * sx) / n;
  let e = 0;
  times.forEach((t, i) => (e += (t - (t0 + slope * idx[i])) ** 2));
  const even = gaps.filter(g => Math.abs(g / p - 1) <= 0.15).length / gaps.length;
  return { bpm: 60 / slope, t0, spread: Math.sqrt(e / n) / slope, even };
}

// ---- Bars ----

// For each beat, how much it sounds like a bar's first: its low end's hit and
// the change of harmony from the beat before. -> the phase (0-3) of the
// downbeats among `beats` (frames), and how sure (0 a guess, 1 clear).
export function barPhase(beats, { lowEnv, env, chroma, F }) {
  const n = beats.length;
  if (n < 8) return { phase: 0, sure: 0 };
  const at = (e, f) => Math.max(e[f] || 0, e[f + 1] || 0, e[f - 1] || 0);
  const lowHit = beats.map(f => at(lowEnv, f) + 0.25 * at(env, f));
  // Each beat's pitch classes, from it to the next.
  const pcs = beats.map((f, i) => {
    const end = i + 1 < n ? beats[i + 1] : Math.min(F, f + (f - beats[i - 1]));
    const c = new Float64Array(12);
    for (let g = f; g < end; g++) for (let k = 0; k < 12; k++) c[k] += chroma[g * 12 + k];
    const m = Math.hypot(...c) || 1;
    return c.map(v => v / m);
  });
  const change = pcs.map((c, i) => (i ? 1 - c.reduce((s, v, k) => s + v * pcs[i - 1][k], 0) : 0));
  const z = a => {
    const m = a.reduce((s, v) => s + v, 0) / a.length, d = std(a) || 1;
    return a.map(v => (v - m) / d);
  };
  const zl = z(lowHit), zc = z(change);
  const score = [0, 1, 2, 3].map(p => {
    let s = 0, k = 0;
    for (let i = p; i < n; i += 4) (s += zl[i] + zc[i]), k++;
    return k ? s / k : -Infinity;
  });
  const order = [0, 1, 2, 3].sort((a, b) => score[b] - score[a]);
  return { phase: order[0], sure: Math.max(0, Math.min(1, (score[order[0]] - score[order[1]]) / 0.8)) };
}

// A bar as a picture of its rhythm and harmony: the low end, the top and the
// whole onset strength at each of its sixteen sixteenths, and its pitch
// classes. Unit length, so two bars compare by their dot product.
function barPicture(a, b, { env, lowEnv, highEnv, chroma, F }) {
  const v = new Float64Array(16 * 3 + 12);
  const step = (b - a) / 16;
  for (let s = 0; s < 16; s++) {
    const f0 = Math.round(a + s * step), f1 = Math.max(f0 + 1, Math.round(a + (s + 1) * step));
    for (let f = f0; f < f1 && f < F; f++) {
      v[s] = Math.max(v[s], lowEnv[f]);
      v[16 + s] = Math.max(v[16 + s], highEnv[f]);
      v[32 + s] = Math.max(v[32 + s], env[f]);
    }
  }
  // (Each kind brought to the same weight: rhythm by its shape, not its loudness.)
  for (let g = 0; g < 3; g++) {
    const m = Math.hypot(...v.subarray(g * 16, g * 16 + 16)) || 1;
    for (let s = 0; s < 16; s++) v[g * 16 + s] /= m;
  }
  const c = new Float64Array(12);
  for (let f = Math.round(a); f < Math.round(b) && f < F; f++) for (let k = 0; k < 12; k++) c[k] += chroma[f * 12 + k];
  const cm = Math.hypot(...c) || 1;
  for (let k = 0; k < 12; k++) v[48 + k] = (1.5 * c[k]) / cm;
  const m = Math.hypot(...v) || 1;
  return v.map(x => x / m);
}
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

// How many bars a pattern takes (1, 2, 4 or 8): where bars repeat best,
// the shortest of those about as good. -> { bars, repeat (0-1) }
export function patternBars(pics) {
  const n = pics.length;
  const sim = P => {
    let s = 0, k = 0;
    for (let i = 0; i + P < n; i++) (s += dot(pics[i], pics[i + P])), k++;
    return k ? s / k : -1;
  };
  const tried = [1, 2, 4, 8].filter(P => n >= 2 * P).map(P => [P, sim(P)]);
  if (!tried.length) return { bars: Math.max(1, Math.min(4, n)), repeat: 0 };
  const best = Math.max(...tried.map(([, s]) => s));
  const [bars, repeat] = tried.find(([, s]) => s >= best - 0.025);
  return { bars, repeat };
}

// Two runs of bars are one pattern from this alike on (their pictures' dot product): the same
// bar played again is 0.98 to 1; a bass line or a tune added over the same drums, about 0.95.
const SAME = 0.97;

// ---- Hits ----

// Onsets as librosa's onset_detect picks them (a peak over the 30 ms before
// it, over the average around it by a margin, 30 ms after the last), each
// moved back to the quietest frame just before it. -> frames
export function hitFrames(env, rms, fps) {
  let lo = Infinity, hi = -Infinity;
  for (const v of env) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
  const e = Array.from(env, v => (hi > lo ? (v - lo) / (hi - lo) : 0));
  const preMax = Math.max(1, Math.round(0.03 * fps)), avg = Math.max(1, Math.round(0.1 * fps)), wait = Math.max(1, Math.round(0.03 * fps));
  const out = [];
  let last = -Infinity;
  for (let f = 0; f < e.length; f++) {
    let isMax = true;
    for (let d = 1; d <= preMax && isMax; d++) if ((e[f - d] ?? -1) > e[f]) isMax = false;
    if (!isMax || (e[f + 1] ?? -1) > e[f]) continue;
    let s = 0, k = 0;
    for (let d = -avg; d <= avg; d++) if (e[f + d] !== undefined) (s += e[f + d]), k++;
    if (e[f] < s / k + 0.07 || f - last < wait) continue;
    let b = f;
    while (b > 0 && f - b < Math.round(0.03 * fps) && rms[b - 1] <= rms[b]) b--;
    out.push(b);
    last = f;
  }
  return out;
}

// ---- Cutting a recording ----

// How a recording (a stretch between silences, already one channel: monoOf)
// comes apart, in seconds:
//   'whole': it's one piece already (a hit, a phrase, a loop of up to four bars);
//   'bars':  a steady beat over more than that: its patterns, each `bars` bars long,
//            once each, starting on a downbeat, exactly that many bars long;
//   'hits':  no steady beat but separate hits (a take of single drums): each hit.
// -> { how, bpm (when it has a beat), cuts: [[from, to]], beats (s), bars, sure }
export function planCuts(x, sr, opts = {}) {
  const seconds = x.length / sr;
  if (seconds < 1.5) return { how: 'whole', bpm: null, cuts: [[0, seconds]], beats: [], bars: 0, sure: 0 };
  // (Heard with a breath of silence before it, so a hit on its very first sample is heard as one; times put back after.)
  const pad = Math.round(PAD * sr), y = new Float32Array(x.length + pad);
  y.set(x, pad);
  const p = plan(y, sr, opts);
  const back = t => Math.max(0, Math.min(seconds, t - PAD));
  return { ...p, beats: p.beats.map(back).filter(t => t > 0), cuts: p.cuts.map(([a, b]) => [back(a), back(b)]).filter(([a, b]) => b - a > 0.02) };
}
const PAD = 0.05;
function plan(x, sr, { maxPieces = 12 } = {}) {
  const seconds = x.length / sr;
  const whole = { how: 'whole', bpm: null, cuts: [[0, seconds]], beats: [], bars: 0, sure: 0 };
  const fr = frames(x, sr), on = onsets(fr), { fps } = fr;
  const pulse = pulseOf(on);
  const tempo = tempoOf(pulse, fps);
  let beats = [];
  let line = null;
  if (tempo.bpm) {
    beats = onTheBeat(trackBeats(pulse, (60 * fps) / tempo.bpm), pulse, (60 * fps) / tempo.bpm);
    line = beatLine(beats.map(f => f / fps), 60 / tempo.bpm);
  }
  // A steady beat: enough of them, mostly a beat apart, near a line (a human's drift allowed), and a clear tempo.
  const steady = line && beats.length >= 8 && line.even >= 0.75 && line.spread < 0.25 && tempo.strength > 0.15 && line.bpm > 40 && line.bpm < 260;
  if (steady) {
    // The tempo as the beats keep it, folded into the app's range (70 to 190).
    let bpm = line.bpm;
    while (bpm < 70) bpm *= 2;
    while (bpm > 190) bpm /= 2;
    const scale = bpm / line.bpm; // (a beat counted at twice or half: the bars follow the folded beat)
    const beat = 60 / bpm, bar = 4 * beat, per = beat;
    const out = { how: 'whole', bpm: Math.round(bpm * 100) / 100, beats: beats.map(f => f / fps + LAG), sure: Math.min(1, tempo.strength), bars: 0, cuts: [[0, seconds]] };
    // Up to four bars (and half a bar to spare, a last hit ringing out): a loop as it is.
    if (seconds - PAD <= 4 * bar + 2 * beat) return out;
    // The beats as tracked (a straight grid drifts off them over a song), counted at the folded tempo:
    // a gap the tracker let pass filled, halves put in or every other one taken.
    let times = beats.map(f => f / fps + LAG);
    const p0 = 60 / line.bpm;
    const filled = [times[0]];
    for (let i = 1; i < times.length; i++) {
      const k = Math.max(1, Math.round((times[i] - times[i - 1]) / p0));
      for (let j = 1; j <= k; j++) filled.push(times[i - 1] + ((times[i] - times[i - 1]) * j) / k);
    }
    times = filled;
    for (let s = scale; s > 1.5; s /= 2) times = times.flatMap((t, i) => (i + 1 < times.length ? [t, (t + times[i + 1]) / 2] : [t]));
    for (let s = scale; s < 0.75; s *= 2) {
      const sum = q => times.reduce((a, t, i) => a + (i % 2 === q ? on.env[Math.round(t * fps)] || 0 : 0), 0);
      const q = sum(0) >= sum(1) ? 0 : 1;
      times = times.filter((_, i) => i % 2 === q);
    }
    // (One beat to a beat: one heard twice, closer than 70% of a beat to the last, let go; so counting
    // in fours never slips a beat mid-song.)
    const kept = [];
    for (const t of times) if (!kept.length || t - kept.at(-1) >= 0.7 * per) kept.push(t);
    const grid = kept.map(t => Math.round(t * fps));
    const { phase, sure } = barPhase(grid, { ...on, chroma: fr.chroma, F: fr.F });
    const downs = grid.filter((_, i) => i % 4 === phase).map(f => f / fps);
    // Each downbeat snapped to the hit nearest it (20 ms either way), a breath before it so the attack is whole.
    const snap = t => {
      const f = Math.round(t * fps), w = Math.round(0.02 * fps);
      let bf = f, bv = -1;
      for (let g = f - w; g <= f + w; g++) if ((on.env[g] ?? -1) > bv) (bv = on.env[g]), (bf = g);
      return Math.max(0, bf / fps - 0.006);
    };
    const starts = downs.filter(t => t >= PAD - 0.01 && t + bar <= seconds + 0.02).map(snap);
    const pics = starts.map(t => barPicture(t * fps, (t + bar) * fps, { ...on, chroma: fr.chroma, F: fr.F }));
    if (pics.length < 2) return out;
    const { bars, repeat } = patternBars(pics);
    // The patterns: the song in runs of `bars` bars; one kept for each that differs from those kept before.
    const len = bars * bar;
    const chunks = [];
    for (let i = 0; i + bars <= starts.length; i += bars) chunks.push({ at: starts[i], pic: pics.slice(i, i + bars).flatMap(p => [...p]).map(v => v / Math.sqrt(bars)) });
    const groups = [];
    for (const c of chunks) {
      const g = groups.find(g => dot(g[0].pic, c.pic) >= SAME);
      if (g) g.push(c);
      else groups.push([c]);
    }
    // (The most typical take of each: the one most like the rest of its group.)
    const keep = groups
      .map((g, k) => ({ k, n: g.length, c: g.reduce((b, c) => (g.reduce((s, o) => s + dot(o.pic, c.pic), 0) > g.reduce((s, o) => s + dot(o.pic, b.pic), 0) ? c : b), g[0]) }))
      .sort((a, b) => b.n - a.n || a.k - b.k)
      .slice(0, maxPieces)
      .sort((a, b) => a.k - b.k);
    return { ...out, how: 'bars', bars, repeat, phase, downSure: sure, cuts: keep.map(({ c }) => [c.at, Math.min(seconds, c.at + len)]) };
  }
  // No steady beat: single hits, if they stand apart (the sound fallen well away before the next).
  const hits = hitFrames(on.env, fr.rms, fps);
  if (hits.length >= 3) {
    const peakAfter = f => {
      let m = 0;
      for (let g = f; g < f + Math.round(0.08 * fps) && g < fr.F; g++) m = Math.max(m, fr.rms[g]);
      return m;
    };
    const alone = f => fr.rms[f] <= 0.3 * peakAfter(f);
    const apart = hits.slice(1).filter(alone).length / (hits.length - 1);
    if (apart >= 0.6) {
      // (Cut only where a hit stands apart: a rise inside a ringing sound is part of it. Before the first, only if something sounds there.)
      const times = hits.filter((f, i) => !i || alone(f)).map(f => f / fps);
      const loudest = fr.rms.reduce((a, v) => Math.max(a, v), 0);
      const lead = fr.rms.slice(0, hits[0]).reduce((a, v) => Math.max(a, v), 0);
      if (times[0] > 0.05 && lead > 0.1 * loudest) times.unshift(0);
      const cuts = [];
      times.forEach((t, i) => {
        const end = times[i + 1] ?? seconds;
        if (end - t >= 0.05) cuts.push([t, end]);
        else if (cuts.length) cuts.at(-1)[1] = end;
      });
      if (cuts.length >= 2) return { how: 'hits', bpm: null, cuts: cuts.slice(0, 64), beats: [], bars: 0, sure: apart };
    }
  }
  return whole;
}

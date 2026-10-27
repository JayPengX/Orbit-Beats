// Orbit Beats analysis (was Passion Beats): what each piece of a recording is, and the tempo it
// was recorded at, heard from the audio alone. No DOM, so the tests run it in
// Node. See MAP.md, "Tempo" and "Roles".

// ---- FFT (radix 2, in place) ----

const TWIDDLE = new Map();
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  if (!TWIDDLE.has(n)) {
    const c = new Float64Array(n / 2), s = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) { c[k] = Math.cos(2 * Math.PI * k / n); s[k] = -Math.sin(2 * Math.PI * k / n); }
    TWIDDLE.set(n, [c, s]);
  }
  const [c, s] = TWIDDLE.get(n);
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = n / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < half; k++) {
        const wr = c[k * step], wi = s[k * step], a = i + k, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
  }
}

// ---- One piece ----

// Frequency bands (Hz) for where a piece's sound sits.
export const BANDS = { low: [0, 120], lowmid: [120, 500], mid: [500, 2500], upper: [2500, 6000], high: [6000, Infinity] };

// Everything about a piece that doesn't depend on the tempo: when its hits
// start, how it dies away, where its sound sits, how noisy and how pitched
// it is, and its notes' pitch classes. Frames are ~21 ms, ~5 ms apart.
export function analyzePiece({ L, R }, sr) {
  const n = L.length, m = new Float64Array(n);
  let mean = 0;
  for (let j = 0; j < n; j++) { m[j] = (L[j] + R[j]) / 2; mean += m[j]; }
  mean /= n || 1;
  let top = 0;
  for (let j = 0; j < n; j++) { m[j] -= mean; top = Math.max(top, Math.abs(m[j])); }
  if (top > 0) for (let j = 0; j < n; j++) m[j] /= top;   // the same at any level

  const N = 2 ** Math.round(Math.log2(sr * 0.0213)), hop = N / 4, half = N / 2, bins = half + 1, hz = sr / N;
  const F = Math.max(1, Math.ceil(n / hop) + 1), win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const total = new Float64Array(bins), energy = new Float64Array(F), flux = new Float64Array(F), lowE = new Float64Array(F), flat = [];
  const k150 = Math.ceil(150 / hz);   // below this a frame is too short to follow a wave, so the flux wobbles
  // Energy in octave bands, to tell a hit (a band gets louder) from a ripple.
  const EDGES = [0, 150, 300, 600, 1200, 2400, 4800, 9600, Infinity], bandOf = new Int8Array(bins);
  for (let k = 0; k < bins; k++) bandOf[k] = EDGES.findIndex((e, i) => k * hz >= e && k * hz < EDGES[i + 1]);
  const bandE = Array.from({ length: EDGES.length - 1 }, () => new Float64Array(F));
  let prev = new Float64Array(bins), cur = new Float64Array(bins);
  const lo = Math.ceil(100 / hz), hi = Math.min(half, Math.floor(16000 / hz));
  const frames = [];
  for (let f = 0; f < F; f++) {   // frame f is centred on sample f * hop
    const a = f * hop - half;
    for (let i = 0; i < N; i++) { const j = a + i; re[i] = j >= 0 && j < n ? m[j] * win[i] : 0; im[i] = 0; }
    fft(re, im);
    let e = 0, fl = 0, le = 0;
    for (let k = 0; k < bins; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      total[k] += p; e += p; bandE[bandOf[k]][f] += p;
      if (k < k150) { le += p; continue; }
      cur[k] = Math.log1p(100 * Math.sqrt(p));
      if (cur[k] > prev[k]) fl += cur[k] - prev[k];
    }
    energy[f] = e; flux[f] = fl; lowE[f] = le;
    let sl = 0, s = 0;
    for (let k = lo; k <= hi; k++) { const p = re[k] * re[k] + im[k] * im[k] + 1e-12; sl += Math.log(p); s += p; }
    frames.push(Math.exp(sl / (hi - lo + 1)) / (s / (hi - lo + 1)));
    [prev, cur] = [cur, prev];
  }
  // The low end's flux: the rise of its level, smoothed over 5 frames.
  const lowLevel = lowE.map((_, f) => { let s = 0; for (let d = -2; d <= 2; d++) s += lowE[Math.min(F - 1, Math.max(0, f + d))]; return Math.log1p(100 * Math.sqrt(s / 5)); });
  for (let f = 0; f < F; f++) flux[f] += k150 * Math.max(0, lowLevel[f] - (lowLevel[f - 2] ?? 0));
  const peakE = Math.max(...energy), peakF = energy.indexOf(peakE);
  for (let f = 0; f < F; f++) if (energy[f] > peakE * 0.01) flat.push(frames[f]);   // loud frames only

  // Hits: peaks of spectral flux well over their surroundings, in frames
  // within 30 dB of the loudest, 30 ms apart. Times to a fraction of a frame.
  // Strength is against the strongest hit after the first: the first comes
  // out of silence, so it always stands out.
  const onsets = [], maxFlux = Math.max(...flux), gap = Math.round(0.03 * sr / hop);
  const ref = Math.max(0.15 * maxFlux, ...flux.slice(4));
  // A hit makes some band that carries 1% of the loudest frame 3 dB louder
  // than at its quietest in the 20 ms before.
  const rises = f => bandE.some(e => {
    const now = Math.max(e[f], e[f + 1] ?? 0, e[f + 2] ?? 0);
    if (now < peakE * 0.01) return false;
    let before = Infinity;
    for (let d = 1; d <= 4; d++) before = Math.min(before, e[f - d] ?? 0);
    return now >= 2 * before;
  });
  for (let f = 0; f < F; f++) {
    if (flux[f] < 0.1 * ref || energy[Math.min(F - 1, f + 1)] < peakE * 1e-3 || !rises(f)) continue;
    let local = true;
    for (let d = -3; d <= 3 && local; d++) if (d && (flux[f + d] ?? -1) > flux[f] - (d < 0 ? 0 : 1e-12)) local = false;
    if (!local) continue;
    const around = [];
    for (let d = -8; d <= 8; d++) if (flux[f + d] !== undefined) around.push(flux[f + d]);
    around.sort((x, y) => x - y);
    if (flux[f] < 1.25 * around[Math.floor(around.length / 2)] + 0.02 * ref) continue;
    if (onsets.length && f - onsets.at(-1).f < gap) continue;
    // Timed at its flux peak, to a fraction of a frame; but a slow swell
    // (rising over 20 ms or more) peaks well after it begins, so from there.
    let b = f;
    while (b > 0 && f - b < 0.15 * sr / hop && energy[b - 1] < energy[b] && flux[b - 1] > 0.25 * flux[f]) b--;
    const y0 = flux[f - 1] ?? flux[f], y2 = flux[f + 1] ?? flux[f], den = y0 - 2 * flux[f] + y2;
    const t = f - b > 0.02 * sr / hop ? b : f + (den ? 0.5 * (y0 - y2) / den : 0);
    onsets.push({ f, t: Math.max(0, t) * hop / sr, s: Math.min(1, flux[f] / ref),
      level: Math.max(energy[f], energy[f + 1] ?? 0, energy[f + 2] ?? 0, energy[f + 3] ?? 0) / peakE });
  }
  // A piece starts where its sound does, so with a hit, however slow.
  if (!onsets.length || onsets[0].t > 0.05) onsets.unshift({ f: 0, t: 0, s: 1, level: 1 });

  // How it dies away: from its loudest frame to 20 dB down (or its end).
  let f20 = peakF;
  while (f20 < F - 1 && energy[f20] > peakE * 0.01) f20++;
  let loud = 0;
  for (const e of energy) if (e > peakE * 0.01) loud++;
  // How loud its last 30 ms are: a sound cut off mid-note ends loud.
  const endF = Math.max(0, Math.floor((n - 1) / hop)), tail = energy.slice(Math.max(0, endF - Math.round(0.03 * sr / hop)), endF + 1);

  const sum = total.reduce((a, b) => a + b, 0) || 1, bands = {};
  for (const [name, [a, b]] of Object.entries(BANDS)) {
    let s = 0; for (let k = 0; k < bins; k++) if (k * hz >= a && k * hz < b) s += total[k];
    bands[name] = s / sum;
  }
  let cen = 0; for (let k = 0; k < bins; k++) cen += k * hz * total[k];
  // Pitch classes of the notes, 60 Hz to 2.5 kHz.
  const chroma = new Float64Array(12);
  for (let k = Math.ceil(60 / hz); k * hz <= 2500; k++) chroma[((Math.round(12 * Math.log2(k * hz / 440)) + 69) % 12 + 12) % 12] += Math.sqrt(total[k]);
  const cn = Math.hypot(...chroma) || 1;
  flat.sort((a, b) => a - b);

  return {
    sr, seconds: n / sr,
    onsets: onsets.map(o => o.t),
    strengths: onsets.map(o => o.s),   // each hit's flux, the strongest after the first 1
    levels: onsets.map(o => o.level),  // how loud each hit gets, the loudest frame 1
    attack: peakF * hop / sr,          // when it's loudest
    decay: (f20 - peakF) * hop / sr,   // loudest to 20 dB down
    loud: loud * hop / sr,             // time within 20 dB of the loudest
    end: Math.max(...tail) / peakE,    // the end's loudness, the loudest 1
    bands, centroid: cen / sum,
    flatness: flat.length ? flat[Math.floor(flat.length / 2)] : 1,   // 0 a pure tone, 1 white noise
    ...pitch(m, sr, energy, hop, peakE),
    chroma: [...chroma].map(v => v / cn),
  };
}

// How much the loud parts repeat themselves at a pitch of 40 to 1000 Hz (0
// noise, 1 a steady note), and that pitch: the autocorrelation's highest
// peak past its first dip, median over up to 8 moments, at about 16 kHz.
function pitch(m, sr, energy, hop, peakE) {
  const d = Math.max(1, Math.floor(sr / 16000)), s2 = sr / d, nd = Math.floor(m.length / d), x = new Float64Array(nd);
  for (let i = 0; i < nd; i++) { let s = 0; for (let k = 0; k < d; k++) s += m[i * d + k]; x[i] = s / d; }
  const W = Math.round(0.064 * s2), lo = Math.round(s2 / 1000), hi = Math.round(s2 / 40);
  const loud = []; energy.forEach((e, f) => { if (e > peakE * 0.1) loud.push(f); });
  const k = Math.min(8, loud.length), out = [], c = new Float64Array(W + hi + 1);
  for (let q = 0; q < k; q++) {
    const st = Math.max(0, Math.floor(loud[Math.floor(q * loud.length / k)] * hop / d) - (W >> 1));
    if (st + W + hi > nd) continue;
    for (let i = 0; i < W + hi; i++) c[i + 1] = c[i] + x[st + i] ** 2;
    let best = 0, lag = 0, dipped = false;
    for (let t = lo; t <= hi; t++) {
      let s = 0; for (let i = 0; i < W; i++) s += x[st + i] * x[st + i + t];
      const r = s / Math.sqrt(c[W] * (c[t + W] - c[t]) + 1e-20);
      if (r < 0) dipped = true; else if (dipped && r > best) { best = r; lag = t; }
    }
    out.push([best, lag ? s2 / lag : 0]);
  }
  if (!out.length) return { pitched: 0, f0: 0 };
  out.sort((a, b) => a[0] - b[0]);
  const [pitched, f0] = out[Math.floor(out.length / 2)];
  return { pitched, f0 };
}

// ---- Tempo ----

const pow2Below = beats => { let p = 1; while (p * 2 <= beats) p *= 2; return p; };
const pow2Above = beats => { let p = 1; while (p < beats) p *= 2; return p; };

// The tempo a recording was made at, from its pieces' analyses.
//
// Hits inside a piece fall on its 16th-note grid (stronger hits count for
// more; rolls' and echoes' hits, under 70 ms apart, don't count), and
// loops cut to the grid are whole beats long (one that isn't says nothing:
// it may have rung out; one-shots' lengths are how long they rang): every
// tempo from `lo` to
// `hi` BPM is scored by how well both line up (1 is perfectly).
//
// Twice a tempo (or half, or 3/2) can fit as well, so of the tempos that
// fit about as well as the best, the one wins that best balances fitting,
// loops of a usual length (about 4 beats, half a bar to 4 bars) and a lean
// towards 120 BPM (weights tuned on the test kits, tests/kits.mjs). A whole
// number wins if it fits as well.
export function detectTempo(analyses, { lo = 70, hi = 190, wFit = 3, wLoop = 0.5, wLean = 0.2, near = 0.08 } = {}) {
  const pts = [], lengths = [], loops = [];
  for (const a of analyses) {
    const h = hits(a);
    if (h.length >= 4 && h.at(-1) - h[0] < 0.8) continue;   // a roll: its hits can be 32nds, or 6 to a beat
    h.forEach((t, i) => { if (i && t - h[i - 1] >= 0.07) pts.push([t - h[0], a.strengths[a.onsets.indexOf(t)]]); });
    if (h.length > 1 && h.at(-1) - h[0] >= 0.4) { lengths.push(a.seconds); loops.push(a.seconds); }
  }
  if (pts.length < 4) return { bpm: null, fit: 0 };
  const weight = pts.reduce((s, [, w]) => s + w, 0) + lengths.length * 0.5;
  const score = bpm => {
    const beat = 60 / bpm;
    let s = 0;
    for (const [t, w] of pts) s += w * Math.cos(2 * Math.PI * t / (beat / 4));
    for (const t of lengths) s += 0.5 * Math.max(0, Math.cos(2 * Math.PI * t / beat));   // a length off the grid is no sign either way
    return s / weight;
  };
  const tried = [];
  for (let b = lo; b <= hi + 1e-9; b += 0.02) tried.push([b, score(b)]);
  const best = Math.max(...tried.map(([, s]) => s));
  const unusual = bpm => {   // how far the loops' median length is from 4 beats, in octaves
    if (!loops.length) return 0;
    const beats = loops.map(t => pow2Below(t / (60 / bpm) + 0.25)).sort((x, y) => x - y);
    return Math.abs(Math.log2(beats[Math.floor(beats.length / 2)] / 4));
  };
  let pick = null, cost = Infinity;
  tried.forEach(([b, s], i) => {
    if (s < best - near || s < (tried[i - 1]?.[1] ?? -9) || s < (tried[i + 1]?.[1] ?? -9)) return;   // near-best peaks
    const c = wFit * (best - s) + wLoop * unusual(b) + wLean * Math.abs(Math.log2(b / 120));
    if (c < cost) { cost = c; pick = [b, s]; }
  });
  let [bpm, fit] = pick;
  for (let b = bpm - 0.03; b <= bpm + 0.03; b += 0.002) { const s = score(b); if (s > fit) { fit = s; bpm = b; } }
  const whole = Math.round(bpm), ws = score(whole);
  if (Math.abs(whole - bpm) < 0.6 && ws >= fit - 0.03) { bpm = whole; fit = ws; }
  else bpm = Math.round(bpm * 10) / 10;
  return { bpm, fit };
}

// ---- Roles ----

// A loop's length in beats at `bpm`: a whole power of two (1, 2, 4, 8, …),
// the longest that fits, so a tail ringing on doesn't count. A piece not cut
// to the beat grid may ring on longer, so it's also kept to the shortest
// that holds all its hits.
export function loopBeats(a, bpm) {
  const beat = 60 / bpm, beats = a.seconds / beat, fits = pow2Below(beats + 0.25);
  const h = hits(a);
  if (Math.abs(beats - Math.round(beats)) < 0.05 || h.length < 2) return fits;
  return Math.min(fits, pow2Above((h.at(-1) - h[0]) / beat + 0.2));
}

// A piece's hits, leaving out faint ones (more than 12 dB under the piece's
// loudest, or barely a change: a sound's tail flickering as it dies away)
// and echoes (under 60% of a hit within 100 ms before: a room's
// reflections, a reverb's ripples).
export function hits(a) {
  const kept = [];
  a.onsets.forEach((t, i) => {
    if (i && (a.levels[i] < 0.063 || a.strengths[i] < 0.15)) return;
    if (kept.some(([u, s]) => t - u < 0.1 && a.strengths[i] < 0.6 * s)) return;
    kept.push([t, a.strengths[i]]);
  });
  return kept.map(([t]) => t);
}

// A role for a piece, from its analysis at `bpm` (see MAP.md, "Roles").
export function guessRole(a, bpm) {
  const beat = 60 / bpm, beats = a.seconds / beat, b = a.bands, h = hits(a);
  const spread = h.length > 1 ? h.at(-1) - h[0] : 0;
  const deep = b.low + b.lowmid;
  const bright = b.high >= 0.6;                           // hats, not snares
  const tonal = a.flatness < 0.05 || (a.pitched >= 0.7 && a.flatness < 0.3);   // notes, not drums
  const pure = a.pitched >= 0.85 && a.flatness < 0.05;    // certainly a note
  // A low hit: a kick, or an 808 if it rings on (or is cut off still ringing).
  const lowHit = () => (a.decay >= 0.8 || (a.end >= 0.25 && a.decay >= 0.25) ? 'sub' : 'kick');
  if (h.length <= 1 && b.low >= 0.5) return lowHit();
  // A loop: hits a beat or more apart, or a note held that long.
  const loop = beats >= 1.75 && (spread >= 0.75 * beat || (tonal && a.loud >= 1.5 * beat && a.decay >= beat));
  if (loop) {
    if (bright) return 'hat';
    if (!tonal) return spread >= 1.5 * beat ? 'fill' : 'roll';
    if (deep >= 0.7 && a.centroid < 300) return h.length / Math.max(beat, spread) * beat >= 3 ? 'fill' : 'bass';   // a run of toms, or a bass line
    return loopBeats(a, bpm) <= 2 ? 'phrase' : 'riff';
  }
  if (bright) return h.length >= 2 ? 'hat' : 'tick';
  if (b.low >= 0.5) return lowHit();
  if (pure) return 'phrase';
  if (h.length >= 3 && spread >= 0.4 * beat) return 'roll';
  if (b.low >= 0.35) return 'kick';
  return 'snare';
}

// ---- A whole recording ----

// The tempo (detected unless given) and each piece's analysis, role and
// loop length.
export function analyzeRecording(pieces, sr, { bpm } = {}) {
  const analyses = pieces.map(p => analyzePiece(p, sr));
  const tempo = bpm ? { bpm, fit: null } : detectTempo(analyses);
  const b = tempo.bpm ?? 120;   // too few hits to tell: say 120
  return { bpm: b, detected: tempo.bpm, fit: tempo.fit, analyses, roles: analyses.map(a => guessRole(a, b)), loops: analyses.map(a => loopBeats(a, b)) };
}

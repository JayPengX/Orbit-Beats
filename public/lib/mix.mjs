// The mixer (混音): what a song's pieces go through once they're placed on
// the grid, on by default. Each piece plays on its bus (drums, hats, bass,
// the riffs and phrases as keys), each bus its level; the drums and the bass
// glued by a 2:1 compressor and kept clear of the sub (a phone's speaker
// plays their harmonics, not the bottom octave); the riffs cleared under 150 Hz and brightened at the
// top, set wide (the middle stays put, so a mono speaker hears them as they
// were), and put into an echo (a dotted eighth left, an eighth right) and a
// room; the snare and hats a little of the room too, the kick and bass none;
// the bass and the riffs ducking under the kick (the pump); the riffs opening
// up through the intro (a low-pass), rising out of the way before a hook (a
// high-pass over the pre-hook), muffled in a break; the hats a little to one
// side. Then the whole song brought to one loudness (an RMS, not a peak),
// warmed by a soft saturation and held under -1 dBFS by a limiter that
// looks ahead, so nothing clips whatever the format. Off, the song is the
// pieces exactly as recorded.
//
// The same steps as passion_beats.py's mixer, sample for sample in what each
// one does (the two can't share random numbers, so not the same songs; tests/
// mixparity.test.mjs feeds both one input). No DOM: the tests run it.

export const BUSES = ['drums', 'hats', 'bass', 'keys'];
// Each role's bus.
export const BUS_OF = { riff: 'keys', phrase: 'keys', bass: 'bass', hat: 'hats', tick: 'hats', fill: 'drums', kick: 'drums', sub: 'drums', snare: 'drums', roll: 'drums' };
// The stems a song comes apart into: its buses, and the echo and room ('fx').
export const STEMS = [...BUSES, 'fx'];

// The mixer as it opens: levels in dB, the rest 0–1.
export const MIX = { on: true, drums: 0, hats: -2, bass: -1, keys: -1, reverb: 0.25, delay: 0.2, pump: 0.3, sweep: true, width: 0.4, fade: false };
const LIMITS = { drums: [-24, 6], hats: [-24, 6], bass: [-24, 6], keys: [-24, 6], reverb: [0, 1], delay: [0, 1], pump: [0, 1], width: [0, 1] };

// Any kept or typed mixer as a whole one: every number in its range, the
// switches booleans, what's missing as it opens.
export function mixOf(m) {
  const out = { ...MIX };
  if (!m || typeof m !== 'object') return out;
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) if (Number.isFinite(m[k])) out[k] = Math.min(hi, Math.max(lo, m[k]));
  for (const k of ['on', 'sweep', 'fade']) if (typeof m[k] === 'boolean') out[k] = m[k];
  return out;
}

export const dbGain = d => 10 ** (d / 20);
export const CEILING = dbGain(-1);

// ---- Filters, one pole each (6 dB an octave), the cutoff by blocks ----

const BLOCK = 256;
const coef = (hz, sr) => 1 - Math.exp((-2 * Math.PI * Math.min(hz, sr * 0.45)) / sr);

// A sweep over [a, b) of x in place: a low- or high-pass whose cutoff moves
// from f0 to f1 (exponentially), faded in over the `edge` samples before a
// and out over those after b, so it never clicks.
export function sweep(x, sr, { kind = 'lp', a, b, f0, f1, edge = 512, poles = 2 }) {
  const from = Math.max(0, a - edge);
  const to = Math.min(x.length, b + edge);
  if (to <= from) return;
  const st = new Float64Array(poles);
  for (let blk = from; blk < to; blk += BLOCK) {
    const mid = Math.min(Math.max((blk + BLOCK / 2 - a) / Math.max(1, b - a), 0), 1);
    const c = coef(f0 * (f1 / f0) ** mid, sr);
    const end = Math.min(to, blk + BLOCK);
    for (let j = blk; j < end; j++) {
      let y = x[j];
      for (let p = 0; p < poles; p++) {
        st[p] += c * (y - st[p]);
        y = kind === 'lp' ? st[p] : y - st[p];
      }
      const w = j < a ? (j - from) / Math.max(1, a - from) : j >= b ? 1 - (j - b) / Math.max(1, to - b) : 1;
      x[j] += w * (y - x[j]);
    }
  }
}
// A fixed one-pole low- or high-pass over all of x, into a new array.
export function onePole(x, sr, hz, kind = 'lp') {
  const c = coef(hz, sr);
  const out = new Float32Array(x.length);
  let s = 0;
  for (let j = 0; j < x.length; j++) {
    s += c * (x[j] - s);
    out[j] = kind === 'lp' ? s : x[j] - s;
  }
  return out;
}

// ---- Tone: shelves, the wide keys, the glue ----

// (The tone of a bus is worked inside mixdown's one pass over it: the drums and bass lose a quarter or so of what is under
// 90 to 100 Hz, and the rumble under 30 Hz, and the riffs gain 2.5 dB over 3 kHz.)
// Set wide: a copy of what is above 300 Hz of the middle, 11 ms late and 19 ms late (the second the other way up),
// added to the left and taken from the right. The sum of the two sides is still the middle, so a mono speaker hears
// the riffs as they were; `amount` 0 leaves them be.
export function widen(bL, bR, sr, amount) {
  if (!amount) return;
  const n = bL.length;
  const d1 = Math.round(0.011 * sr);
  const d2 = Math.round(0.019 * sr);
  const c = coef(300, sr);
  const h = new Float32Array(n);
  let lp = 0;
  for (let j = 0; j < n; j++) {
    const m = (bL[j] + bR[j]) * 0.5;
    lp += c * (m - lp);
    h[j] = m - lp;
  }
  for (let j = 0; j < n; j++) {
    const s = amount * ((j >= d1 ? 0.7 * h[j - d1] : 0) - (j >= d2 ? 0.5 * h[j - d2] : 0));
    bL[j] += s;
    bR[j] -= s;
  }
}
// The glue: a 2:1 compressor on a bus (L and R together), in place. Its level detector is the greater of two
// smoothed powers (10 ms and 120 ms: quick to rise, slow to let go), read every fourth sample; the threshold sits
// 3 dB over the bus's own average (over where it plays), a soft knee 6 dB wide, the gain worked every 16 samples and
// eased between.
// -> the gain that brings the bus back to the power it had, left for the caller to apply as it goes on.
const GLUE_BLOCK = 4096;
export function glue(bL, bR, sr, { ratio = 2, atk = 0.01, rel = 0.12, knee = 6, over = 3 } = {}) {
  const n = bL.length;
  const nb = Math.ceil(n / GLUE_BLOCK);
  const pb = new Float64Array(nb);
  for (let k = 0; k < nb; k++) {
    let p = 0;
    for (let j = k * GLUE_BLOCK, e = Math.min(n, j + GLUE_BLOCK); j < e; j += 4) p += bL[j] * bL[j] + bR[j] * bR[j];
    pb[k] = p / (2 * (GLUE_BLOCK / 4));
  }
  let top = 0;
  for (let k = 0; k < nb; k++) if (pb[k] > top) top = pb[k];
  if (!(top > 0)) return 1;
  let tot = 0;
  let cnt = 0;
  for (let k = 0; k < nb; k++)
    if (pb[k] > 0.05 * top) {
      tot += pb[k];
      cnt++;
    }
  const thr = 10 * Math.log10(tot / cnt) + over;
  const cA = 1 - Math.exp(-4 / (atk * sr));
  const cR = 1 - Math.exp(-4 / (rel * sr));
  const slope = 1 - 1 / ratio;
  const gb = new Float32Array(((n - 1) >> 4) + 2);
  let a = 0;
  let r = 0;
  for (let j = 0; j < n; j += 4) {
    const p = (bL[j] * bL[j] + bR[j] * bR[j]) * 0.5;
    a += cA * (p - a);
    r += cR * (p - r);
    if (!(j & 15)) {
      const o = 10 * Math.log10((a > r ? a : r) + 1e-20) - thr;
      const gr = 2 * o < -knee ? 0 : 2 * Math.abs(o) <= knee ? (slope * (o + knee / 2) ** 2) / (2 * knee) : slope * o;
      gb[j >> 4] = 10 ** (-gr / 20);
    }
  }
  gb[gb.length - 1] = gb[gb.length - 2];
  let before = 0;
  let after = 0;
  for (let j = 0; j < n; j++) {
    const k = j >> 4;
    const g = gb[k] + (gb[k + 1] - gb[k]) * ((j & 15) / 16);
    const l = bL[j];
    const r = bR[j];
    before += l * l + r * r;
    bL[j] = l * g;
    bR[j] = r * g;
    after += bL[j] * bL[j] + bR[j] * bR[j];
  }
  return after > 0 ? Math.sqrt(before / after) : 1;
}

// ---- The echo and the room ----

// The room: an 8-line feedback delay network (Jot's: eight delays of 23 to 71 ms, fed back through a Hadamard
// matrix at 0.85, each line darkened by a one-pole low-pass at 6 kHz as it goes round, so the highs die first).
// The mono send enters through a stereo pre-delay (20 ms on the even lines, 27 ms on the odd) and the two sides
// are taken from different mixes of the lines, so they are not alike. -> { L, R }
export const FDN = [1031, 1327, 1621, 1913, 2203, 2503, 2791, 3137];   // (samples at 44.1 kHz)
const FDN_FEED = 0.85;
const FDN_DAMP = 6000;
const FDN_OUT = 0.45;
export function room(send, sr) {
  const n = send.length;
  const k = sr / 44100;
  const [d0, d1, d2, d3, d4, d5, d6, d7] = FDN.map(v => Math.max(2, Math.round(v * k)));
  // (The eight lines in one ring of 4096 each: a line's delay is read back from where it was written.)
  const M = 4095;
  const rg = new Float32Array(8 * 4096);
  const c = coef(FDN_DAMP, sr);
  const preE = Math.round(0.02 * sr);
  const preO = Math.round(0.027 * sr);
  const g = FDN_FEED * Math.sqrt(1 / 8);
  const o = FDN_OUT * Math.sqrt(1 / 8);
  let k0 = 0, k1 = 0, k2 = 0, k3 = 0, k4 = 0, k5 = 0, k6 = 0, k7 = 0;   // each line's low-pass
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const y0 = rg[(j - d0) & M], y1 = rg[4096 + ((j - d1) & M)], y2 = rg[8192 + ((j - d2) & M)], y3 = rg[12288 + ((j - d3) & M)];
    const y4 = rg[16384 + ((j - d4) & M)], y5 = rg[20480 + ((j - d5) & M)], y6 = rg[24576 + ((j - d6) & M)], y7 = rg[28672 + ((j - d7) & M)];
    L[j] = (y0 + y1 - y2 - y3 + y4 + y5 - y6 - y7) * o;
    R[j] = (y0 - y1 - y2 + y3 + y4 - y5 - y6 + y7) * o;
    // (The Hadamard mix: three passes of sums and differences.)
    const a0 = y0 + y1, a1 = y0 - y1, a2 = y2 + y3, a3 = y2 - y3, a4 = y4 + y5, a5 = y4 - y5, a6 = y6 + y7, a7 = y6 - y7;
    const b0 = a0 + a2, b1 = a1 + a3, b2 = a0 - a2, b3 = a1 - a3, b4 = a4 + a6, b5 = a5 + a7, b6 = a4 - a6, b7 = a5 - a7;
    const e = j >= preE ? send[j - preE] : 0;
    const f = j >= preO ? send[j - preO] : 0;
    const w = j & M;
    rg[w] = (k0 += c * ((b0 + b4) * g - k0)) + e;
    rg[4096 + w] = (k1 += c * ((b1 + b5) * g - k1)) + f;
    rg[8192 + w] = (k2 += c * ((b2 + b6) * g - k2)) + e;
    rg[12288 + w] = (k3 += c * ((b3 + b7) * g - k3)) + f;
    rg[16384 + w] = (k4 += c * ((b0 - b4) * g - k4)) + e;
    rg[20480 + w] = (k5 += c * ((b1 - b5) * g - k5)) + f;
    rg[24576 + w] = (k6 += c * ((b2 - b6) * g - k6)) + e;
    rg[28672 + w] = (k7 += c * ((b3 - b7) * g - k7)) + f;
  }
  return { L, R };
}

// ---- The pump: a bus ducking under the kick ----

// The gain a bus is played at: 1, dipping by `depth` at each kick and back
// over half a beat (B: a beat's samples).
export function duck(n, kicks, B, depth) {
  const g = new Float32Array(n).fill(1);
  if (!depth) return g;
  const len = Math.max(1, Math.round(B / 2));
  for (const p of kicks)
    for (let t = 0; t < len && p + t < n; t++) {
      if (p + t < 0) continue;
      const v = 1 - depth * (1 - t / len) ** 2;
      if (v < g[p + t]) g[p + t] = v;
    }
  return g;
}

// ---- The limiter ----

// The gain that keeps L and R under `ceiling`, looking ahead: each block of
// 64 samples at most the gain its loudest neighbour needs, let back up over
// 80 ms, eased sample by sample between the blocks. It never lets a sample
// past the ceiling. -> Float32Array
export function limitGain(L, R, sr, ceiling = CEILING) {
  const n = L.length;
  const blk = 64;
  const nb = Math.ceil(n / blk) || 1;
  const raw = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    let p = 0;
    for (let j = b * blk, e = Math.min(n, j + blk); j < e; j++) p = Math.max(p, Math.abs(L[j]), Math.abs(R[j]));
    raw[b] = p > ceiling ? ceiling / p : 1;
  }
  const G = new Float64Array(nb);
  const rel = blk / (0.08 * sr);
  for (let b = 0; b < nb; b++) {
    const need = Math.min(raw[b], b ? raw[b - 1] : 1, b + 1 < nb ? raw[b + 1] : 1);
    G[b] = b ? Math.min(need, G[b - 1] + rel) : need;
  }
  const g = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const c = (j - blk / 2) / blk;   // where between the blocks' centres
    const b0 = Math.max(0, Math.min(nb - 1, Math.floor(c)));
    const b1 = Math.min(nb - 1, b0 + 1);
    const f = Math.min(1, Math.max(0, c - b0));
    g[j] = Math.min(G[b0] + (G[b1] - G[b0]) * f, raw[Math.floor(j / blk)]);
  }
  return g;
}

// ---- The whole mix ----

// The echo, added into x: what `src` had d samples ago (darkened by a
// one-pole low-pass at 3 kHz) plus fb of the echo then, `amount` of it.
// The same as comb(onePole(src, sr, 3000), d, fb) · amount, with no copy.
function echoInto(x, src, sr, d, fb, amount) {
  const c = coef(3000, sr);
  const ring = new Float32Array(d);   // y[n - d] … y[n - 1], where y = dark[n - d] + fb · y[n - d]
  const dark = new Float32Array(d);   // the darkened input, d ago
  let lp = 0;
  let p = 0;
  for (let j = 0; j < x.length; j++) {
    const y = dark[p] + fb * ring[p];
    lp += c * (src[j] - lp);
    dark[p] = lp;
    ring[p] = y;
    if (++p === d) p = 0;
    x[j] += y * amount;
  }
}

// How loud the whole song is brought to: its RMS (both sides, weighed by a high-pass at 100 Hz, over the stretches
// that play) in dBFS. A phone's speaker plays little below that, so the bottom octave does not count.
export const LOUDNESS = -13;
const LOUD_BLOCK = 0.4;   // seconds
// The mean power (per side) of x = [L, R] after a 100 Hz high-pass, over the 0.4 s blocks within 10 dB of the average.
export function loudness(L, R, sr) {
  const n = L.length;
  const blk = Math.max(1, Math.round(LOUD_BLOCK * sr));
  const nb = Math.ceil(n / blk);
  const pb = new Float64Array(nb);
  const c = coef(100, sr);
  let a = 0;
  let b = 0;
  for (let j = 0; j < n; j++) {
    a += c * (L[j] - a);
    b += c * (R[j] - b);
    const hl = L[j] - a;
    const hr = R[j] - b;
    pb[(j / blk) | 0] += hl * hl + hr * hr;
  }
  let all = 0;
  for (let k = 0; k < nb; k++) {
    pb[k] /= 2 * blk;
    all += pb[k];
  }
  all /= nb || 1;
  let tot = 0;
  let cnt = 0;
  for (let k = 0; k < nb; k++)
    if (pb[k] > 0.1 * all) {
      tot += pb[k];
      cnt++;
    }
  return cnt ? tot / cnt : 0;
}
// The soft saturation: a sample's gain 1 / sqrt(1 + (a / 1.3)²) of the louder side's size, so a quiet sample is
// untouched and a loud one bent in (about 2 dB at full scale), both sides alike (a bus kept apart gets the same).
const SAT = 1 / 1.3 ** 2;

// `place(name, L, R)` sums a bus's hits into L and R (all `n` long, zeroed)
// and says whether it had any; `kicks`: where each kick and 808 starts
// (samples); `plan`: the song's sections ([type, first bar, bars]); B: a
// beat's samples. The buses, mixed: their levels, tone, glue, width, echo, the
// room and the fade, no loudness yet. -> { L, R, stems }
// A bus at a time through two buffers (and stems only when asked), so a phone
// holds a few song-long buffers, not twenty.
export function mixBuses(place, { sr, B, n, plan = [], kicks = [], mix = MIX, stems = false }) {
  const m = mixOf(mix);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const send = m.reverb ? new Float32Array(n) : null;   // into the room, mono
  let bL = stems ? null : new Float32Array(n);
  let bR = stems ? null : new Float32Array(n);
  const out = stems ? {} : null;
  const bar = k => Math.round(k * 4 * B);
  const sections = plan.map(([t, b, len]) => ({ t, a: bar(b), b: bar(b + len) }));
  let pump = null;
  for (const name of BUSES) {
    if (stems) {
      bL = new Float32Array(n);
      bR = new Float32Array(n);
    } else {
      bL.fill(0);
      bR.fill(0);
    }
    if (!place(name, bL, bR)) continue;
    // The sweeps first (their stretches only), then in one pass each sample's
    // level, the pump and the sends; then the tone, the glue, the width, the echo and the sum.
    if (m.sweep && (name === 'keys' || name === 'bass'))
      for (const s of sections) {
        const opts =
          s.t === 'intro' && name === 'keys' ? { kind: 'lp', a: s.a, b: s.b, f0: 350, f1: 16000 } :
          s.t === 'pre' ? { kind: 'hp', a: s.a, b: s.b, f0: 30, f1: name === 'bass' ? 400 : 900 } :
          s.t === 'break' && name === 'keys' ? { kind: 'lp', a: s.a, b: s.b, f0: 1400, f1: 1400 } : null;
        if (opts) {
          sweep(bL, sr, opts);
          sweep(bR, sr, opts);
        }
      }
    const gain = dbGain(m[name]);
    // (A little to the right: the hats.)
    const left = name === 'hats' ? gain * (1 - 0.35 * m.width) : gain;
    const depth = !m.pump ? 0 : name === 'bass' ? m.pump : name === 'keys' ? m.pump * 0.6 : 0;
    if (depth) pump ||= duck(n, kicks, B, 1);   // the full dip, scaled for each bus
    const keys = name === 'keys';
    const direct = name === 'hats';   // (nothing more to do to them: summed as they go)
    const rhythm = name === 'drums' || name === 'bass';
    // The room is sent the riffs, the drums' top (the snare and what rings above it, not the kick) and a little of the hats; never the bass.
    const toRoom = !send ? 0 : keys ? 0.75 * m.reverb : name === 'drums' ? 0.6 * m.reverb : name === 'hats' ? 0.3 * m.reverb : 0;
    const echo = keys && m.delay ? new Float32Array(n) : null;   // the riffs as they were, for the echo
    // The tone, in the same pass: the drums and bass lose some of what is under 100 / 90 Hz and the rumble under 30; the riffs gain 2.5 dB over 3 kHz.
    const takeOut = name === 'drums' ? 0.25 : 0.3;
    const cLow = coef(name === 'drums' ? 100 : 90, sr);
    const cRumble = coef(30, sr);
    const cTop = coef(3000, sr);
    const cSnare = coef(500, sr);
    const p = depth ? pump : null;
    if (rhythm) {
      let tl = 0, ql = 0, lp = 0, lq = 0;
      for (let j = 0; j < n; j++) {
        const g = p ? 1 - depth * (1 - p[j]) : 1;
        const l = bL[j] * left * g;
        const r = bR[j] * gain * g;
        if (toRoom) {
          // (Two poles: the kick's thump and the 808 are well under this, its click and the snare's body over.)
          lp += cSnare * (l - lp);
          lq += cSnare * (lp - lq);
          send[j] += (l - lq) * toRoom;
        }
        // (The middle only: what differs between the sides is left as it is.)
        const mid = (l + r) * 0.5;
        const side = l - mid;
        tl += cLow * (mid - tl);
        const w = mid - takeOut * tl;
        ql += cRumble * (w - ql);
        bL[j] = w - ql + side;
        bR[j] = w - ql - side;
      }
    } else if (keys) {
      // (And most of what is under 150 Hz taken out, and a little of 150 to 500: the riffs' low notes leave the bottom to the bass and kick, not a muddy pile.)
      let sl = 0, sr_ = 0, kl = 0, kr = 0, ml = 0, mr = 0;
      const cKeys = coef(150, sr), cMud = coef(500, sr);
      for (let j = 0; j < n; j++) {
        const g = p ? 1 - depth * (1 - p[j]) : 1;
        const l0 = bL[j] * left * g;
        const r0 = bR[j] * gain * g;
        if (toRoom) send[j] += (l0 + r0) * toRoom;
        if (echo) echo[j] = (l0 + r0) / 2;
        kl += cKeys * (l0 - kl);
        kr += cKeys * (r0 - kr);
        ml += cMud * (l0 - ml);
        mr += cMud * (r0 - mr);
        const l = l0 - 0.6 * kl - 0.3 * (ml - kl), r = r0 - 0.6 * kr - 0.3 * (mr - kr);
        sl += cTop * (l - sl);
        sr_ += cTop * (r - sr_);
        bL[j] = l + 0.334 * (l - sl);
        bR[j] = r + 0.334 * (r - sr_);
      }
    } else {
      for (let j = 0; j < n; j++) {
        const l = bL[j] * left;
        const r = bR[j] * gain;
        if (toRoom) send[j] += (l + r) * toRoom;
        bL[j] = l;
        bR[j] = r;
        L[j] += l;
        R[j] += r;
      }
    }
    const back = rhythm ? glue(bL, bR, sr) : 1;
    if (keys) widen(bL, bR, sr, 1.2 * m.width);
    if (echo) {
      echoInto(bL, echo, sr, Math.max(1, Math.round(0.75 * B)), 0.35, m.delay * 0.45);
      echoInto(bR, echo, sr, Math.max(1, Math.round(0.5 * B)), 0.35, m.delay * 0.45);
    }
    if (!direct)
      for (let j = 0; j < n; j++) {
        const l = bL[j] * back;
        const r = bR[j] * back;
        L[j] += l;
        R[j] += r;
        if (stems) {
          bL[j] = l;
          bR[j] = r;
        }
      }
    if (stems) out[name] = { L: bL, R: bR };
  }
  bL = bR = null;
  if (send) {
    const c = coef(5000, sr);   // the room's input darkened
    let lp = 0;
    for (let j = 0; j < n; j++) send[j] = lp += c * (send[j] - lp);
    const r = room(send, sr);
    const k = (1 - m.width) / 2;   // narrower: each side some of the other
    for (let j = 0; j < n; j++) {
      const a = r.L[j];
      const b = r.R[j];
      r.L[j] = a * (1 - k) + b * k;
      r.R[j] = b * (1 - k) + a * k;
      L[j] += r.L[j];
      R[j] += r.R[j];
    }
    if (stems) out.fx = r;
  }
  const parts = stems ? Object.values(out) : [];
  if (m.fade) {   // the outro fades away to nothing by the song's last bar
    const o = sections.find(s => s.t === 'outro');
    if (o)
      for (const x of [L, R, ...parts.flatMap(s => [s.L, s.R])])
        for (let j = o.a; j < n; j++) x[j] *= j >= o.b ? 0 : Math.cos(((j - o.a) / (o.b - o.a)) * (Math.PI / 2)) ** 2;
  }
  return { L, R, stems: out };
}

// The master: the song brought to one loudness (its RMS to LOUDNESS, the loudest moment never more than 8 dB past
// the ceiling, the limiter's most), then a soft saturation, then held under the ceiling; the stems get the same
// gains, so they still sum to the mix. In place. -> `over`, how far past full scale the loudest moment went at that
// loudness, before the limiter (dB).
export function master({ L, R, stems = null }, sr) {
  const n = L.length;
  const parts = stems ? Object.values(stems) : [];
  let peak = 0;
  for (let j = 0; j < n; j++) {
    const a = Math.abs(L[j]);
    const b = Math.abs(R[j]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  const pw = loudness(L, R, sr);
  const makeup = peak > 0 && pw > 0 ? Math.min(Math.sqrt(dbGain(LOUDNESS) ** 2 / pw), (CEILING * 2.5) / peak) : 1;
  const sat = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    L[j] *= makeup;
    R[j] *= makeup;
    const a = Math.max(Math.abs(L[j]), Math.abs(R[j]));
    const s = 1 / Math.sqrt(1 + a * a * SAT);
    sat[j] = s;
    L[j] *= s;
    R[j] *= s;
  }
  const g = limitGain(L, R, sr);
  for (let j = 0; j < n; j++) {
    L[j] *= g[j];
    R[j] *= g[j];
  }
  for (const s of parts)
    for (let j = 0; j < n; j++) {
      const k = makeup * sat[j] * g[j];
      s.L[j] *= k;
      s.R[j] *= k;
    }
  return peak > 0 ? 20 * Math.log10(peak * makeup) : -Infinity;
}

// The whole mix: the buses mixed, then the master. -> { L, R, stems, over } (`over`: master's)
export function mixdown(place, opts) {
  const out = mixBuses(place, opts);
  out.over = master(out, opts.sr);
  return out;
}

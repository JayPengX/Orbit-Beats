// The mixer (混音): what a song's pieces go through once they're placed on
// the grid, on by default. Each piece plays on its bus (drums, hats, bass,
// the riffs and phrases as keys), each bus its level; the riffs into an echo
// (a dotted eighth left, an eighth right) and a room, the snare a little of
// the room too; the bass and the riffs ducking under the kick (the pump);
// the riffs opening up through the intro (a low-pass), rising out of the
// way before a hook (a high-pass over the pre-hook), muffled in a break; the
// hats a little to one side. Then the whole song brought to one loudness
// and held under -1 dBFS by a limiter that looks ahead, so nothing clips
// whatever the format. Off, the song is the pieces exactly as recorded.
//
// The same steps as passion_beats.py's mixer, sample for sample in what each
// one does (the two can't share random numbers, so not the same songs). No
// DOM: the tests run it.

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

// ---- The echo and the room ----

// y[n] = x[n - d] + fb · y[n - d]: an echo every d samples, each fb as loud.
export function comb(x, d, fb) {
  const y = new Float32Array(x.length);
  for (let n = d; n < x.length; n++) y[n] = x[n - d] + fb * y[n - d];
  return y;
}
// y[n] = -g · x[n] + x[n - d] + g · y[n - d]: smears without colouring.
export function allpass(x, d, g) {
  const y = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) y[n] = -g * x[n] + (n >= d ? x[n - d] + g * y[n - d] : 0);
  return y;
}
// A room (Schroeder's: four combs side by side, each y[n] = x[n - d] +
// 0.82 · y[n - d], a quarter each, then two all-passes in a row, g 0.5),
// from a mono send, a little different each side. The same sums as comb()
// and allpass(), in one pass with a ring for each delay. -> { L, R }
const COMBS = [1116, 1188, 1277, 1356];
const SMEARS = [556, 441];
export function room(send, sr) {
  const k = sr / 44100;
  const n = send.length;
  const side = spread => {
    const [d0, d1, d2, d3] = COMBS.map(d => Math.round((d + spread) * k));
    const [e0, e1] = SMEARS.map(d => Math.round((d + spread) * k));
    // Each comb's ring holds x[n - d] + 0.82 · y[n - d], what comes out d later.
    const r0 = new Float32Array(d0), r1 = new Float32Array(d1), r2 = new Float32Array(d2), r3 = new Float32Array(d3);
    const ax0 = new Float32Array(e0), ay0 = new Float32Array(e0), ax1 = new Float32Array(e1), ay1 = new Float32Array(e1);
    let p0 = 0, p1 = 0, p2 = 0, p3 = 0, q0 = 0, q1 = 0;
    const out = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      const x = send[j];
      const y0 = r0[p0], y1 = r1[p1], y2 = r2[p2], y3 = r3[p3];
      // y[n] = x[n-d] + 0.82 y[n-d]: the ring keeps the sum for d samples on
      r0[p0] = x + 0.82 * y0; r1[p1] = x + 0.82 * y1; r2[p2] = x + 0.82 * y2; r3[p3] = x + 0.82 * y3;
      if (++p0 === d0) p0 = 0;
      if (++p1 === d1) p1 = 0;
      if (++p2 === d2) p2 = 0;
      if (++p3 === d3) p3 = 0;
      const v = (y0 + y1 + y2 + y3) * 0.25;
      const u = -0.5 * v + ax0[q0] + 0.5 * ay0[q0];
      ax0[q0] = v; ay0[q0] = u;
      if (++q0 === e0) q0 = 0;
      const w = -0.5 * u + ax1[q1] + 0.5 * ay1[q1];
      ax1[q1] = u; ay1[q1] = w;
      if (++q1 === e1) q1 = 0;
      out[j] = w;
    }
    return out;
  };
  return { L: side(0), R: side(23) };
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

// `place(name, L, R)` sums a bus's hits into L and R (all `n` long, zeroed)
// and says whether it had any; `kicks`: where each kick and 808 starts
// (samples); `plan`: the song's sections ([type, first bar, bars]); B: a
// beat's samples. Returns { L, R, stems, over }: `over` how far past full
// scale the loudest moment would have gone at one loudness (dB), before the
// limiter held it. A bus at a time through two buffers (and stems only when
// asked), so a phone holds a few song-long buffers, not twenty.
export function mixdown(place, { sr, B, n, plan = [], kicks = [], mix = MIX, stems = false }) {
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
    // level, the pump, the sends and the sum.
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
    const toRoom = !send ? 0 : keys ? 0.25 * m.reverb : name === 'drums' ? 0.2 * m.reverb : 0;
    const echo = keys && m.delay ? new Float32Array(n) : null;   // the riffs as they were, for the echo
    const c = coef(300, sr);
    let lp = 0;
    const sum = !echo;   // (with an echo, summed once it's in)
    for (let j = 0; j < n; j++) {
      const g = depth ? 1 - depth * (1 - pump[j]) : 1;
      const l = (bL[j] *= left * g);
      const r = (bR[j] *= gain * g);
      // The sends: the riffs to the echo and the room; the drums' top (the snare) to the room.
      if (toRoom) {
        if (keys) send[j] += (l + r) * toRoom;
        else {
          lp += c * (l - lp);
          send[j] += (l - lp) * toRoom;
        }
      }
      if (echo) echo[j] = (l + r) / 2;
      if (sum) {
        L[j] += l;
        R[j] += r;
      }
    }
    if (echo) {
      echoInto(bL, echo, sr, Math.max(1, Math.round(0.75 * B)), 0.35, m.delay * 0.45);
      echoInto(bR, echo, sr, Math.max(1, Math.round(0.5 * B)), 0.35, m.delay * 0.45);
      for (let j = 0; j < n; j++) {
        L[j] += bL[j];
        R[j] += bR[j];
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
  // One loudness: the loudest moment 3 dB past the ceiling, then held under it.
  let peak = 0;
  for (let j = 0; j < n; j++) {
    const a = Math.abs(L[j]);
    const b = Math.abs(R[j]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  const makeup = peak > 0 ? (CEILING * Math.SQRT2) / peak : 1;
  for (let j = 0; j < n; j++) {
    L[j] *= makeup;
    R[j] *= makeup;
  }
  const g = limitGain(L, R, sr);
  for (let j = 0; j < n; j++) {
    L[j] *= g[j];
    R[j] *= g[j];
  }
  for (const s of parts)
    for (let j = 0; j < n; j++) {
      s.L[j] *= makeup * g[j];
      s.R[j] *= makeup * g[j];
    }
  return { L, R, stems: out, over: peak > 0 ? 20 * Math.log10(peak) : -Infinity };
}

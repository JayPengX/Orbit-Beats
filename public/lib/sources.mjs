// A kit's sources: one recording, a pack of sample files, a take from the
// microphone, or any mix of them ({ name, sr, L, R } each). All at one
// sample rate (the first's; the others resampled), each split into pieces:
// first on its own silences, then each stretch longer than a few seconds by
// its beat (lib/rhythm.mjs): a song or a jam with no gaps into its bars'
// patterns, a take of single hits into its hits. Every piece knows its source.
// No DOM here: the tests run it.
import { silenceSpans } from '../engine.mjs';
import { monoOf, planCuts } from './rhythm.mjs';

// Linear resampling: enough for one-shots and loops headed for a mix (the
// browser's decoder already gives most files at 48 kHz).
export function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.max(1, Math.round((x.length * to) / from));
  const out = new Float32Array(n);
  const k = from / to;
  for (let i = 0; i < n; i++) {
    const p = i * k;
    const j = Math.floor(p);
    const f = p - j;
    out[i] = (x[j] || 0) * (1 - f) + (x[Math.min(j + 1, x.length - 1)] || 0) * f;
  }
  return out;
}
export function atRate(sources, sr = sources[0]?.sr) {
  return sources.map(s => {
    if (s.sr === sr) return s;
    const L = resample(s.L, s.sr, sr);
    return { ...s, sr, L, R: s.R === s.L ? L : resample(s.R, s.sr, sr) };
  });
}

// ---- Cut by the beat ----
// A stretch this long or longer is listened to for its beat; a shorter one is a piece as it is.
export const LONG = 3;
// What each stretch was heard as (lib/rhythm.mjs planCuts: how, bpm, cuts), by its sound.
const plans = new Map();
// A stretch's key: its source's sound (length, rate, a few samples) and where it is.
function keyOf(s, a, b) {
  const L = s.L;
  let h = 0;
  for (let k = 0; k < 32; k++) h = (h * 31 + Math.round((L[a + Math.floor(((b - a - 1) * k) / 31)] || 0) * 1e6)) | 0;
  return `${s.sr}:${L.length}:${a}:${b}:${h}`;
}
const longSpans = (s, opts) => silenceSpans(s, opts).filter(([a, b]) => b - a >= LONG * s.sr);
// Every long stretch of the sources heard for its beat (the ones not heard
// before), `plan(x, sr)` doing the listening (a worker's; here by default).
export async function planAll(sources, opts, plan = (x, sr) => planCuts(x, sr)) {
  const jobs = [];
  for (const s of sources)
    for (const [a, b] of longSpans(s, opts)) {
      const key = keyOf(s, a, b);
      if (plans.has(key)) continue;
      const m = monoOf({ sr: s.sr, L: s.L.subarray(a, b), R: s.R.subarray(a, b) });
      jobs.push(
        Promise.resolve(plan(m.x, m.sr)).then(
          p => plans.set(key, { how: p.how, bpm: p.bpm, bars: p.bars, cuts: p.cuts, seconds: (b - a) / s.sr }),
          () => plans.set(key, { how: 'whole', bpm: null, bars: 0, cuts: null, seconds: (b - a) / s.sr })
        )
      );
    }
  await Promise.all(jobs);
}
// A long stretch not heard yet (split again once it is).
export const unplanned = (sources, opts) => sources.some(s => longSpans(s, opts).some(([a, b]) => !plans.has(keyOf(s, a, b))));

// A piece cut where the sound goes on (not at a silence) has its edges eased
// over 2 ms, as samplers' slices do, so its cut never clicks; one between
// silences stays exactly as recorded.
const EDGE = 0.002;
function cut(s, a, b, eased) {
  const L = s.L.slice(a, b), R = s.R === s.L ? L : s.R.slice(a, b);
  if (eased) {
    const n = Math.min(Math.round(EDGE * s.sr), Math.floor(L.length / 4));
    for (let i = 0; i < n; i++) {
      const g = i / n;
      for (const x of R === L ? [L] : [L, R]) (x[i] *= g), (x[x.length - 1 - i] *= g);
    }
  }
  return { L, R };
}
// Every source's pieces, in order, each with `src` (its source's index) and
// `cutBy` ('silence', 'bars' or 'hits').
export function splitAll(sources, opts) {
  return sources.flatMap((s, src) =>
    silenceSpans(s, opts).flatMap(([a, b]) => {
      const p = b - a >= LONG * s.sr ? plans.get(keyOf(s, a, b)) : null;
      if (!p?.cuts || p.how === 'whole') return [{ ...cut(s, a, b, false), src, cutBy: 'silence' }];
      return p.cuts.map(([t0, t1]) => {
        const from = a + Math.round(t0 * s.sr);
        return { ...cut(s, from, Math.min(b, from + Math.round((t1 - t0) * s.sr)), true), src, cutBy: p.how };
      });
    })
  );
}
// The kit's tempo as its beat was heard (the longest stretch with a steady
// beat), or null: then it's heard from the pieces (analyze.mjs).
export function beatTempo(sources, opts) {
  let best = null;
  for (const s of sources)
    for (const [a, b] of longSpans(s, opts)) {
      const p = plans.get(keyOf(s, a, b));
      if (p?.bpm && (!best || p.seconds > best.seconds)) best = p;
    }
  if (!best?.bpm) return null;
  // (As the tempo box shows one: a whole number when it's that within a third of a beat a minute.)
  const w = Math.round(best.bpm);
  return Math.abs(w - best.bpm) < 0.3 ? w : Math.round(best.bpm * 10) / 10;
}
// How the kit was cut: 'bars', 'hits' (some stretch was), else 'silence'.
export function cutWay(pieces) {
  if (pieces.some(p => p.cutBy === 'bars')) return 'bars';
  if (pieces.some(p => p.cutBy === 'hits')) return 'hits';
  return 'silence';
}
// "drums.wav" → "drums": a file's name without its kind, for the pieces' list.
export const baseName = name => String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '');

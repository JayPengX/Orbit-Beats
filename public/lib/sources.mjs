// A kit's sources: one recording, a pack of sample files, a take from the
// microphone, or any mix of them ({ name, sr, L, R } each). All at one
// sample rate (the first's; the others resampled), each split into pieces on
// its own silence, every piece knowing its source. No DOM here: the tests run it.
import { splitPieces } from '../engine.mjs';

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
// Every source's pieces, in order, each with `src` (its source's index).
export function splitAll(sources, opts) {
  return sources.flatMap((s, src) => splitPieces(s, opts).map(p => ({ ...p, src })));
}
// "drums.wav" → "drums": a file's name without its kind, for the pieces' list.
export const baseName = name => String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '');

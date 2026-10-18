// The radio's songs one after another, as 聽 plays them (each stretch from
// the song's start to its cut, the last one's ring under its start), and
// each second's loudness (RMS, both sides).
import { radioSong, cutOf, segment, handoverAt } from '../public/lib/radio.mjs';

export const MOOD_ORDER = ['all', 'chill', 'hype', 'groove', 'classic'];
export function stream(seeds) {
  let tail = null;
  const out = [];
  for (const [k, seed] of seeds.entries()) {
    const spec = { seed, mood: MOOD_ORDER[k % MOOD_ORDER.length] };
    const { audio, info } = radioSong(spec);
    const seg = segment(audio, cutOf(info, audio.sr), tail);
    tail = seg.tail;
    out.push({ spec, info, audio, seg });
  }
  return out;
}
// Each whole second's RMS of a stretch.
export function rmsPerSecond({ L, R }, sr) {
  const out = [];
  for (let s = 0; (s + 1) * sr <= L.length; s++) {
    let e = 0;
    for (let j = s * sr; j < (s + 1) * sr; j++) e += L[j] * L[j] + R[j] * R[j];
    out.push(Math.sqrt(e / (2 * sr)));
  }
  return out;
}

// The stretches as the player plays them: each next one started at its
// handover on the last one's clock, `late` seconds late (a slow phone), the
// two summed where they overlap. -> { L, R, joins: [sample where each next starts] }
export function playOut(segs, sr, late = 0) {
  const starts = [0];
  for (let k = 1; k < segs.length; k++) starts.push(starts[k - 1] + Math.round((handoverAt(segs[k - 1].L.length / sr) + late) * sr));
  const n = Math.max(...segs.map((x, k) => starts[k] + x.L.length));
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  segs.forEach((x, k) => {
    for (let j = 0; j < x.L.length; j++) {
      L[starts[k] + j] += x.L[j];
      R[starts[k] + j] += x.R[j];
    }
  });
  return { L, R, joins: starts.slice(1) };
}
// RMS over windows of `ms` from sample a to b.
export function rmsWindows({ L, R }, sr, a, b, ms = 20) {
  const w = Math.round((ms / 1000) * sr);
  const out = [];
  for (let s = Math.max(0, a); s + w <= Math.min(b, L.length); s += w) {
    let e = 0;
    for (let j = s; j < s + w; j++) e += L[j] * L[j] + R[j] * R[j];
    out.push(Math.sqrt(e / (2 * w)));
  }
  return out;
}

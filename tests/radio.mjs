// The radio's songs one after another, as 聽 plays them (each stretch from
// the song's start to its cut, the last one's ring under its start), and
// each second's loudness (RMS, both sides).
import { radioSong, cutOf, segment } from '../public/lib/radio.mjs';

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
// The stretches quieter than `db` dBFS (RMS over 50 ms, every 10 ms) longer
// than `longer` seconds. -> [[from, seconds]]
export function quietRuns({ L, R }, sr, { db = -45, longer = 0.25 } = {}) {
  const win = Math.round(0.05 * sr), hop = Math.round(0.01 * sr), lim = 10 ** (db / 20);
  const runs = [];
  let start = -1;
  for (let i = 0; i + win <= L.length; i += hop) {
    let e = 0;
    for (let j = i; j < i + win; j++) e += L[j] * L[j] + R[j] * R[j];
    const quiet = Math.sqrt(e / (2 * win)) < lim;
    if (quiet && start < 0) start = i;
    if (!quiet && start >= 0) runs.push([start, i + win]), (start = -1);
  }
  if (start >= 0) runs.push([start, L.length]);
  return runs.map(([a, b]) => [a / sr, (b - a) / sr]).filter(([, s]) => s > longer);
}

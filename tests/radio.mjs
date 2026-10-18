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

// Loudness of every style's radio song: ~8 s from 4 s in, RMS and peak in dBFS,
// the outliers (over 6 dB from the median, or clipping). Prints only.
//   node scripts/loudness.mjs [seed] [style,style,...]
import { STYLES } from '../public/engine.mjs';
import { radioSong, RADIO_SR } from '../public/lib/radio.mjs';

const seed = Number(process.argv[2]) || 7;
const only = process.argv[3]?.split(',');
const db = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const rows = [];
for (const style of only || STYLES) {
  const { audio } = radioSong({ seed, mood: 'all', style });
  const from = 4 * RADIO_SR, to = Math.min(audio.L.length, from + 8 * RADIO_SR);
  let e = 0, pk = 0;
  for (let i = from; i < to; i++) {
    e += audio.L[i] ** 2 + audio.R[i] ** 2;
    pk = Math.max(pk, Math.abs(audio.L[i]), Math.abs(audio.R[i]));
  }
  rows.push({ style, rms: db(Math.sqrt(e / (2 * (to - from)))), peak: db(pk) });
}
const sorted = rows.map(r => r.rms).sort((a, b) => a - b);
const median = sorted[sorted.length >> 1];
for (const r of rows) {
  const flag = Math.abs(r.rms - median) > 6 ? ' OUTLIER' : r.peak > -0.1 ? ' CLIP' : '';
  console.log(`${r.style.padEnd(10)} rms ${r.rms.toFixed(1).padStart(6)}  peak ${r.peak.toFixed(1).padStart(6)}${flag}`);
}
console.log(`median rms ${median.toFixed(1)} dBFS; rms ${sorted[0].toFixed(1)} .. ${sorted.at(-1).toFixed(1)}; peak max ${Math.max(...rows.map(r => r.peak)).toFixed(1)}`);

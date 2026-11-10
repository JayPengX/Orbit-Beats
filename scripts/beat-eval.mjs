// How well Orbit Beats hears the beat of a recording with no silences in it,
// before (the whole recording as one piece, its tempo from its own hits) and
// now (lib/rhythm.mjs), on radio songs whose tempo and bars are known.
//   node scripts/beat-eval.mjs [songs=24] [--noise=0.02] [--from=seed]
// Tempo right: within 4%; "or an octave": half or double counts too (MIREX's
// Acc1 / Acc2). Beats: F-measure, a beat within 70 ms of a true one.
// Downbeats: share of the bars cut that start within 70 ms of a true bar line.
import { radioSong } from '../public/lib/radio.mjs';
import { STYLES, analyzeRecording } from '../public/engine.mjs';
import { monoOf, planCuts } from '../public/lib/rhythm.mjs';

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const N = Number(process.argv[2]) || 24, noise = Number(arg('noise', 0)), from = Number(arg('from', 1000));
const near = (a, b) => Math.abs(a / b - 1) <= 0.04;
const acc2 = (a, b) => [1, 2, 0.5, 3, 1 / 3].some(k => near(a, b * k));
const fm = (est, ref, tol = 0.07) => {
  if (!est.length || !ref.length) return 0;
  const used = new Set();
  let hit = 0;
  for (const t of est) {
    const j = ref.findIndex((r, k) => !used.has(k) && Math.abs(r - t) <= tol);
    if (j >= 0) used.add(j), hit++;
  }
  const p = hit / est.length, r = hit / ref.length;
  return p + r ? (2 * p * r) / (p + r) : 0;
};
const rows = [];
let rng = 7;
const rand = () => ((rng = (rng * 1103515245 + 12345) >>> 0) / 2 ** 32 - 0.5) * 2;
for (let i = 0; i < N; i++) {
  const style = STYLES[(i * 11) % STYLES.length];
  const { audio, info } = radioSong({ seed: from + i, mood: 'all', style });
  const sr = audio.sr;
  // (Only the music: the song from its first bar, trimmed to 75 s so the run stays quick.)
  const n = Math.min(audio.L.length, Math.round(75 * sr));
  const L = audio.L.subarray(0, n).slice(), R = audio.R.subarray(0, n).slice();
  if (noise) for (let k = 0; k < n; k++) (L[k] += noise * rand()), (R[k] += noise * rand());
  const bpm = info.bpm, beat = 60 / bpm;
  const t0 = performance.now();
  const old = analyzeRecording([{ L, R }], sr);
  const t1 = performance.now();
  const m = monoOf({ sr, L, R });
  const plan = planCuts(m.x, m.sr);
  const t2 = performance.now();
  const seconds = n / sr;
  const truth = [];
  for (let t = 0; t < seconds; t += beat) truth.push(t);
  const span = plan.beats.length ? [plan.beats[0] - 0.1, plan.beats.at(-1) + 0.1] : [0, seconds];
  const ref = truth.filter(t => t >= span[0] && t <= span[1]);
  const downOk = plan.how === 'bars' ? plan.cuts.filter(([a]) => { const k = Math.round(a / (4 * beat)); return Math.abs(a + 0.006 - k * 4 * beat) <= 0.07; }).length / plan.cuts.length : null;
  rows.push({ style, bpm, oldBpm: old.detected, newBpm: plan.bpm, how: plan.how, pieces: plan.cuts.length, bars: plan.bars, beatF: fm(plan.beats, ref), downOk, oldMs: t1 - t0, newMs: t2 - t1 });
}
const pct = (a, b) => `${Math.round((100 * a) / b)}%`;
const c = f => rows.filter(f).length;
for (const r of rows) console.log(`${r.style.padEnd(10)} ${String(r.bpm).padStart(5)}  old ${String(r.oldBpm ?? '-').padStart(6)}  new ${String(r.newBpm ?? '-').padStart(7)}  ${r.how.padEnd(5)} ${String(r.pieces).padStart(2)}×${r.bars}bar  beatF ${r.beatF.toFixed(2)}  down ${r.downOk == null ? '-' : r.downOk.toFixed(2)}  ${Math.round(r.newMs)} ms`);
console.log(`\n${N} songs${noise ? `, noise ${noise}` : ''}`);
console.log(`tempo right       old ${pct(c(r => r.oldBpm && near(r.oldBpm, r.bpm)), N)}  new ${pct(c(r => r.newBpm && near(r.newBpm, r.bpm)), N)}`);
console.log(`or an octave      old ${pct(c(r => r.oldBpm && acc2(r.oldBpm, r.bpm)), N)}  new ${pct(c(r => r.newBpm && acc2(r.newBpm, r.bpm)), N)}`);
console.log(`cut into pieces   old 0%  new ${pct(c(r => r.how !== 'whole'), N)} (bars ${c(r => r.how === 'bars')}, hits ${c(r => r.how === 'hits')}), ${(rows.reduce((s, r) => s + r.pieces, 0) / N).toFixed(1)} pieces a song`);
const fs = rows.filter(r => r.beats !== null);
console.log(`beat F-measure    new ${(rows.reduce((s, r) => s + r.beatF, 0) / N).toFixed(3)}`);
const dn = rows.filter(r => r.downOk != null);
console.log(`bars on the bar   new ${dn.length ? (dn.reduce((s, r) => s + r.downOk, 0) / dn.length).toFixed(3) : '-'} (${dn.length} songs cut by bars)`);
console.log(`time a minute     new ${Math.round(rows.reduce((s, r) => s + r.newMs, 0) / N / 1.25)} ms (this machine)`);
void fs;

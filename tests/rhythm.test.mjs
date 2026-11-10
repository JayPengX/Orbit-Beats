// Hearing the beat of a recording with no silences in it (lib/rhythm.mjs), and
// the kit cut by it (lib/sources.mjs): tempo, beats, bars, patterns, hits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { monoOf, planCuts, frames, onsets, pulseOf, tempoOf, trackBeats } from '../public/lib/rhythm.mjs';
import { planAll, splitAll, beatTempo, cutWay } from '../public/lib/sources.mjs';
import { radioSong } from '../public/lib/radio.mjs';

const SR = 44100;
let seed = 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
// Drums as sound: a kick (a falling sine), a snare (noise and a tone), a hat (short bright noise).
function add(x, at, kind, g = 1) {
  const j = Math.round(at * SR);
  const len = { kick: 0.35, snare: 0.25, hat: 0.06, bass: 0.4, bell: 0.5 }[kind] * SR;
  let hp = 0, last = 0;
  for (let i = 0; i < len && j + i < x.length; i++) {
    const t = i / SR;
    let v = 0;
    if (kind === 'kick') v = Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 30)) * t) * Math.exp(-t * 9);
    else if (kind === 'snare') v = (0.6 * rand() + 0.4 * Math.sin(2 * Math.PI * 190 * t)) * Math.exp(-t * 18);
    else if (kind === 'hat') {
      const n = rand();
      hp = 0.6 * (hp + n - last);
      last = n;
      v = 0.5 * hp * Math.exp(-t * 60);
    } else if (kind === 'bass') v = 0.6 * Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 3);
    else v = 0.3 * Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 6);
    x[j + i] += g * v;
  }
}
// `bars` bars at `bpm` of a pattern ([beat, kind] per bar, or a list of bars), a faint hiss under it all (no silence anywhere).
function groove(bpm, bars, pattern, { lead = 0 } = {}) {
  const beat = 60 / bpm, x = new Float32Array(Math.round((lead + bars * 4 * beat + 0.5) * SR));
  for (let i = 0; i < x.length; i++) x[i] = 0.003 * rand();
  for (let b = 0; b < bars; b++) {
    const bar = Array.isArray(pattern[0][0]) ? pattern[b % pattern.length] : pattern;
    for (const [q, kind, g] of bar) add(x, lead + (b * 4 + q) * beat, kind, g ?? 1);
  }
  return x;
}
const BACKBEAT = [[0, 'kick'], [0, 'bass', 0.7], [1, 'snare'], [2, 'kick'], [2.5, 'kick', 0.6], [3, 'snare'], ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(q => [q, 'hat', 0.5])];
const near = (a, b, tol = 0.02) => Math.abs(a / b - 1) <= tol;

test('a steady backbeat: its tempo, its beats on the beat, its bars on the bar lines', () => {
  for (const bpm of [84, 100, 128, 150]) {
    const x = groove(bpm, 16, BACKBEAT, { lead: 0.37 });
    const p = planCuts(...Object.values(monoOf({ sr: SR, L: x })).slice(0, 2));
    // (Its tempo, or an octave off: a beat with eighths on the hats is fairly heard at twice it, a fast
    // one at half; ½ and ×2 are beside the tempo.)
    const k = [1, 2, 0.5].find(k => p.bpm && near(p.bpm, k * bpm));
    assert.ok(k, `${bpm}: heard ${p.bpm}`);
    const beat = 60 / bpm, step = beat / k;
    const off = p.beats.map(t => Math.abs(((t - 0.37) / step + 0.5) % 1 - 0.5) * step);
    assert.ok(off.filter(o => o < 0.03).length / off.length > 0.9, `${bpm}: beats off the beat`);
    assert.equal(p.how, 'bars');
    // (Heard at twice the tempo, a "bar" is half of one: on a bar line or halfway; at half, two.)
    const unit = (4 * beat) / Math.max(1, k); // (heard at half: a pair of bars may start on either bar)
    for (const [a] of p.cuts) {
      const k = (a + 0.006 - 0.37) / unit;
      assert.ok(Math.abs(k - Math.round(k)) * unit < 0.03, `${bpm}: a bar cut at ${a.toFixed(3)} s`);
    }
  }
});

test('a pattern is kept once: a repeated bar is one piece, two patterns are two', () => {
  const one = planCuts(...Object.values(monoOf({ sr: SR, L: groove(110, 12, BACKBEAT) })).slice(0, 2));
  assert.equal(one.how, 'bars');
  assert.equal(one.cuts.length, 1, 'one bar, again and again: one piece');
  const verse = BACKBEAT, hook = [...BACKBEAT, [0, 'bass'], [1.5, 'bass'], [3, 'bass'], [0.5, 'bell'], [2.5, 'bell']];
  const two = planCuts(...Object.values(monoOf({ sr: SR, L: groove(110, 16, [verse, verse, verse, verse, verse, verse, verse, verse, hook, hook, hook, hook, hook, hook, hook, hook]) })).slice(0, 2));
  assert.equal(two.how, 'bars');
  assert.equal(two.cuts.length, 2, 'verse and hook');
  // A two-bar riff (its second bar answered differently) is cut two bars long.
  const call = [...BACKBEAT, [0, 'bass'], [2, 'bass']], answer = [...BACKBEAT, [0.5, 'bell'], [1, 'bell'], [1.5, 'bell'], [3.5, 'bass']];
  const riff = planCuts(...Object.values(monoOf({ sr: SR, L: groove(96, 16, [call, answer]) })).slice(0, 2));
  assert.equal(riff.bars, 2);
});

test('a loop of up to four bars stays whole; a short sound too', () => {
  assert.equal(planCuts(...Object.values(monoOf({ sr: SR, L: groove(120, 4, BACKBEAT) })).slice(0, 2)).how, 'whole');
  assert.equal(planCuts(new Float32Array(SR), SR).how, 'whole');
});

test('single hits with no beat and no silence between them: each hit its own piece', () => {
  const x = new Float32Array(SR * 6);
  for (let i = 0; i < x.length; i++) x[i] = 0.002 * rand();
  const at = [0.1, 0.9, 1.5, 2.6, 3.0, 3.9, 4.8, 5.3];
  const kinds = ['kick', 'snare', 'hat', 'kick', 'bell', 'snare', 'kick', 'hat'];
  at.forEach((t, i) => add(x, t, kinds[i]));
  const p = planCuts(x, SR);
  assert.equal(p.how, 'hits');
  assert.equal(p.cuts.length, at.length);
  // (Each a little before its hit, never after: the attack whole.)
  p.cuts.forEach(([a], i) => assert.ok(a <= at[i] + 0.005 && at[i] - a < 0.07, `hit ${i} at ${a}`));
});

test('the kit: a long take cut by its bars, each piece exactly whole bars, the tempo from the beat', async () => {
  const L = groove(100, 16, [BACKBEAT, BACKBEAT, [...BACKBEAT, [0, 'bass'], [2, 'bass']], [...BACKBEAT, [0, 'bass'], [2, 'bass']]]);
  const sources = [{ name: 'jam', sr: SR, L, R: L }];
  const opts = { silenceDb: -90, minGap: 0.2 };
  // Before it's heard: one piece, as it was.
  assert.equal(splitAll(sources, opts).length, 1);
  await planAll(sources, opts);
  const pieces = splitAll(sources, opts);
  assert.equal(cutWay(pieces), 'bars');
  assert.ok(near(beatTempo(sources, opts), 100));
  const bar = (4 * 60) / beatTempo(sources, opts);
  for (const p of pieces) {
    const bars = p.L.length / SR / bar;
    assert.ok(Math.abs(bars - Math.round(bars)) < 0.01 && bars > 0.99, `a piece ${bars} bars long`);
    // (No click: its first and last samples eased to nothing.)
    assert.ok(Math.abs(p.L[0]) < 1e-3 && Math.abs(p.L.at(-1)) < 1e-3);
  }
  // A pack split on its silences is as it was: no piece cut by the beat.
  const pack = new Float32Array(SR * 3);
  add(pack, 0.1, 'kick');
  add(pack, 1.2, 'snare');
  add(pack, 2.2, 'hat');
  const kit = [{ name: 'pack', sr: SR, L: pack, R: pack }];
  await planAll(kit, opts);
  assert.equal(cutWay(splitAll(kit, opts)), 'silence');
  assert.equal(splitAll(kit, opts).length, 3);
});

test("the radio's own songs: tempo heard (or an octave off), beats tracked", () => {
  let right = 0;
  const songs = [['hiphop', 11], ['house', 12], ['lofi', 13], ['rock', 14]];
  for (const [style, s] of songs) {
    const { audio, info } = radioSong({ seed: s, mood: 'all', style });
    const n = Math.min(audio.L.length, 45 * audio.sr);
    const m = monoOf({ sr: audio.sr, L: audio.L.subarray(0, n), R: audio.R.subarray(0, n) });
    const p = planCuts(m.x, m.sr);
    if (p.bpm && [1, 2, 0.5].some(k => near(p.bpm, info.bpm * k, 0.04))) right++;
  }
  assert.ok(right >= 3, `${right} of ${songs.length}`);
});

test('the pulse weighs the low end in, and the tracker keeps the tempo', () => {
  const x = groove(120, 16, BACKBEAT);
  const fr = frames(x, SR), on = onsets(fr), pulse = pulseOf(on);
  const t = tempoOf(pulse, fr.fps);
  assert.ok(near(t.bpm, 120, 0.03));
  const b = trackBeats(pulse, (60 * fr.fps) / t.bpm);
  const gaps = b.slice(1).map((f, i) => (f - b[i]) / fr.fps);
  assert.ok(gaps.filter(g => Math.abs(g - 0.5) < 0.03).length / gaps.length > 0.9);
});

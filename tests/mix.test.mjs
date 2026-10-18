import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIX, BUSES, BUS_OF, STEMS, CEILING, mixOf, dbGain, mixdown, limitGain, duck, comb, allpass, room, onePole, sweep } from '../public/lib/mix.mjs';
import { ROLES, STYLES, makeSong, demoRecording, splitPieces, analyzeRecording } from '../public/engine.mjs';

const rec = demoRecording();
const pieces = splitPieces(rec);
const analysis = analyzeRecording(pieces, rec.sr);
const peakOf = (...xs) => xs.reduce((m, x) => x.reduce((p, v) => Math.max(p, Math.abs(v)), m), 0);
const sumStems = (stems, n) => {
  const L = new Float64Array(n), R = new Float64Array(n);
  for (const s of Object.values(stems)) for (let j = 0; j < n; j++) { L[j] += s.L[j]; R[j] += s.R[j]; }
  return { L, R };
};
const maxDiff = (a, b) => { let d = 0; for (let j = 0; j < a.length; j++) d = Math.max(d, Math.abs(a[j] - b[j])); return d; };

test('the mixer as it opens: on, every bus and stem named, every role on a bus', () => {
  assert.equal(MIX.on, true);
  assert.deepEqual(STEMS, [...BUSES, 'fx']);
  for (const r of ROLES.filter(x => x !== 'off')) assert.ok(BUSES.includes(BUS_OF[r]), r);
  assert.equal(BUS_OF.off, undefined);
  assert.ok(Math.abs(dbGain(0) - 1) < 1e-12 && Math.abs(dbGain(-6) - 0.501187) < 1e-6 && Math.abs(dbGain(20) - 10) < 1e-12);
  assert.ok(Math.abs(20 * Math.log10(CEILING) + 1) < 1e-9);
});

test('mixOf: anything at all comes back a whole mixer, each number in its range', () => {
  for (const bad of [null, undefined, 0, 1, 'mix', true, NaN]) {
    const m = mixOf(bad);
    assert.deepEqual(m, MIX);
    assert.notEqual(m, MIX, 'a copy, never the defaults themselves');
  }
  assert.deepEqual(mixOf([]), MIX);
  const m = mixOf({ drums: 100, hats: -100, bass: 3, keys: -24, reverb: 2, delay: -1, pump: 0.5, width: 7, on: false, sweep: false, fade: true, extra: 1 });
  assert.deepEqual(m, { on: false, drums: 6, hats: -24, bass: 3, keys: -24, reverb: 1, delay: 0, pump: 0.5, sweep: false, width: 1, fade: true });
  // Not numbers, not booleans, Infinity: left as it opens.
  const w = mixOf({ drums: '3', hats: NaN, bass: Infinity, keys: -Infinity, reverb: null, on: 'false', sweep: 0, fade: 1 });
  assert.deepEqual(w, MIX);
  mixOf({ drums: 5 }).drums = 99;
  assert.equal(MIX.drums, 0, 'the defaults never change');
  assert.deepEqual(mixOf(mixOf({ keys: 4 })), mixOf({ keys: 4 }), 'idempotent');
});

test('the limiter: never a sample past -1 dBFS, untouched when nothing is, back up after a peak', () => {
  const sr = 8000, n = 20000;
  let x = 12345;
  const rnd = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 4294967296) * 2 - 1;
  const L = Float32Array.from({ length: n }, () => rnd() * 4), R = Float32Array.from({ length: n }, () => rnd() * 3);
  const g = limitGain(L, R, sr);
  assert.equal(g.length, n);
  for (let j = 0; j < n; j++) {
    assert.ok(g[j] > 0 && g[j] <= 1, `gain ${g[j]}`);
    assert.ok(Math.abs(L[j] * g[j]) <= CEILING + 1e-6 && Math.abs(R[j] * g[j]) <= CEILING + 1e-6, `sample ${j}`);
  }
  const quiet = Float32Array.from({ length: 1000 }, (_, j) => Math.sin(j) * 0.5);
  assert.ok(limitGain(quiet, quiet, sr).every(v => v === 1));
  // One spike: held down round it, the gain back to 1 well after (80 ms release).
  const one = new Float32Array(n);
  one[5000] = 3;
  const h = limitGain(one, one, sr);
  assert.ok(Math.abs(3 * h[5000] - CEILING) < 1e-6);
  assert.equal(h[0], 1);
  assert.equal(h[n - 1], 1);
  assert.equal(h[5000 + 64 * 20], 1, 'back up within ~160 ms');
  // Odd lengths, a lone sample, nothing.
  assert.equal(limitGain(new Float32Array(0), new Float32Array(0), sr).length, 0);
  assert.ok(Math.abs(limitGain(Float32Array.of(-2), Float32Array.of(0), sr)[0] * 2 - CEILING) < 1e-6);
  const odd = Float32Array.from({ length: 1001 }, (_, j) => (j === 1000 ? 5 : 0.1));
  assert.ok(Math.abs(odd[1000] * limitGain(odd, odd, sr)[1000]) <= CEILING + 1e-6);
});

test('the pump: a dip of the depth asked at each kick, back over half a beat, kicks off the ends ignored', () => {
  assert.ok(duck(100, [10], 40, 0).every(v => v === 1));
  const g = duck(200, [-5, 50, 190, 400], 40, 0.6);
  assert.ok(Math.abs(g[50] - 0.4) < 1e-6);
  assert.equal(g[50 + 20], 1, 'back by half a beat');
  assert.ok(g[55] > g[50] && g[60] > g[55]);
  assert.ok(g[0] < 1, 'a kick just before the start still dips its tail');
  assert.ok(Math.abs(g[190] - 0.4) < 1e-6);
  for (const v of g) assert.ok(v >= 0.4 - 1e-6 && v <= 1);
});

test('the echo and the room: comb, all-pass and room are the sums they say', () => {
  const imp = new Float32Array(20); imp[0] = 1;
  const c = comb(imp, 3, 0.5);
  assert.deepEqual([c[0], c[3], c[6], c[9], c[4]], [0, 1, 0.5, 0.25, 0]);
  const a = allpass(imp, 4, 0.5);
  assert.ok(Math.abs(a[0] + 0.5) < 1e-7 && Math.abs(a[4] - 0.75) < 1e-7 && Math.abs(a[8] - 0.375) < 1e-7);
  // room() in one pass equals the combs and all-passes one after another (at 44.1 kHz, no rounding of the delays).
  const sr = 44100, send = Float32Array.from({ length: 6000 }, (_, j) => (j < 300 ? Math.sin(j / 5) : 0));
  const r = room(send, sr);
  for (const [side, spread] of [['L', 0], ['R', 23]]) {
    const combs = [1116, 1188, 1277, 1356].map(d => comb(send, d + spread, 0.82));
    const sum = combs[0].map((_, j) => (combs[0][j] + combs[1][j] + combs[2][j] + combs[3][j]) * 0.25);
    const want = allpass(allpass(sum, 556 + spread, 0.5), 441 + spread, 0.5);
    assert.ok(maxDiff(r[side], want) < 1e-5, side);
  }
  assert.ok(peakOf(r.L) > 0.01, 'it rings');
  // One-pole: DC through the low-pass, none through the high-pass.
  const dc = new Float32Array(4000).fill(1);
  assert.ok(Math.abs(onePole(dc, 8000, 200)[3999] - 1) < 1e-6);
  assert.ok(Math.abs(onePole(dc, 8000, 200, 'hp')[3999]) < 1e-6);
});

test('a sweep changes only its stretch and the fades either side', () => {
  let s = 7;
  const x = Float32Array.from({ length: 10000 }, () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296) - 0.5);
  for (const [kind, a, b] of [['lp', 3000, 6000], ['hp', 0, 2000], ['hp', 9500, 12000], ['lp', 4000, 4000]]) {
    const y = x.slice();
    sweep(y, 8000, { kind, a, b, f0: 300, f1: 3000, edge: 256 });
    for (let j = 0; j < x.length; j++) if (j < a - 256 || j >= b + 256) assert.equal(y[j], x[j], `${kind} ${a}-${b} at ${j}`);
    if (b > a) assert.ok(maxDiff(y.subarray(a, b), x.subarray(a, b)) > 0.01, 'it filters');
    for (const v of y) assert.ok(Number.isFinite(v));
  }
  const y = x.slice();
  sweep(y, 8000, { a: 20000, b: 30000, f0: 300, f1: 3000 });   // past the end: nothing
  assert.deepEqual(y, x);
});

// A small song by hand: each bus a buzz of its own, bars of 4 beats of B samples.
const sr = 8000, B = 2000, BAR = 4 * B;
const PLAN = [['intro', 0, 2], ['verse', 2, 2], ['pre', 4, 1], ['hook', 5, 2], ['break', 7, 1], ['outro', 8, 2]];
const N = 10 * BAR + sr;
function buzz(bus, extra = () => 0) {
  return (name, L, R) => {
    if (!bus.includes(name)) return false;
    const f = 100 + 70 * BUSES.indexOf(name);
    for (let j = 0; j < 10 * BAR; j++) { const v = 0.1 * Math.sin((2 * Math.PI * f * j) / sr) + extra(name, j); L[j] += v; R[j] += v; }
    return true;
  };
}

test('stems sum to the mix (fx included), whatever the settings; the mix never past -1 dBFS', () => {
  const kicks = Array.from({ length: 40 }, (_, k) => k * B);
  for (const mix of [MIX, { fade: true }, { reverb: 0, delay: 0 }, { pump: 1, width: 1, keys: 6, drums: 6 }, { sweep: false, reverb: 1, delay: 1 }]) {
    const place = buzz(BUSES, (name, j) => (name === 'drums' && j % B === 0 ? 0.9 : 0));
    const out = mixdown(place, { sr, B, n: N, plan: PLAN, kicks, mix, stems: true });
    const want = mixOf(mix).reverb ? STEMS : BUSES;
    assert.deepEqual(Object.keys(out.stems).sort(), [...want].sort(), JSON.stringify(mix));
    const sum = sumStems(out.stems, N);
    assert.ok(maxDiff(sum.L, out.L) < 1e-5 && maxDiff(sum.R, out.R) < 1e-5, `stems sum to the mix: ${JSON.stringify(mix)}`);
    assert.ok(peakOf(out.L, out.R) <= CEILING + 1e-6, 'held under the ceiling');
    assert.ok(Number.isFinite(out.over));
    // The same without stems: the same mix.
    const plain = mixdown(buzz(BUSES, (name, j) => (name === 'drums' && j % B === 0 ? 0.9 : 0)), { sr, B, n: N, plan: PLAN, kicks, mix });
    assert.equal(plain.stems, null);
    assert.ok(maxDiff(plain.L, out.L) < 1e-6);
  }
});

test('nothing placed: silence, no NaN, over is -Infinity', () => {
  const out = mixdown(() => false, { sr, B, n: 5000, plan: PLAN, mix: MIX, stems: true });
  assert.ok(out.L.every(v => v === 0) && out.R.every(v => v === 0));
  assert.equal(out.over, -Infinity);
  assert.deepEqual(Object.keys(out.stems), ['fx']);
});

// The keys alone, a loud click in the verse setting the loudness, so two
// mixes that differ only in the swept stretches are otherwise sample for sample alike.
const keysOnly = (name, L, R) => {
  if (name !== 'keys') return false;
  for (let j = 0; j < 10 * BAR; j++) { const v = 0.1 * Math.sin((2 * Math.PI * 200 * j) / sr); L[j] += v; R[j] += v; }
  L[3 * BAR] += 1; R[3 * BAR] += 1;
  return true;
};
const dry = { reverb: 0, delay: 0, pump: 0 };

test('sweeps only where they belong: the intro, the pre-hook, the break; fade only the outro', () => {
  const on = mixdown(keysOnly, { sr, B, n: N, plan: PLAN, mix: { ...dry, sweep: true } });
  const off = mixdown(keysOnly, { sr, B, n: N, plan: PLAN, mix: { ...dry, sweep: false } });
  const edge = 512;
  const swept = PLAN.filter(([t]) => ['intro', 'pre', 'break'].includes(t)).map(([, b, n]) => [b * BAR - edge, (b + n) * BAR + edge]);
  const inSwept = j => swept.some(([a, b]) => j >= a && j < b);
  for (let j = 0; j < N; j++) if (!inSwept(j)) assert.equal(on.L[j], off.L[j], `unswept sample ${j}`);
  for (const [a, b] of swept) assert.ok(maxDiff(on.L.subarray(a + edge, b - edge), off.L.subarray(a + edge, b - edge)) > 0.01, `swept ${a}`);
  // No plan: no sweeps at all.
  const none = mixdown(keysOnly, { sr, B, n: N, plan: [], mix: { ...dry, sweep: true } });
  assert.deepEqual(none.L, off.L);
  // The fade: the same up to the outro, nothing after its last bar, and down through it.
  const faded = mixdown(keysOnly, { sr, B, n: N, plan: PLAN, mix: { ...dry, sweep: false, fade: true } });
  for (let j = 0; j < 8 * BAR; j++) assert.equal(faded.L[j], off.L[j]);
  for (let j = 10 * BAR; j < N; j++) assert.equal(faded.L[j], 0);
  assert.ok(peakOf(faded.L.subarray(9.5 * BAR, 10 * BAR)) < 0.2 * peakOf(off.L.subarray(9.5 * BAR, 10 * BAR)));
});

test('levels, the hats to one side, the pump and the echo do what they say', () => {
  // Two clicks far from the loudest moment (where the limiter acts): their ratio is the levels'.
  const clicks = (name, L, R) => {
    if (name !== 'drums' && name !== 'keys' && name !== 'hats') return false;
    const at = { drums: 1000, keys: 20000, hats: 40000 }[name];
    if (name === 'drums') { L[60000] = R[60000] = 2; }   // the loudest, far off
    L[at] += 0.5; R[at] += 0.5;
    return true;
  };
  const mix = { ...dry, drums: 0, keys: -6, hats: 0, width: 1 };
  const out = mixdown(clicks, { sr, B, n: 70000, mix, stems: true });
  assert.ok(Math.abs(out.L[20000] / out.L[1000] - dbGain(-6)) < 1e-5, 'keys 6 dB under the drums');
  assert.ok(Math.abs(out.L[40000] / out.R[40000] - 0.65) < 1e-5, 'the hats to the right');
  assert.equal(mixdown(clicks, { sr, B, n: 70000, mix: { ...mix, width: 0 } }).L[40000], out.R[40000]);
  // The pump: bass dips by its depth at a kick, keys by 0.6 of it, drums not at all.
  const steady = (name, L, R) => { L.fill(0.1); R.fill(0.1); return name !== 'hats'; };
  const p = mixdown(steady, { sr, B, n: 30000, kicks: [10000], mix: { ...dry, pump: 0.5 }, stems: true });
  // (Against the drums at the same moment: the limiter's gain is the same for both.)
  const ratio = s => (p.stems[s].L[10000] / p.stems.drums.L[10000]) / (p.stems[s].L[20000] / p.stems.drums.L[20000]);
  assert.ok(Math.abs(ratio('bass') - 0.5) < 1e-4 && Math.abs(ratio('keys') - 0.7) < 1e-4, `${ratio('bass')} ${ratio('keys')}`);
  assert.ok(Math.abs(p.stems.bass.L[20000] / p.stems.drums.L[20000] - dbGain(-1)) < 1e-5, 'bass at its level away from a kick');
  // The echo: the keys again a dotted eighth later on the left, an eighth on the right.
  const imp = (name, L, R) => { if (name !== 'keys') return false; L[1000] = R[1000] = 1; return true; };
  const e = mixdown(imp, { sr, B, n: 20000, mix: { ...dry, delay: 1 } });
  assert.ok(Math.abs(e.L[1000 + 1500]) > 0.01 && Math.abs(e.L[1000 + 1000]) < 1e-3, 'left: a dotted eighth');
  assert.ok(Math.abs(e.R[1000 + 1000]) > 0.01 && Math.abs(e.R[1000 + 1500]) < 1e-3, 'right: an eighth');
  const noEcho = mixdown(imp, { sr, B, n: 20000, mix: dry });
  assert.ok(peakOf(noEcho.L.subarray(1200)) < 1e-9);
});

test('every style, mixed: within the ceiling, its stems summing to it; the mixer off is the pieces as recorded', () => {
  for (const style of STYLES) {
    const { audio, info } = makeSong(pieces, rec.sr, 11, { analysis, style, minBars: 8, maxBars: 8, mix: MIX });
    assert.equal(info.style, style);
    assert.equal(info.mixed, true);
    assert.ok(audio.peak <= CEILING + 1e-6 && audio.peak > 0.5, `${style} peak ${audio.peak}`);
    assert.ok(audio.L.every(Number.isFinite) && audio.R.every(Number.isFinite), style);
  }
  const { audio, stems, info } = makeSong(pieces, rec.sr, 5, { analysis, minBars: 12, maxBars: 12, mix: { ...MIX, fade: true }, stems: true });
  assert.ok(info.mixed && info.over > 0, 'the demo goes past full scale before the limiter');
  for (const s of Object.values(stems)) assert.equal(s.L.length, audio.L.length);
  const sum = sumStems(stems, audio.L.length);
  assert.ok(maxDiff(sum.L, audio.L) < 1e-5 && maxDiff(sum.R, audio.R) < 1e-5);
  // Off: exactly the unmixed song (the old rule), and no fx stem.
  const off = makeSong(pieces, rec.sr, 5, { analysis, minBars: 12, maxBars: 12, mix: { ...MIX, on: false }, stems: true });
  const none = makeSong(pieces, rec.sr, 5, { analysis, minBars: 12, maxBars: 12 });
  assert.deepEqual(off.audio.L, none.audio.L);
  assert.equal(off.info.mixed, false);
  assert.equal(off.audio.over, null);
  assert.ok(!('fx' in off.stems));
  const s2 = sumStems(off.stems, off.audio.L.length);
  assert.ok(maxDiff(s2.L, off.audio.L) < 1e-5);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIX, BUSES, BUS_OF, STEMS, CEILING, LOUDNESS, mixOf, dbGain, mixdown, mixBuses, master, limitGain, duck, room, glue, widen, loudness, onePole, sweep } from '../public/lib/mix.mjs';
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

test('the room: silent until the pre-delay, then rings and dies away, the sides unlike, steady however long it runs', () => {
  const sr = 32000;
  const imp = new Float32Array(sr * 6); imp[0] = 1;
  const r = room(imp, sr);
  assert.equal(r.L.length, imp.length);
  const energy = (x, a, b) => { let e = 0; for (let j = Math.round(a * sr); j < Math.round(b * sr); j++) e += x[j] * x[j]; return e; };
  assert.equal(energy(r.L, 0, 0.019), 0, 'nothing before the 20 ms pre-delay');
  assert.ok(energy(r.L, 0.02, 0.3) > 0 && energy(r.R, 0.027, 0.3) > 0, 'it rings');
  assert.ok(energy(r.L, 0.5, 1) > 30 * energy(r.L, 3.5, 4), 'and dies away: well over 30× less 3 s on');
  assert.ok(energy(r.L, 0.5, 1) > 0 && energy(r.L, 3.5, 4) > 0, 'a tail, not a gate');
  let dot = 0, ll = 0, rr = 0;
  for (let j = 0; j < imp.length; j++) { dot += r.L[j] * r.R[j]; ll += r.L[j] ** 2; rr += r.R[j] ** 2; }
  assert.ok(Math.abs(dot / Math.sqrt(ll * rr)) < 0.3, 'the two sides are not alike');
  // Noise in for a minute: it neither grows without end nor goes quiet (a stable loop, the output a small share of the input).
  let x = 99;
  const rnd = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 4294967296) * 2 - 1;
  const noise = Float32Array.from({ length: sr * 20 }, rnd);
  const n = room(noise, sr);
  assert.ok(n.L.every(Number.isFinite));
  assert.ok(energy(n.L, 10, 20) < 3 * energy(n.L, 4, 14) && energy(n.L, 10, 20) > 0.3 * energy(n.L, 4, 14), 'level steady');
  assert.ok(peakOf(n.L, n.R) < 4, 'no blow-up');
  assert.ok(room(new Float32Array(5000), sr).L.every(v => v === 0), 'silence in, silence out');
  // One-pole: DC through the low-pass, none through the high-pass.
  const dc = new Float32Array(4000).fill(1);
  assert.ok(Math.abs(onePole(dc, 8000, 200)[3999] - 1) < 1e-6);
  assert.ok(Math.abs(onePole(dc, 8000, 200, 'hp')[3999]) < 1e-6);
});

test('the glue: loud stretches brought towards the quiet ones, the power kept, a steady tone and silence left as they were', () => {
  const sr = 8000, n = 16 * sr;
  // A tone that is 6× louder for a quarter of every second.
  const L = Float32Array.from({ length: n }, (_, j) => Math.sin(j * 0.3) * (j % 8000 < 2000 ? 0.6 : 0.1));
  const R = Float32Array.from(L);
  const rms = (x, a, b) => Math.sqrt(x.subarray(a, b).reduce((e, v) => e + v * v, 0) / (b - a));
  const ratio0 = rms(L, 24000, 25500) / rms(L, 26000, 27500);
  const pow = x => x.reduce((e, v) => e + v * v, 0);
  const e0 = pow(L);
  const back = glue(L, R, sr);
  const ratio1 = rms(L, 24000, 25500) / rms(L, 26000, 27500);
  assert.ok(ratio1 < ratio0 * 0.95, `the loud stretch is nearer the quiet one: ${ratio0.toFixed(2)} -> ${ratio1.toFixed(2)}`);
  assert.ok(back > 1, 'the bus is brought back up');
  assert.ok(Math.abs((pow(L) * back * back) / e0 - 1) < 1e-3, 'to the power it had');
  assert.deepEqual(L, R, 'both sides alike');
  const steady = Float32Array.from({ length: n }, (_, j) => 0.2 * Math.sin(j * 0.3));
  const s2 = Float32Array.from(steady);
  assert.ok(Math.abs(glue(s2, Float32Array.from(steady), sr) - 1) < 0.01);
  assert.ok(maxDiff(s2, steady) < 0.003);
  assert.equal(glue(new Float32Array(1000), new Float32Array(1000), sr), 1);
  assert.equal(glue(new Float32Array(0), new Float32Array(0), sr), 1);
});

test('width: the middle stays put (L + R unchanged), the sides unlike, the lows and the zero case untouched', () => {
  const sr = 32000, n = sr * 2;
  const tone = Float32Array.from({ length: n }, (_, j) => 0.3 * Math.sin(j * 0.07) + 0.2 * Math.sin(j * 0.9));
  const L = Float32Array.from(tone), R = Float32Array.from(tone);
  widen(L, R, sr, 0.5);
  for (let j = 0; j < n; j++) assert.ok(Math.abs(L[j] + R[j] - 2 * tone[j]) < 1e-5);
  let ll = 0, rr = 0, lr = 0;
  for (let j = 0; j < n; j++) { ll += L[j] ** 2; rr += R[j] ** 2; lr += L[j] * R[j]; }
  assert.ok(lr / Math.sqrt(ll * rr) < 0.9, 'a wide image');
  const A = Float32Array.from(tone), B = Float32Array.from(tone);
  widen(A, B, sr, 0);
  assert.deepEqual(A, tone);
  // 80 Hz and 3.2 kHz: the sides differ far less at 80 Hz (the width starts at 300 Hz).
  const side = hz => {
    const t = Float32Array.from({ length: n }, (_, j) => Math.sin((2 * Math.PI * hz * j) / sr));
    const a = Float32Array.from(t), b = Float32Array.from(t);
    widen(a, b, sr, 1);
    let e = 0;
    for (let j = 2000; j < n; j++) e += (a[j] - b[j]) ** 2;
    return e;
  };
  assert.ok(side(80) < 0.3 * side(3200), 'the lows stay in the middle');
});

test('loudness: the power after a 100 Hz high-pass, over the stretches that play only', () => {
  const sr = 8000, n = 20 * sr;
  const sine = (hz, a) => Float32Array.from({ length: n }, (_, j) => a * Math.sin((2 * Math.PI * hz * j) / sr));
  const L = sine(1000, 0.25);
  assert.ok(loudness(L, L, sr) > 0.88 * 0.25 ** 2 / 2 && loudness(L, L, sr) < 0.25 ** 2 / 2, 'a sine: A²/2, less what the high-pass takes');
  assert.ok(loudness(sine(30, 0.25), sine(30, 0.25), sr) < 0.2 * loudness(L, L, sr), 'the bottom octave hardly counts');
  // Half of it silent: the same loudness (the quiet stretch is gated out).
  const half = Float32Array.from(L, (v, j) => (j < n / 2 ? v : 0));
  assert.ok(Math.abs(loudness(half, half, sr) / loudness(L, L, sr) - 1) < 0.05);
  assert.equal(loudness(new Float32Array(0), new Float32Array(0), sr), 0);
});

test('the master: the loudness it is told, the stems summing to the mix, a quiet song not pushed past the ceiling', () => {
  const sr = 8000, n = 30 * sr;
  const song = a => ({ L: Float32Array.from({ length: n }, (_, j) => a * Math.sin(j * 0.2) * (j % 4000 < 200 ? 3 : 1)), R: Float32Array.from({ length: n }, (_, j) => a * Math.sin(j * 0.2 + 1) * (j % 4000 < 200 ? 3 : 1)) });
  for (const a of [0.002, 0.05, 0.4]) {
    const s = song(a);
    const stems = { x: { L: Float32Array.from(s.L, v => v * 0.6), R: Float32Array.from(s.R, v => v * 0.6) }, y: { L: Float32Array.from(s.L, v => v * 0.4), R: Float32Array.from(s.R, v => v * 0.4) } };
    const over = master({ ...s, stems }, sr);
    assert.ok(peakOf(s.L, s.R) <= CEILING + 1e-6, 'under the ceiling');
    const sum = sumStems(stems, n);
    assert.ok(maxDiff(sum.L, s.L) < 1e-5 && maxDiff(sum.R, s.R) < 1e-5, 'stems still sum');
    const db = 10 * Math.log10(loudness(s.L, s.R, sr));
    assert.ok(db < LOUDNESS + 0.8 && db > LOUDNESS - 4.5, `loudness ${db.toFixed(1)}`);
    assert.ok(over > -1 && over < 6.5, `over ${over}`);
  }
  assert.equal(master({ L: new Float32Array(10), R: new Float32Array(10) }, sr), -Infinity);
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

// The keys alone, a steady tone: two mixes that differ only in the swept stretches are otherwise sample for sample alike
// (before the master, whose loudness follows what is in the song).
const keysOnly = (name, L, R) => {
  if (name !== 'keys') return false;
  for (let j = 0; j < 10 * BAR; j++) { const v = 0.1 * Math.sin((2 * Math.PI * 1000 * j) / sr); L[j] += v; R[j] += v; }
  return true;
};
const dry = { reverb: 0, delay: 0, pump: 0 };

test('sweeps only where they belong: the intro, the pre-hook, the break; fade only the outro', () => {
  const still = { ...dry, width: 0 };
  const on = mixBuses(keysOnly, { sr, B, n: N, plan: PLAN, mix: { ...still, sweep: true } });
  const off = mixBuses(keysOnly, { sr, B, n: N, plan: PLAN, mix: { ...still, sweep: false } });
  const edge = 512;
  const swept = PLAN.filter(([t]) => ['intro', 'pre', 'break'].includes(t)).map(([, b, n]) => [b * BAR - edge, (b + n) * BAR + edge + 8]);   // (the keys' top shelf rings a few samples)
  const inSwept = j => swept.some(([a, b]) => j >= a && j < b);
  // (The keys' low cut remembers a little of a swept stretch after it: a few thousandths of a dB, no more.)
  for (let j = 0; j < N; j++) if (!inSwept(j)) assert.ok(Math.abs(on.L[j] - off.L[j]) < 1e-4, `unswept sample ${j}`);
  for (const [a, b] of swept) assert.ok(maxDiff(on.L.subarray(a + edge, b - edge), off.L.subarray(a + edge, b - edge)) > 0.01, `swept ${a}`);
  // No plan: no sweeps at all.
  const none = mixBuses(keysOnly, { sr, B, n: N, plan: [], mix: { ...still, sweep: true } });
  assert.deepEqual(none.L, off.L);
  // The fade: the same up to the outro, nothing after its last bar, and down through it.
  const faded = mixBuses(keysOnly, { sr, B, n: N, plan: PLAN, mix: { ...still, sweep: false, fade: true } });
  for (let j = 0; j < 8 * BAR; j++) assert.equal(faded.L[j], off.L[j]);
  for (let j = 10 * BAR; j < N; j++) assert.equal(faded.L[j], 0);
  assert.ok(peakOf(faded.L.subarray(9.5 * BAR, 10 * BAR)) < 0.2 * peakOf(off.L.subarray(9.5 * BAR, 10 * BAR)));
});

test('levels, the hats to one side, the pump, the echo, the width and the room do what they say', () => {
  const rms = (x, a, b) => Math.sqrt(x.subarray(a, b).reduce((e, v) => e + v * v, 0) / (b - a));
  // A level in dB is a level: a tone on the keys and on the hats, each bus 6 dB down against itself at 0 (the keys' tone is theirs either way).
  const tone = (name, L, R) => {
    if (name !== 'keys' && name !== 'hats') return false;
    for (let j = 0; j < 30000; j++) { const v = 0.2 * Math.sin((2 * Math.PI * 150 * j) / sr); L[j] += v; R[j] += v; }
    return true;
  };
  const lv = mixBuses(tone, { sr, B, n: 30000, mix: { ...dry, keys: -6, hats: -6, width: 0 }, stems: true });
  const lv0 = mixBuses(tone, { sr, B, n: 30000, mix: { ...dry, keys: 0, hats: 0, width: 0 }, stems: true });
  for (const bus of ['keys', 'hats']) {
    const dB = 20 * Math.log10(rms(lv.stems[bus].L, 5000, 25000) / rms(lv0.stems[bus].L, 5000, 25000));
    assert.ok(Math.abs(dB + 6) < 0.05, `${bus} 6 dB down: ${dB.toFixed(2)}`);
  }
  // The hats to the right (wide), in the middle (narrow).
  const click = (name, L, R) => { if (name !== 'hats') return false; L[1000] = R[1000] = 0.5; return true; };
  const wide = mixBuses(click, { sr, B, n: 3000, mix: { ...dry, width: 1 } });
  assert.ok(Math.abs(wide.L[1000] / wide.R[1000] - 0.65) < 1e-5, 'the hats to the right');
  assert.equal(mixBuses(click, { sr, B, n: 3000, mix: { ...dry, width: 0 } }).L[1000], wide.R[1000]);
  // The pump: the keys dip by 0.6 of the depth at a kick, the bass by all of it, the drums not at all (a tone the glue and tone leave alone).
  const hum150 = (name, L, R) => { for (let j = 0; j < 30000; j++) { const v = 0.1 * Math.sin((2 * Math.PI * 150 * j) / sr); L[j] += v; R[j] += v; } return name !== 'hats'; };
  const p = mixBuses(hum150, { sr, B, n: 30000, kicks: [10000], mix: { ...dry, pump: 0.5, width: 0 }, stems: true });
  const dip = s => rms(p.stems[s].L, 10000, 10200) / rms(p.stems[s].L, 20000, 20200);
  assert.ok(dip('keys') < 0.8 && dip('keys') > 0.6, `keys ${dip('keys').toFixed(2)}`);
  assert.ok(dip('bass') < dip('keys') - 0.1, `bass ${dip('bass').toFixed(2)} dips more`);
  assert.ok(Math.abs(dip('drums') - 1) < 0.1, `drums ${dip('drums').toFixed(2)} not at all`);
  // The echo: the keys again a dotted eighth later on the left, an eighth on the right.
  const imp = (name, L, R) => { if (name !== 'keys') return false; L[1000] = R[1000] = 1; return true; };
  const e = mixBuses(imp, { sr, B, n: 20000, mix: { ...dry, delay: 1 } });
  assert.ok(Math.abs(e.L[1000 + 1500]) > 0.01 && Math.abs(e.L[1000 + 1000]) < 1e-3, 'left: a dotted eighth');
  assert.ok(Math.abs(e.R[1000 + 1000]) > 0.01 && Math.abs(e.R[1000 + 1500]) < 1e-3, 'right: an eighth');
  const noEcho = mixBuses(imp, { sr, B, n: 20000, mix: dry });
  assert.ok(peakOf(noEcho.L.subarray(1300)) < 1e-9 + 0, 'no echo, no tail');
  // The width: the keys' sides differ, their sum is the middle; at width 0 they are one.
  const hum = (name, L, R) => { if (name !== 'keys') return false; for (let j = 0; j < 20000; j++) L[j] = R[j] = 0.2 * Math.sin(j * 0.5) + 0.1 * Math.sin(j * 1.9); return true; };
  const w1 = mixBuses(hum, { sr, B, n: 20000, mix: { ...dry, width: 1 } });
  const w0 = mixBuses(hum, { sr, B, n: 20000, mix: { ...dry, width: 0 } });
  assert.ok(maxDiff(w0.L, w0.R) < 1e-7, 'narrow: mono');
  assert.ok(maxDiff(w1.L, w1.R) > 0.05, 'wide: apart');
  for (let j = 0; j < 20000; j++) assert.ok(Math.abs(w1.L[j] + w1.R[j] - (w0.L[j] + w0.R[j])) < 1e-5, 'the sum is the same');
  // The room: the snare-ish top and the hats are sent to it, the kick's thump and the bass are not.
  const sendOf = bus => {
    const place = (name, L, R) => { if (name !== bus) return false; for (let j = 0; j < 1600; j++) { const v = Math.sin((2 * Math.PI * (bus === 'drums' ? 60 : bus === 'bass' ? 60 : 3000) * j) / sr) * 0.5; L[j] += v; R[j] += v; } return true; };
    return mixBuses(place, { sr, B, n: 20000, mix: { ...dry, reverb: 1 }, stems: true }).stems.fx;
  };
  assert.ok(peakOf(sendOf('hats').L) > 0.005 && peakOf(sendOf('keys').L) > 0.005, 'hats and keys reach the room');
  assert.ok(peakOf(sendOf('bass').L) < 1e-6, 'the bass does not');
  assert.ok(peakOf(sendOf('drums').L) < 0.3 * peakOf(sendOf('keys').L), 'nor does a kick');
});

test('every style, mixed: within the ceiling, its stems summing to it; the mixer off is the pieces as recorded', () => {
  for (const style of STYLES) {
    const { audio, info } = makeSong(pieces, rec.sr, 11, { analysis, style, minBars: 8, maxBars: 8, mix: MIX });
    assert.equal(info.style, style);
    assert.equal(info.mixed, true);
    assert.ok(audio.peak <= CEILING + 1e-6 && audio.peak > 0.5, `${style} peak ${audio.peak}`);
    assert.ok(audio.L.every(Number.isFinite) && audio.R.every(Number.isFinite), style);
  }
  const { audio, stems, info } = makeSong(pieces, rec.sr, 5, { analysis, minBars: 8, maxBars: 8, mix: { ...MIX, fade: true }, stems: true });
  assert.ok(info.mixed && info.over > 0, 'the demo goes past full scale before the limiter');
  for (const s of Object.values(stems)) assert.equal(s.L.length, audio.L.length);
  const sum = sumStems(stems, audio.L.length);
  assert.ok(maxDiff(sum.L, audio.L) < 1e-5 && maxDiff(sum.R, audio.R) < 1e-5);
  // Off: exactly the unmixed song (the old rule), and no fx stem.
  const off = makeSong(pieces, rec.sr, 5, { analysis, minBars: 8, maxBars: 8, mix: { ...MIX, on: false }, stems: true });
  const none = makeSong(pieces, rec.sr, 5, { analysis, minBars: 8, maxBars: 8 });
  assert.deepEqual(off.audio.L, none.audio.L);
  assert.equal(off.info.mixed, false);
  assert.equal(off.audio.over, null);
  assert.ok(!('fx' in off.stems));
  const s2 = sumStems(off.stems, off.audio.L.length);
  assert.ok(maxDiff(s2.L, off.audio.L) < 1e-5);
});

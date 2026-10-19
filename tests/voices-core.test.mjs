// The core voices (the ones every song plays) as instruments: bright enough, band-limited, struck harder = brighter,
// two takes of one note that are not the same, and a clip that never plays one note twice bit for bit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voice, renderClip, emptyNotes, emptyDrums } from '../public/lib/synth.mjs';

const SR = 32000, N = 16384;
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]], [im[i], im[j]] = [im[j], im[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k), wi = Math.sin(a * k), u = i + k, v = u + len / 2;
        const xr = re[v] * wr - im[v] * wi, xi = re[v] * wi + im[v] * wr;
        re[v] = re[u] - xr; im[v] = im[u] - xi; re[u] += xr; im[u] += xi;
      }
  }
}
// The power spectrum of x from `from` seconds (windowed, or the first N samples as they are).
function power(x, from = 0, window = true) {
  const re = new Float64Array(N), im = new Float64Array(N), off = Math.round(from * SR);
  for (let i = 0; i < N && off + i < x.length; i++) re[i] = x[off + i] * (window ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N) : 1);
  fft(re, im);
  return Array.from({ length: N / 2 }, (_, k) => re[k] ** 2 + im[k] ** 2);
}
const bin = SR / N;
const band = (p, a, b) => { let e = 0; for (let k = Math.ceil(a / bin); k < Math.min(p.length, b / bin); k++) e += p[k]; return e; };
const total = p => band(p, 20, SR / 2);
const bandwidth99 = p => { let cum = 0; const t = total(p); for (let k = 1; k < p.length; k++) { cum += p[k]; if (cum > 0.99 * t) return k * bin; } return SR / 2; };
const hz = m => 440 * 2 ** ((m - 69) / 12);
const db = v => 10 * Math.log10(Math.max(v, 1e-12));
const rms = x => Math.sqrt(x.reduce((e, v) => e + v * v, 0) / x.length);

test('keys, piano, rhodes and pad are bright: 99% of the power reaches past 2.5 kHz at middle C', () => {
  for (const inst of ['keys', 'piano', 'rhodes', 'pad']) {
    const bw = bandwidth99(power(voice(inst, 60, SR, 1), 0.05));
    assert.ok(bw > 2500, `${inst} ${Math.round(bw)} Hz`);
  }
});

test('the lead is band-limited: almost no power off its harmonics, at C5 and C6', () => {
  for (const m of [72, 84]) {
    const p = power(voice('lead', m, SR, 1), 0.05), f0 = hz(m);
    let off = 0;
    for (let k = 1; k < p.length; k++) { const r = (k * bin) / f0; if (Math.abs(r - Math.round(r)) * f0 >= 3 * bin + 2) off += p[k]; }
    assert.ok(db(off / total(p)) < -30, `lead ${m}: ${db(off / total(p)).toFixed(1)} dB off the harmonics`);
  }
});

test('hats and cymbals are not a sizzle: under 40% of the power over 10 kHz, some in the presence band', () => {
  for (const d of ['hat', 'open', 'crash', 'ride', 'shaker']) {
    const p = power(voice(d, 36, SR), 0, false);
    const over10 = band(p, 10000, 16000) / total(p), pres = band(p, 2000, 6000) / total(p);
    assert.ok(over10 < 0.4, `${d} ${(over10 * 100).toFixed(0)}% over 10 kHz`);
    assert.ok(db(pres) > -14, `${d} presence ${db(pres).toFixed(1)} dB`);
  }
});

test('the kick has a beater click a phone can play (2-5 kHz), and the bass and sub carry harmonics above their fundamental', () => {
  const k = power(voice('kick', 36, SR), 0, false);
  assert.ok(db(band(k, 2000, 5000) / total(k)) > -40, `click ${db(band(k, 2000, 5000) / total(k)).toFixed(1)} dB`);
  for (const [inst, midi] of [['bass', 36], ['subbass', 28]]) {
    const p = power(voice(inst, midi, SR, 1), 0.05), f0 = hz(midi);
    const up = band(p, 2.5 * f0, 8 * f0) / band(p, 0.5 * f0, 1.5 * f0);
    assert.ok(db(up) > -22, `${inst}: harmonics ${db(up).toFixed(1)} dB under the fundamental`);
  }
});

test('struck harder, brighter (the level is the clip\'s gain, not the voice\'s)', () => {
  const centroid = x => { const p = power(x, 0.02); let s = 0, t = 0; for (let k = 1; k < p.length; k++) { s += p[k] * k * bin; t += p[k]; } return s / t; };
  for (const inst of ['keys', 'rhodes', 'piano', 'pluck', 'strings', 'lead', 'hat']) {
    const soft = voice(inst, 60, SR, 0.5, 0.2), hard = voice(inst, 60, SR, 0.5, 1);
    assert.ok(centroid(hard) > centroid(soft) * 1.03, `${inst}: ${Math.round(centroid(soft))} -> ${Math.round(centroid(hard))} Hz`);
    assert.ok(Math.abs(db(rms(hard) ** 2 / rms(soft) ** 2)) < 6, `${inst} stays about as loud`);
  }
});

test('two takes of a note differ (a little), and each take is the same every time', () => {
  for (const inst of ['keys', 'piano', 'pad', 'pluck', 'bass', 'hat', 'kick', 'snare', 'guitar']) {
    const a = voice(inst, 60, SR, 0.4, 0.7, 0), b = voice(inst, 60, SR, 0.4, 0.7, 1);
    assert.equal(a.length, b.length);
    let d = 0;
    for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
    assert.ok(d > 0.003, `${inst} takes differ (${d})`);
    assert.deepEqual(voice(inst, 60, SR, 0.4, 0.7, 1), b, `${inst} the same take twice`);
    assert.ok(Math.abs(rms(a) / rms(b) - 1) < 0.15, `${inst} the takes are about as loud`);
  }
});

test('a clip plays a repeated note as the two takes in turn: no two hits of one note bit for bit alike', () => {
  const c = emptyNotes('keys', 1, { tonic: 0, minor: false });
  for (const s of [0, 4, 8, 12]) c.notes.push({ step: s, midi: 60, len: 2 });
  const r = renderClip(c, SR, 120);
  const beat = Math.round(SR * 0.5);
  const hit = k => r.L.subarray(k * beat, k * beat + 6000);
  const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  assert.ok(!same(hit(0), hit(1)) && !same(hit(1), hit(2)) && same(hit(0), hit(2)) === false, 'every repeat differs from the last');
  const h = emptyDrums(1);
  for (const s of [0, 2, 4, 6]) h.steps.hat[s] = 1;
  const d = renderClip(h, SR, 120);
  const eighth = Math.round(SR * 0.25);
  assert.ok(!same(d.L.subarray(0, 1500), d.L.subarray(eighth, eighth + 1500)), 'the hats differ too');
});

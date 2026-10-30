import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { playSample, sampleNotes, sampleUrl, BETTER } from '../public/lib/samples.mjs';

// A 3.2 s "recording": a 220 Hz tone that swells in over 0.3 s, then holds.
const SR = 32000;
const rec = () => Float32Array.from({ length: 3.2 * SR }, (_, i) => Math.sin((2 * Math.PI * 220 * i) / SR) * Math.min(1, i / (0.3 * SR)) * 0.5);
const rmsDb = (y, a, z) => {
  let e = 0;
  for (let i = Math.round(a * SR); i < Math.round(z * SR); i++) e += y[i] * y[i];
  return 10 * Math.log10(e / ((z - a) * SR));
};

test('a held note longer than its recording holds to its end (strings, organ, voices): no stop mid-chord', () => {
  const y = playSample({ inst: 'strings', sr: SR, notes: [{ midi: 57, x: rec() }] }, 57, SR, 6, 1, 0, 0.3);
  assert.ok(y.length >= 6.2 * SR, `${(y.length / SR).toFixed(2)} s`);
  for (const t of [1, 3, 4, 5.5]) assert.ok(Math.abs(rmsDb(y, t, t + 0.4) - rmsDb(y, 1, 1.4)) < 1.5, `level at ${t} s`);
  let step = 0;
  for (let i = 1; i < y.length; i++) step = Math.max(step, Math.abs(y[i] - y[i - 1]));
  assert.ok(step < 0.05, `no click: ${step}`);
  // (A struck one rings as recorded, a short held one is not looped.)
  assert.ok(playSample({ inst: 'piano', sr: SR, notes: [{ midi: 57, x: rec() }] }, 57, SR, 6, 1, 0, 0.3).length <= 3.2 * SR);
  assert.ok(playSample({ inst: 'strings', sr: SR, notes: [{ midi: 57, x: rec() }] }, 57, SR, 1, 1, 0, 0.3).length <= 1.31 * SR);
});

test('the better strings and piano are there, at a new address (the service worker keeps an old one forever)', () => {
  for (const inst of BETTER) {
    assert.match(sampleUrl('', inst, 60), /^samples\/v2\//);
    for (const m of sampleNotes(inst)) assert.ok(existsSync(new URL(`../public/${sampleUrl('', inst, m)}`, import.meta.url)), `${inst} ${m}`);
  }
  assert.match(sampleUrl('', 'rhodes', 60), /^samples\/mk\//);
});

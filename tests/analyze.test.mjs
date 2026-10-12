// The analysis on made-up sample packs (tests/kits.mjs): many kinds of sound
// in every role, at many tempos, recorded many ways. These seeds were never
// used to tune it (1-60 and 1001-1100 were).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPieces, analyzeRecording } from '../public/engine.mjs';
import { makeKit } from './kits.mjs';

const kits = Array.from({ length: 24 }, (_, k) => makeKit(3001 + k)).map(kit => ({ ...kit, a: analyzeRecording(splitPieces(kit.rec), kit.rec.sr) }));

test('every pack splits into its pieces', () => {
  for (const k of kits) assert.equal(k.a.roles.length, k.roles.length);
});

test('the tempo is heard exactly (or, rarely, as half, double, 2/3 or 3/2)', () => {
  const exact = kits.filter(k => k.a.bpm === k.bpm).length;
  for (const k of kits) assert.ok([1, 2, 0.5, 1.5, 2 / 3].some(x => Math.abs(k.a.bpm - k.bpm * x) < 0.6), `${k.bpm} heard as ${k.a.bpm}`);
  assert.ok(exact >= 22, `${exact} of ${kits.length} exact`);
});

test('roles are heard right for at least 95% of pieces, and drums nearly always', () => {
  let right = 0, all = 0, drums = 0, drumsRight = 0;
  const wrong = [];
  for (const k of kits) {
    const a = analyzeRecording(splitPieces(k.rec), k.rec.sr, { bpm: k.bpm });   // at the right tempo
    k.roles.forEach((want, i) => {
      all++; if (a.roles[i] === want) right++; else wrong.push(`${want}->${a.roles[i]}`);
      if (['kick', 'sub', 'snare', 'hat', 'tick', 'roll'].includes(want)) { drums++; if (a.roles[i] === want) drumsRight++; }
    });
  }
  assert.ok(right / all >= 0.95, `${right} of ${all}: ${wrong.join(' ')}`);
  assert.ok(drumsRight / drums >= 0.97, `drums ${drumsRight} of ${drums}: ${wrong.join(' ')}`);
});

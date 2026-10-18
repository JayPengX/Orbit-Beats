// The analysis on made-up sample packs (tests/kits.mjs): many kinds of sound
// in every role, at many tempos, recorded many ways. These seeds were never
// used to tune it (1-60 and 1001-1100 were). The packs are made and analysed
// in worker threads, a few at once (tests/analyze-kit.mjs), once each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

const seeds = Array.from({ length: 24 }, (_, k) => 3001 + k);
const nw = Math.max(1, Math.min(seeds.length, availableParallelism()));
const kits = (await Promise.all(Array.from({ length: nw }, (_, w) => new Promise((done, fail) => {
  const mine = seeds.filter((_, i) => i % nw === w), got = [];
  new Worker(new URL('./analyze-kit.mjs', import.meta.url), { workerData: mine })
    .on('message', r => got.push(r)).on('error', fail)
    .on('exit', c => c ? fail(new Error(`worker exit ${c}`)) : done(got));
})))).flat();

test('every pack splits into its pieces', () => {
  assert.equal(kits.length, seeds.length);
  for (const k of kits) assert.equal(k.heard.roles.length, k.roles.length);
});

test('the tempo is heard exactly (or, rarely, as half, double, 2/3 or 3/2)', () => {
  const exact = kits.filter(k => k.heard.bpm === k.bpm).length;
  for (const k of kits) assert.ok([1, 2, 0.5, 1.5, 2 / 3].some(x => Math.abs(k.heard.bpm - k.bpm * x) < 0.6), `${k.bpm} heard as ${k.heard.bpm}`);
  assert.ok(exact >= 22, `${exact} of ${kits.length} exact`);
});

test('roles are heard right for at least 95% of pieces, and drums nearly always', () => {
  let right = 0, all = 0, drums = 0, drumsRight = 0;
  const wrong = [];
  for (const k of kits) {
    const roles = k.atTempo;   // at the right tempo
    k.roles.forEach((want, i) => {
      all++; if (roles[i] === want) right++; else wrong.push(`${want}->${roles[i]}`);
      if (['kick', 'sub', 'snare', 'hat', 'tick', 'roll'].includes(want)) { drums++; if (roles[i] === want) drumsRight++; }
    });
  }
  assert.ok(right / all >= 0.95, `${right} of ${all}: ${wrong.join(' ')}`);
  assert.ok(drumsRight / drums >= 0.97, `drums ${drumsRight} of ${drums}: ${wrong.join(' ')}`);
});

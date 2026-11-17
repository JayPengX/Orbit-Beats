import test from 'node:test';
import assert from 'node:assert/strict';
import { clock, clampLength, barsFor, kitLength, LENGTH_PRESETS, LENGTH_MIN, LENGTH_MAX, speedKey } from '../public/lib/length.mjs';
import { radioPlan, radioSong } from '../public/lib/radio.mjs';
import { makeRng, planOf, planSong } from '../public/engine.mjs';

test('lengths read as minutes and seconds, clamped to 0:30 to 8:00', () => {
  assert.equal(clock(30), '0:30');
  assert.equal(clock(125), '2:05');
  // The player's fractional time: never a minute short at the turn (59.5 read 0:00).
  assert.deepEqual([58.9, 59.5, 59.8, 119.6, 179.7].map(clock), ['0:59', '1:00', '1:00', '2:00', '3:00']);
  assert.deepEqual(LENGTH_PRESETS.map(clock), ['0:30', '1:00', '2:00', '3:00', '4:00', '6:00']);
  assert.equal(clampLength(5), LENGTH_MIN);
  assert.equal(clampLength(9999), LENGTH_MAX);
  assert.equal(clampLength(64), 60);
  assert.equal(clampLength('x'), 60);
  assert.equal(speedKey(80), 'slow');
  assert.equal(speedKey(110), 'mid');
  assert.equal(speedKey(140), 'fast');
});

test('bars come from the tempo, and long songs become a plan', () => {
  assert.equal(barsFor(60, 120), 30);
  assert.deepEqual(kitLength(60, 120), { minBars: 28, maxBars: 30, plan: null });
  assert.equal(kitLength(480, 120).plan, true);
  assert.ok(kitLength(30, 70).maxBars >= 8);
  for (let b = 8; b <= 64; b += 2) assert.ok(planSong(makeRng(b), b - 2 < 8 ? 8 : b - 2, b).length >= 3, `a form fits ${b} bars`);
});

test('every length from 0:30 to 8:00 plans to about that many bars, in sections the engine takes', () => {
  for (const bpm of [70, 100, 140, 176]) for (const secs of [30, 60, 120, 240, 360, 480]) {
    const plan = radioPlan(makeRng(secs + bpm), bpm, secs, true);
    const bars = plan.reduce((a, [, n]) => a + n, 0);
    const want = barsFor(secs, bpm);
    assert.ok(Math.abs(bars - want) <= 8, `${bpm} BPM ${secs}s: ${bars} bars for ${want}`);
    assert.doesNotThrow(() => planOf(plan));
    assert.equal(plan[0][0], 'intro');
    assert.equal(plan.at(-1)[0], 'outro');
  }
  // (The radio's own, no length asked: 24 to 96 bars.)
  const own = radioPlan(makeRng(3), 100, 90);
  const n = own.reduce((a, [, x]) => a + x, 0);
  assert.ok(n >= 24 && n <= 96);
});

test('a song made for a length is about that long', () => {
  const short = radioSong({ seed: 7, mood: 'all', style: 'lofi', seconds: 30 });
  const longer = radioSong({ seed: 7, mood: 'all', style: 'lofi', seconds: 120 });
  assert.ok(short.info.seconds >= 25 && short.info.seconds < 45, `${short.info.seconds}`);
  assert.ok(Math.abs(longer.info.seconds - 120) < 25, `${longer.info.seconds}`);
});

test('a batch song at a long length: the same 種子, the same sections (they were drawn at random each time)', async () => {
  const { askedPlan } = await import('../public/lib/radio.mjs');
  assert.ok(kitLength(180, 120).plan);
  assert.deepEqual(askedPlan(868613560, 120, 180), askedPlan(868613560, 120, 180));
  const seeds = [1, 2, 3, 4, 5, 6].map(s => JSON.stringify(askedPlan(s, 120, 180)));
  assert.ok(new Set(seeds).size > 1);
});

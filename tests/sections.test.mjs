// The section strip's clock: where each section starts and which one is playing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionTimes, sectionIndex, barSeconds, labelFits } from '../public/lib/sections.mjs';

const plan = [['intro', 4], ['verse', 8], ['hook', 8], ['outro', 4]];

test('a bar at 120 bpm is 2 s; sections add up end to end', () => {
  assert.equal(barSeconds(120), 2);
  const t = sectionTimes(plan, 120);
  assert.deepEqual(t.map(s => [s.type, s.from, s.to]), [['intro', 0, 8], ['verse', 8, 24], ['hook', 24, 40], ['outro', 40, 48]]);
  assert.deepEqual(t.map(s => s.bar), [0, 4, 12, 20]);
});

test('the playing section: starts are inclusive, the end holds the last, none is -1', () => {
  const t = sectionTimes(plan, 120);
  assert.equal(sectionIndex(t, 0), 0);
  assert.equal(sectionIndex(t, 7.99), 0);
  assert.equal(sectionIndex(t, 8), 1);
  assert.equal(sectionIndex(t, 39.9), 2);
  assert.equal(sectionIndex(t, 999), 3);
  assert.equal(sectionIndex([], 5), -1);
});

test('a label shows only when it fits its slice', () => {
  assert.equal(labelFits(8, 24, 290, 2), true);
  assert.equal(labelFits(1, 24, 290, 2), false);
  assert.equal(labelFits(0, 0, 290, 2), false);
});

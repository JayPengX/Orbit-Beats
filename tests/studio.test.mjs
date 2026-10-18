// The 樂器 tab's patterns, chain and hit levels (lib/studio.mjs, lib/synth.mjs, lib/midi.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stateOf, bankOf, chainOf, dropPattern, nextHit } from '../public/lib/studio.mjs';
import { emptyDrums, emptyNotes, clipOf, stepHits, chainClips, renderClip, levelGain, STEPS } from '../public/lib/synth.mjs';
import { clipTracks, midiFile, readMidi } from '../public/lib/midi.mjs';

const drums = (hits, bars = 1) => {
  const c = emptyDrums(bars);
  for (const [d, s, v = 1] of hits) c.steps[d][s] = v;
  return c;
};

test('a studio kept before the patterns opens as pattern A, its chain A', () => {
  const old = { mode: 'drums', bars: 2, drums: drums([['kick', 0, 2]], 1), notes: { ...emptyNotes('bass', 2), notes: [{ step: 4, midi: 45, len: 2 }] } };
  const s = stateOf(old);
  assert.equal(s.drums.pats.length, 1);
  assert.deepEqual(s.drums.chain, [0]);
  assert.equal(s.drums.at, 0);
  assert.equal(s.drums.pats[0].bars, 2, 'resized to the kept length');
  assert.equal(s.drums.pats[0].steps.kick[16], 2, 'the accent repeated into bar 2');
  assert.equal(s.notes.pats[0].notes.length, 1);
  assert.equal(s.loop, 'pat');
  assert.equal(stateOf({ drums: null, notes: emptyNotes() }), null, 'a broken copy is a failure');
});

test('a pattern set is made whole: four at most, one kind and sound, the chain within it', () => {
  const a = { ...drums([['kick', 0]]), swing: 0.2, pitch: 30 };
  const b = { ...drums([['snare', 4]]), swing: 0.5 };
  const b2 = bankOf({ pats: [a, b, emptyNotes(), a, b, a], at: 9, chain: [0, 1, 7, 'x', 3, 1, 0, 0, 1, 1, 1] }, 'drums', 1);
  assert.equal(b2.pats.length, 4, 'the notes clip left out, four kept');
  assert.equal(b2.at, 0);
  assert.deepEqual(b2.chain, [0, 1, 3, 1, 0, 0, 1, 1], 'unknown patterns out, eight at most');
  assert.ok(b2.pats.every(c => c.swing === 0.2 && c.pitch === 30), 'swing and 808 the first’s');
  assert.deepEqual(bankOf({ pats: [a], chain: [0, 0, 0] }, 'drums', 1).chain, [0], 'one pattern: no chain');
  assert.equal(bankOf({ pats: [] }, 'drums', 1), null);
});

test('a chain plays its patterns in order as one clip (A A B A)', () => {
  const a = drums([['kick', 0]]);
  const b = drums([['snare', 4, 3]]);
  const c = chainOf({ pats: [a, b], at: 0, chain: [0, 0, 1, 0] });
  assert.equal(c.bars, 4);
  assert.equal(c.steps.kick.length, 4 * STEPS);
  assert.deepEqual([0, 16, 32, 48].map(s => c.steps.kick[s]), [1, 1, 0, 1]);
  assert.equal(c.steps.snare[32 + 4], 3, 'the soft snare kept in B’s place');
  const n1 = { ...emptyNotes('keys', 1), notes: [{ step: 0, midi: 60, len: 2 }] };
  const n2 = { ...emptyNotes('keys', 1), notes: [{ step: 2, midi: 62, len: 2, lv: 2 }] };
  const notes = chainClips([n2, n1, n2]);
  assert.deepEqual(notes.notes.map(n => [n.step, n.midi]), [[2, 62], [16, 60], [34, 62]]);
  assert.equal(notes.notes[2].lv, 2);
  const out = renderClip(c, 8000, 120);
  assert.equal(out.L.length, 4 * 4 * 0.5 * 8000, 'rendered four bars long');
});

test('a pattern deleted leaves the chain without it', () => {
  const p = () => drums([]);
  const b = dropPattern({ pats: [p(), p(), p()], at: 2, chain: [0, 1, 2, 1] }, 1);
  assert.equal(b.pats.length, 2);
  assert.equal(b.at, 1);
  assert.deepEqual(b.chain, [0, 1]);
  assert.deepEqual(dropPattern({ pats: [p(), p()], at: 0, chain: [1, 1] }, 1).chain, [0]);
});

test('a hit’s level: soft, normal and accent heard, kept and written as MIDI velocity', () => {
  assert.ok(levelGain(3) < levelGain(1) && levelGain(1) < levelGain(2));
  assert.equal(nextHit(3), 0, 'a soft hit tapped comes off');
  const c = clipOf(drums([['kick', 0, 3], ['kick', 4, 1], ['kick', 8, 2], ['snare', 12, 7]]));
  assert.deepEqual([0, 4, 8].map(s => c.steps.kick[s]), [3, 1, 2]);
  assert.equal(c.steps.snare[12], 1, 'an unknown level is a plain hit');
  const gains = [0, 4, 8].map(s => stepHits(c, s)[0].gain);
  assert.ok(gains[0] < gains[1] && gains[1] < gains[2]);
  const vel = readMidi(midiFile({ bpm: 120, tracks: clipTracks(c, 'x') })).tracks[0].notes.map(n => n.vel);
  assert.ok(vel[0] < vel[1] && vel[1] < vel[2], `velocities ${vel}`);
  const n = clipOf({ ...emptyNotes('keys', 1), notes: [{ step: 0, midi: 60, len: 2, lv: 3 }, { step: 4, midi: 60, len: 2 }, { step: 8, midi: 60, len: 2, lv: 9 }] });
  assert.deepEqual(n.notes.map(x => x.lv), [3, undefined, undefined]);
  const nv = readMidi(midiFile({ bpm: 120, tracks: clipTracks(n, 'x') })).tracks[0].notes.map(x => x.vel);
  assert.ok(nv[0] < nv[1], `velocities ${nv}`);
});

test('the grid shows the drums in use and the kit’s core, in order; all of them with 更多鼓', async () => {
  const { shownLanes, otherGroove, LANE_COLOR } = await import('../public/lib/studio.mjs');
  const { DRUMS, PERC, ALL_DRUMS, GROOVE_STYLES, drumPattern } = await import('../public/lib/synth.mjs');
  const trap = drums([['sub', 0], ['clap', 8], ['hat', 2]]);
  assert.deepEqual(shownLanes(DRUMS, [trap]), ['kick', 'snare', 'clap', 'hat', 'sub']);
  assert.deepEqual(shownLanes(DRUMS, [emptyDrums(1)]), ['kick', 'snare', 'hat'], 'an empty grid: the core');
  assert.deepEqual(shownLanes(DRUMS, [emptyDrums(1), drums([['tom', 3]])]), ['kick', 'snare', 'hat', 'tom'], 'any pattern’s drums');
  assert.deepEqual(shownLanes(DRUMS, [trap], true), DRUMS);
  assert.deepEqual(shownLanes(PERC, [emptyDrums(1)]), PERC, 'nothing of the percussion in use: all of it');
  assert.deepEqual(shownLanes(PERC, [drums([['conga', 1]])]), ['conga']);
  for (const g of GROOVE_STYLES) assert.ok(shownLanes(DRUMS, [drumPattern(g, 3)]).length <= DRUMS.length);
  for (let r = 0; r < 1; r += 0.01) assert.notEqual(otherGroove('trap', r), 'trap');
  assert.ok(GROOVE_STYLES.includes(otherGroove('trap', 0.9999)));
  assert.equal(new Set(Array.from({ length: 200 }, (_, k) => otherGroove('trap', k / 200))).size, GROOVE_STYLES.length - 1, '🎲 can land on every other groove');
  for (const d of ALL_DRUMS) assert.ok(LANE_COLOR[d], `${d} has a colour`);
});

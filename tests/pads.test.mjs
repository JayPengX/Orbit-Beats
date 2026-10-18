import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Jam, PAD, padOf, gainOf, chokeKey, choked, padsKept, withPads } from '../public/lib/jam.mjs';
import { renderEvents } from '../public/engine.mjs';

test('a pad as kept: level 0–1, mute, choke; anything else as it was', () => {
  assert.deepEqual(padOf(null), { ...PAD });
  assert.deepEqual(padOf({ level: 2, mute: 'yes', choke: 'z' }), { level: 1, mute: false, choke: '' });
  assert.deepEqual(padOf({ level: -1, mute: true, choke: 'a' }), { level: 0, mute: true, choke: 'a' });
  assert.equal(padOf({ level: 0.333 }).level, 0.33);
  assert.equal(gainOf(undefined), 1);
  assert.equal(gainOf(PAD), 1);
  assert.equal(gainOf({ level: 0.5, mute: false }), 0.25, 'a fader: squared');
  assert.equal(gainOf({ level: 1, mute: true }), 0);
  assert.equal(chokeKey(3, PAD), null);
  assert.equal(chokeKey(3, { choke: 'self' }), '#3');
  assert.equal(chokeKey(3, { choke: 'a' }), 'a');
});

test('choke: a hit is cut where the next of its group starts, not by one on the same beat', () => {
  const key = { 0: 'a', 1: 'a', 2: '#2', 3: null };
  const out = choked([{ i: 1, beat: 2 }, { i: 0, beat: 0 }, { i: 3, beat: 1 }, { i: 2, beat: 0 }, { i: 2, beat: 3 }, { i: 0, beat: 2 }, { i: 1, beat: 5 }], h => key[h.i]);
  assert.deepEqual(out, [
    { i: 0, beat: 0, len: 2 },   // the open hat, cut by the closed at 2
    { i: 2, beat: 0, len: 3 },   // self: cut by its own next
    { i: 3, beat: 1 },           // no group: rings out
    { i: 1, beat: 2, len: 3 },   // two on beat 2: neither cuts the other, both cut at 5
    { i: 0, beat: 2, len: 3 },
    { i: 2, beat: 3 },
    { i: 1, beat: 5 }
  ]);
});

test('a take keeps each hit at its level as played, leaves muted pads out, and is choked', () => {
  const j = new Jam();
  const pads = { 0: { level: 0.5, mute: false, choke: 'a' }, 1: { level: 1, mute: false, choke: 'a' }, 2: { level: 1, mute: true, choke: '' } };
  j.pad = i => pads[i] || PAD;
  j.record(0);
  j.shot(0, 0, 0.25);
  j.shot(2, 0.5, 0.25);
  j.shot(1, 1, 0.25);
  j.shot(3, 1.5, 0.25);
  j.due(0, 2);
  pads[0] = { level: 1, mute: false, choke: '' };   // changed mid-take: the next hit at the new level
  j.shot(0, 2, 0.25);
  j.record(2);
  j.due(2, 4);
  assert.deepEqual(j.done, [{ beats: 4, hits: [{ i: 0, beat: 0, g: 0.25, len: 1 }, { i: 1, beat: 1 }, { i: 3, beat: 1.5 }, { i: 0, beat: 2 }] }]);
});

test('pads kept per kit: only those changed, the newest 40 kits', () => {
  assert.deepEqual(padsKept({ 0: PAD, 1: { level: 0.5 }, x: { mute: true } }), { 1: { level: 0.5, mute: false, choke: '' } });
  let all = withPads({}, 'k1', { 2: { mute: true } }, 5);
  assert.deepEqual(all, { k1: { at: 5, pads: { 2: { level: 1, mute: true, choke: '' } } } });
  assert.deepEqual(withPads(all, 'k1', { 2: PAD }, 6), {}, 'all back as they were: the kit is forgotten');
  for (let n = 0; n < 45; n++) all = withPads(all, `k${n}`, { 0: { choke: 'self' } }, 100 + n);
  assert.equal(Object.keys(all).length, 40);
  assert.ok(all.k44 && !all.k1);
});

test('a take\'s song: each hit at its level, a choked one cut (faded) where it was cut', () => {
  const sr = 1000, bpm = 60; // a beat is 1000 samples
  const tone = { L: new Float32Array(3000).fill(0.5), R: new Float32Array(3000).fill(0.5) };
  const pieces = [tone, tone];
  const roles = ['kick', 'snare'];
  const plain = renderEvents(pieces, sr, bpm, roles, [{ i: 0, beat: 0 }]).audio.L;
  const quiet = renderEvents(pieces, sr, bpm, roles, [{ i: 0, beat: 0, g: 0.25 }]).audio.L;
  assert.equal(plain[100], 0.5);
  assert.equal(quiet[100], 0.125);
  const cut = renderEvents(pieces, sr, bpm, roles, [{ i: 0, beat: 0, len: 1 }]).audio.L;
  assert.equal(cut[900], 0.5);
  assert.ok(cut[998] > 0 && cut[998] < 0.5, 'faded over its last 4 ms');
  assert.equal(cut[1000], 0, 'silent once cut');
  assert.equal(plain[1500], 0.5, 'not cut: rings out');
});

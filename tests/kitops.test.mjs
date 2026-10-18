import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropPieces, snapOf, rolesBack, undoStack, freeName, namedKit, kitFrom, renamed, without, newestFirst, MOST_NAMED } from '../public/lib/kitops.mjs';

const f = n => new Float32Array(n);
const kit = () => {
  const a = { name: 'a.wav', sr: 48000, L: f(10), R: f(10) };
  const b = { name: 'b.wav', sr: 48000, L: f(5), R: f(5) };
  return { sources: [a, b], pieces: [{ L: f(3), R: f(3), src: 0 }, { L: f(4), R: f(4), src: 0 }, { L: f(5), R: f(5), src: 1 }], roles: ['kick', 'riff', 'bass'], edited: new Set([0, 2]) };
};

test('dropping a piece keeps the others, their names and the roles set by hand', () => {
  const k = kit();
  const out = dropPieces(k, new Set([1]));
  assert.deepEqual(out.sources.map(s => [s.name, s.L.length]), [['a.wav', 3], ['b.wav', 5]]);
  assert.deepEqual(out.roles, ['kick', 'bass']);
  assert.deepEqual([...out.edited], [0, 1]);
  assert.equal(dropPieces(k, new Set([0, 1, 2])).sources.length, 0);
});
test('a snapshot is a copy that survives the kit changing, and roles only come back to the same count', () => {
  const k = kit();
  const snap = snapOf({ ...k, bpm: 100 });
  k.roles[0] = 'snare';
  assert.equal(snap.roles[0], 'kick');
  assert.deepEqual(rolesBack(snap, 3).roles, ['kick', 'riff', 'bass']);
  assert.deepEqual([...rolesBack(snap, 3).edited], [0, 2]);
  assert.equal(rolesBack(snap, 2), null);
});
test('the undo stack gives the newest back first and lets the oldest go', () => {
  const u = undoStack(2);
  u.push('a', 1); u.push('b', 2); u.push('c', 3);
  assert.equal(u.size, 2);
  assert.equal(u.peek().label, 'c');
  assert.equal(u.pop().snap, 3);
  assert.equal(u.pop().snap, 2);
  assert.equal(u.pop(), null);
});
test('kits kept by name: free names, the record, renaming, deleting, newest first', () => {
  assert.equal(freeName('Kit', []), 'Kit');
  assert.equal(freeName('Kit', ['kit', 'Kit 2']), 'Kit 3');
  const k = kit();
  const rec = namedKit({ id: 'x', name: '  Beats  ', at: 5, sources: k.sources, roles: k.roles, edited: k.edited, bpm: 90 });
  assert.equal(rec.name, 'Beats');
  assert.equal(rec.count, 3);
  assert.deepEqual(rec.roles, { 0: 'kick', 2: 'bass' });
  assert.notEqual(rec.sources[0].R, null);
  const mono = namedKit({ id: 'm', name: '', sources: [{ name: 'm', sr: 1, L: f(2), R: null }], roles: [], edited: [], bpm: 80 });
  mono.sources[0].R = mono.sources[0].L;
  const back = kitFrom(namedKit({ id: 'm', name: 'm', sources: [{ name: 'm', sr: 1, L: mono.sources[0].L, R: mono.sources[0].L }], roles: [], edited: [], bpm: 80 }));
  assert.equal(back.sources[0].R, back.sources[0].L);
  const list = [{ id: 'a', name: 'A', at: 1 }, { id: 'b', name: 'B', at: 2 }];
  assert.equal(renamed(list, 'a', ' Z ')[0].name, 'Z');
  assert.equal(renamed(list, 'a', '  ')[0].name, 'A');
  assert.deepEqual(without(list, 'a').map(x => x.id), ['b']);
  assert.deepEqual(newestFirst(list).map(x => x.id), ['b', 'a']);
  assert.equal(newestFirst(Array.from({ length: 50 }, (_, i) => ({ id: i, at: i }))).length, MOST_NAMED);
});

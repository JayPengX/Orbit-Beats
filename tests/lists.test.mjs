import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listsOf, makeList, renameList, deleteList, addTo, removeFrom, dropSong, songsOf, MOST_LISTS } from '../public/lib/lists.mjs';

test('lists as kept: bad entries dropped, songs once each', () => {
  assert.deepEqual(listsOf(null), []);
  assert.deepEqual(listsOf({}), []);
  assert.deepEqual(listsOf([{ id: 'a', name: ' Run ', songs: ['x', 'x', 3, 'y'], at: 1 }, { id: 'a', name: 'dup' }, { id: 'b', name: '  ' }, { name: 'no id' }, null]), [{ id: 'a', name: 'Run', songs: ['x', 'y'], at: 1 }]);
});

test('make, rename, add, remove, delete', () => {
  let l = makeList([], '跑步', 'a', 1);
  l = makeList(l, '', 'b', 2);
  assert.equal(l.length, 1, 'a blank name is no list');
  l = makeList(l, 'Chill', 'c', 3);
  assert.deepEqual(l.map(x => x.id), ['c', 'a'], 'newest first');
  l = renameList(l, 'a', '晨跑');
  assert.equal(l[1].name, '晨跑');
  assert.equal(renameList(l, 'a', ' ')[1].name, '晨跑');
  l = addTo(l, 'a', 's1');
  l = addTo(l, 'a', 's2');
  l = addTo(l, 'a', 's1');
  assert.deepEqual(l[1].songs, ['s1', 's2'], 'in the order added, once');
  l = removeFrom(l, 'a', 's1');
  assert.deepEqual(l[1].songs, ['s2']);
  l = deleteList(l, 'c');
  assert.deepEqual(l.map(x => x.id), ['a']);
  let many = [];
  for (let n = 0; n < MOST_LISTS + 3; n++) many = makeList(many, `L${n}`, `id${n}`);
  assert.equal(many.length, MOST_LISTS);
});

test('a song out of 歌單 leaves every list; a list plays what it still has, in its order', () => {
  let l = addTo(addTo(addTo(makeList(makeList([], 'A', 'a'), 'B', 'b'), 'a', 's1'), 'a', 's2'), 'b', 's1');
  const same = dropSong(l, 'zz');
  assert.equal(same, l, 'not in any list: nothing to save');
  l = dropSong(l, 's1');
  assert.deepEqual(l.map(x => x.songs), [[], ['s2']]);
  const songs = [{ id: 's3' }, { id: 's2' }, { id: 's1' }];
  assert.deepEqual(songsOf({ songs: ['s3', 'gone', 's1'] }, songs).map(s => s.id), ['s3', 's1']);
  assert.deepEqual(songsOf(null, songs), []);
});

test('library helpers: recent kept songs, list cover, shuffle', async () => {
  const { recentOf, mosaicOf, shuffled } = await import('../public/lib/library.mjs');
  const songs = Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, name: `n${i}`, at: i }));
  assert.deepEqual(recentOf(songs).map(s => s.id), ['s14', 's13', 's12', 's11', 's10', 's9', 's8', 's7', 's6', 's5', 's4', 's3'], 'newest first, twelve');
  assert.equal(recentOf(songs, 2).length, 2);
  assert.equal(mosaicOf(songs).length, 4, 'four songs make the mosaic');
  assert.equal(mosaicOf(songs.slice(0, 3)).length, 1, 'fewer show the first alone');
  assert.equal(mosaicOf([]).length, 0);
  const seq = [0.1, 0.9, 0.5];
  let k = 0;
  const mix = shuffled(['a', 'b', 'c', 'd'], () => seq[k++ % 3]);
  assert.deepEqual([...mix].sort(), ['a', 'b', 'c', 'd'], 'nothing lost or doubled');
  assert.deepEqual(shuffled(['a']), ['a']);
});

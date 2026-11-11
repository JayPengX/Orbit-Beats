import { test } from 'node:test';
import assert from 'node:assert/strict';
import { songEntry, songsMap, listsMap, mergeMap, trimSongs, songsPlan, listsChanged, listsPlan, syncable, soundless, waiting, GONE_DAYS } from '../public/lib/songsync.mjs';
import { decode, encode, merge } from '../public/lib/kits.mjs';

const radioRec = (seed, at, name = `歌 ${seed}`) => ({
  id: `radio:${seed}:all:lofi`,
  name,
  at,
  info: { style: 'lofi', bpm: 82.04, seconds: 151.234, key: { tonic: 9, minor: true }, plan: [['intro', 4], ['verse', 8], ['hook', 8]], peak: 0.9, radio: { seed, mood: 'all', style: 'lofi', v: 21 } },
  recipe: { print: 'radio', radio: { seed, mood: 'all', style: 'lofi', v: 21 } },
  sound: { size: 2_000_000 },
  form: 'aac'
});
const kitRec = { id: 'k1abc:5:::mix', name: '我的', at: 5, info: { style: 'rap' }, recipe: { print: 'k1abc', seed: 5 }, sound: {}, form: 'aac' };
const bandRec = { id: 'band:jam:9', name: '即興', at: 9, info: { style: 'funk', seconds: 12 }, recipe: { print: 'band', band: { seed: 3, style: 'funk' }, jam: [{ i: 0, beat: 0 }], plan: null, mix: null, at: 9 }, sound: {}, form: 'aac' };

test('only songs made on the app\'s own band go up, as their recipe: a few hundred bytes, never the sound', () => {
  assert.ok(syncable(radioRec(1, 1)));
  assert.ok(syncable(bandRec));
  assert.ok(!syncable(kitRec), 'a song of your own pieces stays on its phone');
  const e = songEntry(radioRec(123456789, 1700000000000), 1700000000000);
  assert.equal(e.r.radio.seed, 123456789);
  assert.equal(e.i.seconds, 151.23);
  assert.equal(e.i.peak, undefined);
  assert.equal(e.sound, undefined);
  assert.ok(JSON.stringify(e).length < 400, `${JSON.stringify(e).length} bytes`);
});

test('a song kept here goes up; one kept elsewhere comes down without its sound, made from its recipe', () => {
  const a = songsPlan({}, [radioRec(1, 100), kitRec]);
  assert.deepEqual(Object.keys(a.map), ['radio:1:all:lofi']);
  assert.deepEqual(a.add, []);
  const b = songsPlan(a.map, []);
  assert.equal(b.add.length, 1);
  const rec = b.add[0];
  assert.equal(rec.id, 'radio:1:all:lofi');
  assert.equal(rec.name, '歌 1');
  assert.equal(rec.from, 'radio');
  assert.ok(soundless(rec));
  assert.deepEqual(rec.info.plan, [['intro', 4], ['verse', 8], ['hook', 8]], 'its sections shown before it is made');
  assert.deepEqual(rec.recipe, radioRec(1, 100).recipe);
});

test('taken out on one phone, it leaves the others; kept again after, it comes back', () => {
  const map = { 'radio:1:all:lofi': { g: 200 } };
  assert.deepEqual(songsPlan(map, [radioRec(1, 100)]).drop, ['radio:1:all:lofi']);
  const again = songsPlan(map, [radioRec(1, 300)]);
  assert.deepEqual(again.drop, []);
  assert.equal(again.map['radio:1:all:lofi'].u, 300);
});

test('a rename elsewhere renames it here', () => {
  const map = { 'radio:1:all:lofi': songEntry({ ...radioRec(1, 100), name: '新名字' }, 500) };
  assert.deepEqual(songsPlan(map, [radioRec(1, 100)]).rename, [['radio:1:all:lofi', '新名字']]);
});

test('two copies merge entry by entry, the later change winning; old gone marks forgotten', () => {
  const now = 1e12;
  const a = { x: { n: 'a', t: 1, u: now - 5, r: radioRec(1, 1).recipe, i: {} }, y: { g: now - 1 }, z: { g: now - (GONE_DAYS + 1) * 86400000 } };
  const b = { x: { g: now - 3 }, y: { n: 'b', t: 1, u: now - 7, r: radioRec(2, 1).recipe, i: {} } };
  const m = mergeMap(a, b, now);
  assert.deepEqual(m.x, { g: now - 3 });
  assert.deepEqual(m.y, { g: now - 1 });
  assert.equal(m.z, undefined);
  assert.deepEqual(mergeMap(b, a, now), m, 'either order');
});

test('the payload holds the newest songs that fit, and reads back as written', () => {
  const songs = {};
  for (let k = 0; k < 1000; k++) songs[`radio:${k}:all:lofi`] = songEntry(radioRec(k, k), k);
  songs.gone = { g: 5 };
  const kept = trimSongs(songs, 20_000);
  assert.ok(JSON.stringify(kept).length <= 20_000);
  assert.ok(kept['radio:999:all:lofi'] && !kept['radio:0:all:lofi'], 'the newest kept');
  assert.deepEqual(kept.gone, { g: 5 });
  const p = { v: 1, settings: null, kits: {}, taste: {}, songs: { a: songEntry(radioRec(1, 1), 1) }, lists: { l1: { n: '跑步', s: ['a'], t: 1, u: 1 } } };
  assert.deepEqual(decode(encode(p)), p);
  assert.deepEqual(merge(decode(encode(p)), decode('{"v":1}')).songs, p.songs);
  // (A payload from before songs: none.)
  assert.deepEqual(decode('{"v":1,"settings":null,"kits":{}}').songs, {});
});

test('bad entries from another phone are dropped, never fed to the maker', () => {
  const m = songsMap({ a: { n: 'x', r: { print: 'k1', seed: 1 } }, b: { n: 'y', r: { print: 'radio', radio: { seed: 'no' } } }, c: { g: 4 }, d: null, '': { g: 1 } });
  assert.deepEqual(m, { c: { g: 4 } });
  assert.deepEqual(listsMap({ l: { n: '  ', s: [] }, m: { n: 'ok', s: ['a', 'a', 3] } }), { m: { n: 'ok', s: ['a'], t: 0, u: 0 } });
});

test('playlists: a change here goes up, a list made or taken out elsewhere shows here', () => {
  const was = [{ id: 'l1', name: '跑步', songs: ['a'], at: 1 }];
  const now = [{ id: 'l2', name: '讀書', songs: [], at: 5 }, { id: 'l1', name: '跑步', songs: ['a', 'b'], at: 1 }];
  const map = listsChanged({}, was, now, 9);
  assert.deepEqual(map, { l2: { n: '讀書', s: [], t: 5, u: 9 }, l1: { n: '跑步', s: ['a', 'b'], t: 1, u: 9 } });
  assert.deepEqual(listsChanged(map, now, [now[1]], 10).l2, { g: 10 });
  const theirs = { l3: { n: '睡前', s: ['z'], t: 7, u: 7 }, l1: { g: 8 } };
  const lp = listsPlan(theirs, was);
  assert.deepEqual(lp.lists, [{ id: 'l3', name: '睡前', songs: ['z'], at: 7 }], 'l1 gone elsewhere');
  assert.deepEqual(listsPlan({}, was).map.l1, { n: '跑步', s: ['a'], t: 1, u: 1 }, 'a list here the Pass lacks goes up');
});

test('a jam on the built-in band comes back as a jam', () => {
  const e = songEntry(bandRec, 9);
  assert.equal(waiting('band:jam:9', e).from, 'jam');
});

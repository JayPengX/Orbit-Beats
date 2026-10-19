// The genre lists: moods, recents and the few chips of a small screen (lib/genres.mjs), and 樂器's lane names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOODS, moodGroups, pushRecent, recentOf, chipsOf } from '../public/lib/genres.mjs';
import { solName } from '../public/lib/studio.mjs';
import { STYLE_ORDER } from '../public/engine.mjs';

test('every genre is in exactly one mood', () => {
  const all = MOODS.flatMap(m => m.styles);
  assert.equal(new Set(all).size, all.length, 'none twice');
  assert.deepEqual([...all].sort(), [...STYLE_ORDER].sort());
});

test('mood groups keep only the genres on offer, and a stray one goes last', () => {
  const g = moodGroups(['lofi', 'trap', 'weird']);
  assert.deepEqual(g.map(m => m.id), ['chill', 'hype', 'more']);
  assert.deepEqual(g[2].styles, ['weird']);
  assert.deepEqual(moodGroups([]), []);
});

test('recents: latest first, once, at most so many', () => {
  assert.deepEqual(pushRecent(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
  assert.equal(pushRecent(Array.from({ length: 8 }, (_, i) => `s${i}`), 'new').length, 8);
  assert.deepEqual(recentOf(['trap', 'gone', 'trap', 'lofi'], STYLE_ORDER), ['trap', 'lofi']);
});

test('the chips: recents, then the most played; the current one in front unless already there', () => {
  assert.deepEqual(chipsOf('', [], STYLE_ORDER, 5), STYLE_ORDER.slice(0, 5));
  assert.deepEqual(chipsOf('', ['jazz', 'rock'], STYLE_ORDER, 5).slice(0, 3), ['jazz', 'rock', STYLE_ORDER[0]]);
  const now = chipsOf('metal', ['jazz'], STYLE_ORDER, 5);
  assert.equal(now[0], 'metal');
  assert.equal(now.length, 5);
  assert.deepEqual(chipsOf('jazz', ['jazz', 'rock'], STYLE_ORDER, 5)[0], 'jazz');
  assert.equal(new Set(chipsOf('lofi', [], STYLE_ORDER, 5)).size, 5);
  assert.equal(chipsOf('nope', [], ['a', 'b'], 5).length, 2);
});

test('the melody lanes are named Do Re Mi, high to low, the ends marked', () => {
  const names = Array.from({ length: 8 }, (_, i) => solName(i, 8));
  assert.equal(names.length, 8);
  assert.match(names[0], /^Do/);
  assert.match(names[7], /^Do/);
  assert.deepEqual(names.slice(1, 7), ['Ti', 'La', 'Sol', 'Fa', 'Mi', 'Re']);
  assert.notEqual(names[0], names[7]);
});

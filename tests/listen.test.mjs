// 聽's covers (lib/cover.mjs) and its small rules (lib/listen.mjs): the
// sleep timer's times and fade, the recently played list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverPalette, coverSvg, coverRng, coverCount, STYLE_ART } from '../public/lib/cover.mjs';
import { sleepSet, sleepLeft, sleepGain, sleepDone, sleepClock, SLEEP_FADE, recentAdd, recentEntry, recentParse, recentItem, RECENT_MAX } from '../public/lib/listen.mjs';
import { STYLES } from '../public/engine.mjs';

const song = { seed: 123456, style: 'afro', mood: 'groove', key: { tonic: 7, minor: true }, bpm: 104, title: '霓虹脈搏', label: 'Afro · 104 BPM' };

test('a cover is the same every time for the same song', () => {
  assert.equal(coverSvg(song), coverSvg({ ...song }));
  assert.deepEqual(coverPalette(song), coverPalette({ ...song }));
  const a = coverRng(42);
  const b = coverRng(42);
  for (let i = 0; i < 20; i++) assert.equal(a.next(), b.next());
});

test('another seed, groove, key or tempo makes another cover', () => {
  const base = coverSvg(song);
  for (const change of [{ seed: 654321 }, { style: 'trap' }, { key: { tonic: 2, minor: false } }, { bpm: 170 }]) assert.notEqual(coverSvg({ ...song, ...change }), base, JSON.stringify(change));
  // (Fifty seeds of one groove: fifty covers.)
  const seen = new Set(Array.from({ length: 50 }, (_, i) => coverSvg({ ...song, seed: i * 7919 })));
  assert.equal(seen.size, 50);
});

test('every groove has its colour and shape; a minor key is darker', () => {
  for (const s of STYLES) assert.ok(STYLE_ART[s], s);
  assert.equal(coverPalette({ ...song, style: 'lofi' }).shape, 'waves');
  assert.equal(coverPalette({ ...song, style: 'trap' }).shape, 'shards');
  const light = c => Number(/(\d+)%\)$/.exec(c)[1]);
  const minor = coverPalette(song);
  const major = coverPalette({ ...song, key: { tonic: 7, minor: false } });
  assert.ok(light(minor.bg0) < light(major.bg0));
  // (Every colour a real hsl().)
  for (const v of Object.values(minor)) if (typeof v === 'string' && v.startsWith('hsl')) assert.match(v, /^hsl\(\d+ \d+% \d+%( \/ [\d.]+)?\)$/);
});

test('the tempo sets how many rings or waves, within bounds', () => {
  assert.equal(coverCount(70, 5, 12, 14), 5);
  assert.equal(coverCount(190, 5, 12, 14), 12);
  assert.ok(coverCount(140, 5, 12, 14) > coverCount(84, 5, 12, 14));
  for (const s of STYLES) for (const bpm of [70, 120, 176]) {
    const svg = coverSvg({ ...song, style: s, bpm });
    assert.match(svg, /^<svg [^>]+>.*<\/svg>$/s, s);
    assert.doesNotMatch(svg, /NaN|undefined/, `${s} ${bpm}`);
  }
});

test('the title is set in the cover, escaped; a thumbnail has no words', () => {
  assert.ok(coverSvg(song).includes('霓虹脈搏'));
  assert.ok(coverSvg({ ...song, title: 'Tom & <Jerry>' }).includes('Tom &#38; &#60;Jerry&#62;'));
  assert.ok(!coverSvg({ ...song, text: false }).includes('<text'));
  // (A long English title gets a smaller size than a four-character one.)
  const size = t => Number(/font-size="([\d.]+)" font-weight="800"/.exec(coverSvg({ ...song, title: t }))[1]);
  assert.ok(size('Midnight Secrets') < size('霓虹脈搏') + 0.001);
  assert.ok(size('Midnight Secrets') >= 24);
});

test('sleep timer: minutes from now, or the song’s end', () => {
  const now = 1_000_000;
  assert.deepEqual(sleepSet(15, now), { until: now + 15 * 60000 });
  assert.deepEqual(sleepSet('song', now), { song: true });
  assert.equal(sleepLeft(sleepSet(30, now), now + 60000), 29 * 60000);
  assert.equal(sleepLeft(sleepSet(15, now), now + 16 * 60000), 0);
  assert.equal(sleepLeft({ song: true }, now, 12.5), 12500);
  assert.equal(sleepLeft(null, now), Infinity);
});

test('sleep timer: full until the last ten seconds, then down to nothing', () => {
  assert.equal(sleepGain(Infinity), 1);
  assert.equal(sleepGain(SLEEP_FADE), 1);
  assert.equal(sleepGain(0), 0);
  assert.equal(sleepGain(SLEEP_FADE / 2), 0.25);
  let last = 1;
  for (let t = SLEEP_FADE; t >= 0; t -= 500) {
    const g = sleepGain(t);
    assert.ok(g <= last && g >= 0);
    last = g;
  }
  assert.ok(sleepDone(200) && !sleepDone(1000));
  assert.equal(sleepClock(30 * 60000), '30:00');
  assert.equal(sleepClock(60 * 60000), '1:00:00');
  assert.equal(sleepClock(1001), '0:02');
});

test('recently played: newest first, once each, ten at most, read back safely', () => {
  const item = seed => ({ spec: { seed, mood: 'all' }, info: { style: 'trap', bpm: 140, key: { tonic: 3, minor: true, extra: 1 } }, seconds: 90 });
  let list = [];
  for (let i = 0; i < 14; i++) list = recentAdd(list, recentEntry(item(i)));
  assert.equal(list.length, RECENT_MAX);
  assert.equal(list[0].seed, 13);
  list = recentAdd(list, recentEntry(item(9)));
  assert.equal(list[0].seed, 9);
  assert.equal(list.filter(e => e.seed === 9).length, 1);
  assert.deepEqual(list[0].key, { tonic: 3, minor: true });
  assert.deepEqual(recentParse(JSON.stringify(list)), list);
  assert.deepEqual(recentParse('nope'), []);
  assert.deepEqual(recentParse('{"a":1}'), []);
  assert.equal(recentParse(JSON.stringify([{ seed: 'x' }, list[0]])).length, 1);
  // (As the ♡ takes it: the same id the radio keeps it under.)
  assert.equal(recentItem(list[0]).id, 'radio:9:all:trap');
});

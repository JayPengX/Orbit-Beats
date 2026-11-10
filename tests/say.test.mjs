// 用說的做節奏 (Jay 11-10, the family's AI; code first): your own words read
// by code into a station; only what code can't place goes to the AI door.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readVibe, vibeStation, TEMPO } from '../public/lib/say.mjs';
import { sayOf, stationId, stationFilter } from '../public/lib/stations.mjs';

test('words code reads: a groove named, a scene, how fast', () => {
  const v = readVibe('讀書用的 lo-fi，慢一點，下雨的感覺');
  assert.deepEqual(v, { styles: ['lofi'], bpm: TEMPO.slow });
  assert.equal(vibeStation(v), 'say:lofi@60-95');
  assert.deepEqual(readVibe('跑步用 128 bpm').bpm, [120, 136]);
  assert.ok(readVibe('開車兜風').styles.includes('synthwave'));
});

test('nothing read: nothing, and the AI door is asked', () => {
  assert.equal(readVibe('阿巴阿巴'), null);
  assert.equal(readVibe('   '), null);
  assert.equal(vibeStation(null), null);
  assert.equal(vibeStation({ styles: [], bpm: null }), null);
});

test('a said station is a station: its grooves and tempo, a broken one none', () => {
  assert.equal(stationId('say:lofi.jazz@60-95'), 'say:lofi.jazz@60-95');
  assert.deepEqual(sayOf('say:lofi.jazz@60-95'), { styles: ['lofi', 'jazz'], bpm: [60, 95] });
  assert.deepEqual(stationFilter('say:lofi.jazz@60-95'), { mood: 'all', styles: ['lofi', 'jazz'], bpm: [60, 95] });
  assert.equal(sayOf('say:'), null);
  assert.equal(sayOf('say:nope'), null);
  assert.equal(stationId('say:<script>'), 'all');
});

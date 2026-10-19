// The chord instruments: each groove plays only its own, a song's two differ, and the radio does not
// run the same one twice in a row or bring it back within the last eight but seldom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY, BAND_STYLES, bandSounds, radioPick, radioSpec } from '../public/lib/radio.mjs';

const run = (mood, n = 40, from = 3) => {
  const out = [];
  for (let k = 0; k < n; k++) { const p = radioPick(mood, out, 7919 * k + from); out.push(radioSpec(p.seed, p.mood, p.style)); }
  return out;
};

test('every groove picks its chord instruments only from its own pool, and a song plays two', () => {
  for (const style of BAND_STYLES) {
    const pool = bandSounds(style).chords;
    for (let seed = 1; seed <= 30; seed++) {
      const sp = radioSpec(seed * 97, 'all', style);
      assert.ok(pool.includes(sp.chords) && pool.includes(sp.chords2), `${style}: ${sp.chords}/${sp.chords2} not in ${pool}`);
      if (pool.length > 1) assert.notEqual(sp.chords, sp.chords2, `${style}: the same chord instrument twice in a song`);
    }
  }
});

test('the chord instruments are wide: most grooves have five or more, and the pad is one among them', () => {
  const wide = BAND_STYLES.filter(s => bandSounds(s).chords.length >= 5).length;
  assert.ok(wide >= 35, `${wide} of ${BAND_STYLES.length} grooves with five or more`);
  let pad = 0, all = 0;
  for (let seed = 1; seed <= 400; seed++) { all++; if (radioSpec(seed * 31, 'all').chords === 'pad') pad++; }
  assert.ok(pad / all < 0.12, `pad in ${pad} of ${all}`);
});

test('the radio never runs the same chord instrument twice and brings it back within eight only now and then', () => {
  for (const mood of ['all', 'chill', 'hype', 'groove']) {
    const specs = run(mood);
    let again = 0;
    specs.forEach((s, k) => {
      if (k) assert.notEqual(s.chords, specs[k - 1].chords, `${mood} #${k}: ${s.chords} twice in a row`);
      if (specs.slice(Math.max(0, k - MEMORY), k).some(x => x.chords === s.chords)) again++;
    });
    assert.ok(again <= (mood === 'all' ? 6 : 14), `${mood}: ${again} of 40 chord instruments heard again within ${MEMORY}`);
    assert.ok(new Set(specs.map(s => s.chords)).size >= 12, `${mood}: only ${new Set(specs.map(s => s.chords)).size} chord instruments`);
  }
});

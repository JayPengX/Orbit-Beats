// The small modules: tap tempo, the names, file names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAP_RESET, tapper, tempoOf } from '../public/lib/tap.mjs';
import { STYLE_NAMES, SECTION_NAMES, ROLE_NAMES, BUS_NAMES, name } from '../public/lib/names.mjs';
import { fileName } from '../public/lib/download.mjs';
import { STYLES, SECTIONS, ROLES } from '../public/engine.mjs';
import { STEMS } from '../public/lib/mix.mjs';
import { ALL_DRUMS, DRUM_NAMES, INSTRUMENTS, INSTRUMENT_NAMES } from '../public/lib/synth.mjs';

const clock = () => { let t = 0; const c = () => t; c.at = v => (t = v); return c; };

test('tap tempo: from the second tap, the median gap, a long pause starting over', () => {
  const c = clock(), tap = tapper(c);
  c.at(1000); assert.equal(tap.tap(), null, 'one tap: no tempo yet');
  c.at(1500); assert.equal(tap.tap(), 120);
  c.at(2000); assert.equal(tap.tap(), 120);
  c.at(2900); assert.equal(tap.tap(), 120, 'one late tap does not pull it (median of 500, 500, 900)');
  c.at(3400); assert.equal(tap.tap(), 120);
  // Exactly TAP_RESET later still counts; a hair more starts over.
  c.at(3400 + TAP_RESET); assert.equal(tap.tap(), 120 /* median of 500,500,900,500,2000 */);
  c.at(3400 + 2 * TAP_RESET + 1); assert.equal(tap.tap(), null, 'a pause: start over');
  c.at(3400 + 2 * TAP_RESET + 1 + 600); assert.equal(tap.tap(), 100);
  tap.reset();
  c.at(20000); assert.equal(tap.tap(), null, 'reset: start over');
  assert.equal(TAP_RESET, 2000);
});

test('tap tempo: the last eight taps, a tenth of a BPM, within 40-250', () => {
  const c = clock(), tap = tapper(c);
  let t = 0, bpm;
  for (let k = 0; k < 8; k++) { c.at((t += 400)); bpm = tap.tap(); }
  assert.equal(bpm, 150);
  for (let k = 0; k < 7; k++) { c.at((t += 600)); bpm = tap.tap(); }
  assert.equal(bpm, 100, 'only the last eight taps (seven gaps of 600)');
  assert.equal(tempoOf([0, 467]), 128.5);
  assert.equal(tempoOf([0, 10, 20]), 250);
  assert.equal(tempoOf([0, 1900, 3800]), 40);
  assert.equal(tempoOf([0, 500, 1100, 1600]), 120, 'median of 500, 600, 500');
  assert.equal(tempoOf([0, 500, 1100]), 109.1, 'two gaps: their mean');
  assert.equal(tempoOf([]), null);
  assert.equal(tempoOf([5]), null);
  assert.equal(tempoOf([5, 5, 5]), null, 'no gap at all');
  assert.equal(tempoOf([0, 0, 500]), 120, 'a double tap ignored');
  assert.equal(tempoOf([1000, 500, 1000, 1500]), 120, 'a clock that went back ignored');
});

test('names: every style, section, role, bus and stem, drum and instrument in both languages', () => {
  const both = (table, ids, what) => {
    for (const id of ids) {
      assert.ok(Array.isArray(table[id]) && table[id].length === 2, `${what} ${id}`);
      for (const w of table[id]) assert.ok(typeof w === 'string' && w.trim().length > 0, `${what} ${id}`);
    }
    assert.deepEqual(Object.keys(table).sort(), [...ids].sort(), `${what}: no names for ids that are gone`);
  };
  both(STYLE_NAMES, STYLES, 'style');
  both(SECTION_NAMES, SECTIONS, 'section');
  both(ROLE_NAMES, ROLES, 'role');
  both(BUS_NAMES, STEMS, 'bus');
  both(DRUM_NAMES, ALL_DRUMS, 'drum');
  both(INSTRUMENT_NAMES, INSTRUMENTS, 'instrument');
  // Under Node, Chinese (the app's first language); an id with no words is itself.
  assert.equal(name(SECTION_NAMES, 'pre'), '導歌');
  assert.equal(name(STYLE_NAMES, 'trap'), 'Trap');
  assert.equal(name(STYLE_NAMES, 'polka'), 'polka');
  assert.equal(name({}, 'x'), 'x');
});

test('file names: nothing a file system refuses, never empty, never too long', () => {
  assert.equal(fileName('Beats 31-12-2026 23-58'), 'Beats 31-12-2026 23-58');
  assert.equal(fileName('a/b\\c:d*e?f"g<h>i|j'), 'a-b-c-d-e-f-g-h-i-j');
  assert.equal(fileName('AC/DC: "Live"??'), 'AC-DC- -Live-');
  assert.equal(fileName('我的歌 🎵'), '我的歌 🎵');
  for (const empty of ['', '   ', null, undefined]) assert.equal(fileName(empty), 'Orbit Beats');
  assert.equal(fileName(42), '42');
  assert.equal(fileName('x'.repeat(200)).length, 80);
  for (const s of ['a\nb', 'tab\there', 'nul\0', 'bell\x07', '\x1f']) {
    const f = fileName(s);
    assert.ok(!/[\x00-\x1f]/.test(f), `no control characters: ${JSON.stringify(f)}`);
    assert.ok(f.length > 0);
  }
  // Cut to 80, never ending in a space (Windows drops it, the name changes).
  assert.ok(!/\s$/.test(fileName(`${'y'.repeat(79)} z`)));
  for (const s of ['a/b', '???', 'x'.repeat(100), ' pad ', 'q\n']) assert.equal(fileName(fileName(s)), fileName(s), 'the same name twice over');
});

// The kit locks the page's scrolling while any `.loading` is shown (its loading screen, kit/orbit.css):
// a class of that name left on something of the app's, even on a hidden tab, froze 首頁's scrolling.
test("nothing of the app's is ever class 'loading'", async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const dir = new URL('../public/lib/', import.meta.url);
  for (const f of [...(await readdir(dir)).map(x => new URL(x, dir)), new URL('../public/app.js', import.meta.url)]) {
    if (!/\.m?js$/.test(String(f))) continue;
    const text = await readFile(f, 'utf8');
    assert.doesNotMatch(text, /classList\.(add|toggle)\(\s*['"]loading['"]|class: ['"][^'"]*\bloading\b/, String(f));
  }
});

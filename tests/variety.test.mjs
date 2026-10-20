// The sound's variety: every groove and voice sounds (finite, not silent, under full scale),
// has a name in both languages, and the radio never plays two alike one after another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, FAMILY } from '../public/engine.mjs';
import { ALL_DRUMS, INSTRUMENTS, DRUM_NAMES, INSTRUMENT_NAMES, GROOVE_STYLES, drumPattern, melody, renderClip, voice } from '../public/lib/synth.mjs';
import { NOTE_VOICES, DRUM_VOICES } from '../public/lib/voices.mjs';
import { STYLE_NAMES, STYLE_ORDER } from '../public/lib/names.mjs';
import { MOODS, BAND_STYLES, radioSpec, radioKit, radioPick } from '../public/lib/radio.mjs';

const peak = x => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
test('every style: a groove, a band and all the radio kit\'s parts sound at three seeds', () => {
  assert.deepEqual([...BAND_STYLES].sort(), [...STYLES].sort(), 'a band for every style');
  assert.deepEqual([...GROOVE_STYLES].sort(), [...STYLES].sort(), 'a groove for every style');
  for (const style of STYLES)
    for (const seed of [1, 22, 333]) {
      const g = renderClip(drumPattern(style, seed, 1), 8000, 120);
      assert.ok(g.L.every(Number.isFinite) && peak(g.L) > 0.01 && peak(g.L) <= 3, `${style} ${seed}: groove (${peak(g.L)})`);
      const sp = radioSpec(seed, 'all', style);
      assert.equal(sp.style, style);
      const { pieces, roles } = radioKit(sp, 8000);
      assert.equal(pieces.length, roles.length);
      pieces.forEach((p, i) => {
        assert.ok(p.L.length > 0 && p.L.every(Number.isFinite), `${style} ${seed} part ${i} (${roles[i]}): finite`);
        assert.ok(peak(p.L) > 0.005, `${style} ${seed} part ${i} (${roles[i]}): silent`);
        assert.ok(peak(p.L) <= 3, `${style} ${seed} part ${i} (${roles[i]}): peak ${peak(p.L)}`);
      });
    }
});

test('every voice renders finite, audible samples with a peak of 1 at most', () => {
  for (const name of [...Object.keys(NOTE_VOICES), ...Object.keys(DRUM_VOICES)]) assert.ok(ALL_DRUMS.includes(name) || INSTRUMENTS.includes(name), `${name} is listed`);
  for (const v of [...Object.keys(NOTE_VOICES), ...Object.keys(DRUM_VOICES)])
    for (const midi of [28, 48, 60, 84]) {
      const x = voice(v, midi, 22050, 0.4);
      assert.ok(x.length > 0 && x.every(Number.isFinite), `${v} ${midi}: finite`);
      assert.ok(peak(x) > 0.02, `${v} ${midi}: silent (${peak(x)})`);
      assert.ok(peak(x) <= 1, `${v} ${midi}: peak ${peak(x)}`);
    }
  for (const inst of INSTRUMENTS) {
    const c = renderClip(melody({ tonic: 2, minor: true }, inst, 7, 1), 8000, 110);
    assert.ok(c.L.every(Number.isFinite) && peak(c.L) > 0.01, `${inst}: a melody sounds`);
  }
});

test('every style, drum and instrument has a Chinese and an English name', () => {
  const named = (table, k) => Array.isArray(table[k]) && table[k].length === 2 && table[k].every(s => typeof s === 'string' && s.trim());
  for (const s of STYLES) assert.ok(named(STYLE_NAMES, s), `style ${s}`);
  for (const d of ALL_DRUMS) assert.ok(named(DRUM_NAMES, d), `drum ${d}`);
  for (const i of INSTRUMENTS) assert.ok(named(INSTRUMENT_NAMES, i), `instrument ${i}`);
  assert.deepEqual([...STYLE_ORDER].sort(), [...STYLES].sort(), 'the chips list each style once');
  for (const [id, m] of Object.entries(MOODS)) assert.ok(m.zh && m.en, `mood ${id}`);
  const all = [...Object.values(STYLE_NAMES), ...Object.values(DRUM_NAMES), ...Object.values(INSTRUMENT_NAMES), ...Object.values(MOODS).map(m => [m.zh, m.en])].flat();
  assert.ok(all.every(s => !/\p{Extended_Pictographic}/u.test(s)), 'no emoji in a name');
});

const tempoFeel = (a, b) => Math.abs(a - b) >= 15 || Math.abs(a / b - 2) < 0.12 || Math.abs(b / a - 2) < 0.12;
const modeOf = sp => sp.mode || (sp.key.minor ? 'minor' : 'major');

test('thirty radio songs per mood: no repeat, a new family, a new tempo, a new key or mode', () => {
  for (const mood of Object.keys(MOODS)) {
    const styles = new Set(MOODS[mood].styles);
    const window = Math.min(6, Math.max(1, styles.size - 5));   // (six, where the station has eleven styles or more)
    const specs = [];
    let tempoMisses = 0;
    for (let k = 0; k < 30; k++) {
      const pick = radioPick(mood, specs, 1000 * k + 17);
      const sp = radioSpec(pick.seed, pick.mood, pick.style);
      assert.ok(styles.has(sp.style), `${mood} #${k}: in the station`);
      const prev = specs.at(-1);
      if (prev) {
        assert.notEqual(sp.style, prev.style, `${mood} #${k}: no immediate repeat`);
        assert.ok(!FAMILY[prev.style].includes(sp.style) || styles.size <= 4, `${mood} #${k}: ${prev.style} then ${sp.style}, a relative`);
        if (!tempoFeel(prev.bpm, sp.bpm)) tempoMisses++;
        assert.ok(prev.key.tonic !== sp.key.tonic || modeOf(prev) !== modeOf(sp), `${mood} #${k}: the same key and mode`);
      }
      specs.slice(-window).forEach(p => assert.notEqual(p.style, sp.style, `${mood} #${k}: ${sp.style} again within ${window}`));
      specs.push(sp);
    }
    assert.equal(tempoMisses, 0, `${mood}: ${tempoMisses} songs too near the last one's tempo`);
    assert.ok(new Set(specs.map(s => s.style)).size >= Math.min(styles.size, 6), `${mood}: a range of grooves`);
  }
});

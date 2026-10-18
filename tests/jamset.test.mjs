import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SET_STYLES, BAND_ROLES, FAMILY, bandPads, specOf, setOf, diceSet } from '../public/lib/jamset.mjs';
import { Jam, fromOffsets } from '../public/lib/jam.mjs';
import { radioKit, RADIO_SR } from '../public/lib/radio.mjs';
import { jamBand, song } from '../public/lib/make.mjs';
import { STYLES, ROLES, parseWav } from '../public/engine.mjs';

test('the built-in set: sixteen pads on the band radioKit makes, each loop its part’s length', () => {
  for (const [seed, style] of [[7, 'lofi'], [12345, 'trap'], [99, 'house']]) {
    const sp = specOf({ seed, style });
    assert.equal(sp.style, style);
    const sr = 8000;
    const { pieces, roles } = radioKit(sp, sr);
    assert.deepEqual(roles, BAND_ROLES, 'the pads point at the pieces radioKit lays out');
    const pads = bandPads(sp);
    assert.equal(pads.length, 16);
    assert.equal(new Set(pads.map(p => p.i)).size, 16, 'every pad a piece of its own');
    const beat = (60 / sp.bpm) * sr;
    for (const p of pads) {
      assert.equal(p.role, roles[p.i]);
      assert.ok(['drum', 'hat', 'bass', 'chords', 'melody'].includes(p.fam));
      assert.ok(p.name.length === 2 && p.name.every(Boolean), 'named in both languages');
      if (p.loop) assert.ok(Math.abs(pieces[p.i].L.length / beat - p.beats) < 0.01, `pad ${p.i}: ${p.beats} beats`);
      else assert.equal(p.fam, 'drum', 'the one-shots are the drums');
      if (p.sub) assert.ok(!p.name[0].startsWith(p.sub[0]), 'no word twice');
      assert.equal(p.phase, p.loop);
    }
    // One chord part, one bass line, one closed hat at a time.
    const groups = Object.groupBy(pads.filter(p => p.group), p => p.group);
    assert.deepEqual(Object.keys(groups).sort(), ['bass', 'hat', 'music']);
    assert.equal(groups.music.length, 4);
    for (const p of pads.filter(p => p.fam === 'chords' || p.fam === 'melody')) assert.ok(p.sub, 'its instrument named');
    assert.equal(new Set(pads.map(p => p.name[0])).size, 16, 'no two pads named alike');
  }
  for (const r of BAND_ROLES) assert.ok(ROLES.includes(r) && FAMILY[r]);
});

test('a set kept made whole; the dice always lands on another groove, the same for the same seed', () => {
  assert.deepEqual(setOf(null), { seed: 1, style: SET_STYLES[0] });
  assert.deepEqual(setOf({ seed: -3, style: 'polka' }), { seed: 1, style: SET_STYLES[0] });
  assert.deepEqual(setOf({ seed: 42, style: 'dnb' }), { seed: 42, style: 'dnb' });
  for (const s of SET_STYLES) assert.ok(STYLES.includes(s));
  const seen = new Set();
  for (let k = 0; k < 200; k++) {
    const from = { seed: k, style: STYLES[k % STYLES.length] };
    const next = diceSet(from, k);
    assert.notEqual(next.style, from.style);
    assert.deepEqual(diceSet(from, k), next);
    seen.add(next.style);
  }
  assert.equal(seen.size, STYLES.length, 'every groove comes up');
  // The same set is the same band: tempo, key, chords.
  assert.deepEqual(specOf({ seed: 5, style: 'afro' }), specOf({ seed: 5, style: 'afro' }));
});

test('loops in a group: one at a time, switched on the bar; a four-bar part joined late plays from that bar of itself', () => {
  const j = new Jam();
  j.record(0);
  const A = { group: 'music', phase: true };
  for (const [i, group] of [[0, 'music'], [6, 'bass']]) {
    const r = j.toggle(i, 0, 16, { group, phase: true });
    assert.ok(r.on && r.at === 0 && !r.off.length);
  }
  assert.deepEqual(j.due(0, 4), [{ i: 0, beat: 0, lp: true }, { i: 6, beat: 0, lp: true }]);
  // Melody at beat 5: from bar 3 (beat 8), its bar 3 (8 beats in); the chords stop there.
  assert.deepEqual(j.toggle(2, 5, 16, A), { on: true, at: 8, off: [0] });
  assert.deepEqual(j.due(4, 20), [{ i: 2, beat: 8, off: 8, lp: true }, { i: 6, beat: 16, lp: true }, { i: 2, beat: 16, lp: true }]);
  assert.ok(!j.loops.has(0), 'the chords are over');
  // A one-bar hat loop is never joined partway.
  j.toggle(8, 21, 4, { group: 'hat', phase: true });
  assert.deepEqual(j.due(20, 28).filter(h => h.i === 8), [{ i: 8, beat: 24, lp: true }]);
  // Stopped (all off at 28), then the take ends at 32.
  assert.deepEqual(j.stopAll(26).off.sort(), [2, 6, 8]);
  j.record(29);
  j.due(28, 40);
  const [take] = j.done;
  const of = i => take.hits.filter(h => h.i === i);
  assert.deepEqual(of(0), [{ i: 0, beat: 0, len: 8 }], 'the chords cut where the melody came in');
  assert.deepEqual(of(2), [{ i: 2, beat: 8, off: 8, len: 8 }, { i: 2, beat: 16, len: 12 }]);
  assert.deepEqual(of(6), [{ i: 6, beat: 0, len: 16 }, { i: 6, beat: 16, len: 12 }]);
  assert.deepEqual(of(8), [{ i: 8, beat: 24, len: 4 }]);
  assert.equal(take.beats, 32);
  // A kit's loops (no phase) are as they were: no cut, no offset.
  const k = new Jam();
  k.record(0);
  k.toggle(1, 0, 8);
  k.toggle(1, 2, 8);
  k.due(0, 8);
  k.end(6);
  assert.deepEqual(k.done[0].hits, [{ i: 1, beat: 0 }]);
});

test('a take’s hits joined partway become pieces of their own, the loop from that beat on', () => {
  const L = Float32Array.from({ length: 100 }, (_, k) => k);
  const pieces = [{ L, R: L }, { L: new Float32Array(10), R: new Float32Array(10) }];
  const out = fromOffsets(pieces, ['riff', 'kick'], [{ i: 0, beat: 0 }, { i: 0, beat: 4, off: 2, len: 1 }, { i: 1, beat: 1 }, { i: 0, beat: 8, off: 2 }], 60, 10);
  assert.equal(out.pieces.length, 3, 'one piece for each part joined, however often');
  assert.deepEqual(out.roles, ['riff', 'kick', 'riff']);
  assert.equal(out.pieces[2].L[0], 20, '2 beats at 60 BPM, 10 samples a second: 20 samples in');
  assert.deepEqual(out.hits, [{ i: 0, beat: 0 }, { i: 2, beat: 4, len: 1 }, { i: 1, beat: 1 }, { i: 2, beat: 8 }]);
  assert.equal(out.pieces[0], pieces[0], 'the rest as they were');
});

test('a take on the built-in set is a song made from its seed and groove, each loop as it was heard', () => {
  const set = { seed: 7, style: 'lofi' };
  const b = jamBand(set);
  assert.equal(b.sr, RADIO_SR);
  assert.deepEqual(b.roles, BAND_ROLES);
  const sp = b.sp;
  const B = (60 / sp.bpm) * b.sr;
  // Unmixed: the melody joined on its bar 2, for a bar, is exactly that bar of it.
  const { info, wav } = song({ band: set, jam: [{ i: 2, beat: 0, off: 4, len: 4 }], plan: null, mix: null }, 32);
  assert.equal(info.style, 'lofi');
  assert.deepEqual(info.key, sp.key);
  const { L } = parseWav(wav.buffer);
  const from = Math.round(4 * B);
  for (const k of [100, 5000, Math.round(2 * B)]) assert.ok(Math.abs(L[k] - b.pieces[2].L[from + k]) < 1e-6, `sample ${k}`);
  assert.ok(Math.abs(L[Math.round(4 * B) + 200]) < 1e-6, 'and cut where it stopped');
});

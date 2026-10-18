// The studio's instruments and clips (lib/synth.mjs): 16 drums, 12
// instruments, accents, chords, swing, 1/2/4 bars, clips kept and resized,
// a groove written for every style, melodies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRUMS, PERC, ALL_DRUMS, INSTRUMENTS, INSTRUMENT_ROLE, OCTAVE, NOTE_LEN, STEPS, BAR_CHOICES, SCALES, GROOVE_STYLES,
  voice, emptyDrums, emptyNotes, clipOf, chordOf, stepHits, swingOf, renderClip, clipEmpty, copyFirstBar, resizeClip, drumPattern, melody, scaleRows
} from '../public/lib/synth.mjs';
import { ROLES, splitPieces } from '../public/engine.mjs';

const peak = x => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const onset = (x, thr = 0.02) => x.findIndex(v => Math.abs(v) > thr);

test('sixteen drums and twelve instruments, each with its role, octave and note length; every sound finite, the same every time', () => {
  assert.equal(ALL_DRUMS.length, 16);
  assert.equal(new Set(ALL_DRUMS).size, 16);
  assert.deepEqual([...DRUMS, ...PERC], ALL_DRUMS);
  assert.equal(INSTRUMENTS.length, 12);
  for (const i of INSTRUMENTS) {
    assert.ok(ROLES.includes(INSTRUMENT_ROLE[i]) && ['riff', 'bass'].includes(INSTRUMENT_ROLE[i]), i);
    assert.ok(Number.isInteger(OCTAVE[i]) && OCTAVE[i] % 12 === 0, i);
    assert.ok(Number.isInteger(NOTE_LEN[i]) && NOTE_LEN[i] >= 1, i);
  }
  for (const d of PERC) {
    const x = voice(d, 36, 48000);
    assert.ok(peak(x) > 0.05 && peak(x) <= 1.05, `${d} peak ${peak(x)}`);
    assert.ok(Math.abs(x.at(-1)) < 1e-3, `${d} ends quiet`);
  }
  for (const v of [...ALL_DRUMS, ...INSTRUMENTS]) {
    for (const [midi, hold] of [[24, 0], [60, 0.1], [96, 2]]) {
      const x = voice(v, midi, 22050, hold);
      assert.ok(x.every(Number.isFinite), `${v} ${midi}`);
      assert.ok(peak(x) <= 1.5, `${v} ${midi} peak ${peak(x)}`);
    }
    assert.deepEqual(voice(v, 57, 8000, 0.2), voice(v, 57, 8000, 0.2), `${v} the same twice`);
  }
  // A note held longer lasts longer; the 808 follows its pitch.
  assert.ok(voice('pad', 60, 8000, 1).length > voice('pad', 60, 8000, 0.1).length);
  assert.notDeepEqual(voice('sub', 33, 8000), voice('sub', 40, 8000));
});

test('steps: accents louder, off-beat hats softer, the 808 at its pitch; chords as three notes, softer', () => {
  const d = emptyDrums(1);
  d.steps.kick[0] = 2; d.steps.kick[4] = 1; d.steps.hat[1] = 1; d.steps.hat[3] = 2; d.steps.hat[2] = 1; d.steps.sub[8] = 1; d.pitch = 40;
  assert.deepEqual(stepHits(d, 0), [{ inst: 'kick', midi: 36, len: 1, gain: 1.35 }]);
  assert.deepEqual(stepHits(d, 4)[0].gain, 1);
  assert.equal(stepHits(d, 1)[0].gain, 0.7);
  assert.ok(Math.abs(stepHits(d, 3)[0].gain - 0.945) < 1e-12);
  assert.equal(stepHits(d, 2)[0].gain, 1);
  assert.equal(stepHits(d, 8)[0].midi, 40);
  assert.deepEqual(stepHits(d, 5), []);
  assert.deepEqual(stepHits(d, 999), [], 'past the clip: nothing');
  const n = emptyNotes('pad', 1, { tonic: 9, minor: true });
  n.notes.push({ step: 0, midi: 57, len: 8, chord: true }, { step: 0, midi: 76, len: 2 });
  assert.deepEqual(stepHits(n, 0).map(h => [h.midi, h.gain, h.len]), [[57, 0.62, 8], [60, 0.62, 8], [64, 0.62, 8], [76, 1, 2]]);
  // An accent renders 1.35 times as loud (less the noise floor, the same in both).
  const a = emptyDrums(1), b = emptyDrums(1);
  a.steps.snare[4] = 1; b.steps.snare[4] = 2;
  const ra = renderClip(a, 8000, 120).L, rb = renderClip(b, 8000, 120).L;
  const floor = renderClip(emptyDrums(1), 8000, 120).L;
  let j = 0;
  for (let k = 0; k < ra.length; k++) if (Math.abs(ra[k] - floor[k]) > Math.abs(ra[j] - floor[j])) j = k;
  assert.ok(Math.abs((rb[j] - floor[j]) / (ra[j] - floor[j]) - 1.35) < 1e-3);
});

test('chordOf: the triad in the key from any note, any octave', () => {
  const C = { tonic: 0, minor: false }, Am = { tonic: 9, minor: true };
  assert.deepEqual(chordOf(60, C), [60, 64, 67]);
  assert.deepEqual(chordOf(62, C), [62, 65, 69]);
  assert.deepEqual(chordOf(67, C), [67, 71, 74], 'G major, over the octave');
  assert.deepEqual(chordOf(71, C), [71, 74, 77], 'B diminished');
  assert.deepEqual(chordOf(69, C), [69, 72, 76]);
  assert.deepEqual(chordOf(57, Am), [57, 60, 64]);
  assert.deepEqual(chordOf(55, Am), [55, 59, 62]);
  assert.deepEqual(chordOf(57, null), [57, 60, 64], 'no key: A minor');
  assert.deepEqual(chordOf(61, C), [61, 65, 68], 'a note out of the key: its major triad');
  assert.deepEqual(chordOf(9, Am), [9, 12, 16], 'low notes too');
  for (const key of [C, Am, { tonic: 6, minor: true }, { tonic: 11, minor: false }])
    for (let m = 36; m < 84; m++) {
      const ch = chordOf(m, key);
      assert.equal(ch[0], m);
      assert.ok(ch[1] > m && ch[2] > ch[1] && ch[2] - m <= 8, `${m} ${JSON.stringify(key)}: ${ch}`);
      const scale = key.minor ? SCALES.minor : SCALES.major;
      if (scale.includes((m - key.tonic + 120) % 12)) for (const x of ch) assert.ok(scale.includes((x - key.tonic + 120) % 12), `${x} in key`);
    }
});

test('swing: odd 16ths late by their share, rendered there; each bar choice exactly its bars long', () => {
  const d = emptyDrums(1);
  d.swing = 0.5;
  assert.equal(swingOf(d, 0), 0);
  assert.equal(swingOf(d, 1), 0.5);
  assert.equal(swingOf({ ...d, swing: undefined }, 1), 0);
  d.steps.rim[1] = 1;
  const sr = 8000, B = 4000;   // 120 BPM
  assert.ok(Math.abs(onset(renderClip(d, sr, 120).L) - (1.5 / 4) * B) <= 2);
  d.swing = 0;
  assert.ok(Math.abs(onset(renderClip(d, sr, 120).L) - (1 / 4) * B) <= 2);
  assert.deepEqual(BAR_CHOICES, [1, 2, 4]);
  for (const bars of BAR_CHOICES) {
    const c = drumPattern('house', 1, bars);
    for (const lane of Object.values(c.steps)) assert.equal(lane.length, STEPS * bars);
    const r = renderClip(c, sr, 90);
    assert.equal(r.L.length, Math.round(bars * 4 * (60 / 90) * sr));
    assert.equal(splitPieces(r).length, 1, 'one piece, whatever its gaps');
    const m = renderClip(melody({ tonic: 2, minor: false }, 'strings', 1, bars), sr, 90);
    assert.equal(m.L.length, Math.round(bars * 4 * (60 / 90) * sr));
    assert.ok(m.L.every(Number.isFinite));
  }
});

test('clipOf: anything kept or typed made a whole clip, or nothing', () => {
  for (const bad of [null, undefined, 1, 'clip', [], {}, { kind: 'video' }]) assert.equal(clipOf(bad), null);
  const d = clipOf({ kind: 'drums', bars: 3, swing: 9, pitch: 99, steps: { kick: [2, 1, 0, 5, 'x', null], snare: 'no', bogus: [1] } });
  assert.equal(d.bars, 1, 'not a bar choice: one bar');
  assert.equal(d.swing, 0.6);
  assert.equal(d.pitch, 33);
  assert.deepEqual(Object.keys(d.steps), ALL_DRUMS, 'every lane, and only those');
  assert.deepEqual(d.steps.kick.slice(0, 7), [2, 1, 0, 1, 1, 0, 0]);
  assert.equal(d.steps.kick.length, 16);
  assert.ok(d.steps.snare.every(v => v === 0));
  assert.equal(clipOf({ kind: 'drums', bars: 2, swing: -1, pitch: 40, steps: {} }).swing, 0);
  assert.equal(clipOf({ kind: 'drums', bars: 2, pitch: 40, steps: {} }).pitch, 40);
  assert.equal(clipOf({ kind: 'drums', bars: 4, steps: { hat: Array(100).fill(1) } }).steps.hat.length, 64, 'too long a lane cut');
  const n = clipOf({ kind: 'notes', inst: 'theremin', bars: 2, swing: NaN, key: { tonic: 12, minor: true }, notes: [
    { step: 0, midi: 60, len: 2 }, { step: 31, midi: 61, len: 0.4, chord: 1 }, { step: 32, midi: 60, len: 1 }, { step: -1, midi: 60 },
    { step: 1.5, midi: 60 }, { step: 2, midi: 11 }, { step: 3, midi: 121 }, { step: 4, midi: 60, len: 1000 }, null, 'x', { step: 5, midi: 62 }
  ] });
  assert.deepEqual(n, { kind: 'notes', inst: 'keys', bars: 2, swing: 0, key: null, notes: [
    { step: 0, midi: 60, len: 2 }, { step: 31, midi: 61, len: 1, chord: true }, { step: 4, midi: 60, len: 64 }, { step: 5, midi: 62, len: 1 }
  ] });
  assert.deepEqual(clipOf({ kind: 'notes', inst: 'bell', key: { tonic: 4, minor: 0 } }).key, { tonic: 4, minor: false });
  // Whole clips come back as they were.
  for (const c of [drumPattern('afro', 5, 4), melody({ tonic: 7, minor: true }, 'organ', 3, 2), emptyNotes('vox', 4, null)]) assert.deepEqual(clipOf(JSON.parse(JSON.stringify(c))), c);
});

test('copy the first bar over the rest; resize to any bar choice: longer repeats, shorter keeps the start; the original untouched', () => {
  const d = emptyDrums(4);
  d.steps.kick[0] = 2; d.steps.snare[4] = 1; d.steps.hat[20] = 1; d.steps.clap[63] = 1;
  const before = JSON.stringify(d);
  const c = copyFirstBar(d);
  assert.equal(JSON.stringify(d), before);
  for (const lane of ALL_DRUMS) for (let s = 0; s < 64; s++) assert.equal(c.steps[lane][s], d.steps[lane][s % 16], `${lane} ${s}`);
  assert.deepEqual(copyFirstBar(emptyDrums(1)), emptyDrums(1));
  const n = emptyNotes('keys', 2);
  n.notes.push({ step: 0, midi: 60, len: 2 }, { step: 15, midi: 64, len: 4, chord: true }, { step: 20, midi: 67, len: 1 });
  assert.deepEqual(copyFirstBar(n).notes.map(x => x.step), [0, 15, 16, 31]);
  assert.equal(copyFirstBar(n).notes[3].chord, true);
  assert.equal(n.notes.length, 3);

  for (const from of BAR_CHOICES)
    for (const to of BAR_CHOICES) {
      const p = drumPattern('dnb', from * 10 + to, from);
      const r = resizeClip(p, to);
      assert.equal(r.bars, to);
      for (const lane of ALL_DRUMS) {
        assert.equal(r.steps[lane].length, 16 * to);
        for (let s = 0; s < 16 * to; s++) assert.equal(r.steps[lane][s], p.steps[lane][s % (16 * from)], `${from}->${to} ${lane} ${s}`);
      }
      const m = melody({ tonic: 0, minor: false }, 'keys', from + to, from);
      const rm = resizeClip(m, to);
      assert.ok(rm.notes.every(x => x.step >= 0 && x.step < 16 * to), `${from}->${to}`);
      assert.equal(rm.notes.length, to >= from ? (m.notes.length * to) / from : m.notes.filter(x => x.step < 16 * to).length);
      assert.deepEqual(resizeClip(resizeClip(m, 4), from).notes, m.notes, 'out and back: the same');
      assert.equal(m.bars, from, 'original untouched');
    }
});

test('a groove written for every style: its lanes on the grid, a harder downbeat, the swung ones swung; the same for the same seed', () => {
  for (const style of GROOVE_STYLES)
    for (const bars of BAR_CHOICES) {
      const c = drumPattern(style, 9, bars);
      assert.deepEqual(c, drumPattern(style, 9, bars));
      assert.ok(!clipEmpty(c), style);
      for (const lane of ALL_DRUMS) {
        assert.equal(c.steps[lane].length, 16 * bars);
        assert.ok(c.steps[lane].every(v => v === 0 || v === 1 || v === 2), `${style} ${lane}`);
        if (lane !== 'kick') assert.ok(!c.steps[lane].includes(2), `${style}: accents on the kick's downbeats only`);
      }
      for (let b = 0; b < bars; b++) assert.ok([0, 2].includes(c.steps.kick[b * 16]), `${style} bar ${b}`);
      assert.ok([31, 33, 34, 36].includes(c.pitch));
      assert.equal(c.swing, ['lofi', 'boombap', 'garage', 'hiphop'].includes(style) ? 0.25 : 0);
      assert.deepEqual(clipOf(c), c, 'a valid clip');
    }
  assert.deepEqual(drumPattern('nope', 2, 1), drumPattern('trap', 2, 1), 'an unknown style: trap');
});

test('melodies: in the key, in the bars, ending home; basses low, pads in chords', () => {
  for (const inst of INSTRUMENTS)
    for (const bars of BAR_CHOICES)
      for (const key of [{ tonic: 0, minor: false }, { tonic: 6, minor: true }]) {
        const m = melody(key, inst, bars * 13, bars);
        assert.equal(m.bars, bars);
        assert.equal(m.inst, inst);
        assert.deepEqual(m.key, key);
        assert.ok(m.notes.length >= bars, `${inst} ${bars}`);
        const scale = key.minor ? SCALES.minor : SCALES.major;
        for (const n of m.notes) {
          assert.ok(n.step >= 0 && n.step < 16 * bars && n.len >= 1 && n.step + n.len <= 16 * bars, `${inst}: ${JSON.stringify(n)}`);
          assert.ok(scale.includes((n.midi - key.tonic + 120) % 12));
          assert.ok(n.midi >= OCTAVE[inst] - 12 && n.midi < OCTAVE[inst] + 24, `${inst} ${n.midi}`);
        }
        assert.equal((m.notes.at(-1).midi - key.tonic + 120) % 12, 0, 'ends home');
        assert.equal(m.notes.every(n => n.chord), ['pad', 'strings', 'organ'].includes(inst));
        assert.deepEqual(clipOf(m), m);
      }
  assert.deepEqual(scaleRows(0, false, 60, 8), [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.deepEqual(scaleRows(9, true, 36, 3), [33, 35, 36]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRUMS, INSTRUMENTS, voice, renderClip, emptyDrums, drumPattern, melody, scaleRows, clipEmpty, GROOVE_STYLES, SCALES } from '../public/lib/synth.mjs';
import { splitPieces, STYLES, analyzeRecording } from '../public/engine.mjs';

const peak = x => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('every drum and instrument sounds, within full scale, and dies away', () => {
  for (const d of [...DRUMS, ...INSTRUMENTS]) {
    const x = voice(d, 57, 48000, 0.25);
    assert.ok(x.length > 1000, d);
    assert.ok(peak(x) > 0.05 && peak(x) <= 1.05, `${d} peak ${peak(x)}`);
    assert.ok(Math.abs(x[x.length - 1]) < 1e-3, `${d} ends quiet`);
  }
});

test('a clip is one piece exactly its bars long, whatever its gaps', () => {
  const clip = emptyDrums(2);
  clip.steps.kick[0] = 1;
  clip.steps.snare[28] = 1;   // a long silence between them
  const r = renderClip(clip, 48000, 120);
  assert.equal(r.L.length, 2 * 4 * 24000);
  const pieces = splitPieces(r);
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].L.length, r.L.length);
  assert.ok(clipEmpty(emptyDrums()));
  assert.ok(!clipEmpty(clip));
});

test('自動編: every groove the engine plays has a drum pattern; melodies keep to the key', () => {
  assert.deepEqual([...GROOVE_STYLES].sort(), [...STYLES].sort());
  for (const s of STYLES) {
    const c = drumPattern(s, 3, 2);
    assert.ok(!clipEmpty(c), s);
    assert.equal(c.steps.kick.length, 32);
  }
  const rows = scaleRows(9, true, 60, 8);
  assert.deepEqual(rows.map(m => m % 12), [9, 11, 0, 2, 4, 5, 7, 9]);   // A minor from A
  for (const inst of INSTRUMENTS)
    for (let seed = 1; seed <= 5; seed++) {
      const m = melody({ tonic: 9, minor: true }, inst, seed, 2);
      assert.ok(m.notes.length >= 2, inst);
      for (const n of m.notes) assert.ok(SCALES.minor.includes((n.midi - 9 + 120) % 12), `${inst} ${n.midi} in A minor`);
      assert.equal(m.notes.at(-1).midi % 12, 9, 'ends home');
    }
});

test('a melody clip is heard as a loop of its bars (a riff), a drum clip as drums', () => {
  const r = renderClip(melody({ tonic: 0, minor: false }, 'keys', 4, 1), 48000, 120);
  const a = analyzeRecording(splitPieces(r), 48000, { bpm: 120 });
  assert.equal(a.loops[0], 4);
});

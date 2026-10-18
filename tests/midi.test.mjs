import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PPQ, GM_DRUMS, midiFile, readMidi, songTracks, clipTracks } from '../public/lib/midi.mjs';
import { BUS_OF } from '../public/lib/mix.mjs';
import { ALL_DRUMS, emptyDrums, emptyNotes, chordOf, drumPattern, melody } from '../public/lib/synth.mjs';
import { makeSong, demoRecording, splitPieces, analyzeRecording } from '../public/engine.mjs';

// Walk a file chunk by chunk, checking every length; -> [{ id, body }]
function chunks(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let o = 0;
  while (o < bytes.length) {
    assert.ok(o + 8 <= bytes.length, 'a whole chunk header');
    const id = String.fromCharCode(...bytes.subarray(o, o + 4)), len = v.getUint32(o + 4);
    assert.ok(o + 8 + len <= bytes.length, `${id} fits`);
    out.push({ id, body: bytes.subarray(o + 8, o + 8 + len) });
    o += 8 + len;
  }
  assert.equal(o, bytes.length, 'nothing after the last chunk');
  return out;
}
// Each track's events read strictly: delta times, statuses, and the end-of-track only at the end.
function events(body) {
  const evs = [];
  let p = 0, t = 0;
  const vlq = () => { let n = 0, b, k = 0; do { b = body[p++]; n = n * 128 + (b & 0x7f); assert.ok(++k <= 4, 'a VLQ of 4 bytes at most'); } while (b & 0x80); return n; };
  while (p < body.length) {
    t += vlq();
    const st = body[p++];
    assert.ok(st & 0x80, 'every event has its status (no running status)');
    if (st === 0xff) {
      const type = body[p++], len = vlq();
      evs.push({ t, meta: type, data: body.subarray(p, p + len) });
      p += len;
      if (type === 0x2f) assert.equal(p, body.length, 'end of track is the last event');
    } else {
      assert.ok([0x80, 0x90].includes(st & 0xf0), `note events only: ${st.toString(16)}`);
      const note = body[p++], vel = body[p++];
      assert.ok(note < 128 && vel < 128);
      evs.push({ t, st, note, vel });
    }
  }
  assert.equal(evs.at(-1).meta, 0x2f);
  return evs;
}

test('a valid Standard MIDI File: the header, a tempo track, a track each, every length right', () => {
  const file = midiFile({ bpm: 125, tracks: [
    { name: 'Drums', channel: 9, notes: [{ beat: 0, beats: 0.25, note: 36, vel: 100 }, { beat: 1, beats: 0.25, note: 38, vel: 90 }] },
    { name: 'Keys', channel: 0, notes: [{ beat: 0.5, beats: 2, note: 60, vel: 80 }] }
  ] });
  const cs = chunks(file);
  assert.deepEqual(cs.map(c => c.id), ['MThd', 'MTrk', 'MTrk', 'MTrk']);
  assert.deepEqual([...cs[0].body], [0, 1, 0, 3, PPQ >> 8, PPQ & 255], 'format 1, 3 tracks, 480 a beat');
  const meta = events(cs[1].body);
  const tempo = meta.find(e => e.meta === 0x51).data;
  assert.equal((tempo[0] << 16) | (tempo[1] << 8) | tempo[2], 480000, '125 BPM: 480000 µs a beat');
  assert.deepEqual([...meta.find(e => e.meta === 0x58).data], [4, 2, 24, 8], '4/4');
  for (const c of cs.slice(2)) {
    const evs = events(c.body);
    const ons = evs.filter(e => (e.st & 0xf0) === 0x90).length, offs = evs.filter(e => (e.st & 0xf0) === 0x80).length;
    assert.equal(ons, offs, 'every note ends');
    for (let k = 1; k < evs.length; k++) assert.ok(evs[k].t >= evs[k - 1].t, 'in time order');
  }
  assert.equal(events(cs[2].body).find(e => e.st).st, 0x99, 'drums on channel 10');
});

test('read back: tempo, names, every note as written (to a tick)', () => {
  const notes = [{ beat: 0, beats: 1, note: 60, vel: 100 }, { beat: 0, beats: 0.5, note: 64, vel: 70 }, { beat: 3.75, beats: 0.25, note: 67, vel: 127 }, { beat: 1000, beats: 4, note: 48, vel: 1 }];
  for (const bpm of [60, 93.5, 125, 140, 200]) {
    const back = readMidi(midiFile({ bpm, tracks: [{ name: '旋律 Keys', channel: 3, notes }] }));
    assert.ok(Math.abs(back.bpm - bpm) < 0.01, `${bpm} -> ${back.bpm}`);
    assert.equal(back.tracks.length, 1);
    assert.equal(back.tracks[0].name, '旋律 Keys');
    const got = back.tracks[0].notes.map(n => ({ beat: n.beat, beats: n.beats, note: n.note, vel: n.vel })).sort((a, b) => a.beat - b.beat || a.note - b.note);
    assert.deepEqual(got, [...notes].sort((a, b) => a.beat - b.beat || a.note - b.note));
    assert.ok(back.tracks[0].notes.every(n => n.channel === 3));
  }
  // Far into a song: a 4-byte delta.
  const far = readMidi(midiFile({ bpm: 120, tracks: [{ name: 'x', channel: 0, notes: [{ beat: 100000, beats: 1, note: 60, vel: 100 }] }] }));
  assert.equal(far.tracks[0].notes[0].beat, 100000);
});

test('the same note again before it ends: ended there, never two at once; the same note twice at once: one', () => {
  const back = readMidi(midiFile({ bpm: 120, tracks: [{ name: 't', channel: 0, notes: [
    { beat: 1, beats: 1, note: 60, vel: 90 }, { beat: 0, beats: 4, note: 60, vel: 100 },   // out of order
    { beat: 2, beats: 1, note: 60, vel: 80 }, { beat: 2, beats: 3, note: 60, vel: 80 },     // a duplicate
    { beat: 0, beats: 8, note: 62, vel: 50 }                                                  // another note held over them
  ] }] }));
  const sixty = back.tracks[0].notes.filter(n => n.note === 60).sort((a, b) => a.beat - b.beat);
  assert.deepEqual(sixty.map(n => [n.beat, n.beats, n.vel]), [[0, 1, 100], [1, 1, 90], [2, sixty[2].beats, 80]]);
  assert.ok([1, 3].includes(sixty[2].beats));
  assert.deepEqual(back.tracks[0].notes.filter(n => n.note === 62).map(n => [n.beat, n.beats]), [[0, 8]]);
  // A note of no length still sounds a tick; out-of-range values are brought in.
  const odd = readMidi(midiFile({ bpm: 120, tracks: [{ name: 'o', channel: 17, notes: [
    { beat: 0, beats: 0, note: 200, vel: 500 }, { beat: -3, beats: 1, note: -4, vel: 0 }, { beat: 2, beats: 1, note: 61.7, vel: undefined }
  ] }] })).tracks[0].notes.sort((a, b) => a.beat - b.beat || a.note - b.note);
  assert.deepEqual(odd.map(n => [n.beat, n.note, n.vel, n.channel]), [[0, 0, 100, 1], [0, 127, 127, 1], [2, 61, 100, 1]]);
  assert.equal(odd.find(n => n.note === 127).beats, 1 / PPQ);
});

test('no tracks, an empty track, not a MIDI file', () => {
  const none = midiFile({ bpm: 120, tracks: [] });
  assert.equal(chunks(none).length, 2);
  assert.deepEqual(readMidi(none), { bpm: 120, tracks: [] });
  const empty = readMidi(midiFile({ bpm: 90, tracks: [{ name: 'Empty', channel: 0, notes: [] }] }));
  assert.deepEqual(empty.tracks, [{ name: 'Empty', notes: [] }]);
  assert.throws(() => readMidi(new Uint8Array(20)), /Not a MIDI file/);
  // Reading a byte slice of a larger buffer.
  const f = midiFile({ bpm: 100, tracks: [{ name: 'a', channel: 0, notes: [{ beat: 0, beats: 1, note: 60, vel: 100 }] }] });
  const big = new Uint8Array(f.length + 10);
  big.set(f, 5);
  assert.equal(readMidi(big.subarray(5, 5 + f.length)).tracks[0].notes.length, 1);
});

test("a clip's tracks: drums on channel 10 by General MIDI's notes, accents louder, swing late; chords as three notes", () => {
  assert.deepEqual(Object.keys(GM_DRUMS).sort(), [...ALL_DRUMS].sort(), 'every drum has its note');
  assert.equal(new Set(Object.values(GM_DRUMS)).size, ALL_DRUMS.length, 'each its own');
  const d = emptyDrums(2);
  d.swing = 0.5;
  d.steps.kick[0] = 2; d.steps.kick[16] = 1; d.steps.hat[1] = 1; d.steps.hat[3] = 2; d.steps.crash[31] = 1;
  const [t] = clipTracks(d, 'Beat');
  assert.equal(t.channel, 9);
  assert.equal(t.name, 'Beat');
  const by = Object.fromEntries(t.notes.map(n => [`${n.note}@${n.beat}`, n.vel]));
  assert.deepEqual(by, { '36@0': 125, '36@4': 96, [`42@${1.5 / 4}`]: 67, [`42@${3.5 / 4}`]: 91, [`49@${31.5 / 4}`]: 96 });
  const back = readMidi(midiFile({ bpm: 120, tracks: clipTracks(drumPattern('funk', 3, 4)) }));
  assert.ok(back.tracks[0].notes.length > 40 && back.tracks[0].notes.every(n => n.channel === 9));
  const n = emptyNotes('pad', 1, { tonic: 0, minor: false });
  n.notes.push({ step: 0, midi: 62, len: 8, chord: true }, { step: 8, midi: 67, len: 4 });
  const [nt] = clipTracks(n);
  assert.equal(nt.channel, 0);
  assert.deepEqual(nt.notes.map(x => [x.beat, x.note, x.beats, x.vel]), [...chordOf(62, n.key).map(m => [0, m, 2, 60]), [2, 67, 1, 96]]);
  assert.deepEqual(chordOf(62, n.key), [62, 65, 69], 'D minor in C major');
  for (const inst of ['keys', 'bass', 'strings']) {
    const m = melody({ tonic: 9, minor: true }, inst, 4, 2);
    assert.ok(readMidi(midiFile({ bpm: 120, tracks: clipTracks(m) })).tracks[0].notes.length >= m.notes.length, inst);
  }
});

test("a song's tracks: one a bus, each piece its own note, every hit there", () => {
  const rec = demoRecording(), pieces = splitPieces(rec), analysis = analyzeRecording(pieces, rec.sr);
  const { events } = makeSong(pieces, rec.sr, 9, { analysis, minBars: 8, maxBars: 8 });
  const tracks = songTracks(events, analysis.roles, pieces, rec.sr, 125, { keys: '旋律' });
  assert.deepEqual(tracks.map(t => t.name), ['Drums', 'Hats', 'Bass', '旋律'].map(x => (x === 'Drums' || x === 'Hats' || x === 'Bass' ? x.toLowerCase() : x)));
  assert.deepEqual(tracks.map(t => t.channel), [0, 1, 2, 3]);
  assert.equal(tracks.reduce((s, t) => s + t.notes.length, 0), events.length);
  for (const t of tracks) for (const n of t.notes) assert.ok(n.beats >= 0.25 && n.beats <= 16 && n.note >= 36 && n.note < 36 + 24 && n.beat >= 0);
  const back = readMidi(midiFile({ bpm: 125, tracks }));
  assert.equal(back.bpm, 125);
  // (Hits of one piece at the same moment are one note.)
  const distinct = new Set(events.map(e => `${e.i}@${Math.round((e.a / (60 / 125 * rec.sr)) * PPQ)}`)).size;
  assert.equal(back.tracks.reduce((s, t) => s + t.notes.length, 0), distinct);
  for (const t of back.tracks) for (const n of t.notes) assert.equal(BUS_OF[analysis.roles[n.note - 36]], ['drums', 'hats', 'bass', 'keys'][n.channel]);
  // A bus with no hits has no track.
  assert.deepEqual(songTracks(events.filter(e => analysis.roles[e.i] === 'riff'), analysis.roles, pieces, rec.sr, 125).map(t => t.name), ['keys']);
});

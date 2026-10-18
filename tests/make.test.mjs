import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as make from '../public/lib/make.mjs';
import { readMidi } from '../public/lib/midi.mjs';
import { MIX, CEILING, BUS_OF } from '../public/lib/mix.mjs';
import { STYLES, demoRecording, splitPieces, analyzeRecording, parseWav, makeSong, encodeWav, crc32, renderEvents } from '../public/engine.mjs';

const rec = demoRecording();
const pieces = splitPieces(rec);
const heard = analyzeRecording(pieces, rec.sr);
const kit = { pieces, sr: rec.sr, heard, bpm: heard.bpm, roles: heard.roles };
const recipe = { seed: 4, minBars: 8, maxBars: 8, styles: STYLES, humanize: 100, mix: MIX };

// A stored zip's files: [{ name, data }], checking each local header against the central directory.
function unzip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = bytes.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50);
  const count = v.getUint16(end + 10, true);
  let c = v.getUint32(end + 16, true);
  const out = [];
  for (let k = 0; k < count; k++) {
    assert.equal(v.getUint32(c, true), 0x02014b50);
    const size = v.getUint32(c + 20, true), nlen = v.getUint16(c + 28, true), at = v.getUint32(c + 42, true), crc = v.getUint32(c + 16, true);
    const name = new TextDecoder().decode(bytes.subarray(c + 46, c + 46 + nlen));
    assert.equal(v.getUint32(at, true), 0x04034b50);
    const ln = v.getUint16(at + 26, true);
    const data = bytes.subarray(at + 30 + ln, at + 30 + ln + size);
    assert.equal(crc32(data), crc, name);
    out.push({ name, data });
    c += 46 + nlen;
  }
  return out;
}

test('before a kit: every call says so', () => {
  assert.throws(() => make.song(recipe), /No kit/);
  assert.throws(() => make.stems(recipe), /No kit/);
  assert.throws(() => make.midi(recipe), /No kit/);
  assert.throws(() => make.song({ jam: [{ i: 0, beat: 0 }] }), /No kit/);
});

test('a song from the demo kit: a WAV, the same as the engine makes, mixed under the ceiling', () => {
  assert.equal(make.setKit(kit), true);
  const { info, wav } = make.song(recipe);
  const direct = makeSong(pieces, rec.sr, 4, { analysis: heard, roles: heard.roles, minBars: 8, maxBars: 8, humanize: 1, mix: MIX });
  assert.deepEqual(wav, encodeWav(direct.audio, 16));
  assert.equal(info.mixed, true);
  assert.equal(info.bars, 8);
  const back = parseWav(wav);
  assert.equal(back.sr, rec.sr);
  assert.ok(back.L.every(v => Math.abs(v) <= CEILING + 1e-4));
  const f32 = parseWav(make.song(recipe, 32).wav);
  assert.equal(f32.L.length, back.L.length);
  // Each option of a recipe goes through.
  const s = make.song({ ...recipe, style: 'phonk', plan: [['intro', 2], ['verse', 4], ['pre', 2], ['hook', 4], ['outro', 2]], detail: 7, humanize: 0, mix: { ...MIX, on: false } }).info;
  assert.deepEqual([s.style, s.detail, s.bars, s.mixed], ['phonk', 7, 14, false]);
  assert.deepEqual(s.plan.map(([t]) => t), ['intro', 'verse', 'pre', 'hook', 'outro']);
  assert.equal(make.song({ ...recipe, styles: ['trap'], weights: { trap: 5 } }).info.style, 'trap');
});

test('a recipe missing its settings (an old kept song) still makes the song it would have', () => {
  const bare = make.song({ seed: 4 });
  for (const v of parseWav(bare.wav).L) assert.ok(Number.isFinite(v));
  assert.ok(bare.info.peak > 0.1, 'not silent');
  assert.deepEqual(bare.wav, make.song({ seed: 4, humanize: 100, minBars: 25, maxBars: 29, styles: STYLES, mix: null }).wav);
});

test("a kit at a tempo set by hand: the song at that tempo, its loops heard again", () => {
  make.setKit({ ...kit, bpm: 100 });
  try {
    const { info } = make.song(recipe);
    assert.equal(info.bpm, 100);
    assert.ok(info.seconds > info.beats * 0.6 && info.seconds < info.beats * 0.6 + 6, `${info.seconds}s for ${info.beats} beats`);
    assert.equal(readMidi(make.midi(recipe)).bpm, 100);
  } finally {
    make.setKit(kit);
  }
});

test('stems: a zip of each bus as a WAV, named, summing to the song', () => {
  const zip = make.stems(recipe, 32, { title: 'My Song', names: { drums: '鼓' } });
  const files = unzip(zip);
  assert.deepEqual(files.map(f => f.name).sort(), ['My Song - bass.wav', 'My Song - fx.wav', 'My Song - hats.wav', 'My Song - keys.wav', 'My Song - 鼓.wav'].sort());
  const song = parseWav(make.song(recipe, 32).wav);
  const parts = files.map(f => parseWav(f.data));
  for (const p of parts) assert.equal(p.L.length, song.L.length);
  let worst = 0;
  for (let j = 0; j < song.L.length; j += 3) {
    let l = 0, r = 0;
    for (const p of parts) { l += p.L[j]; r += p.R[j]; }
    worst = Math.max(worst, Math.abs(l - song.L[j]), Math.abs(r - song.R[j]));
  }
  assert.ok(worst < 1e-5, `stems off the mix by ${worst}`);
  // Unmixed: the buses alone, no fx; the default title.
  const plain = unzip(make.stems({ ...recipe, mix: { on: false } }));
  assert.deepEqual(plain.map(f => f.name).sort(), ['drums', 'hats', 'bass', 'keys'].map(b => `Orbit Beats - ${b}.wav`).sort());
});

test("MIDI: the song's hits, a track a bus, at the kit's tempo", () => {
  const m = readMidi(make.midi(recipe, { names: { keys: 'Melody' } }));
  assert.equal(m.bpm, 125);
  assert.deepEqual(m.tracks.map(t => t.name), ['drums', 'hats', 'bass', 'Melody']);
  for (const t of m.tracks) for (const n of t.notes) assert.ok(BUS_OF[heard.roles[n.note - 36]] === ['drums', 'hats', 'bass', 'keys'][n.channel]);
  // The same song with or without the mixer: the same hits.
  const unmixed = readMidi(make.midi({ ...recipe, mix: null }));
  assert.deepEqual(unmixed.tracks.map(t => t.notes), m.tracks.map(t => t.notes));
  assert.ok(m.tracks.every(t => t.notes.length > 0));
});

test("a jam's take: its hits on the grid, mixed as asked; hits on no piece left out", () => {
  const jam = [{ i: 9, beat: 0 }, { i: 12, beat: 0 }, { i: 11, beat: 1 }, { i: 9, beat: 2 }, { i: 18, beat: 4 }, { i: 99, beat: 1 }, { i: -1, beat: 1 }, { i: 9, beat: -2 }];
  const { info, wav } = make.song({ jam, mix: MIX });
  assert.equal(info.bars, 2);
  assert.deepEqual(info.plan, [['verse', 2]]);
  assert.equal(info.mixed, true);
  assert.ok(parseWav(wav).L.every(Number.isFinite));
  const r = renderEvents(pieces, rec.sr, 125, heard.roles, jam, { mix: null });
  assert.equal(r.events.length, 5, 'only hits on real pieces, from beat 0');
  const B = (60 / 125) * rec.sr;
  assert.deepEqual(r.events.map(e => e.a), [0, 0, Math.round(B), Math.round(2 * B), Math.round(4 * B)]);
  // A plan given, stems, MIDI.
  assert.deepEqual(make.song({ jam, plan: [['intro', 1], ['hook', 3]], mix: MIX }).info.plan, [['intro', 1], ['hook', 3]]);
  assert.deepEqual(unzip(make.stems({ jam, mix: MIX })).map(f => f.name).sort(), ['bass', 'drums', 'fx', 'keys'].map(b => `Orbit Beats - ${b}.wav`), 'no hats played, no hats stem');
  assert.equal(readMidi(make.midi({ jam })).tracks.reduce((s, t) => s + t.notes.length, 0), 5);
  // An empty take: a short silence, not an error.
  const empty = make.song({ jam: [], mix: MIX });
  assert.equal(empty.info.bars, 1);
  assert.ok(parseWav(empty.wav).L.every(v => v === 0));
  // A long take (over 128 bars, ~4 min at 125): still a song, in 16-bar verses.
  const long = renderEvents(pieces, 8000, 125, heard.roles, [{ i: 9, beat: 0 }, { i: 9, beat: 4 * 140 }], {});
  assert.equal(long.info.bars, 141);
  assert.equal(long.info.plan.reduce((s, [, n]) => s + n, 0), 141);
  assert.ok(long.info.plan.every(([t, n]) => t === 'verse' && n >= 1 && n <= 16));
  assert.throws(() => renderEvents(pieces, rec.sr, 125, heard.roles.slice(1), jam), /a role for each/);
});

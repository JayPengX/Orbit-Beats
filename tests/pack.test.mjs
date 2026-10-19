// 歌單's songs kept small (lib/pack.mjs): the .m4a laid out as a player
// reads it (moov first, every frame in the table, the encoder's start cut),
// which songs are packed and that a packed one is left alone after, the
// sizes, and how a song made again is told from a different one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { m4a, slimTo, kindOf, builtIn, formOf, soundOf, mbText, sizeOf, monoWav, sameSong, envelope } from '../public/lib/pack.mjs';
import { parseWav } from '../public/engine.mjs';

// The boxes of an MP4, with where each starts: { type, at, size, body }.
function boxes(b, from = 0, to = b.length) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = [];
  for (let o = from; o + 8 <= to; ) {
    const size = v.getUint32(o);
    out.push({ type: String.fromCharCode(...b.subarray(o + 4, o + 8)), at: o, size, body: o + 8 });
    if (size < 8) break;
    o += size;
  }
  return out;
}
const find = (b, path, from = 0, to = b.length) => {
  const [first, ...rest] = path;
  const x = boxes(b, from, to).find(y => y.type === first);
  if (!x || !rest.length) return x;
  // (stsd's entry and full boxes: the children start after their own fields)
  const skip = { stsd: 8 }[first] || 0;
  return find(b, rest, x.body + skip, x.at + x.size);
};
const word = (b, o) => new DataView(b.buffer, b.byteOffset).getUint32(o);
const join = parts => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) out.set(p, o), (o += p.length);
  return out;
};

test('a kept song\'s .m4a: moov before the sound, every frame sized and placed, its length and the encoder\'s start in the edit list', () => {
  const frames = Array.from({ length: 100 }, (_, i) => ({ data: new Uint8Array(200 + (i % 7)).fill(i), dur: 1024 }));
  const sr = 32000;
  const length = 100 * 1024 - 2112 - 500;
  const b = join(m4a({ codec: 'aac', sr, frames, skip: 2112, length, chunk: 32 }));
  const top = boxes(b).map(x => x.type);
  assert.deepEqual(top, ['ftyp', 'moov', 'mdat'], 'moov first: a player knows the length and the table before any sound');
  const mdat = boxes(b).find(x => x.type === 'mdat');
  assert.equal(mdat.at + mdat.size, b.length);
  const stbl = ['moov', 'trak', 'mdia', 'minf', 'stbl'];
  const stsz = find(b, [...stbl, 'stsz']);
  assert.equal(word(b, stsz.body + 8), 100);
  for (let i = 0; i < 100; i++) assert.equal(word(b, stsz.body + 12 + i * 4), 200 + (i % 7));
  const stts = find(b, [...stbl, 'stts']);
  assert.deepEqual([word(b, stts.body + 4), word(b, stts.body + 8), word(b, stts.body + 12)], [1, 100, 1024]);
  // (Four chunks of 32, 32, 32 and 4: each where its frames are in mdat.)
  const stsc = find(b, [...stbl, 'stsc']);
  assert.deepEqual([word(b, stsc.body + 4), word(b, stsc.body + 8), word(b, stsc.body + 12), word(b, stsc.body + 20), word(b, stsc.body + 24)], [2, 1, 32, 4, 4]);
  const stco = find(b, [...stbl, 'stco']);
  assert.equal(word(b, stco.body + 4), 4);
  let o = mdat.body;
  for (let c = 0; c < 4; c++) {
    assert.equal(word(b, stco.body + 8 + c * 4), o);
    assert.equal(b[o], c * 32, 'the chunk starts with its first frame');
    for (let i = c * 32; i < Math.min(100, c * 32 + 32); i++) o += 200 + (i % 7);
  }
  const elst = find(b, ['moov', 'trak', 'edts', 'elst']);
  assert.deepEqual([word(b, elst.body + 4), word(b, elst.body + 8), word(b, elst.body + 12)], [1, length, 2112]);
  const mvhd = find(b, ['moov', 'mvhd']);
  assert.deepEqual([word(b, mvhd.body + 12), word(b, mvhd.body + 16)], [sr, length], 'its length is the song\'s, not the frames\'');
  const mdhd = find(b, ['moov', 'trak', 'mdia', 'mdhd']);
  assert.equal(word(b, mdhd.body + 16), 100 * 1024);
  assert.ok(find(b, [...stbl, 'stsd', 'mp4a']), 'AAC described');
});

test('Opus frames of their own lengths go in runs, on its 48 kHz clock', () => {
  const frames = [...Array(10).fill(960), 480, 480].map(dur => ({ data: new Uint8Array(50), dur }));
  const b = join(m4a({ codec: 'opus', sr: 32000, frames, skip: 312 }));
  const stts = find(b, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stts']);
  assert.deepEqual([1, 2, 3, 4, 5].map(k => word(b, stts.body + k * 4)), [2, 10, 960, 2, 480]);
  assert.equal(word(b, find(b, ['moov', 'mvhd']).body + 12), 48000);
  assert.ok(find(b, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd', 'Opus']));
});

test('a real player reads the .m4a: as long as the song, every frame in order (where ffmpeg is installed)', t => {
  const sr = 32000;
  const n = sr * 3;
  const pcm = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) (pcm[2 * i] = Math.round(Math.sin(i / 11) * 12000)), (pcm[2 * i + 1] = Math.round(Math.sin(i / 17) * 12000));
  let adts;
  try {
    adts = execFileSync('ffmpeg', ['-v', 'error', '-f', 's16le', '-ar', String(sr), '-ac', '2', '-i', 'pipe:0', '-c:a', 'aac', '-b:a', '160k', '-f', 'adts', 'pipe:1'], { input: Buffer.from(pcm.buffer), maxBuffer: 1e8, stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    return t.skip('no ffmpeg');
  }
  const frames = [];
  for (let o = 0; o + 7 <= adts.length; ) {
    const len = ((adts[o + 3] & 3) << 11) | (adts[o + 4] << 3) | (adts[o + 5] >> 5);
    const head = adts[o + 1] & 1 ? 7 : 9;
    frames.push({ data: Uint8Array.from(adts.subarray(o + head, o + len)), dur: 1024 });
    o += len;
  }
  const file = Buffer.from(join(m4a({ codec: 'aac', sr, frames, skip: 1024, length: n, bitrate: 160000 })));
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', '-f', 'mp4', 'pipe:0'], { input: file, stdio: ['pipe', 'pipe', 'ignore'] }).toString());
  assert.equal(probe.streams[0].codec_name, 'aac');
  assert.equal(+probe.streams[0].sample_rate, sr);
  assert.ok(Math.abs(+probe.format.duration - 3) < 0.01, `duration ${probe.format.duration}`);
  const out = execFileSync('ffmpeg', ['-v', 'error', '-f', 'mp4', '-i', 'pipe:0', '-f', 's16le', 'pipe:1'], { input: file, maxBuffer: 1e8, stdio: ['pipe', 'pipe', 'ignore'] });
  assert.ok(Math.abs(out.length / 4 - n) <= 1024, `${out.length / 4} samples back of ${n}`);
  // (A seek into it: two seconds in, the second left.)
  const tail = execFileSync('ffmpeg', ['-v', 'error', '-ss', '2', '-f', 'mp4', '-i', 'pipe:0', '-f', 's16le', 'pipe:1'], { input: file, maxBuffer: 1e8, stdio: ['pipe', 'pipe', 'ignore'] });
  assert.ok(Math.abs(tail.length / 4 - sr) < 1100, `${tail.length / 4} samples after 2 s`);
});

test('which kept songs are packed: WAVs where the phone packs; built-in ones mono where it can\'t; a packed one never again', () => {
  const wav = new Blob([new Uint8Array(10)]);
  const radio = { print: 'radio', radio: { seed: 1, mood: 'all', style: 'trap' } };
  const band = { print: 'band', band: { seed: 3, style: 'house' }, jam: [] };
  const mine = { print: 'abc123', seed: 4 };
  assert.deepEqual([kindOf(radio), kindOf(band), kindOf(mine), kindOf(undefined)], ['radio', 'band', 'kit', 'kit']);
  assert.deepEqual([builtIn(radio), builtIn(band), builtIn(mine)], [true, true, false]);
  const old = recipe => ({ id: 'x', bits: 16, wav, recipe });
  assert.equal(formOf(old(mine)), 'wav');
  assert.equal(soundOf(old(mine)), wav);
  assert.equal(slimTo(old(mine), 'aac'), 'aac');
  assert.equal(slimTo(old(radio), 'opus'), 'opus');
  // (No encoder: your own pieces' song stays whole; a built-in one goes mono, made again whole on export.)
  assert.equal(slimTo(old(mine), null), null);
  assert.equal(slimTo(old(radio), null), 'mono');
  assert.equal(slimTo(old(band), null), 'mono');
  // Done once, left alone after (whatever the phone can do later, packed stays packed).
  for (const form of ['aac', 'opus']) for (const can of ['aac', 'opus', null]) assert.equal(slimTo({ id: 'x', sound: wav, form, recipe: radio }, can), null);
  assert.equal(slimTo({ id: 'x', sound: wav, form: 'mono', recipe: radio }, null), null);
  assert.equal(slimTo({ id: 'x', sound: wav, form: 'mono', recipe: radio }, 'aac'), 'aac', 'mono packed once the phone can');
  assert.equal(slimTo({ id: 'x', sound: wav, form: 'wav', recipe: mine }, null), null);
  assert.equal(slimTo({ id: 'x', recipe: mine }, 'aac'), null, 'nothing to pack');
});

test('the sizes: a 1:35 song is 18 MB as a 48 kHz WAV and under 2.5 MB packed; the words for them', () => {
  const wav = sizeOf(95, 'wav', { sr: 48000 });
  const aac = sizeOf(95, 'aac', { bitrate: 192000 });
  assert.ok(wav > 18e6 && wav < 18.5e6);
  assert.ok(aac < 2.5e6 && aac > 1.5e6);
  assert.ok(wav / aac > 7);
  assert.equal(sizeOf(95, 'mono', { sr: 32000 }), 44 + 95 * 32000 * 2);
  assert.equal(mbText(85.4e6), '85 MB');
  assert.equal(mbText(1.94e6), '1.9 MB');
  assert.equal(mbText(-5), '0.0 MB');
});

test('a mono WAV keeps both sides as one, every sample, at the song\'s rate', () => {
  const L = Float32Array.from({ length: 500 }, (_, i) => Math.sin(i / 5) * 0.8);
  const R = Float32Array.from({ length: 500 }, (_, i) => Math.cos(i / 9) * 0.4);
  const back = parseWav(monoWav({ sr: 32000, L, R }));
  assert.equal(back.sr, 32000);
  assert.equal(back.L.length, 500);
  back.L.forEach((v, i) => assert.ok(Math.abs(v - (L[i] + R[i]) / 2) < 1e-4));
});

test('a song made again is told from a different one: the same loud and quiet places, about as long', () => {
  const sr = 8000;
  const song = (seed, secs = 6, gain = 1) => {
    const n = sr * secs;
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const beat = Math.floor(i / (sr / 4));
      const on = Math.sin(beat * 1.7 + seed * 2.3) > 0;
      L[i] = on ? Math.sin(i / 3) * 0.5 * gain * Math.exp(-(i % (sr / 4)) / 800) : 0;
    }
    return { sr, L, R: L };
  };
  assert.equal(envelope(song(1)).length, 6 * 20);
  assert.ok(sameSong(song(1), song(1)));
  assert.ok(sameSong(song(1), song(1, 6, 0.7)), 'quieter, still the same song');
  // (A packed copy: a little noise and the encoder's few ms at the start.)
  const a = song(1);
  const shifted = new Float32Array(a.L.length);
  for (let i = 0; i < a.L.length; i++) shifted[i] = (a.L[i - 40] || 0) + (Math.random() - 0.5) * 0.01;
  assert.ok(sameSong(a, { sr, L: shifted, R: shifted }));
  assert.ok(!sameSong(song(1), song(2)), 'another seed is another song');
  assert.ok(!sameSong(song(1, 6), song(1, 8)), 'two seconds longer is another arrangement');
});

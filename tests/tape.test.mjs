// 聽's tape (lib/tape.mjs): the songs as one stream, FLAC frames in MP4, for
// one <audio> through Media Source. Every sample comes back as laid down, a
// song follows a song with nothing between, and with nothing made the hook
// plays again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { FRAME, flacFrame, tapeInit, tapeSegment, tapeFragment, tapeFeed, wavPcm, pickStream, aacConfig } from '../public/lib/tape.mjs';
import { encodeWav } from '../public/engine.mjs';
import { radioSong, cutOf, segment, RADIO_SR } from '../public/lib/radio.mjs';

const song = (n, f, hold = null) => {
  const pcm = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) (pcm[2 * i] = f(i)), (pcm[2 * i + 1] = -f(i));
  return { pcm, hold };
};
// A frame read back: its header's CRC-8, both channels' samples, its CRC-16.
function readFrame(b) {
  assert.equal(b[0], 0xff);
  assert.equal(b[1], 0xf8);
  let o = 4;
  const lead = b[o];
  o += lead < 0x80 ? 1 : Math.clz32(~(lead << 24)) ;
  o++; // CRC-8
  const out = [[], []];
  for (const ch of [0, 1]) {
    assert.equal(b[o++], 0x02, 'a verbatim subframe');
    for (let j = 0; j < FRAME; j++, o += 2) out[ch].push((((b[o] << 8) | b[o + 1]) << 16) >> 16);
  }
  assert.equal(o + 2, b.length);
  return out;
}

test('a FLAC frame holds its 4096 samples a side exactly, with its checks', () => {
  const s = song(FRAME * 3, i => Math.round(Math.sin(i / 7) * 32767));
  for (const [at, num] of [[0, 0], [FRAME, 200], [FRAME * 2, 70000]]) {
    const [L, R] = readFrame(flacFrame(s.pcm, at, num, RADIO_SR));
    L.forEach((v, j) => assert.equal(v, s.pcm[(at + j) * 2]));
    R.forEach((v, j) => assert.equal(v, s.pcm[(at + j) * 2 + 1]));
  }
});

test('the tape plays one song into the next with nothing between, the hook again while nothing is made, and ⏭ from where it cuts', () => {
  const a = song(30000, i => (i % 1000) + 1, { from: 0.25, to: 0.75 });
  const b = song(20000, i => -((i % 500) + 1));
  const queue = [];
  const feed = tapeFeed(RADIO_SR);
  const take = n => feed.take(n, () => queue.length > 0, () => queue.shift() || null);
  queue.push(a);
  // Nothing after a: up to its outro (0.75 s), back to its hook (0.25 s), and on.
  const one = take(40000);
  assert.deepEqual(one.marks.map(m => [m.at, m.from]), [[0, 0], [24000, 8000], [40000, 8000]]);
  assert.deepEqual([...one.pcm.subarray(0, 48000)], [...a.pcm.subarray(0, 48000)]);
  assert.deepEqual([...one.pcm.subarray(48000, 80000)], [...a.pcm.subarray(16000, 48000)]);
  // b made: a plays on from its hook to its end, b straight after it.
  queue.push(b);
  const two = take(30000);
  assert.equal(two.filled, 30000);
  const fromA = 30000 - 8000;
  assert.deepEqual([...two.pcm.subarray(0, fromA * 2)], [...a.pcm.subarray(8000 * 2)]);
  assert.deepEqual(two.marks.map(m => [m.at, m.item === b, m.from]), [[fromA, true, 0]]);
  assert.deepEqual([...two.pcm.subarray(fromA * 2)], [...b.pcm.subarray(0, (30000 - fromA) * 2)]);
  assert.ok(two.pcm.every(v => v !== 0), 'not one sample of silence between them');
  // ⏭: a from its start, now.
  feed.cut(a);
  const three = take(100);
  assert.deepEqual(three.marks.map(m => [m.at, m.item === a, m.from]), [[0, true, 0]]);
  assert.deepEqual([...three.pcm], [...a.pcm.subarray(0, 200)]);
});

test('two radio songs on the tape come back sample for sample, as MP4 a player can read', () => {
  let tail = null;
  const items = [11, 2026].map(seed => {
    const { audio, info } = radioSong({ seed, mood: 'all' });
    const seg = segment(audio, cutOf(info, audio.sr), tail);
    tail = seg.tail;
    return { pcm: wavPcm(encodeWav({ sr: RADIO_SR, L: seg.L, R: seg.R }, 16)), hold: null };
  });
  const queue = [...items];
  const feed = tapeFeed(RADIO_SR);
  const parts = [tapeInit(RADIO_SR)];
  const laid = [];
  const total = (items[0].pcm.length + items[1].pcm.length) / 2;
  let time = 0;
  for (let k = 0; time + 20 * FRAME <= total; k++) {
    const { pcm } = feed.take(20 * FRAME, () => queue.length > 0, () => queue.shift() || null);
    parts.push(tapeSegment(pcm, 0, 20, { sr: RADIO_SR, time, number: time / FRAME, seq: k + 1 }));
    laid.push(pcm);
    time += 20 * FRAME;
  }
  const want = new Int16Array(time * 2);
  want.set(items[0].pcm);
  want.set(items[1].pcm.subarray(0, time * 2 - items[0].pcm.length), items[0].pcm.length);
  let o = 0;
  for (const p of laid) assert.deepEqual(p, want.subarray(o, (o += p.length)));
  // (Where ffmpeg is installed: read back by a real player.)
  let got = null;
  try {
    const mp4 = Buffer.concat(parts.map(p => Buffer.from(p)));
    const out = execFileSync('ffmpeg', ['-v', 'error', '-f', 'mp4', '-i', 'pipe:0', '-f', 's16le', 'pipe:1'], { input: mp4, maxBuffer: 1e9, stdio: ['pipe', 'pipe', 'ignore'] });
    got = new Int16Array(out.buffer, out.byteOffset, out.length / 2);
  } catch {}
  if (got) assert.ok(got.length === want.length && got.every((v, i) => v === want[i]), 'ffmpeg reads the tape back exactly');
});

test('AAC frames on the tape read back as the same sound (where ffmpeg is installed)', t => {
  const sr = RADIO_SR;
  const n = sr * 2;
  const pcm = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) (pcm[2 * i] = Math.round(Math.sin(i / 11) * 12000)), (pcm[2 * i + 1] = Math.round(Math.sin(i / 17) * 12000));
  let adts;
  try {
    adts = execFileSync('ffmpeg', ['-v', 'error', '-f', 's16le', '-ar', String(sr), '-ac', '2', '-i', 'pipe:0', '-c:a', 'aac', '-f', 'adts', 'pipe:1'], { input: Buffer.from(pcm.buffer), maxBuffer: 1e8, stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    return t.skip('no ffmpeg');
  }
  // ADTS frames, their 7-byte headers off: the raw frames an AudioEncoder gives.
  const frames = [];
  for (let o = 0; o + 7 <= adts.length; ) {
    const len = ((adts[o + 3] & 3) << 11) | (adts[o + 4] << 3) | (adts[o + 5] >> 5);
    const head = adts[o + 1] & 1 ? 7 : 9;
    frames.push({ data: new Uint8Array(adts.subarray(o + head, o + len)), dur: 1024 });
    o += len;
  }
  const mp4 = Buffer.concat([tapeInit(sr, { codec: 'aac' }), tapeFragment(frames.slice(0, 30), { time: 0, seq: 1 }), tapeFragment(frames.slice(30), { time: 30 * 1024, seq: 2 })].map(b => Buffer.from(b)));
  const decode = (input, fmt) => execFileSync('ffmpeg', ['-v', 'error', '-f', fmt, '-i', 'pipe:0', '-f', 's16le', '-ac', '2', 'pipe:1'], { input, maxBuffer: 1e8, stdio: ['pipe', 'pipe', 'ignore'] });
  const a = decode(mp4, 'mp4');
  const b = decode(adts, 'aac');
  assert.ok(a.length > n * 3, `decoded ${a.length / 4} samples`);
  // (Same frames, same decoder: the same sound, give or take the decoder's start.)
  const A = new Int16Array(a.buffer, a.byteOffset, a.length / 2);
  const B = new Int16Array(b.buffer, b.byteOffset, b.length / 2);
  let err = 0;
  const m = Math.min(A.length, B.length) - 8192;
  for (let i = 8192; i < m; i++) err = Math.max(err, Math.abs(A[i] - B[i]));
  assert.ok(err < 64, `max difference ${err}`);
  // (ffprobe: every frame there, 1024 apart, in order.)
  const pts = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'frame=pts', '-of', 'csv=p=0', '-f', 'mp4', 'pipe:0'], { input: mp4, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split('\n').map(Number);
  assert.equal(pts.length, frames.length);
  pts.forEach((p, i) => assert.equal(p, i * 1024));
});

test('聽 streams only where Media Source takes a codec and, for AAC or Opus, the phone can pack it; else files, saying why', async () => {
  const env = (types, enc = null) => ({
    ManagedMediaSource: { isTypeSupported: t => types.some(x => t.includes(x)) },
    ...(enc && { AudioEncoder: { isConfigSupported: async c => ({ supported: enc.includes(c.codec) }) } })
  });
  // (macOS Safari: no FLAC through Media Source; AAC through it, and packed.)
  assert.equal((await pickStream(32000, { env: env(['mp4a'], ['mp4a.40.2']) })).codec, 'aac');
  assert.equal((await pickStream(32000, { env: env(['flac', 'mp4a'], ['mp4a.40.2']) })).codec, 'flac');
  assert.equal((await pickStream(32000, { env: env(['opus'], ['opus']) })).codec, 'opus');
  const none = await pickStream(32000, { env: env(['mp4a']) });
  assert.deepEqual([none.path, none.reason], ['files', 'flac: Media Source no; aac: no AudioEncoder; opus: Media Source no']);
  const no = await pickStream(32000, { env: env(['mp4a', 'opus'], ['vorbis']) });
  assert.equal(no.path, 'files');
  assert.match(no.reason, /aac: AudioEncoder no at 32000 Hz; opus: AudioEncoder no/);
  assert.equal((await pickStream(32000, { env: {} })).reason, 'no Media Source');
});

test("AAC's config is the encoder's own, found also inside the descriptors some encoders give (an esds box, its ES_Descriptor); the init carries it as ffmpeg and Apple lay it out", () => {
  const es = Uint8Array.from(Buffer.from('0380808025000100048080801740150000000001f4000001f4000580808005129056e5000680808001020000', 'hex'));
  const box = Uint8Array.from([0, 0, 0, 8 + 4 + es.length, ...Buffer.from('esds'), 0, 0, 0, 0, ...es]);
  assert.deepEqual(aacConfig(new Uint8Array([0x12, 0x90]), 32000), [0x12, 0x90]);
  assert.deepEqual(aacConfig(new DataView(new Uint8Array([0x11, 0x90]).buffer), 32000), [0x11, 0x90]);
  assert.deepEqual(aacConfig(es, 32000), [0x12, 0x90, 0x56, 0xe5, 0x00]);
  assert.deepEqual(aacConfig(box, 32000), [0x12, 0x90, 0x56, 0xe5, 0x00]);
  assert.deepEqual(aacConfig(box.subarray(8), 32000), [0x12, 0x90, 0x56, 0xe5, 0x00]);
  assert.deepEqual(aacConfig(null, 32000), [0x12, 0x90]);   // (AAC-LC, 32 kHz, stereo)
  assert.deepEqual(aacConfig(null, 48000), [0x11, 0x90]);
  const init = Buffer.from(tapeInit(32000, { codec: 'aac', description: es }));
  const at = init.indexOf('esds');
  // (ES_Descriptor, lengths in four bytes, ES_ID 1; DecoderSpecificInfo the encoder's 5 bytes.)
  assert.equal(init.subarray(at + 8, at + 15).toString('hex'), '03808080250001');
  assert.ok(init.includes(Buffer.from('0580808005129056e500', 'hex')));
  assert.equal(init.subarray(4, 12).toString(), 'ftypiso5');
});

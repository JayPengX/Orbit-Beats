// 聽's tape: the radio's songs as one endless stream for one <audio>
// (Media Source), so a song change is never a new file to open: nothing to
// wait for between songs, and the one element keeps the lock screen.
//
// The sound goes in as FLAC frames (stored as is, "verbatim": no packing,
// simple and exact) in fragmented MP4, which Media Source takes where the
// browser says so (isTypeSupported); where it doesn't, the radio plays its
// songs file by file as before. Nothing here leaves the phone.

export const FRAME = 4096; // samples a frame (FLAC's block size code 12)
const RATES = { 8000: 4, 16000: 5, 22050: 6, 24000: 7, 32000: 8, 44100: 9, 48000: 10, 96000: 11 };
export const TAPE_TYPE = 'audio/mp4; codecs="flac"';

// ---- FLAC ----
const CRC8 = new Uint8Array(256);
const CRC16 = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
  CRC8[i] = c;
  let d = i << 8;
  for (let k = 0; k < 8; k++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff;
  CRC16[i] = d;
}
const crc8 = (b, from, to) => {
  let c = 0;
  for (let i = from; i < to; i++) c = CRC8[c ^ b[i]];
  return c;
};
const crc16 = (b, from, to) => {
  let c = 0;
  for (let i = from; i < to; i++) c = ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ b[i]];
  return c;
};
// FLAC's "UTF-8" frame number. -> [bytes]
function utf8(n) {
  if (n < 0x80) return [n];
  let k = 2;
  while (n >= 2 ** (5 * k + 1)) k++;
  const out = [((0xff << (8 - k)) & 0xff) | Math.floor(n / 2 ** (6 * (k - 1)))];
  for (let i = k - 2; i >= 0; i--) out.push(0x80 | (Math.floor(n / 2 ** (6 * i)) & 0x3f));
  return out;
}
// One stereo 16-bit frame of FRAME samples, verbatim. pcm: Int16Array, L R interleaved, from sample `at`. -> Uint8Array
export function flacFrame(pcm, at, number, sr) {
  const head = [0xff, 0xf8, (12 << 4) | RATES[sr], (1 << 4) | (4 << 1), ...utf8(number)];
  const out = new Uint8Array(head.length + 1 + 2 * (1 + FRAME * 2) + 2);
  out.set(head);
  let o = head.length;
  out[o] = crc8(out, 0, o);
  o++;
  for (let ch = 0; ch < 2; ch++) {
    out[o++] = 0x02; // a VERBATIM subframe, no wasted bits
    for (let j = 0; j < FRAME; j++) {
      const v = pcm[(at + j) * 2 + ch] & 0xffff;
      out[o++] = v >> 8;
      out[o++] = v & 0xff;
    }
  }
  const c = crc16(out, 0, o);
  out[o++] = c >> 8;
  out[o++] = c & 0xff;
  return out;
}

// ---- MP4 boxes ----
const enc = s => [...s].map(c => c.charCodeAt(0));
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = n => [(n >> 8) & 255, n & 255];
const u64 = n => [...u32(Math.floor(n / 2 ** 32)), ...u32(n >>> 0)];
function box(type, ...parts) {
  const body = parts.flatMap(p => (p instanceof Uint8Array ? [...p] : p));
  return [...u32(8 + body.length), ...enc(type), ...body];
}
const full = (type, version, flags, ...parts) => box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
const ZERO = n => new Array(n).fill(0);

// The start of the stream: what it is (FLAC, stereo, 16-bit, `sr`). -> Uint8Array
export function tapeInit(sr) {
  const matrix = [...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];
  // STREAMINFO: the last metadata block (type 0, 34 bytes); sizes and length unknown (0).
  const info = [0x80, 0, 0, 34, ...u16(FRAME), ...u16(FRAME), 0, 0, 0, 0, 0, 0];
  // 20 bits rate, 3 bits channels-1, 5 bits bits-1, 36 bits total samples (0).
  const r = sr;
  info.push((r >> 12) & 255, (r >> 4) & 255, ((r & 15) << 4) | (1 << 1) | ((15 >> 4) & 1), ((15 & 15) << 4) | 0, 0, 0, 0, 0, ...ZERO(16));
  const entry = box('fLaC', ZERO(6), u16(1), ZERO(8), u16(2), u16(16), u16(0), u16(0), u32(sr * 65536 >>> 0), full('dfLa', 0, 0, info));
  const stbl = box('stbl', full('stsd', 0, 0, u32(1), entry), full('stts', 0, 0, u32(0)), full('stsc', 0, 0, u32(0)), full('stsz', 0, 0, u32(0), u32(0)), full('stco', 0, 0, u32(0)));
  const minf = box('minf', full('smhd', 0, 0, u16(0), u16(0)), box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))), stbl);
  const mdia = box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(sr), u32(0), u16(0x55c4), u16(0)), full('hdlr', 0, 0, u32(0), enc('soun'), ZERO(12), enc('Sound'), [0]), minf);
  const trak = box('trak', full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(0), ZERO(8), u16(0), u16(0), u16(0x0100), u16(0), matrix, u32(0), u32(0)), mdia);
  const mvex = box('mvex', full('trex', 0, 0, u32(1), u32(1), u32(0), u32(0), u32(0)));
  const moov = box('moov', full('mvhd', 0, 0, u32(0), u32(0), u32(sr), u32(0), u32(0x10000), u16(0x0100), ZERO(10), matrix, ZERO(24), u32(2)), trak, mvex);
  return new Uint8Array([...box('ftyp', enc('iso6'), u32(0), enc('iso6'), enc('mp41')), ...moov]);
}

// A piece of the stream: `frames` FLAC frames from sample `at` of `pcm`,
// placed at sample `time` of the stream, numbered from `number`. -> Uint8Array
export function tapeSegment(pcm, at, frames, { sr, time, number, seq }) {
  const data = [];
  for (let k = 0; k < frames; k++) data.push(flacFrame(pcm, at + k * FRAME, number + k, sr));
  const size = data.reduce((a, d) => a + d.length, 0);
  const trunOf = offset => full('trun', 0, 0x000301, u32(frames), u32(offset), data.flatMap(d => [...u32(FRAME), ...u32(d.length)]));
  const moofOf = offset => box('moof', full('mfhd', 0, 0, u32(seq)), box('traf', full('tfhd', 0, 0x020000, u32(1)), full('tfdt', 1, 0, u64(time)), trunOf(offset)));
  const moofLength = moofOf(0).length;
  const moof = moofOf(moofLength + 8);
  const out = new Uint8Array(moof.length + 8 + size);
  out.set(moof);
  out.set([...u32(8 + size), ...enc('mdat')], moof.length);
  let o = moof.length + 8;
  for (const d of data) out.set(d, o), (o += d.length);
  return out;
}

// ---- What plays when ----
// The samples of a 16-bit stereo WAV (lib/engine encodeWav), L R interleaved. -> Int16Array
export function wavPcm(wav) {
  const b = wav instanceof Uint8Array ? wav : new Uint8Array(wav);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 12;
  while (o + 8 <= b.length) {
    const id = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    const n = v.getUint32(o + 4, true);
    if (id === 'data') {
      const start = b.byteOffset + o + 8;
      if (start % 2 === 0) return new Int16Array(b.buffer, start, Math.floor(Math.min(n, b.length - o - 8) / 2));
      return new Int16Array(b.slice(o + 8, o + 8 + n).buffer);
    }
    o += 8 + n + (n % 2);
  }
  throw new Error('no data in the WAV');
}

// The order the songs go onto the tape, sample by sample: each song from its
// start to its end; at the outro, with nothing made to follow, back to the
// last hook (its bar line) until something is. A frame can hold the end of
// one song and the start of the next: no gap at all.
//   take(n, next) -> { pcm: Int16Array (n samples, stereo), marks: [{ at, item, from }] }
//   (next(): the song to follow, or null if none is made yet; marks: where
//   on the stretch a song starts or jumps, `from` the song's sample there.)
export function tapeFeed(sr) {
  let item = null; // { pcm, hold: { from, to } (seconds), ... }
  let pos = 0;
  let fresh = false;
  return {
    get item() {
      return item;
    },
    // Start this song now (⏭, a mood changed): the next take begins with it.
    cut(to) {
      item = to;
      pos = 0;
      fresh = true;
    },
    // n samples on; ready(): is a song made to follow; next(): that song, taken.
    take(n, ready, next) {
      const pcm = new Int16Array(n * 2);
      const marks = [];
      let o = 0;
      if (item && fresh) marks.push({ at: 0, item, from: 0 });
      fresh = false;
      while (o < n) {
        if (!item) {
          item = next();
          pos = 0;
          if (!item) break;
          marks.push({ at: o, item, from: 0 });
        }
        const len = item.pcm.length / 2;
        const from = item.hold ? Math.round(item.hold.from * sr) : 0;
        const to = item.hold ? Math.round(item.hold.to * sr) : len;
        // (At the outro and nothing to follow: back to the hook, from its bar line.)
        const end = to > from && pos < to && !ready() ? to : len;
        const m = Math.min(n - o, end - pos);
        pcm.set(item.pcm.subarray(pos * 2, (pos + m) * 2), o * 2);
        o += m;
        pos += m;
        if (pos < end) continue;
        const after = end === len ? next() : null;
        if (after) item = after, (pos = 0);
        else pos = end === len && !(to > from) ? 0 : from;
        marks.push({ at: o, item, from: pos });
      }
      return { pcm, marks, filled: o };
    }
  };
}

// ---- Which way 聽 plays on this phone ----
// The stream where Media Source takes one of the tape's codecs (and, for a
// packed one, the phone can pack it); else the songs file by file.
// -> { path: 'stream' | 'files', codec, reason }
export const CODECS = [
  { codec: 'flac', type: TAPE_TYPE, encoder: null },
  { codec: 'aac', type: 'audio/mp4; codecs="mp4a.40.2"', encoder: 'mp4a.40.2' },
  { codec: 'opus', type: 'audio/mp4; codecs="opus"', encoder: 'opus' }
];
export async function pickStream(sr, { codecs = CODECS, env = globalThis } = {}) {
  const MS = env.ManagedMediaSource || env.MediaSource;
  if (!MS?.isTypeSupported) return { path: 'files', codec: null, reason: 'no Media Source' };
  const why = [];
  for (const c of codecs) {
    if (!MS.isTypeSupported(c.type)) {
      why.push(`${c.codec}: Media Source no`);
      continue;
    }
    if (!c.encoder) return { path: 'stream', codec: c.codec, reason: `${env.ManagedMediaSource ? 'Managed' : ''}MediaSource takes ${c.codec}` };
    if (!env.AudioEncoder?.isConfigSupported) {
      why.push(`${c.codec}: no AudioEncoder`);
      continue;
    }
    const cfg = { codec: c.encoder, sampleRate: sr, numberOfChannels: 2, bitrate: 192000 };
    const ok = await env.AudioEncoder.isConfigSupported(cfg).then(r => r.supported, () => false);
    if (ok) return { path: 'stream', codec: c.codec, config: cfg, reason: `${env.ManagedMediaSource ? 'Managed' : ''}MediaSource takes ${c.codec}, AudioEncoder packs it` };
    why.push(`${c.codec}: AudioEncoder no at ${sr} Hz`);
  }
  return { path: 'files', codec: null, reason: why.join('; ') };
}

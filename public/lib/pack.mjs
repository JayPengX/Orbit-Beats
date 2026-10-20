// 歌單's songs kept small: AAC (or Opus) from the phone's AudioEncoder in a
// plain .m4a (moov before mdat, every frame in its sample table, the
// encoder's start cut by an edit list), so Safari's <audio> plays, seeks
// and ends it like any music file. About a tenth of the 16-bit WAV it was.
// Full quality is made again only to export: from the recipe where it can
// be (and still sounds like what was kept), else the kept copy decoded.
// A phone with no encoder keeps a built-in song as mono 16-bit (made again
// whole on export) and a song of your own pieces as it was. Nothing here
// leaves the phone.
import { box, full, u16, u32, enc, ZERO, MATRIX, sampleEntry, timescaleOf, bytesOf } from './tape.mjs';
import { parseWav, encodeWav } from '../engine.mjs';

// What a kept song can be made again from: 'radio' (聽's band, from its
// seed), 'band' (a take on 即興's built-in set), 'kit' (your own pieces:
// only while that kit is in).
export const kindOf = recipe => (recipe?.print === 'radio' && recipe.radio ? 'radio' : recipe?.band ? 'band' : 'kit');
export const builtIn = recipe => kindOf(recipe) !== 'kit';

export const PACKED = ['aac', 'opus'];
// (Your own pieces a step higher: their kept copy may be all there is.)
export const BITRATE = { aac: { built: 160000, kit: 192000 }, opus: { built: 128000, kit: 160000 } };
const TYPES = { aac: 'audio/mp4; codecs="mp4a.40.2"', opus: 'audio/mp4; codecs="opus"' };
// A kept song's sound (before: `wav`), and what it's in: 'aac', 'opus', 'mono' or 'wav'.
export const soundOf = rec => rec?.sound || rec?.wav || null;
export const formOf = rec => (rec?.sound ? rec.form || 'wav' : rec?.wav ? 'wav' : null);
// The form a kept song should become on this phone (`packed`: the codec it
// packs, or null), or null when it's as small as it gets here.
export function slimTo(rec, packed) {
  const form = formOf(rec);
  if (!form || PACKED.includes(form)) return null;
  if (packed) return packed;
  return form === 'wav' && builtIn(rec.recipe) ? 'mono' : null;
}
// "1.9 MB", "85 MB".
export const mbText = bytes => {
  const mb = Math.max(0, bytes) / 1e6;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
};

// ---- The .m4a ----
// One audio track: frames [{ data, dur }] (dur in the track's clock, sr or
// Opus's 48 kHz), `skip` (the encoder's start, cut by the edit list) and
// `length` (the song's samples, in that clock: the end is cut there too).
// -> [Uint8Array]: the head (ftyp, moov, mdat's header), then each frame.
export function m4a({ codec, sr, description = null, bitrate = 192000, frames, skip = 0, length = null, chunk = 32 }) {
  const ts = timescaleOf(codec, sr);
  const media = frames.reduce((a, f) => a + f.dur, 0);
  const shown = Math.max(0, Math.min(length ?? media - skip, media - skip));
  const runs = [];
  for (const f of frames) {
    const r = runs[runs.length - 1];
    if (r && r[1] === f.dur) r[0]++;
    else runs.push([1, f.dur]);
  }
  const chunks = Math.ceil(frames.length / chunk);
  const last = frames.length - (chunks - 1) * chunk;
  const stsc = chunks <= 1 ? [[1, frames.length]] : [[1, chunk], ...(last !== chunk ? [[chunks, last]] : [])];
  const ftyp = box('ftyp', enc(codec === 'aac' ? 'M4A ' : 'isom'), u32(0), enc('M4A '), enc('isom'), enc('iso2'), enc('mp42'), ...(codec === 'opus' ? [enc('Opus')] : []));
  const moovAt = base => {
    const offsets = [];
    let o = base;
    frames.forEach((f, i) => {
      if (i % chunk === 0) offsets.push(o);
      o += f.data.length;
    });
    const stbl = box(
      'stbl',
      full('stsd', 0, 0, u32(1), sampleEntry(codec, sr, description, bitrate)),
      full('stts', 0, 0, u32(runs.length), runs.flatMap(([n, d]) => [...u32(n), ...u32(d)])),
      full('stsc', 0, 0, u32(stsc.length), stsc.flatMap(([first, n]) => [...u32(first), ...u32(n), ...u32(1)])),
      full('stsz', 0, 0, u32(0), u32(frames.length), frames.flatMap(f => u32(f.data.length))),
      full('stco', 0, 0, u32(offsets.length), offsets.flatMap(u32))
    );
    const minf = box('minf', full('smhd', 0, 0, u16(0), u16(0)), box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))), stbl);
    const mdia = box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(ts), u32(media), u16(0x55c4), u16(0)), full('hdlr', 0, 0, u32(0), enc('soun'), ZERO(12), enc('Sound'), [0]), minf);
    const edts = box('edts', full('elst', 0, 0, u32(1), u32(shown), u32(skip), u16(1), u16(0)));
    const trak = box('trak', full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(shown), ZERO(8), u16(0), u16(0), u16(0x0100), u16(0), MATRIX, u32(0), u32(0)), edts, mdia);
    return box('moov', full('mvhd', 0, 0, u32(0), u32(0), u32(ts), u32(shown), u32(0x10000), u16(0x0100), ZERO(10), MATRIX, ZERO(24), u32(2)), trak);
  };
  const size = moovAt(0).length;
  const moov = moovAt(ftyp.length + size + 8);
  const head = new Uint8Array([...ftyp, ...moov, ...u32(8 + frames.reduce((a, f) => a + f.data.length, 0)), ...enc('mdat')]);
  return [head, ...frames.map(f => f.data)];
}

// A 16-bit mono WAV of a song (both sides as one). -> Uint8Array
export function monoWav({ sr, L, R }) {
  const n = L.length;
  const out = new Uint8Array(44 + n * 2);
  const v = new DataView(out.buffer);
  const str = (o, s) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF'), v.setUint32(4, 36 + n * 2, true), str(8, 'WAVE'), str(12, 'fmt '), v.setUint32(16, 16, true), v.setUint16(20, 1, true), v.setUint16(22, 1, true);
  v.setUint32(24, sr, true), v.setUint32(28, sr * 2, true), v.setUint16(32, 2, true), v.setUint16(34, 16, true), str(36, 'data'), v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(((L[i] + R[i]) / 2) * 32767))), true);
  return out;
}

// ---- The same song? ----
// Loudness every 50 ms (both sides as one). -> Float32Array
export function envelope({ sr, L, R = L }, ms = 50) {
  const step = Math.max(1, Math.round((sr * ms) / 1000));
  const out = new Float32Array(Math.ceil(L.length / step));
  for (let k = 0; k < out.length; k++) {
    let s = 0;
    const end = Math.min(L.length, (k + 1) * step);
    for (let i = k * step; i < end; i++) {
      const x = (L[i] + R[i]) / 2;
      s += x * x;
    }
    out[k] = Math.sqrt(s / Math.max(1, end - k * step));
  }
  return out;
}
// A song made again sounds like the one kept: as long (within half a
// second) and loud and quiet in the same places (correlation over 0.9).
// (Not when the engine has changed what a seed makes, or the kit's tempo or
// roles were changed since: then the kept copy is what's exported.)
export function sameSong(a, b) {
  const x = envelope(a);
  const y = envelope(b);
  if (Math.abs(a.L.length / a.sr - b.L.length / b.sr) > 0.5) return false;
  const n = Math.min(x.length, y.length);
  if (n < 4) return false;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) (mx += x[i]), (my += y[i]);
  mx /= n;
  my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx > 0 && syy > 0 && sxy / Math.sqrt(sxx * syy) > 0.9;
}

// ---- On the phone: packing and unpacking ----
const configOf = (codec, sr, bitrate) => ({ codec: codec === 'aac' ? 'mp4a.40.2' : 'opus', sampleRate: sr, numberOfChannels: 2, bitrate, ...(codec === 'aac' && { aac: { format: 'aac' } }) });
const BLOCK = 8192;
// A song through the phone's AudioEncoder. -> { frames: [{ data, dur }], description }
// (`pcm`: 16-bit L R interleaved in place of L and R, read a block at a time: no whole float copy of a long song.)
export async function encodePcm({ sr, L, R = L, pcm = null }, { codec, bitrate }, env = globalThis) {
  const ts = timescaleOf(codec, sr);
  const frames = [];
  let description = null;
  let error = null;
  const encoder = new env.AudioEncoder({
    output: (chunk, meta) => {
      const d = meta?.decoderConfig?.description;
      if (d && !description) description = bytesOf(d).slice();
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      frames.push({ data, dur: codec === 'aac' ? 1024 : Math.round(((chunk.duration || 20000) * ts) / 1e6) });
    },
    error: e => (error = e)
  });
  encoder.configure(configOf(codec, sr, bitrate));
  const total = pcm ? pcm.length / 2 : L.length;
  for (let at = 0; at < total; at += BLOCK) {
    const m = Math.min(BLOCK, total - at);
    const d = new Float32Array(m * 2);
    if (pcm) for (let i = 0; i < m; i++) (d[i] = pcm[(at + i) * 2] / 32768), (d[m + i] = pcm[(at + i) * 2 + 1] / 32768);
    else d.set(L.subarray(at, at + m)), d.set(R.subarray(at, at + m), m);
    const data = new env.AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: m, numberOfChannels: 2, timestamp: Math.round((at / sr) * 1e6), data: d });
    encoder.encode(data);
    data.close();
    if (error) throw error;
    while (encoder.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 2));
  }
  await encoder.flush();
  encoder.close();
  if (error) throw error;
  const got = frames.reduce((a, f) => a + f.dur, 0);
  if (got < (total * ts) / sr - ts * 0.05) throw new Error('the encoder left out the end');
  return { frames, description };
}
// A file's sound, decoded at `sr`. -> AudioBuffer
export async function decodeSound(blob, sr, env = globalThis) {
  const C = env.OfflineAudioContext || env.webkitOfflineAudioContext;
  return new C(2, 1, sr).decodeAudioData(await blob.arrayBuffer());
}
const bufferAudio = (b, sr) => ({ sr, L: b.getChannelData(0), R: b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0) });

// How this phone packs a song at `sr`: { codec, skip, cut } (skip: the
// encoder's start, as played back here, in the track's clock; cut: what's
// left of it, at sr, when this phone decodes a file whole), or null. Found once a rate: a
// click at 0.1 s packed, decoded, and where it comes back measured; a
// codec the phone can't play back, or that comes back wrong, isn't used.
const ways = new Map();
export const packWay = (sr, env = globalThis) => (ways.has(sr) ? ways.get(sr) : ways.set(sr, findWay(sr, env).catch(() => null)).get(sr));
async function findWay(sr, env) {
  if (!env.AudioEncoder?.isConfigSupported || !env.AudioData || !(env.OfflineAudioContext || env.webkitOfflineAudioContext)) return null;
  const probe = env.document?.createElement?.('audio');
  for (const codec of PACKED) {
    if (!probe?.canPlayType?.(TYPES[codec])) continue;
    const bitrate = BITRATE[codec].kit;
    if (!(await env.AudioEncoder.isConfigSupported(configOf(codec, sr, bitrate)).then(r => r.supported, () => false))) continue;
    try {
      // (A click: a steady tone's start is smeared by the codec and reads early.)
      const n = Math.round(sr * 0.6);
      const at = Math.round(sr * 0.1);
      const L = new Float32Array(n);
      for (let i = 0; i < sr * 0.01; i++) L[at + i] = 0.6 * Math.sin((2 * Math.PI * 2000 * i) / sr) * Math.exp((-i * 400) / sr);
      const onset = x => {
        let top = 0;
        for (let i = 0; i < x.length; i++) top = Math.max(top, Math.abs(x[i]));
        if (top < 0.05) return null;
        for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > top / 2) return i;
        return null;
      };
      const start = onset(L);
      const { frames, description } = await encodePcm({ sr, L, R: L }, { codec, bitrate }, env);
      const ts = timescaleOf(codec, sr);
      const lagOf = async skip => {
        const got = onset((await decodeSound(new Blob(m4a({ codec, sr, description, bitrate, frames, skip }), { type: 'audio/mp4' }), sr, env)).getChannelData(0));
        return got === null ? null : got - start;
      };
      const lag = await lagOf(0);
      if (lag === null || lag < -sr * 0.01 || lag > sr * 0.2) continue;
      const skip = Math.max(0, Math.round((lag * ts) / sr));
      // (Does this phone's decoder cut the edit list's start too? If not, an unpacked copy is cut by hand.)
      const cuts = skip === 0 || Math.abs((await lagOf(skip)) ?? lag) < lag / 2;
      return { codec, skip, cut: cuts ? 0 : Math.max(0, lag) };
    } catch {}
  }
  return null;
}

// A song's WAV (16- or 32-bit) in its kept form. -> { sound: Blob, form, sr, seconds }
export async function packSong(wav, { built = false } = {}, env = globalThis) {
  const audio = parseWav(wav);
  const seconds = audio.L.length / audio.sr;
  const way = await packWay(audio.sr, env);
  if (way) {
    try {
      const bitrate = BITRATE[way.codec][built ? 'built' : 'kit'];
      const { frames, description } = await encodePcm(audio, { codec: way.codec, bitrate }, env);
      const length = Math.round((audio.L.length * timescaleOf(way.codec, audio.sr)) / audio.sr);
      return { sound: new Blob(m4a({ codec: way.codec, sr: audio.sr, description, bitrate, frames, skip: way.skip, length }), { type: 'audio/mp4' }), form: way.codec, sr: audio.sr, seconds };
    } catch {}
  }
  if (built) return { sound: new Blob([monoWav(audio)], { type: 'audio/wav' }), form: 'mono', sr: audio.sr, seconds };
  return { sound: new Blob([encodeWav(audio, 16)], { type: 'audio/wav' }), form: 'wav', sr: audio.sr, seconds };
}
// 16-bit stereo samples (L R interleaved, the radio's) packed, or null where the phone can't. -> { sound, form, sr, seconds } | null
export async function packPcm(pcm, sr, env = globalThis) {
  const way = await packWay(sr, env);
  if (!way) return null;
  const bitrate = BITRATE[way.codec].built;
  const { frames, description } = await encodePcm({ sr, pcm }, { codec: way.codec, bitrate }, env);
  const n = pcm.length / 2;
  const length = Math.round((n * timescaleOf(way.codec, sr)) / sr);
  return { sound: new Blob(m4a({ codec: way.codec, sr, description, bitrate, frames, skip: way.skip, length }), { type: 'audio/mp4' }), form: way.codec, sr, seconds: n / sr };
}
// A packed copy plays back whole: decoded, as long as the song (a quarter second either way).
export async function playsWhole(sound, sr, seconds, env = globalThis) {
  const b = await decodeSound(sound, sr, env);
  return Math.abs(b.length / sr - seconds) < 0.25;
}
// The kept copy as audio ({ sr, L, R }), for a WAV or a comparison.
// (Cut to the song's own length: a decoder may play a packed copy's last frame whole.)
export async function keptAudio(rec, env = globalThis) {
  const sound = soundOf(rec);
  if (formOf(rec) === 'wav') return parseWav(await sound.arrayBuffer());
  const sr = rec.sr || 48000;
  const a = bufferAudio(await decodeSound(sound, sr, env), sr);
  const way = PACKED.includes(rec.form) ? await packWay(sr, env) : null;
  const from = way?.codec === rec.form ? Math.min(way.cut, a.L.length) : 0;
  const n = rec.seconds ? Math.min(a.L.length - from, Math.round(rec.seconds * sr)) : a.L.length - from;
  return { sr, L: a.L.subarray(from, from + n), R: a.R.subarray(from, from + n) };
}

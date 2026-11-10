// Songs packed off the page (lib/pack.mjs encodeOff): the phone's AudioEncoder
// and the .m4a around its frames, in a worker of their own, so a song kept
// for 最近播放 or 資料庫 never holds the page's thread while music plays and
// the page scrolls. It says first whether it has an encoder here; where it
// hasn't (an older Safari's worker), the page packs as before.
import { encodePcm, m4a } from './pack.mjs';

self.postMessage({ hello: true, encoder: typeof self.AudioEncoder === 'function' && typeof self.AudioData === 'function' });
// A song comes a stretch at a time (start, its pieces, end), then is packed.
const coming = new Map();
self.onmessage = async e => {
  const m = e.data;
  if (m.start) {
    const src = { sr: m.sr };
    for (const [k, n] of Object.entries(m.sizes)) if (n) src[k] = k === 'pcm' ? new Int16Array(n) : new Float32Array(n);
    if (src.L && !src.R) src.R = src.L;
    return void coming.set(m.id, { src, how: m });
  }
  const job = coming.get(m.id);
  if (!job) return;
  if (!m.end) return void job.src[m.k].set(m.piece, m.at);
  coming.delete(m.id);
  const { src } = job;
  const { id, codec, bitrate, skip, length } = job.how;
  try {
    const { frames, description } = await encodePcm(src, { codec, bitrate }, self);
    const sound = new Blob(m4a({ codec, sr: src.sr, description, bitrate, frames, skip, length }), { type: 'audio/mp4' });
    self.postMessage({ id, ok: true, sound });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message || error) });
  }
};

// 最近播放's sound, kept a while: the last few radio songs that played,
// packed small (lib/pack.mjs, about a tenth of the WAV), so a tap on one in
// 最近播放 plays at once instead of being made again. And the few made ahead
// (今日精選's first ones, and the next song of 隨機電台 and 為你電台; kind 'ready'):
// kept too, so the app opened again plays them at once, before a single
// instrument is read. And the openings (four bars, kind 'opening', key 'o:…')
// of every other song and station on 首頁: a tap on any plays its opening at
// once while the song is made. On this phone only,
// never sent anywhere; a song made by an older engine (RADIO_V) is made again.
import { packPcm, keptAudio } from './pack.mjs';

const DB = 'orbit-beats-heard';
const STORE = 'songs';
const KEEP = { heard: 8, ready: 6, opening: 40 };
export const heardKey = e => `${e.seed}:${e.mood || 'all'}:${e.style}`;
function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
// The keys kept (read once, then kept up to date here).
let keys = null;
let loading = null;
const loadKeys = () => (loading ||= run('readonly', s => s.getAllKeys()).then(k => (keys = new Set(k)), () => (keys = new Set())));
export const heardHas = async key => (await loadKeys()).has(key);
// The same, at once: null until the keys are read (heardHas reads them).
export const heardHasNow = key => (keys ? keys.has(key) : null);
// A song that just started (or was made ahead: kind 'ready'): packed and kept (its samples: 16-bit L R
// interleaved). The oldest of its kind beyond KEEP let go. item: { id, info, seconds, hold }. -> kept? Never throws.
export async function keepHeard(key, item, pcm, sr, v, kind = 'heard') {
  try {
    if ((await loadKeys()).has(key)) return true;
    const packed = await packPcm(pcm, sr);
    if (!packed) return false;
    // (Its first four bars as they are, read back in a moment: they play while the rest is unpacked.)
    // (An opening is four bars itself, and small packed: none.)
    const bars = item.info?.bpm ? Math.round(((16 * 60) / item.info.bpm) * sr) : 8 * sr;
    const head = kind === 'opening' ? null : pcm.slice(0, Math.min(pcm.length, bars * 2));
    const rec = { key, kind, at: Date.now(), v, id: item.id, info: item.info, seconds: item.seconds, hold: item.hold, quick: Boolean(item.quick), length: item.length, whole: item.seconds, head, headSr: sr, ...packed };
    await run('readwrite', s => s.put(rec));
    keys.add(key);
    const all = (await run('readonly', s => s.getAll())) || [];
    const old = all.filter(r => (r.kind || 'heard') === kind).sort((a, b) => b.at - a.at).slice(KEEP[kind]);
    if (old.length) await run('readwrite', s => old.forEach(r => s.delete(r.key)));
    for (const r of old) keys.delete(r.key);
    return keys.has(key);
  } catch {
    return false;
  }
}
// A kept song's first four bars, back at once (unpacking it whole takes a second or two on a phone):
// { item fields of an opening (quick, held round until the rest is here), pcm } | null.
export async function heardHead(key, v, sr) {
  try {
    const rec = await run('readonly', s => s.get(key));
    if (!rec || rec.v !== v || !rec.head?.length || rec.headSr !== sr) return null;
    const len = rec.head.length / 2 / sr;
    return { id: rec.id, info: rec.info, seconds: rec.seconds, hold: { from: 0, to: len }, length: len, quick: true, pcm: rec.head };
  } catch {
    return null;
  }
}
// A kept song back: { item fields, url (the packed file), pcm (16-bit L R interleaved) } | null.
export async function heardItem(key, v) {
  try {
    const rec = await run('readonly', s => s.get(key));
    if (!rec || rec.v !== v) return null;
    const a = await keptAudio(rec);
    const n = a.L.length;
    const pcm = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) {
      pcm[i * 2] = Math.max(-32768, Math.min(32767, Math.round(a.L[i] * 32767)));
      pcm[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(a.R[i] * 32767)));
    }
    return { id: rec.id, info: rec.info, seconds: rec.seconds, hold: rec.hold, ...(rec.quick && { quick: true, length: rec.length, seconds: rec.whole }), url: URL.createObjectURL(rec.sound), pcm };
  } catch {
    return null;
  }
}

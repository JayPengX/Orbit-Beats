// 最近播放's sound, kept a while: the last few radio songs that played,
// packed small (lib/pack.mjs, about a tenth of the WAV), so a tap on one in
// 最近播放 plays at once instead of being made again. On this phone only,
// never sent anywhere; a song made by an older engine (RADIO_V) is made again.
import { packPcm, keptAudio } from './pack.mjs';

const DB = 'orbit-beats-heard';
const STORE = 'songs';
const KEEP = 8;
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
// A song that just started: packed and kept (its samples: 16-bit L R interleaved). The oldest beyond KEEP let go.
// item: { id, info, seconds, hold }. Never throws.
export async function keepHeard(key, item, pcm, sr, v) {
  try {
    if ((await loadKeys()).has(key)) return;
    const packed = await packPcm(pcm, sr);
    if (!packed) return;
    const rec = { key, at: Date.now(), v, id: item.id, info: item.info, seconds: item.seconds, hold: item.hold, ...packed };
    await run('readwrite', s => s.put(rec));
    keys.add(key);
    const all = (await run('readonly', s => s.getAll())) || [];
    const old = all.sort((a, b) => b.at - a.at).slice(KEEP);
    if (old.length) await run('readwrite', s => old.forEach(r => s.delete(r.key)));
    for (const r of old) keys.delete(r.key);
  } catch {}
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
    return { id: rec.id, info: rec.info, seconds: rec.seconds, hold: rec.hold, url: URL.createObjectURL(rec.sound), pcm };
  } catch {
    return null;
  }
}

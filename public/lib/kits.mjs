// What Orbit Beats keeps: on the Quadra Pass, the settings and each kit's
// tempo and the roles set by hand (a kit known by its sound's fingerprint,
// so the same pieces on another phone find them); on this phone, the last
// kit's sound itself (IndexedDB: megabytes, never sent anywhere).
//
// The Pass's payload: { v: 1, settings: { …, at }, kits: { <fp>: { bpm, roles: { <piece>: role }, at } } }.

export const SETTING_KEYS = ['count', 'minBars', 'maxBars', 'styles', 'humanize', 'seed', 'bits', 'silenceDb', 'minGap'];
// (The newest this many kits; an old one's tempo is heard again if it comes back.)
export const MOST_KITS = 40;

// A kit's fingerprint: each source's length and a few hundred of its samples,
// hashed (FNV-1a). The same files give the same print on every phone.
export function fingerprint(sources) {
  let h = 0x811c9dc5;
  const mix = n => {
    h ^= n & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (n >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (const s of sources) {
    const L = s.L;
    mix(L.length & 0xffff);
    mix(L.length >>> 16);
    const step = Math.max(1, Math.floor(L.length / 256));
    for (let i = 0; i < L.length; i += step) mix(Math.round((L[i] || 0) * 32767) & 0xffff);
  }
  return `k${h.toString(36)}`;
}

export function decode(text) {
  try {
    const p = JSON.parse(text || 'null');
    if (!p || p.v !== 1) return { v: 1, settings: null, kits: {} };
    return { v: 1, settings: p.settings && typeof p.settings === 'object' ? p.settings : null, kits: p.kits && typeof p.kits === 'object' ? p.kits : {} };
  } catch {
    return { v: 1, settings: null, kits: {} };
  }
}
export const encode = p => JSON.stringify({ v: 1, settings: p.settings || null, kits: p.kits || {} });

// The settings as kept: only the known keys, with when they were set.
export function keptSettings(settings, at = Date.now()) {
  const out = { at };
  for (const k of SETTING_KEYS) if (settings[k] !== undefined && !(typeof settings[k] === 'number' && Number.isNaN(settings[k]))) out[k] = settings[k];
  return out;
}

// Two payloads as one: the newer settings; each kit the newer of the two;
// the newest MOST_KITS.
export function merge(a, b) {
  const settings = !a.settings ? b.settings : !b.settings ? a.settings : (b.settings.at || 0) > (a.settings.at || 0) ? b.settings : a.settings;
  const kits = { ...a.kits };
  for (const [fp, k] of Object.entries(b.kits || {})) if (!kits[fp] || (k.at || 0) > (kits[fp].at || 0)) kits[fp] = k;
  const newest = Object.entries(kits)
    .sort((x, y) => (y[1].at || 0) - (x[1].at || 0))
    .slice(0, MOST_KITS);
  return { v: 1, settings, kits: Object.fromEntries(newest) };
}

// A kit's entry: its tempo when set by hand (or as heard, to skip hearing it
// again), and only the roles set by hand.
export function kitEntry(bpm, roles, edited, at = Date.now()) {
  const set = {};
  for (const i of edited) if (roles[i]) set[i] = roles[i];
  return { bpm, roles: set, at };
}

// ---- This phone's copy of the last kit (IndexedDB) ----------------------------------

const DB = 'orbit-beats';
const STORE = 'kit';
function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
// { sources: [{ name, sr, L, R }], at }: R left out when it's L (mono).
export const saveLast = sources =>
  run('readwrite', s => s.put({ at: Date.now(), sources: sources.map(x => ({ name: x.name, sr: x.sr, L: x.L, R: x.R === x.L ? null : x.R })) }, 'last')).catch(() => {});
export async function loadLast() {
  const kept = await run('readonly', s => s.get('last')).catch(() => null);
  return kept?.sources?.length ? kept.sources.map(x => ({ name: x.name, sr: x.sr, L: x.L, R: x.R || x.L })) : null;
}
export const forgetLast = () => run('readwrite', s => s.delete('last')).catch(() => {});

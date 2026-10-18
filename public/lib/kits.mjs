// What Orbit Beats keeps: on the Quadra Pass, the settings and each kit's
// tempo and the roles set by hand (a kit known by its sound's fingerprint,
// so the same pieces on another phone find them); on this phone, the last
// kit's sound itself (IndexedDB: megabytes, never sent anywhere).
//
// The Pass's payload: { v: 1, settings: { …, at }, kits: { <fp>: { bpm, roles: { <piece>: role }, at } } }.

import { STYLES } from '../engine.mjs';
import { mixOf } from './mix.mjs';

// (mood, smart, studioBpm and mix were set on the page but never kept until 2026-10-18: they came back as they open.)
export const SETTING_KEYS = ['count', 'minBars', 'maxBars', 'styles', 'humanize', 'seed', 'bits', 'silenceDb', 'minGap', 'mood', 'smart', 'studioBpm', 'mix'];
// The settings as the page opens them.
export const DEFAULTS = { count: 8, minBars: 25, maxBars: 29, styles: [...STYLES], humanize: 100, seed: '', bits: 32, silenceDb: -90, minGap: 0.2, mood: 'all', smart: true, studioBpm: 120, mix: mixOf(null) };
// Each kept setting as it can be used (another phone's, an old version's, a
// typo): a wrong kind or out of range is left as it was.
const CHECK = {
  count: v => Number.isInteger(v) && v >= 1 && v <= 30,
  minBars: v => Number.isInteger(v) && v >= 8 && v <= 64,
  maxBars: v => Number.isInteger(v) && v >= 8 && v <= 64,
  humanize: v => Number.isFinite(v) && v >= 0 && v <= 200,
  seed: v => typeof v === 'string' && /^\d{0,10}$/.test(v),
  bits: v => v === 16 || v === 32,
  silenceDb: v => Number.isFinite(v) && v >= -140 && v <= -20,
  minGap: v => Number.isFinite(v) && v >= 0.02 && v <= 5,
  mood: v => typeof v === 'string' && v.length < 20,
  smart: v => typeof v === 'boolean',
  studioBpm: v => Number.isFinite(v) && v >= 60 && v <= 200
};
export function settingsOf(kept, base = DEFAULTS) {
  const out = { ...base, styles: [...base.styles], mix: mixOf(base.mix) };
  for (const [k, v] of Object.entries(kept && typeof kept === 'object' ? kept : {})) {
    if (k === 'styles') {
      const ok = Array.isArray(v) ? STYLES.filter(x => v.includes(x)) : [];
      if (ok.length) out.styles = ok;
    } else if (k === 'mix') out.mix = mixOf(v);
    else if (CHECK[k]?.(v)) out[k] = v;
  }
  if (out.minBars > out.maxBars) [out.minBars, out.maxBars] = [base.minBars, base.maxBars];
  return out;
}
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
  const none = { v: 1, settings: null, kits: {}, taste: {} };
  try {
    const p = JSON.parse(text || 'null');
    if (!p || p.v !== 1) return none;
    return { v: 1, settings: p.settings && typeof p.settings === 'object' ? p.settings : null, kits: p.kits && typeof p.kits === 'object' ? p.kits : {}, taste: tasteOf(p.taste) };
  } catch {
    return none;
  }
}
export const encode = p => JSON.stringify({ v: 1, settings: p.settings || null, kits: p.kits || {}, taste: p.taste || {} });
// The styles of the songs kept (歌單): { style: how many }, what a batch leans to.
const tasteOf = t => Object.fromEntries(Object.entries(t && typeof t === 'object' ? t : {}).filter(([k, v]) => /^[a-z]+$/.test(k) && Number.isFinite(v) && v > 0).map(([k, v]) => [k, Math.min(999, Math.round(v))]));
export function liked(taste, style, d = 1) {
  const t = { ...taste, [style]: Math.max(0, (taste?.[style] || 0) + d) };
  if (!t[style]) delete t[style];
  return t;
}

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
  // (Taste: each style's larger count, the phones' kept songs not added twice.)
  const taste = { ...(a.taste || {}) };
  for (const [k, v] of Object.entries(b.taste || {})) taste[k] = Math.max(taste[k] || 0, v);
  return { v: 1, settings, kits: Object.fromEntries(newest), taste };
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
// (Version 2: the songs kept, 歌單, each its WAV and how it was made.)
const SONGS = 'songs';
// (Version 3: kits kept by name, 我的套組.)
const NAMED = 'named';
function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    const req = indexedDB.open(DB, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(SONGS)) db.createObjectStore(SONGS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(NAMED)) db.createObjectStore(NAMED, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function run(mode, fn, store = STORE) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
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

// ---- The songs kept (歌單): on this phone only, never sent anywhere ----------------
// { id, name, at, info, bits, wav: Blob, recipe: { print, seed, detail, style, plan, minBars, maxBars, styles, humanize, mix } | { print, jam, plan, mix } }
export const saveSong = song => run('readwrite', s => s.put(song), SONGS);
export const deleteSong = id => run('readwrite', s => s.delete(id), SONGS);
export async function listSongs() {
  const all = (await run('readonly', s => s.getAll(), SONGS).catch(() => null)) || [];
  return all.sort((a, b) => b.at - a.at);
}
export async function renameSong(id, name) {
  const song = await run('readonly', s => s.get(id), SONGS);
  if (song) await saveSong({ ...song, name });
}

// ---- Kits kept by name (我的套組): on this phone only, never sent anywhere ----------
// lib/kitops.mjs's namedKit: { id, name, at, bpm, count, roles, sources: [{ name, sr, L, R }] }
export const saveNamed = kit => run('readwrite', s => s.put(kit), NAMED);
export const deleteNamed = id => run('readwrite', s => s.delete(id), NAMED);
export async function listNamed() {
  const all = (await run('readonly', s => s.getAll(), NAMED).catch(() => null)) || [];
  return all.sort((a, b) => b.at - a.at);
}
export async function renameNamed(id, name) {
  const kit = await run('readonly', s => s.get(id), NAMED);
  if (kit) await saveNamed({ ...kit, name });
}

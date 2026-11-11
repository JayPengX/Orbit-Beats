// The songs kept in 資料庫 and the playlists (清單), on the Orbit Pass, so
// every phone signed in with it has them. A song made on the app's own
// instruments (聽's band, 簡單's batches, a remix of one, a take on 即興's
// built-in set) goes up as its recipe alone, a few hundred bytes: the other
// phone makes its sound again from it (the same notes, seed for seed). A
// song made of your own pieces stays on its phone (their sound never leaves
// it, and another phone can't make it without them).
//
// On the Pass (the payload's `songs` and `lists`), by id:
//   songs: { <id>: { n: name, t: kept at, u: changed at, r: recipe, i: { style, bpm, seconds, key, plan } } | { g: gone at } }
//   lists: { <id>: { n: name, s: [song id], t: made at, u: changed at } | { g: gone at } }
// Two copies merge entry by entry, the later change winning; a song or list
// taken out leaves a mark (`g`) for GONE_DAYS so another phone takes it out too.
// Pure: the page reads and saves what these return, and the tests run them.

import { kindOf } from './pack.mjs';

export const GONE_DAYS = 120;
// (The songs' share of the payload: the newest kept that fit, ~500 songs. The rest stay on their phones.)
export const SONG_BUDGET = 150_000;
const DAY = 86_400_000;

const str = (v, n) => String(v ?? '').slice(0, n);
const num = v => (Number.isFinite(v) ? v : 0);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const idOk = id => typeof id === 'string' && id.length > 0 && id.length <= 200;

// A song this phone can send: made on the app's own band (a radio or a band recipe).
export const syncable = rec => Boolean(rec?.recipe) && kindOf(rec.recipe) !== 'kit' && recipeOk(rec.recipe);
function recipeOk(r) {
  if (!isObj(r)) return false;
  if (r.print === 'radio') return isObj(r.radio) && Number.isFinite(r.radio.seed);
  if (r.print === 'band') return isObj(r.band) && Number.isFinite(r.band.seed) && Array.isArray(r.jam) && r.jam.length <= 5000;
  return false;
}

// What a list row needs before the sound is made: its groove, tempo, length, key and sections.
function infoOut(info) {
  const i = isObj(info) ? info : {};
  const out = {};
  if (typeof i.style === 'string') out.style = i.style;
  if (Number.isFinite(i.bpm)) out.bpm = Math.round(i.bpm * 10) / 10;
  if (Number.isFinite(i.seconds)) out.seconds = Math.round(i.seconds * 100) / 100;
  if (isObj(i.key) && Number.isInteger(i.key.tonic)) out.key = { tonic: i.key.tonic, minor: Boolean(i.key.minor) };
  if (Array.isArray(i.plan)) out.plan = i.plan.filter(p => Array.isArray(p) && typeof p[0] === 'string' && Number.isFinite(p[1])).map(([t, n]) => [str(t, 12), n]).slice(0, 64);
  return out;
}

// A kept song as it goes up.
export const songEntry = (rec, u = Date.now()) => ({ n: str(rec.name, 80), t: num(rec.at), u, r: rec.recipe, i: infoOut(rec.info) });

// One entry as it can be used (another phone's, an old version's): null when it can't.
function songOk(e) {
  if (!isObj(e)) return null;
  if (Number.isFinite(e.g)) return { g: e.g };
  if (!recipeOk(e.r)) return null;
  return { n: str(e.n, 80), t: num(e.t), u: num(e.u), r: e.r, i: infoOut(e.i) };
}
function listOk(e) {
  if (!isObj(e)) return null;
  if (Number.isFinite(e.g)) return { g: e.g };
  if (!str(e.n, 40).trim()) return null;
  const s = [...new Set((Array.isArray(e.s) ? e.s : []).filter(idOk))].slice(0, 1000);
  return { n: str(e.n, 40).trim(), s, t: num(e.t), u: num(e.u) };
}
function mapOf(raw, ok) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [id, e] of Object.entries(raw)) {
    if (!idOk(id)) continue;
    const v = ok(e);
    if (v) out[id] = v;
  }
  return out;
}
export const songsMap = raw => mapOf(raw, songOk);
export const listsMap = raw => mapOf(raw, listOk);

const stamp = e => (e ? (Number.isFinite(e.g) ? e.g : e.u) : -1);
// Two copies as one: each entry the later change (a tie: the first's); a gone mark past GONE_DAYS forgotten.
export function mergeMap(a = {}, b = {}, now = Date.now()) {
  const out = { ...a };
  for (const [id, e] of Object.entries(b)) if (stamp(e) > stamp(out[id])) out[id] = e;
  for (const [id, e] of Object.entries(out)) if (Number.isFinite(e.g) && now - e.g > GONE_DAYS * DAY) delete out[id];
  return out;
}

// The songs that go up: every gone mark, then the newest kept while they fit SONG_BUDGET.
export function trimSongs(map, budget = SONG_BUDGET) {
  const out = {};
  let size = 2;
  const live = [];
  for (const [id, e] of Object.entries(map)) {
    if (Number.isFinite(e.g)) {
      out[id] = e;
      size += id.length + 16;
    } else live.push([id, e]);
  }
  live.sort((x, y) => y[1].t - x[1].t || (x[0] < y[0] ? -1 : 1));
  for (const [id, e] of live) {
    size += id.length + 6 + JSON.stringify(e).length;
    if (size > budget) break;
    out[id] = e;
  }
  return out;
}

// ---- Songs: the Pass's copy and this phone's 資料庫 in step ----

// What this phone does with the songs: `kept` this phone's records (資料庫), `map` the songs on the Pass.
// -> { map (with this phone's own songs it lacked), add: [records to keep, sound not made yet], drop: [ids gone elsewhere], rename: [[id, name]] }
export function songsPlan(map, kept, now = Date.now()) {
  const next = { ...map };
  const add = [];
  const drop = [];
  const rename = [];
  const here = new Map(kept.map(r => [r.id, r]));
  for (const r of kept) {
    const e = next[r.id];
    // (Kept here and not on the Pass, or kept again after it was taken out elsewhere: it goes up.)
    if (!e) syncable(r) && (next[r.id] = songEntry(r, num(r.at) || now));
    else if (Number.isFinite(e.g)) e.g < num(r.at) ? syncable(r) && (next[r.id] = songEntry(r, num(r.at))) : drop.push(r.id);
    else if (e.n && e.n !== r.name) rename.push([r.id, e.n]);
  }
  for (const [id, e] of Object.entries(next)) if (!Number.isFinite(e.g) && !here.has(id)) add.push(waiting(id, e));
  return { map: next, add, drop, rename };
}
// A song from the Pass, its sound not made yet (`sound: null`; made from `recipe` when it's first wanted).
export function waiting(id, e) {
  const from = e.r.print === 'band' ? 'jam' : /:rx[0-9a-z]+$/.test(id) ? 'remix' : id.startsWith('radio:') ? 'radio' : 'made';
  return { id, name: e.n, at: e.t, info: { ...e.i }, recipe: e.r, sound: null, from };
}
// A song with no sound yet.
export const soundless = rec => Boolean(rec) && !rec.sound && !rec.wav;

// ---- Playlists: this phone's (lib/lists.mjs, [{ id, name, songs, at }]) and the Pass's ----

// The lists as they changed here (`was` → `now`), into the Pass's copy.
export function listsChanged(map, was, now, at = Date.now()) {
  const next = { ...map };
  const before = new Map(was.map(l => [l.id, l]));
  for (const l of now) {
    const b = before.get(l.id);
    if (!b || b.name !== l.name || b.songs.join('\n') !== l.songs.join('\n')) next[l.id] = { n: l.name, s: [...l.songs], t: l.at || at, u: at };
    before.delete(l.id);
  }
  for (const id of before.keys()) next[id] = { g: at };
  return next;
}
// This phone's lists from the Pass's copy (newest made first); lists here it lacks go into it.
export function listsPlan(map, local) {
  const next = { ...map };
  for (const l of local) if (!next[l.id]) next[l.id] = { n: l.name, s: [...l.songs], t: l.at || 0, u: l.at || 0 };
  const lists = Object.entries(next)
    .filter(([, e]) => !Number.isFinite(e.g))
    .sort((x, y) => y[1].t - x[1].t || (x[0] < y[0] ? -1 : 1))
    .map(([id, e]) => ({ id, name: e.n, songs: [...e.s], at: e.t }));
  return { map: next, lists };
}

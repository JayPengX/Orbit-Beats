// 清單 (playlists) in 歌單: lists of kept songs by id, in the order they
// were added, kept on this phone (localStorage, a few ids each). A song
// taken out of 歌單 leaves every list. Pure: the page reads and saves what
// these return, and the tests run them.
//
// [{ id, name, songs: [song id], at }]

export const MOST_LISTS = 100;
export const MOST_IN_LIST = 1000;
const nameOf = v => String(v ?? '').trim().slice(0, 40);

// Kept lists as they can be used: bad entries dropped, ids once each.
export function listsOf(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const l of raw) {
    if (!l || typeof l.id !== 'string' || !l.id || seen.has(l.id) || !nameOf(l.name)) continue;
    seen.add(l.id);
    const songs = [...new Set((Array.isArray(l.songs) ? l.songs : []).filter(s => typeof s === 'string' && s))].slice(0, MOST_IN_LIST);
    out.push({ id: l.id, name: nameOf(l.name), songs, at: Number.isFinite(l.at) ? l.at : 0 });
  }
  return out.slice(0, MOST_LISTS);
}
// A new list (first in the order shown); a blank name is no list.
export function makeList(lists, name, id, at = Date.now()) {
  const n = nameOf(name);
  if (!n || lists.length >= MOST_LISTS) return lists;
  return [{ id, name: n, songs: [], at }, ...lists];
}
export const renameList = (lists, id, name) => (nameOf(name) ? lists.map(l => (l.id === id ? { ...l, name: nameOf(name) } : l)) : lists);
export const deleteList = (lists, id) => lists.filter(l => l.id !== id);
// A song onto the end of a list (once: already there, it stays where it is).
export const addTo = (lists, id, song) => lists.map(l => (l.id === id && !l.songs.includes(song) && l.songs.length < MOST_IN_LIST ? { ...l, songs: [...l.songs, song] } : l));
export const removeFrom = (lists, id, song) => lists.map(l => (l.id === id ? { ...l, songs: l.songs.filter(s => s !== song) } : l));
// A song gone from 歌單: out of every list.
export const dropSong = (lists, song) => (lists.some(l => l.songs.includes(song)) ? lists.map(l => ({ ...l, songs: l.songs.filter(s => s !== song) })) : lists);
// A list's songs in its order, those still kept.
export function songsOf(list, songs) {
  const by = new Map(songs.map(s => [s.id, s]));
  return (list?.songs || []).map(id => by.get(id)).filter(Boolean);
}

// The play queue, no DOM: what played (history), what plays (now), what the
// listener lined up (upNext), what plays after that (station: the radio, or
// the list a song was started from) and the loop mode. Every function takes a
// queue and returns a new one; the player (app.js) does the playing.
//
// An item is a small plain object: { id, kind: 'radio' | 'song', title, … }.
// A radio song is made again from its spec (seed, mood, style), a song from
// the library or the batch is found by its id: no audio is kept here.
export const LOOPS = ['off', 'all', 'one'];
export const HISTORY_MAX = 50;
export const QUEUE_MAX = 200;
export const BACK_WITHIN = 3; // seconds: back before this goes to the song before; after it, restarts

// station: null | { kind: 'radio', id } | { kind: 'list', items: [item], index }
export const newQueue = () => ({ history: [], now: null, upNext: [], again: [], station: null, loop: 'off', shuffle: false, autoplay: false });

// What is kept of an item: ids and a few words, never sound.
const KEEP_FIELDS = ['id', 'kind', 'title', 'seed', 'mood', 'style', 'bpm', 'key', 'seconds', 'sub'];
export const slim = it => it && Object.fromEntries(KEEP_FIELDS.filter(k => it[k] != null).map(k => [k, it[k]]));

const pushHistory = (history, it) => (it && history.at(-1)?.id !== it.id ? [...history, it].slice(-HISTORY_MAX) : history);

// Play this now (the one playing goes to history). `station`: what follows it
// (undefined: unchanged; null: nothing). A song picked by hand clears what "back" went past.
export function playNow(q, item, station) {
  if (!item) return q;
  const same = q.now?.id === item.id;
  const next = { ...q, history: same ? q.history : pushHistory(q.history, q.now), now: item, again: [], station: station === undefined ? q.station : station };
  // (Shuffle is on: a new list is played in a mixed order too.)
  return q.shuffle && station?.kind === 'list' ? mixStation(next) : next;
}
// The radio's next song became the one playing: it is `now`, the station stays the radio.
// (Not a pick by hand: what "back" went past stays for forward.)
export function radioNow(q, item) {
  if (!item || q.now?.id === item.id) return q;
  return { ...playNow(q, item, q.station?.kind === 'radio' ? q.station : undefined), again: q.again };
}

// 插播: next after the one playing (before the rest of the queue).
export const playNext = (q, item) => (item ? { ...q, upNext: [item, ...q.upNext].slice(0, QUEUE_MAX) } : q);
// 稍後播放: at the end of the queue.
export const playLater = (q, item) => (item ? { ...q, upNext: [...q.upNext, item].slice(0, QUEUE_MAX) } : q);

export function remove(q, index) {
  if (!(index >= 0 && index < q.upNext.length)) return q;
  return { ...q, upNext: q.upNext.filter((_, i) => i !== index) };
}
export function move(q, from, to) {
  const n = q.upNext.length;
  if (!(from >= 0 && from < n) || !(to >= 0 && to < n) || from === to) return q;
  const list = q.upNext.slice();
  list.splice(to, 0, list.splice(from, 1)[0]);
  return { ...q, upNext: list };
}
export const clear = q => (q.upNext.length ? { ...q, upNext: [] } : q);

// ---- 隨機播放 and 自動播放 ----
// Shuffle mixes what is lined up and the rest of the list (the song playing stays first);
// off puts the list back in its own order. Autoplay: when the lined-up songs and the list
// run out, the radio takes over instead of silence.
const mixed = (list, rnd) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
function mixStation(q, rnd = Math.random) {
  const st = q.station;
  if (st?.kind !== 'list') return q;
  const orig = st.orig || st.items;
  const at = Math.max(0, st.items.findIndex(x => x.id === q.now?.id));
  const items = [...st.items.slice(0, at + 1), ...mixed(st.items.slice(at + 1), rnd)];
  return { ...q, station: { ...st, items, index: at, orig } };
}
export function setShuffle(q, on, rnd = Math.random) {
  on = Boolean(on);
  if (on === q.shuffle) return q;
  if (on) return { ...mixStation(q, rnd), upNext: mixed(q.upNext, rnd), shuffle: true };
  const st = q.station;
  const back = st?.kind === 'list' && st.orig ? { ...st, items: st.orig, index: Math.max(0, st.orig.findIndex(x => x.id === q.now?.id)), orig: undefined } : st;
  return { ...q, station: back, shuffle: false };
}
export const setAutoplay = (q, on) => (Boolean(on) === q.autoplay ? q : { ...q, autoplay: Boolean(on) });

export const setLoop = (q, loop) => (LOOPS.includes(loop) ? { ...q, loop } : q);
export const cycleLoop = q => setLoop(q, LOOPS[(LOOPS.indexOf(q.loop) + 1) % LOOPS.length]);

// The station is the radio again (or a list, or none).
export const setStation = (q, station) => ({ ...q, station });
export const listStation = (items, id) => {
  const index = items.findIndex(x => x.id === id);
  return items.length && index >= 0 ? { kind: 'list', items, index } : null;
};

// Forward. auto: the song ended by itself (loop-one repeats it; a tap on forward goes on).
// -> { q, item, restart?, handoff? }: item = what to play; restart = the same song again;
// handoff = 'radio': the queue is empty and the station is the radio: the radio goes on.
export function next(q, { auto = false } = {}) {
  if (auto && q.loop === 'one' && q.now) return { q, item: q.now, restart: true };
  const go = (item, over = {}) => ({ q: { ...q, history: pushHistory(q.history, q.now), now: item, ...over }, item });
  if (q.again.length) return go(q.again.at(-1), { again: q.again.slice(0, -1) });
  if (q.upNext.length) return go(q.upNext[0], { upNext: q.upNext.slice(1) });
  const st = q.station;
  if (st?.kind === 'list') {
    let i = st.index + 1;
    if (i >= st.items.length && q.loop === 'all') i = 0;
    if (i < st.items.length) return go(st.items[i], { station: { ...st, index: i } });
    if (q.autoplay && q.loop !== 'all') return { q, item: null, handoff: 'radio' };
  } else if (st?.kind === 'radio') return { q, item: null, handoff: 'radio' };
  else if (q.loop === 'all') {
    const played = [...q.history, ...(q.now ? [q.now] : [])];
    if (played.length > 1) return { q: { ...q, history: [], now: played[0], upNext: played.slice(1), again: [] }, item: played[0] };
    if (played.length === 1) return { q, item: played[0], restart: true };
  }
  return q.autoplay && q.loop !== 'all' && q.now ? { q, item: null, handoff: 'radio' } : { q, item: null };
}

// Back. elapsed: seconds into the song. Within the first BACK_WITHIN s: the song before
// (from history; the one left is what forward comes back to); after it, or with none before: the song again.
// -> { q, item, restart? }
export function back(q, elapsed = 0) {
  if (elapsed > BACK_WITHIN || !q.history.length) return { q, item: q.now, restart: true };
  const item = q.history.at(-1);
  return { q: { ...q, history: q.history.slice(0, -1), now: item, again: q.now ? [...q.again, q.now] : q.again }, item };
}

// The songs after the user's queue, for the sheet: the list a song was started from.
// (The radio's own are asked of the radio.)
export function stationNext(q, n = 8) {
  const st = q.station;
  if (st?.kind !== 'list') return [];
  const out = st.items.slice(st.index + 1, st.index + 1 + n);
  if (q.loop === 'all' && out.length < n) out.push(...st.items.slice(0, n - out.length).filter(x => x.id !== q.now?.id));
  return out;
}

// ---- Kept on the phone: small JSON, ids and words ----
export const QUEUE_KEY = 'orbit-beats-queue.v1';
export const KEEP_HISTORY = 30;
export const toText = q => JSON.stringify({ v: 1, history: q.history.slice(-KEEP_HISTORY).map(slim), upNext: q.upNext.map(slim), loop: q.loop, autoplay: q.autoplay });
const okItem = it => it && typeof it.id === 'string' && (it.kind === 'radio' || it.kind === 'song') && typeof it.title === 'string' && (it.kind !== 'radio' || (Number.isFinite(it.seed) && typeof it.style === 'string' && typeof it.mood === 'string'));
// Read back: only well-formed items. A bad read is an empty queue. Nothing is "now" after a restart.
export function fromText(text) {
  try {
    const v = JSON.parse(text);
    const list = a => (Array.isArray(a) ? a.filter(okItem) : []);
    return { ...newQueue(), history: list(v.history).slice(-KEEP_HISTORY), upNext: list(v.upNext).slice(0, QUEUE_MAX), loop: LOOPS.includes(v.loop) ? v.loop : 'off', autoplay: v.autoplay === true };
  } catch {
    return newQueue();
  }
}

// The one player over the two ways music plays here: the radio (lib/radioview.mjs,
// its own <audio>, made from specs) and a song (app.js's <audio>: the library and the
// batch). It keeps the queue (lib/queue.mjs), says what is playing as one thing, and
// does what the buttons, the lock screen and a song's end ask: back, forward, loop,
// 插播, 稍後播放. The radio's stream and swaps are not touched: it is only started,
// paused, skipped or given a station or an exact song.
import * as Q from './queue.mjs';
import { coverSvg, coverUrl } from './cover.mjs';
import { STYLES } from '../engine.mjs';

const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const covers = new Map();
// A track's cover (the same every time): from its seed, groove, mood, key and tempo.
export function coverOfTrack(t, { text = false } = {}) {
  if (!t) return '';
  const style = STYLES.includes(t.style) ? t.style : 'four';
  const k = `${t.id}:${text}`;
  if (!covers.has(k)) {
    if (covers.size > 400) covers.clear();
    covers.set(k, coverUrl(coverSvg({ seed: Number.isFinite(t.seed) ? t.seed : hash(t.id), style, mood: t.mood || 'all', key: t.key || null, bpm: t.bpm || 100, title: t.title || '', text })));
  }
  return covers.get(k);
}

// d: { radio, audio, songOf(track) -> song | null, playSong(song, at) -> Promise, makeSong(track) -> Promise<song>,
//      nowSong() -> the song playing | null, store? }
export function createPlayer(d) {
  const { radio, audio } = d;
  let q = Q.newQueue();
  try {
    q = Q.fromText(d.store?.getItem(Q.QUEUE_KEY) || '');
  } catch {}
  let active = null; // 'radio' | 'song' | null: which of the two the last play was
  let handing = false;
  let making = null; // the radio song whose file is being made for a repeat
  const subs = new Set();
  const emit = what => {
    for (const f of subs)
      try {
        f(what);
      } catch {}
  };
  let saveTimer = 0;
  const set = next => {
    q = next;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        d.store?.setItem(Q.QUEUE_KEY, Q.toText(q));
      } catch {}
    }, 400);
    emit('queue');
  };

  const songTrack = s => s && { id: s.id, kind: 'song', title: s.name, style: s.info?.style, bpm: s.info?.bpm, key: s.info?.key || null, seconds: s.info?.seconds, seed: Number.isFinite(s.recipe?.seed) ? s.recipe.seed : undefined, sub: s.info?.style ? '' : 'jam' };
  // What is playing, as one thing: { source, track, cover, playing, busy, t, seconds, canSeek } | null
  function state() {
    if (active === 'song' && d.nowSong()) {
      const s = d.nowSong();
      const track = q.now?.id === s.id ? q.now : songTrack(s);
      const seconds = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : s.info?.seconds || 0;
      return { source: 'song', track, cover: coverOfTrack(track), playing: !audio.paused, busy: false, t: audio.currentTime || 0, seconds, canSeek: true, upTo: Math.min(seconds, reach()) };
    }
    if (active === 'radio') {
      const r = radio.state();
      const track = r.cur && (!q.now || q.now.id === r.cur.id || q.now.kind !== 'radio') ? r.cur : q.now?.kind === 'radio' ? q.now : r.cur;
      const same = r.cur && track && r.cur.id === track.id;
      return { source: 'radio', track, cover: same ? r.cover : track ? coverOfTrack(track) : radio.idle().cover, playing: r.playing, busy: r.busy || Boolean(track && !same), t: same ? r.t : 0, seconds: same ? r.seconds : 0, canSeek: Boolean(same && r.seconds && (r.upTo ?? r.seconds) > 1), upTo: same ? (r.upTo ?? r.seconds) : 0, station: r.station, want: r.want };
    }
    return null;
  }

  // Starts a track as it can be played: a kept or batch song from its sound, else a radio song made from its spec.
  async function start(track, at = 0) {
    const song = d.songOf(track);
    if (song) {
      active = 'song';
      audio.loop = q.loop === 'one';
      await d.playSong(song, at);
      return true;
    }
    if (track.kind === 'radio') {
      active = 'radio';
      handing = false;
      if (q.loop === 'one') {
        // (One song on repeat: from its own file, which the player loops. The radio plays on while it's
        // made, so the file picks up where the radio is then, not where it was.)
        if (making === track.id) return true;
        making = track.id;
        const made = await d.makeSong(track).catch(() => null);
        making = null;
        if (made) {
          const r = radio.state();
          const now = r.cur?.id === track.id && r.playing ? r.t : at;
          return (active = 'song'), (audio.loop = true), d.playSong(made, now).then(() => true);
        }
      }
      d.quiet?.();
      radio.playSpec(track);
      emit('state');
      return true;
    }
    d.toast?.(d.missing || 'Not found');
    return false;
  }

  // ---- What the buttons ask ----
  async function play(track, station, at = 0) {
    // (A radio song played again goes on as the station it came from.)
    if (station === undefined && track.kind === 'radio' && q.station?.kind !== 'radio') station = { kind: 'radio', id: radio.station() };
    set(Q.playNow(q, track, station));
    if (!(await start(track, at))) forward();
  }
  // A song from a list (the batch, the library): the list goes on after it.
  const playFrom = (track, list) => play(track, Q.listStation(list, track.id));
  const playNext = track => (set(Q.playNext(q, track)), d.toast?.(d.words?.next));
  const playLater = track => (set(Q.playLater(q, track)), d.toast?.(d.words?.later));
  const remove = i => set(Q.remove(q, i));
  const move = (a, b) => set(Q.move(q, a, b));
  const clear = () => set(Q.clear(q));

  // A station (lib/stations.mjs): the radio, from its next song on.
  function station(id) {
    active = 'radio';
    handing = false;
    d.quiet?.();
    set(Q.setStation(q, { kind: 'radio', id }));
    const went = radio.pick(id);
    emit('state');
    return went;
  }
  // The radio, as it is (a hero's ▶ before anything played).
  function radioPlay() {
    active = 'radio';
    d.quiet?.();
    if (q.station?.kind !== 'radio') set(Q.setStation(q, { kind: 'radio', id: radio.station() }));
    radio.start();
    emit('state');
  }

  function toggle() {
    const s = state();
    if (!s) return radioPlay();
    if (s.source === 'radio') return s.playing || s.want ? (radio.pause(), emit('state')) : radioPlay();
    if (audio.paused) audio.play().catch(() => d.revive?.());
    else audio.pause();
  }
  function restart() {
    const s = state();
    if (!s) return;
    if (s.source === 'song') {
      audio.currentTime = 0;
      if (audio.paused) audio.play().catch(() => {});
    } else if (q.now) start(q.now);
  }
  // Forward: the queue's next, else the station's (the radio's own next song).
  async function forward({ auto = false } = {}) {
    const r = Q.next(q, { auto });
    if (r.restart) return restart();
    if (r.handoff === 'radio') {
      if (active === 'radio') return radio.skip();
      active = 'radio';
      d.quiet?.();
      // (Autoplay: the list ran out, so the radio is the station from here.)
      if (q.station?.kind !== 'radio') set(Q.setStation(q, { kind: 'radio', id: radio.station() }));
      radio.start();
      return emit('state');
    }
    if (!r.item) {
      // (Nothing left: a song's end leaves it paused; the radio goes on by itself.)
      return;
    }
    set(r.q);
    if (!(await start(r.item))) forward();
  }
  async function back() {
    const s = state();
    const r = Q.back(q, s?.t || 0);
    if (r.restart || !r.item) return restart();
    set(r.q);
    await start(r.item);
  }
  // How far the song can be moved to now: what the phone has of it (a kept song's
  // sound still being read: no further than that, not into silence).
  function reach() {
    const r = audio.seekable;
    let end = 0;
    try {
      for (let i = 0; i < (r?.length || 0); i++) end = Math.max(end, r.end(i));
    } catch {}
    return end;
  }
  function seek(t) {
    const s = state();
    // (A radio song is made whole before it plays: anywhere in it.)
    if (s?.source === 'radio') {
      if (s.canSeek) radio.seek?.(t);
      return emit('time');
    }
    if (s?.source !== 'song') return;
    const max = Math.min(s.seconds || t, s.upTo) - 0.3;
    if (max <= 0) return;
    audio.currentTime = Math.max(0, Math.min(t, max));
  }
  const shuffle = on => (set(Q.setShuffle(q, on === undefined ? !q.shuffle : on)), q.shuffle);
  const autoplay = on => (set(Q.setAutoplay(q, on === undefined ? !q.autoplay : on)), q.autoplay);
  function cycleLoop() {
    set(Q.cycleLoop(q));
    audio.loop = q.loop === 'one' && active === 'song';
    // (The radio's song, now on repeat: it goes on from its own file.)
    const s = state();
    if (q.loop === 'one' && s?.source === 'radio' && s.track && !s.busy) {
      const at = s.t;
      start(s.track, at);
    }
    return q.loop;
  }

  // ---- What the radio and the song player tell ----
  radio.on(what => {
    if (what === 'song') {
      const r = radio.state();
      if (active === 'radio' && r.cur) set(Q.radioNow(q, r.cur));
    }
    if (what === 'time' && active === 'radio' && !making && q.loop === 'one') {
      const r = radio.state();
      // (On repeat but still on the radio: over to its own file before the radio moves on.)
      if (r.playing && r.cur && r.seconds && r.seconds - r.t < 4 && r.t > 1) {
        handing = true;
        start(r.cur, r.t);
      }
    }
    if (what === 'time' && active === 'radio' && !handing && (q.upNext.length || q.again.length)) {
      const r = radio.state();
      // (The queue has songs: when the radio's song is nearly done, they take over.)
      if (r.playing && r.seconds && r.seconds - r.t < 0.7 && r.t > 5) {
        handing = true;
        forward();
      }
    }
    emit(what);
  });
  // A song's end: on to the next (a repeat of one stays with the player's loop).
  const ended = () => forward({ auto: true });
  const attach = () => {
    for (const ev of ['timeupdate', 'play', 'pause', 'loadedmetadata', 'seeked', 'progress', 'durationchange']) audio.addEventListener(ev, () => emit(ev === 'timeupdate' ? 'time' : 'state'));
  };
  attach();
  // Closing the mini player.
  function close() {
    if (active === 'song') d.closeSong?.();
    else radio.pause();
    active = null;
    emit('state');
  }
  return {
    get q() {
      return q;
    },
    state,
    start,
    play,
    playFrom,
    playNext,
    playLater,
    remove,
    move,
    clear,
    station,
    radioPlay,
    refresh: () => emit('state'),
    toggle,
    forward,
    back,
    seek,
    cycleLoop,
    shuffle,
    autoplay,
    ended,
    close,
    // A song started outside (the player of a song row): it is what plays.
    songStarted: song => {
      active = 'song';
      if (song && q.now?.id !== song.id) set(Q.playNow(q, songTrack(song)));
      emit('state');
    },
    // The list playing grew (a batch still being made): what follows is the whole list.
    relist: list => {
      if (q.station?.kind !== 'list' || !list.some(x => x.id === q.now?.id)) return;
      if (!q.station.items.every(x => list.some(y => y.id === x.id))) return;
      const next = Q.setStation(q, Q.listStation(list, q.now.id));
      set(q.shuffle ? Q.setShuffle({ ...next, shuffle: false }, true) : next);
    },
    upNextRadio: () => (q.station?.kind === 'radio' ? radio.upcoming() : []),
    stationNext: () => Q.stationNext(q),
    on: f => (subs.add(f), () => subs.delete(f)),
    track: songTrack
  };
}

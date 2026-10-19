// 聽: the radio's screen and its player. One big play button, the moods
// (and every groove on its own), and what's playing: its name, mood, groove,
// tempo and key, ♡ to keep it, ⏭ for the next. Songs are made in the worker
// (lib/make.mjs radio) two ahead of the one playing, each starting under the
// last one's ring. One <audio> plays them all (only one: iOS keeps one going
// with the screen locked, on the lock screen's card): as one endless stream
// where the phone takes it (lib/tape.mjs, Media Source), so one song runs
// into the next with nothing between; else file by file, swapped at the cut
// just before a song's last hit. When the next isn't made yet, the last hook
// plays again from its bar line until it is. A stream that fails or stalls,
// goes over to files from where it was ('orbit-beats-radio' = 'files' on this
// phone keeps it that way). Stopped by the phone, not you (another app's sound,
// a call, Siri), it comes back by itself, and ▶ (here or on the lock screen)
// always brings it back: a stream that can't go on is opened again.
// Around the music, nothing in its way: each song's own cover (lib/cover.mjs),
// crossfaded in, its bars and a breath of the cover on the song's beat (CSS
// set to the tempo, lined up with the player's time, no listening to the
// sound), the card tinted with its colour, the lock screen showing the same
// cover; 最近播放, and 睡眠定時 (lib/listen.mjs).

import { h, toast, menu } from './ui.mjs';
import { icon } from './icons.mjs';
import { stationFilter, stationId, stationName } from './stations.mjs';
import { NOTE_NAMES } from '../engine.mjs';
import { MOODS, RADIO_SR, radioPick, radioQueue, stationStyles } from './radio.mjs';
import { FRAME, CODECS, bytesOf, tapeInit, tapeSegment, tapeFragment, tapeFeed, wavPcm, pickStream, timescaleOf, audioData } from './tape.mjs';
import { STYLE_NAMES, STYLE_ORDER, name } from './names.mjs';
import { W } from './lang.mjs';
import { coverSvg, coverUrl, coverPalette } from './cover.mjs';
import { SLEEP_CHOICES, sleepSet, sleepLeft, sleepGain, sleepDone, sleepClock, RECENT_KEY, recentAdd, recentEntry, recentParse, recentItem } from './listen.mjs';

const keyName = k => (k ? `${NOTE_NAMES[k.tonic]} ${k.minor ? W('小調', 'minor') : W('大調', 'major')}` : '');
const moodOf = m => (MOODS[m] ? stationName(m) : '');
const moodName = stationName;
// The words over a cover: its groove and tempo.
const coverLabel = (style, bpm) => `${name(STYLE_NAMES, style)} · ${bpm} BPM`;
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
// A half second of silence: played on the first tap, it lets the page start the music once it's made (iOS's rule).
function hush() {
  const n = 8000;
  const b = new Uint8Array(44 + n * 2);
  const v = new DataView(b.buffer);
  const str = (o, s) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}

// api: { make (lib/maker.mjs), quiet(), title(seed), keep(item), kept(id), session(owner), mood, setMood(m) }
export function mountRadio(panel, api) {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  const q = radioQueue();
  let mood = stationId(api.mood); // the station: 'all', a mood, 'style:<id>', 'tempo:<t>' or 'taste' (lib/stations.mjs)
  const exact = []; // exact songs to make first: { seed, mood, style } (a recent one played again)
  let cur = null; // the stretch playing: { id, spec, info, url, seconds, hold, title }
  let want = false; // the music asked for (play tapped, not paused)
  let silent = null;
  let fails = 0;
  let last = []; // the songs played lately ({ seed, mood, style }), so the next differs

  // ---- Telling the screens (lib/homeview.mjs, lib/playerview.mjs draw them) ----
  const subs = new Set();
  const emit = what => {
    for (const f of subs)
      try {
        f(what);
      } catch {}
  };

  // ---- Making ahead ----
  const spec = () => {
    const f = stationFilter(mood, api.taste?.());
    const s = exact.length ? exact.shift() : radioPick(f.mood, last, Math.floor(Math.random() * 1e9), f.styles || f.bpm ? f : null);
    last = [...last, s].slice(-24);
    return s;
  };
  // Two ahead of the one playing (on the tape, one already laid down counts); one more as soon as one is used.
  function fill() {
    // (Before play: one, so the first tap plays at once; playing: two.)
    if (q.busy || q.ready.length + (upcoming() ? 1 : 0) >= (want ? 2 : 1) || fails >= 3) return;
    const s = spec();
    const after = q.ready.at(-1)?.id || upcoming()?.id || cur?.id || null;
    const gen = q.gen;
    q.busy = true;
    api.make
      .radio(s, after)
      .then(v => {
        q.busy = false;
        fails = 0;
        const item = dress({ ...v, spec: s, title: api.title(s.seed), url: null });
        if (gen === q.gen) {
          // (Files: the next one's file made now, long before it's needed; the stream: its samples.)
          if (taped) item.pcm = wavPcm(v.wav);
          else (item.url = URL.createObjectURL(new Blob([v.wav], { type: 'audio/wav' }))), delete item.wav;
          q.ready.push(item);
        }
        if (want && tape && !cur) pump();
        else if (want && (!cur || q.skip)) advance();
        else if (tape) pump();
        paintNext();
        fill();
      })
      .catch(() => {
        q.busy = false;
        fails++;
        paintNext();
        if (fails < 3) setTimeout(fill, 400);
        else if (want && !cur) toast(W('音樂做不出來，再按一次播放試試', "Couldn't make the music: tap play again"), { tone: 'bad' });
      });
  }
  const urlOf = it => (it.url ||= URL.createObjectURL(new Blob([it.wav], { type: 'audio/wav' })));
  const drop = it => it && it !== cur && !tape?.marks.some(m => m.item === it) && !q.ready.includes(it) && (it.url && URL.revokeObjectURL(it.url), (it.url = null), (it.pcm = null), (it.wav = null));
  // The next song, now (or as soon as it's made).
  function advance() {
    const item = q.ready.shift();
    if (!item) {
      q.skip = true;
      return paintNext();
    }
    q.skip = false;
    if (tape) {
      cutTo(item);
      return fill();
    }
    // (Files: main's swap, step for step: nothing more between one song and the next.)
    const was = cur;
    cur = item;
    audio.loop = false;
    audio.src = item.url || urlOf(item);
    if (want) audio.play().catch(() => retry());
    if (was) setTimeout(() => drop(was), 4000);
    paint();
    api.session(session());
    fill();
  }
  // A play() refused (iOS between songs, a stretch the phone couldn't read): the next one, once.
  let retried = 0;
  function retry() {
    if (!want || retried++ > 2) return paint();
    setTimeout(() => (q.ready.length && !tape ? advance() : audio.play().catch(() => paint())), 300);
  }

  // ---- The tape: every song on one stream, no gap between them (lib/tape.mjs) ----
  // { ms, sb, time (samples laid down), number, seq, marks: [{ t (s), item, from (s) }], cut (s, a ⏭ to make) }
  let tape = null;
  const AHEAD = 12; // seconds laid down ahead of the one playing
  const AHEAD_OFF = 90; // off the screen, where the phone runs the page only now and then: more
  const CHUNK = 20; // FLAC frames an append (2.6 s); as many samples a time to the encoder
  const SR = RADIO_SR;
  // The stream: FLAC as it is, or AAC / Opus packed on the phone (WebCodecs).
  // Times on it: `time`, `base` in its clock (ts a second), `inTime` in samples.
  function openTape(choice) {
    const MS = globalThis.ManagedMediaSource || globalThis.MediaSource;
    const ms = new MS();
    const c = choice.codec;
    const t = { ms, sb: null, codec: c, type: CODECS.find(x => x.codec === c).type, ts: timescaleOf(c, SR), fr: c === 'flac' ? FRAME : c === 'aac' ? 1024 : 960, base: 0, time: 0, inTime: 0, number: 0, seq: 1, marks: [], cut: null, feed: tapeFeed(SR), stuck: 0, last: -1, inited: false, enc: null, pending: [], desc: null, config: choice.config };
    if (c !== 'flac') {
      t.enc = new AudioEncoder({
        output: (chunk, meta) => {
          if (tape !== t) return;
          if (meta?.decoderConfig?.description && !t.desc) t.desc = meta.decoderConfig.description;
          let data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          // (AAC in ADTS after all: its header off, the frame as MP4 holds it.)
          if (c === 'aac' && data[0] === 0xff && (data[1] & 0xf6) === 0xf0) data = data.subarray(data[1] & 1 ? 7 : 9);
          const dur = chunk.duration ? Math.round((chunk.duration * t.ts) / 1e6) : t.fr;
          t.fr = dur || t.fr;
          t.pending.push({ data, dur: t.fr });
          pump();
        },
        error: e => tape === t && toFiles(`encoder: ${e?.message || e}`)
      });
      t.enc.configure(t.config);
    }
    // (iOS's Managed Media Source plays only with AirPlay off for it.)
    audio.disableRemotePlayback = true;
    ms.addEventListener('sourceopen', () => {
      try {
        t.sb = ms.addSourceBuffer(t.type);
        t.sb.mode = 'segments';
        t.sb.addEventListener('updateend', pump);
        // (Why, for ?debug: which append, the encoder's description, the player's error.)
        t.sb.addEventListener('error', () => {
          const d = bytesOf(t.desc);
          toFiles(`append (${t.stage}${d ? `, description ${[...d.subarray(0, 12)].map(x => x.toString(16).padStart(2, '0')).join('')} ${d.length} B` : ''}${audio.error ? `, error ${audio.error.code} ${audio.error.message || ''}` : ''})`);
        });
        pump();
      } catch (e) {
        toFiles(`open: ${e?.name || e}`);
      }
    }, { once: true });
    ms.addEventListener?.('startstreaming', pump);
    audio.loop = false;
    audio.src = URL.createObjectURL(ms);
    return t;
  }
  const ahead = () => {
    const b = tape?.sb?.buffered;
    return b && b.length ? b.end(b.length - 1) - audio.currentTime : 0;
  };
  // More of the stream, a little at a time, when it runs under AHEAD seconds; what's played, let go.
  function pump() {
    const t = tape;
    if (!t?.sb || t.sb.updating || t.ms.readyState !== 'open') return;
    try {
      if (t.cut != null) {
        // (⏭: what was laid down past here goes; the next song from here, the encoder started afresh.)
        const at = t.cut;
        t.cut = null;
        t.time = t.base = Math.round(at * t.ts);
        t.inTime = Math.round(at * SR);
        t.marks = t.marks.filter(m => m.t < at);
        if (t.enc) t.enc.reset(), t.enc.configure(t.config), (t.pending = []);
        return t.sb.remove(at, Infinity);
      }
      // (What the stream is, first: for AAC and Opus, once the encoder has said.)
      if (!t.inited) {
        if (t.enc && !t.pending.length) return feedEncoder(t);
        t.inited = true;
        t.stage = 'init';
        return t.sb.appendBuffer(tapeInit(SR, { codec: t.codec, description: t.desc }));
      }
      const b = t.sb.buffered;
      // (The phone let go of music laid down ahead, which can't be laid down again: the songs file by file.)
      if (t.time > 0 && b.length && b.end(b.length - 1) < t.time / t.ts - 1) return toFiles('evicted');
      if (b.length && audio.currentTime - b.start(0) > 30) return t.sb.remove(0, audio.currentTime - 10);
      if (t.enc && t.pending.length) {
        const frames = t.pending;
        t.pending = [];
        t.stage = `fragment ${t.seq}`;
        t.sb.appendBuffer(tapeFragment(frames, { time: t.time, seq: t.seq++ }));
        t.time += frames.reduce((a, f) => a + f.dur, 0);
        return;
      }
      // (Managed Media Source says when it's a good time; under 5 s left, it's always one.)
      if (ahead() > (document.visibilityState === 'hidden' ? AHEAD_OFF : AHEAD) || (t.ms.streaming === false && ahead() > 5)) return;
      if (t.enc) return feedEncoder(t);
      const n = CHUNK * FRAME;
      const marks = take(t, n);
      if (!marks) return;
      t.stage = `fragment ${t.seq}`;
      t.sb.appendBuffer(tapeSegment(marks.pcm, 0, CHUNK, { sr: SR, time: t.time, number: t.number, seq: t.seq++ }));
      t.time += n;
      t.number += CHUNK;
    } catch (e) {
      // (Full: what's played goes first; anything else, the songs one file at a time.)
      if (e?.name === 'QuotaExceededError' && audio.currentTime > 4) t.sb.remove(0, audio.currentTime - 2);
      else toFiles(e?.name || 'append');
    }
  }
  // The next n samples off the songs, their marks kept. -> { pcm } | null
  function take(t, n) {
    if (!t.feed.item && !q.ready.length) return null;
    const { pcm, marks } = t.feed.take(n, () => q.ready.length > 0, () => q.ready.shift() || null);
    for (const m of marks) t.marks.push({ t: (t.inTime + m.at) / SR, item: m.item, from: m.from / SR });
    t.inTime += n;
    if (marks.length) fill();
    return { pcm };
  }
  // AAC / Opus: the next samples to the encoder (its frames come back to pump), never more than a few seconds ahead of what's out.
  function feedEncoder(t) {
    if (t.enc.state !== 'configured' || t.enc.encodeQueueSize > 1 || t.inTime / SR - t.time / t.ts > 6) return;
    const at = t.inTime;
    const got = take(t, CHUNK * FRAME);
    if (got) t.enc.encode(audioData(got.pcm, SR, at));
  }
  // The stretch playing: which song and where in it. -> { item, at (s) } | null
  function onTape() {
    const now = audio.currentTime;
    let m = null;
    for (const x of tape.marks) if (x.t <= now + 0.01) m = x;
    return m && { item: m.item, at: m.from + (now - m.t) };
  }
  // The song laid down after the one playing, not yet heard.
  function upcoming() {
    if (!tape) return null;
    const now = audio.currentTime;
    return tape.marks.find(m => m.t > now && m.item !== cur)?.item || null;
  }
  function cutTo(item) {
    const t = tape;
    t.feed.cut(item);
    // (At the first whole frame a quarter second on, or where the stream ends if sooner.)
    const k = Math.ceil(((audio.currentTime + 0.25) * t.ts - t.base) / t.fr);
    t.cut = Math.min(t.time, t.base + Math.max(0, k) * t.fr) / t.ts;
    pump();
  }
  // The tape stopped working (a phone that won't take it, a stall): on with the songs file by file, from where it was.
  function toFiles(why) {
    if (!tape) return;
    const t = tape;
    const here = cur ? onTape() : null;
    // (What was laid down and not heard yet goes back in line.)
    const later = [...new Set(t.marks.filter(m => m.t > audio.currentTime && m.item !== cur).map(m => m.item))];
    q.ready.unshift(...later.filter(it => !q.ready.includes(it)));
    if (t.feed.item && t.feed.item !== cur && !q.ready.includes(t.feed.item)) q.ready.unshift(t.feed.item);
    tape = null;
    taped = false;
    audio.disableRemotePlayback = false;
    try {
      t.enc?.close();
    } catch {}
    // (The next ones' files made now, before they're needed.)
    q.ready.forEach(urlOf);
    console.warn('聽: the songs one file at a time:', why);
    note('files', `the stream stopped: ${why}`);
    audio.removeAttribute('src');
    if (!cur) return want && q.ready.length ? advance() : undefined;
    audio.src = urlOf(cur);
    const at = here?.item === cur ? here.at : 0;
    if (at > 0) audio.addEventListener('loadedmetadata', () => (audio.currentTime = Math.min(at, cur.seconds - 0.5)), { once: true });
    if (want) audio.play().catch(() => retry());
  }
  // The stream can't go on (closed, or the player broke while the phone held it): opened
  // again from the next song, the songs not heard yet back in line.
  function freshTape(why) {
    const t = tape;
    if (t) {
      const later = [...new Set(t.marks.filter(m => m.t > audio.currentTime && m.item !== cur).map(m => m.item))];
      q.ready.unshift(...later.filter(it => !q.ready.includes(it)));
      if (t.feed.item && t.feed.item !== cur && !q.ready.includes(t.feed.item)) q.ready.unshift(t.feed.item);
      try {
        t.enc?.close();
      } catch {}
    }
    tape = null;
    const was = cur;
    cur = null;
    if (was) setTimeout(() => drop(was), 4000);
    note('stream', `opened again: ${why}`);
    if (!taped || !openOr()) {
      q.ready.forEach(urlOf);
      if (q.ready.length) advance();
    } else {
      audio.play().catch(() => {});
      pump();
    }
    fill();
    paint();
    claim();
  }
  const broken = () => Boolean(audio.error) || (tape && tape.ms.readyState === 'closed');
  // Music asked for and not playing (the phone stopped it, not you): on again. A play the
  // phone won't allow yet (off the screen) waits for the next chance; a broken one opens afresh.
  function resume(why) {
    if (!want || !audio.paused) return;
    if (broken()) return tape ? freshTape(why) : cur ? (q.ready.length ? advance() : retry()) : undefined;
    audio.play().catch(e => {
      if (e?.name === 'NotAllowedError') return paint();
      if (tape) freshTape(`${why}: ${e?.name || e}`);
      else if (q.ready.length) advance();
    });
    if (tape) pump();
  }
  // Which way this phone plays (decided once, as the screen opens), kept for a look:
  // localStorage 'orbit-beats-radio-path' ('stream: …' or 'files: …'), and on 聽 with ?debug.
  let taped = false;
  let codec = null;
  let choice = null;
  function note(path, reason) {
    try {
      localStorage.setItem('orbit-beats-radio-path', `${path}: ${reason}`);
    } catch {}
  }
  // ('orbit-beats-radio' on this phone: 'files', or one codec to try alone: 'flac', 'aac', 'opus'.)
  let forced = null;
  try {
    forced = localStorage.getItem('orbit-beats-radio');
    // (Once: 'files' set by the app itself when the phone paused the stream; that's no
    // reason to stay on files, so phones it was set on go back to the stream.)
    if (forced === 'files' && !localStorage.getItem('orbit-beats-radio-unstuck')) {
      localStorage.removeItem('orbit-beats-radio');
      forced = null;
    }
    localStorage.setItem('orbit-beats-radio-unstuck', '1');
  } catch {}
  if (forced === 'files') note('files', "set to files on this phone ('orbit-beats-radio')");
  else
    pickStream(RADIO_SR, { codecs: CODECS.some(c => c.codec === forced) ? CODECS.filter(c => c.codec === forced) : CODECS })
      .then(p => {
        taped = p.path === 'stream';
        codec = p.codec;
        choice = p;
        note(p.path, p.reason);
      })
      .catch(e => note('files', `couldn't tell: ${e?.message || e}`));

  // (The stream opened, or files if it can't be: the songs made so far get their files.)
  function openOr() {
    try {
      tape = openTape(choice);
      return true;
    } catch (e) {
      taped = false;
      note('files', `couldn't open the stream: ${e?.message || e}`);
      return false;
    }
  }

  // ---- Play, pause, next, the mood ----
  function start() {
    api.quiet();
    want = true;
    retried = 0;
    fails = 0;
    if (cur && broken()) {
      if (tape) return freshTape('▶ on a broken stream');
      audio.play().catch(() => retry());
    } else if (cur) {
      audio.play().catch(e => (e?.name === 'NotAllowedError' ? paint() : tape ? freshTape(`▶: ${e?.name || e}`) : retry()));
      if (tape) pump();
    } else if (taped && (tape || openOr())) {
      // (The tap opens the stream and plays it: the music starts as soon as the first song is on it.)
      audio.play().catch(() => {});
      pump();
    } else {
      // (The tap starts the element on a breath of silence, looped, so the music can follow it.)
      silent ||= hush();
      audio.loop = true;
      audio.src = silent;
      audio.play().catch(() => {});
      if (q.ready.length) advance();
    }
    fill();
    paint();
    claim();
  }
  function pause() {
    want = false;
    audio.pause();
    paint();
    claim();
  }
  function skip() {
    if (!want) return start();
    if (sleep?.song) sleep.skipped = true;
    const n = upcoming();
    // (The one laid down next: from now.)
    if (tape && n) return cutTo(n);
    if (q.ready.length) advance();
    else {
      q.skip = true;
      paintNext();
      fill();
    }
  }
  // A station (lib/stations.mjs): its songs from the next one on (starts the music if it isn't playing).
  function pick(id) {
    id = stationId(id);
    if (id === mood) return void (want || start());
    mood = id;
    api.setMood(id);
    emit('station');
    // What was made for the old mood goes; the next one is this mood's, and plays as soon as it's made.
    const old = q.ready;
    q.ready = [];
    for (const it of old) drop(it), unart(it);
    q.gen++;
    last = [];
    exact.length = 0;
    q.skip = Boolean(cur);
    if (!want) start();
    else fill();
    paintNext();
  }
  // One exact song again ({ seed, mood, style }): made from its spec like any other, then played from the next cut.
  function playSpec(e) {
    exact.length = 0;
    exact.push({ seed: e.seed, mood: e.mood, style: e.style });
    const old = q.ready;
    q.ready = [];
    for (const it of old) drop(it), unart(it);
    q.gen++;
    q.skip = Boolean(cur);
    if (!want) start();
    else fill();
    paintNext();
  }

  // ---- What the screens are told ----
  function paint() {
    // (Into 最近播放 as it starts, so a song heard is there even if the app is closed during it.)
    if (cur !== heard) {
      unart(heard);
      heard = cur;
      if (cur) remember(cur);
      emit('song');
    }
    emit('state');
  }
  const paintNext = () => emit('next');
  const songTime = () => (tape ? onTape()?.at ?? 0 : audio.currentTime || 0);
  function paintTime() {
    if (!cur) return;
    const t = songTime();
    emit('time');
  }
  const session = () => ({
    title: cur ? cur.title : W('Orbit 電台', 'Orbit Radio'),
    artist: cur ? [moodOf(cur.spec.mood), name(STYLE_NAMES, cur.info.style)].filter(Boolean).join(' · ') : 'Orbit Beats',
    album: W('Orbit 電台', 'Orbit Radio'),
    artwork: cur?.art || null,
    play: () => start(),
    pause: () => pause(),
    next: () => skip()
  });
  // The lock screen's card (Now Playing): its words and buttons, playing or
  // paused, where in the song. Set when the song changes or you tap, never
  // from the player's own events: a song change fires pause and play, and
  // answering those held up the next song's start.
  let placed = 0;
  function claim() {
    api.session(session());
    const ms = navigator.mediaSession;
    if (!ms) return;
    try {
      ms.playbackState = want ? 'playing' : 'paused';
    } catch {}
    // (Where in the song: a second on, once it plays.)
    clearTimeout(placed);
    placed = setTimeout(() => {
      try {
        if (cur && ms.setPositionState) ms.setPositionState({ duration: cur.seconds, position: Math.max(0, Math.min(cur.seconds, songTime())), playbackRate: 1 });
      } catch {}
    }, 1000);
  }

  // ---- Keeping it going ----
  audio.addEventListener('timeupdate', () => {
    if (tape) {
      // (On the tape: which song it is now, from where it was laid down.)
      const here = onTape();
      if (here && here.item !== cur) {
        const was = cur;
        cur = here.item;
        q.skip = false;
        paint();
        claim();
        if (was) setTimeout(() => drop(was), 4000);
        // (The marks before this song's own, let go.)
        const i = tape.marks.findLastIndex(m => m.t <= audio.currentTime + 0.01);
        if (i > 0) tape.marks = tape.marks.slice(i);
      }
      pump();
    }
    paintTime();
    sleepTick();
    // Nothing made yet at the outro: the last hook again, from its bar line.
    if (!tape && cur?.hold && !q.ready.length && audio.currentTime >= cur.hold.to) audio.currentTime = cur.hold.from;
  });
  audio.addEventListener('ended', () => {
    if (!cur || audio.loop || tape) return;
    if (q.ready.length) return advance();
    audio.currentTime = cur.hold ? cur.hold.from : 0;
    audio.play().catch(() => retry());
  });
  // (A stretch the phone couldn't play: on to the next; the tape: the songs file by file.)
  audio.addEventListener('error', () => {
    if (tape) return toFiles('error');
    if (cur && want && audio.src === cur.url) q.ready.length ? advance() : retry();
  });
  for (const ev of ['play', 'pause']) audio.addEventListener(ev, paint);
  // (The phone stopped it, not you: another app's sound, a call, Siri. Tried again in a
  // moment, a few times; and whenever the page is back, or ▶ is tapped anywhere.)
  audio.addEventListener('pause', () => {
    if (!want) return;
    for (const ms of [1000, 3000, 8000, 20000]) setTimeout(() => resume('paused by the phone'), ms);
  });
  for (const ev of ['pageshow', 'focus']) addEventListener(ev, () => resume(ev));
  audio.addEventListener('playing', () => (retried = 0));
  // (Every few seconds: the stream topped up, and a stall, time not moving with music ahead, caught.)
  setInterval(() => {
    if (!tape || !want) return;
    pump();
    if (audio.paused) return (tape.stuck = 0);
    // (Music laid down but time not moving, or a song on the way that never gets onto the stream.)
    tape.stuck = (ahead() > 1 || tape.feed.item) && audio.currentTime === tape.last ? tape.stuck + 1 : 0;
    tape.last = audio.currentTime;
    if (tape.stuck >= 5) toFiles(ahead() > 1 ? 'stalled' : 'nothing came out');
  }, 1000);
  // Back on the screen after a call or Siri: the music was asked for, so it goes on.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resume('back on the screen');
  });

  // ---- The cover, the beat, the tint ----
  // A song's covers, made as it's made (never at the swap): the card's, a thumbnail, the lock screen's PNG.
  function dress(item) {
    const o = { seed: item.spec.seed, style: item.info.style, mood: item.spec.mood, key: item.info.key, bpm: item.info.bpm };
    item.pal = coverPalette(o);
    item.cover = coverUrl(coverSvg({ ...o, text: false }));
    // (The lock screen's: a small JPEG, made long before the song plays. The
    // card's words are never held up for it: a song that starts before it's
    // ready has its card set without it, then its picture added once, the
    // words only, nothing else of the card touched.)
    toJpeg(item.cover).then(u => {
      if (!u) return;
      item.art = u;
      if (item === cur && !item.artShown) (item.artShown = true), api.meta?.(session());
    });
    return item;
  }
  async function toJpeg(src) {
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      c.getContext('2d').drawImage(img, 0, 0, 512, 512);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
      return blob ? URL.createObjectURL(blob) : null;
    } catch {
      return null;
    }
  }
  // (A song's lock-screen picture let go a while after it's no longer playing.)
  const unart = it => it?.art && setTimeout(() => it !== cur && (URL.revokeObjectURL(it.art), (it.art = null)), 15000);
  // Before the music: the station's own cover, of the mood picked.
  function idleCover() {
    const seed = [...String(mood)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const styles = stationStyles(stationFilter(mood, api.taste?.()));
    const o = { seed, style: styles[seed % styles.length], mood: MOODS[mood] ? mood : 'all', key: null, bpm: 110 };
    return { id: `idle:${mood}`, pal: coverPalette(o), cover: coverUrl(coverSvg({ ...o, text: false })) };
  }
  // ---- 最近播放 ----
  // On this phone only (a convenience): the songs that played, newest first; ♡ keeps one in 歌單.
  let recent = [];
  try {
    recent = recentParse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {}
  let heard = null;
  function remember(item) {
    recent = recentAdd(recent, recentEntry(item));
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {}
    paintRecent();
  }
  const thumbs = new Map();
  const thumbOf = e => {
    const k = `${e.seed}:${e.mood}:${e.style}`;
    if (!thumbs.has(k)) thumbs.set(k, coverUrl(coverSvg({ seed: e.seed, style: e.style, mood: e.mood, key: e.key, bpm: e.bpm, text: false })));
    return thumbs.get(k);
  };
  const paintRecent = () => emit('recent');

  // ---- 睡眠定時 ----
  // 15, 30 or 60 minutes, or this song's end: the last ten seconds fade out
  // (the player's volume: iPhone keeps its own, so there it just stops on time), then it pauses.
  let sleep = null; // { choice, until } | { choice, song, item, skipped }
  let sleepEvery = 0;
  function sleepMenu(sleepBtn) {
    const label = c => (c === 'song' ? W('這首結束', 'End of song') : W(`${c} 分鐘`, `${c} min`));
    const on = sleep?.choice;
    menu(
      sleepBtn,
      [...SLEEP_CHOICES.map(c => ({ label: label(c), check: c === on, onClick: () => setSleep(c) })), ...(sleep ? ['divider', { label: W('關閉', 'Off'), icon: 'close', onClick: () => setSleep(null) }] : [])],
      { header: { title: W('睡眠定時', 'Sleep timer'), sub: sleep ? (sleepShown && !sleep.song ? W(`剩 ${sleepShown}`, `${sleepShown} left`) : W('這首結束後停止', 'Stops after this song')) : '' }, scrim: true }
    ).el.classList.add('radio-menu');
  }
  function setSleep(c) {
    sleep = c ? { ...sleepSet(c), choice: c, item: cur } : null;
    clearInterval(sleepEvery);
    if (sleep) sleepEvery = setInterval(sleepTick, 500);
    else if (audio.volume !== 1) audio.volume = 1;
    sleepTick();
  }
  function sleepTick() {
    if (!sleep) return;
    if (sleep.song && cur !== sleep.item) {
      // (⏭ or no song yet: the end of the one playing now.)
      if (!sleep.item || sleep.skipped) Object.assign(sleep, { item: cur, skipped: false });
      else return sleepNow();
    }
    const left = sleepLeft(sleep, Date.now(), sleep.song ? (cur ? cur.seconds - songTime() : Infinity) : Infinity);
    if (sleepDone(left)) return sleepNow();
    if (want) {
      const g = sleepGain(left);
      if (audio.volume !== g) audio.volume = g;
    }
    paintSleep(left);
  }
  function sleepNow() {
    sleep = null;
    clearInterval(sleepEvery);
    if (want) pause();
    audio.volume = 1;
    paintSleep();
  }
  let sleepShown = '';
  const sleepText = () => sleepShown;
  function paintSleep(left = Infinity) {
    const txt = !sleep ? '' : sleep.song ? W('這首', 'Song') : sleepClock(left);
    if (txt === sleepShown) return;
    sleepShown = txt;
    emit('sleep');
  }

  // A song as the queue keeps it (lib/queue.mjs): its spec, a few words, never sound.
  const track = it => it && { id: `radio:${it.spec.seed}:${it.spec.mood}:${it.info.style}`, kind: 'radio', title: it.title, seed: it.spec.seed, mood: it.spec.mood, style: it.info.style, bpm: it.info.bpm, key: it.info.key ? { tonic: it.info.key.tonic, minor: Boolean(it.info.key.minor) } : null, seconds: it.seconds };
  const trackOf = e => ({ id: `radio:${e.seed}:${e.mood}:${e.style}`, kind: 'radio', title: api.title(e.seed), seed: e.seed, mood: e.mood, style: e.style, bpm: e.bpm, key: e.key || null, seconds: e.seconds });
  const upList = () => [upcoming(), ...q.ready].filter((x, i, a) => x && a.indexOf(x) === i);
  return {
    // The first song made while the screen opens, so the first tap plays at once.
    warm: () => fill(),
    stop: () => want && pause(),
    playing: () => want && !audio.paused,
    refresh: () => emit('state'),
    start,
    pause,
    // ▶ / ❚❚ on the radio as it is.
    toggle: () => (want && !audio.paused ? pause() : start()),
    skip,
    pick,
    playSpec,
    station: () => mood,
    // Now: the song playing (or null), and whether the radio is asked for.
    state: () => ({ cur: track(cur), cover: cur ? cur.cover : null, want, playing: want && !audio.paused && Boolean(cur), busy: want && !cur, t: cur ? songTime() : 0, seconds: cur ? cur.seconds : 0, station: mood }),
    upcoming: () => upList().map(it => ({ ...track(it), cover: it.cover })),
    // The station's own cover before any song (a hero with nothing playing).
    idle: () => idleCover(),
    recent: () => recent.map(trackOf),
    coverOf: e => thumbOf(e),
    track,
    trackOf,
    sleepMenu,
    sleeping: () => sleepShown,
    on: f => (subs.add(f), () => subs.delete(f))
  };
}

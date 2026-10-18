// 聽: the radio's screen and its player. One big play button, the moods
// (and every groove on its own), and what's playing: its name, mood, groove,
// tempo and key, ♡ to keep it, ⏭ for the next. Songs are made in the worker
// (lib/make.mjs radio) two ahead of the one playing, each starting under the
// last one's ring, so the music never stops: one <audio> (it keeps playing
// with the screen locked, on the lock screen's controls), its stretch swapped
// at the cut just before a song's last hit; when the next isn't made yet, the
// last hook plays again from its bar line until it is.

import { h, toast } from '#kit/ui.mjs';
import { STYLES, NOTE_NAMES } from '../engine.mjs';
import { MOODS, RADIO_SR, radioPick, radioQueue } from './radio.mjs';
import { FRAME, TAPE_TYPE, tapeInit, tapeSegment, tapeFeed, wavPcm } from './tape.mjs';
import { STYLE_NAMES, name } from './names.mjs';
import { W } from './lang.mjs';

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 5.6v12.8a1 1 0 0 0 1.55.83L14 13.6v4.8a1 1 0 0 0 1.55.83l7.2-6.4a1 1 0 0 0 0-1.66l-7.2-6.4A1 1 0 0 0 14 5.6v4.8L5.55 4.77A1 1 0 0 0 4 5.6z" transform="scale(.92) translate(1 1)"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.3s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>',
  hearted: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.3s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>'
};
const HUES = [330, 300, 275, 250, 220, 195, 170, 15, 350, 35];
const keyName = k => (k ? `${NOTE_NAMES[k.tonic]} ${k.minor ? W('小調', 'minor') : W('大調', 'major')}` : '');
const moodOf = m => (String(m).startsWith('style:') ? '' : moodName(m));
const moodName = m => (MOODS[m] ? W(MOODS[m].zh, MOODS[m].en) : name(STYLE_NAMES, String(m).replace(/^style:/, '')));
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
  let mood = MOODS[api.mood] || /^style:/.test(api.mood || '') ? api.mood : 'all';
  let cur = null; // the stretch playing: { id, spec, info, url, seconds, hold, title }
  let want = false; // the music asked for (play tapped, not paused)
  let silent = null;
  let fails = 0;
  let last = []; // the grooves played lately, so the next differs

  // ---- The screen ----
  const art = h('div', { class: 'radio-art', 'aria-hidden': 'true' }, [h('div', { class: 'eq' }, [0, 1, 2, 3, 4].map(k => h('i', { style: { '--k': String(k) } })))]);
  const title = h('h2', { class: 'radio-title', text: W('Orbit 電台', 'Orbit Radio') });
  const sub = h('p', { class: 'radio-sub', text: W('按下播放，音樂就一直放下去', 'Tap play: music that never stops') });
  const at = h('i');
  const bar = h('div', { class: 'radio-bar' }, [at]);
  const time = h('div', { class: 'radio-time' }, [h('span', { text: '0:00' }), h('span', { text: '' })]);
  const heart = h('button', { class: 'radio-btn', type: 'button', 'aria-label': W('收藏到歌單', 'Keep in Library'), html: ICON.heart, disabled: true, onclick: () => cur && api.keep(cur).then(paintHeart) });
  const play = h('button', { class: 'radio-play', type: 'button', 'aria-label': W('播放', 'Play'), html: ICON.play, onclick: () => (want && !audio.paused ? pause() : start()) });
  const next = h('button', { class: 'radio-btn', type: 'button', 'aria-label': W('下一首', 'Next song'), html: ICON.next, onclick: () => skip() });
  const upNext = h('p', { class: 'radio-next', 'aria-live': 'polite' });
  const card = h('section', { class: 'card radio-card' }, [art, h('div', { class: 'radio-what' }, [title, sub]), bar, time, h('div', { class: 'radio-ctl' }, [heart, play, next]), upNext]);
  const chip = (id, label) => h('button', { class: 'chip', type: 'button', 'data-mood': id, 'aria-pressed': String(id === mood), text: label, onclick: () => pick(id) });
  const moods = h('div', { class: 'radio-moods' }, Object.keys(MOODS).map(id => chip(id, moodName(id))));
  const grooves = h('div', { class: 'radio-moods' }, STYLES.map(s => chip(`style:${s}`, name(STYLE_NAMES, s))));
  const more = h('details', { class: 'radio-more' }, [h('summary', { text: W('或只聽一種鼓', 'Or just one groove') }), grooves]);
  panel.append(card, h('section', { class: 'card' }, [h('div', { class: 'head' }, [h('h2', { text: W('想聽什麼', 'What to play') })]), moods, more]));
  if (/^style:/.test(mood)) more.open = true;

  // ---- Making ahead ----
  const spec = () => {
    const s = radioPick(mood, last, Math.floor(Math.random() * 1e9));
    last = [...last, s.style].slice(-3);
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
        const item = { ...v, spec: s, title: api.title(s.seed), url: null };
        if (gen === q.gen) {
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
    const was = cur;
    cur = item;
    audio.loop = false;
    audio.src = urlOf(item);
    if (want) audio.play().catch(() => retry());
    if (was) setTimeout(() => drop(was), 4000);
    paint();
    claim();
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
  const CHUNK = 20; // frames an append (2.6 s)
  function openTape() {
    const MS = globalThis.ManagedMediaSource || globalThis.MediaSource;
    const ms = new MS();
    const t = { ms, sb: null, base: 0, time: 0, number: 0, seq: 1, marks: [], cut: null, feed: tapeFeed(RADIO_SR), stuck: 0, last: -1 };
    // (iOS's Managed Media Source plays only with AirPlay off for it.)
    audio.disableRemotePlayback = true;
    ms.addEventListener('sourceopen', () => {
      try {
        t.sb = ms.addSourceBuffer(TAPE_TYPE);
        t.sb.mode = 'segments';
        t.sb.addEventListener('updateend', pump);
        t.sb.addEventListener('error', () => toFiles('append'));
        t.sb.appendBuffer(tapeInit(RADIO_SR));
      } catch {
        toFiles('open');
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
        // (⏭: what was laid down past here goes; the next song from here.)
        const at = t.cut;
        t.cut = null;
        t.time = t.base = Math.round(at * RADIO_SR);
        t.marks = t.marks.filter(m => m.t < at);
        return t.sb.remove(at, Infinity);
      }
      const b = t.sb.buffered;
      // (The phone let go of music laid down ahead, which can't be laid down again: the songs file by file.)
      if (t.time > 0 && b.length && b.end(b.length - 1) < t.time / RADIO_SR - 1) return toFiles('evicted');
      if (b.length && audio.currentTime - b.start(0) > 30) return t.sb.remove(0, audio.currentTime - 10);
      // (Managed Media Source says when it's a good time; under 5 s left, it's always one.)
      if (ahead() > AHEAD || (t.ms.streaming === false && ahead() > 5)) return;
      if (!t.feed.item && !q.ready.length) return;
      const n = CHUNK * FRAME;
      const { pcm, marks } = t.feed.take(n, () => q.ready.length > 0, () => q.ready.shift() || null);
      for (const m of marks) t.marks.push({ t: (t.time + m.at) / RADIO_SR, item: m.item, from: m.from / RADIO_SR });
      t.sb.appendBuffer(tapeSegment(pcm, 0, CHUNK, { sr: RADIO_SR, time: t.time, number: t.number, seq: t.seq++ }));
      t.time += n;
      t.number += CHUNK;
      if (marks.length) fill();
    } catch (e) {
      // (Full: what's played goes first; anything else, the songs one file at a time.)
      if (e?.name === 'QuotaExceededError' && audio.currentTime > 4) t.sb.remove(0, audio.currentTime - 2);
      else toFiles(e?.name || 'append');
    }
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
    const k = Math.ceil(((audio.currentTime + 0.25) * RADIO_SR - t.base) / FRAME);
    t.cut = Math.min(t.time, t.base + Math.max(0, k) * FRAME) / RADIO_SR;
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
    console.warn('聽: the songs one file at a time:', why);
    audio.removeAttribute('src');
    if (!cur) return want && q.ready.length ? advance() : undefined;
    audio.src = urlOf(cur);
    const at = here?.item === cur ? here.at : 0;
    if (at > 0) audio.addEventListener('loadedmetadata', () => (audio.currentTime = Math.min(at, cur.seconds - 0.5)), { once: true });
    if (want) audio.play().catch(() => retry());
  }
  const canTape = () => {
    try {
      if (localStorage.getItem('orbit-beats-radio') === 'files') return false;
    } catch {}
    const MS = globalThis.ManagedMediaSource || globalThis.MediaSource;
    return Boolean(MS?.isTypeSupported?.(TAPE_TYPE));
  };
  // (Decided once: songs made before the first play are kept for the way they'll play.)
  const taped = canTape();

  // ---- Play, pause, next, the mood ----
  function start() {
    api.quiet();
    want = true;
    retried = 0;
    fails = 0;
    if (cur) {
      audio.play().catch(() => retry());
    } else if (taped) {
      // (The tap opens the stream and plays it: the music starts as soon as the first song is on it.)
      tape ||= openTape();
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
  }
  function skip() {
    if (!want) return start();
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
  function pick(id) {
    if (id === mood) return;
    mood = id;
    api.setMood(id);
    for (const b of panel.querySelectorAll('[data-mood]')) b.setAttribute('aria-pressed', String(b.dataset.mood === id));
    // What was made for the old mood goes; the next one is this mood's, and plays as soon as it's made.
    const old = q.ready;
    q.ready = [];
    for (const it of old) drop(it);
    q.gen++;
    last = [];
    q.skip = Boolean(cur);
    if (!want) start();
    else fill();
    paintNext();
  }

  // ---- What the screen shows ----
  function paint() {
    const playing = want && !audio.paused && Boolean(cur);
    play.innerHTML = want && (!audio.paused || !cur) ? ICON.pause : ICON.play;
    play.setAttribute('aria-label', want ? W('暫停', 'Pause') : W('播放', 'Play'));
    card.classList.toggle('on', playing);
    card.classList.toggle('wait', want && !cur);
    heart.disabled = !cur;
    if (cur) {
      title.textContent = cur.title;
      sub.textContent = [moodOf(cur.spec.mood), name(STYLE_NAMES, cur.info.style), `${cur.info.bpm} BPM`, keyName(cur.info.key)].filter(Boolean).join(' · ');
      // (Its colours from a few that go well, a second one round the wheel from the first.)
      const h1 = HUES[cur.spec.seed % HUES.length];
      art.style.setProperty('--h1', String(h1));
      art.style.setProperty('--h2', String((h1 + 40 + (Math.floor(cur.spec.seed / 7) % 50)) % 360));
      art.style.setProperty('--beat', `${60 / cur.info.bpm}s`);
    } else if (want) {
      title.textContent = W('調頻中…', 'Tuning in…');
      sub.textContent = moodName(mood);
    }
    paintHeart();
    paintNext();
  }
  function paintHeart() {
    const k = Boolean(cur && api.kept(cur.id));
    heart.innerHTML = k ? ICON.hearted : ICON.heart;
    heart.classList.toggle('kept', k);
    heart.setAttribute('aria-pressed', String(k));
  }
  function paintNext() {
    const n = upcoming() || q.ready[0];
    upNext.textContent = !want ? '' : n ? W(`下一首 · ${n.title} · ${name(STYLE_NAMES, n.info.style)}`, `Next · ${n.title} · ${name(STYLE_NAMES, n.info.style)}`) : W('正在做下一首…', 'Making the next song…');
  }
  const songTime = () => (tape ? onTape()?.at ?? 0 : audio.currentTime || 0);
  function paintTime() {
    if (!cur) return;
    const t = songTime();
    at.style.width = `${Math.min(100, (t / cur.seconds) * 100)}%`;
    time.firstChild.textContent = clock(t);
    time.lastChild.textContent = clock(cur.seconds);
  }
  const session = () => ({
    title: cur ? cur.title : W('Orbit 電台', 'Orbit Radio'),
    artist: cur ? [moodOf(cur.spec.mood), name(STYLE_NAMES, cur.info.style)].filter(Boolean).join(' · ') : 'Orbit Beats',
    album: W('Orbit 電台', 'Orbit Radio'),
    play: () => start(),
    pause: () => pause(),
    next: () => skip()
  });
  // The lock screen's card (Now Playing): its words and buttons, playing or paused, where in the song.
  function claim() {
    api.session(session());
    const ms = navigator.mediaSession;
    if (!ms) return;
    try {
      ms.playbackState = want && !audio.paused ? 'playing' : 'paused';
      if (cur && ms.setPositionState) ms.setPositionState({ duration: cur.seconds, position: Math.max(0, Math.min(cur.seconds, songTime())), playbackRate: 1 });
    } catch {}
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
  for (const ev of ['play', 'pause']) audio.addEventListener(ev, () => (paint(), claim()));
  audio.addEventListener('playing', () => ((retried = 0), claim()));
  // (Every few seconds: the stream topped up, and a stall, time not moving with music ahead, caught.)
  setInterval(() => {
    if (!tape || !want) return;
    pump();
    if (audio.paused || !cur) return (tape.stuck = 0);
    tape.stuck = ahead() > 1 && audio.currentTime === tape.last ? tape.stuck + 1 : 0;
    tape.last = audio.currentTime;
    if (tape.stuck >= 4) toFiles('stalled');
  }, 1000);
  // Back on the screen after a call or Siri: the music was asked for, so it goes on.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && want && cur && audio.paused) audio.play().catch(() => {});
  });

  return {
    // The first song made while the screen opens, so the first tap plays at once.
    warm: () => fill(),
    stop: () => want && pause(),
    playing: () => want && !audio.paused,
    refresh: paintHeart
  };
}

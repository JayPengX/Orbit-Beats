// 聽: the radio's screen and its player. One big play button, the moods
// (and every groove on its own), and what's playing: its name, mood, groove,
// tempo and key, ♡ to keep it, ⏭ for the next. Songs are made in the worker
// (lib/make.mjs radio) two ahead of the one playing, each starting under the
// last one's ring, so the music never stops. Two <audio> (they keep playing
// with the screen locked, on the lock screen's controls): the next stretch
// loaded in the one not playing, and started `overlap` seconds before the
// playing one ends, the two fading across each other there (the fades are in
// the sound: iOS ignores an element's volume), so a late start dips, never a
// gap. When the next isn't made yet, the last hook plays again from its bar
// line until it is.

import { h, toast } from '#kit/ui.mjs';
import { STYLES, NOTE_NAMES } from '../engine.mjs';
import { MOODS, radioPick, radioQueue, handoverAt } from './radio.mjs';
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
  const els = [new Audio(), new Audio()];
  for (const el of els) {
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
  }
  let audio = els[0]; // the one playing now
  const other = () => (audio === els[0] ? els[1] : els[0]);
  let handing = 0; // the timer that starts the next stretch
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
  // Two ahead of the one playing; one more as soon as one is used.
  function fill() {
    // (Before play: one, so the first tap plays at once; playing: two.)
    if (q.busy || q.ready.length >= (want ? 2 : 1) || fails >= 3) return;
    const s = spec();
    const after = q.ready.at(-1)?.id || cur?.id || null;
    const gen = q.gen;
    q.busy = true;
    api.make
      .radio(s, after)
      .then(v => {
        q.busy = false;
        fails = 0;
        const item = { ...v, spec: s, title: api.title(s.seed), url: URL.createObjectURL(new Blob([v.wav], { type: 'audio/wav' })) };
        delete item.wav;
        if (gen !== q.gen) URL.revokeObjectURL(item.url);   // (made for a mood since changed)
        else q.ready.push(item);
        if (want && (!cur || q.skip)) advance();
        preload();
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
  // The next stretch loaded ahead in the element not playing (once it's done ringing out).
  function preload() {
    const item = q.ready[0];
    const b = other();
    if (!item || !want || b.dataset.id === item.id || !(b.paused || b.ended)) return;
    b.loop = false;
    b.src = item.url;
    b.dataset.id = item.id;
    b.load();
  }
  // The next stretch, now (or as soon as it's made). `ring`: at a song's end,
  // the one playing rings out its overlap under it; else (⏭, a mood) it stops.
  function advance(ring = false) {
    const item = q.ready.shift();
    if (!item) {
      q.skip = true;
      return paintNext();
    }
    clearTimeout(handing);
    handing = 0;
    q.skip = false;
    const was = cur;
    const old = audio;
    const next = other();
    if (next.dataset.id !== item.id) {
      next.loop = false;
      next.src = item.url;
      next.dataset.id = item.id;
    } else if (next.currentTime) next.currentTime = 0;
    audio = next;
    cur = item;
    if (want) next.play().catch(() => retry());
    if (!ring || old.loop) old.pause();
    if (was) setTimeout(() => URL.revokeObjectURL(was.url), 8000);
    paint();
    api.session(session());
    fill();
    preload();
  }
  // A play() refused (iOS between songs, a stretch the phone couldn't read): the next one, once.
  let retried = 0;
  function retry() {
    if (!want || retried++ > 2) return paint();
    setTimeout(() => (q.ready.length ? advance() : audio.play().catch(() => paint())), 300);
  }

  // ---- Play, pause, next, the mood ----
  function start() {
    api.quiet();
    want = true;
    retried = 0;
    fails = 0;
    if (cur) {
      audio.play().catch(() => retry());
    } else {
      // (The tap starts both elements on a breath of silence, so the music can follow it in either.)
      silent ||= hush();
      for (const el of els) {
        el.loop = true;
        el.src = silent;
        el.dataset.id = '';
      }
      audio.play().catch(() => {});
      other().play().then(() => other().pause(), () => {});
      if (q.ready.length) advance();
    }
    fill();
    paint();
    api.session(session());
  }
  function pause() {
    want = false;
    clearTimeout(handing);
    handing = 0;
    for (const el of els) el.pause();
    paint();
  }
  function skip() {
    if (!want) return start();
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
    for (const it of q.ready) URL.revokeObjectURL(it.url);
    q.ready = [];
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
      sub.textContent = [moodName(cur.spec.mood), name(STYLE_NAMES, cur.info.style), `${cur.info.bpm} BPM`, keyName(cur.info.key)].filter(Boolean).join(' · ');
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
    const n = q.ready[0];
    upNext.textContent = !want ? '' : n ? W(`下一首 · ${n.title} · ${name(STYLE_NAMES, n.info.style)}`, `Next · ${n.title} · ${name(STYLE_NAMES, n.info.style)}`) : W('正在做下一首…', 'Making the next song…');
  }
  function paintTime() {
    if (!cur) return;
    const t = audio.currentTime || 0;
    at.style.width = `${Math.min(100, (t / cur.seconds) * 100)}%`;
    time.firstChild.textContent = clock(t);
    time.lastChild.textContent = clock(cur.seconds);
  }
  const session = () => ({
    title: cur ? cur.title : W('Orbit 電台', 'Orbit Radio'),
    artist: cur ? `${moodName(cur.spec.mood)} · ${name(STYLE_NAMES, cur.info.style)}` : 'Orbit Beats',
    album: W('Orbit 電台', 'Orbit Radio'),
    play: () => start(),
    pause: () => pause(),
    next: () => skip()
  });

  // ---- Keeping it going ----
  // The next one started `overlap` before this one ends (the timer set again on each tick, so a slow one is caught up).
  function schedule() {
    if (!cur || !want || audio.loop || !q.ready.length) return;
    const left = cur.seconds - audio.currentTime;
    if (left > cur.overlap + 1.5) return;
    clearTimeout(handing);
    const playing = audio;
    handing = setTimeout(() => {
      handing = 0;
      if (audio === playing && want && q.ready.length) advance(true);
    }, Math.max(0, (handoverAt(cur.seconds, cur.overlap) - audio.currentTime) * 1000));
  }
  for (const el of els) {
    el.addEventListener('timeupdate', () => {
      if (el !== audio) return;
      paintTime();
      // Nothing made yet at the outro: the last hook again, from its bar line.
      if (cur?.hold && !q.ready.length && el.currentTime >= cur.hold.to) el.currentTime = cur.hold.from;
      schedule();
    });
    el.addEventListener('ended', () => {
      if (el !== audio) return preload();   // (done ringing out: the next one loads in it)
      if (!cur || el.loop) return;
      if (q.ready.length) return advance(true);
      el.currentTime = cur.hold ? cur.hold.from : 0;
      el.play().catch(() => retry());
    });
    // (A stretch the phone couldn't play: on to the next.)
    el.addEventListener('error', () => el === audio && cur && want && !el.loop && (q.ready.length ? advance() : retry()));
    for (const ev of ['play', 'pause']) el.addEventListener(ev, () => el === audio && paint());
    el.addEventListener('playing', () => el === audio && (retried = 0));
  }
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

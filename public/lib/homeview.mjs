// 首頁, like Apple Music's Listen Now: a hero (the first of today's picks), then shelves:
// 今日精選 (songs picked for the day, a tap plays that song and the radio goes on), 適合現在
// (the station for the hour), 最近播放, 為你推薦 (the stations of what you keep), 你的歌, 心情 and
// 瀏覽類型 (eight grooves and 全部類型). A station's cover has its name in the art.
import { h } from './ui.mjs';
import * as kit from '#kit/orbit.mjs';
import { icon } from './icons.mjs';
import { genreSheet } from './genres.mjs';
import { W } from './lang.mjs';
import { MOODS, stationStyles } from './radio.mjs';
import { stationFilter, stationName, homeRows, dailyPicks, dayKey, nowStation } from './stations.mjs';
import { coverSvg, coverUrl } from './cover.mjs';
import { coverOfTrack } from './player.mjs';
import { onLong, subOf } from './playerview.mjs';

const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const covers = new Map();
// A station's cover: a groove of it, drawn from the station's own seed (the same every time).
export function stationCover(id, taste = {}) {
  const title = stationName(id);
  const k = `${id === 'taste' ? `taste:${Object.keys(taste).sort().join()}` : id}|${title}`;
  if (!covers.has(k)) {
    const f = stationFilter(id, taste);
    const styles = stationStyles(f);
    const seed = hash(k);
    const style = /^style:/.test(id) ? id.slice(6) : styles[seed % styles.length];
    // (A station's art carries its name, large, as Apple's station art does.)
    const bpm = f.bpm ? Math.round((f.bpm[0] + f.bpm[1]) / 2) : 100;
    covers.set(k, coverUrl(coverSvg({ seed, style, mood: MOODS[id] ? id : 'all', key: null, bpm, title, text: true, station: true })));
  }
  return covers.get(k);
}

const ROW_NAMES = { 'for-you': ['為你推薦', 'For you'], moods: ['心情', 'Moods'], genres: ['瀏覽類型', 'Browse genres'] };

export const sqCard = (cover, title, sub, props = {}, cls = 'sq') =>
  h('button', { class: cls, type: 'button', ...props }, [h('span', { class: 'sq-cover' }, [h('img', { alt: '', src: cover, loading: 'lazy', decoding: 'async', draggable: 'false' })]), h('b', { text: title }), sub ? h('small', { text: sub }) : null]);
export const shelfOf = (key, title, nodes) => h('section', { class: 'shelf', 'data-row': key }, [h('h2', { text: title }), h('div', { class: 'rail' }, nodes)]);
// A song's card tapped: it plays; already playing, Now Playing opens (paused: it goes on).
export function tapTrack(api, t) {
  const s = api.P.state();
  if (s?.track?.id !== t.id) return api.P.play(t);
  if (!(s.playing || s.busy)) return api.P.toggle();
  return api.openNow ? api.openNow() : null;
}
// Kept songs as covers in a shelf (empty: nothing). api: { P, trackMenu, openNow? }
export function songShelf(api, key, title, songs) {
  if (!songs.length) return null;
  const { P } = api;
  return shelfOf(key, title, songs.map(song => {
    const t = P.track(song);
    const c = sqCard(coverOfTrack(t), t.title, subOf(t), { 'data-id': t.id, onclick: () => tapTrack(api, t) });
    c.querySelector('.sq-cover').append(h('span', { class: 'sq-more', role: 'button', tabindex: '0', 'aria-label': W('更多', 'More'), html: icon('more'), onclick: e => (e.stopPropagation(), api.trackMenu(t, e.currentTarget)) }));
    onLong(c, () => api.trackMenu(t, c.querySelector('.sq-cover')));
    return c;
  }));
}

// api: { P, radio, taste() -> { style: n }, trackMenu(track, anchor), openNow(), songs(), go(tab, run) }
const PICKS_KEY = 'orbit-beats-picks';
export function mountHome(panel, api) {
  const { P, radio } = api;
  const card = sqCard;
  // (The station already playing: Now Playing opens, rather than nothing.)
  const tune = id => P.station(id) === false && api.openNow();
  // (A station's art carries its name: the name is the button's label, not a line under it.)
  const stCard = (cover, title, props, cls) => h('button', { class: cls, type: 'button', 'aria-label': title, ...props }, [h('span', { class: 'sq-cover' }, [h('img', { alt: '', src: cover, loading: 'lazy', decoding: 'async', draggable: 'false' })])]);
  const station = (id, cls = 'lg') => stCard(stationCover(id, api.taste()), stationName(id), { 'data-station': id, onclick: () => tune(id) }, `sq st ${cls}`);
  const shelf = shelfOf;
  const more = (t, c) => h('span', { class: 'sq-more', role: 'button', tabindex: '0', 'aria-label': W('更多', 'More'), html: icon('more'), onclick: e => (e.stopPropagation(), api.trackMenu(t, c.querySelector('.sq-cover'))) });

  // 今日精選: the day's songs, and the hero is the first of them.
  // (Worked out once a day and kept on the phone: working them out held the screen a moment as it opened.)
  const keptPicks = day => {
    const k = `${document.querySelector('meta[name="build-version"]')?.content || ''}|${day}`;
    try {
      const was = JSON.parse(localStorage.getItem(PICKS_KEY) || 'null');
      if (was?.k === k && Array.isArray(was.picks) && was.picks.length) return was.picks;
    } catch {}
    // (A new day: the hero and the two cards on the screen first, the rest a moment later.)
    const got = dailyPicks(day, 3);
    setTimeout(() => {
      const all = dailyPicks(day, 8, got);
      try {
        localStorage.setItem(PICKS_KEY, JSON.stringify({ k, picks: all }));
      } catch {}
      if (picks.length && picks[0].e === got[0]) (picks = [...picks, ...all.slice(got.length).map(e => ({ e, t: radio.trackOf(e) }))]), drawPicks(), paintOn();
    }, 0);
    return got;
  };
  let picks = [];
  let picksKey = '';
  const pickTracks = () => {
    const key = dayKey();
    if (key !== picksKey) {
      picksKey = key;
      picks = keptPicks(key).map(e => ({ e, t: radio.trackOf(e) }));
      // (The hero and the next pick made ahead, just after the screen opens: a tap plays at once.)
      const first = picks.slice(0, 2).map(p => p.e);
      setTimeout(() => radio.prep?.(first), 300);
      // (And every other song and station on the screen: their openings, kept, so a tap on any starts at once.)
      setTimeout(() => radio.ahead?.({ songs: picks.slice(2).map(p => p.e), stations: [...panel.querySelectorAll('[data-station]')].map(n => n.dataset.station) }), 4000);
    }
    return picks;
  };
  const playingId = () => {
    const s = P.state();
    return s?.track && (s.playing || s.busy) ? s.track.id : '';
  };

  // The hero: the top pick. Its ▶ starts that song; playing, it is ❚❚.
  const heroImg = h('img', { class: 'hero-cover', alt: '', draggable: 'false' });
  const heroKick = h('small', { class: 'hero-kick' });
  const heroTitle = h('b', { class: 'hero-title q-fit' });
  const heroSub = h('span', { class: 'hero-sub' });
  const heroPlay = h('button', { class: 'hero-play', type: 'button' });
  const top = () => pickTracks()[0];
  const startTop = () => {
    const s = P.state();
    if (s?.track?.id === top().t.id) return P.toggle();
    P.play(top().t);
  };
  const hero = h('section', { class: 'hero' }, [
    h('button', { class: 'hero-main', type: 'button', onclick: () => (P.state()?.track?.id === top().t.id ? api.openNow() : startTop()) }, [heroImg, h('span', { class: 'hero-shade' }, [heroKick, heroTitle, heroSub])]),
    heroPlay
  ]);
  heroPlay.onclick = startTop;
  let heroKey = '';
  function paintHero() {
    const { e, t } = top();
    const playing = playingId() === t.id;
    const key = [t.id, playing].join('|');
    if (key === heroKey) return;
    heroKey = key;
    heroImg.src = radio.coverOf(e);
    heroKick.textContent = W('今日精選', 'Today’s pick');
    heroTitle.textContent = t.title;
    heroSub.textContent = subOf(t);
    heroPlay.innerHTML = icon(playing ? 'pause' : 'play');
    heroPlay.setAttribute('aria-label', playing ? W('暫停', 'Pause') : W('播放', 'Play'));
  }

  // The shelves.
  const slots = {};
  const picksSlot = h('div', { class: 'recent-slot' });
  const nowSlot = h('div', { class: 'recent-slot' });
  const recentSlot = h('div', { class: 'recent-slot' });
  const mineSlot = h('div', { class: 'recent-slot' });
  function drawPicks() {
    const nodes = pickTracks().slice(1).map(({ e, t }) => {
      const c = card(radio.coverOf(e), t.title, subOf(t), { 'data-id': t.id, 'data-pick': t.id, onclick: () => tapTrack(api, t) }, 'sq lg');
      c.querySelector('.sq-cover').append(more(t, c));
      onLong(c, () => api.trackMenu(t, c.querySelector('.sq-cover')));
      return c;
    });
    picksSlot.replaceChildren(shelf('picks', W('今日精選', 'Today’s picks'), nodes));
  }
  // 適合現在: the hour's station; on a wide screen the next part of the day's beside it (one banner
  // alone left half the row empty, and stretched across it cut its name).
  const nowList = () => {
    const hr = new Date().getHours();
    const a = nowStation(hr);
    if (!kit.screenFit?.().wide) return [a];
    for (let k = 1; k < 24; k++) {
      const b = nowStation((hr + k) % 24);
      if (b.id !== a.id) return [a, b];
    }
    return [a];
  };
  function drawNow() {
    const list = nowList();
    const cards = list.map(n => {
      const c = stCard(stationCover(n.id, api.taste()), stationName(n.id), { 'data-station': n.id, onclick: () => tune(n.id) }, 'sq st wide');
      c.querySelector('.sq-cover').append(h('span', { class: 'sq-tag', text: W(...n.part) }));
      return c;
    });
    const el = shelf('now', W('適合現在', 'Right now'), cards);
    el.querySelector('.rail').classList.toggle('now-pair', cards.length > 1);
    nowSlot.replaceChildren(el);
  }
  const browse = () => {
    const ids = homeRows(api.taste()).find(r => r.key === 'genres').ids;
    const all = h('button', { class: 'sq st sm all', type: 'button', 'aria-label': W('全部類型', 'All genres'), onclick: () => genreSheet({ title: W('全部類型', 'All genres'), onPick: g => api.P.station(`style:${g}`) }) }, [h('span', { class: 'sq-cover tile', html: icon('grid') })]);
    const el = shelf('genres', W(...ROW_NAMES.genres), [...ids.map(id => station(id, 'sm')), all]);
    el.querySelector('.rail').classList.add('rail-grid');
    return el;
  };
  function drawRows() {
    const rows = homeRows(api.taste());
    for (const r of rows) {
      slots[r.key]?.remove();
      slots[r.key] = null;
      if (!r.ids.length) continue;
      // (心情 leaves out the moods 適合現在 already shows.)
      const now = nowList().map(n => n.id);
      const ids = r.key === 'moods' ? r.ids.filter(id => !now.includes(id)) : r.ids;
      slots[r.key] = r.key === 'genres' ? browse() : shelf(r.key, W(...ROW_NAMES[r.key]), ids.map(id => station(id)));
    }
  }
  let recentId = '';
  function drawRecent() {
    // (The song playing now is not in the list: the mini player has it.)
    recentId = P.state()?.track?.id || '';
    const list = radio.recent().filter(t => t.id !== recentId);
    const was = recentSlot.querySelector('.rail')?.scrollLeft || 0;
    recentSlot.replaceChildren();
    if (list.length) {
      const nodes = list.map(t => {
        const c = card(radio.coverOf(t), t.title, subOf(t), { 'data-id': t.id, onclick: () => tapTrack(api, t) });
        c.querySelector('.sq-cover').append(more(t, c));
        onLong(c, () => api.trackMenu(t, c.querySelector('.sq-cover')));
        return c;
      });
      recentSlot.append(shelf('recent', W('最近播放', 'Recently played'), nodes));
      recentSlot.querySelector('.rail').scrollLeft = was;
    }
    const mine = songShelf(api, 'mine', W('你的歌', 'Your songs'), [...api.songs()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 12));
    mineSlot.replaceChildren(...(mine ? [mine] : []));
  }
  const order = () => {
    drawRows();
    return [picksSlot, nowSlot, recentSlot, slots['for-you'], mineSlot, slots.moods, slots.genres].filter(Boolean);
  };
  // Two radios always one tap away under the hero: 隨機電台 (any groove) and 為你電台 (what you keep).
  const radioPill = (id, ic, label) => h('button', { class: 'home-radio', type: 'button', 'data-station': id, onclick: () => tune(id) }, [h('span', { class: 'hr-ic', html: icon(ic) }), h('span', { text: label })]);
  const radios = h('div', { class: 'home-radios' }, [radioPill('all', 'shuffle', W('隨機電台', 'Shuffle Radio')), radioPill('taste', 'radio', W('為你電台', 'Your Radio'))]);
  const drawAll = () => {
    drawPicks();
    drawNow();
    drawRecent();
    panel.replaceChildren(hero, radios, ...order());
    heroKey = '';
    paintHero();
    paintOn();
  };
  // The station playing is marked, and the pick.
  function paintOn() {
    const s = P.state();
    const on = s?.source === 'radio' ? radio.station() : '';
    const live = Boolean(s?.playing || s?.busy);
    for (const b of panel.querySelectorAll('[data-station]')) {
      const lit = b.dataset.station === on && live;
      b.classList.toggle('on', lit);
      b.setAttribute('aria-pressed', String(lit));
    }
    const id = playingId();
    for (const b of panel.querySelectorAll('[data-pick]')) b.classList.toggle('on', b.dataset.pick === id);
  }
  drawAll();
  P.on(w => {
    if (w === 'time') return;
    paintHero();
    paintOn();
    if (w === 'recent' || (P.state()?.track?.id || '') !== recentId) drawRecent();
  });
  return {
    // The rows again (a song kept or let go).
    refresh: drawAll
  };
}

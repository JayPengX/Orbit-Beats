// 首頁, like Apple Music's Listen Now: a hero (the first of today's picks), then shelves:
// 今日精選 (songs picked for the day, a tap plays that song and the radio goes on), 適合現在
// (the station for the hour), 最近播放, 為你推薦 (the stations of what you keep), 你的歌, 心情 and
// 瀏覽類型 (eight grooves and 全部類型). A station's cover has its name in the art.
import { h } from './ui.mjs';
import { icon } from './icons.mjs';
import { genreSheet } from './genres.mjs';
import { W } from './lang.mjs';
import { STYLE_NAMES, STYLE_ORDER, name } from './names.mjs';
import { MOODS, stationStyles } from './radio.mjs';
import { stationFilter, stationName, homeRows, dailyPicks, dayKey, nowStation, tasteList } from './stations.mjs';
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
// Kept songs as covers in a shelf (empty: nothing). api: { P, trackMenu }
export function songShelf(api, key, title, songs) {
  if (!songs.length) return null;
  const { P } = api;
  return shelfOf(key, title, songs.map(song => {
    const t = P.track(song);
    const c = sqCard(coverOfTrack(t), t.title, subOf(t), { 'data-id': t.id, onclick: () => P.play(t) });
    c.querySelector('.sq-cover').append(h('span', { class: 'sq-more', role: 'button', tabindex: '0', 'aria-label': W('更多', 'More'), html: icon('more'), onclick: e => (e.stopPropagation(), api.trackMenu(t, e.currentTarget)) }));
    onLong(c, () => api.trackMenu(t, c.querySelector('.sq-cover')));
    return c;
  }));
}

// api: { P, radio, taste() -> { style: n }, trackMenu(track, anchor), openNow(), songs(), go(tab, run) }
export function mountHome(panel, api) {
  const { P, radio } = api;
  const card = sqCard;
  const station = (id, cls = 'lg') => card(stationCover(id, api.taste()), stationName(id), '', { 'data-station': id, onclick: () => P.station(id) }, `sq st ${cls}`);
  const shelf = shelfOf;
  const more = (t, c) => h('span', { class: 'sq-more', role: 'button', tabindex: '0', 'aria-label': W('更多', 'More'), html: icon('more'), onclick: e => (e.stopPropagation(), api.trackMenu(t, c.querySelector('.sq-cover'))) });

  // 今日精選: the day's songs, and the hero is the first of them.
  let picks = [];
  let picksKey = '';
  const pickTracks = () => {
    const key = `${dayKey()}|${tasteList(api.taste(), 1).map(x => x[0])}`;
    if (key !== picksKey) {
      picksKey = key;
      picks = dailyPicks(dayKey(), api.taste()).map(e => ({ e, t: radio.trackOf(e) }));
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
  const heroTitle = h('b', { class: 'hero-title' });
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
      const c = card(radio.coverOf(e), t.title, subOf(t), { 'data-id': t.id, 'data-pick': t.id, onclick: () => P.play(t) }, 'sq lg');
      c.querySelector('.sq-cover').append(more(t, c));
      onLong(c, () => api.trackMenu(t, c.querySelector('.sq-cover')));
      return c;
    });
    picksSlot.replaceChildren(shelf('picks', W('今日精選', 'Today’s picks'), nodes));
  }
  function drawNow() {
    const n = nowStation(new Date().getHours());
    const c = card(stationCover(n.id, api.taste()), stationName(n.id), '', { 'data-station': n.id, onclick: () => P.station(n.id) }, 'sq st wide');
    c.querySelector('.sq-cover').append(h('span', { class: 'sq-tag', text: W(...n.part) }));
    nowSlot.replaceChildren(shelf('now', W('適合現在', 'Right now'), [c]));
  }
  const browse = () => {
    const ids = homeRows(api.taste()).find(r => r.key === 'genres').ids;
    const all = h('button', { class: 'sq st sm all', type: 'button', onclick: () => genreSheet({ title: W('全部類型', 'All genres'), onPick: g => api.P.station(`style:${g}`) }) }, [h('span', { class: 'sq-cover tile', html: icon('grid') }), h('b', { text: W('全部類型', 'All genres') })]);
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
      // (心情 leaves out the mood 適合現在 already shows.)
      const ids = r.key === 'moods' ? r.ids.filter(id => id !== nowStation(new Date().getHours()).id) : r.ids;
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
        const c = card(radio.coverOf(t), t.title, subOf(t), { 'data-id': t.id, onclick: () => P.play(t) });
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
  const drawAll = () => {
    drawPicks();
    drawNow();
    drawRecent();
    panel.replaceChildren(hero, ...order());
    heroKey = '';
    paintHero();
    paintOn();
  };
  // The station playing is marked, and the pick.
  function paintOn() {
    const s = P.state();
    const on = s?.source === 'radio' ? radio.station() : '';
    const live = Boolean(s?.playing || s?.busy);
    for (const b of panel.querySelectorAll('[data-station]')) b.classList.toggle('on', b.dataset.station === on && live);
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

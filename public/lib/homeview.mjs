// 首頁, like Apple Music's Listen Now: a hero for Orbit 電台 (the song playing, or the
// last station), then rows of square covers: 為你推薦, 心情, 類型, 節奏 stations (a tap
// starts one) and 最近播放 (a tap plays that song again).
import { h } from './ui.mjs';
import { icon } from './icons.mjs';
import { W } from './lang.mjs';
import { STYLE_NAMES, name } from './names.mjs';
import { MOODS, stationStyles } from './radio.mjs';
import { stationFilter, stationName, homeRows, TEMPOS } from './stations.mjs';
import { coverSvg, coverUrl } from './cover.mjs';
import { coverOfTrack } from './player.mjs';
import { onLong, subOf } from './playerview.mjs';

const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const covers = new Map();
// A station's cover: a groove of it, drawn from the station's own seed (the same every time).
export function stationCover(id, taste = {}) {
  const k = id === 'taste' ? `taste:${Object.keys(taste).sort().join()}` : id;
  if (!covers.has(k)) {
    const f = stationFilter(id, taste);
    const styles = stationStyles(f);
    const seed = hash(k);
    const style = /^style:/.test(id) ? id.slice(6) : styles[seed % styles.length];
    const bpm = f.bpm ? Math.round((f.bpm[0] + f.bpm[1]) / 2) : 100;
    covers.set(k, coverUrl(coverSvg({ seed, style, mood: MOODS[id] ? id : 'all', key: null, bpm, text: false })));
  }
  return covers.get(k);
}

const ROW_NAMES = { 'for-you': ['為你推薦', 'For you'], liked: ['喜歡的', 'Liked'], moods: ['心情', 'Moods'], genres: ['類型', 'Genres'], tempo: ['節奏', 'Tempo'] };

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

// api: { P, radio, taste() -> { style: n }, trackMenu(track, anchor), openNow(), kept(track) }
export function mountHome(panel, api) {
  const { P, radio } = api;
  const card = sqCard;
  const station = id => {
    const sub = /^tempo:/.test(id) ? `${TEMPOS[id.slice(6)].bpm[0]}–${TEMPOS[id.slice(6)].bpm[1]} BPM` : '';
    return card(stationCover(id, api.taste()), stationName(id), sub, { 'data-station': id, onclick: () => P.station(id) });
  };
  const shelf = shelfOf;

  // The hero.
  const heroImg = h('img', { class: 'hero-cover', alt: '', draggable: 'false' });
  const heroKick = h('small', { class: 'hero-kick' });
  const heroTitle = h('b', { class: 'hero-title' });
  const heroSub = h('span', { class: 'hero-sub' });
  const heroPlay = h('button', { class: 'hero-play', type: 'button', onclick: () => P.toggle() });
  const hero = h('section', { class: 'hero' }, [
    h('button', { class: 'hero-main', type: 'button', onclick: () => (P.state() ? api.openNow() : P.radioPlay()) }, [heroImg, h('span', { class: 'hero-shade' }, [heroKick, heroTitle, heroSub])]),
    heroPlay
  ]);
  let heroKey = '';
  function paintHero() {
    const s = P.state();
    const idle = !s?.track;
    const cover = idle ? radio.idle().cover : s.cover;
    const playing = Boolean(s && (s.playing || s.busy));
    const title = idle ? stationName(radio.station()) : s.track.title;
    const sub = idle ? '' : s.busy ? W('調頻中…', 'Tuning in…') : subOf(s.track);
    const kick = idle ? W('電台', 'Radio') : s.source === 'radio' ? W('電台', 'Radio') : W('正在播放', 'Now playing');
    const key = [cover?.length, title, sub, kick, playing].join('|');
    if (key === heroKey) return;
    heroKey = key;
    heroImg.src = cover || '';
    heroKick.textContent = kick;
    heroTitle.textContent = title;
    heroSub.textContent = sub;
    heroPlay.innerHTML = icon(playing ? 'pause' : 'play');
    heroPlay.setAttribute('aria-label', playing ? W('暫停', 'Pause') : W('播放', 'Play'));
  }

  // The rows.
  const slots = {};
  const recentSlot = h('div', { class: 'recent-slot' });
  const mineSlot = h('div', { class: 'recent-slot' });
  const tile = (ic, title, go) => h('button', { class: 'sq', type: 'button', onclick: go }, [h('span', { class: 'sq-cover tile', html: icon(ic) }), h('b', { text: title })]);
  const quick = shelfOf('quick', W('快速做歌', 'Make'), [
    tile('mic', W('即興', 'Jam'), () => api.go('jam', true)),
    tile('dice', W('做一批歌', 'Make songs'), () => api.go('make', true)),
    tile('grid', W('樂器', 'Studio'), () => api.go('studio'))
  ]);
  const keep = new Set(['moods', 'genres', 'tempo']);
  function drawRows() {
    const rows = homeRows(api.taste());
    for (const r of rows) {
      if (!r.ids.length) {
        slots[r.key]?.remove();
        slots[r.key] = null;
        continue;
      }
      if (slots[r.key] && keep.has(r.key)) continue;
      const el = shelf(r.key, W(...ROW_NAMES[r.key]), r.ids.map(station));
      if (r.key === 'for-you') for (const c of el.querySelectorAll('.sq')) c.classList.add('big');
      slots[r.key] = el;
    }
    return rows.map(r => slots[r.key]).filter(Boolean);
  }
  function drawRecent() {
    const list = radio.recent();
    recentSlot.replaceChildren();
    if (list.length) {
      const nodes = list.map(t => {
        const c = card(radio.coverOf(t), t.title, subOf(t), { 'data-id': t.id, onclick: () => P.play(t) });
        const more = h('span', { class: 'sq-more', role: 'button', tabindex: '0', 'aria-label': W('更多', 'More'), html: icon('more'), onclick: e => (e.stopPropagation(), api.trackMenu(t, e.currentTarget)) });
        c.querySelector('.sq-cover').append(more);
        onLong(c, () => api.trackMenu(t, c.querySelector('.sq-cover')));
        return c;
      });
      recentSlot.append(shelf('recent', W('最近播放', 'Recently played'), nodes));
    }
    const mine = songShelf(api, 'mine', W('你的歌', 'Your songs'), [...api.songs()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 12));
    mineSlot.replaceChildren(...(mine ? [mine] : []));
  }
  const order = () => {
    const r = drawRows();
    const by = k => r.find(x => x.dataset.row === k);
    return [by('for-you'), recentSlot, mineSlot, by('moods'), by('genres'), by('tempo'), quick, by('liked')].filter(Boolean);
  };
  drawRecent();
  panel.append(hero, ...order());
  paintHero();
  // The station playing is marked.
  function paintOn() {
    const s = P.state();
    const on = s?.source === 'radio' ? radio.station() : '';
    for (const b of panel.querySelectorAll('[data-station]')) b.classList.toggle('on', b.dataset.station === on && Boolean(s?.playing || s?.busy));
  }
  paintOn();
  P.on(w => {
    if (w === 'time') return;
    paintHero();
    paintOn();
    if (w === 'recent') drawRecent();
  });
  return {
    // The taste row again (a song kept or let go), and the recent ones.
    refresh() {
      drawRecent();
      panel.replaceChildren(hero, ...order());
      paintHero();
      paintOn();
    }
  };
}

// 首頁's stations, no DOM: a station is an id that stands for a filter on the
// radio's songs ({ mood } | { styles: [...] } | { bpm: [lo, hi] }).
//   'all' or a mood id   the radio's mood (lib/radio.mjs MOODS)
//   'style:<id>'         one groove
//   'tempo:slow|mid|fast' a range of tempos
//   'taste'              the grooves you keep (♡), most kept first
import { MOODS, stationStyles } from './radio.mjs';
import { STYLE_ORDER, STYLE_NAMES, name } from './names.mjs';
import { W } from './lang.mjs';

export const TEMPOS = {
  slow: { zh: '慢', en: 'Slow', bpm: [60, 95] },
  mid: { zh: '中', en: 'Medium', bpm: [95, 125] },
  fast: { zh: '快', en: 'Fast', bpm: [125, 200] }
};
export const POPULAR = ['lofi', 'hiphop', 'house', 'kpop', 'citypop', 'jazz', 'afro', 'synthwave'];

// The grooves you keep most, most first: [style, count].
export const tasteList = (taste = {}, max = 6) =>
  Object.entries(taste || {})
    .filter(([s, n]) => STYLE_ORDER.includes(s) && n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max);

// A station's id as the radio takes it: { mood, styles?, bpm? } (the mood the one the songs are listed under).
export function stationFilter(id, taste = {}) {
  const s = String(id || 'all');
  if (MOODS[s]) return { mood: s };
  if (/^style:/.test(s)) return { mood: s };
  if (/^tempo:/.test(s)) {
    const t = TEMPOS[s.slice(6)];
    return t ? { mood: 'all', bpm: t.bpm } : { mood: 'all' };
  }
  if (s === 'taste') {
    const top = tasteList(taste, 4).map(([x]) => x);
    return top.length ? { mood: 'all', styles: top } : { mood: 'all', styles: POPULAR };
  }
  return { mood: 'all' };
}
// An id that is a station, else 'all'.
export const stationId = id => (id === 'taste' || MOODS[id] || /^style:[a-z]+$/.test(id) || /^tempo:(slow|mid|fast)$/.test(id) ? id : 'all');

// The rows of 首頁: [{ key, ids: [station id] }].
export function homeRows(taste = {}) {
  const liked = tasteList(taste, 6);
  const pop = POPULAR.slice(0, 5).map(s => `style:${s}`);
  // (No station twice on the page: 類型 and 喜歡的 leave out what 為你推薦 already shows.)
  const forYou = liked.length ? ['taste', ...pop.slice(0, 4)] : pop;
  const fresh = id => !forYou.includes(id);
  return [
    { key: 'for-you', ids: forYou },
    { key: 'moods', ids: Object.keys(MOODS) },
    { key: 'genres', ids: STYLE_ORDER.map(s => `style:${s}`).filter(fresh) },
    { key: 'tempo', ids: Object.keys(TEMPOS).map(t => `tempo:${t}`) },
    { key: 'liked', ids: liked.map(([s]) => `style:${s}`).filter(fresh) }
  ];
}
// The grooves a station plays (for a card's cover and the tests).
export const stationGrooves = (id, taste = {}) => stationStyles(stationFilter(id, taste));
// A station's name in the reader's language.
export function stationName(id) {
  const s = String(id || 'all');
  if (MOODS[s]) return W(MOODS[s].zh, MOODS[s].en);
  if (/^style:/.test(s)) return name(STYLE_NAMES, s.slice(6));
  if (/^tempo:/.test(s)) return TEMPOS[s.slice(6)] ? W(TEMPOS[s.slice(6)].zh, TEMPOS[s.slice(6)].en) : s;
  return s === 'taste' ? W('我的口味', 'Your mix') : W('隨機', 'Random');
}

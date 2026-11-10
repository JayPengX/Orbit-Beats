// 首頁's stations, no DOM: a station is an id that stands for a filter on the
// radio's songs ({ mood } | { styles: [...] } | { bpm: [lo, hi] }).
//   'all' or a mood id   the radio's mood (lib/radio.mjs MOODS)
//   'style:<id>'         one groove
//   'tempo:slow|mid|fast' a range of tempos
//   'taste'              the grooves you keep (♡), most kept first
import { MOODS, radioPick, radioSpec } from './radio.mjs';
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
  // 用說的做節奏 (lib/say.mjs): the grooves and the tempo read from the words.
  const said = sayOf(s);
  if (said) return { mood: 'all', ...(said.styles.length ? { styles: said.styles } : {}), ...(said.bpm ? { bpm: said.bpm } : {}) };
  if (s === 'taste') {
    const top = tasteList(taste, 4).map(([x]) => x);
    return top.length ? { mood: 'all', styles: top } : { mood: 'all', styles: POPULAR };
  }
  return { mood: 'all' };
}
// An id that is a station, else 'all'.
export const stationId = id => (id === 'taste' || MOODS[id] || /^style:[a-z]+$/.test(id) || /^tempo:(slow|mid|fast)$/.test(id) || sayOf(id) ? id : 'all');
// A said station, say:lofi.jazz@60-95 → { styles, bpm }, or null.
export function sayOf(id) {
  const m = /^say:([a-z]+(?:\.[a-z]+)*)?(?:@(\d{2,3})-(\d{2,3}))?$/.exec(String(id || ''));
  if (!m || (!m[1] && !m[2])) return null;
  const styles = (m[1] || '').split('.').filter(x => STYLE_ORDER.includes(x));
  const bpm = m[2] ? [Number(m[2]), Number(m[3])] : null;
  return styles.length || bpm ? { styles, bpm } : null;
}

// The rows of 首頁: [{ key, ids: [station id] }]. 為你推薦 is the taste stations (your mix, then the grooves
// you keep most) and is empty until something is kept: 今日精選's songs speak for it. 瀏覽類型 is eight
// grooves to start from; the rest are behind 全部類型.
export function homeRows(taste = {}) {
  const liked = tasteList(taste, 5);
  return [
    { key: 'for-you', ids: liked.length ? ['taste', ...liked.map(([s]) => `style:${s}`)] : [] },
    // (隨機 is the hero's own station: not again as a mood.)
    { key: 'moods', ids: Object.keys(MOODS).filter(id => id !== 'all') },
    { key: 'genres', ids: POPULAR.map(s => `style:${s}`) }
  ];
}

const dayHash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 17);
// A day as a key: "2026-10-19", Taiwan's date (UTC+8, no summer time) on every phone and computer, so
// a laptop set to another zone, or one whose clock passes midnight first, has the same day.
export const dayKey = (d = new Date()) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
// 今日精選: n songs for a day, each { seed, mood, style, bpm, key, seconds }: the same all day, another
// tomorrow, and the same on every device (Jay 2026-10-30): made from the day alone, never from what
// one phone has kept. Each differs from the one before (the radio's own rule). (`from`: the first of
// them, worked out already: the rest follow on.)
export function dailyPicks(day, n = 8, from = []) {
  const out = from.slice(0, n);
  for (let i = out.length; i < n; i++) {
    const seed = dayHash(`${day}:${i}`) % 1e9;
    const p = radioPick('all', out, seed, null);
    const sp = radioSpec(p.seed, p.mood, p.style);
    out.push({ seed: p.seed, mood: p.mood, style: p.style, bpm: sp.bpm, key: { tonic: sp.key.tonic, minor: Boolean(sp.key.minor) }, seconds: Math.round(sp.seconds) });
  }
  return out;
}
// 適合現在: the station for the hour (0-23): morning easy, afternoon pop, evening groove, late night ambient.
export function nowStation(hour) {
  if (hour >= 5 && hour < 11) return { id: 'chill', part: ['早晨', 'Morning'] };
  if (hour >= 11 && hour < 17) return { id: 'pop', part: ['午後', 'Afternoon'] };
  if (hour >= 17 && hour < 22) return { id: 'groove', part: ['傍晚', 'Evening'] };
  return { id: 'style:ambient', part: ['深夜', 'Late night'] };
}
// A station's name in the reader's language.
export function stationName(id) {
  const s = String(id || 'all');
  if (MOODS[s]) return W(MOODS[s].zh, MOODS[s].en);
  if (/^style:/.test(s)) return name(STYLE_NAMES, s.slice(6));
  if (/^tempo:/.test(s)) return TEMPOS[s.slice(6)] ? W(TEMPOS[s.slice(6)].zh, TEMPOS[s.slice(6)].en) : s;
  const said = sayOf(s);
  if (said) {
    // (Its first two grooves and how fast: Lo-fi・爵士搖擺 · 慢.)
    const tempo = said.bpm ? Object.values(TEMPOS).find(t => said.bpm[0] >= t.bpm[0] - 10 && said.bpm[1] <= t.bpm[1] + 10) : null;
    const names = said.styles.slice(0, 2).map(x => name(STYLE_NAMES, x)).join('・') + (said.styles.length > 2 ? W('等', ' +') : '');
    return [names, tempo ? W(tempo.zh, tempo.en) : said.bpm ? `${said.bpm[0]}–${said.bpm[1]} BPM` : ''].filter(Boolean).join(' · ') || W('你說的', 'Yours');
  }
  return s === 'taste' ? W('我的口味', 'Your mix') : W('隨機', 'Random');
}

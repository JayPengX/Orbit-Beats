// One place to pick a genre, for 即興, 樂器, 重新混音 and 首頁: genreSheet is a
// sheet of covers in mood sections (a 最近用過 row on top), and the chips the
// small screens show are the few last used plus 更多 (chipsOf). The grouping and
// the recents are plain functions (tests/genres.test.mjs); the sheet draws them.
import { h, sheet } from './ui.mjs';
import { STYLE_ORDER } from '../engine.mjs';
import { coverSvg, coverUrl } from './cover.mjs';
import { STYLE_NAMES, name } from './names.mjs';
import { W } from './lang.mjs';

const RECENT = 'orbit-beats.genres.v1'; // the genres last used, latest first
export const MOST_RECENT = 8;

// The moods, each a few genres; every genre of the app is in exactly one.
export const MOODS = [
  { id: 'chill', name: ['放鬆', 'Chill'], styles: ['lofi', 'ambient', 'ballad', 'cinematic', 'half'] },
  { id: 'hype', name: ['熱血', 'Hype'], styles: ['trap', 'drill', 'phonk', 'dnb', 'jungle', 'dubstep', 'hardstyle', 'metal', 'punk', 'footwork', 'jersey'] },
  { id: 'groove', name: ['律動', 'Groove'], styles: ['four', 'house', 'techno', 'trance', 'garage', 'broken', 'disco', 'funk'] },
  { id: 'classic', name: ['經典', 'Classic'], styles: ['hiphop', 'boombap', 'rock', 'country'] },
  { id: 'pop', name: ['流行', 'Pop'], styles: ['kpop', 'citypop', 'synthwave', 'chiptune', 'chinese'] },
  { id: 'jazz', name: ['爵士', 'Jazz & soul'], styles: ['jazz', 'bossa', 'neosoul', 'blues', 'gospel'] },
  { id: 'world', name: ['世界', 'World'], styles: ['afro', 'amapiano', 'baile', 'dembow', 'reggae', 'samba', 'salsa', 'cumbia', 'kizomba', 'highlife', 'bhangra'] }
];

// The moods as sections of the genres offered (`styles`, in the app's order):
// [{ id, name, styles }]; one with none of them is left out, and a genre no mood
// names goes in a last section, so none is ever missing.
export function moodGroups(styles = STYLE_ORDER) {
  const have = new Set(styles);
  const named = new Set(MOODS.flatMap(m => m.styles));
  const out = MOODS.map(m => ({ ...m, styles: m.styles.filter(s => have.has(s)) })).filter(m => m.styles.length);
  const rest = styles.filter(s => !named.has(s));
  return rest.length ? [...out, { id: 'more', name: ['其他', 'More'], styles: rest }] : out;
}

// `id` first in the recents, once, at most `most` (a plain id list in, a new one out).
export function pushRecent(list, id, most = MOST_RECENT) {
  return [id, ...list.filter(x => x !== id)].slice(0, most);
}

// The recents that are still offered, latest first.
export const recentOf = (list, styles = STYLE_ORDER) => list.filter((s, i) => styles.includes(s) && list.indexOf(s) === i);

// The `n` chips of a small screen: the latest used (then the most played, when
// fewer than `n` were used), and `current` among them: not moved when it's
// already there, else in front. A chip tapped among them keeps its place.
export function chipsOf(current, recent, styles = STYLE_ORDER, n = 5) {
  const base = [...new Set([...recentOf(recent, styles), ...styles])].slice(0, n);
  if (!current || base.includes(current) || !styles.includes(current)) return base;
  return [current, ...base.slice(0, n - 1)];
}

export function readRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT) || '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, MOST_RECENT) : [];
  } catch {
    return [];
  }
}
export function noteRecent(id) {
  try {
    localStorage.setItem(RECENT, JSON.stringify(pushRecent(readRecent(), id)));
  } catch {}
}

// A genre's cover (the same look in every list).
const covers = new Map();
export function genreCover(style) {
  if (!covers.has(style)) covers.set(style, coverUrl(coverSvg({ seed: 7, style, bpm: 110, text: false })));
  return covers.get(style);
}

// The sheet: onPick(style) is called as the sheet closes. styles: the genres on offer.
export function genreSheet({ selected = '', styles = STYLE_ORDER, onPick, title = W('風格', 'Style') } = {}) {
  const tile = id => {
    const b = h('button', { class: 'gn-tile', type: 'button', 'data-id': id, 'aria-pressed': String(id === selected) }, [h('img', { alt: '', width: 96, height: 96, loading: 'lazy', src: genreCover(id) }), h('span', { text: name(STYLE_NAMES, id) })]);
    b.onclick = () => {
      noteRecent(id);
      s.close();
      onPick?.(id);
    };
    return b;
  };
  const recent = recentOf(readRecent(), styles).slice(0, 6);
  const sections = [
    ...(recent.length ? [{ label: W('最近用過', 'Recent'), rail: true, styles: recent }] : []),
    ...moodGroups(styles).map(m => ({ label: W(...m.name), styles: m.styles }))
  ];
  const s = sheet({
    title,
    closeLabel: W('關閉', 'Close'),
    cls: 'gn-sheet',
    body: h(
      'div',
      { class: 'gn-body' },
      sections.map(sec => h('section', { class: 'gn-sec' }, [h('h3', { text: sec.label }), h('div', { class: sec.rail ? 'gn-rail' : 'gn-grid' }, sec.styles.map(tile))]))
    )
  });
  return s;
}

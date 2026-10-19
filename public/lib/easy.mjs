// 簡單 / 進階: what a beginner sees, and the settings simple makes songs on.
//
// Simple shows only what making a song needs; Advanced every tool. Each
// control that only one of them shows carries data-ctl="<name>", and the
// page's one stylesheet rule per name (levelCss) hides it under the other
// (body.lv-simple or body.lv-pro). The level is a setting, so it's on the
// Pass (kits.mjs SETTING_KEYS): everyone opens simple, settings kept before
// it existed too (the owner's call); advanced only once someone picks it.

import { STYLES } from '../engine.mjs';
import { MIX, mixOf } from './mix.mjs';

export const LEVELS = ['simple', 'pro'];
// Only in Advanced.
export const PRO_ONLY = [
  // 做歌: splitting, the tempo, each piece's role, the mood and drum styles, taste, how many, the mixer, 更多設定, the batch's numbers, opening a file.
  'make-split', 'make-tempo', 'make-roles', 'make-moods', 'make-styles', 'make-taste', 'make-count', 'make-mix', 'make-more', 'make-meta', 'make-open',
  // 更多設定's own rows; a song's ⋯.
  'make-humanize', 'make-seed', 'make-format', 'make-arrange', 'make-stems', 'make-midi',
  // 樂器: everything but ▶, 🎲, the grooves or instruments, the grid, 復原, 清除, ♡ 收藏 and 存成片段.
  'studio-set', 'studio-key', 'studio-length', 'studio-tempo', 'studio-swing', 'studio-pattern', 'studio-chain', 'studio-copy', 'studio-chord', 'studio-midi', 'studio-tools',
  // 即興: the groove's picker, the snap, the notes on levels and choke.
  'jam-groove', 'jam-snap', 'jam-note', 'jam-rec', 'jam-choke', 'jam-pads',
  // 做歌 (簡單): the length slider, the section legend, the card's head and the pro piece grid; 樂器: its head.
  'make-length-slider', 'make-legend', 'make-card', 'make-piece', 'studio-head'
];
// Only in Simple.
export const SIMPLE_ONLY = ['make-easy', 'jam-easy', 'jam-band', 'jam-keep', 'make-ingredients', 'studio-parts'];
export const levelOk = v => LEVELS.includes(v);
// Whether a control shows at this level.
export const shows = (level, ctl) => (level === 'pro' ? !SIMPLE_ONLY.includes(ctl) : !PRO_ONLY.includes(ctl));
// The stylesheet that does it.
export const levelCss = () =>
  [...PRO_ONLY.map(c => `body.lv-simple [data-ctl="${c}"]`), ...SIMPLE_ONLY.map(c => `body.lv-pro [data-ctl="${c}"]`)].join(',\n') + ' { display: none !important; }';

// ---- 簡單's own settings ----
//
// Simple makes songs on settings of its own, fixed: every groove, the usual
// length and feel, the mixer as it opens, 16-bit. It never reads or writes
// the advanced ones, so what was set in Advanced is there, as it was, on the
// way back. `makeSettings` is what a batch is made on at each level.
export const SIMPLE_MAKE = Object.freeze({ count: 6, minBars: 25, maxBars: 29, humanize: 100, seed: '', bits: 16, smart: false, mood: 'all', silenceDb: -90, minGap: 0.2 });
export function makeSettings(level, settings) {
  if (level === 'pro') return settings;
  return { ...settings, ...SIMPLE_MAKE, length: settings.length, styles: [...STYLES], mix: mixOf(MIX) };
}

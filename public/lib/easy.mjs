// 簡單 / 進階: what a beginner sees, and the guided first song.
//
// Simple shows only what making a song needs; Advanced every tool. Each
// control that only one of them shows carries data-ctl="<name>", and the
// page's one stylesheet rule per name (levelCss) hides it under the other
// (body.lv-simple or body.lv-pro). The level is a setting, so it's on the
// Pass (kits.mjs SETTING_KEYS): new people start simple, anyone who kept
// settings before it existed opens advanced, as they knew it.

export const LEVELS = ['simple', 'pro'];
// Only in Advanced.
export const PRO_ONLY = [
  // 做歌: splitting, the tempo, each piece's role, the drum styles, taste, the mixer, the batch's numbers.
  'make-split', 'make-tempo', 'make-roles', 'make-styles', 'make-taste', 'make-mix', 'make-meta',
  // 更多設定's own rows; a song's ⋯.
  'make-humanize', 'make-seed', 'make-format', 'make-arrange', 'make-stems', 'make-midi',
  // 樂器: everything but the instrument, its groove, the grid, play, 再編一次 and 加進片段.
  'studio-set', 'studio-key', 'studio-length', 'studio-tempo', 'studio-swing', 'studio-pattern', 'studio-chain', 'studio-copy', 'studio-chord', 'studio-midi', 'studio-auto', 'studio-note',
  // 即興: the groove's picker, the snap, the notes on levels and choke.
  'jam-groove', 'jam-snap', 'jam-note'
];
// Only in Simple.
export const SIMPLE_ONLY = ['studio-easy', 'jam-easy'];
export const levelOk = v => LEVELS.includes(v);
// Whether a control shows at this level.
export const shows = (level, ctl) => (level === 'pro' ? !SIMPLE_ONLY.includes(ctl) : !PRO_ONLY.includes(ctl));
// The stylesheet that does it.
export const levelCss = () =>
  [...PRO_ONLY.map(c => `body.lv-simple [data-ctl="${c}"]`), ...SIMPLE_ONLY.map(c => `body.lv-pro [data-ctl="${c}"]`)].join(',\n') + ' { display: none !important; }';

// ---- The guided first song ----
//
// When there are no pieces and no songs yet: 1 a mood, 2 the demo's sounds
// or your own, 3 one song made and played, 4 one tweak to try and ♡ to keep
// it. Skipped or finished, it's done (the setting `guided`); the help sheet
// plays it again.
export const GUIDE_MOODS = [
  { id: 'chill', icon: '🌙', zh: ['放鬆', '慢慢的，放空用'], en: ['Chill', 'Slow and easy'] },
  { id: 'hype', icon: '🔥', zh: ['熱血', '又快又重'], en: ['Hype', 'Fast and heavy'] },
  { id: 'groove', icon: '🕺', zh: ['律動', '想跳舞的節奏'], en: ['Groove', 'Made to dance to'] },
  { id: 'classic', icon: '📻', zh: ['經典', '老派嘻哈、放克'], en: ['Classic', 'Old-school, funky'] }
];
export const shouldGuide = ({ guided = false, pieces = 0, songs = 0, kept = 0 } = {}) => !guided && !pieces && !songs && !kept;

// The guide's state: { step, mood, sound }; step null when it isn't shown.
// Steps: mood → sound → (mine: waiting for your sounds) → making → tweak.
export const GUIDE_START = { step: 'mood', mood: null, sound: null };
export function guideNext(g, ev) {
  const at = g?.step || null;
  switch (ev?.type) {
    case 'replay':
      return { ...GUIDE_START };
    case 'mood':
      return at === 'mood' && GUIDE_MOODS.some(m => m.id === ev.mood) ? { ...g, step: 'sound', mood: ev.mood } : g;
    // The demo's sounds, or the pieces already in (played again from help).
    case 'demo':
    case 'current':
      return at === 'sound' ? { ...g, step: 'making', sound: ev.type } : g;
    case 'mine':
      return at === 'sound' ? { ...g, step: 'mine', sound: 'mine' } : g;
    // Your sounds are in: the song is made.
    case 'kit':
      return at === 'mine' ? { ...g, step: 'making' } : g;
    case 'made':
      return at === 'making' ? { ...g, step: 'tweak' } : g;
    // It couldn't be made (or your sounds had no pieces): pick the sounds again.
    case 'failed':
      return at === 'making' || at === 'mine' ? { ...g, step: 'sound' } : g;
    case 'back':
      return at === 'sound' ? { ...g, step: 'mood' } : at === 'mine' ? { ...g, step: 'sound' } : g;
    case 'skip':
    case 'done':
      return { ...g, step: null };
    default:
      return g;
  }
}
// Where it is, as "2 / 4" (the waiting step counts as the sound's).
export const guideStepNo = step => ({ mood: 1, sound: 2, mine: 2, making: 3, tweak: 4 })[step] || 0;

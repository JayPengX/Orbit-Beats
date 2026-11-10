// 用說的做節奏 (the family's AI plan, Jay 11-10; code first): what you'd like
// to hear, in your own words (讀書用的 lo-fi，慢一點，下雨的感覺), read by code
// into a station of the radio: its grooves and a tempo range. Only words code
// can't place go to the AI door (beats-say, on the send), and only the words:
// never a sound. → { styles, bpm: [lo, hi] | null } or null (nothing read).
import { STYLE_NAMES } from './names.mjs';
import { MOODS } from './radio.mjs';

export const TEMPO = { slow: [60, 95], mid: [95, 125], fast: [125, 200] };

// A groove by name, its own and the ways people say it.
const ALIAS = {
  lofi: ['lo-fi', 'lofi', 'lo fi', '低傳真'],
  hiphop: ['hip hop', 'hip-hop', 'hiphop', '饒舌', 'rap'],
  jazz: ['爵士', 'jazz'],
  kpop: ['k-pop', 'kpop', '韓團', '韓流'],
  ballad: ['抒情', '情歌', '鋼琴'],
  cinematic: ['電影', '史詩', 'epic', '配樂'],
  chiptune: ['8-bit', '8bit', '遊戲', '電玩'],
  house: ['電音', 'edm', 'house'],
  rock: ['搖滾', 'rock'],
  ambient: ['氛圍', '白噪音', '冥想'],
  chinese: ['中國風', '古風'],
  citypop: ['city pop', 'citypop', '城市流行'],
  synthwave: ['合成器', 'synthwave', '80年代', '復古'],
  funk: ['放克', 'funk'],
  metal: ['金屬', 'metal'],
  reggae: ['雷鬼', 'reggae'],
  bossa: ['巴薩', 'bossa'],
  disco: ['迪斯可', 'disco'],
  blues: ['藍調', 'blues'],
  country: ['鄉村', 'country'],
  gospel: ['福音', 'gospel'],
  neosoul: ['靈魂', 'r&b', 'rnb', 'soul'],
  trap: ['trap', '陷阱'],
  dnb: ['d&b', 'dnb', 'drum and bass', '鼓打貝斯'],
  techno: ['techno', '科技舞曲'],
  trance: ['trance', '迷幻'],
  dubstep: ['dubstep', '回響貝斯']
};
// What a time or a feeling sounds like: [words, grooves, tempo].
const SCENES = [
  [/讀書|唸書|念書|專心|專注|寫作業|工作|study|focus|work/i, ['lofi', 'ambient', 'jazz', 'bossa', 'neosoul'], null],
  [/睡|助眠|放空|sleep/i, ['ambient', 'lofi', 'ballad'], 'slow'],
  [/下雨|雨天|雨聲|rain/i, ['lofi', 'jazz', 'bossa', 'ambient', 'neosoul'], null],
  [/咖啡|cafe|coffee/i, ['bossa', 'jazz', 'lofi', 'neosoul'], null],
  [/運動|跑步|健身|重訓|騎車|workout|gym|run/i, ['trap', 'drill', 'house', 'dnb', 'techno', 'phonk', 'rock'], 'fast'],
  [/派對|跳舞|夜店|嗨|party|dance/i, ['house', 'disco', 'dembow', 'amapiano', 'baile', 'funk', 'garage'], null],
  [/開車|兜風|公路|drive/i, ['synthwave', 'citypop', 'funk', 'disco', 'rock'], null],
  [/深夜|半夜|夜晚|晚上|night/i, ['lofi', 'ambient', 'synthwave', 'neosoul'], null],
  [/早上|早晨|起床|morning/i, ['bossa', 'citypop', 'lofi', 'afro'], null],
  [/難過|傷心|悲傷|失戀|sad/i, ['ballad', 'neosoul', 'lofi', 'blues'], 'slow'],
  [/開心|快樂|輕快|happy/i, ['citypop', 'funk', 'disco', 'kpop', 'afro'], null],
  [/熱血|燃|戰鬥|hype/i, MOODS.hype.styles, 'fast'],
  [/放鬆|輕鬆|chill|relax/i, MOODS.chill.styles, null]
];
const SLOW = /慢|緩|輕柔|安靜|柔和|slow|calm/i;
const FAST = /快|激烈|動感|有勁|強烈|fast|energetic/i;
const MID = /中等|中速|不快不慢/;

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ');

export function readVibe(text) {
  const s = norm(text).slice(0, 80);
  if (!s.trim()) return null;
  // Grooves named outright: those.
  const named = new Set();
  for (const [id, [zh, en]] of Object.entries(STYLE_NAMES)) for (const n of [zh, en]) if (n && n.length >= (/^[\x20-\x7e]+$/.test(n) ? 3 : 2) && s.includes(n.toLowerCase())) named.add(id);
  for (const [id, words] of Object.entries(ALIAS)) if (words.some(w => s.includes(w))) named.add(id);
  // A mood by its name (放鬆, 熱血, 律動…).
  const moods = Object.values(MOODS).filter(m => m !== MOODS.all && s.includes(m.zh)).map(m => m.styles);
  const scenes = SCENES.filter(([re]) => re.test(s));
  let styles = [...named];
  if (!styles.length) {
    // (Two feelings together: the grooves both have, else all of either.)
    const sets = [...scenes.map(x => x[1]), ...moods];
    if (sets.length) {
      const both = sets[0].filter(x => sets.every(set => set.includes(x)));
      styles = both.length ? both : [...new Set(sets.flat())];
    }
  }
  const bpmM = /(\d{2,3})\s*bpm/i.exec(s);
  let bpm = null;
  if (bpmM) {
    const n = Number(bpmM[1]);
    if (n >= 50 && n <= 200) bpm = [n - 8, n + 8];
  }
  bpm ||= SLOW.test(s) ? TEMPO.slow : MID.test(s) ? TEMPO.mid : FAST.test(s) ? TEMPO.fast : TEMPO[scenes.find(x => x[2])?.[2]] || null;
  if (!styles.length && !bpm) return null;
  return { styles: styles.filter(x => STYLE_NAMES[x]).slice(0, 8), bpm };
}

// The station the radio plays it as: say:<grooves>@<lo>-<hi> (lib/stations.mjs).
export function vibeStation(v) {
  if (!v || (!v.styles?.length && !v.bpm)) return null;
  return `say:${(v.styles || []).join('.')}${v.bpm ? `@${Math.round(v.bpm[0])}-${Math.round(v.bpm[1])}` : ''}`;
}

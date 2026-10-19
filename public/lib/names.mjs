// The words for the engine's ids, both languages ([zh, en]), for every
// screen (做歌, 樂器, 即興, 歌單) from one place.
import { en } from './lang.mjs';

export const STYLE_NAMES = {
  four: ['四拍', '4-on-floor'], hiphop: ['嘻哈', 'Hip-hop'], trap: ['Trap', 'Trap'], half: ['半速', 'Half-time'], broken: ['碎拍', 'Breakbeat'], house: ['House', 'House'],
  dembow: ['Dembow', 'Dembow'], afro: ['Afro', 'Afro'], drill: ['Drill', 'Drill'], boombap: ['Boom Bap', 'Boom Bap'], jersey: ['Jersey', 'Jersey'], amapiano: ['Amapiano', 'Amapiano'],
  lofi: ['Lo-fi', 'Lo-fi'], funk: ['放克', 'Funk'], garage: ['UK 車庫', 'Garage'], dnb: ['D&B', 'D&B'], reggae: ['雷鬼', 'Reggae'], phonk: ['Phonk', 'Phonk'], baile: ['Baile', 'Baile'], techno: ['Techno', 'Techno'],
  jazz: ['爵士搖擺', 'Jazz swing'], bossa: ['巴薩諾瓦', 'Bossa nova'], samba: ['森巴', 'Samba'], salsa: ['騷莎', 'Salsa'], rock: ['搖滾', 'Rock'], punk: ['流行龐克', 'Pop-punk'],
  metal: ['金屬', 'Metal'], citypop: ['City Pop', 'City pop'], kpop: ['K-pop', 'K-pop'], synthwave: ['合成器浪潮', 'Synthwave'], disco: ['迪斯可', 'Disco'], gospel: ['福音', 'Gospel'],
  neosoul: ['新靈魂', 'Neo-soul'], ballad: ['抒情', 'Ballad'], ambient: ['氛圍', 'Ambient'], cinematic: ['電影配樂', 'Cinematic'], chiptune: ['8-bit', 'Chiptune'], kizomba: ['Kizomba', 'Kizomba'],
  highlife: ['Highlife', 'Highlife'], cumbia: ['昆比亞', 'Cumbia'], bhangra: ['班格拉', 'Bhangra'], dubstep: ['Dubstep', 'Dubstep'], footwork: ['Footwork', 'Footwork'], jungle: ['叢林', 'Jungle'],
  trance: ['Trance', 'Trance'], hardstyle: ['Hardstyle', 'Hardstyle'], chinese: ['中國風', 'Chinese'], blues: ['藍調', 'Blues'], country: ['鄉村', 'Country']
};
// The grooves as the chips list them: the most played first, then by kind
// (hip-hop, pop, dance, Latin and the world's, jazz and soul, rock, calm,
// game and film). engine.mjs's STYLES keeps its own order (the songs' seeds).
// (The order, kept where the worker can read it too: engine.mjs.)
export { STYLE_ORDER } from '../engine.mjs';
export const SECTION_NAMES = { intro: ['前奏', 'Intro'], verse: ['主歌', 'Verse'], pre: ['導歌', 'Pre-hook'], hook: ['副歌', 'Hook'], break: ['間奏', 'Break'], bridge: ['橋段', 'Bridge'], outro: ['尾奏', 'Outro'] };
export const ROLE_NAMES = { riff: ['Riff', 'Riff'], phrase: ['樂句', 'Phrase'], bass: ['貝斯', 'Bass'], hat: ['閉鈸', 'Hats'], fill: ['過門', 'Fill'], kick: ['大鼓', 'Kick'], sub: ['808', '808'], snare: ['小鼓', 'Snare'], tick: ['滴答', 'Tick'], roll: ['滾奏', 'Roll'], off: ['不用', 'Not used'] };
export const BUS_NAMES = { drums: ['鼓', 'Drums'], hats: ['閉鈸', 'Hats'], bass: ['貝斯', 'Bass'], keys: ['旋律', 'Melody'], fx: ['殘響', 'Echo & room'] };

// An id in the reader's language (the id itself when it has no words).
export const name = (table, k) => (table[k] ? table[k][en ? 1 : 0] : k);

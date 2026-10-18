// The words for the engine's ids, both languages ([zh, en]), for every
// screen (做歌, 樂器, 即興, 歌單) from one place.
import { en } from './lang.mjs';

export const STYLE_NAMES = {
  four: ['四拍', '4-on-floor'], hiphop: ['嘻哈', 'Hip-hop'], trap: ['Trap', 'Trap'], half: ['半速', 'Half-time'], broken: ['碎拍', 'Breakbeat'], house: ['House', 'House'],
  dembow: ['Dembow', 'Dembow'], afro: ['Afro', 'Afro'], drill: ['Drill', 'Drill'], boombap: ['Boom Bap', 'Boom Bap'], jersey: ['Jersey', 'Jersey'], amapiano: ['Amapiano', 'Amapiano'],
  lofi: ['Lo-fi', 'Lo-fi'], funk: ['放克', 'Funk'], garage: ['UK 車庫', 'Garage'], dnb: ['D&B', 'D&B'], reggae: ['雷鬼', 'Reggae'], phonk: ['Phonk', 'Phonk'], baile: ['Baile', 'Baile'], techno: ['Techno', 'Techno']
};
export const SECTION_NAMES = { intro: ['前奏', 'Intro'], verse: ['主歌', 'Verse'], pre: ['導歌', 'Pre-hook'], hook: ['副歌', 'Hook'], break: ['間奏', 'Break'], bridge: ['橋段', 'Bridge'], outro: ['尾奏', 'Outro'] };
export const ROLE_NAMES = { riff: ['Riff', 'Riff'], phrase: ['樂句', 'Phrase'], bass: ['貝斯', 'Bass'], hat: ['閉鈸', 'Hats'], fill: ['過門', 'Fill'], kick: ['大鼓', 'Kick'], sub: ['808', '808'], snare: ['小鼓', 'Snare'], tick: ['滴答', 'Tick'], roll: ['滾奏', 'Roll'], off: ['不用', 'Not used'] };
export const BUS_NAMES = { drums: ['鼓', 'Drums'], hats: ['閉鈸', 'Hats'], bass: ['貝斯', 'Bass'], keys: ['旋律', 'Melody'], fx: ['殘響', 'Echo & room'] };

// An id in the reader's language (the id itself when it has no words).
export const name = (table, k) => (table[k] ? table[k][en ? 1 : 0] : k);

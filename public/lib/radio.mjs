// 聽 (the radio): endless songs out of nothing, on the app's own instruments
// (lib/synth.mjs), no kit, no clips, no setup. Each song is its own band:
// a groove from the mood, its tempo, a key (and its mode), a four-chord
// progression, and instruments, drums and hats that suit the groove; written
// as four-bar loops (chords, a melody, an arpeggio, two bass lines, hats and
// the drums), then arranged and mixed by the engine like any kit's song, in
// sections of four or eight bars so every loop stays on its chord. Songs
// follow each other with no gap: each one is cut just before its last hit,
// and that hit's ring is played under the next one's intro (`segment`). Each
// next song is picked to differ from the last ones (`radioPick`): another
// kind of groove, another tempo, key and mode, other instruments, another
// form. No DOM: the worker makes them (lib/make.mjs), the tests listen to them.

import { makeSong, makeRng, analyzeRecording, STYLES, FAMILY, SHUFFLE } from '../engine.mjs';
import { voice, renderClip, emptyDrums } from './synth.mjs';
import { mixOf } from './mix.mjs';

export const RADIO_SR = 32000;

// 情境: a mood picks the grooves (and how loose they're played); the page's 做歌 too.
export const MOODS = {
  all: { zh: '隨機', en: 'Random', styles: STYLES, humanize: 100 },
  chill: { zh: '放鬆', en: 'Chill', styles: ['half', 'hiphop', 'boombap', 'afro', 'amapiano', 'lofi', 'reggae', 'bossa', 'neosoul', 'ambient', 'ballad', 'kizomba', 'chinese'], humanize: 130 },
  hype: { zh: '熱血', en: 'Hype', styles: ['trap', 'drill', 'four', 'jersey', 'phonk', 'dnb', 'techno', 'baile', 'rock', 'punk', 'metal', 'dubstep', 'jungle', 'trance', 'hardstyle', 'footwork', 'cinematic'], humanize: 60 },
  groove: { zh: '律動', en: 'Groove', styles: ['house', 'afro', 'dembow', 'amapiano', 'broken', 'funk', 'garage', 'disco', 'citypop', 'highlife', 'cumbia', 'salsa', 'bhangra'], humanize: 100 },
  classic: { zh: '經典', en: 'Classic', styles: ['boombap', 'hiphop', 'half', 'four', 'funk', 'reggae', 'jazz', 'blues', 'gospel', 'disco', 'rock', 'country'], humanize: 140 },
  pop: { zh: '流行', en: 'Pop', styles: ['kpop', 'citypop', 'synthwave', 'disco', 'ballad', 'chinese', 'punk', 'house', 'chiptune', 'dembow', 'country'], humanize: 90 },
  jazz: { zh: '爵士', en: 'Jazz', styles: ['jazz', 'bossa', 'blues', 'gospel', 'neosoul', 'lofi', 'funk', 'citypop'], humanize: 130 },
  world: { zh: '世界', en: 'World', styles: ['samba', 'salsa', 'bossa', 'cumbia', 'kizomba', 'highlife', 'bhangra', 'chinese', 'afro', 'amapiano', 'dembow', 'reggae', 'baile'], humanize: 110 }
};
// A mood's grooves, or one groove picked on its own (`style:<id>`).
export const moodStyles = mood => (MOODS[mood] ? MOODS[mood].styles : STYLES.includes(String(mood).replace(/^style:/, '')) ? [String(mood).replace(/^style:/, '')] : STYLES);

// The kinds of sound the grooves come in: two in a row are never of one kind
// (not trap, then drill, then phonk).
export const SOUND = {
  trap: 'trap', drill: 'trap', phonk: 'trap', dubstep: 'trap', half: 'trap',
  hiphop: 'rap', boombap: 'rap', lofi: 'rap',
  four: 'club', house: 'club', techno: 'club', garage: 'club', trance: 'club', hardstyle: 'club', jersey: 'club', footwork: 'club',
  broken: 'breaks', dnb: 'breaks', jungle: 'breaks',
  dembow: 'latin', baile: 'latin', salsa: 'latin', cumbia: 'latin', samba: 'latin',
  afro: 'afro', amapiano: 'afro', highlife: 'afro', kizomba: 'afro',
  reggae: 'island', bhangra: 'south-asia', chinese: 'east-asia',
  jazz: 'jazz', bossa: 'jazz', blues: 'jazz',
  gospel: 'soul', neosoul: 'soul', funk: 'soul', disco: 'soul',
  rock: 'rock', punk: 'rock', metal: 'rock', country: 'folk',
  citypop: 'pop', kpop: 'pop', synthwave: 'retro', chiptune: 'retro', ballad: 'calm', ambient: 'calm', cinematic: 'score'
};
// How far apart two songs' tempos are: plain, or a half / double-time feel.
const tempoJump = (a, b) => Math.abs(a - b) >= 15 || Math.abs(a / b - 2) < 0.12 || Math.abs(b / a - 2) < 0.12;
const modeName = sp => sp.mode || (sp.key.minor ? 'minor' : 'major');
const planSig = sp => radioPlan(makeRng(sp.seed ^ 0x1b873593), sp.bpm, sp.seconds).map(p => p.join('')).join();
// How a song differs from the one before it: [tempo, key, mode, chords, lead, form] each true when it does.
export function contrast(a, b) {
  return [tempoJump(a.bpm, b.bpm), a.key.tonic !== b.key.tonic, modeName(a) !== modeName(b), a.chords !== b.chords, a.lead !== b.lead, planSig(a) !== planSig(b)];
}

// The next song's spec: { seed, mood, style }. `recent` is what played
// lately, oldest first (specs, or just their grooves). The groove: one of
// the mood's, none of the last six (fewer in a small mood: its size less five), never of the
// last one's kind or family, one not heard for longest when it can, and
// one whose tempo can jump from the last. Then the seed: the first of a few
// drawn from `seed` whose song differs from the last in tempo (15 BPM or a
// half / double-time feel), key, mode, chord and lead instruments and form,
// else the one differing most. One groove asked for (`style:<id>`): always it.
export function radioPick(mood, recent = [], seed = Math.floor(Math.random() * 1e9)) {
  const styles = moodStyles(mood);
  const R = makeRng(seed);
  const past = recent.map(x => (typeof x === 'string' ? x : x?.style)).filter(Boolean);
  const prev = recent.length && typeof recent.at(-1) === 'object' && Number.isInteger(recent.at(-1).seed) ? recent.at(-1) : null;
  const was = prev && STYLES.includes(prev.style) ? radioSpec(prev.seed, MOODS[prev.mood] || /^style:/.test(prev.mood) ? prev.mood : 'all', prev.style) : null;
  const last = past.at(-1);
  const keep = (pool, ok) => (pool.filter(ok).length ? pool.filter(ok) : pool);
  let pool = styles.filter(s => !past.slice(-Math.min(6, Math.max(1, styles.length - 5))).includes(s));
  if (!pool.length) pool = styles.filter(s => s !== last);
  if (!pool.length) pool = styles;
  if (last) pool = keep(pool, s => SOUND[s] !== SOUND[last] && !FAMILY[last]?.includes(s) && !FAMILY[s]?.includes(last));
  if (was) {
    const jumps = s => tempoJump(BAND[s].bpm[0], was.bpm) || tempoJump(BAND[s].bpm[1], was.bpm);
    // (No groove left that can jump from the last tempo: look again further back in the mood's grooves, the tempo first.)
    if (!pool.some(jumps)) pool = keep(styles.filter(s => s !== last && !past.slice(-2).includes(s) && jumps(s)), () => true);
    pool = keep(pool, jumps);
  }
  pool = keep(pool, s => !past.includes(s));
  const style = R.choice(pool);
  const out = s => ({ seed: s, mood: MOODS[mood] || /^style:/.test(mood) ? mood : 'all', style });
  if (!was) return out(seed);
  let best = null;
  // (The tempo jump and a new key or mode count most: they are what a listener hears first.)
  for (let k = 0; k < 120; k++) {
    const s = k ? R.int(0, 1e9 - 1) : seed;
    const c = contrast(radioSpec(s, out(s).mood, style), was);
    const score = c.filter(Boolean).length + (c[0] ? 10 : 0) + (c[1] || c[2] ? 10 : 0);
    if (!best || score > best.score) best = { s, score };
    if (score === 26) break;
  }
  return out(best.s);
}
// The radio's queue: the stretches made and waiting, whether one is being
// made, whether ⏭ waits for the next, and the mood's generation (what was
// made for a mood since changed is dropped).
export const radioQueue = () => ({ ready: [], busy: false, skip: false, gen: 0 });

// The hats (three one-bar loops: [drum, its 16ths, its level]).
const ALL16 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const E8 = [0, 2, 4, 6, 8, 10, 12, 14];
const OFF8 = [2, 6, 10, 14];
const HATS = [[['hat', E8], ['hat', OFF8, 3]], [['hat', ALL16, 3], ['hat', [0, 4, 8, 12], 1]], [['open', OFF8], ['shaker', [1, 3, 5, 7, 9, 11, 13, 15], 3]]];
// The drums the newer grooves play on (the first ones keep a kick, an 808 and the snare or clap and hat drawn): kick, the boom under the heavy kick, the hit on the last downbeat (the 808's place), the snares and ticks to choose from.
const ACOUSTIC = { kick: 'kick', boom: 'tom', sub: ['kick', 'crash'] };
const ROCK = { kick: 'rkick', boom: 'rkick', sub: ['rkick', 'crash'], snare: ['rsnare'] };

// Each groove: its tempo range, its instruments and how its chords and bass
// are played. The newer ones also: how often minor (`minor`), their modes,
// progressions, sevenths (`ext`) and ninths, a scale for the tunes (`tune`:
// pentatonic, blues), the melody's rhythms, an arpeggio's instruments
// (`arps`) and sixteenths (`arp16`), a 16th swing, their drums (`kit`) and hats.
const BAND = {
  four: { bpm: [118, 126], chords: ['pad', 'organ', 'keys'], leads: ['pluck', 'lead', 'bell', 'supersaw'], bass: ['bass'], comp: 'stab8', line: 'off8' },
  hiphop: { bpm: [84, 94], chords: ['keys', 'strings', 'organ', 'piano'], leads: ['bell', 'pluck', 'vox', 'piano', 'flute'], bass: ['bass', 'subbass'], comp: 'held', line: 'hop' },
  trap: { bpm: [132, 148], chords: ['pad', 'strings', 'bell', 'choir'], leads: ['bell', 'pluck', 'vox', 'flute', 'glass'], bass: ['subbass', 'bass808'], comp: 'held', line: 'long' },
  half: { bpm: [70, 84], chords: ['strings', 'pad', 'keys', 'piano'], leads: ['bell', 'keys', 'guitar', 'kalimba'], bass: ['subbass', 'bass'], comp: 'held', line: 'long' },
  broken: { bpm: [120, 128], chords: ['pad', 'keys', 'rhodes'], leads: ['pluck', 'lead', 'vibes'], bass: ['bass'], comp: 'stab', line: 'hop' },
  house: { bpm: [120, 125], chords: ['organ', 'keys', 'pad', 'piano'], leads: ['pluck', 'vox', 'lead', 'piano'], bass: ['bass'], comp: 'stab8', line: 'off8' },
  dembow: { bpm: [90, 100], chords: ['pad', 'keys', 'guitar', 'nylon'], leads: ['pluck', 'lead', 'bell', 'steel'], bass: ['subbass', 'bass'], comp: 'stab', line: 'dembow' },
  afro: { bpm: [100, 110], chords: ['keys', 'guitar', 'organ', 'rhodes'], leads: ['pluck', 'bell', 'guitar', 'kalimba', 'marimba'], bass: ['bass'], comp: 'stab', line: 'afro' },
  drill: { bpm: [138, 144], chords: ['strings', 'pad', 'bell', 'choir'], leads: ['bell', 'vox', 'strings', 'piano', 'pizz'], bass: ['subbass', 'bass808'], comp: 'held', line: 'long' },
  boombap: { bpm: [86, 94], chords: ['keys', 'organ', 'strings', 'piano'], leads: ['keys', 'brass', 'guitar', 'sax'], bass: ['bass', 'upright'], comp: 'held', line: 'hop' },
  jersey: { bpm: [136, 144], chords: ['pad', 'organ'], leads: ['vox', 'pluck', 'lead'], bass: ['subbass', 'bass808'], comp: 'stab8', line: 'long' },
  amapiano: { bpm: [110, 114], chords: ['keys', 'organ', 'pad', 'rhodes'], leads: ['pluck', 'bell', 'keys', 'marimba', 'sax'], bass: ['subbass'], comp: 'stab', line: 'afro' },
  lofi: { bpm: [72, 84], chords: ['keys', 'guitar', 'strings', 'rhodes'], leads: ['keys', 'bell', 'guitar', 'vibes', 'kalimba'], bass: ['bass', 'upright'], comp: 'held', line: 'hop' },
  funk: { bpm: [100, 112], chords: ['organ', 'keys', 'brass', 'clav'], leads: ['brass', 'lead', 'guitar', 'sax'], bass: ['bass', 'slap'], comp: 'stab', line: 'funk' },
  garage: { bpm: [128, 134], chords: ['organ', 'pad', 'keys', 'rhodes'], leads: ['vox', 'pluck'], bass: ['subbass', 'bass'], comp: 'stab8', line: 'off8' },
  dnb: { bpm: [168, 176], chords: ['pad', 'strings'], leads: ['pluck', 'bell', 'lead'], bass: ['subbass', 'bass', 'reese'], comp: 'held', line: 'long' },
  reggae: { bpm: [72, 84], chords: ['organ', 'guitar', 'keys'], leads: ['keys', 'brass', 'guitar', 'harmonica'], bass: ['bass'], comp: 'skank', line: 'drop' },
  phonk: { bpm: [126, 138], chords: ['bell', 'pad', 'strings'], leads: ['bell', 'lead', 'vox', 'glass'], bass: ['subbass', 'bass808'], comp: 'held', line: 'long' },
  baile: { bpm: [126, 132], chords: ['pad', 'organ'], leads: ['vox', 'lead', 'pluck'], bass: ['subbass'], comp: 'stab8', line: 'off8' },
  techno: { bpm: [124, 132], chords: ['pad', 'organ'], leads: ['lead', 'pluck', 'bell'], bass: ['bass', 'subbass', 'acid'], comp: 'stab8', line: 'off8' },
  jazz: {
    bpm: [112, 150], chords: ['piano', 'rhodes', 'vibes'], leads: ['sax', 'vibes', 'piano', 'flute'], arps: ['vibes', 'piano'], bass: ['upright'], comp: 'charleston', line: 'walk',
    minor: 0.3, modes: { minor: ['harm', 'dorian'] }, progs: { major: [[1, 4, 0, 0], [1, 4, 0, 5], [0, 5, 1, 4], [2, 5, 1, 4]], minor: [[1, 4, 0, 0], [0, 3, 1, 4]] }, ext: 1, ninths: 0.6,
    kit: { ...ACOUSTIC, snare: ['brush'], tick: ['ride'] }, hats: [[['ride', [0, 4, 6, 8, 12, 14]], ['hat', [4, 12], 3]], [['ride', [0, 4, 8, 12], 3], ['hat', [4, 12], 3]], [['brush', E8, 3]]]
  },
  bossa: {
    bpm: [64, 76], chords: ['nylon', 'rhodes', 'piano'], leads: ['flute', 'sax', 'vibes', 'nylon'], arps: ['nylon', 'vibes'], bass: ['upright', 'bass'], comp: 'bossa', line: 'bossa',
    minor: 0.35, modes: { minor: ['dorian'] }, progs: { major: [[1, 4, 0, 0], [0, 0, 1, 4], [0, 5, 1, 4], [3, 2, 1, 0]], minor: [[0, 3, 1, 4], [0, 5, 1, 4]] }, ext: 1, ninths: 0.5,
    kit: { ...ACOUSTIC, sub: ['kick', 'ride'], snare: ['rim', 'clave'], tick: ['shaker'] }, hats: [[['shaker', ALL16, 3], ['shaker', [0, 4, 8, 12]]], [['hat', E8, 3]], [['clave', [0, 3, 6, 10, 12], 3]]]
  },
  samba: {
    bpm: [96, 108], chords: ['nylon', 'guitar', 'brass'], leads: ['flute', 'brass', 'steel', 'sax'], arps: ['nylon', 'pluck'], bass: ['bass', 'upright'], comp: 'montuno', line: 'samba',
    minor: 0.3, progs: { major: [[0, 5, 1, 4], [0, 3, 4, 0], [0, 1, 4, 0]] }, ext: 0.7,
    kit: { kick: 'kick', boom: 'dhol', sub: ['dhol', 'crash'], snare: ['timbale', 'rim'], tick: ['shaker', 'tamb'] }, hats: [[['shaker', ALL16, 3], ['shaker', [3, 7, 11, 15]]], [['tamb', [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15], 3]], [['agogo', [0, 2, 5, 7, 10, 12]]]]
  },
  salsa: {
    bpm: [90, 102], chords: ['piano', 'brass'], leads: ['brass', 'sax', 'flute', 'piano'], arps: ['piano', 'vibes'], bass: ['upright', 'bass'], comp: 'montuno', line: 'tumbao',
    minor: 0.7, modes: { minor: ['harm'] }, progs: { minor: [[0, 3, 4, 0], [0, 4, 0, 4], [0, 3, 6, 4]], major: [[0, 3, 4, 3], [0, 4, 4, 0]] }, ext: 0.3,
    kit: { kick: 'kick', boom: 'conga', sub: ['kick', 'crash'], snare: ['clave'], tick: ['cowbell'] }, hats: [[['clave', [0, 3, 6, 10, 12]], ['cowbell', [0, 4, 8, 12], 3]], [['guiro', E8, 3], ['clave', [0, 3, 6, 10, 12], 3]], [['timbale', [0, 2, 3, 5, 6, 8, 10, 11, 13, 14], 3]]]
  },
  rock: {
    bpm: [108, 140], chords: ['distgtr', 'guitar', 'organ'], leads: ['distgtr', 'lead', 'organ', 'piano'], arps: ['guitar', 'piano'], bass: ['bass'], comp: 'power', line: 'rock8',
    minor: 0.5, modes: { major: ['mixo', 'major', 'major'] }, progs: { major: [[0, 4, 5, 3], [0, 3, 0, 4], [0, 6, 3, 0], [5, 3, 0, 4]], minor: [[0, 5, 6, 0], [0, 6, 5, 6], [0, 3, 5, 6]] }, ext: 0,
    kit: { ...ROCK, tick: ['hat', 'ride'] }, hats: [[['hat', E8], ['hat', OFF8, 3]], [['ride', E8, 3], ['ride', [0, 4, 8, 12]]], [['open', E8, 3]]]
  },
  punk: {
    bpm: [160, 190], chords: ['distgtr'], leads: ['distgtr', 'lead', 'supersaw'], arps: ['guitar'], bass: ['bass'], comp: 'power', line: 'rock8',
    minor: 0.25, progs: { major: [[0, 4, 5, 3], [0, 3, 4, 4], [5, 3, 0, 4], [0, 4, 3, 4]] }, ext: 0,
    kit: { ...ROCK, tick: ['hat'] }, hats: [[['hat', E8]], [['ride', E8, 3]], [['crash', [0], 3], ['open', E8, 3]]]
  },
  metal: {
    bpm: [92, 112], chords: ['distgtr'], leads: ['distgtr', 'strings', 'choir'], arps: ['distgtr', 'pizz'], bass: ['bass', 'reese'], comp: 'chug', line: 'gallop',
    minor: 1, modes: { minor: ['phryg', 'harm', 'minor'] }, progs: { minor: [[0, 1, 0, 6], [0, 5, 6, 0], [0, 0, 5, 6], [0, 6, 5, 1]] }, ext: 0,
    kit: { ...ROCK, tick: ['ride', 'hat'] }, hats: [[['hat', E8]], [['ride', [0, 4, 8, 12]], ['ride', OFF8, 3]], [['crash', [0, 8], 3]]]
  },
  citypop: {
    bpm: [100, 118], chords: ['rhodes', 'piano', 'strings'], leads: ['sax', 'lead', 'brass', 'vibes', 'supersaw'], arps: ['rhodes', 'glass', 'pluck'], bass: ['slap', 'bass'], comp: 'stab', line: 'disco',
    minor: 0.35, modes: { minor: ['dorian'] }, progs: { major: [[3, 4, 2, 5], [3, 4, 0, 5], [1, 4, 0, 5], [5, 3, 4, 0]], minor: [[0, 3, 1, 4], [5, 3, 4, 0]] }, ext: 1, ninths: 0.4,
    kit: { kick: 'kick', boom: 'kick', sub: ['kick', 'crash'], snare: ['snare', 'clap'], tick: ['hat'] }, hats: [[['hat', ALL16, 3], ['hat', E8]], [['hat', E8], ['open', [14], 3]], [['tamb', [4, 12]], ['shaker', ALL16, 3]]]
  },
  kpop: {
    bpm: [116, 128], chords: ['supersaw', 'piano', 'pad'], leads: ['supersaw', 'vox', 'pluck', 'lead', 'bell'], arps: ['pluck', 'bell'], bass: ['bass808', 'subbass', 'bass'], comp: 'stab8', line: 'off8',
    minor: 0.6, progs: { major: [[5, 3, 0, 4], [3, 4, 2, 5], [0, 4, 5, 3]] }, ext: 0.3
  },
  synthwave: {
    bpm: [84, 110], chords: ['supersaw', 'pad', 'strings'], leads: ['lead', 'chip', 'supersaw', 'sax'], arps: ['pluck', 'supersaw', 'chip'], arp16: true, bass: ['bass', 'acid'], comp: 'pulse', line: 'rock8',
    minor: 0.85, progs: { minor: [[0, 5, 6, 4], [0, 5, 2, 6], [0, 3, 5, 6], [5, 6, 0, 0]] }, ext: 0.2,
    kit: { kick: 'kick', boom: 'kick', sub: ['kick', 'crash'], snare: ['rsnare', 'clap'], tick: ['hat'] }, hats: [[['hat', OFF8]], [['hat', E8, 3], ['hat', OFF8]], [['open', OFF8, 3], ['tamb', [4, 12], 3]]]
  },
  disco: {
    bpm: [114, 124], chords: ['strings', 'clav', 'piano', 'guitar'], leads: ['strings', 'brass', 'vox', 'piano'], arps: ['clav', 'guitar', 'strings'], bass: ['slap', 'bass'], comp: 'stab8', line: 'disco',
    minor: 0.5, modes: { minor: ['dorian'] }, progs: { minor: [[0, 3, 0, 3], [0, 5, 3, 4], [0, 3, 6, 4]], major: [[0, 3, 4, 3], [1, 4, 0, 5]] }, ext: 0.7,
    kit: { kick: 'kick', boom: 'kick', sub: ['kick', 'crash'], snare: ['snare', 'clap'], tick: ['hat'] }, hats: [[['open', OFF8], ['hat', [0, 4, 8, 12], 3]], [['hat', ALL16, 3], ['open', OFF8]], [['tamb', [4, 12]], ['shaker', E8, 3]]]
  },
  gospel: {
    bpm: [68, 84], chords: ['organ', 'piano', 'choir'], leads: ['choir', 'piano', 'organ', 'vox'], arps: ['piano', 'organ'], bass: ['bass', 'upright'], comp: 'gospel', line: 'walk',
    minor: 0.25, progs: { major: [[3, 4, 2, 5], [0, 3, 4, 0], [0, 2, 3, 4], [5, 1, 4, 0]] }, ext: 1, ninths: 0.5,
    kit: { kick: 'kick', boom: 'kick', sub: ['kick', 'crash'], snare: ['rsnare', 'clap'], tick: ['hat', 'tamb'] }, hats: [[['hat', E8], ['tamb', [4, 12], 3]], [['ride', [0, 4, 6, 8, 12, 14], 3]], [['tamb', E8, 3]]]
  },
  neosoul: {
    bpm: [70, 90], chords: ['rhodes', 'keys', 'choir'], leads: ['vox', 'rhodes', 'sax', 'guitar', 'flute'], arps: ['rhodes', 'vibes', 'guitar'], bass: ['subbass', 'bass', 'upright'], comp: 'held', line: 'hop',
    minor: 0.75, modes: { minor: ['dorian', 'minor'] }, progs: { minor: [[0, 3, 0, 3], [0, 5, 3, 4], [3, 2, 1, 0]], major: [[3, 2, 1, 0], [1, 4, 0, 5], [3, 4, 2, 5]] }, ext: 1, ninths: 0.7, swing: 0.25,
    kit: { kick: 'kick', boom: 'kick', sub: ['sub'], snare: ['snare', 'rim'], tick: ['hat', 'shaker'] }
  },
  ballad: {
    bpm: [62, 76], chords: ['piano', 'strings', 'harp'], leads: ['piano', 'strings', 'flute', 'vox'], arps: ['piano', 'harp', 'musicbox'], bass: ['bass', 'upright'], comp: 'pulse', line: 'whole',
    minor: 0.3, progs: { major: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 0, 0], [0, 4, 5, 2]] }, ext: 0.4,
    kit: { ...ACOUSTIC, snare: ['rim', 'snare'], tick: ['hat', 'shaker'] }, hats: [[['hat', [0, 4, 8, 12]]], [['hat', E8, 3]], [['shaker', E8, 3]]]
  },
  ambient: {
    bpm: [60, 78], chords: ['pad', 'choir', 'strings', 'glass'], leads: ['glass', 'kalimba', 'musicbox', 'flute', 'vibes'], arps: ['kalimba', 'glass', 'harp', 'musicbox'], bass: ['subbass'], comp: 'held', line: 'whole',
    minor: 0.5, modes: { major: ['major', 'mixo'], minor: ['dorian'] }, progs: { major: [[0, 3, 0, 3], [0, 5, 3, 0], [3, 0, 3, 0]], minor: [[0, 5, 0, 5], [0, 3, 0, 6]] }, ext: 0.8, ninths: 0.6,
    rhythms: [[0, 6, 10], [0, 8], [2, 8, 12], [0, 4, 10]],
    kit: { ...ACOUSTIC, sub: ['kick', 'gong'], snare: ['rim', 'snap'], tick: ['shaker'] }, hats: [[['shaker', [4, 12], 3]], [['shaker', OFF8, 3]], [['tamb', [4], 3]]]
  },
  cinematic: {
    bpm: [70, 92], chords: ['strings', 'choir', 'brass'], leads: ['strings', 'brass', 'choir', 'piano', 'flute'], arps: ['pizz', 'harp', 'piano', 'strings'], arp16: true, bass: ['bass', 'subbass'], comp: 'pulse', line: 'whole',
    minor: 0.9, modes: { minor: ['harm', 'minor'] }, progs: { minor: [[0, 5, 2, 6], [0, 5, 3, 4], [0, 3, 5, 4], [0, 6, 5, 4]] }, ext: 0,
    kit: { kick: 'kick', boom: 'dhol', sub: ['dhol', 'gong'], snare: ['rsnare'], tick: ['shaker'] }, hats: [[['shaker', ALL16, 3]], [['tom', [0, 3, 6, 8, 11, 14]]], [['timbale', [0, 3, 6, 10, 12], 3]]]
  },
  chiptune: {
    bpm: [128, 160], chords: ['chip'], leads: ['chip'], arps: ['chip'], arp16: true, bass: ['tri'], comp: 'stab8', line: 'chip',
    minor: 0.45, progs: { major: [[0, 5, 3, 4], [0, 4, 5, 3], [3, 4, 0, 0]], minor: [[0, 5, 6, 0], [0, 6, 5, 6]] }, ext: 0,
    kit: { kick: 'chipk', boom: 'chipk', sub: ['chipk', 'chipn'], snare: ['chipn'], tick: ['chiph'] }, hats: [[['chiph', E8]], [['chiph', ALL16, 3], ['chiph', [0, 4, 8, 12]]], [['chipn', OFF8, 3]]]
  },
  kizomba: {
    bpm: [84, 96], chords: ['pad', 'rhodes', 'guitar'], leads: ['sax', 'guitar', 'pluck', 'vox'], arps: ['guitar', 'nylon'], bass: ['subbass', 'bass808'], comp: 'stab', line: 'kizomba',
    minor: 0.75, progs: { minor: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 5, 3, 4]] }, ext: 0.5,
    kit: { kick: 'kick', boom: 'kick', sub: ['sub'], snare: ['snare', 'clap'], tick: ['rim', 'shaker'] }, hats: [[['shaker', E8], ['rim', [2, 3, 10, 11], 3]], [['shaker', ALL16, 3]], [['open', [6, 14], 3]]]
  },
  highlife: {
    bpm: [108, 124], chords: ['guitar', 'organ', 'rhodes'], leads: ['guitar', 'brass', 'sax', 'marimba'], arps: ['guitar', 'nylon', 'marimba'], bass: ['bass'], comp: 'stab', line: 'afro',
    minor: 0.2, progs: { major: [[0, 3, 4, 0], [0, 4, 3, 4], [0, 3, 0, 4], [0, 5, 3, 4]] }, ext: 0.2,
    kit: { kick: 'kick', boom: 'conga', sub: ['kick', 'crash'], snare: ['rim', 'snare'], tick: ['agogo', 'cowbell', 'shaker'] }, hats: [[['agogo', [0, 2, 5, 7, 10, 13, 15]]], [['shaker', ALL16, 3]], [['conga', [6, 7, 14], 3]]]
  },
  cumbia: {
    bpm: [88, 100], chords: ['accordion', 'guitar', 'organ'], leads: ['accordion', 'flute', 'brass', 'sax'], arps: ['guitar', 'accordion'], bass: ['bass'], comp: 'stab8', line: 'cumbia',
    minor: 0.55, modes: { minor: ['harm'] }, progs: { minor: [[0, 3, 4, 0], [0, 4, 4, 0], [0, 6, 5, 4]], major: [[0, 4, 4, 0], [0, 3, 4, 0], [0, 3, 4, 4]] }, ext: 0,
    kit: { kick: 'kick', boom: 'conga', sub: ['kick', 'crash'], snare: ['conga'], tick: ['guiro'] }, hats: [[['guiro', [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15]]], [['shaker', E8, 3]], [['conga', [6, 14]], ['open', [2, 10], 3]]]
  },
  bhangra: {
    bpm: [92, 106], chords: ['accordion', 'pad', 'strings'], leads: ['sitar', 'flute', 'vox', 'lead'], arps: ['sitar', 'pluck'], bass: ['bass', 'subbass'], comp: 'stab', line: 'bhangra',
    minor: 0.3, modes: { major: ['mixo'], minor: ['dorian'] }, progs: { major: [[0, 6, 0, 6], [0, 6, 3, 0], [0, 0, 6, 4]], minor: [[0, 6, 5, 6], [0, 3, 6, 0]] }, ext: 0,
    kit: { kick: 'dhol', boom: 'dhol', sub: ['dhol', 'tamb'], snare: ['clap', 'tabla'], tick: ['tamb'] }, hats: [[['tamb', E8]], [['tabla', [0, 3, 6, 8, 11, 14], 3], ['tamb', [4, 12]]], [['shaker', ALL16, 3]]]
  },
  dubstep: {
    bpm: [138, 142], chords: ['pad', 'supersaw', 'choir'], leads: ['lead', 'supersaw', 'bell', 'vox'], arps: ['pluck', 'bell'], bass: ['reese', 'acid', 'subbass'], comp: 'held', line: 'wobble',
    minor: 0.95, modes: { minor: ['phryg', 'minor'] }, progs: { minor: [[0, 0, 5, 6], [0, 1, 0, 1], [0, 5, 0, 6], [0, 3, 1, 0]] }, ext: 0,
    kit: { kick: 'kick', boom: 'kick', sub: ['sub'], snare: ['rsnare', 'snare'], tick: ['hat'] }
  },
  footwork: {
    bpm: [156, 164], chords: ['pad', 'rhodes', 'vox'], leads: ['vox', 'pluck', 'piano'], arps: ['pluck', 'rhodes'], bass: ['bass808', 'subbass'], comp: 'stab', line: 'long', minor: 0.7, ext: 0.4
  },
  jungle: {
    bpm: [160, 174], chords: ['pad', 'strings', 'rhodes'], leads: ['pluck', 'bell', 'vox', 'piano'], arps: ['pluck', 'rhodes', 'glass'], bass: ['reese', 'subbass'], comp: 'held', line: 'long',
    minor: 0.8, modes: { minor: ['dorian', 'minor'] }, ext: 0.5,
    kit: { kick: 'kick', boom: 'kick', sub: ['sub'], snare: ['rsnare', 'snare'], tick: ['hat', 'ride'] }, hats: [[['hat', E8]], [['ride', E8, 3]], [['shaker', ALL16, 3], ['open', [14], 3]]]
  },
  trance: {
    bpm: [134, 142], chords: ['supersaw', 'pad'], leads: ['supersaw', 'pluck', 'lead'], arps: ['pluck', 'supersaw'], arp16: true, bass: ['bass', 'acid'], comp: 'gate16', line: 'roll16',
    minor: 0.85, progs: { minor: [[0, 5, 2, 6], [0, 3, 5, 6], [5, 6, 0, 0], [0, 5, 3, 6]] }, ext: 0,
    kit: { kick: 'kick', boom: 'kick', sub: ['sub'], snare: ['clap'], tick: ['hat'] }
  },
  hardstyle: {
    bpm: [148, 156], chords: ['supersaw', 'pad', 'choir'], leads: ['supersaw', 'lead'], arps: ['supersaw', 'pluck'], bass: ['subbass'], comp: 'stab8', line: 'off8',
    minor: 0.9, modes: { minor: ['harm', 'minor'] }, ext: 0, mix: { drums: -10, hats: -5, bass: -4, pump: 0.2 },
    kit: { kick: 'hardkick', boom: 'hardkick', sub: ['sub'], snare: ['clap'], tick: ['hat'] }, hats: [[['open', OFF8]], [['hat', ALL16, 3]], [['crash', [0], 3], ['open', OFF8, 3]]]
  },
  chinese: {
    bpm: [70, 92], chords: ['piano', 'strings', 'guzheng', 'pad'], leads: ['erhu', 'flute', 'guzheng', 'piano'], arps: ['guzheng', 'harp', 'piano'], bass: ['bass', 'subbass'], comp: 'pulse', line: 'long',
    minor: 0.3, tune: 'penta', mix: { keys: 5, bass: 3, drums: -3 }, progs: { major: [[3, 4, 2, 5], [0, 4, 5, 2], [5, 3, 4, 0], [0, 4, 5, 3]], minor: [[0, 5, 6, 2], [0, 5, 3, 4]] }, ext: 0.2,
    kit: { kick: 'kick', boom: 'tom', sub: ['kick', 'gong'], snare: ['snare', 'rim'], tick: ['perc', 'hat'] }, hats: [[['hat', [0, 4, 8, 12]], ['perc', [14], 3]], [['hat', E8, 3]], [['shaker', E8, 3], ['perc', [6], 3]]]
  },
  blues: {
    bpm: [68, 96], chords: ['organ', 'piano', 'guitar'], leads: ['harmonica', 'guitar', 'sax', 'organ'], arps: ['piano', 'guitar'], bass: ['bass', 'upright'], comp: 'charleston', line: 'walk',
    minor: 0.15, modes: { major: ['mixo'], minor: ['dorian'] }, tune: 'blues', progs: { major: [[0, 3, 0, 0], [0, 3, 0, 4], [3, 3, 0, 0], [0, 3, 4, 3]], minor: [[0, 3, 0, 4], [0, 3, 0, 0]] }, ext: 1,
    kit: { ...ACOUSTIC, snare: ['rsnare', 'snare'], tick: ['hat', 'ride'] }, hats: [[['hat', E8]], [['ride', [0, 4, 6, 8, 12, 14]]], [['hat', [4, 12], 3], ['ride', E8, 3]]]
  },
  country: {
    bpm: [96, 124], chords: ['guitar', 'nylon', 'piano'], leads: ['banjo', 'harmonica', 'guitar'], arps: ['banjo', 'guitar'], bass: ['bass', 'upright'], comp: 'strum', line: 'boomchick',
    minor: 0.15, progs: { major: [[0, 3, 4, 0], [0, 0, 3, 4], [0, 4, 3, 0], [0, 3, 0, 4]] }, ext: 0,
    kit: { kick: 'kick', boom: 'kick', sub: ['kick', 'crash'], snare: ['brush', 'snare', 'rim'], tick: ['hat', 'tamb'] }, hats: [[['hat', E8]], [['tamb', [4, 12]], ['hat', E8, 3]], [['shaker', ALL16, 3]]]
  }
};
export const BAND_STYLES = Object.keys(BAND);
// Four chords, one a bar, as the scale's degrees (0 the home chord).
const PROGS = {
  minor: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [0, 3, 0, 4], [0, 5, 3, 4], [0, 2, 6, 3], [3, 4, 0, 0]],
  major: [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 3], [5, 3, 0, 4], [0, 3, 5, 4], [0, 1, 3, 4], [3, 0, 4, 5]]
};
// How the chords are played in a bar: [16th, length] pairs.
const COMP = {
  held: [[[0, 16]], [[0, 8], [8, 8]]],
  stab: [[[0, 3], [6, 3], [10, 4]], [[0, 2], [3, 2], [8, 3], [14, 2]]],
  stab8: [[[2, 2], [6, 2], [10, 2], [14, 2]], [[0, 3], [4, 3], [8, 3], [12, 3]]],
  skank: [[[4, 2], [12, 2]], [[4, 1], [6, 1], [12, 1], [14, 1]]],
  charleston: [[[0, 3], [6, 2]], [[2, 2], [6, 2], [12, 3]]],
  bossa: [[[0, 2], [3, 2], [6, 2], [10, 2], [12, 2]], [[0, 2], [3, 3], [8, 2], [10, 2], [14, 2]]],
  montuno: [[[0, 2], [3, 2], [6, 2], [8, 2], [11, 2], [14, 2]], [[2, 2], [4, 2], [7, 2], [10, 2], [12, 2], [15, 1]]],
  power: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]], [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]]],
  chug: [[[0, 1], [1, 1], [2, 1], [4, 2], [6, 1], [7, 1], [8, 1], [10, 2], [12, 1], [13, 1], [14, 2]], [[0, 1], [1, 1], [3, 1], [4, 1], [6, 2], [8, 1], [9, 1], [11, 1], [12, 1], [14, 2]]],
  pulse: [[[0, 4], [4, 4], [8, 4], [12, 4]], [[0, 8], [8, 8]]],
  gate16: [ALL16.map(s => [s, 1]), [[0, 1], [2, 1], [3, 1], [4, 1], [6, 1], [8, 1], [10, 1], [11, 1], [12, 1], [14, 1]]],
  strum: [[[0, 4], [6, 2], [8, 4], [14, 2]], [[0, 2], [4, 2], [6, 2], [10, 2], [12, 2], [14, 2]]],
  gospel: [[[0, 6], [6, 2], [8, 6], [14, 2]], [[0, 3], [3, 1], [4, 4], [10, 2], [12, 4]]]
};
// The bass's rhythm in a bar: [16th, length, the scale step above the chord's root (0 the root, 4 the fifth, 7 the octave)].
const LINES = {
  off8: [[[2, 2, 0], [6, 2, 0], [10, 2, 0], [14, 2, 0]], [[0, 2, 0], [2, 2, 7], [6, 2, 0], [10, 2, 0], [14, 2, 4]]],
  hop: [[[0, 5, 0], [7, 3, 0], [10, 5, 0]], [[0, 3, 0], [3, 4, 0], [10, 2, 4], [12, 4, 0]]],
  long: [[[0, 10, 0], [10, 6, 0]], [[0, 6, 0], [6, 4, 0], [11, 5, 4]]],
  dembow: [[[0, 3, 0], [3, 3, 0], [8, 3, 0], [11, 3, 4]], [[0, 6, 0], [6, 2, 0], [8, 6, 0]]],
  afro: [[[0, 3, 0], [3, 3, 0], [6, 4, 4], [12, 4, 0]], [[0, 4, 0], [6, 2, 0], [10, 2, 4], [12, 3, 0]]],
  funk: [[[0, 2, 0], [3, 1, 7], [6, 2, 0], [7, 1, 0], [10, 2, 4], [14, 2, 7]], [[0, 3, 0], [4, 1, 7], [6, 2, 0], [10, 1, 0], [11, 2, 4], [14, 1, 7]]],
  drop: [[[0, 3, 0], [6, 2, 4], [8, 4, 0], [14, 2, 7]], [[0, 4, 0], [8, 2, 0], [10, 2, 4], [12, 4, 0]]],
  walk: [[[0, 4, 0], [4, 4, 2], [8, 4, 4], [12, 4, 5]], [[0, 4, 0], [4, 4, 4], [8, 4, 6], [12, 4, 7]]],
  bossa: [[[0, 6, 0], [6, 2, 4], [8, 6, 4], [14, 2, 0]], [[0, 6, 0], [6, 2, 0], [8, 6, 4], [14, 2, 4]]],
  tumbao: [[[0, 6, 0], [6, 6, 0], [12, 4, 4]], [[0, 2, 0], [6, 6, 4], [12, 4, 0]]],
  rock8: [E8.map(s => [s, 2, 0]), [[0, 2, 0], [2, 2, 0], [4, 2, 0], [6, 2, 0], [8, 2, 0], [10, 2, 0], [12, 2, 4], [14, 2, 7]]],
  gallop: [[0, 4, 8, 12].flatMap(s => [[s, 1, 0], [s + 1, 1, 0], [s + 2, 2, 0]]), E8.map(s => [s, 2, 0])],
  disco: [E8.map((s, k) => [s, 2, k % 2 ? 7 : 0]), [[0, 1, 0], [2, 2, 7], [4, 1, 0], [6, 2, 7], [8, 1, 0], [10, 2, 7], [12, 1, 0], [14, 2, 4]]],
  boomchick: [[[0, 4, 0], [8, 4, 4]], [[0, 4, 0], [4, 4, 4], [8, 4, 0], [12, 4, 4]]],
  whole: [[[0, 16, 0]], [[0, 8, 0], [8, 8, 4]]],
  roll16: [[1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15].map(s => [s, 1, 0]), [[2, 2, 0], [6, 2, 0], [10, 2, 0], [14, 2, 0]]],
  cumbia: [[[0, 4, 0], [6, 2, 4], [8, 4, 4], [14, 2, 0]], [[0, 4, 0], [4, 4, 4], [8, 4, 0], [12, 2, 4], [14, 2, 4]]],
  kizomba: [[[0, 3, 0], [3, 3, 0], [6, 2, 4], [8, 6, 0], [14, 2, 4]], [[0, 6, 0], [6, 2, 0], [8, 3, 4], [11, 5, 0]]],
  bhangra: [[[0, 3, 0], [3, 3, 0], [6, 2, 7], [8, 3, 0], [11, 3, 0], [14, 2, 4]], [[0, 2, 0], [3, 2, 0], [6, 2, 4], [8, 2, 0], [11, 2, 0], [14, 2, 7]]],
  wobble: [[[0, 6, 0], [6, 2, 0], [8, 8, 0]], [[0, 3, 0], [3, 3, 7], [8, 8, 0]]],
  chip: [[[0, 2, 0], [2, 2, 7], [4, 2, 0], [6, 2, 7], [8, 2, 0], [10, 2, 7], [12, 2, 4], [14, 2, 7]], [[0, 2, 0], [4, 2, 0], [6, 2, 7], [8, 2, 0], [12, 2, 4], [14, 2, 4]]],
  samba: [[[0, 3, 0], [3, 1, 0], [4, 4, 4], [8, 3, 0], [11, 1, 0], [12, 4, 4]], [[0, 4, 0], [6, 2, 4], [8, 4, 0], [14, 2, 4]]]
};
// A melody's rhythm in a bar: the 16ths its notes start on.
const RHYTHMS = [[0, 3, 6, 8, 10, 12], [0, 2, 6, 8, 11, 14], [0, 4, 6, 10, 12], [0, 3, 4, 8, 11, 12, 14], [0, 6, 8, 14], [2, 4, 8, 10, 14], [0, 3, 6, 10]];
const CHILL7 = new Set(['hiphop', 'lofi', 'boombap', 'half', 'funk', 'garage', 'house', 'amapiano']);
// The instruments' octaves (their lowest C).
const LOW = {
  keys: 55, pluck: 60, lead: 67, pad: 55, bell: 72, organ: 55, strings: 55, brass: 55, guitar: 52, vox: 60, bass: 36, subbass: 28,
  piano: 55, rhodes: 55, clav: 55, vibes: 60, marimba: 60, kalimba: 67, musicbox: 72, glass: 72, steel: 60, harp: 55, nylon: 52, banjo: 55, guzheng: 60, sitar: 55,
  pizz: 55, erhu: 60, sax: 55, flute: 67, harmonica: 60, accordion: 55, choir: 55, supersaw: 55, chip: 67, tri: 36, bass808: 28, upright: 31, acid: 36, reese: 31, distgtr: 47, slap: 33
};
// The scales a key is played in: its 7 steps from the tonic.
const MODES = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11], phryg: [0, 1, 3, 5, 7, 8, 10] };
// The notes a tune keeps to (the pentatonic's five, the blues' six), from the tonic.
const TUNES = { penta: { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10] }, blues: { major: [0, 3, 5, 6, 7, 10], minor: [0, 3, 5, 6, 7, 10] } };

// What a song is made from: { seed, mood, style }. The style, its tempo, the
// key and everything else from the seed (the page rotates the style so two
// in a row differ, and may name it).
export function radioSpec(seed, mood = 'all', style = null) {
  const R = makeRng(seed ^ 0x2545f491);
  const styles = moodStyles(mood);
  const st = style && styles.includes(style) ? style : R.choice(styles);
  const band = BAND[st];
  const minor = R.random() < (band.minor ?? { chill: 0.6, hype: 0.85, groove: 0.5, classic: 0.6 }[mood] ?? 0.65);
  const sp = {
    seed, mood, style: st,
    bpm: R.int(band.bpm[0], band.bpm[1]),
    key: { tonic: R.int(0, 11), minor },
    prog: R.choice(PROGS[minor ? 'minor' : 'major']),
    chords: R.choice(band.chords), chords2: R.choice(band.chords), lead: R.choice(band.leads), lead2: R.choice(['pluck', 'bell', 'keys', 'guitar'].filter(x => x !== band.chords[0])), bass: R.choice(band.bass),
    snare: R.choice(['snare', 'clap', 'both']), tick: R.choice(['hat', 'shaker', 'rim']),
    sevenths: CHILL7.has(st) && R.random() < 0.7,
    seconds: R.uniform(60, 150)
  };
  // (The newer grooves' own choices, drawn after, so the first twenty's songs are as they were.)
  const mode = band.modes?.[minor ? 'minor' : 'major'];
  if (mode) sp.mode = R.choice(mode);
  const progs = band.progs?.[minor ? 'minor' : 'major'];
  if (progs) sp.prog = R.choice(progs);
  if (band.arps) sp.lead2 = R.choice(band.arps);
  if (band.ext != null) sp.sevenths = R.random() < band.ext;
  if (band.ninths && sp.sevenths) sp.ninths = R.random() < band.ninths;
  if (band.kit) sp.kit = { kick: band.kit.kick || 'kick', boom: band.kit.boom || 'sub', sub: band.kit.sub || ['sub'], snare: R.choice(band.kit.snare || ['snare', 'clap']), tick: R.choice(band.kit.tick || ['hat']) };
  if (sp.kit) Object.assign(sp, { snare: sp.kit.snare, tick: sp.kit.tick });
  if (band.tune) sp.tune = band.tune;
  if (SHUFFLE[st]) sp.shuffle = SHUFFLE[st];
  if (band.swing) sp.swing = band.swing;
  return sp;
}

// The scale's degree d (0 the tonic; 7 an octave up) as a MIDI note from `low`, in the song's mode.
function noteOf(sp, d, low) {
  const steps = MODES[sp.mode] || (sp.key.minor ? MODES.minor : MODES.major);
  const root = low + ((sp.key.tonic - (low % 12) + 12) % 12);
  return root + 12 * Math.floor(d / 7) + steps[((d % 7) + 7) % 7];
}
// A tune's note kept to its scale (pentatonic, blues): the nearest of its notes, lower on a tie.
function tuned(sp, m) {
  const set = TUNES[sp.tune]?.[sp.key.minor ? 'minor' : 'major'];
  if (!set) return m;
  for (const d of [0, -1, 1, -2, 2]) if (set.includes((((m + d - sp.key.tonic) % 12) + 12) % 12)) return m + d;
  return m;
}
const notesClip = (inst, sp, notes, bars = 4) => ({ kind: 'notes', inst, bars, swing: sp.swing || 0, ...(sp.shuffle ? { shuffle: sp.shuffle } : {}), key: sp.key, notes });
// The chords, one a bar, in close position (each tone the nearest above the
// instrument's low C: they lead into each other); a distorted guitar plays
// power chords (the root, fifth and octave).
function chordClip(sp, inst, comp) {
  const notes = [];
  const shape = inst === 'distgtr' ? [0, 4, 7] : [0, 2, 4, ...(sp.sevenths ? [6] : []), ...(sp.ninths ? [8] : [])];
  sp.prog.forEach((deg, bar) => {
    const tones = shape.map(x => noteOf(sp, deg + x, LOW[inst]));
    const voiced = inst === 'distgtr' ? tones : tones.map(m => LOW[inst] + 3 + ((((m - LOW[inst] - 3) % 12) + 12) % 12));
    for (const [step, len] of comp) for (const midi of voiced) notes.push({ step: bar * 16 + step, midi, len, lv: 3 });
  });
  return notesClip(inst, sp, notes);
}
// A melody on the chords: each bar from a chord tone, stepping or leaping
// to the next; bars one and three alike (the call), the last bar home.
function melodyClip(R, sp, inst, rhythmA, rhythmB) {
  const notes = [];
  let first = null;
  for (let bar = 0; bar < 4; bar++) {
    const deg = sp.prog[bar];
    const rhythm = bar % 2 ? rhythmB : rhythmA;
    const tones = [deg, deg + 2, deg + 4];
    let line;
    if (bar === 2) line = first.map(d => d - sp.prog[0] + deg);
    else {
      line = [];
      let at = R.choice(tones);
      for (let k = 0; k < rhythm.length; k++) {
        if (k) at = R.random() < 0.6 ? at + R.choice([-1, 1, -2, 2]) : R.choice(tones) + (R.random() < 0.3 ? 7 : 0);
        line.push(Math.max(-2, Math.min(9, at)));
      }
      if (bar === 3) line[line.length - 1] = deg;
      if (bar === 0) first = line;
    }
    rhythm.forEach((step, k) => {
      const next = rhythm[k + 1] ?? 16;
      notes.push({ step: bar * 16 + step, midi: tuned(sp, noteOf(sp, line[k], LOW[inst])), len: Math.max(1, Math.min(4, next - step)), ...(k === 0 ? { lv: 2 } : {}) });
    });
  }
  return notesClip(inst, sp, notes);
}
// The chord's tones up and down, in eighths or sixteenths (or always sixteenths: trance, 8-bit, an ostinato).
function arpClip(R, sp, inst) {
  const fast = sp.bpm < 110;
  const shape = R.choice([[0, 2, 4, 2], [0, 2, 4, 7], [0, 4, 2, 4], [7, 4, 2, 0]]);
  const step = BAND[sp.style].arp16 ? 1 : fast ? 2 : 4;
  const notes = [];
  sp.prog.forEach((deg, bar) => {
    for (let s = 0, k = 0; s < 16; s += step, k++) notes.push({ step: bar * 16 + s, midi: tuned(sp, noteOf(sp, deg + shape[k % shape.length], LOW[inst])), len: step, lv: k % 2 ? 3 : 1 });
  });
  return notesClip(inst, sp, notes);
}
function bassClip(sp, inst, line) {
  const notes = [];
  sp.prog.forEach((deg, bar) => {
    for (const [step, len, tone] of line) notes.push({ step: bar * 16 + step, midi: noteOf(sp, deg + tone, LOW[inst]), len });
  });
  return notesClip(inst, sp, notes);
}
// A bar of hats (or a shaker, a ride, a bell), swung as the song is.
function hatClip(lanes, sp = {}) {
  const c = emptyDrums(1);
  if (sp.shuffle) c.shuffle = sp.shuffle;
  for (const [d, steps, lv = 1] of lanes) for (const s of steps) c.steps[d][s] = lv;
  return c;
}
const sum = (...xs) => {
  const n = Math.max(...xs.map(x => x.L.length));
  const L = new Float32Array(n);
  for (const x of xs) for (let i = 0; i < x.L.length; i++) L[i] += x.L[i] * (x.g ?? 1);
  return { L, R: L };
};
const shot = (inst, sr, midi) => {
  const x = voice(inst, midi, sr);
  return { L: x, R: x };
};

// The song's band as pieces and their roles: [{ L, R }], [role].
export function radioKit(sp, sr = RADIO_SR) {
  const R = makeRng(sp.seed ^ 0x68e31da4);
  const band = BAND[sp.style];
  const clip = c => renderClip(c, sr, sp.bpm);
  const comp = COMP[band.comp];
  const rhythms = band.rhythms || RHYTHMS;
  const [ra, rb, rc] = [R.choice(rhythms), R.choice(rhythms), R.choice(rhythms)];
  // A soft held pad under every riff that does not hold its own chords (an off-beat stab, a pulse): no bar of a riff is ever empty.
  const bed = clip(chordClip(sp, 'pad', COMP.held[0]));
  const under = x => (band.comp === 'held' ? x : sum(x, { ...bed, g: 0.3 }));
  const chords = under(clip(chordClip(sp, sp.chords, comp[0])));
  const chords2 = under(clip(chordClip(sp, sp.chords2, comp[1])));
  const melody = clip(melodyClip(R, sp, sp.lead, ra, rb));
  const melody2 = clip(melodyClip(R, sp, sp.lead, rc, ra));
  const arp = clip(arpClip(R, sp, sp.lead2));
  const pieces = [];
  const roles = [];
  const add = (p, role) => (pieces.push(p), roles.push(role));
  // The riffs: each set of chords with the arpeggio, and with each melody (none thin, so no intro sounds empty).
  add(sum(chords, { ...arp, g: 0.6 }), 'riff');
  add(sum(chords2, { ...arp, g: 0.8 }), 'riff');
  add(sum(chords2, melody), 'riff');
  add(sum(chords, { ...melody2, g: 0.9 }), 'riff');
  // The phrases (breaks, intros): a melody, the arpeggio, each over a soft held pad (so a break's rests never fall silent).
  add(sum(melody, { ...bed, g: 0.4 }), 'phrase');
  add(sum(arp, { ...bed, g: 0.4 }), 'phrase');
  for (const line of LINES[band.line]) add(clip(bassClip(sp, sp.bass, line)), 'bass');
  // The hats: eighths, sixteenths with accents, off-beat open hats (or the groove's own).
  for (const lanes of band.hats || HATS) add(clip(hatClip(lanes, sp)), 'hat');
  // The drums: the kit's (a kick, the heavy one with an 808 or a boom under it, the 808 or a last big hit), the snare, the tick.
  const k = sp.kit;
  const tonic808 = 28 + ((sp.key.tonic - 4 + 12) % 12);
  const kick = k?.kick || 'kick';
  add(shot(kick, sr), 'kick');
  add(sum(shot(kick, sr), { ...shot(k?.boom || 'sub', sr, tonic808), g: 0.5 }), 'kick');
  add(k ? sum(...k.sub.map((v, j) => ({ ...shot(v, sr, tonic808), g: j ? 0.6 : 1 }))) : shot('sub', sr, tonic808), 'sub');
  add(sp.snare === 'both' ? sum(shot('snare', sr), { ...shot('clap', sr), g: 0.7 }) : shot(sp.snare, sr), 'snare');
  add(shot(sp.tick, sr), 'tick');
  const snare = k ? sp.snare : 'snare';
  const roll = emptyDrums(1);
  for (const s of [0, 1, 2, 3]) roll.steps[snare][s] = 3;
  const rolled = clip(roll).L.subarray(0, Math.round((60 / sp.bpm) * sr));
  add({ L: rolled, R: rolled }, 'roll');
  const fill = hatClip([['tom', [0, 3, 6]], [snare, [8, 10, 12, 13, 14, 15]], [kick, [0]], ['crash', [0], 3]]);
  add(clip(fill), 'fill');
  return { pieces, roles };
}

// Its sections, every one four or eight bars (so the four-bar loops stay on
// their chords): an intro, verse–hook pairs (pre-hooks maybe), a break or
// bridge, and an outro; about `seconds` long.
export function radioPlan(R, bpm, seconds = 90) {
  const bars = Math.max(24, Math.min(64, Math.round((seconds * bpm) / 240 / 4) * 4));
  const pre = R.random() < 0.5;
  const unit = pre ? 20 : 16;
  const pairs = Math.max(1, Math.floor((bars - 8) / unit));
  const body = [];
  for (let k = 0; k < pairs; k++) body.push(['verse', 8], ...(pre ? [['pre', 4]] : []), ['hook', 8]);
  let rest = bars - 8 - pairs * unit;
  const turn = [R.choice(['break', 'bridge']), 4];
  if (pairs === 1 && rest >= 12) body.push(turn, ['hook', 8]), (rest -= 12);
  else if (pairs > 1 && rest >= 4) body.splice(body.length - 1, 0, turn), (rest -= 4);
  while (rest >= 8) body.push(['hook', 8]), (rest -= 8);
  if (rest >= 4) body.splice(pre ? 3 : 2, 0, [turn[0] === 'break' ? 'bridge' : 'break', 4]);
  return [['intro', 4], ...body, ['outro', 4]];
}

// The mixer, a little different by mood.
const MIXES = {
  chill: { reverb: 0.35, delay: 0.25, pump: 0.2 },
  hype: { reverb: 0.18, delay: 0.15, pump: 0.4 },
  groove: { reverb: 0.22, delay: 0.2, pump: 0.45 },
  classic: { reverb: 0.2, delay: 0.12, pump: 0.25 },
  pop: { reverb: 0.22, delay: 0.18, pump: 0.35 },
  jazz: { reverb: 0.3, delay: 0.1, pump: 0.1 },
  world: { reverb: 0.24, delay: 0.16, pump: 0.25 }
};

// One song. -> { audio, info } (info: makeSong's, and the spec's key, mood and plan)
export function radioSong({ seed, mood = 'all', style = null }, sr = RADIO_SR) {
  const sp = radioSpec(seed, mood, style);
  const { pieces, roles } = radioKit(sp, sr);
  const analysis = analyzeRecording(pieces, sr, { bpm: sp.bpm });
  const R = makeRng(seed ^ 0x1b873593);
  const plan = radioPlan(R, sp.bpm, sp.seconds);
  const song = makeSong(pieces, sr, seed, {
    analysis, roles, bpm: sp.bpm, styles: moodStyles(mood), style: sp.style,
    humanize: (MOODS[mood]?.humanize ?? 100) / 100, plan, mix: mixOf({ ...MIXES[mood], ...BAND[sp.style].mix })
  });
  return { audio: song.audio, info: { ...song.info, key: sp.key, mood, radio: { seed, mood, style: sp.style } } };
}

// Where the song is cut for the next one to come in: just before its last
// hit (the downbeat after the outro). -> samples
export const cutOf = (info, sr) => Math.max(1, Math.round(((info.bars * 4 * 60) / info.bpm - 0.06) * sr));

// One stretch of the radio: the song from its start to its cut, its first
// moments under the last song's ring (`tail`, what came after that one's
// cut), the song rising in over them. The ring passes untouched; a peak the
// two make together is eased under full scale. -> { L, R, tail }
export function segment(audio, cut, tail = null) {
  const sr = audio.sr;
  const n = Math.min(cut, audio.L.length);
  const L = audio.L.slice(0, n);
  const R = audio.R === audio.L ? L.slice() : audio.R.slice(0, n);
  if (tail) {
    const m = Math.min(n, tail.L.length);
    const rise = Math.max(1, Math.min(m, Math.round(1.2 * sr)));
    for (let j = 0; j < m; j++) {
      const g = j < rise ? Math.sin((j / rise) * (Math.PI / 2)) : 1;
      L[j] = soft(L[j] * g + tail.L[j]);
      R[j] = soft(R[j] * g + tail.R[j]);
    }
  }
  const end = audio.L.length;
  return { L, R, tail: { L: audio.L.slice(n, end), R: audio.R.slice(n, end) } };
}
// Under 0.9 as it was; above, bent smoothly towards 1.
const soft = x => (Math.abs(x) <= 0.9 ? x : Math.sign(x) * (0.9 + 0.1 * Math.tanh((Math.abs(x) - 0.9) / 0.1)));

// Where the radio can wait for the next song without stopping: back from the
// outro's start to the last hook's (both bar lines). -> { from, to } in seconds
export function holdOf(info) {
  const bar = (60 * 4) / info.bpm;
  let at = 0;
  let hook = null;
  let outro = null;
  for (const [t, n] of info.plan) {
    if (t === 'hook') hook = at;
    if (t === 'outro') outro = at;
    at += n;
  }
  return hook == null || outro == null ? null : { from: hook * bar, to: outro * bar };
}

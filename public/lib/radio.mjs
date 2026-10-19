// 聽 (the radio): endless songs out of nothing, on the app's own instruments
// (lib/synth.mjs), no kit, no clips, no setup. Each song is its own band:
// a groove from the mood, its tempo, a key (and its mode), a four-chord
// progression, and instruments, drums and hats that suit the groove; written
// as phrases (tunes of eight bars, a question and an answer, as pairs of four-bar
// pieces: chords, an arpeggio, bass lines, hats; a bridge of its own), then arranged
// and mixed by the engine like any kit's song, in sections of four or eight bars
// so every piece stays on its chord. A song runs about two and a half minutes. Songs
// follow each other with no gap: each one is cut just before its last hit,
// and that hit's ring is played under the next one's intro (`segment`). Each
// next song is picked to differ from the last ones (`radioPick`): another
// kind of groove, another tempo, key and mode, other instruments, another
// form. No DOM: the worker makes them (lib/make.mjs), the tests listen to them.

import { withKit, STYLE_KIT, SAMPLED } from './samples.mjs';
import { makeSong, makeRng, analyzeRecording, dressOf, STYLES, FAMILY, SHUFFLE } from '../engine.mjs';
import { voice, renderClip, emptyDrums } from './synth.mjs';
import { noted } from './game.mjs';
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

// A station: { mood?, styles?, bpm?: [lo, hi] } narrows the grooves to those in the mood, among
// `styles`, and whose tempo range reaches [lo, hi]. Never empty: with none left, the styles asked for, else the mood's.
export function stationStyles(st = {}) {
  const base = st.mood ? moodStyles(st.mood) : STYLES;
  const want = Array.isArray(st.styles) ? st.styles.filter(x => STYLES.includes(x)) : null;
  let list = want ? base.filter(x => want.includes(x)) : base;
  if (!list.length && want?.length) list = want;
  if (Array.isArray(st.bpm)) {
    const [lo, hi] = st.bpm;
    const tempo = list.filter(x => BAND[x].bpm[1] >= lo && BAND[x].bpm[0] <= hi);
    if (tempo.length) list = tempo;
  }
  return list.length ? list : base;
}

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
// What a song is remembered by, so the next ones can steer clear of it: the verse's chord loop and the hook's (a loop and its turns are one family), the key, the lead and chord instruments, the form, the tempo and the drums' touches.
const marks = sp => ({ fam: progFamily(sp.prog), famB: sp.progB ? progFamily(sp.progB) : null, tonic: sp.key.tonic, lead: sp.lead, chords: sp.chords, chords2: sp.chords2, form: planSig(sp), bpm: sp.bpm, dress: sp.dress.id });
export const MEMORY = 8;
// How much `sp` repeats of the last songs (`mem`: their marks, oldest first): what is near counts the most. 0 is a song with nothing in common.
function clash(sp, mem) {
  const m = marks(sp);
  let c = 0;
  for (let d = 0; d < mem.length; d++) {
    const o = mem[mem.length - 1 - d];
    const w = d === 0 ? 4 : d < 3 ? 2 : 1;
    if (m.fam === o.fam) c += 4 * w;
    if (m.famB && (m.famB === o.famB || m.famB === o.fam)) c += 2 * w;
    if (d < 6 && m.tonic === o.tonic) c += 2 * w;
    if (d < 4 && m.lead === o.lead) c += 2 * w;
    // (The chord instrument is what a song sounds like underneath: none of the last eight, either of the pair, repeats it without a cost.)
    if (m.chords === o.chords) c += 2 * w + 1;
    else if (m.chords === o.chords2 || m.chords2 === o.chords) c += w + 1;
    if (d < 6 && m.form === o.form) c += 0.4 * w;   // (Forms are fewer than they were, so the same one comes round oftener: it counts less.)
    if (d < 3 && Math.abs(m.bpm - o.bpm) < 6) c += w;
    if (m.dress === o.dress) c += 2 * w;
  }
  return c;
}
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
// and repeats nothing of the last eight (their chord loops, keys, leads, forms,
// tempos and drum touches), else the one that does best. One groove asked for (`style:<id>`): always it.
export function radioPick(mood, recent = [], seed = Math.floor(Math.random() * 1e9), station = null) {
  const styles = station ? stationStyles({ mood, ...station }) : moodStyles(mood);
  // (A tempo station: a seed whose song falls in its range.)
  const fits = station?.bpm ? (s, st) => { const b = radioSpec(s, outMood, st).bpm; return b >= station.bpm[0] && b <= station.bpm[1]; } : () => true;
  const outMood = MOODS[mood] || /^style:/.test(mood) ? mood : 'all';
  const R = makeRng(seed);
  const past = recent.map(x => (typeof x === 'string' ? x : x?.style)).filter(Boolean);
  const prev = recent.length && typeof recent.at(-1) === 'object' && Number.isInteger(recent.at(-1).seed) ? recent.at(-1) : null;
  const specOf = x => radioSpec(x.seed, MOODS[x.mood] || /^style:/.test(x.mood) ? x.mood : 'all', x.style);
  const was = prev && STYLES.includes(prev.style) ? specOf(prev) : null;
  // (The last eight, as far as they are known by their seeds.)
  const mem = recent.slice(-MEMORY).filter(x => typeof x === 'object' && Number.isInteger(x?.seed) && STYLES.includes(x.style)).map(x => marks(specOf(x)));
  const lastBpms = mem.slice(-3).map(x => x.bpm);
  const last = past.at(-1);
  const keep = (pool, ok) => (pool.filter(ok).length ? pool.filter(ok) : pool);
  let pool = styles.filter(s => !past.slice(-Math.min(6, Math.max(1, styles.length - 5))).includes(s));
  if (!pool.length) pool = styles.filter(s => s !== last);
  if (!pool.length) pool = styles;
  if (last) pool = keep(pool, s => SOUND[s] !== SOUND[last] && !FAMILY[last]?.includes(s) && !FAMILY[s]?.includes(last));
  if (was) {
    const jumps = s => tempoJump(BAND[s].bpm[0], was.bpm) || tempoJump(BAND[s].bpm[1], was.bpm);
    // (No groove left that can jump from the last tempo: look again further back in the mood's grooves, the tempo first.)
    if (!pool.some(jumps)) pool = keep(keep(styles.filter(s => s !== last && !past.slice(-2).includes(s) && jumps(s)), s => !past.slice(-3).includes(s)), s => !FAMILY[last]?.includes(s) && !FAMILY[s]?.includes(last));
    pool = keep(pool, jumps);
  }
  // (A groove whose tempo is not where the last three were, when there is one.)
  pool = keep(pool, s => lastBpms.every(b => Math.abs((BAND[s].bpm[0] + BAND[s].bpm[1]) / 2 - b) >= 10));
  pool = keep(pool, s => !past.includes(s));
  const style = R.choice(pool);
  const out = s => ({ seed: s, mood: outMood, style });
  if (!was) {
    for (let k = 0; k < 60 && !fits(seed, style); k++) seed = R.int(0, 1e9 - 1);
    return out(seed);
  }
  let best = null;
  // (The tempo jump and a new key or mode count most: they are what a listener hears first.)
  for (let k = 0; k < 120; k++) {
    const s = k ? R.int(0, 1e9 - 1) : seed;
    if (!fits(s, style) && (best || k < 119)) continue;
    const sp = radioSpec(s, out(s).mood, style);
    const c = contrast(sp, was);
    const score = c.filter(Boolean).length + (c[0] ? 10 : 0) + (c[1] || c[2] ? 10 : 0) - clash(sp, mem);
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
const HATS = [
  [['hat', E8], ['hat', OFF8, 3]], [['hat', ALL16, 3], ['hat', [0, 4, 8, 12], 1]], [['open', OFF8], ['shaker', [1, 3, 5, 7, 9, 11, 13, 15], 3]],
  // (Three more, and a song keeps three of the six, drawn by its seed: `hatsPick`.)
  [['hat', [0, 3, 4, 7, 8, 11, 12, 15]], ['hat', OFF8, 3]], [['shaker', ALL16, 3], ['open', [6, 14]]], [['hat', [0, 2, 4, 6, 8, 10, 12, 13, 14, 15]], ['tamb', [2, 6, 10, 14], 3]]
];
// The drums the newer grooves play on (the first ones keep a kick, an 808 and the snare or clap and hat drawn): kick, the boom under the heavy kick, the hit on the last downbeat (the 808's place), the snares and ticks to choose from.
const ACOUSTIC = { kick: 'kick', boom: 'tom', sub: ['kick', 'crash'] };
const ROCK = { kick: 'rkick', boom: 'rkick', sub: ['rkick', 'crash'], snare: ['rsnare'] };

// Each groove: its tempo range, its instruments and how its chords and bass
// are played. The newer ones also: how often minor (`minor`), their modes,
// progressions, sevenths (`ext`) and ninths, a scale for the tunes (`tune`:
// pentatonic, blues), the melody's rhythms, an arpeggio's instruments
// (`arps`) and sixteenths (`arp16`), a 16th swing, their drums (`kit`) and hats.
const BAND = {
  four: { bpm: [118, 126], chords: ['pad', 'organ', 'keys', 'piano', 'rhodes', 'clav', 'brass'], leads: ['pluck', 'lead', 'bell', 'supersaw'], bass: ['bass'], comp: 'stab8', line: 'off8' },
  hiphop: { bpm: [84, 94], chords: ['keys', 'strings', 'organ', 'piano', 'rhodes', 'guitar', 'nylon', 'vibes'], leads: ['bell', 'pluck', 'vox', 'piano', 'flute'], bass: ['bass', 'subbass'], comp: 'held', line: 'hop' },
  trap: { bpm: [132, 148], chords: ['pad', 'strings', 'bell', 'choir', 'piano', 'harp', 'glass', 'keys'], leads: ['bell', 'pluck', 'vox', 'flute', 'glass'], bass: ['subbass', 'bass808'], comp: 'held', line: 'long' },
  half: { bpm: [70, 84], chords: ['strings', 'pad', 'keys', 'piano', 'rhodes', 'guitar', 'nylon', 'harp'], leads: ['bell', 'keys', 'guitar', 'kalimba'], bass: ['subbass', 'bass'], comp: 'held', line: 'long' },
  broken: { bpm: [120, 128], chords: ['pad', 'keys', 'rhodes', 'piano', 'clav', 'organ', 'guitar', 'strings'], leads: ['pluck', 'lead', 'vibes'], bass: ['bass'], comp: 'stab', line: 'hop' },
  house: { bpm: [120, 125], chords: ['organ', 'keys', 'pad', 'piano', 'rhodes', 'clav', 'brass', 'strings'], leads: ['pluck', 'vox', 'lead', 'piano'], bass: ['bass'], comp: 'stab8', line: 'off8' },
  dembow: { bpm: [90, 100], chords: ['pad', 'keys', 'guitar', 'nylon', 'rhodes', 'brass', 'organ'], leads: ['pluck', 'lead', 'bell', 'steel'], bass: ['subbass', 'bass'], comp: 'stab', line: 'dembow' },
  afro: { bpm: [100, 110], chords: ['keys', 'guitar', 'organ', 'rhodes', 'piano', 'nylon', 'clav', 'marimba'], leads: ['pluck', 'bell', 'guitar', 'kalimba', 'marimba'], bass: ['bass'], comp: 'stab', line: 'afro' },
  drill: { bpm: [138, 144], chords: ['strings', 'pad', 'bell', 'choir', 'piano', 'keys', 'harp', 'glass'], leads: ['bell', 'vox', 'strings', 'piano', 'pizz'], bass: ['subbass', 'bass808'], comp: 'held', line: 'long' },
  boombap: { bpm: [86, 94], chords: ['keys', 'organ', 'strings', 'piano', 'rhodes', 'clav', 'brass', 'guitar'], leads: ['keys', 'brass', 'guitar', 'sax'], bass: ['bass', 'upright'], comp: 'held', line: 'hop' },
  jersey: { bpm: [136, 144], chords: ['pad', 'organ', 'keys', 'piano', 'brass', 'supersaw'], leads: ['vox', 'pluck', 'lead'], bass: ['subbass', 'bass808'], comp: 'stab8', line: 'long' },
  amapiano: { bpm: [110, 114], chords: ['keys', 'organ', 'pad', 'rhodes', 'piano', 'strings', 'vibes', 'marimba'], leads: ['pluck', 'bell', 'keys', 'marimba', 'sax'], bass: ['subbass'], comp: 'stab', line: 'afro' },
  lofi: { bpm: [72, 84], chords: ['keys', 'guitar', 'strings', 'rhodes', 'piano', 'nylon', 'vibes', 'organ'], leads: ['keys', 'bell', 'guitar', 'vibes', 'kalimba'], bass: ['bass', 'upright'], comp: 'held', line: 'hop' },
  funk: { bpm: [100, 112], chords: ['organ', 'keys', 'brass', 'clav', 'guitar', 'rhodes', 'piano', 'strings'], leads: ['brass', 'lead', 'guitar', 'sax'], bass: ['bass', 'slap'], comp: 'stab', line: 'funk' },
  garage: { bpm: [128, 134], chords: ['organ', 'pad', 'keys', 'rhodes', 'piano', 'strings', 'brass', 'clav'], leads: ['vox', 'pluck'], bass: ['subbass', 'bass'], comp: 'stab8', line: 'off8' },
  dnb: { bpm: [168, 176], chords: ['pad', 'strings', 'rhodes', 'keys', 'piano', 'choir'], leads: ['pluck', 'bell', 'lead'], bass: ['subbass', 'bass', 'reese'], comp: 'held', line: 'long' },
  reggae: { bpm: [72, 84], chords: ['organ', 'guitar', 'keys', 'clav', 'piano', 'brass'], leads: ['keys', 'brass', 'guitar', 'harmonica'], bass: ['bass'], comp: 'skank', line: 'drop' },
  phonk: { bpm: [126, 138], chords: ['bell', 'pad', 'strings', 'keys', 'choir', 'organ', 'piano', 'glass'], leads: ['bell', 'lead', 'vox', 'glass'], bass: ['subbass', 'bass808'], comp: 'held', line: 'long' },
  baile: { bpm: [126, 132], chords: ['pad', 'organ', 'keys', 'brass', 'strings', 'piano'], leads: ['vox', 'lead', 'pluck'], bass: ['subbass'], comp: 'stab8', line: 'off8' },
  techno: { bpm: [124, 132], chords: ['pad', 'organ', 'strings', 'keys', 'supersaw', 'clav'], leads: ['lead', 'pluck', 'bell'], bass: ['bass', 'subbass', 'acid'], comp: 'stab8', line: 'off8' },
  jazz: {
    bpm: [112, 150], chords: ['piano', 'rhodes', 'vibes', 'organ', 'guitar', 'nylon', 'harp'], leads: ['sax', 'vibes', 'piano', 'flute'], arps: ['vibes', 'piano'], bass: ['upright'], comp: 'charleston', line: 'walk',
    minor: 0.3, modes: { minor: ['harm', 'dorian'] }, progs: { major: [[1, 4, 0, 0], [1, 4, 0, 5], [0, 5, 1, 4], [2, 5, 1, 4]], minor: [[1, 4, 0, 0], [0, 3, 1, 4]] }, ext: 1, ninths: 0.6,
    kit: { ...ACOUSTIC, snare: ['brush'], tick: ['ride'] }, hats: [[['ride', [0, 4, 6, 8, 12, 14]], ['hat', [4, 12], 3]], [['ride', [0, 4, 8, 12], 3], ['hat', [4, 12], 3]], [['brush', E8, 3]]]
  },
  bossa: {
    bpm: [64, 76], chords: ['nylon', 'rhodes', 'piano', 'guitar', 'vibes', 'harp'], leads: ['flute', 'sax', 'vibes', 'nylon'], arps: ['nylon', 'vibes'], bass: ['upright', 'bass'], comp: 'bossa', line: 'bossa',
    minor: 0.35, modes: { minor: ['dorian'] }, progs: { major: [[1, 4, 0, 0], [0, 0, 1, 4], [0, 5, 1, 4], [3, 2, 1, 0]], minor: [[0, 3, 1, 4], [0, 5, 1, 4]] }, ext: 1, ninths: 0.5,
    kit: { ...ACOUSTIC, sub: ['kick', 'ride'], snare: ['rim', 'clave'], tick: ['shaker'] }, hats: [[['shaker', ALL16, 3], ['shaker', [0, 4, 8, 12]]], [['hat', E8, 3]], [['clave', [0, 3, 6, 10, 12], 3]]]
  },
  samba: {
    bpm: [96, 108], chords: ['nylon', 'guitar', 'brass', 'piano', 'accordion', 'banjo'], leads: ['flute', 'brass', 'steel', 'sax'], arps: ['nylon', 'pluck'], bass: ['bass', 'upright'], comp: 'montuno', line: 'samba',
    minor: 0.3, progs: { major: [[0, 5, 1, 4], [0, 3, 4, 0], [0, 1, 4, 0]] }, ext: 0.7,
    kit: { kick: 'kick', boom: 'dhol', sub: ['dhol', 'crash'], snare: ['timbale', 'rim'], tick: ['shaker', 'tamb'] }, hats: [[['shaker', ALL16, 3], ['shaker', [3, 7, 11, 15]]], [['tamb', [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15], 3]], [['agogo', [0, 2, 5, 7, 10, 12]]]]
  },
  salsa: {
    bpm: [90, 102], chords: ['piano', 'brass', 'guitar', 'organ', 'vibes', 'clav'], leads: ['brass', 'sax', 'flute', 'piano'], arps: ['piano', 'vibes'], bass: ['upright', 'bass'], comp: 'montuno', line: 'tumbao',
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
    bpm: [100, 118], chords: ['rhodes', 'piano', 'strings', 'keys', 'guitar', 'brass', 'clav'], leads: ['sax', 'lead', 'brass', 'vibes', 'supersaw'], arps: ['rhodes', 'glass', 'pluck'], bass: ['slap', 'bass'], comp: 'stab', line: 'disco',
    minor: 0.35, modes: { minor: ['dorian'] }, progs: { major: [[3, 4, 2, 5], [3, 4, 0, 5], [1, 4, 0, 5], [5, 3, 4, 0]], minor: [[0, 3, 1, 4], [5, 3, 4, 0]] }, ext: 1, ninths: 0.4,
    kit: { kick: 'kick', boom: 'kick', sub: ['kick', 'crash'], snare: ['snare', 'clap'], tick: ['hat'] }, hats: [[['hat', ALL16, 3], ['hat', E8]], [['hat', E8], ['open', [14], 3]], [['tamb', [4, 12]], ['shaker', ALL16, 3]]]
  },
  kpop: {
    bpm: [116, 128], chords: ['supersaw', 'piano', 'pad', 'keys', 'strings', 'guitar', 'rhodes'], leads: ['supersaw', 'vox', 'pluck', 'lead', 'bell'], arps: ['pluck', 'bell'], bass: ['bass808', 'subbass', 'bass'], comp: 'stab8', line: 'off8',
    minor: 0.6, progs: { major: [[5, 3, 0, 4], [3, 4, 2, 5], [0, 4, 5, 3]] }, ext: 0.3
  },
  synthwave: {
    bpm: [84, 110], chords: ['supersaw', 'pad', 'strings', 'keys', 'organ', 'choir'], leads: ['lead', 'chip', 'supersaw', 'sax'], arps: ['pluck', 'supersaw', 'chip'], arp16: true, bass: ['bass', 'acid'], comp: 'pulse', line: 'rock8',
    minor: 0.85, progs: { minor: [[0, 5, 6, 4], [0, 5, 2, 6], [0, 3, 5, 6], [5, 6, 0, 0]] }, ext: 0.2,
    kit: { kick: 'kick', boom: 'kick', sub: ['kick', 'crash'], snare: ['rsnare', 'clap'], tick: ['hat'] }, hats: [[['hat', OFF8]], [['hat', E8, 3], ['hat', OFF8]], [['open', OFF8, 3], ['tamb', [4, 12], 3]]]
  },
  disco: {
    bpm: [114, 124], chords: ['strings', 'clav', 'piano', 'guitar', 'rhodes', 'brass', 'organ'], leads: ['strings', 'brass', 'vox', 'piano'], arps: ['clav', 'guitar', 'strings'], bass: ['slap', 'bass'], comp: 'stab8', line: 'disco',
    minor: 0.5, modes: { minor: ['dorian'] }, progs: { minor: [[0, 3, 0, 3], [0, 5, 3, 4], [0, 3, 6, 4]], major: [[0, 3, 4, 3], [1, 4, 0, 5]] }, ext: 0.7,
    kit: { kick: 'kick', boom: 'kick', sub: ['kick', 'crash'], snare: ['snare', 'clap'], tick: ['hat'] }, hats: [[['open', OFF8], ['hat', [0, 4, 8, 12], 3]], [['hat', ALL16, 3], ['open', OFF8]], [['tamb', [4, 12]], ['shaker', E8, 3]]]
  },
  gospel: {
    bpm: [68, 84], chords: ['organ', 'piano', 'choir', 'rhodes', 'strings', 'brass'], leads: ['choir', 'piano', 'organ', 'vox'], arps: ['piano', 'organ'], bass: ['bass', 'upright'], comp: 'gospel', line: 'walk',
    minor: 0.25, progs: { major: [[3, 4, 2, 5], [0, 3, 4, 0], [0, 2, 3, 4], [5, 1, 4, 0]] }, ext: 1, ninths: 0.5,
    kit: { kick: 'kick', boom: 'kick', sub: ['kick', 'crash'], snare: ['rsnare', 'clap'], tick: ['hat', 'tamb'] }, hats: [[['hat', E8], ['tamb', [4, 12], 3]], [['ride', [0, 4, 6, 8, 12, 14], 3]], [['tamb', E8, 3]]]
  },
  neosoul: {
    bpm: [70, 90], chords: ['rhodes', 'keys', 'choir', 'piano', 'guitar', 'organ', 'vibes'], leads: ['vox', 'rhodes', 'sax', 'guitar', 'flute'], arps: ['rhodes', 'vibes', 'guitar'], bass: ['subbass', 'bass', 'upright'], comp: 'held', line: 'hop',
    minor: 0.75, modes: { minor: ['dorian', 'minor'] }, progs: { minor: [[0, 3, 0, 3], [0, 5, 3, 4], [3, 2, 1, 0]], major: [[3, 2, 1, 0], [1, 4, 0, 5], [3, 4, 2, 5]] }, ext: 1, ninths: 0.7, swing: 0.25,
    kit: { kick: 'kick', boom: 'kick', sub: ['sub'], snare: ['snare', 'rim'], tick: ['hat', 'shaker'] }
  },
  ballad: {
    bpm: [62, 76], chords: ['piano', 'strings', 'harp', 'nylon', 'rhodes', 'pad', 'guitar'], leads: ['piano', 'strings', 'flute', 'vox'], arps: ['piano', 'harp', 'musicbox'], bass: ['bass', 'upright'], comp: 'pulse', line: 'whole',
    minor: 0.3, progs: { major: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 0, 0], [0, 4, 5, 2]] }, ext: 0.4,
    kit: { ...ACOUSTIC, snare: ['rim', 'snare'], tick: ['hat', 'shaker'] }, hats: [[['hat', [0, 4, 8, 12]]], [['hat', E8, 3]], [['shaker', E8, 3]]]
  },
  ambient: {
    bpm: [60, 78], chords: ['pad', 'choir', 'strings', 'glass', 'harp', 'rhodes', 'vibes'], leads: ['glass', 'kalimba', 'musicbox', 'flute', 'vibes'], arps: ['kalimba', 'glass', 'harp', 'musicbox'], bass: ['subbass'], comp: 'held', line: 'whole',
    minor: 0.5, modes: { major: ['major', 'mixo'], minor: ['dorian'] }, progs: { major: [[0, 3, 0, 3], [0, 5, 3, 0], [3, 0, 3, 0]], minor: [[0, 5, 0, 5], [0, 3, 0, 6]] }, ext: 0.8, ninths: 0.6,
    rhythms: [[0, 6, 10], [0, 8], [2, 8, 12], [0, 4, 10]],
    kit: { ...ACOUSTIC, sub: ['kick', 'gong'], snare: ['rim', 'snap'], tick: ['shaker'] }, hats: [[['shaker', [4, 12], 3]], [['shaker', OFF8, 3]], [['tamb', [4], 3]]]
  },
  cinematic: {
    bpm: [70, 92], chords: ['strings', 'choir', 'brass', 'piano', 'harp', 'pad'], leads: ['strings', 'brass', 'choir', 'piano', 'flute'], arps: ['pizz', 'harp', 'piano', 'strings'], arp16: true, bass: ['bass', 'subbass'], comp: 'pulse', line: 'whole',
    minor: 0.9, modes: { minor: ['harm', 'minor'] }, progs: { minor: [[0, 5, 2, 6], [0, 5, 3, 4], [0, 3, 5, 4], [0, 6, 5, 4]] }, ext: 0,
    kit: { kick: 'kick', boom: 'dhol', sub: ['dhol', 'gong'], snare: ['rsnare'], tick: ['shaker'] }, hats: [[['shaker', ALL16, 3]], [['tom', [0, 3, 6, 8, 11, 14]]], [['timbale', [0, 3, 6, 10, 12], 3]]]
  },
  chiptune: {
    bpm: [128, 160], chords: ['chip'], leads: ['chip'], arps: ['chip'], arp16: true, bass: ['tri'], comp: 'stab8', line: 'chip',
    minor: 0.45, progs: { major: [[0, 5, 3, 4], [0, 4, 5, 3], [3, 4, 0, 0]], minor: [[0, 5, 6, 0], [0, 6, 5, 6]] }, ext: 0,
    kit: { kick: 'chipk', boom: 'chipk', sub: ['chipk', 'chipn'], snare: ['chipn'], tick: ['chiph'] }, hats: [[['chiph', E8]], [['chiph', ALL16, 3], ['chiph', [0, 4, 8, 12]]], [['chipn', OFF8, 3]]]
  },
  kizomba: {
    bpm: [84, 96], chords: ['pad', 'rhodes', 'guitar', 'nylon', 'keys', 'piano'], leads: ['sax', 'guitar', 'pluck', 'vox'], arps: ['guitar', 'nylon'], bass: ['subbass', 'bass808'], comp: 'stab', line: 'kizomba',
    minor: 0.75, progs: { minor: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 5, 3, 4]] }, ext: 0.5,
    kit: { kick: 'kick', boom: 'kick', sub: ['sub'], snare: ['snare', 'clap'], tick: ['rim', 'shaker'] }, hats: [[['shaker', E8], ['rim', [2, 3, 10, 11], 3]], [['shaker', ALL16, 3]], [['open', [6, 14], 3]]]
  },
  highlife: {
    bpm: [108, 124], chords: ['guitar', 'organ', 'rhodes', 'piano', 'brass', 'marimba', 'nylon'], leads: ['guitar', 'brass', 'sax', 'marimba'], arps: ['guitar', 'nylon', 'marimba'], bass: ['bass'], comp: 'stab', line: 'afro',
    minor: 0.2, progs: { major: [[0, 3, 4, 0], [0, 4, 3, 4], [0, 3, 0, 4], [0, 5, 3, 4]] }, ext: 0.2,
    kit: { kick: 'kick', boom: 'conga', sub: ['kick', 'crash'], snare: ['rim', 'snare'], tick: ['agogo', 'cowbell', 'shaker'] }, hats: [[['agogo', [0, 2, 5, 7, 10, 13, 15]]], [['shaker', ALL16, 3]], [['conga', [6, 7, 14], 3]]]
  },
  cumbia: {
    bpm: [88, 100], chords: ['accordion', 'guitar', 'organ', 'piano', 'brass', 'nylon'], leads: ['accordion', 'flute', 'brass', 'sax'], arps: ['guitar', 'accordion'], bass: ['bass'], comp: 'stab8', line: 'cumbia',
    minor: 0.55, modes: { minor: ['harm'] }, progs: { minor: [[0, 3, 4, 0], [0, 4, 4, 0], [0, 6, 5, 4]], major: [[0, 4, 4, 0], [0, 3, 4, 0], [0, 3, 4, 4]] }, ext: 0,
    kit: { kick: 'kick', boom: 'conga', sub: ['kick', 'crash'], snare: ['conga'], tick: ['guiro'] }, hats: [[['guiro', [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15]]], [['shaker', E8, 3]], [['conga', [6, 14]], ['open', [2, 10], 3]]]
  },
  bhangra: {
    bpm: [92, 106], chords: ['accordion', 'pad', 'strings', 'guitar', 'organ', 'keys'], leads: ['sitar', 'flute', 'vox', 'lead'], arps: ['sitar', 'pluck'], bass: ['bass', 'subbass'], comp: 'stab', line: 'bhangra',
    minor: 0.3, modes: { major: ['mixo'], minor: ['dorian'] }, progs: { major: [[0, 6, 0, 6], [0, 6, 3, 0], [0, 0, 6, 4]], minor: [[0, 6, 5, 6], [0, 3, 6, 0]] }, ext: 0,
    kit: { kick: 'dhol', boom: 'dhol', sub: ['dhol', 'tamb'], snare: ['clap', 'tabla'], tick: ['tamb'] }, hats: [[['tamb', E8]], [['tabla', [0, 3, 6, 8, 11, 14], 3], ['tamb', [4, 12]]], [['shaker', ALL16, 3]]]
  },
  dubstep: {
    bpm: [138, 142], chords: ['pad', 'supersaw', 'choir', 'strings', 'keys', 'organ'], leads: ['lead', 'supersaw', 'bell', 'vox'], arps: ['pluck', 'bell'], bass: ['reese', 'acid', 'subbass'], comp: 'held', line: 'wobble',
    minor: 0.95, modes: { minor: ['phryg', 'minor'] }, progs: { minor: [[0, 0, 5, 6], [0, 1, 0, 1], [0, 5, 0, 6], [0, 3, 1, 0]] }, ext: 0,
    kit: { kick: 'kick', boom: 'kick', sub: ['sub'], snare: ['rsnare', 'snare'], tick: ['hat'] }
  },
  footwork: {
    bpm: [156, 164], chords: ['pad', 'rhodes', 'vox', 'piano', 'keys', 'strings', 'choir'], leads: ['vox', 'pluck', 'piano'], arps: ['pluck', 'rhodes'], bass: ['bass808', 'subbass'], comp: 'stab', line: 'long', minor: 0.7, ext: 0.4
  },
  jungle: {
    bpm: [160, 174], chords: ['pad', 'strings', 'rhodes', 'keys', 'piano', 'choir', 'organ'], leads: ['pluck', 'bell', 'vox', 'piano'], arps: ['pluck', 'rhodes', 'glass'], bass: ['reese', 'subbass'], comp: 'held', line: 'long',
    minor: 0.8, modes: { minor: ['dorian', 'minor'] }, ext: 0.5,
    kit: { kick: 'kick', boom: 'kick', sub: ['sub'], snare: ['rsnare', 'snare'], tick: ['hat', 'ride'] }, hats: [[['hat', E8]], [['ride', E8, 3]], [['shaker', ALL16, 3], ['open', [14], 3]]]
  },
  trance: {
    bpm: [134, 142], chords: ['supersaw', 'pad', 'piano', 'strings', 'keys'], leads: ['supersaw', 'pluck', 'lead'], arps: ['pluck', 'supersaw'], arp16: true, bass: ['bass', 'acid'], comp: 'gate16', line: 'roll16',
    minor: 0.85, progs: { minor: [[0, 5, 2, 6], [0, 3, 5, 6], [5, 6, 0, 0], [0, 5, 3, 6]] }, ext: 0,
    kit: { kick: 'kick', boom: 'kick', sub: ['sub'], snare: ['clap'], tick: ['hat'] }
  },
  hardstyle: {
    bpm: [148, 156], chords: ['supersaw', 'pad', 'choir', 'strings', 'piano'], leads: ['supersaw', 'lead'], arps: ['supersaw', 'pluck'], bass: ['subbass'], comp: 'stab8', line: 'off8',
    minor: 0.9, modes: { minor: ['harm', 'minor'] }, ext: 0, mix: { drums: -10, hats: -5, bass: -4, pump: 0.2 },
    kit: { kick: 'hardkick', boom: 'hardkick', sub: ['sub'], snare: ['clap'], tick: ['hat'] }, hats: [[['open', OFF8]], [['hat', ALL16, 3]], [['crash', [0], 3], ['open', OFF8, 3]]]
  },
  chinese: {
    bpm: [70, 92], chords: ['piano', 'strings', 'guzheng', 'pad', 'harp'], leads: ['erhu', 'flute', 'guzheng', 'piano'], arps: ['guzheng', 'harp', 'piano'], bass: ['bass', 'subbass'], comp: 'pulse', line: 'long',
    minor: 0.3, tune: 'penta', mix: { keys: 5, bass: 3, drums: -3 }, progs: { major: [[3, 4, 2, 5], [0, 4, 5, 2], [5, 3, 4, 0], [0, 4, 5, 3]], minor: [[0, 5, 6, 2], [0, 5, 3, 4]] }, ext: 0.2,
    kit: { kick: 'kick', boom: 'tom', sub: ['kick', 'gong'], snare: ['snare', 'rim'], tick: ['perc', 'hat'] }, hats: [[['hat', [0, 4, 8, 12]], ['perc', [14], 3]], [['hat', E8, 3]], [['shaker', E8, 3], ['perc', [6], 3]]]
  },
  blues: {
    bpm: [68, 96], chords: ['organ', 'piano', 'guitar', 'rhodes', 'clav'], leads: ['harmonica', 'guitar', 'sax', 'organ'], arps: ['piano', 'guitar'], bass: ['bass', 'upright'], comp: 'charleston', line: 'walk',
    minor: 0.15, modes: { major: ['mixo'], minor: ['dorian'] }, tune: 'blues', progs: { major: [[0, 3, 0, 0], [0, 3, 0, 4], [3, 3, 0, 0], [0, 3, 4, 3]], minor: [[0, 3, 0, 4], [0, 3, 0, 0]] }, ext: 1,
    kit: { ...ACOUSTIC, snare: ['rsnare', 'snare'], tick: ['hat', 'ride'] }, hats: [[['hat', E8]], [['ride', [0, 4, 6, 8, 12, 14]]], [['hat', [4, 12], 3], ['ride', E8, 3]]]
  },
  country: {
    bpm: [96, 124], chords: ['guitar', 'nylon', 'piano', 'banjo', 'organ'], leads: ['banjo', 'harmonica', 'guitar'], arps: ['banjo', 'guitar'], bass: ['bass', 'upright'], comp: 'strum', line: 'boomchick',
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
// More four-chord loops for a hook of its own (the verse keeps PROGS and a groove's own).
const EXTRA = {
  minor: [[0, 3, 5, 4], [0, 6, 5, 4], [0, 3, 6, 2], [0, 5, 6, 0], [5, 6, 0, 0], [0, 2, 6, 5], [0, 4, 5, 3], [0, 5, 3, 6], [2, 6, 3, 0], [0, 6, 3, 4]],
  major: [[0, 4, 5, 2], [0, 2, 3, 4], [1, 4, 0, 5], [0, 3, 1, 4], [0, 5, 1, 4], [0, 3, 0, 4], [5, 4, 3, 4], [0, 4, 3, 4], [3, 5, 0, 4], [0, 2, 5, 4], [5, 3, 4, 0], [3, 2, 5, 4]]
};
// A loop and its turns are one family (I-V-vi-IV is vi-IV-I-V round again).
export const progFamily = p => {
  let best = null;
  for (let i = 0; i < p.length; i++) {
    const r = [...p.slice(i), ...p.slice(0, i)].join('');
    if (best === null || r < best) best = r;
  }
  return best;
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
// The chord instruments that sustain a held chord by themselves; the plucked and struck ones get a soft pad under, so a long chord never dies away.
const HOLDS = new Set(['pad', 'strings', 'organ', 'choir', 'supersaw', 'accordion', 'brass']);
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
  let c1;
  const minor = R.random() < (band.minor ?? { chill: 0.6, hype: 0.85, groove: 0.5, classic: 0.6 }[mood] ?? 0.65);
  const sp = {
    seed, mood, style: st,
    bpm: R.int(band.bpm[0], band.bpm[1]),
    key: { tonic: R.int(0, 11), minor },
    prog: R.choice(PROGS[minor ? 'minor' : 'major']),
    chords: (c1 = R.choice(band.chords)), chords2: R.choice(band.chords.length > 1 ? band.chords.filter(x => x !== c1) : band.chords), lead: R.choice(band.leads), lead2: R.choice(['pluck', 'bell', 'keys', 'guitar'].filter(x => x !== band.chords[0])), bass: R.choice(band.bass),
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
  // (The variety's own choices, drawn after, from a stream of their own: the draws above are as they were, so a jam set stays itself.)
  // A hook of its own: another loop of chords (a family other than the verse's) and another lead; the last hook maybe lifted a step or two; the hats three of six; the drums' touches.
  const Q = makeRng(seed ^ 0x3c6ef372);
  const mode2 = minor ? 'minor' : 'major';
  const own = band.progs?.[mode2];
  const pool = (own && new Set(own.map(progFamily)).size > 1 ? own : [...PROGS[mode2], ...EXTRA[mode2]]).filter(x => progFamily(x) !== progFamily(sp.prog));
  sp.progB = pool.length && Q.random() < 0.85 ? Q.choice(pool) : null;
  const others = band.leads.filter(x => x !== sp.lead);
  sp.leadB = others.length && Q.random() < 0.85 ? Q.choice(others) : sp.lead;
  sp.lift = Q.random() < 0.6 ? Q.choice([2, 2, 1, 3, 5]) : 0;
  sp.hatsPick = Q.sample(HATS.length, 3).sort((a, b) => a - b);
  sp.dress = dressOf(Q);
  // The bridge's own (a third loop of chords, another lead, other chords) and the song's length, from a stream of their own, drawn last: nothing above moves.
  // Most songs are 2:30 to 3:30; one in five a short form of about 1:30 to 2:00.
  const U = makeRng(seed ^ 0x2f9be6cb);
  const taken = new Set([sp.prog, sp.progB].filter(Boolean).map(progFamily));
  const wide = [...PROGS[mode2], ...EXTRA[mode2]];
  const poolC = (own && new Set(own.map(progFamily)).size > 2 ? own : wide).filter(x => !taken.has(progFamily(x)));
  sp.progC = U.choice(poolC.length ? poolC : wide.filter(x => !taken.has(progFamily(x))));
  const leadsC = band.leads.filter(x => x !== sp.lead && x !== sp.leadB);
  sp.leadC = leadsC.length ? U.choice(leadsC) : sp.leadB;
  const chordsC = band.chords.filter(x => x !== sp.chords && x !== sp.chords2);
  sp.chordsC = chordsC.length ? U.choice(chordsC) : sp.chords2;
  sp.seconds = U.random() < 0.2 ? U.uniform(85, 115) : U.uniform(165, 225);
  // The arpeggio's instrument from the groove's own band (anything plucked or struck in it), not the same four for every groove; a stream of its own, drawn last.
  if (!band.arps) {
    const A = makeRng(seed ^ 0x510e527f);
    const fits = [...new Set([...band.chords, ...band.leads, 'pluck', 'bell', 'keys', 'guitar'])].filter(x => ARPY.has(x) && x !== sp.chords && x !== sp.chords2 && x !== sp.lead);
    if (fits.length) sp.lead2 = A.choice(fits);
  }
  // A band groove (rock, jazz, funk, city pop, lo-fi …) played by recorded instruments only: a synth voice drawn for it
  // gives way to one of the band's recorded ones (the same part's first, else any), from a stream of its own.
  if (bedFor(st) === 'strings') {
    const S = makeRng(seed ^ 0x1f83d9ab);
    const real = xs => xs.filter(x => SAMPLED[x]);
    const leads = real(band.leads), chords = real(band.chords), any = [...new Set([...leads, ...chords, ...real(band.arps || [])])];
    for (const [k, pool] of [['lead', leads], ['leadB', leads], ['leadC', leads], ['lead2', [...real(band.arps || []), ...chords.filter(x => ARPY.has(x))]], ['chords', chords], ['chords2', chords], ['chordsC', chords]])
      if (sp[k] && !SAMPLED[sp[k]]) {
        // (The chords' three apart, as they were drawn.)
        const taken = k.startsWith('chords') ? ['chords', 'chords2', 'chordsC'].filter(x => x !== k).map(x => sp[x]) : [];
        const fresh = pool.filter(x => !taken.includes(x)), rest = any.filter(x => !taken.includes(x));
        sp[k] = fresh.length ? S.choice(fresh) : rest.length ? S.choice(rest) : pool.length ? S.choice(pool) : sp[k];
      }
  }
  return sp;
}
// The soft held chords under a riff: a synth pad for the electronic grooves, recorded strings for a band's.
const bedFor = style => (STYLE_KIT[style] === 'acoustic' || STYLE_KIT[style] === 'lofi' ? 'strings' : 'pad');
// (What an arpeggio sounds right on: plucked or struck, so each note speaks at once.)
const ARPY = new Set(['pluck', 'bell', 'keys', 'guitar', 'piano', 'rhodes', 'vibes', 'marimba', 'kalimba', 'harp', 'nylon', 'glass', 'musicbox', 'clav', 'steel', 'banjo', 'guzheng', 'pizz', 'sitar', 'chip']);

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
const notesClip = (inst, sp, notes, bars = 4) => ({ kind: 'notes', inst, bars, swing: sp.swing || 0, ...(sp.shuffle ? { shuffle: sp.shuffle } : {}), key: sp.key, notes, feel: true });
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
  const c = { ...emptyDrums(1), feel: true };
  if (sp.shuffle) c.shuffle = sp.shuffle;
  for (const [d, steps, lv = 1] of lanes) for (const s of steps) c.steps[d][s] = lv;
  return c;
}
// Parts summed, each at its level `g` and, when it has one, its place `pan` (-1 left to 1 right; the middle as it was).
const sum = (...xs) => {
  const n = Math.max(...xs.map(x => x.L.length));
  const L = new Float32Array(n);
  const wide = xs.some(x => x.pan || x.R !== x.L);
  const R = wide ? new Float32Array(n) : L;
  for (const x of xs) {
    const g = x.g ?? 1, a = ((x.pan || 0) + 1) * (Math.PI / 4);
    const gl = wide ? g * Math.cos(a) * Math.SQRT2 : g, gr = g * Math.sin(a) * Math.SQRT2;
    for (let i = 0; i < x.L.length; i++) L[i] += x.L[i] * gl;
    if (wide) for (let i = 0; i < x.R.length; i++) R[i] += x.R[i] * gr;
  }
  return noted({ L, R }, { parts: xs });   // (its notes ride along for the game, lib/game.mjs)
};
const shot = (inst, sr, midi) => {
  const x = voice(inst, midi, sr);
  return { L: x, R: x };
};

// ---- A song's tunes, written out as phrases ----
//
// A song of the radio is not four-bar loops pasted again and again. Each part is
// eight bars: a question (four bars) and its answer (four more), played by the
// engine as two four-bar pieces one after the other. A tune opens its answer on
// its first bar's notes with the tail drawn again; no bar copies the bar two
// before it. The verse's second time, the hook's second time and the lifted last
// hook are each their own variant of the tune, the bridge has a loop of chords
// and a lead of its own. Every note carries its own level and a few ms of
// timing, so no two sound alike. Its streams are its own (`rngOf`), apart from the jam's.

// More bar rhythms for the tunes (the 16ths a bar's notes start on): the old seven, syncopations, pickups, rests on one, a few long notes.
const CELLS = [
  ...RHYTHMS,
  [0, 8], [0, 6, 8], [0, 10], [4, 8, 12], [2, 6, 10, 14], [0, 4, 8, 12], [0, 2, 4, 6, 8, 10, 12, 14],
  [0, 3, 6, 8, 12], [2, 4, 8, 10, 14], [0, 4, 7, 8, 12], [0, 2, 3, 6, 8], [0, 3, 8, 10], [0, 5, 8, 13],
  [1, 4, 8, 11, 14], [0, 4, 10, 12], [0, 7, 10], [4, 6, 10, 12], [2, 3, 6, 10], [0, 2, 6, 10, 12, 14],
  [0, 3, 6, 9, 12], [0, 1, 2, 4, 8, 12], [3, 6, 8, 11, 14], [0, 6, 8, 12, 14], [2, 8, 10, 14]
];
// The lengths a note may have, in 16ths (a note is kept to one of them, so the voices rendered stay few).
const NOTE_LENS = [1, 2, 3, 4, 6, 8, 12];
const lenOf = n => NOTE_LENS.filter(x => x <= n).at(-1) ?? 1;
const rngOf = (sp, k) => makeRng(((sp.seed ^ 0x6a09e667) + Math.imul(k + 1, 0x9e3779b1)) >>> 0);
// The lowest and highest scale degrees a lead plays (two octaves, kept below midi 96 and above midi 40).
function rangeOf(sp, inst) {
  let lo = -3, hi = 11;
  while (hi > 6 && noteOf(sp, hi, LOW[inst]) > 96) hi--;
  while (lo < -1 && noteOf(sp, lo, LOW[inst]) < 40) lo++;
  return [lo, hi];
}
// A song's chords turn mid-bar now and then: the bar's second half takes the chord a third above or below, or the fifth,
// which the bass's root still fits. Eight bars (the four chords twice); null where a bar keeps its chord.
function turns(K, comp, prog) {
  return Array.from({ length: 8 }, (_, i) => (K.random() < (i % 2 ? 0.32 : 0.1) && comp !== 'power' && comp !== 'chug' ? prog[i % 4] + K.choice([2, 4, -2]) : null));
}
// Each bar's chords as [{ at, deg }] (the 16th it starts on, and the scale degree of its root).
const slotsOf = (prog, turned) => turned.map((t, i) => [{ at: 0, deg: prog[i % 4] }, ...(t == null ? [] : [{ at: 8, deg: t }])]);
const chordAt = (slots, bar, step) => slots[bar].filter(x => x.at <= step).at(-1).deg;

// A chord's notes: close, drop-2 (the second from the top an octave down) or open (the root an octave down). A distorted guitar: root, fifth, octave.
function voicing(sp, inst, deg, kind) {
  if (inst === 'distgtr') return [0, 4, 7].map(x => noteOf(sp, deg + x, LOW[inst]));
  const shape = [0, 2, 4, ...(sp.sevenths ? [6] : []), ...(sp.ninths ? [8] : [])];
  const close = shape.map(x => LOW[inst] + 3 + ((((noteOf(sp, deg + x, LOW[inst]) - LOW[inst] - 3) % 12) + 12) % 12)).sort((a, b) => a - b);
  if (kind === 1 && close.length > 2) close[close.length - 2] -= 12;
  else if (kind === 2) close[0] -= 12;
  return close;
}
// Four bars of chords from bar `from` of the eight: each bar's comping pattern ([16th, length] pairs), its voicing, a level for every stab.
function chordNotes(sp, inst, slots, from, pats, kinds, D, shift = 0) {
  const notes = [];
  pats.forEach((pat, b) => {
    const sl = slots[from + b];
    const events = sl.length > 1 && !pat.some(([s]) => s >= 8) ? [...pat, [8, 8]] : pat;
    for (const [s, l] of events) {
      const slot = sl.length > 1 && s >= sl[1].at ? sl[1] : sl[0];
      const len = Math.max(1, Math.min(l, (slot === sl[0] && sl.length > 1 ? sl[1].at : 16) - s));
      const g = (s === 0 ? 1 : 0.86) * (0.92 + 0.16 * D.random()), dt = (D.random() - 0.5) * 0.006;
      for (const midi of voicing(sp, inst, slot.deg, kinds[b])) notes.push({ step: b * 16 + s, midi: midi + shift, len, lv: 3, g, dt });
    }
  });
  return notes;
}
// A bar's comping pattern played a little differently: the last bar of four pushes into the next, a hit now and then left out (the first is kept).
function varied(pat, b, half, D) {
  if (b === 3 && !pat.some(([s]) => s >= 14)) return [...pat, [14, 2]];
  if ((b + half) % 2 === 1 && pat.length > 2 && D.random() < 0.6) {
    const drop = 1 + Math.floor(D.random() * (pat.length - 1));
    return pat.filter((_, i) => i !== drop);
  }
  return pat;
}
// A comping pattern of a part's own: one hit left out and one anticipation (a short hit a 16th or two before a beat) put in, so the hook does not comp as the verse does.
function fresh(pat, K) {
  let p = pat.map(e => [...e]);
  if (p.length > 3) p.splice(1 + Math.floor(K.random() * (p.length - 1)), 1);
  const free = [6, 10, 14, 2].filter(s => !p.some(([t, l]) => Math.abs(t - s) < 2 || (t < s && t + l > s)));
  if (free.length && K.random() < 0.8) p.push([K.choice(free), 2]);
  return p.sort((a, b) => a[0] - b[0]);
}
// The chord tones up and down, in eighths or sixteenths, four bars from bar `from`; the last bar turns round.
function arpNotes(sp, inst, slots, from, shape, D) {
  const step = BAND[sp.style].arp16 ? 1 : sp.bpm < 110 ? 2 : 4;
  const notes = [];
  for (let b = 0; b < 4; b++) {
    const sh = b === 3 ? [...shape].reverse() : shape;
    for (let s = 0, k = 0; s < 16; s += step, k++)
      notes.push({ step: b * 16 + s, midi: tuned(sp, noteOf(sp, chordAt(slots, from + b, s) + sh[k % sh.length], LOW[inst])), len: step, lv: k % 2 ? 3 : 1, g: (s % 8 === 0 ? 1 : 0.85) * (0.9 + 0.2 * D.random()), dt: (D.random() - 0.5) * 0.006 });
  }
  return notes;
}
// A bass line four bars long: bar by bar which of the groove's two lines it plays (the last often the other: a turn).
// `turn`: the last bar turns to the fifth chord halfway (as the chords do), and the bass goes with it.
// Now and then a bar's last eighth walks into the next chord: a step below or above its root.
function bassNotes(sp, inst, lines, plan, D, turn = false) {
  const notes = [];
  plan.forEach((li, bar) => {
    const root = sp.prog[bar], next = bar === 3 ? sp.prog[0] : sp.prog[bar + 1];
    const turned = turn && bar === 3 && root % 7 !== 4;
    const walk = !turned && next !== root && D.random() < 0.55;
    for (const [step, len, tone] of lines[li]) {
      if (walk && step >= 14) continue;
      if (turned && step >= 8) continue;
      notes.push({ step: bar * 16 + step, midi: noteOf(sp, root + tone, LOW[inst]), len: walk && step + len > 14 ? Math.max(1, 14 - step) : turned && step + len > 8 ? Math.max(1, 8 - step) : len, g: (step === 0 ? 1 : 0.9) * (0.95 + 0.1 * D.random()) });
    }
    if (turned) notes.push({ step: bar * 16 + 8, midi: noteOf(sp, 4, LOW[inst]), len: 6, g: 0.95 });
    if (walk) notes.push({ step: bar * 16 + 14, midi: noteOf(sp, next + (D.random() < 0.6 ? -1 : 1), LOW[inst]), len: 2, g: 0.85 });
  });
  return notes;
}

// A tune of eight bars on the chords `c.slots`: the question's four bars, then the answer's. -> { notes, motif }
// The notes: { step (of 128), deg (scale degree), len, g, dt, lv }. `o`: motif (a tune's first bar to keep: a variant of that tune), catchy
// (the second bar repeats the first: a hook), displace (bars two and six start two 16ths late), up (bars played an octave up), start.
function tune(R, D, c, o = {}) {
  const { slots, cells, lo, hi } = c;
  const clamp = d => Math.max(lo, Math.min(hi, d));
  const pick = (not, pool = cells) => {
    const ok = pool.filter(x => !not.includes(x));
    return R.choice(ok.length ? ok : pool);
  };
  const spare = cells.filter(x => x.length <= 4);
  const A = o.motif?.cell ?? pick([]);
  const B = o.catchy ? A : pick([A]);
  const C = pick([A, B]);
  const E1 = pick([A, B, C], spare.length ? spare : cells);
  const B2 = pick([E1, ...(o.catchy ? [] : [A, B])]);
  const C2 = pick([A, B2]);
  const E2 = pick([B2, E1], spare.length ? spare : cells);
  const late = x => (x.map(s => s + 2).filter(s => s < 16).length ? x.map(s => s + 2).filter(s => s < 16) : x);
  const cellsOf = [A, B, C, E1, A, B2, C2, E2].map((x, bar) => (o.displace && (bar === 1 || bar === 5) ? late(x) : x));
  const tonesOf = d => [d - 7, d - 5, d - 3, d, d + 2, d + 4, d + 7, d + 9, d + 11].filter(t => t >= lo && t <= hi);
  const move = (prev, st, d) => {
    if (st % 4 === 0 || R.random() < 0.2) {
      const t = tonesOf(d).sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev));
      if (R.random() < 0.12 && t.length > 4) return t[R.int(2, 4)];   // a leap
      const near = t.filter(x => Math.abs(x - prev) <= 3);
      const k = near.length > 1 && (near[0] === prev ? R.random() < 0.6 : R.random() < 0.3) ? 1 : 0;
      return near[k] ?? t[0];
    }
    const dir = prev >= hi - 2 ? -1 : prev <= lo + 2 ? 1 : prev > 5 ? (R.random() < 0.65 ? -1 : 1) : R.random() < 0.65 ? 1 : -1;
    return clamp(prev + dir * (R.random() < 0.7 ? 1 : 2));
  };
  const degs = [];
  // ('high': a hook's tune starts up around the octave, above the verse's.)
  let prev = o.start === 'high' ? Math.max(lo, Math.min(hi - 2, 7)) : o.start ?? 3 + R.int(0, 2);
  for (let bar = 0; bar < 8; bar++) {
    const cell = cellsOf[bar];
    let line = [];
    if (bar === 0 && o.motif) line = o.motif.degs.slice();
    else if (bar === 4) line = degs[0].slice(0, Math.max(1, cell.length - R.int(2, 3)));   // the answer opens on the question's notes, the tail drawn again
    for (let k = line.length; k < cell.length; k++) line.push(move(line.length ? line.at(-1) : prev, cell[k], chordAt(slots, bar, cell[k])));
    const cd = chordAt(slots, bar, cell.at(-1)), last = line.length - 1;
    const near = xs => xs.filter(t => t >= lo && t <= hi).sort((a, b) => Math.abs(a - (line[last - 1] ?? prev)) - Math.abs(b - (line[last - 1] ?? prev)))[0];
    // (The question stops short on the chord's third or fifth; the answer comes home on its root.)
    if (bar === 3) line[last] = near([cd + 2, cd + 4, cd + 9, cd - 3]) ?? line[last];
    if (bar === 7) line[last] = near([cd, cd + 7, cd - 7]) ?? line[last];
    degs.push(line);
    prev = line.at(-1);
  }
  const notes = [];
  degs.forEach((line, bar) => {
    const up = o.up?.includes(bar);
    line.forEach((d, k) => notes.push({ step: bar * 16 + cellsOf[bar][k], deg: up && d + 7 <= hi ? d + 7 : d, bar, k, cell: cellsOf[bar] }));
  });
  notes.sort((a, b) => a.step - b.step);
  return {
    motif: { cell: A, degs: degs[0] },
    notes: notes.map((n, i) => {
      const end = n.step < 64 ? 64 : 128, phraseEnd = (n.bar === 3 || n.bar === 7) && n.k === n.cell.length - 1;
      const cap = phraseEnd ? 12 : n.cell.length <= 3 ? 10 : 6;
      const s = n.step % 16;
      return {
        step: n.step, deg: n.deg, len: lenOf(Math.min(cap, (notes[i + 1]?.step ?? 128) - n.step, end - n.step)),
        g: (s === 0 ? 1 : s % 8 === 0 ? 0.95 : s % 4 === 0 ? 0.9 : 0.78) * (0.88 + 0.24 * D.random()), dt: (D.random() - 0.5) * 0.008,
        ...(n.step % 64 === 0 ? { lv: 2 } : {})
      };
    })
  };
}
// Half of a tune (0 the question, 1 the answer) as a four-bar clip on `inst`.
const tuneClip = (sp, inst, t, half) =>
  notesClip(inst, sp, t.notes.filter(n => n.step >= half * 64 && n.step < half * 64 + 64).map(n => ({ step: n.step - half * 64, midi: tuned(sp, noteOf(sp, n.deg, LOW[inst])), len: n.len, g: n.g, dt: n.dt, ...(n.lv ? { lv: n.lv } : {}) })));

// A bar of a drum lane's hits, four bars of it, played with levels: the beat louder, the off-beats softer and now and then a hit left out; the last bar turns (an open hat or a roll).
function hatPiece(lanes, sp, H, clip) {
  const c = { ...emptyDrums(4), feel: true };
  if (sp.shuffle) c.shuffle = sp.shuffle;
  for (const [d, steps, lv = 1] of lanes)
    for (let bar = 0; bar < 4; bar++)
      for (const s of steps) {
        if (bar === 1 && s % 4 && H.random() < 0.18) continue;
        c.steps[d][bar * 16 + s] = lv === 3 ? (H.random() < 0.2 ? 1 : 3) : s % 8 === 0 ? 2 : s % 4 === 0 ? 1 : H.random() < 0.3 ? 3 : 1;
      }
  const d0 = lanes[0][0];
  if (['hat', 'open', 'shaker', 'tamb', 'ride', 'brush'].includes(d0)) {
    if (H.random() < 0.5) [12, 13, 14, 15].forEach((s, k) => (c.steps[d0][48 + s] = [3, 3, 1, 2][k]));
    else c.steps.open[48 + 14] = 1;
  } else c.steps[d0][48 + 15] = 3;
  return clip(c);
}

// The song's band, for a song of the radio: the pieces, their roles and `parts`, which pieces each section plays. Every riff, phrase and bass piece is four bars
// (the engine plays an eight-bar part as two of them, one after the other). tests/phrases.test.mjs reads `tunes`.
function songKit(sp, sr, { lift = true } = {}) {
  const band = BAND[sp.style];
  const comp = COMP[band.comp];
  const lines = LINES[band.line];
  const clip = c => noted(renderClip(c, sr, sp.bpm), { clip: c });   // (its notes ride along for the game)
  const D = rngOf(sp, 0), H = rngOf(sp, 1);
  const pieces = [];
  const roles = [];
  const add = (p, role) => (pieces.push(p), roles.push(role), pieces.length - 1);
  const shot = (inst, midi) => {
    const x = voice(inst, midi, sr);
    return { L: x, R: x };
  };
  const tunes = {};
  // One set of chords with all its parts: its chords (an instrument, a comping pattern, a half), its arpeggio, its bed of pad, a bass and tunes.
  const block = (spX, K, { catchy = false, maxNotes = 6, leadX, bass = true, oct = 0, own = false, bedOf = bedFor(sp.style) }) => {
    const pat = own ? comp.map(c => fresh(c, K)) : comp;
    const slots = slotsOf(spX.prog, turns(K, band.comp, spX.prog));
    // (The eighth bar turns round to the fifth chord halfway through: the section closes and leans into the next.)
    if (slots[7].length === 1 && slots[7][0].deg % 7 !== 4 && band.comp !== 'power' && band.comp !== 'chug') slots[7] = [slots[7][0], { at: 8, deg: 4 }];
    const plain = slotsOf(spX.prog, Array(8).fill(null));
    // (The soft pad under a riff is voiced another way each half, so it is not the same in every piece.)
    const beds = [0, 1].map(half => clip(notesClip(bedOf, spX, chordNotes(spX, bedOf, plain, half * 4, Array(4).fill(COMP.held[0]), [0, 1, 2, 1].map(x => (half ? (x + 1) % 3 : x)), D, oct))));
    const under = (x, inst, half) => (band.comp === 'held' && HOLDS.has(inst) ? x : sum(x, { ...beds[half], g: 0.3 }));
    const memo = new Map();
    const once = (key, make) => (memo.has(key) ? memo.get(key) : (memo.set(key, make()), memo.get(key)));
    const chords = (inst, primary, half) =>
      once(`c${inst}${primary}${half}`, () => {
        const pats = [0, 1, 2, 3].map(b => varied(pat[(primary + [[0, 0, 0, 1], [1, 0, 1, 0]][half][b]) % 2], b, half, D));
        const kinds = [0, 1, 2, 3].map(() => (D.random() < 0.5 ? 0 : D.random() < 0.75 ? 1 : 2));
        return { ...under(clip(notesClip(inst, spX, chordNotes(spX, inst, slots, half * 4, pats, kinds, D, oct))), inst, half), pan: -0.25 };
      });
    const shapes = K.sample(4, 2).map(i => [[0, 2, 4, 2], [0, 2, 4, 7], [0, 4, 2, 4], [7, 4, 2, 0]][i]);
    const arp = (inst, half) => once(`a${inst}${half}`, () => clip(notesClip(inst, spX, arpNotes(spX, inst, slots, half * 4, shapes[half], D))));
    const [lo, hi] = rangeOf(spX, leadX);
    const cells = band.rhythms ? [...band.rhythms, ...CELLS.filter(x => x.length <= 3)] : CELLS.filter(x => x.length <= maxNotes - (sp.bpm >= 150 ? 2 : sp.bpm >= 125 ? 1 : 0));
    const make = o => tune(K, D, { slots, cells, lo, hi }, { catchy, ...o });
    const tunes8 = [];
    const mel = (t, half) => once(`m${tunes8.indexOf(t) < 0 ? tunes8.push(t) - 1 : tunes8.indexOf(t)}${half}`, () => clip(tuneClip(spX, leadX, t, half)));
    const lowBass = !bass ? null : half => once(`b${half}`, () => clip(notesClip(sp.bass, spX, bassNotes(spX, sp.bass, lines, half ? [0, 1, 0, 1] : [0, 0, 0, 1], D, half === 1 && slots[7].length > 1 && slots[7][1].deg === 4))));
    // The tune again on another instrument, `dd` scale steps away (-2 a third under it, 7 an octave over): a harmony or a doubling.
    const harm = (t, half, inst, dd) => once(`h${tunes8.indexOf(t) < 0 ? tunes8.push(t) - 1 : tunes8.indexOf(t)}${half}${inst}${dd}`, () => clip(tuneClip(spX, inst, { notes: t.notes.map(n => ({ ...n, deg: n.deg + dd })) }, half)));
    return { beds, chords, arp, make, mel, harm, bass: lowBass };
  };
  const ratio = (x, g) => ({ ...x, g });
  // (Where each sits: the chords a little left, the arpeggio right, the tune in the middle.)
  const arpAt = (x, g) => ({ ...x, g, pan: 0.4 });

  // ---- base: the pieces the engine hears first, one of each role (the rest are cousins of these) ----
  // The verse: chords with the lead, then the second time through its own variant of the tune.
  const V = block(sp, rngOf(sp, 2), { maxNotes: 5, leadX: sp.lead });
  const tV1 = V.make({}), tV2 = V.make({ motif: tV1.motif, displace: true });
  tunes.verse1 = tV1.notes; tunes.verse2 = tV2.notes;
  const verse1 = [sum(V.chords(sp.chords, 0, 0), ratio(V.mel(tV1, 0), 0.9)), sum(V.chords(sp.chords2, 1, 1), ratio(V.mel(tV1, 1), 0.9), arpAt(V.arp(sp.lead2, 1), 0.5))];
  const verse2 = [sum(V.chords(sp.chords2, 1, 0), ratio(V.mel(tV2, 0), 0.9), arpAt(V.arp(sp.lead2, 0), 0.5)), sum(V.chords(sp.chords, 0, 1), ratio(V.mel(tV2, 1), 0.9))];
  const i0 = add(verse1[0], 'riff');
  const phrase1 = add(sum(V.mel(tV2, 0), ratio(V.beds[0], 1.1)), 'phrase');
  const vBass = [V.bass(0), V.bass(1)];
  const b0 = add(vBass[0], 'bass');
  // The hats: three of six, each four bars with levels, a hit left out and a turn at the end.
  const hats = (band.hats || sp.hatsPick.map(i => HATS[i])).map(lanes => hatPiece(lanes, sp, H, clip));
  add(hats[0], 'hat');
  // The drums: the kit's (a kick, the heavy one with an 808 or a boom under it, the 808 or a last big hit), the snare, the tick.
  const k = sp.kit;
  const tonic808 = 28 + ((sp.key.tonic - 4 + 12) % 12);
  const kick = k?.kick || 'kick';
  add(shot(kick), 'kick');
  const subOf = tonic => (k ? sum(...k.sub.map((v, j) => ({ ...shot(v, tonic), g: j ? 0.6 : 1 }))) : shot('sub', tonic));
  add(subOf(tonic808), 'sub');
  add(sp.snare === 'both' ? sum(shot('snare'), { ...shot('clap'), g: 0.7 }) : shot(sp.snare), 'snare');
  add(shot(sp.tick), 'tick');
  const snare = k ? sp.snare : 'snare';
  // A roll of the snare getting louder, over one beat.
  const roll = emptyDrums(1);
  [3, 3, 1, 2].forEach((lv, s) => (roll.steps[snare][s] = lv));
  const rolled = clip(roll).L.subarray(0, Math.round((60 / sp.bpm) * sr));
  add({ L: rolled, R: rolled }, 'roll');
  // A fill of a whole bar: toms falling into a snare build (the song has one of two).
  const fillA = emptyDrums(1);
  for (const s of [6, 8, 10, 11]) fillA.steps.tom[s] = s === 8 ? 2 : 1;
  [12, 13, 14, 15].forEach((s, j) => (fillA.steps[snare][s] = [3, 1, 1, 2][j]));
  fillA.steps[kick][0] = 1;
  const fillB = emptyDrums(1);
  for (let s = 8; s < 16; s++) fillB.steps[snare][s] = [3, 3, 3, 3, 1, 1, 2, 2][s - 8];
  fillB.steps[kick][0] = 1; fillB.steps[kick][8] = 1;
  add(clip(fillA), 'fill');
  const base = pieces.length;
  add(clip(fillB), 'fill');

  // ---- the rest ----
  const at = add;
  const parts = {};
  // The intro: the arpeggio over a pad, then the chords come in. The verse's two parts; the verse again, its own.
  parts.intro = [at(sum(V.arp(sp.lead2, 0), ratio(V.beds[0], 1.3), ratio(V.chords(sp.chords2, 1, 0), 0.9)), 'riff'), at(sum(V.arp(sp.lead2, 1), ratio(V.beds[1], 1.3), ratio(V.chords(sp.chords, 0, 1), 0.9)), 'riff')];
  parts.verse = [i0, at(verse1[1], 'riff')];
  parts.verse2 = verse2.map(p => at(p, 'riff'));
  at(sum(V.arp(sp.lead2, 1), ratio(V.beds[0], 1.1)), 'phrase');
  at(vBass[1], 'bass');
  for (const h of hats.slice(1)) at(h, 'hat');
  at(sum(shot(kick), { ...shot(k?.boom || 'sub', tonic808), g: 0.5 }), 'kick');
  // A crash on the first beat of each verse, hook, bridge and outro, and on the last hit: where a drummer marks a new section.
  parts.crash = at(sum({ ...shot('crash'), g: 0.6 }), 'tick');
  // A swell into every hook: the crash played backwards, one bar long, rising to the hook's first beat (the engine places it).
  {
    const c = shot('crash').L, bar = Math.round((240 / sp.bpm) * sr), w = new Float32Array(bar);
    for (let i = 0; i < bar; i++) {
      const k = bar - 1 - i;
      if (k < c.length) w[i] = c[k] * 0.55 * Math.min(1, i / (bar * 0.4));
    }
    parts.swell = at({ L: w, R: w }, 'tick');
  }

  // The hook: another loop of chords when the spec has one, its lead, its bass. Its second time its own variant of the tune, fuller.
  const spB = { ...sp, prog: sp.progB || sp.prog };
  const HX = block(spB, rngOf(sp, 3), { catchy: true, maxNotes: 4, leadX: sp.leadB, bass: Boolean(sp.progB), own: true, bedOf: 'strings' });
  const tH1 = HX.make({ start: 'high' }), tH2 = HX.make({ motif: tH1.motif, displace: true, up: [4, 5, 6, 7] });

  tunes.hook1 = tH1.notes; tunes.hook2 = tH2.notes;
  parts.hook = [
    at(sum(HX.chords(sp.chords2, 0, 0), HX.mel(tH1, 0)), 'riff'),
    at(sum(HX.chords(sp.chords, 1, 1), ratio(HX.mel(tH1, 1), 0.85), arpAt(HX.arp(sp.lead2, 1), 0.6)), 'riff')
  ];
  // (The hook again, fuller: a harmony a third under its tune, on strings to one side.)
  const third = (t, h, g) => ({ ...HX.harm(t, h, 'strings', -2), g, pan: 0.3 });
  parts.hook2 = [
    at(sum(HX.chords(sp.chords, 1, 0), ratio(HX.mel(tH2, 0), 0.9), arpAt(HX.arp(sp.lead2, 0), 0.6), third(tH2, 0, 0.38)), 'riff'),
    at(sum(HX.chords(sp.chordsC, 0, 1), ratio(HX.mel(tH2, 1), 0.9), arpAt(HX.arp(sp.lead2, 1), 0.7), third(tH2, 1, 0.38)), 'riff')
  ];
  parts.layer = at(sum(arpAt(HX.arp(sp.lead2, 0), 0.8), ratio(HX.beds[0], 0.2)), 'riff');
  // (Its bass follows the hook's chords only when they are not the verse's.)
  if (sp.progB) parts.hookBass = [0, 1].map(h => at(HX.bass(h), 'bass'));

  // The bridge: a loop of chords of its own, other chords, its own lead and a bass to suit; quieter, higher, longer notes.
  const spC = { ...sp, prog: sp.progC };
  const C = block(spC, rngOf(sp, 5), { maxNotes: 4, leadX: sp.leadC, own: true, bedOf: 'choir' });
  const tC = C.make({ start: 5 });
  tunes.bridge = tC.notes;
  parts.bridge = [
    at(sum(C.chords(sp.chordsC, 0, 0), ratio(C.mel(tC, 0), 0.95)), 'riff'),
    at(sum(C.chords(sp.chordsC, 1, 1), ratio(C.mel(tC, 1), 0.95), arpAt(C.arp(sp.lead2, 1), 0.5)), 'riff')
  ];
  parts.bridgeBass = [0, 1].map(h => at(C.bass(h), 'bass'));

  if (lift) {
    // The last hook, lifted a step or two (or not lifted, when the song is not): the hook's tune once more, its own variant (an octave up in the answer), its own bass and 808.
    const spL = { ...spB, key: { ...sp.key, tonic: (sp.key.tonic + (sp.lift || 0)) % 12 } };
    const tonicL = 28 + ((spL.key.tonic - 4 + 12) % 12);
    const L = block(spL, rngOf(sp, 6), { catchy: true, maxNotes: 4, leadX: sp.leadB, oct: 12, own: true });
    const t3 = L.make({ motif: tH1.motif, up: [4, 5, 6, 7] });
    tunes.lift = t3.notes;
    // (The last hook the fullest: the tune doubled an octave up on a bell, and its harmony under it.)
    const lift = (t, h) => [{ ...L.harm(t, h, 'glass', 7), g: 0.28, pan: -0.35 }, { ...L.harm(t, h, 'strings', -2), g: 0.38, pan: 0.3 }];
    parts.lift = [
      at(sum(L.chords(sp.chords2, 0, 0), L.mel(t3, 0), arpAt(L.arp(sp.lead2, 0), 0.5), ...lift(t3, 0)), 'riff'),
      at(sum(L.chords(sp.chordsC, 1, 1), ratio(L.mel(t3, 1), 0.9), arpAt(L.arp(sp.lead2, 1), 0.7), ...lift(t3, 1)), 'riff')
    ];
    parts.liftBass = [0, 1].map(h => at(L.bass(h), 'bass'));
    parts.liftSub = at(subOf(tonicL), 'sub');
  }
  // (`like`: for each piece after the first `base`, the one of those it is a cousin of, so the song needs hearing only those.)
  return { pieces, roles, parts, base, like: roles.slice(base).map(r => roles.indexOf(r)), tunes };
}

// The song's band as pieces and their roles: [{ L, R }], [role]. The jam's set is these
// alone. A song of the radio (`song`: true) has more after them, and `parts`, which
// pieces each section plays: a second verse, a hook of its own (another loop of chords,
// another lead, a bass to suit), the last hook lifted a step or two with its own bass and
// 808 (`lift`: false when the plan has one hook), a layer of its arpeggio.
export function radioKit(sp, sr = RADIO_SR, opts = {}) {
  // (Its drums from the groove's recorded kit, when its hits are here: lib/samples.mjs.)
  return withKit(sp.style, () => kitOf(sp, sr, opts));
}
function kitOf(sp, sr, { song = false, lift = true } = {}) {
  if (song) return songKit(sp, sr, { lift });
  const R = makeRng(sp.seed ^ 0x68e31da4);
  const band = BAND[sp.style];
  const clip = c => noted(renderClip(c, sr, sp.bpm), { clip: c });
  const comp = COMP[band.comp];
  const rhythms = band.rhythms || RHYTHMS;
  const [ra, rb, rc] = [R.choice(rhythms), R.choice(rhythms), R.choice(rhythms)];
  // A soft held pad under every riff that does not hold its own chords (an off-beat stab, a pulse): no bar of a riff is ever empty.
  const bed = clip(chordClip(sp, bedFor(sp.style), COMP.held[0]));
  const under = (x, inst) => (band.comp === 'held' && HOLDS.has(inst) ? x : sum(x, { ...bed, g: 0.3 }));
  const chords = under(clip(chordClip(sp, sp.chords, comp[0])), sp.chords);
  const chords2 = under(clip(chordClip(sp, sp.chords2, comp[1])), sp.chords2);
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
  for (const lanes of band.hats || HATS.slice(0, 3)) add(clip(hatClip(lanes, sp)), 'hat');
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
export const RING_BARS = 3.5;
export function radioPlan(R, bpm, seconds = 90, asked = false) {
  // (A length asked for: from 8 bars to 400, 8 minutes at 100 BPM. The radio's own songs: 24 to 96, 1:30 to 3:30 or so.)
  // (The last notes ring on for about RING_BARS after the outro: an asked length counts them.)
  const bars = asked ? Math.max(6, Math.min(400, Math.round(((seconds * bpm) / 240 - RING_BARS) / 2) * 2)) : Math.max(24, Math.min(96, Math.round((seconds * bpm) / 240 / 4) * 4));
  if (bars < 24) {
    // (A short one: an intro, a verse, a hook, an outro.)
    const end = bars < 8 ? 1 : 2;
    const n = Math.max(2, Math.floor((bars - 2 * end) / 2));
    return [['intro', end], ['verse', n], ['hook', bars - 2 * end - n], ['outro', end]];
  }
  if (asked) return longPlan(R, bars);
  return formPlan(R, bars);
}
// The radio's own songs: a verse–hook pair or two, a bridge (eight bars on chords and a tune of its own)
// and a break before the last hook, which may come twice. Every part is four or eight bars, so the loops stay on their chords.
// (The intro is four bars: with eight the engine may open on the hats alone for four, and they fall quiet between hits.)
// V verse, H hook, B bridge, K break (four bars); a pre-hook (four bars) may come before any hook that follows a verse.
const SHAPES = ['VH', 'VHKH', 'VHBH', 'VHVH', 'VHBKH', 'VHKHBH', 'VHVHKH', 'VHKHVH', 'VHVHBH', 'VHVHKHH', 'VHVHBKH', 'VHVHBHH', 'VHKHVHH', 'VHVHBKHH'];
const SHAPE_BARS = { V: 8, H: 8, B: 8, K: 4 };
export function formPlan(R, bars) {
  const names = { V: 'verse', H: 'hook', B: 'bridge', K: 'break' };
  let best = null;
  for (const shape of SHAPES) {
    const pairs = (shape.match(/VH/g) || []).length;
    for (let pre = 0; pre < 1 << pairs; pre++)
      for (const intro of [4])
        for (const outro of [4, 8]) {
          const total = intro + outro + [...shape].reduce((a, c) => a + SHAPE_BARS[c], 0) + 4 * [...Array(pairs).keys()].filter(k => pre & (1 << k)).length;
          // (The closest to the bars wanted; a long song with no bridge or break is a worse one; chance picks between those within a few bars.)
          const score = Math.abs(total - bars) + (outro === 8 ? 1.5 : 0) + (bars >= 40 && !/[BK]/.test(shape) ? 8 : 0) + (bars >= 56 && !shape.includes('B') ? 6 : 0) + R.random() * 8;
          if (!best || score < best.score) best = { score, shape, pre, intro, outro };
        }
  }
  const { shape, pre, intro, outro } = best;
  const body = [];
  let pair = 0;
  [...shape].forEach((c, k) => {
    if (c === 'H' && shape[k - 1] === 'V') {
      if (pre & (1 << pair++)) body.push(['pre', 4]);
    }
    body.push([names[c], SHAPE_BARS[c]]);
  });
  return [['intro', intro], ...body, ['outro', outro]];
}
// A length asked for: pairs, a break or a bridge between every three, so it isn't the same eight bars for minutes.
function longPlan(R, bars) {
  const pre = R.random() < 0.5;
  const unit = pre ? 20 : 16;
  const body = [];
  let pairs = 0;
  for (let used = 0; ; pairs++) {
    const gap = pairs && pairs % 3 === 0 ? 4 : 0;
    if (pairs && used + gap + unit > bars - 8) break;
    if (gap) body.push([pairs % 2 ? 'bridge' : 'break', 4]);
    body.push(['verse', 8], ...(pre ? [['pre', 4]] : []), ['hook', 8]);
    used += gap + unit;
  }
  let rest = bars - 8 - body.reduce((a, [, n]) => a + n, 0);
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

// What a remix may set on a song's spec: its tempo, its lead and its two chord instruments
// (the rest follows from the seed and the groove).
export const REMIX_KEYS = ['bpm', 'lead', 'chords', 'chords2'];
// The instruments a groove's band may play: { leads, chords }.
export const bandSounds = style => ({ leads: [...(BAND[style]?.leads || [])], chords: [...(BAND[style]?.chords || [])] });
// The song's level by section, as a band plays it: the verses held back, the pre-hook rising into the hook, the hooks
// full, the bridge between (a beat's glide at each change). On the mix and its stems alike.
const LEVEL = { verse: 0.78, bridge: 0.86 };
function shape(song, bpm) {
  const { audio, stems, info } = song;
  const sr = audio.sr, bar = (240 / bpm) * sr, glide = Math.round(bar / 4);
  const at = [];
  let b = 0;
  for (const [t, L] of info.plan) at.push({ t, from: Math.round(b * bar), to: Math.round((b += L) * bar) });
  const levelOf = k => LEVEL[at[k]?.t] ?? 1;
  const tracks = [audio, ...Object.values(stems || {})];
  at.forEach(({ t, from, to }, k) => {
    const g0 = levelOf(k), prev = k ? levelOf(k - 1) : g0;
    for (let i = from; i < to; i++) {
      // (The pre-hook climbs from the verse's level to the hook's; elsewhere the last level glides into this one.)
      const g = t === 'pre' ? prev + (1 - prev) * ((i - from) / (to - from)) : i - from < glide && prev !== g0 && at[k - 1]?.t !== 'pre' ? prev + (g0 - prev) * ((i - from) / glide) : g0;
      if (g === 1) continue;
      for (const x of tracks) {
        if (i < x.L.length) x.L[i] *= g;
        if (x.R !== x.L && i < x.R.length) x.R[i] *= g;
      }
    }
  });
}

// The parts a remix may leave out, and the pieces each is.
export const PART_LIST = ['drums', 'bass', 'melody'];
const PART_ROLES = { drums: ['hat', 'fill', 'kick', 'snare', 'tick', 'roll'], bass: ['bass', 'sub'], melody: ['riff', 'phrase'] };
// One song. -> { audio, info } (info: makeSong's, and the spec's key, mood and plan)
export const RADIO_V = 9;
export function radioSong(spec, sr = RADIO_SR, stems = false) {
  const { seed, mood = 'all', style = null } = spec;
  const over = REMIX_KEYS.filter(k => spec[k] != null).map(k => [k, spec[k]]);
  const sp = Object.assign(radioSpec(seed, mood, style), Object.fromEntries(over));
  // (A remix's key, parts and fade: `shift` semitones, the parts left out, the outro fading away.)
  const shift = Number.isFinite(spec.shift) ? Math.max(-6, Math.min(6, Math.round(spec.shift))) : 0;
  if (shift) sp.key = { ...sp.key, tonic: (sp.key.tonic + shift + 12) % 12 };
  const mute = Array.isArray(spec.mute) ? PART_LIST.filter(p => spec.mute.includes(p)) : [];
  const fade = spec.fade === true;
  const R = makeRng(seed ^ 0x1b873593);
  // (`seconds`: a length asked for, 0:30 to 8:00, in place of the song's own.)
  const asked = Number.isFinite(spec.seconds);
  const plan = radioPlan(R, sp.bpm, asked ? spec.seconds : sp.seconds, asked);
  const { pieces, roles, parts: arrange, base, like } = radioKit(sp, sr, { song: true, lift: plan.filter(([t]) => t === 'hook').length > 1 });
  // (Hearing the first pieces is enough: the rest are the same lengths, in other chords.)
  const heard = analyzeRecording(pieces.slice(0, base), sr, { bpm: sp.bpm });
  const analysis = { ...heard, analyses: [...heard.analyses, ...like.map(i => heard.analyses[i])], loops: [...heard.loops, ...like.map(i => heard.loops[i])], roles: [...heard.roles, ...like.map(i => heard.roles[i])] };
  // (A part left out: its pieces silent, after they're heard, so the song is arranged as it was. With no drums, nothing pumps.)
  const quiet = new Set(mute.flatMap(p => PART_ROLES[p]));
  const played = quiet.size ? pieces.map((p, i) => (quiet.has(roles[i]) ? { L: new Float32Array(p.L.length), R: new Float32Array(p.L.length) } : p)) : pieces;
  const song = makeSong(played, sr, seed, {
    analysis, roles, bpm: sp.bpm, styles: moodStyles(mood), style: sp.style,
    humanize: (MOODS[mood]?.humanize ?? 100) / 100, plan, mix: mixOf({ ...MIXES[mood], ...BAND[sp.style].mix, ...(mute.includes('drums') ? { pump: 0 } : {}), ...(fade ? { fade: true } : {}) }), stems, arrange, varied: sp.dress, key: sp.key
  });
  shape(song, sp.bpm);
  // (A remix's own choices ride along in `radio`, so the song is made again as it was. `v`: the
  // engine that made it; a song kept from before RADIO_V is cut from its own sound, not made again.)
  // (`events`, `roles` and each piece's `tune`: what plays when, for the game's charts.)
  return { audio: song.audio, stems: song.stems, events: song.events, roles, tunes: pieces.map(p => p.tune || null), info: { ...song.info, key: sp.key, mood, radio: { seed, mood, style: sp.style, ...Object.fromEntries(over), ...(asked ? { seconds: spec.seconds } : {}), ...(shift ? { shift } : {}), ...(mute.length ? { mute } : {}), ...(fade ? { fade } : {}), v: RADIO_V } } };
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

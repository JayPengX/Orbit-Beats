// Recorded instruments: real pianos, guitars, basses, strings, winds and
// mallets in place of the oscillators for the instruments that are real
// ones (the synths, 8-bit and 808 stay made). Notes a major third apart
// (public/samples/mk/<inst>/<midi>.mp3 from the MusyngKite soundfont, CC BY-SA
// 3.0: scripts/samples.mjs fetches them); a note between two is
// the nearest one played a step or two higher or lower. Loaded on the page
// only for the instruments a song plays, decoded once, and handed to the
// workers, which play them through voice() (lib/synth.mjs). With none
// loaded (offline the first time, the tests), the made voices play.
//
//   SAMPLED[inst] = [soundfont name, lowest MIDI note, highest]
//   sampleNotes(inst) -> [midi]
//   playSample(bank, midi, sr, hold, vel, variant, release) -> Float32Array | null

export const SAMPLED = {
  piano: ['acoustic_grand_piano', 28, 100],
  keys: ['electric_piano_2', 36, 96],
  rhodes: ['electric_piano_1', 36, 96],
  clav: ['clavinet', 36, 88],
  organ: ['drawbar_organ', 36, 96],
  vibes: ['vibraphone', 48, 96],
  marimba: ['marimba', 44, 96],
  kalimba: ['kalimba', 48, 96],
  musicbox: ['music_box', 60, 104],
  glass: ['celesta', 60, 104],
  bell: ['tubular_bells', 52, 88],
  steel: ['steel_drums', 48, 92],
  harp: ['orchestral_harp', 36, 96],
  nylon: ['acoustic_guitar_nylon', 40, 84],
  guitar: ['electric_guitar_clean', 40, 88],
  distgtr: ['distortion_guitar', 40, 84],
  banjo: ['banjo', 48, 84],
  guzheng: ['koto', 44, 96],
  sitar: ['sitar', 48, 84],
  strings: ['string_ensemble_1', 36, 96],
  pizz: ['pizzicato_strings', 36, 88],
  erhu: ['violin', 56, 96],
  brass: ['brass_section', 36, 84],
  sax: ['alto_sax', 48, 84],
  flute: ['flute', 60, 96],
  harmonica: ['harmonica', 48, 84],
  accordion: ['accordion', 44, 84],
  choir: ['choir_aahs', 44, 84],
  vox: ['voice_oohs', 44, 84],
  bass: ['electric_bass_finger', 24, 64],
  upright: ['acoustic_bass', 24, 64],
  slap: ['slap_bass_1', 24, 64]
};
// (A major third apart: no note is played more than two semitones from where it was recorded.)
const STEP = 4;
export function sampleNotes(inst) {
  const s = SAMPLED[inst];
  if (!s) return [];
  const out = [];
  for (let m = Math.ceil(s[1] / STEP) * STEP; m <= s[2]; m += STEP) out.push(m);
  return out;
}
// The soundfont's own name for a note (its files): C4, Db4, …
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = m => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
export const SAMPLE_DIR = 'samples/mk/';
export const sampleUrl = (base, inst, m) => `${base}${SAMPLE_DIR}${inst}/${m}.mp3`;
// How each kind of instrument lets go of a note: a struck or plucked one rings
// on as recorded (only a short note is damped), a held one stops with the hand.
const RINGS = new Set(['piano', 'vibes', 'marimba', 'kalimba', 'musicbox', 'glass', 'bell', 'steel', 'harp', 'nylon', 'guitar', 'banjo', 'guzheng', 'sitar', 'pizz', 'rhodes', 'keys', 'clav']);

// One note from the recorded ones: the nearest, played faster or slower (a
// four-point curve between samples, so a moved note stays clean), held
// `hold` seconds then let go over `release`; a softer one darker (`vel`), the
// second take (`variant`) a few cents off and started a hair later in the
// recording, so a repeated note is never the same twice.
export function playSample(bank, midi, sr, hold, vel = 0.7, variant = 0, release = 0.3) {
  if (!bank?.notes?.length) return null;
  let near = bank.notes[0];
  for (const n of bank.notes) if (Math.abs(n.midi - midi) < Math.abs(near.midi - midi)) near = n;
  const cents = variant ? (midi % 2 ? 4 : -4) : 0;
  const rate = 2 ** ((midi - near.midi + cents / 100) / 12) * (bank.sr / sr);
  const x = near.x;
  // (Kept as 16-bit samples (lib/sampleload.mjs), or floats.)
  const S = x instanceof Int16Array ? 1 / 32768 : 1;
  const from = variant ? Math.round(0.0015 * bank.sr) : 0;
  const ring = RINGS.has(bank.inst);
  // (Struck: as long as it rings, up to the hold and a long tail; held: the hold and its release.)
  const want = ring ? Math.max(hold + release, Math.min(hold + 2.2, 2.6)) : hold + release;
  const n = Math.max(1, Math.min(Math.round(want * sr), Math.floor((x.length - from - 3) / rate)));
  const out = new Float32Array(n);
  const h = Math.round(hold * sr);
  const k = Math.exp(-4 / (Math.max(0.03, ring ? Math.max(release, Math.min(1.2, hold * 0.8 + 0.25)) : release) * sr));
  const fadeIn = Math.max(1, Math.round(0.0015 * sr));
  let g = 1;
  let p = from;
  for (let i = 0; i < n; i++) {
    const j = Math.floor(p);
    const t = p - j;
    const a = x[j - 1] ?? x[j];
    const b = x[j];
    const c = x[j + 1] ?? b;
    const d = x[j + 2] ?? c;
    // (Catmull-Rom between b and c.)
    const v = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
    if (i >= h) g *= k;
    out[i] = v * S * g * (i < fadeIn ? i / fadeIn : 1);
    p += rate;
  }
  // (The last moment eased to nothing: no click where the recording or the note ends.)
  const ease = Math.min(n, Math.round(0.006 * sr));
  for (let i = 0; i < ease; i++) out[n - 1 - i] *= i / ease;
  // A softer hit is darker: one pole, its corner from 2.5 kHz (soft) to open (hard).
  if (vel < 0.95) {
    const hz = 2500 + 16000 * vel * vel;
    const cf = 1 - Math.exp((-2 * Math.PI * Math.min(hz, sr * 0.45)) / sr);
    let s = 0;
    for (let i = 0; i < n; i++) out[i] = s += cf * (out[i] - s);
  }
  return out;
}

// The recorded instruments a song of the radio's band plays (its spec, lib/radio.mjs radioSpec).
export const specInsts = sp => [...new Set([sp.chords, sp.chords2, sp.chordsC, sp.lead, sp.lead2, sp.leadB, sp.leadC, sp.bass, 'pad', 'strings', 'choir', 'glass'])].filter(i => i && SAMPLED[i]);

// ---- Recorded drums ----
// Three kits and the hand percussion: a real acoustic kit (Virtuosity Drums,
// Versilian Studios and Karoryfer Samples, its middle mic; its lo-fi mic for
// lo-fi and boom bap), a real TR-808 (Michael Fischer's recordings) and an
// electronic kit (Sonic Pi's), all CC0. Each drum as takes: soft, normal and
// hard, two of each (a drum hit twice in a row is never the same hit).
//   DRUM_KITS[kit][drum] = [[soft a, soft b], [normal a, b], [hard a, b]] (file names)
const VD = (art, layers) => layers.map(pair => pair.map(v => `${art}_vl${v}`));
const acoustic = {
  kick: VD('kick_snoff', [['2_rr1', '2_rr2'], ['3_rr1', '3_rr2'], ['4_rr1', '4_rr2']]),
  snare: VD('snare_center', [[14, 16], [24, 26], [32, 34]]),
  rim: VD('snare_crossstick', [[6, 8], [10, 12], [14, 16]]),
  hat: VD('hh_closed', [['2_rr1', '2_rr2'], ['3_rr1', '3_rr2'], ['4_rr1', '4_rr2']]),
  open: VD('hh_open', [['2_rr1', '2_rr2'], ['3_rr1', '3_rr2'], ['4_rr1', '4_rr2']]),
  ride: VD('ride_ride', [['1_rr1', '1_rr2'], ['2_rr1', '2_rr2'], ['3_rr1', '3_rr2']]),
  crash: VD('crash_crash', [['1_rr1', '1_rr2'], ['2_rr1', '2_rr2'], ['3_rr1', '3_rr2']]),
  tom: VD('htom_center', [[6, 8], [10, 12], [14, 16]])
};
const one = (...names) => [names, names, names];
export const DRUM_KITS = {
  acoustic: { ...acoustic, rkick: acoustic.kick, rsnare: acoustic.snare },
  lofi: { ...acoustic, rkick: acoustic.kick, rsnare: acoustic.snare },
  tr808: { kick: one('bd'), snare: one('sd'), clap: one('cp'), hat: one('hh'), open: one('oh'), rim: one('rim'), tom: one('mt', 'lt'), crash: one('cr'), cowbell: one('cb') },
  electro: { kick: one('bd'), snare: one('sd'), clap: one('cp'), hat: one('hh'), open: one('oh'), rim: one('rim'), tom: one('lt'), crash: one('cr'), cowbell: one('cb') },
  // (In every kit: the hand percussion, recorded close.)
  perc: {
    shaker: one('shaker1', 'shaker2'), cowbell: one('cowbell1', 'cowbell2'), conga: one('conga1', 'conga2'), bongo: one('bongo1', 'bongo2'),
    clave: one('claves1', 'claves2'), agogo: one('agogo1', 'agogo2'), guiro: one('guiro1', 'guiro2'), tamb: one('tamb1', 'tamb2')
  }
};
// Which kit each groove plays (none: the made drums, as chiptune's 8-bit).
const KIT_OF = {
  acoustic: 'funk reggae jazz bossa samba salsa rock punk metal citypop disco gospel neosoul ballad ambient cinematic kizomba highlife cumbia chinese blues country',
  lofi: 'lofi boombap',
  tr808: 'hiphop trap half dembow afro drill jersey amapiano phonk baile kpop bhangra footwork',
  electro: 'four broken house garage dnb techno synthwave dubstep jungle trance hardstyle'
};
export const STYLE_KIT = Object.fromEntries(Object.entries(KIT_OF).flatMap(([k, list]) => list.split(' ').map(st => [st, k])));
// How long each drum is kept (s): its ring, no more.
export const DRUM_SECONDS = { kick: 0.7, rkick: 0.7, snare: 0.9, rsnare: 0.9, rim: 0.4, hat: 0.4, open: 1.4, ride: 2, crash: 2.8, tom: 1.2, clap: 0.7, cowbell: 0.6, shaker: 0.5, conga: 0.8, bongo: 0.6, clave: 0.4, agogo: 0.7, guiro: 0.6, tamb: 0.7 };
export const drumUrl = (base, kit, file) => `${base}samples/drums/${kit}/${file}.m4a`;
// The kit playing now (radioSong sets it for its song: lib/radio.mjs), and the bank of a drum in it.
// (`tune`: a radio song's kit tuned its own way, its hits played that much faster or slower: higher or lower, shorter or longer.)
let kitNow = null;
let tuneNow = 1;
export const kitPlaying = () => (tuneNow === 1 ? kitNow : `${kitNow}@${tuneNow}`);
export function withKit(style, fn, tune = 1) {
  const was = kitNow, wasTune = tuneNow;
  kitNow = STYLE_KIT[style] || null;
  tuneNow = tune;
  try {
    return fn();
  } finally {
    kitNow = was;
    tuneNow = wasTune;
  }
}
// -> { inst, sr, takes: [[x, x], [x, x], [x, x]] } | null
export function drumBank(drum) {
  if (!kitNow) return null;
  return BANKS.get(`drum:${kitNow}:${drum}`) || BANKS.get(`drum:perc:${drum}`) || null;
}
// The drums a kit's banks hold: [`drum:<kit>:<drum>`].
export const kitBanks = style => {
  const k = STYLE_KIT[style];
  return k ? [...Object.keys(DRUM_KITS[k]).map(d => `drum:${k}:${d}`), ...Object.keys(DRUM_KITS.perc).map(d => `drum:perc:${d}`)] : [];
};
// One hit: the take for how hard (`vel`) and which round (`variant`), its end eased.
export function playDrum(bank, sr, vel = 0.7, variant = 0) {
  const layer = bank.takes[vel < 0.5 ? 0 : vel < 0.85 ? 1 : 2] || bank.takes[0];
  const x0 = layer[variant % layer.length] || layer[0];
  if (!x0?.length) return null;
  const rate = (bank.sr / sr) * tuneNow;
  const n = Math.max(1, Math.floor((x0.length - 2) / rate));
  const out = new Float32Array(n);
  const S = x0 instanceof Int16Array ? 1 / 32768 : 1;
  for (let i = 0; i < n; i++) {
    const p = i * rate;
    const j = Math.floor(p);
    const t = p - j;
    out[i] = S * (x0[j] + t * ((x0[j + 1] ?? x0[j]) - x0[j]));
  }
  const ease = Math.min(n, Math.round(0.02 * sr));
  for (let i = 0; i < ease; i++) out[n - 1 - i] *= i / ease;
  return out;
}

// ---- The banks: { inst: { inst, sr, notes: [{ midi, x }] } } ----
const BANKS = new Map();
let gen = 0;
export const banks = () => BANKS;
export const bankOf = inst => BANKS.get(inst) || null;
// Changes each time a bank comes in (lib/synth.mjs keeps notes per change).
export const bankGen = () => gen;
export function useBanks(list) {
  let n = 0;
  for (const b of Object.values(list || {}))
    if (b?.inst && (b.notes?.length || b.takes?.length) && !BANKS.has(b.inst)) {
      BANKS.set(b.inst, b);
      n++;
    }
  if (n) gen++;
  return n;
}
export const dropBanks = () => (BANKS.clear(), gen++);

// 聽 (the radio): endless songs out of nothing, on the app's own instruments
// (lib/synth.mjs), no kit, no clips, no setup. Each song is its own band:
// a groove from the mood, its tempo, a key, a four-chord progression, and
// instruments that suit the groove; written as four-bar loops (chords, a
// melody, an arpeggio, two bass lines, hats and the drums), then arranged
// and mixed by the engine like any kit's song, in sections of four or eight
// bars so every loop stays on its chord. Songs follow each other with no
// gap: each one is cut just before its last hit, and that hit's ring is
// played under the next one's intro (`segment`). No DOM: the worker makes
// them (lib/make.mjs), the tests listen to them.

import { makeSong, makeRng, analyzeRecording, STYLES } from '../engine.mjs';
import { voice, renderClip, emptyDrums, SCALES } from './synth.mjs';
import { mixOf } from './mix.mjs';

export const RADIO_SR = 32000;

// 情境: a mood picks the grooves (and how loose they're played); the page's 做歌 too.
export const MOODS = {
  all: { zh: '隨機', en: 'Random', styles: STYLES, humanize: 100 },
  chill: { zh: '放鬆', en: 'Chill', styles: ['half', 'hiphop', 'boombap', 'afro', 'amapiano', 'lofi', 'reggae'], humanize: 130 },
  hype: { zh: '熱血', en: 'Hype', styles: ['trap', 'drill', 'four', 'jersey', 'phonk', 'dnb', 'techno', 'baile'], humanize: 60 },
  groove: { zh: '律動', en: 'Groove', styles: ['house', 'afro', 'dembow', 'amapiano', 'broken', 'funk', 'garage'], humanize: 100 },
  classic: { zh: '經典', en: 'Classic', styles: ['boombap', 'hiphop', 'half', 'four', 'funk', 'reggae'], humanize: 140 }
};
// A mood's grooves, or one groove picked on its own (`style:<id>`).
export const moodStyles = mood => (MOODS[mood] ? MOODS[mood].styles : STYLES.includes(String(mood).replace(/^style:/, '')) ? [String(mood).replace(/^style:/, '')] : STYLES);

// The next song's spec: a new seed, a groove of the mood not among the last
// few played (when the mood has others), so two in a row never match.
export function radioPick(mood, recent = [], seed = Math.floor(Math.random() * 1e9)) {
  const styles = moodStyles(mood);
  const fresh = styles.filter(s => !recent.includes(s));
  const pool = fresh.length ? fresh : styles.filter(s => s !== recent.at(-1));
  const R = makeRng(seed);
  return { seed, mood: MOODS[mood] || /^style:/.test(mood) ? mood : 'all', style: R.choice(pool.length ? pool : styles) };
}
// The radio's queue: the stretches made and waiting, whether one is being
// made, whether ⏭ waits for the next, and the mood's generation (what was
// made for a mood since changed is dropped).
export const radioQueue = () => ({ ready: [], busy: false, skip: false, gen: 0 });

// Each groove's tempo range, its instruments and how its chords and bass are played.
const BAND = {
  four: { bpm: [118, 126], chords: ['pad', 'organ', 'keys'], leads: ['pluck', 'lead', 'bell'], bass: ['bass'], comp: 'stab8', line: 'off8' },
  hiphop: { bpm: [84, 94], chords: ['keys', 'strings', 'organ'], leads: ['bell', 'pluck', 'vox'], bass: ['bass', 'subbass'], comp: 'held', line: 'hop' },
  trap: { bpm: [132, 148], chords: ['pad', 'strings', 'bell'], leads: ['bell', 'pluck', 'vox'], bass: ['subbass'], comp: 'held', line: 'long' },
  half: { bpm: [70, 84], chords: ['strings', 'pad', 'keys'], leads: ['bell', 'keys', 'guitar'], bass: ['subbass', 'bass'], comp: 'held', line: 'long' },
  broken: { bpm: [120, 128], chords: ['pad', 'keys'], leads: ['pluck', 'lead'], bass: ['bass'], comp: 'stab', line: 'hop' },
  house: { bpm: [120, 125], chords: ['organ', 'keys', 'pad'], leads: ['pluck', 'vox', 'lead'], bass: ['bass'], comp: 'stab8', line: 'off8' },
  dembow: { bpm: [90, 100], chords: ['pad', 'keys', 'guitar'], leads: ['pluck', 'lead', 'bell'], bass: ['subbass', 'bass'], comp: 'stab', line: 'dembow' },
  afro: { bpm: [100, 110], chords: ['keys', 'guitar', 'organ'], leads: ['pluck', 'bell', 'guitar'], bass: ['bass'], comp: 'stab', line: 'afro' },
  drill: { bpm: [138, 144], chords: ['strings', 'pad', 'bell'], leads: ['bell', 'vox', 'strings'], bass: ['subbass'], comp: 'held', line: 'long' },
  boombap: { bpm: [86, 94], chords: ['keys', 'organ', 'strings'], leads: ['keys', 'brass', 'guitar'], bass: ['bass'], comp: 'held', line: 'hop' },
  jersey: { bpm: [136, 144], chords: ['pad', 'organ'], leads: ['vox', 'pluck', 'lead'], bass: ['subbass'], comp: 'stab8', line: 'long' },
  amapiano: { bpm: [110, 114], chords: ['keys', 'organ', 'pad'], leads: ['pluck', 'bell', 'keys'], bass: ['subbass'], comp: 'stab', line: 'afro' },
  lofi: { bpm: [72, 84], chords: ['keys', 'guitar', 'strings'], leads: ['keys', 'bell', 'guitar'], bass: ['bass'], comp: 'held', line: 'hop' },
  funk: { bpm: [100, 112], chords: ['organ', 'keys', 'brass'], leads: ['brass', 'lead', 'guitar'], bass: ['bass'], comp: 'stab', line: 'funk' },
  garage: { bpm: [128, 134], chords: ['organ', 'pad', 'keys'], leads: ['vox', 'pluck'], bass: ['subbass', 'bass'], comp: 'stab8', line: 'off8' },
  dnb: { bpm: [168, 176], chords: ['pad', 'strings'], leads: ['pluck', 'bell', 'lead'], bass: ['subbass', 'bass'], comp: 'held', line: 'long' },
  reggae: { bpm: [72, 84], chords: ['organ', 'guitar', 'keys'], leads: ['keys', 'brass', 'guitar'], bass: ['bass'], comp: 'skank', line: 'drop' },
  phonk: { bpm: [126, 138], chords: ['bell', 'pad', 'strings'], leads: ['bell', 'lead', 'vox'], bass: ['subbass'], comp: 'held', line: 'long' },
  baile: { bpm: [126, 132], chords: ['pad', 'organ'], leads: ['vox', 'lead', 'pluck'], bass: ['subbass'], comp: 'stab8', line: 'off8' },
  techno: { bpm: [124, 132], chords: ['pad', 'organ'], leads: ['lead', 'pluck', 'bell'], bass: ['bass', 'subbass'], comp: 'stab8', line: 'off8' }
};
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
  skank: [[[4, 2], [12, 2]], [[4, 1], [6, 1], [12, 1], [14, 1]]]
};
// The bass's rhythm in a bar: [16th, length, the chord tone (0 root, 4 fifth, 7 octave)].
const LINES = {
  off8: [[[2, 2, 0], [6, 2, 0], [10, 2, 0], [14, 2, 0]], [[0, 2, 0], [2, 2, 7], [6, 2, 0], [10, 2, 0], [14, 2, 4]]],
  hop: [[[0, 5, 0], [7, 3, 0], [10, 5, 0]], [[0, 3, 0], [3, 4, 0], [10, 2, 4], [12, 4, 0]]],
  long: [[[0, 10, 0], [10, 6, 0]], [[0, 6, 0], [6, 4, 0], [11, 5, 4]]],
  dembow: [[[0, 3, 0], [3, 3, 0], [8, 3, 0], [11, 3, 4]], [[0, 6, 0], [6, 2, 0], [8, 6, 0]]],
  afro: [[[0, 3, 0], [3, 3, 0], [6, 4, 4], [12, 4, 0]], [[0, 4, 0], [6, 2, 0], [10, 2, 4], [12, 3, 0]]],
  funk: [[[0, 2, 0], [3, 1, 7], [6, 2, 0], [7, 1, 0], [10, 2, 4], [14, 2, 7]], [[0, 3, 0], [4, 1, 7], [6, 2, 0], [10, 1, 0], [11, 2, 4], [14, 1, 7]]],
  drop: [[[0, 3, 0], [6, 2, 4], [8, 4, 0], [14, 2, 7]], [[0, 4, 0], [8, 2, 0], [10, 2, 4], [12, 4, 0]]]
};
// A melody's rhythm in a bar: the 16ths its notes start on.
const RHYTHMS = [[0, 3, 6, 8, 10, 12], [0, 2, 6, 8, 11, 14], [0, 4, 6, 10, 12], [0, 3, 4, 8, 11, 12, 14], [0, 6, 8, 14], [2, 4, 8, 10, 14], [0, 3, 6, 10]];
const CHILL7 = new Set(['hiphop', 'lofi', 'boombap', 'half', 'funk', 'garage', 'house', 'amapiano']);
// The instruments' octaves (their lowest C).
const LOW = { keys: 55, pluck: 60, lead: 67, pad: 55, bell: 72, organ: 55, strings: 55, brass: 55, guitar: 52, vox: 60, bass: 36, subbass: 28 };

// What a song is made from: { seed, mood, style }. The style, its tempo, the
// key and everything else from the seed (the page rotates the style so two
// in a row differ, and may name it).
export function radioSpec(seed, mood = 'all', style = null) {
  const R = makeRng(seed ^ 0x2545f491);
  const styles = moodStyles(mood);
  const st = style && styles.includes(style) ? style : R.choice(styles);
  const band = BAND[st];
  const minor = R.random() < ({ chill: 0.6, hype: 0.85, groove: 0.5, classic: 0.6 }[mood] ?? 0.65);
  return {
    seed, mood, style: st,
    bpm: R.int(band.bpm[0], band.bpm[1]),
    key: { tonic: R.int(0, 11), minor },
    prog: R.choice(PROGS[minor ? 'minor' : 'major']),
    chords: R.choice(band.chords), chords2: R.choice(band.chords), lead: R.choice(band.leads), lead2: R.choice(['pluck', 'bell', 'keys', 'guitar'].filter(x => x !== band.chords[0])), bass: R.choice(band.bass),
    snare: R.choice(['snare', 'clap', 'both']), tick: R.choice(['hat', 'shaker', 'rim']),
    sevenths: CHILL7.has(st) && R.random() < 0.7,
    seconds: R.uniform(80, 110)
  };
}

// The scale's degree d (0 the tonic; 7 an octave up) as a MIDI note from `low`.
function noteOf(key, d, low) {
  const steps = key.minor ? SCALES.minor : SCALES.major;
  const root = low + ((key.tonic - (low % 12) + 12) % 12);
  return root + 12 * Math.floor(d / 7) + steps[((d % 7) + 7) % 7];
}
const notesClip = (inst, key, notes, bars = 4) => ({ kind: 'notes', inst, bars, swing: 0, key, notes });
// The chords, one a bar, in close position (each tone the nearest above the instrument's low C: they lead into each other).
function chordClip(sp, inst, comp) {
  const notes = [];
  sp.prog.forEach((deg, bar) => {
    const tones = [0, 2, 4, ...(sp.sevenths ? [6] : [])].map(x => noteOf(sp.key, deg + x, LOW[inst]));
    const voiced = tones.map(m => LOW[inst] + 3 + ((((m - LOW[inst] - 3) % 12) + 12) % 12));
    for (const [step, len] of comp) for (const midi of voiced) notes.push({ step: bar * 16 + step, midi, len, lv: 3 });
  });
  return notesClip(inst, sp.key, notes);
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
      notes.push({ step: bar * 16 + step, midi: noteOf(sp.key, line[k], LOW[inst]), len: Math.max(1, Math.min(4, next - step)), ...(k === 0 ? { lv: 2 } : {}) });
    });
  }
  return notesClip(inst, sp.key, notes);
}
// The chord's tones up and down, in eighths or sixteenths.
function arpClip(R, sp, inst) {
  const fast = sp.bpm < 110;
  const shape = R.choice([[0, 2, 4, 2], [0, 2, 4, 7], [0, 4, 2, 4], [7, 4, 2, 0]]);
  const step = fast ? 2 : 4;
  const notes = [];
  sp.prog.forEach((deg, bar) => {
    for (let s = 0, k = 0; s < 16; s += step, k++) notes.push({ step: bar * 16 + s, midi: noteOf(sp.key, deg + shape[k % shape.length], LOW[inst]), len: step, lv: k % 2 ? 3 : 1 });
  });
  return notesClip(inst, sp.key, notes);
}
function bassClip(sp, inst, line) {
  const notes = [];
  sp.prog.forEach((deg, bar) => {
    for (const [step, len, tone] of line) notes.push({ step: bar * 16 + step, midi: noteOf(sp.key, deg + (tone === 7 ? 7 : tone === 4 ? 4 : 0), LOW[inst]), len });
  });
  return notesClip(inst, sp.key, notes);
}
// A bar of hats (or a shaker).
function hatClip(lanes) {
  const c = emptyDrums(1);
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
  const [ra, rb, rc] = [R.choice(RHYTHMS), R.choice(RHYTHMS), R.choice(RHYTHMS)];
  const chords = clip(chordClip(sp, sp.chords, comp[0]));
  const chords2 = clip(chordClip(sp, sp.chords2, comp[1]));
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
  const pad = clip(chordClip(sp, 'pad', COMP.held[0]));
  add(sum(melody, { ...pad, g: 0.4 }), 'phrase');
  add(sum(arp, { ...pad, g: 0.4 }), 'phrase');
  for (const line of LINES[band.line]) add(clip(bassClip(sp, sp.bass, line)), 'bass');
  // The hats: eighths, sixteenths with accents, off-beat open hats.
  add(clip(hatClip([['hat', [0, 2, 4, 6, 8, 10, 12, 14]], ['hat', [2, 6, 10, 14], 3]])), 'hat');
  add(clip(hatClip([['hat', [...Array(16).keys()], 3], ['hat', [0, 4, 8, 12], 1]])), 'hat');
  add(clip(hatClip([['open', [2, 6, 10, 14]], ['shaker', [1, 3, 5, 7, 9, 11, 13, 15], 3]])), 'hat');
  // The drums.
  const tonic808 = 28 + ((sp.key.tonic - 4 + 12) % 12);
  add(shot('kick', sr), 'kick');
  add(sum(shot('kick', sr), { ...shot('sub', sr, tonic808), g: 0.5 }), 'kick');
  add(shot('sub', sr, tonic808), 'sub');
  add(sp.snare === 'both' ? sum(shot('snare', sr), { ...shot('clap', sr), g: 0.7 }) : shot(sp.snare, sr), 'snare');
  add(shot(sp.tick, sr), 'tick');
  const roll = emptyDrums(1);
  for (const s of [0, 1, 2, 3]) roll.steps.snare[s] = 3;
  const rolled = clip(roll).L.subarray(0, Math.round((60 / sp.bpm) * sr));
  add({ L: rolled, R: rolled }, 'roll');
  const fill = hatClip([['tom', [0, 3, 6]], ['snare', [8, 10, 12, 13, 14, 15]], ['kick', [0]], ['crash', [0], 3]]);
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
  classic: { reverb: 0.2, delay: 0.12, pump: 0.25 }
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
    humanize: (MOODS[mood]?.humanize ?? 100) / 100, plan, mix: mixOf({ ...MIXES[mood] })
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

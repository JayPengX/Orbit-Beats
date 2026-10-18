// Orbit Beats' own instruments (樂器): drums and notes made here, no
// samples, so anyone can make clips with nothing to record. A clip is a
// bar, two or four on a 16th-note grid; rendered, it's a piece like any
// other (its role set: a drum loop 過門, a bass line 貝斯, a melody Riff),
// split into the kit and arranged into songs the same way. No DOM: the page
// plays the voices live (from the same hits, `stepHits`), the tests render
// them.
//
//   voice(inst, midi, sr, hold) -> Float32Array (one hit or note, ringing out)
//   renderClip(clip, sr, bpm) -> { sr, L, R } (exactly its bars long)
//   drumPattern(style, seed, bars), melody(key, inst, seed, bars) (自動編: a start written for you)

import { makeRng } from '../engine.mjs';

// The drums, left to right as the grid shows them: the kit, and the
// percussion beside it (a lane set each, eight to a phone's width).
export const DRUMS = ['kick', 'snare', 'clap', 'hat', 'open', 'rim', 'tom', 'sub'];
export const PERC = ['crash', 'ride', 'shaker', 'cowbell', 'conga', 'bongo', 'snap', 'perc'];
export const ALL_DRUMS = [...DRUMS, ...PERC];
export const DRUM_NAMES = {
  kick: ['大鼓', 'Kick'], snare: ['小鼓', 'Snare'], clap: ['拍手', 'Clap'], hat: ['閉鈸', 'Hat'], open: ['開鈸', 'Open hat'], rim: ['邊擊', 'Rim'], tom: ['中鼓', 'Tom'], sub: ['808', '808'],
  crash: ['銅鈸', 'Crash'], ride: ['疊音鈸', 'Ride'], shaker: ['沙鈴', 'Shaker'], cowbell: ['牛鈴', 'Cowbell'], conga: ['康加', 'Conga'], bongo: ['邦哥', 'Bongo'], snap: ['彈指', 'Snap'], perc: ['木魚', 'Block']
};
// The instruments that play notes, and the role each one's clip takes in a song.
export const INSTRUMENTS = ['keys', 'pluck', 'bass', 'lead', 'pad', 'bell', 'organ', 'strings', 'brass', 'guitar', 'subbass', 'vox'];
export const INSTRUMENT_NAMES = {
  keys: ['電鋼琴', 'Keys'], pluck: ['撥弦', 'Pluck'], bass: ['貝斯', 'Bass'], lead: ['主音', 'Lead'], pad: ['鋪底', 'Pad'], bell: ['鐘聲', 'Bell'],
  organ: ['風琴', 'Organ'], strings: ['弦樂', 'Strings'], brass: ['銅管', 'Brass'], guitar: ['吉他', 'Guitar'], subbass: ['低音', 'Sub bass'], vox: ['人聲', 'Vox']
};
export const INSTRUMENT_ROLE = { keys: 'riff', pluck: 'riff', bass: 'bass', lead: 'riff', pad: 'riff', bell: 'riff', organ: 'riff', strings: 'riff', brass: 'riff', guitar: 'riff', subbass: 'bass', vox: 'riff' };
// Each instrument's octave (the grid's lowest note's MIDI number for C).
export const OCTAVE = { keys: 60, pluck: 60, bass: 36, lead: 72, pad: 60, bell: 72, organ: 60, strings: 60, brass: 60, guitar: 48, subbass: 36, vox: 60 };
// How long a note is when tapped in (16ths): a pad holds, a bass is short.
export const NOTE_LEN = { keys: 2, pluck: 2, bass: 2, lead: 2, pad: 8, bell: 2, organ: 4, strings: 8, brass: 2, guitar: 2, subbass: 2, vox: 4 };
// The instruments that hold chords when written for you.
const CHORDAL = new Set(['pad', 'strings', 'organ']);

const hz = m => 440 * 2 ** ((m - 69) / 12);
const TAU = 2 * Math.PI;

// A small random source for the noisy voices: the same sound every time.
function noiseOf(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  };
}
// A two-pole resonant band-pass (a state-variable filter), for the vox's vowels and the cowbell.
function bandpass(x, sr, f, q = 6) {
  const out = new Float32Array(x.length);
  const k = 2 * Math.sin((Math.PI * f) / sr);
  let low = 0;
  let band = 0;
  for (let i = 0; i < x.length; i++) {
    low += k * band;
    const high = x[i] - low - band / q;
    band += k * high;
    out[i] = band;
  }
  return out;
}

// One hit or note: a drum (midi only for the 808's pitch) or an
// instrument's note, held `hold` seconds (the notes), then ringing out.
export function voice(inst, midi = 36, sr = 48000, hold = 0.25) {
  const len = s => new Float32Array(Math.max(1, Math.round(s * sr)));
  const env = (t, d) => Math.exp(-t / d);
  const noise = noiseOf(inst.length * 7919 + midi);
  let x;
  switch (inst) {
    case 'kick': {
      x = len(0.5);
      let ph = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        ph += (TAU * (46 + 120 * env(t, 0.035))) / sr;
        x[i] = Math.tanh(1.6 * Math.sin(ph) * env(t, 0.16)) * 0.85 + (i < sr * 0.004 ? noise() * 0.12 : 0);
      }
      break;
    }
    case 'sub': {
      x = len(1.2);
      let ph = 0;
      const f = hz(midi);
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        ph += (TAU * f * (1 + 1.2 * env(t, 0.02))) / sr;
        x[i] = Math.tanh(1.3 * Math.sin(ph)) * 0.75 * env(t, 0.45) * Math.min(1, t / 0.002);
      }
      break;
    }
    case 'snare': {
      x = len(0.35);
      let lp = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        lp += 0.45 * (noise() - lp);
        x[i] = 0.75 * lp * env(t, 0.07) + 0.45 * Math.sin(TAU * 185 * t) * env(t, 0.045);
      }
      break;
    }
    case 'clap': {
      x = len(0.4);
      let lp = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        lp += 0.5 * (noise() - lp);
        // Three quick claps, then the room.
        const bursts = [0, 0.011, 0.023].reduce((s, b) => s + (t >= b ? env(t - b, 0.008) : 0), 0);
        x[i] = 0.7 * lp * (bursts * 0.6 + env(t, 0.09) * 0.5);
      }
      break;
    }
    case 'hat':
    case 'open':
    case 'crash':
    case 'ride': {
      const shape = { hat: [0.09, 0.018, 0.45, 0.12, 317], open: [0.45, 0.11, 0.45, 0.12, 317], crash: [1.6, 0.45, 0.4, 0.1, 289], ride: [1.1, 0.35, 0.12, 0.22, 523] }[inst];
      const [secs, d, hiss, ping, base] = shape;
      x = len(secs);
      let p = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        const w = noise();
        const hi = w - p;
        p = w;
        // Metallic: squares at a cymbal's odd ratios under the noise.
        const metal = [3.0, 4.16, 5.43, 6.79].reduce((s, r) => s + Math.sign(Math.sin(TAU * base * r * t)), 0) / 4;
        x[i] = (hiss * hi + ping * metal) * env(t, d) * Math.min(1, t / 0.0008);
      }
      break;
    }
    case 'rim': {
      x = len(0.08);
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        x[i] = 0.55 * (Math.sin(TAU * 1700 * t) * 0.6 + Math.sin(TAU * 820 * t) * 0.5) * env(t, 0.012);
      }
      break;
    }
    case 'tom':
    case 'conga':
    case 'bongo': {
      const [f0, drop, d, secs] = { tom: [110, 60, 0.16, 0.45], conga: [196, 40, 0.14, 0.4], bongo: [330, 60, 0.08, 0.25] }[inst];
      x = len(secs);
      let ph = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        ph += (TAU * (f0 + drop * env(t, 0.03))) / sr;
        x[i] = 0.7 * Math.sin(ph) * env(t, d) + (i < sr * 0.003 ? noise() * 0.1 : 0);
      }
      break;
    }
    case 'shaker': {
      x = len(0.14);
      let p = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        const w = noise();
        const hi = w - p;
        p = w;
        x[i] = 0.4 * hi * Math.min(1, t / 0.012) * env(t, 0.035);
      }
      break;
    }
    case 'cowbell': {
      x = len(0.4);
      const raw = new Float32Array(x.length);
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        raw[i] = (Math.sign(Math.sin(TAU * 587 * t)) + Math.sign(Math.sin(TAU * 845 * t))) * (0.7 * env(t, 0.02) + 0.3 * env(t, 0.12));
      }
      const b = bandpass(raw, sr, 900, 3);
      for (let i = 0; i < x.length; i++) x[i] = Math.tanh(b[i] * 0.6) * 0.6;
      break;
    }
    case 'snap': {
      x = len(0.12);
      const raw = new Float32Array(x.length);
      for (let i = 0; i < x.length; i++) raw[i] = noise() * env(i / sr, 0.012);
      const b = bandpass(raw, sr, 2200, 4);
      for (let i = 0; i < x.length; i++) x[i] = b[i] * 0.7;
      break;
    }
    case 'perc': {
      x = len(0.12);
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        x[i] = 0.6 * (Math.sin(TAU * 900 * t) * 0.7 + Math.sin(TAU * 1630 * t) * 0.3) * env(t, 0.025);
      }
      break;
    }
    default: {
      // The notes: held `hold`, then each instrument's own release.
      const f = hz(midi);
      const rel = { keys: 0.5, pluck: 0.3, bass: 0.18, lead: 0.15, pad: 0.8, bell: 1.4, organ: 0.12, strings: 0.6, brass: 0.2, guitar: 0.6, subbass: 0.12, vox: 0.3 }[inst] ?? 0.3;
      x = len(hold + rel);
      let ph = 0;
      let lp = 0;
      // A plucked string (Karplus and Strong's): a burst of noise round a loop a period long.
      const period = Math.max(2, Math.round(sr / f));
      const ks = inst === 'guitar' ? Float32Array.from({ length: period }, () => noise() * 0.5) : null;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        const gate = t < hold ? 1 : env(t - hold, rel / 3);
        const vib = inst === 'vox' || inst === 'strings' ? 1 + 0.004 * Math.sin(TAU * 5.2 * t) * Math.min(1, t / 0.3) : 1;
        ph += (TAU * f * vib) / sr;
        let y;
        if (inst === 'keys') {
          // An electric piano: a sine, its bell-ish second partial dying fast.
          y = (Math.sin(ph) + 0.35 * Math.sin(2 * ph) * env(t, 0.25) + 0.15 * Math.sin(3 * ph + Math.sin(ph)) * env(t, 0.08)) * env(t, 1.2) * Math.min(1, t / 0.004);
          y *= 0.32;
        } else if (inst === 'pluck') {
          y = 0.34 * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)) * env(t, 0.22) * Math.min(1, t / 0.003);
        } else if (inst === 'bass') {
          // A saw through a closing low-pass.
          let saw = 0;
          for (let k = 1; k <= 8; k++) saw += Math.sin(k * ph) / k;
          lp += (0.08 + 0.4 * env(t, 0.06)) * (saw - lp);
          y = 0.42 * lp * Math.min(1, t / 0.003);
        } else if (inst === 'lead') {
          // Two squares a little apart.
          const sq = q => Math.sign(Math.sin(q)) * 0.5 + Math.sin(q) * 0.5;
          y = 0.15 * (sq(ph) + sq(ph * 1.006)) * Math.min(1, t / 0.006);
        } else if (inst === 'pad') {
          let saw = 0;
          for (let k = 1; k <= 6; k++) saw += (Math.sin(k * ph) + Math.sin(k * ph * 1.004)) / k;
          y = 0.12 * saw * Math.min(1, t / 0.12);
        } else if (inst === 'organ') {
          // Drawbars: the note, its octave, twelfth, and two octaves up.
          y = 0.16 * (Math.sin(ph) + 0.8 * Math.sin(2 * ph) + 0.5 * Math.sin(3 * ph) + 0.4 * Math.sin(4 * ph) + 0.2 * Math.sin(8 * ph)) * Math.min(1, t / 0.008);
        } else if (inst === 'strings') {
          // Three saws a little apart, a slow bow, a darker top.
          let saw = 0;
          for (let k = 1; k <= 7; k++) saw += (Math.sin(k * ph) + Math.sin(k * ph * 1.003) + Math.sin(k * ph * 0.997)) / (k * k ** 0.3);
          lp += 0.18 * (saw - lp);
          y = 0.1 * lp * Math.min(1, t / 0.15);
        } else if (inst === 'brass') {
          // A saw whose brightness swells at the start and settles.
          let saw = 0;
          for (let k = 1; k <= 10; k++) saw += Math.sin(k * ph) / k;
          lp += (0.06 + 0.3 * Math.min(1, t / 0.04) * env(t, 0.25)) * (saw - lp);
          y = 0.3 * lp * Math.min(1, t / 0.02);
        } else if (inst === 'guitar') {
          const j = i % period;
          const prev = ks[(j + period - 1) % period];
          const v = ks[j];
          ks[j] = 0.996 * 0.5 * (v + prev);
          y = 1.4 * v;
        } else if (inst === 'subbass') {
          y = 0.5 * Math.tanh(1.4 * Math.sin(ph)) * Math.min(1, t / 0.004);
        } else if (inst === 'vox') {
          // A sung "ah": a saw through the vowel's two formants.
          let saw = 0;
          for (let k = 1; k <= 12; k++) saw += Math.sin(k * ph) / k;
          y = saw * Math.min(1, t / 0.05);
        } else {
          // A bell: FM, its brightness ringing down.
          y = 0.3 * Math.sin(ph + 2.2 * env(t, 0.5) * Math.sin(3.5 * ph)) * env(t, 0.9) * Math.min(1, t / 0.002);
        }
        x[i] = y * gate;
      }
      if (inst === 'vox') {
        const a = bandpass(x, sr, 750, 5);
        const b = bandpass(x, sr, 1150, 6);
        for (let i = 0; i < x.length; i++) x[i] = (a[i] + 0.6 * b[i]) * 0.09;
      }
    }
  }
  // (No click where it stops.)
  const tail = Math.min(x.length, Math.round(0.004 * sr));
  for (let k = 0; k < tail; k++) x[x.length - 1 - k] *= k / tail;
  return x;
}

// ---- Clips -----------------------------------------------------------------------------
//
// { kind: 'drums', bars, swing, steps: { kick: [0/1/2 × 16·bars], … }, pitch: 808's MIDI }   (2: an accent)
// { kind: 'notes', inst, bars, swing, key: { tonic, minor }, notes: [{ step, midi, len, chord }] }   (len in 16ths; chord: its triad in the key)
export const STEPS = 16;
export const BAR_CHOICES = [1, 2, 4];
export const emptyDrums = (bars = 1) => ({ kind: 'drums', bars, swing: 0, pitch: 33, steps: Object.fromEntries(ALL_DRUMS.map(d => [d, new Array(STEPS * bars).fill(0)])) });
export const emptyNotes = (inst = 'keys', bars = 1, key = null) => ({ kind: 'notes', inst, bars, swing: 0, key, notes: [] });

// A clip kept from before (or typed in) made whole: every lane, its bars, its swing.
export function clipOf(c) {
  if (!c || typeof c !== 'object') return null;
  const bars = BAR_CHOICES.includes(c.bars) ? c.bars : 1;
  const swing = Number.isFinite(c.swing) ? Math.min(0.6, Math.max(0, c.swing)) : 0;
  if (c.kind === 'drums') {
    const out = emptyDrums(bars);
    out.swing = swing;
    out.pitch = Number.isInteger(c.pitch) && c.pitch >= 24 && c.pitch <= 48 ? c.pitch : 33;
    for (const d of ALL_DRUMS) {
      const lane = Array.isArray(c.steps?.[d]) ? c.steps[d] : [];
      for (let s = 0; s < STEPS * bars; s++) out.steps[d][s] = [0, 1, 2].includes(lane[s]) ? lane[s] : lane[s] ? 1 : 0;
    }
    return out;
  }
  if (c.kind === 'notes') {
    const inst = INSTRUMENTS.includes(c.inst) ? c.inst : 'keys';
    const key = c.key && Number.isInteger(c.key.tonic) && c.key.tonic >= 0 && c.key.tonic < 12 ? { tonic: c.key.tonic, minor: Boolean(c.key.minor) } : null;
    const notes = (Array.isArray(c.notes) ? c.notes : [])
      .filter(n => n && Number.isInteger(n.step) && n.step >= 0 && n.step < STEPS * bars && Number.isInteger(n.midi) && n.midi >= 12 && n.midi <= 120)
      .map(n => ({ step: n.step, midi: n.midi, len: Math.min(STEPS * 4, Math.max(1, Math.round(n.len) || 1)), ...(n.chord ? { chord: true } : {}) }));
    return { kind: 'notes', inst, bars, swing, key, notes };
  }
  return null;
}

// A note's triad in the key: it, the third and the fifth above it in the scale.
export function chordOf(midi, key) {
  const k = key || { tonic: 9, minor: true };
  const steps = k.minor ? SCALES.minor : SCALES.major;
  const pc = (((midi - k.tonic) % 12) + 12) % 12;
  const at = steps.indexOf(pc);
  if (at < 0) return [midi, midi + 4, midi + 7];
  const up = n => {
    const j = at + n;
    return midi - pc + 12 * Math.floor(j / 7) + steps[j % 7];
  };
  return [midi, up(2), up(4)];
}

// What sounds on step s of a clip: [{ inst, midi, len (16ths), gain }],
// and how late the step is played (a 16th's share: its swing).
export function stepHits(clip, s) {
  const out = [];
  if (clip.kind === 'drums') {
    for (const d of ALL_DRUMS) {
      const v = clip.steps[d]?.[s];
      if (!v) continue;
      // (Off-beat hats a little softer: a hand's accents; an accent louder.)
      const gain = (d === 'hat' && s % 2 ? 0.7 : 1) * (v === 2 ? 1.35 : 1);
      out.push({ inst: d, midi: d === 'sub' ? clip.pitch || 33 : 36, len: 1, gain });
    }
  } else
    for (const n of clip.notes)
      if (n.step === s) for (const m of n.chord ? chordOf(n.midi, clip.key) : [n.midi]) out.push({ inst: clip.inst, midi: m, len: n.len || 1, gain: n.chord ? 0.62 : 1 });
  return out;
}
export const swingOf = (clip, s) => (s % 2 ? clip.swing || 0 : 0);

// A clip as a piece: exactly its bars long (a loop of them), with a phone
// mic's faint noise floor all through, so splitting keeps it whole.
export function renderClip(clip, sr = 48000, bpm = 120) {
  const B = (60 / bpm) * sr;
  const n = Math.round(clip.bars * 4 * B);
  const L = new Float32Array(n);
  const cache = new Map();
  for (let s = 0; s < STEPS * clip.bars; s++) {
    const a = Math.round(((s + swingOf(clip, s)) / 4) * B);
    for (const { inst, midi, len, gain } of stepHits(clip, s)) {
      const hold = clip.kind === 'drums' ? 0.25 : (len / 4) * (60 / bpm);
      const key = `${inst}|${midi}|${hold}`;
      if (!cache.has(key)) cache.set(key, voice(inst, midi, sr, hold));
      const x = cache.get(key);
      for (let k = 0, j = a; k < x.length && j < n; k++, j++) L[j] += x[k] * gain;
    }
  }
  const floor = noiseOf(n);
  for (let i = 0; i < n; i++) L[i] += 2.5e-4 * floor();
  // (The loop's last moment eased to nothing: no click going round.)
  const ease = Math.min(n, Math.round(0.003 * sr));
  for (let k = 0; k < ease; k++) L[n - 1 - k] *= k / ease;
  return { sr, L, R: L };
}
// Has anything in it.
export const clipEmpty = clip => (clip.kind === 'drums' ? !ALL_DRUMS.some(d => (clip.steps[d] || []).some(Boolean)) : !clip.notes.length);
// The first bar copied over every other bar.
export function copyFirstBar(clip) {
  const c = JSON.parse(JSON.stringify(clip));
  if (c.kind === 'drums') for (const d of ALL_DRUMS) for (let s = STEPS; s < STEPS * c.bars; s++) c.steps[d][s] = c.steps[d][s % STEPS];
  else {
    const first = c.notes.filter(n => n.step < STEPS);
    c.notes = Array.from({ length: c.bars }, (_, b) => first.map(n => ({ ...n, step: n.step + b * STEPS }))).flat();
  }
  return c;
}
// A clip at another length: longer repeats what's there, shorter keeps the start.
export function resizeClip(clip, bars) {
  const c = JSON.parse(JSON.stringify(clip));
  const was = c.bars;
  if (bars === was) return c;
  if (c.kind === 'drums') for (const d of ALL_DRUMS) c.steps[d] = Array.from({ length: STEPS * bars }, (_, s) => c.steps[d][s % (STEPS * was)] || 0);
  else
    c.notes = bars > was
      ? Array.from({ length: bars / was }, (_, k) => c.notes.map(n => ({ ...n, step: n.step + k * STEPS * was }))).flat()
      : c.notes.filter(n => n.step < STEPS * bars);
  c.bars = bars;
  return c;
}

// ---- Scales and 自動編 ----------------------------------------------------------------

export const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] };
// The grid's rows: the scale's notes from the instrument's octave, `count` of them, lowest first.
export function scaleRows(tonic = 9, minor = true, base = 60, count = 8) {
  const steps = minor ? SCALES.minor : SCALES.major;
  const root = base + ((tonic - (base % 12) + 12) % 12) - (tonic > 4 ? 12 : 0);
  const out = [];
  for (let k = 0; out.length < count; k++) out.push(root + 12 * Math.floor(k / 7) + steps[k % 7]);
  return out;
}

// Each groove's drums over a bar, as the engine plays them (engine.mjs's
// GROOVES): the 16ths each drum hits, with a little chance in it.
const GROOVES = {
  four: { kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14] },
  hiphop: { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  trap: { sub: [0, 11], kick: [6], clap: [8], hat: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15] },
  half: { kick: [0, 11], snare: [8], hat: [0, 4, 8, 12] },
  broken: { kick: [0, 6, 10], snare: [4, 13], hat: [2, 6, 9, 14] },
  house: { kick: [0, 4, 8, 12], clap: [4, 12], open: [2, 6, 10, 14], hat: [0, 4, 8, 12] },
  dembow: { kick: [0, 4, 8, 12], snare: [3, 6, 11, 14], hat: [2, 10] },
  afro: { kick: [0, 6, 10], snare: [4, 12], rim: [3, 7, 13], shaker: [2, 7, 9, 13] },
  drill: { sub: [0, 6], kick: [11], snare: [8, 15], hat: [0, 3, 6, 9, 12, 15] },
  boombap: { kick: [0, 7, 10], snare: [4, 12], hat: [2, 6, 10, 14] },
  jersey: { kick: [0, 4, 8, 11, 14], clap: [4, 12], hat: [2, 6, 10] },
  amapiano: { kick: [0, 4, 8, 12], sub: [3, 9, 14], rim: [12], shaker: [1, 3, 5, 7, 9, 11, 13, 15] },
  lofi: { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  funk: { kick: [0, 3, 10], snare: [4, 12], rim: [7, 13], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  garage: { kick: [0, 11], snare: [4, 12], hat: [2, 6, 10, 14], shaker: [1, 3, 5, 7, 9, 11, 13, 15] },
  dnb: { kick: [0, 5, 8, 13], snare: [2, 6, 10, 14], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  reggae: { kick: [8], rim: [8], hat: [2, 6, 10, 14] },
  phonk: { sub: [0, 10], kick: [7], snare: [4, 12], cowbell: [0, 3, 6, 10, 12], hat: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15] },
  baile: { kick: [0, 3, 8, 11], snare: [6, 14], hat: [2, 4, 10, 12] },
  techno: { kick: [0, 4, 8, 12], clap: [4, 12], open: [2, 6, 10, 14], hat: [1, 3, 5, 7, 9, 11, 13, 15] }
};
export const GROOVE_STYLES = Object.keys(GROOVES);
export function drumPattern(style = 'trap', seed = 1, bars = 1) {
  const rng = makeRng(seed);
  const g = GROOVES[style] || GROOVES.trap;
  const clip = emptyDrums(bars);
  for (let b = 0; b < bars; b++)
    for (const [d, hits] of Object.entries(g))
      for (const s of hits) if (rng.random() < 0.94) clip.steps[d][b * STEPS + s] = 1;
  // The downbeat's kick a little harder; a bar's own touch: a ghost hit, or a hat roll at the end of the last bar.
  for (let b = 0; b < bars; b++) if (clip.steps.kick[b * STEPS]) clip.steps.kick[b * STEPS] = 2;
  const last = (bars - 1) * STEPS;
  if (rng.random() < 0.5) for (const s of [13, 14, 15]) clip.steps.hat[last + s] = 1;
  if (rng.random() < 0.4) clip.steps.kick[last + rng.choice([3, 7, 14])] = 1;
  clip.pitch = rng.choice([31, 33, 34, 36]);
  clip.swing = ['lofi', 'boombap', 'garage', 'hiphop'].includes(style) ? 0.25 : 0;
  return clip;
}

// A melody in the key: a phrase of the scale's steps that leans to the
// chord tones (the 1st, 3rd and 5th), on a rhythm with space in it, its
// second half answering the first; a bass line on the roots, lower and
// fewer notes; a pad, strings or organ holding chords. -> a notes clip.
export function melody({ tonic = 9, minor = true } = {}, inst = 'keys', seed = 1, bars = 1) {
  const rng = makeRng(seed);
  const rows = scaleRows(tonic, minor, OCTAVE[inst] ?? 60, 8);
  const clip = emptyNotes(inst, bars, { tonic, minor });
  const bass = INSTRUMENT_ROLE[inst] === 'bass';
  const held = CHORDAL.has(inst);
  const rhythms = bass
    ? [[0, 3, 6, 8, 11, 14], [0, 6, 8, 10], [0, 3, 8, 11], [0, 7, 8, 14]]
    : held
      ? [[0, 8], [0]]
      : [[0, 3, 6, 8, 10, 12], [0, 2, 6, 8, 11, 14], [0, 4, 6, 10, 12], [0, 3, 4, 8, 11, 12, 14]];
  const rhythm = rng.choice(rhythms);
  const chord = [0, 2, 4, 7];
  let at = rng.choice(chord);
  const first = [];
  for (let k = 0; k < rhythm.length; k++) {
    // A step or a leap to a chord tone; a bass on its roots and fifths; chords on the scale's strong degrees.
    if (bass) at = rng.choice([0, 0, 0, 4, 7, 3]);
    else if (held) at = rng.choice([0, 3, 4, 5]);
    else if (rng.random() < 0.6) at = Math.max(0, Math.min(7, at + rng.choice([-1, 1, -2, 2])));
    else at = rng.choice(chord);
    const next = rhythm[k + 1] ?? 16;
    first.push({ step: rhythm[k], row: at, len: Math.max(1, Math.min(held ? 8 : 4, next - rhythm[k])) });
  }
  for (let b = 0; b < bars; b++)
    for (const [k, x] of first.entries()) {
      // The answer: the last note home (to the root) on the last bar.
      const home = b === bars - 1 && k === first.length - 1;
      const row = home ? 0 : b % 2 && k >= first.length / 2 ? Math.max(0, Math.min(7, x.row + rng.choice([-1, 1]))) : x.row;
      clip.notes.push({ step: b * STEPS + x.step, midi: rows[row], len: x.len, ...(held ? { chord: true } : {}) });
    }
  return clip;
}

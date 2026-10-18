// Orbit Beats' own instruments (樂器): drums and notes made here, no
// samples, so anyone can make clips with nothing to record. A clip is a
// bar or two on a 16th-note grid; rendered, it's a piece like any other
// (its role set: a drum loop 過門, a bass line 貝斯, a melody Riff), split
// into the kit and arranged into songs the same way. No DOM: the page plays
// the voices live, the tests render them.
//
//   voice(inst, midi, sr) -> Float32Array (one hit or note, ringing out)
//   renderClip(clip, sr, bpm) -> { sr, L, R } (exactly its bars long)
//   drumPattern(style, rng), melody(key, inst, rng, bars) (自動編: a start written for you)

import { makeRng } from '../engine.mjs';

// The drums, top to bottom as the grid shows them.
export const DRUMS = ['kick', 'snare', 'clap', 'hat', 'open', 'rim', 'tom', 'sub'];
export const DRUM_NAMES = { kick: ['大鼓', 'Kick'], snare: ['小鼓', 'Snare'], clap: ['拍手', 'Clap'], hat: ['閉鈸', 'Hat'], open: ['開鈸', 'Open hat'], rim: ['邊擊', 'Rim'], tom: ['中鼓', 'Tom'], sub: ['808', '808'] };
// The instruments that play notes, and the role each one's clip takes in a song.
export const INSTRUMENTS = ['keys', 'pluck', 'bass', 'lead', 'pad', 'bell'];
export const INSTRUMENT_NAMES = { keys: ['電鋼琴', 'Keys'], pluck: ['撥弦', 'Pluck'], bass: ['貝斯', 'Bass'], lead: ['主音', 'Lead'], pad: ['鋪底', 'Pad'], bell: ['鐘聲', 'Bell'] };
export const INSTRUMENT_ROLE = { keys: 'riff', pluck: 'riff', bass: 'bass', lead: 'riff', pad: 'riff', bell: 'riff' };
// Each instrument's octave (the grid's lowest note's MIDI number for C).
export const OCTAVE = { keys: 60, pluck: 60, bass: 36, lead: 72, pad: 60, bell: 72 };

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
    case 'open': {
      x = len(inst === 'hat' ? 0.09 : 0.45);
      let p = 0;
      const d = inst === 'hat' ? 0.018 : 0.11;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        const w = noise();
        const hi = w - p;
        p = w;
        // Metallic: squares at a cymbal's odd ratios under the noise.
        const metal = [3.0, 4.16, 5.43, 6.79].reduce((s, r) => s + Math.sign(Math.sin(TAU * 317 * r * t)), 0) / 4;
        x[i] = (0.45 * hi + 0.12 * metal) * env(t, d);
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
    case 'tom': {
      x = len(0.45);
      let ph = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        ph += (TAU * (110 + 60 * env(t, 0.05))) / sr;
        x[i] = 0.7 * Math.sin(ph) * env(t, 0.16);
      }
      break;
    }
    default: {
      // The notes: held `hold`, then each instrument's own release.
      const f = hz(midi);
      const rel = { keys: 0.5, pluck: 0.3, bass: 0.18, lead: 0.15, pad: 0.8, bell: 1.4 }[inst] ?? 0.3;
      x = len(hold + rel);
      let ph = 0;
      let lp = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        const gate = t < hold ? 1 : env(t - hold, rel / 3);
        ph += (TAU * f) / sr;
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
        } else {
          // A bell: FM, its brightness ringing down.
          y = 0.3 * Math.sin(ph + 2.2 * env(t, 0.5) * Math.sin(3.5 * ph)) * env(t, 0.9) * Math.min(1, t / 0.002);
        }
        x[i] = y * gate;
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
// { kind: 'drums', bars, steps: { kick: [0/1 × 16·bars], … }, pitch: 808's MIDI }
// { kind: 'notes', inst, bars, notes: [{ step, midi, len }] }   (len in 16ths)
export const STEPS = 16;
export const emptyDrums = (bars = 1) => ({ kind: 'drums', bars, pitch: 33, steps: Object.fromEntries(DRUMS.map(d => [d, new Array(STEPS * bars).fill(0)])) });
export const emptyNotes = (inst = 'keys', bars = 1) => ({ kind: 'notes', inst, bars, notes: [] });

// A clip as a piece: exactly its bars long (a loop of them), with a phone
// mic's faint noise floor all through, so splitting keeps it whole.
export function renderClip(clip, sr = 48000, bpm = 120) {
  const B = (60 / bpm) * sr;
  const n = Math.round(clip.bars * 4 * B);
  const L = new Float32Array(n);
  const at = (x, step, gain = 1) => {
    const a = Math.round((step / 4) * B);
    for (let k = 0; k < x.length; k++) {
      const j = a + k;
      if (j >= n) break;
      L[j] += x[k] * gain;
    }
  };
  if (clip.kind === 'drums') {
    const cache = {};
    for (const d of DRUMS)
      (clip.steps[d] || []).forEach((on, s) => {
        if (!on) return;
        cache[d] ||= voice(d, d === 'sub' ? clip.pitch || 33 : 36, sr);
        // (Off-beat hats a little softer: a hand's accents.)
        at(cache[d], s, d === 'hat' && s % 2 ? 0.7 : 1);
      });
  } else {
    for (const note of clip.notes) at(voice(clip.inst, note.midi, sr, ((note.len || 1) / 4) * (60 / bpm)), note.step);
  }
  const floor = noiseOf(n);
  for (let i = 0; i < n; i++) L[i] += 2.5e-4 * floor();
  // (The loop's last moment eased to nothing: no click going round.)
  const ease = Math.min(n, Math.round(0.003 * sr));
  for (let k = 0; k < ease; k++) L[n - 1 - k] *= k / ease;
  return { sr, L, R: L };
}
// Has anything in it.
export const clipEmpty = clip => (clip.kind === 'drums' ? !DRUMS.some(d => (clip.steps[d] || []).some(Boolean)) : !clip.notes.length);

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
// drums()): the 16ths each drum hits, with a little chance in it.
const GROOVES = {
  four: { kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14] },
  hiphop: { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  trap: { sub: [0, 11], kick: [6], clap: [8], hat: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15] },
  half: { kick: [0, 11], snare: [8], hat: [0, 4, 8, 12] },
  broken: { kick: [0, 6, 10], snare: [4, 13], hat: [2, 6, 9, 14] },
  house: { kick: [0, 4, 8, 12], clap: [4, 12], open: [2, 6, 10, 14], hat: [0, 4, 8, 12] },
  dembow: { kick: [0, 4, 8, 12], snare: [3, 6, 11, 14], hat: [2, 10] },
  afro: { kick: [0, 6, 10], snare: [4, 12], rim: [3, 7, 13], hat: [2, 7, 9, 13] },
  drill: { sub: [0, 6], kick: [11], snare: [8, 15], hat: [0, 3, 6, 9, 12, 15] },
  boombap: { kick: [0, 7, 10], snare: [4, 12], hat: [2, 6, 10, 14] },
  jersey: { kick: [0, 4, 8, 11, 14], clap: [4, 12], hat: [2, 6, 10] },
  amapiano: { kick: [0, 4, 8, 12], sub: [3, 9, 14], rim: [12], hat: [1, 3, 5, 7, 9, 11, 13, 15] }
};
export const GROOVE_STYLES = Object.keys(GROOVES);
export function drumPattern(style = 'trap', seed = 1, bars = 1) {
  const rng = makeRng(seed);
  const g = GROOVES[style] || GROOVES.trap;
  const clip = emptyDrums(bars);
  for (let b = 0; b < bars; b++)
    for (const [d, hits] of Object.entries(g))
      for (const s of hits) if (rng.random() < 0.94) clip.steps[d][b * STEPS + s] = 1;
  // A bar's own touch: a ghost hit, or a hat roll at the end of the last bar.
  const last = (bars - 1) * STEPS;
  if (rng.random() < 0.5) for (const s of [13, 14, 15]) clip.steps.hat[last + s] = 1;
  if (rng.random() < 0.4) clip.steps.kick[last + rng.choice([3, 7, 14])] = 1;
  clip.pitch = rng.choice([31, 33, 34, 36]);
  return clip;
}

// A melody in the key: a phrase of the scale's steps that leans to the
// chord tones (the 1st, 3rd and 5th), on a rhythm with space in it, its
// second half answering the first; a bass line on the roots, lower and
// fewer notes. -> a notes clip.
export function melody({ tonic = 9, minor = true } = {}, inst = 'keys', seed = 1, bars = 1) {
  const rng = makeRng(seed);
  const rows = scaleRows(tonic, minor, OCTAVE[inst] ?? 60, 8);
  const clip = emptyNotes(inst, bars);
  const bass = inst === 'bass';
  const pad = inst === 'pad';
  const rhythms = bass
    ? [[0, 3, 6, 8, 11, 14], [0, 6, 8, 10], [0, 3, 8, 11], [0, 7, 8, 14]]
    : pad
      ? [[0, 8], [0]]
      : [[0, 3, 6, 8, 10, 12], [0, 2, 6, 8, 11, 14], [0, 4, 6, 10, 12], [0, 3, 4, 8, 11, 12, 14]];
  const rhythm = rng.choice(rhythms);
  const chord = [0, 2, 4, 7];
  let at = rng.choice(chord);
  const first = [];
  for (let k = 0; k < rhythm.length; k++) {
    // A step or a leap to a chord tone; a bass on its roots and fifths.
    if (bass) at = rng.choice([0, 0, 0, 4, 7, 3]);
    else if (rng.random() < 0.6) at = Math.max(0, Math.min(7, at + rng.choice([-1, 1, -2, 2])));
    else at = rng.choice(chord);
    const next = rhythm[k + 1] ?? 16;
    first.push({ step: rhythm[k], row: at, len: Math.max(1, Math.min(pad ? 8 : 4, next - rhythm[k])) });
  }
  for (let b = 0; b < bars; b++)
    for (const [k, x] of first.entries()) {
      // The answer: the last note home (to the root) on the last bar.
      const home = b === bars - 1 && k === first.length - 1;
      const row = home ? 0 : b % 2 && k >= first.length / 2 ? Math.max(0, Math.min(7, x.row + rng.choice([-1, 1]))) : x.row;
      clip.notes.push({ step: b * STEPS + x.step, midi: rows[row], len: x.len });
    }
  return clip;
}

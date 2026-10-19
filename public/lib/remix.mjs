// 重新混音 and 取出片段, the logic with no screen: what a remix changes in a song's
// recipe (and leaves alone), and which stretch and which part of a song a clip is.
// Imported by the song maker's worker (lib/make.mjs): no DOM, and no names/lang/icons/ui.

import { STYLES, makeRng, SECTIONS } from '../engine.mjs';
import { radioSpec, radioPlan, bandSounds } from './radio.mjs';
import { clampLength } from './length.mjs';
import { barSeconds } from './sections.mjs';

export const SPEED = 1.15;
export const LONGER = 1.5;
export const BPM_MIN = 50;
export const BPM_MAX = 200;
const SPEED_MIN = 0.6;
const SPEED_MAX = 1.6;

// The parts a clip can be: which of the mixer's buses each is made of.
export const PARTS = ['all', 'drums', 'bass', 'melody'];
const BUSES_OF = { drums: ['drums', 'hats'], bass: ['bass'], melody: ['keys'] };

// ---- Playing a stretch of audio at another speed (a tape's: the pitch follows) ----

const lin = (x, f) => {
  const n = Math.max(1, Math.round(x.length / f));
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * f;
    const a = Math.floor(p);
    o[i] = x[Math.min(a, x.length - 1)] * (1 - (p - a)) + x[Math.min(a + 1, x.length - 1)] * (p - a);
  }
  return o;
};
// f > 1: faster and shorter. -> { sr, L, R }
export function retime(a, f) {
  const L = lin(a.L, f);
  return { sr: a.sr, L, R: a.R === a.L ? L : lin(a.R, f) };
}

// ---- A clip: one section, one part ----

// Where a section is, in samples: { bar, bars, from, to, seconds } (`k` its place in the plan).
export function clipSpan(plan, bpm, k, sr) {
  let bar = 0;
  for (let i = 0; i < k; i++) bar += plan[i][1];
  const bars = plan[k][1];
  const from = Math.round(barSeconds(bpm, bar) * sr);
  const seconds = barSeconds(bpm, bars);
  return { bar, bars, from, to: from + Math.round(seconds * sr), seconds };
}
// The samples [from, to) of the whole song (`src` an audio) or of the buses a part is made of (`src` the stems);
// exactly to - from long (silence past the end), its edges eased. -> { sr, L, R, peak }
export function partOf(src, part, from, to) {
  const buses = part === 'all' ? [src] : (BUSES_OF[part] || []).map(b => src[b]).filter(Boolean);
  const n = to - from;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (const a of buses) {
    const end = Math.min(to, a.L.length);
    for (let i = from; i < end; i++) {
      L[i - from] += a.L[i];
      R[i - from] += a.R[i];
    }
  }
  const sr = buses[0]?.sr || 32000;
  const fade = Math.min(Math.round(sr * 0.003), n >> 1);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const g = i < fade ? i / fade : n - 1 - i < fade ? (n - 1 - i) / fade : 1;
    L[i] *= g;
    R[i] *= g;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  return { sr, L, R, peak };
}

// ---- A remix ----

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (R, xs) => xs[Math.floor(R() * xs.length) % xs.length];
export const baseTitle = t => String(t).replace(/\s*\((?:Remix|混音)\)\s*$/, '');

// What kind of recipe this is, and so what a remix can do to it.
//   radio: the app's band (recipe.radio: seed, mood, style and the remix's own overrides)
//   band:  a jam take on the built-in band (recipe.band + jam)
//   kit:   a song of the user's own pieces (needs them loaded)
//   jam:   a take on the user's own pieces
export const kindOfRecipe = r => (r?.print === 'radio' && r.radio ? 'radio' : r?.band ? 'band' : r?.jam ? 'jam' : 'kit');
export const CAN = {
  radio: { style: true, speed: true, sounds: true, length: true },
  band: { style: true, speed: true, sounds: true, length: false },
  kit: { style: true, speed: true, sounds: true, length: true },
  jam: { style: false, speed: true, sounds: false, length: false }
};

// A song as it stands, for a remix to start from: { recipe, bpm, seconds, style }.
// `info` is the song's own (its tempo, length, groove).
export function baseOf(recipe, info = {}) {
  return { recipe, bpm: info.bpm || 0, seconds: info.seconds || 0, style: info.style || null };
}
// A radio song's recipe from just what a track says (seed, mood, groove, tempo, length).
export function radioBase(t) {
  return { recipe: { print: 'radio', radio: { seed: t.seed, mood: t.mood || 'all', style: t.style } }, bpm: t.bpm || 0, seconds: t.seconds || 0, style: t.style };
}
// A song of the user's own pieces, remade on the built-in band when those aren't loaded:
// its groove and length kept, its seed (so its key and chords are its own band's).
export function bandBase(recipe, info = {}, fresh = 1) {
  const style = STYLES.includes(info.style) ? info.style : null;
  const seed = Number.isFinite(recipe?.seed) ? recipe.seed : Number.isFinite(recipe?.band?.seed) ? recipe.band.seed : fresh;
  const radio = { seed, mood: 'all', style: style || radioSpec(seed, 'all').style };
  if (Number.isFinite(info.seconds) && info.seconds > 0) radio.seconds = clampLength(info.seconds);
  return { recipe: { print: 'radio', radio }, bpm: 0, seconds: info.seconds || 0, style: radio.style };
}

// The numbers a radio recipe stands on now (its own choices over the seed's).
function radioNow(radio) {
  const sp = radioSpec(radio.seed, radio.mood || 'all', radio.style);
  const bpm = radio.bpm ?? sp.bpm;
  return { sp, bpm, lead: radio.lead ?? sp.lead, chords: radio.chords ?? sp.chords, chords2: radio.chords2 ?? sp.chords2 };
}

// The length a Longer / Shorter tap asks for, from the song's (seconds), in whole tens, 0:30 to 8:00.
export const lengthStep = (seconds, dir) => clampLength(dir > 0 ? seconds * LONGER : seconds / LONGER);
// The tempo a Faster / Slower tap asks for.
export const speedStep = (bpm, dir) => clamp(Math.round(dir > 0 ? bpm * SPEED : bpm / SPEED), BPM_MIN, BPM_MAX);

// One choice made on a song: `choice` is { style?: a groove | 'random', speed?: 1 | -1, sounds?: true, length?: 1 | -1 }.
// Anything not chosen is left as it was. `rand` is a function () -> [0, 1).
// -> { recipe, changed: ['style', …] } (changed: the choices that took, a style the song is already in not among them)
export function remix(base, choice, rand = Math.random) {
  const kind = kindOfRecipe(base.recipe);
  const can = CAN[kind];
  const changed = [];
  const seedOf = () => Math.floor(rand() * 1e9);
  let r;
  if (kind === 'radio') {
    const radio = { ...base.recipe.radio };
    const now = radioNow(radio);
    const bpm = base.bpm || now.bpm;
    let seconds = radio.seconds ?? (base.seconds || now.sp.seconds);
    if (choice.style) {
      const others = STYLES.filter(s => s !== radio.style);
      const st = choice.style === 'random' ? pick(rand, others) : choice.style;
      if (STYLES.includes(st) && st !== radio.style) {
        // (The mood's own grooves don't hold the new one: it plays under 'all'. The tempo and length it had stay;
        // the instruments are the new groove's, unless picked.)
        Object.assign(radio, { style: st, mood: 'all', bpm: radio.bpm ?? Math.round(bpm), seconds: clampLength(seconds) });
        changed.push('style');
      }
    }
    if (choice.speed) {
      radio.bpm = speedStep(radio.bpm ?? bpm, choice.speed);
      changed.push('speed');
    }
    if (choice.sounds) {
      const cur = radioNow(radio);
      const s = bandSounds(radio.style);
      const R = makeRng(seedOf());
      const other = (xs, now) => (xs.length > 1 ? R.choice(xs.filter(x => x !== now)) : xs[0]);
      Object.assign(radio, { lead: other(s.leads, cur.lead), chords: other(s.chords, cur.chords), chords2: other(s.chords, cur.chords2) });
      changed.push('sounds');
    }
    if (choice.length) {
      radio.seconds = lengthStep(radio.seconds ?? seconds, choice.length);
      changed.push('length');
    }
    r = { ...base.recipe, radio };
  } else if (kind === 'band') {
    const band = { ...base.recipe.band };
    r = { ...base.recipe };
    if (choice.style) {
      const st = choice.style === 'random' ? pick(rand, STYLES.filter(s => s !== band.style)) : choice.style;
      if (STYLES.includes(st) && st !== band.style) (band.style = st), changed.push('style');
    }
    if (choice.sounds) (band.seed = seedOf()), changed.push('sounds');
    r.band = band;
    if (choice.speed) (r.speed = clamp((r.speed || 1) * (choice.speed > 0 ? SPEED : 1 / SPEED), SPEED_MIN, SPEED_MAX)), changed.push('speed');
  } else {
    r = { ...base.recipe };
    if (can.style && choice.style) {
      const st = choice.style === 'random' ? pick(rand, STYLES.filter(s => s !== base.style)) : choice.style;
      if (STYLES.includes(st) && st !== base.style) (r.style = st), changed.push('style');
    }
    if (can.sounds && choice.sounds) (r.detail = seedOf()), changed.push('sounds');
    if (choice.speed) (r.speed = clamp((r.speed || 1) * (choice.speed > 0 ? SPEED : 1 / SPEED), SPEED_MIN, SPEED_MAX)), changed.push('speed');
    if (can.length && choice.length) {
      // (Sections for the length asked at the tempo the song will play at: the pieces' own, times any speed.)
      const at = (base.bpm || 100) / (base.recipe.speed || 1) * (r.speed || 1);
      r.plan = radioPlan(makeRng(seedOf()), at, lengthStep(base.seconds, choice.length), true);
      changed.push('length');
    }
  }
  return { recipe: r, changed };
}

// Surprise me: two or three of the choices the song can take, each a random way.
export function surprise(base, rand = Math.random, kind = kindOfRecipe(base.recipe)) {
  const can = CAN[kind];
  const names = ['style', 'speed', 'sounds', 'length'].filter(n => can[n]);
  const n = Math.min(names.length, rand() < 0.5 ? 2 : 3);
  const chosen = [];
  while (chosen.length < n) {
    const i = Math.floor(rand() * names.length) % names.length;
    chosen.push(names.splice(i, 1)[0]);
  }
  const choice = {};
  for (const c of chosen) choice[c] = c === 'style' ? 'random' : c === 'sounds' ? true : rand() < 0.5 ? 1 : -1;
  return choice;
}

// A remix's id: the song's, and what was done (the same remix again is the same song).
export const remixId = (id, recipe) => `${id}:rx${[...JSON.stringify(recipe)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`;
export const remixTitle = t => `${baseTitle(t)} (Remix)`;
export { SECTIONS };

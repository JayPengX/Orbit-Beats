// 節奏遊戲, the rhythm game: every song of the radio is a level. Its chart is
// drawn from the song's own notes (lib/radio.mjs's radioSong: the drums'
// hits as the engine placed them, and the melody and chords inside each riff),
// so every tap lands on a sound you hear; a long chord or note is a hold.
// Four lanes, four levels; judged by the ear's windows, scored to 1,000,000.
// No DOM (lib/gameview.mjs draws it).

import { swingOf } from './synth.mjs';

// The one hook in the song maker (lib/radio.mjs): a piece with its notes riding along, as
// `tune`: [{ inst, g, notes: [[beat, midi, beats long]] }]. From a clip (its notes, swing in
// the beat) or from parts summed (theirs, each at its level). -> the piece
export function noted(piece, { clip = null, parts = null } = {}) {
  const tune = clip
    ? clip.kind === 'notes' && clip.notes.length ? [{ inst: clip.inst, g: 1, notes: clip.notes.map(n => [(n.step + swingOf(clip, n.step)) / 4, n.midi, n.len / 4]) }] : []
    : (parts || []).flatMap(x => (x.tune || []).map(t => ({ ...t, g: t.g * (x.g ?? 1) })));
  return tune.length ? { ...piece, tune } : piece;
}

export const LANES = 4;
export const LEVELS = ['easy', 'normal', 'hard', 'expert'];
export const LEVEL_NAMES = { easy: ['簡單', 'Easy'], normal: ['普通', 'Normal'], hard: ['困難', 'Hard'], expert: ['專家', 'Expert'] };
// Each level: the grid notes keep to (beats), the least time between two (s),
// how long a held sound must be to be a hold (beats), and how often two lanes at once.
const RULES = {
  easy: { grid: 1, gap: 0.42, hold: 2, two: 0 },
  normal: { grid: 0.5, gap: 0.24, hold: 1.5, two: 0 },
  hard: { grid: 0.25, gap: 0.15, hold: 1, two: 0.35 },
  expert: { grid: 0.25, gap: 0.1, hold: 1, two: 0.7 }
};
// Played with two thumbs: the left one on lanes 0 and 1, the right on 2 and 3. Each level: the least
// time between two notes for one thumb (s), and the most notes in any one second.
export const thumbOf = lane => (lane < LANES / 2 ? 0 : 1);
export const THUMBS = {
  easy: { same: 0.5, dense: 3 },
  normal: { same: 0.32, dense: 5 },
  hard: { same: 0.22, dense: 7 },
  expert: { same: 0.17, dense: 9 }
};
// After a hold lets go, the time before that thumb taps again (s).
export const LIFT = 0.15;
// What leads in each section: the hook sings, the verse drums, the quiet ones hold.
const LEADS = {
  hook: { lead: 5, kick: 4, snare: 3.5, chord: 2, tick: 1 },
  verse: { kick: 5, snare: 4.5, lead: 3.5, chord: 2, tick: 1.5 },
  pre: { snare: 5, lead: 4, kick: 3, chord: 2, tick: 1.5 },
  bridge: { lead: 4, chord: 4, kick: 3.5, snare: 3, tick: 1 },
  break: { chord: 5, lead: 4.5, tick: 2, kick: 1, snare: 1 },
  intro: { chord: 5, lead: 4, tick: 2, kick: 3, snare: 2 },
  outro: { chord: 5, lead: 4, kick: 3, snare: 2, tick: 1 }
};
const DRUM = { kick: 'kick', sub: 'kick', snare: 'snare', tick: 'tick' };
const NEAR = 0.035; // a sound this close to the grid (s) is on it

// The section a beat is in: [[type, bars], …] -> type
function sectionAt(plan, beat) {
  let at = 0;
  for (const [t, n] of plan) {
    at += n * 4;
    if (beat < at) return t;
  }
  return plan.at(-1)?.[0] || 'verse';
}
// The part of a riff that sings: of its one-note-at-a-time parts, the loudest (then the one with fewer notes).
function leadOf(tune) {
  const mono = tune.filter(p => new Set(p.notes.map(n => n[0])).size === p.notes.length);
  return mono.sort((a, b) => b.g - a.g || a.notes.length - b.notes.length)[0] || null;
}
// Its chords, each once: where any part with notes together plays one (the loudest first), its lowest note,
// held as long as any of those parts holds it (a soft pad under a short stab rings on: a hold).
function chordsOf(tune) {
  const poly = tune.filter(p => new Set(p.notes.map(n => n[0])).size < p.notes.length).sort((a, b) => b.g - a.g);
  if (!poly.length) return [];
  const by = new Map();
  for (const p of poly)
    for (const [b, m, l] of p.notes) {
      const c = by.get(b);
      if (!c) by.set(b, [b, m, l, p]);
      else (c[1] = c[3] === p ? Math.min(c[1], m) : c[1]), (c[2] = Math.max(c[2], l));
    }
  return [...by.values()].map(([b, m, l]) => [b, m, l]);
}

// Every sound a note could be: { t, beat, kind, midi, len (beats) }, in time order.
export function sounds({ events, roles, tunes, sr, bpm, seconds }) {
  const spb = 60 / bpm;
  const out = [];
  for (const e of events) {
    const role = roles[e.i];
    const t0 = e.a / sr;
    if (DRUM[role]) out.push({ t: t0, beat: e.beat, kind: DRUM[role], midi: role === 'snare' ? 62 : role === 'tick' ? 70 : 36, len: 0 });
    const tune = tunes[e.i];
    if (!tune || (role !== 'riff' && role !== 'phrase')) continue;
    const lead = leadOf(tune);
    for (const [b, m, l] of lead?.notes || []) out.push({ t: t0 + b * spb, beat: e.beat + b, kind: 'lead', midi: m, len: l });
    for (const [b, m, l] of chordsOf(tune)) out.push({ t: t0 + b * spb, beat: e.beat + b, kind: 'chord', midi: m, len: l });
  }
  // (A loop that runs on past the song's end has no note there.)
  return out.filter(x => x.t >= 0.25 && x.t < seconds - 0.4).sort((a, b) => a.t - b.t || a.beat - b.beat);
}

// A small seeded generator, so a song's chart is the same every time.
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A level's chart. -> { notes: [{ t, lane, end? }], bpm, seconds, level }
// (end: a hold's end, in seconds. Notes in time order; playable with two thumbs: at most one note a thumb
// at a time, nothing for a thumb while it holds, each thumb's notes far enough apart, and a level's density.)
export function chartOf(song, level = 'normal', seed = 1) {
  const L = RULES[level] || RULES.normal;
  const T = THUMBS[level] || THUMBS.normal;
  const spb = 60 / song.bpm;
  const R = rng(seed ^ (LEVELS.indexOf(level) + 1) * 0x9e3779b1);
  const all = sounds(song);
  // The melody's range, for its lanes: low notes left, high right.
  const tones = all.filter(x => x.kind === 'lead' || x.kind === 'chord').map(x => x.midi).sort((a, b) => a - b);
  const lo = tones[Math.floor(tones.length * 0.1)] ?? 48;
  const hi = Math.max(lo + 5, tones[Math.floor(tones.length * 0.9)] ?? 72);
  const laneOf = m => Math.max(0, Math.min(LANES - 1, Math.round(((m - lo) / (hi - lo)) * (LANES - 1))));
  // On the grid only: each slot's best sound by what leads its section, then by the time it lands.
  const slots = new Map();
  for (const x of all) {
    const g = Math.round(x.beat / L.grid);
    if (Math.abs(x.beat - g * L.grid) * spb > NEAR) continue;
    const sec = sectionAt(song.plan, x.beat);
    const w = (LEADS[sec] || LEADS.verse)[x.kind] || 0;
    if (!w || (x.kind === 'tick' && level !== 'expert' && level !== 'hard')) continue;
    if (!slots.has(g)) slots.set(g, []);
    slots.get(g).push({ ...x, w, sec });
  }
  const notes = [];
  let last = -1;
  let lastLane = -1;
  let side = 0;
  // Each thumb: when it last tapped, and when its hold lets go. A thumb is free for a note once both are far enough behind.
  const thumbs = [0, 1].map(() => ({ t: -9, end: -9 }));
  const ready = (lane, t) => {
    const h = thumbs[thumbOf(lane)];
    return t - h.t >= T.same - 1e-6 && t - h.end >= LIFT - 1e-6;
  };
  // (Never more than a level's notes in any one second.)
  const room = t => {
    let k = notes.length;
    while (k && notes[k - 1].t > t - 1 + 1e-6) k--;
    return notes.length - k < T.dense;
  };
  const place = n => {
    notes.push(n);
    const h = thumbs[thumbOf(n.lane)];
    h.t = n.t;
    h.end = n.end ?? n.t;
  };
  for (const g of [...slots.keys()].sort((a, b) => a - b)) {
    const [x, ...others] = slots.get(g).sort((a, b) => b.w - a.w || a.t - b.t);
    if (x.t - last < L.gap || !room(x.t)) continue;
    // Easy: only the strong beats of a section (each one, and every other beat in the busy ones).
    if (level === 'easy' && x.sec !== 'break' && x.sec !== 'intro' && x.sec !== 'outro' && g % 2 && x.kind !== 'lead') continue;
    let lane;
    if (x.kind === 'kick') lane = side % 2 ? 1 : 0;
    else if (x.kind === 'snare') lane = side % 2 ? 2 : 3;
    else if (x.kind === 'tick') lane = lastLane < 2 ? 3 : 0;
    else lane = laneOf(x.midi);
    if (x.kind === 'kick' || x.kind === 'snare') side++;
    // (No jack: the same lane again too soon steps aside, the way the tune moves.)
    if (lane === lastLane && x.t - last < 0.3) lane = lane === 0 ? 1 : lane === LANES - 1 ? LANES - 2 : lane + (R() < 0.5 ? -1 : 1);
    // (Its thumb still busy: the other thumb takes it, on its nearer lane; both busy, no note.)
    if (!ready(lane, x.t)) lane = (lane < 2 ? [2, 3] : [1, 0]).find(k => k !== lastLane && ready(k, x.t)) ?? -1;
    if (lane < 0) continue;
    const n = { t: round(x.t), lane };
    const melodic = x.kind === 'lead' || x.kind === 'chord';
    if (melodic && x.len >= L.hold && x.len * spb >= 0.45) {
      n.end = round(x.t + x.len * spb * 0.85);
      // (Easy and normal: one thing at a time, so nothing starts inside a hold.)
      if (level === 'easy' || level === 'normal') last = n.end;
    }
    place(n);
    if (!n.end || level === 'hard' || level === 'expert') last = x.t;
    lastLane = lane;
    // Two at once: a hook's or a verse's downbeat where another sound lands too, one note a thumb.
    if (L.two && !n.end && others.length && x.beat % 4 === 0 && (x.sec === 'hook' || (level === 'expert' && x.sec === 'verse')) && R() < L.two && room(x.t)) {
      const o = (lane < 2 ? [3, 2] : [0, 1]).find(k => ready(k, x.t));
      if (o != null) place({ t: n.t, lane: o });
    }
  }
  return { notes, bpm: song.bpm, seconds: song.seconds, level };
}
const round = x => Math.round(x * 1000) / 1000;

// All four levels of a song. -> { easy, normal, hard, expert }
export const chartsOf = (song, seed = 1) => Object.fromEntries(LEVELS.map(l => [l, chartOf(song, l, seed)]));

// ---- Judging ----

// How far from the note a tap may be (s), each grade.
export const WINDOWS = { perfect: 0.045, great: 0.09, good: 0.135 };
export const GRADES = ['perfect', 'great', 'good', 'miss'];
export const GRADE_NAMES = { perfect: ['完美', 'Perfect'], great: ['很好', 'Great'], good: ['不錯', 'Good'], miss: ['失誤', 'Miss'] };
const WORTH = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };
// A tap `dt` seconds from its note (minus early). -> a grade, or null (too far: no note taken)
export const judge = dt => (Math.abs(dt) <= WINDOWS.perfect ? 'perfect' : Math.abs(dt) <= WINDOWS.great ? 'great' : Math.abs(dt) <= WINDOWS.good ? 'good' : null);
// How many judgements a chart has: a note one, a hold two (its start and holding to its end).
export const unitsOf = chart => chart.notes.reduce((s, n) => s + (n.end ? 2 : 1), 0);
// The fever: from this combo on, the stage lights up (no change to the score).
export const FEVER = 50;

// A round's tally to its score: 900,000 for the grades, 100,000 for the longest combo. -> { score, acc, grade, full, allPerfect }
export function scoreOf({ perfect = 0, great = 0, good = 0, miss = 0, combo = 0 }, units) {
  const n = Math.max(1, units);
  const acc = (perfect * WORTH.perfect + great * WORTH.great + good * WORTH.good) / n;
  const score = Math.round(900000 * acc + (100000 * Math.min(combo, n)) / n);
  const full = miss === 0 && perfect + great + good >= n;
  return { score, acc, grade: rankOf(score), full, allPerfect: full && perfect >= n };
}
export const RANKS = [['S+', 990000], ['S', 950000], ['A', 900000], ['B', 800000], ['C', 700000], ['D', 0]];
export const rankOf = score => RANKS.find(([, at]) => score >= at)[0];

// ---- Songs to play, and the best of each ----

// A string to a seed (FNV-1a).
export function hashOf(s) {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return x;
}
// The day's challenge: one song for everyone that day. -> { seed, mood }
export const dailyOf = day => ({ seed: hashOf(`game:${day}`) % 1e9, mood: 'all' });
// A mood's songs for the day, `n` of them. -> [{ seed, mood }]
export const setOf = (day, mood, n = 6) => Array.from({ length: n }, (_, i) => ({ seed: hashOf(`game:${day}:${mood}:${i}`) % 1e9, mood }));
// The key a song's best is kept under, a level each.
export const bestKey = (spec, level) => `${spec.seed}:${spec.mood || 'all'}:${spec.style || ''}:${level}`;
// What's kept with a new round in it: the best of each song and level (and when), how many rounds,
// and when each song was last played. -> { store, best: bool }
export function withRound(store, key, r, at = Date.now()) {
  const s = { bests: {}, plays: 0, last: {}, ...(store || {}) };
  const was = s.bests[key];
  const best = !was || r.score > was.score;
  const bests = best ? { ...s.bests, [key]: { score: r.score, grade: r.grade, full: r.full, combo: r.combo, at } } : s.bests;
  const song = key.slice(0, key.lastIndexOf(':'));
  return { store: { ...s, bests, plays: s.plays + 1, last: { ...s.last, [song]: at } }, best };
}

// Every song played, with its best at each level, the last played first; and the totals.
// -> { songs: [{ seed, mood, style, at, levels: { easy: best|null, … } }], plays, cleared, s, full }
export function recordsOf(store) {
  const by = new Map();
  for (const [key, b] of Object.entries(store?.bests || {})) {
    const parts = key.split(':');
    const level = parts.pop();
    if (!LEVELS.includes(level) || !b) continue;
    const song = parts.join(':');
    if (!by.has(song)) by.set(song, { seed: Number(parts[0]), mood: parts[1] || 'all', style: parts[2] || '', at: 0, levels: Object.fromEntries(LEVELS.map(l => [l, null])) });
    const x = by.get(song);
    x.levels[level] = b;
    x.at = Math.max(x.at, store.last?.[song] || 0, b.at || 0);
  }
  const songs = [...by.values()].sort((a, b) => b.at - a.at || b.seed - a.seed);
  const all = songs.flatMap(x => LEVELS.map(l => x.levels[l]).filter(Boolean));
  return { songs, plays: store?.plays || 0, cleared: songs.length, s: all.filter(b => b.grade.startsWith('S')).length, full: all.filter(b => b.full).length };
}

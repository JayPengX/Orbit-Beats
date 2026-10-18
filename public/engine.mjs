// Orbit Beats engine (was Passion Beats): the browser port of passion_beats.py. Splits a
// recording of beat pieces on silence, hears its tempo and each piece's role
// (analyze.mjs), and builds humanized songs from them. No DOM here, so the
// tests run it in Node.
//
// Audio is { sr, L, R } with L and R Float32Arrays (R may be L for mono).

import { analyzeRecording } from './analyze.mjs';
import { BUSES, BUS_OF, mixdown, mixOf } from './lib/mix.mjs';
export { analyzeRecording, analyzePiece, detectTempo, guessRole, loopBeats } from './analyze.mjs';

export const STYLES = ['four', 'hiphop', 'trap', 'half', 'broken', 'house', 'dembow', 'afro', 'drill', 'boombap', 'jersey', 'amapiano', 'lofi', 'funk', 'garage', 'dnb', 'reggae', 'phonk', 'baile', 'techno'];
export const SECTIONS = ['intro', 'verse', 'pre', 'hook', 'break', 'bridge', 'outro'];

// What a piece does in a song. Loops repeat every so many beats (a loop
// length, from analyze.mjs); the others are one-shots. 'off' leaves a piece
// out.
export const ROLES = ['riff', 'phrase', 'bass', 'hat', 'fill', 'kick', 'sub', 'snare', 'tick', 'roll', 'off'];

// Arrangement rules (see README, "How it works"):
// a hook may lift to a related groove, never a foreign one;
export const FAMILY = {
  four: ['four', 'broken', 'house', 'techno'], broken: ['broken', 'four', 'garage', 'dnb'], hiphop: ['hiphop', 'trap', 'boombap', 'lofi'], trap: ['trap', 'hiphop', 'drill', 'phonk'],
  half: ['half', 'hiphop'], house: ['house', 'four', 'jersey', 'amapiano', 'garage'], dembow: ['dembow', 'afro', 'reggae', 'baile'], afro: ['afro', 'dembow', 'amapiano'],
  drill: ['drill', 'trap'], boombap: ['boombap', 'hiphop', 'lofi'], jersey: ['jersey', 'house', 'baile'], amapiano: ['amapiano', 'house', 'afro'],
  lofi: ['lofi', 'boombap', 'hiphop'], funk: ['funk', 'broken', 'boombap'], garage: ['garage', 'house', 'broken'], dnb: ['dnb', 'broken'],
  reggae: ['reggae', 'dembow'], phonk: ['phonk', 'trap', 'drill'], baile: ['baile', 'dembow', 'jersey'], techno: ['techno', 'four', 'house']
};
// and the song's body is verse–hook pairs (each verse maybe with a pre-hook
// before its hook, every one the same), maybe a break first, maybe a break
// or bridge before a last hook. Verses and hooks are 4 or 8 bars, pre-hooks,
// breaks and bridges 2 or 4: phrases come in fours.
const LENS = { verse: [4, 8], pre: [2, 4], hook: [4, 8], break: [2, 4], bridge: [2, 4] };
export const FORMS = [['hook']];
for (const pre of [false, true])
  for (let k = 1; k <= 4; k++)
    for (const lead of [[], ['break']])
      for (const end of [[], ['break', 'hook'], ['bridge', 'hook']])
        FORMS.push([...lead, ...Array(k).fill(pre ? ['verse', 'pre', 'hook'] : ['verse', 'hook']).flat(), ...end]);

// ---- Seeded randomness (sfc32 seeded by splitmix32) ----

export function makeRng(seed) {
  let x = seed >>> 0;
  const mix = () => {
    x = (x + 0x9e3779b9) | 0;
    let t = x ^ (x >>> 16); t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15; t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
  let a = mix(), b = mix(), c = mix(), d = mix(), spare = null;
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  return {
    random: next,
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),   // inclusive, like randint
    choice: arr => arr[Math.floor(next() * arr.length)],
    sample(n, k) {   // k distinct indices of 0..n-1
      const idx = [...Array(n).keys()];
      for (let i = 0; i < k; i++) { const j = i + Math.floor(next() * (n - i)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      return idx.slice(0, k);
    },
    normal(mu, sd) {
      if (spare !== null) { const z = spare; spare = null; return mu + sd * z; }
      let u; do u = next(); while (u === 0);
      const m = Math.sqrt(-2 * Math.log(u)), v = 2 * Math.PI * next();
      spare = m * Math.sin(v); return mu + sd * m * Math.cos(v);
    },
  };
}

// ---- WAV in ----

// Any PCM (8/16/24/32-bit) or float (32/64-bit) WAV, including
// WAVE_FORMAT_EXTENSIBLE. Returns null if the bytes aren't a WAV.
export function parseWav(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength);
  const tag = o => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (v.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= v.byteLength;) {
    const id = tag(o), size = v.getUint32(o + 4, true), body = o + 8;
    if (id === 'fmt ') {
      let format = v.getUint16(body, true);
      if (format === 0xfffe) format = v.getUint16(body + 24, true);
      fmt = { format, channels: v.getUint16(body + 2, true), sr: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    } else if (id === 'data') {
      data = { at: body, size: Math.min(size, v.byteLength - body) };
      if (fmt) break;
    }
    o = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('This WAV has no audio in it');
  const { format, channels, sr, bits } = fmt, bps = bits / 8, frame = bps * channels;
  const n = Math.floor(data.size / frame);
  const read = {
    '1:8': o => (v.getUint8(o) - 128) / 128,
    '1:16': o => v.getInt16(o, true) / 32768,
    '1:24': o => ((v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16))) / 8388608,
    '1:32': o => v.getInt32(o, true) / 2147483648,
    '3:32': o => v.getFloat32(o, true),
    '3:64': o => v.getFloat64(o, true),
  }[`${format}:${bits}`];
  if (!read) throw new Error(`Can't read ${bits}-bit WAVs of format ${format}`);
  const L = new Float32Array(n), R = channels > 1 ? new Float32Array(n) : L;
  for (let i = 0, o = data.at; i < n; i++, o += frame) {
    L[i] = read(o);
    if (channels > 1) R[i] = read(o + bps);
  }
  return { sr, L, R };
}

// ---- Splitting ----

// Pieces are the sound between runs of silence longer than `minGap` seconds.
// Sound before the first gap and after the last counts too (the .py lost it).
export function splitPieces({ sr, L, R }, { silenceDb = -90, minGap = 0.2 } = {}) {
  const thr = 10 ** (silenceDb / 20), n = L.length, need = minGap * sr;
  const segs = [];
  let prev = 0, run = -1;
  for (let i = 0; i <= n; i++) {
    const quiet = i < n && Math.abs(L[i]) < thr && Math.abs(R[i]) < thr;
    if (quiet && run < 0) run = i;
    else if (!quiet && run >= 0) {
      if (i - run > need) { if (run > prev) segs.push([prev, run]); prev = i; }
      run = -1;
    }
  }
  if (prev < n) segs.push([prev, n]);
  const minLen = 0.02 * sr;   // a click between two gaps isn't a piece
  // Each piece exactly as recorded: it starts and ends at silence, so no fades.
  return segs.filter(([a, b]) => b - a >= minLen).map(([a, b]) => ({ L: L.slice(a, b), R: R === L ? L.slice(a, b) : R.slice(a, b) }));
}

// ---- Songs ----

// A song is the pieces placed on the recording's beat grid: each hit noted
// as it's decided (`events`: the piece, its beat, the sample it starts on),
// then the hits summed on their buses and mixed (lib/mix.mjs), or, with the
// mixer off, summed exactly as recorded: no volume changes, panning,
// cutting or effects. Pieces may overlap. Humanize only moves when a piece
// starts. Pieces are by index; null is none; `loops` is each one's loop
// length in beats.
class Song {
  constructor(bars, r, pieces, sr, humanize, bpm, loops) {
    this.r = r; this.py = makeRng(r.int(0, 1e9 - 1)); this.pc = pieces;
    this.sr = sr; this.B = 60 / bpm * sr; this.bars = bars;
    this.per = loops;
    this.events = [];
    this.swing = r.uniform(0, 0.06) * humanize;        // beat fraction pushed on off-16ths
    this.loose = r.uniform(0.004, 0.012) * humanize;   // timing sd in seconds
    this.rest = new Set();                              // stop bars: loops and drums lay out
  }
  hit(i, beat, tight = false) {   // piece i, as recorded, from `beat`
    if (i == null) return;
    const { r, sr, B } = this;
    const at = beat;
    if (Math.abs((beat % 0.5) - 0.25) < 1e-6) beat += this.swing;
    const a = Math.max(0, Math.round(beat * B + r.normal(0, this.loose * (tight ? 0.4 : 1)) * sr));
    this.events.push({ i, beat: at, a });
  }
  span(i) { return i == null ? 1 : Math.max(1, Math.ceil(this.per[i] / 4)); }   // whole bars a loop takes
  loop(i, bar, nbars) {   // piece i every loop length; the last may run on
    if (i == null) return;
    const p = this.per[i], end = (bar + nbars) * 4;
    for (let t = bar * 4; t < end - 1e-9; t += p) if (!this.rest.has(Math.floor(t / 4))) this.hit(i, t, true);
  }
  phrases(bar, nbars, pool) {   // short pieces one after another, each where it fits
    const end = (bar + nbars) * 4;
    for (let t = bar * 4; t < end - 1e-9;) {
      const fit = pool.filter(i => this.per[i] <= end - t + 1e-9);
      if (!fit.length) break;
      const i = this.py.choice(fit);
      this.hit(i, t); t += this.per[i];
    }
  }
  drums(style, bar, nbars, k) {   // k: the song's drum kit
    for (let br = bar; br < bar + nbars; br++) {
      if (this.rest.has(br)) continue;
      const t = br * 4;
      (GROOVES[style] || GROOVES.four)(this, t, k);
      if (this.r.random() < 0.35 && !FULL_HATS.has(style))   // ticks between the hits
        for (const q of this.py.choice([[0.5], [1.5, 3.5], [0.5, 1.5, 2.5, 3.5]])) this.hit(k.tick, t + q);
    }
  }
  build(bar, nbars, k) {   // a pre-hook's riser: the snare (or a roll) a beat apart, then eighths, then sixteenths
    for (let j = 0; j < nbars; j++) {
      const step = j === nbars - 1 ? 0.25 : j >= nbars / 2 ? 0.5 : 1;
      for (let q = 0; q < 4 - 1e-9; q += step) this.hit(k.snare ?? k.roll, (bar + j) * 4 + q, true);
    }
  }
  fill(bar, kinds, k) {   // the end of `bar`
    const t = bar * 4, pick = this.py.choice(kinds), kind = pick === 'fill' && k.fill == null ? 'stutter' : pick;   // no fill loop: a stutter
    if (kind === 'roll') this.hit(k.roll, t + 3);
    else if (kind === 'roll2') { this.hit(k.roll, t + 3); this.hit(k.roll, t + 3.5); }
    else if (kind === 'stutter') for (const q of [2.5, 3, 3.25, 3.5, 3.75]) this.hit(this.py.choice([k.kick, k.snare]), t + q);
    else if (kind === 'fill') this.hit(k.fill, t, true);
    else if (kind === 'tick') for (const q of [3, 3.25, 3.5, 3.75]) this.hit(k.tick, t + q);
    // 'drop': no fill
  }
}

// Each groove's bar of drums from beat t (s: the song, k: its kit). The
// r.random() calls are the groove's chances; passion_beats.py plays the same.
const GROOVES = {
  four(s, t, k) {
    for (let q = 0; q < 4; q++) s.hit(k.kick, t + q);
    if (s.r.random() < 0.15) s.hit(k.kick, t + 3.5);
  },
  hiphop(s, t, k) {
    s.hit(k.heavy, t); s.hit(k.snare, t + 2.5);
    if (s.r.random() < 0.35) s.hit(k.heavy, t + 1.75);
    if (s.r.random() < 0.2) s.hit(k.kick, t + 3.75);
  },
  trap(s, t, k) {
    s.hit(k.sub, t); s.hit(k.kick, t + 1.5); s.hit(k.sub, t + 2.75);
    if (s.r.random() < 0.3) s.hit(k.sub, t + 3.5);
  },
  half(s, t, k) {
    s.hit(k.snare, t);
    if (s.r.random() < 0.5) s.hit(k.heavy, t + 2.75);
  },
  broken(s, t, k) {
    for (const q of s.py.choice([[0, 1.5, 2.5], [0, 0.75, 2.25, 3], [0, 2, 2.75], [0, 1.25, 2.5, 3.5]])) s.hit(s.py.choice([k.kick, k.heavy, k.sub]), t + q);
  },
  house(s, t, k) {   // four on the floor, the clap on 2 and 4, a tick on every off-beat
    for (let q = 0; q < 4; q++) s.hit(k.kick, t + q);
    s.hit(k.snare, t + 1); s.hit(k.snare, t + 3);
    for (const q of [0.5, 1.5, 2.5, 3.5]) s.hit(k.tick, t + q);
  },
  dembow(s, t, k) {   // reggaeton's: the kick on the beat, the snare's 3+3+2 against it
    for (let q = 0; q < 4; q++) s.hit(k.kick, t + q);
    for (const q of [0.75, 1.5, 2.75, 3.5]) s.hit(k.snare, t + q);
  },
  afro(s, t, k) {   // afrobeats': a kick that skips, the snare on 2 and 4, a shaker's push
    for (const q of [0, 1.5, 2.5]) s.hit(k.heavy, t + q);
    s.hit(k.snare, t + 1); s.hit(k.snare, t + 3);
    if (s.r.random() < 0.5) s.hit(k.snare, t + 3.75);
    for (const q of [0.5, 1.75, 2.25, 3.25]) s.hit(k.tick, t + q);
  },
  drill(s, t, k) {   // drill's: the 808 sliding round the kick, the snare late on 3 and pushed, its hats in threes
    s.hit(k.sub, t); s.hit(k.heavy, t + 2.75);
    if (s.r.random() < 0.5) s.hit(k.sub, t + 1.5);
    s.hit(k.snare, t + 2); s.hit(k.snare, s.r.random() < 0.5 ? t + 3.5 : t + 3.75);
    for (const q of [0, 0.75, 1.5, 2.25, 3, 3.75]) s.hit(k.tick, t + q);
  },
  boombap(s, t, k) {   // boom bap's: the kick's skip, the snare on 2 and 4, eighth-note hats
    s.hit(k.heavy, t); s.hit(k.kick, t + 2.5);
    if (s.r.random() < 0.5) s.hit(k.kick, t + 1.75);
    s.hit(k.snare, t + 1); s.hit(k.snare, t + 3);
    for (let q = 0.5; q < 4; q += 1) s.hit(k.tick, t + q);
  },
  jersey(s, t, k) {   // Jersey club's: the kicks' bounce (1, 2, 3, 3½ and the run at the end), the clap on 2 and 4
    for (const q of [0, 1, 2, 2.75, 3.5]) s.hit(k.kick, t + q);
    s.hit(k.snare, t + 1); s.hit(k.snare, t + 3);
    if (s.r.random() < 0.4) s.hit(k.snare, t + 3.75);
  },
  amapiano(s, t, k) {   // amapiano's: the kick on the beat, the log drum's syncopation (the 808), a rim on 4, a shaker on every off-16th
    for (let q = 0; q < 4; q++) s.hit(k.kick, t + q);
    for (const q of [0.75, 2.25, 3.5]) s.hit(k.sub, t + q);
    s.hit(k.snare, t + 3);
    for (let q = 0.25; q < 4; q += 0.5) s.hit(k.tick, t + q);
  },
  lofi(s, t, k) {   // lo-fi's: a lazy kick, the snare on 2 and 4, eighth hats with some left out
    s.hit(k.heavy, t); s.hit(k.kick, t + 2.5);
    if (s.r.random() < 0.5) s.hit(k.kick, t + 2.75);
    s.hit(k.snare, t + 1); s.hit(k.snare, t + 3);
    for (let q = 0; q < 4; q += 0.5) if (s.r.random() < 0.8) s.hit(k.tick, t + q);
  },
  funk(s, t, k) {   // funk's: the kick on 1, its push and the and of 3, ghost notes round the backbeat, sixteenths on the hat
    s.hit(k.heavy, t); s.hit(k.kick, t + 0.75); s.hit(k.kick, t + 2.5);
    s.hit(k.snare, t + 1); s.hit(k.snare, t + 3);
    if (s.r.random() < 0.5) s.hit(k.roll, t + 1.75);
    if (s.r.random() < 0.5) s.hit(k.roll, t + 3.25);
    for (let q = 0; q < 4; q += 0.25) s.hit(k.tick, t + q);
  },
  garage(s, t, k) {   // UK garage's two-step: no kick on 3, the kick skipping late, the snare on 2 and 4
    s.hit(k.kick, t); s.hit(k.kick, t + 2.75);
    if (s.r.random() < 0.4) s.hit(k.kick, t + 1.75);
    s.hit(k.snare, t + 1); s.hit(k.snare, t + 3);
    for (const q of [0.5, 1.5, 2.5, 3.5]) s.hit(k.tick, t + q);
  },
  dnb(s, t, k) {   // drum and bass's two-step at double time: kick, snare, the kick late, the snare, twice a bar; sixteenth hats
    for (const h of [0, 2]) {
      s.hit(k.heavy, t + h); s.hit(k.snare, t + h + 0.5); s.hit(k.kick, t + h + 1.25); s.hit(k.snare, t + h + 1.5);
    }
    for (let q = 0; q < 4; q += 0.25) if (q % 0.5 === 0 || s.r.random() < 0.5) s.hit(k.tick, t + q);
  },
  reggae(s, t, k) {   // reggae's one drop: nothing on 1, the kick and the snare together on 3, the hat on the off-beats
    s.hit(k.heavy, t + 2); s.hit(k.snare, t + 2);
    if (s.r.random() < 0.3) s.hit(k.kick, t + 3.5);
    for (const q of [0.5, 1.5, 2.5, 3.5]) s.hit(k.tick, t + q);
  },
  phonk(s, t, k) {   // phonk's: the 808 on 1 and the and of 3, a kick between, the snare on 2 and 4, hats rolling at the end
    s.hit(k.sub, t); s.hit(k.kick, t + 1.75); s.hit(k.sub, t + 2.5);
    s.hit(k.snare, t + 1); s.hit(k.snare, t + 3);
    for (const q of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.25, 3.5, 3.75]) s.hit(k.tick, t + q);
  },
  baile(s, t, k) {   // baile funk's tamborzão: the kick's 3-3-2 twice, the snare on its gaps
    for (const q of [0, 0.75, 2, 2.75]) s.hit(k.kick, t + q);
    s.hit(k.snare, t + 1.5); s.hit(k.snare, t + 3.5);
    if (s.r.random() < 0.5) s.hit(k.snare, t + 1.25);
    for (const q of [0.5, 1, 2.5, 3]) s.hit(k.tick, t + q);
  },
  techno(s, t, k) {   // techno's: the heavy kick on every beat, the hat on the off-beats, a clap that comes and goes, ticks between
    for (let q = 0; q < 4; q++) s.hit(k.heavy, t + q);
    for (const q of [0.5, 1.5, 2.5, 3.5]) s.hit(k.tick, t + q);
    if (s.r.random() < 0.5) { s.hit(k.snare, t + 1); s.hit(k.snare, t + 3); }
    if (s.r.random() < 0.3) s.hit(k.tick, t + 3.75);
  }
};
// The grooves whose hats are part of them: no extra ticks.
const FULL_HATS = new Set(['drill', 'boombap', 'amapiano', 'lofi', 'funk', 'garage', 'dnb', 'reggae', 'phonk', 'baile', 'techno']);

// The hits summed and mixed. -> { audio: { sr, L, R, peak, over }, stems }
function renderSong(s, { roles, plan, mix, stems = false }) {
  const { sr, B, pc, events } = s;
  const mixed = mix && mix.on !== false;
  const longest = Math.max(0, ...pc.map(p => p.L.length));   // the last pieces play out in full
  const n = Math.floor((s.bars * 4 + 2) * B) + longest + (mixed ? 2 * sr : 0);   // (and the room's tail)
  const place = (L, R, list) => {
    for (const { i, a } of list) {
      const src = pc[i], end = Math.min(L.length, a + src.L.length);
      for (let k = 0, j = a; j < end; k++, j++) { L[j] += src.L[k]; R[j] += src.R[k]; }
    }
  };
  let L, R, over = null, parts = null;
  if (!mixed) {
    L = new Float32Array(n); R = new Float32Array(n);
    place(L, R, events);
    if (stems) {
      parts = {};
      for (const b of BUSES) {
        const list = events.filter(e => BUS_OF[roles[e.i]] === b);
        if (list.length) { parts[b] = { L: new Float32Array(n), R: new Float32Array(n) }; place(parts[b].L, parts[b].R, list); }
      }
    }
  } else {
    const byBus = Object.fromEntries(BUSES.map(b => [b, events.filter(e => BUS_OF[roles[e.i]] === b)]));
    const kicks = events.filter(e => roles[e.i] === 'kick' || roles[e.i] === 'sub').map(e => e.a);
    const out = mixdown((b, bL, bR) => (place(bL, bR, byBus[b]), byBus[b].length > 0), { sr, B, n, plan, kicks, mix, stems });
    ({ L, R } = out);
    over = out.over;
    parts = out.stems;
  }
  let last = n - 1;
  while (last > 0 && Math.abs(L[last]) <= 1e-5 && Math.abs(R[last]) <= 1e-5) last--;
  const len = Math.min(n, last + 1 + Math.floor(0.5 * sr));   // the last notes ring out, then 0.5 s
  // Unmixed, overlaps are left as they add up, even past full scale (1.0):
  // a 32-bit float WAV keeps them; 16-bit clips them.
  let peak = 0;
  for (let j = 0; j < len; j++) peak = Math.max(peak, Math.abs(L[j]), Math.abs(R[j]));
  const cut = x => ({ sr, L: x.L.subarray(0, len), R: x.R.subarray(0, len) });
  return { audio: { sr, L: L.subarray(0, len), R: R.subarray(0, len), peak, over }, stems: parts && Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, cut(v)])) };
}

export const MIN_BARS = 8;   // intro, a 4-bar hook, outro

function* fits(form, bars) {   // every choice of section lengths adding up to `bars`
  if (!form.length) { if (bars === 0) yield []; return; }
  const least = form.slice(1).reduce((s, t) => s + LENS[t][0], 0), most = form.slice(1).reduce((s, t) => s + LENS[t].at(-1), 0);
  for (const L of LENS[form[0]]) if (bars - L >= least && bars - L <= most) for (const rest of fits(form.slice(1), bars - L)) yield [L, ...rest];
}

// The song's sections: [type, first bar, bars]. An even number of bars when
// the range has one (an odd one gets a 3-bar outro).
const FIT = new Map();
export function planSong(R, minBars, maxBars) {
  const evens = [];
  for (let t = minBars; t <= maxBars; t++) if (t % 2 === 0) evens.push(t);
  const target = evens.length ? R.choice(evens) : minBars;
  let choices = FIT.get(target);   // form -> every [intro, lengths, outro] that fits (the same each time)
  if (!choices) {
    choices = new Map();
    for (const intro of [2, 4]) for (const outro of target % 2 ? [3] : [2, 4])
      for (const form of FORMS) for (const lens of fits(form, target - intro - outro)) {
        if (!choices.has(form)) choices.set(form, []);
        choices.get(form).push([intro, lens, outro]);
      }
    FIT.set(target, choices);
  }
  if (!choices.size) throw new Error(`No song form fits ${target} bars`);
  const form = R.choice([...choices.keys()]), [intro, lens, outro] = R.choice(choices.get(form));
  const plan = [['intro', 0, intro]];
  let bar = intro;
  form.forEach((t, k) => { plan.push([t, bar, lens[k]]); bar += lens[k]; });
  plan.push(['outro', bar, outro]);
  return plan;
}

// An arrangement as asked ([[type, bars], …], 編排): each a known section of
// 1 to 16 bars, 128 bars at most in all. -> the plan, or an Error's message.
export const MAX_PLAN_BARS = 128;
export function planOf(sections) {
  if (!Array.isArray(sections) || !sections.length) throw new Error('An arrangement needs a section');
  const plan = [];
  let bar = 0;
  for (const s of sections) {
    const [t, n] = Array.isArray(s) ? s : [];
    if (!SECTIONS.includes(t) || !Number.isInteger(n) || n < 1 || n > 16) throw new Error(`Not a section: ${JSON.stringify(s)}`);
    plan.push([t, bar, n]); bar += n;
  }
  if (bar > MAX_PLAN_BARS) throw new Error(`${MAX_PLAN_BARS} bars at most`);
  return plan;
}

// Riff sets: a pattern over a few riffs (as numbered in a shuffled order).
const PATTERNS = [[0, 1, 2, 1], [0, 1], [0, 0, 1, 1], [0, 1, 0, 2], [0]];

// How alike two pieces' notes are (their pitch classes): 1 the same, 0 none shared.
const alike = (a, b) => a && b ? a.reduce((s, v, k) => s + v * b[k], 0) : 0;

// One song from `pieces` (from splitPieces). `analysis` is from
// analyzeRecording (made when not given): its tempo, and each piece's role
// and loop length; `bpm` and `roles` set those instead. It needs a riff or a
// phrase; any other role may be missing, and what it plays is then left out
// (or played by the nearest role there is).
// Options beyond the script's (the page's): `style` makes it that groove;
// `detail` a variation of the song of `seed` (the same form, groove and
// riff sets, its fills, timing and the riffs' lay-outs played anew);
// `weights` ({ style: n }) leans the groove's choice to the styles liked;
// `plan` ([[type, bars], …]) its sections as arranged by hand, every other
// choice as the seed makes it. `mix` (lib/mix.mjs's MIX; null or on: false
// for the pieces exactly as recorded); `stems` also returns each bus apart.
// -> { audio, info, events, stems }
export function makeSong(pieces, sr, seed, { analysis, bpm, roles, minBars = 25, maxBars = 29, styles = STYLES, humanize = 1, style: forced = null, detail = null, weights = null, plan: arranged = null, mix = null, stems = false } = {}) {
  analysis ??= analyzeRecording(pieces, sr, { bpm });
  bpm ??= analysis.bpm; roles ??= analysis.roles;
  const loops = bpm === analysis.bpm ? analysis.loops : analyzeRecording(pieces, sr, { bpm }).loops;
  const chroma = analysis.analyses.map(a => a.chroma);
  if (roles.length !== pieces.length) throw new Error(`Need a role for each of the ${pieces.length} pieces`);
  const pool = Object.fromEntries(ROLES.map(x => [x, []]));
  roles.forEach((x, i) => pool[x]?.push(i));
  const riffs = pool.riff.length ? pool.riff : pool.phrase, phrases = pool.phrase.length ? pool.phrase : riffs;
  if (!riffs.length) throw new Error('Needs at least one riff or phrase');
  if (!(minBars >= MIN_BARS && minBars <= maxBars)) throw new Error(`Length must be ${MIN_BARS} bars or more, shortest first`);
  if (!styles.length) throw new Error('Pick at least one drum style');
  const r0 = makeRng(seed), R = makeRng(seed ^ 0x5bd1e995);
  const r = detail == null ? r0 : makeRng(detail);
  const pick = (xs, not = []) => { const ok = xs.filter(x => !not.includes(x)); return ok.length ? R.choice(ok) : xs.length ? R.choice(xs) : null; };

  // Choices made once, so what repeats sounds the same each time.
  const chosen = weights ? weighted(R, styles, weights) : R.choice(styles);
  const style = forced && FAMILY[forced] ? forced : chosen, kin = FAMILY[style].filter(x => styles.includes(x) || x === style);
  const hookStyle = R.random() < 0.4 ? R.choice(kin) : style;          // every hook the same groove
  // Intro/outro, verse, hook and bridge riff sets, each led by a different
  // riff where there are riffs enough, with the riffs most alike in notes
  // to it (so in the same key) after it in the pattern.
  const order = r0.sample(riffs.length, riffs.length).map(i => riffs[i]), step = Math.max(1, Math.floor(riffs.length / 4));
  const [introSet, verseSet, hookSet, bridgeSet] = [0, 1, 2, 3].map(j => {
    const lead = order[(j * step) % order.length];
    const kin = [lead, ...riffs.filter(x => x !== lead).sort((x, y) => alike(chroma[y], chroma[lead]) - alike(chroma[x], chroma[lead]))];
    return R.choice(PATTERNS).map(x => kin[x % kin.length]);
  });
  // Another riff over hooks: the one most alike in notes not already there.
  const others = riffs.filter(x => !hookSet.includes(x)).sort((x, y) => alike(chroma[y], chroma[hookSet[0]]) - alike(chroma[x], chroma[hookSet[0]]));
  const layer = others[0] ?? null;
  // (Only one alike enough in notes, so in the same key: no clash on top.)
  const hookLayer = layer != null && R.random() < 0.5;
  const layerFits = layer != null && (!chroma[layer] || !chroma[hookSet[0]] || alike(chroma[layer], chroma[hookSet[0]]) >= 0.45);
  const bassMode = R.choice(pool.bass.length > 1 ? ['alt', 'one', 'one', 'sparse'] : pool.bass.length ? ['one', 'sparse'] : ['none']);
  const bassA = pick(pool.bass), bassB = pick(pool.bass, [bassA]);
  // A break gets the shortest hat loop (a shaker); a hook a hat other than
  // the verse's, and other than the shaker when there's a choice.
  const shortest = Math.min(...pool.hat.map(i => pieces[i].L.length));
  const breakHat = pool.hat.find(i => pieces[i].L.length === shortest) ?? null;
  const verseHat = pick(pool.hat), hookHat = pick(pool.hat, pool.hat.length > 2 ? [verseHat, breakHat] : [verseHat]);
  // The kit: the first kick in the recording, a second as the heavier one,
  // an 808, and the rest; a missing kick or 808 is played by the other.
  const kicks = pool.kick;
  const kick = kicks[0] ?? pick(pool.sub), heavy = kicks[1] ?? kick, snare = pick(pool.snare);
  const kit = { kick, heavy, sub: pick(pool.sub) ?? heavy, snare, tick: pick(pool.tick), roll: pick(pool.roll) ?? snare, fill: pick(pool.fill) };

  // (An arrangement by hand still draws the plan, so every later choice is the seed's.)
  const drawn = planSong(R, minBars, maxBars);
  const plan = arranged ? planOf(arranged) : drawn, bars = plan.at(-1)[1] + plan.at(-1)[2];
  const hooks = plan.filter(([t]) => t === 'hook').length;
  const s = new Song(bars, r, pieces, sr, humanize, bpm, loops);

  // How each section hands over, decided first: the bar before a hook may be
  // a stop bar (everything lays out but the fill). Fills fit where they lead:
  // a build into a hook, something light into a verse, next to nothing into
  // a quiet section; a pre-hook's riser is its own.
  const INTO = { hook: ['roll', 'roll2', 'stutter', 'fill'], verse: ['roll', 'roll2', 'tick', 'drop'], pre: ['tick', 'drop'], break: ['drop', 'tick'], bridge: ['drop', 'tick'], outro: ['roll', 'roll2', 'stutter'], intro: ['drop', 'tick'] };
  const into = plan.map(([t, b, L], idx) => {
    const nb = b + L - 1, next = plan[idx + 1]?.[0];
    if (!next) return [nb, ['roll', 'roll2', 'stutter']];   // the ending
    if (t === 'pre') return [nb, ['drop']];
    if (next === 'hook' && L >= 4 && R.random() < 0.35) { s.rest.add(nb); return [nb, ['fill', 'stutter']]; }
    return [nb, INTO[next]];
  });

  // Loops one after another from bar b, each for the whole bars it takes;
  // `skip` may leave one out.
  const walk = (b, n, next, from = 0, skip = () => false) => {
    for (let k = from, j = 0; k < n; j++) {
      const i = next(j), span = Math.min(n - k, s.span(i));
      if (!skip(k, span)) s.loop(i, b + k, span);
      k += span;
    }
  };
  const bass = (b, n, from = 0) => walk(b, n, j => bassMode === 'alt' ? [bassA, bassB][j % 2] : bassMode === 'sparse' ? (r.random() < 0.4 ? null : R.choice(pool.bass)) : bassA, from);
  const riff = (b, n, set) =>   // lay out at a phrase's end, not mid-phrase
    walk(b, n, j => set[j % set.length], 0, (k, span) => (k + span) % 4 === 0 && k + span < n && r.random() < 0.2);
  let verseNo = 0, hookNo = 0;
  plan.forEach(([t, b, L], idx) => {
    if (t === 'intro') {   // previews: hats then a riff, a riff, or phrases
      const c = R.choice(verseHat == null ? ['riff', 'phr'] : ['riff', 'phr', 'hats']);
      if (c === 'riff') riff(b, L, introSet);
      else if (c === 'phr') s.phrases(b, L, phrases);
      else { s.loop(verseHat, b, L); s.loop(introSet[0], b + Math.floor(L / 2), L - Math.floor(L / 2)); }
    } else if (t === 'verse') {   // the first verse builds: bass comes in halfway
      verseNo++;
      riff(b, L, verseSet); bass(b, L, verseNo === 1 ? Math.floor(L / 2) : 0);
      s.drums(style, b, L, kit); s.loop(verseHat, b, L);
      if (R.random() < 0.4) s.phrases(b + L - Math.min(4, L), Math.min(4, L), phrases);   // (a verse under 4 bars: its own bars, never before the song)
    } else if (t === 'pre') {   // the lift: the verse's riffs and hat, no kick, a riser into the hook
      riff(b, L, verseSet); s.loop(verseHat, b, L); s.build(b, L, kit);
    } else if (t === 'hook') {   // the last hook is the fullest
      hookNo++;
      riff(b, L, hookSet); bass(b, L); s.drums(hookStyle, b, L, kit); s.loop(hookHat, b, L);
      if (layerFits && (hookLayer || hookNo === hooks)) riff(b, L, [layer]);
    } else if (t === 'break') {   // strip back: no drums, no bass
      s.phrases(b, L, phrases);
      if (R.random() < 0.6) s.loop(breakHat, b, L);
    } else if (t === 'bridge') {   // contrast: another riff set, half-time
      riff(b, L, bridgeSet); s.drums('half', b, L, kit);
      if (R.random() < 0.5) bass(b, L);
    } else if (t === 'outro') {   // the intro's riff again, winding down
      riff(b, L, introSet);
      if (R.random() < 0.6) s.drums(style, b, Math.floor(L / 2), kit);
      s.loop(verseHat, b, L);
    }
    if (L === 8 && (t === 'verse' || t === 'hook') && R.random() < 0.3) s.fill(b + 3, ['tick', 'roll'], kit);   // mid-section turnaround
    s.fill(...into[idx], kit);
  });
  s.hit(R.choice([kit.heavy, kit.sub]), bars * 4);   // one last hit on the next downbeat
  const m = mix && mix.on !== false ? mixOf(mix) : null;
  const { audio, stems: parts } = renderSong(s, { roles, plan, mix: m, stems });
  return { audio, events: s.events, stems: parts, info: { seed, detail, key: keyOf(riffs.map(i => pieceChroma(pieces[i], sr))), bpm, style, alt: hookStyle, bass: bassMode, riffSets: [introSet, verseSet, hookSet, bridgeSet], layer, bars, beats: bars * 4, seconds: audio.L.length / sr, peak: audio.peak, over: audio.over, mixed: Boolean(m), plan: plan.map(([t, , L]) => [t, L]) } };
}

// Hits placed by hand (即興, the jam's pads): [{ i, beat }] on the grid at
// `bpm`, no humanize, mixed (or not) as a song is, its sections `plan`
// ([[type, bars], …]; one verse of its length when not given).
// -> { audio, info, events, stems }
export function renderEvents(pieces, sr, bpm, roles, hits, { mix = null, stems = false, plan: sections = null } = {}) {
  if (roles.length !== pieces.length) throw new Error(`Need a role for each of the ${pieces.length} pieces`);
  const lastBeat = Math.max(0, ...hits.map(e => e.beat));
  const bars = Math.max(1, Math.ceil((lastBeat + 1e-9) / 4));
  // (Its own plan, verses of 16 bars, isn't held to an arrangement's 128: a long take is still a song.)
  const plan = sections ? planOf(sections) : Array.from({ length: Math.ceil(bars / 16) }, (_, k) => ['verse', k * 16, Math.min(16, bars - k * 16)]);
  const s = new Song(bars, makeRng(1), pieces, sr, 0, bpm, roles.map(() => 4));
  for (const e of hits) if (e.i >= 0 && e.i < pieces.length && roles[e.i] !== 'off' && e.beat >= 0) s.events.push({ i: e.i, beat: e.beat, a: Math.round(e.beat * s.B) });
  const m = mix && mix.on !== false ? mixOf(mix) : null;
  const { audio, stems: parts } = renderSong(s, { roles, plan, mix: m, stems });
  return { audio, events: s.events, stems: parts, info: { bpm, bars, beats: bars * 4, seconds: audio.L.length / sr, peak: audio.peak, over: audio.over, mixed: Boolean(m), plan: plan.map(([t, , L]) => [t, L]), key: null, style: null } };
}

// The drums a set of roles has, the first of each (the jam's, where a song
// draws them): a missing kick or 808 played by the other, a roll by the snare.
export function drumKit(roles) {
  const first = r => { const i = roles.indexOf(r); return i < 0 ? null : i; };
  const kicks = roles.map((r, i) => (r === 'kick' ? i : -1)).filter(i => i >= 0);
  const kick = kicks[0] ?? first('sub'), heavy = kicks[1] ?? kick, snare = first('snare');
  return { kick, heavy, sub: first('sub') ?? heavy, snare, tick: first('tick'), roll: first('roll') ?? snare, fill: first('fill') };
}
// A groove's drums over `bars` bars from the kit, as a song plays them on a
// strict grid: [{ i, beat }].
export function grooveHits(style, kit, bars = 4, seed = 1) {
  const s = new Song(bars, makeRng(seed), [], 48000, 0, 120, []);
  s.drums(style, 0, bars, kit);
  return s.events.map(({ i, beat }) => ({ i, beat }));
}

// One of `xs` by weight (each at least 1, so a style not yet liked still comes up): one draw, as R.choice.
export function weighted(R, xs, weights) {
  const w = xs.map(x => 1 + Math.max(0, Number(weights[x]) || 0));
  let t = R.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < xs.length; i++) if ((t -= w[i]) < 0) return xs[i];
  return xs[xs.length - 1];
}

// The key a set of pieces is in, from their notes (chroma, 12 pitch
// classes from C): Krumhansl and Kessler's major and minor profiles, the
// best of the 24 by correlation. -> { tonic: 0–11, minor, fit } | null
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export function keyOf(chromas) {
  const c = new Array(12).fill(0);
  for (const x of chromas || []) if (x) for (let k = 0; k < 12; k++) c[k] += x[k] || 0;
  if (!c.some(v => v > 0)) return null;
  const corr = (a, b) => {
    const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12;
    let n = 0, da = 0, db = 0;
    for (let k = 0; k < 12; k++) { n += (a[k] - ma) * (b[k] - mb); da += (a[k] - ma) ** 2; db += (b[k] - mb) ** 2; }
    return da && db ? n / Math.sqrt(da * db) : 0;
  };
  let best = null;
  for (let tonic = 0; tonic < 12; tonic++)
    for (const [minor, prof] of [[false, MAJOR], [true, MINOR]]) {
      const rot = prof.map((_, k) => prof[(k - tonic + 12) % 12]);
      const fit = corr(c, rot);
      if (!best || fit > best.fit) best = { tonic, minor, fit: Math.round(fit * 100) / 100 };
    }
  return best;
}
export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
// A piece's notes as 12 pitch classes, finely (the analysis's chroma is
// coarse, for telling riffs apart; a key needs each semitone): the first
// two seconds brought down to ~12 kHz, each note from C2 to C7 measured on
// its own (a windowed DFT at its pitch), the strongest counting most.
const chromaMemo = new WeakMap();
export function pieceChroma(p, sr) {
  if (!chromaMemo.has(p.L)) chromaMemo.set(p.L, noteChroma(p.L, sr));
  return chromaMemo.get(p.L);
}
export function noteChroma(L, sr) {
  const k = Math.max(1, Math.floor(sr / 12000));
  const rate = sr / k;
  const n = Math.min(Math.floor(L.length / k), Math.round(2 * rate));
  if (n < rate * 0.1) return null;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += L[i * k + j] || 0;
    x[i] = (s / k) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  const e = new Array(61).fill(0);
  for (let m = 36; m <= 96; m++) {
    const w = (2 * Math.PI * 440 * 2 ** ((m - 69) / 12)) / rate;
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { re += x[i] * Math.cos(w * i); im += x[i] * Math.sin(w * i); }
    e[m - 36] = Math.hypot(re, im);
  }
  // (A note's own pitch over its harmonics: each one's energy less a share of what's an octave and a fifth under it.)
  const c = new Array(12).fill(0);
  for (let m = 36; m <= 96; m++) {
    const own = e[m - 36] - 0.5 * (e[m - 48] || 0) - 0.3 * (e[m - 55] || 0);
    if (own > 0) c[m % 12] += Math.sqrt(own);
  }
  const norm = Math.hypot(...c) || 1;
  return c.map(v => v / norm);
}

// "Beats DD-MM-YYYY HH-MM", in local time.
export function songName(date) {
  const p = x => String(x).padStart(2, '0');
  return `Beats ${p(date.getDate())}-${p(date.getMonth() + 1)}-${date.getFullYear()} ${p(date.getHours())}-${p(date.getMinutes())}`;
}

// A batch's songs: each its own seed, named for when it's made, the first
// at `start` and each next one a minute later.
export function batch(count, seed, start = new Date()) {
  const r = makeRng(seed), out = [];
  for (let k = 0; k < count; k++)
    out.push({ name: songName(new Date(start.getTime() + k * 60_000)), seed: r.int(0, 1e9 - 1) });
  return out;
}

// ---- WAV out ----

export function encodeWav({ sr, L, R }, bits = 16) {
  const float = bits === 32, n = L.length, bps = bits / 8, dataSize = n * 2 * bps;
  const head = float ? 58 : 44, out = new Uint8Array(head + dataSize), v = new DataView(out.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, out.length - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, float ? 18 : 16, true);
  v.setUint16(20, float ? 3 : 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2 * bps, true);
  v.setUint16(32, 2 * bps, true); v.setUint16(34, bits, true);
  let o = 36;
  if (float) { v.setUint16(36, 0, true); str(38, 'fact'); v.setUint32(42, 4, true); v.setUint32(46, n, true); o = 50; }
  str(o, 'data'); v.setUint32(o + 4, dataSize, true); o += 8;
  if (float) {   // the samples start at byte 58, so no Float32Array view
    for (let i = 0; i < n; i++, o += 8) { v.setFloat32(o, L[i], true); v.setFloat32(o + 4, R[i], true); }
  } else {
    for (let i = 0; i < n; i++, o += 4) {
      v.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), true);
      v.setInt16(o + 2, Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), true);
    }
  }
  return out;
}

// ---- Zip (stored, no compression: WAVs barely shrink) ----

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name, data: Uint8Array }] -> array of parts for a Blob
export function zipParts(files, date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nm = enc.encode(name), crc = crc32(data);
    const rec = (sig, size) => { const b = new Uint8Array(size + nm.length), v = new DataView(b.buffer); v.setUint32(0, sig, true); b.set(nm, size); return [b, v]; };
    const [lh, l] = rec(0x04034b50, 30);
    l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint16(10, time, true); l.setUint16(12, day, true);
    l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, nm.length, true);
    const [ch, c] = rec(0x02014b50, 46);
    c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(12, time, true); c.setUint16(14, day, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true);
    c.setUint32(42, offset, true);
    parts.push(lh, data); central.push(ch); offset += lh.length + data.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return [...parts, ...central, end];
}

// ---- A demo recording: 24 synthesized pieces in every role, at `bpm` ----

// Laid out like the real one (silence, piece, silence, …), with a quiet
// noise floor inside each piece the way a phone mic has.
export function demoRecording(sr = 48000, bpm = 125) {
  const B = 60 / bpm * sr, rnd = makeRng(2024), noise = () => rnd.random() * 2 - 1;
  const hz = m => 440 * 2 ** ((m - 69) / 12);
  const buf = beats => new Float32Array(Math.round(beats * B));
  const env = (t, d) => Math.exp(-t / d);
  const at = (x, beat, fn, len) => {   // add fn(t) for `len` seconds from `beat`
    const a = Math.round(beat * B), n = Math.min(x.length - a, Math.round(len * sr));
    for (let k = 0; k < n; k++) x[a + k] += fn(k / sr);
  };
  const kick = (x, b, g = 1, d = 0.18, lo = 48) => { let ph = 0; at(x, b, t => { ph += 2 * Math.PI * (lo + 110 * env(t, 0.03)) / sr; return g * Math.sin(ph) * env(t, d); }, d * 6); };
  const snare = (x, b, g = 1) => { let lp = 0; at(x, b, t => { lp += 0.3 * (noise() - lp); return g * (1.1 * lp * env(t, 0.06) + 0.4 * Math.sin(2 * Math.PI * 190 * t) * env(t, 0.04)); }, 0.35); };   // noise under ~2.5 kHz
  const hat = (x, b, g = 0.35, d = 0.025) => { let p = 0; at(x, b, t => { const w = noise(), y = w - p; p = w; return g * y * env(t, d); }, d * 8); };
  const pluck = (x, b, m, beats, g = 0.32) => at(x, b, t => g * Math.min(1, t / 0.003) * env(t, 0.22) *
    (Math.sin(2 * Math.PI * hz(m) * t) + 0.5 * Math.sin(4 * Math.PI * hz(m) * t) + 0.25 * Math.sin(6 * Math.PI * hz(m) * t)), beats * 60 / bpm);
  const bassNote = (x, b, m, beats) => at(x, b, t => {
    let s = 0; for (let h = 1; h <= 6; h++) s += Math.sin(2 * Math.PI * hz(m) * h * t) / h;
    return 0.38 * Math.min(1, t / 0.004) * env(t, 0.3) * s;
  }, beats * 60 / bpm);
  const notes = (x, seq, fn = pluck) => seq.forEach((m, k) => { if (m != null) fn(x, k / 2, m, 0.5 * (seq.slice(k + 1).findIndex(q => q != null) + 1 || seq.length - k)); });
  const piece = (beats, draw) => { const x = buf(beats); draw(x); return x; };
  const oneShot = (secs, draw) => { const x = new Float32Array(Math.round(secs * sr)); draw(x); return x; };
  const riff = seq => piece(4, x => notes(x, seq));

  const pieces = [
    piece(2, x => notes(x, [64, 62, 60, null])),                        // 1-4 phrases
    piece(2, x => notes(x, [57, 60, 62, 64])),
    piece(4, x => notes(x, [69, null, 67, 64, null, 62, 60, null])),
    piece(2, x => notes(x, [60, null, 57, null])),
    piece(2, x => { for (let q = 0; q < 8; q++) hat(x, q / 4, q % 2 ? 0.12 : 0.2, 0.015); }),   // 5 shaker
    piece(4, x => { for (let q = 0; q < 16; q++) snare(x, q / 4, 0.25 + q * 0.04); }),       // 6 fill
    piece(8, x => { for (let q = 0; q < 16; q++) hat(x, q / 2, q % 2 ? 0.3 : 0.18, q % 4 === 3 ? 0.12 : 0.025); }),  // 7-9 hats
    piece(4, x => { for (let q = 0; q < 16; q++) hat(x, q / 4, q % 4 ? 0.14 : 0.28); }),
    piece(4, x => { for (let q = 0; q < 4; q++) hat(x, q + 0.5, 0.32, 0.06); }),
    oneShot(0.5, x => kick(x, 0)),                                        // 10 kick
    oneShot(0.08, x => hat(x, 0, 0.5, 0.006)),                            // 11 tick
    oneShot(0.4, x => snare(x, 0)),                                       // 12 snare
    riff([57, null, 60, null, 64, null, 60, 62]),                         // 13-18 riffs
    riff([57, null, 60, 64, null, 67, 64, null]),
    riff([55, null, 59, null, 62, null, 59, 60]),
    riff([69, 72, null, 76, null, 72, 74, null]),
    riff([69, null, 72, 74, 76, null, 74, 72]),
    riff([67, null, 71, null, 74, 72, 71, null]),
    piece(4, x => notes(x, [33, null, 33, 45, null, 33, null, 43], bassNote)),   // 19-20 bass
    piece(4, x => notes(x, [31, null, 31, 43, null, 31, 38, null], bassNote)),
    piece(4, x => [0, 1.5, 3].forEach(b => [57, 60, 64].forEach(m => pluck(x, b, m, 1, 0.16)))),   // 21 stabs
    oneShot(0.8, x => kick(x, 0, 1.1, 0.24, 42)),                         // 22 kick, heavier
    oneShot(0.5, x => { for (let q = 0; q < 4; q++) snare(x, q / 4, 0.4 + 0.15 * q); }),   // 23 roll
    oneShot(1.4, x => kick(x, 0, 1, 0.45, 38)),                           // 24 808
  ];
  const gap = Math.round(0.5 * sr), total = pieces.reduce((s, p) => s + p.length + gap, gap);
  const L = new Float32Array(total);
  let o = gap;
  for (const p of pieces) {
    for (let k = 0; k < p.length; k++) L[o + k] = p[k] * 0.8 + 3e-4 * noise();
    o += p.length + gap;
  }
  return { sr, L, R: L };
}

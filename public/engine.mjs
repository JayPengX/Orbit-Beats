// Passion Beats engine: the browser port of passion_beats.py. Splits a
// recording of beat pieces on silence and builds humanized songs from them.
// No DOM here, so the tests run it in Node.
//
// Audio is { sr, L, R } with L and R Float32Arrays (R may be L for mono).

export const BPM = 125;
export const PIECES = 24;
export const STYLES = ['four', 'hiphop', 'trap', 'half', 'broken'];
export const SECTIONS = ['intro', 'verse', 'hook', 'break', 'bridge', 'outro'];

// Piece roles, for the original 24-piece "Passion" recording (as in the .py).
// Loop length in beats for each repeating piece; the others are one-shots.
export const PERIOD = { 1: 2, 2: 2, 3: 4, 4: 2, 5: 2, 6: 4, 7: 8, 8: 4, 9: 4, 13: 4, 14: 4, 15: 4, 16: 4, 17: 4, 18: 4, 19: 4, 20: 4, 21: 4 };
export const RIFFSETS = [[13, 14, 15, 14], [16, 17, 18, 17], [13, 15], [16, 18], [21, 21, 15, 15], [14, 13, 14, 15], [17, 16, 17, 18], [21, 13, 21, 14]];
export const HATS = [7, 8, 9, 5];

// Arrangement rules (see README, "How it works"):
// a hook may lift to a related groove, never a foreign one;
const FAMILY = { four: ['four', 'broken'], broken: ['broken', 'four'], hiphop: ['hiphop', 'trap'], trap: ['trap', 'hiphop'], half: ['half', 'hiphop'] };
// and the song's body is verse–hook pairs, maybe a break first, maybe a
// break or bridge before a last hook. Verses and hooks are 4 or 8 bars,
// breaks and bridges 2 or 4: phrases come in fours.
const LENS = { verse: [4, 8], hook: [4, 8], break: [2, 4], bridge: [2, 4] };
export const FORMS = [['hook']];
for (let k = 1; k <= 4; k++)
  for (const lead of [[], ['break']])
    for (const end of [[], ['break', 'hook'], ['bridge', 'hook']])
      FORMS.push([...lead, ...Array(k).fill(['verse', 'hook']).flat(), ...end]);

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

// A song is the pieces exactly as recorded, placed on the 125 BPM grid and
// summed: no volume changes, panning, cutting or effects. Pieces may overlap.
// Humanize only moves when a piece starts.
class Song {
  constructor(bars, r, pieces, sr, humanize) {
    this.r = r; this.py = makeRng(r.int(0, 1e9 - 1)); this.pc = pieces;
    this.sr = sr; this.B = 60 / BPM * sr; this.bars = bars;
    const longest = Math.max(...pieces.map(p => p.L.length));   // the last pieces play out in full
    const len = Math.floor((bars * 4 + 2) * this.B) + longest;
    this.L = new Float32Array(len); this.R = new Float32Array(len);
    this.swing = r.uniform(0, 0.06) * humanize;        // beat fraction pushed on off-16ths
    this.loose = r.uniform(0.004, 0.012) * humanize;   // timing sd in seconds
    this.rest = new Set();                              // stop bars: loops and drums lay out
  }
  hit(i, beat, tight = false) {   // piece i, as recorded, from `beat`
    const { r, sr, B } = this, src = this.pc[i - 1];
    if (Math.abs((beat % 0.5) - 0.25) < 1e-6) beat += this.swing;
    const a = Math.max(0, Math.round(beat * B + r.normal(0, this.loose * (tight ? 0.4 : 1)) * sr));
    const end = Math.min(this.L.length, a + src.L.length);
    for (let k = 0, j = a; j < end; k++, j++) { this.L[j] += src.L[k]; this.R[j] += src.R[k]; }
  }
  loop(i, bar, nbars) {   // piece i every PERIOD[i] beats; the last may run on
    const p = PERIOD[i], end = (bar + nbars) * 4;
    for (let t = bar * 4; t < end - 1e-9; t += p) if (!this.rest.has(Math.floor(t / 4))) this.hit(i, t, true);
  }
  phrases(bar, nbars) {
    const end = (bar + nbars) * 4;
    for (let t = bar * 4; t < end - 1e-9;) {
      let i = this.py.choice([1, 2, 1, 4, 2, 3]);
      i = end - t >= 4 && this.r.random() < 0.2 ? 3 : (i !== 3 ? i : 1);
      if (t + PERIOD[i] > end) i = 1;
      this.hit(i, t); t += PERIOD[i];
    }
  }
  drums(style, bar, nbars) {
    const { r, py } = this;
    for (let br = bar; br < bar + nbars; br++) {
      if (this.rest.has(br)) continue;
      const t = br * 4;
      if (style === 'four') {
        for (let k = 0; k < 4; k++) this.hit(10, t + k);
        if (r.random() < 0.15) this.hit(10, t + 3.5);
      } else if (style === 'hiphop') {
        this.hit(22, t); this.hit(12, t + 2.5);
        if (r.random() < 0.35) this.hit(22, t + 1.75);
        if (r.random() < 0.2) this.hit(10, t + 3.75);
      } else if (style === 'trap') {
        this.hit(24, t); this.hit(10, t + 1.5); this.hit(24, t + 2.75);
        if (r.random() < 0.3) this.hit(24, t + 3.5);
      } else if (style === 'half') {
        this.hit(12, t);
        if (r.random() < 0.5) this.hit(22, t + 2.75);
      } else if (style === 'broken') {
        for (const q of py.choice([[0, 1.5, 2.5], [0, 0.75, 2.25, 3], [0, 2, 2.75], [0, 1.25, 2.5, 3.5]])) this.hit(py.choice([10, 22, 24]), t + q);
      }
      if (r.random() < 0.35)   // ticks between the hits
        for (const q of py.choice([[0.5], [1.5, 3.5], [0.5, 1.5, 2.5, 3.5]])) this.hit(11, t + q);
    }
  }
  fill(bar, kinds) {   // the end of `bar`
    const t = bar * 4, kind = this.py.choice(kinds);
    if (kind === 'roll') this.hit(23, t + 3);
    else if (kind === 'roll2') { this.hit(23, t + 3); this.hit(23, t + 3.5); }
    else if (kind === 'stutter') for (const q of [2.5, 3, 3.25, 3.5, 3.75]) this.hit(this.py.choice([10, 12]), t + q);
    else if (kind === 'fill6') this.hit(6, t, true);
    else if (kind === 'tick') for (const q of [3, 3.25, 3.5, 3.75]) this.hit(11, t + q);
    // 'drop': no fill
  }
  render() {
    const { L, R, sr } = this;
    let last = L.length - 1;
    while (last > 0 && Math.abs(L[last]) <= 1e-5 && Math.abs(R[last]) <= 1e-5) last--;
    const n = Math.min(L.length, last + 1 + Math.floor(0.5 * sr));   // the last notes ring out, then 0.5 s
    const oL = L.subarray(0, n), oR = R.subarray(0, n);
    // Overlaps are left as they add up, even past full scale (1.0): a
    // 32-bit float WAV keeps them; 16-bit clips them.
    let peak = 0;
    for (let j = 0; j < n; j++) peak = Math.max(peak, Math.abs(oL[j]), Math.abs(oR[j]));
    return { sr, L: oL, R: oR, peak };
  }
}

export const MIN_BARS = 8;   // intro, a 4-bar hook, outro

function* fits(form, bars) {   // every choice of section lengths adding up to `bars`
  if (!form.length) { if (bars === 0) yield []; return; }
  for (const L of LENS[form[0]]) if (L <= bars) for (const rest of fits(form.slice(1), bars - L)) yield [L, ...rest];
}

// The song's sections: [type, first bar, bars]. An even number of bars when
// the range has one (an odd one gets a 3-bar outro).
export function planSong(R, minBars, maxBars) {
  const evens = [];
  for (let t = minBars; t <= maxBars; t++) if (t % 2 === 0) evens.push(t);
  const target = evens.length ? R.choice(evens) : minBars;
  const choices = new Map();   // form -> every [intro, lengths, outro] that fits
  for (const intro of [2, 4]) for (const outro of target % 2 ? [3] : [2, 4])
    for (const form of FORMS) for (const lens of fits(form, target - intro - outro)) {
      if (!choices.has(form)) choices.set(form, []);
      choices.get(form).push([intro, lens, outro]);
    }
  if (!choices.size) throw new Error(`No song form fits ${target} bars`);
  const form = R.choice([...choices.keys()]), [intro, lens, outro] = R.choice(choices.get(form));
  const plan = [['intro', 0, intro]];
  let bar = intro;
  form.forEach((t, k) => { plan.push([t, bar, lens[k]]); bar += lens[k]; });
  plan.push(['outro', bar, outro]);
  return plan;
}

// One song from `pieces` (at least 24, from splitPieces).
export function makeSong(pieces, sr, seed, { minBars = 25, maxBars = 29, styles = STYLES, humanize = 1 } = {}) {
  if (pieces.length < PIECES) throw new Error(`Need ${PIECES} pieces, found ${pieces.length}`);
  if (!(minBars >= MIN_BARS && minBars <= maxBars)) throw new Error(`Length must be ${MIN_BARS} bars or more, shortest first`);
  if (!styles.length) throw new Error('Pick at least one drum style');
  const r = makeRng(seed), R = makeRng(seed ^ 0x5bd1e995);

  // Choices made once, so what repeats sounds the same each time.
  const style = R.choice(styles), kin = FAMILY[style].filter(x => styles.includes(x));
  const hookStyle = R.random() < 0.4 ? R.choice(kin) : style;          // every hook the same groove
  const rs = r.sample(RIFFSETS.length, 3).map(i => RIFFSETS[i]);       // intro/outro, verse, hook
  const bridgeSet = R.choice(RIFFSETS.filter(x => !rs.includes(x)));    // a bridge contrasts
  const bassMode = R.choice(['alt', '19', '20', 'sparse']);
  const verseHat = R.choice(HATS), hookHat = R.choice([7, 8, 9].filter(h => h !== verseHat));
  const hookLayer = R.random() < 0.5;                                   // riff 21 over every hook

  const plan = planSong(R, minBars, maxBars), bars = plan.at(-1)[1] + plan.at(-1)[2];
  const hooks = plan.filter(([t]) => t === 'hook').length;
  const s = new Song(bars, r, pieces, sr, humanize);

  // How each section hands over, decided first: the bar before a hook may be
  // a stop bar (everything lays out but the fill). Fills fit where they lead:
  // a build into a hook, something light into a verse, next to nothing into
  // a quiet section.
  const INTO = { hook: ['roll', 'roll2', 'stutter', 'fill6'], verse: ['roll', 'roll2', 'tick', 'drop'], break: ['drop', 'tick'], bridge: ['drop', 'tick'], outro: ['roll', 'roll2', 'stutter'] };
  const into = plan.map(([, b, L], idx) => {
    const nb = b + L - 1, next = plan[idx + 1]?.[0];
    if (!next) return [nb, ['roll', 'roll2', 'stutter']];   // the ending
    if (next === 'hook' && L >= 4 && R.random() < 0.35) { s.rest.add(nb); return [nb, ['fill6', 'stutter']]; }
    return [nb, INTO[next]];
  });

  const bass = (b, n, from = 0) => {
    for (let k = from; k < n; k++) {
      if (bassMode === 'sparse' && r.random() < 0.4) continue;
      const i = bassMode === 'alt' ? [19, 20][k % 2] : bassMode === 'sparse' ? R.choice([19, 20]) : +bassMode;
      s.loop(i, b + k, 1);
    }
  };
  const riff = (b, n, set) => {
    for (let k = 0; k < n; k++) {
      if (k % 4 === 3 && k < n - 1 && r.random() < 0.2) continue;   // lay out at a phrase's end, not mid-phrase
      s.loop(set[k % set.length], b + k, 1);
    }
  };
  let verseNo = 0, hookNo = 0;
  plan.forEach(([t, b, L], idx) => {
    if (t === 'intro') {   // previews: hats then a riff, a riff, or phrases
      const c = R.choice(['riff', 'phr', 'hats']);
      if (c === 'riff') riff(b, L, rs[0]);
      else if (c === 'phr') s.phrases(b, L);
      else { s.loop(verseHat, b, L); s.loop(rs[0][0], b + Math.floor(L / 2), L - Math.floor(L / 2)); }
    } else if (t === 'verse') {   // the first verse builds: bass comes in halfway
      verseNo++;
      riff(b, L, rs[1]); bass(b, L, verseNo === 1 ? Math.floor(L / 2) : 0);
      s.drums(style, b, L); s.loop(verseHat, b, L);
      if (R.random() < 0.4) s.phrases(b + L - 4, 4);
    } else if (t === 'hook') {   // the last hook is the fullest
      hookNo++;
      riff(b, L, rs[2]); bass(b, L); s.drums(hookStyle, b, L); s.loop(hookHat, b, L);
      if (hookLayer || hookNo === hooks) riff(b, L, [21]);
    } else if (t === 'break') {   // strip back: no drums, no bass
      s.phrases(b, L);
      if (R.random() < 0.6) s.loop(5, b, L);
    } else if (t === 'bridge') {   // contrast: another riff set, half-time
      riff(b, L, bridgeSet); s.drums('half', b, L);
      if (R.random() < 0.5) bass(b, L);
    } else if (t === 'outro') {   // the intro's riff again, winding down
      riff(b, L, rs[0]);
      if (R.random() < 0.6) s.drums(style, b, Math.floor(L / 2));
      s.loop(verseHat, b, L);
    }
    if (L === 8 && (t === 'verse' || t === 'hook') && R.random() < 0.3) s.fill(b + 3, ['tick', 'roll']);   // mid-section turnaround
    s.fill(...into[idx]);
  });
  s.hit(R.choice([22, 24]), bars * 4);   // one last hit on the next downbeat
  const audio = s.render();
  return { audio, info: { style, alt: hookStyle, bass: bassMode, bars, beats: bars * 4, seconds: audio.L.length / sr, peak: audio.peak, plan: plan.map(([t, , L]) => [t, L]) } };
}

// "Passion DD-MM-YYYY HH-MM", in local time.
export function songName(date) {
  const p = x => String(x).padStart(2, '0');
  return `Passion ${p(date.getDate())}-${p(date.getMonth() + 1)}-${date.getFullYear()} ${p(date.getHours())}-${p(date.getMinutes())}`;
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

// ---- A demo recording: 24 synthesized pieces in the roles above ----

// Laid out like the real one (silence, piece, silence, …), with a quiet
// noise floor inside each piece the way a phone mic has.
export function demoRecording(sr = 48000) {
  const B = 60 / BPM * sr, rnd = makeRng(2024), noise = () => rnd.random() * 2 - 1;
  const hz = m => 440 * 2 ** ((m - 69) / 12);
  const buf = beats => new Float32Array(Math.round(beats * B));
  const env = (t, d) => Math.exp(-t / d);
  const at = (x, beat, fn, len) => {   // add fn(t) for `len` seconds from `beat`
    const a = Math.round(beat * B), n = Math.min(x.length - a, Math.round(len * sr));
    for (let k = 0; k < n; k++) x[a + k] += fn(k / sr);
  };
  const kick = (x, b, g = 1, d = 0.18, lo = 48) => { let ph = 0; at(x, b, t => { ph += 2 * Math.PI * (lo + 110 * env(t, 0.03)) / sr; return g * Math.sin(ph) * env(t, d); }, d * 6); };
  const snare = (x, b, g = 1) => at(x, b, t => g * (0.55 * noise() * env(t, 0.06) + 0.4 * Math.sin(2 * Math.PI * 190 * t) * env(t, 0.04)), 0.35);
  const hat = (x, b, g = 0.35, d = 0.025) => { let p = 0; at(x, b, t => { const w = noise(), y = w - p; p = w; return g * y * env(t, d); }, d * 8); };
  const pluck = (x, b, m, beats, g = 0.32) => at(x, b, t => g * Math.min(1, t / 0.003) * env(t, 0.22) *
    (Math.sin(2 * Math.PI * hz(m) * t) + 0.5 * Math.sin(4 * Math.PI * hz(m) * t) + 0.25 * Math.sin(6 * Math.PI * hz(m) * t)), beats * 60 / BPM);
  const bassNote = (x, b, m, beats) => at(x, b, t => {
    let s = 0; for (let h = 1; h <= 6; h++) s += Math.sin(2 * Math.PI * hz(m) * h * t) / h;
    return 0.38 * Math.min(1, t / 0.004) * env(t, 0.3) * s;
  }, beats * 60 / BPM);
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

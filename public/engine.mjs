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
  return segs.filter(([a, b]) => b - a >= minLen).map(([a, b]) => {
    const pl = L.slice(a, b), pr = R === L ? pl : R.slice(a, b);
    const f = Math.min(64, Math.floor(pl.length / 4));
    for (let k = 0; k < f; k++) {
      const w = f > 1 ? 1 - k / (f - 1) : 1, j = pl.length - f + k;
      pl[j] *= w; if (pr !== pl) pr[j] *= w;
    }
    return { L: pl, R: pr };
  });
}

// ---- Songs ----

class Song {
  constructor(bars, r, pieces, sr, humanize) {
    this.r = r; this.py = makeRng(r.int(0, 1e9 - 1)); this.pc = pieces;
    this.sr = sr; this.B = 60 / BPM * sr; this.bars = bars;
    const len = Math.floor((bars * 4 + 4) * this.B);
    this.L = new Float32Array(len); this.R = new Float32Array(len);
    this.swing = r.uniform(0, 0.06) * humanize;        // beat fraction pushed on off-16ths
    this.loose = r.uniform(0.004, 0.012) * humanize;   // timing sd in seconds
    this.pans = {};
  }
  pan(i) {
    if (!(i in this.pans)) this.pans[i] = this.r.uniform(-0.25, 0.25);
    const p = this.pans[i]; return [1 - Math.max(0, p), 1 + Math.min(0, p)];
  }
  hit(i, beat, g = 1, cut = null, tight = false) {
    const { r, sr, B } = this, src = this.pc[i - 1];
    let n = src.L.length, f = 0;
    if (cut) { n = Math.min(n, Math.floor(cut * B)); f = Math.min(n, Math.floor(0.012 * sr)); }
    if (Math.abs((beat % 0.5) - 0.25) < 1e-6) beat += this.swing;
    const sd = this.loose * (tight ? 0.4 : 1);
    const a = Math.max(0, Math.round(beat * B + r.normal(0, sd) * sr));
    g = g * r.uniform(0.82, 1.08) * (Math.abs(beat % 4) < 1e-6 ? 1.08 : 1);
    const [gl, gr] = this.pan(i), end = Math.min(this.L.length, a + n), fadeAt = n - f;
    for (let k = 0, j = a; j < end; k++, j++) {
      const w = k < fadeAt ? g : g * (f > 1 ? 1 - (k - fadeAt) / (f - 1) : 1);
      this.L[j] += w * gl * src.L[k]; this.R[j] += w * gr * src.R[k];
    }
  }
  loop(i, bar, nbars, g = 1, dropProb = 0) {
    const p = PERIOD[i], end = (bar + nbars) * 4;
    for (let t = bar * 4; t < end - 1e-9; t += p) {
      if (this.r.random() < dropProb) continue;
      const cut = i === 6 ? 4 : (t + p > end + 1e-9 ? end - t : null);
      this.hit(i, t, g, cut, true);
    }
  }
  phrases(bar, nbars, g = 0.8) {
    const end = (bar + nbars) * 4;
    for (let t = bar * 4; t < end - 1e-9;) {
      let i = this.py.choice([1, 2, 1, 4, 2, 3]);
      i = end - t >= 4 && this.r.random() < 0.2 ? 3 : (i !== 3 ? i : 1);
      if (t + PERIOD[i] > end) i = 1;
      this.hit(i, t, g); t += PERIOD[i];
    }
  }
  drums(style, bar, nbars, g = 0.8) {
    const { r, py } = this;
    for (let br = bar; br < bar + nbars; br++) {
      const t = br * 4;
      if (style === 'four') {
        for (let k = 0; k < 4; k++) this.hit(10, t + k, g * (k % 2 === 0 ? 1 : 0.9));
        if (r.random() < 0.15) this.hit(10, t + 3.5, g * 0.45);
      } else if (style === 'hiphop') {
        this.hit(22, t, g); this.hit(12, t + 2.5, g * 0.9);
        if (r.random() < 0.35) this.hit(22, t + 1.75, g * 0.5);
        if (r.random() < 0.2) this.hit(10, t + 3.75, g * 0.4);
      } else if (style === 'trap') {
        this.hit(24, t, g); this.hit(10, t + 1.5, g * 0.8); this.hit(24, t + 2.75, g * 0.8);
        if (r.random() < 0.3) this.hit(24, t + 3.5, g * 0.5);
      } else if (style === 'half') {
        this.hit(12, t, g);
        if (r.random() < 0.5) this.hit(22, t + 2.75, g * 0.6);
      } else if (style === 'broken') {
        const pat = py.choice([[0, 1.5, 2.5], [0, 0.75, 2.25, 3], [0, 2, 2.75], [0, 1.25, 2.5, 3.5]]);
        for (const q of pat) this.hit(py.choice([10, 22, 24]), t + q, g * (q === 0 ? 1 : 0.75));
      }
      if (r.random() < 0.35)   // ghost ticks
        for (const q of py.choice([[0.5], [1.5, 3.5], [0.5, 1.5, 2.5, 3.5]])) this.hit(11, t + q, 0.5);
    }
  }
  fill(bar) {   // the end of `bar`
    const t = bar * 4, kind = this.py.choice(['roll', 'roll2', 'stutter', 'fill6', 'drop', 'tick']);
    if (kind === 'roll') this.hit(23, t + 3);
    else if (kind === 'roll2') { this.hit(23, t + 3); this.hit(23, t + 3.5, 0.8); }
    else if (kind === 'stutter') for (const q of [2.5, 3, 3.25, 3.5, 3.75]) this.hit(this.py.choice([10, 12]), t + q, 0.5 + 0.1 * q);
    else if (kind === 'fill6') this.loop(6, bar, 1, 0.6);
    else if (kind === 'tick') for (const q of [3, 3.25, 3.5, 3.75]) this.hit(11, t + q, 0.8);
    // 'drop': no fill
  }
  mute(b0, b1) {   // silence a span of beats: a dramatic dropout
    const a = Math.floor(b0 * this.B), b = Math.floor(b1 * this.B), f = Math.floor(0.01 * this.sr);
    for (let j = a; j < b && j < this.L.length; j++) {
      const w = j < a + f ? 1 - (j - a) / (f - 1) : 0;
      this.L[j] *= w; this.R[j] *= w;
    }
  }
  render() {
    const { L, R, sr, B } = this, e = Math.floor(this.bars * 4 * B), fo = Math.floor(8 * B);
    for (let j = Math.max(0, e - fo); j < e; j++) {
      const w = (1 - (j - (e - fo)) / (fo - 1)) ** 1.5; L[j] *= w; R[j] *= w;
    }
    L.fill(0, e); R.fill(0, e);
    let last = e - 1;
    while (last > 0 && Math.abs(L[last]) <= 1e-5 && Math.abs(R[last]) <= 1e-5) last--;
    const n = Math.min(L.length, last + Math.floor(0.5 * sr));
    let peak = 0;
    for (let j = 0; j < n; j++) peak = Math.max(peak, Math.abs(L[j]), Math.abs(R[j]));
    const k = peak > 0 ? 1.4 / peak : 0, out = 0.89 / Math.tanh(1.4);
    const oL = L.subarray(0, n), oR = R.subarray(0, n);
    for (let j = 0; j < n; j++) { oL[j] = Math.tanh(oL[j] * k) * out; oR[j] = Math.tanh(oR[j] * k) * out; }
    return { sr, L: oL, R: oR };
  }
}

export const MIN_BARS = 8;   // the longest intro and outro together

// One song from `pieces` (at least 24, from splitPieces).
export function makeSong(pieces, sr, seed, { minBars = 25, maxBars = 29, styles = STYLES, humanize = 1 } = {}) {
  if (pieces.length < PIECES) throw new Error(`Need ${PIECES} pieces, found ${pieces.length}`);
  if (!(minBars >= MIN_BARS && minBars <= maxBars)) throw new Error(`Length must be ${MIN_BARS} bars or more, shortest first`);
  if (!styles.length) throw new Error('Pick at least one drum style');
  const r = makeRng(seed), R = makeRng(seed ^ 0x5bd1e995);
  const style = R.choice(styles), alt = R.choice(styles);
  const rs = r.sample(RIFFSETS.length, 3).map(i => RIFFSETS[i]);
  const bassMode = R.choice(['alt', '19', '20', 'sparse']);

  // The plan: intro, irregular sections, outro; exactly `target` bars.
  const target = R.int(minBars, maxBars), intro = R.choice([2, 4]), outro = R.choice([2, 4]);
  const lens = { verse: [4, 6, 8], hook: [4, 6, 8], break: [2, 4], bridge: [2, 4] };
  const pool = ['verse', 'hook', 'break', 'verse', 'hook', 'bridge'];
  const plan = [['intro', 0, intro]];
  let mid = target - intro - outro, bar = intro, last = null;
  while (mid > 0) {
    const t = R.choice(pool.filter(p => p !== last)); last = t;
    let L = Math.min(mid, R.choice(lens[t]));
    if (mid - L === 1) L += 1;
    plan.push([t, bar, L]); bar += L; mid -= L;
  }
  plan.push(['outro', bar, outro]); bar += outro;

  const s = new Song(bar, r, pieces, sr, humanize);
  const bass = (b, n, g = 0.85) => {
    for (let k = 0; k < n; k++) {
      if (bassMode === 'sparse' && r.random() < 0.4) continue;
      const i = bassMode === 'alt' ? [19, 20][k % 2] : bassMode === 'sparse' ? R.choice([19, 20]) : +bassMode;
      s.loop(i, b + k, 1, g);
    }
  };
  const riff = (b, n, set, g = 1) => {
    for (let k = 0; k < n; k++) {
      if (r.random() < 0.08) continue;   // human: lay out a bar now and then
      s.loop(set[k % set.length], b + k, 1, g);
    }
  };
  plan.forEach(([t, b, L], idx) => {
    const hat = R.choice(HATS), hg = r.uniform(0.4, 0.7);
    if (t === 'intro') {
      const c = R.choice(['riff', 'phr', 'hats']);
      if (c === 'riff') riff(b, L, rs[0], 0.8);
      else if (c === 'phr') s.phrases(b, L, 0.7);
      else { s.loop(hat, b, L, hg); s.loop(R.choice([13, 16, 21]), b + Math.floor(L / 2), L - Math.floor(L / 2), 0.7); }
    } else if (t === 'verse') {
      riff(b, L, rs[1]); bass(b, L); s.drums(style, b, L); s.loop(hat, b, L, hg, 0.05);
      if (R.random() < 0.4) s.phrases(L >= 4 ? b + L - 4 : b, Math.min(4, L), 0.45);
    } else if (t === 'hook') {
      riff(b, L, rs[2]); bass(b, L, 0.95); s.drums(R.random() < 0.4 ? alt : style, b, L, 0.85);
      s.loop(hat !== 7 ? 7 : 9, b, L, hg);
      if (R.random() < 0.5) riff(b, L, [21], 0.45);
    } else if (t === 'break') {
      s.phrases(b, L, 0.75);
      if (R.random() < 0.6) s.loop(5, b, L, 0.45);
    } else if (t === 'bridge') {
      riff(b, L, R.choice(RIFFSETS), 0.8); s.drums('half', b, L, 0.7);
      if (R.random() < 0.5) bass(b, L, 0.7);
    } else if (t === 'outro') {
      riff(b, L, rs[0], 0.8);
      if (R.random() < 0.6) s.drums(style, b, Math.floor(L / 2), 0.6);
      s.loop(hat, b, L, hg * 0.8); s.hit(R.choice([22, 24, 10]), (b + L) * 4 - 4, 0.7);
    }
    if (idx < plan.length - 1) {   // into the next section
      const nb = b + L - 1;
      if (R.random() < 0.25 && ['hook', 'verse'].includes(plan[idx + 1][0])) s.mute(nb * 4 + 3, nb * 4 + 4);
      else s.fill(nb);
    }
  });
  const audio = s.render();
  return { audio, info: { style, alt, bass: bassMode, bars: bar, beats: bar * 4, seconds: audio.L.length / sr, plan: plan.map(([t, , L]) => [t, L]) } };
}

// A batch's songs, as the .py picks them: each a name like Passion_HH-MM
// (a random time, never repeated) and its own seed.
export function batch(count, seed) {
  const r = makeRng(seed), used = new Set(), p = x => String(x).padStart(2, '0'), out = [];
  for (let k = 0; k < Math.min(count, 1440); k++) {
    let name;
    do name = `Passion_${p(r.int(0, 23))}-${p(r.int(0, 59))}`; while (used.has(name));
    used.add(name); out.push({ name, seed: r.int(0, 1e9 - 1) });
  }
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

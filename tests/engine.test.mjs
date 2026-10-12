import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, STYLES, FORMS, makeRng, parseWav, splitPieces, planSong, makeSong, batch, songName, encodeWav, zipParts, crc32, demoRecording } from '../public/engine.mjs';

const rec = demoRecording();
const pieces = splitPieces(rec);

test('the demo recording splits into its 24 pieces', () => {
  assert.equal(pieces.length, PIECES);
  const beats = pieces.map(p => Math.round(p.L.length / (0.48 * rec.sr) * 10) / 10);
  assert.deepEqual(beats.slice(0, 9), [2, 2, 4, 2, 2, 4, 8, 4, 4]);   // the loops keep their lengths
});

test('a piece right at the start or end still counts (the .py lost it)', () => {
  const gap = Math.round(0.5 * rec.sr), cut = { sr: rec.sr, L: rec.L.subarray(gap, rec.L.length - gap) };
  cut.R = cut.L;
  assert.equal(splitPieces(cut).length, PIECES);
});

test('a short pause inside a piece, or a click between pieces, splits nothing', () => {
  const sr = 1000, L = new Float32Array(3000);
  L.fill(0.5, 0, 1000); L.fill(0.5, 1100, 2000);   // a 0.1 s pause: one piece
  L[2500] = 0.9;                                    // a 1 ms click after a gap
  assert.equal(splitPieces({ sr, L, R: L }).length, 1);
  assert.equal(splitPieces({ sr, L, R: L }, { minGap: 0.05 }).length, 2);
});

test('songs keep to the length asked and are the same for the same seed', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const { audio, info } = makeSong(pieces, rec.sr, seed, { minBars: 25, maxBars: 29 });
    assert.ok([26, 28].includes(info.bars), `bars ${info.bars}`);   // even, in the range
    assert.equal(info.plan.reduce((s, [, n]) => s + n, 0), info.bars);
    for (const v of audio.L) assert.ok(Number.isFinite(v));
    // the bars, then the last hit ringing out, then 0.5 s
    assert.ok(info.seconds > info.beats * 0.48 && info.seconds < info.beats * 0.48 + 3, `${info.seconds}s for ${info.beats} beats`);
  }
  const a = makeSong(pieces, rec.sr, 42).audio.L, b = makeSong(pieces, rec.sr, 42).audio.L;
  assert.deepEqual(a, b);
});

test('a song is the pieces exactly as recorded: no volume change, panning or effects, overlaps left as they add up', () => {
  // Every piece a single sample of 0.25 (left) and -0.5 (right): on a strict
  // grid, every sample of the song must be a whole number of those.
  const sr = 1000, unit = Array.from({ length: PIECES }, () => {
    const L = new Float32Array(40), R = new Float32Array(40); L[0] = 0.25; R[0] = -0.5; return { L, R };
  });
  const { audio, info } = makeSong(unit, sr, 7, { humanize: 0 });
  let most = 0;
  for (let j = 0; j < audio.L.length; j++) {
    const k = audio.L[j] / 0.25;
    assert.equal(k, Math.round(k)); assert.ok(audio.R[j] === -2 * audio.L[j]);
    most = Math.max(most, k);
  }
  assert.ok(most >= 4, `overlaps add up: ${most} pieces at once`);
  assert.equal(info.peak, most * 0.5);   // the right side, unscaled
  // and the real demo goes past full scale, untouched
  assert.ok(makeSong(pieces, rec.sr, 1).info.peak > 1);
});

test('song forms follow the rules: phrases in fours, a hook after a verse, ending on a hook', () => {
  const R = makeRng(5);
  for (let k = 0; k < 300; k++) {
    const lo = 8 + Math.floor(R.random() * 50), hi = lo + Math.floor(R.random() * 6);
    const plan = planSong(R, lo, Math.min(hi, 64)), bars = plan.reduce((s, [, , n]) => s + n, 0);
    const body = plan.slice(1, -1), types = body.map(([t]) => t);
    assert.ok(bars >= lo && bars <= Math.min(hi, 64), `${bars} in ${lo}-${hi}`);
    assert.equal(plan[0][0], 'intro'); assert.equal(plan.at(-1)[0], 'outro');
    assert.ok(FORMS.some(f => f.join() === types.join()), types.join());
    assert.equal(types.at(-1), 'hook');
    for (let i = 1; i < types.length; i++) assert.notEqual(types[i], types[i - 1]);
    if (types.length > 1) assert.equal(types[types.indexOf('hook') - 1], 'verse');
    for (const [t, , n] of body) assert.ok((t === 'verse' || t === 'hook' ? [4, 8] : [2, 4]).includes(n), `${t} ${n}`);
    plan.reduce((at, [, b, n]) => { assert.equal(b, at); return at + n; }, 0);
  }
});

test('settings: drum styles, humanize off, a fixed length', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const { info } = makeSong(pieces, rec.sr, seed, { styles: ['trap'], humanize: 0, minBars: 12, maxBars: 12 });
    assert.equal(info.style, 'trap'); assert.equal(info.alt, 'trap'); assert.equal(info.bars, 12);
  }
  for (let seed = 1; seed <= 20; seed++) {   // hooks only lift to a related groove
    const { info } = makeSong(pieces, rec.sr, seed, { minBars: 8, maxBars: 8 });
    const ok = { four: ['four', 'broken'], broken: ['broken', 'four'], hiphop: ['hiphop', 'trap'], trap: ['trap', 'hiphop'], half: ['half', 'hiphop'] };
    assert.ok(ok[info.style].includes(info.alt), `${info.style} -> ${info.alt}`);
  }
});

test('bad settings and too few pieces are refused', () => {
  assert.throws(() => makeSong(pieces.slice(0, 23), rec.sr, 1), /Need 24 pieces/);
  assert.throws(() => makeSong(pieces, rec.sr, 1, { minBars: 30, maxBars: 25 }), /shortest first/);
  assert.throws(() => makeSong(pieces, rec.sr, 1, { minBars: 4, maxBars: 6 }), /8 bars/);
  assert.throws(() => makeSong(pieces, rec.sr, 1, { styles: [] }), /drum style/);
});

test('songs are named for when they are made, a minute apart, and their seeds follow the batch seed', () => {
  const start = new Date(2026, 11, 31, 23, 58);   // 31 Dec 2026, 23:58 local
  const a = batch(4, 7, start);
  assert.deepEqual(a.map(s => s.name), ['Passion 31-12-2026 23-58', 'Passion 31-12-2026 23-59', 'Passion 01-01-2027 00-00', 'Passion 01-01-2027 00-01']);
  assert.equal(songName(new Date(2026, 0, 5, 7, 3)), 'Passion 05-01-2026 07-03');
  assert.deepEqual(batch(4, 7, start), a);
  assert.notDeepEqual(batch(4, 8, start).map(s => s.seed), a.map(s => s.seed));
});

test('WAVs: 16-bit and 32-bit float out read back in; 8-bit mono and 24-bit read', () => {
  const sr = 44100, L = Float32Array.from({ length: 500 }, (_, i) => Math.sin(i / 7) * 0.5), R = L.map(v => -v);
  for (const bits of [16, 32]) {
    const back = parseWav(encodeWav({ sr, L, R }, bits).buffer);
    assert.equal(back.sr, sr); assert.equal(back.L.length, 500);
    for (let i = 0; i < 500; i++) { assert.ok(Math.abs(back.L[i] - L[i]) < 1e-4); assert.ok(Math.abs(back.R[i] - R[i]) < 1e-4); }
  }
  const head = (format, ch, bits, data) => {
    const b = new Uint8Array(44 + data.length), v = new DataView(b.buffer), s = (o, t) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + data.length, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, format, true); v.setUint16(22, ch, true); v.setUint32(24, 8000, true); v.setUint16(34, bits, true);
    s(36, 'data'); v.setUint32(40, data.length, true); b.set(data, 44); return b;
  };
  const u8 = parseWav(head(1, 1, 8, new Uint8Array([128, 255, 0])).buffer);
  assert.deepEqual([...u8.L].map(v => +v.toFixed(3)), [0, 0.992, -1]); assert.equal(u8.R, u8.L);
  const s24 = parseWav(head(1, 1, 24, new Uint8Array([0, 0, 0x40, 0, 0, 0xc0])).buffer);
  assert.deepEqual([...s24.L], [0.5, -0.5]);
  assert.equal(parseWav(new Uint8Array(64).buffer), null);
});

test('the zip is a valid stored archive', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const files = [{ name: 'a.wav', data: new Uint8Array([1, 2, 3]) }, { name: 'b.wav', data: new Uint8Array(10) }];
  const parts = zipParts(files), all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  const v = new DataView(all.buffer), end = all.length - 22;
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(end, true), 0x06054b50);
  assert.equal(v.getUint16(end + 10, true), 2);
  assert.equal(v.getUint32(end + 16, true) + v.getUint32(end + 12, true), end);   // central dir offset + size
});

test('the randomness is uniform enough and normal() is centred', () => {
  const r = makeRng(1);
  let sum = 0, sq = 0;
  for (let i = 0; i < 20000; i++) { const z = r.normal(0, 1); sum += z; sq += z * z; }
  assert.ok(Math.abs(sum / 20000) < 0.05 && Math.abs(sq / 20000 - 1) < 0.05);
  const picks = new Set(Array.from({ length: 200 }, () => r.choice(STYLES)));
  assert.equal(picks.size, STYLES.length);
});

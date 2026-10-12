import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, STYLES, makeRng, parseWav, splitPieces, makeSong, batch, encodeWav, zipParts, crc32, demoRecording } from '../public/engine.mjs';

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

test('songs keep to the length asked, never clip, and are the same for the same seed', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const { audio, info } = makeSong(pieces, rec.sr, seed, { minBars: 25, maxBars: 29 });
    assert.ok(info.bars >= 25 && info.bars <= 29, `bars ${info.bars}`);
    assert.equal(info.plan.reduce((s, [, n]) => s + n, 0), info.bars);
    assert.equal(info.plan[0][0], 'intro'); assert.equal(info.plan.at(-1)[0], 'outro');
    let peak = 0;
    for (const v of audio.L) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak > 0.8 && peak <= 0.89 + 1e-6, `peak ${peak}`);
    assert.ok(Math.abs(info.seconds - info.beats * 0.48) < 1, `${info.seconds}s for ${info.beats} beats`);
  }
  const a = makeSong(pieces, rec.sr, 42).audio.L, b = makeSong(pieces, rec.sr, 42).audio.L;
  assert.deepEqual(a, b);
});

test('settings: drum styles, humanize off, a fixed length', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const { info } = makeSong(pieces, rec.sr, seed, { styles: ['trap'], humanize: 0, minBars: 12, maxBars: 12 });
    assert.equal(info.style, 'trap'); assert.equal(info.alt, 'trap'); assert.equal(info.bars, 12);
  }
});

test('bad settings and too few pieces are refused', () => {
  assert.throws(() => makeSong(pieces.slice(0, 23), rec.sr, 1), /Need 24 pieces/);
  assert.throws(() => makeSong(pieces, rec.sr, 1, { minBars: 30, maxBars: 25 }), /shortest first/);
  assert.throws(() => makeSong(pieces, rec.sr, 1, { minBars: 4, maxBars: 6 }), /8 bars/);
  assert.throws(() => makeSong(pieces, rec.sr, 1, { styles: [] }), /drum style/);
});

test("a batch's names never repeat and its seeds follow the batch seed", () => {
  const a = batch(30, 7), b = batch(30, 7);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map(s => s.name)).size, 30);
  for (const { name } of a) assert.match(name, /^Passion_([01]\d|2[0-3])-[0-5]\d$/);
  assert.notDeepEqual(batch(30, 8), a);
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

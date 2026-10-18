import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, decode, encode, merge, keptSettings, kitEntry, MOST_KITS } from '../public/lib/kits.mjs';
import { resample, atRate, splitAll, baseName } from '../public/lib/sources.mjs';

const tone = (n, f = 0.01) => Float32Array.from({ length: n }, (_, i) => Math.sin(i * f) * 0.5);

test("a kit's fingerprint: the same sound the same print anywhere; another sound another", () => {
  const a = [{ L: tone(48000) }, { L: tone(24000, 0.02) }];
  assert.equal(fingerprint(a), fingerprint([{ L: tone(48000) }, { L: tone(24000, 0.02) }]));
  assert.notEqual(fingerprint(a), fingerprint([{ L: tone(48000) }]));
  assert.notEqual(fingerprint(a), fingerprint([{ L: tone(48000, 0.011) }, { L: tone(24000, 0.02) }]));
  assert.match(fingerprint(a), /^k[0-9a-z]+$/);
});

test("the Pass's payload: newer settings win, each kit the newer, the newest forty kept; a broken one is empty", () => {
  const mine = { v: 1, settings: keptSettings({ count: 5, styles: ['trap'], seed: '', humanize: NaN }, 10), kits: { ka: kitEntry(90, ['riff', 'kick'], new Set([1]), 5) } };
  assert.deepEqual(mine.settings, { at: 10, count: 5, styles: ['trap'], seed: '' }, 'an unset number not kept');
  assert.deepEqual(mine.kits.ka, { bpm: 90, roles: { 1: 'kick' }, at: 5 }, 'only the roles set by hand');
  const theirs = { v: 1, settings: { at: 20, count: 9 }, kits: { ka: { bpm: 180, roles: {}, at: 1 }, kb: { bpm: 120, roles: {}, at: 30 } } };
  const m = merge(mine, theirs);
  assert.equal(m.settings.count, 9);
  assert.equal(m.kits.ka.bpm, 90, 'ours is newer');
  assert.equal(m.kits.kb.bpm, 120);
  assert.deepEqual(decode(encode(m)), m);
  assert.deepEqual(decode('{oops'), { v: 1, settings: null, kits: {}, taste: {} });
  const many = { v: 1, settings: null, kits: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, { bpm: 100, roles: {}, at: i }])) };
  const kept = merge(many, { v: 1, settings: null, kits: {} });
  assert.equal(Object.keys(kept.kits).length, MOST_KITS);
  assert.ok(kept.kits.k49 && !kept.kits.k0);
});

test('sources: a pack at one rate (the first one), each file split on its own silence, each piece knowing its file', () => {
  const silence = n => new Float32Array(n);
  const join = (...xs) => {
    const out = new Float32Array(xs.reduce((s, x) => s + x.length, 0));
    let o = 0;
    for (const x of xs) (out.set(x, o), (o += x.length));
    return out;
  };
  const a = join(tone(4800), silence(19200), tone(4800));
  const b = tone(2205, 0.03);
  const both = atRate([{ name: 'loops.wav', sr: 48000, L: a, R: a }, { name: 'kick.wav', sr: 44100, L: b, R: b }]);
  assert.equal(both[1].sr, 48000);
  assert.equal(both[1].L.length, Math.round((2205 * 48000) / 44100));
  assert.equal(both[1].R, both[1].L, 'mono stays one channel');
  const pieces = splitAll(both, { silenceDb: -60, minGap: 0.2 });
  assert.deepEqual(pieces.map(p => p.src), [0, 0, 1]);
  assert.equal(resample(b, 44100, 44100), b);
  assert.equal(baseName('808 Long.WAV'), '808 Long');
});

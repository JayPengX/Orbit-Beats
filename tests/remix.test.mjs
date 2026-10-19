// 重新混音 and 取出片段: each remix choice changes what it should and keeps the rest;
// a clip is the right length for its bars at the tempo, and not silent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, parseWav } from '../public/engine.mjs';
import { remix, surprise, remixId, remixTitle, kindOfRecipe, baseOf, radioBase, bandBase, lengthStep, speedStep, clipSpan, partOf, retime } from '../public/lib/remix.mjs';
import { radioSpec, radioSong } from '../public/lib/radio.mjs';
import * as make from '../public/lib/make.mjs';

const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const radioRecipe = { print: 'radio', radio: { seed: 4242, mood: 'chill', style: 'lofi' } };
const sp = radioSpec(4242, 'chill', 'lofi');
const base = baseOf(radioRecipe, { bpm: sp.bpm, seconds: 90, style: 'lofi' });

test('radio: a new style changes the groove only; the song keeps its tempo, length and seed', () => {
  const { recipe, changed } = remix(base, { style: 'techno' }, seq(0.3));
  assert.deepEqual(changed, ['style']);
  assert.equal(recipe.radio.style, 'techno');
  assert.equal(recipe.radio.seed, 4242);
  assert.equal(recipe.radio.bpm, sp.bpm);
  assert.equal(recipe.radio.seconds, 90);
  assert.equal(recipe.radio.lead, undefined);
});
test('radio: the song\'s own style is not a change, random never picks it', () => {
  assert.deepEqual(remix(base, { style: 'lofi' }).changed, []);
  for (let i = 0; i < 20; i++) assert.notEqual(remix(base, { style: 'random' }, Math.random).recipe.radio.style, 'lofi');
});
test('radio: faster and slower move the tempo about 15% and nothing else', () => {
  const up = remix(base, { speed: 1 }).recipe.radio;
  const down = remix(base, { speed: -1 }).recipe.radio;
  assert.equal(up.bpm, Math.round(sp.bpm * 1.15));
  assert.equal(down.bpm, Math.round(sp.bpm / 1.15));
  for (const r of [up, down]) assert.deepEqual({ ...r, bpm: 0 }, { ...radioRecipe.radio, bpm: 0 });
  assert.ok(speedStep(60, -1) >= 50 && speedStep(190, 1) <= 200);
});
test('radio: new sounds pick other instruments of the groove, tempo and style kept', () => {
  const r = remix(base, { sounds: true }, Math.random).recipe.radio;
  assert.notEqual(r.lead, sp.lead);
  assert.equal(r.style, 'lofi');
  assert.equal(r.bpm, undefined);
  assert.ok(r.chords && r.chords2);
});
test('radio: longer and shorter change the length in steps of ten seconds, 0:30 to 8:00', () => {
  assert.equal(remix(base, { length: 1 }).recipe.radio.seconds, 140);
  assert.equal(remix(base, { length: -1 }).recipe.radio.seconds, 60);
  assert.equal(lengthStep(35, -1), 30);
  assert.equal(lengthStep(400, 1), 480);
});
test('choices stack on a remix of a remix', () => {
  const a = remix(base, { speed: 1 }).recipe;
  const b = remix({ ...base, recipe: a, bpm: a.radio.bpm }, { speed: 1 }).recipe;
  assert.equal(b.radio.bpm, Math.round(a.radio.bpm * 1.15));
});
test('surprise changes two or three of the four, and only what the song can take', () => {
  for (let i = 0; i < 30; i++) {
    const c = surprise(base);
    assert.ok(Object.keys(c).length >= 2 && Object.keys(c).length <= 3);
  }
  const jam = { recipe: { print: 'x', jam: [{ i: 0, beat: 0 }], plan: [['hook', 4]] }, bpm: 100, seconds: 10, style: null };
  assert.deepEqual(Object.keys(surprise(jam)), ['speed']);
});

test('kit song: style, sounds, speed and length each set their own field and keep the rest', () => {
  const recipe = { print: 'abc', seed: 7, minBars: 25, maxBars: 29, styles: ['four'], humanize: 100, mix: { on: true }, detail: null, style: 'four', plan: null };
  const kit = baseOf(recipe, { bpm: 100, seconds: 60, style: 'four' });
  assert.equal(kindOfRecipe(recipe), 'kit');
  const keep = (r, ...skip) => { for (const k of Object.keys(recipe)) if (!skip.includes(k)) assert.deepEqual(r[k], recipe[k], k); };
  let r = remix(kit, { style: 'trap' }).recipe;
  assert.equal(r.style, 'trap'); keep(r, 'style');
  r = remix(kit, { sounds: true }, seq(0.5)).recipe;
  assert.ok(Number.isInteger(r.detail)); keep(r, 'detail');
  r = remix(kit, { speed: 1 }).recipe;
  assert.ok(Math.abs(r.speed - 1.15) < 1e-9); keep(r, 'speed');
  r = remix(kit, { length: 1 }).recipe;
  const bars = r.plan.reduce((a, [, n]) => a + n, 0);
  assert.ok(Math.abs((bars * 240) / 100 - 90) < 6, `${bars} bars`); keep(r, 'plan');
  // length after a speed-up: the bars are made for the tempo it plays at
  const fast = remix(remix(kit, { speed: 1 }).recipe && { ...kit, recipe: { ...recipe, speed: 1.15 }, bpm: 115 }, { length: 1 }).recipe;
  assert.ok(Math.abs((fast.plan.reduce((a, [, n]) => a + n, 0) * 240) / 115 - 90) < 6);
});
test('built-in jam take: style re-picks the band\'s groove, sounds its seed, speed the tape; no length', () => {
  const take = { band: { seed: 5, style: 'house' }, jam: [{ i: 11, beat: 0 }], plan: [['hook', 4]], mix: {} };
  assert.equal(kindOfRecipe(take), 'band');
  const b = baseOf(take, { bpm: 124, seconds: 8, style: 'house' });
  assert.equal(remix(b, { style: 'dnb' }).recipe.band.style, 'dnb');
  assert.notEqual(remix(b, { sounds: true }).recipe.band.seed, 5);
  assert.ok(remix(b, { speed: -1 }).recipe.speed < 1);
  assert.deepEqual(remix(b, { length: 1 }).changed, []);
});
test('pieces not loaded: the built-in band keeps the groove and length', () => {
  const fb = bandBase({ seed: 9 }, { style: 'trap', seconds: 100 }, 1);
  assert.equal(kindOfRecipe(fb.recipe), 'radio');
  assert.equal(fb.recipe.radio.style, 'trap');
  assert.equal(fb.recipe.radio.seconds, 100);
  assert.equal(radioBase({ seed: 1, mood: 'chill', style: 'lofi', bpm: 80, seconds: 70 }).recipe.radio.mood, 'chill');
});
test('titles and ids', () => {
  assert.equal(remixTitle('Song'), 'Song (Remix)');
  assert.equal(remixTitle('Song (Remix)'), 'Song (Remix)');
  assert.notEqual(remixId('a', { x: 1 }), remixId('a', { x: 2 }));
  assert.equal(remixId('a', { x: 1 }), remixId('a', { x: 1 }));
});

test('a remixed radio song is made with its choices: tempo, groove and instruments', () => {
  const r = remix(base, { speed: 1, style: 'house', sounds: true, length: -1 }, Math.random).recipe.radio;
  const { info } = radioSong(r);
  assert.equal(info.bpm, r.bpm);
  assert.equal(info.radio.style, 'house');
  assert.equal(info.radio.lead, r.lead);
  assert.deepEqual(info.radio.seconds, r.seconds);
  assert.ok(Math.abs(info.seconds - r.seconds) < 20, `${info.seconds} vs ${r.seconds}`);
});

test('speed on audio: faster is shorter, by the factor', () => {
  const L = Float32Array.from({ length: 200 }, (_, i) => i);
  const a = retime({ sr: 100, L, R: L }, 2);
  assert.equal(a.L.length, 100);
  assert.equal(a.L[10], 20);
  assert.equal(retime({ sr: 100, L, R: L }, 0.5).L.length, 400);
});

test('clip: a section is its bars at the tempo; every part is that long and not silent', () => {
  const recipe = { print: 'radio', radio: { seed: 31, mood: 'all', style: 'four', seconds: 60 } };
  const { info } = make.radioWav(recipe.radio);
  const plan = info.plan;
  const k = plan.findIndex(([t]) => t === 'hook');
  for (const part of ['all', 'drums', 'bass', 'melody']) {
    const c = make.clip(recipe, k, part);
    const w = parseWav(c.wav);
    const want = (plan[k][1] * 4 * 60) / info.bpm;
    assert.ok(Math.abs(c.seconds - want) < 1e-9);
    assert.equal(w.L.length, Math.round(want * w.sr), part);
    assert.ok(c.peak > 0.01, `${part} is not silent`);
  }
});
test('clip: spans add up, and a part with nothing in it reports silence', () => {
  const plan = [['intro', 4], ['verse', 8]];
  const s0 = clipSpan(plan, 120, 0, 1000);
  const s1 = clipSpan(plan, 120, 1, 1000);
  assert.equal(s0.to, s1.from);
  assert.equal(s1.to - s1.from, 16000);
  const x = { sr: 1000, L: new Float32Array(20000).fill(0.5), R: new Float32Array(20000).fill(0.5) };
  assert.equal(partOf({ drums: x }, 'bass', 0, 1000).peak, 0);
  assert.ok(partOf({ drums: x }, 'drums', 0, 1000).peak > 0.4);
  assert.equal(partOf(x, 'all', 19000, 21000).L.length, 2000); // past the end: silence, same length
});

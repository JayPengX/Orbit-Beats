// 聽's parts: what's picked next, the sections, the cut and the join, the
// wait at the outro, the maker's way to it; and the engine's fixes that keep
// any kit's song from going silent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOODS, moodStyles, radioPick, radioSpec, radioPlan, radioQueue, segment, cutOf, holdOf, RADIO_SR } from '../public/lib/radio.mjs';
import { makeRng, makeSong, STYLES, grooveHits, drumKit, analyzeRecording, parseWav } from '../public/engine.mjs';
import { renderClip, voice } from '../public/lib/synth.mjs';
import { maker } from '../public/lib/maker.mjs';

test('the next song: a new groove of the mood each time (never the one just played), one groove when one is picked', () => {
  for (const mood of Object.keys(MOODS)) {
    const recent = [];
    for (let k = 0; k < 40; k++) {
      const s = radioPick(mood, recent.slice(-3), k * 7919 + 1);
      assert.ok(MOODS[mood].styles.includes(s.style), `${mood}: ${s.style}`);
      assert.notEqual(s.style, recent.at(-1), `${mood}: two ${s.style} in a row`);
      assert.equal(s.mood, mood);
      recent.push(s.style);
    }
    assert.ok(new Set(recent).size >= Math.min(5, MOODS[mood].styles.length), `${mood} varies`);
  }
  assert.deepEqual(moodStyles('style:lofi'), ['lofi']);
  assert.equal(radioPick('style:lofi', ['lofi']).style, 'lofi', 'one groove asked for: that one, again');
  assert.equal(radioPick('polka', []).mood, 'all');
  assert.deepEqual(moodStyles('polka'), STYLES);
  assert.deepEqual(radioQueue(), { ready: [], busy: false, skip: false, gen: 0 });
  // The same seed, the same song's makings.
  assert.deepEqual(radioSpec(5, 'chill', 'lofi'), radioSpec(5, 'chill', 'lofi'));
  assert.ok(MOODS.chill.styles.includes(radioSpec(5, 'chill', 'trap').style), 'a groove not of the mood: the mood picks');
});

test('the sections: an intro, verse–hook pairs, an outro, all four or eight bars, about the length asked at any tempo (up to 96 bars)', () => {
  for (let k = 0; k < 200; k++) {
    const R = makeRng(k);
    const bpm = 70 + (k % 107);
    const plan = radioPlan(R, bpm, 80 + (k % 131));
    assert.equal(plan[0][0], 'intro');
    assert.equal(plan.at(-1)[0], 'outro');
    assert.ok(plan.some(([t]) => t === 'hook') && plan.some(([t]) => t === 'verse'), JSON.stringify(plan));
    assert.ok(plan.every(([, n]) => n === 4 || n === 8), JSON.stringify(plan));
    const bars = plan.reduce((s, [, n]) => s + n, 0);
    assert.ok(bars >= 24 && bars <= 96, `${bars} bars`);
    const secs = (bars * 240) / bpm;
    assert.ok(secs >= 55 && secs <= 250, `${bpm} BPM: ${secs.toFixed(0)} s`);
  }
});

test('the join: a song to its cut, the last one’s ring under its start, rising in; the ring after the cut kept for the next', () => {
  const sr = 1000;
  const a = { sr, L: new Float32Array(3000).fill(0.5), R: new Float32Array(3000).fill(-0.5) };
  const first = segment(a, 2500);
  assert.equal(first.L.length, 2500);
  assert.equal(first.L[0], 0.5, 'the first song: from its start as it is');
  assert.equal(first.tail.L.length, 500);
  const b = { sr, L: new Float32Array(4000).fill(0.2), R: new Float32Array(4000).fill(0.2) };
  const second = segment(b, 3600, first.tail);
  assert.equal(second.L.length, 3600);
  assert.ok(Math.abs(second.L[0] - 0.5) < 1e-6, 'the ring, untouched, the next song from nothing');
  assert.ok(second.L[250] > 0.5 && second.L[250] < 0.7, 'rising in under it');
  assert.ok(Math.abs(second.R[499] - (-0.5 + 0.2 * Math.sin((499 / 500) * (Math.PI / 2)))) < 1e-6);
  assert.equal(second.L[600], Math.fround(0.2), 'after the ring: the song as it is');
  // Two loud together: eased under full scale, never past it.
  const loud = segment({ sr, L: new Float32Array(3000).fill(0.95), R: new Float32Array(3000).fill(0.95) }, 2000, { L: new Float32Array(1500).fill(0.9), R: new Float32Array(1500).fill(0.9) });
  assert.ok(loud.L.every(x => Math.abs(x) <= 1));
  // The cut: just before the downbeat after the last bar.
  assert.equal(cutOf({ bars: 10, bpm: 120 }, 1000), Math.round((20 - 0.06) * 1000));
  // The wait: back from the outro's first bar to the last hook's.
  assert.deepEqual(holdOf({ bpm: 120, plan: [['intro', 4], ['verse', 8], ['hook', 8], ['verse', 8], ['hook', 8], ['outro', 4]] }), { from: 28 * 2, to: 36 * 2 });
  assert.equal(holdOf({ bpm: 120, plan: [['verse', 8]] }), null);
});

test("the maker makes the radio's stretches without a kit: each after the last, whole songs to keep, the same song from the same seed", async () => {
  const m = maker('lib/maker.worker.mjs');
  const spec = { seed: 9, mood: 'groove', style: 'house' };
  const one = await m.radio(spec, null);
  assert.equal(one.id, 'radio:9:groove:house');
  const wav = parseWav(one.wav);
  assert.equal(wav.sr, RADIO_SR);
  assert.ok(Math.abs(one.seconds - wav.L.length / RADIO_SR) < 1e-6);
  assert.ok(one.hold && one.hold.from < one.hold.to && one.hold.to <= one.seconds);
  assert.equal(one.info.style, 'house');
  const whole = await m.radioWav(spec);
  assert.equal(parseWav(whole.wav).L.length, Math.round(one.info.seconds * RADIO_SR), 'the whole song, ring and all');
  // The next one starts under the first one's ring; the same song alone starts from nothing.
  const two = await m.radio({ seed: 10, mood: 'groove', style: 'afro' }, one.id);
  const alone = parseWav((await m.radioWav({ seed: 10, mood: 'groove', style: 'afro' })).wav);
  const joined = parseWav(two.wav);
  let diff = 0;
  for (let j = 0; j < RADIO_SR; j++) diff += Math.abs(joined.L[j] - alone.L[j]);
  assert.ok(diff > 1, 'the ring is under its start');
  let later = 0;
  for (let j = 10 * RADIO_SR; j < 11 * RADIO_SR; j++) later += Math.abs(joined.L[j] - alone.L[j]);
  assert.ok(later < 0.01 * RADIO_SR, 'and only there');
});

// A kit with a four-bar riff and no phrases, and drums.
const SR = 16000;
const BPM = 120;
const riffClip = { kind: 'notes', inst: 'keys', bars: 4, swing: 0, key: { tonic: 9, minor: true }, notes: [0, 16, 32, 48].map((step, k) => ({ step, midi: 57 + k * 2, len: 16 })) };
const longKit = () => {
  const riff = renderClip(riffClip, SR, BPM);
  const hat = renderClip({ kind: 'drums', bars: 1, swing: 0, pitch: 33, steps: { hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] } }, SR, BPM);
  const shot = d => ({ L: voice(d, 36, SR), R: voice(d, 36, SR) });
  const pieces = [riff, hat, shot('kick'), shot('snare'), shot('hat')];
  return { pieces, roles: ['riff', 'hat', 'kick', 'snare', 'tick'] };
};

test('a break with nothing short enough to fit is never silent: the shortest phrase still plays', () => {
  const { pieces, roles } = longKit();
  const analysis = analyzeRecording(pieces, SR, { bpm: BPM });
  assert.equal(analysis.loops[0], 16, 'a four-bar riff');
  for (let seed = 1; seed <= 12; seed++) {
    const { events } = makeSong(pieces, SR, seed, { analysis, roles, bpm: BPM, plan: [['intro', 4], ['verse', 4], ['break', 2], ['hook', 4], ['outro', 4]], humanize: 0 });
    const inBreak = events.filter(e => e.beat >= 32 && e.beat < 40);
    assert.ok(inBreak.some(e => e.i === 0), `seed ${seed}: the riff plays in the break`);
  }
});

test("an intro with hats first brings a long riff in so it ends with the intro, never running over the verse's", () => {
  const { pieces, roles } = longKit();
  const analysis = analyzeRecording(pieces, SR, { bpm: BPM });
  let hatsFirst = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { events } = makeSong(pieces, SR, seed, { analysis, roles, bpm: BPM, plan: [['intro', 4], ['verse', 8], ['hook', 8], ['outro', 4]], humanize: 0 });
    for (const e of events.filter(x => x.i === 0 && x.beat < 16)) assert.ok(e.beat + 16 <= 16 + 1e-9, `seed ${seed}: a riff at beat ${e.beat} runs over the verse`);
    if (events.some(x => x.i === 1 && x.beat === 0)) hatsFirst++;
  }
  assert.ok(hatsFirst > 0, 'some intros start on the hats');
});

test("trap's snare is on 3 of every bar (it had none)", () => {
  const kit = drumKit(['kick', 'snare', 'sub', 'tick', 'riff']);
  const hits = grooveHits('trap', kit, 2, 1);
  for (const bar of [0, 1]) assert.ok(hits.some(h => h.i === kit.snare && h.beat === bar * 4 + 2), `bar ${bar}`);
});

test('a worker that stops answering: its calls are answered on the page, not left waiting', async () => {
  const workers = [];
  globalThis.Worker = class {
    constructor() {
      this.dead = false;
      workers.push(this);
    }
    postMessage() {}
    terminate() {
      this.dead = true;
    }
  };
  try {
    const m = maker('x', { limit: 30 });
    const one = await m.radio({ seed: 3, mood: 'chill', style: 'lofi' }, null);
    assert.ok(workers[0].dead, 'the silent worker let go');
    assert.equal(one.info.style, 'lofi');
  } finally {
    delete globalThis.Worker;
  }
});

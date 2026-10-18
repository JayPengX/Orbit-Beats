// 聽: twenty songs made from nothing, played one after another, never silent.
// (Half here, half in radio-b.test.mjs: the two run side by side.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stream, rmsPerSecond, playOut, rmsWindows } from './radio.mjs';
import { RADIO_SR, OVERLAP, handoverAt } from '../public/lib/radio.mjs';

// (Quieter than this, a second sounds like the music stopped: -46 dBFS, where the songs play at about -15.)
export const SILENT = 0.005;

test('ten radio songs back to back: every second of the music sounds (but the very first two), each song its own groove, key and tempo', () => {
  const songs = stream([11, 2026, 31337, 4096, 777, 5150, 90210, 1234567, 8675309, 424242]);
  let first = true;
  for (const { spec, info, seg } of songs) {
    const rms = rmsPerSecond(seg, RADIO_SR);
    const from = first ? 2 : 0;
    first = false;
    rms.slice(from).forEach((v, s) => assert.ok(v >= SILENT, `${spec.seed} ${info.style}: second ${s + from} at ${v.toFixed(4)}`));
    assert.ok(seg.L.length / RADIO_SR >= 55 && seg.L.length / RADIO_SR <= 150, `${spec.seed}: ${(seg.L.length / RADIO_SR).toFixed(0)} s`);
    assert.ok(seg.L.every(Number.isFinite) && seg.L.every(x => Math.abs(x) <= 1), `${spec.seed}: under full scale`);
    assert.ok(info.plan.every(([, n]) => n % 4 === 0), `${spec.seed}: sections of four or eight bars`);
  }
  assert.ok(new Set(songs.map(s => s.info.style)).size >= 6, 'grooves vary');
  assert.ok(new Set(songs.map(s => `${s.info.key.tonic}${s.info.key.minor}`)).size >= 5, 'keys vary');
  assert.ok(new Set(songs.map(s => s.info.bpm)).size >= 6, 'tempos vary');
  assert.ok(new Set(songs.map(s => s.info.plan.map(p => p.join('')).join())).size >= 3, 'forms vary');
});

test('where songs meet there is no gap: the next starts at or before the last one ends, and even 0.3 s late the music only dips', () => {
  const songs = stream([11, 2026, 31337, 4096]);
  const segs = songs.map(x => x.seg);
  for (const [k, x] of segs.entries())
    if (k) assert.ok(handoverAt(segs[k - 1].L.length / RADIO_SR) <= segs[k - 1].L.length / RADIO_SR - 0.5, 'the next starts well before the last one ends');
  const on = playOut(segs, RADIO_SR, 0);
  for (const late of [0, 0.15, 0.3]) {
    const play = playOut(segs, RADIO_SR, late);
    for (const [k, at] of play.joins.entries()) {
      // Two seconds round each join, 20 ms at a time: never a hole, never far under the music played on time.
      const got = rmsWindows(play, RADIO_SR, at - RADIO_SR, at + RADIO_SR);
      const ideal = rmsWindows(on, RADIO_SR, on.joins[k] - RADIO_SR, on.joins[k] + RADIO_SR);
      const low = Math.min(...got);
      assert.ok(low >= SILENT, `join ${k}, ${late} s late: a 20 ms window at ${low.toFixed(4)}`);
      if (!late) assert.deepEqual(got, ideal);
    }
    assert.ok(play.L.every(x => Math.abs(x) <= 1.0001), 'the overlap never past full scale');
  }
  // On time, the overlap adds up to the music going on: the fades sum to one.
  const sr = RADIO_SR;
  const a = segs[0];
  const o = Math.round(OVERLAP * sr);
  const at = on.joins[0];
  for (const j of [0, Math.floor(o / 2), o - 1]) {
    const fromA = a.L[at + j];
    const fromB = segs[1].L[j];
    assert.ok(Math.abs(on.L[at + j] - (fromA + fromB)) < 1e-6);
  }
});

// 聽: twenty songs made from nothing, played one after another, never silent.
// (The other half of radio-a.test.mjs's twenty.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stream, rmsPerSecond, quietRuns } from './radio.mjs';
import { RADIO_SR } from '../public/lib/radio.mjs';

// (Quieter than this, a second sounds like the music stopped: -46 dBFS, where the songs play at about -15.)
export const SILENT = 0.005;

test('ten more radio songs back to back: every moment of the music sounds (but the very first two seconds), no quarter second under -45 dBFS, each song its own groove, key and tempo', () => {
  const songs = stream([5, 99, 1001, 65535, 271828, 314159, 161803, 2718281, 999999937, 123]);
  let first = true;
  for (const { spec, info, seg } of songs) {
    const rms = rmsPerSecond(seg, RADIO_SR);
    const from = first ? 2 : 0;
    first = false;
    rms.slice(from).forEach((v, s) => assert.ok(v >= SILENT, `${spec.seed} ${info.style}: second ${s + from} at ${v.toFixed(4)}`));
    // (Nor a moment's hole: a break's rests, a stop bar, a riff laid out. Under -45 dBFS for over a quarter second.)
    const holes = quietRuns(seg, RADIO_SR).filter(([at]) => at >= from);
    assert.deepEqual(holes, [], `${spec.seed} ${info.style}: quiet at ${holes.map(([at, s]) => `${at.toFixed(2)} s for ${s.toFixed(2)} s`).join(', ')}`);
    assert.ok(seg.L.length / RADIO_SR >= 55 && seg.L.length / RADIO_SR <= 150, `${spec.seed}: ${(seg.L.length / RADIO_SR).toFixed(0)} s`);
    assert.ok(seg.L.every(Number.isFinite) && seg.L.every(x => Math.abs(x) <= 1), `${spec.seed}: under full scale`);
    assert.ok(info.plan.every(([, n]) => n % 4 === 0), `${spec.seed}: sections of four or eight bars`);
  }
  assert.ok(new Set(songs.map(s => s.info.style)).size >= 6, 'grooves vary');
  assert.ok(new Set(songs.map(s => `${s.info.key.tonic}${s.info.key.minor}`)).size >= 5, 'keys vary');
  assert.ok(new Set(songs.map(s => s.info.bpm)).size >= 6, 'tempos vary');
  assert.ok(new Set(songs.map(s => s.info.plan.map(p => p.join('')).join())).size >= 3, 'forms vary');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOPING, GRIDS, padsOf, nextStep, nextBar, Jam } from '../public/lib/jam.mjs';
import { ROLES, drumKit, grooveHits } from '../public/engine.mjs';

test('the grid: the next step at or after a tap, a tap a hair late still on its step', () => {
  assert.deepEqual(GRIDS, { 16: 0.25, 8: 0.5, 4: 1, 0: 0 });
  assert.equal(nextStep(1.23, 0), 1.23, 'no grid: as tapped');
  assert.equal(nextStep(1.23, 0, 0.1), 1.23);
  assert.equal(nextStep(1, 0.25), 1, 'on a step: that step');
  assert.equal(nextStep(1.01, 0.25), 1.25);
  assert.equal(nextStep(1.01, 0.25, 0.02), 1, 'within the allowance: back to the step');
  assert.equal(nextStep(1.03, 0.25, 0.02), 1.25);
  assert.equal(nextStep(0.1 + 0.2 + 0.45, 0.25), 0.75, 'float error on a step still that step');
  assert.equal(nextStep(0.7499999999999, 0.25), 0.75);
  assert.equal(nextStep(0, 1), 0);
  assert.equal(nextStep(3.6, 1), 4);
  assert.equal(nextStep(3.6, 0.5), 4);
  assert.ok(nextBar(0) === 0, 'the start is a bar line (-0 is 0)');
  assert.equal(nextBar(4), 4);
  assert.equal(nextBar(4 + 1e-12), 4);
  assert.equal(nextBar(3.9999999999999), 4);
  assert.equal(nextBar(0.001), 4);
  assert.equal(nextBar(7.99), 8);
});

test('the pads: every piece in use, loops first by role, each its length', () => {
  const roles = ['kick', 'off', 'riff', 'hat', 'phrase', 'riff', 'bass', 'snare', 'sub', 'fill', 'tick', 'roll'];
  const loops = [1, 4, 8, 2, 0, undefined, 4, 1, 1, 4, 1, 1];
  const pads = padsOf(roles, loops);
  assert.deepEqual(pads.map(p => p.i), [2, 5, 4, 6, 3, 9, 0, 8, 7, 11, 10]);
  assert.ok(!pads.some(p => p.role === 'off'));
  for (const p of pads) assert.equal(p.loop, LOOPING.has(p.role));
  assert.deepEqual(pads.find(p => p.i === 5).beats, 4, 'no loop length: a bar');
  assert.deepEqual(pads.find(p => p.i === 4).beats, 4);
  assert.equal(pads.find(p => p.i === 2).beats, 8);
  for (const r of LOOPING) assert.ok(ROLES.includes(r));
  assert.deepEqual(padsOf([], []), []);
});

test('a loop starts on the next bar and plays round until stopped at a bar; tapped off before it starts, it never plays', () => {
  const j = new Jam();
  assert.deepEqual(j.toggle(1, 1.5, 2), { on: true, at: 4, off: [] });
  assert.ok(j.playing(1, 2));
  assert.deepEqual(j.toggle(1, 2.5, 2), { on: false, at: 4, off: [1] });
  assert.deepEqual(j.due(0, 16), [], 'never started');
  assert.ok(!j.playing(1, 3));
  j.toggle(2, 0.5, 1.5);              // from 4, every 1.5 beats
  assert.deepEqual(j.due(0, 6).map(h => h.beat), [4, 5.5]);
  j.toggle(2, 6.2, 1.5);              // off at 8
  assert.deepEqual(j.due(6, 20).map(h => h.beat), [7]);
  assert.equal(j.loops.size, 0, 'forgotten once over');
  // A tap right on a bar line starts there.
  j.toggle(3, 8, 4);
  assert.deepEqual(j.due(8, 12).map(h => [h.i, h.beat]), [[3, 8]]);
  // stopAll: playing loops end at the next bar, ones not yet started are forgotten.
  j.toggle(4, 9, 1);                  // from 12
  j.stopAll(10);                      // at 12: 3 ends, 4 never starts
  assert.deepEqual(j.due(12, 30), []);
  assert.equal(j.loops.size, 0);
  // A loop length under a 16th is a 16th.
  j.toggle(5, 0, 0);
  assert.equal(j.due(40, 41).length, 4);
});

test('one-shots play on their step; a step the windows have passed is the caller\'s to play (jamview plays it at once)', () => {
  const j = new Jam();
  assert.equal(j.shot(7, 1.1, GRIDS[16]), 1.25);
  assert.equal(j.shot(8, 1.1, GRIDS[4]), 2);
  assert.equal(j.shot(9, 1.1, GRIDS[0]), 1.1);
  assert.deepEqual(j.due(0, 1.5).map(h => [h.i, h.beat]), [[9, 1.1], [7, 1.25]]);
  assert.deepEqual(j.due(1.5, 3).map(h => [h.i, h.beat]), [[8, 2]]);
  assert.deepEqual(j.due(3, 10), []);
  assert.equal(j.shots.length, 0);
  // Scheduled ahead to 4.2, a tap at 4.01 snaps back to 4: due() keeps to its window, so never plays it twice.
  const k = new Jam();
  k.due(0, 4.2);
  assert.equal(k.shot(1, 4.01, GRIDS[16], 0.02), 4);
  assert.deepEqual(k.due(4.2, 4.4), []);
  assert.equal(k.shots.length, 0, 'and it is not left waiting');
  // Two taps on one step: both play.
  k.shot(2, 5.1, 1); k.shot(2, 5.2, 1);
  assert.equal(k.due(4.4, 7).length, 2);
});

test('windows back to back: every hit once, none lost, in order, whatever the windows', () => {
  const backing = [{ i: 0, beat: 0 }, { i: 1, beat: 1 }, { i: 0, beat: 2.5 }, { i: 1, beat: 3 }, { i: 2, beat: 15.75 }];
  const setup = () => {
    const j = new Jam({ backing, cycle: 16 });
    j.toggle(10, 0, 2); j.toggle(11, 2, 0.75); j.toggle(12, 5, 1.5); j.toggle(13, 11, 3);
    j.shot(20, 3.3, 0.25); j.shot(21, 17.01, 0.5); j.shot(22, 40.5, 0);
    return j;
  };
  const whole = setup().due(0, 64);
  for (let k = 1; k < whole.length; k++) assert.ok(whole[k].beat >= whole[k - 1].beat);
  let x = 99;
  const rnd = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let run = 0; run < 30; run++) {
    const j = setup(), got = [];
    let a = 0;
    while (a < 64) {
      // Windows of any size, some ending right on a hit.
      const b = Math.min(64, run % 3 === 0 ? a + Math.round(rnd() * 16) / 4 + 0.25 : a + rnd() * 3 + 1e-3);
      for (const h of j.due(a, b)) { assert.ok(h.beat >= a - 1e-9 && h.beat < b, `${h.beat} in [${a}, ${b})`); got.push(h); }
      a = b;
    }
    const key = h => `${h.i}@${h.beat.toFixed(6)}`;
    assert.deepEqual(got.map(key).sort(), whole.map(key).sort(), `run ${run}`);
  }
  // The backing goes round every cycle; the groove off, it's silent.
  const j = new Jam({ backing, cycle: 16 });
  assert.deepEqual(j.due(16, 32).map(h => h.beat), [16, 17, 18.5, 19, 31.75]);
  j.groove = false;
  assert.deepEqual(j.due(32, 48), []);
  j.groove = true;
  j.setBacking([{ i: 5, beat: 0 }], 4);
  assert.deepEqual(j.due(48, 56).map(h => h.beat), [48, 52]);
  assert.deepEqual(new Jam().due(0, 100), [], 'no backing, nothing');
});

test('recording: from the next bar, to the end of the bar it is stopped in (a bar at least), the groove in it', () => {
  const kit = drumKit(['kick', 'snare', 'tick', 'riff']);
  const backing = grooveHits('house', kit, 1);
  const j = new Jam({ backing, cycle: 4 });
  assert.equal(j.recording(), false);
  assert.equal(j.record(1), true);
  assert.equal(j.recording(), true);
  assert.equal(j.takes[0].from, 4);
  j.toggle(3, 2, 4);
  j.due(0, 6);
  j.shot(9, 6.1, 0.25);
  assert.equal(j.record(9), false, 'stopped');
  assert.equal(j.recording(), false);
  assert.equal(j.takes[0].to, 12);
  assert.deepEqual(j.done, [], 'not done till the bar is over');
  j.due(6, 11.9);
  assert.deepEqual(j.done, []);
  j.due(11.9, 13);
  assert.deepEqual(j.takes, []);
  assert.equal(j.done[0].beats, 8);
  const hits = j.done[0].hits;
  assert.ok(hits.every(h => h.beat >= 0 && h.beat < 8));
  assert.deepEqual(hits.filter(h => h.i === 3).map(h => h.beat), [0, 4], 'the loop, from the take\'s start');
  assert.deepEqual(hits.filter(h => h.i === 9).map(h => h.beat), [2.25]);
  assert.equal(hits.filter(h => h.i === kit.kick).length, 8, 'the groove\'s kicks, four a bar');
  // Stopped before it began: still one bar.
  const k = new Jam();
  k.record(1); k.record(2);
  assert.deepEqual([k.takes[0].from, k.takes[0].to], [4, 8]);
  k.due(0, 8);
  assert.deepEqual(k.done, [{ hits: [], beats: 4 }]);
});

test("the jam's drums: the first of each role, a missing one played by another; every groove a bar of hits on the grid", () => {
  assert.deepEqual(drumKit(['riff', 'kick', 'kick', 'sub', 'snare', 'roll', 'tick', 'fill']), { kick: 1, heavy: 2, sub: 3, snare: 4, tick: 6, roll: 5, fill: 7 });
  assert.deepEqual(drumKit(['riff', 'sub', 'snare']), { kick: 1, heavy: 1, sub: 1, snare: 2, tick: null, roll: 2, fill: null });
  assert.deepEqual(drumKit(['riff', 'kick']), { kick: 1, heavy: 1, sub: 1, snare: null, tick: null, roll: null, fill: null });
  assert.deepEqual(drumKit([]), { kick: null, heavy: null, sub: null, snare: null, tick: null, roll: null, fill: null });
});

test('a loop of any length: back-to-back windows give each hit once (4/3 ends a window right on its 7th hit)', () => {
  for (const len of [4 / 3, 2 / 3, 0.3, 0.7, 1.2, 5 / 3, 7 / 3, 4 / 7]) {
    const j = new Jam();
    j.toggle(1, 0, len);
    const got = [...j.due(0, 8), ...j.due(8, 16), ...j.due(16, 24)].map(h => h.beat);
    assert.equal(got.length, Math.ceil(24 / len - 1e-9), `length ${len}`);
    for (let k = 1; k < got.length; k++) assert.ok(got[k] - got[k - 1] > len / 2, `length ${len}: ${got[k - 1]} then ${got[k]}`);
  }
});

test('a loop tapped off and on again in one bar plays to the bar line, then starts again there', () => {
  const j = new Jam();
  j.toggle(2, 0, 1);
  j.due(0, 5);
  assert.deepEqual(j.toggle(2, 5, 1), { on: false, at: 8, off: [2] });
  assert.deepEqual(j.toggle(2, 6, 1), { on: true, at: 8, off: [] });
  assert.ok(j.playing(2, 7));
  assert.deepEqual(j.due(5, 12).map(h => h.beat), [5, 6, 7, 8, 9, 10, 11]);
});

test('● again while the last take finishes its bar: that take still becomes a song, the new one starts after it', () => {
  const j = new Jam({ backing: [{ i: 0, beat: 0 }], cycle: 1 });
  j.record(1);                          // from 4
  j.due(0, 5);
  j.record(5);                          // stopped: to 8
  assert.equal(j.record(6), true, 'a new take');
  assert.equal(j.recording(), true);
  j.due(5, 8.5);
  assert.equal(j.done.length, 1, 'the first take, kept');
  assert.deepEqual(j.done[0], { hits: [0, 1, 2, 3].map(beat => ({ i: 0, beat })), beats: 4 });
  j.done.length = 0;
  j.record(9);                          // to 12
  j.due(8.5, 13);
  assert.deepEqual(j.done, [{ hits: [0, 1, 2, 3].map(beat => ({ i: 0, beat })), beats: 4 }]);
  // Stopped before it began (4..8), ● again at 3: the new take waits for it, never overlaps.
  const k = new Jam();
  k.record(1); k.record(2);
  k.record(3);
  assert.equal(k.takes[1].from, 8);
  k.record(3.5);
  k.due(0, 20);
  assert.deepEqual(k.done.map(t => t.beats), [4, 4]);
});

test('a one-shot whose step the windows have passed is played at once (by the caller) and still kept in the take', () => {
  const j = new Jam();
  j.record(0);
  j.due(0, 2);
  assert.equal(j.shot(3, 1.4, 0.25), 1.5);
  assert.equal(j.shots.length, 0, 'not waiting: already played');
  j.record(1.6);
  j.due(2, 5);
  assert.deepEqual(j.done[0].hits, [{ i: 3, beat: 1.5 }]);
});

test('Stop: an open take is closed at its bar and a finishing one is kept; nothing is left for the next start', () => {
  const j = new Jam({ backing: [{ i: 0, beat: 0 }], cycle: 4 });
  j.record(0);                          // 0..
  j.toggle(5, 0, 2);
  j.due(0, 2);
  j.end(2.5);                           // to 4
  assert.deepEqual(j.done, [{ hits: [{ i: 0, beat: 0 }, { i: 5, beat: 0 }, { i: 5, beat: 2 }], beats: 4 }]);
  assert.equal(j.takes.length, 0);
  assert.equal(j.loops.size, 0);
  // Stopped while a take is finishing its bar: kept too.
  const k = new Jam({ backing: [{ i: 0, beat: 0 }], cycle: 4 });
  k.record(0); k.due(0, 5); k.record(5);  // to 8
  k.end(6);
  assert.deepEqual(k.done.map(t => t.beats), [8]);
  // Started again from 0: a shot at 1 waits for its window.
  k.done.length = 0;
  k.shot(1, 1, 0.25);
  assert.equal(k.shots.length, 1);
  assert.deepEqual(k.due(0, 2).map(h => h.i), [0, 1]);
});

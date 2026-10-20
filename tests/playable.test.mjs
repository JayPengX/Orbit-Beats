import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radioSong, MOODS } from '../public/lib/radio.mjs';
import { chartsOf, LEVELS, LANES } from '../public/lib/game.mjs';

// Every chart can be played with two thumbs (the left on lanes 0 and 1, the right on 2 and 3), on many songs of
// every mood. The limits here are a hand's, kept apart from the generator's own (which keeps a little inside them).
// (A low rate makes the songs quickly; their notes land at the same beats.)
const SR = 8000;
const moods = Object.keys(MOODS);
const SONGS = Array.from({ length: 16 }, (_, i) => ({ seed: 31 + i * 7919, mood: moods[i % moods.length] })).map(spec => {
  const s = radioSong(spec, SR);
  return { spec, events: s.events, roles: s.roles, tunes: s.tunes, sr: s.audio.sr, bpm: s.info.bpm, plan: s.info.plan, seconds: s.info.seconds };
});
// The least time between two notes of one thumb (s), and the most notes in any one second, each level.
const HAND = { easy: { same: 0.45, dense: 3 }, normal: { same: 0.3, dense: 5 }, hard: { same: 0.2, dense: 8 }, expert: { same: 0.15, dense: 10 } };
const LET_GO = 0.1; // after a hold, before that thumb taps again (s)
const thumb = lane => (lane < LANES / 2 ? 0 : 1);

// What's wrong with a chart for two thumbs. -> [reason]
function faults(chart, level) {
  const H = HAND[level], out = [], ns = chart.notes;
  const at = [{ t: -9, end: -9, lane: -1 }, { t: -9, end: -9, lane: -1 }];
  for (let k = 0; k < ns.length; k++) {
    const n = ns[k], h = at[thumb(n.lane)];
    const where = `${level} ${n.t}s lane ${n.lane}`;
    if (k && n.t < ns[k - 1].t) out.push(`${where}: out of order`);
    const together = ns.filter(m => Math.abs(m.t - n.t) < 0.001);
    if (together.length > 2) out.push(`${where}: ${together.length} at once`);
    if (n.t < h.end + LET_GO && h.end > h.t) out.push(`${where}: inside or right after a hold on the same thumb (ends ${h.end})`);
    else if (n.t - h.t < 0.001) out.push(`${where}: two at once for one thumb`);
    else if (n.t - h.t < H.same) out.push(`${where}: ${Math.round((n.t - h.t) * 1000)} ms after that thumb's last note`);
    if (Math.abs(n.lane - h.lane) > 1 && h.lane >= 0) out.push(`${where}: a thumb jumping ${Math.abs(n.lane - h.lane)} lanes`);
    at[thumb(n.lane)] = { t: n.t, end: n.end ?? n.t, lane: n.lane };
    let j = k;
    while (j < ns.length && ns[j].t < n.t + 1 - 1e-6) j++;
    if (j - k > H.dense) out.push(`${where}: ${j - k} notes in one second`);
  }
  return out;
}

test('the hand check catches what two thumbs cannot play', () => {
  assert.deepEqual(faults({ notes: [{ t: 1, lane: 0 }, { t: 1.5, lane: 3 }, { t: 1.7, lane: 1 }] }, 'expert'), []);
  assert.equal(faults({ notes: [{ t: 1, lane: 0 }, { t: 1, lane: 1 }] }, 'hard').length, 1);
  assert.equal(faults({ notes: [{ t: 1, lane: 0 }, { t: 1, lane: 2 }, { t: 1, lane: 3 }] }, 'hard').length >= 1, true);
  assert.equal(faults({ notes: [{ t: 1, lane: 0, end: 2 }, { t: 1.5, lane: 1 }] }, 'hard').length, 1);
  assert.equal(faults({ notes: [{ t: 1, lane: 2 }, { t: 1.08, lane: 3 }] }, 'expert').length, 1);
  assert.equal(faults({ notes: Array.from({ length: 6 }, (_, i) => ({ t: 1 + i * 0.15, lane: i % 2 ? 0 : 3 })) }, 'normal').length > 0, true);
});

test('every chart of every song is playable with two thumbs', () => {
  for (const song of SONGS) {
    const c = chartsOf(song, song.spec.seed);
    for (const lv of LEVELS) {
      const bad = faults(c[lv], lv);
      assert.deepEqual(bad.slice(0, 5), [], `${song.spec.mood} #${song.spec.seed} (${bad.length} faults)`);
    }
  }
});

test('density fits the level: each harder level busier, easy and normal gentle', () => {
  const nps = Object.fromEntries(LEVELS.map(l => [l, 0]));
  let secs = 0;
  for (const song of SONGS) {
    const c = chartsOf(song, song.spec.seed);
    secs += song.seconds;
    for (const lv of LEVELS) nps[lv] += c[lv].notes.length;
  }
  for (const lv of LEVELS) nps[lv] /= secs;
  const v = LEVELS.map(l => nps[l]);
  for (let i = 1; i < v.length; i++) assert.ok(v[i] > v[i - 1] * 1.1, v.map(x => x.toFixed(2)).join(' '));
  assert.ok(nps.easy < 1.5 && nps.normal < 2.5 && nps.hard < 4 && nps.expert < 5, v.map(x => x.toFixed(2)).join(' '));
});

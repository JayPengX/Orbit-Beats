import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radioSong, RADIO_SR } from '../public/lib/radio.mjs';
import { chartsOf, sounds, LEVELS, LANES, judge, scoreOf, unitsOf, rankOf, withRound, recordsOf, bestKey, dailyOf, setOf } from '../public/lib/game.mjs';

const songOf = spec => {
  const s = radioSong(spec, RADIO_SR);
  return { events: s.events, roles: s.roles, tunes: s.tunes, sr: s.audio.sr, bpm: s.info.bpm, plan: s.info.plan, seconds: s.info.seconds };
};
const SONGS = [{ seed: 7, mood: 'hype' }, { seed: 4242, mood: 'chill' }, { seed: 99, mood: 'groove' }].map(songOf);

test('charts come from the song: every note on one of its sounds', () => {
  for (const song of SONGS) {
    const at = sounds(song).map(x => x.t);
    assert.ok(at.length > 100);
    for (const n of chartsOf(song, 3).normal.notes) assert.ok(at.some(t => Math.abs(t - n.t) < 0.002), `note at ${n.t}`);
  }
});

test('charts are playable: in order, in lanes, never two in a lane at once, nothing inside a hold', () => {
  for (const song of SONGS) {
    const c = chartsOf(song, 5);
    for (const lv of LEVELS) {
      const ns = c[lv].notes;
      assert.ok(ns.length > 20, `${lv}: ${ns.length}`);
      const busy = new Array(LANES).fill(-1);
      for (let k = 0; k < ns.length; k++) {
        const n = ns[k];
        assert.ok(n.lane >= 0 && n.lane < LANES);
        assert.ok(n.t > 0 && n.t < song.seconds);
        if (k) assert.ok(n.t >= ns[k - 1].t);
        assert.ok(n.t > busy[n.lane], `${lv} lane ${n.lane} at ${n.t}`);
        busy[n.lane] = n.end ?? n.t;
        if (n.end) assert.ok(n.end > n.t + 0.3);
      }
    }
  }
});

test('harder levels have more notes, and the same song always the same chart', () => {
  for (const song of SONGS) {
    const c = chartsOf(song, 9);
    const n = LEVELS.map(l => c[l].notes.length);
    for (let i = 1; i < n.length; i++) assert.ok(n[i] > n[i - 1], n.join(' '));
    assert.deepEqual(chartsOf(song, 9), c);
    // (Easy stays easy: under two notes a second.)
    assert.ok(c.easy.notes.length / song.seconds < 2, `easy ${c.easy.notes.length / song.seconds}`);
    // (Holds turn up, on the levels below expert at least.)
    assert.ok(c.normal.notes.some(x => x.end));
  }
});

test('judging and the score', () => {
  assert.equal(judge(0.01), 'perfect');
  assert.equal(judge(-0.07), 'great');
  assert.equal(judge(0.12), 'good');
  assert.equal(judge(0.2), null);
  const chart = { notes: [{ t: 1, lane: 0 }, { t: 2, lane: 1, end: 3 }] };
  assert.equal(unitsOf(chart), 3);
  const top = scoreOf({ perfect: 3, combo: 3 }, 3);
  assert.equal(top.score, 1000000);
  assert.equal(top.grade, 'S+');
  assert.ok(top.allPerfect && top.full);
  const mid = scoreOf({ perfect: 1, great: 1, miss: 1, combo: 2 }, 3);
  assert.ok(!mid.full && mid.score < 700000);
  assert.equal(rankOf(0), 'D');
  // (A tally can't score more than a perfect round.)
  assert.ok(scoreOf({ perfect: 9, combo: 9 }, 3).score >= 1000000);
});

test('the best of each song and level is kept, never lowered', () => {
  const k = bestKey({ seed: 1, mood: 'all', style: 'lofi' }, 'hard');
  let { store, best } = withRound(null, k, { score: 800000, grade: 'B', full: false, combo: 40 });
  assert.ok(best);
  ({ store, best } = withRound(store, k, { score: 700000, grade: 'C', full: false, combo: 10 }));
  assert.ok(!best);
  assert.equal(store.bests[k].score, 800000);
  assert.equal(store.plays, 2);
  assert.deepEqual(dailyOf('2026-10-19'), dailyOf('2026-10-19'));
  assert.notDeepEqual(dailyOf('2026-10-19'), dailyOf('2026-10-20'));
  assert.equal(new Set(setOf('2026-10-19', 'hype').map(x => x.seed)).size, 6);
});

test('records: every song played, its best at each level, the last played first', () => {
  const a = { seed: 7, mood: 'all', style: 'lofi' };
  const b = { seed: 9, mood: 'hype', style: 'house' };
  let { store } = withRound(null, bestKey(a, 'easy'), { score: 960000, grade: 'S', full: true, combo: 90 }, 1000);
  ({ store } = withRound(store, bestKey(b, 'hard'), { score: 820000, grade: 'B', full: false, combo: 30 }, 2000));
  ({ store } = withRound(store, bestKey(a, 'expert'), { score: 600000, grade: 'D', full: false, combo: 5 }, 3000));
  const r = recordsOf(store);
  assert.equal(r.plays, 3);
  assert.equal(r.cleared, 2);
  assert.equal(r.s, 1);
  assert.equal(r.full, 1);
  assert.deepEqual(r.songs.map(x => x.seed), [7, 9]);
  assert.equal(r.songs[0].levels.easy.score, 960000);
  assert.equal(r.songs[0].levels.normal, null);
  assert.equal(r.songs[0].levels.expert.grade, 'D');
  assert.equal(r.songs[1].mood, 'hype');
  assert.equal(r.songs[1].style, 'house');
  assert.deepEqual(recordsOf(null), { songs: [], plays: 0, cleared: 0, s: 0, full: 0 });
});

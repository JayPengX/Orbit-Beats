import test from 'node:test';
import assert from 'node:assert/strict';
import { radioPick, radioSpec, stationStyles, MOODS } from '../public/lib/radio.mjs';
import { STYLES } from '../public/engine.mjs';
import { stationFilter, stationId, homeRows, tasteList, TEMPOS, POPULAR, dailyPicks, nowStation, dayKey } from '../public/lib/stations.mjs';

test('a station filter narrows the grooves, never to none', () => {
  assert.deepEqual(stationStyles({ mood: 'chill', styles: ['lofi', 'trap', 'jazz'] }).sort(), ['lofi']);
  assert.deepEqual(stationStyles({ styles: ['trap', 'drill'] }).sort(), ['drill', 'trap']);
  // (none of the asked in the mood: the asked ones)
  assert.deepEqual(stationStyles({ mood: 'chill', styles: ['trap'] }), ['trap']);
  assert.deepEqual(stationStyles({ styles: ['nope'] }), STYLES);
  assert.deepEqual(stationStyles({}), STYLES);
  const slow = stationStyles({ bpm: [60, 95] });
  assert.ok(slow.includes('lofi') && !slow.includes('dnb') && !slow.includes('trap'));
  assert.deepEqual(stationStyles({ mood: 'hype', bpm: [0, 5] }), MOODS.hype.styles);
});

test('radioPick keeps to the station: styles, tempo, and still varies', () => {
  const styles = ['lofi', 'jazz', 'bossa', 'reggae'];
  let recent = [];
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const p = radioPick('all', recent, 1000 + i * 7919, { styles });
    assert.ok(styles.includes(p.style), p.style);
    seen.push(p.style);
    recent = [...recent, p];
  }
  assert.ok(new Set(seen).size >= 3, `varied: ${seen}`);
  assert.notEqual(seen[0], seen[1]);
  assert.notEqual(seen[1], seen[2]);
});

test('a tempo station makes songs in its range', () => {
  for (const t of Object.values(TEMPOS)) {
    let recent = [];
    for (let i = 0; i < 8; i++) {
      const p = radioPick('all', recent, 31 + i * 104729, { bpm: t.bpm });
      const bpm = radioSpec(p.seed, p.mood, p.style).bpm;
      assert.ok(bpm >= t.bpm[0] && bpm <= t.bpm[1], `${p.style} ${bpm} in ${t.bpm}`);
      recent = [...recent, p];
    }
  }
});

test('a mood plus a tempo, and the old picks, are unchanged', () => {
  const p = radioPick('chill', [], 5, { bpm: [60, 95] });
  assert.ok(MOODS.chill.styles.includes(p.style));
  assert.equal(p.mood, 'chill');
  assert.deepEqual(radioPick('chill', [], 77), radioPick('chill', [], 77, null));
  assert.equal(radioPick('style:jazz', [], 9).style, 'jazz');
});

test('station ids become filters', () => {
  assert.deepEqual(stationFilter('chill'), { mood: 'chill' });
  assert.deepEqual(stationFilter('style:trap'), { mood: 'style:trap' });
  assert.deepEqual(stationFilter('tempo:fast'), { mood: 'all', bpm: TEMPOS.fast.bpm });
  assert.deepEqual(stationFilter('taste', { jazz: 5, lofi: 9, rock: 1 }), { mood: 'all', styles: ['lofi', 'jazz', 'rock'] });
  assert.deepEqual(stationFilter('taste', {}), { mood: 'all', styles: POPULAR });
  assert.deepEqual(stationFilter('???'), { mood: 'all' });
  assert.equal(stationId('tempo:mid'), 'tempo:mid');
  assert.equal(stationId('tempo:zzz'), 'all');
  assert.equal(stationId('style:lofi'), 'style:lofi');
  assert.equal(stationId(undefined), 'all');
});

test('the home rows: your taste, moods, eight grooves to browse', () => {
  const rows = homeRows({ jazz: 3, lofi: 1 });
  assert.deepEqual(rows.map(r => r.key), ['for-you', 'moods', 'genres']);
  assert.deepEqual(rows[0].ids, ['taste', 'style:jazz', 'style:lofi'], 'the taste stations, most kept first');
  assert.deepEqual(homeRows({})[0].ids, [], 'nothing kept: no row, 今日精選 speaks for it');
  assert.deepEqual(rows[2].ids, POPULAR.map(s => `style:${s}`));
  assert.equal(rows[2].ids.length, 8);
  assert.deepEqual(tasteList({ jazz: 0, bogus: 4, rock: 2 }), [['rock', 2]]);
});

test('今日精選: a day gives the same songs, each differing from the one before; another day, others', () => {
  const a = dailyPicks('2026-10-19', {});
  assert.equal(a.length, 8);
  assert.deepEqual(a, dailyPicks('2026-10-19', {}));
  // (The first three now, the rest a moment later (lib/homeview.mjs): the same eight.)
  assert.deepEqual(a, dailyPicks('2026-10-19', {}, 8, dailyPicks('2026-10-19', {}, 3)));
  assert.notDeepEqual(a.map(x => x.seed), dailyPicks('2026-10-20', {}).map(x => x.seed));
  for (const [i, x] of a.entries()) {
    assert.ok(Number.isInteger(x.seed) && STYLES.includes(x.style) && x.mood === 'all' && x.bpm > 40 && x.key && x.seconds > 0);
    if (i) assert.notEqual(x.style, a[i - 1].style, 'no groove twice in a row');
  }
  assert.ok(new Set(a.map(x => x.style)).size >= 6, 'many grooves in one day');
  // (With taste, every other song is of the grooves kept.)
  const mine = dailyPicks('2026-10-19', { jazz: 5, blues: 2 });
  for (const i of [1, 3, 5, 7]) assert.ok(['jazz', 'blues'].includes(mine[i].style), mine[i].style);
});

test('適合現在: a station for the hour', () => {
  const at = h => nowStation(h).id;
  assert.equal(at(7), 'chill');
  assert.equal(at(14), 'pop');
  assert.equal(at(19), 'groove');
  assert.equal(at(2), 'style:ambient');
  for (let h = 0; h < 24; h++) assert.ok(stationId(at(h)) === at(h), `${h}: a real station`);
  assert.equal(dayKey(new Date(2026, 9, 5)), '2026-10-05');
});

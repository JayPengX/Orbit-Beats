// The engine's newer parts: 20 grooves, pre-hooks, arrangements by hand
// (planOf), forced styles, songs as events, renderEvents, the jam's drums.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, SECTIONS, FAMILY, FORMS, MAX_PLAN_BARS, makeRng, planSong, planOf, makeSong, renderEvents, drumKit, grooveHits, demoRecording, splitPieces, analyzeRecording } from '../public/engine.mjs';
import { MIX, CEILING } from '../public/lib/mix.mjs';
import { DEFAULTS } from '../public/lib/kits.mjs';
import { GROOVE_STYLES } from '../public/lib/synth.mjs';

const rec = demoRecording();
const pieces = splitPieces(rec);
const analysis = analyzeRecording(pieces, rec.sr);
const roles = analysis.roles;
const kit = drumKit(roles);
const bpm = 125, B = (60 / bpm) * rec.sr;

test('forty-nine grooves, each its family led by itself, every relative a groove; the studio writes each', () => {
  assert.equal(STYLES.length, 49);
  assert.equal(new Set(STYLES).size, 49);
  assert.deepEqual(Object.keys(FAMILY).sort(), [...STYLES].sort());
  for (const s of STYLES) {
    assert.equal(FAMILY[s][0], s);
    assert.equal(new Set(FAMILY[s]).size, FAMILY[s].length, `${s}: no relative twice`);
    for (const x of FAMILY[s]) assert.ok(STYLES.includes(x), `${s} -> ${x}`);
  }
  assert.deepEqual([...GROOVE_STYLES].sort(), [...STYLES].sort());
  assert.deepEqual(SECTIONS, ['intro', 'verse', 'pre', 'hook', 'break', 'bridge', 'outro']);
  assert.ok(FORMS.some(f => f.includes('pre')) && FORMS.some(f => !f.includes('pre')));
  assert.equal(new Set(FORMS.map(f => f.join())).size, FORMS.length, 'no form twice');
});

test("each groove's bar of drums: on the kit's drums, inside its bars, on a 16th grid, its own; the same for the same seed", () => {
  assert.deepEqual(kit, { kick: 9, heavy: 21, sub: 23, snare: 11, tick: 10, roll: 22, fill: 5 });
  const seen = new Set();
  for (const s of STYLES) {
    const hits = grooveHits(s, kit, 4, 3);
    assert.ok(hits.length >= 4, `${s}: ${hits.length} hits`);
    for (const h of hits) {
      assert.ok(Object.values(kit).includes(h.i), `${s} plays piece ${h.i}`);
      assert.ok(h.beat >= 0 && h.beat < 16, `${s} at ${h.beat}`);
      assert.equal(h.beat * 4, Math.round(h.beat * 4), `${s} at ${h.beat}`);
    }
    assert.deepEqual(grooveHits(s, kit, 4, 3), hits);
    assert.ok(hits.some(h => h.beat < 4) && hits.some(h => h.beat >= 12), `${s}: every bar`);
    seen.add(JSON.stringify(grooveHits(s, kit, 1, 1)));
  }
  assert.equal(seen.size, STYLES.length, 'every groove its own');
  assert.deepEqual(grooveHits('trap', drumKit(['riff']), 4), [], 'no drums, no hits');
  assert.ok(grooveHits('nope', kit, 1).length > 0, 'an unknown groove: four on the floor');
  assert.deepEqual(grooveHits('four', kit, 0), []);
});

test('every style makes a whole song (unmixed): finite, its groove, kin in the hooks; a style not in its family list ignored', () => {
  for (const style of STYLES) {
    const { audio, info, events } = makeSong(pieces, rec.sr, 21, { analysis, style, minBars: 8, maxBars: 8, humanize: 0.5 });
    assert.equal(info.style, style);
    assert.ok(FAMILY[style].includes(info.alt));
    assert.ok(audio.L.every(Number.isFinite), style);
    assert.equal(info.mixed, false);
    assert.ok(events.length > 20);
  }
  const base = makeSong(pieces, rec.sr, 21, { analysis, minBars: 8, maxBars: 8 }).info.style;
  assert.equal(makeSong(pieces, rec.sr, 21, { analysis, minBars: 8, maxBars: 8, style: 'polka' }).info.style, base);
  // A style asked for outside the styles picked: still that style.
  assert.equal(makeSong(pieces, rec.sr, 21, { analysis, minBars: 8, maxBars: 8, styles: ['trap'], style: 'reggae' }).info.style, 'reggae');
});

test('pre-hooks: in some songs, always between a verse and its hook; no kick, no bass, a riser of snares getting faster', () => {
  const R = makeRng(77);
  let pre = 0;
  for (let k = 0; k < 200; k++) if (planSong(R, 25, 29).some(([t]) => t === 'pre')) pre++;
  assert.ok(pre > 20 && pre < 180, `${pre} of 200 songs with pre-hooks`);
  const plan = [['intro', 2], ['verse', 4], ['pre', 4], ['hook', 4], ['outro', 2]];
  for (let seed = 1; seed <= 6; seed++) {
    const { events, info } = makeSong(pieces, rec.sr, seed, { analysis, plan, humanize: 0 });
    assert.deepEqual(info.plan, plan);
    const inPre = events.filter(e => e.beat >= 24 && e.beat < 40);
    for (const e of inPre) assert.ok(!['kick', 'sub', 'bass'].includes(roles[e.i]), `seed ${seed}: ${roles[e.i]} at ${e.beat}`);
    const riser = inPre.filter(e => e.i === kit.snare).map(e => e.beat);
    assert.deepEqual(riser, [24, 25, 26, 27, 28, 29, 30, 31, 32, 32.5, 33, 33.5, 34, 34.5, 35, 35.5, ...Array.from({ length: 16 }, (_, q) => 36 + q / 4)]);
    assert.ok(inPre.some(e => roles[e.i] === 'riff'), 'the riffs go on');
  }
  // A 2-bar pre-hook: a bar of beats, then sixteenths.
  const two = makeSong(pieces, rec.sr, 1, { analysis, plan: [['intro', 2], ['verse', 4], ['pre', 2], ['hook', 4], ['outro', 2]], humanize: 0 }).events;
  assert.deepEqual(two.filter(e => e.i === kit.snare && e.beat >= 24 && e.beat < 32).map(e => e.beat), [24, 25, 26, 27, ...Array.from({ length: 16 }, (_, q) => 28 + q / 4)]);
});

test('planOf: an arrangement by hand, checked', () => {
  assert.deepEqual(planOf([['intro', 2], ['hook', 8], ['outro', 1]]), [['intro', 0, 2], ['hook', 2, 8], ['outro', 10, 1]]);
  assert.deepEqual(planOf([['bridge', 16]]), [['bridge', 0, 16]]);
  for (const bad of [[], null, undefined, 'verse', {}, [['chorus', 4]], [['verse', 0]], [['verse', 17]], [['verse', 2.5]], [['verse', '4']], [['verse']], ['verse'], [null], [[4, 'verse']]])
    assert.throws(() => planOf(bad), /section|arrangement/, JSON.stringify(bad));
  assert.equal(planOf(Array(8).fill(['verse', 16])).at(-1)[1], 112);
  assert.throws(() => planOf([...Array(8).fill(['verse', 16]), ['outro', 1]]), new RegExp(`${MAX_PLAN_BARS} bars`));
});

test('an arranged song keeps the rest of its seed: the same groove, riffs and bass; the hits fit its bars', () => {
  const a = makeSong(pieces, rec.sr, 33, { analysis, minBars: 16, maxBars: 16 }).info;
  const plan = [['intro', 1], ['hook', 2], ['break', 3], ['bridge', 2], ['hook', 8], ['outro', 3]];
  const { info, events } = makeSong(pieces, rec.sr, 33, { analysis, minBars: 16, maxBars: 16, plan, humanize: 0 });
  assert.deepEqual([info.style, info.alt, info.riffSets, info.bass], [a.style, a.alt, a.riffSets, a.bass]);
  assert.equal(info.bars, 19);
  assert.deepEqual(info.plan, plan);
  assert.ok(events.every(e => e.beat >= 0 && e.beat <= info.beats), 'every hit in the song (the last on the next downbeat)');
  assert.ok(events.some(e => e.beat === info.beats));
  assert.throws(() => makeSong(pieces, rec.sr, 1, { analysis, plan: [['verse', 40]] }), /Not a section/);
});

test('songs as events: each hit its piece, beat and sample, the audio exactly those hits', () => {
  const sr = 1000, unit = pieces.map(() => { const L = new Float32Array(10), R = new Float32Array(10); L[0] = 0.25; R[0] = 0.5; return { L, R }; });
  const { audio, events } = makeSong(unit, sr, 3, { bpm: 120, roles, minBars: 8, maxBars: 8, humanize: 0 });
  const want = new Float32Array(audio.L.length);
  for (const e of events) {
    assert.equal(e.a, Math.round(e.beat * 500), 'humanize 0: on the grid, no swing');
    if (e.a < want.length) want[e.a] += 0.25;
  }
  assert.deepEqual(audio.L, want);
});

test('renderEvents: hits by hand on the grid, mixed or not, its plan, every bar of it', () => {
  const sr = 1000, unit = pieces.map(() => { const L = new Float32Array(10), R = new Float32Array(10); L[0] = 0.25; R[0] = 0.25; return { L, R }; });
  const hits = [{ i: 12, beat: 0 }, { i: 9, beat: 1.5 }, { i: 9, beat: 1.5 }, { i: 1, beat: 7.25 }, { i: 3, beat: -1 }, { i: 50, beat: 2 }];
  const r = renderEvents(unit, sr, 120, roles, hits);
  assert.deepEqual(r.events.map(e => [e.i, e.a]), [[12, 0], [9, 750], [9, 750], [1, 3625]]);
  assert.equal(r.audio.L[0], 0.25);
  assert.equal(r.audio.L[750], 0.5, 'the same hit twice adds up, unmixed');
  assert.equal(r.audio.L[3625], 0.25);
  assert.deepEqual([r.info.bars, r.info.beats, r.info.mixed, r.info.style, r.info.key], [2, 8, false, null, null]);
  const off = roles.map((x, i) => (i === 9 ? 'off' : x));
  assert.equal(renderEvents(unit, sr, 120, off, hits).events.length, 2, "a piece set to 'off' never plays");
  const m = renderEvents(pieces, rec.sr, bpm, roles, grooveHits('house', kit, 2).concat([{ i: 12, beat: 0 }]), { mix: MIX, stems: true, plan: [['intro', 1], ['hook', 1]] });
  assert.equal(m.info.mixed, true);
  assert.ok(m.audio.peak <= CEILING + 1e-6);
  assert.deepEqual(Object.keys(m.stems).sort(), ['drums', 'fx', 'hats', 'keys']);
  assert.deepEqual(m.info.plan, [['intro', 1], ['hook', 1]]);
  for (const [bars, want] of [[16, [16]], [17, [16, 1]], [33, [16, 16, 1]], [48, [16, 16, 16]]]) {
    const x = renderEvents(unit, sr, 120, roles, [{ i: 12, beat: bars * 4 - 1 }]);
    assert.deepEqual(x.info.plan, want.map(n => ['verse', n]), `${bars} bars`);
  }
  assert.equal(renderEvents(unit, sr, 120, roles, [{ i: 12, beat: 4 }]).info.bars, 2, 'a hit on a bar line starts that bar');
});

test('the mixer is on by default where the page opens it; a song without one is the pieces as recorded', () => {
  assert.equal(MIX.on, true);
  assert.equal(DEFAULTS.mix.on, true);
  assert.equal(makeSong(pieces, rec.sr, 1, { analysis, minBars: 8, maxBars: 8, mix: DEFAULTS.mix }).info.mixed, true);
  assert.equal(makeSong(pieces, rec.sr, 1, { analysis, minBars: 8, maxBars: 8 }).info.mixed, false);
  // A mixer missing settings fills them in as it opens.
  const a = makeSong(pieces, rec.sr, 1, { analysis, minBars: 8, maxBars: 8, mix: {} });
  const b = makeSong(pieces, rec.sr, 1, { analysis, minBars: 8, maxBars: 8, mix: MIX });
  assert.deepEqual(a.audio.L, b.audio.L);
  assert.ok(Math.abs(a.info.seconds - b.info.seconds) < 1e-9);
});

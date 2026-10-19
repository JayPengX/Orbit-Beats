// The radio's songs as phrases, not pasted loops: tunes of eight bars (a question and an answer, no bar a copy of the one two before),
// a second verse, a second hook and a lifted last hook that are each their own variant, a bridge on chords and a tune of its own,
// notes that carry a level and a little timing of their own, hats that turn, and songs of about two and a half to three minutes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSong, makeRng, analyzeRecording, crc32, STYLES } from '../public/engine.mjs';
import { radioSpec, radioKit, radioPlan, radioSong, progFamily } from '../public/lib/radio.mjs';
import { renderClip, emptyNotes } from '../public/lib/synth.mjs';

const SR = 8000;
const STYLE_SEEDS = STYLES.map((style, i) => [style, 101 + i * 29]);
// A tune's bars: for each of the eight, "step:degree" of its notes (the same chord, so the same degree is the same note).
const barsOf = notes => Array.from({ length: 8 }, (_, b) => notes.filter(n => n.step >= b * 16 && n.step < b * 16 + 16).map(n => `${n.step - b * 16}:${n.deg}`).join(' '));
const TUNES = ['verse1', 'verse2', 'hook1', 'hook2', 'bridge'];
const sound = kit => crc32(new Uint8Array(Int16Array.from(kit.pieces.flatMap(p => [...p.L.subarray(0, 4000)].map(v => Math.round(v * 3e4)))).buffer));

test('a tune is eight bars, and no bar is a copy of the one two bars before it (bar three is not bar one)', () => {
  let long = 0, wide = 0, tunes = 0;
  for (const [style, seed] of STYLE_SEEDS) {
    const sp = radioSpec(seed, 'all', style);
    const { tunes: t } = radioKit(sp, SR, { song: true, lift: true });
    for (const name of [...TUNES, 'lift']) {
      const bars = barsOf(t[name]);
      tunes++;
      assert.ok(bars.every(b => b), `${style} ${name}: every bar has a note`);
      for (let b = 2; b < 8; b++) assert.notEqual(bars[b], bars[b - 2], `${style} ${name}: bar ${b + 1} copies bar ${b - 1}`);
      assert.notEqual(bars[3], bars[1], `${style} ${name}: bar four is not bar two`);
      // The answer opens on the question's first notes.
      // (Or an octave up, in a variant that lifts its answer.)
      const first = b => b.split(' ')[0].split(':').map(Number);
      assert.ok(first(bars[4])[0] === first(bars[0])[0] && (first(bars[4])[1] - first(bars[0])[1]) % 7 === 0, `${style} ${name}: the answer opens as the question did`);
      assert.ok(t[name].every(n => n.step < 128 && n.len >= 1 && n.step + n.len <= (n.step < 64 ? 64 : 128)), `${style} ${name}: a note stays inside its four bars`);
      if (t[name].some(n => n.len >= 8)) long++;
      const degs = t[name].map(n => n.deg);
      if (Math.max(...degs) - Math.min(...degs) >= 9) wide++;
    }
  }
  assert.ok(long > tunes * 0.5, `${long} of ${tunes} tunes hold a note of half a bar or more`);
  assert.ok(wide > tunes * 0.5, `${wide} of ${tunes} tunes range over more than an octave`);
});

test('the second verse, the second hook and the lifted last hook are variants of their tunes, not copies; the bridge has its own', () => {
  const same = (a, b) => barsOf(a).filter((x, i) => x === barsOf(b)[i]).length;
  for (const [style, seed] of STYLE_SEEDS.slice(0, 24)) {
    const { tunes: t } = radioKit(radioSpec(seed, 'all', style), SR, { song: true, lift: true });
    assert.ok(same(t.verse1, t.verse2) <= 3, `${style}: verse two plays its own notes (${same(t.verse1, t.verse2)} of 8 bars alike)`);
    assert.ok(same(t.hook1, t.hook2) <= 3, `${style}: hook two plays its own notes`);
    assert.ok(same(t.hook1, t.lift) <= 4, `${style}: the lifted hook plays its own notes`);
    assert.ok(same(t.verse1, t.bridge) <= 1 && same(t.hook1, t.bridge) <= 1, `${style}: the bridge plays a tune of its own`);
    // (A variant keeps the tune's opening: the hook is still the hook.)
    assert.equal(barsOf(t.hook1)[0], barsOf(t.hook2)[0], `${style}: hook two opens as hook one`);
    assert.equal(barsOf(t.hook1)[0], barsOf(t.lift)[0], `${style}: and the lifted one too`);
    assert.ok(barsOf(t.verse1)[0] === barsOf(t.verse2)[0], `${style}: verse two opens as verse one`);
  }
});

test('every note has a level and a few ms of timing of its own: no two repeats alike', () => {
  for (const [style, seed] of STYLE_SEEDS.slice(0, 12)) {
    const { tunes: t } = radioKit(radioSpec(seed, 'all', style), SR, { song: true, lift: true });
    for (const name of TUNES) {
      const gains = new Set(t[name].map(n => Math.round(n.g * 100)));
      assert.ok(gains.size >= 8, `${style} ${name}: ${gains.size} levels`);
      assert.ok(t[name].every(n => Math.abs(n.dt) <= 0.004 && n.g > 0.5 && n.g <= 1.2), `${style} ${name}: levels and timing within bounds`);
      assert.ok(new Set(t[name].map(n => n.dt)).size > t[name].length / 2, `${style} ${name}: timing differs note to note`);
    }
  }
  // (A note's own level and timing are in the clip's sound.)
  const clip = notes => renderClip({ ...emptyNotes('keys', 1, null), notes }, 8000, 120);
  const a = clip([{ step: 4, midi: 60, len: 4 }]).L, b = clip([{ step: 4, midi: 60, len: 4, g: 0.5 }]).L, c = clip([{ step: 4, midi: 60, len: 4, dt: 0.004 }]).L;
  const peak = x => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(Math.abs(peak(b) / peak(a) - 0.5) < 0.02, 'g scales the note');
  assert.equal(a.findIndex(v => Math.abs(v) > 0.02) + 32, c.findIndex(v => Math.abs(v) > 0.02), 'dt moves it 4 ms (32 samples at 8 kHz)');
  assert.ok(a.every((v, i) => v === clip([{ step: 4, midi: 60, len: 4 }]).L[i]), 'a note without them is as it was');
});

test('the bridge has a loop of chords, a lead, chords and a bass of its own; a seed makes the same kit', () => {
  for (let k = 0; k < 400; k++) {
    const sp = radioSpec(7000 + k * 13, 'all', STYLES[k % STYLES.length]);
    const fams = [sp.prog, sp.progB, sp.progC].filter(Boolean).map(progFamily);
    assert.ok(sp.progC && !fams.slice(0, -1).includes(progFamily(sp.progC)), `${sp.style}: the bridge's chords are a third loop`);
    assert.ok(sp.leadC && (sp.leadC !== sp.lead || sp.leadC !== sp.leadB || sp.leadB === sp.lead), `${sp.style}: a lead of its own`);
  }
  for (const [style, seed] of STYLE_SEEDS.slice(0, 10)) {
    const sp = radioSpec(seed, 'all', style);
    const a = radioKit(sp, SR, { song: true, lift: true }), b = radioKit(sp, SR, { song: true, lift: true });
    assert.deepEqual(a.parts, b.parts);
    assert.deepEqual(a.tunes, b.tunes);
    assert.equal(sound(a), sound(b), `${style}: the same sound`);
    const own = [...a.parts.bridge, ...a.parts.bridgeBass];
    assert.equal(a.parts.bridge.length, 2);
    assert.equal(a.parts.bridgeBass.length, 2);
    for (const i of own) assert.ok(![...a.parts.verse, ...a.parts.verse2, ...a.parts.hook, ...a.parts.hook2, ...(a.parts.lift || [])].includes(i), `${style}: the bridge's pieces are its own`);
  }
});

// A song made from the kit with its plan, the pieces each section plays.
function sectionsOf(seed, style, plan) {
  const sp = radioSpec(seed, 'all', style);
  const { pieces, roles, parts, base, like } = radioKit(sp, SR, { song: true });
  const heard = analyzeRecording(pieces.slice(0, base), SR, { bpm: sp.bpm });
  const analysis = { ...heard, analyses: [...heard.analyses, ...like.map(i => heard.analyses[i])], loops: [...heard.loops, ...like.map(i => heard.loops[i])], roles: [...heard.roles, ...like.map(i => heard.roles[i])] };
  const song = makeSong(pieces, SR, seed, { analysis, roles, bpm: sp.bpm, style, humanize: 0, plan, arrange: parts, varied: sp.dress, key: sp.key });
  const B = (60 / sp.bpm) * SR;
  let bar = 0;
  const secs = plan.map(([t, n]) => {
    const from = bar * 4 * B, to = (bar + n) * 4 * B;
    bar += n;
    const hits = song.events.filter(e => e.a >= from - 1 && e.a < to - 1);
    return { t, riffs: new Set(hits.filter(e => roles[e.i] === 'riff').map(e => e.i)), bass: new Set(hits.filter(e => roles[e.i] === 'bass').map(e => e.i)), loops: hits.filter(e => ['riff', 'bass', 'phrase'].includes(roles[e.i])).map(e => analysis.loops[e.i]) };
  });
  return { parts, secs, analysis, roles };
}

test('the engine plays each section its own pieces: hook two its second tune, the bridge its own riffs and bass, the last hook the lifted one; every loop is four bars', () => {
  const plan = [['intro', 4], ['verse', 8], ['hook', 8], ['verse', 8], ['hook', 8], ['bridge', 8], ['break', 4], ['hook', 8], ['outro', 4]];
  let lifted = 0;
  for (const [style, seed] of [['house', 5], ['rock', 12], ['lofi', 31], ['salsa', 40], ['kpop', 53], ['trap', 66], ['jazz', 71], ['funk', 88]]) {
    const { parts, secs, analysis, roles } = sectionsOf(seed, style, plan);
    const [, v1, h1, v2, h2, br, , h3] = secs;
    const within = (set, list) => [...set].every(i => list.includes(i));
    assert.ok(within(v1.riffs, parts.verse) && within(v2.riffs, parts.verse2), `${style}: the verses`);
    assert.ok(within(h1.riffs, [...parts.hook, parts.layer]), `${style}: hook one plays the hook`);
    assert.ok(within(h2.riffs, [...parts.hook2, parts.layer]) && [...h2.riffs].some(i => parts.hook2.includes(i)), `${style}: hook two plays its second tune`);
    assert.ok(within(br.riffs, parts.bridge) && br.riffs.size === 2, `${style}: the bridge plays its two parts, in turn`);
    assert.ok(within(br.bass, parts.bridgeBass), `${style}: and only its own bass (never the verse's under other chords)`);
    if (parts.lift) {
      lifted++;
      assert.ok(within(h3.riffs, parts.lift) && within(h3.bass, parts.liftBass), `${style}: the last hook is the lifted one`);
    }
    // Every riff, phrase and bass piece is a four-bar loop (16 beats): the engine plays the eight-bar parts as two.
    roles.forEach((r, i) => { if (['riff', 'phrase', 'bass', 'hat'].includes(r)) assert.equal(analysis.loops[i], 16, `${style}: piece ${i} (${r}) is four bars`); });
  }
  assert.ok(lifted >= 6);
});

test('hats turn in their last bar and are not all at one level', () => {
  for (const [style, seed] of STYLE_SEEDS.slice(0, 16)) {
    const sp = radioSpec(seed, 'all', style);
    const { pieces, roles } = radioKit(sp, 16000, { song: true, lift: true });
    const bar = (p, b) => p.L.subarray(b * Math.floor(p.L.length / 4), (b + 1) * Math.floor(p.L.length / 4));
    const hats = pieces.filter((p, i) => roles[i] === 'hat');
    assert.ok(hats.length >= 3, `${style}: three hat loops`);
    for (const h of hats) {
      assert.ok(Math.abs(h.L.length - 4 * (240 / sp.bpm) * 16000) < 2, `${style}: four bars`);
      const diff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
      assert.ok(diff(bar(h, 0), bar(h, 3)) > 0.01, `${style}: the last bar is not the first`);
    }
  }
});

test('songs of the radio run about two and a half minutes; a fifth are short forms; a bridge in most', () => {
  const secs = [];
  let bridges = 0, longer = 0, short = 0;
  for (let k = 0; k < 600; k++) {
    const sp = radioSpec(31 * k + 7, 'all', STYLES[k % STYLES.length]);
    const plan = radioPlan(makeRng(sp.seed ^ 0x1b873593), sp.bpm, sp.seconds);
    const bars = plan.reduce((a, [, n]) => a + n, 0);
    assert.ok(bars >= 24 && bars <= 96, `${bars} bars`);
    assert.ok(plan.every(([, n]) => n === 4 || n === 8));
    assert.ok(plan.filter(([t]) => t === 'bridge').every(([, n]) => n === 8), 'a bridge is eight bars');
    secs.push((bars * 240) / sp.bpm);
    if (sp.seconds < 120) short++;
    else {
      longer++;
      if (plan.some(([t]) => t === 'bridge')) bridges++;
    }
  }
  secs.sort((a, b) => a - b);
  const median = secs[300];
  assert.ok(median >= 140 && median <= 190, `median ${median.toFixed(0)} s`);
  assert.ok(secs.at(-1) <= 250, `longest ${secs.at(-1).toFixed(0)} s`);
  assert.ok(short >= 600 * 0.12 && short <= 600 * 0.3, `${short} short forms`);
  assert.ok(bridges > longer * 0.6, `${bridges} of ${longer} full songs have a bridge`);
});

test('a length asked for is cut as it was: sections of the same kinds, no bridge of eight bars', () => {
  for (const [bpm, secs] of [[100, 60], [100, 240], [140, 360]]) {
    const plan = radioPlan(makeRng(secs + bpm), bpm, secs, true);
    assert.ok(plan.filter(([t]) => t === 'bridge').every(([, n]) => n === 4), JSON.stringify(plan));
  }
  // (A song of an asked length still sounds: the kit takes any plan.)
  const x = radioSong({ seed: 7, mood: 'all', style: 'house', seconds: 40 }, SR);
  assert.ok(x.audio.L.every(Number.isFinite) && x.info.seconds > 20);
});

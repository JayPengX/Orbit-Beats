// The radio's variety: songs deterministic from their seed, the next song steering clear of the last
// eight, and a song whose sections really differ (a second verse, a hook of its own, a lifted last hook).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSong, makeRng, analyzeRecording, crc32 } from '../public/engine.mjs';
import { MOODS, MEMORY, progFamily, radioPick, radioPlan, radioSpec, radioKit, radioSong } from '../public/lib/radio.mjs';

const SR = 8000;
const sums = a => crc32(new Uint8Array(new Int16Array(a.L.map(v => Math.round(v * 20000))).buffer));
const specsOf = (mood, n = 40, from = 3) => {
  const out = [];
  for (let k = 0; k < n; k++) {
    const p = radioPick(mood, out, 7919 * k + from);
    out.push({ ...radioSpec(p.seed, p.mood, p.style), pick: p });
  }
  return out;
};
const picks = specs => specs.map(s => s.pick);

test('a seed makes the same song: the spec, the pick, the plan and the sound', () => {
  assert.deepEqual(radioSpec(77, 'all', 'funk'), radioSpec(77, 'all', 'funk'));
  const a = specsOf('all', 12), b = specsOf('all', 12);
  assert.deepEqual(a.map(s => s.pick), b.map(s => s.pick));
  for (const seed of [4, 91]) {
    const x = radioSong({ seed, mood: 'all', style: seed === 4 ? 'house' : 'lofi' }, SR);
    const y = radioSong({ seed, mood: 'all', style: seed === 4 ? 'house' : 'lofi' }, SR);
    assert.equal(sums(x.audio), sums(y.audio));
    assert.deepEqual(x.info.plan, y.info.plan);
  }
});

test('no chord loop, lead or key in two songs running; the last eight rarely repeat what is near', () => {
  for (const mood of Object.keys(MOODS)) {
    const specs = specsOf(mood);
    const fam = specs.map(s => progFamily(s.prog));
    specs.forEach((s, k) => {
      if (!k) return;
      const p = specs[k - 1];
      assert.notEqual(fam[k], fam[k - 1], `${mood} #${k}: the same chord loop twice`);
      assert.notEqual(s.lead, p.lead, `${mood} #${k}: the same lead twice`);
      assert.ok(s.key.tonic !== p.key.tonic || (s.mode || s.key.minor) !== (p.mode || p.key.minor), `${mood} #${k}: the same key twice`);
      assert.notEqual(s.dress.id, p.dress.id, `${mood} #${k}: the same drum touches twice`);
    });
    // (Within the last eight: a chord loop heard again is the exception, and a hook loop too.)
    let again = 0;
    fam.forEach((f, k) => { if (fam.slice(Math.max(0, k - MEMORY), k).includes(f)) again++; });
    assert.ok(again <= 6, `${mood}: ${again} of 40 chord loops heard again within ${MEMORY}`);
    const tonics = specs.map(s => s.key.tonic);
    assert.ok(new Set(tonics).size >= 10, `${mood}: ${new Set(tonics).size} keys in 40 songs`);
  }
});

test('the forms: sections of four or eight bars, many shapes, a break or a bridge in the longer ones', () => {
  const shapes = new Set();
  let turns = 0, longer = 0;
  for (let k = 0; k < 300; k++) {
    const plan = radioPlan(makeRng(k * 31 + 5), 70 + (k % 100), 70 + (k % 80));
    shapes.add(plan.map(p => p.join('')).join());
    assert.ok(plan.every(([, n]) => n === 4 || n === 8), JSON.stringify(plan));
    assert.ok(plan.filter(([t]) => t === 'hook').length >= 1);
    const bars = plan.reduce((a, [, n]) => a + n, 0);
    if (bars >= 40) { longer++; if (plan.some(([t]) => t === 'break' || t === 'bridge')) turns++; }
  }
  assert.ok(shapes.size >= 40, `${shapes.size} shapes`);
  assert.ok(turns > longer * 0.6, `${turns} of ${longer} long songs turn`);
});

// The pieces each section plays, from the hits of a song made with its arrangement.
function sectionsOf(seed, style) {
  const sp = radioSpec(seed, 'all', style);
  const plan = [['intro', 4], ['verse', 8], ['hook', 8], ['verse', 8], ['hook', 8], ['hook', 8], ['outro', 4]];
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
    return { t, riffs: new Set(hits.filter(e => roles[e.i] === 'riff').map(e => e.i)), bass: new Set(hits.filter(e => roles[e.i] === 'bass').map(e => e.i)), subs: new Set(hits.filter(e => roles[e.i] === 'sub').map(e => e.i)), drums: hits.filter(e => ['kick', 'snare', 'sub', 'tick'].includes(roles[e.i])).map(e => `${roles[e.i]}${Math.round((e.a / B) * 4) % 16}`).sort().join() };
  });
  return { sp, parts, secs };
}

test('sections differ: a second verse, a hook of its own, the last hook lifted with its bass and 808', () => {
  let lifted = 0, ownHook = 0;
  for (const [seed, style] of [[5, 'house'], [12, 'rock'], [31, 'lofi'], [40, 'salsa'], [53, 'kpop'], [66, 'trap']]) {
    const { sp, parts, secs } = sectionsOf(seed, style);
    const [, v1, h1, v2, h2, h3] = secs;
    const same = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
    assert.ok(!same(v1.riffs, v2.riffs), `${style}: a second verse plays other riffs`);
    assert.ok(!same(v1.riffs, h1.riffs), `${style}: the hook plays riffs of its own`);
    assert.notEqual(v1.drums, h1.drums, `${style}: the hook's drums are not the verse's`);
    if (parts.lift) {
      lifted++;
      assert.ok([...h3.riffs].every(i => parts.lift.includes(i)), `${style}: the last hook plays the lifted riffs`);
      assert.ok([...h3.bass].every(i => parts.liftBass.includes(i)) && h3.bass.size, `${style}: and the lifted bass`);
      assert.ok([...h3.subs].every(i => i === parts.liftSub), `${style}: and the lifted 808 where the groove has one`);
      for (const h of [h1, h2]) assert.ok([...h.riffs, ...h.bass, ...h.subs].every(i => !parts.lift.includes(i) && !parts.liftBass.includes(i) && i !== parts.liftSub), `${style}: earlier hooks stay down`);
    }
    assert.ok(!same(h1.riffs, h2.riffs), `${style}: the second hook plays its own tune`);
    if (sp.progB) {
      ownHook++;
      assert.notEqual(progFamily(sp.progB), progFamily(sp.prog), `${style}: the hook's chords are another loop`);
      assert.ok([...h1.bass].every(i => parts.hookBass.includes(i)) && h1.bass.size, `${style}: the hook's bass follows its chords`);
    }
  }
  assert.ok(lifted >= 2 && ownHook >= 3, `${lifted} lifted, ${ownHook} with a hook loop of their own`);
});

test('without an arrangement or drum touches a song is the engine\'s own, as it was', () => {
  const sp = radioSpec(8, 'all', 'house');
  const { pieces, roles } = radioKit(sp, SR);
  assert.equal(pieces.length, 18, 'the jam set\'s band is unchanged');
  const a = makeSong(pieces, SR, 8, { roles, bpm: sp.bpm, style: 'house', humanize: 0 });
  const b = makeSong(pieces, SR, 8, { roles, bpm: sp.bpm, style: 'house', humanize: 0, arrange: null, varied: null });
  assert.equal(sums(a.audio), sums(b.audio));
  const c = makeSong(pieces, SR, 8, { roles, bpm: sp.bpm, style: 'house', humanize: 0, varied: true });
  assert.notEqual(sums(a.audio), sums(c.audio), 'varied drums are heard');
});

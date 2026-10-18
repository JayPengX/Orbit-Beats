import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, PRO_ONLY, SIMPLE_ONLY, shows, levelCss, SIMPLE_MAKE, makeSettings } from '../public/lib/easy.mjs';
import { STYLES } from '../public/engine.mjs';
import { MIX } from '../public/lib/mix.mjs';
import { TERMS, TERM_ORDER, EXAMPLES, term } from '../public/lib/help.mjs';
import { DEFAULTS, settingsOf, keptSettings, decode, encode } from '../public/lib/kits.mjs';
import { renderClip } from '../public/lib/synth.mjs';

test('簡單 / 進階: advanced shows every tool, simple hides exactly the advanced ones, and the stylesheet says so', () => {
  assert.deepEqual(LEVELS, ['simple', 'pro']);
  assert.equal(new Set(PRO_ONLY).size, PRO_ONLY.length, 'no name twice');
  for (const c of PRO_ONLY) assert.ok(shows('pro', c) && !shows('simple', c), c);
  for (const c of SIMPLE_ONLY) assert.ok(shows('simple', c) && !shows('pro', c), c);
  assert.ok(!PRO_ONLY.some(c => SIMPLE_ONLY.includes(c)));
  // What a beginner needs is never hidden.
  for (const c of ['make-go', 'studio-grid', 'studio-add', 'jam-pads', 'jam-record']) assert.ok(shows('simple', c) && shows('pro', c), c);
  // Simple's 做歌 is one button: no knobs.
  for (const c of ['make-moods', 'make-count', 'make-more', 'make-mix', 'make-styles']) assert.ok(!shows('simple', c) && shows('pro', c), c);
  assert.ok(shows('simple', 'make-easy') && !shows('pro', 'make-easy'));
  for (const c of PRO_ONLY) assert.match(c, /^(make|studio|jam)-[a-z]+$/);
  const css = levelCss();
  for (const c of PRO_ONLY) assert.ok(css.includes(`body.lv-simple [data-ctl="${c}"]`), c);
  for (const c of SIMPLE_ONLY) assert.ok(css.includes(`body.lv-pro [data-ctl="${c}"]`), c);
  assert.ok(css.endsWith('{ display: none !important; }'));
});

test('the level is a kept setting: everyone opens simple, settings from before too; advanced only when picked; what 聽 plays kept too', () => {
  assert.equal(DEFAULTS.level, 'simple');
  assert.deepEqual(settingsOf(null), DEFAULTS);
  assert.equal(settingsOf({ at: 5, count: 4, styles: ['trap'] }).level, 'simple', 'settings from before 簡單 / 進階: simple too');
  const mine = settingsOf(decode(encode({ settings: keptSettings({ ...DEFAULTS, level: 'pro', radioMood: 'style:lofi' }, 9) })).settings);
  assert.equal(mine.level, 'pro');
  assert.equal(mine.radioMood, 'style:lofi');
  assert.equal(settingsOf({ level: 'expert', count: 3 }).level, 'simple', 'a wrong level: simple');
  assert.equal(settingsOf({ radioMood: 'polka' }).radioMood, 'all', 'a wrong mood: random');
  assert.equal(settingsOf({ guided: true }).guided, undefined, 'the retired guide is forgotten');
});

test("simple makes songs on its own fixed settings: Advanced's never read there, never written, and all there on the way back", () => {
  const advanced = settingsOf({ at: 3, count: 17, minBars: 40, maxBars: 60, styles: ['trap', 'drill'], humanize: 0, seed: '42', bits: 32, silenceDb: -50, minGap: 1.5, mood: 'hype', smart: true, mix: { on: false, reverb: 0.9 }, level: 'pro' });
  const before = structuredClone(advanced);
  const simple = makeSettings('simple', { ...advanced, level: 'simple' });
  // Whatever Advanced says, Simple's are the same.
  assert.deepEqual(simple, makeSettings('simple', { ...DEFAULTS, level: 'simple' }));
  for (const [k, v] of Object.entries(SIMPLE_MAKE)) assert.deepEqual(simple[k], v, k);
  assert.deepEqual(simple.styles, STYLES, 'every groove');
  assert.deepEqual(simple.mix, MIX, 'the mixer as it opens');
  // Simple's own copy: changing it changes nothing of Advanced's.
  simple.styles.push('x');
  simple.mix.reverb = 0;
  simple.count = 1;
  assert.deepEqual(advanced, before);
  // Back to Advanced: exactly as left, through the Pass too.
  assert.equal(makeSettings('pro', advanced), advanced);
  const back = settingsOf(decode(encode({ settings: keptSettings({ ...advanced, level: 'simple' }, 4) })).settings);
  back.level = 'pro';
  assert.deepEqual(makeSettings('pro', back), { ...before, level: 'pro' });
  assert.ok(Object.isFrozen(SIMPLE_MAKE));
});

// A line's width in ems: a Chinese character one, anything else about half.
const width = s => [...s].reduce((a, c) => a + (/[\u2e80-\u9fff\uff00-\uffef]/.test(c) ? 1 : 0.55), 0);

test('every music word has a name, a one-line hint and one or two sentences, in Chinese and English', () => {
  assert.deepEqual([...TERM_ORDER].sort(), Object.keys(TERMS).sort(), 'the glossary lists every word once');
  for (const id of ['bpm', 'swing', 'riff', 'hat', 'sub', 'chord', 'key', 'section', 'chain', 'stems', 'midi', 'velocity', 'choke', 'snap'])
    assert.ok(TERMS[id], `${id} explained`);
  for (const [id, t] of Object.entries(TERMS))
    for (const lang of ['zh', 'en']) {
      const w = t[lang];
      assert.ok(w?.name && w.hint && w.text, `${id} ${lang}`);
      assert.ok(width(w.hint) <= (lang === 'zh' ? 16 : 24), `${id} ${lang} hint fits a line: ${w.hint}`);
      const sentences = w.text.split(lang === 'zh' ? /[。！？]/ : /[.!?](?:\s|$)/).filter(s => s.trim()).length;
      assert.ok(sentences >= 1 && sentences <= 3, `${id} ${lang}: ${sentences} sentences`);
      if (lang === 'zh') assert.match(w.text, /[一-鿿]/);
    }
  assert.equal(term('swing', 'en').name, 'Swing');
  assert.equal(term('swing').name, '搖擺');
  assert.equal(term('nope'), null);
});

test('each "hear it" plays the same bar without the thing and with it, and they sound different', () => {
  for (const [id, ex] of Object.entries(EXAMPLES)) {
    assert.ok(TERMS[id], `${id} is a word`);
    assert.ok(ex.off[0] && ex.off[1] && ex.on[0] && ex.on[1], `${id} labels`);
    const sound = on => {
      const { clips, bpm } = ex.play(on);
      assert.ok(clips.length && bpm >= 60 && bpm <= 200, id);
      const parts = clips.map(c => renderClip(c, 8000, bpm).L);
      let e = 0;
      for (const L of parts) for (const x of L) e += x * x;
      return { n: Math.max(...parts.map(L => L.length)), e, first: parts[0] };
    };
    const off = sound(false);
    const on = sound(true);
    assert.ok(off.e > 1e-3 && on.e > 1e-3, `${id}: both play something`);
    const same = off.n === on.n && Math.abs(off.e - on.e) < 1e-6 && off.first.every((x, i) => x === on.first[i]);
    assert.ok(!same, `${id}: on and off differ`);
  }
});

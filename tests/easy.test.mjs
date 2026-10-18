import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, PRO_ONLY, SIMPLE_ONLY, shows, levelCss, GUIDE_MOODS, GUIDE_START, guideNext, guideStepNo, shouldGuide } from '../public/lib/easy.mjs';
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
  for (const c of ['make-moods', 'make-count', 'make-go', 'studio-grid', 'studio-add', 'jam-pads', 'jam-record']) assert.ok(shows('simple', c) && shows('pro', c), c);
  for (const c of PRO_ONLY) assert.match(c, /^(make|studio|jam)-[a-z]+$/);
  const css = levelCss();
  for (const c of PRO_ONLY) assert.ok(css.includes(`body.lv-simple [data-ctl="${c}"]`), c);
  for (const c of SIMPLE_ONLY) assert.ok(css.includes(`body.lv-pro [data-ctl="${c}"]`), c);
  assert.ok(css.endsWith('{ display: none !important; }'));
});

test('the level and the guide are kept settings: new people simple and guided, settings from before advanced', () => {
  assert.equal(DEFAULTS.level, 'simple');
  assert.equal(DEFAULTS.guided, false);
  assert.deepEqual(settingsOf(null), DEFAULTS, 'a new phone: simple, the guide to come');
  const old = settingsOf({ at: 5, count: 4, styles: ['trap'] });
  assert.equal(old.level, 'pro');
  assert.equal(old.guided, true);
  const mine = settingsOf(decode(encode({ settings: keptSettings({ ...DEFAULTS, level: 'pro', guided: true }, 9) })).settings);
  assert.equal(mine.level, 'pro');
  assert.equal(mine.guided, true);
  const back = settingsOf(decode(encode({ settings: keptSettings({ ...DEFAULTS, level: 'simple' }, 9) })).settings);
  assert.equal(back.level, 'simple');
  assert.equal(back.guided, false);
  assert.equal(settingsOf({ level: 'expert', count: 3 }).level, 'pro', 'a wrong level: as before it existed');
  assert.equal(settingsOf({ level: 'simple', guided: 'yes' }).guided, false);
});

test('the guided first song: mood, sounds, made, a tweak; skipped or done from anywhere; played again from the start', () => {
  assert.deepEqual(GUIDE_MOODS.map(m => m.id), ['chill', 'hype', 'groove', 'classic']);
  for (const m of GUIDE_MOODS) assert.ok(m.icon && m.zh[0] && m.zh[1] && m.en[0] && m.en[1], m.id);
  let g = { ...GUIDE_START };
  assert.equal(guideNext(g, { type: 'mood', mood: 'polka' }), g, 'not a mood: stays');
  assert.equal(guideNext(g, { type: 'demo' }), g, 'sounds before a mood: stays');
  g = guideNext(g, { type: 'mood', mood: 'hype' });
  assert.deepEqual(g, { step: 'sound', mood: 'hype', sound: null });
  assert.deepEqual(guideNext(g, { type: 'back' }).step, 'mood');
  // The demo: straight to making.
  const demo = guideNext(g, { type: 'demo' });
  assert.deepEqual(demo, { step: 'making', mood: 'hype', sound: 'demo' });
  assert.equal(guideNext(demo, { type: 'made' }).step, 'tweak');
  assert.deepEqual(guideNext(g, { type: 'current' }), { step: 'making', mood: 'hype', sound: 'current' });
  assert.equal(guideNext(demo, { type: 'failed' }).step, 'sound');
  // Your own: waits for the pieces, then making.
  const mine = guideNext(g, { type: 'mine' });
  assert.equal(mine.step, 'mine');
  assert.equal(guideNext(mine, { type: 'made' }), mine, 'nothing made before the pieces');
  assert.equal(guideNext(mine, { type: 'back' }).step, 'sound');
  assert.equal(guideNext(mine, { type: 'failed' }).step, 'sound');
  const kit = guideNext(mine, { type: 'kit' });
  assert.equal(kit.step, 'making');
  assert.equal(guideNext(g, { type: 'kit' }), g, 'pieces loaded outside the wait: no jump');
  for (const s of [GUIDE_START, g, mine, kit, guideNext(kit, { type: 'made' })]) {
    assert.equal(guideNext(s, { type: 'skip' }).step, null);
    assert.equal(guideNext(s, { type: 'done' }).step, null);
  }
  assert.deepEqual(guideNext({ step: null, mood: 'hype' }, { type: 'replay' }), GUIDE_START);
  assert.deepEqual(['mood', 'sound', 'mine', 'making', 'tweak', null].map(guideStepNo), [1, 2, 2, 3, 4, 0]);
  assert.ok(shouldGuide({}));
  for (const has of [{ guided: true }, { pieces: 3 }, { songs: 1 }, { kept: 2 }]) assert.ok(!shouldGuide(has), JSON.stringify(has));
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

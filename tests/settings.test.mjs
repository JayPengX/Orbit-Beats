import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTING_KEYS, DEFAULTS, settingsOf, keptSettings, merge, decode, encode, liked } from '../public/lib/kits.mjs';
import { MIX, mixOf } from '../public/lib/mix.mjs';
import { STYLES } from '../public/engine.mjs';

test('settings kept now include mood, smart, the studio tempo and the mixer, and come back as set', () => {
  for (const k of ['mood', 'smart', 'studioBpm', 'mix']) assert.ok(SETTING_KEYS.includes(k), k);
  assert.deepEqual(Object.keys(DEFAULTS).sort(), [...SETTING_KEYS].sort(), 'a default for every kept setting');
  assert.deepEqual(DEFAULTS.mix, MIX);
  const mine = { ...DEFAULTS, mood: 'dark', smart: false, studioBpm: 92.5, mix: { ...MIX, on: false, keys: -4, fade: true }, styles: ['trap', 'house'], count: 3 };
  const kept = keptSettings(mine, 77);
  assert.equal(kept.at, 77);
  const back = settingsOf(decode(encode({ settings: kept })).settings);
  assert.equal(back.mood, 'dark');
  assert.equal(back.smart, false);
  assert.equal(back.studioBpm, 92.5);
  assert.deepEqual(back.mix, mixOf({ on: false, keys: -4, fade: true }));
  assert.deepEqual(back.styles, ['trap', 'house']);
  assert.equal(back.count, 3);
  assert.ok(!('at' in back), 'only settings, not when');
  // Through a merge with another phone's older settings: ours.
  assert.equal(settingsOf(merge({ settings: kept, kits: {} }, { settings: { at: 5, mood: 'bright' }, kits: {} }).settings).mood, 'dark');
});

test('settingsOf: a wrong kind or out of range is left as it was; the mixer clamped; the base never changed', () => {
  const base = settingsOf(null);
  assert.deepEqual(base, DEFAULTS);
  assert.notEqual(base.styles, DEFAULTS.styles);
  assert.notEqual(base.mix, DEFAULTS.mix);
  base.mix.keys = 5; base.styles.push('x');
  assert.equal(DEFAULTS.mix.keys, MIX.keys, 'the defaults untouched');
  assert.equal(DEFAULTS.styles.length, STYLES.length);
  const odd = settingsOf({ mood: 7, smart: 'yes', studioBpm: 500, mix: { drums: 99, on: 'no', reverb: -2 }, count: 0, humanize: 300, seed: 'abc', bits: 24, minGap: 10, silenceDb: 0, styles: ['polka'], minBars: 9.5 });
  assert.deepEqual({ ...odd, mix: undefined }, { ...DEFAULTS, mix: undefined }, 'settings from before 簡單 / 進階: simple, the guide to come');
  assert.deepEqual(odd.mix, { ...MIX, drums: 6, reverb: 0 });
  assert.equal(settingsOf({ mood: 'x'.repeat(30) }).mood, 'all');
  assert.equal(settingsOf({ studioBpm: 60 }).studioBpm, 60);
  assert.equal(settingsOf({ studioBpm: 59.9 }).studioBpm, 120);
  assert.equal(settingsOf({ studioBpm: NaN }).studioBpm, 120);
  assert.deepEqual(settingsOf({ mix: null }).mix, MIX);
  assert.deepEqual(settingsOf({ mix: 'loud' }).mix, MIX);
  assert.deepEqual(settingsOf({ styles: ['dnb', 'polka', 'four'] }).styles, ['four', 'dnb'], 'the known ones, in the app\'s order');
  // A shortest longer than a longest: both as they open.
  const flip = settingsOf({ minBars: 40, maxBars: 20 });
  assert.deepEqual([flip.minBars, flip.maxBars], [DEFAULTS.minBars, DEFAULTS.maxBars]);
  // Another base: kept settings over it.
  const other = settingsOf({ count: 4 }, { ...DEFAULTS, count: 12, mix: { ...MIX, delay: 0.9 } });
  assert.equal(other.count, 4);
  assert.equal(other.mix.delay, 0.9);
  for (const junk of [undefined, 'x', 5, [], true]) assert.deepEqual(settingsOf(junk), DEFAULTS);
});

test('keptSettings: only the known keys, an unset number not kept; taste counts', () => {
  const k = keptSettings({ ...DEFAULTS, studioBpm: NaN, junk: 1 }, 1);
  assert.ok(!('studioBpm' in k) && !('junk' in k));
  assert.deepEqual(Object.keys(k).sort(), ['at', ...SETTING_KEYS.filter(x => x !== 'studioBpm')].sort());
  assert.deepEqual(liked({}, 'trap'), { trap: 1 });
  assert.deepEqual(liked({ trap: 1 }, 'trap', -1), {});
  assert.deepEqual(liked({ trap: 0 }, 'trap', -1), {});
});

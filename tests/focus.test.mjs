// 專注配樂 (public/lib/focus.mjs): Orbit Class's 專注飛行 plays the radio's calm grooves, one after another.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FOCUS_STYLES, FOCUS_NAMES, focusSpec, focusMusic } from '../public/lib/focus.mjs';
import { MOODS } from '../public/lib/radio.mjs';

test('focus: every groove is one of its mood’s, named, in turn', () => {
  for (let i = 0; i < 12; i++) {
    const s = focusSpec(7, i);
    assert.equal(s.style, FOCUS_STYLES[i % FOCUS_STYLES.length]);
    assert.ok(MOODS[s.mood].styles.includes(s.style), `${s.mood} has ${s.style}`);
    assert.ok(FOCUS_NAMES[s.style]);
  }
  assert.equal(focusSpec(1, 0).style, 'lofi', 'the quietest first');
});

test('focus: stopped before it starts, nothing is made and it says off', () => {
  const said = [];
  const m = focusMusic({ onState: s => said.push(s) });
  m.stop();
  assert.deepEqual(said, ['off']);
  assert.equal(m.on, false);
});

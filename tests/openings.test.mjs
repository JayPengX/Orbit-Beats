// V19 (Jay 2026-10-30: "every song a rising sound, then a random string of notes, then drums; super high pitch"):
// each kind of music opens its own way, no part over C6, the riser into a hook only where a club record has one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES } from '../public/engine.mjs';
import { radioSpec, radioKit, SOUND } from '../public/lib/radio.mjs';

const SR = 8000;
test('songs open their groove’s way, not all on the pad and the arpeggio', () => {
  const opens = {};
  for (const [i, style] of STYLES.entries()) for (const k of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const sp = radioSpec(7 + i * 131 + k * 9973, 'all', style);
    (opens[style] ||= new Set()).add(sp.open);
  }
  const all = Object.values(opens).flatMap(s => [...s]);
  for (const way of ['beat', 'hats', 'band', 'keys', 'arp']) assert.ok(all.includes(way), way);
  for (const s of ['hiphop', 'house', 'trap', 'afro']) assert.ok(!opens[s].has('arp'), `${s} never opens on the arpeggio`);
  for (const s of ['rock', 'punk']) assert.ok(opens[s].has('band'), `${s} opens with the band`);
});

test('no tune, chord or arpeggio over C6; the riser and the drums in the intro where the groove has them', () => {
  for (const [i, style] of STYLES.entries()) {
    const sp = radioSpec(31 + i * 97, 'all', style);
    const { pieces, parts } = radioKit(sp, SR, { song: true, lift: true });
    // (Each piece's notes ride along as `tune`, for the game: [{ inst, notes: [[beat, midi, beats]] }].)
    let seen = 0;
    for (const t of pieces.flatMap(p => p.tune || [])) if (!/bass|808|tri|reese|acid|slap|upright/.test(t.inst)) for (const [, m] of t.notes) seen++, assert.ok(m <= 84, `${style} ${t.inst} ${m}`);
    assert.ok(seen > 100, `${style}: ${seen} notes looked at`);
    assert.equal(parts.introDrums ?? null, sp.open === 'beat' || sp.open === 'band' ? 'full' : sp.open === 'hats' ? 'hats' : null, style);
    if (['jazz', 'rock', 'bossa', 'country', 'blues'].includes(style)) assert.equal(parts.swell, undefined, `${style}: no riser`);
  }
});

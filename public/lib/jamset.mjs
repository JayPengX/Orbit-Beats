// 即興's built-in set: the radio's band (lib/radio.mjs radioKit: a key, four
// chords, chords, melodies, an arpeggio, two bass lines, hats and drums, all
// on the app's own instruments) as sixteen pads, so the tab plays the moment
// it opens, with nothing recorded. A set is { seed, style }: the groove, its
// tempo, the key, the chords and the instruments all follow from it, so a
// take's song is made again from those two numbers (lib/make.mjs).
// The four-bar parts are all on the same four chords, so any of them sound
// right together; one of a group plays at a time (the chord parts, the bass
// lines, the closed hats). No DOM, no sound: the tests run it.

import { STYLES, STYLE_ORDER, makeRng } from '../engine.mjs';
import { radioSpec } from './radio.mjs';
import { INSTRUMENT_NAMES, DRUM_NAMES } from './synth.mjs';

// The grooves offered as chips, every one, the most played first (the dice picks from every one).
export const SET_STYLES = STYLE_ORDER;
// The band's pieces, as radioKit lays them out (tests/jamset.test.mjs checks it).
export const BAND_ROLES = ['riff', 'riff', 'riff', 'riff', 'phrase', 'phrase', 'bass', 'bass', 'hat', 'hat', 'hat', 'kick', 'kick', 'sub', 'snare', 'tick', 'roll', 'fill'];

// (A drum's name as the 樂器 tab says it; the snare and clap together: the snare.)
const drum = d => (d === 'both' ? DRUM_NAMES.snare : DRUM_NAMES[d] || [d, d]);
// The pads, four rows of four: drums, more drums, the beat's loops, the music.
// fam: the pad's colour; group: one of it plays at a time; inst: the spec's instrument named under it.
const LAYOUT = [
  { i: 11, fam: 'drum', name: () => ['大鼓', 'Kick'] },
  { i: 14, fam: 'drum', name: sp => drum(sp.snare) },
  { i: 15, fam: 'drum', name: sp => drum(sp.tick) },
  { i: 13, fam: 'drum', name: sp => (sp.kit && sp.kit.sub.join() !== 'sub' ? ['強音', 'Accent'] : ['808', '808']) },
  { i: 12, fam: 'drum', name: () => ['重拍', 'Boom'] },
  { i: 16, fam: 'drum', name: () => ['滾奏', 'Roll'] },
  { i: 17, fam: 'drum', name: () => ['過門', 'Fill'] },
  { i: 10, fam: 'hat', loop: 4, name: () => ['開鈸', 'Open hat'] },
  { i: 8, fam: 'hat', loop: 4, group: 'hat', name: () => ['慢鈸', 'Slow hats'] },
  { i: 9, fam: 'hat', loop: 4, group: 'hat', name: () => ['快鈸', 'Fast hats'] },
  { i: 6, fam: 'bass', loop: 16, group: 'bass', name: () => ['貝斯 1', 'Bass 1'], inst: 'bass' },
  { i: 7, fam: 'bass', loop: 16, group: 'bass', name: () => ['貝斯 2', 'Bass 2'], inst: 'bass' },
  { i: 0, fam: 'chords', loop: 16, group: 'music', name: () => ['和弦 1', 'Chords 1'], inst: 'chords' },
  { i: 1, fam: 'chords', loop: 16, group: 'music', name: () => ['和弦 2', 'Chords 2'], inst: 'chords2' },
  { i: 2, fam: 'melody', loop: 16, group: 'music', name: () => ['旋律 1', 'Melody 1'], inst: 'lead' },
  { i: 3, fam: 'melody', loop: 16, group: 'music', name: () => ['旋律 2', 'Melody 2'], inst: 'lead' }
];

// A set's whole spec (radioSpec's: tempo, key, chords, instruments).
export const specOf = set => radioSpec(set.seed, 'all', STYLES.includes(set.style) ? set.style : SET_STYLES[0]);
// The set kept on the phone, made whole (a wrong one: the first groove's).
export function setOf(x) {
  const seed = Number.isInteger(x?.seed) && x.seed >= 0 && x.seed <= 4294967295 ? x.seed : 1;
  return { seed, style: STYLES.includes(x?.style) ? x.style : SET_STYLES[0] };
}
// The dice: a fresh set on a groove other than this one's.
export function diceSet(from, seed = Math.floor(Math.random() * 1e9)) {
  const R = makeRng(seed);
  return { seed, style: R.choice(STYLES.filter(s => s !== from?.style)) };
}
// The instrument under a pad's name (not when the name says it: 貝斯 1 on the bass).
function subOf(p, sp) {
  const n = p.inst && INSTRUMENT_NAMES[sp[p.inst]];
  return n && !p.name(sp)[0].startsWith(n[0]) ? n : null;
}
// The pads of a set: [{ i, role, loop, beats, fam, name: [zh, en], sub: [zh, en] | null, group, phase }].
// A loop of the set keeps step with the song's four-bar cycle (phase): joined on
// a later bar it plays from that bar of itself, so it's on the same chord as the rest.
export function bandPads(sp) {
  return LAYOUT.map(p => ({
    i: p.i,
    role: BAND_ROLES[p.i],
    loop: Boolean(p.loop),
    beats: p.loop || 4,
    fam: p.fam,
    name: p.name(sp),
    sub: subOf(p, sp),
    group: p.group || null,
    phase: Boolean(p.loop)
  }));
}
// The colour of a kit's pad, by its role.
export const FAMILY = { riff: 'chords', phrase: 'melody', bass: 'bass', hat: 'hat', fill: 'drum', kick: 'drum', sub: 'drum', snare: 'drum', roll: 'drum', tick: 'drum' };

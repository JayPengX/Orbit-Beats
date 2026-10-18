// What a song's made into, from the kit in hand: its WAV, its stems in a
// zip, its MIDI, a jam's take. The page runs this in a worker
// (lib/maker.worker.mjs) so a batch never freezes the screen, or here on
// the page where workers can't load modules; the tests call it directly.
// No DOM.

import { makeSong, renderEvents, encodeWav, zipParts, loopBeats } from '../engine.mjs';
import { midiFile, songTracks } from './midi.mjs';
import { radioSong, cutOf, segment, holdOf, radioKit, RADIO_SR } from './radio.mjs';
import { specOf, setOf } from './jamset.mjs';
import { fromOffsets } from './jam.mjs';

let kit = null;

// The kit: its pieces, their rate, the analysis, and the tempo and roles in use.
export function setKit({ pieces, sr, heard, bpm, roles }) {
  kit = { pieces, sr, roles, bpm, analysis: { ...heard, bpm, loops: heard.analyses.map(a => loopBeats(a, bpm)) } };
  return true;
}
const need = () => {
  if (!kit) throw new Error('No kit');
  return kit;
};

// A recipe's song: { seed, detail, style, plan, minBars, maxBars, styles,
// humanize (%), weights, mix } (or a jam's: { jam: [{ i, beat }], plan, mix }).
function render(recipe, stems = false) {
  if (recipe.band) return bandTake(recipe, stems);
  const k = need();
  if (recipe.jam) return renderEvents(k.pieces, k.sr, k.bpm, k.roles, recipe.jam, { mix: recipe.mix, stems, plan: recipe.plan || null });
  return makeSong(k.pieces, k.sr, recipe.seed, {
    analysis: k.analysis,
    roles: k.roles,
    minBars: recipe.minBars,
    maxBars: recipe.maxBars,
    styles: recipe.styles,
    humanize: (Number.isFinite(recipe.humanize) ? recipe.humanize : 100) / 100,   // (a recipe without it: as the page opens, not NaN, a silent song)
    detail: recipe.detail ?? null,
    style: recipe.style ?? null,
    weights: recipe.weights ?? null,
    plan: recipe.plan ?? null,
    mix: recipe.mix ?? null,
    stems
  });
}

// -> { info, wav: Uint8Array }
export function song(recipe, bits = 16) {
  const { audio, info } = render(recipe);
  return { info, wav: encodeWav(audio, bits) };
}
// Each bus a WAV, in a zip: "<name> - Drums.wav", …  -> Uint8Array
export function stems(recipe, bits = 16, { title = 'Orbit Beats', names = {} } = {}) {
  const { stems: parts } = render(recipe, true);
  const files = Object.entries(parts || {}).map(([bus, a]) => ({ name: `${title} - ${names[bus] || bus}.wav`, data: encodeWav(a, bits) }));
  const all = zipParts(files);
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
// The song's hits as a MIDI file, a track a bus. -> Uint8Array
export function midi(recipe, { names = {} } = {}) {
  const k = need();
  const { events } = render(recipe);
  return midiFile({ bpm: k.bpm, tracks: songTracks(events, k.roles, k.pieces, k.sr, k.bpm, names) });
}

// ---- 聽, the radio (lib/radio.mjs): no kit needed ----

// Each stretch's ring after its cut, kept for the song that follows it (the newest few).
const tails = new Map();
export const radioId = ({ seed, mood, style }) => `radio:${seed}:${mood}:${style}`;
// The radio's next stretch: the song of `spec`, its start under the ring of
// the song `after` (when there's one). -> { id, info, wav, seconds, hold }
export function radio(spec, after = null) {
  const { audio, info } = radioSong(spec);
  const seg = segment(audio, cutOf(info, audio.sr), tails.get(after) || null);
  const id = radioId(info.radio);
  tails.set(id, seg.tail);
  while (tails.size > 6) tails.delete(tails.keys().next().value);
  return { id, info, wav: encodeWav({ sr: audio.sr, L: seg.L, R: seg.R }, 16), seconds: seg.L.length / audio.sr, hold: holdOf(info) };
}
// A radio song whole, to keep (歌單) or to list (簡單's 隨機做一批). -> { info, wav }
export function radioWav(spec) {
  const { audio, info } = radioSong(spec);
  return { info, wav: encodeWav(audio, 16) };
}

// ---- 即興's built-in set (lib/jamset.mjs): the radio's band as pads ----

let band = null; // the last set made: { id, sp, pieces, roles }
// A set's pieces and roles (made once; the take's song uses the same).
// -> { sp, pieces: [{ L, R }], roles, sr }
export function jamBand(set) {
  const s = setOf(set);
  const id = `${s.seed}:${s.style}`;
  if (band?.id !== id) {
    const sp = specOf(s);
    band = { id, sp, ...radioKit(sp, RADIO_SR) };
  }
  return { sp: band.sp, pieces: band.pieces, roles: band.roles, sr: RADIO_SR };
}
// A take played on the built-in set: { band: { seed, style }, jam: hits, mix }.
function bandTake(recipe, stems) {
  const { sp, pieces, roles, sr } = jamBand(recipe.band);
  const k = fromOffsets(pieces, roles, recipe.jam, sp.bpm, sr);
  const out = renderEvents(k.pieces, sr, sp.bpm, k.roles, k.hits, { mix: recipe.mix, stems, plan: recipe.plan || null });
  return { ...out, info: { ...out.info, key: sp.key, style: sp.style } };
}

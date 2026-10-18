// What a song's made into, from the kit in hand: its WAV, its stems in a
// zip, its MIDI, a jam's take. The page runs this in a worker
// (lib/maker.worker.mjs) so a batch never freezes the screen, or here on
// the page where workers can't load modules; the tests call it directly.
// No DOM.

import { makeSong, renderEvents, encodeWav, zipParts, loopBeats } from '../engine.mjs';
import { midiFile, songTracks } from './midi.mjs';

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
  const k = need();
  if (recipe.jam) return renderEvents(k.pieces, k.sr, k.bpm, k.roles, recipe.jam, { mix: recipe.mix, stems, plan: recipe.plan || null });
  return makeSong(k.pieces, k.sr, recipe.seed, {
    analysis: k.analysis,
    roles: k.roles,
    minBars: recipe.minBars,
    maxBars: recipe.maxBars,
    styles: recipe.styles,
    humanize: recipe.humanize / 100,
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

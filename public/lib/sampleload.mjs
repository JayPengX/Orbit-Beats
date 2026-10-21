// The page's side of the recorded instruments (lib/samples.mjs): each
// instrument's notes fetched (kept by sw.js, so offline after the first
// time) and decoded once at 32 kHz, mono; then handed to each worker that
// makes a song with it, once. A note that can't be fetched or read leaves
// the instrument on its made voice.
import { SAMPLED, sampleNotes, sampleUrl, specInsts, useBanks, DRUM_KITS, drumUrl, kitBanks } from './samples.mjs';
import { radioSpec, REMIX_KEYS, bedFor } from './radio.mjs';
import { specOf, setOf } from './jamset.mjs';

const RATE = 32000;
const BASE = new URL('../', import.meta.url).href;
const loading = new Map(); // inst -> Promise<bank | null>
const MAX_SECONDS = 3.2;

// (One decoder for every note, not one made per note; and the notes decoded a few at a time, a pause
// between each: a song's instruments are a hundred notes and more, and all at once they held the page's
// thread for seconds, the home screen unable to scroll while a song was got ready behind it.)
let ctx = null;
const ready = [];
let reading = 0;
const READ_AT_ONCE = 2;
const pause = () => new Promise(ok => setTimeout(ok, 0));
// (And none while a finger is on the screen or the page is scrolling: the next note waits for a quiet moment.)
let touched = 0;
const QUIET_MS = 400;
if (globalThis.document?.addEventListener) for (const type of ['touchstart', 'touchmove', 'scroll', 'wheel', 'pointerdown']) document.addEventListener(type, () => (touched = performance.now()), { capture: true, passive: true });
const quiet = () => {
  const left = touched + QUIET_MS - performance.now();
  return left > 0 ? new Promise(ok => setTimeout(ok, left)).then(quiet) : Promise.resolve();
};
function turn() {
  if (reading >= READ_AT_ONCE) return new Promise(ok => ready.push(ok)).then(quiet);
  reading++;
  return quiet();
}
function done() {
  const next = ready.shift();
  if (next) next();
  else reading--;
}
async function decode(buf) {
  const C = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!C) throw new Error('no decoder');
  ctx ||= new C(1, 1, RATE);
  const a = await new Promise((ok, no) => {
    const p = ctx.decodeAudioData(buf, ok, no);
    p?.then?.(ok, no);
  });
  await pause();
  const L = a.getChannelData(0);
  // (Both sides averaged when it came in stereo; kept no longer than the notes need, and as 16-bit
  // samples: half the memory of floats, on the page and in every worker it's handed to, which on a
  // phone is what keeps the app from being closed in the background.)
  const n = Math.min(L.length, Math.round(MAX_SECONDS * a.sampleRate));
  const x = new Int16Array(n);
  const R = a.numberOfChannels > 1 ? a.getChannelData(1) : L;
  for (let i = 0; i < n; i++) x[i] = Math.max(-32768, Math.min(32767, Math.round(16384 * (L[i] + R[i]))));
  return { x, sr: a.sampleRate };
}
// (Fetched all at once, as before: only the decoding waits its turn.)
const fetchDecode = url =>
  fetch(url)
    .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then(buf => turn().then(() => decode(buf).finally(() => pause().then(done))));
// One drum of a kit ('drum:<kit>:<drum>'): its takes. -> { inst, sr, takes: [[x, x], …] } | null
function loadDrum(name) {
  const [, kit, drum] = name.split(':');
  const layers = DRUM_KITS[kit]?.[drum];
  if (!layers) return Promise.resolve(null);
  const files = [...new Set(layers.flat())];
  return Promise.all(files.map(f => fetchDecode(drumUrl(BASE, kit, f)))).then(got => {
    const by = Object.fromEntries(files.map((f, k) => [f, got[k]]));
    const bank = { inst: name, sr: got[0].sr, takes: layers.map(pair => pair.map(f => by[f].x)) };
    useBanks({ [name]: bank });
    return bank;
  });
}
// One instrument's notes. -> { inst, sr, notes: [{ midi, x }] } | null
export function loadBank(inst) {
  if (inst.startsWith('drum:')) {
    if (!loading.has(inst)) loading.set(inst, loadDrum(inst).catch(() => (loading.delete(inst), null)));
    return loading.get(inst);
  }
  if (!SAMPLED[inst]) return Promise.resolve(null);
  if (!loading.has(inst))
    loading.set(
      inst,
      Promise.all(
        sampleNotes(inst).map(m => fetchDecode(sampleUrl(BASE, inst, m)).then(d => ({ midi: m, ...d })))
      ).then(
        notes => {
          const bank = { inst, sr: notes[0].sr, notes: notes.map(({ midi, x }) => ({ midi, x })) };
          useBanks({ [inst]: bank });
          return bank;
        },
        () => (loading.delete(inst), null)
      )
    );
  return loading.get(inst);
}
// The instruments a call to the maker will play: a radio song's spec, a jam set, a recipe of either.
// (A song's opening, lib/radio.mjs radioIntro: only the few it plays, its arpeggio, chords, bed and hats,
// so it's made in a moment even on the app's first song, while the rest are still being read.)
const OPENING_DRUMS = /:(hat|open|shaker|tamb)$/;
function radioInsts(spec, opening = false) {
  if (!spec || !Number.isFinite(spec.seed)) return [];
  const sp = radioSpec(spec.seed, spec.mood || 'all', spec.style || null);
  for (const k of REMIX_KEYS) if (spec[k] != null) sp[k] = spec[k];
  if (opening) return [...new Set([sp.lead2, sp.chords2, sp.bed || bedFor(sp.style)])].filter(i => i && SAMPLED[i]).concat(kitBanks(sp.style).filter(d => OPENING_DRUMS.test(d)));
  return [...specInsts(sp), ...kitBanks(sp.style)];
}
const setInsts = set => {
  const sp = specOf(setOf(set));
  return [...specInsts(sp), ...kitBanks(sp.style)];
};
export function instsOf(fn, args) {
  try {
    if (fn === 'radioStart') return radioInsts(args[0], true);
    if (fn === 'radio' || fn === 'radioWav' || fn === 'game') return radioInsts(args[0]);
    if (fn === 'jamBand') return setInsts(args[0]);
    if (fn === 'song' || fn === 'stems' || fn === 'clip' || fn === 'midi') {
      const r = args[0];
      if (r?.print === 'radio' && r.radio) return radioInsts(r.radio);
      if (r?.band) return setInsts(r.band);
    }
  } catch {}
  return [];
}
// For lib/maker.mjs: the banks a call needs that this worker hasn't had yet. -> { inst: bank } | null
export async function banksFor(fn, args, sent) {
  const want = instsOf(fn, args).filter(i => !sent.has(i));
  if (!want.length) return null;
  const got = await Promise.all(want.map(loadBank));
  const out = {};
  got.forEach((b, k) => {
    if (b) (out[want[k]] = b), sent.add(want[k]);
  });
  return Object.keys(out).length ? out : null;
}

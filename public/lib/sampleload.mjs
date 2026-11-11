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
// (Fetched a few at a time, in the order asked, an opening's notes first.
// All at once, a song's hundred notes shared the phone's link with
// everything else: on a slow connection the app's own files and a tab's
// pictures waited a minute behind the songs made ahead (3G, 2026-11-05), and
// a song tapped had its opening's notes in with all of them.)
const FETCH_AT_ONCE = 6;
let fetching = 0;
const queued = []; // { url, go, first }: the openings' first, each in the order asked
const firstEnd = () => {
  let i = 0;
  while (i < queued.length && queued[i].first) i++;
  return i;
};
const slot = (url, first) => {
  if (fetching < FETCH_AT_ONCE) return (fetching++, Promise.resolve());
  return new Promise(go => {
    const e = { url, go, first };
    if (first) queued.splice(firstEnd(), 0, e);
    else queued.push(e);
  });
};
const free = () => {
  const next = queued.shift();
  if (next) next.go();
  else fetching--;
};
// An instrument an opening wants, already asked for by a song made ahead: its notes still waiting go first.
function hurry(urls) {
  const want = new Set(urls);
  const moved = queued.filter(e => !e.first && want.has(e.url));
  if (!moved.length) return;
  for (const e of moved) queued.splice(queued.indexOf(e), 1);
  queued.splice(firstEnd(), 0, ...moved.map(e => ((e.first = true), e)));
}
// (The 測試工具's 樂器聲音載入, testing.mjs: 2 s a file, or none.)
const fetchFile = url => {
  const how = globalThis.ORBIT_TEST?.flags?.instruments;
  if (how === 'fail') return Promise.reject(new Error('test: instruments fail'));
  return how === 'slow' ? new Promise(ok => setTimeout(ok, 2000)).then(() => fetch(url)) : fetch(url);
};
const fetchDecode = (url, first = false) =>
  slot(url, first)
    .then(() => fetchFile(url).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))).finally(free))
    .then(buf => turn().then(() => decode(buf).finally(() => pause().then(done))));
const drumFiles = name => {
  const [, kit, drum] = name.split(':');
  const layers = DRUM_KITS[kit]?.[drum];
  return layers ? { kit, layers, files: [...new Set(layers.flat())] } : null;
};
// Every file an instrument (or a drum) is read from.
function urlsOf(inst) {
  if (inst.startsWith('drum:')) {
    const d = drumFiles(inst);
    return d ? d.files.map(f => drumUrl(BASE, d.kit, f)) : [];
  }
  return SAMPLED[inst] ? sampleNotes(inst).map(m => sampleUrl(BASE, inst, m)) : [];
}
// One drum of a kit ('drum:<kit>:<drum>'): its takes. -> { inst, sr, takes: [[x, x], …] } | null
function loadDrum(name, first) {
  const d = drumFiles(name);
  if (!d) return Promise.resolve(null);
  const { kit, layers, files } = d;
  return Promise.all(files.map(f => fetchDecode(drumUrl(BASE, kit, f), first))).then(got => {
    const by = Object.fromEntries(files.map((f, k) => [f, got[k]]));
    const bank = { inst: name, sr: got[0].sr, takes: layers.map(pair => pair.map(f => by[f].x)) };
    useBanks({ [name]: bank });
    return bank;
  });
}
// One instrument's notes. -> { inst, sr, notes: [{ midi, x }] } | null
// `first`: for an opening (someone is waiting on it): its notes ahead of a song's made ahead.
export function loadBank(inst, first = false) {
  if (first && loading.has(inst)) hurry(urlsOf(inst));
  if (inst.startsWith('drum:')) {
    if (!loading.has(inst)) loading.set(inst, loadDrum(inst, first).catch(() => (loading.delete(inst), null)));
    return loading.get(inst);
  }
  if (!SAMPLED[inst]) return Promise.resolve(null);
  if (!loading.has(inst))
    loading.set(
      inst,
      Promise.all(
        sampleNotes(inst).map(m => fetchDecode(sampleUrl(BASE, inst, m), first).then(d => ({ midi: m, ...d })))
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
  const got = await Promise.all(want.map(i => loadBank(i, fn === 'radioStart')));
  const out = {};
  got.forEach((b, k) => {
    if (b) (out[want[k]] = b), sent.add(want[k]);
  });
  return Object.keys(out).length ? out : null;
}

// The page's side of the recorded instruments (lib/samples.mjs): each
// instrument's notes fetched (kept by sw.js, so offline after the first
// time) and decoded once at 32 kHz, mono; then handed to each worker that
// makes a song with it, once. A note that can't be fetched or read leaves
// the instrument on its made voice.
import { SAMPLED, sampleNotes, sampleUrl, specInsts, useBanks } from './samples.mjs';
import { radioSpec, REMIX_KEYS } from './radio.mjs';
import { specOf, setOf } from './jamset.mjs';

const RATE = 32000;
const BASE = new URL('../', import.meta.url).href;
const loading = new Map(); // inst -> Promise<bank | null>
const MAX_SECONDS = 3.2;

async function decode(buf) {
  const C = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!C) throw new Error('no decoder');
  const ctx = new C(1, 1, RATE);
  const a = await new Promise((ok, no) => {
    const p = ctx.decodeAudioData(buf, ok, no);
    p?.then?.(ok, no);
  });
  const L = a.getChannelData(0);
  // (Both sides averaged when it came in stereo; kept no longer than the notes need.)
  const n = Math.min(L.length, Math.round(MAX_SECONDS * a.sampleRate));
  const x = new Float32Array(n);
  if (a.numberOfChannels > 1) {
    const R = a.getChannelData(1);
    for (let i = 0; i < n; i++) x[i] = 0.5 * (L[i] + R[i]);
  } else x.set(L.subarray(0, n));
  return { x, sr: a.sampleRate };
}
// One instrument's notes. -> { inst, sr, notes: [{ midi, x }] } | null
export function loadBank(inst) {
  if (!SAMPLED[inst]) return Promise.resolve(null);
  if (!loading.has(inst))
    loading.set(
      inst,
      Promise.all(
        sampleNotes(inst).map(m =>
          fetch(sampleUrl(BASE, inst, m))
            .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
            .then(decode)
            .then(d => ({ midi: m, ...d }))
        )
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
function radioInsts(spec) {
  if (!spec || !Number.isFinite(spec.seed)) return [];
  const sp = radioSpec(spec.seed, spec.mood || 'all', spec.style || null);
  for (const k of REMIX_KEYS) if (spec[k] != null) sp[k] = spec[k];
  return specInsts(sp);
}
export function instsOf(fn, args) {
  try {
    if (fn === 'radio' || fn === 'radioWav' || fn === 'game') return radioInsts(args[0]);
    if (fn === 'jamBand') return specInsts(specOf(setOf(args[0])));
    if (fn === 'song' || fn === 'stems' || fn === 'clip' || fn === 'midi') {
      const r = args[0];
      if (r?.print === 'radio' && r.radio) return radioInsts(r.radio);
      if (r?.band) return specInsts(specOf(setOf(r.band)));
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

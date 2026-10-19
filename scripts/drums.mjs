// Fetches the recorded drums (lib/samples.mjs DRUM_KITS) into
// public/samples/drums/<kit>/<take>.m4a: each hit cut to its ring, mono,
// 32 kHz, AAC (macOS: afconvert does the decoding and encoding). All CC0:
// Virtuosity Drums (sfzinstruments/virtuosity_drums), the TR-808 by Michael
// Fischer and Sonic Pi's electronic kit (Gradigang-Solutions/kringel-samples).
// `node scripts/drums.mjs`
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DRUM_KITS, DRUM_SECONDS } from '../public/lib/samples.mjs';
import { encodeWav } from '../public/engine.mjs';

const VD = 'https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/HEAD/Samples/';
const KR = 'https://raw.githubusercontent.com/Gradigang-Solutions/kringel-samples/HEAD/';
const DIR = { kick: 'kick', snare: 'snare', hh: 'hh', ride: 'ride', crash: 'crash', htom: 'htom' };
const PERC = {
  shaker1: 'shaker/LShaker_Shake1D_rr1', shaker2: 'shaker/LShaker_Shake1D_rr2', cowbell1: 'cowbell/Cowbell1_Normal_v1_rr1', cowbell2: 'cowbell/Cowbell1_Normal_v1_rr2',
  conga1: 'conga/Conga_17_HitHM1_1_70_rr1', conga2: 'conga/Conga_17_HitHM1_1_70_rr2', bongo1: 'bongoh/BongoH_Hit1_v1_rr1', bongo2: 'bongoh/BongoH_Hit1_v1_rr2',
  claves1: 'claves/Claves1_Hit_v1_rr1', claves2: 'claves/Claves1_Hit_v1_rr2', agogo1: 'agogo/Agogo_High_v1_rr1', agogo2: 'agogo/Agogo_High_v1_rr2',
  guiro1: 'guiro/Guiro_Fast_rr1', guiro2: 'guiro/Guiro_Fast_rr2', tamb1: 'tambourine/Tamb1_Shake_rr1', tamb2: 'tambourine/Tamb1_Shake_rr2'
};
const source = (kit, file) => {
  if (kit === 'acoustic' || kit === 'lofi') {
    const mic = kit === 'acoustic' ? 'mid' : 'lofi';
    return `${VD}${mic}/${DIR[file.split('_')[0]]}/${mic}_${file}.flac`;
  }
  if (kit === 'tr808') return `${KR}Fischer808/${file}.wav`;
  if (kit === 'electro') return `${KR}SonicPiElectro/${file}.flac`;
  return `${VD}perc/close/${PERC[file]}_Close.wav`;
};
const tmp = mkdtempSync(join(tmpdir(), 'beats-drums-'));
function readF32(file) {
  const b = readFileSync(file);
  let o = 12;
  while (o < b.length) {
    const id = b.toString('ascii', o, o + 4);
    const n = b.readUInt32LE(o + 4);
    if (id === 'data') return new Float32Array(b.buffer.slice(b.byteOffset + o + 8, b.byteOffset + o + 8 + n));
    o += 8 + n + (n % 2);
  }
  throw new Error(`no data in ${file}`);
}
let n = 0;
for (const [kit, drums] of Object.entries(DRUM_KITS)) {
  const out = new URL(`../public/samples/drums/${kit}/`, import.meta.url).pathname;
  mkdirSync(out, { recursive: true });
  for (const [drum, layers] of Object.entries(drums)) {
    for (const file of new Set(layers.flat())) {
      const dest = join(out, `${file}.m4a`);
      if (existsSync(dest)) continue;
      const url = source(kit, file);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${kit} ${file}: ${res.status} ${url}`);
      const raw = join(tmp, `raw-${kit}-${file}${url.slice(url.lastIndexOf('.'))}`);
      writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
      const f32 = join(tmp, `${kit}-${file}.wav`);
      execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEF32@32000', '-c', '1', raw, f32]);
      let x = readF32(f32);
      // (Its start: the first sample over -50 dB, less a millisecond; then its ring, eased out.)
      let s = 0;
      while (s < x.length && Math.abs(x[s]) < 0.003) s++;
      s = Math.max(0, s - 32);
      x = x.slice(s, s + Math.round((DRUM_SECONDS[drum] || 1) * 32000));
      const ease = Math.min(x.length, 960);
      for (let i = 0; i < ease; i++) x[x.length - 1 - i] *= i / ease;
      const wav = join(tmp, `${kit}-${file}-cut.wav`);
      writeFileSync(wav, encodeWav({ sr: 32000, L: x, R: x }, 16));
      execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '96000', '-c', '1', wav, dest]);
      n++;
    }
  }
  console.log(kit, 'done');
}
console.log(n, 'new files');

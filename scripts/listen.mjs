// Radio songs as WAVs to listen to, on the recorded instruments (macOS:
// afconvert decodes the samples): `node scripts/listen.mjs [count] [out dir] [--made]`.
// --style=rock,jazz: those grooves, one song each.
// --sf=MusyngKite: the instruments from another of gleitz/midi-js-soundfonts' sets (fetched, not kept), to compare.
// --made: on the made voices instead (the way the tests and a first offline
// play hear it), to set the two side by side.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SAMPLED, sampleNotes, specInsts, useBanks, DRUM_KITS, kitBanks, noteName } from '../public/lib/samples.mjs';
import { radioSong, radioSpec, radioPick } from '../public/lib/radio.mjs';
import { encodeWav } from '../public/engine.mjs';

const args = process.argv.slice(2);
const made = args.includes('--made');
const sf = (args.find(a => a.startsWith('--sf=')) || '').slice(5);
const styles = (args.find(a => a.startsWith('--style=')) || '').slice(8).split(',').filter(Boolean);
const [count = 4, out = join(tmpdir(), 'beats-listen')] = args.filter(a => !a.startsWith('--'));
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'beats-samples-'));
// A WAV's first channel as floats (afconvert writes 32-bit float WAV here).
function readF32(file) {
  const b = readFileSync(file);
  let o = 12;
  let sr = 32000;
  while (o < b.length) {
    const id = b.toString('ascii', o, o + 4);
    const n = b.readUInt32LE(o + 4);
    if (id === 'fmt ') sr = b.readUInt32LE(o + 12);
    if (id === 'data') return { sr, x: new Float32Array(b.buffer.slice(b.byteOffset + o + 8, b.byteOffset + o + 8 + n)) };
    o += 8 + n + (n % 2);
  }
  throw new Error(`no data in ${file}`);
}
function bank(inst) {
  const notes = sampleNotes(inst).map(m => {
    const f = join(tmp, `${inst}-${m}.wav`);
    let src = new URL(`../public/samples/${inst}/${m}.mp3`, import.meta.url).pathname;
    if (sf) {
      src = join(tmp, `${sf}-${inst}-${m}.mp3`);
      execFileSync('curl', ['-sf', '-o', src, `https://gleitz.github.io/midi-js-soundfonts/${sf}/${SAMPLED[inst][0]}-mp3/${noteName(m)}.mp3`]);
    }
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEF32@32000', '-c', '1', src, f]);
    const { x, sr } = readF32(f);
    return { midi: m, x: x.subarray(0, Math.round(3.2 * sr)), sr };
  });
  return { inst, sr: notes[0].sr, notes: notes.map(({ midi, x }) => ({ midi, x })) };
}
function drum(name) {
  const [, kit, d] = name.split(':');
  const layers = DRUM_KITS[kit][d];
  const read = f => {
    const out = join(tmp, `${kit}-${f}.wav`);
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEF32@32000', '-c', '1', new URL(`../public/samples/drums/${kit}/${f}.m4a`, import.meta.url).pathname, out]);
    return readF32(out).x;
  };
  return { inst: name, sr: 32000, takes: layers.map(pair => pair.map(read)) };
}
const recent = [];
for (let k = 0; k < (styles.length || +count); k++) {
  const spec = styles.length ? { seed: 1000 + k * 7919, mood: 'all', style: styles[k] } : radioPick('all', recent, 1000 + k * 7919);
  recent.push(spec);
  const sp = radioSpec(spec.seed, spec.mood, spec.style);
  const insts = specInsts(sp);
  if (!made) {
    for (const i of insts) useBanks({ [i]: bank(i) });
    for (const d of kitBanks(sp.style)) useBanks({ [d]: drum(d) });
  }
  const t = Date.now();
  const { audio, info } = radioSong(spec);
  const file = join(out, `${k + 1}-${info.style}-${made ? 'made' : sf || 'recorded'}.wav`);
  writeFileSync(file, encodeWav(audio, 16));
  console.log(`${file}  ${Math.round(info.seconds)} s, ${info.bpm} BPM, made in ${((Date.now() - t) / 1000).toFixed(1)} s; recorded: ${made ? 'none' : insts.join(' ')}; made: ${[sp.lead, sp.lead2, sp.chords, sp.bass].filter(i => made || !SAMPLED[i]).join(' ')}`);
}

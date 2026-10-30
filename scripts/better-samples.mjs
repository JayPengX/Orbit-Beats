// Better recordings for the two instruments heard most (2026-10-30), in place
// of the MusyngKite soundfont's (scripts/samples.mjs), on the same notes
// (lib/samples.mjs sampleNotes), in public/samples/v2/:
//   strings  a real string section: the violins, violas and celli of VSCO 2
//            Community Edition (Versilian Studios, CC0), each note the sections
//            that reach it played together, sustained with vibrato.
//   piano    the Salamander Grand Piano (Alexander Holm, CC BY 3.0), as Tone.js
//            serves it (every third note).
// Each recorded note is played a semitone or so up or down to the note wanted
// (no more: the nearest take), its silence before the sound cut, 3.4 s kept,
// mono MP3. `node scripts/better-samples.mjs [strings|piano ...]` (ffmpeg).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleNotes, sampleDir } from '../public/lib/samples.mjs';

const SR = 44100;
const KEEP = 3.4;
const tmp = mkdtempSync(join(tmpdir(), 'beats-better-'));
const PC = { C: 0, 'C#': 1, Cs: 1, Db: 1, D: 2, 'D#': 3, Ds: 3, Eb: 3, E: 4, F: 5, 'F#': 6, Fs: 6, Gb: 6, G: 7, 'G#': 8, Gs: 8, Ab: 8, A: 9, 'A#': 10, As: 10, Bb: 10, B: 11 };

// A file fetched once (kept in the temp folder), decoded to 44.1 kHz mono floats.
function get(url) {
  const f = join(tmp, Buffer.from(url).toString('base64url').slice(-80));
  if (!existsSync(f)) execFileSync('curl', ['-sfL', '--retry', '3', '-o', f, url]);
  const raw = `${f}.raw`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-ac', '1', '-ar', String(SR), '-f', 'f32le', raw]);
  const b = readFileSync(raw);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}
// From just before the sound starts (5% of its peak), `KEEP` seconds, played `semis` higher.
function take(x, semis) {
  let pk = 0;
  for (const v of x) pk = Math.max(pk, Math.abs(v));
  let on = x.findIndex(v => Math.abs(v) > pk * 0.05);
  on = Math.max(0, on - Math.round(0.004 * SR));
  const rate = 2 ** (semis / 12);
  const out = new Float32Array(Math.round(KEEP * SR));
  for (let i = 0; i < out.length; i++) {
    const p = on + i * rate;
    const j = Math.floor(p);
    const t = p - j;
    const a = x[j - 1] ?? x[j] ?? 0, b = x[j] ?? 0, c = x[j + 1] ?? b, d = x[j + 2] ?? c;
    out[i] = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  }
  return out;
}
const rms = x => Math.sqrt(x.reduce((e, v) => e + v * v, 0) / x.length);
// Layers at one level each (their middle second), summed, the whole at -3 dBFS peak; written as MP3.
function write(file, layers) {
  const out = new Float32Array(layers[0].length);
  for (const x of layers) {
    const g = 0.1 / Math.max(1e-6, rms(x.subarray(Math.round(0.5 * SR), Math.round(1.5 * SR))));
    for (let i = 0; i < out.length; i++) out[i] += x[i] * g;
  }
  let pk = 0;
  for (const v of out) pk = Math.max(pk, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] *= 0.7 / pk;
  const raw = join(tmp, 'out.raw');
  writeFileSync(raw, Buffer.from(out.buffer));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', raw, '-c:a', 'libmp3lame', '-b:a', '64k', file]);
}
const nearest = (list, m) => list.reduce((a, b) => (Math.abs(b.midi - m) < Math.abs(a.midi - m) ? b : a));

// ---- VSCO 2 CE strings: note names one octave under scientific pitch's (their C3 is middle C) ----
const VSCO = 'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/';
const vsco = (dir, names, re) =>
  names.split(' ').map(n => {
    const [, p, o] = n.match(re);
    return { midi: 12 * (+o + 2) + PC[p], url: VSCO + encodeURI(dir).replace(/#/g, '%23') + n.replace(/#/g, '%23') };
  });
const SECTIONS = [
  vsco('Cello Section/susvib/', 'susvib_C1_v3_1.wav susvib_E1_v3_1.wav susvib_G1_v3_1.wav susvib_B1_v3_1.wav susvib_D2_v3_1.wav susvib_F2_v3_1.wav susvib_A2_v3_1.wav susvib_C3_v3_1.wav susvib_E3_v3_1.wav susvib_G3_v3_1.wav susvib_B3_v3_1.wav susvib_D4_v3_1.wav susvib_F4_v3_1.wav', /susvib_([A-G]#?)(\d)/),
  vsco('Viola Section/susvib/', 'ViolaEns_susvib_C2_v2_1.wav ViolaEns_susvib_D2_v2_1.wav ViolaEns_susvib_E2_v2_1.wav ViolaEns_susvib_G2_v2_1.wav ViolaEns_susvib_B2_v2_1.wav ViolaEns_susvib_D3_v2_1.wav ViolaEns_susvib_F3_v2_1.wav ViolaEns_susvib_A3_v2_1.wav ViolaEns_susvib_C4_v2_1.wav ViolaEns_susvib_E4_v2_1.wav ViolaEns_susvib_G4_v2_1.wav ViolaEns_susvib_B4_v2_1.wav ViolaEns_susvib_D5_v2_1.wav', /susvib_([A-G]#?)(\d)/),
  vsco('Violin Section/susVib/', 'VlnEns_susVib_G2_v2.wav VlnEns_susVib_A2_v2.wav VlnEns_susVib_B2_v2.wav VlnEns_susVib_D3_v2.wav VlnEns_susVib_F#3_v2.wav VlnEns_susVib_A3_v2.wav VlnEns_susVib_C4_v2.wav VlnEns_susVib_E4_v2.wav VlnEns_susVib_G4_v2.wav VlnEns_susVib_B4_v2.wav VlnEns_susVib_D5_v2.wav', /susVib_([A-G]#?)(\d)/)
];
function strings(m) {
  // (Every section whose range takes the note within two semitones; else the one nearest.)
  let near = SECTIONS.map(s => nearest(s, m)).filter(t => Math.abs(t.midi - m) <= 2);
  if (!near.length) near = [SECTIONS.map(s => nearest(s, m)).reduce((a, b) => (Math.abs(b.midi - m) < Math.abs(a.midi - m) ? b : a))];
  // (Far out of every range, the nearest take moved an octave at a time: still a string section.)
  return near.map(t => take(get(t.url), m - t.midi));
}

// ---- Salamander Grand Piano, as Tone.js serves it: A0, C1, D#1, F#1, A1 … C8 ----
const SAL = 'https://tonejs.github.io/audio/salamander/';
const PIANO = [];
for (let m = 21; m <= 108; m += 3) PIANO.push({ midi: m, url: `${SAL}${['C', 'Ds', 'Fs', 'A'][[0, 3, 6, 9].indexOf(m % 12)]}${Math.floor(m / 12) - 1}.mp3` });
const piano = m => [take(get(nearest(PIANO, m).url), m - nearest(PIANO, m).midi)];

const MAKE = { strings, piano };
const want = process.argv.slice(2).filter(a => MAKE[a]);
for (const inst of want.length ? want : Object.keys(MAKE)) {
  const dir = new URL(`../public/${sampleDir(inst)}${inst}/`, import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  for (const m of sampleNotes(inst)) write(join(dir, `${m}.mp3`), MAKE[inst](m));
  console.log(inst, sampleNotes(inst).length, 'notes');
}

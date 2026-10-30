// Fetches the recorded instruments (lib/samples.mjs) into public/samples:
// each instrument's notes a major third apart, as the MusyngKite soundfont
// has them (gleitz/midi-js-soundfonts, CC BY-SA 3.0). Run once; the files are
// kept in the repo (strings and piano are scripts/better-samples.mjs'). `node scripts/samples.mjs [inst ...] [--again]`
// (--again: fetch over the files there.)
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { SAMPLED, sampleNotes, noteName, BETTER } from '../public/lib/samples.mjs';

const args = process.argv.slice(2);
const again = args.includes('--again');
const BASE = `https://gleitz.github.io/midi-js-soundfonts/MusyngKite/`;
const want = args.filter(a => !a.startsWith('--'));
let bytes = 0;
for (const [inst, [gm]] of Object.entries(SAMPLED)) {
  if ((want.length && !want.includes(inst)) || BETTER.has(inst)) continue;
  const dir = new URL(`../public/samples/mk/${inst}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  for (const m of sampleNotes(inst)) {
    const file = new URL(`${m}.mp3`, dir);
    if (!again)
      try {
        bytes += (await stat(file)).size;
        continue;
      } catch {}
    const res = await fetch(`${BASE}${gm}-mp3/${noteName(m)}.mp3`);
    if (!res.ok) throw new Error(`${inst} ${noteName(m)}: ${res.status}`);
    const b = Buffer.from(await res.arrayBuffer());
    await writeFile(file, b);
    bytes += b.length;
  }
  console.log(inst, sampleNotes(inst).length, 'notes');
}
console.log(`${(bytes / 1e6).toFixed(1)} MB in all`);

// passion_beats.py's mixer and lib/mix.mjs, fed the same buses: the same mix, stem by stem, to within float32.
// (Skipped where python3 with numpy and scipy is not there.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mixdown, BUSES, MIX } from '../public/lib/mix.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const has = spawnSync('python3', ['-I', '-c', 'import numpy, scipy.signal, scipy.linalg'], { encoding: 'utf8' });

test('python and JS mix the same buses to the same song', { skip: has.status !== 0 && 'no python3 with numpy and scipy' }, () => {
  const sr = 12000, B = 3000, n = sr * 10;
  const dir = mkdtempSync(join(tmpdir(), 'mixparity-'));
  try {
    let seed = 5;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296) * 2 - 1;
    const buses = {};
    for (const name of BUSES) {
      const L = new Float32Array(n), R = new Float32Array(n);
      for (let j = 0; j < n; j++) {
        const t = j / sr, beat = (j % B) / B;
        let v = 0;
        if (name === 'drums') v = (beat < 0.02 ? 0.9 * Math.sin(2 * Math.PI * 55 * t) : 0) + (j % (2 * B) > B && j % (2 * B) < B + 400 ? 0.4 * rnd() : 0);
        if (name === 'hats') v = j % (B / 2) < 150 ? 0.2 * rnd() : 0;
        if (name === 'bass') v = 0.3 * Math.sin(2 * Math.PI * 55 * t) * (Math.floor(t / 2) % 2 ? 1 : 0.3);
        if (name === 'keys') v = 0.2 * Math.sin(2 * Math.PI * (330 + 110 * (Math.floor(t) % 3)) * t) * (0.3 + 0.7 * (t % 1 < 0.5)) + 0.05 * Math.sin(2 * Math.PI * 2100 * t);
        L[j] = v;
        R[j] = name === 'hats' ? v * 0.9 : v;
      }
      buses[name] = { L, R };
      writeFileSync(join(dir, `${name}.f32`), Buffer.concat([Buffer.from(L.buffer), Buffer.from(R.buffer)]));
    }
    const plan = [['intro', 0, 1], ['verse', 1, 1], ['pre', 2, 1], ['hook', 3, 1], ['break', 4, 1], ['outro', 5, 1]];
    const kicks = Array.from({ length: 20 }, (_, k) => k * B);
    for (const mix of [MIX, { ...MIX, fade: true, width: 1, reverb: 0.6, delay: 0.6, pump: 1, sweep: false }, { ...MIX, reverb: 0, delay: 0, width: 0 }]) {
      const code = `
import sys, json, numpy as np
sys.path.insert(0, ${JSON.stringify(root)})
import passion_beats as P
sr, B, n = ${sr}, ${B}, ${n}
P.sr, P.B = sr, B
m = P.mix_of(json.loads(${JSON.stringify(JSON.stringify(mix))}))
def load(name):
    a = np.fromfile(${JSON.stringify(dir)} + '/' + name + '.f32', dtype=np.float32).astype(np.float64); return a[:n], a[n:]
buses = {b: load(b) for b in P.BUSES}
def place(name, L, R):
    L += buses[name][0]; R += buses[name][1]; return True
L, R, out, over = P.mixdown(place, n, ${JSON.stringify(plan)}, ${JSON.stringify(kicks)}, m, True)
np.concatenate([L, R] + [x for k in sorted(out) for x in out[k]]).astype(np.float32).tofile(${JSON.stringify(dir)} + '/py.f32')
print(json.dumps({'over': float(over), 'stems': sorted(out)}))
`;
      const r = spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const info = JSON.parse(r.stdout);
      const js = mixdown((name, L, R) => (L.set(buses[name].L), R.set(buses[name].R), true), { sr, B, n, plan, kicks, mix, stems: true });
      const buf = readFileSync(join(dir, 'py.f32'));
      const py = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      const off = (x, k) => { let d = 0, e = 1e-12; for (let j = 0; j < n; j++) { d += (x[j] - py[k * n + j]) ** 2; e += x[j] ** 2; } return Math.sqrt(d / e); };
      assert.ok(Math.abs(js.over - info.over) < 1e-3, `over ${js.over} vs ${info.over}`);
      assert.ok(off(js.L, 0) < 1e-4 && off(js.R, 1) < 1e-4, `the mix: ${off(js.L, 0)}`);
      assert.deepEqual(Object.keys(js.stems).sort(), info.stems);
      info.stems.forEach((k, i) => assert.ok(off(js.stems[k].L, 2 + 2 * i) < 1e-4 && off(js.stems[k].R, 3 + 2 * i) < 1e-4, `stem ${k}`));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

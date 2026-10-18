# passion_beats.py's songs and mixer, on pieces made here (no recording, no
# hearing): python3 -m unittest tests/test_passion_beats.py
import os, sys, tempfile, unittest
import numpy as np
from scipy.io import wavfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import passion_beats as P

SR = 48000; BPM = 125

def kit():
    """Pieces in every role (the same kinds as engine.mjs's demo, simpler): {n: (samples, 2)}."""
    rng = np.random.default_rng(1); B = 60 / BPM * SR; t = lambda s: np.arange(int(s * SR)) / SR
    tone = lambda hz, beats: np.sin(2 * np.pi * hz * t(beats * 60 / BPM)) * np.exp(-t(beats * 60 / BPM) * 3) * 0.3
    noise = lambda s, d: rng.uniform(-1, 1, int(s * SR)) * np.exp(-t(s) / d) * 0.4
    parts = {1: ('riff', tone(220, 4), 4), 2: ('riff', tone(330, 4), 4), 3: ('phrase', tone(440, 2), 2),
             4: ('bass', tone(55, 4), 4), 5: ('hat', np.tile(noise(60 / BPM / 2, 0.01), 8), 4),
             6: ('kick', tone(50, 1)[:SR // 2], 1), 7: ('sub', tone(40, 2), 1), 8: ('snare', noise(0.3, 0.05), 1),
             9: ('tick', noise(0.05, 0.005), 1), 10: ('roll', noise(0.4, 0.1), 1), 11: ('fill', np.tile(noise(0.25, 0.05), 8), 4)}
    P.sr, P.B = SR, B
    P.pc.clear(); P.pc.update({i: np.stack([x, x], 1).astype(np.float32) for i, (_, x, _) in parts.items()})
    roles = {i: r for i, (r, _, _) in parts.items()}; loops = {i: l for i, (_, _, l) in parts.items()}
    chroma = {i: np.eye(12)[i % 12] for i in parts}
    return roles, loops, chroma

class Songs(unittest.TestCase):
    def setUp(self):
        self.roles, self.loops, self.chroma = kit(); self.dir = tempfile.mkdtemp()
        P.MIN_BARS, P.MAX_BARS = 8, 12

    def song(self, seed, styles=P.STYLES, mix=P.MIX, stems=False, plan=None):
        path = os.path.join(self.dir, f'{seed}.wav')
        return path, P.make(seed, path, styles, 1, self.roles, self.loops, self.chroma, mix and P.mix_of(mix), stems, plan)

    def test_forms(self):   # the same 49 as engine.mjs: with and without pre-hooks
        self.assertEqual(len(P.FORMS), 49)
        self.assertTrue(all(f[f.index('pre') + 1] == 'hook' for f in P.FORMS if 'pre' in f))

    def test_every_style_mixed_under_the_ceiling(self):
        for k, st in enumerate(P.STYLES):
            path, info = self.song(k + 1, [st])
            self.assertEqual(info['style'], st)
            y = wavfile.read(path)[1]
            self.assertLessEqual(np.abs(y).max(), P.CEILING * (1 + 1e-6), st)

    def test_stems_sum_to_the_song(self):
        for mix in (P.MIX, None):
            path, info = self.song(5, mix=mix, stems=True)
            y = wavfile.read(path)[1].astype(np.float64)
            parts = [wavfile.read(f'{path[:-4]} - {s}.wav')[1] for s in info['stems']]
            self.assertEqual('fx' in info['stems'], mix is not None)
            self.assertLess(np.abs(sum(parts) - y).max(), 1e-5)

    def test_plan_by_hand(self):
        plan = P.plan_of('verse:2,pre:2,hook:4,outro:1')
        _, info = self.song(7, plan=plan)
        self.assertEqual(info['plan'], [('verse', 2), ('pre', 2), ('hook', 4), ('outro', 1)])
        for bad in ('foo:2', 'hook:0', 'hook:17', ''): self.assertRaises(ValueError, P.plan_of, bad)

    def test_limiter_never_lets_a_sample_past(self):
        x = np.random.default_rng(2).normal(0, 1, SR); y = x[::-1].copy()
        g = P.limit_gain(x, y)
        self.assertLessEqual(max(np.abs(x * g).max(), np.abs(y * g).max()), P.CEILING + 1e-12)

if __name__ == '__main__':
    unittest.main()

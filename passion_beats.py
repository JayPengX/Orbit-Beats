#!/usr/bin/env python3
"""
passion_beats.py (Orbit Beats, was Passion Beats) - split a recording of beat pieces and arrange them into new songs.

Usage:
  python passion_beats.py all_beats.wav --count 20 --out songs/
  python passion_beats.py all_beats.wav --count 5 --min-bars 25 --max-bars 29 --seed 42

  python passion_beats.py all_beats.wav --plan intro:4,verse:8,pre:2,hook:8,outro:4 --stems
  python passion_beats.py all_beats.wav --raw

Input: one WAV with each piece separated by silence (>0.2 s), all at one tempo.
Any number of pieces. The tempo and each piece's role (riff, bass, kick, ...)
are heard from the audio; --bpm and --roles set them instead.
Songs come out mixed (the same mixer as the page's, public/lib/mix.mjs): each
piece on its bus (drums, hats, bass, keys) at its level, an echo and a room,
the bass and riffs pumping under the kick, filter sweeps through the intro,
pre-hooks and breaks, then one loudness held under -1 dBFS by a look-ahead
limiter. --raw uses the pieces exactly as recorded instead (no volume changes
or effects); where they overlap they add up, kept as-is in the 32-bit float WAV.
"""
import argparse, datetime, os, random, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter

sr = 48000
B = 60 / 120 * sr   # samples per beat, once the tempo is known
pc = {}

# what a piece does in a song (the same as public/engine.mjs; see the README)
ROLES = ['riff','phrase','bass','hat','fill','kick','sub','snare','tick','roll','off']

def load_pieces(path, pieces_dir=None, silence_db=-90, min_gap=0.2):
    """Split the recording on runs of silence and store pieces in `pc`, each
    exactly as recorded. Sound before the first gap and after the last counts too."""
    global sr
    sr, x = wavfile.read(path)
    if x.dtype == np.uint8: x = (x.astype(np.float32) - 128) / 128
    elif x.dtype.kind == 'i': x = x.astype(np.float32) / -np.iinfo(x.dtype).min
    else: x = x.astype(np.float32)
    if x.ndim == 1: x = np.stack([x, x], 1)
    x = x[:, :2]
    z = (np.abs(x).max(1) < 10 ** (silence_db / 20)).astype(int)
    d = np.diff(np.r_[0, z, 0]); st = np.where(d == 1)[0]; en = np.where(d == -1)[0]
    runs = [(a, b) for a, b in zip(st, en) if (b - a) > min_gap * sr]
    edges = [0] + [e for r in runs for e in r] + [len(x)]
    segs = [(a, b) for a, b in zip(edges[::2], edges[1::2]) if b - a >= 0.02 * sr]   # skip clicks
    for k, (a, b) in enumerate(segs):
        s = x[a:b].copy()
        pc[k + 1] = s
        if pieces_dir:
            os.makedirs(pieces_dir, exist_ok=True)
            wavfile.write(f"{pieces_dir}/piece_{k+1:02d}_{len(s)/B:.1f}beats.wav", sr, s)
    return len(pc)

# ---- Hearing a recording (the same as public/analyze.mjs; see the README) ----

def jround(x):   # JavaScript's Math.round: halves round up
    return int(np.floor(x + 0.5))

BANDS = {'low': (0, 120), 'lowmid': (120, 500), 'mid': (500, 2500), 'upper': (2500, 6000), 'high': (6000, np.inf)}
EDGES = [0, 150, 300, 600, 1200, 2400, 4800, 9600, np.inf]

def analyze_piece(x):
    """Everything about a piece that doesn't depend on the tempo: when its hits
    start, how it dies away, where its sound sits, how noisy and how pitched it
    is, and its notes' pitch classes. Frames are ~21 ms, ~5 ms apart."""
    m = x.astype(np.float64).mean(1); n = len(m)
    m = m - m.mean(); top = np.abs(m).max() if n else 0
    if top > 0: m = m / top
    N = 2 ** jround(np.log2(sr * 0.0213)); hop = N // 4; half = N // 2; bins = half + 1; hz = sr / N
    F = max(1, -(-n // hop) + 1)
    padded = np.zeros(half + n + N + hop * F); padded[half:half + n] = m
    win = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N) / N)
    frames = np.lib.stride_tricks.as_strided(padded, (F, N), (padded.strides[0] * hop, padded.strides[0]))
    P = np.abs(np.fft.rfft(frames * win, axis=1)) ** 2
    total = P.sum(0); energy = P.sum(1)
    k150 = int(np.ceil(150 / hz))   # below this a frame is too short to follow a wave, so the flux wobbles
    freqs = np.arange(bins) * hz
    band_e = np.array([P[:, (freqs >= a) & (freqs < b)].sum(1) for a, b in zip(EDGES, EDGES[1:])])
    cur = np.log1p(100 * np.sqrt(P[:, k150:]))
    flux = np.maximum(0, np.diff(np.vstack([np.zeros(cur.shape[1]), cur]), axis=0)).sum(1)
    low_e = P[:, :k150].sum(1)
    lo, hi = int(np.ceil(100 / hz)), min(half, int(np.floor(16000 / hz)))
    q = P[:, lo:hi + 1] + 1e-12
    frame_flat = np.exp(np.log(q).mean(1)) / q.mean(1)
    # the low end's flux: the rise of its level, smoothed over 5 frames
    idx = np.clip(np.arange(F)[:, None] + np.arange(-2, 3), 0, F - 1)
    low_level = np.log1p(100 * np.sqrt(low_e[idx].sum(1) / 5))
    flux = flux + k150 * np.maximum(0, low_level - np.r_[0, 0, low_level[:-2]][:F])
    peak_e = energy.max(); peak_f = int(np.argmax(energy))
    flat = np.sort(frame_flat[energy > peak_e * 0.01])

    # hits: peaks of spectral flux well over their surroundings, in frames
    # within 30 dB of the loudest, 30 ms apart, where some band gets 3 dB louder
    max_flux = flux.max(); gap = jround(0.03 * sr / hop)
    ref = max(0.15 * max_flux, flux[4:].max() if F > 4 else 0)
    at = lambda arr, i, d=0: arr[i] if 0 <= i < len(arr) else d
    def rises(f):
        for e in band_e:
            now = max(e[f], at(e, f + 1), at(e, f + 2))
            if now < peak_e * 0.01: continue
            if now >= 2 * min(at(e, f - d) for d in range(1, 5)): return True
        return False
    onsets = []
    for f in range(F):
        if flux[f] < 0.1 * ref or energy[min(F - 1, f + 1)] < peak_e * 1e-3 or not rises(f): continue
        if any(at(flux, f + d, -1) > flux[f] - (0 if d < 0 else 1e-12) for d in range(-3, 4) if d): continue
        around = sorted(flux[max(0, f - 8):f + 9])
        if flux[f] < 1.25 * around[len(around) // 2] + 0.02 * ref: continue
        if onsets and f - onsets[-1]['f'] < gap: continue
        # timed at its flux peak; a slow swell (20 ms or more) from where it begins
        b = f
        while b > 0 and f - b < 0.15 * sr / hop and energy[b - 1] < energy[b] and flux[b - 1] > 0.25 * flux[f]: b -= 1
        y0, y2 = at(flux, f - 1, flux[f]), at(flux, f + 1, flux[f]); den = y0 - 2 * flux[f] + y2
        t = b if f - b > 0.02 * sr / hop else f + (0.5 * (y0 - y2) / den if den else 0)
        onsets.append(dict(f=f, t=max(0, t) * hop / sr, s=min(1, flux[f] / ref), level=max(energy[f:f + 4]) / peak_e))
    if not onsets or onsets[0]['t'] > 0.05: onsets.insert(0, dict(f=0, t=0, s=1, level=1))

    f20 = peak_f
    while f20 < F - 1 and energy[f20] > peak_e * 0.01: f20 += 1
    end_f = max(0, (n - 1) // hop); tail = energy[max(0, end_f - jround(0.03 * sr / hop)):end_f + 1]
    tot = total.sum() or 1
    bands = {k: total[(freqs >= a) & (freqs < b)].sum() / tot for k, (a, b) in BANDS.items()}
    chroma = np.zeros(12); k = int(np.ceil(60 / hz))
    while k * hz <= 2500:
        chroma[((jround(12 * np.log2(k * hz / 440)) + 69) % 12 + 12) % 12] += np.sqrt(total[k]); k += 1
    chroma /= np.hypot.reduce(chroma) or 1
    return dict(seconds=n / sr, onsets=[o['t'] for o in onsets], strengths=[o['s'] for o in onsets], levels=[o['level'] for o in onsets],
                attack=peak_f * hop / sr, decay=(f20 - peak_f) * hop / sr, loud=(energy > peak_e * 0.01).sum() * hop / sr,
                end=tail.max() / peak_e, bands=bands, centroid=(freqs * total).sum() / tot,
                flatness=flat[len(flat) // 2] if len(flat) else 1, **pitch(m, energy, hop, peak_e), chroma=chroma)

def pitch(m, energy, hop, peak_e):
    """How much the loud parts repeat at a pitch of 40-1000 Hz (0 noise, 1 a note)
    and that pitch: the autocorrelation's highest peak past its first dip,
    median over up to 8 moments, at about 16 kHz."""
    d = max(1, sr // 16000); s2 = sr / d; nd = len(m) // d; x = m[:nd * d].reshape(nd, d).mean(1)
    W, lo, hi = jround(0.064 * s2), jround(s2 / 1000), jround(s2 / 40)
    loud = np.where(energy > peak_e * 0.1)[0]; k = min(8, len(loud)); out = []
    for q in range(k):
        st = max(0, int(loud[q * len(loud) // k] * hop // d) - (W >> 1))
        if st + W + hi > nd: continue
        seg = x[st:st + W + hi]; c = np.r_[0, np.cumsum(seg ** 2)]; lags = np.arange(lo, hi + 1)
        r = np.array([seg[:W] @ seg[t:t + W] for t in lags]) / np.sqrt(c[W] * (c[lags + W] - c[lags]) + 1e-20)
        neg = np.where(r < 0)[0]; best, lag = 0.0, 0
        if len(neg):
            rest = r[neg[0]:]; i = int(np.argmax(rest))
            if rest[i] > 0: best, lag = float(rest[i]), int(lags[neg[0] + i])
        out.append((best, s2 / lag if lag else 0))
    if not out: return dict(pitched=0, f0=0)
    out.sort(key=lambda o: o[0]); best, f0 = out[len(out) // 2]
    return dict(pitched=best, f0=f0)

def pow2_below(beats):
    p = 1
    while p * 2 <= beats: p *= 2
    return p

def pow2_above(beats):
    p = 1
    while p < beats: p *= 2
    return p

def hits(a):
    """A piece's hits, leaving out faint ones (12 dB under its loudest, or barely
    a change) and echoes (under 60% of a hit within 100 ms before)."""
    kept = []
    for i, t in enumerate(a['onsets']):
        if i and (a['levels'][i] < 0.063 or a['strengths'][i] < 0.15): continue
        if any(t - u < 0.1 and a['strengths'][i] < 0.6 * s for u, s in kept): continue
        kept.append((t, a['strengths'][i]))
    return [t for t, _ in kept]

def detect_tempo(analyses, lo=70, hi=190, w_fit=3, w_loop=0.5, w_lean=0.2, near=0.08):
    """The tempo the pieces were recorded at: hits on their 16th-note grid, loops
    whole beats long; of the tempos fitting about as well as the best, the one
    balancing fit, usual loop lengths (about 4 beats) and a lean to 120 BPM."""
    pts, lengths, loops = [], [], []
    for a in analyses:
        h = hits(a)
        if len(h) >= 4 and h[-1] - h[0] < 0.8: continue   # a roll
        for i, t in enumerate(h):
            if i and t - h[i - 1] >= 0.07: pts.append((t - h[0], a['strengths'][a['onsets'].index(t)]))
        if len(h) > 1 and h[-1] - h[0] >= 0.4: lengths.append(a['seconds']); loops.append(a['seconds'])
    if len(pts) < 4: return None, 0
    weight = sum(w for _, w in pts) + len(lengths) * 0.5
    def score(bpm):
        beat = 60 / bpm; s = 0
        for t, w in pts: s += w * np.cos(2 * np.pi * t / (beat / 4))
        for t in lengths: s += 0.5 * max(0, np.cos(2 * np.pi * t / beat))
        return s / weight
    tried = []; b = lo
    while b <= hi + 1e-9: tried.append((b, score(b))); b += 0.02
    best = max(s for _, s in tried)
    def unusual(bpm):
        if not loops: return 0
        beats = sorted(pow2_below(t / (60 / bpm) + 0.25) for t in loops)
        return abs(np.log2(beats[len(beats) // 2] / 4))
    pick, cost = None, np.inf
    for i, (b, s) in enumerate(tried):
        if s < best - near or s < (tried[i - 1][1] if i else -9) or s < (tried[i + 1][1] if i + 1 < len(tried) else -9): continue
        c = w_fit * (best - s) + w_loop * unusual(b) + w_lean * abs(np.log2(b / 120))
        if c < cost: cost, pick = c, (b, s)
    bpm, fit = pick; b = bpm - 0.03
    while b <= bpm + 0.03:
        s = score(b)
        if s > fit: fit, bpm = s, b
        b += 0.002
    whole = jround(bpm); ws = score(whole)
    if abs(whole - bpm) < 0.6 and ws >= fit - 0.03: return whole, ws
    return jround(bpm * 10) / 10, fit

def loop_beats(a, bpm):
    """A loop's length in beats: the longest whole power of two that fits, kept to
    the shortest that holds all its hits if it wasn't cut to the beat grid."""
    beat = 60 / bpm; beats = a['seconds'] / beat; fit = pow2_below(beats + 0.25); h = hits(a)
    if abs(beats - jround(beats)) < 0.05 or len(h) < 2: return fit
    return min(fit, pow2_above((h[-1] - h[0]) / beat + 0.2))

def guess_role(a, bpm):
    beat = 60 / bpm; beats = a['seconds'] / beat; b = a['bands']; h = hits(a)
    spread = h[-1] - h[0] if len(h) > 1 else 0
    deep = b['low'] + b['lowmid']
    bright = b['high'] >= 0.6                                              # hats, not snares
    tonal = a['flatness'] < 0.05 or (a['pitched'] >= 0.7 and a['flatness'] < 0.3)   # notes, not drums
    pure = a['pitched'] >= 0.85 and a['flatness'] < 0.05
    low_hit = lambda: 'sub' if a['decay'] >= 0.8 or (a['end'] >= 0.25 and a['decay'] >= 0.25) else 'kick'
    if len(h) <= 1 and b['low'] >= 0.5: return low_hit()
    loop = beats >= 1.75 and (spread >= 0.75 * beat or (tonal and a['loud'] >= 1.5 * beat and a['decay'] >= beat))
    if loop:
        if bright: return 'hat'
        if not tonal: return 'fill' if spread >= 1.5 * beat else 'roll'
        if deep >= 0.7 and a['centroid'] < 300: return 'fill' if len(h) / max(beat, spread) * beat >= 3 else 'bass'
        return 'phrase' if loop_beats(a, bpm) <= 2 else 'riff'
    if bright: return 'hat' if len(h) >= 2 else 'tick'
    if b['low'] >= 0.5: return low_hit()
    if pure: return 'phrase'
    if len(h) >= 3 and spread >= 0.4 * beat: return 'roll'
    if b['low'] >= 0.35: return 'kick'
    return 'snare'

# Arrangement rules (the same as public/engine.mjs; see the README):
# a hook may lift to a related groove, never a foreign one;
FAMILY = {'four':['four','broken','house','techno'],'broken':['broken','four','garage','dnb'],'hiphop':['hiphop','trap','boombap','lofi'],'trap':['trap','hiphop','drill','phonk'],
          'half':['half','hiphop'],'house':['house','four','jersey','amapiano','garage'],'dembow':['dembow','afro','reggae','baile'],'afro':['afro','dembow','amapiano'],
          'drill':['drill','trap'],'boombap':['boombap','hiphop','lofi'],'jersey':['jersey','house','baile'],'amapiano':['amapiano','house','afro'],
          'lofi':['lofi','boombap','hiphop'],'funk':['funk','broken','boombap'],'garage':['garage','house','broken'],'dnb':['dnb','broken'],
          'reggae':['reggae','dembow'],'phonk':['phonk','trap','drill'],'baile':['baile','dembow','jersey'],'techno':['techno','four','house']}
STYLES = ['four','hiphop','trap','half','broken','house','dembow','afro','drill','boombap','jersey','amapiano','lofi','funk','garage','dnb','reggae','phonk','baile','techno']
SECTIONS = ['intro','verse','pre','hook','break','bridge','outro']
# the body is verse-hook pairs (each verse maybe with a pre-hook before its
# hook, every one the same), maybe a break first, maybe a break or bridge
# before a last hook; verses and hooks are 4 or 8 bars, pre-hooks, breaks and
# bridges 2 or 4: phrases come in fours.
LENS = {'verse':[4,8],'pre':[2,4],'hook':[4,8],'break':[2,4],'bridge':[2,4]}
FORMS = [['hook']] + [lead + (['verse','pre','hook'] if pre else ['verse','hook'])*k + end
                      for pre in (False, True) for k in range(1,5) for lead in ([],['break']) for end in ([],['break','hook'],['bridge','hook'])]
PATTERNS = [[0,1,2,1],[0,1],[0,0,1,1],[0,1,0,2],[0]]   # riff sets, over a shuffled order of riffs
# fills fit where they lead: a build into a hook, something light into a
# verse, next to nothing into a quiet section (a pre-hook's riser is its own)
INTO = {'hook':['roll','roll2','stutter','fill'],'verse':['roll','roll2','tick','drop'],'pre':['tick','drop'],'break':['drop','tick'],
        'bridge':['drop','tick'],'outro':['roll','roll2','stutter'],'intro':['drop','tick']}
MAX_PLAN_BARS = 128

def fits(form, bars):   # every choice of section lengths adding up to `bars` (pruned: 24 forms of up to 15 sections)
    if not form: return [[]] if bars == 0 else []
    least = sum(LENS[t][0] for t in form[1:]); most = sum(LENS[t][-1] for t in form[1:])
    return [[L] + rest for L in LENS[form[0]] if least <= bars - L <= most for rest in fits(form[1:], bars - L)]

def plan_song(R):
    """[(type, first bar, bars)]: an even number of bars when the range has one."""
    evens = [t for t in range(MIN_BARS, MAX_BARS + 1) if t % 2 == 0]
    target = R.choice(evens) if evens else MIN_BARS
    choices = {}
    for intro in (2, 4):
        for outro in ((3,) if target % 2 else (2, 4)):
            for k, form in enumerate(FORMS):
                for lens in fits(form, target - intro - outro): choices.setdefault(k, []).append((intro, lens, outro))
    if not choices: sys.exit(f'no song form fits {target} bars')
    k = R.choice(sorted(choices)); form = FORMS[k]; intro, lens, outro = R.choice(choices[k])
    plan = [('intro', 0, intro)]; bar = intro
    for t, L in zip(form, lens): plan.append((t, bar, L)); bar += L
    return plan + [('outro', bar, outro)]

def plan_of(text):
    """An arrangement as asked ('intro:4,verse:8,pre:2,hook:8,outro:4'): each a
    known section of 1 to 16 bars, 128 bars at most in all. -> the plan"""
    plan = []; bar = 0
    for part in filter(None, text.split(',')):
        t, _, n = part.partition(':')
        if t not in SECTIONS or not n.isdigit() or not 1 <= int(n) <= 16: raise ValueError(f'not a section: {part!r} (like hook:8; sections: {",".join(SECTIONS)}, 1-16 bars)')
        plan.append((t, bar, int(n))); bar += int(n)
    if not plan: raise ValueError('an arrangement needs a section')
    if bar > MAX_PLAN_BARS: raise ValueError(f'{MAX_PLAN_BARS} bars at most')
    return plan

# Each groove's bar of drums from beat t (s: the song, k: its kit). The
# s.r.random() calls are the groove's chances, as in public/engine.mjs.
def _four(s,t,k):
    for q in range(4): s.hit(k['kick'],t+q)
    if s.r.random()<0.15: s.hit(k['kick'],t+3.5)
def _hiphop(s,t,k):
    s.hit(k['heavy'],t); s.hit(k['snare'],t+2.5)
    if s.r.random()<0.35: s.hit(k['heavy'],t+1.75)
    if s.r.random()<0.2: s.hit(k['kick'],t+3.75)
def _trap(s,t,k):   # the 808 on 1, a kick between, the snare on 3 (half-time), the 808 again late
    s.hit(k['sub'],t); s.hit(k['kick'],t+1.5); s.hit(k['snare'],t+2); s.hit(k['sub'],t+2.75)
    if s.r.random()<0.3: s.hit(k['sub'],t+3.5)
def _half(s,t,k):
    s.hit(k['snare'],t)
    if s.r.random()<0.5: s.hit(k['heavy'],t+2.75)
def _broken(s,t,k):
    for q in s.py.choice([[0,1.5,2.5],[0,0.75,2.25,3],[0,2,2.75],[0,1.25,2.5,3.5]]): s.hit(s.py.choice([k['kick'],k['heavy'],k['sub']]),t+q)
def _house(s,t,k):   # four on the floor, the clap on 2 and 4, a tick on every off-beat
    for q in range(4): s.hit(k['kick'],t+q)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in (0.5,1.5,2.5,3.5): s.hit(k['tick'],t+q)
def _dembow(s,t,k):   # reggaeton's: the kick on the beat, the snare's 3+3+2 against it
    for q in range(4): s.hit(k['kick'],t+q)
    for q in (0.75,1.5,2.75,3.5): s.hit(k['snare'],t+q)
def _afro(s,t,k):   # afrobeats': a kick that skips, the snare on 2 and 4, a shaker's push
    for q in (0,1.5,2.5): s.hit(k['heavy'],t+q)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    if s.r.random()<0.5: s.hit(k['snare'],t+3.75)
    for q in (0.5,1.75,2.25,3.25): s.hit(k['tick'],t+q)
def _drill(s,t,k):   # drill's: the 808 sliding round the kick, the snare late on 3 and pushed, its hats in threes
    s.hit(k['sub'],t); s.hit(k['heavy'],t+2.75)
    if s.r.random()<0.5: s.hit(k['sub'],t+1.5)
    s.hit(k['snare'],t+2); s.hit(k['snare'],t+3.5 if s.r.random()<0.5 else t+3.75)
    for q in (0,0.75,1.5,2.25,3,3.75): s.hit(k['tick'],t+q)
def _boombap(s,t,k):   # boom bap's: the kick's skip, the snare on 2 and 4, eighth-note hats
    s.hit(k['heavy'],t); s.hit(k['kick'],t+2.5)
    if s.r.random()<0.5: s.hit(k['kick'],t+1.75)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in (0.5,1.5,2.5,3.5): s.hit(k['tick'],t+q)
def _jersey(s,t,k):   # Jersey club's: the kicks' bounce, the clap on 2 and 4
    for q in (0,1,2,2.75,3.5): s.hit(k['kick'],t+q)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    if s.r.random()<0.4: s.hit(k['snare'],t+3.75)
def _amapiano(s,t,k):   # amapiano's: the kick on the beat, the log drum's syncopation, a rim on 4, a shaker on every off-16th
    for q in range(4): s.hit(k['kick'],t+q)
    for q in (0.75,2.25,3.5): s.hit(k['sub'],t+q)
    s.hit(k['snare'],t+3)
    for q in np.arange(0.25,4,0.5): s.hit(k['tick'],t+q)
def _lofi(s,t,k):   # lo-fi's: a lazy kick, the snare on 2 and 4, eighth hats with some left out
    s.hit(k['heavy'],t); s.hit(k['kick'],t+2.5)
    if s.r.random()<0.5: s.hit(k['kick'],t+2.75)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in np.arange(0,4,0.5):
        if s.r.random()<0.8: s.hit(k['tick'],t+q)
def _funk(s,t,k):   # funk's: the kick on 1, its push and the and of 3, ghost notes round the backbeat, sixteenths on the hat
    s.hit(k['heavy'],t); s.hit(k['kick'],t+0.75); s.hit(k['kick'],t+2.5)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    if s.r.random()<0.5: s.hit(k['roll'],t+1.75)
    if s.r.random()<0.5: s.hit(k['roll'],t+3.25)
    for q in np.arange(0,4,0.25): s.hit(k['tick'],t+q)
def _garage(s,t,k):   # UK garage's two-step: no kick on 3, the kick skipping late, the snare on 2 and 4
    s.hit(k['kick'],t); s.hit(k['kick'],t+2.75)
    if s.r.random()<0.4: s.hit(k['kick'],t+1.75)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in (0.5,1.5,2.5,3.5): s.hit(k['tick'],t+q)
def _dnb(s,t,k):   # drum and bass's two-step at double time, twice a bar; sixteenth hats, some of the off ones left out
    for h in (0,2):
        s.hit(k['heavy'],t+h); s.hit(k['snare'],t+h+0.5); s.hit(k['kick'],t+h+1.25); s.hit(k['snare'],t+h+1.5)
    for q in np.arange(0,4,0.25):
        if q%0.5==0 or s.r.random()<0.5: s.hit(k['tick'],t+q)
def _reggae(s,t,k):   # reggae's one drop: nothing on 1, the kick and the snare together on 3, the hat on the off-beats
    s.hit(k['heavy'],t+2); s.hit(k['snare'],t+2)
    if s.r.random()<0.3: s.hit(k['kick'],t+3.5)
    for q in (0.5,1.5,2.5,3.5): s.hit(k['tick'],t+q)
def _phonk(s,t,k):   # phonk's: the 808 on 1 and the and of 3, a kick between, the snare on 2 and 4, hats rolling at the end
    s.hit(k['sub'],t); s.hit(k['kick'],t+1.75); s.hit(k['sub'],t+2.5)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in (0,0.5,1,1.5,2,2.5,3,3.25,3.5,3.75): s.hit(k['tick'],t+q)
def _baile(s,t,k):   # baile funk's tamborzão: the kick's 3-3-2 twice, the snare on its gaps
    for q in (0,0.75,2,2.75): s.hit(k['kick'],t+q)
    s.hit(k['snare'],t+1.5); s.hit(k['snare'],t+3.5)
    if s.r.random()<0.5: s.hit(k['snare'],t+1.25)
    for q in (0.5,1,2.5,3): s.hit(k['tick'],t+q)
def _techno(s,t,k):   # techno's: the heavy kick on every beat, the hat on the off-beats, a clap that comes and goes
    for q in range(4): s.hit(k['heavy'],t+q)
    for q in (0.5,1.5,2.5,3.5): s.hit(k['tick'],t+q)
    if s.r.random()<0.5: s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    if s.r.random()<0.3: s.hit(k['tick'],t+3.75)
GROOVES = {x: globals()['_' + x] for x in STYLES}
# the grooves whose hats are part of them: no extra ticks
FULL_HATS = {'drill','boombap','amapiano','lofi','funk','garage','dnb','reggae','phonk','baile','techno'}

class Song:
    """The pieces placed on the recording's beat grid: each hit noted as it's
    decided (`events`: piece, beat, the sample it starts on), then summed on
    the buses and mixed, or with --raw summed exactly as recorded. Pieces may
    overlap. Humanize only moves when a piece starts."""
    def __init__(s,bars,rng,humanize,loops):   # pieces by number; None is none; loops: loop lengths in beats
        s.r=rng; s.py=random.Random(int(rng.integers(1e9))); s.bars=bars; s.rest=set()   # stop bars
        s.per=loops; s.events=[]
        s.swing=rng.uniform(0,0.06)*humanize        # fraction of a beat pushed on off-16ths
        s.loose=rng.uniform(0.004,0.012)*humanize   # timing sd in seconds
    def hit(s,i,beat,tight=False):
        if i is None: return
        at=beat
        if abs(beat%0.5-0.25)<1e-6: beat+=s.swing
        s.events.append((i,at,max(0,jround(beat*B+s.r.normal(0,s.loose*(0.4 if tight else 1))*sr))))
    def span(s,i): return 1 if i is None else max(1,-(-s.per[i]//4))   # whole bars a loop takes
    def loop(s,i,bar,nbars):   # piece i every loop length; the last may run on
        if i is None: return
        t=bar*4; end=(bar+nbars)*4
        while t<end-1e-9:
            if int(t//4) not in s.rest: s.hit(i,t,tight=True)
            t+=s.per[i]
    def phrases(s,bar,nbars,pool):   # short pieces one after another, each where it fits
        t=bar*4; end=(bar+nbars)*4
        while t<end-1e-9:
            fit=[i for i in pool if s.per[i]<=end-t+1e-9]
            # (none fits the section at all: the shortest still plays, running on, rather than bars of silence)
            if not fit and t==bar*4 and pool: fit=[min(pool,key=lambda i:s.per[i])]
            if not fit: break
            i=s.py.choice(fit); s.hit(i,t); t+=s.per[i]
    def drums(s,style,bar,nbars,k):   # k: the song's drum kit
        for br in range(bar,bar+nbars):
            if br in s.rest: continue
            t=br*4
            GROOVES.get(style,_four)(s,t,k)
            if s.r.random()<0.35 and style not in FULL_HATS:   # ticks between the hits
                for q in s.py.choice([[0.5],[1.5,3.5],[0.5,1.5,2.5,3.5]]): s.hit(k['tick'],t+q)
    def build(s,bar,nbars,k):   # a pre-hook's riser: the snare (or a roll) a beat apart, then eighths, then sixteenths
        for j in range(nbars):
            step=0.25 if j==nbars-1 else 0.5 if j>=nbars/2 else 1
            for q in np.arange(0,4-1e-9,step): s.hit(k['snare'] if k['snare'] is not None else k['roll'],(bar+j)*4+q,tight=True)
    def fill(s,bar,kinds,k):   # the end of `bar`
        t=bar*4; kind=s.py.choice(kinds)
        if kind=='fill' and k['fill'] is None: kind='stutter'   # no fill loop: a stutter
        if kind=='roll': s.hit(k['roll'],t+3)
        elif kind=='roll2': s.hit(k['roll'],t+3); s.hit(k['roll'],t+3.5)
        elif kind=='stutter':
            for q in [2.5,3,3.25,3.5,3.75]: s.hit(s.py.choice([k['kick'],k['snare']]),t+q)
        elif kind=='fill': s.hit(k['fill'],t,tight=True)
        elif kind=='tick':
            for q in [3,3.25,3.5,3.75]: s.hit(k['tick'],t+q)
        # 'drop': no fill

# ---- The mixer (the same steps as public/lib/mix.mjs; see the README) ----
# Each piece plays on its bus (drums, hats, bass, the riffs and phrases as
# keys), each bus its level; the riffs into an echo (a dotted eighth left, an
# eighth right) and a room, the snare a little of the room too; the bass and
# the riffs ducking under the kick (the pump); the riffs opening up through
# the intro, rising out of the way over a pre-hook, muffled in a break; the
# hats a little to one side. Then one loudness, held under -1 dBFS by a
# limiter that looks ahead, so nothing clips whatever the format.

BUSES = ['drums','hats','bass','keys']
BUS_OF = dict(riff='keys',phrase='keys',bass='bass',hat='hats',tick='hats',fill='drums',kick='drums',sub='drums',snare='drums',roll='drums')
MIX = dict(on=True,drums=0,hats=-2,bass=-1,keys=-1,reverb=0.25,delay=0.2,pump=0.3,sweep=True,width=0.4,fade=False)   # levels in dB, the rest 0-1
LIMITS = dict(drums=(-24,6),hats=(-24,6),bass=(-24,6),keys=(-24,6),reverb=(0,1),delay=(0,1),pump=(0,1),width=(0,1))
db_gain = lambda d: 10 ** (d / 20)
CEILING = db_gain(-1)
BLOCK = 256   # a sweep's cutoff moves by blocks

def mix_of(m):   # any mixer as a whole one: every number in its range, what's missing as it opens
    out = dict(MIX)
    for k, (lo, hi) in LIMITS.items():
        if m.get(k) is not None and np.isfinite(m[k]): out[k] = min(hi, max(lo, float(m[k])))
    for k in ('on','sweep','fade'):
        if isinstance(m.get(k), bool): out[k] = m[k]
    return out

def coef(hz): return 1 - np.exp(-2 * np.pi * min(hz, sr * 0.45) / sr)

def lowpass(x, c, s0=0.0):   # one pole (6 dB an octave): s += c (x - s), from state s0 (lfilter's zi is (1-c) s0)
    return lfilter([c], [1, c - 1], x, zi=[(1 - c) * s0])[0]

def one_pole(x, hz, kind='lp'):
    lp = lowpass(x, coef(hz))
    return lp if kind == 'lp' else x - lp

def sweep(x, kind, a, b, f0, f1, edge=512, poles=2):
    """A low- or high-pass over [a, b) of x in place, its cutoff moving from f0 to
    f1 (exponentially, by blocks), faded in over the `edge` samples before a and
    out over those after b, so it never clicks."""
    lo, hi = max(0, a - edge), min(len(x), b + edge)
    if hi <= lo: return
    dry = x[lo:hi].copy(); wet = np.empty_like(dry); st = np.zeros(poles)
    for blk in range(lo, hi, BLOCK):
        mid = min(max((blk + BLOCK / 2 - a) / max(1, b - a), 0), 1)
        c = coef(f0 * (f1 / f0) ** mid); y = dry[blk - lo:blk - lo + BLOCK]
        for p in range(poles):
            lp = lowpass(y, c, st[p]); st[p] = lp[-1]
            y = lp if kind == 'lp' else y - lp
        wet[blk - lo:blk - lo + len(y)] = y
    j = np.arange(lo, hi)
    w = np.where(j < a, (j - lo) / max(1, a - lo), np.where(j >= b, 1 - (j - b) / max(1, hi - b), 1))
    x[lo:hi] = dry + w * (wet - dry)

# Delays whose feedback is d samples back: worked a block of d at a time, each
# block from the one before (lfilter with a d-long denominator is O(n d)).
def comb(x, d, fb):   # y[n] = x[n-d] + fb y[n-d]: an echo every d samples, each fb as loud
    y = np.zeros(len(x))
    for k in range(d, len(x), d):
        e = min(len(x), k + d); y[k:e] = x[k - d:e - d] + fb * y[k - d:e - d]
    return y

def allpass(x, d, g):   # y[n] = -g x[n] + x[n-d] + g y[n-d]: smears without colouring
    y = -g * x
    for k in range(d, len(x), d):
        e = min(len(x), k + d); y[k:e] += x[k - d:e - d] + g * y[k - d:e - d]
    return y

def room(send):
    """A room (Schroeder's: four combs side by side, fb 0.82, a quarter each,
    then two all-passes in a row, g 0.5) from a mono send, a little different
    each side. -> L, R"""
    k = sr / 44100
    def side(spread):
        v = sum(comb(send, jround((d + spread) * k), 0.82) for d in (1116, 1188, 1277, 1356)) * 0.25
        for d in (556, 441): v = allpass(v, jround((d + spread) * k), 0.5)
        return v
    return side(0), side(23)

def duck(n, kicks, depth):   # a bus's gain: 1, dipping by `depth` at each kick and back over half a beat
    g = np.ones(n)
    if not depth: return g
    ln = max(1, jround(B / 2)); curve = 1 - depth * (1 - np.arange(ln) / ln) ** 2
    for p in kicks:
        a, e = max(0, p), min(n, p + ln)
        if a < e: g[a:e] = np.minimum(g[a:e], curve[a - p:e - p])
    return g

def limit_gain(L, R, ceiling=CEILING):
    """The gain that keeps L and R under `ceiling`, looking ahead: each block of
    64 samples at most the gain its loudest neighbour needs, let back up over
    80 ms, eased between the blocks; never a sample past the ceiling."""
    n = len(L); blk = 64; nb = max(1, -(-n // blk))
    p = np.zeros(nb * blk); p[:n] = np.maximum(np.abs(L), np.abs(R)); p = p.reshape(nb, blk).max(1)
    raw = np.where(p > ceiling, ceiling / np.maximum(p, 1e-30), 1.0)
    need = np.minimum(raw, np.minimum(np.r_[1, raw[:-1]], np.r_[raw[1:], 1]))
    # G[b] = min(need[b], G[b-1] + rel), unrolled: the least of need[k] + rel (b - k)
    rel = blk / (0.08 * sr); ks = np.arange(nb)
    G = rel * ks + np.minimum.accumulate(need - rel * ks)
    c = (np.arange(n) - blk / 2) / blk   # where between the blocks' centres
    b0 = np.clip(np.floor(c), 0, nb - 1).astype(int); b1 = np.minimum(nb - 1, b0 + 1); f = np.clip(c - b0, 0, 1)
    return np.minimum(G[b0] + (G[b1] - G[b0]) * f, raw[np.arange(n) // blk])

def mixdown(place, n, plan, kicks, m, stems=False):
    """`place(bus, L, R)` sums a bus's hits into L and R and says whether it had
    any; `kicks`: where each kick and 808 starts; `plan`: the sections. ->
    L, R, {stem: (L, R)} (the buses and 'fx', the echo's and room's), and how
    far past full scale the loudest moment went before it was brought down (dB)."""
    L = np.zeros(n); R = np.zeros(n); out = {}
    send = np.zeros(n) if m['reverb'] else None   # into the room, mono
    bar = lambda k: jround(k * 4 * B)
    sections = [(t, bar(b), bar(b + ln)) for t, b, ln in plan]
    pump = None
    for name in BUSES:
        bL = np.zeros(n); bR = np.zeros(n)
        if not place(name, bL, bR): continue
        if m['sweep'] and name in ('keys', 'bass'):   # the riffs opening up, rising out of the way, muffled
            for t, a, b in sections:
                o = (dict(kind='lp', f0=350, f1=16000) if t == 'intro' and name == 'keys' else
                     dict(kind='hp', f0=30, f1=400 if name == 'bass' else 900) if t == 'pre' else
                     dict(kind='lp', f0=1400, f1=1400) if t == 'break' and name == 'keys' else None)
                if o: sweep(bL, a=a, b=b, **o); sweep(bR, a=a, b=b, **o)
        gain = db_gain(m[name])
        left = gain * (1 - 0.35 * m['width']) if name == 'hats' else gain   # (the hats a little to the right)
        depth = m['pump'] if name == 'bass' else m['pump'] * 0.6 if name == 'keys' else 0
        g = 1
        if depth:
            if pump is None: pump = duck(n, kicks, 1)   # the full dip, scaled for each bus
            g = 1 - depth * (1 - pump)
        bL *= left * g; bR *= gain * g
        if send is not None:   # the riffs to the room; the drums' top (the snare), from the left, as the page does
            if name == 'keys': send += (bL + bR) * 0.25 * m['reverb']
            elif name == 'drums': send += one_pole(bL, 300, 'hp') * 0.2 * m['reverb']
        if name == 'keys' and m['delay']:   # the echo: the riffs as they were, darkened at 3 kHz
            dark = one_pole((bL + bR) / 2, 3000); amt = m['delay'] * 0.45
            bL += comb(dark, max(1, jround(0.75 * B)), 0.35) * amt
            bR += comb(dark, max(1, jround(0.5 * B)), 0.35) * amt
        L += bL; R += bR
        if stems: out[name] = (bL, bR)
    if send is not None:
        rL, rR = room(one_pole(send, 5000))   # the room's input darkened
        k = (1 - m['width']) / 2              # narrower: each side some of the other
        rL, rR = rL * (1 - k) + rR * k, rR * (1 - k) + rL * k
        L += rL; R += rR
        if stems: out['fx'] = (rL, rR)
    if m['fade']:   # the outro fades away to nothing by the song's last bar
        o = next((s for s in sections if s[0] == 'outro'), None)
        if o:
            _, a, b = o; j = np.arange(a, n)
            env = np.where(j >= b, 0, np.cos((j - a) / max(1, b - a) * (np.pi / 2)) ** 2)
            for x in [L, R] + [x for s in out.values() for x in s]: x[a:] *= env
    # one loudness: the loudest moment 3 dB past the ceiling, then held under it
    peak = max(np.abs(L).max(), np.abs(R).max()) if n else 0
    makeup = CEILING * np.sqrt(2) / peak if peak > 0 else 1
    L *= makeup; R *= makeup
    g = limit_gain(L, R); L *= g; R *= g
    for x in [x for s in out.values() for x in s]: x *= makeup * g
    return L, R, out, (20 * np.log10(peak) if peak > 0 else -np.inf)

def render(s, roles, plan, m, stems=False):
    """The hits summed and mixed (m: the mixer, None for the pieces exactly as
    recorded, overlaps left as they add up, kept as-is in the 32-bit float WAV).
    -> L, R, {stem: (L, R)}, over (dB, mixed only)"""
    mixed = m is not None
    n = int((s.bars * 4 + 2) * B) + max(len(p) for p in pc.values()) + (2 * sr if mixed else 0)   # the last pieces in full (and the room's tail)
    def place(L, R, evs):
        for i, _, a in evs:
            src = pc[i]; e = min(n, a + len(src)); L[a:e] += src[:e - a, 0]; R[a:e] += src[:e - a, 1]
        return bool(evs)
    by_bus = {b: [e for e in s.events if BUS_OF.get(roles[e[0]]) == b] for b in BUSES}
    over = None
    if not mixed:
        L = np.zeros(n); R = np.zeros(n); place(L, R, s.events); parts = {}
        if stems:
            for b in BUSES:
                if by_bus[b]: parts[b] = (np.zeros(n), np.zeros(n)); place(*parts[b], by_bus[b])
    else:
        kicks = [a for i, _, a in s.events if roles[i] in ('kick', 'sub')]
        L, R, parts, over = mixdown(lambda b, bL, bR: place(bL, bR, by_bus[b]), n, plan, kicks, m, stems)
    idx = np.where(np.maximum(np.abs(L), np.abs(R)) > 1e-5)[0]
    ln = min(n, (idx[-1] if len(idx) else 0) + 1 + int(0.5 * sr))   # the last notes ring out, then 0.5 s
    return L[:ln], R[:ln], {k: (a[:ln], b[:ln]) for k, (a, b) in parts.items()}, over

def write_wav(path, L, R): wavfile.write(path, sr, np.stack([L, R], 1).astype(np.float32))

def make(seed,path,styles,humanize,roles,loops,chroma,mix=None,stems=False,arranged=None):
    """One song; roles, loops (in beats) and chroma: {piece number: ...}. Needs a
    riff or a phrase; what a missing role plays is left out (or played by the
    nearest role there is). mix: the mixer (None: the pieces exactly as
    recorded); stems: also each bus as its own WAV; arranged: a plan by hand."""
    r=np.random.default_rng(seed); R=random.Random(seed)
    pool={x:[i for i in sorted(roles) if roles[i]==x] for x in ROLES}
    riffs=pool['riff'] or pool['phrase']; phrases=pool['phrase'] or riffs
    def pick(xs,no=()):
        ok=[x for x in xs if x not in no]
        return R.choice(ok) if ok else R.choice(xs) if xs else None
    # choices made once, so what repeats sounds the same each time
    style=R.choice(styles); kin=[x for x in FAMILY[style] if x in styles]
    hook_style=R.choice(kin) if R.random()<0.4 else style          # every hook the same groove
    # intro/outro, verse, hook and bridge riff sets, each led by a different riff
    # where there are riffs enough, with the riffs most alike in notes to it (so
    # in the same key) after it in the pattern
    alike=lambda x,y:float(chroma[x]@chroma[y])
    order=[riffs[i] for i in r.permutation(len(riffs))]; step=max(1,len(riffs)//4)
    def riff_set(j):
        lead=order[(j*step)%len(order)]
        kin=[lead]+sorted([x for x in riffs if x!=lead],key=lambda x:-alike(x,lead))
        return [kin[x%len(kin)] for x in R.choice(PATTERNS)]
    intro_set,verse_set,hook_set,bridge_set=[riff_set(j) for j in range(4)]
    others=sorted([x for x in riffs if x not in hook_set],key=lambda x:-alike(x,hook_set[0]))
    layer=others[0] if others else None                            # another riff over hooks: the most alike in notes
    hook_layer=layer is not None and R.random()<0.5
    layer_fits=layer is not None and alike(layer,hook_set[0])>=0.45   # only one alike enough in notes: no clash on top
    bass_mode=R.choice(['alt','one','one','sparse'] if len(pool['bass'])>1 else ['one','sparse'] if pool['bass'] else ['none'])
    bass_a=pick(pool['bass']); bass_b=pick(pool['bass'],[bass_a])
    # a break gets the shortest hat loop (a shaker); a hook a hat other than the
    # verse's, and other than the shaker when there's a choice
    break_hat=min(pool['hat'],key=lambda i:len(pc[i]),default=None)
    verse_hat=pick(pool['hat']); hook_hat=pick(pool['hat'],[verse_hat,break_hat] if len(pool['hat'])>2 else [verse_hat])
    # the kit: the first kick in the recording, a second as the heavier one, an 808, and the rest
    kicks=pool['kick']
    kick=kicks[0] if kicks else pick(pool['sub']); heavy=kicks[1] if len(kicks)>1 else kick
    snare=pick(pool['snare']); sub=pick(pool['sub'])
    roll=pick(pool['roll'])
    kit=dict(kick=kick,heavy=heavy,sub=heavy if sub is None else sub,snare=snare,tick=pick(pool['tick']),
             roll=snare if roll is None else roll,fill=pick(pool['fill']))
    drawn=plan_song(R)   # (drawn even when arranged by hand, so every later choice is the seed's)
    plan=arranged or drawn; bars=plan[-1][1]+plan[-1][2]; hooks=sum(t=='hook' for t,_,_ in plan)
    s=Song(bars,r,humanize,loops)
    # how each section hands over, decided first: the bar before a hook may be
    # a stop bar, where everything lays out but the fill; a pre-hook's riser
    # runs straight into its hook
    into=[]
    for idx,(t,b,L) in enumerate(plan):
        nb=b+L-1; nxt=plan[idx+1][0] if idx<len(plan)-1 else None
        if nxt is None: into.append((nb,['roll','roll2','stutter']))   # the ending
        elif t=='pre': into.append((nb,['drop']))
        elif nxt=='hook' and L>=4 and R.random()<0.35: s.rest.add(nb); into.append((nb,['fill','stutter']))
        else: into.append((nb,INTO[nxt]))
    def walk(b,n,nxt,start=0,skip=lambda k,span:False):   # loops one after another, each for the whole bars it takes
        k=start; j=0
        while k<n:
            i=nxt(j); span=min(n-k,s.span(i))
            if not skip(k,span): s.loop(i,b+k,span)
            k+=span; j+=1
    def bass(b,n,start=0):
        walk(b,n,lambda j:[bass_a,bass_b][j%2] if bass_mode=='alt' else (None if r.random()<0.4 else R.choice(pool['bass'])) if bass_mode=='sparse' else bass_a,start)
    def riff(b,n,set_):   # lay out at a phrase's end, not mid-phrase
        walk(b,n,lambda j:set_[j%len(set_)],0,lambda k,span:(k+span)%4==0 and k+span<n and r.random()<0.2)
    verse_no=hook_no=0
    for idx,(t,b,L) in enumerate(plan):
        if t=='intro':   # previews: hats then a riff, a riff, or phrases
            c=R.choice(['riff','phr'] if verse_hat is None else ['riff','phr','hats'])
            if c=='riff': riff(b,L,intro_set)
            elif c=='phr': s.phrases(b,L,phrases)
            else:   # (the riff comes in so it ends with the intro: a long one never runs on over the verse's)
                at=max(0,min(L//2,L-s.span(intro_set[0]))); s.loop(verse_hat,b,L); s.loop(intro_set[0],b+at,L-at)
        elif t=='verse':   # the first verse builds: bass comes in halfway
            verse_no+=1
            riff(b,L,verse_set); bass(b,L,L//2 if verse_no==1 else 0); s.drums(style,b,L,kit); s.loop(verse_hat,b,L)
            # (its last 4 bars, or all of a shorter verse arranged by hand: never into the bars before it)
            if R.random()<0.4: s.phrases(b+L-min(4,L),min(4,L),phrases)
        elif t=='pre':   # the lift: the verse's riffs and hat, no kick, a riser into the hook
            riff(b,L,verse_set); s.loop(verse_hat,b,L); s.build(b,L,kit)
        elif t=='hook':   # the last hook is the fullest
            hook_no+=1
            riff(b,L,hook_set); bass(b,L); s.drums(hook_style,b,L,kit); s.loop(hook_hat,b,L)
            if layer_fits and (hook_layer or hook_no==hooks): riff(b,L,[layer])
        elif t=='break':   # strip back: no drums, no bass
            s.phrases(b,L,phrases)
            if R.random()<0.6: s.loop(break_hat,b,L)
        elif t=='bridge':   # contrast: another riff set, half-time
            riff(b,L,bridge_set); s.drums('half',b,L,kit)
            if R.random()<0.5: bass(b,L)
        elif t=='outro':   # the intro's riff again, winding down
            riff(b,L,intro_set)
            if R.random()<0.6: s.drums(style,b,L//2,kit)
            s.loop(verse_hat,b,L)
        if L==8 and t in ('verse','hook') and R.random()<0.3: s.fill(b+3,['tick','roll'],kit)   # mid-section turnaround
        s.fill(*into[idx],kit)
    s.hit(R.choice([kit['heavy'],kit['sub']]),bars*4)   # one last hit on the next downbeat
    yL,yR,parts,over=render(s,roles,plan,mix,stems)
    write_wav(path,yL,yR)
    for name,(a,b) in parts.items(): write_wav(f'{path[:-4]} - {name}.wav',a,b)
    peak=float(max(np.abs(yL).max(),np.abs(yR).max())) if len(yL) else 0.0
    return dict(style=style,alt=hook_style,bars=bars,beats=bars*4,dur=round(len(yL)/sr,1),peak=peak,over=over,
                plan=[(t,L) for t,_,L in plan],sections=[p[0] for p in plan],bass=bass_mode,stems=sorted(parts),events=len(s.events))

MIN_BARS, MAX_BARS = 25, 29   # 4 beats per bar -> 100-116 beats

def main():
    global MIN_BARS, MAX_BARS
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('input'); ap.add_argument('--count', type=int, default=20)
    ap.add_argument('--out', default='songs'); ap.add_argument('--seed', type=int, default=None)
    ap.add_argument('--min-bars', type=int, default=25); ap.add_argument('--max-bars', type=int, default=29)
    ap.add_argument('--save-pieces', default=None, help='folder to also save the split pieces')
    ap.add_argument('--silence-db', type=float, default=-90, help='quieter than this is silence (default -90)')
    ap.add_argument('--min-gap', type=float, default=0.2, help='shortest silence between pieces, seconds (default 0.2)')
    ap.add_argument('--styles', default=','.join(STYLES), help='drum styles songs pick from (default all: ' + ','.join(STYLES) + ')')
    ap.add_argument('--humanize', type=float, default=100, help='swing and timing drift, percent (default 100; 0 is a strict grid)')
    ap.add_argument('--bpm', type=float, default=None, help='the tempo the pieces were recorded at (default: heard from them)')
    ap.add_argument('--roles', default='', help='set pieces\' roles, e.g. 3=riff,6-8=hat,12=off (roles: ' + ','.join(ROLES) + ')')
    ap.add_argument('--plan', default=None, help='arrange every song by hand, e.g. intro:4,verse:8,pre:2,hook:8,outro:4 (sections: '
                    + ','.join(SECTIONS) + '; 1-16 bars each, 128 in all; overrides --min-bars/--max-bars)')
    mx = ap.add_argument_group('the mixer (on unless --raw)')
    mx.add_argument('--raw', action='store_true', help='no mixer: the pieces exactly as recorded, overlaps adding up past full scale')
    mx.add_argument('--levels', default='', help='bus levels in dB, -24 to 6, e.g. drums=0,hats=-2,bass=-1,keys=-1 (those are the defaults)')
    mx.add_argument('--reverb', type=float, default=MIX['reverb'], help=f"the room, 0-1 (default {MIX['reverb']})")
    mx.add_argument('--delay', type=float, default=MIX['delay'], help=f"the riffs' echo, 0-1 (default {MIX['delay']})")
    mx.add_argument('--pump', type=float, default=MIX['pump'], help=f"the bass and riffs ducking under the kick, 0-1 (default {MIX['pump']})")
    mx.add_argument('--width', type=float, default=MIX['width'], help=f"the hats off-centre and the room's width, 0-1 (default {MIX['width']})")
    mx.add_argument('--fade', action='store_true', help='fade the outro away to nothing')
    mx.add_argument('--no-sweep', action='store_true', help='no filter sweeps (intro opening up, pre-hook rising, break muffled)')
    ap.add_argument('--stems', action='store_true', help="also write each bus as its own WAV ('<song> - drums.wav', ...; mixed: and 'fx', the echo and room)")
    a = ap.parse_args()
    if not 8 <= a.min_bars <= a.max_bars: ap.error('need 8 <= --min-bars <= --max-bars')
    if a.count < 1: ap.error('--count must be 1 or more')
    styles = [x for x in a.styles.split(',') if x]
    if not styles or set(styles) - set(FAMILY): ap.error('--styles: any of '+','.join(STYLES))
    if not 0 <= a.humanize <= 200: ap.error('--humanize must be 0 to 200')
    if a.bpm is not None and not 40 <= a.bpm <= 250: ap.error('--bpm must be 40 to 250')
    try: arranged = plan_of(a.plan) if a.plan is not None else None
    except ValueError as e: ap.error(f'--plan: {e}')
    mix = None
    if not a.raw:
        m = dict(reverb=a.reverb, delay=a.delay, pump=a.pump, width=a.width, fade=a.fade, sweep=not a.no_sweep)
        for k in ('reverb', 'delay', 'pump', 'width'):
            if not LIMITS[k][0] <= m[k] <= LIMITS[k][1]: ap.error(f'--{k} must be 0 to 1')
        for part in filter(None, a.levels.split(',')):
            bus, _, db = part.partition('=')
            try: db = float(db)
            except ValueError: db = None
            if bus not in BUSES or db is None or not -24 <= db <= 6: ap.error(f'--levels: {part!r} is not like keys=-3 (buses: {",".join(BUSES)}; -24 to 6 dB)')
            m[bus] = db
        mix = mix_of(m)
    elif a.levels or a.fade or a.no_sweep: print('(--raw: the mixer settings are ignored)')
    MIN_BARS, MAX_BARS = a.min_bars, a.max_bars
    n = load_pieces(a.input, a.save_pieces, a.silence_db, a.min_gap); print(f'found {n} pieces')
    if not n: sys.exit('no pieces; try a different --silence-db or --min-gap')
    global B
    heard = {i: analyze_piece(p) for i, p in pc.items()}
    detected, _ = detect_tempo(list(heard.values()))
    bpm = a.bpm or detected or 120
    print(f'tempo {bpm:g} BPM', '(set)' if a.bpm else '(heard)' if detected else "(couldn't hear it; set it with --bpm)")
    B = 60 / bpm * sr
    roles = {i: guess_role(h, bpm) for i, h in heard.items()}
    for part in filter(None, a.roles.split(',')):   # 3=riff, 6-8=hat
        try:
            nums, role = part.split('='); lo, _, hi = nums.partition('-'); lo = int(lo); hi = int(hi or lo)
        except ValueError: ap.error(f'--roles: {part!r} is not like 3=riff or 6-8=hat')
        if role not in ROLES: ap.error(f'--roles: {role!r} is not one of ' + ','.join(ROLES))
        if not 1 <= lo <= hi <= n: ap.error(f'--roles: pieces are 1 to {n}')
        for i in range(lo, hi + 1): roles[i] = role
    print('roles:', ' '.join(f'{i}={roles[i]}' for i in sorted(roles)))
    if not any(x in ('riff', 'phrase') for x in roles.values()): sys.exit('needs a riff or a phrase; set one with --roles')
    loops = {i: loop_beats(h, bpm) for i, h in heard.items()}; chroma = {i: h['chroma'] for i, h in heard.items()}
    os.makedirs(a.out, exist_ok=True)
    # named for when they're made: now, then a minute later for each next song
    rnd = random.Random(a.seed); t = datetime.datetime.now()
    for _ in range(a.count):
        while os.path.exists(path := f"{a.out}/Beats {t:%d-%m-%Y %H-%M}.wav"):   # never overwrite
            t += datetime.timedelta(minutes=1)
        t += datetime.timedelta(minutes=1)
        info = make(rnd.randint(0, 10**9), path, styles, a.humanize / 100, roles, loops, chroma, mix, a.stems, arranged)
        style = info['style'] + (f"/{info['alt']}" if info['alt'] != info['style'] else '')
        over = f" peaks +{20*np.log10(info['peak']):.1f} dB" if info['peak'] > 1 else ''
        print(os.path.basename(path), info['beats'], 'beats', info['dur'], 's', style, '-'.join(info['sections']) + over)

if __name__ == '__main__':
    main()

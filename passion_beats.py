#!/usr/bin/env python3
"""
passion_beats.py (Orbit Beats, was Passion Beats) - split a recording of beat pieces and arrange them into new songs.

Usage:
  python passion_beats.py all_beats.wav --count 20 --out songs/
  python passion_beats.py all_beats.wav --count 5 --min-bars 25 --max-bars 29 --seed 42

Input: one WAV with each piece separated by silence (>0.2 s), all at one tempo.
Any number of pieces. The tempo and each piece's role (riff, bass, kick, ...)
are heard from the audio; --bpm and --roles set them instead.
Songs use the pieces exactly as recorded (no volume changes or effects); where
they overlap they add up, kept as-is in the 32-bit float WAV.
"""
import argparse, datetime, os, random, sys
import numpy as np
from scipy.io import wavfile

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
FAMILY = {'four':['four','broken','house'],'broken':['broken','four'],'hiphop':['hiphop','trap','boombap'],'trap':['trap','hiphop','drill'],'half':['half','hiphop'],'house':['house','four','jersey','amapiano'],'dembow':['dembow','afro'],'afro':['afro','dembow','amapiano'],'drill':['drill','trap'],'boombap':['boombap','hiphop'],'jersey':['jersey','house'],'amapiano':['amapiano','house','afro']}
STYLES = ['four','hiphop','trap','half','broken','house','dembow','afro','drill','boombap','jersey','amapiano']
# the body is verse-hook pairs, maybe a break first, maybe a break or bridge
# before a last hook; verses and hooks are 4 or 8 bars, breaks and bridges 2 or 4.
LENS = {'verse':[4,8],'hook':[4,8],'break':[2,4],'bridge':[2,4]}
FORMS = [['hook']] + [lead + ['verse','hook']*k + end for k in range(1,5) for lead in ([],['break']) for end in ([],['break','hook'],['bridge','hook'])]
PATTERNS = [[0,1,2,1],[0,1],[0,0,1,1],[0,1,0,2],[0]]   # riff sets, over a shuffled order of riffs
# fills fit where they lead
INTO = {'hook':['roll','roll2','stutter','fill'],'verse':['roll','roll2','tick','drop'],'break':['drop','tick'],'bridge':['drop','tick'],'outro':['roll','roll2','stutter']}

def fits(form, bars):   # every choice of section lengths adding up to `bars`
    if not form: return [[]] if bars == 0 else []
    return [[L] + rest for L in LENS[form[0]] if L <= bars for rest in fits(form[1:], bars - L)]

def plan_song(R):
    """[(type, first bar, bars)]: an even number of bars when the range has one."""
    evens = [t for t in range(MIN_BARS, MAX_BARS + 1) if t % 2 == 0]
    target = R.choice(evens) if evens else MIN_BARS
    choices = {}
    for intro in (2, 4):
        for outro in ((3,) if target % 2 else (2, 4)):
            for k, form in enumerate(FORMS):
                for lens in fits(form, target - intro - outro): choices.setdefault(k, []).append((intro, lens, outro))
    k = R.choice(sorted(choices)); form = FORMS[k]; intro, lens, outro = R.choice(choices[k])
    plan = [('intro', 0, intro)]; bar = intro
    for t, L in zip(form, lens): plan.append((t, bar, L)); bar += L
    return plan + [('outro', bar, outro)]

class Song:
    """The pieces exactly as recorded, placed on the recording's beat grid and
    summed: no volume changes, panning, cutting or effects; pieces may overlap.
    Humanize only moves when a piece starts."""
    def __init__(s,bars,rng,humanize,loops):   # pieces by number; None is none; loops: loop lengths in beats
        s.r=rng; s.py=random.Random(int(rng.integers(1e9))); s.bars=bars; s.rest=set()   # stop bars
        s.per=loops
        s.buf=np.zeros((int((bars*4+2)*B)+max(len(p) for p in pc.values()),2),np.float32)
        s.swing=rng.uniform(0,0.06)*humanize        # fraction of a beat pushed on off-16ths
        s.loose=rng.uniform(0.004,0.012)*humanize   # timing sd in seconds
    def hit(s,i,beat,tight=False):
        if i is None: return
        src=pc[i]
        if abs(beat%0.5-0.25)<1e-6: beat+=s.swing
        a=max(0,int(round(beat*B+s.r.normal(0,s.loose*(0.4 if tight else 1))*sr)))
        b=min(len(s.buf),a+len(src)); s.buf[a:b]+=src[:b-a]
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
            if not fit: break
            i=s.py.choice(fit); s.hit(i,t); t+=s.per[i]
    def drums(s,style,bar,nbars,k):   # k: the song's drum kit
        r=s.r
        for br in range(bar,bar+nbars):
            if br in s.rest: continue
            t=br*4
            if style=='four':
                for q in range(4): s.hit(k['kick'],t+q)
                if r.random()<0.15: s.hit(k['kick'],t+3.5)
            elif style=='hiphop':
                s.hit(k['heavy'],t); s.hit(k['snare'],t+2.5)
                if r.random()<0.35: s.hit(k['heavy'],t+1.75)
                if r.random()<0.2: s.hit(k['kick'],t+3.75)
            elif style=='trap':
                s.hit(k['sub'],t); s.hit(k['kick'],t+1.5); s.hit(k['sub'],t+2.75)
                if r.random()<0.3: s.hit(k['sub'],t+3.5)
            elif style=='half':
                s.hit(k['snare'],t)
                if r.random()<0.5: s.hit(k['heavy'],t+2.75)
            elif style=='broken':
                for q in s.py.choice([[0,1.5,2.5],[0,0.75,2.25,3],[0,2,2.75],[0,1.25,2.5,3.5]]): s.hit(s.py.choice([k['kick'],k['heavy'],k['sub']]),t+q)
            elif style=='house':   # four on the floor, the clap on 2 and 4, a tick on every off-beat
                for q in range(4): s.hit(k['kick'],t+q)
                s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
                for q in (0.5,1.5,2.5,3.5): s.hit(k['tick'],t+q)
            elif style=='dembow':   # reggaeton's: the kick on the beat, the snare's 3+3+2 against it
                for q in range(4): s.hit(k['kick'],t+q)
                for q in (0.75,1.5,2.75,3.5): s.hit(k['snare'],t+q)
            elif style=='afro':   # afrobeats': a kick that skips, the snare on 2 and 4, a shaker's push
                for q in (0,1.5,2.5): s.hit(k['heavy'],t+q)
                s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
                if r.random()<0.5: s.hit(k['snare'],t+3.75)
                for q in (0.5,1.75,2.25,3.25): s.hit(k['tick'],t+q)
            elif style=='drill':   # drill's: the 808 sliding round the kick, the snare late on 3 and pushed, its hats in threes
                s.hit(k['sub'],t); s.hit(k['heavy'],t+2.75)
                if r.random()<0.5: s.hit(k['sub'],t+1.5)
                s.hit(k['snare'],t+2); s.hit(k['snare'],t+3.5 if r.random()<0.5 else t+3.75)
                for q in (0,0.75,1.5,2.25,3,3.75): s.hit(k['tick'],t+q)
            elif style=='boombap':   # boom bap's: the kick's skip, the snare on 2 and 4, eighth-note hats
                s.hit(k['heavy'],t); s.hit(k['kick'],t+2.5)
                if r.random()<0.5: s.hit(k['kick'],t+1.75)
                s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
                for q in (0.5,1.5,2.5,3.5): s.hit(k['tick'],t+q)
            elif style=='jersey':   # Jersey club's: the kicks' bounce, the clap on 2 and 4
                for q in (0,1,2,2.75,3.5): s.hit(k['kick'],t+q)
                s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
                if r.random()<0.4: s.hit(k['snare'],t+3.75)
            elif style=='amapiano':   # amapiano's: the kick on the beat, the log drum's syncopation, a rim on 4, a shaker on every off-16th
                for q in range(4): s.hit(k['kick'],t+q)
                for q in (0.75,2.25,3.5): s.hit(k['sub'],t+q)
                s.hit(k['snare'],t+3)
                for q in (0.25,0.75,1.25,1.75,2.25,2.75,3.25,3.75): s.hit(k['tick'],t+q)
            if r.random()<0.35 and style not in ('drill','boombap','amapiano'):   # ticks between the hits
                for q in s.py.choice([[0.5],[1.5,3.5],[0.5,1.5,2.5,3.5]]): s.hit(k['tick'],t+q)
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
    def render(s,path):   # the last notes ring out, then 0.5 s; overlaps are left as they add up
        y=s.buf
        idx=np.where(np.abs(y).max(1)>1e-5)[0]; y=y[:idx[-1]+1+int(0.5*sr)]
        wavfile.write(path,sr,y.astype(np.float32)); return len(y)/sr, float(np.abs(y).max())

def make(seed,path,styles,humanize,roles,loops,chroma):
    """One song; roles, loops (in beats) and chroma: {piece number: ...}. Needs a
    riff or a phrase; what a missing role plays is left out (or played by the
    nearest role there is)."""
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
    plan=plan_song(R); bars=plan[-1][1]+plan[-1][2]; hooks=sum(t=='hook' for t,_,_ in plan)
    s=Song(bars,r,humanize,loops)
    # how each section hands over, decided first: the bar before a hook may be
    # a stop bar, where everything lays out but the fill
    into=[]
    for idx,(t,b,L) in enumerate(plan):
        nb=b+L-1; nxt=plan[idx+1][0] if idx<len(plan)-1 else None
        if nxt is None: into.append((nb,['roll','roll2','stutter']))
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
            else: s.loop(verse_hat,b,L); s.loop(intro_set[0],b+L//2,L-L//2)
        elif t=='verse':   # the first verse builds: bass comes in halfway
            verse_no+=1
            riff(b,L,verse_set); bass(b,L,L//2 if verse_no==1 else 0); s.drums(style,b,L,kit); s.loop(verse_hat,b,L)
            if R.random()<0.4: s.phrases(b+L-4,4,phrases)
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
    dur,peak=s.render(path)
    return dict(style=style,alt=hook_style,bars=bars,beats=bars*4,dur=round(dur,1),peak=peak,sections=[p[0] for p in plan],bass=bass_mode)

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
    ap.add_argument('--styles', default=','.join(STYLES), help='drum styles songs pick from (default all)')
    ap.add_argument('--humanize', type=float, default=100, help='swing and timing drift, percent (default 100; 0 is a strict grid)')
    ap.add_argument('--bpm', type=float, default=None, help='the tempo the pieces were recorded at (default: heard from them)')
    ap.add_argument('--roles', default='', help='set pieces\' roles, e.g. 3=riff,6-8=hat,12=off (roles: ' + ','.join(ROLES) + ')')
    a = ap.parse_args()
    if not 8 <= a.min_bars <= a.max_bars: ap.error('need 8 <= --min-bars <= --max-bars')
    if a.count < 1: ap.error('--count must be 1 or more')
    styles = [x for x in a.styles.split(',') if x]
    if not styles or set(styles) - set(FAMILY): ap.error('--styles: any of '+','.join(STYLES))
    if not 0 <= a.humanize <= 200: ap.error('--humanize must be 0 to 200')
    if a.bpm is not None and not 40 <= a.bpm <= 250: ap.error('--bpm must be 40 to 250')
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
        info = make(rnd.randint(0, 10**9), path, styles, a.humanize / 100, roles, loops, chroma)
        over = f" peaks +{20*np.log10(info['peak']):.1f} dB" if info['peak'] > 1 else ''
        print(os.path.basename(path), info['beats'], 'beats', info['dur'], 's', info['style'], '-'.join(info['sections']) + over)

if __name__ == '__main__':
    main()

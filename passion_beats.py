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
from scipy.linalg import hadamard

sr = 48000
B = 60 / 120 * sr   # samples per beat, once the tempo is known
pc = {}

# what a piece does in a song (the same as public/engine.mjs; see MAP.md)
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

# ---- Hearing a recording (the same as public/analyze.mjs; see MAP.md) ----

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

# Arrangement rules (the same as public/engine.mjs; see MAP.md):
# a hook may lift to a related groove, never a foreign one;
FAMILY = {'four':['four','broken','house','techno'],'broken':['broken','four','garage','dnb'],'hiphop':['hiphop','trap','boombap','lofi'],'trap':['trap','hiphop','drill','phonk'],
          'half':['half','hiphop'],'house':['house','four','jersey','amapiano','garage'],'dembow':['dembow','afro','reggae','baile'],'afro':['afro','dembow','amapiano'],
          'drill':['drill','trap'],'boombap':['boombap','hiphop','lofi'],'jersey':['jersey','house','baile'],'amapiano':['amapiano','house','afro'],
          'lofi':['lofi','boombap','hiphop'],'funk':['funk','broken','boombap'],'garage':['garage','house','broken'],'dnb':['dnb','broken'],
          'reggae':['reggae','dembow'],'phonk':['phonk','trap','drill'],'baile':['baile','dembow','jersey'],'techno':['techno','four','house'],
          'jazz':['jazz','bossa','blues','neosoul'],'bossa':['bossa','jazz','samba'],'samba':['samba','bossa','baile'],'salsa':['salsa','cumbia','samba'],
          'rock':['rock','punk','metal','blues'],'punk':['punk','rock'],'metal':['metal','rock'],'citypop':['citypop','disco','funk','neosoul'],
          'kpop':['kpop','house','trap'],'synthwave':['synthwave','citypop','four'],'disco':['disco','house','funk','citypop'],'gospel':['gospel','neosoul','blues'],
          'neosoul':['neosoul','lofi','hiphop','gospel'],'ballad':['ballad','half','cinematic'],'ambient':['ambient','half','ballad'],'cinematic':['cinematic','half','ambient'],
          'chiptune':['chiptune','synthwave','four'],'kizomba':['kizomba','dembow','afro'],'highlife':['highlife','afro','amapiano'],'cumbia':['cumbia','reggae','dembow','salsa'],
          'bhangra':['bhangra','dembow','afro'],'dubstep':['dubstep','trap','half'],'footwork':['footwork','jersey','trap'],'jungle':['jungle','dnb','broken'],
          'trance':['trance','techno','house','four'],'hardstyle':['hardstyle','techno','trance'],'chinese':['chinese','ballad','lofi'],'blues':['blues','jazz','rock','gospel'],
          'country':['country','rock','ballad']}
STYLES = ['four','hiphop','trap','half','broken','house','dembow','afro','drill','boombap','jersey','amapiano','lofi','funk','garage','dnb','reggae','phonk','baile','techno',
          'jazz','bossa','samba','salsa','rock','punk','metal','citypop','kpop','synthwave','disco','gospel','neosoul','ballad','ambient','cinematic','chiptune','kizomba','highlife','cumbia','bhangra','dubstep','footwork','jungle','trance','hardstyle','chinese','blues','country']
SECTIONS = ['intro','verse','pre','hook','break','bridge','outro']
# the body is verse-hook pairs (each verse maybe with a pre-hook before its
# hook, every one the same), maybe a break first, maybe a break or bridge
# before a last hook; verses and hooks are 4 or 8 bars, pre-hooks, breaks and
# bridges 2 or 4: phrases come in fours.
LENS = {'verse':[4,8],'pre':[2,4],'hook':[4,8],'break':[2,4],'bridge':[2,4]}
FORMS = [['hook']] + [lead + (['verse','pre','hook'] if pre else ['verse','hook'])*k + end
                      for pre in (False, True) for k in range(1,5) for lead in ([],['break']) for end in ([],['break','hook'],['bridge','hook'])]
PATTERNS = [[0,1,2,1],[0,1],[0,0,1,1],[0,1,0,2],[0]]   # riff sets, over a shuffled order of riffs
# a varied song's drum touches (--varied; the page's radio): their own random stream, so nothing else in the song moves.
# verses one, hooks two more, the last hook a third, the bridge a fifth; and how a phrase ends
FLAVORS = ['ghost','push','skip','open','snap']
TURNS = ['tick','snare','kick','none']
def dress_of(V):
    order = V.sample(FLAVORS, len(FLAVORS))
    hook = order[1:3]
    return dict(verse=(order[:1], V.choice(TURNS)), hook=(hook, V.choice(TURNS)), last=(hook + order[3:4], V.choice(TURNS)), bridge=(order[4:5], 'none'))
# fills fit where they lead: a build into a hook, something light into a
# verse, next to nothing into a quiet section (a pre-hook's riser is its own)
INTO = {'hook':['roll2','stutter','fill','fill'],'verse':['roll','roll2','tick','drop'],'pre':['tick','drop'],'break':['drop','tick'],
        'bridge':['drop','tick'],'outro':['roll','roll2','stutter'],'intro':['drop','tick']}
MAX_PLAN_BARS = 400

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
    known section of 1 to 16 bars, 400 bars at most in all. -> the plan"""
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
def _jazz(s,t,k):   # swing: the ride's ding, ding-a ding, the brush on 2 and 4, a feathered kick, a bomb now and then
    s.hit(k['kick'],t); s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in (0,1,1.5,2,3,3.5): s.hit(k['tick'],t+q)
    if s.r.random()<0.3: s.hit(k['roll'],t+2.5)
    if s.r.random()<0.25: s.hit(k['heavy'],t+3.5)
def _bossa(s,t,k):   # bossa nova's: the kick's two-beat lilt, the rim's clave, a shaker on every 16th
    for q in (0,1.5,2,3.5): s.hit(k['kick'],t+q)
    for q in (0,0.75,1.5,2.5,3): s.hit(k['snare'],t+q)
    for q in np.arange(0,4,0.25):
        if q%1==0 or s.r.random()<0.85: s.hit(k['tick'],t+q)
def _samba(s,t,k):   # samba's: the surdos answering on 2 and 4, the tamborim's syncopation, sixteenths shaken
    s.hit(k['kick'],t); s.hit(k['heavy'],t+1); s.hit(k['kick'],t+2); s.hit(k['heavy'],t+3)
    for q in (0.5,0.75,1.75,2.5,3.25,3.5): s.hit(k['snare'],t+q)
    for q in np.arange(0,4,0.25): s.hit(k['tick'],t+q)
    if s.r.random()<0.3: s.hit(k['roll'],t+3.75)
def _salsa(s,t,k):   # salsa's: the clave (three, then two) on the sticks, the bell on the beat, the bass drum's push
    s.hit(k['kick'],t+1.5); s.hit(k['heavy'],t+3.5)
    for q in (0,0.75,1.5,2.5,3): s.hit(k['snare'],t+q)
    for q in (0,1,2,3): s.hit(k['tick'],t+q)
    if s.r.random()<0.5: s.hit(k['tick'],t+0.5); s.hit(k['tick'],t+2.5)
def _rock(s,t,k):   # rock's: the kick on 1 and 3 and the and of 3, the snare on 2 and 4, eighths on the hat
    s.hit(k['heavy'],t); s.hit(k['kick'],t+2); s.hit(k['kick'],t+2.5)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in np.arange(0,4,0.5): s.hit(k['tick'],t+q)
    if s.r.random()<0.3: s.hit(k['kick'],t+3.5)
    if s.r.random()<0.2: s.hit(k['kick'],t+1.75)
def _punk(s,t,k):   # pop-punk's: fast, the kick on 1 and 2-and, or the skate beat (snare on every off-beat)
    if s.r.random()<0.35:
        for q in range(4): s.hit(k['kick'],t+q); s.hit(k['snare'],t+q+0.5)
    else:
        s.hit(k['heavy'],t); s.hit(k['kick'],t+1.5); s.hit(k['kick'],t+2)
        s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in np.arange(0,4,0.5): s.hit(k['tick'],t+q)
def _metal(s,t,k):   # metal's half-time chug: double kicks in sixteenths (or galloping), one huge snare on 3
    if s.r.random()<0.5:
        for q in np.arange(0,4,0.25): s.hit(k['kick'],t+q)
    else:
        for q in range(4):
            for d in (0,0.5,0.75): s.hit(k['kick'],t+q+d)
    s.hit(k['heavy'],t); s.hit(k['snare'],t+2)
    for q in range(4): s.hit(k['tick'],t+q)
def _citypop(s,t,k):   # city pop's: a dance-floor kick that skips into 3, the snare on 2 and 4, busy sixteenths
    s.hit(k['heavy'],t); s.hit(k['kick'],t+1.5); s.hit(k['kick'],t+2); s.hit(k['kick'],t+2.75)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in np.arange(0,4,0.25):
        if q%0.5==0 or s.r.random()<0.6: s.hit(k['tick'],t+q)
    if s.r.random()<0.3: s.hit(k['roll'],t+3.75)
def _kpop(s,t,k):   # K-pop and J-pop dance: four on the floor with a kick before the bar, a hat roll into the next
    for q in range(4): s.hit(k['kick'],t+q)
    s.hit(k['kick'],t+3.5); s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in (0.5,1.5,2.5): s.hit(k['tick'],t+q)
    if s.r.random()<0.4:
        for q in (3,3.25,3.5,3.75): s.hit(k['tick'],t+q)
def _synthwave(s,t,k):   # synthwave's: the eighties drum machine, a big gated snare on 2 and 4
    s.hit(k['heavy'],t); s.hit(k['kick'],t+2)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in (0.5,1.5,2.5,3.5): s.hit(k['tick'],t+q)
    if s.r.random()<0.5: s.hit(k['kick'],t+2.75)
def _disco(s,t,k):   # disco's: four on the floor, the snare on 2 and 4, the open hat's tss and its little ka before
    for q in range(4): s.hit(k['kick'],t+q)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in (0.25,0.5,1.25,1.5,2.25,2.5,3.25,3.5): s.hit(k['tick'],t+q)
    if s.r.random()<0.25: s.hit(k['roll'],t+3.75)
def _gospel(s,t,k):   # gospel's shuffle: a kick that rolls into 2, a heavy backbeat, shuffled eighths
    s.hit(k['heavy'],t); s.hit(k['kick'],t+0.75); s.hit(k['kick'],t+1.5); s.hit(k['kick'],t+2.5)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in np.arange(0,4,0.5): s.hit(k['tick'],t+q)
    if s.r.random()<0.35: s.hit(k['roll'],t+3.5)
def _neosoul(s,t,k):   # neo-soul's: a lazy kick, the snare on 2 and 4, a ghost note, hats that come and go
    s.hit(k['heavy'],t); s.hit(k['kick'],t+1.75); s.hit(k['kick'],t+2.5)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    if s.r.random()<0.5: s.hit(k['roll'],t+2.75)
    for q in np.arange(0,4,0.5):
        if s.r.random()<0.7: s.hit(k['tick'],t+q)
def _ballad(s,t,k):   # a ballad's: the kick on 1 (and the and of 2), the snare once on 3, quarters on the hat
    s.hit(k['heavy'],t); s.hit(k['snare'],t+2)
    if s.r.random()<0.5: s.hit(k['kick'],t+1.5)
    for q in range(4): s.hit(k['tick'],t+q)
def _ambient(s,t,k):   # ambient's: hardly there, a soft kick on 1 and a shaker's breath on 2 and 4
    s.hit(k['kick'],t)
    s.hit(k['tick'],t+1); s.hit(k['tick'],t+3)
    if s.r.random()<0.3: s.hit(k['tick'],t+2.5)
def _cinematic(s,t,k):   # a film score's: war drums, the big hit on 1, toms marching, one huge snare
    s.hit(k['heavy'],t); s.hit(k['kick'],t+0.75); s.hit(k['kick'],t+1.5); s.hit(k['heavy'],t+2); s.hit(k['snare'],t+3)
    if s.r.random()<0.4: s.hit(k['roll'],t+3.5)
def _chiptune(s,t,k):   # 8-bit's: a game's kick and noise snare, the hat chattering in sixteenths
    s.hit(k['kick'],t); s.hit(k['kick'],t+1.5); s.hit(k['kick'],t+2.5)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in np.arange(0,4,0.25):
        if q%0.5==0 or s.r.random()<0.5: s.hit(k['tick'],t+q)
def _kizomba(s,t,k):   # kizomba's (and zouk's): a slow, swaying kick, the snare on 2 and 4, the rim's tresillo
    s.hit(k['heavy'],t); s.hit(k['kick'],t+1.5); s.hit(k['kick'],t+2)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in (0.5,0.75,2.5,2.75,3.75): s.hit(k['tick'],t+q)
def _highlife(s,t,k):   # highlife's: the bell's pattern over a kick that skips, light snares on 2 and 4
    s.hit(k['kick'],t); s.hit(k['kick'],t+1.5); s.hit(k['kick'],t+2.5)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in (0,0.5,1.25,1.75,2.5,3.25,3.75): s.hit(k['tick'],t+q)
def _cumbia(s,t,k):   # cumbia's: the güiro's chu-chucu on every beat, the kick on 1 and 3, the drum on the and of 2 and 4
    s.hit(k['heavy'],t); s.hit(k['kick'],t+2)
    if s.r.random()<0.5: s.hit(k['kick'],t+1.75)
    s.hit(k['snare'],t+1.5); s.hit(k['snare'],t+3.5)
    for q in range(4):
        for d in (0,0.5,0.75): s.hit(k['tick'],t+q+d)
def _bhangra(s,t,k):   # bhangra's: the dhol's chaal, its bass head on 1 and 3 with the pickups, the high head on 2 and 4
    for q in (0,0.75,2,2.75): s.hit(k['heavy'],t+q)
    for q in (1,1.5,3,3.5): s.hit(k['snare'],t+q)
    for q in np.arange(0,4,0.5): s.hit(k['tick'],t+q)
def _dubstep(s,t,k):   # dubstep's half-time: the heavy kick, the snare on 3, kicks that stumble
    s.hit(k['heavy'],t); s.hit(k['snare'],t+2)
    if s.r.random()<0.5: s.hit(k['kick'],t+0.75)
    s.hit(k['kick'],t+3.25)
    for q in np.arange(0,4,0.5): s.hit(k['tick'],t+q)
def _footwork(s,t,k):   # footwork's (juke): kicks in threes against the beat, claps on 2 and 4, sixteenth hats
    for q in (0,0.75,1.5,2.5,3.25): s.hit(k['kick'],t+q)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    s.hit(k['sub'],t+2.25)
    for q in np.arange(0,4,0.25): s.hit(k['tick'],t+q)
def _jungle(s,t,k):   # jungle's chopped break (the Amen's shape)
    s.hit(k['heavy'],t); s.hit(k['kick'],t+0.5); s.hit(k['kick'],t+2.5); s.hit(k['kick'],t+2.75)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+1.75); s.hit(k['snare'],t+3)
    s.hit(k['snare'],t+3.75 if s.r.random()<0.5 else t+3.5)
    for q in np.arange(0,4,0.5): s.hit(k['tick'],t+q)
def _trance(s,t,k):   # trance's: four on the floor, the clap on 2 and 4, the hat rolling on each off-beat and the 16th after
    for q in range(4): s.hit(k['kick'],t+q)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in (0.5,0.75,1.5,1.75,2.5,2.75,3.5,3.75): s.hit(k['tick'],t+q)
def _hardstyle(s,t,k):   # hardstyle's: the distorted kick on every beat, its reverse bass on every off-beat
    for q in range(4): s.hit(k['heavy'],t+q); s.hit(k['sub'],t+q+0.5)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    if s.r.random()<0.3: s.hit(k['tick'],t+3.75)
def _chinese(s,t,k):   # 中國風: a pop ballad's beat, the kick's skip, the snare on 2 and 4, a woodblock's push
    s.hit(k['heavy'],t); s.hit(k['kick'],t+0.75); s.hit(k['kick'],t+2.5)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in (0,1,2,3,3.5): s.hit(k['tick'],t+q)
def _blues(s,t,k):   # the blues shuffle: the kick walking 1, 2-and, 3, 4-and, the snare on 2 and 4, shuffled eighths
    for q in (0,1.5,2,3.5): s.hit(k['kick'],t+q)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in np.arange(0,4,0.5): s.hit(k['tick'],t+q)
def _country(s,t,k):   # country's boom-chick: the kick on 1 and 3, the snare on 2 and 4, eighths, a pickup
    s.hit(k['heavy'],t); s.hit(k['kick'],t+2)
    s.hit(k['snare'],t+1); s.hit(k['snare'],t+3)
    for q in np.arange(0,4,0.5): s.hit(k['tick'],t+q)
    if s.r.random()<0.3: s.hit(k['snare'],t+3.5)
GROOVES = {x: globals()['_' + x] for x in STYLES}
# the grooves whose hats are part of them: no extra ticks
FULL_HATS = {'drill','boombap','amapiano','lofi','funk','garage','dnb','reggae','phonk','baile','techno',*STYLES[20:]}
# the swung grooves: each off-beat eighth played late, by this share of a 16th (2/3 a full triplet), every hit of the song
SHUFFLE = {'jazz':0.62,'blues':0.66,'gospel':0.56}

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
        s.sh=0                                      # a swung groove's off-beat eighths, late by this (beats)
    def hit(s,i,beat,tight=False):
        if i is None: return
        at=beat
        if abs(beat%0.5-0.25)<1e-6: beat+=s.swing
        elif s.sh and abs(beat%1-0.5)<1e-6: beat+=s.sh
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
    def drums(s,style,bar,nbars,k,dress=None):   # k: the song's drum kit; dress: (flavors, turn) of a varied song
        for br in range(bar,bar+nbars):
            if br in s.rest: continue
            t=br*4
            GROOVES.get(style,_four)(s,t,k)
            if s.r.random()<0.35 and style not in FULL_HATS:   # ticks between the hits
                for q in s.py.choice([[0.5],[1.5,3.5],[0.5,1.5,2.5,3.5]]): s.hit(k['tick'],t+q)
            if dress: s.dressed(style,br,br-bar,nbars,t,k,*dress)
    def dressed(s,style,br,at,nbars,t,k,flavors,turn):   # a bar's own touches, none of them drawn (a song's other choices stay put)
        for f in flavors:
            if f=='ghost':
                for q in (0.75,2.75): s.hit(k['tick'],t+q)
            elif f=='push' and br%2: s.hit(k['kick'],t+3.75)
            elif f=='skip' and br%2==0: s.hit(k['kick'],t+2.75)
            elif f=='open' and style not in FULL_HATS:
                for q in (0.5,1.5,2.5,3.5): s.hit(k['tick'],t+q)
            elif f=='snap' and at%2: s.hit(k['snare'],t+1.75)
        if nbars>=4 and at%4==3:   # the end of a phrase turns
            if turn=='tick':
                for q in (3.25,3.5,3.75): s.hit(k['tick'],t+q)
            elif turn in ('snare','kick'):
                for q in (3.5,3.75): s.hit(k[turn],t+q)
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

# ---- The mixer (the same steps as public/lib/mix.mjs; see MAP.md) ----
# Each piece plays on its bus (drums, hats, bass, the riffs and phrases as
# keys), each bus its level; the drums and the bass glued by a 2:1 compressor
# and kept clear of the sub (a phone's speaker plays their harmonics, not the
# bottom octave); the riffs brightened at the top, set wide (the middle stays
# put, so a mono speaker hears them as they were), and put into an echo (a
# dotted eighth left, an eighth right) and a room; the snare and hats a little
# of the room too, the kick and bass none; the bass and the riffs ducking under
# the kick (the pump); the riffs opening up through the intro, rising out of
# the way over a pre-hook, muffled in a break; the hats a little to one side.
# Then the whole song brought to one loudness (an RMS, not a peak), warmed by
# a soft saturation and held under -1 dBFS by a limiter that looks ahead, so
# nothing clips whatever the format.

BUSES = ['drums','hats','bass','keys']
BUS_OF = dict(riff='keys',phrase='keys',bass='bass',hat='hats',tick='hats',fill='drums',kick='drums',sub='drums',snare='drums',roll='drums')
MIX = dict(on=True,drums=0,hats=-2,bass=-1,keys=-1,reverb=0.25,delay=0.2,pump=0.3,sweep=True,width=0.4,fade=False)   # levels in dB, the rest 0-1
LIMITS = dict(drums=(-24,6),hats=(-24,6),bass=(-24,6),keys=(-24,6),reverb=(0,1),delay=(0,1),pump=(0,1),width=(0,1))
db_gain = lambda d: 10 ** (d / 20)
CEILING = db_gain(-1)
LOUDNESS = -15   # the song's RMS (dBFS) after the master
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

FDN = [1031, 1327, 1621, 1913, 2203, 2503, 2791, 3137]   # the room's eight delays (samples at 44.1 kHz)
FDN_FEED, FDN_DAMP, FDN_OUT = 0.85, 6000, 0.45
H8 = hadamard(8).astype(np.float64)
def room(send):
    """The room: an 8-line feedback delay network (Jot's: eight delays of 23 to 71
    ms, fed back through a Hadamard matrix at 0.85, each line darkened by a
    one-pole low-pass at 6 kHz as it goes round, so the highs die first). The mono
    send enters through a stereo pre-delay (20 ms on the even lines, 27 ms on the
    odd) and the two sides are taken from different mixes of the lines. Worked a
    block of the shortest delay at a time (a line's output is what it wrote one
    delay ago, so a block never needs its own). -> L, R"""
    n = len(send); k = sr / 44100
    d = [max(2, jround(v * k)) for v in FDN]; blk = min(d)
    c = coef(FDN_DAMP); g = FDN_FEED * np.sqrt(1 / 8); o = FDN_OUT * np.sqrt(1 / 8)
    pre = lambda ms: np.r_[np.zeros(jround(ms * sr)), send][:n]
    ins = [pre(0.02), pre(0.027)]
    sl = np.array([1, 1, -1, -1, 1, 1, -1, -1.]); sr_ = np.array([1, -1, -1, 1, 1, -1, -1, 1.])
    hist = [np.zeros(di) for di in d]; dark = np.zeros(8); L = np.zeros(n); R = np.zeros(n)
    for s in range(0, n, blk):
        m = min(blk, n - s)
        Y = np.stack([h[:m] for h in hist])   # what each line wrote one delay ago
        L[s:s + m] = o * (sl @ Y); R[s:s + m] = o * (sr_ @ Y)
        F = (H8 @ Y) * g
        for i in range(8):
            lp = lowpass(F[i], c, dark[i]); dark[i] = lp[-1]
            hist[i] = np.concatenate([hist[i][m:], lp + ins[i & 1][s:s + m]])
    return L, R

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

GLUE_BLOCK = 4096
def glue(bL, bR, ratio=2, atk=0.01, rel=0.12, knee=6, over=3):
    """The glue: a 2:1 compressor on a bus (L and R together), in place. Its level
    detector is the greater of two smoothed powers (10 ms and 120 ms: quick to rise,
    slow to let go), read every fourth sample; the threshold sits 3 dB over the bus's
    own average (over where it plays), a soft knee 6 dB wide, the gain worked every 16
    samples and eased between. -> the gain that brings the bus back to the power it had."""
    n = len(bL)
    if n == 0: return 1.0
    p4 = bL[::4] ** 2 + bR[::4] ** 2
    per = GLUE_BLOCK // 4; nb = -(-n // GLUE_BLOCK)
    pad = np.zeros(nb * per); pad[:len(p4)] = p4; pb = pad.reshape(nb, per).sum(1) / (2 * per)
    top = pb.max()
    if not top > 0: return 1.0
    thr = 10 * np.log10(pb[pb > 0.05 * top].mean()) + over
    cA = 1 - np.exp(-4 / (atk * sr)); cR = 1 - np.exp(-4 / (rel * sr))
    q = p4 * 0.5
    env = np.maximum(lowpass(q, cA), lowpass(q, cR))[::4]
    o = 10 * np.log10(env + 1e-20) - thr; slope = 1 - 1 / ratio
    gr = np.where(2 * o < -knee, 0, np.where(2 * np.abs(o) <= knee, slope * (o + knee / 2) ** 2 / (2 * knee), slope * o))
    gb = 10 ** (-gr / 20); gb = np.r_[gb, gb[-1]]
    j = np.arange(n); k = j >> 4; g = gb[k] + (gb[k + 1] - gb[k]) * ((j & 15) / 16)
    before = (bL ** 2 + bR ** 2).sum(); bL *= g; bR *= g; after = (bL ** 2 + bR ** 2).sum()
    return np.sqrt(before / after) if after > 0 else 1.0

def widen(bL, bR, amount):
    """Set wide: a copy of what is above 300 Hz of the middle, 11 ms late and 19 ms late
    (the second the other way up), added to the left and taken from the right. The sum of
    the two sides is still the middle, so a mono speaker hears the riffs as they were."""
    if not amount: return
    n = len(bL); d1, d2 = jround(0.011 * sr), jround(0.019 * sr)
    mid = (bL + bR) * 0.5; h = mid - lowpass(mid, coef(300)); s = np.zeros(n)
    if d1 < n: s[d1:] += 0.7 * h[:n - d1]
    if d2 < n: s[d2:] -= 0.5 * h[:n - d2]
    bL += amount * s; bR -= amount * s

def mix_buses(place, n, plan, kicks, m, stems=False):
    """`place(bus, L, R)` sums a bus's hits into L and R and says whether it had
    any; `kicks`: where each kick and 808 starts; `plan`: the sections. The buses,
    mixed: their levels, tone, glue, width, echo, the room and the fade, no loudness
    yet. -> L, R, {stem: (L, R)} (the buses and 'fx', the echo's and room's)"""
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
        keys, rhythm = name == 'keys', name in ('drums', 'bass')
        if send is not None:   # the riffs and hats to the room; the drums' top (the snare, not the kick's thump), from the left
            if keys: send += (bL + bR) * 0.75 * m['reverb']
            elif name == 'hats': send += (bL + bR) * 0.3 * m['reverb']
            elif name == 'drums': send += (bL - lowpass(lowpass(bL, coef(500)), coef(500))) * 0.6 * m['reverb']
        echo = (bL + bR) / 2 if keys and m['delay'] else None   # the riffs as they were, for the echo
        if rhythm:   # the tone: some of what is under 100 / 90 Hz taken out of the middle, the rumble under 30 Hz gone
            mid = (bL + bR) * 0.5; side = bL - mid
            w = mid - (0.25 if name == 'drums' else 0.3) * lowpass(mid, coef(100 if name == 'drums' else 90))
            w = w - lowpass(w, coef(30)); bL, bR = w + side, w - side
        elif keys:   # most of what is under 150 Hz taken out and a little of 150 to 500 (the bottom left to the bass and kick), +2.5 dB over 3 kHz
            kL, kR = lowpass(bL, coef(150)), lowpass(bR, coef(150))
            bL = bL - 0.6 * kL - 0.3 * (lowpass(bL, coef(500)) - kL); bR = bR - 0.6 * kR - 0.3 * (lowpass(bR, coef(500)) - kR)
            c = coef(3000); bL = bL + 0.334 * (bL - lowpass(bL, c)); bR = bR + 0.334 * (bR - lowpass(bR, c))
        back = glue(bL, bR) if rhythm else 1
        if keys: widen(bL, bR, 1.2 * m['width'])
        if echo is not None:   # the echo: darkened at 3 kHz
            dark = one_pole(echo, 3000); amt = m['delay'] * 0.45
            bL += comb(dark, max(1, jround(0.75 * B)), 0.35) * amt
            bR += comb(dark, max(1, jround(0.5 * B)), 0.35) * amt
        bL *= back; bR *= back
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
    return L, R, out

def loudness(L, R):
    """The mean power (per side) after a 100 Hz high-pass, over the 0.4 s blocks within 10 dB of the average."""
    n = len(L); blk = max(1, jround(0.4 * sr)); nb = -(-n // blk); c = coef(100)
    pad = np.zeros(nb * blk); pad[:n] = (L - lowpass(L, c)) ** 2 + (R - lowpass(R, c)) ** 2
    pb = pad.reshape(nb, blk).sum(1) / (2 * blk) if nb else pad
    allm = pb.sum() / (nb or 1); act = pb[pb > 0.1 * allm]
    return act.mean() if len(act) else 0.0

SAT = 1 / 1.3 ** 2   # the soft saturation: a sample's gain is 1 / sqrt(1 + (a / 1.3)^2) of the louder side's size

def master(L, R, out):
    """The song brought to one loudness (its RMS to LOUDNESS, the loudest moment never
    more than 8 dB past the ceiling, the limiter's most), then a soft saturation, then
    held under the ceiling; the stems get the same gains. In place. -> how far past
    full scale the loudest moment went at that loudness, before the limiter (dB)."""
    n = len(L)
    peak = max(np.abs(L).max(), np.abs(R).max()) if n else 0
    pw = loudness(L, R)
    makeup = min(np.sqrt(db_gain(LOUDNESS) ** 2 / pw), CEILING * 2.5 / peak) if peak > 0 and pw > 0 else 1
    L *= makeup; R *= makeup
    sat = 1 / np.sqrt(1 + np.maximum(np.abs(L), np.abs(R)) ** 2 * SAT); L *= sat; R *= sat
    g = limit_gain(L, R); L *= g; R *= g
    for x in [x for s in out.values() for x in s]: x *= makeup * sat * g
    return 20 * np.log10(peak * makeup) if peak > 0 else -np.inf

def mixdown(place, n, plan, kicks, m, stems=False):
    """The buses mixed, then the master. -> L, R, {stem: (L, R)}, over (dB, the master's)"""
    L, R, out = mix_buses(place, n, plan, kicks, m, stems)
    return L, R, out, master(L, R, out)

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

def make(seed,path,styles,humanize,roles,loops,chroma,mix=None,stems=False,arranged=None,arrange=None,varied=False):
    """One song; roles, loops (in beats) and chroma: {piece number: ...}. Needs a
    riff or a phrase; what a missing role plays is left out (or played by the
    nearest role there is). mix: the mixer (None: the pieces exactly as
    recorded); stems: also each bus as its own WAV; arranged: a plan by hand;
    arrange: {intro, verse, verse2, hook, hook2, bridge, bridgeBass, lift, hookBass, liftBass, liftSub, layer, crash, swell, hook3, outro, pre}, pieces' numbers
    in lists, which riffs each section plays in place of the seed's riff sets (a second verse, a hook
    of its own, a last hook lifted into another key with its own bass and 808); varied: dress the drums."""
    r=np.random.default_rng(seed); R=random.Random(seed)
    pool={x:[i for i in sorted(roles) if roles[i]==x] for x in ROLES}
    P=arrange or {}
    if arrange:   # an arrangement by hand: the hook's own bass, the lifted hook's riffs, bass and 808 and the layer are theirs alone, never drawn for any other section
        own={x for x in [*(P.get('lift') or []),*(P.get('hookBass') or []),*(P.get('liftBass') or []),*(P.get('hook2') or []),*(P.get('hook3') or []),*(P.get('outro') or []),*(P.get('pre') or []),*(P.get('bridgeBass') or []),P.get('liftSub'),P.get('layer'),P.get('crash'),P.get('swell')] if x is not None}
        pool={x:[i for i in pool[x] if i not in own] for x in pool}
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
    drawn_sets=[riff_set(j) for j in range(4)]   # (always drawn, so every later choice is the seed's)
    intro_set,verse_set,hook_set,bridge_set=[P.get(n) or drawn_sets[j] for j,n in enumerate(['intro','verse','hook','bridge'])]
    others=sorted([x for x in riffs if x not in hook_set],key=lambda x:-alike(x,hook_set[0]))
    layer=P.get('layer') if arrange else others[0] if others else None   # another riff over hooks: the most alike in notes
    hook_layer=layer is not None and R.random()<0.5
    layer_fits=layer is not None and (arrange is not None or alike(layer,hook_set[0])>=0.45)   # only one alike enough in notes: no clash on top
    bass_mode=R.choice(['alt','one','one','sparse'] if len(pool['bass'])>1 else ['one','sparse'] if pool['bass'] else ['none'])
    bass_a=pick(pool['bass']); bass_b=pick(pool['bass'],[bass_a])
    # a break gets the shortest hat loop (a shaker); a hook a hat other than the
    # verse's, and other than the shaker when there's a choice
    break_hat=min(pool['hat'],key=lambda i:len(pc[i]),default=None)
    verse_hat=pick(pool['hat']); hook_hat=pick(pool['hat'],[verse_hat,break_hat] if len(pool['hat'])>2 else [verse_hat])
    hook_hat2=next((i for i in pool['hat'] if i not in (verse_hat,hook_hat,break_hat)),next((i for i in pool['hat'] if i not in (verse_hat,hook_hat)),None))
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
    if humanize>0: s.sh=SHUFFLE.get(style,0)*0.25   # (humanize 0: strictly on the grid)
    # how each section hands over, decided first: the bar before a hook may be
    # a stop bar, where everything lays out but the fill; a pre-hook's riser
    # runs straight into its hook
    last_hook=max([i for i,(t,_,_) in enumerate(plan) if t=='hook'],default=-1)
    into=[]
    for idx,(t,b,L) in enumerate(plan):
        nb=b+L-1; nxt=plan[idx+1][0] if idx<len(plan)-1 else None
        if nxt is None: into.append((nb,['roll','roll2','stutter']))   # the ending
        elif t=='pre': into.append((nb,['drop']))
        elif nxt=='hook' and L>=4 and (R.random()<0.35 or (arrange and idx+1==last_hook)): s.rest.add(nb); into.append((nb,['fill','stutter']))   # (an arranged song always drops out for the bar before its last hook)
        else: into.append((nb,INTO[nxt]))
    def walk(b,n,nxt,start=0,skip=lambda k,span:False):   # loops one after another, each for the whole bars it takes
        k=start; j=0
        while k<n:
            i=nxt(j); span=min(n-k,s.span(i))
            if not skip(k,span): s.loop(i,b+k,span)
            k+=span; j+=1
    def bass(b,n,start=0,own=None):
        walk(b,n,lambda j:own[j%len(own)] if own else [bass_a,bass_b][j%2] if bass_mode=='alt' else (None if r.random()<0.4 else R.choice(pool['bass'])) if bass_mode=='sparse' else bass_a,start)
    def riff(b,n,set_):   # lay out at a phrase's end, not mid-phrase (a bar or two: never a whole four-bar loop)
        walk(b,n,lambda j:set_[j%len(set_)],0,lambda k,span:(k+span)%4==0 and k+span<n and span<4 and r.random()<0.2)
    dress=dress_of(random.Random(seed^0x7f4a7c15)) if varied else None   # (a varied song's drum touches, a stream of their own)
    verse_no=hook_no=0
    for idx,(t,b,L) in enumerate(plan):
        if b>0 and t in ('verse','hook','bridge','outro'): s.hit(P.get('crash'),b*4,tight=True)   # (a crash where a section comes in, when the arrangement has one)
        if b>=4 and t=='hook': s.hit(P.get('swell'),b*4-4,tight=True)   # (a bar's swell rising into every hook: a reversed cymbal, when the arrangement has one)
        if t=='intro':   # previews: hats then a riff, a riff, or phrases
            c=R.choice(['riff','phr'] if verse_hat is None else ['riff','phr','hats'])
            if c=='riff': riff(b,L,intro_set)
            elif c=='phr': s.phrases(b,L,phrases)
            else:   # (the riff comes in so it ends with the intro: a long one never runs on over the verse's)
                at=max(0,min(L//2,L-s.span(intro_set[0]))); s.loop(verse_hat,b,L); s.loop(intro_set[0],b+at,L-at)
        elif t=='verse':   # the first verse builds: bass comes in halfway
            verse_no+=1
            riff(b,L,P.get('verse2') if verse_no>1 and P.get('verse2') else verse_set); bass(b,L,L//2 if verse_no==1 else 0); s.drums(style,b,L,kit,dress and dress['verse']); s.loop(verse_hat,b,L)
            # (its last 4 bars, or all of a shorter verse arranged by hand: never into the bars before it)
            if R.random()<0.4: s.phrases(b+L-min(4,L),min(4,L),phrases)
        elif t=='pre':   # the lift: the verse's riffs (an arranged song's own chords climbing to the hook) and hat, no kick, a riser into the hook
            riff(b,L,P.get('pre') or verse_set); s.loop(verse_hat,b,L); s.build(b,L,kit)
        elif t=='hook':   # the last hook is the fullest
            hook_no+=1
            lifted=hooks>1 and hook_no==hooks and bool(P.get('lift'))   # (the last hook, a key higher)
            own=P.get('liftBass') if lifted else P.get('hookBass')
            riff(b,L,P['lift'] if lifted else P['hook3'] if hook_no>2 and P.get('hook3') else P['hook2'] if hook_no>1 and P.get('hook2') else hook_set); bass(b,L,0,own or None)
            s.drums(hook_style,b,L,{**kit,'sub':P['liftSub']} if lifted and P.get('liftSub') is not None else kit,dress and (dress['last'] if hook_no==hooks else dress['hook']))
            if arrange and L==8 and hook_hat2 is not None: s.loop(hook_hat,b,4); s.loop(hook_hat2,b+4,4)   # (an arranged song's hook: its hats change halfway)
            else: s.loop(hook_hat,b,L)
            if layer_fits and not lifted and (hook_layer or hook_no==hooks): riff(b,L,[layer])
        elif t=='break':   # strip back: no drums, no bass
            s.phrases(b,L,phrases)
            if R.random()<0.6: s.loop(break_hat,b,L)
        elif t=='bridge':   # contrast: another riff set, half-time
            riff(b,L,bridge_set); s.drums('half',b,L,kit,dress and dress['bridge'])
            if R.random()<0.5: bass(b,L,0,P.get('bridgeBass') or None)
        elif t=='outro':   # the intro's riff again, winding down
            riff(b,L,P.get('outro') or intro_set)   # (an arranged song's own outro: its hook's tune, softly)
            if R.random()<0.6: s.drums(style,b,L//2,kit)
            s.loop(verse_hat,b,L)
        if L==8 and t in ('verse','hook') and R.random()<0.3: s.fill(b+3,['tick','roll'],kit)   # mid-section turnaround
        s.fill(*into[idx],kit)
    s.hit(R.choice([kit['heavy'],kit['sub']]),bars*4)   # one last hit on the next downbeat
    s.hit(P.get('crash'),bars*4,tight=True)
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
    ap.add_argument('--varied', action='store_true', help='dress the drums: a different touch for the verses, the hooks and the bridge, and how a phrase ends')
    ap.add_argument('--plan', default=None, help='arrange every song by hand, e.g. intro:4,verse:8,pre:2,hook:8,outro:4 (sections: '
                    + ','.join(SECTIONS) + '; 1-16 bars each, 400 in all; overrides --min-bars/--max-bars)')
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
        info = make(rnd.randint(0, 10**9), path, styles, a.humanize / 100, roles, loops, chroma, mix, a.stems, arranged, None, a.varied)
        style = info['style'] + (f"/{info['alt']}" if info['alt'] != info['style'] else '')
        over = f" peaks +{20*np.log10(info['peak']):.1f} dB" if info['peak'] > 1 else ''
        print(os.path.basename(path), info['beats'], 'beats', info['dur'], 's', style, '-'.join(info['sections']) + over)

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
passion_beats.py - split a recording of beat pieces and arrange them into new songs.

Usage:
  python passion_beats.py all_beats.wav --count 20 --out songs/
  python passion_beats.py all_beats.wav --count 5 --min-bars 25 --max-bars 29 --seed 42

Input: one WAV with each piece separated by silence (>0.2 s), recorded at 125 BPM.
Any number of pieces: each one's role (riff, bass, kick, ...) is guessed from
its sound; --roles sets any of them.
Songs use the pieces exactly as recorded (no volume changes or effects); where
they overlap they add up, kept as-is in the 32-bit float WAV.
"""
import argparse, datetime, os, random, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter

BPM = 125
sr = 48000
B = 60 / BPM * sr
pc = {}

# what a piece does in a song (the same as public/engine.mjs; see the README)
ROLES = ['riff','phrase','bass','hat','fill','kick','sub','snare','tick','roll','off']

def load_pieces(path, pieces_dir=None, silence_db=-90, min_gap=0.2):
    """Split the recording on runs of silence and store pieces in `pc`, each
    exactly as recorded. Sound before the first gap and after the last counts too."""
    global sr, B
    sr, x = wavfile.read(path)
    if x.dtype == np.uint8: x = (x.astype(np.float32) - 128) / 128
    elif x.dtype.kind == 'i': x = x.astype(np.float32) / -np.iinfo(x.dtype).min
    else: x = x.astype(np.float32)
    if x.ndim == 1: x = np.stack([x, x], 1)
    x = x[:, :2]
    B = 60 / BPM * sr
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

def loop_beats(beats):
    """The loop length of a piece `beats` long: the longest usual length that fits."""
    if beats >= 15.75: return 4 * int((beats + 0.25) // 4)
    return max([x for x in (1, 2, 3, 4, 6, 8, 12) if x <= beats + 0.25], default=1)

def features(x):
    """What can be heard of a piece: length, hits, sustain, brightness, low end, pitchedness."""
    m = x.astype(np.float64).mean(1); n = len(m)
    hop = max(1, round(sr / 100)); F = max(1, -(-n // hop))
    env = np.sqrt(np.array([np.mean(m[f*hop:(f+1)*hop] ** 2) for f in range(F)]))
    peak = env.max(); loud = np.where(env >= peak * 0.0316)[0]; last = loud[-1] if len(loud) else 0
    onsets, prev = 0, -9
    for f in range(F):   # a jump within 20 dB of the peak, 50 ms apart
        before = env[max(0, f-3):f].max() if f else 0
        if env[f] > peak * 0.1 and env[f] > 1.6 * before and f - prev >= 5: onsets += 1; prev = f
    h = (last + 1) / 2; fr = np.arange(last + 1)
    e1 = (env[:last+1][fr < h] ** 2).sum(); e2 = (env[:last+1][fr >= h] ** 2).sum()
    E = (m ** 2).sum(); D = (np.diff(m) ** 2).sum()
    a = 1 - np.exp(-2 * np.pi * 150 / sr); y = m
    for _ in range(2): y = lfilter([a], [1, a - 1], y)   # two-pole 150 Hz low-pass
    return dict(beats=n / B, ring=(last + 1) * hop / sr, onsets=onsets, sustain=np.sqrt(e2 / max(1e-20, e1)),
                bright=sr / np.pi * np.arcsin(np.sqrt(min(1, D / E / 4))) if E > 0 else 0,
                low=(y ** 2).sum() / E if E > 0 else 0, pitched=pitchedness(m, env, hop, peak))

def pitchedness(m, env, hop, peak):
    """0 for noise, 1 for a steady note: the autocorrelation's highest peak past its
    first dip, at 50-1000 Hz, the median over up to 8 loud moments, at about 16 kHz."""
    d = max(1, sr // 16000); s2 = sr / d; nd = len(m) // d; x = m[:nd*d].reshape(nd, d).mean(1)
    W = round(0.064 * s2); lo = round(s2 / 1000); hi = round(s2 / 50)
    loud = np.where(env > peak * 0.3)[0]; k = min(8, len(loud)); out = []
    for q in range(k):
        st = int(loud[q * len(loud) // k] * hop // d)
        if st + W + hi > nd: continue
        seg = x[st:st + W + hi]; c = np.r_[0, np.cumsum(seg ** 2)]
        r = np.array([seg[:W] @ seg[t:t+W] for t in range(lo, hi + 1)])
        r = r / np.sqrt(c[W] * (c[np.arange(lo, hi+1) + W] - c[np.arange(lo, hi+1)]) + 1e-20)
        neg = np.where(r < 0)[0]
        out.append(max(0.0, r[neg[0]:].max()) if len(neg) else 0.0)
    return float(np.sort(out)[len(out) // 2]) if out else 0.0

def guess_role(f):
    loop = f['beats'] >= 1.75 and (f['onsets'] >= 2 or f['sustain'] >= 0.3)
    tonal = f['pitched'] >= 0.75 or f['bright'] < 2000
    if loop:
        if not tonal: return 'hat' if f['bright'] > 7000 else 'fill'
        return 'bass' if f['low'] > 0.3 else 'phrase' if f['beats'] < 3 else 'riff'
    if f['onsets'] >= 3: return 'roll'
    if f['low'] > 0.3: return 'sub' if f['ring'] > 1 else 'kick'
    if f['bright'] > 7000: return 'tick'
    return 'phrase' if tonal else 'snare'

# Arrangement rules (the same as public/engine.mjs; see the README):
# a hook may lift to a related groove, never a foreign one;
FAMILY = {'four':['four','broken'],'broken':['broken','four'],'hiphop':['hiphop','trap'],'trap':['trap','hiphop'],'half':['half','hiphop']}
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
    """The pieces exactly as recorded, placed on the 125 BPM grid and summed:
    no volume changes, panning, cutting or effects; pieces may overlap.
    Humanize only moves when a piece starts."""
    def __init__(s,bars,rng,humanize):   # pieces by number; None is none
        s.r=rng; s.py=random.Random(int(rng.integers(1e9))); s.bars=bars; s.rest=set()   # stop bars
        s.per={i:loop_beats(len(p)/B) for i,p in pc.items()}
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
            if r.random()<0.35:   # ticks between the hits
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

def make(seed,path,styles,humanize,roles):
    """One song; roles: {piece number: role}. Needs a riff or a phrase; what a
    missing role plays is left out (or played by the nearest role there is)."""
    r=np.random.default_rng(seed); R=random.Random(seed)
    pool={x:[i for i in sorted(roles) if roles[i]==x] for x in ROLES}
    riffs=pool['riff'] or pool['phrase']; phrases=pool['phrase'] or riffs
    def pick(xs,no=()):
        ok=[x for x in xs if x not in no]
        return R.choice(ok) if ok else R.choice(xs) if xs else None
    # choices made once, so what repeats sounds the same each time
    style=R.choice(styles); kin=[x for x in FAMILY[style] if x in styles]
    hook_style=R.choice(kin) if R.random()<0.4 else style          # every hook the same groove
    # intro/outro, verse, hook and bridge riff sets, each further on in the riffs
    order=[riffs[i] for i in r.permutation(len(riffs))]; step=max(1,len(riffs)//4)
    intro_set,verse_set,hook_set,bridge_set=[[order[(j*step+x)%len(order)] for x in R.choice(PATTERNS)] for j in range(4)]
    layer=pick([x for x in riffs if x not in hook_set])            # another riff over hooks
    hook_layer=layer is not None and R.random()<0.5
    bass_mode=R.choice(['alt','one','one','sparse'] if len(pool['bass'])>1 else ['one','sparse'] if pool['bass'] else ['none'])
    bass_a=pick(pool['bass']); bass_b=pick(pool['bass'],[bass_a])
    verse_hat=pick(pool['hat']); hook_hat=pick(pool['hat'],[verse_hat]); break_hat=pick(pool['hat'])
    # the kit: a kick and a heavier one (two kicks if there are), an 808, and the rest
    kicks=[pool['kick'][i] for i in r.permutation(len(pool['kick']))]
    kick=kicks[0] if kicks else pick(pool['sub']); heavy=kicks[1] if len(kicks)>1 else kick
    snare=pick(pool['snare']); sub=pick(pool['sub'])
    roll=pick(pool['roll'])
    kit=dict(kick=kick,heavy=heavy,sub=heavy if sub is None else sub,snare=snare,tick=pick(pool['tick']),
             roll=snare if roll is None else roll,fill=pick(pool['fill']))
    plan=plan_song(R); bars=plan[-1][1]+plan[-1][2]; hooks=sum(t=='hook' for t,_,_ in plan)
    s=Song(bars,r,humanize)
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
            if layer is not None and (hook_layer or hook_no==hooks): riff(b,L,[layer])
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
    ap.add_argument('--styles', default='four,hiphop,trap,half,broken', help='drum styles songs pick from (default all)')
    ap.add_argument('--humanize', type=float, default=100, help='swing and timing drift, percent (default 100; 0 is a strict grid)')
    ap.add_argument('--roles', default='', help='set pieces\' roles, e.g. 3=riff,6-8=hat,12=off (roles: ' + ','.join(ROLES) + ')')
    a = ap.parse_args()
    if not 8 <= a.min_bars <= a.max_bars: ap.error('need 8 <= --min-bars <= --max-bars')
    if a.count < 1: ap.error('--count must be 1 or more')
    styles = [x for x in a.styles.split(',') if x]
    if not styles or set(styles) - set(FAMILY): ap.error('--styles: any of four,hiphop,trap,half,broken')
    if not 0 <= a.humanize <= 200: ap.error('--humanize must be 0 to 200')
    MIN_BARS, MAX_BARS = a.min_bars, a.max_bars
    n = load_pieces(a.input, a.save_pieces, a.silence_db, a.min_gap); print(f'found {n} pieces')
    if not n: sys.exit('no pieces; try a different --silence-db or --min-gap')
    roles = {i: guess_role(features(p)) for i, p in pc.items()}
    for part in filter(None, a.roles.split(',')):   # 3=riff, 6-8=hat
        try:
            nums, role = part.split('='); lo, _, hi = nums.partition('-'); lo = int(lo); hi = int(hi or lo)
        except ValueError: ap.error(f'--roles: {part!r} is not like 3=riff or 6-8=hat')
        if role not in ROLES: ap.error(f'--roles: {role!r} is not one of ' + ','.join(ROLES))
        if not 1 <= lo <= hi <= n: ap.error(f'--roles: pieces are 1 to {n}')
        for i in range(lo, hi + 1): roles[i] = role
    print('roles:', ' '.join(f'{i}={roles[i]}' for i in sorted(roles)))
    if not any(x in ('riff', 'phrase') for x in roles.values()): sys.exit('needs a riff or a phrase; set one with --roles')
    os.makedirs(a.out, exist_ok=True)
    # named for when they're made: now, then a minute later for each next song
    rnd = random.Random(a.seed); t = datetime.datetime.now()
    for _ in range(a.count):
        while os.path.exists(path := f"{a.out}/Passion {t:%d-%m-%Y %H-%M}.wav"):   # never overwrite
            t += datetime.timedelta(minutes=1)
        t += datetime.timedelta(minutes=1)
        info = make(rnd.randint(0, 10**9), path, styles, a.humanize / 100, roles)
        over = f" peaks +{20*np.log10(info['peak']):.1f} dB" if info['peak'] > 1 else ''
        print(os.path.basename(path), info['beats'], 'beats', info['dur'], 's', info['style'], '-'.join(info['sections']) + over)

if __name__ == '__main__':
    main()

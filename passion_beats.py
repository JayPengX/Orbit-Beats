#!/usr/bin/env python3
"""
passion_beats.py - split a recording of beat pieces and arrange them into new songs.

Usage:
  python passion_beats.py all_beats.wav --count 20 --out songs/
  python passion_beats.py all_beats.wav --count 5 --min-bars 25 --max-bars 29 --seed 42

Input: one WAV with each piece separated by silence (>0.2 s), recorded at 125 BPM.
Piece roles are hard-coded below for the original 24-piece "Passion" recording.
Songs use the pieces exactly as recorded (no volume changes or effects); where
they overlap they add up, kept as-is in the 32-bit float WAV.
"""
import argparse, datetime, os, random, sys
import numpy as np
from scipy.io import wavfile

BPM = 125
sr = 48000
B = 60 / BPM * sr
pc = {}

# loop length in beats for each repeating piece (others are one-shots)
period = {1:2,2:2,3:4,4:2,5:2,6:4,7:8,8:4,9:4,13:4,14:4,15:4,16:4,17:4,18:4,19:4,20:4,21:4}
RIFFSETS = [[13,14,15,14],[16,17,18,17],[13,15],[16,18],[21,21,15,15],[14,13,14,15],[17,16,17,18],[21,13,21,14]]
HATS = [7,8,9,5]

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

# Arrangement rules (the same as public/engine.mjs; see the README):
# a hook may lift to a related groove, never a foreign one;
FAMILY = {'four':['four','broken'],'broken':['broken','four'],'hiphop':['hiphop','trap'],'trap':['trap','hiphop'],'half':['half','hiphop']}
# the body is verse-hook pairs, maybe a break first, maybe a break or bridge
# before a last hook; verses and hooks are 4 or 8 bars, breaks and bridges 2 or 4.
LENS = {'verse':[4,8],'hook':[4,8],'break':[2,4],'bridge':[2,4]}
FORMS = [['hook']] + [lead + ['verse','hook']*k + end for k in range(1,5) for lead in ([],['break']) for end in ([],['break','hook'],['bridge','hook'])]
# fills fit where they lead
INTO = {'hook':['roll','roll2','stutter','fill6'],'verse':['roll','roll2','tick','drop'],'break':['drop','tick'],'bridge':['drop','tick'],'outro':['roll','roll2','stutter']}

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
    def __init__(s,bars,rng,humanize):
        s.r=rng; s.py=random.Random(int(rng.integers(1e9))); s.bars=bars; s.rest=set()   # stop bars
        s.buf=np.zeros((int((bars*4+2)*B)+max(len(p) for p in pc.values()),2),np.float32)
        s.swing=rng.uniform(0,0.06)*humanize        # fraction of a beat pushed on off-16ths
        s.loose=rng.uniform(0.004,0.012)*humanize   # timing sd in seconds
    def hit(s,i,beat,tight=False):
        src=pc[i]
        if abs(beat%0.5-0.25)<1e-6: beat+=s.swing
        a=max(0,int(round(beat*B+s.r.normal(0,s.loose*(0.4 if tight else 1))*sr)))
        b=min(len(s.buf),a+len(src)); s.buf[a:b]+=src[:b-a]
    def loop(s,i,bar,nbars):   # piece i every period[i] beats; the last may run on
        t=bar*4; end=(bar+nbars)*4
        while t<end-1e-9:
            if int(t//4) not in s.rest: s.hit(i,t,tight=True)
            t+=period[i]
    def phrases(s,bar,nbars):
        t=bar*4; end=(bar+nbars)*4
        while t<end-1e-9:
            i=s.py.choice([1,2,1,4,2,3]); i=3 if (end-t>=4 and s.r.random()<0.2) else (i if i!=3 else 1)
            if t+period[i]>end: i=1
            s.hit(i,t); t+=period[i]
    def drums(s,style,bar,nbars):
        r=s.r
        for br in range(bar,bar+nbars):
            if br in s.rest: continue
            t=br*4
            if style=='four':
                for k in range(4): s.hit(10,t+k)
                if r.random()<0.15: s.hit(10,t+3.5)
            elif style=='hiphop':
                s.hit(22,t); s.hit(12,t+2.5)
                if r.random()<0.35: s.hit(22,t+1.75)
                if r.random()<0.2: s.hit(10,t+3.75)
            elif style=='trap':
                s.hit(24,t); s.hit(10,t+1.5); s.hit(24,t+2.75)
                if r.random()<0.3: s.hit(24,t+3.5)
            elif style=='half':
                s.hit(12,t)
                if r.random()<0.5: s.hit(22,t+2.75)
            elif style=='broken':
                for q in s.py.choice([[0,1.5,2.5],[0,0.75,2.25,3],[0,2,2.75],[0,1.25,2.5,3.5]]): s.hit(s.py.choice([10,22,24]),t+q)
            if r.random()<0.35:   # ticks between the hits
                for q in s.py.choice([[0.5],[1.5,3.5],[0.5,1.5,2.5,3.5]]): s.hit(11,t+q)
    def fill(s,bar,kinds):   # the end of `bar`
        t=bar*4; kind=s.py.choice(kinds)
        if kind=='roll': s.hit(23,t+3)
        elif kind=='roll2': s.hit(23,t+3); s.hit(23,t+3.5)
        elif kind=='stutter':
            for q in [2.5,3,3.25,3.5,3.75]: s.hit(s.py.choice([10,12]),t+q)
        elif kind=='fill6': s.hit(6,t,tight=True)
        elif kind=='tick':
            for q in [3,3.25,3.5,3.75]: s.hit(11,t+q)
    def render(s,path):   # the last notes ring out, then 0.5 s; overlaps are left as they add up
        y=s.buf
        idx=np.where(np.abs(y).max(1)>1e-5)[0]; y=y[:idx[-1]+1+int(0.5*sr)]
        wavfile.write(path,sr,y.astype(np.float32)); return len(y)/sr, float(np.abs(y).max())

def make(seed,path,styles,humanize):
    r=np.random.default_rng(seed); R=random.Random(seed)
    # choices made once, so what repeats sounds the same each time
    style=R.choice(styles); kin=[x for x in FAMILY[style] if x in styles]
    hook_style=R.choice(kin) if R.random()<0.4 else style          # every hook the same groove
    rs=[RIFFSETS[i] for i in r.choice(len(RIFFSETS),3,replace=False)]   # intro/outro, verse, hook
    bridge_set=R.choice([x for x in RIFFSETS if x not in rs])      # a bridge contrasts
    bass_mode=R.choice(['alt','19','20','sparse'])
    verse_hat=R.choice(HATS); hook_hat=R.choice([h for h in (7,8,9) if h!=verse_hat])
    hook_layer=R.random()<0.5                                      # riff 21 over every hook
    plan=plan_song(R); bars=plan[-1][1]+plan[-1][2]; hooks=sum(t=='hook' for t,_,_ in plan)
    s=Song(bars,r,humanize)
    # how each section hands over, decided first: the bar before a hook may be
    # a stop bar, where everything lays out but the fill
    into=[]
    for idx,(t,b,L) in enumerate(plan):
        nb=b+L-1; nxt=plan[idx+1][0] if idx<len(plan)-1 else None
        if nxt is None: into.append((nb,['roll','roll2','stutter']))
        elif nxt=='hook' and L>=4 and R.random()<0.35: s.rest.add(nb); into.append((nb,['fill6','stutter']))
        else: into.append((nb,INTO[nxt]))
    def bass(b,n,start=0):
        for k in range(start,n):
            if bass_mode=='sparse' and r.random()<0.4: continue
            i=[19,20][k%2] if bass_mode=='alt' else R.choice([19,20]) if bass_mode=='sparse' else int(bass_mode)
            s.loop(i,b+k,1)
    def riff(b,n,set_):
        for k in range(n):
            if k%4==3 and k<n-1 and r.random()<0.2: continue   # lay out at a phrase's end, not mid-phrase
            s.loop(set_[k%len(set_)],b+k,1)
    verse_no=hook_no=0
    for idx,(t,b,L) in enumerate(plan):
        if t=='intro':   # previews: hats then a riff, a riff, or phrases
            c=R.choice(['riff','phr','hats'])
            if c=='riff': riff(b,L,rs[0])
            elif c=='phr': s.phrases(b,L)
            else: s.loop(verse_hat,b,L); s.loop(rs[0][0],b+L//2,L-L//2)
        elif t=='verse':   # the first verse builds: bass comes in halfway
            verse_no+=1
            riff(b,L,rs[1]); bass(b,L,L//2 if verse_no==1 else 0); s.drums(style,b,L); s.loop(verse_hat,b,L)
            if R.random()<0.4: s.phrases(b+L-4,4)
        elif t=='hook':   # the last hook is the fullest
            hook_no+=1
            riff(b,L,rs[2]); bass(b,L); s.drums(hook_style,b,L); s.loop(hook_hat,b,L)
            if hook_layer or hook_no==hooks: riff(b,L,[21])
        elif t=='break':   # strip back: no drums, no bass
            s.phrases(b,L)
            if R.random()<0.6: s.loop(5,b,L)
        elif t=='bridge':   # contrast: another riff set, half-time
            riff(b,L,bridge_set); s.drums('half',b,L)
            if R.random()<0.5: bass(b,L)
        elif t=='outro':   # the intro's riff again, winding down
            riff(b,L,rs[0])
            if R.random()<0.6: s.drums(style,b,L//2)
            s.loop(verse_hat,b,L)
        if L==8 and t in ('verse','hook') and R.random()<0.3: s.fill(b+3,['tick','roll'])   # mid-section turnaround
        s.fill(*into[idx])
    s.hit(R.choice([22,24]),bars*4)   # one last hit on the next downbeat
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
    a = ap.parse_args()
    if not 8 <= a.min_bars <= a.max_bars: ap.error('need 8 <= --min-bars <= --max-bars')
    if a.count < 1: ap.error('--count must be 1 or more')
    styles = [x for x in a.styles.split(',') if x]
    if not styles or set(styles) - set(FAMILY): ap.error('--styles: any of four,hiphop,trap,half,broken')
    if not 0 <= a.humanize <= 200: ap.error('--humanize must be 0 to 200')
    MIN_BARS, MAX_BARS = a.min_bars, a.max_bars
    n = load_pieces(a.input, a.save_pieces, a.silence_db, a.min_gap); print(f'found {n} pieces')
    if n < 24: sys.exit(f'need 24 pieces; try a different --silence-db or --min-gap')
    os.makedirs(a.out, exist_ok=True)
    # named for when they're made: now, then a minute later for each next song
    rnd = random.Random(a.seed); t = datetime.datetime.now()
    for _ in range(a.count):
        while os.path.exists(path := f"{a.out}/Passion {t:%d-%m-%Y %H-%M}.wav"):   # never overwrite
            t += datetime.timedelta(minutes=1)
        t += datetime.timedelta(minutes=1)
        info = make(rnd.randint(0, 10**9), path, styles, a.humanize / 100)
        over = f" peaks +{20*np.log10(info['peak']):.1f} dB" if info['peak'] > 1 else ''
        print(os.path.basename(path), info['beats'], 'beats', info['dur'], 's', info['style'], '-'.join(info['sections']) + over)

if __name__ == '__main__':
    main()

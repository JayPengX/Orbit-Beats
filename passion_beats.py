#!/usr/bin/env python3
"""
passion_beats.py - split a recording of beat pieces and generate humanized song variants.

Usage:
  python passion_beats.py all_beats.wav --count 20 --out songs/
  python passion_beats.py all_beats.wav --count 5 --min-bars 25 --max-bars 29 --seed 42

Input: one WAV with each piece separated by silence (>0.2 s), recorded at 125 BPM.
Piece roles are hard-coded below for the original 24-piece "Passion" recording.
"""
import argparse, os, random, sys
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
    """Split the recording on runs of silence and store pieces in `pc`.
    Sound before the first gap and after the last counts as a piece too."""
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
        f = min(64, len(s) // 4); s[len(s)-f:] *= np.linspace(1, 0, f)[:, None]
        pc[k + 1] = s
        if pieces_dir:
            os.makedirs(pieces_dir, exist_ok=True)
            wavfile.write(f"{pieces_dir}/piece_{k+1:02d}_{len(s)/B:.1f}beats.wav", sr, s)
    return len(pc)

class Song:
    def __init__(s,bars,rng):
        s.r=rng; s.py=random.Random(int(rng.integers(1e9))); s.bars=bars; s.buf=np.zeros((int((bars*4+4)*B),2),np.float32)
        s.swing=rng.uniform(0,0.06)        # fraction of a beat pushed on off-16ths
        s.loose=rng.uniform(0.004,0.012)   # timing sd in seconds
        s.pan={}
    def _pan(s,i):
        if i not in s.pan: s.pan[i]=s.r.uniform(-0.25,0.25)
        p=s.pan[i]; return np.array([1-max(0,p),1+min(0,p)],np.float32)
    def hit(s,i,beat,g=1.0,cut=None,tight=False):
        r=s.r; src=pc[i]
        if cut:
            n=int(cut*B); src=src[:n].copy(); f=min(len(src),int(0.012*sr)); src[len(src)-f:]*=np.linspace(1,0,f)[:,None]
        frac=beat%0.5
        if abs(frac-0.25)<1e-6: beat+=s.swing
        sd=s.loose*(0.4 if tight else 1)
        a=int(round(beat*B+r.normal(0,sd)*sr)); a=max(0,a)
        g=g*r.uniform(0.82,1.08)*(1.08 if abs(beat%4)<1e-6 else 1)
        b=min(len(s.buf),a+len(src)); s.buf[a:b]+=g*src[:b-a]*s._pan(i)
    def loop(s,i,bar,nbars,g=1.0,drop_prob=0.0):
        p=period[i]; t=bar*4; end=(bar+nbars)*4
        while t<end-1e-9:
            if s.r.random()>=drop_prob:
                cut=4 if i==6 else (end-t if t+p>end+1e-9 else None)
                s.hit(i,t,g,cut=cut,tight=True)
            t+=p
    def phrases(s,bar,nbars,g=0.8):
        t=bar*4; end=(bar+nbars)*4
        while t<end-1e-9:
            i=s.py.choice([1,2,1,4,2,3]) ; i=3 if (end-t>=4 and s.r.random()<0.2) else (i if i!=3 else 1)
            if t+period[i]>end: i=1
            s.hit(i,t,g); t+=period[i]
    def drums(s,style,bar,nbars,g=0.8):
        r=s.r
        for br in range(bar,bar+nbars):
            t=br*4
            if style=='four':
                for k in range(4): s.hit(10,t+k,g*(1 if k%2==0 else 0.9))
                if r.random()<0.15: s.hit(10,t+3.5,g*0.45)
            elif style=='hiphop':
                s.hit(22,t,g); s.hit(12,t+2.5,g*0.9)
                if r.random()<0.35: s.hit(22,t+1.75,g*0.5)
                if r.random()<0.2: s.hit(10,t+3.75,g*0.4)
            elif style=='trap':
                s.hit(24,t,g); s.hit(10,t+1.5,g*0.8); s.hit(24,t+2.75,g*0.8)
                if r.random()<0.3: s.hit(24,t+3.5,g*0.5)
            elif style=='half':
                s.hit(12,t,g); 
                if r.random()<0.5: s.hit(22,t+2.75,g*0.6)
            elif style=='broken':
                pat=s.py.choice([[0,1.5,2.5],[0,0.75,2.25,3],[0,2,2.75],[0,1.25,2.5,3.5]])
                for q in pat: s.hit(s.py.choice([10,22,24]),t+q,g*(1 if q==0 else 0.75))
            if r.random()<0.35:   # ghost ticks
                for q in s.py.choice([[0.5],[1.5,3.5],[0.5,1.5,2.5,3.5]]): s.hit(11,t+q,0.5)
    def fill(s,bar):   # occupies last beat(s) of `bar`
        r=s.r; t=bar*4; kind=s.py.choice(['roll','roll2','stutter','fill6','drop','tick'])
        if kind=='roll': s.hit(23,t+3)
        elif kind=='roll2': s.hit(23,t+3); s.hit(23,t+3.5,0.8)
        elif kind=='stutter':
            for q in [2.5,3,3.25,3.5,3.75]: s.hit(s.py.choice([10,12]),t+q,0.5+0.1*q)
        elif kind=='fill6': s.loop(6,bar,1,0.6)
        elif kind=='tick':
            for q in [3,3.25,3.5,3.75]: s.hit(11,t+q,0.8)
        return kind
    def mute(s,b0,b1):  # silence a span (beats) -> dramatic dropout
        a=int(b0*B); b=int(b1*B); f=int(0.01*sr)
        s.buf[a:a+f]*=np.linspace(1,0,f)[:,None]; s.buf[a+f:b]=0
    def render(s,path):
        y=s.buf; e=int(s.bars*4*B)
        fo=int(2*4*B); y[e-fo:e]*=np.linspace(1,0,fo)[:,None]**1.5; y[e:]=0
        idx=np.where(np.abs(y).max(1)>1e-5)[0]; y=y[:idx[-1]+int(0.5*sr)]
        y=y/np.abs(y).max()*1.4; y=np.tanh(y)/np.tanh(1.4)*0.89
        wavfile.write(path,sr,y.astype(np.float32)); return len(y)/sr

def make(seed,path):
    r=np.random.default_rng(seed); R=random.Random(seed)
    style=R.choice(['four','hiphop','trap','half','broken'])
    alt=R.choice(['four','hiphop','trap','half','broken'])
    rs=[RIFFSETS[i] for i in r.choice(len(RIFFSETS),3,replace=False)]
    bass_mode=R.choice(['alt','19','20','sparse'])
    # the section plan: exactly `target` bars, random irregular lengths
    target=R.randint(MIN_BARS,MAX_BARS)
    intro=R.choice([2,4]); outro=R.choice([2,4])
    mid=target-intro-outro; plan=[('intro',0,intro)]; bar=intro
    pool=['verse','hook','break','verse','hook','bridge']; last=None
    while mid>0:
        t=R.choice([p for p in pool if p!=last]); last=t
        L=min(mid,R.choice({'verse':[4,6,8],'hook':[4,6,8],'break':[2,4],'bridge':[2,4]}[t]))
        if mid-L==1: L+=1
        plan.append((t,bar,L)); bar+=L; mid-=L
    plan.append(('outro',bar,outro)); bar+=outro
    s=Song(bar,r)
    def bass(b,n,g=0.85):
        for k in range(n):
            if bass_mode=='sparse' and r.random()<0.4: continue
            i={'alt':[19,20][k%2],'19':19,'20':20,'sparse':R.choice([19,20])}[bass_mode]
            s.loop(i,b+k,1,g)
    def riff(b,n,set_,g=1.0):
        for k in range(n):
            if r.random()<0.08: continue   # human: occasionally lay out a bar
            s.loop(set_[k%len(set_)],b+k,1,g)
    for idx,(t,b,L) in enumerate(plan):
        hat=R.choice(HATS); hg=r.uniform(0.4,0.7)
        if t=='intro':
            c=R.choice(['riff','phr','hats'])
            if c=='riff': riff(b,L,rs[0],0.8)
            elif c=='phr': s.phrases(b,L,0.7)
            else: s.loop(hat,b,L,hg); s.loop(R.choice([13,16,21]),b+L//2,L-L//2,0.7)
        elif t=='verse':
            riff(b,L,rs[1]); bass(b,L); s.drums(style,b,L); s.loop(hat,b,L,hg,0.05)
            if R.random()<0.4: s.phrases(b+L-4 if L>=4 else b,min(4,L),0.45)
        elif t=='hook':
            riff(b,L,rs[2]); bass(b,L,0.95); s.drums(alt if R.random()<0.4 else style,b,L,0.85)
            s.loop(7 if hat!=7 else 9,b,L,hg)
            if R.random()<0.5: riff(b,L,[21],0.45)
        elif t=='break':
            s.phrases(b,L,0.75); 
            if R.random()<0.6: s.loop(5,b,L,0.45)
        elif t=='bridge':
            riff(b,L,R.choice(RIFFSETS),0.8); s.drums('half',b,L,0.7)
            if R.random()<0.5: bass(b,L,0.7)
        elif t=='outro':
            riff(b,L,rs[0],0.8); 
            if R.random()<0.6: s.drums(style,b,L//2,0.6)
            s.loop(hat,b,L,hg*0.8); s.hit(R.choice([22,24,10]),(b+L)*4-4,0.7)
        # transitions into next section
        if idx<len(plan)-1:
            nb=b+L-1
            if R.random()<0.25 and plan[idx+1][0] in('hook','verse'):
                s.mute(nb*4+3,nb*4+4)
            else: s.fill(nb)
    dur=s.render(path)
    return dict(style=style,alt=alt,bars=bar,beats=bar*4,dur=round(dur,1),sections=[p[0] for p in plan],bass=bass_mode)

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
    a = ap.parse_args()
    if not 8 <= a.min_bars <= a.max_bars: ap.error('need 8 <= --min-bars <= --max-bars')
    if not 1 <= a.count <= 1440: ap.error('--count must be 1 to 1440 (one name per HH-MM)')
    MIN_BARS, MAX_BARS = a.min_bars, a.max_bars
    n = load_pieces(a.input, a.save_pieces, a.silence_db, a.min_gap); print(f'found {n} pieces')
    if n < 24: sys.exit(f'need 24 pieces; try a different --silence-db or --min-gap')
    os.makedirs(a.out, exist_ok=True)
    rnd = random.Random(a.seed); used = set()
    for _ in range(a.count):
        while True:
            t = f"{rnd.randint(0,23):02d}-{rnd.randint(0,59):02d}"
            if t not in used: used.add(t); break
        path = f"{a.out}/Passion_{t}.wav"
        info = make(rnd.randint(0, 10**9), path)
        print(os.path.basename(path), info['beats'], 'beats', info['dur'], 's', info['style'], '-'.join(info['sections']))

if __name__ == '__main__':
    main()

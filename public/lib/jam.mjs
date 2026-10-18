// 即興 (Jam): the kit's pieces as pads, played live over a groove. A loop
// (a riff, a bass line, a hat loop, a fill) starts on the next bar and plays
// round until it's tapped again (it stops on the next bar); a one-shot (a
// kick, a snare, a phrase…) plays on the next step of the grid. What's
// played while recording, the groove included, becomes a song (the engine's
// renderEvents, mixed like any other). This is the timing alone, in beats:
// no DOM, no sound (lib/jamview.mjs plays it), so the tests run it.

export const LOOPING = new Set(['riff', 'bass', 'hat', 'fill']);
// The grids a one-shot snaps to: a 16th, an 8th, a beat, or none (as tapped).
export const GRIDS = { 16: 0.25, 8: 0.5, 4: 1, 0: 0 };

// The pads: every piece in use, by role (loops first), with how it plays.
export function padsOf(roles, loops) {
  const order = ['riff', 'phrase', 'bass', 'hat', 'fill', 'kick', 'sub', 'snare', 'roll', 'tick'];
  return roles
    .map((role, i) => ({ i, role, loop: LOOPING.has(role), beats: loops[i] || 4 }))
    .filter(p => p.role !== 'off')
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.i - b.i);
}

// The next grid step at or after `beat` (a tap a hair after a step, within
// 30 ms at the tempo, still counts as that step: a finger is never early
// enough). `late` is that allowance in beats.
export function nextStep(beat, grid, late = 0) {
  if (!grid) return beat;
  const back = Math.floor(beat / grid + 1e-9) * grid;
  return beat - back <= late ? back : back + grid;
}
export const nextBar = beat => Math.ceil(beat / 4 - 1e-9) * 4;

export class Jam {
  // backing: hits over a few bars ([{ i, beat }], its `cycle` in beats), or none.
  constructor({ backing = [], cycle = 16 } = {}) {
    this.loops = new Map();   // i -> { from, to (Infinity while playing), beats }
    this.shots = [];          // [{ i, beat }] not yet played
    this.backing = backing;
    this.cycle = cycle;
    this.groove = true;
    this.rec = null;          // { from, to, hits: [] }
    this.done = null;         // the last take: { hits, beats }
  }
  setBacking(backing, cycle = 16) {
    this.backing = backing;
    this.cycle = cycle;
  }
  playing(i, beat) {
    const l = this.loops.get(i);
    return Boolean(l && beat < l.to && l.to === Infinity);
  }
  // A loop pad tapped at `beat`: on from the next bar, or off at it.
  toggle(i, beat, beats) {
    const at = nextBar(beat);
    const l = this.loops.get(i);
    if (l && l.to === Infinity) {
      if (l.from >= at) this.loops.delete(i);   // never started: just forgotten
      else l.to = at;
      return { on: false, at };
    }
    this.loops.set(i, { from: at, to: Infinity, beats: Math.max(0.25, beats) });
    return { on: true, at };
  }
  // A one-shot pad tapped at `beat`. -> the beat it plays on.
  shot(i, beat, grid, late = 0) {
    const at = nextStep(beat, grid, late);
    this.shots.push({ i, beat: at });
    return at;
  }
  stopAll(beat) {
    const at = nextBar(beat);
    for (const [i, l] of this.loops) {
      if (l.from >= at) this.loops.delete(i);
      else if (l.to > at) l.to = at;
    }
  }
  // Recording: from the next bar; stopped, to the end of that bar.
  record(beat) {
    if (this.rec && this.rec.to === Infinity) {
      this.rec.to = Math.max(this.rec.from + 4, nextBar(beat));
      return false;
    }
    this.rec = { from: nextBar(beat), to: Infinity, hits: [] };
    this.done = null;
    return true;
  }
  recording() {
    return Boolean(this.rec && this.rec.to === Infinity);
  }
  // Every hit from `a` (inclusive) to `b` (exclusive), in order: the
  // groove's, the loops', the shots'. Called with windows one after another.
  due(a, b) {
    const out = [];
    if (this.groove && this.backing.length)
      for (let c = Math.floor(a / this.cycle) * this.cycle; c < b; c += this.cycle)
        for (const h of this.backing) {
          const t = c + h.beat;
          if (t >= a && t < b) out.push({ i: h.i, beat: t });
        }
    for (const [i, l] of this.loops) {
      const from = Math.max(l.from, a);
      const k = Math.ceil((from - l.from) / l.beats - 1e-9);
      for (let t = l.from + k * l.beats; t < b && t < l.to; t += l.beats) out.push({ i, beat: t });
      if (l.to <= b) this.loops.delete(i);
    }
    this.shots = this.shots.filter(s => {
      if (s.beat < b) {
        if (s.beat >= a - 1e-9) out.push(s);
        return false;
      }
      return true;
    });
    out.sort((x, y) => x.beat - y.beat);
    if (this.rec) {
      for (const h of out) if (h.beat >= this.rec.from && h.beat < this.rec.to) this.rec.hits.push({ i: h.i, beat: h.beat - this.rec.from });
      if (this.rec.to <= b) {
        this.done = { hits: this.rec.hits, beats: this.rec.to - this.rec.from };
        this.rec = null;
      }
    }
    return out;
  }
}

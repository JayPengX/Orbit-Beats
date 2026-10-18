// 即興 (Jam): the kit's pieces as pads, played live over a groove. A loop
// (a riff, a bass line, a hat loop, a fill) starts on the next bar and plays
// round until it's tapped again (it stops on the next bar); a one-shot (a
// kick, a snare, a phrase…) plays on the next step of the grid. What's
// played while recording, the groove included, becomes a song (the engine's
// renderEvents, mixed like any other). This is the timing alone, in beats:
// no DOM, no sound (lib/jamview.mjs plays it), so the tests run it.
// Each pad has a level, a mute and a choke (kept per kit on this phone):
// a hit's level goes into the take with it, and a choked hit is cut where
// the next hit of its group starts, so the song is what was heard.

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

// ---- Each pad's level, mute and choke ----
// choke: '' none; 'self' a hit cuts its own last one; 'a' / 'b' a group: any
// hit in it cuts what's still sounding of the group (an open hat cut by a
// closed one).
export const CHOKES = ['', 'self', 'a', 'b'];
export const PAD = Object.freeze({ level: 1, mute: false, choke: '' });
// A kept pad as it can be used (a wrong kind is left as it was).
export function padOf(x) {
  const lv = Number(x?.level);
  return {
    level: Number.isFinite(lv) ? Math.round(Math.min(1, Math.max(0, lv)) * 100) / 100 : 1,
    mute: x?.mute === true,
    choke: CHOKES.includes(x?.choke) ? x.choke : ''
  };
}
// The gain a pad plays at: its level as the ear hears a fader (squared), 0 muted.
export const gainOf = p => (!p || p.mute ? (p ? 0 : 1) : p.level * p.level);
// The group a pad's hit cuts and is cut by (null: rings out).
export const chokeKey = (i, p) => (!p?.choke ? null : p.choke === 'self' ? `#${i}` : p.choke);
// Hits (any order) -> in order, each choked one with `len`: the beats until
// the next hit of its group (a hit on the same beat doesn't cut it).
// keyOf(hit) -> its group.
export function choked(hits, keyOf) {
  const out = [...hits].sort((x, y) => x.beat - y.beat).map(h => ({ ...h }));
  const next = new Map(); // group -> { beat: its next hit's, after: the one after that beat's }
  for (let k = out.length - 1; k >= 0; k--) {
    const h = out[k];
    const key = keyOf(h);
    if (key == null) continue;
    const n = next.get(key);
    const same = n && n.beat <= h.beat + 1e-9;
    const cut = same ? n.after : n?.beat;
    if (cut != null) h.len = cut - h.beat;
    if (!same) next.set(key, { beat: h.beat, after: n?.beat });
  }
  return out;
}
// A kit's pads as kept: { <piece>: pad } of those not left as they were.
export function padsKept(pads) {
  const out = {};
  for (const [i, p] of Object.entries(pads || {})) {
    const q = padOf(p);
    if (/^\d+$/.test(i) && (q.level !== 1 || q.mute || q.choke)) out[i] = q;
  }
  return out;
}
// Every kit's pads on this phone ({ <print>: { at, pads } }) with this kit's
// set; the newest `most` kept. (Pure: the page saves what it returns.)
export function withPads(all, print, pads, at = Date.now(), most = 40) {
  const kits = { ...(all && typeof all === 'object' ? all : {}) };
  const kept = padsKept(pads);
  if (Object.keys(kept).length) kits[print] = { at, pads: kept };
  else delete kits[print];
  return Object.fromEntries(
    Object.entries(kits)
      .filter(([, k]) => k && typeof k === 'object')
      .sort((x, y) => (y[1].at || 0) - (x[1].at || 0))
      .slice(0, most)
  );
}

export class Jam {
  // backing: hits over a few bars ([{ i, beat }], its `cycle` in beats), or none.
  constructor({ backing = [], cycle = 16 } = {}) {
    this.loops = new Map();   // i -> { from, to (Infinity while playing), beats }
    this.tails = [];          // [{ i, from, to, beats }] loops tapped off and on in one bar: their last bar
    this.shots = [];          // [{ i, beat }] not yet played
    this.backing = backing;
    this.cycle = cycle;
    this.groove = true;
    this.takes = [];          // [{ from, to, hits }] recording, or finishing their last bar
    this.done = [];           // takes over, not yet made songs: [{ hits, beats }]
    this.upTo = 0;            // the end of the last window
    this.pad = () => PAD;     // i -> the pad's level, mute and choke now
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
    if (l && l.to > beat) this.tails.push({ i, ...l });   // still playing to its bar line
    this.loops.set(i, { from: at, to: Infinity, beats: Math.max(0.25, beats) });
    return { on: true, at };
  }
  // A one-shot pad tapped at `beat`. -> the beat it plays on. A step the
  // windows have passed isn't queued: the caller plays it at once, and it's
  // kept in the take.
  shot(i, beat, grid, late = 0) {
    const at = nextStep(beat, grid, late);
    if (at < this.upTo) this.keep([{ i, beat: at }]);
    else this.shots.push({ i, beat: at });
    return at;
  }
  stopAll(beat) {
    const at = nextBar(beat);
    for (const [i, l] of this.loops) {
      if (l.from >= at) this.loops.delete(i);
      else if (l.to > at) l.to = at;
    }
  }
  // Recording: from the next bar (or once the last take is over); stopped,
  // to the end of that bar. A take finishing its bar still becomes a song.
  record(beat) {
    const last = this.takes[this.takes.length - 1];
    if (last && last.to === Infinity) {
      last.to = Math.max(last.from + 4, nextBar(beat));
      return false;
    }
    this.takes.push({ from: Math.max(nextBar(beat), last ? last.to : 0), to: Infinity, hits: [] });
    return true;
  }
  recording() {
    const last = this.takes[this.takes.length - 1];
    return Boolean(last && last.to === Infinity);
  }
  // Hits into the takes they fall in, each at its pad's level and choke as it
  // was played (a muted pad's left out).
  keep(hits) {
    for (const t of this.takes)
      for (const h of hits) {
        if (h.beat < t.from || h.beat >= t.to) continue;
        const p = this.pad(h.i);
        const g = gainOf(p);
        if (g <= 0) continue;
        const hit = { i: h.i, beat: h.beat - t.from };
        if (g !== 1) hit.g = g;
        const c = chokeKey(h.i, p);
        if (c) hit.c = c;
        t.hits.push(hit);
      }
  }
  // Every hit from `a` (inclusive) to `b` (exclusive), in order: the
  // groove's, the loops', the shots'. Called with windows one after another.
  // (Each hit's beat is worked out from its own count, never added up, so a
  // hit on a window's edge falls in exactly one window, whatever the length.)
  due(a, b) {
    const out = [];
    const round = (i, from, to, len) => {
      for (let k = Math.max(0, Math.floor((a - from) / len)); ; k++) {
        const t = from + k * len;
        if (t >= b || t >= to) break;
        if (t >= a) out.push({ i, beat: t });
      }
    };
    if (this.groove && this.backing.length)
      for (let n = Math.floor(a / this.cycle); n * this.cycle < b; n++)
        for (const h of this.backing) {
          const t = n * this.cycle + h.beat;
          if (t >= a && t < b) out.push({ i: h.i, beat: t });
        }
    for (const [i, l] of this.loops) {
      round(i, l.from, l.to, l.beats);
      if (l.to <= b) this.loops.delete(i);
    }
    this.tails = this.tails.filter(l => (round(l.i, l.from, l.to, l.beats), l.to > b));
    this.shots = this.shots.filter(s => {
      if (s.beat < b) {
        if (s.beat >= a - 1e-9) out.push(s);
        return false;
      }
      return true;
    });
    out.sort((x, y) => x.beat - y.beat);
    this.keep(out);
    this.takes = this.takes.filter(t => {
      if (t.to > b) return true;
      this.done.push({ hits: choked(t.hits, h => h.c).map(({ c, ...h }) => h), beats: t.to - t.from });
      return false;
    });
    this.upTo = Math.max(this.upTo, b);
    return out;
  }
  // Stopped at `beat`: a take still open ends at its bar, every take is
  // finished, and nothing is left playing for the next start (from beat 0).
  end(beat) {
    if (this.recording()) this.record(beat);
    const to = Math.max(0, ...this.takes.map(t => t.to));
    if (to > this.upTo) this.due(this.upTo, to);
    this.loops.clear();
    this.tails = [];
    this.shots = [];
    this.upTo = 0;
  }
}

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

// A take's hits that join a loop partway (`off` beats in: a four-bar part
// joined on its second bar) as pieces of their own, the loop from there on
// (the engine plays every piece from its start). -> { pieces, roles, hits }
export function fromOffsets(pieces, roles, hits, bpm, sr) {
  const out = { pieces: [...pieces], roles: [...roles], hits: [] };
  const made = new Map();
  for (const { off, ...h } of hits) {
    const p = pieces[h.i];
    if (!(off > 0) || !p) {
      out.hits.push(h);
      continue;
    }
    const key = `${h.i}@${off}`;
    if (!made.has(key)) {
      const s = Math.min(p.L.length, Math.round(((off * 60) / bpm) * sr));
      made.set(key, out.pieces.length);
      out.pieces.push({ L: p.L.subarray(s), R: p.R.subarray(s) });
      out.roles.push(roles[h.i]);
    }
    out.hits.push({ ...h, i: made.get(key) });
  }
  return out;
}

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

// A take is kept at its last 32 bars: what came before is dropped and the rest
// shifted back. The cut falls where a 16-beat cycle begins (the take's `from`
// counted in), so the four-bar parts, which hit again on every cycle, are
// whole from the cut. -> { hits, beats }
export const MOST_TAKE = 128;
export function trimTake(hits, beats, from = 0, most = MOST_TAKE) {
  if (beats <= most) return { hits, beats };
  const cut = Math.ceil((beats - most + from) / 16 - 1e-9) * 16 - from;
  return {
    hits: hits.filter(h => h.beat >= cut - 1e-9).map(h => ({ ...h, beat: h.beat - cut })),
    beats: beats - cut
  };
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
  // group: starting it stops the others of its group at that bar (one bass
  // line at a time). phase: it keeps step with the cycle of its own length
  // (a four-bar part joined on bar 2 plays from its bar 2, on the same chord
  // as the rest), and stopped, it's cut at the bar rather than ringing on.
  // -> { on, at, off: [the pads it stopped] }
  toggle(i, beat, beats, { group = null, phase = false } = {}) {
    const at = nextBar(beat);
    const l = this.loops.get(i);
    if (l && l.to === Infinity) {
      this.halt(i, l, at);
      return { on: false, at, off: [i] };
    }
    const off = [];
    if (group != null)
      for (const [j, o] of this.loops)
        if (j !== i && o.group === group && o.to === Infinity) (this.halt(j, o, at), off.push(j));
    if (l && l.to > beat) this.tails.push({ i, ...l });   // still playing to its bar line
    this.loops.set(i, { from: at, to: Infinity, beats: Math.max(0.25, beats), group, phase });
    return { on: true, at, off };
  }
  // A loop stopped at `at` (a bar line): never started, it's forgotten; a
  // phased one is cut there in the takes too.
  halt(i, l, at) {
    if (l.from >= at) this.loops.delete(i);
    else {
      l.to = at;
      if (l.phase) this.cut(i, at);
    }
  }
  // The last hit of a loop, wherever a take has it, ends at `at`.
  cut(i, at) {
    for (const t of this.takes)
      for (const h of t.hits) if (h.i === i && h.lp && h.beat + t.from < at) h.cut = Math.min(h.cut ?? Infinity, at - t.from - h.beat);
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
  // Every loop off at the next bar. -> the pads stopped.
  stopAll(beat) {
    const at = nextBar(beat);
    const off = [];
    for (const [i, l] of this.loops) if (l.to > at) (this.halt(i, l, at), off.push(i));
    return { at, off };
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
  // The take still open (null: none).
  openTake() {
    const last = this.takes[this.takes.length - 1];
    return last && last.to === Infinity ? last : null;
  }
  // Whether the open take can be kept at `beat`: a bar has gone by since it began
  // and something has played in it (a take of nothing isn't a song).
  keepable(beat) {
    const t = this.openTake();
    return Boolean(t && beat - t.from >= 4 && t.hits.length);
  }
  // 存下來: the open take ends at its next bar line (a bar at least) and the next
  // one begins there, so nothing is lost between them and the second keeps only
  // what came after the first. Loops already going join the new take partway
  // (the way a part joined late does). -> the beat they meet at, or null when
  // no take was open (one is begun, as record() does).
  rotate(beat) {
    const last = this.openTake();
    if (!last) return void this.record(beat);
    const to = Math.max(last.from + 4, nextBar(beat));
    last.to = to;
    this.takes.push({ from: to, to: Infinity, hits: [] });
    for (const [i, l] of this.loops) {
      if (!l.phase || l.from >= to || l.to <= to) continue;
      const into = to - Math.floor(to / l.beats + 1e-9) * l.beats;
      // (On the cycle's own start the windows emit the hit, unless they have passed it.)
      if (into > 1e-9) this.keep([{ i, beat: to, off: into, lp: true }]);
      else if (to <= this.upTo) this.keep([{ i, beat: to, lp: true }]);
    }
    return to;
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
        if (h.off) hit.off = h.off;
        if (h.lp) hit.lp = true;
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
    // (A phased loop that starts partway into its cycle: that part of it
    // first, `off` beats in, then whole from the cycle's next start.)
    const round = (i, from, to, len, phase) => {
      let first = from;
      const into = phase ? from - Math.floor(from / len + 1e-9) * len : 0;
      if (into > 1e-9) {
        if (from >= a && from < b && from < to) out.push({ i, beat: from, off: into, lp: true });
        first = from - into + len;
      }
      for (let k = Math.max(0, Math.floor((a - first) / len)); ; k++) {
        const t = first + k * len;
        if (t >= b || t >= to) break;
        if (t >= a) out.push(phase ? { i, beat: t, lp: true } : { i, beat: t });
      }
    };
    if (this.groove && this.backing.length)
      for (let n = Math.floor(a / this.cycle); n * this.cycle < b; n++)
        for (const h of this.backing) {
          const t = n * this.cycle + h.beat;
          if (t >= a && t < b) out.push({ i: h.i, beat: t });
        }
    for (const [i, l] of this.loops) {
      round(i, l.from, l.to, l.beats, l.phase);
      if (l.to <= b) this.loops.delete(i);
    }
    this.tails = this.tails.filter(l => (round(l.i, l.from, l.to, l.beats, l.phase), l.to > b));
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
      // (A phased loop's hit ends at its next, where it was stopped, or with the take.)
      const beats = t.to - t.from;
      const last = new Map();
      const ordered = choked(t.hits, h => h.c);
      for (const h of ordered) {
        if (!h.lp) continue;
        const was = last.get(h.i);
        if (was && h.beat > was.beat) was.cut = Math.min(was.cut ?? Infinity, h.beat - was.beat);
        last.set(h.i, h);
      }
      const hits = ordered.map(({ c, lp, cut, ...h }) => {
        const end = lp ? Math.min(cut ?? Infinity, beats - h.beat, h.len ?? Infinity) : h.len;
        return end != null && end !== h.len ? { ...h, len: end } : h;
      });
      const entry = { hits, beats };
      // (Where the take began, for trimTake: not part of what's compared or kept.)
      Object.defineProperty(entry, 'from', { value: t.from, enumerable: false });
      this.done.push(entry);
      return false;
    });
    this.upTo = Math.max(this.upTo, b);
    return out;
  }
  // Nothing playing, nothing waiting, no take (a jam never started).
  reset() {
    this.loops.clear();
    this.tails = [];
    this.shots = [];
    this.takes = [];
    this.upTo = 0;
  }
  // Stopped at `beat`: a take still open ends at its bar, every take is
  // finished, and nothing is left playing for the next start (from beat 0).
  end(beat) {
    if (this.recording()) this.record(beat);
    const to = Math.max(0, ...this.takes.map(t => t.to));
    // (Even one whose bar line the windows already passed is finished.)
    this.due(this.upTo, Math.max(to, this.upTo));
    this.loops.clear();
    this.tails = [];
    this.shots = [];
    this.upTo = 0;
  }
}

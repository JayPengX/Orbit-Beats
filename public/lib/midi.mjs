// MIDI files (匯出 MIDI): a song's hits or a clip's notes as a Standard
// MIDI File (format 1, 480 ticks a beat), to finish in any DAW. A song's
// pieces are a sampler's: each piece its own note (C2 for the first, then
// up a semitone each), one track a bus; a clip's drums on General MIDI's
// drum channel by their usual notes, its notes as written (a chord as its
// three notes). No DOM: the tests read the files back.

import { BUSES, BUS_OF } from './mix.mjs';
import { STEPS, stepHits, swingOf } from './synth.mjs';

export const PPQ = 480;
// General MIDI's drum notes for the studio's drums.
export const GM_DRUMS = { kick: 36, snare: 38, clap: 39, hat: 42, open: 46, rim: 37, tom: 45, sub: 35, crash: 49, ride: 51, shaker: 70, cowbell: 56, conga: 63, bongo: 60, snap: 40, perc: 76 };

const vlq = n => {
  const out = [n & 0x7f];
  for (n >>>= 7; n; n >>>= 7) out.unshift((n & 0x7f) | 0x80);
  return out;
};
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = s => [...new TextEncoder().encode(s)];

// { bpm, tracks: [{ name, channel, notes: [{ beat, beats, note, vel }] }] } -> Uint8Array
export function midiFile({ bpm, tracks }) {
  const chunk = (id, body) => [...text(id), ...u32(body.length), ...body];
  const usPerBeat = Math.round(60e6 / bpm);
  const meta = [0, 0xff, 0x51, 3, (usPerBeat >> 16) & 255, (usPerBeat >> 8) & 255, usPerBeat & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0xff, 0x2f, 0];
  const out = [...chunk('MThd', [0, 1, 0, tracks.length + 1, PPQ >> 8, PPQ & 255]), ...chunk('MTrk', meta)];
  for (const t of tracks) {
    const ch = t.channel & 15;
    const evs = [];
    // (A note played again before it ended ends there: no two of one note at once.)
    const notes = t.notes
      .map(n => ({ on: Math.max(0, Math.round(n.beat * PPQ)), len: Math.round(n.beats * PPQ), note: Math.max(0, Math.min(127, n.note | 0)), vel: Math.max(1, Math.min(127, n.vel | 0 || 100)) }))
      .sort((a, b) => a.on - b.on);
    const next = new Map();
    for (let k = notes.length - 1; k >= 0; k--) {
      const n = notes[k];
      const off = Math.max(n.on + 1, Math.min(n.on + n.len, next.get(n.note) ?? Infinity));
      if (next.get(n.note) !== n.on) evs.push([n.on, 1, 0x90 | ch, n.note, n.vel], [off, 0, 0x80 | ch, n.note, 0]);
      next.set(n.note, n.on);
    }
    evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);   // at one moment, the notes ending first
    const body = [0, 0xff, 0x03, ...vlq(text(t.name).length), ...text(t.name)];
    let at = 0;
    for (const [tick, , st, note, vel] of evs) {
      body.push(...vlq(tick - at), st, note, vel);
      at = tick;
    }
    body.push(0, 0xff, 0x2f, 0);
    out.push(...chunk('MTrk', body));
  }
  return Uint8Array.from(out);
}

// A song's hits ({ i, a }: the piece and the sample it starts on, as
// makeSong gives them) as tracks: one a bus, each piece note 36 + its number.
export function songTracks(events, roles, pieces, sr, bpm, names = {}) {
  const B = (60 / bpm) * sr;
  return BUSES.map((bus, ch) => ({
    name: names[bus] || bus,
    channel: ch,
    notes: events
      .filter(e => BUS_OF[roles[e.i]] === bus)
      .map(e => ({ beat: e.a / B, beats: Math.min(16, Math.max(0.25, Math.min(e.n || Infinity, pieces[e.i].L.length) / B)), note: 36 + e.i, vel: Math.max(1, Math.round(100 * Math.sqrt(e.g ?? 1))) }))
  })).filter(t => t.notes.length);
}

// A clip's notes as tracks: drums on channel 10 by General MIDI's notes, an instrument on channel 1.
export function clipTracks(clip, name = 'Clip') {
  const notes = [];
  for (let s = 0; s < STEPS * clip.bars; s++) {
    const beat = (s + swingOf(clip, s)) / 4;
    for (const h of stepHits(clip, s))
      notes.push({ beat, beats: clip.kind === 'drums' ? 0.25 : h.len / 4, note: clip.kind === 'drums' ? GM_DRUMS[h.inst] : h.midi, vel: Math.round(96 * Math.min(1.3, h.gain)) });
  }
  return [{ name, channel: clip.kind === 'drums' ? 9 : 0, notes }];
}

// A file read back (for the tests, and anyone checking): its tempo and each
// track's notes, in beats. -> { bpm, tracks: [{ name, notes: [{ beat, beats, note, vel, channel }] }] }
export function readMidi(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = o => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (tag(0) !== 'MThd') throw new Error('Not a MIDI file');
  const ppq = v.getUint16(12);
  let o = 8 + v.getUint32(4);
  let bpm = 120;
  const tracks = [];
  while (o + 8 <= bytes.length) {
    const len = v.getUint32(o + 4);
    let p = o + 8;
    const end = p + len;
    let t = 0;
    let status = 0;
    const open = new Map();
    const track = { name: '', notes: [] };
    const read = () => {
      let n = 0;
      let b;
      do {
        b = bytes[p++];
        n = (n << 7) | (b & 0x7f);
      } while (b & 0x80);
      return n;
    };
    while (p < end) {
      t += read();
      if (bytes[p] & 0x80) status = bytes[p++];
      if (status === 0xff) {
        const type = bytes[p++];
        const l = read();
        if (type === 0x51) bpm = Math.round((60e6 / ((bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2])) * 1000) / 1000;
        if (type === 0x03) track.name = new TextDecoder().decode(bytes.subarray(p, p + l));
        p += l;
        continue;
      }
      const kind = status & 0xf0;
      const ch = status & 15;
      const a = bytes[p++];
      const b = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[p++];
      if (kind === 0x90 && b) open.set(`${ch}:${a}`, { beat: t / ppq, vel: b, ch });
      else if (kind === 0x80 || (kind === 0x90 && !b)) {
        const on = open.get(`${ch}:${a}`);
        if (on) {
          track.notes.push({ beat: on.beat, beats: t / ppq - on.beat, note: a, vel: on.vel, channel: ch });
          open.delete(`${ch}:${a}`);
        }
      }
    }
    if (track.notes.length || track.name) tracks.push(track);
    o = end;
  }
  return { bpm, tracks };
}

// A song saved as a small file (存成檔案) and opened again (打開檔案).
//
// The file holds only what defines the song: its seed and variation, groove,
// sections (the arrangement), lengths, drum styles, looseness and mixer, plus
// the tempo and roles it was made at and which kit it was (the kit's
// fingerprint, as the Pass keeps it). Never a kit's sound: opened with the
// same pieces it is the same song; with others, the same plan on their sound.
//
// { app: 'orbit-beats', kind: 'song', v: 1, name, kit, pieces, bpm, roles,
//   mood, key, sections, song: { seed, detail, style, plan, minBars, maxBars,
//   styles, humanize, mix } }   (a jam's take: song: { jam: [{ i, beat, g?, len? }], plan, mix, at })
// `key` and `sections` only say what the song is (for a person reading it).
// No DOM.

import { STYLES, ROLES, MIN_BARS, planOf } from '../engine.mjs';
import { mixOf } from './mix.mjs';

export const APP = 'orbit-beats';
export const VERSION = 1;
const MAX_BYTES = 400_000;
const MAX_HITS = 6000;

const say = (code, zh, en) => ({ ok: false, code, zh, en });

// The file for a song: { name, info, recipe } of the page, with the kit's
// tempo, roles and the mood its styles make (any of them may be missing).
export function toFile({ name, info, recipe }, { bpm = info?.bpm, roles = null, mood = '' } = {}) {
  const r = recipe;
  const song = r.jam
    ? { jam: r.jam.map(e => ({ i: e.i, beat: e.beat, ...(e.g != null ? { g: e.g } : {}), ...(e.len != null ? { len: e.len } : {}) })), plan: r.plan ?? null, mix: r.mix ?? null, at: r.at ?? 0 }
    : { seed: r.seed, detail: r.detail ?? null, style: r.style ?? null, plan: r.plan ?? null, minBars: r.minBars, maxBars: r.maxBars, styles: [...r.styles], humanize: r.humanize, mix: r.mix ?? null };
  return {
    app: APP,
    kind: 'song',
    v: VERSION,
    name,
    kit: r.print || '',
    ...(roles ? { pieces: roles.length, roles: [...roles] } : {}),
    ...(Number.isFinite(bpm) ? { bpm } : {}),
    ...(mood ? { mood } : {}),
    ...(info?.key ? { key: { tonic: info.key.tonic, minor: Boolean(info.key.minor) } } : {}),
    ...(info?.plan ? { sections: info.plan.map(([t, n]) => [t, n]) } : {}),
    song
  };
}
export const toText = file => JSON.stringify(file, null, 1);

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function planIn(p) {
  if (p == null) return null;
  planOf(p);   // (throws on a section it doesn't know, or too long)
  return p.map(([t, n]) => [t, n]);
}

// Text from a file -> { ok: true, project: { name, kit, pieces, bpm, roles, mood, recipe } } or
// { ok: false, code, zh, en } saying what's wrong. `recipe` is as the page's songs have it, without `print`.
export function fromText(text) {
  if (typeof text !== 'string' || !text.trim()) return say('empty', '這個檔案是空的', 'This file is empty');
  if (text.length > MAX_BYTES) return say('big', '這個檔案太大，不是 Orbit Beats 的歌曲檔', "This file is too big to be an Orbit Beats song file");
  let f;
  try {
    f = JSON.parse(text);
  } catch {
    return say('json', '打不開：這不是歌曲檔（內容讀不懂）', "Can't open it: this isn't a song file (it can't be read)");
  }
  if (!f || typeof f !== 'object' || Array.isArray(f) || f.app !== APP || f.kind !== 'song') return say('other', '這不是 Orbit Beats 存的歌曲檔', "This isn't a song file saved by Orbit Beats");
  if (!Number.isInteger(f.v) || f.v < 1) return say('old', '這個檔案的版本太舊或讀不懂，打不開', "This file's version is too old or unreadable, so it can't be opened");
  if (f.v > VERSION) return say('future', '這個檔案是比較新的版本存的：請先更新 Orbit Beats 再打開', 'This file was saved by a newer version: update Orbit Beats, then open it');
  const s = f.song;
  if (!s || typeof s !== 'object') return say('bad', '檔案裡沒有這首歌的內容', 'The file has no song in it');
  try {
    const name = typeof f.name === 'string' && f.name.trim() ? f.name.trim().slice(0, 80) : '';
    let recipe;
    if (s.jam !== undefined) {
      if (!Array.isArray(s.jam) || !s.jam.length || s.jam.length > MAX_HITS) throw new Error('hits');
      const jam = s.jam.map(e => {
        if (!e || !isInt(e.i, 0, 255) || !isNum(e.beat, 0, 4096) || (e.g != null && !isNum(e.g, 0, 1)) || (e.len != null && !isNum(e.len, 0, 4096))) throw new Error('hit');
        return { i: e.i, beat: e.beat, ...(e.g != null ? { g: e.g } : {}), ...(e.len != null ? { len: e.len } : {}) };
      });
      recipe = { jam, plan: planIn(s.plan), mix: mixOf(s.mix), at: Number.isFinite(s.at) ? s.at : 0 };
    } else {
      if (!isInt(s.seed, 0, 9_999_999_999)) throw new Error('seed');
      if (s.detail != null && !isInt(s.detail, 0, 9_999_999_999)) throw new Error('detail');
      if (s.style != null && !STYLES.includes(s.style)) throw new Error('style');
      if (!isInt(s.minBars, MIN_BARS, 64) || !isInt(s.maxBars, MIN_BARS, 64) || s.minBars > s.maxBars) throw new Error('bars');
      if (!Array.isArray(s.styles) || !s.styles.length || s.styles.some(x => !STYLES.includes(x))) throw new Error('styles');
      if (!isNum(s.humanize, 0, 200)) throw new Error('humanize');
      recipe = { seed: s.seed, detail: s.detail ?? null, style: s.style ?? null, plan: planIn(s.plan), minBars: s.minBars, maxBars: s.maxBars, styles: [...new Set(s.styles)], humanize: s.humanize, mix: mixOf(s.mix) };
    }
    const roles = Array.isArray(f.roles) && f.roles.length <= 256 && f.roles.every(r => ROLES.includes(r)) ? f.roles : null;
    return {
      ok: true,
      project: {
        name,
        kit: typeof f.kit === 'string' ? f.kit.slice(0, 40) : '',
        pieces: roles ? roles.length : isInt(f.pieces, 1, 256) ? f.pieces : 0,
        bpm: isNum(f.bpm, 40, 250) ? f.bpm : null,
        roles,
        mood: typeof f.mood === 'string' ? f.mood.slice(0, 20) : '',
        recipe
      }
    };
  } catch (e) {
    return say('bad', `檔案裡的歌曲內容不對（${e.message}），打不開`, `The song inside the file is wrong (${e.message}), so it can't be opened`);
  }
}

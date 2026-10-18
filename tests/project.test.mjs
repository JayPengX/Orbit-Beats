// 存成檔案 / 打開檔案: a song as a small settings file and back; a bad, older or newer file says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toFile, toText, fromText, VERSION } from '../public/lib/project.mjs';
import * as make from '../public/lib/make.mjs';
import { MIX, mixOf } from '../public/lib/mix.mjs';
import { STYLES, demoRecording, splitPieces, analyzeRecording } from '../public/engine.mjs';

const rec = demoRecording();
const pieces = splitPieces(rec);
const heard = analyzeRecording(pieces, rec.sr);
const kit = { pieces, sr: rec.sr, heard, bpm: heard.bpm, roles: heard.roles };
const recipe = { print: 'kabc', seed: 4, minBars: 8, maxBars: 16, styles: ['trap', 'drill'], humanize: 60, mix: mixOf({ ...MIX, reverb: 0.5 }), detail: 77, style: 'trap', plan: [['intro', 2], ['verse', 4], ['pre', 2], ['hook', 4], ['outro', 2]] };
const song = { name: '霓虹夜行', info: { bpm: 125, key: { tonic: 9, minor: true }, plan: recipe.plan }, recipe };

test('export then import gives the same recipe, and the same sound', () => {
  const text = toText(toFile(song, { roles: heard.roles, mood: 'hype' }));
  const r = fromText(text);
  assert.equal(r.ok, true);
  assert.deepEqual({ print: 'kabc', ...r.project.recipe }, recipe);
  assert.deepEqual([r.project.name, r.project.kit, r.project.bpm, r.project.mood, r.project.pieces], ['霓虹夜行', 'kabc', 125, 'hype', heard.roles.length]);
  assert.deepEqual(r.project.roles, heard.roles);
  make.setKit(kit);
  assert.deepEqual(make.song({ print: 'kabc', ...r.project.recipe }).wav, make.song(recipe).wav);
});

test('a song made from its seed alone (no arrangement) and a jam both come back the same', () => {
  const plain = { print: 'k1', seed: 123456789, detail: null, style: 'house', plan: null, minBars: 25, maxBars: 29, styles: [...STYLES], humanize: 100, mix: mixOf({ ...MIX, on: false }) };
  const a = fromText(toText(toFile({ name: 'x', info: {}, recipe: plain })));
  assert.deepEqual({ print: 'k1', ...a.project.recipe }, plain);
  const jam = { print: 'k1', jam: [{ i: 0, beat: 0 }, { i: 2, beat: 1.5, g: 0.5, len: 2 }], plan: null, mix: mixOf(null), at: 5 };
  const b = fromText(toText(toFile({ name: 'j', info: {}, recipe: jam })));
  assert.deepEqual({ print: 'k1', ...b.project.recipe }, jam);
});

test('the file holds settings only: no audio, nothing of a kit\'s sound', () => {
  const text = toText(toFile(song, { roles: heard.roles }));
  assert.ok(text.length < 3000, `${text.length} bytes`);
  const f = JSON.parse(text);
  assert.deepEqual(Object.keys(f).sort(), ['app', 'bpm', 'key', 'kind', 'kit', 'mood', 'name', 'pieces', 'roles', 'sections', 'song', 'v'].filter(k => k in f).sort());
  assert.equal(f.v, VERSION);
  assert.ok(!/"(L|R|data|wav|samples|pieces":\s*\[)/.test(text));
});

test('a file that is not a song file says why, never nothing', () => {
  const good = JSON.parse(toText(toFile(song)));
  const bad = (x, code) => {
    const r = fromText(typeof x === 'string' ? x : JSON.stringify(x));
    assert.equal(r.ok, false, code);
    assert.equal(r.code, code);
    assert.ok(r.zh.length > 4 && r.en.length > 4, 'a message in both languages');
  };
  bad('', 'empty');
  bad('   ', 'empty');
  bad('not json {', 'json');
  bad('[1,2]', 'other');
  bad('null', 'other');
  bad({ ...good, app: 'something-else' }, 'other');
  bad({ ...good, kind: 'kit' }, 'other');
  bad({ ...good, song: undefined }, 'bad');
  bad({ ...good, song: { ...good.song, seed: 'x' } }, 'bad');
  bad({ ...good, song: { ...good.song, style: 'polka' } }, 'bad');
  bad({ ...good, song: { ...good.song, styles: [] } }, 'bad');
  bad({ ...good, song: { ...good.song, styles: ['nope'] } }, 'bad');
  bad({ ...good, song: { ...good.song, minBars: 30, maxBars: 20 } }, 'bad');
  bad({ ...good, song: { ...good.song, humanize: 'lots' } }, 'bad');
  bad({ ...good, song: { ...good.song, plan: [['solo', 4]] } }, 'bad');
  bad({ ...good, song: { ...good.song, plan: [['hook', 17]] } }, 'bad');
  bad({ ...good, song: { ...good.song, plan: [] } }, 'bad');
  bad({ ...good, song: { jam: [{ i: -1, beat: 0 }] } }, 'bad');
  bad({ ...good, song: { jam: [] } }, 'bad');
});

test('an older or a newer version is turned away with its own message', () => {
  const good = JSON.parse(toText(toFile(song)));
  const old = fromText(JSON.stringify({ ...good, v: 0 }));
  assert.equal(old.code, 'old');
  assert.match(old.zh, /太舊/);
  assert.equal(fromText(JSON.stringify({ ...good, v: undefined })).code, 'old');
  assert.equal(fromText(JSON.stringify({ ...good, v: '1' })).code, 'old');
  const next = fromText(JSON.stringify({ ...good, v: VERSION + 1 }));
  assert.equal(next.code, 'future');
  assert.match(next.zh, /更新/);
  assert.match(next.en, /update/i);
});

test('odd extras in a good file are dropped, not carried', () => {
  const f = JSON.parse(toText(toFile(song)));
  f.song.mix = { on: true, drums: 999, evil: 1 };
  f.song.extra = 'x';
  f.roles = ['riff', 'banana'];
  f.bpm = 5;
  const r = fromText(JSON.stringify(f));
  assert.equal(r.ok, true);
  assert.equal(r.project.recipe.mix.drums, 6);
  assert.ok(!('evil' in r.project.recipe.mix) && !('extra' in r.project.recipe));
  assert.equal(r.project.roles, null);
  assert.equal(r.project.bpm, null);
});

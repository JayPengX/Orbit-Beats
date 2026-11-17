// 資料庫 after one refused read of the kept songs (IndexedDB, as iOS refuses
// it now and then): kept as none, it said 還沒有收藏的歌 the whole visit over
// songs still kept, and syncSongs saved every song on the Pass again over its
// kept copy without its sound (proven 11-18).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

test('a refused read of the kept songs is no list, read again at the next look, never "nothing kept"', () => {
  const kits = read('lib/kits.mjs');
  const list = kits.slice(kits.indexOf('export async function listSongs'), kits.indexOf('\n}\n', kits.indexOf('export async function listSongs')));
  assert.doesNotMatch(list, /\.catch\(/, 'listSongs lets a refused read throw');
  const lib = read('lib/library.mjs');
  const readAll = lib.slice(lib.indexOf('const readAll = () =>'), lib.indexOf('));', lib.indexOf('const readAll = () =>')));
  assert.match(readAll, /\(\) => \(\(read = null\), \(unread = true\), null\)/, 'a failure: read again next time, and said');
  assert.doesNotMatch(readAll, /catch\(\(\) => \[\]\)/);
  assert.match(lib, /unread\s*\?\s*ui\.empty\(\{[^\n]*讀不到資料庫/, 'the root says it couldn’t read, with 再試一次');
  const app = read('app.js');
  const sync = app.slice(app.indexOf('async function syncSongs()'), app.indexOf('const plan', app.indexOf('async function syncSongs()')));
  assert.match(sync, /if \(!\(await lib\.read\(\)\)\) return;/, 'nothing synced over songs not read');
});

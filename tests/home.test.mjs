// 首頁's rules (Orbit's own look, 2026-11-03): the home is the player, and its song's parts are one line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const html = read('index.html');
const home = read('lib/homeview.mjs');
const css = read('look.css');
const app = read('app.js');

test('the look is always on: data-look on the page, look.css after the page\'s style', () => {
  assert.match(html, /<html[^>]*data-look="native"/);
  assert.ok(html.indexOf('./look.css') > html.lastIndexOf('</style>'));
  assert.doesNotMatch(app + home, /orbit\.look/);
  assert.match(app, /home = mountHome\(\$\('panel-home'\)/);
});

test('首頁 opens on the player card: cover, ▶ and the parts line, then the rows', () => {
  assert.match(home, /class: 'q-card bt-now' \}, \[head, h\('div', \{ class: 'bt-line' \}, \[parts, names\]\)/);
  assert.match(home, /\[h\('div', \{ class: 'bt-col' \}, \[card, upSlot\]\)/);
});

test('each part is as long as it plays, on its own colour, and a tap goes there', () => {
  assert.match(home, /style: \{ flex: String\(s\.bars\) \}/);
  assert.match(home, /setProperty\('--c', `var\(--\$\{times\[k\]\.type\}\)`\)/);
  assert.match(home, /P\.seek\(s\.from \+ 0\.01\)/);
});

test('one player at a time: the mini player steps aside while the card is seen', () => {
  assert.match(home, /classList\.toggle\('bt-now-seen'/);
  assert.match(css, /body\.bt-now-seen:not\(\.own-sound\) \.player/);
});

test('no cover blur behind Now Playing', () => {
  assert.match(css, /\.np > \.np-bg,\s*html\[data-look='native'\] \.np > \.np-shade \{\s*display: none;/);
});

// Wide (Jay's iPad 2026-11-11): one song to come stood a cover the page's width,
// and 最近播放 a list a fifth of the page wide beside nothing. Cover grids widen at
// most to twice a cover (the kit's .q-rows-snug); 最近播放 and 你的歌 are covers too.
test('wide 首頁: cover grids are snug, and what you heard is covers', () => {
  const src = readFileSync(new URL('../public/lib/homeview.mjs', import.meta.url), 'utf8');
  assert.match(src, /class: 'bt-tiles q-rows-full q-rows-snug'/);
  const recent = src.slice(src.indexOf('function drawRecent()'), src.indexOf('function drawAll()'));
  assert.match(recent, /if \(isWide\(\)\)[\s\S]*songGridOf\('recent'/);
});

// Fixed in testing (2026-11-12): a song queued again was left out of 接下來, the card's ⋯ offered
// 播放 for the song already playing, ♡ on a radio song could make it twice, a batch's 復原 undid
// only its last song, and 樂器/做歌/即興 had no swipe back.
test('接下來 keeps what you queued, in order, before the station\'s own', () => {
  assert.match(home, /const mine = s\?\.track \? P\.q\.upNext\.filter\(Boolean\) : \[\];/);
  assert.match(home, /const ups = \[\.\.\.mine, \.\.\.theirs\.filter\(/);
});
test('the card\'s ⋯ on the song playing is Now Playing\'s menu (no 播放)', () => {
  assert.match(home, /api\.trackMenu\(shown\(\)\.t, e\.currentTarget, shown\(\)\.live \? \{ np: true \} : \{\}\)/);
});
test('♡ on a radio song makes it once, with 存到資料庫中… till it\'s kept', () => {
  assert.match(app, /if \(keepingRadio\.has\(id\)\) return;/);
  assert.match(app, /finally \{\s*keepingRadio\.delete\(id\);/);
});
test('a batch\'s auto-keep counts the whole batch, so 復原 takes every song out', () => {
  assert.match(app, /const reset = \(\) => \(autoTimer = busy \|\| autoKeeping \? setTimeout\(reset, 6000\)/);
});
test('a swipe in from the left edge goes back from a 創作 screen', () => {
  assert.match(app, /ui\.edgeBack\?\.\(\{ target: \(\) => \(SUBS\.includes\(tabNow\)/);
});
test('a new list that couldn\'t be saved isn\'t added to or said to be; one that is is named', () => {
  const lib = read('lib/library.mjs');
  assert.match(lib, /if \(saveLists\(makeList\(lists, v, id\)\) === true\) then\?\.\(id\);/);
  assert.match(lib, /toast\(n \? W\(`已加到「\$\{n\}」`/);
});
test('創作\'s 你的歌 is drawn again once 資料庫 is read, and when songs come from the Pass', () => {
  assert.match(app, /const songsShown = \(\) => \(home\?\.refresh\(\), tabNow === 'create' && hubDraw\(\)\);/);
  assert.match(app, /await lib\.read\(\);\n\s*\/\/[^\n]*\n\s*songsShown\(\);/);
  assert.match(app, /if \(changed\) songsShown\(\);/);
});
test('從這個清單移除 says which list the song left', () => {
  assert.match(read('lib/library.mjs'), /=== true && l\) toast\(W\(`已從「\$\{l\.name\}」移除`/);
});
test('a clip\'s pads: its section on the pad, numbered when one clip gave several, the whole name read out', () => {
  const jam = read('lib/jamview.mjs');
  assert.match(jam, /const no = many\[named\(i\)\] > 1 \? ` \$\{n\}` : '';/);
  assert.match(jam, /return \{ name: \[`\$\{section \|\| head\}\$\{no\}`/);
});
test('這首結束 set during an opening waits for the song, not the opening\'s end', () => {
  assert.match(read('lib/radioview.mjs'), /if \(sleep\.song && cur\?\.id && cur\.id === sleep\.item\?\.id\) sleep\.item = cur;\n\s*if \(sleep\.song && cur !== sleep\.item\)/);
});

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

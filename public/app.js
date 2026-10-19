// Orbit Beats (was Passion Beats): beat pieces in (one recording, a pack of
// sample files, a take from the microphone, or clips made on its own
// instruments), new songs out, made of the pieces and mixed (or exactly as
// recorded, the mixer off). Four tabs: 做歌 (the pieces, a mood, the songs),
// 樂器 (drums and notes to make clips with, lib/studio.mjs), 即興 (the
// pieces as pads, played live and kept as a song, lib/jamview.mjs) and 歌單
// (the songs kept, on this phone). An Orbit app: the kit draws the loading
// screen, the bar and the tab bar, keeps the app current and opening
// offline; the Quadra Pass keeps the settings, each kit's tempo and roles
// and the styles you keep (your taste); the sound never leaves the phone.
import { quadraSession, topActions, installGate, watchUpdates, keepOffline, tabBar, ask } from '#kit/quadra.mjs';
import { h, sheet, menu, toast, toggle, empty } from './lib/ui.mjs';
import { sectionTimes, sectionIndex, labelFits } from './lib/sections.mjs';
import { STYLES, SECTIONS, ROLES, MIN_BARS, makeRng, NOTE_NAMES, keyOf, pieceChroma, parseWav, analyzeRecording, guessRole, batch, encodeWav, zipParts, demoRecording } from './engine.mjs';
import { atRate, splitAll, baseName } from './lib/sources.mjs';
import { fingerprint, decode, encode, merge, keptSettings, settingsOf, DEFAULTS, kitEntry, saveLast, loadLast, liked, saveSong, deleteSong, getSong, swapSong, dropTemps, tempId, renameSong, forgetLast, saveNamed, deleteNamed, listNamed, renameNamed } from './lib/kits.mjs';
import { dropPieces, snapOf, rolesBack, undoStack, namedKit, kitFrom, freeName } from './lib/kitops.mjs';
import { voice, renderClip, DRUM_NAMES, INSTRUMENT_ROLE, INSTRUMENT_NAMES } from './lib/synth.mjs';
import { MIX, mixOf, STEMS } from './lib/mix.mjs';
import { STYLE_NAMES, STYLE_ORDER, SECTION_NAMES, ROLE_NAMES, BUS_NAMES, name } from './lib/names.mjs';
import { tapper } from './lib/tap.mjs';
import { download, shareFile, fileName } from './lib/download.mjs';
import { toFile, toText, fromText } from './lib/project.mjs';
import { maker } from './lib/maker.mjs';
import { libraryView, nameSheet } from './lib/library.mjs';
import { packSong, packWay, playsWhole, keptAudio, sameSong, slimTo, soundOf, formOf, kindOf, builtIn, mbText, PACKED } from './lib/pack.mjs';
import { mountStudio } from './lib/studio.mjs';
import { mountJam, readSet, setCover } from './lib/jamview.mjs';
import { specOf } from './lib/jamset.mjs';
import { W, en, lang } from './lib/lang.mjs';
import { shows, levelCss, makeSettings } from './lib/easy.mjs';
import { MOODS, radioPick, radioPlan } from './lib/radio.mjs';
import { mountRadio } from './lib/radioview.mjs';
import { TERM_ORDER, EXAMPLES, term, info } from './lib/help.mjs';
import * as kitQ from '#kit/quadra.mjs';
import { icon, inner } from './lib/icons.mjs';
import { createPlayer, coverOfTrack } from './lib/player.mjs';
import { mountPlayerView, subOf, onLong, speedText } from './lib/playerview.mjs';
import { mountHome, songShelf } from './lib/homeview.mjs';
import { remix, surprise, remixId, remixTitle, kindOfRecipe, baseOf, radioBase, bandBase, lengthStep, retime, clipSpan, partOf } from './lib/remix.mjs';
import { remixSheet, clipSheet, PART_NAMES } from './lib/remixview.mjs';
import { stationId } from './lib/stations.mjs';
import * as Q from './lib/queue.mjs';
import { LENGTH_MIN, LENGTH_MAX, LENGTH_STEP, LENGTH_PRESETS, clampLength, clock, kitLength } from './lib/length.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MAX_SONGS = 30;
const MAX_BARS = 64;
// A key as words: "A 小調", "E♭ major".
const keyName = k => (k ? `${NOTE_NAMES[k.tonic]} ${k.minor ? W('小調', 'minor') : W('大調', 'major')}` : '');
// Each song's title, from its seed: two words that go together (霓虹夜行, Neon Drive).
const TITLE_A = [['霓虹', 'Neon'], ['午夜', 'Midnight'], ['潮汐', 'Tidal'], ['微光', 'Glow'], ['星塵', 'Stardust'], ['熱浪', 'Heatwave'], ['晨霧', 'Morning'], ['雨季', 'Rainy'], ['海風', 'Sea'], ['黃昏', 'Golden'], ['冷焰', 'Cold'], ['銀河', 'Galaxy'], ['街角', 'Corner'], ['迴旋', 'Spiral'], ['心跳', 'Heart'], ['低語', 'Whisper'], ['遠方', 'Faraway'], ['電光', 'Electric'], ['月色', 'Moonlit'], ['沙漠', 'Desert']];
const TITLE_B = [['夜行', 'Drive'], ['漂流', 'Drift'], ['飛行', 'Flight'], ['狂想', 'Dream'], ['節拍', 'Groove'], ['之歌', 'Song'], ['派對', 'Party'], ['邊境', 'Border'], ['旅程', 'Journey'], ['迷宮', 'Maze'], ['訊號', 'Signal'], ['脈搏', 'Pulse'], ['花火', 'Sparks'], ['引擎', 'Engine'], ['浪潮', 'Waves'], ['序曲', 'Prelude'], ['回聲', 'Echo'], ['奔跑', 'Run'], ['慢舞', 'Sway'], ['密語', 'Secrets']];
const songTitle = seed => {
  const a = TITLE_A[seed % 20];
  const b = TITLE_B[Math.floor(seed / 20) % 20];
  return en ? `${a[1]} ${b[1]}` : `${a[0]}${b[0]}`;
};
const ICON = { play: icon('play'), pause: icon('pause'), heart: icon('heart'), hearted: icon('heart-fill'), more: icon('more') };
document.documentElement.lang = en ? 'en' : 'zh-Hant';
// The page's own words in English (each element's data-en; labels and placeholders too).
if (en) {
  for (const n of document.querySelectorAll('[data-en]')) n.textContent = n.dataset.en;
  for (const n of document.querySelectorAll('[data-en-label]')) n.setAttribute('aria-label', n.dataset.enLabel);
  for (const n of document.querySelectorAll('[data-en-placeholder]')) n.placeholder = n.dataset.enPlaceholder;
}

const q = quadraSession('beats', { lang });
// 簡單 / 進階: one stylesheet rule per control only one of them shows (lib/easy.mjs).
document.head.append(h('style', { text: levelCss() }));

let sources = []; // { name, sr, L, R }: the kit's files (or take, or clips), at one rate
let sr = 48000;
let pieces = [];
let roles = []; // one per piece: as heard, then as set
let edited = new Set(); // pieces whose role was set by hand
let heard = null; // analyzeRecording's: tempo and each piece's analysis
let bpm = 120; // as heard, then as set
let print = ''; // the kit's fingerprint
let songs = []; // this batch: { id, name, info, data, url, bits, recipe }
let busy = false;
const make = maker(new URL('./lib/maker.worker.mjs', import.meta.url));
let kitSent = ''; // the kit the maker has: its print, tempo and roles

// ---- What's kept: this phone's copy of the Pass's payload, and the Pass's ----

const KEY = 'orbit-beats';
let kept = decode(
  (() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  })()
);
// (Passion Beats' settings, from before Orbit, carried over once.)
if (!kept.settings) {
  try {
    const old = JSON.parse(localStorage.getItem('passion-beats') || 'null');
    if (old) kept.settings = keptSettings(old, 1);
  } catch {}
}
let settings = settingsOf(kept.settings, DEFAULTS);
const simple = () => settings.level !== 'pro';
// What songs are made on: Advanced's settings, or Simple's own fixed ones (lib/easy.mjs), never mixed.
const cfg = () => makeSettings(settings.level, settings);
// The level on the page: body.lv-simple or body.lv-pro.
function applyLevel() {
  document.body.classList.toggle('lv-simple', simple());
  document.body.classList.toggle('lv-pro', !simple());
}
applyLevel();
function setLevel(v) {
  if (settings.level === v) return;
  settings.level = v;
  save();
  applyLevel();
  // (Simple splits on its own settings too: the kit split again only when the two differ.)
  if (sources.length && (makeSettings('simple', settings).silenceDb !== settings.silenceDb || makeSettings('simple', settings).minGap !== settings.minGap)) split();
  update();
  studio?.shown?.();
  jam?.level?.();
  toast(v === 'pro' ? W('進階：所有工具都在', 'Advanced: every tool shown') : W('簡單：只留做歌需要的', 'Simple: just what you need'), { ms: 1600 });
}

let shareTimer = 0;
function keep(share = true) {
  try {
    localStorage.setItem(KEY, encode(kept));
  } catch {}
  if (share) {
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => q.active && q.write({ payload: encode(kept) }).catch(() => {}), 1500);
  }
}
const save = () => {
  kept.settings = keptSettings(settings);
  keep();
};
// This kit's tempo and hand-set roles, when either was changed by hand.
function keepKit() {
  if (!print || !heard) return;
  if (!edited.size && bpm === heard.detected) {
    if (kept.kits[print]) delete kept.kits[print];
  } else kept.kits[print] = kitEntry(bpm, roles, edited);
  keep();
}

// ---- Tabs ----

const TABS = ['home', 'create', 'library'];
const TAB_NAMES = { home: ['首頁', 'Home'], create: ['創作', 'Create'], library: ['資料庫', 'Library'] };
const TAB_ICONS = { home: inner('home'), create: inner('create'), library: inner('library') };
// Every screen: the old hashes (#listen #make #studio #jam #library) still open theirs.
const SCREEN_TAB = { home: 'home', listen: 'home', create: 'create', make: 'create', studio: 'create', jam: 'create', library: 'library' };
const SUBS = ['make', 'studio', 'jam'];
const SUB_NAMES = { make: ['做歌', 'Songs'], studio: ['樂器', 'Studio'], jam: ['即興', 'Jam'] };
const tabs = tabBar({
  tabs: TABS.map(id => ({ id, label: name(TAB_NAMES, id), icon: TAB_ICONS[id] })),
  onSelect: (id, o) => showTab(id === 'create' && !o?.again && SUBS.includes(tabNow) ? tabNow : id),
  label: W('分頁', 'Tabs')
});
let tabNow = 'home';
let lengthPaint = () => {};
function showTab(id) {
  id = SCREEN_TAB[id] ? (id === 'listen' ? 'home' : id) : 'home';
  const tab = SCREEN_TAB[id];
  tabs.select(tab);
  tabNow = id;
  const sub = SUBS.includes(id) ? id : '';
  $('panel-create').hidden = tab !== 'create' || Boolean(sub);
  for (const s of SUBS) $(`panel-${s}`).hidden = s !== sub;
  $('subnav').hidden = !sub;
  if (sub) $('subnav-title').textContent = name(SUB_NAMES, sub);
  try {
    const hh = `#${sub || tab}`;
    if (location.hash !== hh) history.replaceState(null, '', hh);
  } catch {}
  if (id === 'library') lib.draw();
  if (id === 'create') hubDraw();
  if (id === 'home') radio?.warm();
  if (id === 'studio') studio?.shown();
  else studio?.hidden();
  if (id === 'jam') jam?.shown();
  else jam?.hidden();
}
const firstTab = () => (SCREEN_TAB[location.hash.slice(1)] ? location.hash.slice(1) : 'home');
$('subnav-back').innerHTML = icon('back-chevron');
$('subnav-back').onclick = () => showTab('create');
// 創作: the path in three cards. 即興 (the band, with ▶), then 樂器 and 做歌 (with how many pieces wait there).
let hubDraw = () => {};
{
  const cover = h('img', { alt: '', class: 'hub-cover' });
  const badge = h('i', { class: 'hub-badge', hidden: true });
  const hero = h('div', { class: 'hub-hero' }, [
    cover,
    h('button', { class: 'hub-open', type: 'button', 'aria-label': W('即興', 'Jam'), onclick: () => showTab('jam') }),
    h('b', { text: W('即興', 'Jam') }),
    h('button', { class: 'hub-play', type: 'button', 'aria-label': W('開始', 'Start'), html: icon('play'), onclick: () => (showTab('jam'), jam?.start()) })
  ]);
  const half = (id, ic, label, extra) => h('button', { class: 'hub-half', type: 'button', 'data-screen': id, onclick: () => showTab(id) }, [h('span', { class: 'hub-ico', html: icon(ic) }), h('b', { text: label }), extra]);
  hubDraw = () => {
    const set = readSet();
    cover.src = setCover(set, specOf(set).bpm);
    badge.textContent = String(pieces.length);
    badge.hidden = !pieces.length;
    const mine = songShelf({ P, trackMenu: (t, a) => trackMenuOf(t, a) }, 'mine', W('你的歌', 'Your songs'), [...lib.all()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 12));
    shelf.replaceChildren(...(mine ? [mine] : []));
  };
  const shelf = h('div', { class: 'hub-shelf' });
  $('panel-create').append(h('h1', { class: 'page-title', text: W('創作', 'Create') }), hero, h('div', { class: 'hub-pair' }, [half('studio', 'grid', W('樂器', 'Studio')), half('make', 'note', W('做歌', 'Songs'), badge)]), shelf);
}

// ---- Settings (做歌) ----

$('styles').innerHTML = STYLE_ORDER.map(s => `<button class="chip" type="button" data-style="${s}" aria-pressed="true">${esc(name(STYLE_NAMES, s))}</button>`).join('');
$('moods').innerHTML = Object.entries(MOODS)
  .map(([id, m]) => `<button class="chip" type="button" data-mood="${id}" aria-pressed="false">${esc(en ? m.en : m.zh)}</button>`)
  .join('');
const smartSwitch = toggle({ checked: settings.smart, label: W('依你的口味', 'Lean to your taste'), onChange: on => ((settings.smart = on), save(), tasteHint()) });
smartSwitch.id = 'smart';
$('smart-slot').replaceWith(smartSwitch);

// Which mood the styles are, if any.
const moodFor = styles => Object.entries(MOODS).find(([, m]) => m.styles.length === styles.length && m.styles.every(s => styles.includes(s)))?.[0] || '';
const moodOf = () => moodFor(settings.styles);
function showSettings() {
  lengthPaint();
  $('count').value = settings.count;
  $('silence').value = settings.silenceDb;
  $('gap').value = settings.minGap;
  for (const b of $('styles').children) b.setAttribute('aria-pressed', settings.styles.includes(b.dataset.style));
  const mood = moodOf();
  for (const b of $('moods').children) b.setAttribute('aria-pressed', b.dataset.mood === mood);
  smartSwitch.setAttribute('aria-checked', String(Boolean(settings.smart)));
  tasteHint();
  update();
}
// The styles you keep most: what a batch leans to (依你的口味).
const tasteTop = () =>
  Object.entries(kept.taste || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([s]) => name(STYLE_NAMES, s));
function tasteHint() {
  const top = tasteTop();
  $('taste-row').hidden = !top.length;
  $('taste-hint').textContent = !settings.smart ? W('關著：每種一樣多', 'Off: every style alike') : W(`多做你收藏的 ${top.join('、')}`, `More of what you keep: ${top.join(', ')}`);
}
const weights = () => (cfg().smart && Object.keys(kept.taste || {}).length ? kept.taste : null);

// 長度: presets and a slider, in minutes and seconds.
{
  const out = h('b', { class: 'len-val' });
  const slider = h('input', { 'data-ctl': 'make-length-slider', type: 'range', min: LENGTH_MIN, max: LENGTH_MAX, step: LENGTH_STEP, 'aria-label': W('長度', 'Length') });
  const chips = h('div', { class: 'len-chips' }, LENGTH_PRESETS.map(v => h('button', { class: 'chip', type: 'button', 'data-len': String(v), text: clock(v), 'data-ctl': [30, 60, 120, 180].includes(v) ? null : 'make-length-slider', onclick: () => set(v) })));
  const set = v => {
    settings.length = clampLength(v);
    paint();
    save();
    update();
  };
  const paint = () => {
    out.textContent = clock(settings.length);
    slider.value = settings.length;
    for (const b of chips.children) b.setAttribute('aria-pressed', String(+b.dataset.len === settings.length));
  };
  slider.addEventListener('input', () => set(slider.value));
  paint();
  lengthPaint = paint;
  document.querySelector('[data-ctl="make-count"]').before(h('div', { class: 'stack len-row' }, [h('div', { class: 'sheet-line', 'data-ctl': 'make-length-slider' }, [h('span', { class: 'label', text: W('長度', 'Length') }), out]), chips, slider]));
}
// What's wrong with the settings, if anything.
function problem() {
  const { count, styles, seed } = cfg();
  // (Simple with no tune in the pieces, or none: the app's own band plays.)
  if (simple()) return '';
  if (!(count >= 1 && count <= MAX_SONGS)) return W(`首數要 1 到 ${MAX_SONGS}`, `Songs must be 1 to ${MAX_SONGS}`);
  if (!styles.length) return W('至少選一種鼓的風格', 'Pick at least one drum style');
  if (seed && !(/^\d+$/.test(seed) && +seed <= 4294967295)) return W('種子要是整數', 'Seed must be a whole number');
  if (pieces.length && !roles.some(x => x === 'riff' || x === 'phrase')) return simple() ? W('聽不出旋律：到「樂器」做一段旋律', 'No tune heard: make a melody in Studio') : W('需要一段 Riff 或樂句：設一段，或到「樂器」做一段', 'Needs a riff or a phrase: set one, or make one in Studio');
  if (pieces.length && !(bpm >= 40 && bpm <= 250)) return W('速度要 40 到 250 BPM', 'Tempo must be 40 to 250 BPM');
  return '';
}
// Songs are an even number of bars when the range has one, plus ~1.5 s for the last hit to ring.
function lengthText() {
  return W(`每首約 ${clock(settings.length)}`, `About ${clock(settings.length)} each`);
}
// The mixer in a few words: 混音 · 殘響 25%, or 原音.
function mixText() {
  const m = settings.mix;
  if (!m.on) return W('原音：不加工', 'Raw: as recorded');
  const bits = [m.reverb ? W(`殘響 ${Math.round(m.reverb * 100)}%`, `Room ${Math.round(m.reverb * 100)}%`) : '', m.delay ? W('回音', 'Echo') : '', m.pump ? W('側鏈', 'Pump') : '', m.fade ? W('淡出', 'Fade') : ''].filter(Boolean);
  return [W('開', 'On'), ...bits].join(' · ');
}
// Simple's batch is the kit's when it has a tune, else the app's own band's.
const ownBand = () => simple() && !(pieces.length && roles.some(x => x === 'riff' || x === 'phrase'));
function update() {
  const { count } = cfg();
  const bad = problem();
  $('more-hint').textContent = simple() ? `${lengthText()} · ${W('簡單模式', 'Simple')}` : `${lengthText()} · ${W('人味', 'Humanize')} ${settings.humanize}%`;
  $('mix-hint').textContent = mixText();
  $('count-down').disabled = busy || count <= 1;
  $('count-up').disabled = busy || count >= MAX_SONGS;
  $('error').textContent = bad;
  if (!busy && simple()) {
    $('go').innerHTML = `${icon('dice')}<span>${W(`做 ${count} 首歌`, `Make ${count} songs`)}</span>`;
    $('go').disabled = false;
  } else if (!busy) {
    $('go').textContent = !pieces.length ? W('先放片段，或到「樂器」做', 'Add pieces or use Studio') : count >= 1 && count <= MAX_SONGS ? W(`做 ${count} 首`, `Make ${count} song${count === 1 ? '' : 's'}`) : W('做歌', 'Make songs');
    $('go').disabled = !!bad || !pieces.length;
  }
}

$('count').addEventListener('input', () => {
  const v = $('count').value.trim();
  settings.count = v === '' ? NaN : Math.round(+v);
  save();
  update();
});
const step = d => {
  settings.count = Math.min(MAX_SONGS, Math.max(1, (settings.count || 0) + d));
  $('count').value = settings.count;
  save();
  update();
};
$('count-down').onclick = () => step(-1);
$('count-up').onclick = () => step(1);
$('styles').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const s = b.dataset.style;
  const on = settings.styles.includes(s);
  settings.styles = on ? settings.styles.filter(x => x !== s) : STYLES.filter(x => x === s || settings.styles.includes(x));
  settings.mood = moodOf();
  save();
  showSettings();
});
$('moods').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const m = MOODS[b.dataset.mood];
  settings.styles = [...m.styles];
  settings.humanize = m.humanize;
  settings.mood = b.dataset.mood;
  save();
  showSettings();
});
for (const [id, key] of [
  ['silence', 'silenceDb'],
  ['gap', 'minGap']
])
  $(id).addEventListener('input', () => {
    const v = +$(id).value;
    if (Number.isFinite(v) && $(id).value.trim() !== '') settings[key] = v;
    save();
  });

// (Each row its name and control on a line, what it does under them: a sheet is narrower than the page.)
const sheetRow = (label, sub, ctl) => h('div', { class: 'stack sheet-row' }, [h('div', { class: 'sheet-line' }, [typeof label === 'string' ? h('span', { class: 'label', text: label }) : label, ctl]), sub]);
// A word's name with its ⓘ, as a row's label.
const termLabel = id => h('span', { class: 'label' }, [term(id).name, ' ', info(id)]);
// 簡單 / 進階, as a row (更多設定 and the help sheet).
const levelRow = () =>
  sheetRow(
    W('模式', 'Mode'),
    h('small', { text: W('簡單：只留做歌需要的 · 進階：所有工具', 'Simple: just what you need · Advanced: every tool') }),
    seg(
      [
        ['simple', W('簡單', 'Simple')],
        ['pro', W('進階', 'Advanced')]
      ],
      settings.level,
      setLevel
    )
  );
// A slider with its value beside it.
function slider({ min, max, step: by, value, text, label, onInput }) {
  const range = h('input', { type: 'range', min, max, step: by, 'aria-label': label });
  range.value = value;
  const val = h('span', { class: 'val', text: text(value) });
  range.addEventListener('input', () => {
    val.textContent = text(+range.value);
    onInput(+range.value);
  });
  return h('div', { class: 'ctl' }, [range, val]);
}
// A two-way choice as the page's segmented buttons.
function seg(items, value, onPick) {
  const el = h(
    'div',
    { class: 'seg' },
    items.map(([v, label]) =>
      h('button', {
        type: 'button',
        'aria-pressed': String(value === v),
        text: label,
        onclick: e => {
          for (const b of el.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
          onPick(v);
        }
      })
    )
  );
  return el;
}

// 更多設定: length, humanize, seed and format, in a sheet.
$('more-settings').onclick = () => {
  const seed = h('input', { class: 'num wide', type: 'text', inputmode: 'numeric', placeholder: W('隨機', 'Random'), autocomplete: 'off', 'aria-label': W('種子', 'Seed') });
  seed.value = settings.seed;
  seed.addEventListener('input', () => {
    settings.seed = seed.value.trim();
    save();
    update();
  });
  const pro = (ctl, el) => (el.setAttribute('data-ctl', ctl), el);
  sheet({
    title: W('更多設定', 'More settings'),
    closeLabel: W('關閉', 'Close'),
    body: h('div', { class: 'card sheet-card' }, [
      levelRow(),
      pro('make-humanize', sheetRow(termLabel('humanize'), h('small', { text: term('humanize').hint }), slider({ min: 0, max: 200, step: 10, value: settings.humanize, text: v => `${v}%`, label: W('人味', 'Humanize'), onInput: v => ((settings.humanize = v), save(), update()) }))),
      pro('make-seed', sheetRow(termLabel('seed'), h('small', { text: term('seed').hint }), seed)),
      pro('make-format', sheetRow(
        W('格式', 'Format'),
        h('small', { text: W('下載和分享的 WAV', 'The WAVs you save and share') }),
        seg(
          [
            [32, W('32 位元浮點', '32-bit float')],
            [16, W('16 位元', '16-bit')]
          ],
          settings.bits,
          v => ((settings.bits = v), save())
        )
      ))
    ])
  });
};

// 混音: the mixer, on by default (lib/mix.mjs); off, the pieces exactly as recorded.
$('mix-settings').onclick = () => {
  const m = settings.mix;
  const set = (k, v) => {
    settings.mix = mixOf({ ...settings.mix, [k]: v });
    save();
    update();
    paint();
  };
  const dbText = v => `${v > 0 ? '+' : ''}${v} dB`;
  const pct = v => `${Math.round(v * 100)}%`;
  const rows = h('div');
  const onSwitch = toggle({ checked: m.on, label: W('混音', 'Mix'), onChange: on => set('on', on) });
  const paint = () => {
    rows.hidden = !settings.mix.on;
  };
  const level = bus => sheetRow(name(BUS_NAMES, bus), null, slider({ min: -24, max: 6, step: 1, value: m[bus], text: dbText, label: name(BUS_NAMES, bus), onInput: v => set(bus, v) }));
  const amount = (k, label, sub) => sheetRow(label, h('small', { text: sub }), slider({ min: 0, max: 1, step: 0.05, value: m[k], text: pct, label, onInput: v => set(k, v) }));
  const sw = (k, label, sub) => sheetRow(label, h('small', { text: sub }), toggle({ checked: m[k], label, onChange: on => set(k, on) }));
  rows.append(
    level('drums'),
    level('hats'),
    level('bass'),
    level('keys'),
    amount('reverb', W('殘響', 'Room'), W('旋律和小鼓的空間', 'Space round the riffs and snare')),
    amount('delay', W('回音', 'Echo'), W('旋律跟著拍子的回音', 'Riffs echoing in time')),
    amount('pump', W('側鏈', 'Pump'), W('貝斯和旋律讓大鼓', 'Bass and riffs duck under the kick')),
    amount('width', W('寬度', 'Width'), W('左右的開闊', 'How wide the stereo is')),
    sw('sweep', W('濾波', 'Sweeps'), W('前奏打開、導歌升起、間奏悶住', 'Intro opens, pre-hook lifts, break muffled')),
    sw('fade', W('淡出', 'Fade out'), W('尾奏慢慢收掉', 'The outro fades away')),
    h('div', { class: 'sheet-line' }, [h('button', { class: 'secondary', type: 'button', text: W('回到預設', 'Back to default'), onclick: () => ((settings.mix = mixOf(MIX)), save(), update(), s.close(), $('mix-settings').click()) })])
  );
  paint();
  const s = sheet({
    title: W('混音', 'Mix'),
    closeLabel: W('關閉', 'Close'),
    body: h('div', { class: 'card sheet-card' }, [sheetRow(termLabel('mix'), h('small', { text: W('關掉：每段跟錄的一模一樣，會爆音的地方照留', 'Off: every piece exactly as recorded, overs and all') }), onSwitch), rows])
  });
};

// ---- 片段 ----

function status(html, kind = '') {
  $('status').hidden = false;
  $('status').className = `status ${kind}`;
  $('status-text').innerHTML = html;
}

// One file: a WAV as it is; anything else the browser plays (m4a, mp3, …) at 48 kHz.
async function readFile(file) {
  const buf = await file.arrayBuffer();
  const wav = parseWav(buf);
  if (wav) return { name: file.name, ...wav };
  return { name: file.name, ...(await decodeAudio(buf)) };
}
async function decodeAudio(buf) {
  const ctx = new OfflineAudioContext(2, 1, 48000);
  const ab = await ctx.decodeAudioData(buf);
  const L = ab.getChannelData(0);
  return { sr: ab.sampleRate, L, R: ab.numberOfChannels > 1 ? ab.getChannelData(1) : L };
}

// New sources (`add`: beside the kit's, else in its place).
async function load(get, add = false) {
  stopPiece();
  status(`<b>${W('讀取中…', 'Reading…')}</b>`, 'busy');
  await new Promise(r => setTimeout(r, 30));
  let fresh;
  try {
    fresh = (await get()).filter(s => s?.L?.length);
  } catch {
    fresh = [];
  }
  if (!fresh.length) {
    if (!sources.length) clearPieces();
    return status(`<b>${W('讀不了這個檔', "Can't read that file")}</b> · ${W('試試 WAV', 'try a WAV')}`, 'bad');
  }
  sources = atRate(add ? [...sources, ...fresh] : fresh);
  sr = sources[0].sr;
  kitShown();
  split();
  saveLast(sources);
}
// The ways in, as the kit stands: 再加檔案 once there is one, 示範 only before.
function kitShown() {
  if (!pieces.length && !$('pieces').children.length) ingredientCards($('pieces'));
  $('resplit').disabled = !sources.length;
  $('add').hidden = !sources.length;
  $('demo').hidden = sources.length > 0;
}
function clearPieces() {
  $('pieces').textContent = '';
  ingredientCards($('pieces'));
  $('pieces-hint').hidden = true;
  $('clear-all').hidden = $('save-kit').hidden = true;
  pieces = [];
  roles = [];
  heard = null;
  $('tempo-row').hidden = true;
  kitChanged();
  update();
}

function split() {
  if (!sources.length) return;
  stopPiece();
  pieces = splitAll(sources, { silenceDb: cfg().silenceDb, minGap: cfg().minGap });
  heard = analyzeRecording(pieces, sr);
  print = fingerprint(sources);
  bpm = heard.bpm;
  edited = new Set();
  // This kit's tempo and hand-set roles from the Pass (another phone's, or before).
  const mine = kept.kits[print];
  if (mine && mine.bpm >= 40 && mine.bpm <= 250) bpm = mine.bpm;
  roles = heard.analyses.map(a => guessRole(a, bpm));
  for (const [i, r] of Object.entries(mine?.roles || {}))
    if (+i < roles.length && ROLES.includes(r)) {
      roles[+i] = r;
      edited.add(+i);
    }
  $('bpm').value = bpm;
  tempoHint();
  $('tempo-row').hidden = !pieces.length;
  kitStatus();
  showPieces();
}
// What the kit is: its pieces, files, rate and length, and the key its riffs are in.
function kitStatus() {
  const len = sources.reduce((s, x) => s + x.L.length, 0) / sr;
  const time = `${Math.floor(len / 60)}:${String(Math.round(len % 60) % 60).padStart(2, '0')}`;
  const nFiles = new Set(sources.map(x => x.name)).size;
  const files = nFiles > 1 ? W(` · ${nFiles} 個檔`, ` · ${nFiles} files`) : '';
  if (!pieces.length) {
    status(`<b>${W('沒有切出片段', 'No pieces')}</b> · ${W('看「切片」', 'see Splitting')}`, 'bad');
    $('split-more').open = true;
    return;
  }
  const key = kitKey();
  status(`<b>${W(`${pieces.length} 個片段`, `${pieces.length} piece${pieces.length === 1 ? '' : 's'}`)}</b>${files} · ${key ? `${esc(keyName(key))} · ` : ''}${time}`);
}
// The kit's key: from the notes of its riffs and phrases (its bass when that's all).
function kitKey() {
  if (!heard) return null;
  const of = want => roles.map((r, i) => (want.includes(r) ? i : -1)).filter(i => i >= 0);
  const use = of(['riff', 'phrase']).length ? of(['riff', 'phrase']) : of(['bass']);
  return keyOf(use.map(i => pieceChroma(pieces[i], sr)));
}
function tempoHint() {
  const from = kept.kits[print]?.bpm === bpm && bpm !== heard?.detected;
  $('bpm-hint').textContent = !heard?.detected ? W('聽不出來：請設定', "Couldn't hear it: set it") : bpm === heard.detected ? W('從片段聽出來的', 'Heard from the pieces') : from ? W(`你設的 · 聽到 ${heard.detected}`, `Yours · heard ${heard.detected}`) : W(`手動設定 · 聽到 ${heard.detected}`, `Set by hand · heard ${heard.detected}`);
}

// 簡單's row: ＋ first, then the pieces; with none, the built-in band as a dimmed card (what the songs are made of).
function ingredientCards(grid) {
  const add = h('button', { class: 'ing-add', type: 'button', 'data-ctl': 'make-ingredients', 'aria-label': W('加材料', 'Add'), html: `${icon('plus')}` });
  add.onclick = addSheet;
  const nodes = [add];
  if (!pieces.length) nodes.push(h('div', { class: 'ing-band', 'data-ctl': 'make-ingredients' }, [h('span', { html: icon('grid') }), h('span', { text: W('內建樂團', 'Built-in band') })]));
  grid.prepend(...nodes);
}
// ＋: the ways in, as big rows.
function addSheet() {
  let s;
  const go = (iconName, label, fn, cls = '') => h('button', { class: `add-row ${cls}`, type: 'button', html: `${icon(iconName)}<span>${esc(label)}</span>`, onclick: () => (fn(), s.close()) });
  const rows = [go('mic', W('用麥克風錄', 'Record'), () => $('record').click()), go('upload', W('選檔案', 'Choose files'), () => (sources.length ? $('more') : $('file')).click()), go('create', W('用樂器寫', 'Write in Studio'), () => showTab('studio'))];
  if (!sources.length) rows.push(go('note', W('試試示範', 'Try the demo'), () => $('demo').click()));
  s = sheet({ title: W('加材料', 'Add'), closeLabel: W('關閉', 'Close'), body: h('div', { class: 'add-rows' }, [...rows, h('hr'), go('library', W('我的套組', 'My kits'), () => setTimeout(() => $('my-kits').click(), 250), 'plain')]) });
}

function showPieces() {
  const B = (60 / bpm) * sr;
  const grid = $('pieces');
  const many = sources.length > 1;
  grid.textContent = '';
  pieces.forEach((p, i) => {
    const tile = document.createElement('div');
    const beats = p.L.length / B;
    const from = many ? baseName(sources[p.src]?.name).replace(/^♪\s*/, '') : '';
    tile.className = 'piece';
    tile.dataset.i = i;
    tile.title = from;
    const mineClip = String(sources[p.src]?.name || '').startsWith('♪');
    const short = baseName(sources[p.src]?.name || '').replace(/^♪\s*/, '') || String(i + 1);
    tile.innerHTML = `<button type="button" aria-label="${esc(W(`試聽第 ${i + 1} 段，${beats.toFixed(1)} 拍`, `Play piece ${i + 1}, ${beats.toFixed(1)} beats`))}${from ? ` · ${esc(from)}` : ''}"><b data-ctl="make-piece">${i + 1}</b><span data-ctl="make-piece">${beats < 10 ? beats.toFixed(1) : Math.round(beats)} ${W('拍', 'beats')}</span><span class="ing" data-ctl="make-ingredients">${icon(mineClip ? 'note' : 'wave')}<b>${esc(short)}</b></span></button>
      <select data-ctl="make-roles" aria-label="${esc(W(`第 ${i + 1} 段的角色`, `Piece ${i + 1} role`))}">${ROLES.map(x => `<option value="${x}"${x === roles[i] ? ' selected' : ''}>${esc(name(ROLE_NAMES, x))}</option>`).join('')}</select>
      <button type="button" class="more" aria-label="${esc(W(`第 ${i + 1} 段：更多`, `Piece ${i + 1}: more`))}">⋯</button>`;
    tile.classList.toggle('off', roles[i] === 'off');
    // (A clip made on the instruments: marked ♪.)
    tile.classList.toggle('mine', String(sources[p.src]?.name || '').startsWith('♪'));
    grid.append(tile);
  });
  ingredientCards(grid);
  $('pieces-hint').hidden = !pieces.length;
  $('clear-all').hidden = $('save-kit').hidden = !pieces.length;
  kitChanged();
  update();
}
// The kit, its tempo or its roles changed: the jam's pads follow.
function kitChanged() {
  jam?.kit();
  hubDraw();
}

// A new tempo: roles heard again at it (but not ones set by hand), and loop lengths.
function setTempo(v) {
  bpm = Math.round(v * 10) / 10;
  $('bpm').value = bpm;
  if (!heard || !(bpm >= 40 && bpm <= 250)) return update();
  roles = heard.analyses.map((a, i) => (edited.has(i) ? roles[i] : guessRole(a, bpm)));
  tempoHint();
  showPieces();
  keepKit();
}
$('bpm').addEventListener('change', () => setTempo(+$('bpm').value));
$('bpm-half').onclick = () => setTempo(bpm / 2);
$('bpm-double').onclick = () => setTempo(bpm * 2);
// 點拍子: tap along, the tempo follows from the second tap.
const taps = tapper();
$('bpm-tap').onclick = () => {
  const t = taps.tap();
  if (t) setTempo(t);
};

const pick = (input, add) =>
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.value = '';
    if (files.length) load(async () => (await Promise.all(files.map(f => readFile(f).catch(() => null)))).filter(Boolean), add);
  });
pick($('file'), false);
pick($('more'), true);
$('add').onclick = () => $('more').click();
$('demo').onclick = () => load(async () => [{ name: 'demo', ...demoRecording() }]);
$('to-studio').onclick = () => showTab('studio');
$('resplit').onclick = () => {
  split();
  keepKit();
};
const drop = $('drop');
drop.addEventListener('dragover', e => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => {
  e.preventDefault();
  drop.classList.remove('over');
  const files = [...e.dataTransfer.files];
  if (files.length) load(async () => (await Promise.all(files.map(f => readFile(f).catch(() => null)))).filter(Boolean));
});

// Recording with the microphone: the phone's own processing off (it would
// eat the gaps and pump the levels); a tap starts, a tap stops, the take is
// split like a file (beside the kit's pieces when there are some).
let recorder = null;
let recTimer = 0;
$('record').onclick = async () => {
  if (recorder) return recorder.stop();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch {
    return status(`<b>${W('沒有麥克風權限', 'No microphone')}</b> · ${W('在設定裡允許', 'allow it in Settings')}`, 'bad');
  }
  const chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    clearInterval(recTimer);
    recorder = null;
    $('record').classList.remove('on');
    $('record-text').textContent = W('用麥克風錄', 'Record');
    const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/mp4' });
    const at = new Date();
    load(async () => [{ name: `${W('錄音', 'Take')} ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`, ...(await decodeAudio(await blob.arrayBuffer())) }], sources.length > 0);
  };
  quiet();
  recorder.start();
  const t0 = Date.now();
  $('record').classList.add('on');
  const tick = () => {
    const s = Math.floor((Date.now() - t0) / 1000);
    $('record-text').textContent = `${W('停止', 'Stop')} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  tick();
  recTimer = setInterval(tick, 500);
};
if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') $('record').hidden = true;

// One sound for the whole app (the pieces, the instruments, the pads): made on the first tap.
// (iOS plays it as music, not as a ringtone's sound, so the silent switch doesn't mute it; and
// one stopped by a call, Siri or the screen locking is started again when it's wanted.)
let ctx = null;
const wanted = () => Boolean(studio?.playing() || jam?.playing() || playing || example);
const wake = () => ctx && ctx.state !== 'running' && wanted() && ctx.resume().catch(() => {});
const audioCtx = () => {
  if (!ctx) {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {}
    ctx = new AudioContext();
    ctx.addEventListener?.('statechange', wake);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
};
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake());
// How far ahead 樂器 and 即興 lay their notes: a moment on the screen (a tap
// heard at once), two seconds off it (locked or in another app, where the
// phone runs the page's clock only now and then).
const ahead = secs => (document.visibilityState === 'hidden' ? 2 : secs);
// 樂器 and 即興 kept going off the screen: iOS lets a page's sound play on
// locked only while it plays something itself, so a near-silent loop plays
// beside them (and the lock screen gets their name and a ⏸ that stops them).
// Made on the first ▶ and taken down at ■, never before: a player made at
// load takes the lock screen's card from 聽 and the songs.
let hum = null;
let humUrl = '';
function humWav() {
  const sr = 8000;
  const n = sr * 12; // twelve seconds, looped (iOS gives its card to longer sound, not a blip)
  const b = new DataView(new ArrayBuffer(44 + n));
  const str = (o, s) => [...s].forEach((ch, i) => b.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'), b.setUint32(4, 36 + n, true), str(8, 'WAVEfmt '), b.setUint32(16, 16, true), b.setUint16(20, 1, true), b.setUint16(22, 1, true);
  b.setUint32(24, sr, true), b.setUint32(28, sr, true), b.setUint16(32, 1, true), b.setUint16(34, 8, true), str(36, 'data'), b.setUint32(40, n, true);
  // (Not pure silence, which a phone may take for nothing playing: the quietest whisper, far under hearing.)
  for (let i = 0; i < n; i++) b.setUint8(44 + i, i % 2 ? 129 : 127);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
let liveStop = null;
function live(on, o = {}) {
  if (!on) {
    if (liveStop)
      try {
        if (navigator.mediaSession) navigator.mediaSession.playbackState = 'paused';
      } catch {}
    liveStop = null;
    if (hum) {
      hum.pause();
      hum.removeAttribute('src');
      hum.load();
      hum = null;
    }
    return;
  }
  liveStop = o.stop || null;
  if (!hum) {
    hum = new Audio();
    hum.loop = true;
    hum.setAttribute('playsinline', '');
    hum.src = humUrl ||= humWav();
  }
  const card = () => {
    if (!liveStop) return;
    claimSession({ title: o.title || 'Orbit Beats', artist: 'Orbit Beats', play: () => {}, pause: () => liveStop?.(), next: null });
    try {
      if (navigator.mediaSession) navigator.mediaSession.playbackState = 'playing';
      // (No place in a song: the bar a song left on the card is taken away.)
      navigator.mediaSession?.setPositionState?.();
    } catch {}
  };
  card();
  // (Set again once it plays: the card goes to what's playing.)
  hum.play().then(card, () => {});
}
document.addEventListener('pointerdown', () => ctx && ctx.state !== 'running' && ctx.resume().catch(() => {}), true);
// Everything that plays, stopped (before something else plays).
function quiet({ keep: but = '' } = {}) {
  stopPiece();
  stopExample();
  if (but !== 'radio') radio?.stop();
  if (but !== 'song') stopSong();
  if (but !== 'studio') studio?.stop();
  if (but !== 'jam') jam?.stop();
}
// Tap a piece to hear it; tap again to stop.
let playing = null;
function stopPiece() {
  if (!playing) return;
  try {
    playing.src.stop();
  } catch {}
  playing.btn.classList.remove('on');
  playing = null;
}
$('pieces').addEventListener('change', e => {
  const tile = e.target.closest('.piece');
  if (!tile) return;
  roles[+tile.dataset.i] = e.target.value;
  edited.add(+tile.dataset.i);
  tile.classList.toggle('off', e.target.value === 'off');
  kitStatus();
  kitChanged();
  update();
  keepKit();
});
$('pieces').addEventListener('click', e => {
  const more = e.target.closest('.piece .more');
  if (more) return menu(more, [{ label: W('刪除這一段', 'Delete this piece'), icon: 'close', danger: true, onClick: () => removePiece(+more.parentNode.dataset.i) }]);
  const btn = e.target.closest('.piece button');
  if (!btn) return;
  const again = playing && playing.btn === btn;
  stopPiece();
  if (again) return;
  quiet();
  const c = audioCtx();
  const p = pieces[+btn.parentNode.dataset.i];
  const ab = c.createBuffer(2, p.L.length, sr);
  ab.copyToChannel(p.L, 0);
  ab.copyToChannel(p.R, 1);
  const src = c.createBufferSource();
  src.buffer = ab;
  src.connect(c.destination);
  src.onended = () => {
    if (playing && playing.src === src) stopPiece();
  };
  src.start();
  btn.style.setProperty('--beat', `${60 / bpm}s`);
  btn.classList.add('on');
  playing = { src, btn };
});

// ---- Taking pieces out, clearing, and kits kept by name ----
//
// Every change to the kit keeps a copy to come back to: a toast with 復原
// for about 5 seconds. A piece is part of a split recording, so what is left
// is rebuilt as sources of its own (lib/kitops.mjs).
const undos = undoStack();
function undoToast(text) {
  const t = toast(text, { ms: 5000 });
  t.append(h('button', { type: 'button', class: 'toast-undo', text: W('復原', 'Undo'), onclick: () => (t.remove(), restoreKit(undos.pop()?.snap)) }));
}
// Put a kit back (or open another): split again, then its tempo and hand-set roles.
function restoreKit(snap, set) {
  if (!snap) return;
  stopPiece();
  sources = snap.sources;
  if (!sources.length) {
    forgetLast();
    kitShown();
    return clearPieces();
  }
  sr = sources[0].sr;
  kitShown();
  split();
  bpm = snap.bpm;
  $('bpm').value = bpm;
  const back = set ? null : rolesBack(snap, pieces.length);
  if (back) ({ roles, edited } = back);
  else
    for (const [i, r] of Object.entries(set || {}))
      if (+i < roles.length && ROLES.includes(r)) {
        roles[+i] = r;
        edited.add(+i);
      }
  tempoHint();
  kitStatus();
  showPieces();
  keepKit();
  saveLast(sources);
}
const nowKit = () => snapOf({ sources, roles, edited, bpm });
function removePiece(i) {
  if (!pieces[i]) return;
  undos.push('piece', nowKit());
  const left = dropPieces({ pieces, sources, roles, edited }, new Set([i]));
  restoreKit({ ...left, bpm }, null);
  undoToast(W(`已刪除第 ${i + 1} 段`, `Piece ${i + 1} deleted`));
}
async function clearAll() {
  if (!pieces.length) return;
  const yes = await ask({ title: W('清除全部片段？', 'Clear all pieces?'), body: W('錄音和取樣都會從這裡拿掉。清除後 5 秒內可以復原。', 'Recordings and samples leave the kit. You can undo for 5 seconds.'), ok: W('全部清除', 'Clear all'), cancel: W('取消', 'Cancel'), danger: true, lang });
  if (!yes) return;
  undos.push('all', nowKit());
  restoreKit({ sources: [], roles: [], edited: [], bpm });
  undoToast(W('已清除全部片段', 'All pieces cleared'));
}
function saveKit() {
  if (!pieces.length) return;
  listNamed().catch(() => []).then(all =>
    nameSheet(W('存成套組', 'Save as a kit'), freeName(W('我的套組', 'My kit'), all.map(k => k.name)), async v => {
      try {
        await saveNamed(namedKit({ id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: v, sources, roles, edited, bpm, count: pieces.length }));
        toast(W(`已存成「${v}」`, `Saved as “${v}”`));
      } catch {
        toast(W('存不下來：手機空間不夠？', "Couldn't save: is the phone full?"), { tone: 'bad' });
      }
    }, { keep: true })
  );
}
async function kitsSheet() {
  const body = h('div', { class: 'card sheet-card' });
  const s = sheet({ title: W('我的套組', 'My kits'), closeLabel: W('關閉', 'Close'), body });
  const draw = async () => {
    const all = await listNamed().catch(() => []);
    body.replaceChildren(
      all.length
        ? h('ul', { class: 'mine-list' }, all.map(k => h('li', {}, [
            h('div', { class: 't' }, [h('span', { text: k.name }), h('small', { text: `${W(`${k.count} 個片段`, `${k.count} piece${k.count === 1 ? '' : 's'}`)} · ${new Date(k.at).toLocaleDateString(en ? 'en' : 'zh-TW')}` })]),
            h('button', { class: 'mini', type: 'button', text: W('打開', 'Open'), onclick: () => (s.close(), openKit(k)) }),
            h('button', { class: 'mini', type: 'button', html: icon('more'), 'aria-label': W('更多', 'More'), onclick: e => menu(e.currentTarget, [
              { label: W('重新命名', 'Rename'), icon: 'edit', onClick: () => nameSheet(W('重新命名', 'Rename'), k.name, async v => (await renameNamed(k.id, v), draw())) },
              { label: W('刪除', 'Delete'), icon: 'trash', danger: true, onClick: async () => { await deleteNamed(k.id); draw(); const t = toast(W(`已刪除「${k.name}」`, `“${k.name}” deleted`), { ms: 5000 }); t.append(h('button', { type: 'button', class: 'toast-undo', text: W('復原', 'Undo'), onclick: async () => (t.remove(), await saveNamed(k), toast(W('已復原', 'Restored')))})); } }
            ]) })
          ])))
        : empty({ icon: icon('note'), title: W('還沒有存過套組', 'No kits saved yet'), body: W('把目前的片段存成套組，之後隨時打開。', 'Save the pieces you have now as a kit, and open it any time.') }),
      pieces.length ? h('button', { class: 'primary', type: 'button', text: W('把目前的片段存成套組', 'Save these pieces as a kit'), onclick: () => (s.close(), saveKit()) }) : null
    );
  };
  draw();
}
function openKit(k) {
  if (pieces.length) undos.push('open', nowKit());
  const kit = kitFrom(k);
  restoreKit({ sources: kit.sources, roles: [], edited: [], bpm: kit.bpm }, kit.set);
  if (pieces.length) undoToast(W(`已打開「${k.name}」`, `Opened “${k.name}”`));
  else undos.clear();
}
$('clear-all').onclick = clearAll;
$('save-kit').onclick = saveKit;
$('my-kits').onclick = kitsSheet;

// ---- A clip from the instruments, into the kit ----
//
// Rendered at the kit's tempo (the studio's own when there's no kit yet), a
// source of its own; a drum clip brings its drums as one-shots too (大鼓,
// 小鼓, 閉鈸, 808), so the songs' grooves play your sounds. Its pieces'
// roles set by hand (a drum loop 過門, a bass line 貝斯, a melody Riff),
// the kit's other hand-set roles and tempo kept.
function addClip(clip) {
  const had = pieces.length > 0;
  const tempo = had ? bpm : settings.studioBpm;
  const rate = sources[0]?.sr || 48000;
  const n = sources.filter(s => String(s.name).startsWith('♪')).length + 1;
  const made = [];
  if (clip.kind === 'drums') {
    made.push({ src: { name: `♪ ${W('鼓組', 'Drums')} ${n}`, ...renderClip(clip, rate, tempo) }, role: 'fill' });
    const used = d => (clip.steps[d] || []).some(Boolean);
    const shot = (d, role, midi = 36) => {
      const x = voice(d, midi, rate);
      made.push({ src: { name: `♪ ${name(DRUM_NAMES, d)} ${n}`, sr: rate, L: x, R: x }, role });
    };
    if (used('kick')) shot('kick', 'kick');
    if (used('snare') || used('clap')) shot(used('snare') ? 'snare' : 'clap', 'snare');
    const tick = ['hat', 'rim', 'shaker', 'snap', 'perc'].find(used);
    if (tick) shot(tick, 'tick');
    if (used('sub')) shot('sub', 'sub', clip.pitch || 33);
  } else made.push({ src: { name: `♪ ${name(INSTRUMENT_NAMES, clip.inst)} ${n}`, ...renderClip(clip, rate, tempo) }, role: INSTRUMENT_ROLE[clip.inst] || 'riff' });
  return insertMade(made, tempo, had);
}
// Sources made on the phone (a clip) into the kit, each with the role its pieces are set to.
function insertMade(made, tempo, had) {
  const before = { roles: [...roles], edited: new Set(edited), bpm, count: pieces.length, at: sources.length };
  stopPiece();
  sources = atRate([...sources, ...made.map(m => m.src)]);
  sr = sources[0].sr;
  kitShown();
  split();
  // The kit's own as it was (its roles set by hand, its tempo), the clip's as made.
  if (had) {
    bpm = before.bpm;
    $('bpm').value = bpm;
    roles = heard.analyses.map((a, i) => (i < before.count && before.edited.has(i) ? before.roles[i] : guessRole(a, bpm)));
    for (const i of before.edited) if (i < before.count) edited.add(i);
  } else {
    bpm = tempo;
    $('bpm').value = bpm;
    roles = heard.analyses.map(a => guessRole(a, bpm));
  }
  pieces.forEach((p, i) => {
    if (p.src >= before.at) {
      roles[i] = made[p.src - before.at].role;
      edited.add(i);
    }
  });
  tempoHint();
  kitStatus();
  showPieces();
  keepKit();
  saveLast(sources);
  return pieces.length - before.count;
}

// ---- Songs ----

$('legend').innerHTML = SECTIONS.map(s => `<span><i style="background:var(--${s})"></i>${esc(name(SECTION_NAMES, s))}</span>`).join('');

const timeText = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
// A song's id: its kit and how it was made (the same song made again is the same song).
const recipeId = r => (r.jam ? `${r.print}:jam:${r.at}` : `${r.print}:${r.seed}:${r.detail ?? ''}:${r.style ?? ''}:${r.plan ? r.plan.map(x => x.join('')).join('.') : ''}:${r.mix?.on === false ? 'raw' : 'mix'}`);
const urls = new Map(); // a kept song's sound as a URL, made when first played
const lib = libraryView({
  panel: $('panel-library'),
  row: (song, list) => songRow(song, { lib: true, list }),
  play: song => playRow(song),
  goMake: () => showTab('make'),
  zip: list => zipOf(list, 'Orbit Beats · Library.zip')
});

// One row: play, its name and what it is, ♡ and ⋯; its sections under it (tap one to go there).
function songRow(song, { lib: inLib = false, list = null } = {}) {
  const li = h('li', { class: 'song', 'data-id': song.id });
  const info = song.info;
  const what = [timeText(info.seconds), info.style ? name(STYLE_NAMES, info.style) : W('即興', 'Jam'), info.bpm ? speedText(info.bpm) : '', simple() ? '' : keyName(info.key)].filter(Boolean);
  const plan = info.plan.map(([t]) => name(SECTION_NAMES, t)).join(', ');
  const play = h('button', { class: 'play', type: 'button', 'aria-label': W(`播放 ${song.name}`, `Play ${song.name}`), onclick: () => toggleSong(song) }, [h('img', { class: 'sc', alt: '', src: coverOfTrack(P.track(song)), width: 52, height: 52, loading: 'lazy' }), h('span', { class: 'si', html: ICON.play })]);
  const heart = h('button', { class: `act heart${lib.has(song.id) ? ' kept' : ''}`, type: 'button', 'aria-label': lib.has(song.id) ? W('取消收藏', 'Remove from Library') : W('收藏', 'Keep'), 'aria-pressed': String(lib.has(song.id)), html: lib.has(song.id) ? ICON.hearted : ICON.heart, onclick: () => keepSong(song) });
  const more = h('button', { class: 'act', type: 'button', 'aria-label': W('更多', 'More'), html: ICON.more, onclick: e => songMenu(song, e.currentTarget, inLib, list) });
  const bar = h('div', { class: 'plan', role: 'group', 'aria-label': plan });
  const total = info.plan.reduce((a, [, n]) => a + n, 0);
  const width = Math.min(innerWidth, 560) - 32 - 62; // the strip's room (row padding, play column)
  sectionTimes(info.plan, info.bpm || bpm).forEach((s, k) => {
    const label = name(SECTION_NAMES, s.type);
    const em = en ? label.length * 0.66 : label.length;
    bar.append(h('button', { type: 'button', class: 'sec', 'data-k': String(k), style: { flex: String(s.bars), background: `var(--${s.type})`, '--k': String(k) }, 'aria-label': label, text: labelFits(s.bars, total, width, em) ? label : '' }));
    holdable(bar.lastChild, () => seekBar(song, s.bar), () => loopSection(song, s.bar));
  });
  li.append(h('div', { class: 'line' }, [play, h('div', { class: 'what' }, [h('span', { class: 'name', text: song.name }), h('span', { class: 'info' }, what.flatMap((w, i) => [...(i ? [' · '] : []), h('span', { text: w })]))]), heart, more]), bar);
  onLong(li.querySelector('.line'), () => songMenu(song, more, inLib, list));
  litAt = '';
  if (nowPlaying?.id === song.id) markRow(li, true);
  return li;
}
const rowsOf = id => [...document.querySelectorAll(`.song[data-id="${CSS.escape(id)}"]`)];
function markRow(li, on) {
  li.classList.toggle('now', on);
  li.querySelector('.si').innerHTML = on && !audio.paused ? ICON.pause : ICON.play;
}
function refreshHearts(id) {
  radio?.refresh();
  P?.refresh();
  home?.refresh();
  for (const li of rowsOf(id)) {
    const b = li.querySelector('.heart');
    const k = lib.has(id);
    b.classList.toggle('kept', k);
    b.setAttribute('aria-pressed', String(k));
    b.innerHTML = k ? ICON.hearted : ICON.heart;
  }
}

// The maker has this kit (its pieces, tempo and roles) before it's asked for a song.
async function kitToMaker() {
  const now = `${print}|${bpm}|${roles.join(',')}`;
  if (kitSent === now) return;
  await make.setKit({ pieces: pieces.map(p => ({ L: p.L, R: p.R })), sr, heard, bpm, roles: [...roles] });
  kitSent = now;
}
// A recipe as this batch's settings make it (a song made from another keeps that one's).
const recipeOf = (over = {}) => {
  const c = cfg();
  const len = kitLength(settings.length, bpm);
  return { print, minBars: len.minBars, maxBars: len.maxBars, styles: [...c.styles], humanize: c.humanize, mix: { ...c.mix }, weights: weights(), detail: null, style: null, plan: len.plan ? radioPlan(makeRng(Math.floor(Math.random() * 1e9)), bpm, settings.length, true) : null, ...over };
};
// One song made from a recipe: { id, name, info, data, url, bits, recipe }.
async function makeOne(recipe, title) {
  await kitToMaker();
  const bits = cfg().bits;
  const { info, wav } = await make.song(recipe, bits);
  // (Kept with the groove it got instead of the taste it leaned on: made again, for its stems or
  // a variation, it's the same song whatever the taste is by then.)
  const { weights: _, ...rest } = recipe;
  const made = rest.jam ? rest : { ...rest, style: info.style };
  return { id: recipeId(made), name: title, info, data: wav, url: URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })), bits, recipe: made };
}
// The recipe of a song made from `from`, whatever the settings are now: its
// own length, styles, humanize, mixer and the groove it got.
const fromRecipe = (from, over) => ({ ...from.recipe, ...over });

$('go').onclick = () => makeBatch();
// A batch of `count` songs, in place of the last.
async function makeBatch(count = cfg().count) {
  if (ownBand()) return bandBatch(count);
  if (busy || problem() || !pieces.length) return;
  busy = true;
  quiet();
  for (const s of songs) URL.revokeObjectURL(s.url);
  songs = [];
  const { bits, mix } = cfg();
  const seed = cfg().seed ? +cfg().seed : Math.floor(Math.random() * 1e9);
  $('out').hidden = false;
  $('songs').textContent = '';
  $('zip').disabled = true;
  const lean = weights() ? W(` · 依你的口味`, ` · your taste`) : '';
  $('out-meta').textContent = `${bpm} BPM · ${W('種子', 'seed')} ${seed} · ${bits === 32 ? W('32 位元', '32-bit') : W('16 位元', '16-bit')} · ${mix.on ? W('混音', 'mixed') : W('原音', 'raw')}${lean}`;
  $('go').disabled = true;
  update();
  const list = batch(count, seed);
  const kit = print;
  try {
    for (let k = 0; k < list.length; k++) {
      $('go').textContent = W(`第 ${k + 1} / ${list.length} 首…`, `Making ${k + 1} of ${list.length}…`);
      $('busy').textContent = W(`正在做第 ${k + 1} / ${list.length} 首…`, `Making song ${k + 1} of ${list.length}…`);
      if (k === 0) $('out').scrollIntoView({ behavior: 'smooth', block: 'start' });
      await new Promise(r => setTimeout(r, 0));
      if (print !== kit) break;   // (the kit changed under the batch: what's made stays)
      const song = await makeOne(recipeOf({ seed: list[k].seed }), songTitle(list[k].seed));
      songs.push(song);
      $('songs').append(songRow(song));
      // (The first one plays as soon as it's made, unless something else already is; the rest follow it.)
      if (k === 0 && !P.state()?.playing) playRow(song);
      else P.relist(songs.map(x => P.track(x)));
    }
  } catch (e) {
    toast(W(`做不出來：${e.message}`, `Couldn't make it: ${e.message}`), { tone: 'bad' });
  }
  $('busy').textContent = '';
  $('zip').disabled = !songs.length;
  busy = false;
  update();
}

// 簡單's batch with no tune in the pieces (or none): songs on the app's own band, each a groove of its own.
async function bandBatch(count) {
  if (busy) return;
  busy = true;
  quiet();
  for (const s of songs) URL.revokeObjectURL(s.url);
  songs = [];
  $('out').hidden = false;
  $('songs').textContent = '';
  $('zip').disabled = true;
  $('go').disabled = true;
  update();
  const recent = [];
  try {
    for (let k = 0; k < count; k++) {
      $('go').textContent = W(`第 ${k + 1} / ${count} 首…`, `Making ${k + 1} of ${count}…`);
      $('busy').textContent = W(`正在做第 ${k + 1} / ${count} 首…`, `Making song ${k + 1} of ${count}…`);
      if (k === 0) $('out').scrollIntoView({ behavior: 'smooth', block: 'start' });
      const spec = radioPick('all', recent);
      recent.push(spec.style);
      const song = await bandSong({ ...spec, seconds: settings.length });
      songs.push(song);
      $('songs').append(songRow(song));
      // (The first one plays as soon as it's made, unless something else already is; the rest follow it.)
      if (k === 0 && !P.state()?.playing) playRow(song);
      else P.relist(songs.map(x => P.track(x)));
    }
  } catch (e) {
    toast(W(`做不出來：${e.message}`, `Couldn't make it: ${e.message}`), { tone: 'bad' });
  }
  $('busy').textContent = '';
  $('zip').disabled = !songs.length;
  busy = false;
  update();
}
// A song on the app's own band (聽's, or 簡單's batch): { id, name, info, data, url, bits, recipe }.
async function bandSong(spec) {
  const { info, wav } = await make.radioWav(spec);
  return { id: `radio:${spec.seed}:${spec.mood}:${info.style}`, name: songTitle(spec.seed), info, data: wav, url: URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })), bits: 16, recipe: { print: 'radio', radio: info.radio } };
}

// A song made from another (a variation, another groove, an arrangement), in the batch right under it.
async function another(from, recipe, title) {
  if (!heard || from.recipe.print !== print) return toast(W('要用做這首歌的片段才能變化', 'Needs the pieces this song was made from'), { tone: 'bad' });
  let song;
  try {
    song = await makeOne(recipe, title);
  } catch (e) {
    return toast(W(`做不出來：${e.message}`, `Couldn't make it: ${e.message}`), { tone: 'bad' });
  }
  const at = songs.indexOf(from);
  if (at >= 0) songs.splice(at + 1, 0, song);
  else songs.unshift(song);
  $('out').hidden = false;
  const row = songRow(song);
  const anchor = $('songs').querySelector(`.song[data-id="${CSS.escape(from.id)}"]`);
  if (anchor) anchor.after(row);
  else $('songs').prepend(row);
  $('zip').disabled = false;
  if (tabNow === 'make') row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  else toast(W(`已做好：${song.name}（在「做歌」）`, `Made: ${song.name} (in Make)`));
  playRow(song);
}
const baseTitle = song => song.name.split(' · ')[0];
const nth = base => songs.filter(s => s.name.startsWith(`${base} · `)).length + 1;
// (In 歌單: into a list; shown in a list, out of it.)
function songMenu(song, anchor, inLib, list = null) {
  const can = heard && song.recipe?.print === print;
  const isJam = Boolean(song.recipe?.jam);
  const t = P.track(song);
  const k = lib.has(song.id);
  menu(anchor, [
    { label: W('播放', 'Play'), icon: 'play', onClick: () => playRow(song) },
    { label: W('插播', 'Play next'), icon: 'play_next', onClick: () => P.playNext(t) },
    { label: W('稍後播放', 'Play later'), icon: 'queue', onClick: () => P.playLater(t) },
    { label: k ? W('取消收藏', 'Remove from Library') : W('收藏', 'Keep'), icon: k ? 'heart-fill' : 'heart', onClick: () => keepSong(song) },
    { label: W('分享', 'Share'), icon: 'share', onClick: () => shareSong(song) },
    { label: W('重新混音', 'Remix'), icon: 'shuffle', onClick: () => remixOf(song) },
    { label: W('取出片段', 'Take a clip'), icon: 'cut', onClick: () => clipOf(song) },
    ...(inLib ? [{ label: W('刪除', 'Delete'), icon: 'trash', danger: true, onClick: () => keepSong(song) }] : []),
    'divider',
    ...(can && !isJam
      ? [
          { label: W('變奏一首', 'A variation'), icon: 'refresh', onClick: () => another(song, fromRecipe(song, { detail: Math.floor(Math.random() * 1e9) }), `${baseTitle(song)} · ${W('變奏', 'Var.')} ${nth(baseTitle(song))}`) },
          { label: W('換個鼓…', 'Another groove…'), icon: 'note', onClick: () => pickGroove(song) },
          ...(shows(settings.level, 'make-arrange') ? [{ label: W('編排…', 'Arrange…'), icon: 'grid', onClick: () => arrange(song) }] : []),
          'divider'
        ]
      : []),
    { label: W('下載 WAV', 'Download WAV'), icon: 'download', onClick: () => downloadSong(song) },
    ...(song.recipe?.radio || song.recipe?.band ? [] : [{ label: W('存成檔案', 'Save as file'), icon: 'download', onClick: () => saveProject(song) }]),
    ...(can && shows(settings.level, 'make-stems') ? [{ label: W('下載分軌', 'Download stems'), icon: 'grid', onClick: () => stemsOf(song) }] : []),
    ...(can && shows(settings.level, 'make-midi') ? [{ label: W('匯出 MIDI', 'Export MIDI'), icon: 'note', onClick: () => midiOf(song) }] : []),
    ...(inLib
      ? [
          'divider',
          { label: W('加到清單…', 'Add to playlist…'), icon: 'plus', onClick: () => lib.pickList(song) },
          ...(list ? [{ label: W('從這個清單移除', 'Remove from this playlist'), icon: 'close', onClick: () => lib.unlist(list, song.id) }] : []),
          { label: W('重新命名', 'Rename'), icon: 'edit', onClick: () => renameKept(song) }
        ]
      : [])
  ]);
}
// ---- 重新混音 and 取出片段 (lib/remix.mjs, lib/remixview.mjs) ----

// What a remix starts from: a song (a row) or a track (a radio song, or a queued one). -> { base, kind, note } | null
function remixBase(x) {
  const song = x.kind ? songOfTrack(x) : x;
  if (!song) return x.kind === 'radio' ? { base: radioBase(x), kind: 'radio', note: '' } : null;
  const r = song.recipe;
  const kind = r ? kindOfRecipe(r) : 'kit';
  if (kind === 'radio' || kind === 'band' || (heard && r?.print === print)) return { base: baseOf(r, song.info), kind, note: '' };
  // (Its pieces aren't loaded: the same groove and length, on the app's own band.)
  return { base: bandBase(r || {}, song.info, Math.floor(Math.random() * 1e9)), kind: 'radio', note: W('沒有原本的片段，改用內建樂團', "The original pieces aren't here: using the built-in band") };
}
function remixOf(x) {
  const r = remixBase(x);
  if (!r) return toast(W('找不到這首歌', "Can't find that song"), { tone: 'bad' });
  remixSheet({
    kind: r.kind,
    style: r.base.style,
    length: d => (r.base.seconds ? lengthStep(r.base.seconds, d) : null),
    note: r.note,
    pick: c => makeRemix(r.base, c, x.kind ? x.title : x.name, x.id)
  });
}
// The song a recipe makes, under a title: { id, name, info, data, url, bits, recipe }.
async function madeFrom(recipe, title, fromId) {
  const kind = kindOfRecipe(recipe);
  let s;
  if (kind === 'radio') {
    const { info, wav } = await make.radioWav(recipe.radio);
    s = { info, data: wav, bits: 16, recipe: { print: 'radio', radio: info.radio } };
  } else if (kind === 'band') {
    const { info, wav } = await make.song(recipe, 16);
    s = { info, data: wav, bits: 16, recipe };
  } else {
    s = await makeOne(recipe, title);
  }
  return { ...s, id: remixId(fromId, recipe), name: title, url: s.url || URL.createObjectURL(new Blob([s.data], { type: 'audio/wav' })) };
}
async function makeRemix(base, choice, title, fromId) {
  const { recipe, changed } = remix(base, choice === 'surprise' ? surprise(base) : choice);
  if (!changed.length) return toast(W('已經是這樣了', 'Already like that'), { ms: 1400 });
  toast(W('混音中…', 'Remixing…'), { ms: 2500 });
  let song;
  try {
    song = await madeFrom(recipe, remixTitle(title), fromId);
  } catch (e) {
    return toast(W(`做不出來：${e.message}`, `Couldn't make it: ${e.message}`), { tone: 'bad' });
  }
  const old = remixes.findIndex(s => s.id === song.id);
  if (old >= 0) remixes.splice(old, 1);
  remixes.unshift(song);
  while (remixes.length > 12) {
    const o = remixes.pop();
    if (nowPlaying?.id !== o.id) URL.revokeObjectURL(o.url);
  }
  playRow(song);
}

// A clip from a song: pick a section (and a part), hear it, add it to the clips.
async function clipOf(x) {
  let song = x.kind ? songOfTrack(x) : x;
  if (!song && x.kind === 'radio') {
    toast(W('準備中…', 'Getting it ready…'), { ms: 2500 });
    song = await bandSong({ seed: x.seed, mood: x.mood, style: x.style }).then(s => ({ ...s, name: x.title })).catch(() => null);
  }
  if (!song?.info?.plan?.length) return toast(W('找不到這首歌', "Can't find that song"), { tone: 'bad' });
  const r = song.recipe;
  const kind = r ? kindOfRecipe(r) : 'kit';
  const remake = kind === 'radio' || kind === 'band' || Boolean(heard && r?.print === print);
  let decoded = null;
  if (remake) {
    if (kind === 'kit' || kind === 'jam') await kitToMaker();
  } else {
    // (Not made again: cut from the sound itself, all of it.)
    try {
      decoded = song.data ? parseWav(song.data) : await keptAudio(lib.get(song.id) || song);
    } catch {}
    if (!decoded) return toast(W('讀不了這首歌', "Can't read that song"), { tone: 'bad' });
  }
  const info = song.info;
  const got = new Map();
  const made = [];
  clipSheet({
    plan: info.plan,
    parts: remake,
    stop: () => P.state()?.playing && P.toggle(),
    closed: () => made.forEach(u => URL.revokeObjectURL(u)),
    render: async (k, part) => {
      let out;
      if (remake) out = await make.clip(r, k, part);
      else {
        const sp = clipSpan(info.plan, info.bpm, k, decoded.sr);
        const a = partOf(decoded, 'all', sp.from, sp.to);
        out = { wav: encodeWav(a, 16), seconds: sp.seconds, bars: sp.bars, bpm: info.bpm, peak: a.peak };
      }
      got.set(`${k}:${part}`, out);
      const url = URL.createObjectURL(new Blob([out.wav], { type: 'audio/wav' }));
      made.push(url);
      return { url, seconds: out.seconds, silent: out.peak < 0.003 };
    },
    add: (k, part) => {
      const out = got.get(`${k}:${part}`);
      if (!out) return false;
      addAudioClip({ title: song.name, section: name(SECTION_NAMES, info.plan[k][0]), part, audio: parseWav(out.wav), bpm: out.bpm });
      toast(W('已加到「做歌」的片段，也能在「即興」彈', 'Added to Make songs’ clips, and to Jam’s pads'));
      return true;
    }
  });
}
// A stretch of a song into the kit as one piece to loop (at the kit's tempo, the song's when there is no kit).
function addAudioClip({ title, section, part, audio, bpm: clipBpm }) {
  const had = pieces.length > 0;
  let { sr: csr, L, R } = audio;
  const f = bpm / clipBpm;
  if (had && f > 0.5 && f < 2 && Math.abs(f - 1) > 0.01) ({ L, R } = retime({ L, R, sr: csr }, f));
  const label = [title, section, part === 'all' ? '' : name(PART_NAMES, part)].filter(Boolean).join(' · ');
  const role = { all: 'riff', melody: 'riff', drums: 'fill', bass: 'bass' }[part] || 'riff';
  return insertMade([{ src: { name: `♪ ${label}`, sr: csr, L, R }, role }], had ? bpm : Math.round(clipBpm), had);
}
function pickGroove(song) {
  const s = sheet({
    title: W('換個鼓', 'Another groove'),
    closeLabel: W('關閉', 'Close'),
    body: h('div', { class: 'card sheet-card' }, [
      h('p', { class: 'hint', style: { marginTop: '0' }, text: W('同樣的段落和 Riff，換成這種節奏', 'The same sections and riffs, on this groove') }),
      h(
        'div',
        { class: 'chips three' },
        STYLES.map(st =>
          h('button', {
            class: 'chip',
            type: 'button',
            'aria-pressed': String(st === song.info.style),
            text: name(STYLE_NAMES, st),
            onclick: () => {
              s.close();
              if (st !== song.info.style) another(song, fromRecipe(song, { style: st }), `${baseTitle(song)} · ${name(STYLE_NAMES, st)}`);
            }
          })
        )
      )
    ])
  });
}
// 編排: the song's sections, moved, repeated, lengthened or taken out; made again with every other choice as it was.
function arrange(song) {
  let plan = song.info.plan.map(([t, n]) => [t, n]);
  const list = h('ol', { class: 'arr' });
  const total = h('small');
  const draw = () => {
    const bars = plan.reduce((s, [, n]) => s + n, 0);
    total.textContent = W(`${plan.length} 段 · 約 ${clock((bars * 4 * 60) / bpm)}`, `${plan.length} section${plan.length === 1 ? '' : 's'} · about ${clock((bars * 4 * 60) / bpm)}`);
    list.replaceChildren(
      ...plan.map(([t, n], k) => {
        const typeSel = h('select', { class: 'num wide', 'aria-label': W('段落', 'Section') }, SECTIONS.map(x => h('option', { value: x, text: name(SECTION_NAMES, x) })));
        typeSel.value = t;
        typeSel.onchange = () => ((plan[k][0] = typeSel.value), draw());
        const lenSel = h('select', { class: 'num short', 'aria-label': W('小節', 'Bars') }, [1, 2, 3, 4, 6, 8, 12, 16].map(x => h('option', { value: String(x), text: String(x) })));
        lenSel.value = String(n);
        lenSel.onchange = () => ((plan[k][1] = +lenSel.value), draw());
        const btn = (txt, label, fn, off = false) => h('button', { class: 'mini', type: 'button', html: icon(txt), 'aria-label': label, disabled: off, onclick: () => (fn(), draw()) });
        return h('li', {}, [
          h('i', { style: { background: `var(--${t})` } }),
          typeSel,
          lenSel,
          h('div', { class: 'ctl' }, [
            btn('arrow-up', W('上移', 'Move up'), () => plan.splice(k - 1, 0, ...plan.splice(k, 1)), k === 0),
            btn('copy', W('重複', 'Repeat'), () => plan.splice(k + 1, 0, [...plan[k]]), plan.length >= 24),
            btn('close', W('拿掉', 'Remove'), () => plan.splice(k, 1), plan.length <= 1)
          ])
        ]);
      })
    );
  };
  draw();
  const s = sheet({
    title: W('編排', 'Arrange'),
    closeLabel: W('關閉', 'Close'),
    body: h('div', { class: 'card sheet-card' }, [
      h('p', { class: 'hint', style: { marginTop: '0' }, text: W('同樣的 Riff、鼓和人味，照這個順序', 'The same riffs, drums and feel, in this order') }),
      list,
      total,
      h('button', {
        class: 'primary',
        type: 'button',
        text: W('照這樣做一首', 'Make it like this'),
        onclick: () => {
          s.close();
          another(song, fromRecipe(song, { plan: plan.map(([t, n]) => [t, n]) }), `${baseTitle(song)} · ${W('編排', 'Arr.')} ${nth(baseTitle(song))}`);
        }
      })
    ])
  });
}

// ---- The player: a song at a time (the radio has its own), under lib/player.mjs's queue ----

const audio = new Audio();
audio.preload = 'auto';
let nowPlaying = null;
let repeat = 'list'; // 'section' while a section is held on repeat; the queue's loop (off, all, one) is lib/queue.mjs's
let loopAt = null; // { from, to } in seconds: the section looped
let wantLoop = null; // a section to loop in the song about to play (held from its row)
let P = null; // lib/player.mjs, made in boot
let home = null;
let trackMenuOf = () => {};
async function urlOf(song) {
  if (song.url) return song.url;
  // (The kept record as it is now: 歌單瘦身 may have packed it since its row was drawn.)
  if (!urls.has(song.id)) urls.set(song.id, URL.createObjectURL(soundOf(lib.get(song.id) || song)));
  return urls.get(song.id);
}
// A song to its sound, now (the queue's start() comes here).
async function playSong(song, at = 0) {
  quiet({ keep: 'song' });
  const turn = ++songTurn;
  if (nowPlaying) for (const li of rowsOf(nowPlaying.id)) markRow(li, false);
  if (nowPlaying?.id !== song.id) {
    loopAt = wantLoop;
    repeat = wantLoop ? 'section' : 'list';
  }
  wantLoop = null;
  nowPlaying = song;
  audio.loop = P.q.loop === 'one' && !loopAt;
  const url = await urlOf(song);
  if (turn !== songTurn) return;
  audio.src = url;
  audio.currentTime = at;
  // (Safari can keep the last song's time across a new src: set again once it's loaded.)
  audio.addEventListener('loadedmetadata', () => Math.abs(audio.currentTime - at) > 0.5 && (audio.currentTime = at), { once: true });
  // (A play refused, iOS between songs with the screen locked: once more a moment later.)
  await audio.play().catch(() => new Promise(r => setTimeout(r, 300)).then(() => audio.play()).catch(() => {}));
  claimSession({ title: song.name, artist: song.info.style ? name(STYLE_NAMES, song.info.style) : W('即興', 'Jam'), album: 'Orbit Beats', play: () => audio.play(), pause: () => audio.pause() });
  P.songStarted(song);
  paintPlayer();
  for (const li of rowsOf(song.id)) markRow(li, true);
}
// A song from a row: it plays, and the list it is in goes on after it (the batch, or what 歌單 shows).
const remixes = []; // the remixes made this visit (newest first), so the queue can play them
const songOfTrack = t => lib.get(t.id) || songs.find(s => s.id === t.id) || remixes.find(s => s.id === t.id) || null;
function playRow(song, at = 0) {
  const list = (tabNow === 'library' ? lib.shown() : songs).map(x => P.track(x));
  const track = P.track(song);
  return P.play(track, list.some(x => x.id === track.id) ? Q.listStation(list, track.id) : null, at);
}
// Where a bar starts in a song (its sections at the song's tempo).
const barTime = (song, bar) => (bar * 4 * 60) / (song.info.bpm || bpm);
function seekBar(song, bar) {
  const t = barTime(song, bar);
  if (repeat === 'section') loopAt = sectionAt(song, t);
  if (nowPlaying?.id === song.id) {
    audio.currentTime = t;
    if (audio.paused) audio.play().catch(() => {});
  } else {
    wantLoop = repeat === 'section' ? loopAt : null;
    playRow(song, t);
  }
}
function toggleSong(song) {
  if (nowPlaying?.id === song.id) {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
    return;
  }
  playRow(song);
}
// (Bumped by every stop: a song still loading when something else starts doesn't start after it.)
let songTurn = 0;
function stopSong() {
  songTurn++;
  if (!audio.paused) audio.pause();
}
function closePlayer() {
  audio.pause();
  if (nowPlaying) for (const li of rowsOf(nowPlaying.id)) markRow(li, false);
  nowPlaying = null;
  loopAt = null;
}
// The section the song is in at time t: { from, to } in seconds.
function sectionAt(song, t) {
  const times = sectionTimes(song.info.plan, song.info.bpm || bpm);
  const k = sectionIndex(times, t);
  return k < 0 ? null : { from: times[k].from, to: times[k].to, k };
}
// A tap runs tap(); holding for 0.45 s runs hold() (and the tap that follows is dropped).
function holdable(el, tap, hold) {
  let timer = 0, held = false;
  const stop = () => clearTimeout(timer);
  el.addEventListener('pointerdown', () => { held = false; timer = setTimeout(() => { held = true; hold(); }, 450); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, stop);
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('click', () => { if (!held) tap(); held = false; });
}
// Loop one section: play it from its start and repeat it.
function loopSection(song, bar) {
  repeat = 'section';
  audio.loop = false;
  seekBar(song, bar);
  navigator.vibrate?.(15);
  toast(W('重複這一段', 'Repeating this section'), { ms: 1400 });
}
let litAt = '';
function paintSections() {
  const rows = nowPlaying ? rowsOf(nowPlaying.id) : [];
  const k = nowPlaying ? sectionAt(nowPlaying, audio.currentTime)?.k ?? -1 : -1;
  const key = `${nowPlaying?.id}:${k}:${repeat === 'section' ? loopAt?.from : ''}`;
  if (key === litAt) return;
  litAt = key;
  for (const li of document.querySelectorAll('.song .sec.lit, .song .sec.loop')) li.classList.remove('lit', 'loop');
  for (const li of rows) {
    const el = li.querySelector(`.sec[data-k="${k}"]`);
    el?.classList.add('lit');
    if (repeat === 'section' && loopAt) el?.classList.add('loop');
  }
}
function paintPlayer() {
  const d = audio.duration || nowPlaying?.info?.seconds || 0;
  const t = audio.currentTime || 0;
  const pct = d ? Math.min(100, (t / d) * 100) : 0;
  paintSections();
  if (nowPlaying) for (const li of rowsOf(nowPlaying.id)) li.querySelector('.plan').style.setProperty('--at', `${pct}%`);
}
// (A section looped is held by the frame, not timeupdate's quarter second.)
function watchLoop() {
  if (repeat === 'section' && loopAt && !audio.paused && audio.currentTime >= loopAt.to) audio.currentTime = loopAt.from;
  requestAnimationFrame(watchLoop);
}
requestAnimationFrame(watchLoop);
for (const ev of ['timeupdate', 'play', 'pause', 'loadedmetadata', 'seeked']) audio.addEventListener(ev, () => {
  paintPlayer();
  if (nowPlaying) for (const li of rowsOf(nowPlaying.id)) markRow(li, true);
});
audio.addEventListener('ended', () => {
  paintPlayer();
  if (repeat === 'section' && loopAt) return void ((audio.currentTime = loopAt.from), audio.play().catch(() => {}));
  P.ended();
});
// A song the phone left stuck (the share sheet, a call: time standing still, or a play it
// won't take): its file loaded again where it was, and on.
async function revive() {
  if (!nowPlaying) return;
  const at = audio.currentTime;
  audio.src = await urlOf(lib.get(nowPlaying.id) || nowPlaying);
  audio.addEventListener('loadedmetadata', () => ((audio.currentTime = at), audio.play().catch(() => {})), { once: true });
  audio.load();
}
let stuckAt = -1;
let stuck = 0;
setInterval(() => {
  if (!nowPlaying || audio.paused || audio.ended || document.visibilityState === 'hidden') return void (stuck = 0);
  stuck = audio.currentTime === stuckAt ? stuck + 1 : 0;
  stuckAt = audio.currentTime;
  if (stuck >= 3) (stuck = 0), revive();
}, 1000);
// The lock screen's controls and its title (iOS's Now Playing): whatever played last (a song, or the radio) has them.
// artwork: the song's own cover first when there's one (the radio's, a 512 px JPEG), the app's icon always after it.
function sessionMeta({ title, artist, album = '', artwork = null }) {
  const ms = navigator.mediaSession;
  if (!ms || !globalThis.MediaMetadata) return;
  try {
    ms.metadata = new MediaMetadata({ title, artist, album, artwork: [...(artwork ? [{ src: artwork, sizes: '512x512', type: 'image/jpeg' }] : []), { src: new URL('./icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }] });
  } catch {}
}
// (The lock screen's back and forward are the queue's, whichever is playing.)
function claimSession(o) {
  const ms = navigator.mediaSession;
  if (!ms) return;
  sessionMeta(o);
  const { play, pause } = o;
  for (const [action, fn] of [['play', play], ['pause', pause], ['previoustrack', () => P.back()], ['nexttrack', () => P.forward()]])
    try {
      ms.setActionHandler(action, fn);
    } catch {}
}

// ---- Keep, share, download ----

// ♡: into 歌單 (this phone) and your taste (the Pass); again, out of both.
const keeping = new Set(); // (being packed: a second tap waits for the first)
async function keepSong(song, { quiet = false } = {}) {
  if (lib.has(song.id)) {
    await deleteSong(song.id).catch(() => {});
    lib.remove(song.id);
    if (song.info.style) kept.taste = liked(kept.taste, song.info.style, -1);
    keep();
    refreshHearts(song.id);
    tasteHint();
    quiet || toast(W('已從歌單移除', 'Removed from Library'));
    return;
  }
  if (keeping.has(song.id)) return;
  keeping.add(song.id);
  const slow = setTimeout(() => toast(W('存到歌單中…', 'Keeping it…'), { ms: 4000 }), 400);
  let rec;
  try {
    // (Kept small: packed by the phone, about a tenth of the WAV; made again whole to export, lib/pack.mjs.)
    const small = await packSong(song.data || new Uint8Array(await soundOf(song).arrayBuffer()), { built: builtIn(song.recipe) });
    rec = { id: song.id, name: song.name, at: Date.now(), info: song.info, recipe: song.recipe, sound: small.sound, form: small.form, sr: small.sr, seconds: small.seconds };
    await saveSong(rec);
  } catch {
    return toast(W('存不下：手機空間不夠？', "Couldn't keep it: phone storage full?"), { tone: 'bad' });
  } finally {
    clearTimeout(slow);
    keeping.delete(song.id);
  }
  navigator.storage?.persist?.().catch(() => {});
  lib.add(rec);
  if (song.info.style) kept.taste = liked(kept.taste, song.info.style, 1);
  keep();
  refreshHearts(song.id);
  tasteHint();
  quiet || toast(W('已存到歌單', 'Kept in Library'));
}
// A song's WAV to hand over, at full quality: a batch's own; a kept one made
// again from its recipe (聽's band, 即興's set, or the kit it was made on
// when that's in) if it still sounds like what was kept; else the kept copy
// (a WAV as it is; packed, decoded, and `note` says so). -> { blob, note }
async function wavOf(song) {
  if (song.data) return { blob: new Blob([song.data], { type: 'audio/wav' }), note: '' };
  const rec = lib.get(song.id) || song;
  if (formOf(rec) === 'wav') return { blob: soundOf(rec), note: '' };
  const kind = kindOf(rec.recipe);
  const mine = kind === 'kit' && Boolean(heard) && rec.recipe?.print === print;
  let kept = null;
  if (kind !== 'kit' || mine) {
    try {
      let wav;
      if (kind === 'radio') ({ wav } = await make.radioWav(rec.recipe.radio));
      else {
        if (mine) await kitToMaker();
        ({ wav } = await make.song(rec.recipe, cfg().bits));
      }
      kept = await keptAudio(rec);
      if (sameSong(parseWav(wav), kept)) return { blob: new Blob([wav], { type: 'audio/wav' }), note: '' };
    } catch {}
  }
  kept ||= await keptAudio(rec);
  const note = kind === 'kit' && !mine ? W('從歌單的壓縮檔轉成 WAV。放進做這首的片段，就能匯出原音質。', 'Made from the Library copy. Add the pieces it was made from for full quality.') : W('從歌單的壓縮檔轉成 WAV。', 'Made from the Library copy.');
  return { blob: new Blob([encodeWav(kept, 16)], { type: 'audio/wav' }), note };
}
// wavOf with word of it: a moment's making shows, a failure says so. -> { blob, note } | null
async function exportWav(song) {
  const slow = setTimeout(() => toast(W('正在做 WAV…', 'Making the WAV…'), { ms: 8000 }), 300);
  try {
    return await wavOf(song);
  } catch (e) {
    toast(W(`做不出來：${e.message}`, `Couldn't make it: ${e.message}`), { tone: 'bad' });
    return null;
  } finally {
    clearTimeout(slow);
    document.querySelector('.q-toast')?.remove();
  }
}
// (Ready at once: a batch's song, or one kept as a WAV.)
const wavReady = song => Boolean(song.data) || formOf(lib.get(song.id) || song) === 'wav';
async function downloadSong(song) {
  const got = await exportWav(song);
  if (!got) return;
  download(got.blob, `${fileName(song.name)}.wav`);
  if (got.note) toast(got.note, { ms: 4000 });
}
// 分享: the WAV itself through the phone's share sheet (AirDrop, Messages, …); a browser that can't share files downloads it.
async function shareSong(song) {
  const ready = wavReady(song);
  const got = await exportWav(song);
  if (!got) return;
  // (A WAV that took a moment to make: one more tap, as Safari shares only right after one.)
  if (!ready && !(await ask({ title: W('WAV 做好了', 'The WAV is ready'), body: got.note, ok: W('分享', 'Share'), cancel: W('取消', 'Cancel'), lang }))) return;
  const playing = nowPlaying && !audio.paused;
  const how = await shareFile(got.blob, `${fileName(song.name)}.wav`, { title: song.name, text: W(`${song.name} · 用 Orbit Beats 做的`, `${song.name} · made with Orbit Beats`) });
  // (The share sheet can leave the song stuck: on again where it was.)
  if (playing) setTimeout(() => (audio.paused ? audio.play().catch(() => revive()) : undefined), 300);
  if (how === 'downloaded') toast(W('這個瀏覽器不能分享檔案：已下載', "This browser can't share files: downloaded"));
}
// 存成檔案: the song's settings (never its sound) as a small .json through the share sheet, or saved.
async function saveProject(song) {
  const mine = song.recipe?.print === print;
  const file = toFile(song, { roles: mine ? roles : null, mood: moodFor(song.recipe?.styles || []) });
  const how = await shareFile(new Blob([toText(file)], { type: 'application/json' }), `${fileName(song.name)}.orbitbeats.json`, { title: song.name, text: W(`${song.name} · Orbit Beats 的歌曲檔`, `${song.name} · an Orbit Beats song file`) });
  if (how === 'downloaded') toast(W('已存成檔案', 'Saved as a file'));
}
// 打開檔案: a saved song made again on the pieces in hand (the same song when they're the kit it was made on).
async function openProject(f) {
  const fail = body => ask({ alertOnly: true, title: W('打不開這個檔案', "Can't open this file"), body, ok: W('好', 'OK'), lang });
  let text;
  try {
    text = await f.text();
  } catch {
    return fail(W('檔案讀不到，請再選一次', "The file couldn't be read: pick it again"));
  }
  const r = fromText(text);
  if (!r.ok) return fail(W(r.zh, r.en));
  if (!heard || !pieces.length) return fail(W('先放進片段（或「試試示範」），再打開歌曲檔：檔案裡只有設定，沒有聲音', 'Add pieces first (or try the demo), then open the song file: it holds settings, not sound'));
  const p = r.project;
  const same = Boolean(p.kit) && p.kit === print;
  if (p.recipe.jam && p.recipe.jam.some(e => e.i >= pieces.length)) return fail(W(`這首即興用到第 ${Math.max(...p.recipe.jam.map(e => e.i)) + 1} 個片段，但現在只有 ${pieces.length} 個`, `This jam uses piece ${Math.max(...p.recipe.jam.map(e => e.i)) + 1}, but there are only ${pieces.length} now`));
  // The same kit: its tempo and roles as the song was made.
  if (same && p.bpm && Math.abs(p.bpm - bpm) > 0.05) setTempo(p.bpm);
  if (same && p.roles?.length === roles.length) {
    let changed = false;
    p.roles.forEach((x, i) => {
      if (roles[i] !== x) ((roles[i] = x), edited.add(i), (changed = true));
    });
    if (changed) (showPieces(), keepKit());
  }
  const recipe = { print, ...p.recipe };
  const id = recipeId(recipe);
  const there = songs.find(s => s.id === id);
  if (there) return (toast(W('這首已經在清單裡', 'This song is already in the list')), playRow(there));
  let song;
  try {
    song = await makeOne(recipe, p.name || (recipe.jam ? W('即興', 'Jam') : songTitle(recipe.seed)));
  } catch (e) {
    return fail(W(`做不出來：${e.message}`, `Couldn't make it: ${e.message}`));
  }
  songs.unshift(song);
  $('out').hidden = false;
  $('songs').prepend(songRow(song));
  $('zip').disabled = false;
  toast(same ? W(`已打開：${song.name}`, `Opened: ${song.name}`) : W(`已打開：${song.name}（片段不同，聽起來會不一樣）`, `Opened: ${song.name} (different pieces, so it sounds different)`), { ms: 3200 });
  playRow(song);
}
$('open-song').onclick = () => $('song-file').click();
$('song-file').addEventListener('change', () => {
  const f = $('song-file').files[0];
  $('song-file').value = '';
  if (f) openProject(f);
});
const busNames = () => Object.fromEntries(STEMS.map(b => [b, name(BUS_NAMES, b)]));
// 分軌: each bus a WAV (drums, hats, bass, melody, echo and room), in a zip, made again from the recipe.
async function stemsOf(song) {
  toast(W('正在做分軌…', 'Making the stems…'), { ms: 1600 });
  try {
    await kitToMaker();
    const zip = await make.stems(song.recipe, cfg().bits, { title: fileName(song.name), names: busNames() });
    download(new Blob([zip], { type: 'application/zip' }), `${fileName(song.name)} · ${W('分軌', 'Stems')}.zip`);
  } catch (e) {
    toast(W(`做不出來：${e.message}`, `Couldn't make them: ${e.message}`), { tone: 'bad' });
  }
}
// MIDI: the song's hits, each piece a note (C2 up), a track a bus.
async function midiOf(song) {
  try {
    await kitToMaker();
    const bytes = await make.midi(song.recipe, { names: busNames() });
    download(new Blob([bytes], { type: 'audio/midi' }), `${fileName(song.name)}.mid`);
  } catch (e) {
    toast(W(`做不出來：${e.message}`, `Couldn't make it: ${e.message}`), { tone: 'bad' });
  }
}
function renameKept(song) {
  const input = h('input', { class: 'num', type: 'text', style: { width: '100%', textAlign: 'left', padding: '0 12px' }, maxlength: 40, 'aria-label': W('歌名', 'Name') });
  input.value = song.name;
  const done = async () => {
    const v = input.value.trim().slice(0, 40);
    s.close();
    if (!v || v === song.name) return;
    await renameSong(song.id, v).catch(() => {});
    lib.rename(song.id, v);
    for (const x of songs) if (x.id === song.id) x.name = v;
    for (const li of rowsOf(song.id)) li.querySelector('.name').textContent = v;
    P?.refresh();
  };
  input.addEventListener('keydown', e => e.key === 'Enter' && done());
  const s = sheet({
    title: W('重新命名', 'Rename'),
    closeLabel: W('關閉', 'Close'),
    body: h('div', { class: 'card sheet-card' }, [input, h('button', { class: 'primary', type: 'button', text: W('好', 'Done'), onclick: done })])
  });
  setTimeout(() => input.focus(), 60);
}
// Songs in a zip (stored: WAVs barely shrink), each its own name once, each at full quality (wavOf).
async function zipOf(list, filename) {
  const seen = new Map();
  const files = [];
  let noted = 0;
  try {
    for (const [k, s] of list.entries()) {
      const base = fileName(s.name);
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      if (!wavReady(s)) toast(W(`正在做第 ${k + 1} / ${list.length} 首…`, `Making ${k + 1} of ${list.length}…`), { ms: 60000 });
      const got = await wavOf(s);
      if (got.note) noted++;
      files.push({ name: `${base}${n > 1 ? ` (${n})` : ''}.wav`, data: s.data || new Uint8Array(await got.blob.arrayBuffer()) });
    }
  } catch (e) {
    return toast(W(`做不出來：${e.message}`, `Couldn't make it: ${e.message}`), { tone: 'bad' });
  }
  document.querySelector('.q-toast')?.remove();
  download(new Blob(zipParts(files), { type: 'application/zip' }), filename);
  if (noted) toast(W(`${noted} 首從歌單的壓縮檔轉成 WAV`, `${noted} made from the Library copy`), { ms: 4000 });
}

// ---- 歌單瘦身: songs kept as WAVs before, packed small ----
// One at a time behind everything else (never while 樂器 or 即興 play, or
// the song itself does). A song's WAV goes only once its packed copy plays
// back whole and is written and read back as made; a tab closed halfway
// leaves the song as it was (its temp copy cleared next time). What's freed
// is said once, when it's done.
const SLIM_FREED = 'orbit-beats-slim-freed';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sameBytes = async (a, b) => {
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]).then(([p, q]) => [new Uint8Array(p), new Uint8Array(q)]);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};
// (A WAV's rate, from its header: lib/engine's WAVs have it at byte 24.)
const wavRate = async blob => new DataView(await blob.slice(0, 28).arrayBuffer()).getUint32(24, true);
async function slimOne(rec) {
  const sound = soundOf(rec);
  const way = await packWay(rec.sr || (await wavRate(sound)));
  const to = slimTo(rec, way?.codec || null);
  if (!to) return 0;
  while (busy || studio?.playing() || jam?.playing() || nowPlaying?.id === rec.id) await sleep(3000);
  const small = await packSong(new Uint8Array(await sound.arrayBuffer()), { built: builtIn(rec.recipe) });
  if (small.form !== to) return 0;
  if (PACKED.includes(small.form) && !(await playsWhole(small.sound, small.sr, small.seconds))) return 0;
  const temp = tempId(rec.id);
  const { wav: _, bits: __, ...rest } = rec;
  await saveSong({ ...rest, id: temp, sound: small.sound, form: small.form, sr: small.sr, seconds: small.seconds });
  const back = await getSong(temp);
  if (!back?.sound || !(await sameBytes(back.sound, small.sound))) {
    await deleteSong(temp).catch(() => {});
    return 0;
  }
  const done = await swapSong(rec.id, { sound: back.sound, form: small.form, sr: small.sr, seconds: small.seconds });
  if (!done) return 0;
  lib.replace(done);
  if (urls.has(rec.id)) (URL.revokeObjectURL(urls.get(rec.id)), urls.delete(rec.id));
  return sound.size - small.sound.size;
}
async function slimLibrary() {
  await dropTemps().catch(() => {});
  let freed = 0;
  try {
    freed = +localStorage.getItem(SLIM_FREED) || 0;
  } catch {}
  for (const rec of [...lib.all()]) {
    if (!slimTo(rec, PACKED[0])) continue; // (packed already)
    const got = await slimOne(rec).catch(() => 0);
    if (got > 0) {
      freed += got;
      try {
        localStorage.setItem(SLIM_FREED, String(freed));
      } catch {}
    }
    await sleep(200);
  }
  if (freed <= 0) return;
  try {
    localStorage.removeItem(SLIM_FREED);
  } catch {}
  toast(W(`歌單瘦身：省下 ${mbText(freed)}`, `Library slimmed: ${mbText(freed)} freed`), { ms: 3500 });
  if (tabNow === 'library' && !document.activeElement?.matches?.('input')) lib.draw();
}
$('zip').onclick = () => zipOf(songs, 'Orbit Beats.zip');

// ---- 樂器, 即興 ----

let studio = null;
let jam = null;
let jamMake = null;
let radio = null;
// ♡ on 聽: the song whole into 歌單 (made again from its seed), or out again.
async function keepRadio(item) {
  const id = `radio:${item.spec.seed}:${item.spec.mood}:${item.info.style}`;
  const there = lib.has(id);
  if (!there) toast(W('存到歌單中…', 'Keeping it…'), { ms: 1200 });
  try {
    await keepSong(there ? { id, info: item.info } : await bandSong({ ...item.spec, style: item.info.style }).then(s => ({ ...s, name: item.title })));
  } catch (e) {
    toast(W(`存不下來：${e.message}`, `Couldn't keep it: ${e.message}`), { tone: 'bad' });
  }
}
// A song from the jam's take. Kept: straight into 資料庫 (made from its seed and groove on the built-in set), nothing played,
// 復原 takes it out again. Otherwise into the batch, played.
async function jamSong(hits, beats, band, { keep: kept = false } = {}) {
  try {
    if (!band) await kitToMaker();
    const recipe = { print: band ? 'band' : print, ...(band ? { band } : {}), jam: hits, plan: null, mix: { ...cfg().mix }, at: Date.now() };
    const { info, wav } = await make.song(recipe, cfg().bits);
    const at = new Date();
    const when = `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`;
    const label = `${W('即興', 'Jam')}${band ? ` · ${name(STYLE_NAMES, band.style)}` : ''} ${when}`;
    const song = { id: recipeId(recipe), name: label, info, data: wav, url: URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })), bits: cfg().bits, recipe };
    if (kept) {
      await keepSong(song, { quiet: true });
      if (!lib.has(song.id)) return;
      const t = toast(W('已存到資料庫', 'Kept in Library'), { ms: 5000 });
      t.append(h('button', { type: 'button', class: 'toast-undo', text: W('復原', 'Undo'), onclick: async () => (t.remove(), await keepSong(song, { quiet: true }), toast(W('已復原', 'Undone'))) }));
      return;
    }
    songs.unshift(song);
    $('out').hidden = false;
    $('songs').prepend(songRow(song));
    $('zip').disabled = false;
    toast(W(`已做好 ${clock((beats * 60) / bpm)}（在「做歌」）`, `Made ${clock((beats * 60) / bpm)} (in Create)`));
    playRow(song);
  } catch (e) {
    toast(W(`做不出來：${e.message}`, `Couldn't make it: ${e.message}`), { tone: 'bad' });
  }
}


// ---- Words and help ----

// ⓘ anywhere (the page, 樂器, 即興, a sheet): the word in everyday words, and
// where there's one, the same bar without it and with it.
document.addEventListener(
  'click',
  e => {
    const b = e.target.closest?.('.info-btn');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    explain(b.dataset.term);
  },
  true
);
let example = null; // { src, btn }: a "hear it" playing
function stopExample() {
  if (!example) return;
  try {
    example.src.stop();
  } catch {}
  example.btn.classList.remove('on');
  example = null;
}
// An example's few bars on the instruments: its clips summed, played twice.
function exampleBuffer(ex, on) {
  const c = audioCtx();
  const { clips, bpm: tempo } = ex.play(on);
  const parts = clips.map(x => renderClip(x, c.sampleRate, tempo).L);
  const n = Math.max(...parts.map(L => L.length));
  const ab = c.createBuffer(1, n * 2, c.sampleRate);
  const out = ab.getChannelData(0);
  for (const L of parts) for (let i = 0; i < L.length; i++) out[i] = out[i + n] = out[i] + L[i];
  return ab;
}
function explain(id) {
  const t = term(id);
  if (!t) return;
  const ex = EXAMPLES[id];
  const listen = ex
    ? h(
        'div',
        { class: 'listen' },
        [false, true].map(on =>
          h('button', {
            class: 'q-btn tinted',
            type: 'button',
            html: `${icon('play')}<span>${esc(W(...(on ? ex.on : ex.off)))}</span>`,
            onclick: e => {
              const btn = e.currentTarget;
              const again = example?.btn === btn;
              stopExample();
              if (again) return;
              quiet();
              const c = audioCtx();
              const src = c.createBufferSource();
              src.buffer = exampleBuffer(ex, on);
              src.connect(c.destination);
              src.onended = () => example?.src === src && stopExample();
              src.start();
              btn.classList.add('on');
              example = { src, btn };
            }
          })
        )
      )
    : null;
  sheet({
    title: t.name,
    closeLabel: W('關閉', 'Close'),
    onClose: stopExample,
    body: h('div', { class: 'card sheet-card' }, [h('p', { class: 'term-text', text: t.text }), listen])
  });
}
// The ? at the top: 簡單 / 進階, the words, and the full guide (the kit's, in the Quadra Pass sheet).
function helpSheet() {
  const s = sheet({
    title: W('說明', 'Help'),
    closeLabel: W('關閉', 'Close'),
    body: [
      h('div', { class: 'card sheet-card' }, [
        levelRow(),
        h('button', { class: 'more-row row', type: 'button', onclick: () => (s.close(), kitQ.openHelp ? kitQ.openHelp(q) : (location.hash = 'help=beats')) }, [h('span', { class: 'label' }, [h('span', { text: W('完整說明', 'The full guide') }), h('small', { text: W('每個分頁、每個功能', 'Every tab and tool') })]), h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })])
      ]),
      h('div', { class: 'card sheet-card' }, [
        h('div', { class: 'head' }, [h('h2', { text: W('名詞小辭典', 'Music words') })]),
        h(
          'ul',
          { class: 'terms' },
          TERM_ORDER.map(id => h('li', {}, [h('button', { type: 'button', onclick: () => explain(id) }, [h('div', {}, [h('b', { text: term(id).name }), h('small', { text: term(id).hint })]), h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })])]))
        )
      ])
    ]
  });
}

// ---- Opening ----

const BUILD = document.querySelector('meta[name="build-version"]')?.content || 'dev';
window.__fxStarted = true;
const gated = installGate('beats', lang);
watchUpdates({ current: BUILD, key: 'orbitBeats', cachePrefix: 'beats-', busy: () => busy || Boolean(recorder) || !audio.paused || Boolean(radio?.playing()) || Boolean(studio?.playing()) || Boolean(jam?.playing()) || Boolean(document.querySelector('.q-sheet, dialog[open]')) });
topActions(q, { help: helpSheet });

// Everything drawn before the loading screen lifts: the settings, the last
// kit (this phone's) split and heard, the studio's clip; the Pass's settings,
// kits and taste merged in once it answers.
async function boot() {
  showSettings();
  radio = mountRadio(null, {
    make,
    quiet: () => quiet({ keep: 'radio' }),
    title: seed => songTitle(seed),
    keep: item => keepRadio(item),
    kept: id => lib.has(id),
    session: o => claimSession(o),
    meta: o => sessionMeta(o),
    taste: () => kept.taste,
    mood: settings.radioMood,
    setMood: m => ((settings.radioMood = m), save())
  });
  P = createPlayer({
    radio,
    audio,
    songOf: songOfTrack,
    playSong,
    makeSong: t => bandSong({ seed: t.seed, mood: t.mood, style: t.style }).then(x => ({ ...x, name: t.title })),
    nowSong: () => nowPlaying,
    quiet: () => quiet({ keep: 'radio' }),
    closeSong: closePlayer,
    revive,
    toast: text => text && toast(text, { ms: 1400 }),
    words: { next: W('下一首播這個', 'Playing next'), later: W('已加到佇列', 'Added to the queue') },
    missing: W('找不到這首歌', "Can't find that song"),
    store: (() => {
      try {
        return localStorage;
      } catch {
        return null;
      }
    })()
  });
  const core = {
    kept: t => Boolean(t && lib.has(t.id)),
    toggleKeep: async t => {
      if (t.kind === 'radio') return keepRadio({ id: t.id, title: t.title, spec: { seed: t.seed, mood: t.mood }, info: { style: t.style, bpm: t.bpm, key: t.key } });
      const song = songOfTrack(t);
      if (song) return keepSong(song);
    },
    share: async t => {
      let song = songOfTrack(t);
      if (!song && t.kind === 'radio') {
        toast(W('做好再分享…', 'Getting it ready…'), { ms: 1500 });
        song = await bandSong({ seed: t.seed, mood: t.mood, style: t.style }).then(x => ({ ...x, name: t.title })).catch(() => null);
      }
      if (song) shareSong(song);
    },
    remix: t => remixOf(t),
    clip: t => clipOf(t),
    inLibrary: t => Boolean(t && lib.has(t.id)),
    remove: t => {
      const song = lib.get(t.id);
      if (song) keepSong(song);
    },
    sleep: anchor => radio.sleepMenu(anchor),
    sleeping: () => radio.sleeping()
  };
  const view = mountPlayerView(P, core, { mini: $('player') });
  trackMenuOf = view.trackMenu;
  home = mountHome($('panel-home'), {
    P,
    radio,
    taste: () => kept.taste,
    trackMenu: view.trackMenu,
    openNow: view.openNow,
    songs: () => lib.all(),
    go: (id, run) => {
      showTab(id);
      if (!run) return;
      if (id === 'jam') jam?.start();
      else $('go').click();
    }
  });
  // (The loop button leaves a section on repeat.)
  let loopWas = P.q.loop;
  P.on(w => {
    if (w !== 'queue' || P.q.loop === loopWas) return;
    loopWas = P.q.loop;
    repeat = 'list';
    loopAt = null;
    audio.loop = P.q.loop === 'one' && Boolean(nowPlaying);
  });
  studio = mountStudio($('panel-studio'), {
    tempo: () => (pieces.length ? bpm : settings.studioBpm),
    setTempo: v => ((settings.studioBpm = v), save()),
    hasKit: () => pieces.length > 0,
    simple,
    key: () => kitKey(),
    add: clip => addClip(clip),
    audio: audioCtx,
    ahead,
    live,
    quiet: () => quiet({ keep: 'studio' }),
    goMake: opts => {
      showTab('make');
      if (opts?.run) makeBatch();
      $('out').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  });
  jam = mountJam($('panel-jam'), {
    kit: () => ({ pieces, roles, bpm, sr, heard, print, names: pieces.map(p => sources[p.src]?.name || '') }),
    audio: audioCtx,
    ahead,
    live,
    quiet: () => quiet({ keep: 'jam' }),
    styles: () => cfg().styles,
    // (The built-in set made in a worker of its own: not queued behind 聽's songs.)
    band: set => (jamMake ||= maker(new URL('./lib/maker.worker.mjs', import.meta.url))).jamBand(set),
    simple,
    take: (hits, beats, band, opts) => jamSong(hits, beats, band, opts)
  });
  const last = await loadLast();
  if (last) {
    sources = atRate(last);
    sr = sources[0].sr;
    split();
  }
  kitShown();
  showTab(firstTab());
  await lib.read();
  home?.refresh();
  $('loading').hidden = true;
  setTimeout(() => slimLibrary().catch(() => {}), 4000);
  const first = await q.start().catch(() => null);
  const theirs = decode(first?.payload || 'null');
  const before = encode(kept);
  kept = merge(kept, theirs);
  if (encode(kept) !== before) {
    settings = settingsOf(kept.settings, settings);
    applyLevel();
    showSettings();
    if (sources.length && kept.kits[print] && !edited.size) split();
  }
  keep(encode(kept) !== (first?.payload || ''));
}
q.on('active', live => live && keep());
if (!gated) boot();

// Opens without a connection: the kit registers the worker and has it keep every file loaded.
keepOffline();

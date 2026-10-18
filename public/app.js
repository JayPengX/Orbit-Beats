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
import { quadraSession, topActions, installGate, watchUpdates, keepOffline, tabBar } from '#kit/quadra.mjs';
import { h, sheet, menu, toast, toggle, empty } from '#kit/ui.mjs';
import { sectionTimes, sectionIndex, labelFits } from './lib/sections.mjs';
import { STYLES, SECTIONS, ROLES, MIN_BARS, NOTE_NAMES, keyOf, pieceChroma, parseWav, analyzeRecording, guessRole, batch, encodeWav, zipParts, demoRecording } from './engine.mjs';
import { atRate, splitAll, baseName } from './lib/sources.mjs';
import { fingerprint, decode, encode, merge, keptSettings, settingsOf, DEFAULTS, kitEntry, saveLast, loadLast, liked, saveSong, deleteSong, listSongs, renameSong } from './lib/kits.mjs';
import { voice, renderClip, DRUM_NAMES, INSTRUMENT_ROLE, INSTRUMENT_NAMES } from './lib/synth.mjs';
import { MIX, mixOf, STEMS } from './lib/mix.mjs';
import { STYLE_NAMES, SECTION_NAMES, ROLE_NAMES, BUS_NAMES, name } from './lib/names.mjs';
import { tapper } from './lib/tap.mjs';
import { download, shareFile, fileName } from './lib/download.mjs';
import { maker } from './lib/maker.mjs';
import { libraryView } from './lib/library.mjs';
import { mountStudio } from './lib/studio.mjs';
import { mountJam } from './lib/jamview.mjs';
import { W, en, lang } from './lib/lang.mjs';
import { shows, levelCss, GUIDE_MOODS, GUIDE_START, guideNext, guideStepNo, shouldGuide } from './lib/easy.mjs';
import { TERM_ORDER, EXAMPLES, term, info } from './lib/help.mjs';
import * as kitQ from '#kit/quadra.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MAX_SONGS = 30;
const MAX_BARS = 64;
// 情境: a mood picks the grooves (and how loose they're played) for you.
const MOODS = {
  all: { zh: '全部', en: 'All', styles: STYLES, humanize: 100 },
  chill: { zh: '放鬆', en: 'Chill', styles: ['half', 'hiphop', 'boombap', 'afro', 'amapiano', 'lofi', 'reggae'], humanize: 130 },
  hype: { zh: '熱血', en: 'Hype', styles: ['trap', 'drill', 'four', 'jersey', 'phonk', 'dnb', 'techno', 'baile'], humanize: 60 },
  groove: { zh: '律動', en: 'Groove', styles: ['house', 'afro', 'dembow', 'amapiano', 'broken', 'funk', 'garage'], humanize: 100 },
  classic: { zh: '經典', en: 'Classic', styles: ['boombap', 'hiphop', 'half', 'four', 'funk', 'reggae'], humanize: 140 }
};
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
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.3s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>',
  hearted: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.3s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18.5" cy="12" r="1.9"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>'
};
const TAB_ICONS = {
  make: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  studio: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 4v9M12 4v9M16 4v9M3 13h18"/>',
  jam: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  library: '<path d="M12 20.3s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/>'
};

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
  update();
  studio?.shown?.();
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

const TABS = ['make', 'studio', 'jam', 'library'];
const TAB_NAMES = { make: ['做歌', 'Make'], studio: ['樂器', 'Studio'], jam: ['即興', 'Jam'], library: ['歌單', 'Library'] };
const tabs = tabBar({
  tabs: TABS.map(id => ({ id, label: name(TAB_NAMES, id), icon: TAB_ICONS[id] })),
  onSelect: id => showTab(id),
  label: W('分頁', 'Tabs')
});
let tabNow = 'make';
function showTab(id) {
  tabs.select(id);
  tabNow = id;
  if (id === 'library') lib.draw();
  if (id === 'studio') studio?.shown();
  else studio?.hidden();
  if (id === 'jam') jam?.shown();
  else jam?.hidden();
}
const firstTab = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'make');

// ---- Settings (做歌) ----

$('styles').innerHTML = STYLES.map(s => `<button class="chip" type="button" data-style="${s}" aria-pressed="true">${esc(name(STYLE_NAMES, s))}</button>`).join('');
$('moods').innerHTML = Object.entries(MOODS)
  .map(([id, m]) => `<button class="chip" type="button" data-mood="${id}" aria-pressed="false">${esc(en ? m.en : m.zh)}</button>`)
  .join('');
const smartSwitch = toggle({ checked: settings.smart, label: W('依你的口味', 'Lean to your taste'), onChange: on => ((settings.smart = on), save(), tasteHint()) });
smartSwitch.id = 'smart';
$('smart-slot').replaceWith(smartSwitch);

// Which mood the styles are, if any.
const moodOf = () => Object.entries(MOODS).find(([, m]) => m.styles.length === settings.styles.length && m.styles.every(s => settings.styles.includes(s)))?.[0] || '';
function showSettings() {
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
const weights = () => (settings.smart && Object.keys(kept.taste || {}).length ? kept.taste : null);

// What's wrong with the settings, if anything.
function problem() {
  const { count, minBars, maxBars, styles, seed } = settings;
  if (!(count >= 1 && count <= MAX_SONGS)) return W(`首數要 1 到 ${MAX_SONGS}`, `Songs must be 1 to ${MAX_SONGS}`);
  if (!(minBars >= MIN_BARS && maxBars <= MAX_BARS)) return W(`長度要 ${MIN_BARS} 到 ${MAX_BARS} 小節`, `Length must be ${MIN_BARS} to ${MAX_BARS} bars`);
  if (minBars > maxBars) return W('最短比最長還長', 'Shortest length is over the longest');
  if (!styles.length) return W('至少選一種鼓的風格', 'Pick at least one drum style');
  if (seed && !(/^\d+$/.test(seed) && +seed <= 4294967295)) return W('種子要是整數', 'Seed must be a whole number');
  if (pieces.length && !roles.some(x => x === 'riff' || x === 'phrase')) return W('需要一段 Riff 或樂句：設一段，或到「樂器」做一段', 'Needs a riff or a phrase: set one, or make one in Studio');
  if (pieces.length && !(bpm >= 40 && bpm <= 250)) return W('速度要 40 到 250 BPM', 'Tempo must be 40 to 250 BPM');
  return '';
}
// Songs are an even number of bars when the range has one, plus ~1.5 s for the last hit to ring.
function lengthText() {
  const { minBars, maxBars } = settings;
  const secs = bars => Math.round((bars * 4 * 60) / bpm + 1.5);
  const lo = minBars % 2 && minBars < maxBars ? minBars + 1 : minBars;
  const hi = maxBars % 2 && maxBars > minBars ? maxBars - 1 : maxBars;
  if (!(minBars <= maxBars && minBars > 0)) return W('先填最短', 'Shortest first');
  return lo >= hi ? W(`每首約 ${secs(lo)} 秒`, `About ${secs(lo)} sec each`) : W(`每首約 ${secs(lo)}–${secs(hi)} 秒`, `About ${secs(lo)}–${secs(hi)} sec each`);
}
// The mixer in a few words: 混音 · 殘響 25%, or 原音.
function mixText() {
  const m = settings.mix;
  if (!m.on) return W('原音：不加工', 'Raw: as recorded');
  const bits = [m.reverb ? W(`殘響 ${Math.round(m.reverb * 100)}%`, `Room ${Math.round(m.reverb * 100)}%`) : '', m.delay ? W('回音', 'Echo') : '', m.pump ? W('側鏈', 'Pump') : '', m.fade ? W('淡出', 'Fade') : ''].filter(Boolean);
  return [W('開', 'On'), ...bits].join(' · ');
}
function update() {
  const { count } = settings;
  const bad = problem();
  $('more-hint').textContent = simple() ? `${lengthText()} · ${W('簡單模式', 'Simple')}` : `${lengthText()} · ${W('人味', 'Humanize')} ${settings.humanize}%`;
  $('mix-hint').textContent = mixText();
  $('count-down').disabled = busy || count <= 1;
  $('count-up').disabled = busy || count >= MAX_SONGS;
  $('error').textContent = bad;
  if (!busy) {
    $('go').textContent = !pieces.length ? W('先放片段，或到「樂器」做', 'Add pieces, or make some in Studio') : count >= 1 && count <= MAX_SONGS ? W(`做 ${count} 首`, `Make ${count} song${count === 1 ? '' : 's'}`) : W('做歌', 'Make songs');
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
  const numIn = (key, attrs) => {
    const i = h('input', { class: 'num short', type: 'number', inputmode: 'numeric', ...attrs });
    i.value = settings[key];
    i.addEventListener('input', () => {
      const v = i.value.trim();
      settings[key] = v === '' ? NaN : Math.round(+v);
      hint.textContent = lengthText();
      save();
      update();
    });
    return i;
  };
  const hint = h('small', { text: lengthText() });
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
      sheetRow(W('長度', 'Length'), hint, h('div', { class: 'ctl' }, [numIn('minBars', { min: 8, max: 64, 'aria-label': W('最短（小節）', 'Shortest, in bars') }), h('span', { class: 'unit', text: '–' }), numIn('maxBars', { min: 8, max: 64, 'aria-label': W('最長（小節）', 'Longest, in bars') }), h('span', { class: 'unit', text: W('小節', 'bars') })])),
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
  guideKit();
}
// The ways in, as the kit stands: 再加檔案 once there is one, 示範 only before.
function kitShown() {
  $('resplit').disabled = !sources.length;
  $('add').hidden = !sources.length;
  $('demo').hidden = sources.length > 0;
}
function clearPieces() {
  $('pieces').textContent = '';
  $('pieces-hint').hidden = true;
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
  pieces = splitAll(sources, { silenceDb: settings.silenceDb, minGap: settings.minGap });
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
  const files = sources.length > 1 ? W(` · ${sources.length} 個檔`, ` · ${sources.length} files`) : '';
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

function showPieces() {
  const B = (60 / bpm) * sr;
  const grid = $('pieces');
  const many = sources.length > 1;
  grid.textContent = '';
  pieces.forEach((p, i) => {
    const tile = document.createElement('div');
    const beats = p.L.length / B;
    const from = many ? baseName(sources[p.src]?.name) : '';
    tile.className = 'piece';
    tile.dataset.i = i;
    tile.title = from;
    tile.innerHTML = `<button type="button" aria-label="${esc(W(`試聽第 ${i + 1} 段，${beats.toFixed(1)} 拍`, `Play piece ${i + 1}, ${beats.toFixed(1)} beats`))}${from ? ` · ${esc(from)}` : ''}"><b>${i + 1}</b><span>${beats < 10 ? beats.toFixed(1) : Math.round(beats)} ${W('拍', 'beats')}</span></button>
      <select data-ctl="make-roles" aria-label="${esc(W(`第 ${i + 1} 段的角色`, `Piece ${i + 1} role`))}">${ROLES.map(x => `<option value="${x}"${x === roles[i] ? ' selected' : ''}>${esc(name(ROLE_NAMES, x))}</option>`).join('')}</select>`;
    tile.classList.toggle('off', roles[i] === 'off');
    // (A clip made on the instruments: marked ♪.)
    tile.classList.toggle('mine', String(sources[p.src]?.name || '').startsWith('♪'));
    grid.append(tile);
  });
  $('pieces-hint').hidden = !pieces.length;
  kitChanged();
  update();
}
// The kit, its tempo or its roles changed: the jam's pads follow.
function kitChanged() {
  jam?.kit();
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
let ctx = null;
const audioCtx = () => {
  ctx ||= new AudioContext();
  ctx.resume();
  return ctx;
};
// Everything that plays, stopped (before something else plays).
function quiet({ keep: but = '' } = {}) {
  stopPiece();
  stopExample();
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
const urls = new Map(); // a kept song's WAV as a URL, made when first played or shared
const lib = libraryView({
  panel: $('panel-library'),
  row: (song, list) => songRow(song, { lib: true, list }),
  play: song => playSong(song),
  goMake: () => showTab('make'),
  zip: list => zipOf(list, 'Orbit Beats · Library.zip')
});

// One row: play, its name and what it is, ♡ and ⋯; its sections under it (tap one to go there).
function songRow(song, { lib: inLib = false, list = null } = {}) {
  const li = h('li', { class: 'song', 'data-id': song.id });
  const info = song.info;
  const what = [timeText(info.seconds), info.style ? name(STYLE_NAMES, info.style) : W('即興', 'Jam'), keyName(info.key)].filter(Boolean).join(' · ');
  const plan = info.plan.map(([t, n]) => `${name(SECTION_NAMES, t)} ${n} ${W('小節', 'bars')}`).join(', ');
  const play = h('button', { class: 'play', type: 'button', 'aria-label': W(`播放 ${song.name}`, `Play ${song.name}`), html: ICON.play, onclick: () => toggleSong(song) });
  const heart = h('button', { class: `act heart${lib.has(song.id) ? ' kept' : ''}`, type: 'button', 'aria-label': W('收藏', 'Keep'), 'aria-pressed': String(lib.has(song.id)), html: lib.has(song.id) ? ICON.hearted : ICON.heart, onclick: () => keepSong(song) });
  const more = h('button', { class: 'act', type: 'button', 'aria-label': W('更多', 'More'), html: ICON.more, onclick: e => songMenu(song, e.currentTarget, inLib, list) });
  const bar = h('div', { class: 'plan', role: 'group', 'aria-label': plan });
  const total = info.plan.reduce((a, [, n]) => a + n, 0);
  const width = Math.min(innerWidth, 560) - 32 - 50; // the strip's room (row padding, play column)
  sectionTimes(info.plan, info.bpm || bpm).forEach((s, k) => {
    const label = name(SECTION_NAMES, s.type);
    const em = en ? label.length * 0.66 : label.length;
    bar.append(h('button', { type: 'button', class: 'sec', 'data-k': String(k), style: { flex: String(s.bars), background: `var(--${s.type})`, '--k': String(k) }, 'aria-label': `${label} ${s.bars} ${W('小節', 'bars')}`, text: labelFits(s.bars, total, width, em) ? label : '' }));
    holdable(bar.lastChild, () => seekBar(song, s.bar), () => loopSection(song, s.bar));
  });
  li.append(h('div', { class: 'line' }, [play, h('div', { class: 'what' }, [h('span', { class: 'name', text: song.name }), h('span', { class: 'info', text: what })]), heart, more]), bar);
  litAt = '';
  if (nowPlaying?.id === song.id) markRow(li, true);
  return li;
}
const rowsOf = id => [...document.querySelectorAll(`.song[data-id="${CSS.escape(id)}"]`)];
function markRow(li, on) {
  li.classList.toggle('now', on);
  const b = li.querySelector('.play');
  b.innerHTML = on && !audio.paused ? ICON.pause : ICON.play;
}
function refreshHearts(id) {
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
const recipeOf = (over = {}) => ({ print, minBars: settings.minBars, maxBars: settings.maxBars, styles: [...settings.styles], humanize: settings.humanize, mix: { ...settings.mix }, weights: weights(), detail: null, style: null, plan: null, ...over });
// One song made from a recipe: { id, name, info, data, url, bits, recipe }.
async function makeOne(recipe, title) {
  await kitToMaker();
  const bits = settings.bits;
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
// A batch of `count` songs (the guide's: one), in place of the last.
async function makeBatch(count = settings.count) {
  if (busy || problem() || !pieces.length) return;
  busy = true;
  quiet();
  for (const s of songs) URL.revokeObjectURL(s.url);
  songs = [];
  const { bits } = settings;
  const seed = settings.seed ? +settings.seed : Math.floor(Math.random() * 1e9);
  $('out').hidden = false;
  $('songs').textContent = '';
  $('zip').disabled = true;
  const lean = weights() ? W(` · 依你的口味`, ` · your taste`) : '';
  $('out-meta').textContent = `${bpm} BPM · ${W('種子', 'seed')} ${seed} · ${bits === 32 ? W('32 位元', '32-bit') : W('16 位元', '16-bit')} · ${settings.mix.on ? W('混音', 'mixed') : W('原音', 'raw')}${lean}`;
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
    }
  } catch (e) {
    toast(W(`做不出來：${e.message}`, `Couldn't make it: ${e.message}`), { tone: 'bad' });
  }
  $('busy').textContent = '';
  $('zip').disabled = !songs.length;
  busy = false;
  update();
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
  playSong(song);
}
const baseTitle = song => song.name.split(' · ')[0];
const nth = base => songs.filter(s => s.name.startsWith(`${base} · `)).length + 1;
// (In 歌單: into a list; shown in a list, out of it.)
function songMenu(song, anchor, inLib, list = null) {
  const can = heard && song.recipe?.print === print;
  const isJam = Boolean(song.recipe?.jam);
  menu(anchor, [
    ...(can && !isJam
      ? [
          { label: W('變奏一首', 'A variation'), icon: '✦', onClick: () => another(song, fromRecipe(song, { detail: Math.floor(Math.random() * 1e9) }), `${baseTitle(song)} · ${W('變奏', 'Var.')} ${nth(baseTitle(song))}`) },
          { label: W('換個鼓…', 'Another groove…'), icon: '♫', onClick: () => pickGroove(song) },
          ...(shows(settings.level, 'make-arrange') ? [{ label: W('編排…', 'Arrange…'), icon: '☰', onClick: () => arrange(song) }] : []),
          'divider'
        ]
      : []),
    { label: W('分享', 'Share'), icon: '↗', onClick: () => shareSong(song) },
    { label: W('下載 WAV', 'Download WAV'), icon: '↓', onClick: () => downloadSong(song) },
    ...(can && shows(settings.level, 'make-stems') ? [{ label: W('下載分軌', 'Download stems'), icon: '≡', onClick: () => stemsOf(song) }] : []),
    ...(can && shows(settings.level, 'make-midi') ? [{ label: W('匯出 MIDI', 'Export MIDI'), icon: '♪', onClick: () => midiOf(song) }] : []),
    ...(inLib
      ? [
          'divider',
          { label: W('加到清單…', 'Add to playlist…'), icon: '+', onClick: () => lib.pickList(song) },
          ...(list ? [{ label: W('從這個清單移除', 'Remove from this playlist'), icon: '−', onClick: () => lib.unlist(list, song.id) }] : []),
          { label: W('重新命名', 'Rename'), icon: '✎', onClick: () => renameKept(song) },
          { label: W('從歌單刪除', 'Remove from Library'), icon: '✕', danger: true, onClick: () => keepSong(song) }
        ]
      : [])
  ]);
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
    total.textContent = W(`${plan.length} 段 · ${bars} 小節 · 約 ${Math.round((bars * 4 * 60) / bpm)} 秒`, `${plan.length} section${plan.length === 1 ? '' : 's'} · ${bars} bars · about ${Math.round((bars * 4 * 60) / bpm)} sec`);
    list.replaceChildren(
      ...plan.map(([t, n], k) => {
        const typeSel = h('select', { class: 'num wide', 'aria-label': W('段落', 'Section') }, SECTIONS.map(x => h('option', { value: x, text: name(SECTION_NAMES, x) })));
        typeSel.value = t;
        typeSel.onchange = () => ((plan[k][0] = typeSel.value), draw());
        const lenSel = h('select', { class: 'num short', 'aria-label': W('小節', 'Bars') }, [1, 2, 3, 4, 6, 8, 12, 16].map(x => h('option', { value: String(x), text: String(x) })));
        lenSel.value = String(n);
        lenSel.onchange = () => ((plan[k][1] = +lenSel.value), draw());
        const btn = (txt, label, fn, off = false) => h('button', { class: 'mini', type: 'button', text: txt, 'aria-label': label, disabled: off, onclick: () => (fn(), draw()) });
        return h('li', {}, [
          h('i', { style: { background: `var(--${t})` } }),
          typeSel,
          lenSel,
          h('div', { class: 'ctl' }, [
            btn('↑', W('上移', 'Move up'), () => plan.splice(k - 1, 0, ...plan.splice(k, 1)), k === 0),
            btn('⧉', W('重複', 'Repeat'), () => plan.splice(k + 1, 0, [...plan[k]]), plan.length >= 24),
            btn('✕', W('拿掉', 'Remove'), () => plan.splice(k, 1), plan.length <= 1)
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

// ---- The player: one song at a time, over the tab bar ----

const audio = new Audio();
audio.preload = 'auto';
let nowPlaying = null;
// What happens at a song's end: on to the next in its list, the song again, or its section again.
const REPEATS = ['list', 'one', 'section'];
let repeat = 'list';
let loopAt = null; // { from, to } in seconds: the section looped
async function urlOf(song) {
  if (song.url) return song.url;
  if (!urls.has(song.id)) urls.set(song.id, URL.createObjectURL(song.wav));
  return urls.get(song.id);
}
async function playSong(song, at = 0) {
  quiet({ keep: 'song' });
  if (nowPlaying) for (const li of rowsOf(nowPlaying.id)) markRow(li, false);
  if (nowPlaying?.id !== song.id) loopAt = null;
  nowPlaying = song;
  audio.src = await urlOf(song);
  audio.currentTime = at;
  await audio.play().catch(() => {});
  $('player').hidden = false;
  document.body.classList.add('playing');
  $('player-name').textContent = song.name;
  paintPlayer();
  for (const li of rowsOf(song.id)) markRow(li, true);
}
// Where a bar starts in a song (its sections at the song's tempo).
const barTime = (song, bar) => (bar * 4 * 60) / (song.info.bpm || bpm);
function seekBar(song, bar) {
  const t = barTime(song, bar);
  if (repeat === 'section') loopAt = sectionAt(song, t);
  if (nowPlaying?.id === song.id) {
    audio.currentTime = t;
    if (audio.paused) audio.play().catch(() => {});
  } else playSong(song, t);
}
function toggleSong(song) {
  if (nowPlaying?.id === song.id) {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
    return;
  }
  playSong(song);
}
function stopSong() {
  if (!audio.paused) audio.pause();
}
function closePlayer() {
  audio.pause();
  if (nowPlaying) for (const li of rowsOf(nowPlaying.id)) markRow(li, false);
  nowPlaying = null;
  loopAt = null;
  $('player').hidden = true;
  document.body.classList.remove('playing');
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
// Loop one section: play it from its start and repeat it (the player's § mode).
function loopSection(song, bar) {
  repeat = 'section';
  seekBar(song, bar);
  paintRepeat();
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
  $('player-at').style.width = `${pct}%`;
  $('player-time').textContent = `${timeText(t)} / ${timeText(d)}`;
  paintSections();
  $('player-play').innerHTML = audio.paused ? ICON.play : ICON.pause;
  $('player-play').setAttribute('aria-label', audio.paused ? W('播放', 'Play') : W('暫停', 'Pause'));
  if (nowPlaying) for (const li of rowsOf(nowPlaying.id)) li.querySelector('.plan').style.setProperty('--at', `${pct}%`);
}
function paintRepeat() {
  const b = $('player-repeat');
  b.dataset.mode = repeat;
  b.setAttribute('aria-label', { list: W('播完接下一首', 'Then the next song'), one: W('單曲重複', 'Repeat this song'), section: W('重複這一段', 'Repeat this section') }[repeat]);
  b.innerHTML = ICON.repeat + (repeat === 'one' ? '<b>1</b>' : repeat === 'section' ? '<b>§</b>' : '');
}
$('player-repeat').onclick = () => {
  repeat = REPEATS[(REPEATS.indexOf(repeat) + 1) % REPEATS.length];
  loopAt = repeat === 'section' && nowPlaying ? sectionAt(nowPlaying, audio.currentTime) : null;
  audio.loop = repeat === 'one';
  paintRepeat();
  toast({ list: W('播完接下一首', 'Then the next song'), one: W('單曲重複', 'Repeating this song'), section: W('重複這一段', 'Repeating this section') }[repeat], { ms: 1400 });
};
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
  // On to the next in the same list (the batch or 歌單).
  const list = tabNow === 'library' ? lib.shown() : songs;
  const i = list.findIndex(s => s.id === nowPlaying?.id);
  if (i >= 0 && list[i + 1]) playSong(list[i + 1]);
});
$('player-play').onclick = () => (audio.paused ? audio.play().catch(() => {}) : audio.pause());
$('player-x').onclick = closePlayer;
// The bar: a tap or a drag along it moves the song there.
const seek = e => {
  const r = $('player-bar').getBoundingClientRect();
  const d = audio.duration || 0;
  if (d) audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d;
  if (repeat === 'section' && nowPlaying) loopAt = sectionAt(nowPlaying, audio.currentTime);
};
$('player-bar').addEventListener('pointerdown', e => {
  seek(e);
  const move = ev => seek(ev);
  const up = () => (removeEventListener('pointermove', move), removeEventListener('pointerup', up));
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
});
// The lock screen's controls and its title (iOS's Now Playing).
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler?.('play', () => audio.play());
  navigator.mediaSession.setActionHandler?.('pause', () => audio.pause());
  audio.addEventListener('play', () => {
    if (nowPlaying && globalThis.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({ title: nowPlaying.name, artist: 'Orbit Beats' });
  });
}

// ---- Keep, share, download ----

// ♡: into 歌單 (this phone) and your taste (the Pass); again, out of both.
async function keepSong(song) {
  if (lib.has(song.id)) {
    await deleteSong(song.id).catch(() => {});
    lib.remove(song.id);
    if (song.info.style) kept.taste = liked(kept.taste, song.info.style, -1);
    keep();
    refreshHearts(song.id);
    tasteHint();
    toast(W('已從歌單移除', 'Removed from Library'));
    return;
  }
  // (Kept as 16-bit: half a 32-bit float's room on the phone; the batch's own download keeps its format.)
  const wav = song.wav || new Blob([song.bits === 16 ? song.data : encodeWav(parseWav(song.data.buffer.slice(song.data.byteOffset, song.data.byteOffset + song.data.byteLength)), 16)], { type: 'audio/wav' });
  const rec = { id: song.id, name: song.name, at: Date.now(), info: song.info, bits: 16, wav, recipe: song.recipe };
  try {
    await saveSong(rec);
  } catch {
    return toast(W('存不下：手機空間不夠？', "Couldn't keep it: phone storage full?"), { tone: 'bad' });
  }
  navigator.storage?.persist?.().catch(() => {});
  lib.add(rec);
  if (song.info.style) kept.taste = liked(kept.taste, song.info.style, 1);
  keep();
  refreshHearts(song.id);
  tasteHint();
  toast(W('已存到歌單 ♡', 'Kept in Library ♡'));
}
const blobOf = song => song.wav || new Blob([song.data], { type: 'audio/wav' });
const downloadSong = song => download(blobOf(song), `${fileName(song.name)}.wav`);
// 分享: the WAV itself through the phone's share sheet (AirDrop, Messages, …); a browser that can't share files downloads it.
async function shareSong(song) {
  const how = await shareFile(blobOf(song), `${fileName(song.name)}.wav`, { title: song.name, text: W(`${song.name} · 用 Orbit Beats 做的`, `${song.name} · made with Orbit Beats`) });
  if (how === 'downloaded') toast(W('這個瀏覽器不能分享檔案：已下載', "This browser can't share files: downloaded"));
}
const busNames = () => Object.fromEntries(STEMS.map(b => [b, name(BUS_NAMES, b)]));
// 分軌: each bus a WAV (drums, hats, bass, melody, echo and room), in a zip, made again from the recipe.
async function stemsOf(song) {
  toast(W('正在做分軌…', 'Making the stems…'), { ms: 1600 });
  try {
    await kitToMaker();
    const zip = await make.stems(song.recipe, settings.bits, { title: fileName(song.name), names: busNames() });
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
    if (nowPlaying?.id === song.id) $('player-name').textContent = v;
  };
  input.addEventListener('keydown', e => e.key === 'Enter' && done());
  const s = sheet({
    title: W('重新命名', 'Rename'),
    closeLabel: W('關閉', 'Close'),
    body: h('div', { class: 'card sheet-card' }, [input, h('button', { class: 'primary', type: 'button', text: W('好', 'Done'), onclick: done })])
  });
  setTimeout(() => input.focus(), 60);
}
// Songs in a zip (stored: WAVs barely shrink), each its own name once.
async function zipOf(list, filename) {
  const seen = new Map();
  const files = [];
  for (const s of list) {
    const base = fileName(s.name);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    files.push({ name: `${base}${n > 1 ? ` (${n})` : ''}.wav`, data: s.data || new Uint8Array(await s.wav.arrayBuffer()) });
  }
  download(new Blob(zipParts(files), { type: 'application/zip' }), filename);
}
$('zip').onclick = () => zipOf(songs, 'Orbit Beats.zip');

// ---- 樂器, 即興 ----

let studio = null;
let jam = null;
// A song from the jam's take: into the batch, played.
async function jamSong(hits, beats) {
  try {
    await kitToMaker();
    const recipe = { print, jam: hits, plan: null, mix: { ...settings.mix }, at: Date.now() };
    const { info, wav } = await make.song(recipe, settings.bits);
    const at = new Date();
    const song = { id: recipeId(recipe), name: `${W('即興', 'Jam')} ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`, info, data: wav, url: URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })), bits: settings.bits, recipe };
    songs.unshift(song);
    $('out').hidden = false;
    $('songs').prepend(songRow(song));
    $('zip').disabled = false;
    toast(W(`已做好 ${Math.round(beats / 4)} 小節（在「做歌」）`, `Made ${Math.round(beats / 4)} bars (in Make)`));
    playSong(song);
  } catch (e) {
    toast(W(`做不出來：${e.message}`, `Couldn't make it: ${e.message}`), { tone: 'bad' });
  }
}


// ---- Words, help and the guided first song ----

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
            text: `▶ ${W(...(on ? ex.on : ex.off))}`,
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
// The ? at the top: 簡單 / 進階, the guide again, the words, and the full guide (the kit's, in the Quadra Pass sheet).
function helpSheet() {
  const s = sheet({
    title: W('說明', 'Help'),
    closeLabel: W('關閉', 'Close'),
    body: [
      h('div', { class: 'card sheet-card' }, [
        levelRow(),
        h('button', { class: 'more-row row', type: 'button', onclick: () => (s.close(), replayGuide()) }, [h('span', { class: 'label' }, [h('span', { text: W('新手引導', 'Getting started') }), h('small', { text: W('一步一步做出第一首歌', 'Your first song, step by step') })]), h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })]),
        h('button', { class: 'more-row row', type: 'button', onclick: () => (s.close(), kitQ.openHelp ? kitQ.openHelp(q) : (location.hash = 'help=beats')) }, [h('span', { class: 'label' }, [h('span', { text: W('完整說明', 'The full guide') }), h('small', { text: W('每個分頁、每個功能', 'Every tab and tool') })]), h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })])
      ]),
      h('div', { class: 'card sheet-card' }, [
        h('div', { class: 'head' }, [h('h2', { text: W('名詞小辭典', 'Music words') })]),
        h(
          'ul',
          { class: 'terms' },
          TERM_ORDER.map(id => h('li', {}, [h('button', { type: 'button', onclick: () => explain(id) }, [h('b', { text: term(id).name }), h('span', { text: term(id).hint }), h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })])]))
        )
      ])
    ]
  });
}

// The guided first song (lib/easy.mjs): a card on top of 做歌, one question at a time.
let guide = { step: null };
function guideTo(ev) {
  guide = guideNext(guide, ev);
  drawGuide();
}
function guideDone(ev = { type: 'done' }) {
  guideTo(ev);
  if (!settings.guided) {
    settings.guided = true;
    save();
  }
}
function replayGuide() {
  showTab('make');
  guideTo({ type: 'replay' });
  scrollTo({ top: 0, behavior: 'smooth' });
}
const choice = (icon, title, sub, onclick) => h('button', { class: 'choice', type: 'button', onclick }, [h('i', { 'aria-hidden': 'true', text: icon }), h('div', {}, [h('b', { text: title }), h('span', { text: sub })])]);
function drawGuide(note = '') {
  const card = $('guide');
  const step = guide.step;
  card.hidden = !step;
  if (step) $('panel-make').dataset.guide = step;
  else delete $('panel-make').dataset.guide;
  if (!step) return card.replaceChildren();
  const head = [
    h('button', { class: 'skip', type: 'button', text: step === 'tweak' ? W('完成', 'Done') : W('略過', 'Skip'), onclick: () => guideDone(step === 'tweak' ? { type: 'done' } : { type: 'skip' }) }),
    h('p', { class: 'step', text: W(`第一首歌 · ${guideStepNo(step)} / 4`, `Your first song · ${guideStepNo(step)} of 4`) })
  ];
  const back = h('button', { class: 'back', type: 'button', text: W('‹ 上一步', '‹ Back'), onclick: () => guideTo({ type: 'back' }) });
  const moodOf = id => GUIDE_MOODS.find(m => m.id === id);
  let body = [];
  if (step === 'mood')
    body = [
      h('h2', { text: W('想要什麼感覺？', 'What should it feel like?') }),
      h('p', { text: W('選一個，鼓的打法交給我們。', 'Pick one; we’ll pick the drums.') }),
      h('div', { class: 'choices' }, GUIDE_MOODS.map(m => choice(m.icon, W(m.zh[0], m.en[0]), W(m.zh[1], m.en[1]), () => pickMood(m.id))))
    ];
  else if (step === 'sound')
    body = [
      h('h2', { text: W('用什麼聲音？', 'Which sounds?') }),
      h('p', { text: note || (m => W(`${m.icon} ${m.zh[0]}，好。歌要用一些聲音來做：`, `${m.icon} ${m.en[0]}, got it. A song is made of a few sounds:`))(moodOf(guide.mood) || GUIDE_MOODS[0]) }),
      h('div', { class: 'choices one' }, [
        ...(pieces.length ? [choice('🎛️', W('用現在的片段', 'The pieces you have'), W(`已經放進 ${pieces.length} 段`, `${pieces.length} already in`), () => guideMake({ type: 'current' }))] : []),
        choice('🎁', W('用示範聲音', 'Use the demo sounds'), W('馬上就能聽', 'Ready right now'), () => guideMake({ type: 'demo' })),
        choice('🎤', W('用我的聲音', 'Use my own sounds'), W('錄一段，或選聲音檔', 'Record, or pick files'), () => guideTo({ type: 'mine' }))
      ]),
      back
    ];
  else if (step === 'mine')
    body = [
      h('h2', { text: W('放進你的聲音', 'Add your sounds') }),
      h('p', { text: W('在下面錄一段：拍手、敲桌子、哼一句都行，每個聲音之間停一下。或選手機裡的聲音檔。放好就自動做歌。', 'Record below: claps, taps on a table, a hummed line, with a short pause between sounds. Or pick sound files. The song is made as soon as they’re in.') }),
      back
    ];
  else if (step === 'making') body = [h('h2', {}, [h('span', { class: 'spin', 'aria-hidden': 'true', text: '◌' }), ' ', W('正在做你的歌…', 'Making your song…')]), h('p', { text: W('幾秒就好，做好會自動播放。', 'A few seconds; it plays when it’s ready.') })];
  else if (step === 'tweak') {
    const song = songs[0];
    body = [
      h('h2', { text: W('做好了，正在播！', 'Done, and playing!') }),
      h('p', { text: W('想試試別的樣子？點一個：', 'Want it a bit different? Try one:') }),
      h('div', { class: 'tweaks' }, [
        h('button', { class: 'q-btn tinted', type: 'button', text: W('✦ 變奏一首', '✦ A variation'), disabled: !song, onclick: () => song && another(song, fromRecipe(song, { detail: Math.floor(Math.random() * 1e9) }), `${baseTitle(song)} · ${W('變奏', 'Var.')} ${nth(baseTitle(song))}`) }),
        h('button', { class: 'q-btn tinted', type: 'button', text: W('♫ 換個鼓', '♫ Other drums'), disabled: !song, onclick: () => song && pickGroove(song) })
      ]),
      h('p', { class: 'keep-tip', text: W('喜歡就按歌右邊的 ♡，它會存到「歌單」。想多做幾首，按「完成」再按「做歌」。', 'Like it? Tap the ♡ beside it to keep it in Library. For more songs, tap Done, then Make.') })
    ];
  }
  card.replaceChildren(...head, ...body);
}
function pickMood(id) {
  const m = MOODS[id];
  settings.styles = [...m.styles];
  settings.humanize = m.humanize;
  settings.mood = id;
  save();
  showSettings();
  guideTo({ type: 'mood', mood: id });
}
// Sounds picked: the demo's (in place of none), the pieces in, or yours once they're in; then one song, played.
async function guideMake(ev) {
  guideTo(ev);
  if (ev.type === 'demo') await load(async () => [{ name: 'demo', ...demoRecording() }], false);
  if (guide.step !== 'making') return;
  const bad = !pieces.length ? W('沒有聽到聲音，再試一次', 'No sounds were heard; try again') : problem();
  if (bad) {
    guideTo({ type: 'failed' });
    return drawGuide(roles.some(r => r === 'riff' || r === 'phrase') || !pieces.length ? bad : W('你的聲音裡聽不出旋律：先用示範聲音，或在「樂器」做一段旋律。', 'No tune was heard in your sounds: use the demo, or make a melody in Studio.'));
  }
  await makeBatch(1);
  if (!songs.length) {
    guideTo({ type: 'failed' });
    return drawGuide(W('做不出來，換個聲音試試', 'Couldn’t make it; try other sounds'));
  }
  guideTo({ type: 'made' });
  playSong(songs[0]);
  scrollTo({ top: 0, behavior: 'smooth' });
}
// Your own sounds in, while the guide waits for them.
function guideKit() {
  if (guide.step === 'mine' && pieces.length) guideMake({ type: 'kit' });
}

// ---- Opening ----

const BUILD = document.querySelector('meta[name="build-version"]')?.content || 'dev';
window.__fxStarted = true;
const gated = installGate('beats', lang);
watchUpdates({ current: BUILD, key: 'orbitBeats', cachePrefix: 'beats-', busy: () => busy || Boolean(recorder) || !audio.paused || Boolean(studio?.playing()) || Boolean(jam?.playing()) || Boolean(document.querySelector('.q-sheet, dialog[open]')) });
topActions(q, { help: helpSheet });

// Everything drawn before the loading screen lifts: the settings, the last
// kit (this phone's) split and heard, the studio's clip; the Pass's settings,
// kits and taste merged in once it answers.
async function boot() {
  showSettings();
  paintRepeat();
  studio = mountStudio($('panel-studio'), {
    tempo: () => (pieces.length ? bpm : settings.studioBpm),
    setTempo: v => ((settings.studioBpm = v), save()),
    hasKit: () => pieces.length > 0,
    key: () => kitKey(),
    add: clip => addClip(clip),
    audio: audioCtx,
    quiet: () => quiet({ keep: 'studio' }),
    goMake: () => showTab('make')
  });
  jam = mountJam($('panel-jam'), {
    kit: () => ({ pieces, roles, bpm, sr, heard, print }),
    audio: audioCtx,
    quiet: () => quiet({ keep: 'jam' }),
    styles: () => settings.styles,
    take: (hits, beats) => jamSong(hits, beats),
    goMake: () => showTab('make')
  });
  const last = await loadLast();
  if (last) {
    sources = atRate(last);
    sr = sources[0].sr;
    split();
  }
  kitShown();
  showTab(firstTab());
  const keptSongs = await lib.read();
  if (shouldGuide({ guided: settings.guided, pieces: pieces.length, songs: songs.length, kept: keptSongs?.length || 0 })) guide = { ...GUIDE_START };
  drawGuide();
  $('loading').hidden = true;
  const first = await q.start().catch(() => null);
  const theirs = decode(first?.payload || 'null');
  const before = encode(kept);
  kept = merge(kept, theirs);
  if (encode(kept) !== before) {
    settings = settingsOf(kept.settings, settings);
    applyLevel();
    // (Another phone's settings say the guide's done or skipped: not asked again, unless it's under way.)
    if (settings.guided && guide.step === 'mood') guideTo({ type: 'skip' });
    showSettings();
    if (sources.length && kept.kits[print] && !edited.size) split();
  }
  keep(encode(kept) !== (first?.payload || ''));
}
q.on('active', live => live && keep());
if (!gated) boot();

// Opens without a connection: the kit registers the worker and has it keep every file loaded.
keepOffline();

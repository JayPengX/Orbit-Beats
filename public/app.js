// Orbit Beats (was Passion Beats): beat pieces in (one recording, a pack of
// sample files, a take from the microphone, or clips made on its own
// instruments), new songs out, made of the pieces exactly as recorded.
// Three tabs: 做歌 (the pieces, a mood, the songs), 樂器 (drums and notes
// to make clips with, lib/studio.mjs) and 歌單 (the songs kept, on this
// phone: played, shared, made again). An Orbit app: the kit draws the
// loading screen, the bar and the tab bar, keeps the app current and
// opening offline; the Quadra Pass keeps the settings, each kit's tempo and
// roles and the styles you keep (your taste); the sound never leaves the phone.
import { quadraSession, topActions, installGate, watchUpdates, keepOffline, tabBar } from '#kit/quadra.mjs';
import { h, sheet, menu, toast, toggle, empty } from '#kit/ui.mjs';
import { STYLES, SECTIONS, ROLES, MIN_BARS, NOTE_NAMES, keyOf, pieceChroma, parseWav, analyzeRecording, guessRole, loopBeats, makeSong, batch, encodeWav, zipParts, demoRecording } from './engine.mjs';
import { atRate, splitAll, baseName } from './lib/sources.mjs';
import { fingerprint, decode, encode, merge, keptSettings, kitEntry, saveLast, loadLast, liked, saveSong, deleteSong, listSongs, renameSong } from './lib/kits.mjs';
import { voice, renderClip, DRUM_NAMES, INSTRUMENT_ROLE, INSTRUMENT_NAMES } from './lib/synth.mjs';
import { mountStudio } from './lib/studio.mjs';
import { W, en, lang } from './lib/lang.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MAX_SONGS = 30;
const MAX_BARS = 64;
const STYLE_NAMES = { four: ['四拍', 'Four'], hiphop: ['嘻哈', 'Hip-hop'], trap: ['Trap', 'Trap'], half: ['半速', 'Half'], broken: ['碎拍', 'Broken'], house: ['House', 'House'], dembow: ['Dembow', 'Dembow'], afro: ['Afro', 'Afro'], drill: ['Drill', 'Drill'], boombap: ['Boom Bap', 'Boom Bap'], jersey: ['Jersey', 'Jersey'], amapiano: ['Amapiano', 'Amapiano'] };
const SECTION_NAMES = { intro: ['前奏', 'Intro'], verse: ['主歌', 'Verse'], hook: ['副歌', 'Hook'], break: ['間奏', 'Break'], bridge: ['橋段', 'Bridge'], outro: ['尾奏', 'Outro'] };
const ROLE_NAMES = { riff: ['Riff', 'Riff'], phrase: ['樂句', 'Phrase'], bass: ['貝斯', 'Bass'], hat: ['Hi-hat', 'Hats'], fill: ['過門', 'Fill'], kick: ['大鼓', 'Kick'], sub: ['808', '808'], snare: ['小鼓', 'Snare'], tick: ['Tick', 'Tick'], roll: ['滾奏', 'Roll'], off: ['不用', 'Not used'] };
const name = (table, k) => (table[k] ? table[k][en ? 1 : 0] : k);
// 情境: a mood picks the grooves (and how loose they're played) for you.
const MOODS = {
  all: { zh: '全部', en: 'All', styles: STYLES, humanize: 100 },
  chill: { zh: '放鬆', en: 'Chill', styles: ['half', 'hiphop', 'boombap', 'afro', 'amapiano'], humanize: 130 },
  hype: { zh: '熱血', en: 'Hype', styles: ['trap', 'drill', 'four', 'jersey'], humanize: 60 },
  groove: { zh: '律動', en: 'Groove', styles: ['house', 'afro', 'dembow', 'amapiano', 'broken'], humanize: 100 },
  classic: { zh: '經典', en: 'Classic', styles: ['boombap', 'hiphop', 'half', 'four'], humanize: 140 }
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
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18.5" cy="12" r="1.9"/></svg>'
};
const TAB_ICONS = {
  make: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  studio: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 4v9M12 4v9M16 4v9M3 13h18"/>',
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
let library = []; // the songs kept (歌單), newest first
let libraryRead = false;

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
const settings = { count: 8, minBars: 25, maxBars: 29, styles: [...STYLES], humanize: 100, seed: '', bits: 32, silenceDb: -90, minGap: 0.2, mood: 'all', smart: true, studioBpm: 120 };
const take = s => {
  for (const [k, v] of Object.entries(s || {})) if (k !== 'at' && k in settings) settings[k] = k === 'styles' ? STYLES.filter(x => v.includes(x)) : v;
  if (!settings.styles.length) settings.styles = [...STYLES];
};
take(kept.settings);

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

const TABS = ['make', 'studio', 'library'];
const TAB_NAMES = { make: ['做歌', 'Make'], studio: ['樂器', 'Studio'], library: ['歌單', 'Library'] };
const tabs = tabBar({
  tabs: TABS.map(id => ({ id, label: name(TAB_NAMES, id), icon: TAB_ICONS[id] })),
  onSelect: id => showTab(id),
  label: W('分頁', 'Tabs')
});
function showTab(id) {
  tabs.select(id);
  if (id === 'library') drawLibrary();
  if (id === 'studio') studio?.shown();
  else studio?.hidden();
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
function update() {
  const { count } = settings;
  const bad = problem();
  $('more-hint').textContent = `${lengthText()} · ${W('人味', 'Humanize')} ${settings.humanize}%`;
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
    settings[key] = +$(id).value;
    save();
  });

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
  const range = h('input', { type: 'range', min: 0, max: 200, step: 10, 'aria-label': W('人味', 'Humanize') });
  range.value = settings.humanize;
  const val = h('span', { class: 'val', text: `${settings.humanize}%` });
  range.addEventListener('input', () => {
    settings.humanize = +range.value;
    val.textContent = `${settings.humanize}%`;
    save();
    update();
  });
  const seed = h('input', { class: 'num wide', type: 'text', inputmode: 'numeric', placeholder: W('隨機', 'Random'), autocomplete: 'off', 'aria-label': W('種子', 'Seed') });
  seed.value = settings.seed;
  seed.addEventListener('input', () => {
    settings.seed = seed.value.trim();
    save();
    update();
  });
  const fmt = h(
    'div',
    { class: 'seg' },
    [
      [32, W('32 位元浮點', '32-bit float')],
      [16, W('16 位元', '16-bit')]
    ].map(([bits, label]) =>
      h('button', {
        type: 'button',
        'aria-pressed': String(settings.bits === bits),
        text: label,
        onclick: e => {
          settings.bits = bits;
          for (const b of fmt.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
          save();
        }
      })
    )
  );
  // (Each row its name and control on a line, what it does under them: a sheet is narrower than the page.)
  const row = (label, sub, ctl) => h('div', { class: 'stack sheet-row' }, [h('div', { class: 'sheet-line' }, [h('span', { class: 'label', text: label }), ctl]), sub]);
  sheet({
    title: W('更多設定', 'More settings'),
    closeLabel: W('關閉', 'Close'),
    body: h('div', { class: 'card sheet-card' }, [
      row(W('長度', 'Length'), hint, h('div', { class: 'ctl' }, [numIn('minBars', { min: 8, max: 64, 'aria-label': W('最短（小節）', 'Shortest, in bars') }), h('span', { class: 'unit', text: '–' }), numIn('maxBars', { min: 8, max: 64, 'aria-label': W('最長（小節）', 'Longest, in bars') }), h('span', { class: 'unit', text: W('小節', 'bars') })])),
      row(W('人味', 'Humanize'), h('small', { text: W('搖擺和時間的飄移', 'Swing and timing drift') }), h('div', { class: 'ctl' }, [range, val])),
      row(W('種子', 'Seed'), h('small', { text: W('同一個種子，同樣的歌', 'Same seed, same songs') }), seed),
      row(W('格式', 'Format'), h('small', { text: W('下載和分享的 WAV', 'The WAVs you save and share') }), fmt)
    ])
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
  const time = `${Math.floor(len / 60)}:${String(Math.round(len % 60)).padStart(2, '0')}`;
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
      <select aria-label="${esc(W(`第 ${i + 1} 段的角色`, `Piece ${i + 1} role`))}">${ROLES.map(x => `<option value="${x}"${x === roles[i] ? ' selected' : ''}>${esc(name(ROLE_NAMES, x))}</option>`).join('')}</select>`;
    tile.classList.toggle('off', roles[i] === 'off');
    // (A clip made on the instruments: marked ♪.)
    tile.classList.toggle('mine', String(sources[p.src]?.name || '').startsWith('♪'));
    grid.append(tile);
  });
  $('pieces-hint').hidden = !pieces.length;
  update();
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
  stopPiece();
  stopSong();
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

// One sound for the whole app (the pieces, the instruments): made on the first tap.
let ctx = null;
const audioCtx = () => {
  ctx ||= new AudioContext();
  ctx.resume();
  return ctx;
};
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
  update();
  keepKit();
});
$('pieces').addEventListener('click', e => {
  const btn = e.target.closest('.piece button');
  if (!btn) return;
  const again = playing && playing.btn === btn;
  stopPiece();
  if (again) return;
  stopSong();
  studio?.stop();
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
    if (used('hat') || used('rim')) shot(used('hat') ? 'hat' : 'rim', 'tick');
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

const timeText = s => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
// A song's id: its kit and how it was made (the same song made again is the same song).
const recipeId = r => `${r.print}:${r.seed}:${r.detail ?? ''}:${r.style ?? ''}`;
const isKept = id => library.some(s => s.id === id);
const urls = new Map(); // a kept song's WAV as a URL, made when first played or shared

// One row: play, its name and what it is, ♡ and ⋯; its sections under it.
function songRow(song, { lib = false } = {}) {
  const li = h('li', { class: 'song', 'data-id': song.id });
  const info = song.info;
  const what = [timeText(info.seconds), name(STYLE_NAMES, info.style), keyName(info.key)].filter(Boolean).join(' · ');
  const plan = info.plan.map(([t, n]) => `${name(SECTION_NAMES, t)} ${n} ${W('小節', 'bars')}`).join(', ');
  const play = h('button', { class: 'play', type: 'button', 'aria-label': W(`播放 ${song.name}`, `Play ${song.name}`), html: ICON.play, onclick: () => toggleSong(song) });
  const heart = h('button', { class: `act heart${isKept(song.id) ? ' kept' : ''}`, type: 'button', 'aria-label': W('收藏', 'Keep'), 'aria-pressed': String(isKept(song.id)), html: isKept(song.id) ? ICON.hearted : ICON.heart, onclick: () => keepSong(song) });
  const more = h('button', { class: 'act', type: 'button', 'aria-label': W('更多', 'More'), html: ICON.more, onclick: e => songMenu(song, e.currentTarget, lib) });
  li.append(
    h('div', { class: 'line' }, [play, h('div', { class: 'what' }, [h('span', { class: 'name', text: song.name }), h('span', { class: 'info', text: what })]), heart, more]),
    h('div', { class: 'plan', role: 'img', 'aria-label': plan, html: info.plan.map(([t, n], k) => `<i style="flex:${n};background:var(--${t});--k:${k}"></i>`).join('') })
  );
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
    const k = isKept(id);
    b.classList.toggle('kept', k);
    b.setAttribute('aria-pressed', String(k));
    b.innerHTML = k ? ICON.hearted : ICON.heart;
  }
}

// One song made: a batch's, a variation, another groove.
function makeOne({ seed, detail = null, style = null, title }) {
  const { minBars, maxBars, styles, humanize, bits } = settings;
  const analysis = { ...heard, bpm, loops: heard.analyses.map(a => loopBeats(a, bpm)) };
  const { audio: sound, info } = makeSong(pieces, sr, seed, { analysis, roles, minBars, maxBars, styles, humanize: humanize / 100, detail, style, weights: weights() });
  const data = encodeWav(sound, bits);
  const recipe = { print, seed, detail, style, minBars, maxBars, styles: [...styles], humanize };
  return { id: recipeId(recipe), name: title, info: { ...info, plan: info.plan }, data, url: URL.createObjectURL(new Blob([data], { type: 'audio/wav' })), bits, recipe };
}

$('go').onclick = async () => {
  if (busy || problem() || !pieces.length) return;
  busy = true;
  stopPiece();
  studio?.stop();
  stopSong();
  for (const s of songs) URL.revokeObjectURL(s.url);
  songs = [];
  const { count, bits } = settings;
  const seed = settings.seed ? +settings.seed : Math.floor(Math.random() * 1e9);
  $('out').hidden = false;
  $('songs').textContent = '';
  $('zip').disabled = true;
  const lean = weights() ? W(` · 依你的口味`, ` · your taste`) : '';
  $('out-meta').textContent = `${bpm} BPM · ${W('種子', 'seed')} ${seed} · ${bits === 32 ? W('32 位元', '32-bit') : W('16 位元', '16-bit')}${lean}`;
  $('go').disabled = true;
  update();
  const list = batch(count, seed);
  for (let k = 0; k < list.length; k++) {
    $('go').textContent = W(`第 ${k + 1} / ${list.length} 首…`, `Making ${k + 1} of ${list.length}…`);
    $('busy').textContent = W(`正在做第 ${k + 1} / ${list.length} 首…`, `Making song ${k + 1} of ${list.length}…`);
    if (k === 0) $('out').scrollIntoView({ behavior: 'smooth', block: 'start' });
    await new Promise(r => setTimeout(r, 0));
    const song = makeOne({ seed: list[k].seed, title: songTitle(list[k].seed) });
    songs.push(song);
    $('songs').append(songRow(song));
  }
  $('busy').textContent = '';
  $('zip').disabled = false;
  busy = false;
  update();
};

// A song made from another, in the batch right under it.
async function another(from, how) {
  if (!heard || from.recipe.print !== print) return toast(W('要用做這首歌的片段才能變化', 'Needs the pieces this song was made from'), { tone: 'bad' });
  const base = from.name.split(' · ')[0];
  const n = songs.filter(s => s.name.startsWith(`${base} · `)).length + 1;
  await new Promise(r => setTimeout(r, 0));
  const song =
    how === 'vary'
      ? makeOne({ seed: from.recipe.seed, detail: Math.floor(Math.random() * 1e9), style: from.recipe.style, title: `${base} · ${W('變奏', 'Var.')} ${n}` })
      : makeOne({ seed: from.recipe.seed, detail: from.recipe.detail, style: how, title: `${base} · ${name(STYLE_NAMES, how)}` });
  const at = songs.indexOf(from);
  if (at >= 0) songs.splice(at + 1, 0, song);
  else songs.unshift(song);
  $('out').hidden = false;
  const row = songRow(song);
  const anchor = $('songs').querySelector(`.song[data-id="${CSS.escape(from.id)}"]`);
  if (anchor) anchor.after(row);
  else $('songs').prepend(row);
  $('zip').disabled = false;
  if (!$('panel-make').hidden) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  else toast(W(`已做好：${song.name}（在「做歌」）`, `Made: ${song.name} (in Make)`));
  playSong(song);
}
function songMenu(song, anchor, lib) {
  const can = heard && song.recipe?.print === print;
  menu(anchor, [
    ...(can
      ? [
          { label: W('變奏一首', 'A variation'), icon: '✦', onClick: () => another(song, 'vary') },
          { label: W('換個鼓…', 'Another groove…'), icon: '♫', onClick: () => pickGroove(song) },
          'divider'
        ]
      : []),
    { label: W('分享', 'Share'), icon: '↗', onClick: () => shareSong(song) },
    { label: W('下載 WAV', 'Download WAV'), icon: '↓', onClick: () => downloadSong(song) },
    ...(lib
      ? [
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
              if (st !== song.info.style) another(song, st);
            }
          })
        )
      )
    ])
  });
}

// ---- The player: one song at a time, over the tab bar ----

const audio = new Audio();
audio.preload = 'auto';
let nowPlaying = null;
async function urlOf(song) {
  if (song.url) return song.url;
  if (!urls.has(song.id)) urls.set(song.id, URL.createObjectURL(song.wav));
  return urls.get(song.id);
}
async function playSong(song) {
  stopPiece();
  studio?.stop();
  if (nowPlaying) for (const li of rowsOf(nowPlaying.id)) markRow(li, false);
  nowPlaying = song;
  audio.src = await urlOf(song);
  audio.currentTime = 0;
  await audio.play().catch(() => {});
  $('player').hidden = false;
  document.body.classList.add('playing');
  $('player-name').textContent = song.name;
  paintPlayer();
  for (const li of rowsOf(song.id)) markRow(li, true);
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
  $('player').hidden = true;
  document.body.classList.remove('playing');
}
function paintPlayer() {
  const d = audio.duration || nowPlaying?.info?.seconds || 0;
  const t = audio.currentTime || 0;
  const pct = d ? Math.min(100, (t / d) * 100) : 0;
  $('player-at').style.width = `${pct}%`;
  $('player-time').textContent = `${timeText(t)} / ${timeText(d)}`;
  $('player-play').innerHTML = audio.paused ? ICON.play : ICON.pause;
  $('player-play').setAttribute('aria-label', audio.paused ? W('播放', 'Play') : W('暫停', 'Pause'));
  if (nowPlaying) for (const li of rowsOf(nowPlaying.id)) li.querySelector('.plan').style.setProperty('--at', `${pct}%`);
}
for (const ev of ['timeupdate', 'play', 'pause', 'loadedmetadata']) audio.addEventListener(ev, () => {
  paintPlayer();
  if (nowPlaying) for (const li of rowsOf(nowPlaying.id)) markRow(li, true);
});
audio.addEventListener('ended', () => {
  paintPlayer();
  // On to the next in the same list (the batch or 歌單).
  const list = !$('panel-library').hidden ? library : songs;
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
  if (isKept(song.id)) {
    await deleteSong(song.id).catch(() => {});
    library = library.filter(s => s.id !== song.id);
    kept.taste = liked(kept.taste, song.info.style, -1);
    keep();
    refreshHearts(song.id);
    tasteHint();
    toast(W('已從歌單移除', 'Removed from Library'));
    if (!$('panel-library').hidden) drawLibrary();
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
  library = [rec, ...library.filter(s => s.id !== rec.id)];
  kept.taste = liked(kept.taste, song.info.style, 1);
  keep();
  refreshHearts(song.id);
  tasteHint();
  toast(W('已存到歌單 ♡', 'Kept in Library ♡'));
}
const blobOf = song => song.wav || new Blob([song.data], { type: 'audio/wav' });
function downloadSong(song) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blobOf(song));
  a.download = `${song.name}.wav`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
// 分享: the WAV itself through the phone's share sheet (AirDrop, Messages, …);
// a browser that can't share files downloads it.
async function shareSong(song) {
  const file = new File([blobOf(song)], `${song.name}.wav`, { type: 'audio/wav' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: song.name, text: W(`${song.name} · 用 Orbit Beats 做的`, `${song.name} · made with Orbit Beats`) });
    } catch {}
    return;
  }
  downloadSong(song);
  toast(W('這個瀏覽器不能分享檔案：已下載', "This browser can't share files: downloaded"));
}
function renameKept(song) {
  const input = h('input', { class: 'num', type: 'text', style: { width: '100%', textAlign: 'left', padding: '0 12px' }, maxlength: 40, 'aria-label': W('歌名', 'Name') });
  input.value = song.name;
  const done = async () => {
    const v = input.value.trim().slice(0, 40);
    s.close();
    if (!v || v === song.name) return;
    await renameSong(song.id, v).catch(() => {});
    library = library.map(x => (x.id === song.id ? { ...x, name: v } : x));
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

$('zip').onclick = () => {
  const blob = new Blob(zipParts(songs.map(s => ({ name: `${s.name}.wav`, data: s.data }))), { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Orbit Beats.zip';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
};

// ---- 歌單 ----

async function readLibrary() {
  library = await listSongs().catch(() => []);
  libraryRead = true;
}
async function drawLibrary() {
  const panel = $('panel-library');
  if (!libraryRead) await readLibrary();
  const mb = library.reduce((s, x) => s + (x.wav?.size || 0), 0) / 1e6;
  const head = h('div', { class: 'lib-head' }, [h('h2', { text: W('歌單', 'Library') }), library.length ? h('small', { text: W(`${library.length} 首 · ${mb.toFixed(mb < 10 ? 1 : 0)} MB`, `${library.length} song${library.length === 1 ? '' : 's'} · ${mb.toFixed(mb < 10 ? 1 : 0)} MB`) }) : null]);
  if (!library.length) {
    panel.replaceChildren(
      head,
      h('section', { class: 'card' }, [
        empty({
          icon: '♡',
          title: W('還沒有收藏的歌', 'Nothing kept yet'),
          body: W('做好的歌按 ♡，就會存在這裡：離線也能聽、分享。你收藏的風格，下次做歌會多做一些。', 'Tap ♡ on a song to keep it here: play it offline, share it. The styles you keep come up more next time.'),
          action: h('button', { class: 'secondary', type: 'button', text: W('去做歌', 'Make songs'), onclick: () => showTab('make') })
        })
      ])
    );
    return;
  }
  const list = h('ol', { class: 'songs' }, library.map(s => songRow(s, { lib: true })));
  panel.replaceChildren(head, h('section', { class: 'card' }, [list]), h('footer', { text: W('存在這支手機上 · 不上傳', 'Kept on this phone · never uploaded') }));
}

// ---- 樂器 ----

let studio = null;

// ---- Opening ----

const BUILD = document.querySelector('meta[name="build-version"]')?.content || 'dev';
window.__fxStarted = true;
const gated = installGate('beats', lang);
watchUpdates({ current: BUILD, key: 'orbitBeats', cachePrefix: 'beats-', busy: () => busy || Boolean(recorder) || !audio.paused || Boolean(studio?.playing()) || Boolean(document.querySelector('.q-sheet, dialog[open]')) });
topActions(q);

// Everything drawn before the loading screen lifts: the settings, the last
// kit (this phone's) split and heard, the studio's clip; the Pass's settings,
// kits and taste merged in once it answers.
async function boot() {
  showSettings();
  studio = mountStudio($('panel-studio'), {
    tempo: () => (pieces.length ? bpm : settings.studioBpm),
    setTempo: v => ((settings.studioBpm = v), save()),
    hasKit: () => pieces.length > 0,
    key: () => kitKey(),
    add: clip => addClip(clip),
    audio: audioCtx,
    quiet: () => (stopPiece(), stopSong()),
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
  readLibrary();
  $('loading').hidden = true;
  const first = await q.start().catch(() => null);
  const theirs = decode(first?.payload || 'null');
  const before = encode(kept);
  kept = merge(kept, theirs);
  if (encode(kept) !== before) {
    take(kept.settings);
    showSettings();
    if (sources.length && kept.kits[print] && !edited.size) split();
  }
  keep(encode(kept) !== (first?.payload || ''));
}
q.on('active', live => live && keep());
if (!gated) boot();

// Opens without a connection: the kit registers the worker and has it keep every file loaded.
keepOffline();

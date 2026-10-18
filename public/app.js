// Orbit Beats (was Passion Beats): beat pieces in (one recording, a pack of
// sample files, or a take from the microphone), new songs out, made of the
// pieces exactly as recorded. An Orbit app: the kit draws the loading screen
// and the bar, keeps the app current and opening offline; the Quadra Pass
// keeps the settings and each kit's tempo and roles; the sound itself never
// leaves the phone (its last kit kept here, lib/kits.mjs).
import { quadraSession, topActions, installGate, watchUpdates, keepOffline } from '#kit/quadra.mjs';
import { STYLES, SECTIONS, ROLES, MIN_BARS, parseWav, analyzeRecording, guessRole, loopBeats, makeSong, batch, encodeWav, zipParts, demoRecording } from './engine.mjs';
import { atRate, splitAll, baseName } from './lib/sources.mjs';
import { fingerprint, decode, encode, merge, keptSettings, kitEntry, saveLast, loadLast } from './lib/kits.mjs';
import { W, en, lang } from './lib/lang.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MAX_SONGS = 30;
const MAX_BARS = 64;
const STYLE_NAMES = { four: ['四拍', 'Four'], hiphop: ['嘻哈', 'Hip-hop'], trap: ['Trap', 'Trap'], half: ['半速', 'Half'], broken: ['碎拍', 'Broken'], house: ['House', 'House'], dembow: ['Dembow', 'Dembow'], afro: ['Afro', 'Afro'] };
const SECTION_NAMES = { intro: ['前奏', 'Intro'], verse: ['主歌', 'Verse'], hook: ['副歌', 'Hook'], break: ['間奏', 'Break'], bridge: ['橋段', 'Bridge'], outro: ['尾奏', 'Outro'] };
const ROLE_NAMES = { riff: ['Riff', 'Riff'], phrase: ['樂句', 'Phrase'], bass: ['貝斯', 'Bass'], hat: ['Hi-hat', 'Hats'], fill: ['過門', 'Fill'], kick: ['大鼓', 'Kick'], sub: ['808', '808'], snare: ['小鼓', 'Snare'], tick: ['Tick', 'Tick'], roll: ['滾奏', 'Roll'], off: ['不用', 'Not used'] };
const name = (table, k) => (table[k] ? table[k][en ? 1 : 0] : k);

document.documentElement.lang = en ? 'en' : 'zh-Hant';
// The page's own words in English (each element's data-en; labels and placeholders too).
if (en) {
  for (const n of document.querySelectorAll('[data-en]')) n.textContent = n.dataset.en;
  for (const n of document.querySelectorAll('[data-en-label]')) n.setAttribute('aria-label', n.dataset.enLabel);
  for (const n of document.querySelectorAll('[data-en-placeholder]')) n.placeholder = n.dataset.enPlaceholder;
}

const q = quadraSession('beats', { lang });

let sources = []; // { name, sr, L, R }: the kit's files (or take), at one rate
let sr = 48000;
let pieces = [];
let roles = []; // one per piece: as heard, then as set
let edited = new Set(); // pieces whose role was set by hand
let heard = null; // analyzeRecording's: tempo and each piece's analysis
let bpm = 120; // as heard, then as set
let print = ''; // the kit's fingerprint
let songs = []; // { name, data, url }
let busy = false;

// ---- What's kept: this phone's copy of the Pass's payload, and the Pass's ----

const KEY = 'orbit-beats';
let kept = decode((() => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
})());
// (Passion Beats' settings, from before Orbit, carried over once.)
if (!kept.settings) {
  try {
    const old = JSON.parse(localStorage.getItem('passion-beats') || 'null');
    if (old) kept.settings = keptSettings(old, 1);
  } catch {}
}
const settings = { count: 20, minBars: 25, maxBars: 29, styles: [...STYLES], humanize: 100, seed: '', bits: 32, silenceDb: -90, minGap: 0.2 };
const take = s => {
  for (const [k, v] of Object.entries(s || {})) if (k !== 'at' && k in settings) settings[k] = k === 'styles' ? STYLES.filter(x => v.includes(x)) : v;
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

// ---- Settings ----

$('styles').innerHTML = STYLES.map(s => `<button class="chip" type="button" data-style="${s}" aria-pressed="true">${esc(name(STYLE_NAMES, s))}</button>`).join('');

function showSettings() {
  $('count').value = settings.count;
  $('min-bars').value = settings.minBars;
  $('max-bars').value = settings.maxBars;
  $('humanize').value = settings.humanize;
  $('humanize-val').textContent = `${settings.humanize}%`;
  $('seed').value = settings.seed;
  $('silence').value = settings.silenceDb;
  $('gap').value = settings.minGap;
  for (const b of $('styles').children) b.setAttribute('aria-pressed', settings.styles.includes(b.dataset.style));
  for (const b of $('format').children) b.setAttribute('aria-pressed', +b.dataset.bits === settings.bits);
  update();
}

// What's wrong with the settings, if anything.
function problem() {
  const { count, minBars, maxBars, styles, seed } = settings;
  if (!(count >= 1 && count <= MAX_SONGS)) return W(`首數要 1 到 ${MAX_SONGS}`, `Songs must be 1 to ${MAX_SONGS}`);
  if (!(minBars >= MIN_BARS && maxBars <= MAX_BARS)) return W(`長度要 ${MIN_BARS} 到 ${MAX_BARS} 小節`, `Length must be ${MIN_BARS} to ${MAX_BARS} bars`);
  if (minBars > maxBars) return W('最短比最長還長', 'Shortest length is over the longest');
  if (!styles.length) return W('至少選一種鼓的風格', 'Pick at least one drum style');
  if (seed && !(/^\d+$/.test(seed) && +seed <= 4294967295)) return W('種子要是整數', 'Seed must be a whole number');
  if (pieces.length && !roles.some(x => x === 'riff' || x === 'phrase')) return W('需要一段 Riff 或樂句：在片段裡設一段', 'Needs a riff or a phrase: set one under the pieces');
  if (pieces.length && !(bpm >= 40 && bpm <= 250)) return W('速度要 40 到 250 BPM', 'Tempo must be 40 to 250 BPM');
  return '';
}

function update() {
  const { count, minBars, maxBars } = settings;
  const bad = problem();
  // Songs are an even number of bars when the range has one, plus ~1.5 s for the last hit to ring.
  const secs = bars => Math.round((bars * 4 * 60) / bpm + 1.5);
  const lo = minBars % 2 && minBars < maxBars ? minBars + 1 : minBars;
  const hi = maxBars % 2 && maxBars > minBars ? maxBars - 1 : maxBars;
  $('length-hint').textContent = minBars <= maxBars && minBars > 0 ? (lo >= hi ? W(`每首約 ${secs(lo)} 秒`, `About ${secs(lo)} sec each`) : W(`每首約 ${secs(lo)}–${secs(hi)} 秒`, `About ${secs(lo)}–${secs(hi)} sec each`)) : W('先填最短', 'Shortest first');
  $('count-down').disabled = busy || count <= 1;
  $('count-up').disabled = busy || count >= MAX_SONGS;
  $('error').textContent = bad;
  if (!busy) {
    $('go').textContent = count >= 1 && count <= MAX_SONGS ? W(`做 ${count} 首`, `Make ${count} song${count === 1 ? '' : 's'}`) : W('做歌', 'Make songs');
    $('go').disabled = !!bad || !pieces.length;
  }
}

const num = (id, key, parse = Number) =>
  $(id).addEventListener('input', () => {
    const v = $(id).value.trim();
    settings[key] = v === '' ? NaN : parse(v);
    save();
    update();
  });
num('count', 'count', v => Math.round(+v));
num('min-bars', 'minBars', v => Math.round(+v));
num('max-bars', 'maxBars', v => Math.round(+v));
$('seed').addEventListener('input', () => {
  settings.seed = $('seed').value.trim();
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
$('humanize').addEventListener('input', () => {
  settings.humanize = +$('humanize').value;
  $('humanize-val').textContent = `${settings.humanize}%`;
  save();
});
$('styles').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const s = b.dataset.style;
  const on = settings.styles.includes(s);
  settings.styles = on ? settings.styles.filter(x => x !== s) : STYLES.filter(x => x === s || settings.styles.includes(x));
  b.setAttribute('aria-pressed', !on);
  save();
  update();
});
$('format').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  settings.bits = +b.dataset.bits;
  for (const x of $('format').children) x.setAttribute('aria-pressed', x === b);
  save();
});
for (const [id, key] of [['silence', 'silenceDb'], ['gap', 'minGap']])
  $(id).addEventListener('input', () => {
    settings[key] = +$(id).value;
    save();
  });

// ---- 1. The pieces ----

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
  $('resplit').disabled = false;
  $('add').hidden = false;
  split();
  saveLast(sources);
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
  const len = sources.reduce((s, x) => s + x.L.length, 0) / sr;
  const time = `${Math.floor(len / 60)}:${String(Math.round(len % 60)).padStart(2, '0')}`;
  const files = sources.length > 1 ? W(` · ${sources.length} 個檔`, ` · ${sources.length} files`) : '';
  if (!pieces.length) {
    status(`<b>${W('沒有切出片段', 'No pieces')}</b> · ${W('看「切片」', 'see Splitting')}`, 'bad');
    $('split-more').open = true;
  } else status(`<b>${W(`${pieces.length} 個片段`, `${pieces.length} piece${pieces.length === 1 ? '' : 's'}`)}</b>${files} · ${+(sr / 1000).toFixed(1)} kHz · ${time}`);
  showPieces();
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

// Tap a piece to hear it; tap again to stop.
let ctx = null;
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
  update();
  keepKit();
});
$('pieces').addEventListener('click', e => {
  const btn = e.target.closest('.piece button');
  if (!btn) return;
  const again = playing && playing.btn === btn;
  stopPiece();
  if (again) return;
  for (const a of document.querySelectorAll('audio')) a.pause();
  ctx ||= new AudioContext();
  const p = pieces[+btn.parentNode.dataset.i];
  const ab = ctx.createBuffer(2, p.L.length, sr);
  ab.copyToChannel(p.L, 0);
  ab.copyToChannel(p.R, 1);
  const src = ctx.createBufferSource();
  src.buffer = ab;
  src.connect(ctx.destination);
  src.onended = () => {
    if (playing && playing.src === src) stopPiece();
  };
  ctx.resume();
  src.start();
  btn.style.setProperty('--beat', `${60 / bpm}s`);
  btn.classList.add('on');
  playing = { src, btn };
});
document.addEventListener('play', () => stopPiece(), true);

// ---- 2 & 3. Making songs ----

$('legend').innerHTML = SECTIONS.map(s => `<span><i style="background:var(--${s})"></i>${esc(name(SECTION_NAMES, s))}</span>`).join('');

const DOWN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M6 11l6 6 6-6M5 20h14"/></svg>';

function songItem({ name: title, url, info, bits }) {
  const li = document.createElement('li');
  li.className = 'song';
  const s = Math.round(info.seconds);
  const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // Where overlaps add up past full scale: kept in 32-bit float, clipped in 16-bit.
  const over = info.peak > 1 ? ` · ${bits === 32 ? W('峰值', 'peaks') : W('削峰', 'clips')} +${(20 * Math.log10(info.peak)).toFixed(1)} dB` : '';
  const plan = info.plan.map(([t, n]) => `${name(SECTION_NAMES, t)} ${n} ${W('小節', 'bars')}`).join(', ');
  li.innerHTML = `
    <div class="line"><span class="name">${esc(title)}</span><a class="save" href="${url}" download="${esc(title)}.wav" aria-label="${esc(W(`下載 ${title}.wav`, `Download ${title}.wav`))}">${DOWN}</a></div>
    <div class="info">${time} · ${info.beats} ${W('拍', 'beats')} · ${esc(name(STYLE_NAMES, info.style))}${over}</div>
    <div class="plan" role="img" aria-label="${esc(plan)}">
      ${info.plan.map(([t, n], k) => `<i style="flex:${n};background:var(--${t});--k:${k}" title="${esc(`${name(SECTION_NAMES, t)} · ${n} ${W('小節', 'bars')}`)}"></i>`).join('')}
    </div>
    <audio controls preload="none" src="${url}"></audio>`;
  return li;
}

$('go').onclick = async () => {
  if (busy || problem() || !pieces.length) return;
  busy = true;
  stopPiece();
  for (const s of songs) URL.revokeObjectURL(s.url);
  songs = [];
  const { count, minBars, maxBars, styles, humanize, bits } = settings;
  const seed = settings.seed ? +settings.seed : Math.floor(Math.random() * 1e9);
  $('out').hidden = false;
  $('songs').textContent = '';
  $('zip').disabled = true;
  $('out-meta').textContent = `${W(`${count} 首`, `${count} song${count === 1 ? '' : 's'}`)} · ${bpm} BPM · ${W('種子', 'seed')} ${seed} · ${bits === 32 ? W('32 位元浮點', '32-bit float') : W('16 位元', '16-bit')} WAV`;
  $('go').disabled = true;
  update();
  const list = batch(count, seed);
  for (let k = 0; k < list.length; k++) {
    $('go').textContent = W(`第 ${k + 1} / ${list.length} 首…`, `Making ${k + 1} of ${list.length}…`);
    $('busy').textContent = W(`正在做第 ${k + 1} / ${list.length} 首…`, `Making song ${k + 1} of ${list.length}…`);
    if (k === 0) $('out').scrollIntoView({ behavior: 'smooth', block: 'start' });
    await new Promise(r => setTimeout(r, 0));
    const { name: title, seed: s } = list[k];
    const analysis = { ...heard, bpm, loops: heard.analyses.map(a => loopBeats(a, bpm)) };
    const { audio, info } = makeSong(pieces, sr, s, { analysis, roles, minBars, maxBars, styles, humanize: humanize / 100 });
    const data = encodeWav(audio, bits);
    const url = URL.createObjectURL(new Blob([data], { type: 'audio/wav' }));
    songs.push({ name: title, data, url });
    $('songs').append(songItem({ name: title, url, info, bits }));
  }
  $('busy').textContent = '';
  $('zip').disabled = false;
  busy = false;
  update();
};

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

// ---- Opening ----

const BUILD = document.querySelector('meta[name="build-version"]')?.content || 'dev';
window.__fxStarted = true;
const gated = installGate('beats', lang);
watchUpdates({ current: BUILD, key: 'orbitBeats', cachePrefix: 'beats-', busy: () => busy || Boolean(recorder) || Boolean(document.querySelector('.sheet, dialog[open]')) });
topActions(q);

// Everything drawn before the loading screen lifts: the settings, and the
// last kit (this phone's) split and heard; the Pass's settings and kits
// merged in once it answers (a kit's tempo and roles from another phone).
async function boot() {
  showSettings();
  const last = await loadLast();
  if (last) {
    sources = atRate(last);
    sr = sources[0].sr;
    $('resplit').disabled = false;
    $('add').hidden = false;
    split();
  }
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

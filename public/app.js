// Passion Beats page: pick a recording, split it, set things, make songs.
import { BPM, PIECES, STYLES, SECTIONS, MIN_BARS, parseWav, splitPieces, makeSong, batch, encodeWav, zipParts, demoRecording } from './engine.mjs';

const $ = id => document.getElementById(id);
const MAX_SONGS = 30, MAX_BARS = 64;
const STYLE_NAMES = { four: 'Four-on-floor', hiphop: 'Hip-hop', trap: 'Trap', half: 'Half-time', broken: 'Broken' };
const SECTION_NAMES = { intro: 'Intro', verse: 'Verse', hook: 'Hook', break: 'Break', bridge: 'Bridge', outro: 'Outro' };

let rec = null;        // { sr, L, R }
let pieces = [];
let songs = [];        // { name, data, url }
let busy = false;

// ---- Settings, remembered on this device ----

const settings = { count: 20, minBars: 25, maxBars: 29, styles: [...STYLES], humanize: 100, seed: '', bits: 16, silenceDb: -90, minGap: 0.2 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('passion-beats') || '{}')); } catch {}
const save = () => { try { localStorage.setItem('passion-beats', JSON.stringify(settings)); } catch {} };

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
  if (!(count >= 1 && count <= MAX_SONGS)) return `Songs must be 1 to ${MAX_SONGS}`;
  if (!(minBars >= MIN_BARS && maxBars <= MAX_BARS)) return `Length must be ${MIN_BARS} to ${MAX_BARS} bars`;
  if (minBars > maxBars) return 'Shortest length is over the longest';
  if (!styles.length) return 'Pick at least one drum style';
  if (seed && !(/^\d+$/.test(seed) && +seed <= 4294967295)) return 'Seed must be a whole number';
  return '';
}

function update() {
  const { count, minBars, maxBars } = settings, bad = problem();
  const secs = bars => Math.round(bars * 4 * 60 / BPM);
  $('length-hint').textContent = minBars <= maxBars && minBars > 0
    ? (minBars === maxBars ? `${secs(minBars)} sec each` : `${secs(minBars)}–${secs(maxBars)} sec each`) : 'Shortest first';
  $('count-down').disabled = busy || count <= 1;
  $('count-up').disabled = busy || count >= MAX_SONGS;
  $('error').textContent = bad;
  if (!busy) {
    $('go').textContent = count >= 1 && count <= MAX_SONGS ? `Make ${count} song${count === 1 ? '' : 's'}` : 'Make songs';
    $('go').disabled = !!bad || pieces.length < PIECES;
  }
}

const num = (id, key, parse = Number) => $(id).addEventListener('input', () => {
  const v = $(id).value.trim();
  settings[key] = v === '' ? NaN : parse(v); save(); update();
});
num('count', 'count', v => Math.round(+v));
num('min-bars', 'minBars', v => Math.round(+v));
num('max-bars', 'maxBars', v => Math.round(+v));
$('seed').addEventListener('input', () => { settings.seed = $('seed').value.trim(); save(); update(); });
const step = d => {
  settings.count = Math.min(MAX_SONGS, Math.max(1, (settings.count || 0) + d));
  $('count').value = settings.count; save(); update();
};
$('count-down').onclick = () => step(-1);
$('count-up').onclick = () => step(1);
$('humanize').addEventListener('input', () => {
  settings.humanize = +$('humanize').value; $('humanize-val').textContent = `${settings.humanize}%`; save();
});
$('styles').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const s = b.dataset.style, on = settings.styles.includes(s);
  settings.styles = on ? settings.styles.filter(x => x !== s) : STYLES.filter(x => x === s || settings.styles.includes(x));
  b.setAttribute('aria-pressed', !on); save(); update();
});
$('format').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  settings.bits = +b.dataset.bits;
  for (const x of $('format').children) x.setAttribute('aria-pressed', x === b);
  save();
});
for (const [id, key] of [['silence', 'silenceDb'], ['gap', 'minGap']])
  $(id).addEventListener('input', () => { settings[key] = +$(id).value; save(); });

// ---- 1. The recording ----

function status(text, kind = '') {
  $('status').hidden = false;
  $('status').className = `status ${kind}`;
  $('status-text').innerHTML = text;
}

async function readFile(file) {
  const buf = await file.arrayBuffer();
  const wav = parseWav(buf);
  if (wav) return wav;
  // Anything else the browser can play (m4a, mp3, …), decoded at 48 kHz.
  const ctx = new OfflineAudioContext(2, 1, 48000);
  const ab = await ctx.decodeAudioData(buf);
  const L = ab.getChannelData(0);
  return { sr: ab.sampleRate, L, R: ab.numberOfChannels > 1 ? ab.getChannelData(1) : L };
}

async function load(get) {
  stopPiece();
  status('<b>Reading…</b>', 'busy');
  $('pieces').textContent = ''; $('pieces-hint').hidden = true;
  pieces = []; update();
  await new Promise(r => setTimeout(r, 30));
  try { rec = await get(); } catch (e) {
    rec = null; $('resplit').disabled = true;
    return status("<b>Can't read that file</b> · try a WAV", 'bad');
  }
  $('resplit').disabled = false;
  split();
}

function split() {
  if (!rec) return;
  stopPiece();
  pieces = splitPieces(rec, { silenceDb: settings.silenceDb, minGap: settings.minGap });
  const B = 60 / BPM * rec.sr, len = rec.L.length / rec.sr;
  const time = `${Math.floor(len / 60)}:${String(Math.round(len % 60)).padStart(2, '0')}`;
  const khz = `${+(rec.sr / 1000).toFixed(1)} kHz`;
  if (pieces.length < PIECES) {
    status(`<b>${pieces.length} pieces</b> · needs ${PIECES} · see Splitting`, 'bad');
    $('split-more').open = true;
  } else if (pieces.length > PIECES) {
    status(`<b>${pieces.length} pieces</b> · using the first ${PIECES}`, 'bad');
    $('split-more').open = true;
  } else status(`<b>${PIECES} pieces</b> · ${khz} · ${time}`);
  const grid = $('pieces');
  grid.textContent = '';
  pieces.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'piece'; b.dataset.i = i;
    const beats = p.L.length / B;
    b.innerHTML = `<b>${i + 1}</b><span>${beats < 10 ? beats.toFixed(1) : Math.round(beats)}</span>`;
    b.setAttribute('aria-label', `Piece ${i + 1}, ${beats.toFixed(1)} beats`);
    grid.append(b);
  });
  $('pieces-hint').hidden = !pieces.length;
  update();
}

$('file').addEventListener('change', () => { const f = $('file').files[0]; if (f) load(() => readFile(f)); $('file').value = ''; });
$('demo').onclick = () => load(async () => demoRecording());
$('resplit').onclick = split;
const drop = $('drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => {
  e.preventDefault(); drop.classList.remove('over');
  const f = e.dataTransfer.files[0]; if (f) load(() => readFile(f));
});

// Tap a piece to hear it; tap again to stop.
let ctx = null, playing = null;
function stopPiece() {
  if (!playing) return;
  try { playing.src.stop(); } catch {}
  playing.btn.classList.remove('on'); playing = null;
}
$('pieces').addEventListener('click', e => {
  const btn = e.target.closest('.piece'); if (!btn) return;
  const again = playing && playing.btn === btn;
  stopPiece();
  if (again) return;
  for (const a of document.querySelectorAll('audio')) a.pause();
  ctx ||= new AudioContext();
  const p = pieces[+btn.dataset.i], ab = ctx.createBuffer(2, p.L.length, rec.sr);
  ab.copyToChannel(p.L, 0); ab.copyToChannel(p.R, 1);
  const src = ctx.createBufferSource(); src.buffer = ab; src.connect(ctx.destination);
  src.onended = () => { if (playing && playing.src === src) stopPiece(); };
  ctx.resume(); src.start();
  btn.classList.add('on'); playing = { src, btn };
});
document.addEventListener('play', () => stopPiece(), true);

// ---- 2 & 3. Making songs ----

$('legend').innerHTML = SECTIONS.map(s => `<span><i style="background:var(--${s})"></i>${SECTION_NAMES[s]}</span>`).join('');

const DOWN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M6 11l6 6 6-6M5 20h14"/></svg>';

function songItem({ name, url, info }) {
  const li = document.createElement('li');
  li.className = 'song';
  const s = Math.round(info.seconds), time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  li.innerHTML = `
    <div class="line"><span class="name">${name}</span><a class="save" href="${url}" download="${name}.wav" aria-label="Download ${name}.wav">${DOWN}</a></div>
    <div class="info">${time} · ${info.beats} beats · ${STYLE_NAMES[info.style]}</div>
    <div class="plan" role="img" aria-label="${info.plan.map(([t, n]) => `${t} ${n} bars`).join(', ')}">
      ${info.plan.map(([t, n]) => `<i style="flex:${n};background:var(--${t})" title="${SECTION_NAMES[t]} · ${n} bars"></i>`).join('')}
    </div>
    <audio controls preload="none" src="${url}"></audio>`;
  return li;
}

$('go').onclick = async () => {
  if (busy || problem() || pieces.length < PIECES) return;
  busy = true; stopPiece();
  for (const s of songs) URL.revokeObjectURL(s.url);
  songs = [];
  const { count, minBars, maxBars, styles, humanize, bits } = settings;
  const seed = settings.seed ? +settings.seed : Math.floor(Math.random() * 1e9);
  $('out').hidden = false; $('songs').textContent = ''; $('zip').disabled = true;
  $('out-meta').textContent = `${count} song${count === 1 ? '' : 's'} · seed ${seed} · ${bits === 32 ? '32-bit float' : '16-bit'} WAV`;
  $('go').disabled = true; update();
  const list = batch(count, seed);
  for (let k = 0; k < list.length; k++) {
    $('go').textContent = `Making ${k + 1} of ${list.length}…`;
    $('busy').textContent = `Making song ${k + 1} of ${list.length}…`;
    if (k === 0) $('out').scrollIntoView({ behavior: 'smooth', block: 'start' });
    await new Promise(r => setTimeout(r, 0));
    const { name, seed: s } = list[k];
    const { audio, info } = makeSong(pieces.slice(0, PIECES), rec.sr, s, { minBars, maxBars, styles, humanize: humanize / 100 });
    const data = encodeWav(audio, bits), url = URL.createObjectURL(new Blob([data], { type: 'audio/wav' }));
    songs.push({ name, data, url });
    $('songs').append(songItem({ name, url, info }));
  }
  $('busy').textContent = '';
  $('zip').disabled = false;
  busy = false; update();
};

$('zip').onclick = () => {
  const blob = new Blob(zipParts(songs.map(s => ({ name: `${s.name}.wav`, data: s.data }))), { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'Passion Beats.zip';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
};

showSettings();

// 即興 (Jam) on the screen: pads played live over a groove (lib/jam.mjs
// keeps the timing). Two sets of pads: 內建, the app's own band (lib/jamset.mjs:
// drums, hats, two bass lines, chords and melodies in one key, made in the
// worker from a groove and a seed; 🎲 a new one), so it plays the moment it
// opens; and 我的片段, the kit's pieces, once there are some. A loop pad
// starts on the next bar and goes round until tapped again (the set's
// four-bar parts in step with each other, one of a group at a time); a
// one-shot plays on the next step of the grid (16th, 8th, beat, or as
// tapped). ● records from the next bar; stopped, what was played (the groove
// too, when it's on) becomes a song (api.take, mixed like any other), in
// 做歌. A long press on a pad: its level, mute and choke (kept per kit on
// this phone, by the kit's fingerprint; the built-in set's as one).
import { h, segmented, sheet, toggle, toast } from './ui.mjs';
import { STYLES, NOTE_NAMES, drumKit, grooveHits, loopBeats } from '../engine.mjs';
import { Jam, GRIDS, PAD, padsOf, padOf, gainOf, chokeKey, withPads, trimTake, nextBar } from './jam.mjs';
import { coverSvg, coverUrl } from './cover.mjs';
import { clock } from './length.mjs';
import { SET_STYLES, BAND_ROLES, FAMILY, bandPads, specOf, setOf, diceSet } from './jamset.mjs';
import { ROLE_NAMES, STYLE_NAMES, name } from './names.mjs';
import { W } from './lang.mjs';
import { icon } from './icons.mjs';
import { speedText } from './playerview.mjs';
import { info, hintOf } from './help.mjs';
import { genreSheet } from './genres.mjs';

const AHEAD = 0.12; // seconds scheduled ahead of the clock
const LATE = 0.03; // a tap this late (s) still counts as the step it missed
const HOLD = 700; // ms a pad is held still to open its level (a drummer's held hit is shorter)
const PADS = 'orbit-beats.pads.v1'; // { <print>: { at, pads: { <piece>: { level, mute, choke } } } }
const SET = 'orbit-beats.jam-set'; // the built-in set last played: { seed, style }
const BUILT_IN = 'builtin'; // the built-in set's pads, kept as one kit's
export const setCover = (set, bpm = 110) => coverUrl(coverSvg({ seed: set.seed, style: set.style, bpm, text: false }));
// 簡單's board: four columns of the band, two choices each (the drums by what the hats do).
const COLS = [
  ['drum', ['鼓', 'Drums'], null],
  ['bass', ['貝斯', 'Bass'], [6, 7]],
  ['chords', ['和弦', 'Chords'], [0, 1]],
  ['melody', ['旋律', 'Melody'], [2, 3]]
];
const DRUM_TILES = [
  ['basic', ['基本', 'Basic']],
  ['busy', ['熱鬧', 'Busy']]
];
const HIT_PADS = [11, 14, 15, 17];
const HIT_KIND = { 11: 'kick', 14: 'clap', 15: 'hat', 17: 'fill' }; // each hit its own colour
// The second bass and the second melody, by how they play.
const CHARACTER = { 7: ['跳躍貝斯', 'Bouncy bass'], 3: ['副旋律', 'Counter-melody'] };
const DRUM_LOOPS = [8, 9, 10];
// Every kit's pads on this phone. (A read that fails isn't "none": nothing is saved over it.)
function readPads() {
  try {
    const v = JSON.parse(localStorage.getItem(PADS) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return null;
  }
}
export function readSet() {
  try {
    return setOf(JSON.parse(localStorage.getItem(SET) || 'null') || { seed: 7, style: SET_STYLES[0] });
  } catch {
    return setOf(null);
  }
}
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// api: { kit(), audio(), quiet(), styles(), simple(), band(set) -> the set's { pieces, roles, sr }, take(hits, beats, set|null, { keep }) }
export function mountJam(panel, api) {
  const jam = new Jam();
  let running = false;
  let t0 = 0; // the audio clock's time at beat 0
  let upTo = 0; // beats scheduled so far
  let timer = 0;
  let raf = 0;
  let grid = 16;
  let style = null; // my clips' groove
  let bpm = 120;
  let pads = [];
  let cur = null; // what the pads play: { band, roles, bpm, print, heard }
  let buffers = []; // each piece as an AudioBuffer, at the phone's rate
  let kitOf = null; // the pieces the buffers were made of
  const hits = new Map(); // pad element by piece, for the flash
  let sets = {}; // piece -> its pad's level, mute and choke (this kit's)
  let setsOf = ''; // the kit they're for
  const voices = new Map(); // choke group -> its last hits
  const looping = new Map(); // piece -> its loop's latest sound (cut where the loop stops)
  const live = new Set(); // every sound still playing (faded out on ■)
  let pick = null; // 'band' / 'mine' as switched (none yet: my clips when there are some)
  let set = readSet(); // the built-in set: { seed, style }
  let sp = specOf(set); // and its tempo, key and instruments
  let band = null; // its sound once made: { id, pieces, roles, sr }
  let making = ''; // the set being made
  let waiting = false; // ▶ pressed before the set's sound was ready
  let drumMode = 'basic'; // 簡單's drums column: 'basic', 'busy' or '' (off)
  let want = new Set(); // the tiles that were on at ■, back on at ▶
  let prevSet = null; // the set before the last change, for ↶
  let undoTimer = 0;
  let keptUntil = 0; // ✓ 已存 shows till then
  const tileEls = new Map(); // 'basic' / 'busy' -> the drums column's tiles
  const simple = () => api.simple?.() !== false;
  const easyBand = () => simple() && usingBand();
  jam.pad = i => sets[i] || PAD;

  const hasClips = () => api.kit().pieces.length > 0;
  const usingBand = () => !hasClips() || pick === 'band';
  const setId = () => `${set.seed}:${set.style}`;
  // The sound the pads play now (null: the set is still being made).
  const sound = () => (cur?.band ? (band?.id === setId() ? band : null) : api.kit());

  // ---- Drawing ----
  const playBtn = h('button', { class: 'q-btn tinted jam-play', type: 'button' });
  const keepBtn = h('button', { class: 'q-btn jam-keep', type: 'button', 'data-ctl': 'jam-keep', hidden: true }, [h('span', { class: 'lab' }), h('span', { class: 't' })]);
  const keepLab = keepBtn.querySelector('.lab');
  const keepTime = keepBtn.querySelector('.t');
  const recBtn = h('button', { class: 'q-btn tinted jam-rec', type: 'button', 'data-ctl': 'jam-rec' });
  const stopAllBtn = h('button', { class: 'q-btn plain', type: 'button', 'data-ctl': 'jam-rec', text: W('全停', 'All off') });
  // The bar as a thin ring round the cover: a quarter more with every beat.
  const ringArc = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  for (const [k, v] of Object.entries({ x: 1.5, y: 1.5, width: 61, height: 61, rx: 18, pathLength: 100 })) ringArc.setAttribute(k, String(v));
  const ring = h('span', { class: 'jam-ring', 'aria-hidden': 'true' });
  ring.innerHTML = '<svg viewBox="0 0 64 64"><rect class="trk" x="1.5" y="1.5" width="61" height="61" rx="18"/></svg>';
  ringArc.setAttribute('class', 'arc');
  ring.firstChild.append(ringArc);
  function ringTo(k) {
    // (A beat's quarter fills over the beat; the bar's first starts over from nothing.)
    ringArc.style.opacity = k < 0 ? '0' : '1';
    if (k <= 0) {
      ringArc.style.transition = 'none';
      ringArc.style.strokeDashoffset = '100';
      if (k < 0) return;
      void ringArc.getBoundingClientRect();
    }
    ringArc.style.transition = calm() ? 'none' : `stroke-dashoffset ${60 / bpm}s linear`;
    ringArc.style.strokeDashoffset = String(100 - (k + 1) * 25);
  }
  const padGrid = h('div', { class: 'pads', 'data-ctl': 'jam-pads' });
  const tileGrid = h('div', { class: 'jam-tiles', 'data-ctl': 'jam-band' });
  const hitRow = h('div', { class: 'jam-hits', 'data-ctl': 'jam-band' });
  const boards = [padGrid, tileGrid, hitRow];
  const styleSel = h('select', { class: 'num wide', 'aria-label': W('節奏', 'Groove') });
  const grooveSw = h('div', { class: 'seg' });
  const gridSeg = segmented(
    [
      { id: '16', label: '1/16' },
      { id: '8', label: '1/8' },
      { id: '4', label: W('拍', 'Beat') },
      { id: '0', label: W('自由', 'Free') }
    ],
    { value: '16', label: W('對齊', 'Snap'), onChange: id => (grid = +id) }
  );
  // 內建 / 我的片段: only once there are pieces; two icons.
  const srcSeg = segmented(
    [
      { id: 'band', label: h('span', { html: icon('grid'), 'aria-label': W('內建', 'Built-in') }) },
      { id: 'mine', label: h('span', { html: icon('mic'), 'aria-label': W('我的片段', 'My clips') }) }
    ],
    { value: 'band', label: W('打擊墊', 'Pads'), onChange: id => ((pick = id), stop(), draw()) }
  );
  srcSeg.classList.add('jam-src');
  // The set card: its cover and groove (a tap opens the grooves), the bar's four beats, ↶, 🎲.
  const coverImg = h('img', { alt: '', width: 56, height: 56 });
  const coverBtn = h('button', { class: 'jam-cover', type: 'button', 'aria-label': W('風格', 'Style'), onclick: () => styleSheet() }, [coverImg]);
  const nameEl = h('span', { class: 'nm' });
  const nameBtn = h('button', { class: 'jam-name', type: 'button', 'aria-label': W('風格', 'Style'), onclick: () => styleSheet() }, [nameEl, h('span', { class: 'chev', html: icon('down') })]);
  const dice = h('button', { class: 'jam-dice', type: 'button', 'aria-label': W('隨機換一組', 'A random new set'), html: icon('dice'), onclick: () => changeSet(diceSet(set)) });
  const undoSet = h('button', { class: 'jam-undo ghost', type: 'button', disabled: true, 'aria-label': W('回到上一組', 'Back to the last set'), html: icon('undo'), onclick: () => prevSet && changeSet(prevSet, { back: true }) });
  const setRow = h('div', { class: 'jam-set' }, [h('span', { class: 'jam-art' }, [coverBtn, ring]), h('div', { class: 'jam-id' }, [nameBtn]), undoSet, dice, srcSeg]);
  const note = h('p', { class: 'studio-note', 'data-ctl': 'jam-note' });
  // 你的即興: the jams kept in 資料庫, latest first, as covers; a tap plays the kept song.
  const takesRow = h('div', { class: 'jam-takes-row' });
  const takesRail = h('section', { class: 'jam-takes', hidden: true }, [h('h3', { text: W('你的即興', 'Your jams') }), takesRow]);
  function paintTakes() {
    const list = api.takes?.() || [];
    takesRail.hidden = !list.length;
    takesRow.replaceChildren(
      ...list.map(t =>
        h('button', { class: 'jam-take', type: 'button', 'aria-label': `${t.name} ${clock(t.secs)}`, onclick: () => t.play() }, [
          h('img', { alt: '', width: 120, height: 120, src: t.cover }),
          h('b', { text: t.name }),
          h('small', { text: clock(t.secs) })
        ])
      )
    );
  }
  // A row: its name (and the word's ⓘ), a line under it, its control; only: which of 簡單 / 進階 shows it.
  const row = (label, sub, ctl, { only = null, term = null } = {}) => h('div', { class: 'row', 'data-ctl': only }, [h('div', { class: 'label' }, [h('span', {}, [label, ...(term ? [' ', info(term)] : [])]), sub ? h('small', { text: sub }) : null]), ctl]);
  const grooveSub = h('small', {});
  const grooveRow = row(W('鼓', 'Groove'), null, h('div', { class: 'ctl' }, [grooveSw, styleSel]), { only: 'jam-groove', term: 'groove' });
  grooveRow.querySelector('.label').append(grooveSub);
  const body = h('section', { class: 'card jam' }, [
    setRow,
    tileGrid,
    hitRow,
    padGrid,
    h('div', { class: 'jam-bar' }, [playBtn, keepBtn, recBtn, stopAllBtn]),
    grooveRow,
    h('div', { class: 'stack', 'data-ctl': 'jam-snap' }, [h('div', { class: 'label' }, [h('span', {}, [W('對齊', 'Snap'), ' ', info('snap')]), h('small', { text: hintOf('snap') })]), gridSeg]),
    note
  ]);
  const loading = on => boards.forEach(g => g.classList.toggle('loading', on));

  function draw() {
    const mine = !usingBand();
    srcSeg.hidden = !hasClips();
    srcSeg.set?.(mine ? 'mine' : 'band');
    setRow.classList.toggle('mine', mine);
    styleSel.hidden = !mine;
    if (simple() && !mine) jam.groove = drumMode !== '';
    grooveSub.textContent = mine ? W('用你的鼓打的節奏', 'Played on your drums') : W('跟著這組的風格', 'In the set’s style');
    if (!panel.contains(body)) panel.replaceChildren(body, takesRail);
    paintTakes();
    drawPads();
    paintSet();
    paintTransport();
    if (!mine && !panel.hidden) makeBand();
  }
  function drawPads() {
    if (usingBand()) {
      cur = { band: true, roles: BAND_ROLES, bpm: sp.bpm, print: BUILT_IN };
      pads = bandPads(sp);
    } else {
      const k = api.kit();
      cur = { band: false, roles: k.roles, bpm: k.bpm, print: k.print, heard: k.heard };
      const loops = k.heard ? k.heard.analyses.map(a => loopBeats(a, k.bpm)) : [];
      // (A clip taken from a song keeps its own name on the pad: ♪ title · section.)
      const named = i => (k.names?.[i]?.startsWith('♪') ? k.names[i].replace(/^♪\s*/, '') : '');
      pads = padsOf(k.roles, loops).map(p => ({ ...p, fam: FAMILY[p.role] || 'drum', ...(named(p.i) ? { name: [named(p.i), named(p.i)], sub: null, clip: true } : {}) }));
    }
    bpm = cur.bpm;
    if (setsOf !== cur.print) {
      const all = readPads();
      sets = Object.fromEntries(Object.entries(all?.[cur.print]?.pads || {}).map(([i, p]) => [i, padOf(p)]));
      setsOf = cur.print;
    }
    hits.clear();
    tileEls.clear();
    const easy = easyBand();
    tileGrid.hidden = hitRow.hidden = !easy;
    padGrid.hidden = easy;
    // (The 16 pads are 進階's with the built-in set; my clips' pads show at both levels.)
    if (usingBand()) padGrid.dataset.ctl = 'jam-pads';
    else delete padGrid.dataset.ctl;
    if (easy) {
      drawBoard();
      padGrid.replaceChildren();
    } else {
      tileGrid.replaceChildren();
      hitRow.replaceChildren();
      padGrid.replaceChildren(
        ...pads.map(p => {
          const big = p.name ? W(...p.name) : String(p.i + 1);
          const small = p.name ? (p.sub ? W(...p.sub) : '') : name(ROLE_NAMES, p.role);
          const b = h('button', { class: `jam-pad${p.loop ? ' loop' : ''}`, type: 'button', 'data-i': String(p.i), 'data-fam': p.fam, 'aria-label': `${p.name ? big : `${small} ${big}`}${p.loop ? W('（循環）', ' (loop)') : ''}` }, [
            // (A clip from a song: the note icon, not a ♪ typed in its name.)
            p.clip ? h('b', { class: 'clip' }, [h('i', { class: 'clip-ico', 'aria-hidden': 'true', html: icon('note') }), h('span', { text: big })]) : h('b', { text: big }),
            small ? h('small', { text: small }) : null,
            p.loop ? h('i', { class: 'mark', 'aria-hidden': 'true', html: p.name ? icon('loop') : `${icon('loop')}${p.beats}` }) : null,
            h('i', { class: 'lvl', 'aria-hidden': 'true' })
          ]);
          hits.set(p.i, b);
          paintPad(p.i);
          return b;
        })
      );
    }
    loading(!sound());
    // My clips' groove: the styles picked in 做歌 (the first, until another is picked).
    if (!cur.band) {
      const styles = api.styles().length ? api.styles() : STYLES;
      if (!styles.includes(style)) style = styles[0];
      styleSel.replaceChildren(...styles.map(s => h('option', { value: s, text: name(STYLE_NAMES, s) })));
      styleSel.value = style;
    }
    setBacking();
    paintGroove();
    note.replaceChildren(h('span', { text: speedText(bpm) }));
  }
  // 簡單's board: a column a part of the band (one lit at a time), then the hits as round pads.
  function drawBoard() {
    const byI = Object.fromEntries(pads.map(p => [p.i, p]));
    const tile = (fam, key, big, { two = false, ids = [] } = {}) => {
      const b = h('button', { class: 'jam-tile', type: 'button', 'data-t': key, 'data-fam': fam, 'aria-label': big }, [h('i', { class: 'glow', 'aria-hidden': 'true' }), h('b', { text: big }), two ? h('em', { class: 'two', 'aria-hidden': 'true', text: '2' }) : null, h('i', { class: 'lvl', 'aria-hidden': 'true' })]);
      return b;
    };
    const heads = COLS.map(([fam, label]) => h('span', { class: 'col-head', 'data-fam': fam }, [h('i'), h('span', { text: W(...label) })]));
    const first = [];
    const second = [];
    for (const [fam, , idx] of COLS) {
      if (!idx) {
        const [a1, a2] = DRUM_TILES.map(([m, label]) => {
          const t = tile(fam, `d:${m}`, W(...label));
          tileEls.set(m, t);
          return t;
        });
        first.push(a1);
        second.push(a2);
        continue;
      }
      const [p1, p2] = idx.map(i => byI[i]);
      // (A pad with no instrument of its own to name: its character, not "貝斯 2".)
      const text = p => (p.sub ? W(...p.sub) : CHARACTER[p.i] ? W(...CHARACTER[p.i]) : W(...p.name));
      const same = text(p1) === text(p2);
      [p1, p2].forEach((p, k) => {
        const t = tile(fam, String(p.i), text(p), { two: k === 1 && same });
        hits.set(p.i, t);
        paintPad(p.i);
        (k ? second : first).push(t);
      });
    }
    tileGrid.replaceChildren(...heads, ...first, ...second);
    hitRow.replaceChildren(
      ...HIT_PADS.map(i => {
        const p = byI[i];
        const big = W(...p.name);
        const b = h('button', { class: 'jam-hit', type: 'button', 'data-i': String(i), 'data-fam': 'drum', 'data-hit': HIT_KIND[i], 'aria-label': big }, [h('b', { text: big }), h('i', { class: 'lvl', 'aria-hidden': 'true' })]);
        hits.set(i, b);
        paintPad(i);
        return b;
      })
    );
    paintIdle();
  }
  // Stopped: the drums choice shows dimmed (the groove plays as soon as anything starts).
  function paintIdle() {
    for (const [m, el] of tileEls) el.classList.toggle('idle', !running && drumMode === m);
  }
  function paintSet() {
    nameEl.textContent = name(STYLE_NAMES, set.style);
    coverImg.src = setCover(set, sp.bpm);
  }
  // Another built-in set: what was playing goes on with it (the same pads'
  // loops, from its first bar), once it's made. (Changed during a take, the
  // take ends and plays as a song instead.)
  function changeSet(next, { back = false } = {}) {
    const was = (running || waiting) && (simple() || !jam.takes.length);
    const carry = was ? pads.filter(p => jam.loops.get(p.i)?.to === Infinity) : [];
    const before = { ...set };
    stop();
    set = setOf(next);
    sp = specOf(set);
    // ↶ for 8 seconds: the set before this one.
    clearTimeout(undoTimer);
    prevSet = back ? null : before;
    undoSet.classList.toggle('ghost', back);
    undoSet.disabled = back;
    if (!back) undoTimer = setTimeout(() => (undoSet.classList.add('ghost'), (undoSet.disabled = true)), 8000);
    try {
      localStorage.setItem(SET, JSON.stringify(set));
    } catch {}
    drawPads();
    paintSet();
    if (!was) return makeBand();
    start();
    for (const p of carry) loopSet(p.i, true, 0);
    if (!running) for (const p of carry) hits.get(p.i)?.classList.add('wait');
    shown = -1;
  }
  // The grooves sheet (lib/genres.mjs): a tap makes a new set of it and the music goes on.
  const styleSheet = () => genreSheet({ selected: set.style, styles: SET_STYLES, onPick: st => changeSet({ seed: Math.floor(Math.random() * 1e9), style: st }) });
  // The set's sound, made in the worker (a second or two on a phone).
  function makeBand() {
    const id = setId();
    if (band?.id === id || making === id) return;
    making = id;
    loading(true);
    api.band(set).then(
      b => {
        if (making !== id) return;
        making = '';
        band = { id, pieces: b.pieces, roles: b.roles, sr: b.sr };
        if (!cur?.band) return;
        if (!panel.hidden) ready();
        loading(false);
        if (waiting) ((waiting = false), start());
      },
      () => {
        if (making !== id) return;
        making = '';
        waiting = false;
        toast(W('這組做不出來，換一組試試', 'Couldn’t make this set: try another'), { tone: 'bad' });
        paintTransport();
      }
    );
  }
  // A pad's level as a bar along its foot, dimmed when muted, its choke group in a corner.
  function paintPad(i) {
    const b = hits.get(i);
    if (!b) return;
    const p = jam.pad(i);
    b.classList.toggle('muted', p.mute);
    b.classList.toggle('leveled', p.level !== 1);
    b.style.setProperty('--lvl', String(p.level));
    b.dataset.choke = p.choke === 'self' ? '×' : p.choke.toUpperCase();
  }
  function savePads() {
    const all = readPads();
    if (!all || !setsOf) return;
    try {
      localStorage.setItem(PADS, JSON.stringify(withPads(all, setsOf, sets)));
    } catch {}
  }
  function setPad(i, change) {
    const p = padOf({ ...jam.pad(i), ...change });
    if (p.level === 1 && !p.mute && !p.choke) delete sets[i];
    else sets[i] = p;
    paintPad(i);
    savePads();
    return p;
  }
  // The pad's own sheet: its level (live, and in a take from the next hit), mute and choke group.
  function padSheet(p, ids = [p.i]) {
    const now = jam.pad(p.i);
    const pct = h('span', { class: 'pct', text: `${Math.round(now.level * 100)}%` });
    const level = h('input', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': W('音量', 'Level') });
    level.value = String(Math.round(now.level * 100));
    level.addEventListener('input', () => {
      const q = setPad(p.i, { level: +level.value / 100 });
      for (const i of ids) i !== p.i && setPad(i, { level: q.level });
      pct.textContent = `${Math.round(q.level * 100)}%`;
    });
    const mute = toggle({ checked: now.mute, label: W('靜音', 'Mute'), onChange: on => ids.forEach(i => setPad(i, { mute: on })) });
    const choke = segmented(
      [
        { id: '', label: W('不切', 'Off') },
        { id: 'self', label: W('自己', 'Self') },
        { id: 'a', label: W('A 組', 'A') },
        { id: 'b', label: W('B 組', 'B') }
      ],
      { value: now.choke, label: W('切音', 'Choke'), onChange: id => setPad(p.i, { choke: id }) }
    );
    sheet({
      title: p.title || (p.name ? W(...p.name) : `${name(ROLE_NAMES, p.role)} ${p.i + 1}`),
      closeLabel: W('關閉', 'Close'),
      body: h('div', { class: 'card sheet-card jam-pad-sheet' }, [
        row(W('音量', 'Level'), null, h('div', { class: 'ctl' }, [level, pct])),
        row(W('靜音', 'Mute'), null, mute),
        h('div', { class: 'stack', 'data-ctl': 'jam-choke' }, [h('div', { class: 'label' }, [h('span', {}, [W('切音', 'Choke'), ' ', info('choke')]), h('small', { text: hintOf('choke') })]), choke])
      ])
    });
  }
  function setBacking() {
    const kit = drumKit(cur.roles);
    const any = kit.kick != null || kit.snare != null || kit.tick != null;
    jam.setBacking(any ? grooveHits(cur.band ? sp.style : style, kit, 4, 1) : [], 16);
  }
  function paintGroove() {
    grooveSw.replaceChildren(
      ...[
        [true, W('開', 'On')],
        [false, W('關', 'Off')]
      ].map(([on, label]) => h('button', { type: 'button', 'aria-pressed': String(jam.groove === on), text: label, onclick: () => ((jam.groove = on), paintGroove()) }))
    );
    styleSel.disabled = !jam.groove;
  }
  // (Written only when it changes: a button rewritten under a finger, as every beat did, loses that tap on iPhone.)
  const put = (el, html) => el.dataset.html !== html && ((el.dataset.html = html), (el.innerHTML = html));
  function paintTransport() {
    const easy = simple();
    put(playBtn, waiting ? W('準備中…', 'Getting ready…') : running ? (easy ? icon('stop') : `${icon('stop')}<span>${W('停止', 'Stop')}</span>`) : `${icon('play')}<span>${W('開始', 'Start')}</span>`);
    playBtn.setAttribute('aria-label', running ? W('停止', 'Stop') : W('開始', 'Start'));
    playBtn.classList.toggle('on', running);
    keepBtn.hidden = !running || !easy;
    const beat = running ? beatNow() : 0;
    const done = Date.now() < keptUntil;
    put(keepLab, done ? `${icon('check')}<span>${W('已存', 'Kept')}</span>` : `${icon('heart')}<span>${W('存下來', 'Keep')}</span>`);
    keepBtn.classList.toggle('done', done);
    const can = running && jam.keepable(beat);
    if (keepBtn.disabled === can) keepBtn.disabled = !can;
    const t = jam.openTake();
    const secs = t && running ? clock(Math.max(0, ((beat - t.from) * 60) / bpm)) : '';
    if (keepTime.textContent !== secs) keepTime.textContent = secs;
    const rec = jam.recording();
    recBtn.classList.toggle('on', rec);
    put(recBtn, rec ? `${icon('stop')}<span>${W('完成', 'Done')}</span>` : `${icon('record')}<span>${W('錄一段', 'Record')}</span>`);
    paintIdle();
  }
  // Loops wanted on (or off) from `beat`, whatever they are now: nothing toggled twice.
  function loopSet(i, on, beat) {
    const p = pads.find(x => x.i === i);
    const l = jam.loops.get(i);
    if (!p || Boolean(l && l.to === Infinity) === on) return [];
    const r = jam.toggle(i, beat, p.beats, { group: p.group, phase: p.phase });
    return [...r.off, ...(r.on ? [] : [i])];
  }
  // The drums column: 基本 (slow hats), 熱鬧 (fast and open hats), or off (no groove, no hats).
  function setDrums(mode, beat) {
    drumMode = mode;
    jam.groove = mode !== '';
    const off = [];
    for (const i of DRUM_LOOPS) off.push(...loopSet(i, (mode === 'basic' && i === 8) || (mode === 'busy' && i !== 8), beat));
    cutLoops(off, nextBar(beat));
  }
  // Every piece as a buffer (made once per kit, ahead of the first tap; one
  // channel when both sides are the same). A buffer needs no audio context,
  // so it's made before the phone's sound is started; where the browser
  // can't, on the context.
  const bufferOf = (channels, length, sampleRate) => {
    try {
      return new AudioBuffer({ numberOfChannels: channels, length, sampleRate });
    } catch {
      return api.audio().createBuffer(channels, length, sampleRate);
    }
  };
  function makeBuffers(k) {
    buffers = k.pieces.map(p => {
      const mono = p.R === p.L;
      const b = bufferOf(mono ? 1 : 2, Math.max(1, p.L.length), k.sr);
      b.copyToChannel(p.L, 0);
      if (!mono) b.copyToChannel(p.R, 1);
      return b;
    });
  }

  // The pads' sound ready to play (false: the set is still being made).
  function ready() {
    const k = sound();
    if (!k) return false;
    if (kitOf !== k.pieces) {
      makeBuffers(k);
      kitOf = k.pieces;
    }
    return true;
  }

  // ---- Time ----
  const beatNow = () => (api.audio().currentTime - t0) * (bpm / 60);
  const timeOf = beat => t0 + (beat * 60) / bpm;
  function start() {
    if (running || !pads.length) return;
    api.quiet();
    const c = api.audio();
    const k = sound();
    // (The set still being made: ▶ waits for it.)
    if (!k) {
      waiting = true;
      makeBand();
      return paintTransport();
    }
    waiting = false;
    ready();
    t0 = c.currentTime + 0.1;
    upTo = 0;
    running = true;
    // 簡單: a take is always open, and ▶ brings back what ■ put away.
    if (simple() && cur?.band) {
      jam.record(0);
      setDrums(drumMode, 0);
      for (const i of want) if (!DRUM_LOOPS.includes(i)) loopSet(i, true, 0);
    }
    timer = setInterval(schedule, 25);
    schedule();
    raf = requestAnimationFrame(paint);
    paintTransport();
    api.live?.(true, { title: W('即興', 'Jam'), stop });
  }
  function stop() {
    waiting = false;
    // (Not started yet, ▶ waiting for the set: what was tapped meanwhile is let go.)
    if (!running) {
      jam.reset();
      for (const g of boards) for (const b of g.children) b.classList.remove('wait');
      return paintTransport();
    }
    running = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    api.live?.(false);
    // (A take still open is kept up to here, rounded to its bar; one finishing its bar is kept whole.
    // 簡單's isn't: ■ puts the tiles away, 存下來 is what keeps.)
    if (simple() && cur?.band) {
      want = new Set([...jam.loops].filter(([, l]) => l.to === Infinity).map(([i]) => i));
      jam.reset();
      jam.done.length = 0;
    } else jam.end(beatNow());
    voices.clear();
    // What's still sounding fades out at once (a four-bar part doesn't play on after ■).
    const c = api.audio();
    for (const v of live) fade(v, c.currentTime, 0.06);
    live.clear();
    looping.clear();
    finish();
    for (const g of boards) for (const b of g.children) b.classList.remove('on', 'wait', 'hit');
    ringTo(-1);
    paintTransport();
  }
  function schedule() {
    const c = api.audio();
    const to = (c.currentTime + (api.ahead?.(AHEAD) ?? AHEAD) - t0) * (bpm / 60);
    if (to <= upTo) return;
    // (Back from a stretch the phone held the clock up, locked or in another
    // app: what came due meanwhile is let go, not played all at once.)
    const now = (c.currentTime - 0.05 - t0) * (bpm / 60);
    if (now > upTo) upTo = now;
    for (const e of jam.due(upTo, to)) play(e.i, timeOf(e.beat), e);
    upTo = to;
    finish();
  }
  // A sound out at `t`, over `ms`.
  function fade(v, t, secs = 0.01) {
    try {
      v.amp.gain.setValueAtTime(v.g, t);
      v.amp.gain.linearRampToValueAtTime(0, t + secs);
      v.src.stop(t + secs + 0.01);
    } catch {}
  }
  // Loops stopped at `beat` (a bar line): their sound ends there.
  function cutLoops(list, beat) {
    const t = timeOf(beat);
    for (const i of list) {
      const v = looping.get(i);
      if (v && v.at < t - 1e-4) fade(v, t);
    }
  }
  // A hit at its pad's level; a choked one cuts its group's last hit (or, a
  // hit played late for an earlier step, is cut by it), as the take's song will.
  // A loop joined partway plays from there (`off` beats in).
  function play(i, when, { off = 0, lp = false } = {}) {
    const b = buffers[i];
    const p = jam.pad(i);
    const g = gainOf(p);
    if (!b || g <= 0) return;
    const c = api.audio();
    const src = c.createBufferSource();
    src.buffer = b;
    const amp = c.createGain();
    amp.gain.value = g;
    src.connect(amp).connect(c.destination);
    // (Never in the past: a hit the clock has passed plays a moment from now.)
    const at = when < c.currentTime ? c.currentTime + 0.005 : when;
    const into = lp ? (off * 60) / bpm + (at - when) : 0;
    if (into >= b.duration) return;
    src.start(at, into);
    const me = { src, amp, g, at };
    live.add(me);
    src.onended = () => live.delete(me);
    if (lp) looping.set(i, me);
    const key = chokeKey(i, p);
    if (key) {
      const last = voices.get(key); // { when, list }: the group's latest hits (more than one on the same beat)
      if (last && last.when > at + 1e-4) fade(me, last.when);
      else if (last && last.when > at - 1e-4) last.list.push(me);
      else {
        for (const v of last?.list || []) fade(v, at);
        voices.set(key, { when: at, list: [me] });
      }
    }
    const pad = hits.get(i);
    if (pad) setTimeout(() => (pad.classList.add('hit'), setTimeout(() => pad.classList.remove('hit'), 110)), Math.max(0, (when - c.currentTime) * 1000));
  }
  // Takes that have ended: a song made of each (on the built-in set: of its seed and groove).
  function finish() {
    if (!jam.done.length) return;
    paintTransport();
    const from = cur?.band ? { ...set } : null;
    for (const t of jam.done.splice(0)) {
      if (!t.hits.length) continue;
      const { hits: took, beats } = trimTake(t.hits, t.beats, t.from);
      Promise.resolve(api.take(took, beats, from, { keep: true })).then(paintTakes, () => {});
    }
  }
  // The beat: which of the four beats of the bar, and the loops' tiles (on, waiting for the bar, leaving).
  let shown = -1;
  const waits = new Set(); // tiles with a ring
  function paint() {
    if (!running) return;
    const beat = beatNow();
    const at = beat < 0 ? -1 : Math.floor(beat);
    if (at !== shown) {
      const k = at < 0 ? -1 : at % 4;
      ringTo(k);
      shown = at;
      const still = calm();
      waits.clear();
      const glow = el => !still && at >= 0 && el.firstElementChild?.animate?.([{ opacity: 0.85 }, { opacity: 0 }], { duration: 320, easing: 'ease-out' });
      for (const p of pads) {
        if (!p.loop) continue;
        const l = jam.loops.get(p.i);
        const pad = hits.get(p.i);
        if (!pad) continue;
        const on = Boolean(l && beat >= l.from && beat < l.to);
        const wait = Boolean(l && (beat < l.from || (l.to !== Infinity && beat < l.to)));
        pad.classList.toggle('on', on);
        pad.classList.toggle('wait', wait);
        if (wait) waits.add(pad);
        // (Lit pads beat along: a glow inside the tile, never the tile itself.)
        if (on) glow(pad);
      }
      for (const [m, el] of tileEls) {
        const lit = drumMode === m;
        const l = lit ? jam.loops.get(m === 'basic' ? 8 : 9) : null;
        const wait = Boolean(l && beat < l.from);
        el.classList.toggle('on', lit);
        el.classList.toggle('wait', wait);
        if (wait) waits.add(el);
        if (lit) glow(el);
      }
      paintTransport();
    }
    // (The ring fills toward the bar line, draining when the tile is the one leaving.)
    if (waits.size) {
      const f = ((beat % 4) + 4) % 4 / 4;
      for (const el of waits) el.style.setProperty('--p', String((el.classList.contains('on') ? 1 - f : f) * 100));
    }
    raf = requestAnimationFrame(paint);
  }

  // ---- Taps ----
  // (pointerdown, not click: a one-shot is played the moment it's touched. A
  // loop waits for the finger to lift, at the beat it was touched: held, it
  // opens the pad's sheet instead. It only starts on a bar line anyway.)
  // (One press per finger: two fingers drumming at once each lift their own pad.)
  const presses = new Map();
  const padOfEl = b => {
    if (b.dataset.t?.startsWith('d:')) {
      const m = b.dataset.t.slice(2);
      return { drum: m, i: 8, loop: true, title: W(...DRUM_TILES.find(x => x[0] === m)[1]) };
    }
    return pads.find(x => x.i === +(b.dataset.t ?? b.dataset.i));
  };
  function wire(g) {
    g.addEventListener('pointerdown', e => {
      const b = e.target.closest('.jam-pad, .jam-tile, .jam-hit');
      if (!b) return;
      e.preventDefault();
      const p = padOfEl(b);
      if (!p) return;
      clearTimeout(presses.get(e.pointerId)?.timer);
      const press = { p, x: e.clientX, y: e.clientY, beat: running ? Math.max(0, beatNow()) : null, was: running };
      press.timer = setTimeout(() => {
        // (Only one finger down: a held pad among others is drumming, not asking for its level.)
        if (presses.size === 1) (press.sheet = true), padSheet(p, p.drum ? DRUM_LOOPS : [p.i]);
      }, HOLD);
      presses.set(e.pointerId, press);
      if (p.loop) return;
      // (Stopped: just that sound, now. The groove starts with ▶ or a loop.)
      if (!running) {
        if (ready()) play(p.i, api.audio().currentTime + 0.005);
        return;
      }
      const beat = Math.max(0, beatNow());
      const at = jam.shot(p.i, beat, GRIDS[easyBand() ? 8 : grid], (LATE * bpm) / 60);
      // (Already due: played now rather than missed; jam keeps it in the take.)
      if (at < upTo) play(p.i, timeOf(at));
      shown = -1;
    });
    // (A finger that slides off is no hold.)
    g.addEventListener('pointermove', e => {
      const press = presses.get(e.pointerId);
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) clearTimeout(press.timer);
    });
    g.addEventListener('pointerup', lift(true));
    g.addEventListener('pointercancel', lift(false));
    g.addEventListener('contextmenu', e => e.preventDefault());
  }
  function lift(tapped) {
    return e => {
      const press = presses.get(e.pointerId);
      if (!press) return;
      clearTimeout(press.timer);
      presses.delete(e.pointerId);
      const { p, beat, sheet, was } = press;
      if (!tapped || sheet || !p.loop) return;
      // (Moved off it: no tap.)
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) return;
      if (!running) start();
      if (!running) return;
      const at = Math.max(0, beat ?? (running ? beatNow() : 0));
      if (p.drum) {
        // (▶ brought the dimmed choice back: a tap on it then is just "play".)
        if (!was && drumMode === p.drum) return void (shown = -1);
        setDrums(drumMode === p.drum ? '' : p.drum, at);
        shown = -1;
        return;
      }
      if (!was && jam.loops.get(p.i)?.to === Infinity) return void (shown = -1);
      const r = jam.toggle(p.i, at, p.beats, { group: p.group, phase: p.phase });
      if (running) cutLoops(r.off, r.at);
      else hits.get(p.i)?.classList.toggle('wait', r.on);
      shown = -1;
    };
  }
  boards.forEach(wire);
  playBtn.onclick = () => (running || waiting ? stop() : start());
  keepBtn.onclick = () => {
    if (!running || !jam.keepable(beatNow())) return;
    jam.rotate(beatNow());
    keptUntil = Date.now() + 1500;
    setTimeout(paintTransport, 1600);
    paintTransport();
  };
  recBtn.onclick = () => {
    if (!running) start();
    jam.record(Math.max(0, running ? beatNow() : 0));
    paintTransport();
  };
  stopAllBtn.onclick = () => {
    if (!running) return;
    const r = jam.stopAll(beatNow());
    cutLoops(r.off, r.at);
  };
  styleSel.addEventListener('change', () => {
    style = styleSel.value;
    setBacking();
  });

  // Any touch on the tab: the phone's sound started (iPhone starts it only
  // on a touch) and the pads' sound ready before a pad needs it.
  panel.addEventListener(
    'pointerdown',
    () => {
      api.audio();
      if (!ready() && usingBand()) makeBand();
    },
    true
  );
  draw();
  // (The built-in set made while the app opens, so it's there when the tab is.)
  setTimeout(() => usingBand() && makeBand(), 500);
  return {
    // The kit, its tempo or its roles changed: the pads follow (and anything playing stops).
    kit() {
      stop();
      kitOf = null;
      if (!panel.hidden) draw();
    },
    shown: () => (draw(), ready()),
    level: () => (stop(), draw()),
    // (Another built-in set, from outside: 創作's 即興組合.)
    useSet: next => changeSet(next),
    start,
    hidden: () => stop(),
    stop,
    playing: () => running
  };
}

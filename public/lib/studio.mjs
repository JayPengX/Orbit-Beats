// 樂器: make your own clips on the app's instruments (lib/synth.mjs). A
// grid of 16th notes, one, two or four bars: the drums' lanes (the kit, or
// the percussion beside it), or the key's notes for an instrument; played
// live as it loops (a tap on the grid is heard at once), written for you in
// a groove or key (自動編), and added to the kit as pieces (加進片段) for the
// songs. A drum tapped again is accented, a third time off; a long press sets
// any hit's level (力度: soft, normal, accent); notes go in as single notes or
// as chords (和弦: the triad in the key). Up to four patterns (段落 A–D) and a
// chain of them (串接, A A B A) that plays, goes into the kit and out as MIDI
// in order. Swing, undo, the
// first bar copied over the rest, a tempo tapped in, the clip as MIDI, and a
// shelf of clips kept (收藏). What's on the grid and the shelf are kept on
// this phone (localStorage), so they're there the next time.
import { h, segmented, toast, menu } from '#kit/ui.mjs';
import { NOTE_NAMES } from '../engine.mjs';
import { DRUMS, PERC, ALL_DRUMS, DRUM_NAMES, INSTRUMENTS, INSTRUMENT_NAMES, INSTRUMENT_ROLE, OCTAVE, NOTE_LEN, STEPS, BAR_CHOICES, GROOVE_STYLES, LEVELS, emptyDrums, emptyNotes, drumPattern, melody, scaleRows, voice, clipEmpty, clipOf, stepHits, swingOf, copyFirstBar, resizeClip, chainClips } from './synth.mjs';
import { midiFile, clipTracks } from './midi.mjs';
import { tapper } from './tap.mjs';
import { download, fileName } from './download.mjs';
import { STYLE_NAMES, ROLE_NAMES, name } from './names.mjs';
import { W } from './lang.mjs';

// (v2: each of drums and notes a set of patterns and a chain; the first key held one clip each.)
const KEY = 'orbit-beats.studio.v2';
const OLD_KEY = 'orbit-beats.studio';
const SHELF = 'orbit-beats.shelf';
const MOST_SHELF = 24;
const UNDO = 40;
const noteName = m => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

export const MOST_PATS = 4;
export const MOST_CHAIN = 8;
export const PAT_NAMES = ['A', 'B', 'C', 'D'];
// A set of patterns: { pats: [clip…] (1–4, one kind, one length, one sound:
// instrument, key, swing and 808 the first's), at: the one shown, chain:
// [pattern…] (1–8) }. An older page kept a single clip: it's pattern A.
export function bankOf(b, kind, bars) {
  if (!b || typeof b !== 'object') return null;
  const raw = b.kind ? { pats: [b] } : b;
  const pats = (Array.isArray(raw.pats) ? raw.pats : [])
    .map(clipOf)
    .filter(c => c?.kind === kind)
    .slice(0, MOST_PATS)
    .map(c => (c.bars === bars ? c : resizeClip(c, bars)));
  if (!pats.length) return null;
  const [first] = pats;
  for (const c of pats) Object.assign(c, kind === 'drums' ? { swing: first.swing, pitch: first.pitch } : { swing: first.swing, inst: first.inst, key: first.key });
  const at = Number.isInteger(raw.at) && raw.at >= 0 && raw.at < pats.length ? raw.at : 0;
  const chain = (Array.isArray(raw.chain) ? raw.chain : []).filter(i => Number.isInteger(i) && i >= 0 && i < pats.length).slice(0, MOST_CHAIN);
  return { pats, at, chain: pats.length > 1 && chain.length ? chain : [0] };
}
// The chain as one clip (what's added to the kit and written as MIDI).
export const chainOf = bank => chainClips(bank.chain.map(i => bank.pats[i]));
// A pattern taken out: the chain without it (A alone if nothing's left).
export function dropPattern(bank, k) {
  if (bank.pats.length < 2) return bank;
  const pats = bank.pats.filter((_, j) => j !== k);
  const chain = bank.chain.filter(i => i !== k).map(i => (i > k ? i - 1 : i));
  return { pats, at: Math.min(bank.at > k ? bank.at - 1 : bank.at, pats.length - 1), chain: pats.length > 1 && chain.length ? chain : [0] };
}

// What's kept from before, made whole (a clip from an older page had fewer
// lanes and bars; one from before the patterns, a single clip each).
export function stateOf(s) {
  if (!s || typeof s !== 'object') return null;
  const bars = BAR_CHOICES.includes(s.bars) ? s.bars : 1;
  const drums = bankOf(s.drums, 'drums', bars);
  const notes = bankOf(s.notes, 'notes', bars);
  if (!drums || !notes) return null;
  return {
    mode: s.mode === 'notes' ? 'notes' : 'drums',
    set: s.set === 'perc' ? 'perc' : 'kit',
    bars,
    groove: GROOVE_STYLES.includes(s.groove) ? s.groove : 'trap',
    inst: INSTRUMENTS.includes(s.inst) ? s.inst : 'keys',
    key: s.key && Number.isInteger(s.key.tonic) ? { tonic: s.key.tonic % 12, minor: Boolean(s.key.minor) } : null,
    chord: Boolean(s.chord),
    loop: s.loop === 'chain' ? 'chain' : 'pat',
    drums,
    notes
  };
}
const read = k => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
// A drum's step tapped: off, on, accented, off (a soft one, off).
export const nextHit = v => (v === 0 || !v ? 1 : v === 1 ? 2 : 0);
// A hit's level (力度) as the grid and the long press name it.
export const LEVEL_NAMES = { 3: ['輕', 'Soft'], 1: ['中', 'Normal'], 2: ['重', 'Accent'] };

export function mountStudio(panel, api) {
  const st = stateOf(read(KEY)) || stateOf(read(OLD_KEY)) || { mode: 'drums', set: 'kit', bars: 1, groove: 'trap', inst: 'keys', key: null, chord: false, loop: 'pat', drums: { pats: [emptyDrums(1)], at: 0, chain: [0] }, notes: { pats: [emptyNotes('keys', 1)], at: 0, chain: [0] } };
  let shelf = (Array.isArray(read(SHELF)) ? read(SHELF) : []).map(x => x && { name: String(x.name || ''), at: x.at || 0, clip: clipOf(x.clip) }).filter(x => x?.clip);
  let seed = Math.floor(Math.random() * 1e6);
  const undo = [];
  let chained = null;
  const keep = () => ((chained = null), write(KEY, st));
  // Before a change: the patterns as they were, for 復原.
  const mark = () => {
    undo.push(JSON.stringify(bank()));
    if (undo.length > UNDO) undo.shift();
    undoBtn.disabled = false;
  };
  // The key the notes are in: yours, else the kit's (heard from its riffs), else A minor.
  const keyNow = () => st.key || api.key() || { tonic: 9, minor: true };
  const lanes = () => (st.set === 'perc' ? PERC : DRUMS);
  const rows = () => (st.mode === 'drums' ? lanes() : scaleRows(keyNow().tonic, keyNow().minor, OCTAVE[st.inst] ?? 60, 8).reverse());
  const bank = () => (st.mode === 'drums' ? st.drums : st.notes);
  const clip = () => bank().pats[bank().at];
  const setClip = c => (bank().pats[bank().at] = c);
  const many = () => bank().pats.length > 1;
  // What 播放 loops: the pattern shown, or the chain (made once a change).
  const heard = () => (st.loop === 'chain' && many() ? (chained ||= chainOf(bank())) : clip());
  const eachClip = fn => [st.drums, st.notes].forEach(b => (b.pats = b.pats.map(fn)));

  // ---- Drawing ----
  const modeSeg = segmented(
    [
      { id: 'drums', label: W('鼓組', 'Drums') },
      { id: 'notes', label: W('旋律', 'Notes') }
    ],
    { value: st.mode, label: W('樂器', 'Instrument'), onChange: id => ((st.mode = id), (undo.length = 0), keep(), draw()) }
  );
  const setSeg = h('div', { class: 'seg' });
  const barsSeg = h('div', { class: 'seg' });
  const instChips = h('div', { class: 'chips three' });
  const grooveSel = h('select', { class: 'num wide', 'aria-label': W('節奏', 'Groove') }, GROOVE_STYLES.map(s => h('option', { value: s, text: name(STYLE_NAMES, s) })));
  const tonicSel = h('select', { class: 'num short', 'aria-label': W('調', 'Key') }, NOTE_NAMES.map((n, i) => h('option', { value: String(i), text: n })));
  const modeSel = h('div', { class: 'seg' });
  const tempoIn = h('input', { class: 'num tempo-num', type: 'number', min: 60, max: 200, step: 1, inputmode: 'numeric', 'aria-label': W('速度', 'Tempo') });
  const tapBtn = h('button', { class: 'mini', type: 'button', text: W('點拍', 'Tap'), 'aria-label': W('跟著點拍子', 'Tap the tempo') });
  const tempoSub = h('small');
  const swingIn = h('input', { type: 'range', min: 0, max: 0.6, step: 0.05, 'aria-label': W('搖擺', 'Swing') });
  const swingVal = h('span', { class: 'val' });
  const grid = h('div', { class: 'sq', role: 'grid' });
  const playBtn = h('button', { class: 'q-btn tinted', type: 'button' });
  const autoBtn = h('button', { class: 'q-btn tinted', type: 'button', text: W('自動編', 'Write one') });
  const clearBtn = h('button', { class: 'q-btn plain', type: 'button', text: W('清除', 'Clear') });
  const undoBtn = h('button', { class: 'mini', type: 'button', text: W('↶ 復原', '↶ Undo'), disabled: true });
  const copyBtn = h('button', { class: 'mini', type: 'button', text: W('⧉ 複製', '⧉ Copy'), 'aria-label': W('第一小節複製到每一小節', 'Bar 1 over every bar') });
  const chordBtn = h('button', { class: 'mini', type: 'button', text: W('和弦', 'Chords'), 'aria-pressed': String(st.chord) });
  const saveBtn = h('button', { class: 'mini', type: 'button', text: W('♡ 收藏', '♡ Keep') });
  const midiBtn = h('button', { class: 'mini', type: 'button', text: 'MIDI' });
  const addBtn = h('button', { class: 'primary', type: 'button' });
  const patSeg = h('div', { class: 'seg pats' });
  const chainSub = h('small');
  const loopSeg = h('div', { class: 'seg' });
  const chainSlots = h('div', { class: 'chain' });
  const note = h('p', { class: 'studio-note' });
  const tip = h('p', { class: 'studio-note' });
  const shelfList = h('ul', { class: 'mine-list' });
  const shelfCard = h('section', { class: 'card' }, [h('div', { class: 'head' }, [h('h2', { text: W('收藏的片段', 'Kept clips') })]), shelfList]);

  const row = (label, sub, ctl) => h('div', { class: sub ? 'row note' : 'row' }, [h('div', { class: 'label' }, [h('span', { text: label }), sub]), ctl]);
  const setRow = row(W('鼓', 'Drums'), h('small', { text: W('一次八種', 'Eight at a time') }), setSeg);
  const grooveRow = row(W('節奏', 'Groove'), h('small', { text: W('自動編用的', 'Used by Write one') }), grooveSel);
  const instRow = h('div', { class: 'stack' }, [h('div', { class: 'label' }, [h('span', { text: W('樂器', 'Instrument') })]), instChips]);
  const keyRow = row(W('調', 'Key'), h('small', { text: W('格子上只有這個調的音', 'The grid holds only its notes') }), h('div', { class: 'ctl' }, [tonicSel, modeSel]));
  const tempoRow = row(W('速度', 'Tempo'), tempoSub, h('div', { class: 'ctl' }, [tempoIn, h('span', { class: 'unit', text: 'BPM' }), tapBtn]));
  const lenRow = row(W('長度', 'Length'), h('small', { text: W('一個循環', 'One loop') }), barsSeg);
  const swingRow = row(W('搖擺', 'Swing'), h('small', { text: W('反拍的 16 分音符晚一點', 'Off-beat 16ths a little late') }), h('div', { class: 'ctl' }, [swingIn, swingVal]));
  const patRow = row(W('段落', 'Pattern'), h('small', { text: W('最多四段，再點一下更多', 'Up to four; tap again for more') }), patSeg);
  const chainRow = h('div', { class: 'stack' }, [h('div', { class: 'chain-head' }, [h('div', { class: 'label' }, [h('span', { text: W('串接', 'Chain') }), chainSub]), loopSeg]), chainSlots]);

  panel.replaceChildren(
    h('section', { class: 'card' }, [
      h('div', { class: 'head' }, [h('h2', { text: W('樂器', 'Studio') })]),
      h('div', { class: 'studio-top' }, [modeSeg]),
      instRow,
      setRow,
      grooveRow,
      keyRow,
      lenRow,
      tempoRow,
      swingRow,
      patRow,
      chainRow,
      h('div', { class: 'studio-tools' }, [undoBtn, copyBtn, chordBtn, saveBtn, midiBtn]),
      tip,
      grid,
      h('div', { class: 'transport' }, [playBtn, autoBtn, clearBtn]),
      addBtn,
      note
    ]),
    shelfCard
  );

  function drawControls() {
    const drums = st.mode === 'drums';
    instRow.hidden = drums;
    setRow.hidden = !drums;
    grooveRow.hidden = !drums;
    keyRow.hidden = drums;
    chordBtn.hidden = drums;
    chordBtn.setAttribute('aria-pressed', String(st.chord));
    instChips.replaceChildren(...INSTRUMENTS.map(i => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(st.inst === i), text: name(INSTRUMENT_NAMES, i), onclick: () => setInst(i) })));
    setSeg.replaceChildren(
      ...[
        ['kit', W('鼓組', 'Kit')],
        ['perc', W('打擊', 'Perc')]
      ].map(([id, label]) => h('button', { type: 'button', 'aria-pressed': String(st.set === id), text: label, onclick: () => ((st.set = id), keep(), draw()) }))
    );
    grooveSel.value = st.groove;
    const k = keyNow();
    tonicSel.value = String(k.tonic);
    modeSel.replaceChildren(
      ...[
        [true, W('小調', 'Minor')],
        [false, W('大調', 'Major')]
      ].map(([minor, label]) => h('button', { type: 'button', 'aria-pressed': String(k.minor === minor), text: label, onclick: () => setKey({ tonic: k.tonic, minor }) }))
    );
    barsSeg.replaceChildren(...BAR_CHOICES.map(n => h('button', { type: 'button', 'aria-pressed': String(st.bars === n), text: W(`${n} 小節`, `${n} bar${n > 1 ? 's' : ''}`), onclick: () => setBars(n) })));
    tempoIn.value = api.tempo();
    tempoIn.disabled = api.hasKit();
    tapBtn.disabled = api.hasKit();
    tempoSub.textContent = api.hasKit() ? W('跟著片段的速度', 'The pieces’ tempo') : W('還沒有片段：用這個速度', 'No pieces yet, so this tempo');
    swingIn.value = String(clip().swing || 0);
    swingVal.textContent = `${Math.round((clip().swing || 0) * 100)}%`;
    copyBtn.disabled = st.bars < 2;
    drawPatterns();
    undoBtn.disabled = !undo.length;
    addBtn.textContent = W('加進片段', 'Add to pieces');
    const role = INSTRUMENT_ROLE[st.inst] || 'riff';
    tip.textContent = drums ? W('點：打 · 再點：重音 · 長按：力度', 'Tap: hit · again: accent · hold: level') : st.chord ? W('點一個音放進三和弦 · 長按：力度', 'Tap: its triad · hold: level') : W('點：放進 · 再點：拿掉 · 長按：力度', 'Tap: in · again: out · hold: level');
    note.textContent = drums ? W('加進去：整段是過門，每種鼓成為歌裡的鼓', 'Added as a fill; each drum joins your songs') : W(`加進去成為${name(ROLE_NAMES, role)}，跟錄的片段一樣排進歌`, `Added as a ${name(ROLE_NAMES, role)}, arranged like any piece`);
    paintPlay();
    drawShelf();
  }
  // The grid as a tracker: the drums (or the key's notes, low to high) across
  // the top, the 16ths going down, a beat's number at each beat. Fits a
  // phone's width at any length (a longer loop is longer down the page).
  function drawGrid() {
    const n = STEPS * st.bars;
    const rs = rows();
    const cells = [h('span', { class: 'corner', 'aria-hidden': 'true' })];
    rs.forEach(r => {
      const root = st.mode === 'notes' && r % 12 === keyNow().tonic;
      cells.push(h('span', { class: `lane${root ? ' root' : ''}`, text: st.mode === 'drums' ? name(DRUM_NAMES, r) : noteName(r) }));
    });
    for (let s = 0; s < n; s++) {
      const beat = s % 4 === 0;
      cells.push(h('span', { class: `stepno${beat ? ' beat' : ''}${s && beat ? ' gap' : ''}${s && s % 16 === 0 ? ' bar' : ''}`, text: beat ? String(s / 4 + 1) : '' }));
      rs.forEach((r, ri) => {
        const label = st.mode === 'drums' ? name(DRUM_NAMES, r) : noteName(r);
        cells.push(h('button', { class: `cell${Math.floor(s / 4) % 2 ? '' : ' beat'}${s && s % 4 === 0 ? ' gap' : ''}`, type: 'button', 'data-r': String(ri), 'data-s': String(s), 'aria-label': `${label} ${s + 1}` }));
      });
    }
    grid.replaceChildren(...cells);
    paintCells();
  }
  function paintCells() {
    const rs = rows();
    const c = clip();
    for (const b of grid.querySelectorAll('.cell')) {
      const r = rs[+b.dataset.r];
      const s = +b.dataset.s;
      let on = false;
      let held = false;
      let lv = 0;
      let chord = false;
      if (st.mode === 'drums') {
        lv = c.steps[r]?.[s] || 0;
        on = Boolean(lv);
      } else
        for (const x of c.notes)
          if (x.midi === r) {
            if (x.step === s) (on = true), (chord = Boolean(x.chord)), (lv = x.lv || 1);
            else if (s > x.step && s < x.step + (x.len || 1)) held = true;
          }
      b.classList.toggle('on', on);
      b.classList.toggle('accent', lv === 2);
      b.classList.toggle('soft', lv === 3);
      b.classList.toggle('chord', chord);
      b.classList.toggle('held', held && !on);
      b.setAttribute('aria-pressed', String(on));
    }
    const none = bank().chain.every(i => clipEmpty(bank().pats[i]));
    addBtn.disabled = none;
    saveBtn.disabled = clipEmpty(c);
    midiBtn.disabled = none;
    undoBtn.disabled = !undo.length;
  }
  function draw() {
    drawControls();
    drawGrid();
  }
  function drawShelf() {
    shelfCard.hidden = !shelf.length;
    shelfList.replaceChildren(
      ...shelf.map((x, k) =>
        h('li', {}, [
          h('div', { class: 't' }, [h('span', { text: x.name }), h('small', { text: `${x.clip.kind === 'drums' ? W('鼓組', 'Drums') : name(INSTRUMENT_NAMES, x.clip.inst)} · ${W(`${x.clip.bars} 小節`, `${x.clip.bars} bar${x.clip.bars > 1 ? 's' : ''}`)}` })]),
          h('button', { class: 'mini', type: 'button', text: W('打開', 'Open'), onclick: () => openKept(k) }),
          h('button', { class: 'mini', type: 'button', text: '⋯', 'aria-label': W('更多', 'More'), onclick: e => shelfMenu(k, e.currentTarget) })
        ])
      )
    );
  }

  // ---- Changes ----
  function setInst(i) {
    // The notes kept by their place in the scale, in the new instrument's octave.
    const before = rows();
    st.inst = i;
    const after = rows();
    st.notes.pats = st.notes.pats.map(c => ({ ...c, inst: i, notes: c.notes.map(x => ({ ...x, midi: after[before.indexOf(x.midi)] })).filter(x => x.midi != null) }));
    keep();
    draw();
    audition(after[after.length - 1] ?? 60);
  }
  function setKey(k) {
    mark();
    const before = rows();
    st.key = k;
    const after = rows();
    for (const c of st.notes.pats) {
      c.key = k;
      c.notes = c.notes.map(x => ({ ...x, midi: after[before.indexOf(x.midi)] })).filter(x => x.midi != null);
    }
    keep();
    draw();
  }
  function setBars(n) {
    if (n === st.bars) return;
    mark();
    eachClip(c => resizeClip(c, n));
    st.bars = n;
    keep();
    draw();
  }
  grooveSel.addEventListener('change', () => {
    st.groove = grooveSel.value;
    keep();
  });
  tonicSel.addEventListener('change', () => setKey({ tonic: +tonicSel.value, minor: keyNow().minor }));
  const setTempo = v => {
    if (v >= 60 && v <= 200) api.setTempo(Math.round(v));
    tempoIn.value = api.tempo();
    buffers.clear();
  };
  tempoIn.addEventListener('change', () => setTempo(Math.round(+tempoIn.value)));
  const taps = tapper();
  tapBtn.onclick = () => {
    const t = taps.tap();
    if (t) setTempo(Math.min(200, Math.max(60, t)));
  };
  // (Swing and the 808's pitch are the patterns' together.)
  const sameSound = () => {
    const c = clip();
    for (const x of bank().pats) Object.assign(x, c.kind === 'drums' ? { swing: c.swing, pitch: c.pitch } : { swing: c.swing });
  };
  swingIn.addEventListener('input', () => {
    clip().swing = +swingIn.value;
    sameSound();
    swingVal.textContent = `${Math.round(clip().swing * 100)}%`;
    keep();
  });
  // A hit's level, on the grid: 0 none, else 1 normal, 2 accent, 3 soft.
  const levelAt = (r, s) => (st.mode === 'drums' ? clip().steps[r][s] || 0 : (n => (n ? n.lv || 1 : 0))(clip().notes.find(x => x.midi === r && x.step === s)));
  function setLevel(r, s, lv) {
    mark();
    const c = clip();
    if (st.mode === 'drums') c.steps[r][s] = lv;
    else {
      const at = c.notes.findIndex(x => x.midi === r && x.step === s);
      if (!lv) at >= 0 && c.notes.splice(at, 1);
      else {
        const n = at >= 0 ? c.notes[at] : (c.notes.push({ step: s, midi: r, len: NOTE_LEN[st.inst] || 2, ...(st.chord ? { chord: true } : {}) }), c.notes[c.notes.length - 1]);
        if (lv === 1) delete n.lv;
        else n.lv = lv;
        c.key = keyNow();
      }
    }
    keep();
    paintCells();
    if (lv) audition(r, lv, s);
  }
  grid.addEventListener('click', e => {
    const b = e.target.closest('.cell');
    if (!b || held) return void (held = false);
    const r = rows()[+b.dataset.r];
    const s = +b.dataset.s;
    const was = levelAt(r, s);
    setLevel(r, s, st.mode === 'drums' ? nextHit(was) : was ? 0 : 1);
  });
  // A long press (or a right click): the hit's level, from a menu.
  let press = 0;
  let held = false;
  let from = null;
  function levelMenu(b) {
    const r = rows()[+b.dataset.r];
    const s = +b.dataset.s;
    const was = levelAt(r, s);
    menu(b, [
      ...LEVELS.map(lv => ({ label: W(...LEVEL_NAMES[lv]), icon: was === lv ? '✓' : '', onClick: () => setLevel(r, s, lv) })),
      ...(was ? ['divider', { label: W('拿掉', 'Remove'), icon: '✕', danger: true, onClick: () => setLevel(r, s, 0) }] : [])
    ]);
  }
  grid.addEventListener('pointerdown', e => {
    const b = e.target.closest('.cell');
    if (!b || e.button) return;
    held = false;
    from = [e.clientX, e.clientY];
    clearTimeout(press);
    press = setTimeout(() => ((held = true), levelMenu(b)), 450);
  });
  grid.addEventListener('pointermove', e => from && Math.hypot(e.clientX - from[0], e.clientY - from[1]) > 10 && clearTimeout(press));
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) grid.addEventListener(t, () => clearTimeout(press));
  grid.addEventListener('contextmenu', e => {
    const b = e.target.closest('.cell');
    if (!b) return;
    e.preventDefault();
    if (!held) levelMenu(b);
  });
  autoBtn.onclick = () => {
    mark();
    seed += 1;
    setClip(st.mode === 'drums' ? drumPattern(st.groove, seed, st.bars) : melody(keyNow(), st.inst, seed, st.bars));
    sameSound();
    keep();
    drawControls();
    paintCells();
    if (!playing) start();
  };
  clearBtn.onclick = () => {
    mark();
    const was = clip();
    setClip(st.mode === 'drums' ? { ...emptyDrums(st.bars), swing: was.swing, pitch: was.pitch } : { ...emptyNotes(st.inst, st.bars, keyNow()), swing: was.swing });
    keep();
    drawControls();
    paintCells();
  };
  undoBtn.onclick = () => {
    const was = undo.pop();
    if (!was) return;
    const raw = JSON.parse(was);
    const bars = raw.pats?.[0]?.bars;
    const b = bankOf(raw, st.mode, bars);
    if (!b) return;
    st[st.mode] = b;
    // (The other patterns follow the length back.)
    st.bars = bars;
    eachClip(c => (c.bars === bars ? c : resizeClip(c, bars)));
    keep();
    draw();
  };
  copyBtn.onclick = () => {
    mark();
    setClip(copyFirstBar(clip()));
    keep();
    paintCells();
  };
  chordBtn.onclick = () => {
    st.chord = !st.chord;
    keep();
    drawControls();
  };
  const clipName = c => (c.kind === 'drums' ? `${W('鼓組', 'Drums')} ${name(STYLE_NAMES, st.groove)}` : `${name(INSTRUMENT_NAMES, c.inst)} ${NOTE_NAMES[keyNow().tonic]}${keyNow().minor ? 'm' : ''}`);
  saveBtn.onclick = () => {
    const c = JSON.parse(JSON.stringify(clip()));
    const n = shelf.filter(x => x.name.startsWith(clipName(c))).length + 1;
    shelf = [{ name: `${clipName(c)}${n > 1 ? ` ${n}` : ''}`, at: Date.now(), clip: c }, ...shelf].slice(0, MOST_SHELF);
    write(SHELF, shelf);
    drawShelf();
    toast(W('已收藏這個片段', 'Clip kept'));
  };
  midiBtn.onclick = () => {
    const c = chainOf(bank());
    const bytes = midiFile({ bpm: api.tempo(), tracks: clipTracks(c, clipName(c)) });
    download(new Blob([bytes], { type: 'audio/midi' }), `${fileName(clipName(c))}.mid`);
  };
  function openKept(k) {
    const x = shelf[k];
    if (!x) return;
    mark();
    st.mode = x.clip.kind === 'drums' ? 'drums' : 'notes';
    const c = clipOf(x.clip);
    setClip(c);
    st.bars = c.bars;
    eachClip(p => (p.bars === c.bars ? p : resizeClip(p, c.bars)));
    if (st.mode === 'notes') {
      st.inst = c.inst;
      if (c.key) st.key = c.key;
      for (const p of st.notes.pats) Object.assign(p, { inst: c.inst, key: c.key });
    }
    sameSound();
    modeSeg.set(st.mode);
    keep();
    draw();
    panel.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
  function shelfMenu(k, anchor) {
    menu(anchor, [
      { label: W('加進片段', 'Add to pieces'), icon: '+', onClick: () => addClip(clipOf(shelf[k].clip)) },
      { label: W('刪除', 'Delete'), icon: '✕', danger: true, onClick: () => ((shelf = shelf.filter((_, j) => j !== k)), write(SHELF, shelf), drawShelf()) }
    ]);
  }
  function addClip(c) {
    stop();
    const n = api.add(JSON.parse(JSON.stringify(c)));
    toast(W(`已加進 ${n} 個片段（在「做歌」）`, `Added ${n} piece${n === 1 ? '' : 's'} (in Make)`));
    drawControls();
  }
  addBtn.onclick = () => addClip(chainOf(bank()));

  // ---- Patterns and the chain ----
  function drawPatterns() {
    const b = bank();
    patSeg.replaceChildren(
      ...b.pats.map((_, k) => h('button', { type: 'button', 'aria-pressed': String(b.at === k), 'aria-label': W(`段落 ${PAT_NAMES[k]}`, `Pattern ${PAT_NAMES[k]}`), text: PAT_NAMES[k], onclick: e => (b.at === k ? patMenu(k, e.currentTarget) : showPattern(k)) })),
      ...(b.pats.length < MOST_PATS ? [h('button', { type: 'button', text: '+', 'aria-label': W('新增一段', 'New pattern'), onclick: () => newPattern() })] : [])
    );
    chainRow.hidden = !many();
    chainSub.textContent = W(`${b.chain.length} 段 · ${b.chain.length * st.bars} 小節`, `${b.chain.length} × ${st.bars} = ${b.chain.length * st.bars} bar${b.chain.length * st.bars > 1 ? 's' : ''}`);
    loopSeg.replaceChildren(
      ...[
        ['pat', W('播這段', 'Play one')],
        ['chain', W('播串接', 'Play chain')]
      ].map(([id, label]) => h('button', { type: 'button', 'aria-pressed': String(st.loop === id), text: label, onclick: () => ((st.loop = id), keep(), drawPatterns(), playing && restart()) }))
    );
    chainSlots.replaceChildren(
      ...b.chain.map((i, k) => h('button', { class: 'slot', type: 'button', 'data-k': String(k), text: PAT_NAMES[i], 'aria-label': W(`第 ${k + 1} 段：${PAT_NAMES[i]}，點一下換`, `Slot ${k + 1}: ${PAT_NAMES[i]}, tap to change`), onclick: () => chainEdit(c => (c[k] = (c[k] + 1) % b.pats.length)) })),
      h('button', { class: 'slot edit', type: 'button', text: '−', 'aria-label': W('拿掉最後一段', 'Remove the last'), disabled: b.chain.length < 2, onclick: () => chainEdit(c => c.pop()) }),
      h('button', { class: 'slot edit', type: 'button', text: '+', 'aria-label': W('再接一段', 'Add one'), disabled: b.chain.length >= MOST_CHAIN, onclick: () => chainEdit(c => c.push(b.at)) })
    );
  }
  function chainEdit(fn) {
    mark();
    fn(bank().chain);
    keep();
    drawPatterns();
    paintCells();
  }
  function showPattern(k) {
    bank().at = k;
    keep();
    drawControls();
    paintCells();
  }
  // A new pattern starts as a copy of the one shown, and joins the chain's end.
  function newPattern() {
    const b = bank();
    if (b.pats.length >= MOST_PATS) return;
    mark();
    b.pats.push(JSON.parse(JSON.stringify(clip())));
    b.at = b.pats.length - 1;
    if (b.pats.length === 2 && b.chain.length === 1) b.chain = [0, 1];
    else if (b.chain.length < MOST_CHAIN) b.chain.push(b.at);
    keep();
    drawControls();
    paintCells();
  }
  function patMenu(k, anchor) {
    menu(anchor, [
      ...(bank().pats.length < MOST_PATS ? [{ label: W('複製成新的一段', 'Copy as a new one'), icon: '⧉', onClick: () => newPattern() }] : []),
      { label: W('刪除這段', 'Delete this one'), icon: '✕', danger: true, onClick: () => (bank().pats.length > 1 ? (mark(), (st[st.mode] = dropPattern(bank(), k)), keep(), drawControls(), paintCells()) : toast(W('至少要留一段', 'Keep at least one'))) }
    ]);
  }

  // ---- Sound: each hit or note made once (at the phone's rate), then scheduled ----
  const buffers = new Map();
  function buffer(inst, midi, len) {
    const c = api.audio();
    const hold = ALL_DRUMS.includes(inst) ? 0.25 : ((len || 1) / 4) * (60 / api.tempo());
    const key = `${inst}|${midi}|${hold}|${c.sampleRate}`;
    if (!buffers.has(key)) {
      const x = voice(inst, midi, c.sampleRate, hold);
      const b = c.createBuffer(1, x.length, c.sampleRate);
      b.copyToChannel(x, 0);
      buffers.set(key, b);
    }
    return buffers.get(key);
  }
  function fire(inst, midi, len, when, gain = 1) {
    const c = api.audio();
    const src = c.createBufferSource();
    src.buffer = buffer(inst, midi, len);
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(c.destination);
    src.start(when);
  }
  // A tap heard at once.
  function audition(r, lv = 1) {
    if (playing) return;
    const c = clip();
    const one = st.mode === 'drums' ? { ...emptyDrums(1), pitch: c.pitch, steps: { [r]: [lv] } } : { ...c, notes: [{ step: 0, midi: r, len: NOTE_LEN[st.inst] || 2, chord: st.chord, lv }] };
    for (const x of stepHits(one, 0)) fire(x.inst, x.midi, x.len, 0, x.gain);
  }
  let playing = false;
  let timer = 0;
  let nextStep = 0;
  let nextTime = 0;
  let raf = 0;
  const queue = [];
  function start() {
    api.quiet();
    const c = api.audio();
    playing = true;
    nextStep = 0;
    nextTime = c.currentTime + 0.06;
    queue.length = 0;
    timer = setInterval(schedule, 25);
    schedule();
    raf = requestAnimationFrame(paintNow);
    paintPlay();
  }
  function stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    for (const b of panel.querySelectorAll('.cell.now, .slot.now')) b.classList.remove('now');
    shownStep = -1;
    paintPlay();
  }
  // The same hits renderClip makes (stepHits, swingOf), ahead of the clock.
  function schedule() {
    const c = api.audio();
    const per = 60 / api.tempo() / 4;
    const cl = heard();
    const n = STEPS * cl.bars;
    while (nextTime < c.currentTime + 0.12) {
      const s = nextStep % n;
      const at = nextTime + swingOf(cl, s) * per;
      for (const x of stepHits(cl, s)) fire(x.inst, x.midi, x.len, at, x.gain);
      queue.push([nextTime, s]);
      nextTime += per;
      nextStep += 1;
    }
  }
  let shownStep = -1;
  function paintNow() {
    if (!playing) return;
    const t = api.audio().currentTime;
    while (queue.length > 1 && queue[1][0] <= t) queue.shift();
    const s = queue[0]?.[0] <= t ? queue[0][1] : -1;
    if (s !== shownStep) {
      for (const b of panel.querySelectorAll('.cell.now, .slot.now')) b.classList.remove('now');
      // (Playing the chain: the step lit when it's the pattern shown, and the chain's place.)
      const per = STEPS * st.bars;
      const k = st.loop === 'chain' && many() ? Math.floor(s / per) : -1;
      if (s >= 0 && (k < 0 || bank().chain[k] === bank().at)) for (const b of grid.querySelectorAll(`.cell[data-s="${s % per}"]`)) b.classList.add('now');
      if (k >= 0) chainSlots.querySelector(`.slot[data-k="${k}"]`)?.classList.add('now');
      shownStep = s;
    }
    raf = requestAnimationFrame(paintNow);
  }
  function restart() {
    stop();
    start();
  }
  function paintPlay() {
    playBtn.textContent = playing ? W('■ 停止', '■ Stop') : W('▶ 播放', '▶ Play');
  }
  playBtn.onclick = () => (playing ? stop() : start());

  draw();
  return {
    shown: () => drawControls(),
    hidden: () => stop(),
    stop,
    playing: () => playing
  };
}

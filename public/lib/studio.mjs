// 樂器: make your own clips on the app's instruments (lib/synth.mjs). A
// grid of 16th notes, one, two or four bars: the drums' lanes (the kit, or
// the percussion beside it), or the key's notes for an instrument; played
// live as it loops (a tap on the grid is heard at once), written for you in
// a groove or key (自動編), and added to the kit as pieces (加進片段) for the
// songs. A drum tapped again is accented, a third time off; notes go in as
// single notes or as chords (和弦: the triad in the key). Swing, undo, the
// first bar copied over the rest, a tempo tapped in, the clip as MIDI, and a
// shelf of clips kept (收藏). What's on the grid and the shelf are kept on
// this phone (localStorage), so they're there the next time.
import { h, segmented, toast, menu } from '#kit/ui.mjs';
import { NOTE_NAMES } from '../engine.mjs';
import { DRUMS, PERC, ALL_DRUMS, DRUM_NAMES, INSTRUMENTS, INSTRUMENT_NAMES, INSTRUMENT_ROLE, OCTAVE, NOTE_LEN, STEPS, BAR_CHOICES, GROOVE_STYLES, emptyDrums, emptyNotes, drumPattern, melody, scaleRows, voice, clipEmpty, clipOf, stepHits, swingOf, copyFirstBar, resizeClip } from './synth.mjs';
import { midiFile, clipTracks } from './midi.mjs';
import { tapper } from './tap.mjs';
import { download, fileName } from './download.mjs';
import { STYLE_NAMES, ROLE_NAMES, name } from './names.mjs';
import { W } from './lang.mjs';

const KEY = 'orbit-beats.studio';
const SHELF = 'orbit-beats.shelf';
const MOST_SHELF = 24;
const UNDO = 40;
const noteName = m => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

// What's kept from before, made whole (a clip from an older page had fewer lanes and bars).
export function stateOf(s) {
  if (!s || typeof s !== 'object') return null;
  const drums = clipOf(s.drums);
  const notes = clipOf(s.notes);
  if (!drums || !notes) return null;
  const bars = BAR_CHOICES.includes(s.bars) ? s.bars : 1;
  return {
    mode: s.mode === 'notes' ? 'notes' : 'drums',
    set: s.set === 'perc' ? 'perc' : 'kit',
    bars,
    groove: GROOVE_STYLES.includes(s.groove) ? s.groove : 'trap',
    inst: INSTRUMENTS.includes(s.inst) ? s.inst : 'keys',
    key: s.key && Number.isInteger(s.key.tonic) ? { tonic: s.key.tonic % 12, minor: Boolean(s.key.minor) } : null,
    chord: Boolean(s.chord),
    drums: drums.bars === bars ? drums : resizeClip(drums, bars),
    notes: notes.bars === bars ? notes : resizeClip(notes, bars)
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
// A drum's step tapped: off, on, accented, off.
export const nextHit = v => (v === 0 || !v ? 1 : v === 1 ? 2 : 0);

export function mountStudio(panel, api) {
  const st = stateOf(read(KEY)) || { mode: 'drums', set: 'kit', bars: 1, groove: 'trap', inst: 'keys', key: null, chord: false, drums: emptyDrums(1), notes: emptyNotes('keys', 1) };
  let shelf = (Array.isArray(read(SHELF)) ? read(SHELF) : []).map(x => x && { name: String(x.name || ''), at: x.at || 0, clip: clipOf(x.clip) }).filter(x => x?.clip);
  let seed = Math.floor(Math.random() * 1e6);
  const undo = [];
  const keep = () => write(KEY, st);
  // Before a change: the clip as it was, for 復原.
  const mark = () => {
    undo.push(JSON.stringify(clip()));
    if (undo.length > UNDO) undo.shift();
    undoBtn.disabled = false;
  };
  // The key the notes are in: yours, else the kit's (heard from its riffs), else A minor.
  const keyNow = () => st.key || api.key() || { tonic: 9, minor: true };
  const lanes = () => (st.set === 'perc' ? PERC : DRUMS);
  const rows = () => (st.mode === 'drums' ? lanes() : scaleRows(keyNow().tonic, keyNow().minor, OCTAVE[st.inst] ?? 60, 8).reverse());
  const clip = () => (st.mode === 'drums' ? st.drums : st.notes);
  const setClip = c => (st.mode === 'drums' ? (st.drums = c) : (st.notes = c));

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
  const note = h('p', { class: 'studio-note' });
  const tip = h('p', { class: 'studio-note' });
  const shelfList = h('ul', { class: 'mine-list' });
  const shelfCard = h('section', { class: 'card' }, [h('div', { class: 'head' }, [h('h2', { text: W('收藏的片段', 'Kept clips') })]), shelfList]);

  const row = (label, sub, ctl) => h('div', { class: 'row' }, [h('div', { class: 'label' }, [h('span', { text: label }), sub]), ctl]);
  const setRow = row(W('鼓', 'Drums'), h('small', { text: W('一次八種', 'Eight at a time') }), setSeg);
  const grooveRow = row(W('節奏', 'Groove'), h('small', { text: W('自動編用的', 'For 自動編') }), grooveSel);
  const instRow = h('div', { class: 'stack' }, [h('div', { class: 'label' }, [h('span', { text: W('樂器', 'Instrument') })]), instChips]);
  const keyRow = row(W('調', 'Key'), h('small', { text: W('格子上只有這個調的音', 'The grid holds only its notes') }), h('div', { class: 'ctl' }, [tonicSel, modeSel]));
  const tempoRow = row(W('速度', 'Tempo'), tempoSub, h('div', { class: 'ctl' }, [tempoIn, h('span', { class: 'unit', text: 'BPM' }), tapBtn]));
  const lenRow = row(W('長度', 'Length'), h('small', { text: W('一個循環', 'One loop') }), barsSeg);
  const swingRow = row(W('搖擺', 'Swing'), h('small', { text: W('反拍的 16 分音符晚一點', 'Off-beat 16ths a little late') }), h('div', { class: 'ctl' }, [swingIn, swingVal]));

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
    tempoSub.textContent = api.hasKit() ? W('跟著片段的速度', 'The pieces’ tempo') : W('還沒有片段：用這個速度', 'No pieces yet: this one');
    swingIn.value = String(clip().swing || 0);
    swingVal.textContent = `${Math.round((clip().swing || 0) * 100)}%`;
    copyBtn.disabled = st.bars < 2;
    undoBtn.disabled = !undo.length;
    addBtn.textContent = W('加進片段', 'Add to pieces');
    const role = INSTRUMENT_ROLE[st.inst] || 'riff';
    tip.textContent = drums ? W('點一下打 · 再點重音 · 三下拿掉', 'Tap: a hit · again: accent · again: off') : st.chord ? W('和弦開：點一個音放進它的三和弦', 'Chords on: a tap puts in its triad') : W('點一個音放進去，再點拿掉', 'Tap a note in, again to take it out');
    note.textContent = drums ? W('加進去：整段是過門，每種鼓成為歌裡的鼓', 'Added: the loop a fill, each drum the songs’') : W(`加進去成為${name(ROLE_NAMES, role)}，跟錄的片段一樣排進歌`, `Added as a ${name(ROLE_NAMES, role)}, arranged like any piece`);
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
      let accent = false;
      let chord = false;
      if (st.mode === 'drums') {
        const v = c.steps[r]?.[s];
        on = Boolean(v);
        accent = v === 2;
      } else
        for (const x of c.notes)
          if (x.midi === r) {
            if (x.step === s) (on = true), (chord = Boolean(x.chord));
            else if (s > x.step && s < x.step + (x.len || 1)) held = true;
          }
      b.classList.toggle('on', on);
      b.classList.toggle('accent', accent);
      b.classList.toggle('chord', chord);
      b.classList.toggle('held', held && !on);
      b.setAttribute('aria-pressed', String(on));
    }
    addBtn.disabled = clipEmpty(c);
    saveBtn.disabled = clipEmpty(c);
    midiBtn.disabled = clipEmpty(c);
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
    st.notes = { ...st.notes, inst: i, notes: st.notes.notes.map(x => ({ ...x, midi: after[before.indexOf(x.midi)] })).filter(x => x.midi != null) };
    keep();
    draw();
    audition(after[after.length - 1] ?? 60);
  }
  function setKey(k) {
    mark();
    const before = rows();
    st.key = k;
    const after = rows();
    st.notes.key = k;
    st.notes.notes = st.notes.notes.map(x => ({ ...x, midi: after[before.indexOf(x.midi)] })).filter(x => x.midi != null);
    keep();
    draw();
  }
  function setBars(n) {
    if (n === st.bars) return;
    mark();
    st.drums = resizeClip(st.drums, n);
    st.notes = resizeClip(st.notes, n);
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
  swingIn.addEventListener('input', () => {
    clip().swing = +swingIn.value;
    swingVal.textContent = `${Math.round(clip().swing * 100)}%`;
    keep();
  });
  grid.addEventListener('click', e => {
    const b = e.target.closest('.cell');
    if (!b) return;
    const r = rows()[+b.dataset.r];
    const s = +b.dataset.s;
    mark();
    if (st.mode === 'drums') {
      const lane = st.drums.steps[r];
      lane[s] = nextHit(lane[s]);
      if (lane[s]) audition(r, lane[s] === 2 ? 1.35 : 1);
    } else {
      const at = st.notes.notes.findIndex(x => x.midi === r && x.step === s);
      if (at >= 0) st.notes.notes.splice(at, 1);
      else {
        st.notes.notes.push({ step: s, midi: r, len: NOTE_LEN[st.inst] || 2, ...(st.chord ? { chord: true } : {}) });
        st.notes.key = keyNow();
        audition(r);
      }
    }
    keep();
    paintCells();
  });
  autoBtn.onclick = () => {
    mark();
    seed += 1;
    if (st.mode === 'drums') st.drums = drumPattern(st.groove, seed, st.bars);
    else st.notes = melody(keyNow(), st.inst, seed, st.bars);
    keep();
    drawControls();
    paintCells();
    if (!playing) start();
  };
  clearBtn.onclick = () => {
    mark();
    if (st.mode === 'drums') st.drums = emptyDrums(st.bars);
    else st.notes = emptyNotes(st.inst, st.bars, keyNow());
    keep();
    drawControls();
    paintCells();
  };
  undoBtn.onclick = () => {
    const was = undo.pop();
    if (!was) return;
    const c = clipOf(JSON.parse(was));
    if (!c) return;
    setClip(c);
    st.bars = c.bars;
    // (The other clip follows the length back.)
    if (st.mode === 'drums' && st.notes.bars !== c.bars) st.notes = resizeClip(st.notes, c.bars);
    if (st.mode === 'notes' && st.drums.bars !== c.bars) st.drums = resizeClip(st.drums, c.bars);
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
    const c = clip();
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
    if (st.mode === 'drums') st.notes = resizeClip(st.notes, c.bars);
    else {
      st.drums = resizeClip(st.drums, c.bars);
      st.inst = c.inst;
      if (c.key) st.key = c.key;
    }
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
  addBtn.onclick = () => addClip(clip());

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
  function audition(r, gain = 1) {
    if (playing) return;
    if (st.mode === 'drums') fire(r, r === 'sub' ? st.drums.pitch || 33 : 36, 1, 0, gain);
    else for (const h of stepHits({ ...st.notes, notes: [{ step: 0, midi: r, len: NOTE_LEN[st.inst] || 2, chord: st.chord }] }, 0)) fire(h.inst, h.midi, h.len, 0, h.gain);
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
    for (const b of grid.querySelectorAll('.cell.now')) b.classList.remove('now');
    paintPlay();
  }
  // The same hits renderClip makes (stepHits, swingOf), ahead of the clock.
  function schedule() {
    const c = api.audio();
    const per = 60 / api.tempo() / 4;
    const cl = clip();
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
      for (const b of grid.querySelectorAll('.cell.now')) b.classList.remove('now');
      if (s >= 0) for (const b of grid.querySelectorAll(`.cell[data-s="${s}"]`)) b.classList.add('now');
      shownStep = s;
    }
    raf = requestAnimationFrame(paintNow);
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

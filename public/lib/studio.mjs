// 樂器: make your own clips on the app's instruments (lib/synth.mjs). ▶, 🎲
// and the grooves (or instruments) as chips on top; a grid of 16th notes,
// one, two or four bars (a bar at a time), a lane each: the drums in use
// (the kit, or the percussion beside it; the rest behind 更多鼓), or the
// key's notes for an instrument; played
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
import { DRUM_SETS, ALL_DRUMS, DRUM_NAMES, INSTRUMENTS, INSTRUMENT_NAMES, OCTAVE, NOTE_LEN, STEPS, BAR_CHOICES, GROOVE_STYLES, LEVELS, emptyDrums, emptyNotes, drumPattern, melody, scaleRows, voice, clipEmpty, clipOf, stepHits, swingOf, copyFirstBar, resizeClip, chainClips } from './synth.mjs';
import { midiFile, clipTracks } from './midi.mjs';
import { tapper } from './tap.mjs';
import { download, fileName } from './download.mjs';
import { STYLE_NAMES, STYLE_ORDER, name } from './names.mjs';
import { W } from './lang.mjs';
import { info, hintOf } from './help.mjs';

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
// The grid's lanes: the drums the patterns use and the kit's core (kick,
// snare, hat), in the set's order; every one with 更多鼓, or when nothing
// of the set is in use.
export const CORE_DRUMS = ['kick', 'snare', 'hat'];
export function shownLanes(lanes, clips, all = false) {
  if (all) return [...lanes];
  const used = lanes.filter(d => CORE_DRUMS.includes(d) || clips.some(c => c?.steps?.[d]?.some(Boolean)));
  return used.length ? used : [...lanes];
}
// 🎲's groove: any but the one now (r in [0, 1)).
export function otherGroove(now, r = Math.random()) {
  const rest = GROOVE_STYLES.filter(s => s !== now);
  return rest[Math.min(rest.length - 1, Math.floor(r * rest.length))];
}
// Each lane's colour (the kit's, var(--q-…)): a drum its own; the notes, high to low.
export const LANE_COLOR = { kick: 'orange', snare: 'red', clap: 'pink', hat: 'yellow', open: 'mint', rim: 'purple', tom: 'indigo', sub: 'blue', crash: 'yellow', ride: 'teal', shaker: 'green', cowbell: 'orange', conga: 'red', bongo: 'pink', snap: 'purple', perc: 'indigo',
  timbale: 'orange', cajon: 'red', tabla: 'pink', clave: 'yellow', tamb: 'mint', guiro: 'green', agogo: 'teal', dhol: 'blue',
  brush: 'teal', rkick: 'orange', rsnare: 'red', hardkick: 'pink', chipk: 'yellow', chipn: 'green', chiph: 'mint', gong: 'indigo' };
const NOTE_COLOR = ['pink', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo'];
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
  for (const c of pats) Object.assign(c, kind === 'drums' ? { swing: first.swing, shuffle: first.shuffle, pitch: first.pitch } : { swing: first.swing, shuffle: first.shuffle, inst: first.inst, key: first.key });
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
    set: DRUM_SETS[s.set] ? s.set : 'kit',
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
  const lanes = () => DRUM_SETS[st.set] || DRUM_SETS.kit;
  const rows = () => (st.mode === 'drums' ? lanes() : scaleRows(keyNow().tonic, keyNow().minor, OCTAVE[st.inst] ?? 60, 8).reverse());
  const bank = () => (st.mode === 'drums' ? st.drums : st.notes);
  const clip = () => bank().pats[bank().at];
  const setClip = c => (bank().pats[bank().at] = c);
  const many = () => bank().pats.length > 1;
  // What 播放 loops: the pattern shown, or the chain (made once a change).
  const heard = () => (st.loop === 'chain' && many() ? (chained ||= chainOf(bank())) : clip());
  const eachClip = fn => [st.drums, st.notes].forEach(b => (b.pats = b.pats.map(fn)));

  // ---- Drawing ----
  // Top: ▶, 🎲 and the grooves (or the instruments) as chips; the grid, one
  // lane a drum (or a note), 16 steps across; under it 復原, 清除, ♡ and
  // 存成片段. 進階's settings below.
  const modeSeg = segmented(
    [
      { id: 'drums', label: W('鼓組', 'Drums') },
      { id: 'notes', label: W('旋律', 'Melody') }
    ],
    { value: st.mode, label: W('樂器', 'Instrument'), onChange: id => ((st.mode = id), (undo.length = 0), (page = 0), keep(), fresh(), showChip(false)) }
  );
  const setSeg = h('div', { class: 'seg' });
  const barsSeg = h('div', { class: 'seg' });
  const tonicSel = h('select', { class: 'num short', 'aria-label': W('調', 'Key') }, NOTE_NAMES.map((n, i) => h('option', { value: String(i), text: n })));
  const modeSel = h('div', { class: 'seg' });
  const tempoIn = h('input', { class: 'num tempo-num', type: 'number', min: 60, max: 200, step: 1, inputmode: 'numeric', 'aria-label': W('速度', 'Tempo') });
  const tapBtn = h('button', { class: 'mini', type: 'button', text: W('點拍', 'Tap'), 'aria-label': W('跟著點拍子', 'Tap the tempo') });
  const tempoSub = h('small');
  const swingIn = h('input', { type: 'range', min: 0, max: 0.6, step: 0.05, 'aria-label': W('搖擺', 'Swing') });
  const swingVal = h('span', { class: 'val' });
  const playBtn = h('button', { class: 'st-play', type: 'button' });
  const dice = h('button', { class: 'jam-dice st-dice', type: 'button', text: '🎲' });
  const chips = h('div', { class: 'jam-chips st-chips', role: 'group' });
  // (Scrolled along: the left edge fades too, so a chip cut there reads as more to the left.)
  chips.addEventListener('scroll', () => chips.classList.toggle('st-along', chips.scrollLeft > 4), { passive: true });
  const pager = h('div', { class: 'st-pages' });
  const grid = h('div', { class: 'st-grid', role: 'grid' });
  const moreBtn = h('button', { class: 'st-more', type: 'button' });
  const icon = (svg, label, cls = '') => h('button', { class: `st-icon ${cls}`, type: 'button', 'aria-label': label, title: label, html: `<svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>` });
  const undoBtn = icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', W('復原', 'Undo'));
  const clearBtn = icon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>', W('清除格子', 'Clear the grid'));
  const saveBtn = icon('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', W('收藏到收藏架', 'Keep on the shelf'));
  const addBtn = h('button', { class: 'st-add', type: 'button', text: W('存成片段', 'Save as piece') });
  const copyBtn = h('button', { class: 'mini', type: 'button', 'data-ctl': 'studio-copy', text: W('⧉ 複製', '⧉ Copy'), 'aria-label': W('第一小節複製到每一小節', 'Bar 1 over every bar') });
  const chordBtn = h('button', { class: 'mini', type: 'button', 'data-ctl': 'studio-chord', text: W('和弦', 'Chords'), 'aria-pressed': String(st.chord) });
  const midiBtn = h('button', { class: 'mini', type: 'button', 'data-ctl': 'studio-midi', text: 'MIDI' });
  const patSeg = h('div', { class: 'seg pats' });
  const chainSub = h('small');
  const loopSeg = h('div', { class: 'seg' });
  const chainSlots = h('div', { class: 'chain' });
  const shelfList = h('ul', { class: 'mine-list' });
  const shelfCard = h('section', { class: 'card' }, [h('div', { class: 'head' }, [h('h2', { text: W('收藏架', 'Shelf') })]), shelfList]);
  let page = 0; // the bar shown, when the loop is longer than one
  let more = false; // every drum of the set, not only the ones in use

  // A row: its name (and the word's ⓘ), a line under it, its control; ctl: which of 簡單 / 進階 shows it (lib/easy.mjs).
  const row = (label, sub, ctl, { only = null, term = null } = {}) => h('div', { class: sub ? 'row note' : 'row', 'data-ctl': only }, [h('div', { class: 'label' }, [h('span', {}, [label, ...(term ? [' ', info(term)] : [])]), sub]), ctl]);
  const setRow = row(W('鼓', 'Drums'), h('small', { text: W('一次八種', 'Eight at a time') }), setSeg, { only: 'studio-set' });
  const keyRow = row(W('調', 'Key'), h('small', { text: hintOf('key') }), h('div', { class: 'ctl' }, [tonicSel, modeSel]), { only: 'studio-key', term: 'key' });
  const tempoRow = row(W('速度', 'Tempo'), tempoSub, h('div', { class: 'ctl' }, [tempoIn, h('span', { class: 'unit', text: 'BPM' }), tapBtn]), { only: 'studio-tempo', term: 'bpm' });
  const lenRow = row(W('長度', 'Length'), h('small', { text: W('一個循環幾小節', 'Bars in one loop') }), barsSeg, { only: 'studio-length', term: 'bar' });
  const swingRow = row(W('搖擺', 'Swing'), h('small', { text: hintOf('swing') }), h('div', { class: 'ctl' }, [swingIn, swingVal]), { only: 'studio-swing', term: 'swing' });
  const patRow = row(W('段落', 'Pattern'), h('small', { text: W('最多四段，再點一下更多', 'Up to four; tap again for more') }), patSeg, { only: 'studio-pattern', term: 'pattern' });
  const chainRow = h('div', { class: 'stack', 'data-ctl': 'studio-chain' }, [h('div', { class: 'chain-head' }, [h('div', { class: 'label' }, [h('span', {}, [W('串接', 'Chain'), ' ', info('chain')]), chainSub]), loopSeg]), chainSlots]);

  panel.replaceChildren(
    h('section', { class: 'card studio' }, [
      h('div', { class: 'head' }, [h('h2', { text: W('樂器', 'Studio') }), modeSeg, info('step')]),
      h('div', { class: 'st-top' }, [playBtn, dice, chips]),
      pager,
      grid,
      moreBtn,
      h('div', { class: 'st-actions' }, [undoBtn, clearBtn, saveBtn, addBtn]),
      h('div', { class: 'st-pro' }, [setRow, keyRow, lenRow, tempoRow, swingRow, patRow, chainRow, h('div', { class: 'studio-tools', 'data-ctl': 'studio-tools' }, [copyBtn, chordBtn, midiBtn])])
    ]),
    shelfCard
  );

  function drawControls() {
    const drums = st.mode === 'drums';
    setRow.hidden = !drums;
    keyRow.hidden = drums;
    chordBtn.hidden = drums;
    chordBtn.setAttribute('aria-pressed', String(st.chord));
    // The chips: the grooves (a tap writes a beat in it and plays), or the instruments.
    chips.setAttribute('aria-label', drums ? W('節奏', 'Groove') : W('樂器', 'Instrument'));
    chips.replaceChildren(
      ...(drums ? STYLE_ORDER.filter(s => GROOVE_STYLES.includes(s)) : INSTRUMENTS).map(id =>
        h('button', {
          class: 'chip',
          type: 'button',
          'data-id': id,
          'aria-pressed': String(id === (drums ? st.groove : st.inst)),
          text: drums ? name(STYLE_NAMES, id) : name(INSTRUMENT_NAMES, id),
          onclick: () => (drums ? setGroove(id) : setInst(id))
        })
      )
    );
    dice.setAttribute('aria-label', drums ? W('隨機換一個鼓', 'A random new beat') : W('隨機編一段旋律', 'A random new melody'));
    setSeg.replaceChildren(
      ...[
        ['kit', W('鼓組', 'Kit')],
        ['perc', W('打擊', 'Perc')],
        ['world', W('世界', 'World')],
        ['kits', W('特色', 'More kits')]
      ].map(([id, label]) => h('button', { type: 'button', 'aria-pressed': String(st.set === id), text: label, onclick: () => ((st.set = id), keep(), draw()) }))
    );
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
    paintPlay();
    drawShelf();
  }
  // The chip lit scrolled into sight (after 🎲 picked one off to the side).
  function showChip(smooth = true) {
    const b = chips.querySelector('[aria-pressed="true"]');
    if (!b || !chips.clientWidth) return;
    const x = b.getBoundingClientRect().left - chips.getBoundingClientRect().left;
    if (x < 0 || x + b.offsetWidth > chips.clientWidth - 24) chips.scrollTo?.({ left: Math.max(0, chips.scrollLeft + x - 36), behavior: smooth ? 'smooth' : 'auto' });
  }
  // The grid: a lane a drum (only the ones in use and the kit's core, the
  // rest behind 更多鼓) or a note of the key (high to low), its name over it,
  // and the bar shown as 16 steps across, four to a beat.
  function lanesNow() {
    if (st.mode === 'notes') return rows();
    return shownLanes(lanes(), bank().pats, more);
  }
  function drawGrid() {
    page = Math.min(page, st.bars - 1);
    pager.hidden = st.bars < 2;
    pager.replaceChildren(...Array.from({ length: st.bars }, (_, b) => h('button', { type: 'button', 'data-bar': String(b), 'aria-pressed': String(b === page), text: W(`第 ${b + 1} 小節`, `Bar ${b + 1}`), onclick: () => ((page = b), drawGrid()) })));
    const drums = st.mode === 'drums';
    const all = rows();
    const shown = lanesNow();
    const k = keyNow();
    const at = page * STEPS;
    const head = h('div', { class: 'st-head', 'aria-hidden': 'true' }, Array.from({ length: STEPS }, (_, c) => h('span', { 'data-s': String(at + c), class: c % 4 ? '' : 'beat', text: c % 4 ? '' : String(c / 4 + 1) })));
    const lanesEls = shown.map((r, i) => {
      const ri = all.indexOf(r);
      const label = drums ? name(DRUM_NAMES, r) : noteName(r);
      const root = !drums && r % 12 === k.tonic;
      return h('div', { class: `st-lane${root ? ' root' : ''}`, role: 'row', style: `--c: var(--q-${drums ? LANE_COLOR[r] : NOTE_COLOR[i % NOTE_COLOR.length]})` }, [
        h('div', { class: 'st-name' }, [h('i'), h('span', { text: label })]),
        h(
          'div',
          { class: 'st-cells' },
          Array.from({ length: STEPS }, (_, c) => h('button', { class: `cell g${c % 4}${Math.floor(c / 4) % 2 ? ' alt' : ''}`, type: 'button', role: 'gridcell', 'data-r': String(ri), 'data-s': String(at + c), 'aria-label': `${label} ${at + c + 1}` }))
        )
      ]);
    });
    grid.replaceChildren(head, ...lanesEls);
    const hidden = drums ? lanes().length - shown.length : 0;
    moreBtn.hidden = !drums || (!more && !hidden);
    moreBtn.textContent = more ? W('－ 收起', '－ Fewer drums') : W(`＋ 更多鼓（${hidden}）`, `＋ More drums (${hidden})`);
    paintCells();
  }
  moreBtn.onclick = () => ((more = !more), drawGrid());
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
    clearBtn.disabled = clipEmpty(c);
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
    // (An empty grid gets a melody written for the instrument, playing.)
    if (clipEmpty(clip())) return autoWrite();
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
  // A groove's chip: a beat written in it, playing (its own chip again: another one).
  function setGroove(g) {
    st.groove = g;
    autoWrite();
  }
  // 🎲: drums, a beat in another groove; notes, another melody in the key.
  dice.onclick = () => {
    if (st.mode === 'drums') st.groove = otherGroove(st.groove);
    autoWrite();
    showChip();
  };
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
    for (const x of bank().pats) Object.assign(x, c.kind === 'drums' ? { swing: c.swing, shuffle: c.shuffle, pitch: c.pitch } : { swing: c.swing, shuffle: c.shuffle });
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
  // 自動編: a clip written in the groove (or the key), played (`play`) as it loops.
  function autoWrite(play = true) {
    mark();
    seed += 1;
    setClip(st.mode === 'drums' ? drumPattern(st.groove, seed, st.bars) : melody(keyNow(), st.inst, seed, st.bars));
    sameSound();
    keep();
    draw();
    if (play && !playing) start();
  }
  clearBtn.onclick = () => {
    mark();
    const was = clip();
    setClip(st.mode === 'drums' ? { ...emptyDrums(st.bars), swing: was.swing, pitch: was.pitch } : { ...emptyNotes(st.inst, st.bars, keyNow()), swing: was.swing });
    keep();
    drawControls();
    paintCells();
    undoToast(W('已清除這一段', 'Grid cleared'), () => undoBtn.onclick());
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
    toast(W('已收藏到下方的收藏架', 'Saved to the shelf below'));
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
      { label: W('存成片段', 'Save as piece'), icon: '+', onClick: () => addClip(clipOf(shelf[k].clip)) },
      { label: W('刪除', 'Delete'), icon: '✕', danger: true, onClick: () => dropKept(k) }
    ]);
  }
  function dropKept(k) {
    const gone = shelf[k];
    if (!gone) return;
    shelf = shelf.filter((_, j) => j !== k);
    write(SHELF, shelf);
    drawShelf();
    undoToast(W(`已刪除「${gone.name}」`, `“${gone.name}” deleted`), () => {
      shelf = [...shelf.slice(0, k), gone, ...shelf.slice(k)];
      write(SHELF, shelf);
      drawShelf();
    });
  }
  // A toast with 復原 for about 5 seconds.
  function undoToast(text, back) {
    const t = toast(text, { ms: 5000 });
    t.append(h('button', { type: 'button', class: 'toast-undo', text: W('復原', 'Undo'), onclick: () => (t.remove(), back()) }));
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
    api.live?.(true, { title: W('樂器', 'Instruments'), stop });
  }
  function stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    api.live?.(false);
    for (const b of panel.querySelectorAll('.now')) b.classList.remove('now');
    shownStep = -1;
    paintPlay();
  }
  // The same hits renderClip makes (stepHits, swingOf), ahead of the clock.
  function schedule() {
    const c = api.audio();
    const per = 60 / api.tempo() / 4;
    const cl = heard();
    const n = STEPS * cl.bars;
    // (Back from a stretch the phone held the clock up, locked or in another
    // app: the steps it missed are let go, not played all at once.)
    if (nextTime < c.currentTime - 0.05) {
      const k = Math.ceil((c.currentTime - nextTime) / per);
      nextTime += k * per;
      nextStep += k;
    }
    while (nextTime < c.currentTime + api.ahead(0.12)) {
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
      for (const b of panel.querySelectorAll('.now')) b.classList.remove('now');
      // (Playing the chain: the step lit when it's the pattern shown, and the chain's place.)
      const per = STEPS * st.bars;
      const k = st.loop === 'chain' && many() ? Math.floor(s / per) : -1;
      if (s >= 0 && (k < 0 || bank().chain[k] === bank().at)) for (const b of grid.querySelectorAll(`[data-s="${s % per}"]`)) b.classList.add('now');
      if (s >= 0 && st.bars > 1) pager.querySelector(`[data-bar="${Math.floor((s % per) / STEPS)}"]`)?.classList.add('now');
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
    playBtn.classList.toggle('on', playing);
    playBtn.setAttribute('aria-label', playing ? W('停止', 'Stop') : W('播放', 'Play'));
    playBtn.innerHTML = playing ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z"/></svg>';
  }
  playBtn.onclick = () => (playing ? stop() : start());

  // (簡單 starts from 自動編: an empty grid, drums or melody, gets one written, waiting for ▶.)
  function fresh() {
    if (api.simple?.() && bank().chain.every(i => clipEmpty(bank().pats[i]))) autoWrite(false);
    else draw();
  }
  draw();
  return {
    shown: () => {
      fresh();
      showChip(false);
    },
    hidden: () => stop(),
    stop,
    playing: () => playing
  };
}

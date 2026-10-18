// 樂器: make your own clips on the app's instruments (lib/synth.mjs). A
// grid of 16th notes, a bar or two: the drums' lanes, or the key's notes
// for an instrument; played live as it loops (a tap on the grid is heard at
// once), written for you in a groove or key (自動編), and added to the kit
// as pieces (加進片段) for the songs. What's on the grid is kept on this
// phone (localStorage), so it's there the next time.
import { h, segmented, toast } from '#kit/ui.mjs';
import { STYLES, NOTE_NAMES } from '../engine.mjs';
import { DRUMS, DRUM_NAMES, INSTRUMENTS, INSTRUMENT_NAMES, OCTAVE, STEPS, emptyDrums, emptyNotes, drumPattern, melody, scaleRows, voice, clipEmpty } from './synth.mjs';
import { W, en } from './lang.mjs';

const KEY = 'orbit-beats.studio';
const STYLE_SHORT = { four: ['四拍', 'Four'], hiphop: ['嘻哈', 'Hip-hop'], trap: ['Trap', 'Trap'], half: ['半速', 'Half'], broken: ['碎拍', 'Broken'], house: ['House', 'House'], dembow: ['Dembow', 'Dembow'], afro: ['Afro', 'Afro'], drill: ['Drill', 'Drill'], boombap: ['Boom Bap', 'Boom Bap'], jersey: ['Jersey', 'Jersey'], amapiano: ['Amapiano', 'Amapiano'] };
const nm = (table, k) => (table[k] ? table[k][en ? 1 : 0] : k);
// How long a note is when tapped in (16ths): a pad holds, a bass is short.
const NOTE_LEN = { keys: 2, pluck: 2, bass: 2, lead: 2, pad: 8, bell: 2 };
const noteName = m => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.drums?.steps && Array.isArray(s.notes?.notes)) return s;
  } catch {}
  return null;
}

export function mountStudio(panel, api) {
  const st = load() || { mode: 'drums', bars: 1, groove: 'trap', inst: 'keys', key: null, drums: emptyDrums(1), notes: emptyNotes('keys', 1) };
  let seed = Math.floor(Math.random() * 1e6);
  const keep = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch {}
  };
  // The key the notes are in: yours, else the kit's (heard from its riffs), else A minor.
  const keyNow = () => st.key || api.key() || { tonic: 9, minor: true };
  const rows = () => (st.mode === 'drums' ? DRUMS : scaleRows(keyNow().tonic, keyNow().minor, OCTAVE[st.inst] ?? 60, 8).reverse());
  const clip = () => (st.mode === 'drums' ? st.drums : st.notes);

  // ---- Drawing ----
  const modeSeg = segmented(
    [
      { id: 'drums', label: W('鼓組', 'Drums') },
      { id: 'notes', label: W('旋律', 'Notes') }
    ],
    { value: st.mode, label: W('樂器', 'Instrument'), onChange: id => ((st.mode = id), keep(), draw()) }
  );
  const barsSeg = h('div', { class: 'seg' });
  const instChips = h('div', { class: 'chips three' });
  const grooveSel = h('select', { class: 'num wide', 'aria-label': W('節奏', 'Groove') }, STYLES.map(s => h('option', { value: s, text: nm(STYLE_SHORT, s) })));
  const tonicSel = h('select', { class: 'num short', 'aria-label': W('調', 'Key') }, NOTE_NAMES.map((n, i) => h('option', { value: String(i), text: n })));
  const modeSel = h('div', { class: 'seg' });
  const tempoIn = h('input', { class: 'num tempo-num', type: 'number', min: 60, max: 200, step: 1, inputmode: 'numeric', 'aria-label': W('速度', 'Tempo') });
  const tempoSub = h('small');
  const grid = h('div', { class: 'sq', role: 'grid' });
  const wrap = grid;
  const playBtn = h('button', { class: 'q-btn tinted', type: 'button' });
  const autoBtn = h('button', { class: 'q-btn tinted', type: 'button', text: W('自動編', 'Write one') });
  const clearBtn = h('button', { class: 'q-btn plain', type: 'button', text: W('清除', 'Clear') });
  const addBtn = h('button', { class: 'primary', type: 'button' });
  const note = h('p', { class: 'studio-note' });

  const row = (label, sub, ctl, extra = '') => h('div', { class: `row ${extra}`.trim() }, [h('div', { class: 'label' }, [h('span', { text: label }), sub]), ctl]);
  const grooveRow = row(W('節奏', 'Groove'), h('small', { text: W('自動編用的', 'For 自動編') }), grooveSel);
  const instRow = h('div', { class: 'stack' }, [h('div', { class: 'label' }, [h('span', { text: W('樂器', 'Instrument') })]), instChips]);
  const keyRow = row(W('調', 'Key'), h('small', { text: W('格子上只有這個調的音', 'The grid holds only its notes') }), h('div', { class: 'ctl' }, [tonicSel, modeSel]));
  const tempoRow = row(W('速度', 'Tempo'), tempoSub, h('div', { class: 'ctl' }, [tempoIn, h('span', { class: 'unit', text: 'BPM' })]));
  const lenRow = row(W('長度', 'Length'), h('small', { text: W('一個循環', 'One loop') }), barsSeg);

  panel.replaceChildren(
    h('section', { class: 'card' }, [
      h('div', { class: 'head' }, [h('h2', { text: W('樂器', 'Studio') })]),
      h('div', { class: 'studio-top' }, [modeSeg]),
      instRow,
      grooveRow,
      keyRow,
      lenRow,
      tempoRow,
      wrap,
      h('div', { class: 'transport' }, [playBtn, autoBtn, clearBtn]),
      addBtn,
      note
    ])
  );

  function drawControls() {
    const drums = st.mode === 'drums';
    instRow.hidden = drums;
    grooveRow.hidden = !drums;
    keyRow.hidden = drums;
    instChips.replaceChildren(...INSTRUMENTS.map(i => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(st.inst === i), text: nm(INSTRUMENT_NAMES, i), onclick: () => setInst(i) })));
    grooveSel.value = st.groove;
    const k = keyNow();
    tonicSel.value = String(k.tonic);
    modeSel.replaceChildren(
      ...[
        [true, W('小調', 'Minor')],
        [false, W('大調', 'Major')]
      ].map(([minor, label]) => h('button', { type: 'button', 'aria-pressed': String(k.minor === minor), text: label, onclick: () => setKey({ tonic: k.tonic, minor }) }))
    );
    barsSeg.replaceChildren(
      ...[1, 2].map(n => h('button', { type: 'button', 'aria-pressed': String(st.bars === n), text: W(`${n} 小節`, `${n} bar${n > 1 ? 's' : ''}`), onclick: () => setBars(n) }))
    );
    tempoIn.value = api.tempo();
    tempoIn.disabled = api.hasKit();
    tempoSub.textContent = api.hasKit() ? W('跟著片段的速度', 'The pieces’ tempo') : W('還沒有片段：用這個速度', 'No pieces yet: this one');
    addBtn.textContent = W('加進片段', 'Add to pieces');
    addBtn.disabled = clipEmpty(clip());
    note.textContent = drums ? W('加進去：整段是過門，每種鼓也成為歌裡的鼓聲', 'Added: the loop as a fill, each drum as the songs’ own') : W(`加進去成為${st.inst === 'bass' ? '貝斯' : ' Riff '}，跟錄的片段一樣排進歌裡`, `Added as a ${st.inst === 'bass' ? 'bass line' : 'riff'}, arranged like any piece`);
    paintPlay();
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
      cells.push(h('span', { class: `lane${root ? ' root' : ''}`, text: st.mode === 'drums' ? nm(DRUM_NAMES, r) : noteName(r) }));
    });
    for (let s = 0; s < n; s++) {
      const beat = s % 4 === 0;
      cells.push(h('span', { class: `stepno${beat ? ' beat' : ''}${s && beat ? ' gap' : ''}${s && s % 16 === 0 ? ' bar' : ''}`, text: beat ? String(s / 4 + 1) : '' }));
      rs.forEach((r, ri) => {
        const label = st.mode === 'drums' ? nm(DRUM_NAMES, r) : noteName(r);
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
      if (st.mode === 'drums') on = Boolean(c.steps[r]?.[s]);
      else
        for (const x of c.notes)
          if (x.midi === r) {
            if (x.step === s) on = true;
            else if (s > x.step && s < x.step + (x.len || 1)) held = true;
          }
      b.classList.toggle('on', on);
      b.classList.toggle('held', held && !on);
      b.setAttribute('aria-pressed', String(on));
    }
    addBtn.disabled = clipEmpty(c);
  }
  function draw() {
    drawControls();
    drawGrid();
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
    audition(after[after.length - 1 - 0] ?? 60);
  }
  function setKey(k) {
    const before = rows();
    st.key = k;
    const after = rows();
    st.notes.notes = st.notes.notes.map(x => ({ ...x, midi: after[before.indexOf(x.midi)] })).filter(x => x.midi != null);
    keep();
    draw();
  }
  function setBars(n) {
    if (n === st.bars) return;
    const grow = n > st.bars;
    for (const d of DRUMS) {
      const a = st.drums.steps[d] || [];
      st.drums.steps[d] = grow ? [...a, ...a] : a.slice(0, STEPS * n);
    }
    st.notes.notes = grow ? [...st.notes.notes, ...st.notes.notes.map(x => ({ ...x, step: x.step + STEPS * st.bars }))] : st.notes.notes.filter(x => x.step < STEPS * n);
    st.bars = st.drums.bars = st.notes.bars = n;
    keep();
    draw();
  }
  grooveSel.addEventListener('change', () => {
    st.groove = grooveSel.value;
    keep();
  });
  tonicSel.addEventListener('change', () => setKey({ tonic: +tonicSel.value, minor: keyNow().minor }));
  tempoIn.addEventListener('change', () => {
    const v = Math.round(+tempoIn.value);
    if (v >= 60 && v <= 200) api.setTempo(v);
    tempoIn.value = api.tempo();
  });
  grid.addEventListener('click', e => {
    const b = e.target.closest('.cell');
    if (!b) return;
    const r = rows()[+b.dataset.r];
    const s = +b.dataset.s;
    if (st.mode === 'drums') {
      const lane = st.drums.steps[r];
      lane[s] = lane[s] ? 0 : 1;
      if (lane[s]) audition(r);
    } else {
      const at = st.notes.notes.findIndex(x => x.midi === r && x.step === s);
      if (at >= 0) st.notes.notes.splice(at, 1);
      else {
        st.notes.notes.push({ step: s, midi: r, len: NOTE_LEN[st.inst] || 2 });
        audition(r);
      }
    }
    keep();
    paintCells();
  });
  autoBtn.onclick = () => {
    seed += 1;
    if (st.mode === 'drums') st.drums = drumPattern(st.groove, seed, st.bars);
    else st.notes = melody(keyNow(), st.inst, seed, st.bars);
    keep();
    paintCells();
    if (!playing) start();
  };
  clearBtn.onclick = () => {
    if (st.mode === 'drums') st.drums = emptyDrums(st.bars);
    else st.notes = emptyNotes(st.inst, st.bars);
    keep();
    paintCells();
  };
  addBtn.onclick = () => {
    stop();
    const n = api.add(JSON.parse(JSON.stringify(clip())));
    toast(W(`已加進 ${n} 個片段（在「做歌」）`, `Added ${n} piece${n === 1 ? '' : 's'} (in Make)`));
    drawControls();
  };

  // ---- Sound: each hit or note made once (at the phone's rate), then scheduled ----
  const buffers = new Map();
  function buffer(inst, midi, len) {
    const c = api.audio();
    const key = `${inst}|${midi}|${len}|${c.sampleRate}`;
    if (!buffers.has(key)) {
      const x = voice(inst, midi, c.sampleRate, ((len || 1) / 4) * (60 / api.tempo()));
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
  function audition(r) {
    if (playing) return;
    if (st.mode === 'drums') fire(r, r === 'sub' ? st.drums.pitch || 33 : 36, 1, 0);
    else fire(st.inst, r, NOTE_LEN[st.inst] || 2, 0);
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
  function schedule() {
    const c = api.audio();
    const per = 60 / api.tempo() / 4;
    const n = STEPS * st.bars;
    while (nextTime < c.currentTime + 0.12) {
      const s = nextStep % n;
      if (st.mode === 'drums') {
        for (const d of DRUMS) if (st.drums.steps[d]?.[s]) fire(d, d === 'sub' ? st.drums.pitch || 33 : 36, 1, nextTime, d === 'hat' && s % 2 ? 0.7 : 1);
      } else for (const x of st.notes.notes) if (x.step === s) fire(st.inst, x.midi, x.len, nextTime);
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

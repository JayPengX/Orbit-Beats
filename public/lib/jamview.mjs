// 即興 (Jam) on the screen: the kit's pieces as pads (lib/jam.mjs keeps the
// timing), played live over a groove made from the kit's own drums
// (engine.mjs grooveHits). A loop pad starts on the next bar and goes round
// until tapped again; a one-shot plays on the next step of the grid (16th,
// 8th, beat, or as tapped). ● records from the next bar; stopped, what was
// played (the groove too, when it's on) becomes a song (api.take, mixed like
// any other), in 做歌.
import { h, segmented, empty } from '#kit/ui.mjs';
import { STYLES, drumKit, grooveHits, loopBeats } from '../engine.mjs';
import { Jam, GRIDS, padsOf } from './jam.mjs';
import { ROLE_NAMES, STYLE_NAMES, name } from './names.mjs';
import { W } from './lang.mjs';

const AHEAD = 0.12; // seconds scheduled ahead of the clock
const LATE = 0.03; // a tap this late (s) still counts as the step it missed

export function mountJam(panel, api) {
  const jam = new Jam();
  let running = false;
  let t0 = 0; // the audio clock's time at beat 0
  let upTo = 0; // beats scheduled so far
  let timer = 0;
  let raf = 0;
  let grid = 16;
  let style = null;
  let bpm = 120;
  let pads = [];
  let buffers = []; // each piece as an AudioBuffer, at the phone's rate
  let kitOf = null; // the kit the pads were drawn for
  const hits = new Map(); // pad element by piece, for the flash

  // ---- Drawing ----
  const playBtn = h('button', { class: 'q-btn tinted', type: 'button' });
  const recBtn = h('button', { class: 'q-btn tinted jam-rec', type: 'button' });
  const stopAllBtn = h('button', { class: 'q-btn plain', type: 'button', text: W('全停', 'All off') });
  const beatDots = h('div', { class: 'jam-beat', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i')));
  const padGrid = h('div', { class: 'pads' });
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
  const note = h('p', { class: 'studio-note' });
  const row = (label, sub, ctl) => h('div', { class: 'row' }, [h('div', { class: 'label' }, [h('span', { text: label }), sub ? h('small', { text: sub }) : null]), ctl]);
  const body = h('section', { class: 'card' }, [
    h('div', { class: 'head' }, [h('h2', { text: W('即興', 'Jam') })]),
    h('div', { class: 'jam-bar' }, [playBtn, recBtn, stopAllBtn]),
    beatDots,
    padGrid,
    row(W('鼓', 'Groove'), W('用你的鼓打的節奏', 'Played on your drums'), h('div', { class: 'ctl' }, [grooveSw, styleSel])),
    h('div', { class: 'stack' }, [h('div', { class: 'label' }, [h('span', { text: W('對齊', 'Snap') }), h('small', { text: W('單擊的片段對到這一格', 'One-shots land on this grid') })]), gridSeg]),
    note
  ]);
  const none = h('section', { class: 'card' }, [
    empty({
      icon: '◼︎',
      title: W('還沒有片段', 'No pieces yet'),
      body: W('在「做歌」放進片段，或到「樂器」做幾段，這裡就會變成打擊墊。', 'Add pieces in Make, or make some in Studio, and they become pads here.'),
      action: h('button', { class: 'secondary', type: 'button', text: W('去放片段', 'Add pieces'), onclick: () => api.goMake() })
    })
  ]);

  function drawPads() {
    const k = api.kit();
    bpm = k.bpm;
    const loops = k.heard ? k.heard.analyses.map(a => loopBeats(a, bpm)) : [];
    pads = padsOf(k.roles, loops);
    hits.clear();
    padGrid.replaceChildren(
      ...pads.map(p => {
        const b = h('button', { class: `jam-pad${p.loop ? ' loop' : ''}`, type: 'button', 'data-i': String(p.i), 'aria-label': `${name(ROLE_NAMES, p.role)} ${p.i + 1}${p.loop ? W('（循環）', ' (loop)') : ''}` }, [h('span', { text: String(p.i + 1) }), h('small', { text: `${name(ROLE_NAMES, p.role)}${p.loop ? ` ↻${p.beats}` : ''}` })]);
        hits.set(p.i, b);
        return b;
      })
    );
    // The groove: the styles picked in 做歌 (the first, until another is picked).
    const styles = api.styles().length ? api.styles() : STYLES;
    if (!styles.includes(style)) style = styles[0];
    styleSel.replaceChildren(...styles.map(s => h('option', { value: s, text: name(STYLE_NAMES, s) })));
    styleSel.value = style;
    setBacking();
    paintGroove();
    note.replaceChildren(h('span', { text: W(`${bpm} BPM · ↻ 循環在下一小節開始`, `${bpm} BPM · ↻ loops start on the next bar`) }), h('br'), h('span', { text: W('錄好的一段變成一首歌（在「做歌」）', 'A take becomes a song (in Make)') }));
  }
  function setBacking() {
    const k = api.kit();
    const kit = drumKit(k.roles);
    const any = kit.kick != null || kit.snare != null || kit.tick != null;
    jam.setBacking(any ? grooveHits(style, kit, 4, 1) : [], 16);
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
  function paintTransport() {
    playBtn.textContent = running ? W('■ 停止', '■ Stop') : W('▶ 開始', '▶ Start');
    const rec = jam.recording();
    recBtn.classList.toggle('on', rec);
    recBtn.textContent = rec ? W('■ 停止錄音', '■ Stop take') : W('● 錄一段', '● Record');
  }
  // Every piece as a buffer at the phone's rate (made once per kit).
  function makeBuffers() {
    const k = api.kit();
    const c = api.audio();
    buffers = k.pieces.map(p => {
      const b = c.createBuffer(2, p.L.length, k.sr);
      b.copyToChannel(p.L, 0);
      b.copyToChannel(p.R, 1);
      return b;
    });
  }

  // ---- Time ----
  const beatNow = () => (api.audio().currentTime - t0) * (bpm / 60);
  const timeOf = beat => t0 + (beat * 60) / bpm;
  function start() {
    if (running || !pads.length) return;
    api.quiet();
    const c = api.audio();
    if (kitOf !== api.kit().pieces) {
      makeBuffers();
      kitOf = api.kit().pieces;
    }
    t0 = c.currentTime + 0.08;
    upTo = 0;
    running = true;
    timer = setInterval(schedule, 25);
    schedule();
    raf = requestAnimationFrame(paint);
    paintTransport();
  }
  function stop() {
    if (!running) return;
    running = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    // (A take still open is kept up to here, rounded to its bar.)
    if (jam.recording()) {
      jam.record(beatNow());
      jam.due(upTo, jam.rec.to);
      finish();
    }
    jam.loops.clear();
    jam.shots = [];
    for (const b of padGrid.children) b.classList.remove('on', 'wait', 'hit');
    for (const d of beatDots.children) d.classList.remove('on');
    paintTransport();
  }
  function schedule() {
    const c = api.audio();
    const to = (c.currentTime + AHEAD - t0) * (bpm / 60);
    if (to <= upTo) return;
    for (const e of jam.due(upTo, to)) play(e.i, timeOf(e.beat));
    upTo = to;
    finish();
  }
  function play(i, when) {
    const b = buffers[i];
    if (!b) return;
    const c = api.audio();
    const src = c.createBufferSource();
    src.buffer = b;
    src.connect(c.destination);
    src.start(Math.max(when, c.currentTime));
    const pad = hits.get(i);
    if (pad) setTimeout(() => (pad.classList.add('hit'), setTimeout(() => pad.classList.remove('hit'), 110)), Math.max(0, (when - c.currentTime) * 1000));
  }
  // A take that has ended: a song made of it.
  function finish() {
    if (!jam.done) return;
    const { hits: took, beats } = jam.done;
    jam.done = null;
    paintTransport();
    if (took.length) api.take(took, beats);
  }
  let shown = -1;
  function paint() {
    if (!running) return;
    const beat = beatNow();
    const at = Math.floor(beat) % 4;
    if (at !== shown) {
      [...beatDots.children].forEach((d, k) => d.classList.toggle('on', k === at && beat >= 0));
      shown = at;
      for (const p of pads) {
        if (!p.loop) continue;
        const l = jam.loops.get(p.i);
        const pad = hits.get(p.i);
        pad.classList.toggle('on', Boolean(l && beat >= l.from && beat < l.to));
        pad.classList.toggle('wait', Boolean(l && (beat < l.from || (l.to !== Infinity && beat < l.to))));
      }
      paintTransport();
    }
    raf = requestAnimationFrame(paint);
  }

  // ---- Taps ----
  // (pointerdown, not click: a pad is played the moment it's touched.)
  padGrid.addEventListener('pointerdown', e => {
    const b = e.target.closest('.jam-pad');
    if (!b) return;
    e.preventDefault();
    const p = pads.find(x => x.i === +b.dataset.i);
    if (!p) return;
    if (!running) start();
    const beat = Math.max(0, beatNow());
    if (p.loop) jam.toggle(p.i, beat, p.beats);
    else {
      const at = jam.shot(p.i, beat, GRIDS[grid], (LATE * bpm) / 60);
      // (Already due: played now rather than missed.)
      if (at < upTo) {
        jam.shots = jam.shots.filter(s => !(s.i === p.i && s.beat === at));
        play(p.i, timeOf(at));
        if (jam.rec && at >= jam.rec.from && at < jam.rec.to) jam.rec.hits.push({ i: p.i, beat: at - jam.rec.from });
      }
    }
    shown = -1;
  });
  playBtn.onclick = () => (running ? stop() : start());
  recBtn.onclick = () => {
    if (!running) start();
    jam.record(Math.max(0, beatNow()));
    paintTransport();
  };
  stopAllBtn.onclick = () => running && jam.stopAll(beatNow());
  styleSel.addEventListener('change', () => {
    style = styleSel.value;
    setBacking();
  });

  function draw() {
    const has = api.kit().pieces.length > 0;
    panel.replaceChildren(has ? body : none);
    if (has) drawPads();
    paintTransport();
  }
  draw();
  return {
    // The kit, its tempo or its roles changed: the pads follow (and anything playing stops).
    kit() {
      stop();
      kitOf = null;
      if (!panel.hidden) draw();
    },
    shown: () => draw(),
    hidden: () => stop(),
    stop,
    playing: () => running
  };
}

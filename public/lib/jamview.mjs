// 即興 (Jam) on the screen: the kit's pieces as pads (lib/jam.mjs keeps the
// timing), played live over a groove made from the kit's own drums
// (engine.mjs grooveHits). A loop pad starts on the next bar and goes round
// until tapped again; a one-shot plays on the next step of the grid (16th,
// 8th, beat, or as tapped). ● records from the next bar; stopped, what was
// played (the groove too, when it's on) becomes a song (api.take, mixed like
// any other), in 做歌. A long press on a pad: its level, mute and choke
// (kept per kit on this phone, by the kit's fingerprint).
import { h, segmented, empty, sheet, toggle } from '#kit/ui.mjs';
import { STYLES, drumKit, grooveHits, loopBeats } from '../engine.mjs';
import { Jam, GRIDS, PAD, padsOf, padOf, gainOf, chokeKey, withPads } from './jam.mjs';
import { ROLE_NAMES, STYLE_NAMES, name } from './names.mjs';
import { W } from './lang.mjs';
import { info, hintOf } from './help.mjs';

const AHEAD = 0.12; // seconds scheduled ahead of the clock
const LATE = 0.03; // a tap this late (s) still counts as the step it missed
const HOLD = 450; // ms a pad is held to open its level
const PADS = 'orbit-beats.pads.v1'; // { <print>: { at, pads: { <piece>: { level, mute, choke } } } }
// Every kit's pads on this phone. (A read that fails isn't "none": nothing is saved over it.)
function readPads() {
  try {
    const v = JSON.parse(localStorage.getItem(PADS) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return null;
  }
}

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
  let sets = {}; // piece -> its pad's level, mute and choke (this kit's)
  let setsOf = ''; // the kit they're for
  const voices = new Map(); // choke group -> its last hits
  jam.pad = i => sets[i] || PAD;

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
  const note = h('p', { class: 'studio-note', 'data-ctl': 'jam-note' });
  // 簡單: what the pads do, in two lines.
  const easyNote = h('p', { class: 'studio-note', 'data-ctl': 'jam-easy' }, [W('點打擊墊就會響，↻ 的會一直循環', 'Tap a pad to play it; ↻ ones loop'), ' ', info('loop'), h('br'), W('按「● 錄一段」，再按一次就變成一首歌', 'Tap ● Record, then again: it’s a song')]);
  // A row: its name (and the word's ⓘ), a line under it, its control; only: which of 簡單 / 進階 shows it.
  const row = (label, sub, ctl, { only = null, term = null } = {}) => h('div', { class: 'row', 'data-ctl': only }, [h('div', { class: 'label' }, [h('span', {}, [label, ...(term ? [' ', info(term)] : [])]), sub ? h('small', { text: sub }) : null]), ctl]);
  const body = h('section', { class: 'card' }, [
    h('div', { class: 'head' }, [h('h2', { text: W('即興', 'Jam') })]),
    h('div', { class: 'jam-bar' }, [playBtn, recBtn, stopAllBtn]),
    beatDots,
    padGrid,
    easyNote,
    row(W('鼓', 'Groove'), W('用你的鼓打的節奏', 'Played on your drums'), h('div', { class: 'ctl' }, [grooveSw, styleSel]), { only: 'jam-groove', term: 'groove' }),
    h('div', { class: 'stack', 'data-ctl': 'jam-snap' }, [h('div', { class: 'label' }, [h('span', {}, [W('對齊', 'Snap'), ' ', info('snap')]), h('small', { text: hintOf('snap') })]), gridSeg]),
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
    if (setsOf !== k.print) {
      const all = readPads();
      sets = Object.fromEntries(Object.entries(all?.[k.print]?.pads || {}).map(([i, p]) => [i, padOf(p)]));
      setsOf = k.print;
    }
    hits.clear();
    padGrid.replaceChildren(
      ...pads.map(p => {
        const b = h('button', { class: `jam-pad${p.loop ? ' loop' : ''}`, type: 'button', 'data-i': String(p.i), 'aria-label': `${name(ROLE_NAMES, p.role)} ${p.i + 1}${p.loop ? W('（循環）', ' (loop)') : ''}` }, [h('span', { text: String(p.i + 1) }), h('small', { text: `${name(ROLE_NAMES, p.role)}${p.loop ? ` ↻${p.beats}` : ''}` })]);
        b.append(h('i', { class: 'lvl', 'aria-hidden': 'true' }));
        hits.set(p.i, b);
        paintPad(p.i);
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
    note.replaceChildren(h('span', { text: W(`${bpm} BPM · ↻ 循環在下一小節開始`, `${bpm} BPM · ↻ loops start on the next bar`) }), h('br'), h('span', { text: W('長按打擊墊：音量、靜音、切音', 'Hold a pad: level, mute, choke') }), h('br'), h('span', { text: W('錄好的一段變成一首歌（在「做歌」）', 'A take becomes a song (in Make)') }));
  }
  // A pad's level as a bar along its foot, dimmed when muted, its choke group in a corner.
  function paintPad(i) {
    const b = hits.get(i);
    if (!b) return;
    const p = jam.pad(i);
    b.classList.toggle('muted', p.mute);
    b.classList.toggle('leveled', p.level !== 1);
    b.style.setProperty('--lvl', String(p.level));
    b.dataset.choke = p.choke === 'self' ? '✂︎' : p.choke.toUpperCase();
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
  function padSheet(p) {
    const now = jam.pad(p.i);
    const pct = h('span', { class: 'pct', text: `${Math.round(now.level * 100)}%` });
    const level = h('input', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': W('音量', 'Level') });
    level.value = String(Math.round(now.level * 100));
    level.addEventListener('input', () => {
      const q = setPad(p.i, { level: +level.value / 100 });
      pct.textContent = `${Math.round(q.level * 100)}%`;
    });
    const mute = toggle({ checked: now.mute, label: W('靜音', 'Mute'), onChange: on => setPad(p.i, { mute: on }) });
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
      title: `${name(ROLE_NAMES, p.role)} ${p.i + 1}`,
      closeLabel: W('關閉', 'Close'),
      body: h('div', { class: 'card sheet-card jam-pad-sheet' }, [
        row(W('音量', 'Level'), null, h('div', { class: 'ctl' }, [level, pct])),
        row(W('靜音', 'Mute'), null, mute),
        h('div', { class: 'stack' }, [h('div', { class: 'label' }, [h('span', {}, [W('切音', 'Choke'), ' ', info('choke')]), h('small', { text: hintOf('choke') })]), choke])
      ])
    });
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
    // (A take still open is kept up to here, rounded to its bar; one finishing its bar is kept whole.)
    jam.end(beatNow());
    voices.clear();
    finish();
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
  // A hit at its pad's level; a choked one cuts its group's last hit (or, a
  // hit played late for an earlier step, is cut by it), as the take's song will.
  function play(i, when) {
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
    const at = Math.max(when, c.currentTime);
    src.start(at);
    const key = chokeKey(i, p);
    if (key) {
      const last = voices.get(key); // { when, list }: the group's latest hits (more than one on the same beat)
      const cut = (v, t) => {
        v.amp.gain.setValueAtTime(v.g, t);
        v.amp.gain.linearRampToValueAtTime(0, t + 0.004);
        v.src.stop(t + 0.01);
      };
      const me = { src, amp, g };
      if (last && last.when > at + 1e-4) cut(me, last.when);
      else if (last && last.when > at - 1e-4) last.list.push(me);
      else {
        for (const v of last?.list || []) cut(v, at);
        voices.set(key, { when: at, list: [me] });
      }
    }
    const pad = hits.get(i);
    if (pad) setTimeout(() => (pad.classList.add('hit'), setTimeout(() => pad.classList.remove('hit'), 110)), Math.max(0, (when - c.currentTime) * 1000));
  }
  // Takes that have ended: a song made of each.
  function finish() {
    if (!jam.done.length) return;
    paintTransport();
    for (const { hits: took, beats } of jam.done.splice(0)) if (took.length) api.take(took, beats);
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
  // (pointerdown, not click: a one-shot is played the moment it's touched. A
  // loop waits for the finger to lift, at the beat it was touched: held, it
  // opens the pad's sheet instead. It only starts on a bar line anyway.)
  let press = null;
  padGrid.addEventListener('pointerdown', e => {
    const b = e.target.closest('.jam-pad');
    if (!b) return;
    e.preventDefault();
    const p = pads.find(x => x.i === +b.dataset.i);
    if (!p) return;
    clearTimeout(press?.timer);
    press = { p, beat: running ? Math.max(0, beatNow()) : null, timer: setTimeout(() => ((press = null), padSheet(p)), HOLD) };
    if (p.loop) return;
    if (!running) start();
    const beat = Math.max(0, beatNow());
    const at = jam.shot(p.i, beat, GRIDS[grid], (LATE * bpm) / 60);
    // (Already due: played now rather than missed; jam keeps it in the take.)
    if (at < upTo) play(p.i, timeOf(at));
    shown = -1;
  });
  const lift = tapped => () => {
    if (!press) return;
    clearTimeout(press.timer);
    const { p, beat } = press;
    press = null;
    if (!tapped || !p.loop) return;
    if (!running) start();
    jam.toggle(p.i, beat ?? Math.max(0, beatNow()), p.beats);
    shown = -1;
  };
  padGrid.addEventListener('pointerup', lift(true));
  padGrid.addEventListener('pointercancel', lift(false));
  padGrid.addEventListener('contextmenu', e => e.preventDefault());
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

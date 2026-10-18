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
import { h, segmented, sheet, toggle } from '#kit/ui.mjs';
import { STYLES, NOTE_NAMES, drumKit, grooveHits, loopBeats } from '../engine.mjs';
import { Jam, GRIDS, PAD, padsOf, padOf, gainOf, chokeKey, withPads } from './jam.mjs';
import { SET_STYLES, BAND_ROLES, FAMILY, bandPads, specOf, setOf, diceSet } from './jamset.mjs';
import { ROLE_NAMES, STYLE_NAMES, name } from './names.mjs';
import { W } from './lang.mjs';
import { info, hintOf } from './help.mjs';

const AHEAD = 0.12; // seconds scheduled ahead of the clock
const LATE = 0.03; // a tap this late (s) still counts as the step it missed
const HOLD = 450; // ms a pad is held to open its level
const PADS = 'orbit-beats.pads.v1'; // { <print>: { at, pads: { <piece>: { level, mute, choke } } } }
const SET = 'orbit-beats.jam-set'; // the built-in set last played: { seed, style }
const BUILT_IN = 'builtin'; // the built-in set's pads, kept as one kit's
// Every kit's pads on this phone. (A read that fails isn't "none": nothing is saved over it.)
function readPads() {
  try {
    const v = JSON.parse(localStorage.getItem(PADS) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return null;
  }
}
function readSet() {
  try {
    return setOf(JSON.parse(localStorage.getItem(SET) || 'null') || { seed: 7, style: SET_STYLES[0] });
  } catch {
    return setOf(null);
  }
}
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// api: { kit(), audio(), quiet(), styles(), band(set) -> the set's { pieces, roles, sr }, take(hits, beats, set|null) }
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
  jam.pad = i => sets[i] || PAD;

  const hasClips = () => api.kit().pieces.length > 0;
  const usingBand = () => !hasClips() || pick === 'band';
  const setId = () => `${set.seed}:${set.style}`;
  // The sound the pads play now (null: the set is still being made).
  const sound = () => (cur?.band ? (band?.id === setId() ? band : null) : api.kit());

  // ---- Drawing ----
  const playBtn = h('button', { class: 'q-btn tinted jam-play', type: 'button' });
  const recBtn = h('button', { class: 'q-btn tinted jam-rec', type: 'button' });
  const stopAllBtn = h('button', { class: 'q-btn plain', type: 'button', text: W('全停', 'All off') });
  const beatDots = h('div', { class: 'jam-beat', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('span', {}, [0, 1, 2, 3].map(() => h('i')))));
  const ticks = [...beatDots.querySelectorAll('i')];
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
  // 內建 / 我的片段: only once there are pieces.
  const srcSeg = segmented(
    [
      { id: 'band', label: W('內建', 'Built-in') },
      { id: 'mine', label: W('我的片段', 'My clips') }
    ],
    { value: 'band', label: W('打擊墊', 'Pads'), onChange: id => ((pick = id), stop(), draw()) }
  );
  srcSeg.classList.add('jam-src');
  // The built-in set: 🎲 a new one, or a groove; under it, what's playing.
  const dice = h('button', { class: 'jam-dice', type: 'button', 'aria-label': W('隨機換一組', 'A random new set'), text: '🎲', onclick: () => changeSet(diceSet(set)) });
  const chips = h('div', { class: 'jam-chips', role: 'group', 'aria-label': W('風格', 'Style') });
  const meta = h('p', { class: 'jam-meta' });
  const setRow = h('div', { class: 'jam-set' }, [h('div', { class: 'jam-set-row' }, [dice, chips]), meta]);
  const note = h('p', { class: 'studio-note', 'data-ctl': 'jam-note' });
  // 簡單: what the pads do, in two lines.
  const easyNote = h('p', { class: 'studio-note', 'data-ctl': 'jam-easy' }, [W('點打擊墊就會響，↻ 的會一直循環', 'Tap a pad to play it; ↻ ones loop'), ' ', info('loop'), h('br'), W('按「● 錄一段」，再按一次就變成一首歌', 'Tap ● Record, then again: it’s a song')]);
  // A row: its name (and the word's ⓘ), a line under it, its control; only: which of 簡單 / 進階 shows it.
  const row = (label, sub, ctl, { only = null, term = null } = {}) => h('div', { class: 'row', 'data-ctl': only }, [h('div', { class: 'label' }, [h('span', {}, [label, ...(term ? [' ', info(term)] : [])]), sub ? h('small', { text: sub }) : null]), ctl]);
  const grooveSub = h('small', {});
  const grooveRow = row(W('鼓', 'Groove'), null, h('div', { class: 'ctl' }, [grooveSw, styleSel]), { only: 'jam-groove', term: 'groove' });
  grooveRow.querySelector('.label').append(grooveSub);
  const body = h('section', { class: 'card jam' }, [
    h('div', { class: 'head' }, [h('h2', { text: W('即興', 'Jam') }), srcSeg]),
    setRow,
    h('div', { class: 'jam-bar' }, [playBtn, recBtn, stopAllBtn]),
    beatDots,
    padGrid,
    easyNote,
    grooveRow,
    h('div', { class: 'stack', 'data-ctl': 'jam-snap' }, [h('div', { class: 'label' }, [h('span', {}, [W('對齊', 'Snap'), ' ', info('snap')]), h('small', { text: hintOf('snap') })]), gridSeg]),
    note
  ]);

  function draw() {
    const mine = !usingBand();
    srcSeg.hidden = !hasClips();
    srcSeg.set?.(mine ? 'mine' : 'band');
    setRow.hidden = mine;
    styleSel.hidden = !mine;
    grooveSub.textContent = mine ? W('用你的鼓打的節奏', 'Played on your drums') : W('跟著這組的風格', 'In the set’s style');
    if (!panel.contains(body)) panel.replaceChildren(body);
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
      pads = padsOf(k.roles, loops).map(p => ({ ...p, fam: FAMILY[p.role] || 'drum' }));
    }
    bpm = cur.bpm;
    if (setsOf !== cur.print) {
      const all = readPads();
      sets = Object.fromEntries(Object.entries(all?.[cur.print]?.pads || {}).map(([i, p]) => [i, padOf(p)]));
      setsOf = cur.print;
    }
    hits.clear();
    padGrid.replaceChildren(
      ...pads.map(p => {
        const big = p.name ? W(...p.name) : String(p.i + 1);
        const small = p.name ? (p.sub ? W(...p.sub) : '') : name(ROLE_NAMES, p.role);
        const b = h('button', { class: `jam-pad${p.loop ? ' loop' : ''}`, type: 'button', 'data-i': String(p.i), 'data-fam': p.fam, 'aria-label': `${p.name ? big : `${small} ${big}`}${p.loop ? W('（循環）', ' (loop)') : ''}` }, [
          h('b', { text: big }),
          small ? h('small', { text: small }) : null,
          p.loop ? h('i', { class: 'mark', 'aria-hidden': 'true', text: p.name ? '↻' : `↻${p.beats}` }) : null,
          h('i', { class: 'lvl', 'aria-hidden': 'true' })
        ]);
        hits.set(p.i, b);
        paintPad(p.i);
        return b;
      })
    );
    padGrid.classList.toggle('loading', !sound());
    // My clips' groove: the styles picked in 做歌 (the first, until another is picked).
    if (!cur.band) {
      const styles = api.styles().length ? api.styles() : STYLES;
      if (!styles.includes(style)) style = styles[0];
      styleSel.replaceChildren(...styles.map(s => h('option', { value: s, text: name(STYLE_NAMES, s) })));
      styleSel.value = style;
    }
    setBacking();
    paintGroove();
    note.replaceChildren(h('span', { text: W(`${bpm} BPM · ↻ 循環在下一小節開始`, `${bpm} BPM · ↻ loops start on the next bar`) }), h('br'), h('span', { text: W('長按打擊墊：音量、靜音、切音', 'Hold a pad: level, mute, choke') }), h('br'), h('span', { text: W('錄好的一段變成一首歌（在「做歌」）', 'A take becomes a song (in Make)') }));
  }
  // The set's chips (its groove lit; one the dice found that isn't offered, first) and what it is.
  function paintSet() {
    const list = SET_STYLES.includes(set.style) ? SET_STYLES : [set.style, ...SET_STYLES];
    chips.replaceChildren(
      ...list.map(s =>
        h('button', {
          class: 'chip',
          type: 'button',
          'aria-pressed': String(s === set.style),
          text: name(STYLE_NAMES, s),
          // (Its own chip again: another set of the same groove.)
          onclick: () => changeSet({ seed: Math.floor(Math.random() * 1e9), style: s })
        })
      )
    );
    const key = `${NOTE_NAMES[sp.key.tonic]} ${sp.key.minor ? W('小調', 'minor') : W('大調', 'major')}`;
    meta.textContent = `${name(STYLE_NAMES, sp.style)} · ${sp.bpm} BPM · ${key}`;
  }
  // Another built-in set: what was playing goes on with it (the same pads'
  // loops, from its first bar), once it's made. (Changed during a take, the
  // take ends and plays as a song instead.)
  function changeSet(next) {
    const was = (running || waiting) && !jam.takes.length;
    const carry = was ? pads.filter(p => jam.loops.get(p.i)?.to === Infinity) : [];
    stop();
    set = setOf(next);
    sp = specOf(set);
    try {
      localStorage.setItem(SET, JSON.stringify(set));
    } catch {}
    drawPads();
    paintSet();
    if (!was) return makeBand();
    start();
    for (const p of carry) jam.toggle(p.i, 0, p.beats, { group: p.group, phase: p.phase });
    if (!running) for (const p of carry) hits.get(p.i)?.classList.add('wait');
    shown = -1;
  }
  // The set's sound, made in the worker (a second or two on a phone).
  function makeBand() {
    const id = setId();
    if (band?.id === id || making === id) return;
    making = id;
    padGrid.classList.add('loading');
    api.band(set).then(
      b => {
        if (making !== id) return;
        making = '';
        band = { id, pieces: b.pieces, roles: b.roles, sr: b.sr };
        if (!cur?.band) return;
        if (!panel.hidden) ready();
        padGrid.classList.remove('loading');
        if (waiting) ((waiting = false), start());
      },
      () => {
        if (making !== id) return;
        making = '';
        waiting = false;
        meta.textContent = W('這組做不出來，換一組試試 🎲', 'Couldn’t make this set: try another 🎲');
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
      title: p.name ? W(...p.name) : `${name(ROLE_NAMES, p.role)} ${p.i + 1}`,
      closeLabel: W('關閉', 'Close'),
      body: h('div', { class: 'card sheet-card jam-pad-sheet' }, [
        row(W('音量', 'Level'), null, h('div', { class: 'ctl' }, [level, pct])),
        row(W('靜音', 'Mute'), null, mute),
        h('div', { class: 'stack' }, [h('div', { class: 'label' }, [h('span', {}, [W('切音', 'Choke'), ' ', info('choke')]), h('small', { text: hintOf('choke') })]), choke])
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
  function paintTransport() {
    playBtn.textContent = waiting ? W('準備中…', 'Getting ready…') : running ? W('■ 停止', '■ Stop') : W('▶ 開始', '▶ Start');
    playBtn.classList.toggle('on', running);
    const rec = jam.recording();
    recBtn.classList.toggle('on', rec);
    recBtn.textContent = rec ? W('■ 完成', '■ Done') : W('● 錄一段', '● Record');
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
      for (const b of padGrid.children) b.classList.remove('wait');
      return paintTransport();
    }
    running = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    api.live?.(false);
    // (A take still open is kept up to here, rounded to its bar; one finishing its bar is kept whole.)
    jam.end(beatNow());
    voices.clear();
    // What's still sounding fades out at once (a four-bar part doesn't play on after ■).
    const c = api.audio();
    for (const v of live) fade(v, c.currentTime, 0.06);
    live.clear();
    looping.clear();
    finish();
    for (const b of padGrid.children) b.classList.remove('on', 'wait', 'hit');
    for (const d of ticks) d.classList.remove('on', 'past');
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
    for (const { hits: took, beats } of jam.done.splice(0)) if (took.length) api.take(took, beats, from);
  }
  // The beat: which of the four bars and beats (the cycle a four-bar part goes round in).
  let shown = -1;
  function paint() {
    if (!running) return;
    const beat = beatNow();
    const at = beat < 0 ? -1 : Math.floor(beat) % 16;
    if (at !== shown) {
      ticks.forEach((d, k) => (d.classList.toggle('on', k === at), d.classList.toggle('past', at >= 0 && k < at)));
      shown = at;
      const still = calm();
      for (const p of pads) {
        if (!p.loop) continue;
        const l = jam.loops.get(p.i);
        const pad = hits.get(p.i);
        const on = Boolean(l && beat >= l.from && beat < l.to);
        pad.classList.toggle('on', on);
        pad.classList.toggle('wait', Boolean(l && (beat < l.from || (l.to !== Infinity && beat < l.to))));
        // (Lit pads beat along.)
        if (on && !still && at >= 0) pad.animate?.([{ transform: 'scale(0.95)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' });
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
    // (Stopped: just that sound, now. The groove starts with ▶ or a loop.)
    if (!running) {
      if (ready()) play(p.i, api.audio().currentTime + 0.005);
      return;
    }
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
    const r = jam.toggle(p.i, beat ?? Math.max(0, running ? beatNow() : 0), p.beats, { group: p.group, phase: p.phase });
    if (running) cutLoops(r.off, r.at);
    else hits.get(p.i)?.classList.toggle('wait', r.on);
    shown = -1;
  };
  padGrid.addEventListener('pointerup', lift(true));
  padGrid.addEventListener('pointercancel', lift(false));
  padGrid.addEventListener('contextmenu', e => e.preventDefault());
  playBtn.onclick = () => (running || waiting ? stop() : start());
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
    hidden: () => stop(),
    stop,
    playing: () => running
  };
}

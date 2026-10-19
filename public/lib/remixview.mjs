// The two small sheets: 重新混音 (Remix) and 取出片段 (Take a clip). Plain words, one tap
// each. They only draw and ask; app.js makes the song and keeps the clip.
import { h, sheet, toast } from './ui.mjs';
import { icon } from './icons.mjs';
import { W } from './lang.mjs';
import { STYLE_NAMES, SECTION_NAMES, name } from './names.mjs';
import { STYLE_ORDER, NOTE_NAMES } from '../engine.mjs';
import { CAN, PARTS, SPEED, bpmAfter, lengthAfter } from './remix.mjs';
import { bandSounds, PART_LIST } from './radio.mjs';
import { INSTRUMENT_NAMES } from './synth.mjs';
import { clock } from './length.mjs';
import { chipsOf, readRecent, noteRecent, genreSheet } from './genres.mjs';

export const PART_NAMES = { all: ['全部', 'All'], drums: ['鼓', 'Drums'], bass: ['貝斯', 'Bass'], melody: ['旋律', 'Melody'] };

// kind: 'radio' | 'band' | 'kit' | 'jam' (what the song is, so what can change); now: where it stands (lib/remix.mjs remixNow);
// note: one short line, or ''. Changes are picked first and made together with one tap:
// pick(choice) is called with a choice (lib/remix.mjs remix) or 'surprise'.
export function remixSheet({ kind, now, note = '', pick }) {
  const can = CAN[kind] || CAN.kit;
  const st = { style: now.style, speed: 0, length: 0, shift: now.shift || 0, mute: [...(now.mute || [])], fade: Boolean(now.fade), lead: null, chords: null, sounds: false };
  const go = choice => {
    s.close();
    pick(choice);
  };
  // What's been picked, as a remix's choice (only what differs from the song).
  const choice = () => {
    const c = {};
    if (st.style && st.style !== now.style) c.style = st.style;
    if (st.speed) c.speed = st.speed;
    if (st.length) c.length = st.length;
    if (can.key && st.shift !== (now.shift || 0)) c.shift = st.shift;
    if (can.parts && (st.mute.length !== now.mute.length || st.mute.some(p => !now.mute.includes(p)))) c.mute = [...st.mute];
    if (can.fade && st.fade !== Boolean(now.fade)) c.fade = st.fade;
    if (st.lead) c.lead = st.lead;
    if (st.chords) c.chords = st.chords;
    if (st.sounds) c.sounds = true;
    return c;
  };
  const chip = (label, on, onclick, cls = '') => h('button', { class: `chip ${cls}`.trim(), type: 'button', 'aria-pressed': String(on), text: label, onclick });
  const row = (label, control) => h('div', { class: 'rx-row' }, [h('div', { class: 'rx-lab', text: label }), control]);
  const stepper = (val, dec, inc) =>
    h('div', { class: 'rx-step' }, [
      h('button', { type: 'button', 'aria-label': W('減少', 'Less'), html: icon('minus'), disabled: !dec, onclick: dec || null }),
      h('span', { class: 'rx-val', text: val }),
      h('button', { type: 'button', 'aria-label': W('增加', 'More'), html: icon('plus'), disabled: !inc, onclick: inc || null })
    ]);
  const body = h('div', { class: 'card sheet-card rx-body' });
  const made = h('button', { class: 'primary', type: 'button', html: `${icon('shuffle')}<span>${W('做出混音', 'Make the remix')}</span>`, onclick: () => go(choice()) });
  const set = f => () => (f(), paint());
  function paint() {
    const parts = [];
    if (can.style) {
      const others = STYLE_ORDER.filter(x => x !== now.style && x !== st.style);
      const shown = [st.style, ...chipsOf('', readRecent(), others)].filter(Boolean).slice(0, 7);
      parts.push(
        h('div', { class: 'rx-lab rx-top', text: W('風格', 'Style') }),
        h('div', { class: 'rx-styles' }, [
          h('button', { class: 'chip rx-rand', type: 'button', html: `${icon('dice')}<span>${W('隨機', 'Random')}</span>`, onclick: set(() => ((st.style = others[Math.floor(Math.random() * others.length)]), (st.lead = st.chords = null))) }),
          ...shown.map(x => chip(name(STYLE_NAMES, x), x === st.style, set(() => (x !== st.style && ((st.lead = st.chords = null), noteRecent(x)), (st.style = x))))),
          h('button', { class: 'chip rx-more', type: 'button', html: `<span>${W('更多', 'More')}</span>${icon('chevron')}`, onclick: () => genreSheet({ selected: st.style, styles: STYLE_ORDER, onPick: x => ((st.style = x), (st.lead = st.chords = null), paint()) }) })
        ])
      );
    }
    if (can.speed) {
      const at = k => (now.bpm ? `${Math.round(kind === 'radio' ? bpmAfter(now.bpm, k) : now.bpm * SPEED ** k)} BPM` : `×${(SPEED ** k).toFixed(2)}`);
      const moves = d => (kind === 'radio' && now.bpm ? bpmAfter(now.bpm, st.speed + d) !== bpmAfter(now.bpm, st.speed) : Math.abs(st.speed + d) <= 3);
      parts.push(row(W('速度', 'Tempo'), stepper(at(st.speed), moves(-1) && set(() => st.speed--), moves(1) && set(() => st.speed++))));
    }
    if (can.length && now.seconds) {
      const moves = d => lengthAfter(now.seconds, st.length + d) !== lengthAfter(now.seconds, st.length);
      parts.push(row(W('長度', 'Length'), stepper(clock(lengthAfter(now.seconds, st.length)), moves(-1) && set(() => st.length--), moves(1) && set(() => st.length++))));
    }
    if (can.key && now.key) {
      const key = { ...now.key, tonic: (now.key.tonic - (now.shift || 0) + st.shift + 24) % 12 };
      const label = `${NOTE_NAMES[key.tonic]} ${key.minor ? W('小調', 'minor') : W('大調', 'major')}`;
      parts.push(row(W('調', 'Key'), stepper(label, st.shift > -6 && set(() => st.shift--), st.shift < 6 && set(() => st.shift++))));
    }
    if (can.pick) {
      const band = bandSounds(st.style);
      const same = st.style === now.style;
      const lead = st.lead || (same ? now.lead : null);
      const chords = st.chords || (same ? now.chords : null);
      parts.push(
        row(W('主旋律', 'Lead'), h('div', { class: 'rx-scroll' }, band.leads.map(x => chip(name(INSTRUMENT_NAMES, x), x === lead, set(() => (st.lead = same && x === now.lead ? null : x)))))),
        row(W('和弦', 'Chords'), h('div', { class: 'rx-scroll' }, band.chords.map(x => chip(name(INSTRUMENT_NAMES, x), x === chords, set(() => (st.chords = same && x === now.chords ? null : x))))))
      );
    } else if (can.sounds) {
      parts.push(row(W('樂器', 'Sounds'), h('div', { class: 'rx-scroll' }, [chip(W('換一組', 'New ones'), st.sounds, set(() => (st.sounds = !st.sounds)))])));
    }
    if (can.parts) {
      const on = p => !st.mute.includes(p);
      const flip = p => set(() => (on(p) ? st.mute.length < PART_LIST.length - 1 && st.mute.push(p) : st.mute.splice(st.mute.indexOf(p), 1)));
      parts.push(row(W('聲部', 'Parts'), h('div', { class: 'rx-scroll' }, PART_LIST.map(p => chip(name(PART_NAMES, p), on(p), flip(p))))));
    }
    if (can.fade) parts.push(row(W('結尾', 'Ending'), h('div', { class: 'rx-scroll' }, [chip(W('淡出', 'Fade out'), st.fade, set(() => (st.fade = !st.fade)))])));
    made.disabled = !Object.keys(choice()).length;
    body.replaceChildren(
      ...parts,
      h('div', { class: 'rx-foot' }, [h('button', { class: 'rx-surprise', type: 'button', html: `${icon('dice')}<span>${W('驚喜', 'Surprise me')}</span>`, onclick: () => go('surprise') }), made]),
      ...(note ? [h('p', { class: 'hint', text: note })] : [])
    );
  }
  paint();
  const s = sheet({ title: W('重新混音', 'Remix'), closeLabel: W('關閉', 'Close'), cls: 'rx-sheet', body });
  return s;
}

// plan: the song's sections [[type, bars]]; parts: whether the part picker shows;
// render(k, part) -> Promise<{ url, seconds, silent }> (url a WAV to loop); add(k, part) adds it to the clips;
// stop(): the song playing is paused before a preview.
export function clipSheet({ plan, parts, render, add, stop, closed }) {
  const audio = new Audio();
  audio.loop = true;
  let k = -1;
  let part = 'all';
  let seq = 0;
  let ready = null;
  const total = plan.reduce((a, [, n]) => a + n, 0);
  const secs = plan.map(([t, n], i) =>
    h('button', { class: 'rx-sec', type: 'button', style: { flex: String(n), background: `var(--${t})` }, 'aria-label': name(SECTION_NAMES, t), 'aria-pressed': 'false', onclick: () => choose(i) }, [h('span', { text: n / total >= 0.12 ? name(SECTION_NAMES, t) : '' })])
  );
  const strip = h('div', { class: 'rx-strip', role: 'group', 'aria-label': W('段落', 'Sections') }, secs);
  const seg = parts
    ? h(
        'div',
        { class: 'seg rx-parts', role: 'group' },
        PARTS.map(p => h('button', { type: 'button', 'aria-pressed': String(p === part), 'data-p': p, text: name(PART_NAMES, p), onclick: () => ((part = p), paintParts(), k >= 0 && make()) }))
      )
    : null;
  const paintParts = () => seg?.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.p === part)));
  const time = h('span', { class: 'rx-time' });
  const playBtn = h('button', { class: 'rx-play', type: 'button', 'aria-label': W('播放', 'Play'), html: icon('play'), disabled: true, onclick: () => (audio.paused ? audio.play().catch(() => {}) : audio.pause()) });
  const addBtn = h('button', { class: 'primary', type: 'button', html: `${icon('plus')}<span>${W('加到片段', 'Add to clips')}</span>`, disabled: true });
  audio.onplay = audio.onpause = () => (playBtn.innerHTML = icon(audio.paused ? 'play' : 'pause'));
  function choose(i) {
    k = i;
    secs.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    make();
  }
  async function make() {
    const mine = ++seq;
    audio.pause();
    ready = null;
    playBtn.disabled = addBtn.disabled = true;
    let r;
    try {
      r = await render(k, part);
    } catch {
      if (mine === seq) toast(W('取不出來', "Couldn't cut it"), { tone: 'bad' });
      return;
    }
    if (mine !== seq) return;
    if (r.silent) {
      toast(W('這段沒有這個聲音', 'Nothing of that here'));
      return;
    }
    ready = r;
    audio.src = r.url;
    time.textContent = clock(r.seconds);
    playBtn.disabled = addBtn.disabled = false;
    stop?.();
    audio.play().catch(() => {});
  }
  addBtn.onclick = async () => {
    if (!ready) return;
    addBtn.disabled = true;
    const ok = await add(k, part);
    if (ok !== false) s.close();
    else addBtn.disabled = false;
  };
  const s = sheet({
    title: W('取出片段', 'Take a clip'),
    closeLabel: W('關閉', 'Close'),
    cls: 'rx-sheet',
    onClose: () => {
      seq++;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      closed?.();
    },
    body: h('div', { class: 'card sheet-card' }, [strip, seg, h('div', { class: 'rx-now' }, [playBtn, time]), addBtn])
  });
  // (Opens on the first hook, or the longest part: the clip is ready to add at once.)
  const hook = plan.findIndex(([t]) => t === 'hook');
  const longest = plan.reduce((best, [, n], i) => (n > plan[best][1] ? i : best), 0);
  if (plan.length) choose(hook >= 0 ? hook : longest);
  return s;
}

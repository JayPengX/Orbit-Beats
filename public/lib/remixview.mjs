// The two small sheets: 重新混音 (Remix) and 取出片段 (Take a clip). Plain words, one tap
// each. They only draw and ask; app.js makes the song and keeps the clip.
import { h, sheet, toast } from './ui.mjs';
import { icon } from './icons.mjs';
import { W } from './lang.mjs';
import { STYLE_NAMES, SECTION_NAMES, name } from './names.mjs';
import { STYLE_ORDER } from '../engine.mjs';
import { CAN, PARTS } from './remix.mjs';
import { clock } from './length.mjs';
import { chipsOf, readRecent, noteRecent, genreSheet } from './genres.mjs';

export const PART_NAMES = { all: ['全部', 'All'], drums: ['鼓', 'Drums'], bass: ['貝斯', 'Bass'], melody: ['旋律', 'Melody'] };

// kind: 'radio' | 'band' | 'kit' | 'jam' (what the song is, so what can change); style: its groove now;
// length(dir) -> the length that tap would make, in seconds | null; note: one short line, or ''.
// pick(choice) is called with a choice (lib/remix.mjs remix) or 'surprise'.
export function remixSheet({ kind, style, length, note = '', pick }) {
  const can = CAN[kind] || CAN.kit;
  const go = choice => {
    s.close();
    pick(choice);
  };
  const big = (ic, label, sub, onclick) =>
    h('button', { class: 'rx-big', type: 'button', onclick }, [h('span', { class: 'rx-ic', html: icon(ic) }), h('span', { class: 'rx-t', text: label }), sub ? h('small', { text: sub }) : null]);
  const rows = [];
  const others = STYLE_ORDER.filter(st => st !== style);
  if (can.style) {
    rows.push(
      h('div', { class: 'rx-lab', text: W('換風格', 'New style') }),
      h('div', { class: 'rx-styles' }, [
        h('button', { class: 'chip rx-rand', type: 'button', html: `${icon('dice')}<span>${W('隨機', 'Random')}</span>`, onclick: () => go({ style: 'random' }) }),
        ...chipsOf('', readRecent(), others).map(st => h('button', { class: 'chip', type: 'button', text: name(STYLE_NAMES, st), onclick: () => (noteRecent(st), go({ style: st })) })),
        h('button', { class: 'chip rx-more', type: 'button', html: `<span>${W('更多', 'More')}</span>${icon('chevron')}`, onclick: () => genreSheet({ selected: style, styles: others, onPick: st => go({ style: st }) }) })
      ])
    );
  }
  const grid = [];
  if (can.speed) grid.push(big('arrow-up', W('更快', 'Faster'), '', () => go({ speed: 1 })), big('arrow-down', W('更慢', 'Slower'), '', () => go({ speed: -1 })));
  if (can.length) {
    const up = length(1);
    const down = length(-1);
    grid.push(big('plus', W('更長', 'Longer'), up ? clock(up) : '', () => go({ length: 1 })), big('minus', W('更短', 'Shorter'), down ? clock(down) : '', () => go({ length: -1 })));
  }
  if (can.sounds) grid.push(big('note', W('換樂器', 'New sounds'), '', () => go({ sounds: true })));
  const s = sheet({
    title: W('重新混音', 'Remix'),
    closeLabel: W('關閉', 'Close'),
    cls: 'rx-sheet',
    body: h('div', { class: 'card sheet-card' }, [
      ...rows,
      grid.length ? h('div', { class: 'rx-grid' }, grid) : null,
      h('button', { class: 'primary rx-surprise', type: 'button', html: `${icon('dice')}<span>${W('驚喜', 'Surprise me')}</span>`, onclick: () => go('surprise') }),
      note ? h('p', { class: 'hint', text: note }) : null
    ])
  });
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

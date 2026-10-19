// 節奏遊戲 on screen: a dark stage over the app. The pick (today's
// challenge, a mood's songs, the level), the round (a 60fps canvas: a
// highway in perspective, the song's own colours, notes falling to the line,
// sparks, rings and beams on every hit, the combo, the fever, the sections
// named as they come) and the results (the grade, the score, the tally, the
// best). The song is made by the worker (lib/make.mjs's game: the radio's
// song whole and its charts, lib/game.mjs) and played on the page's
// AudioContext, whose clock judges every tap.
// api: { make (lib/maker.mjs), audio() (the page's AudioContext), quiet(), title(seed), keep(item)?, kept(id)? }

import { h, segmented } from './ui.mjs';
import { icon } from './icons.mjs';
import { W, en } from './lang.mjs';
import { radioSpec, MOODS } from './radio.mjs';
import { coverSvg, coverUrl, coverPalette } from './cover.mjs';
import { STYLE_NAMES, SECTION_NAMES, name } from './names.mjs';
import { dayKey } from './stations.mjs';
import { LANES, LEVELS, LEVEL_NAMES, WINDOWS, GRADE_NAMES, judge, unitsOf, scoreOf, FEVER, dailyOf, setOf, bestKey, withRound } from './game.mjs';

const STORE = 'orbit-beats-game.v1';
const LEAD = 2.4; // seconds of countdown before the song's first moment
const APPROACH = { easy: 1.7, normal: 1.4, hard: 1.15, expert: 0.95 }; // how long a note falls (s)
const DEPTH = 3; // the highway's far end is a quarter of its near width
const GRADE_TINT = { perfect: '#ffd76a', great: '#6ee7ff', good: '#9ef0a8', miss: '#ff6b81' };
const RANK_TINT = { 'S+': '#ffd76a', S: '#ffd76a', A: '#7ce3ff', B: '#9ef0a8', C: '#d7c3ff', D: '#ff9aa9' };
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const CSS = `
.gm { position: fixed; inset: 0; z-index: 90; background: #06060b; color: #fff; overflow: hidden; --text: #fff; --text-2: rgba(255,255,255,.7); --text-3: rgba(255,255,255,.45); --fill: rgba(255,255,255,.14); --fill-2: rgba(255,255,255,.26); --card: rgba(255,255,255,.08); --line: rgba(255,255,255,.12); -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; opacity: 0; transform: scale(1.04); transition: opacity .28s ease, transform .38s cubic-bezier(.2,.8,.2,1); }
.gm.in { opacity: 1; transform: none; }
.gm[hidden] { display: none; }
body.gm-open:has(.gm.in) { overflow: hidden; }
body.gm-open:has(.gm.in) > :not(.gm) { visibility: hidden; }
.gm *, .gm *::before, .gm *::after { box-sizing: border-box; }
.gm-bg { position: absolute; inset: -80px; width: calc(100% + 160px); height: calc(100% + 160px); object-fit: cover; filter: blur(70px) saturate(1.7) brightness(.55); transform: translateZ(0); transition: opacity .6s; pointer-events: none; }
.gm-shade { position: absolute; inset: 0; background: radial-gradient(120% 70% at 50% 0%, rgba(0,0,0,0) 0%, rgba(6,6,11,.55) 60%, rgba(6,6,11,.92) 100%); pointer-events: none; }
.gm-screen { position: absolute; inset: 0; display: flex; flex-direction: column; }
.gm-screen[hidden] { display: none; }
.gm-pick { overflow-y: auto; overscroll-behavior: contain; padding: max(8px, env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom)); align-items: center; }
.gm-pick > * { width: min(100%, 520px); flex: none; }
.gm-top { display: flex; align-items: center; gap: 8px; height: 48px; }
.gm-x { flex: none; width: 44px; height: 44px; margin-left: -10px; border: 0; background: none; color: #fff; display: grid; place-items: center; touch-action: manipulation; }
.gm-x svg { width: 28px; height: 28px; }
.gm-top h1 { flex: 1; margin: 0; font-size: 17px; font-weight: 700; text-align: center; letter-spacing: -.01em; }
.gm-top .gm-gap { width: 34px; }
.gm-title { margin: 6px 0 14px; font-size: 34px; font-weight: 800; letter-spacing: -.02em; line-height: 1.1; }
.gm-title i { font-style: normal; background: linear-gradient(90deg, #ff5fa2, #ffb44a 40%, #5ee2ff 80%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.gm-hero { position: relative; display: block; width: 100%; aspect-ratio: 1 / 1; max-height: 46vh; padding: 0; border: 0; border-radius: 26px; overflow: hidden; background: #111; color: #fff; text-align: left; box-shadow: 0 24px 60px rgba(0,0,0,.5); transition: transform .3s cubic-bezier(.2,.8,.2,1); touch-action: manipulation; }
.gm-hero:active { transform: scale(.98); }
.gm-hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; animation: gm-drift 18s ease-in-out infinite alternate; }
.gm-hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,.72) 100%); }
.gm-hero-text { position: absolute; z-index: 1; left: 20px; right: 92px; bottom: 20px; display: flex; flex-direction: column; gap: 3px; }
.gm-eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .04em; white-space: nowrap; text-transform: uppercase; color: rgba(255,255,255,.8); }
.gm-hero-text b { font-size: clamp(22px, 7vw, 28px); font-weight: 800; letter-spacing: -.01em; line-height: 1.15; }
.gm-hero-text span { font-size: 15px; color: rgba(255,255,255,.78); }
.gm-go { position: absolute; z-index: 1; right: 18px; bottom: 18px; width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; background: #fff; color: #0b0b12; box-shadow: 0 0 0 0 rgba(255,255,255,.5); animation: gm-ping 2.2s ease-out infinite; }
.gm-go svg { width: 30px; height: 30px; margin-left: 3px; }
.gm-best { position: absolute; z-index: 1; top: 16px; right: 16px; min-width: 40px; padding: 5px 11px; border-radius: 999px; font-size: 14px; font-weight: 800; text-align: center; background: rgba(0,0,0,.38); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
.gm-sect { margin: 26px 0 10px; font-size: 22px; font-weight: 800; letter-spacing: -.01em; }
.gm-pick .q-seg { margin-top: 18px; --q-label: #fff; --q-fill-3: rgba(255,255,255,.12); }
.gm .q-seg::before { background: #fff !important; }
.gm .q-seg > button { padding: 0 4px; }
.gm .q-seg > button[aria-selected='true'] { color: #0b0b12; }
.gm-chips { display: flex; gap: 8px; padding-bottom: 2px; overflow-x: auto; scrollbar-width: none; }
.gm-chips::-webkit-scrollbar { display: none; }
.gm-chip { flex: none; height: 36px; padding: 0 16px; border: 0; border-radius: 18px; background: var(--fill); color: #fff; font-size: 15px; font-weight: 600; touch-action: manipulation; transition: background .2s, color .2s, transform .2s; }
.gm-chip[aria-pressed="true"] { background: #fff; color: #0b0b12; }
.gm-chip:active { transform: scale(.95); }
.gm-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; margin-top: 14px; }
.gm-row { display: flex; align-items: center; gap: 14px; width: 100%; padding: 10px 12px 10px 10px; border: 0; border-radius: 18px; background: var(--card); color: #fff; text-align: left; touch-action: manipulation; transition: transform .2s cubic-bezier(.2,.8,.2,1), background .2s; animation: gm-in .45s cubic-bezier(.2,.8,.2,1) both; }
.gm-row:active { transform: scale(.98); background: var(--fill); }
.gm-row img { flex: none; width: 58px; height: 58px; border-radius: 12px; object-fit: cover; box-shadow: 0 4px 14px rgba(0,0,0,.35); }
.gm-row-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.gm-row-t b { font-size: 17px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gm-row-t span { font-size: 14px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gm-rank { flex: none; min-width: 34px; height: 30px; padding: 0 8px; border-radius: 10px; display: grid; place-items: center; font-size: 15px; font-weight: 800; background: rgba(255,255,255,.1); color: var(--text-3); }
.gm-rank.on { color: #0b0b12; }
.gm-row-go { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--fill); }
.gm-row-go svg { width: 16px; height: 16px; margin-left: 2px; }
.gm-stage { touch-action: none; }
.gm-buzz { position: absolute; width: 1px; height: 1px; overflow: hidden; contain: strict; opacity: 0; pointer-events: none; }
.gm-stage canvas, .gm-glow { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.gm-glow { opacity: .35; pointer-events: none; will-change: opacity; }
.gm:has(.gm-stage:not([hidden])) > .gm-bg, .gm:has(.gm-stage:not([hidden])) > .gm-shade { display: none; }
.gm-hud { position: absolute; left: 0; right: 0; top: 0; padding: max(8px, env(safe-area-inset-top)) 12px 0; display: flex; align-items: center; gap: 10px; pointer-events: none; }
.gm-hud > * { pointer-events: auto; }
.gm-pause { flex: none; width: 44px; height: 44px; border: 0; border-radius: 50%; background: rgba(255,255,255,.14); color: #fff; display: grid; place-items: center; touch-action: manipulation; }
.gm-pause svg { width: 20px; height: 20px; }
.gm-meter { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.gm-meter-t { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.gm-meter-t b { flex: 1; min-width: 0; font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gm-score { flex: none; font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.gm-prog { height: 4px; border-radius: 2px; background: rgba(255,255,255,.14); overflow: hidden; }
.gm-prog i { display: block; height: 100%; width: 100%; transform: scaleX(0); transform-origin: 0 50%; will-change: transform; border-radius: 2px; background: linear-gradient(90deg, var(--gm-a, #ff5fa2), var(--gm-b, #5ee2ff)); }
.gm-load { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; gap: 18px; text-align: center; transition: opacity .35s; }
.gm-load[hidden] { display: none; }
.gm-load img { width: 168px; height: 168px; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,.5); animation: gm-breathe 1.1s ease-in-out infinite alternate; }
.gm-load b { font-size: 22px; font-weight: 800; }
.gm-load span { font-size: 15px; color: var(--text-2); }
.gm-menu { position: absolute; inset: 0; z-index: 3; display: grid; place-items: center; background: rgba(6,6,11,.62); -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); animation: gm-fade .2s ease both; }
.gm-menu[hidden] { display: none; }
.gm-menu-box { width: min(calc(100% - 48px), 340px); display: grid; gap: 12px; text-align: center; }
.gm-menu-box h2 { margin: 0 0 8px; font-size: 28px; font-weight: 800; }
.gm-btn { height: 54px; border: 0; border-radius: 16px; background: var(--fill); color: #fff; font-size: 17px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; touch-action: manipulation; transition: transform .2s; }
.gm-btn svg { width: 20px; height: 20px; }
.gm-btn.main { background: #fff; color: #0b0b12; }
.gm-btn:active { transform: scale(.97); }
.gm-sync { display: flex; align-items: center; gap: 10px; margin-top: 8px; padding: 8px 10px; border-radius: 16px; background: rgba(255,255,255,.06); }
.gm-sync span { flex: 1; text-align: left; font-size: 15px; color: var(--text-2); }
.gm-sync b { min-width: 64px; font-size: 16px; font-variant-numeric: tabular-nums; }
.gm-sync button { width: 40px; height: 40px; border: 0; border-radius: 12px; background: var(--fill); color: #fff; display: grid; place-items: center; touch-action: manipulation; }
.gm-sync button svg { width: 18px; height: 18px; }
.gm-done { overflow-y: auto; overscroll-behavior: contain; align-items: center; padding: max(8px, env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom)); }
.gm-done > * { width: min(100%, 440px); flex: none; }
.gm-res { position: relative; display: grid; justify-items: center; gap: 4px; margin-top: 4px; text-align: center; }
.gm-res img { width: 92px; height: 92px; border-radius: 18px; box-shadow: 0 12px 30px rgba(0,0,0,.45); }
.gm-res-t { margin-top: 10px; font-size: 20px; font-weight: 800; }
.gm-res-s { font-size: 14px; color: var(--text-2); }
.gm-grade { position: relative; margin: 14px 0 2px; font-size: 128px; line-height: 1; font-weight: 900; letter-spacing: -.04em; color: var(--gm-rank, #fff); text-shadow: 0 0 28px var(--gm-rank, #fff), 0 0 70px var(--gm-rank, #fff); animation: gm-stamp .7s cubic-bezier(.2,1.6,.4,1) .15s both; }
.gm-flag { padding: 5px 12px; border-radius: 999px; font-size: 13px; font-weight: 800; letter-spacing: .06em; color: #0b0b12; background: linear-gradient(90deg, #ffd76a, #ff9de2, #7ce3ff); animation: gm-in .5s ease .7s both; }
.gm-flag[hidden] { display: none; }
.gm-big { margin-top: 8px; font-size: 44px; font-weight: 900; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.gm-new { font-size: 13px; font-weight: 800; letter-spacing: .08em; color: #ffd76a; animation: gm-in .4s ease 1s both, gm-glow 1.2s ease-in-out 1.4s infinite alternate; }
.gm-new[hidden] { display: none; }
.gm-tally { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 20px; }
.gm-tally div { padding: 12px 4px; border-radius: 16px; background: var(--card); display: grid; gap: 2px; text-align: center; animation: gm-in .45s cubic-bezier(.2,.8,.2,1) both; }
.gm-tally b { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.gm-tally span { font-size: 12.5px; font-weight: 600; color: var(--text-2); }
.gm-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.gm-stats div { padding: 12px 14px; border-radius: 16px; background: var(--card); display: flex; justify-content: space-between; align-items: baseline; gap: 8px; animation: gm-in .45s cubic-bezier(.2,.8,.2,1) .2s both; }
.gm-stats span { font-size: 14px; color: var(--text-2); }
.gm-stats b { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.gm-acts { display: grid; gap: 10px; margin-top: 22px; }
.gm-acts .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@keyframes gm-drift { from { transform: scale(1.02); } to { transform: scale(1.12) translate(-2%, 1%); } }
@keyframes gm-ping { 0% { box-shadow: 0 0 0 0 rgba(255,255,255,.55); } 70%, 100% { box-shadow: 0 0 0 18px rgba(255,255,255,0); } }
@keyframes gm-breathe { from { transform: scale(.96); } to { transform: scale(1.04); } }
@keyframes gm-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes gm-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes gm-stamp { 0% { opacity: 0; transform: scale(2.6) rotate(-8deg); } 60% { opacity: 1; } 100% { opacity: 1; transform: none; } }
@keyframes gm-glow { from { opacity: .6; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .gm, .gm-hero img, .gm-go, .gm-load img, .gm-grade, .gm-row, .gm-tally div, .gm-stats div, .gm-flag, .gm-new { animation: none; transition: none; } }
`;

export function mountGame(host, api) {
  document.head.append(h('style', { text: CSS }));
  // ---- What's kept on this phone: the best of each song and level, the level, the timing ----
  let store = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORE) || 'null') || {};
    } catch {
      return {};
    }
  })();
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(store));
    } catch {}
  };
  let level = LEVELS.includes(store.level) ? store.level : 'normal';
  let mood = store.mood && (store.mood === 'all' || MOODS[store.mood]) ? store.mood : 'all';
  const offset = () => (Number.isFinite(store.offset) ? store.offset : 0);

  // A song to play: its spec, and what it is (the radio's spec is drawn from its seed, no sound made).
  const itemOf = s => {
    const sp = radioSpec(s.seed, s.mood || 'all', s.style || null);
    return { seed: s.seed, mood: s.mood || 'all', style: sp.style, bpm: sp.bpm, key: sp.key, title: s.title || api.title(s.seed) };
  };
  const coverOf = it => coverUrl(coverSvg({ seed: it.seed, style: it.style, mood: it.mood, key: it.key, bpm: it.bpm, text: false }));
  const subOf = it => `${name(STYLE_NAMES, it.style)} · ${it.bpm} BPM`;
  const bestOf = (it, lv = level) => store.bests?.[bestKey(it, lv)] || null;

  // ---- The screens ----
  const bg = h('img', { class: 'gm-bg', alt: '', 'aria-hidden': 'true', draggable: 'false' });
  const pick = h('div', { class: 'gm-screen gm-pick' });
  const stage = h('div', { class: 'gm-screen gm-stage', hidden: true });
  const done = h('div', { class: 'gm-screen gm-done', hidden: true });
  const root = h('div', { class: 'gm', role: 'dialog', 'aria-modal': 'true', 'aria-label': W('節奏遊戲', 'Rhythm game'), hidden: true }, [bg, h('i', { class: 'gm-shade', 'aria-hidden': 'true' }), pick, stage, done]);
  host.append(root);
  const show = el => {
    for (const s of [pick, stage, done]) s.hidden = s !== el;
  };
  const xBtn = (label, onclick, ic = 'down') => h('button', { class: 'gm-x', type: 'button', 'aria-label': label, html: icon(ic), onclick });

  // ---- The pick ----
  let list = [];
  let today = null;
  function drawPick() {
    const day = dayKey();
    today = itemOf(dailyOf(day));
    list = setOf(day, mood).map(itemOf);
    bg.src = coverOf(today);
    const best = bestOf(today);
    const hero = h('button', { class: 'gm-hero', type: 'button', 'aria-label': `${W('今日挑戰', "Today's challenge")} ${today.title}`, onclick: () => play(today, [today, ...list]) }, [
      h('img', { alt: '', src: coverOf(today), draggable: 'false' }),
      best ? h('span', { class: 'gm-best', text: best.grade, style: { color: RANK_TINT[best.grade] } }) : null,
      h('span', { class: 'gm-hero-text' }, [h('span', { class: 'gm-eyebrow', text: W('今日挑戰', "Today's challenge") }), h('b', { text: today.title }), h('span', { text: subOf(today) })]),
      h('span', { class: 'gm-go', html: icon('play') })
    ]);
    const seg = segmented(LEVELS.map(id => ({ id, label: name(LEVEL_NAMES, id) })), { value: level, big: true, label: W('難度', 'Level'), onChange: v => ((level = store.level = v), save(), drawPick()) });
    const chips = h(
      'div',
      { class: 'gm-chips', role: 'group', 'aria-label': W('心情', 'Mood') },
      ['all', ...Object.keys(MOODS).filter(id => id !== 'all')].map(id =>
        h('button', { class: 'gm-chip', type: 'button', 'aria-pressed': String(id === mood), text: id === 'all' ? W('隨機', 'Mix') : en ? MOODS[id].en : MOODS[id].zh, onclick: () => ((mood = store.mood = id), save(), drawPick()) })
      )
    );
    const rows = list.map((it, k) => {
      const b = bestOf(it);
      return h('button', { class: 'gm-row', type: 'button', style: { animationDelay: `${k * 40}ms` }, onclick: () => play(it, list) }, [
        h('img', { alt: '', src: coverOf(it), draggable: 'false', loading: 'lazy' }),
        h('span', { class: 'gm-row-t' }, [h('b', { text: it.title }), h('span', { text: subOf(it) })]),
        b ? h('span', { class: 'gm-rank on', text: b.grade, style: { background: RANK_TINT[b.grade] } }) : h('span', { class: 'gm-row-go', html: icon('play') })
      ]);
    });
    pick.replaceChildren(
      h('div', { class: 'gm-top' }, [xBtn(W('關閉', 'Close'), close), h('h1', { text: '' }), h('span', { class: 'gm-gap' })]),
      h('h2', { class: 'gm-title', html: W('跟著<i>節拍</i>點', 'Tap to the <i>beat</i>') }),
      hero,
      seg,
      h('h2', { class: 'gm-sect', text: W('今天的歌', "Today's songs") }),
      chips,
      h('div', { class: 'gm-list' }, rows)
    );
    // (The day's challenge is made while you look: one tap and it starts.)
    warm(today);
  }

  // ---- Songs made, and their sound ----
  const made = new Map(); // id -> promise of { info, charts, buffer? , wav? }
  const idOf = it => `${it.seed}:${it.mood}:${it.style}`;
  function warm(it) {
    const id = idOf(it);
    if (!made.has(id)) {
      made.set(
        id,
        api.make.game({ seed: it.seed, mood: it.mood, style: it.style }).catch(e => {
          made.delete(id);
          throw e;
        })
      );
      while (made.size > 4) made.delete(made.keys().next().value);
    }
    return made.get(id);
  }
  const buffers = new Map(); // id -> AudioBuffer
  async function bufferOf(ctx, it, m) {
    const id = idOf(it);
    if (buffers.has(id)) return buffers.get(id);
    const bytes = m.wav;
    const buf = await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    buffers.set(id, buf);
    while (buffers.size > 3) buffers.delete(buffers.keys().next().value);
    return buf;
  }

  // ---- The stage ----
  // Three layers, so a frame redraws only what moves: the road and everything still (drawn once a
  // song), a glow on the beat (its opacity only), and the notes, sparks and words (one canvas).
  const back = h('canvas', { class: 'gm-back', 'aria-hidden': 'true' });
  const glowEl = h('i', { class: 'gm-glow', 'aria-hidden': 'true' });
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  const cx2 = canvas.getContext('2d');
  const scoreEl = h('span', { class: 'gm-score', text: '0' });
  const titleEl = h('b');
  const progEl = h('i');
  const pauseBtn = h('button', { class: 'gm-pause', type: 'button', 'aria-label': W('暫停', 'Pause'), html: icon('pause'), onclick: () => pause() });
  const loadImg = h('img', { alt: '' });
  const loadT = h('b');
  const loadS = h('span');
  const load = h('div', { class: 'gm-load' }, [loadImg, loadT, loadS]);
  const syncVal = h('b');
  const paintSync = () => (syncVal.textContent = `${offset() > 0 ? '+' : ''}${offset()} ms`);
  const nudge = d => ((store.offset = Math.max(-300, Math.min(300, offset() + d))), save(), paintSync());
  const menuEl = h('div', { class: 'gm-menu', hidden: true }, [
    h('div', { class: 'gm-menu-box' }, [
      h('h2', { text: W('暫停', 'Paused') }),
      h('button', { class: 'gm-btn main', type: 'button', html: `${icon('play')}<span>${W('繼續', 'Resume')}</span>`, onclick: () => resume() }),
      h('button', { class: 'gm-btn', type: 'button', html: `${icon('refresh')}<span>${W('重新開始', 'Restart')}</span>`, onclick: () => (menuEl.hidden = true, again()) }),
      h('button', { class: 'gm-btn', type: 'button', html: `${icon('back-chevron')}<span>${W('選歌', 'Songs')}</span>`, onclick: () => (stopRound(), show(pick), drawPick()) }),
      // (Bluetooth earphones lag: notes later or sooner, so a tap on the sound is a perfect.)
      h('div', { class: 'gm-sync' }, [
        h('span', { text: W('時間校正', 'Timing') }),
        h('button', { type: 'button', 'aria-label': W('提早', 'Earlier'), html: icon('minus'), onclick: () => nudge(-10) }),
        syncVal,
        h('button', { type: 'button', 'aria-label': W('延後', 'Later'), html: icon('plus'), onclick: () => nudge(10) })
      ])
    ])
  ]);
  // A tick in the hand on a hit (iOS: a switch flipped). One, made once and walled off, so a hit
  // touches nothing else on the page.
  const buzzEl = h('input', { type: 'checkbox', switch: '', tabindex: '-1' });
  const buzzBox = h('label', { class: 'gm-buzz', 'aria-hidden': 'true' }, [buzzEl]);
  const buzz = () => {
    try {
      buzzBox.click();
      navigator.vibrate?.(8);
    } catch {}
  };
  stage.append(buzzBox, back, glowEl, canvas, h('div', { class: 'gm-hud' }, [pauseBtn, h('div', { class: 'gm-meter' }, [h('div', { class: 'gm-meter-t' }, [titleEl, scoreEl]), h('div', { class: 'gm-prog' }, [progEl])])]), load, menuEl);

  // Geometry: the highway's lanes at the hit line, and how far up it runs.
  let Wd = 0;
  let Ht = 0;
  let dpr = 1;
  let geo = null;
  function layout() {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    Wd = stage.clientWidth || innerWidth;
    Ht = stage.clientHeight || innerHeight;
    for (const c of [back, canvas]) (c.width = Math.round(Wd * dpr)), (c.height = Math.round(Ht * dpr));
    const lane = Math.min((Wd - 20) / LANES, 104);
    const hitY = Ht - Math.max(118, Ht * 0.19);
    const topY = Ht * 0.16;
    const s1 = 1 / (1 + DEPTH);
    geo = { lane, hitY, cx: Wd / 2, vy: (topY - s1 * hitY) / (1 - s1), topY };
  }
  // A moment `dt` ahead of now -> its scale and height on screen.
  const proj = (dt, ap) => {
    const p = dt / ap;
    const s = 1 / (1 + Math.max(-0.24, p) * DEPTH);
    return { s, y: geo.vy + (geo.hitY - geo.vy) * s };
  };
  const laneX = (lane, s) => geo.cx + (lane - (LANES - 1) / 2) * geo.lane * s;
  const sprite = (w, hh, draw) => {
    const o = document.createElement('canvas');
    o.width = w;
    o.height = hh;
    draw(o.getContext('2d'));
    return o;
  };

  // Each lane's note, drawn once: a glowing gem in the lane's colour; its spark, a soft dot.
  let sprites = [];
  let dots = [];
  let tint = [];
  let hues = [];
  function paint(it) {
    const pal = coverPalette({ seed: it.seed, style: it.style, mood: it.mood, key: it.key, bpm: it.bpm });
    const [a, b] = pal.hues;
    hues = [a, (a + b) / 2 + (Math.abs(a - b) > 180 ? 180 : 0), b, b + 40].map(x => Math.round(x) % 360);
    tint = hues.map(x => `hsl(${x} 95% 64%)`);
    root.style.setProperty('--gm-a', tint[0]);
    root.style.setProperty('--gm-b', tint[3]);
    glowEl.style.background = `radial-gradient(70% 55% at 50% 12%, hsl(${hues[0]} 95% 55% / .55), hsl(${hues[2]} 95% 50% / .18) 55%, transparent 80%)`;
    sprites = tint.map((c, k) =>
      sprite(220, 104, g => {
        g.shadowColor = c;
        g.shadowBlur = 22;
        const grad = g.createLinearGradient(0, 24, 0, 80);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.35, c);
        grad.addColorStop(1, `hsl(${hues[k]} 90% 42%)`);
        g.fillStyle = grad;
        rounded(g, 24, 24, 172, 56, 28);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,.75)';
        rounded(g, 38, 29, 144, 6, 3);
        g.fill();
      })
    );
    dots = [...tint, '#fff'].map(c =>
      sprite(32, 32, g => {
        const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        r.addColorStop(0, '#fff');
        r.addColorStop(0.25, c);
        r.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 32, 32);
      })
    );
  }
  // What doesn't move, drawn once a song (and again on a turn of the phone): the song's cover as a
  // soft wash, the road, its lanes and lit edges, the hit line and its pads. Then the moving
  // layer's colours, made once (a frame only fills with them).
  let still = null;
  function drawBack(it, cover = null) {
    const g = back.getContext('2d');
    const { lane: LW, hitY, cx } = geo;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#06060b';
    g.fillRect(0, 0, Wd, Ht);
    if (cover) {
      // (Drawn tiny, then stretched: a blur for free.)
      const tiny = sprite(12, 12, x => x.drawImage(cover, 0, 0, 12, 12));
      g.globalAlpha = 0.5;
      g.imageSmoothingQuality = 'high';
      g.drawImage(tiny, -Wd * 0.2, -Ht * 0.1, Wd * 1.4, Ht * 1.2);
      g.globalAlpha = 1;
    }
    const shade = g.createLinearGradient(0, 0, 0, Ht);
    shade.addColorStop(0, 'rgba(6,6,11,.25)');
    shade.addColorStop(0.55, 'rgba(6,6,11,.7)');
    shade.addColorStop(1, 'rgba(6,6,11,.96)');
    g.fillStyle = shade;
    g.fillRect(0, 0, Wd, Ht);
    const ap = 1;
    const far = proj(ap, ap);
    const near = proj(-0.24, ap);
    const half = (LW * LANES) / 2;
    const quad = (x0a, x0b, x1a, x1b) => {
      g.beginPath();
      g.moveTo(x0a, far.y);
      g.lineTo(x0b, far.y);
      g.lineTo(x1b, near.y);
      g.lineTo(x1a, near.y);
      g.closePath();
    };
    quad(cx - half * far.s, cx + half * far.s, cx - half * near.s, cx + half * near.s);
    const road = g.createLinearGradient(0, far.y, 0, near.y);
    road.addColorStop(0, 'rgba(10,10,20,0)');
    road.addColorStop(0.35, 'rgba(14,14,26,.72)');
    road.addColorStop(1, 'rgba(10,10,18,.92)');
    g.fillStyle = road;
    g.fill();
    for (let k = 0; k <= LANES; k++) {
      const edge = k === 0 || k === LANES;
      const col = edge ? tint[k === 0 ? 0 : 3] : 'rgba(255,255,255,.16)';
      const gr = g.createLinearGradient(0, far.y, 0, near.y);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, col);
      gr.addColorStop(1, col);
      g.strokeStyle = gr;
      g.lineWidth = edge ? 3 : 1;
      if (edge) (g.shadowColor = col), (g.shadowBlur = 16);
      g.beginPath();
      g.moveTo(cx + (k - LANES / 2) * LW * far.s, far.y);
      g.lineTo(cx + (k - LANES / 2) * LW * near.s, near.y);
      g.stroke();
      g.shadowBlur = 0;
    }
    const lineG = g.createLinearGradient(cx - half, 0, cx + half, 0);
    tint.forEach((c, k) => lineG.addColorStop(k / (LANES - 1), c));
    g.fillStyle = lineG;
    g.globalAlpha = 0.85;
    g.fillRect(cx - half, hitY - 1.5, half * 2, 3);
    g.globalAlpha = 1;
    for (let k = 0; k < LANES; k++) {
      const x = laneX(k, 1);
      g.fillStyle = 'rgba(255,255,255,.06)';
      rounded(g, x - LW * 0.42, hitY - 13, LW * 0.84, 26, 13);
      g.fill();
      g.strokeStyle = tint[k];
      g.globalAlpha = 0.55;
      g.lineWidth = 2;
      g.stroke();
      g.globalAlpha = 1;
    }
    // The moving layer's fills, each made once.
    const d = cx2;
    const lit = col => {
      const gr = d.createLinearGradient(0, far.y, 0, near.y);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, col);
      return gr;
    };
    const beam = col => {
      const gr = d.createLinearGradient(0, hitY, 0, hitY - Ht * 0.42);
      gr.addColorStop(0, col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      return gr;
    };
    still = { far, near, half, lit: tint.map(lit), red: lit('#ff3b5c'), beam: tint.map(beam), lanes: Array.from({ length: LANES }, (_, k) => [0, 1].map(e => [cx + (k - LANES / 2 + e) * LW * far.s, cx + (k - LANES / 2 + e) * LW * near.s])) };
  }
  // The cover, for the wash (an SVG: decoded once, then the road drawn again over it).
  function backFor(it) {
    drawBack(it);
    const img = new Image();
    img.onload = () => R?.it === it && drawBack(it, img);
    img.src = coverOf(it);
  }

  // ---- A round ----
  let R = null;
  let raf = 0;
  let queue = [];
  async function play(it, from = list) {
    queue = from;
    const ctx = api.audio(); // (made on the tap: iOS lets sound start only there)
    api.quiet();
    stopRound();
    show(stage);
    layout();
    paint(it);
    backFor(it);
    bg.src = coverOf(it);
    titleEl.textContent = it.title;
    scoreEl.textContent = '0';
    progEl.style.transform = 'scaleX(0)';
    loadImg.src = coverOf(it);
    loadT.textContent = it.title;
    loadS.textContent = W('正在做這一關…', 'Making the level…');
    load.hidden = false;
    pauseBtn.hidden = true;
    const turn = (R = { turn: Symbol('round') }).turn;
    let m;
    let buffer;
    try {
      m = await warm(it);
      buffer = await bufferOf(ctx, it, m);
    } catch {
      if (R?.turn !== turn) return;
      loadS.textContent = W('這一關做不出來，換一首試試', "Couldn't make this level. Try another song");
      setTimeout(() => R?.turn === turn && (show(pick), drawPick()), 1800);
      return;
    }
    if (R?.turn !== turn) return;
    start(it, m, buffer, ctx);
  }
  function start(it, m, buffer, ctx) {
    const chart = m.charts[level];
    const notes = chart.notes.map((n, i) => ({ ...n, i, st: 0, hold: false }));
    const byLane = Array.from({ length: LANES }, () => []);
    for (const n of notes) byLane[n.lane].push(n);
    const spb = 60 / m.info.bpm;
    // Each section's start, and its name (none for the first).
    const marks = [];
    let bar = 0;
    for (const [t, n] of m.info.plan) {
      if (bar) marks.push({ t: bar * 4 * spb, text: name(SECTION_NAMES, t), shown: false });
      bar += n;
    }
    const last = notes.reduce((x, n) => Math.max(x, n.end ?? n.t), 0);
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    src.connect(gain).connect(ctx.destination);
    const at = ctx.currentTime + LEAD;
    src.start(at);
    R = {
      turn: R.turn, it, m, ctx, src, gain, at, notes, byLane, next: new Array(LANES).fill(0), spb, marks, ap: APPROACH[level], level,
      units: unitsOf(chart), tally: { perfect: 0, great: 0, good: 0, miss: 0 }, combo: 0, best: 0, shown: 0, fever: false,
      end: Math.min(buffer.duration, last + 1.6), pressed: new Array(LANES).fill(false), held: new Array(LANES).fill(null),
      sparks: [], rings: [], beams: new Array(LANES).fill(0), flash: new Array(LANES).fill(0), miss: new Array(LANES).fill(0),
      pop: null, bump: 0, shake: 0, banner: null, stars: starsOf(), lastC: ctx.currentTime, lastP: performance.now(), paused: false, over: false, buzz: 0
    };
    load.hidden = true;
    pauseBtn.hidden = false;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  const starsOf = () => Array.from({ length: reduced() ? 0 : 32 }, () => ({ x: (Math.random() < 0.5 ? -1 : 1) * (2.6 + Math.random() * 3.4), p: Math.random(), hue: Math.random() < 0.5 ? 0 : 3 }));
  function stopRound() {
    cancelAnimationFrame(raf);
    if (R?.src) {
      try {
        R.src.stop();
      } catch {}
      R.src.disconnect();
    }
    if (R?.ctx && R.ctx.state === 'suspended') R.ctx.resume().catch(() => {});
    R = null;
    menuEl.hidden = true;
  }
  const again = () => {
    if (!R?.it) return;
    const it = R.it;
    play(it, queue);
  };

  // The song's clock: the AudioContext's, smoothed between its steps by the page's. -> seconds into the song
  function clockAt(perf) {
    const c = R.ctx.currentTime;
    if (c !== R.lastC) (R.lastC = c), (R.lastP = performance.now());
    const lat = R.ctx.outputLatency || R.ctx.baseLatency || 0;
    const ahead = R.paused ? 0 : Math.min(0.06, Math.max(-0.06, (perf - R.lastP) / 1000));
    return R.lastC + ahead - R.at - lat - offset() / 1000;
  }

  // ---- Input: a lane each quarter of the screen; a key each (D F J K, or the arrows) ----
  const fingers = new Map();
  const laneAt = x => Math.max(0, Math.min(LANES - 1, Math.floor((x - (geo.cx - (geo.lane * LANES) / 2)) / geo.lane)));
  function down(lane, perf) {
    if (!R || R.paused || R.over) return;
    R.pressed[lane] = true;
    R.flash[lane] = 1;
    const t = clockAt(perf);
    const ns = R.byLane[lane];
    for (let k = R.next[lane]; k < ns.length && k < R.next[lane] + 3; k++) {
      const n = ns[k];
      if (n.st) continue;
      const g = judge(t - n.t);
      if (!g) {
        if (n.t - t > WINDOWS.good) break;
        continue;
      }
      n.st = n.end ? 1 : 2;
      if (n.end) R.held[lane] = n;
      hit(lane, g, t - n.t);
      return;
    }
  }
  function up(lane, perf) {
    if (!R) return;
    R.pressed[lane] = [...fingers.values()].includes(lane) || keysDown.has(lane);
    if (R.pressed[lane]) return;
    const n = R.held[lane];
    if (!n) return;
    const t = clockAt(perf);
    R.held[lane] = null;
    n.st = 2;
    // (Let go near its end: held to the end.)
    if (n.end - t <= 0.12) hit(lane, 'perfect', 0, true);
    else miss(lane, true);
  }
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const lane = laneAt(e.clientX - r.left);
    fingers.set(e.pointerId, lane);
    canvas.setPointerCapture?.(e.pointerId);
    down(lane, e.timeStamp || performance.now());
  });
  const lift = e => {
    if (!fingers.has(e.pointerId)) return;
    const lane = fingers.get(e.pointerId);
    fingers.delete(e.pointerId);
    up(lane, e.timeStamp || performance.now());
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  const KEYS = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
  const keysDown = new Set();
  addEventListener('keydown', e => {
    if (root.hidden) return;
    if (e.key === 'Escape') return void (R && !R.over && !stage.hidden ? (R.paused ? resume() : pause()) : !stage.hidden ? null : close());
    if (stage.hidden || !(e.code in KEYS) || e.repeat) return;
    e.preventDefault();
    keysDown.add(KEYS[e.code]);
    down(KEYS[e.code], e.timeStamp || performance.now());
  });
  addEventListener('keyup', e => {
    if (root.hidden || !(e.code in KEYS)) return;
    keysDown.delete(KEYS[e.code]);
    up(KEYS[e.code], e.timeStamp || performance.now());
  });

  // ---- Judging ----
  function hit(lane, g, dt, tail = false) {
    R.tally[g]++;
    R.combo++;
    R.best = Math.max(R.best, R.combo);
    R.bump = 1;
    if (!tail) R.pop = { g, early: g === 'perfect' ? 0 : dt < 0 ? -1 : 1, t: performance.now() };
    if (R.combo === FEVER && !R.fever) (R.fever = true), (R.banner = { text: W('火力全開', 'FEVER'), t: performance.now(), big: true });
    R.beams[lane] = 1;
    R.rings.push({ lane, t: performance.now(), g });
    // (Never more than one tick in 70 ms.)
    if (!tail && performance.now() - R.buzz > 70) (R.buzz = performance.now()), buzz();
    // (Sparks from a pool of 96: the oldest give way.)
    const n = reduced() ? 4 : g === 'perfect' ? 14 : 9;
    const x = laneX(lane, 1);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 260 + Math.random() * 420;
      let p = R.sparks.find(q => q.age >= q.life);
      if (!p) {
        if (R.sparks.length >= 96) p = R.sparks.reduce((o, q) => (q.age / q.life > o.age / o.life ? q : o));
        else R.sparks.push((p = {}));
      }
      Object.assign(p, { x, y: geo.hitY, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 + Math.random() * 0.35, age: 0, c: g === 'perfect' && k % 3 === 0 ? LANES : lane, r: 1.6 + Math.random() * 2.4 });
    }
  }
  function miss(lane, tail = false) {
    R.tally.miss++;
    R.combo = 0;
    R.fever = false;
    R.miss[lane] = 1;
    if (!tail || !R.pop || performance.now() - R.pop.t > 250) R.pop = { g: 'miss', early: 0, t: performance.now() };
    if (!reduced()) R.shake = 1;
  }
  function judgeMisses(t) {
    for (let lane = 0; lane < LANES; lane++) {
      const ns = R.byLane[lane];
      while (R.next[lane] < ns.length && ns[R.next[lane]].st === 2) R.next[lane]++;
      for (let k = R.next[lane]; k < ns.length; k++) {
        const n = ns[k];
        if (n.t - t > WINDOWS.good) break;
        if (n.st === 0 && t - n.t > WINDOWS.good) {
          n.st = 2;
          miss(lane);
          if (n.end) miss(lane, true);
        }
      }
      const held = R.held[lane];
      if (held && t >= held.end) {
        R.held[lane] = null;
        held.st = 2;
        hit(lane, 'perfect', 0, true);
      }
      if (held && R.held[lane]) R.beams[lane] = Math.max(R.beams[lane], 0.6);
    }
  }

  // (For screenshots and the Mac's walkthrough: localStorage['orbit-beats-game-auto'] = '1' plays every note itself.)
  const auto = (() => {
    try {
      // (Or ?gameauto in the address, for a phone's Safari.)
      if (/[?&]gameauto\b/.test(location.search)) localStorage.setItem('orbit-beats-game-auto', '1');
      return localStorage.getItem('orbit-beats-game-auto') === '1';
    } catch {
      return false;
    }
  })();
  // (It also counts the frames: the last 120's gaps, and how many ran long.)
  const gaps = [];
  if (auto) globalThis.__game = () => R?.notes && { tally: R.tally, combo: R.combo, units: R.units, n: R.notes.length, ...frames() };
  const frames = () => {
    const d = [...gaps].sort((a, b) => a - b);
    return { fps: d.length ? Math.round(1000 / d[d.length >> 1]) : 0, slow: d.filter(x => x > 20).length, worst: Math.round(d.at(-1) || 0) };
  };
  function autoplay(t) {
    for (let k = 0; k < LANES; k++) {
      const n = R.byLane[k][R.next[k]];
      if (R.held[k] && t >= R.held[k].end - 0.05) up(k, performance.now());
      if (n && !n.st && t >= n.t - 0.01) down(k, performance.now()), R.held[k] || (R.pressed[k] = false);
    }
  }

  // ---- Drawing ----
  let lastFrame = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!R || R.paused) return;
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    if (auto && lastFrame) gaps.push(now - lastFrame) > 120 && gaps.shift();
    lastFrame = now;
    const t = clockAt(performance.now());
    if (auto) autoplay(t);
    judgeMisses(t);
    draw(t, dt, performance.now());
    if (auto) {
      const f = frames();
      cx2.textAlign = 'left';
      text(cx2, `${f.fps} fps · ${f.slow} slow · ${f.worst} ms`, 14, Ht - 24, 13, '#9ef0a8', 700);
    }
    if (t > R.end && !R.over) finish();
  }
  // A frame: only what moves. No blur, no shadows, no new gradients; the score and the bar
  // touch the page at most ten times a second, and then only their text and a transform.
  let paintAt = 0;
  function draw(t, dt, now) {
    const g = cx2;
    const { lane: LW, hitY, cx } = geo;
    const ap = R.ap;
    const { far, near, half } = still;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, Wd, Ht);
    // (A miss shakes the stage, a little and briefly.)
    if (R.shake > 0) {
      g.translate((Math.random() - 0.5) * 8 * R.shake, (Math.random() - 0.5) * 6 * R.shake);
      R.shake = Math.max(0, R.shake - dt * 5);
    }
    // The beat: the glow behind, on every beat, stronger on the bar's first (its opacity only).
    const beat = t / R.spb;
    const ph = beat - Math.floor(beat);
    const pulse = t < 0 ? 0 : Math.exp(-ph * 5) * (Math.floor(beat) % 4 === 0 ? 1 : 0.6);
    const op = (0.35 + 0.65 * pulse * (R.fever ? 1 : 0.7)).toFixed(2);
    if (glowEl.dataset.o !== op) (glowEl.dataset.o = op), (glowEl.style.opacity = op);
    // Stars streaming by, either side of the highway.
    for (const st of R.stars) {
      st.p -= (dt / ap) * 0.9 * (R.fever ? 1.8 : 1);
      if (st.p < -0.2) st.p += 1.2;
      const { s, y } = proj(st.p * ap, ap);
      g.globalAlpha = Math.min(1, (1 - st.p) * 0.9) * 0.7;
      g.fillStyle = tint[st.hue];
      g.fillRect(cx + st.x * LW * s - s, y - s * 5, s * 2, s * 10);
    }
    // Lanes lit while pressed, red on a miss.
    for (let k = 0; k < LANES; k++) {
      R.flash[k] = R.pressed[k] ? Math.max(R.flash[k], 0.45) : Math.max(0, R.flash[k] - dt * 4);
      R.beams[k] = Math.max(0, R.beams[k] - dt * 3.2);
      R.miss[k] = Math.max(0, R.miss[k] - dt * 3);
      const a = Math.max(R.flash[k] * 0.35, R.beams[k] * 0.5);
      if (a > 0.01) laneFill(g, k, still.lit[k], a);
      if (R.miss[k] > 0.01) laneFill(g, k, still.red, R.miss[k] * 0.35);
    }
    // Beat lines crossing the road: each beat, the bar's first brighter (two strokes in all).
    for (const bar of [false, true]) {
      g.beginPath();
      for (let b = Math.max(0, Math.ceil((t - 0.24 * ap) / R.spb)); b * R.spb < t + ap; b++) {
        if ((b % 4 === 0) !== bar) continue;
        const { s, y } = proj(b * R.spb - t, ap);
        g.moveTo(cx - half * s, y);
        g.lineTo(cx + half * s, y);
      }
      g.globalAlpha = bar ? 0.3 : 0.1;
      g.strokeStyle = '#fff';
      g.lineWidth = bar ? 2 : 1;
      g.stroke();
    }
    // The pads lit while pressed.
    for (let k = 0; k < LANES; k++) {
      if (R.flash[k] < 0.02) continue;
      g.globalAlpha = R.flash[k] * 0.5;
      g.fillStyle = tint[k];
      rounded(g, laneX(k, 1) - LW * 0.42, hitY - 13, LW * 0.84, 26, 13);
      g.fill();
    }
    g.globalAlpha = 1;
    // The combo, under the notes (they're what you watch).
    R.bump = Math.max(0, R.bump - dt * 6);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (R.combo >= 3) {
      g.globalAlpha = 0.55;
      text(g, String(R.combo), cx, Ht * 0.34, 72 * (1 + R.bump * 0.18), R.fever ? `hsl(${Math.round(now / 6) % 360} 95% 72%)` : '#fff', 900);
      text(g, W('連擊', 'COMBO'), cx, Ht * 0.34 + 48, 13, 'rgba(255,255,255,.8)', 800);
      g.globalAlpha = 1;
    }
    // Holds' trails, then the notes.
    for (let k = 0; k < LANES; k++) {
      const ns = R.byLane[k];
      for (let j = Math.max(0, R.next[k] - 2); j < ns.length; j++) {
        const n = ns[j];
        if (n.t - t > ap) break;
        if (!n.end || n.st === 2) continue;
        trail(g, k, proj(Math.max(n.st === 1 ? 0 : -0.24 * ap, n.t - t), ap), proj(Math.min(ap, n.end - t), ap), tint[k], n.st === 1 ? 0.7 : 0.35);
      }
    }
    for (let k = 0; k < LANES; k++) {
      const ns = R.byLane[k];
      for (let j = Math.max(0, R.next[k] - 2); j < ns.length; j++) {
        const n = ns[j];
        const d = n.t - t;
        if (d > ap) break;
        if (n.st || d < -0.24 * ap) continue;
        const { s, y } = proj(d, ap);
        const w = LW * s * 1.18;
        const hh = (w * 104) / 220;
        g.globalAlpha = Math.max(0, Math.min(1, (1 - d / ap) * 3, d < 0 ? 1 + d / (0.24 * ap) : 1));
        g.drawImage(sprites[k], laneX(k, s) - w / 2, y - hh / 2, w, hh);
      }
    }
    // Sparks, rings and beams, added light.
    g.globalCompositeOperation = 'lighter';
    let live = 0;
    for (let k = 0; k < R.sparks.length; k++) {
      const p = R.sparks[k];
      if (p.age >= p.life) continue;
      live++;
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 900 * dt;
      const f = Math.max(0, 1 - p.age / p.life);
      const r = p.r * (2.2 + f * 2.4);
      g.globalAlpha = f;
      g.drawImage(dots[p.c], p.x - r, p.y - r, r * 2, r * 2);
    }
    if (!live) R.sparks.length = 0;
    for (let k = R.rings.length - 1; k >= 0; k--) {
      const r = R.rings[k];
      const a = Math.max(0, (now - r.t) / 380);
      if (a >= 1) {
        R.rings.splice(k, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - a, 3);
      g.globalAlpha = 1 - a;
      g.strokeStyle = r.g === 'perfect' ? '#fff' : tint[r.lane];
      g.lineWidth = 3 * (1 - a) + 1;
      g.beginPath();
      g.ellipse(laneX(r.lane, 1), hitY, LW * (0.3 + e * 0.6), LW * (0.12 + e * 0.24), 0, 0, Math.PI * 2);
      g.stroke();
    }
    for (let k = 0; k < LANES; k++) {
      if (R.beams[k] < 0.02) continue;
      g.globalAlpha = R.beams[k] * 0.5;
      g.fillStyle = still.beam[k];
      g.fillRect(laneX(k, 1) - LW * 0.4, hitY - Ht * 0.42, LW * 0.8, Ht * 0.42);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // Words: the countdown, the section, the fever, the grade of the last tap.
    if (t < 0) {
      const left = -t;
      const n = Math.ceil(left / (LEAD / 3));
      const f = 1 - (left % (LEAD / 3)) / (LEAD / 3);
      if (n <= 3) {
        g.globalAlpha = 1 - f * 0.7;
        text(g, String(n), cx, Ht * 0.4, 110 * (1.25 - f * 0.25), '#fff', 900);
      }
    } else if (t < 0.6) {
      g.globalAlpha = 1 - t / 0.6;
      text(g, W('開始！', 'GO!'), cx, Ht * 0.4, 84 * (1 + t * 0.5), '#fff', 900);
    }
    g.globalAlpha = 1;
    for (const mk of R.marks) if (!mk.shown && t >= mk.t) (mk.shown = true), (R.banner = { text: mk.text, t: now });
    if (R.banner) {
      const a = (now - R.banner.t) / (R.banner.big ? 1300 : 1100);
      if (a >= 1) R.banner = null;
      else {
        const x = cx + (a < 0.18 ? (1 - a / 0.18) * Wd * 0.6 : a > 0.82 ? -((a - 0.82) / 0.18) * Wd * 0.6 : 0);
        g.globalAlpha = Math.max(0, a < 0.18 ? a / 0.18 : a > 0.82 ? 1 - (a - 0.82) / 0.18 : 1);
        if (R.banner.big) text(g, R.banner.text, x, Ht * 0.25, 46, '#ffd76a', 900);
        else text(g, R.banner.text, x, Ht * 0.25, 26, 'rgba(255,255,255,.92)', 800);
        g.globalAlpha = 1;
      }
    }
    if (R.pop) {
      const a = Math.max(0, (now - R.pop.t) / 520);
      if (a >= 1) R.pop = null;
      else {
        const sc = a < 0.12 ? 1.35 - (a / 0.12) * 0.35 : 1;
        g.globalAlpha = a > 0.65 ? 1 - (a - 0.65) / 0.35 : 1;
        const y = hitY - Ht * 0.16 - a * 10;
        text(g, name(GRADE_NAMES, R.pop.g), cx, y, 34 * sc, GRADE_TINT[R.pop.g], 900);
        if (R.pop.early) text(g, R.pop.early < 0 ? W('早', 'EARLY') : W('晚', 'LATE'), cx, y + 30, 13, 'rgba(255,255,255,.7)', 700);
        g.globalAlpha = 1;
      }
    }
    // The score, counting up to what it is; how far into the song (ten times a second).
    const sc = scoreOf({ ...R.tally, combo: R.best }, R.units).score;
    R.shown += (sc - R.shown) * Math.min(1, dt * 10);
    if (now - paintAt > 100) {
      paintAt = now;
      const v = String(Math.round(R.shown));
      if (scoreEl.dataset.v !== v) (scoreEl.dataset.v = v), (scoreEl.textContent = Number(v).toLocaleString());
      progEl.style.transform = `scaleX(${Math.max(0, Math.min(1, t / R.end)).toFixed(3)})`;
    }
  }
  function laneFill(g, k, fill, a) {
    const [[x0f, x0n], [x1f, x1n]] = still.lanes[k];
    g.globalAlpha = a;
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(x0f, still.far.y);
    g.lineTo(x1f, still.far.y);
    g.lineTo(x1n, still.near.y);
    g.lineTo(x0n, still.near.y);
    g.fill();
    g.globalAlpha = 1;
  }
  function trail(g, k, a, b, col, alpha) {
    const LW = geo.lane;
    const w = 0.3;
    g.globalAlpha = alpha;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(laneX(k, b.s) - LW * w * b.s, b.y);
    g.lineTo(laneX(k, b.s) + LW * w * b.s, b.y);
    g.lineTo(laneX(k, a.s) + LW * w * a.s, a.y);
    g.lineTo(laneX(k, a.s) - LW * w * a.s, a.y);
    g.fill();
    g.globalAlpha = Math.min(1, alpha + 0.2);
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(laneX(k, b.s), b.y);
    g.lineTo(laneX(k, a.s), a.y);
    g.stroke();
    g.globalAlpha = 1;
  }


  // ---- Pause, and the end ----
  function pause() {
    if (!R || R.over || R.paused || !load.hidden) return;
    R.paused = true;
    R.ctx.suspend().catch(() => {});
    paintSync();
    menuEl.hidden = false;
  }
  function resume() {
    if (!R) return;
    menuEl.hidden = true;
    R.ctx.resume().then(() => {
      if (!R) return;
      R.lastC = R.ctx.currentTime;
      R.lastP = performance.now();
      R.paused = false;
      lastFrame = 0;
    }, () => {});
  }
  document.addEventListener('visibilitychange', () => document.hidden && pause());

  function finish() {
    R.over = true;
    const r = scoreOf({ ...R.tally, combo: R.best }, R.units);
    const key = bestKey(R.it, R.level);
    const was = store.bests?.[key]?.score || 0;
    const kept = withRound(store, key, { ...r, combo: R.best });
    store = { ...kept.store, level, mood, offset: store.offset };
    save();
    if (r.full) R.banner = { text: r.allPerfect ? W('全部完美！', 'ALL PERFECT!') : W('全連擊！', 'FULL COMBO!'), t: performance.now(), big: true };
    const it = R.it;
    const tally = { ...R.tally };
    const best = R.best;
    setTimeout(() => {
      if (!R || !R.over) return;
      results(it, r, tally, best, kept.best && was > 0, kept.best);
    }, r.full ? 1500 : 900);
  }
  function results(it, r, tally, best, beat, first) {
    stopRound();
    show(done);
    const score = h('div', { class: 'gm-big', text: '0' });
    const at = queue.findIndex(x => idOf(x) === idOf(it));
    const nextOne = queue[(at + 1) % queue.length] || today;
    const keepBtn =
      api.keep && !api.kept?.(`radio:${it.seed}:${it.mood}:${it.style}`)
        ? h('button', {
            class: 'gm-btn',
            type: 'button',
            html: `${icon('heart')}<span>${W('收藏這首歌', 'Keep this song')}</span>`,
            onclick: e => {
              api.keep({ id: `radio:${it.seed}:${it.mood}:${it.style}`, title: it.title, spec: { seed: it.seed, mood: it.mood }, info: { style: it.style, bpm: it.bpm, key: it.key } });
              e.currentTarget.innerHTML = `${icon('heart-fill')}<span>${W('已收藏', 'Kept')}</span>`;
              e.currentTarget.disabled = true;
            }
          })
        : null;
    done.style.setProperty('--gm-rank', RANK_TINT[r.grade]);
    done.replaceChildren(
      h('div', { class: 'gm-top' }, [xBtn(W('選歌', 'Songs'), () => (show(pick), drawPick()), 'back-chevron'), h('h1', { text: name(LEVEL_NAMES, level) }), h('span', { class: 'gm-gap' })]),
      h('div', { class: 'gm-res' }, [
        h('img', { alt: '', src: coverOf(it) }),
        h('div', { class: 'gm-res-t', text: it.title }),
        h('div', { class: 'gm-res-s', text: subOf(it) }),
        h('div', { class: 'gm-grade', text: r.grade }),
        h('span', { class: 'gm-flag', text: r.allPerfect ? W('全部完美', 'ALL PERFECT') : W('全連擊', 'FULL COMBO'), hidden: !r.full }),
        score,
        h('span', { class: 'gm-new', text: beat ? W('新紀錄', 'NEW BEST') : W('第一次過關', 'FIRST CLEAR'), hidden: !first })
      ]),
      h(
        'div',
        { class: 'gm-tally' },
        ['perfect', 'great', 'good', 'miss'].map((g, k) => h('div', { style: { animationDelay: `${0.3 + k * 0.06}s` } }, [h('b', { text: String(tally[g]), style: { color: GRADE_TINT[g] } }), h('span', { text: name(GRADE_NAMES, g) })]))
      ),
      h('div', { class: 'gm-stats' }, [
        h('div', {}, [h('span', { text: W('最高連擊', 'Max combo') }), h('b', { text: String(best) })]),
        h('div', {}, [h('span', { text: W('準確度', 'Accuracy') }), h('b', { text: `${(r.acc * 100).toFixed(1)}%` })])
      ]),
      h('div', { class: 'gm-acts' }, [
        h('button', { class: 'gm-btn main', type: 'button', html: `${icon('refresh')}<span>${W('再玩一次', 'Play again')}</span>`, onclick: () => play(it, queue) }),
        h('div', { class: 'two' }, [
          h('button', { class: 'gm-btn', type: 'button', html: `${icon('next')}<span>${W('下一首', 'Next song')}</span>`, onclick: () => play(nextOne, queue) }),
          h('button', { class: 'gm-btn', type: 'button', html: `${icon('grid')}<span>${W('選歌', 'Songs')}</span>`, onclick: () => (show(pick), drawPick()) })
        ]),
        keepBtn
      ])
    );
    done.scrollTop = 0;
    // (The score counts up as the grade lands.)
    const t0 = performance.now();
    const ms = reduced() ? 0 : 1100;
    const step = now => {
      const p = ms ? Math.min(1, (now - t0 - 250) / ms) : 1;
      score.textContent = Math.round(r.score * (p <= 0 ? 0 : 1 - Math.pow(1 - p, 3))).toLocaleString();
      if (p < 1 && !done.hidden) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    warm(nextOne);
  }

  // ---- Open and close ----
  let hashWas = '';
  function open(spec = null) {
    if (root.hidden) {
      root.hidden = false;
      requestAnimationFrame(() => root.classList.add('in'));
      document.body.classList.add('gm-open');
      hashWas = location.hash;
      try {
        history.replaceState(null, '', '#game');
      } catch {}
    }
    addEventListener('resize', onResize);
    if (spec) {
      const it = itemOf(spec);
      list = setOf(dayKey(), mood).map(itemOf);
      today ||= itemOf(dailyOf(dayKey()));
      drawPick();
      play(it, [it, ...list]);
    } else {
      show(pick);
      drawPick();
    }
  }
  function close() {
    stopRound();
    root.classList.remove('in');
    removeEventListener('resize', onResize);
    setTimeout(() => (root.hidden = true), reduced() ? 0 : 280);
    document.body.classList.remove('gm-open');
    try {
      history.replaceState(null, '', hashWas && hashWas !== '#game' ? hashWas : '#create');
    } catch {}
  }
  const onResize = () => !stage.hidden && R?.it && (layout(), backFor(R.it));
  return { open, close, get open_() {
    return !root.hidden;
  } };
}

function rounded(g, x, y, w, hh, r) {
  r = Math.min(r, hh / 2, w / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + hh, r);
  g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function text(g, s, x, y, size, fill, weight = 800) {
  g.font = `${weight} ${Math.round(size)}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang TC", "Noto Sans TC", sans-serif`;
  g.fillStyle = fill;
  g.fillText(s, x, y);
}

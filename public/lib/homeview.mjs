// 首頁, in Orbit's own look (Jay 2026-11-03; DESIGN §11, RULEBOOK §3): the home is the player.
// What's playing (or today's first pick, ready), ▶ and ⏭, and the song's parts as one line, each
// part on its own colour (做歌's), the one playing lit; a tap on a part goes there. Then what plays
// next, today's picks, the stations and genres as one row of taps each, what you heard and kept,
// and the maker's ways in. Every card is the kit's graphite; colour only on what it names.
// Also the pieces other tabs share: station covers, song rows and lists (創作), tapTrack.
import { h, tickText } from './ui.mjs';
import * as kitUI from '#kit/ui.mjs';
import * as kit from '#kit/orbit.mjs';
import { icon } from './icons.mjs';
import { genreSheet } from './genres.mjs';
import { W, en } from './lang.mjs';
import { MOODS, stationStyles, radioSpec, radioPlan } from './radio.mjs';
import { makeRng } from '../engine.mjs';
import { sectionTimes, sectionIndex } from './sections.mjs';
import { SECTION_NAMES, name } from './names.mjs';
import { stationFilter, stationName, homeRows, dailyPicks, dayKey, nowStation } from './stations.mjs';
import { coverSvg, coverUrl } from './cover.mjs';
import { coverOfTrack } from './player.mjs';
import { onLong, subOf } from './playerview.mjs';
import { clock } from './length.mjs';

const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const covers = new Map();
// A station's cover: a groove of it, drawn from the station's own seed (the same every time).
export function stationCover(id, taste = {}) {
  const title = stationName(id);
  const k = `${id === 'taste' ? `taste:${Object.keys(taste).sort().join()}` : id}|${title}`;
  if (!covers.has(k)) {
    const f = stationFilter(id, taste);
    const styles = stationStyles(f);
    const seed = hash(k);
    const style = /^style:/.test(id) ? id.slice(6) : styles[seed % styles.length];
    // (A station's art carries its name, large, as Apple's station art does.)
    const bpm = f.bpm ? Math.round((f.bpm[0] + f.bpm[1]) / 2) : 100;
    covers.set(k, coverUrl(coverSvg({ seed, style, mood: MOODS[id] ? id : 'all', key: null, bpm, title, text: true, station: true })));
  }
  return covers.get(k);
}

// A song's card tapped: it plays; already playing, Now Playing opens (paused: it goes on).
export function tapTrack(api, t) {
  const s = api.P.state();
  if (s?.track?.id !== t.id) return api.P.play(t);
  if (!(s.playing || s.busy)) return api.P.toggle();
  return api.openNow ? api.openNow() : null;
}
// A song's parts: a kept song's own plan; a radio song's worked out from its seed, as the radio makes it.
const plans = new Map();
function planOf(t, songs) {
  if (!t) return null;
  if (t.kind === 'song') return songs().find(s => s.id === t.id)?.info?.plan || null;
  if (!Number.isFinite(t.seed)) return null;
  const k = `${t.seed}:${t.mood}:${t.style}`;
  if (!plans.has(k)) {
    const sp = radioSpec(t.seed, t.mood || 'all', t.style);
    plans.set(k, { plan: radioPlan(makeRng(t.seed ^ 0x1b873593), sp.bpm, sp.seconds), bpm: sp.bpm });
  }
  return plans.get(k).plan;
}

const PICKS_KEY = 'orbit-beats-picks';
const SHOW = 3;

// ---- Rows: a song each (首頁 and 創作) ----
export function songRowOf(api, t, c, { value = '' } = {}) {
  const b = h('button', { class: 'q-ritem bt-row', type: 'button', 'data-id': t.id, onclick: () => tapTrack(api, t) }, [
    h('img', { class: 'bt-thumb', alt: '', src: c || coverOfTrack(t), loading: 'lazy', decoding: 'async', draggable: 'false' }),
    h('span', { class: 'q-ritem-text' }, [h('span', { class: 'q-ritem-title', text: t.title }), h('small', { text: subOf(t) })]),
    h('span', { class: 'q-ritem-value num', text: value || (t.seconds ? clock(t.seconds) : '') })
  ]);
  onLong(b, () => api.trackMenu(t, b));
  return b;
}
// A list of songs: three, the rest behind the kit's quiet more bar (`open` keeps which are open).
export function songListOf(open, key, head_, rows, opts = {}) {
  if (!rows.length) return null;
  const box = h('div', { class: 'q-rowcard bt-list' }, rows.slice(0, open[key] ? rows.length : SHOW));
  const tail =
    rows.length > SHOW
      ? kitUI.moreToggle?.({
          more: W(`再看 ${rows.length - SHOW} 首`, `${rows.length - SHOW} more`),
          less: W('收起', 'Less'),
          open: Boolean(open[key]),
          onToggle: o => ((open[key] = o), box.replaceChildren(...rows.slice(0, o ? rows.length : SHOW)))
        })
      : null;
  return kitUI.section(head_, [box, tail].filter(Boolean), { cls: `bt-sec bt-${key}`, ...opts });
}

// ---- Wide screens (DESIGN §10): like cards as a grid, never a phone's rows made long ----
// (A page of 640 or more: the kit marks <html> q-wide. Each draw asks; onScreen draws again.)
export const isWide = () => document.documentElement.classList.contains('q-wide');
// A song as a cover card: the cover, its name and groove under it; a tap plays (as its row's does).
export function songTileOf(api, t, c) {
  const b = h('button', { class: 'bt-tile', type: 'button', 'data-id': t.id, 'aria-label': t.title, onclick: () => tapTrack(api, t) }, [
    h('span', { class: 'bt-tile-art' }, [h('img', { class: 'bt-tile-cover', alt: '', src: c || coverOfTrack(t), loading: 'lazy', decoding: 'async', draggable: 'false' })]),
    h('span', { class: 'bt-tile-text' }, [h('b', { text: t.title }), h('small', { text: [subOf(t), t.seconds ? clock(t.seconds) : ''].filter(Boolean).join(' · ') })])
  ]);
  onLong(b, () => api.trackMenu(t, b));
  return b;
}
// Songs as an even grid of covers (no part row: the kit's fullRows; the most telling first).
export function songGridOf(key, head_, tiles, opts = {}) {
  if (!tiles.length) return null;
  return kitUI.section(head_, h('div', { class: 'bt-tiles q-rows-full' }, tiles), { cls: `bt-sec bt-${key}`, ...opts });
}
// The ways in (自己做, 創作's tools) as tiles side by side: its mark, what it is, what it does.
export function wayTilesOf(items) {
  return h(
    'div',
    { class: 'bt-ways q-rows-full q-rows-keep' },
    items.filter(Boolean).map(x => h('button', { class: 'q-card bt-way', type: 'button', onclick: x.onClick }, [h('span', { class: 'bt-way-ico', html: x.icon }), h('b', { text: x.title }), h('small', { text: x.sub }), x.value ? h('span', { class: 'bt-way-value', text: x.value }) : null]))
  );
}

// api: { P, radio, taste() -> { style: n }, trackMenu(track, anchor), openNow(), songs(), go(tab, run), game() }
export function mountHome(panel, api) {
  const { P, radio } = api;
  const taste = () => api.taste();
  // (The station already playing: Now Playing opens, rather than nothing.)
  const tune = id => P.station(id) === false && api.openNow();

  // 今日精選, as 首頁 keeps it (worked out once a day).
  let picks = [];
  let picksDay = '';
  const pickList = () => {
    const day = dayKey();
    if (day === picksDay) return picks;
    picksDay = day;
    const k = `${document.querySelector('meta[name="build-version"]')?.content || ''}|${day}`;
    let es = null;
    try {
      const was = JSON.parse(localStorage.getItem(PICKS_KEY) || 'null');
      if (was?.k === k && Array.isArray(was.picks) && was.picks.length) es = was.picks;
    } catch {}
    if (!es) {
      // (A new day: the card's song and the three rows first, the rest a moment later: working
      // out all eight held the screen a moment as it opened.)
      es = dailyPicks(day, 3);
      const got = es;
      setTimeout(() => {
        const all = dailyPicks(day, 8, got);
        try {
          localStorage.setItem(PICKS_KEY, JSON.stringify({ k, picks: all }));
        } catch {}
        if (picksDay !== day) return;
        picks = all.map(e => ({ e, t: radio.trackOf(e), cover: radio.coverOf(e) }));
        upKey = '-';
        drawUp();
      }, 0);
    }
    picks = es.map(e => ({ e, t: radio.trackOf(e), cover: radio.coverOf(e) }));
    // (The first two made ahead: a tap plays at once.)
    setTimeout(() => radio.prep?.(picks.slice(0, 2).map(p => p.e)), 300);
    return picks;
  };

  // ---- The player card ----
  const cover = h('img', { class: 'bt-cover', alt: '', draggable: 'false' });
  const kick = h('small', { class: 'bt-kick' });
  const title = h('b', { class: 'bt-title q-fit' });
  const sub = h('span', { class: 'bt-sub' });
  const parts = h('div', { class: 'bt-parts', role: 'group' });
  const names = h('div', { class: 'bt-part-names', 'aria-hidden': 'true' });
  const at = h('span', { class: 'bt-at num' });
  const total = h('span', { class: 'bt-total num' });
  const more = h('button', { class: 'bt-btn', type: 'button', 'aria-label': W('更多', 'More'), html: icon('more') });
  const play = h('button', { class: 'bt-play', type: 'button' });
  const next = h('button', { class: 'bt-btn', type: 'button', 'aria-label': W('下一首', 'Next'), html: icon('next') });
  const head = h('button', { class: 'bt-head', type: 'button' }, [cover, h('span', { class: 'bt-words' }, [kick, title, sub])]);
  const card = h('section', { class: 'q-card bt-now' }, [head, h('div', { class: 'bt-line' }, [parts, names]), h('div', { class: 'bt-time' }, [at, total]), h('div', { class: 'bt-ctl' }, [more, play, next])]);

  // What the card shows: the song playing (or paused), else today's first pick.
  const shown = () => {
    const s = P.state();
    if (s?.track) return { s, t: s.track, cover: s.cover || coverOfTrack(s.track), live: true };
    const p = pickList()[0];
    return { s: null, t: p.t, cover: p.cover, live: false };
  };
  let cardKey = '';
  let times = [];
  function paintCard() {
    const { s, t, cover: c, live } = shown();
    const playing = Boolean(s?.playing || s?.busy);
    const from = s?.source === 'radio' ? stationName(s.station || radio.station()) : s?.source === 'song' ? W('你的歌', 'Your song') : '';
    kick.replaceChildren(...(live ? [h('i', { class: `bt-dot${playing ? ' on' : ''}` }), h('span', { text: playing ? W('正在播放', 'Playing') : W('已暫停', 'Paused') }), from ? h('span', { class: 'bt-from', text: `· ${from}` }) : null] : [h('span', { text: W('今天的第一首', 'Today’s first') })]));
    play.innerHTML = icon(playing ? 'pause' : 'play');
    play.setAttribute('aria-label', playing ? W('暫停', 'Pause') : W('播放', 'Play'));
    next.hidden = !live;
    const key = `${t.id}|${live}`;
    if (key !== cardKey) {
      cardKey = key;
      if (cover.getAttribute('src') !== c) cover.src = c;
      title.textContent = t.title;
      sub.textContent = [subOf(t), live ? '' : clock(t.seconds || 0)].filter(Boolean).join(' · ');
      drawParts(t);
      card.classList.toggle('idle', !live);
      kit.fitNames?.(card);
    }
    paintTime();
  }
  function drawParts(t) {
    const plan = planOf(t, api.songs);
    const bpm = t.bpm || plans.get(`${t.seed}:${t.mood}:${t.style}`)?.bpm || 100;
    times = plan ? sectionTimes(plan, bpm) : [];
    const bars = times.reduce((a, s) => a + s.bars, 0);
    const px = Math.max(160, (card.clientWidth || Math.min(innerWidth, 440) - 32) - 32);
    parts.setAttribute('aria-label', times.map(s => name(SECTION_NAMES, s.type)).join(', '));
    parts.replaceChildren(
      ...times.map((s, k) =>
        h('button', {
          type: 'button',
          class: 'bt-part',
          style: { flex: String(s.bars) },
          'aria-label': name(SECTION_NAMES, s.type),
          onclick: () => {
            const st = P.state();
            if (st?.track?.id === t.id && st.canSeek) P.seek(s.from + 0.01);
            else if (!st?.track || st.track.id !== t.id) P.play(t);
          }
        }, [h('i')])
      )
    );
    [...parts.children].forEach((b, k) => b.style.setProperty('--c', `var(--${times[k].type})`));
    // (A part's name under it where it fits; the lit one's always.)
    names.replaceChildren(
      ...times.map(s => {
        const label = name(SECTION_NAMES, s.type);
        return h('span', { style: { flex: String(s.bars) }, text: bars && (s.bars / bars) * px >= (en ? label.length * 0.62 : label.length) * 11 + 4 ? label : '' });
      })
    );
    total.textContent = clock(t.seconds || (times.at(-1)?.to ?? 0));
  }
  let litWas = -2;
  function paintTime() {
    const s = P.state();
    const mine = s?.track && s.track.id === shown().t.id;
    const t = mine ? s.t || 0 : 0;
    const k0 = mine && times.length ? sectionIndex(times, t) : -1;
    tickText(at, mine ? [clock(t), k0 >= 0 ? name(SECTION_NAMES, times[k0].type) : ''].filter(Boolean).join(' · ') : '');
    if (mine && s.seconds) tickText(total, clock(s.seconds));
    const k = mine && times.length ? sectionIndex(times, t) : -1;
    const kids = parts.children;
    if (k !== litWas) {
      litWas = k;
      [...kids].forEach((b, i) => {
        b.classList.toggle('done', k >= 0 && i < k);
        b.classList.toggle('on', i === k);
        b.setAttribute('aria-current', String(i === k));
        names.children[i]?.classList.toggle('on', i === k);
      });
    }
    if (k >= 0) {
      const p = times[k];
      kids[k]?.style.setProperty('--at', `${Math.max(0, Math.min(100, ((t - p.from) / (p.to - p.from)) * 100))}%`);
    }
  }
  head.onclick = () => {
    const { s, t } = shown();
    if (s?.track) return api.openNow();
    P.play(t);
  };
  play.onclick = () => {
    const { s, t } = shown();
    if (s?.track) return P.toggle();
    P.play(t);
  };
  next.onclick = () => P.forward();
  more.onclick = e => api.trackMenu(shown().t, e.currentTarget);
  // (While the card is on screen the mini player steps aside: one player at a time.)
  try {
    new IntersectionObserver(([en_]) => document.body.classList.toggle('bt-now-seen', en_.isIntersecting), { threshold: 0.35 }).observe(card);
  } catch {}

  const songRow = (t, c, o) => songRowOf(api, t, c, o);
  const open = {};
  const songList = (key, head_, rows, opts = {}) => songListOf(open, key, head_, rows, opts);

  // ---- Stations: one row of taps; genres: another ----
  const chip = (id, label = stationName(id), extra = null) => h('button', { class: 'q-chip bt-st', type: 'button', 'data-station': id, 'aria-pressed': 'false', onclick: () => tune(id) }, [extra, h('span', { text: label })]);
  function stations() {
    const hr = new Date().getHours();
    const now = nowStation(hr);
    const rows = homeRows(taste());
    const forYou = rows.find(r => r.key === 'for-you').ids;
    const moods = rows.find(r => r.key === 'moods').ids.filter(id => id !== now.id);
    const ids = [...new Set(['all', ...forYou, ...moods])].filter(id => id !== now.id);
    const st = h('div', { class: 'q-chips bt-chips q-rows-full q-rows-keep' }, [chip(now.id, stationName(now.id), h('small', { class: 'bt-part-of', text: W(...now.part) })), ...ids.map(id => chip(id))]);
    const genres = h('div', { class: 'q-chips bt-chips q-rows-full q-rows-keep' }, [
      ...rows.find(r => r.key === 'genres').ids.map(id => chip(id)),
      h('button', { class: 'q-chip bt-st', type: 'button', onclick: () => genreSheet({ title: W('全部類型', 'All genres'), onPick: g => P.station(`style:${g}`) }) }, [h('span', { text: W('全部類型', 'All genres') })])
    ]);
    return kitUI.section(W('電台', 'Radio'), [st, h('h3', { class: 'q-list-head bt-sub-head', text: W('類型', 'Genres') }), genres], { cls: 'bt-sec bt-stations' });
  }
  // (Wide: each station and genre its own cover, the radio's beside the genres', 全部類型 at their head.)
  const tile = (id, part = null) =>
    h('button', { class: 'bt-stile', type: 'button', 'data-station': id, 'aria-pressed': 'false', 'aria-label': part ? `${W(...part)} ${stationName(id)}` : stationName(id), onclick: () => tune(id) }, [
      h('img', { alt: '', src: stationCover(id, taste()), loading: 'lazy', decoding: 'async', draggable: 'false' }),
      part ? h('small', { class: 'bt-stile-part', text: W(...part) }) : null
    ]);
  function stationsWide() {
    const now = nowStation(new Date().getHours());
    const rows = homeRows(taste());
    const forYou = rows.find(r => r.key === 'for-you').ids;
    const moods = rows.find(r => r.key === 'moods').ids.filter(id => id !== now.id);
    const ids = [...new Set(['all', ...forYou, ...moods])].filter(id => id !== now.id);
    const all = () => genreSheet({ title: W('全部類型', 'All genres'), onPick: g => P.station(`style:${g}`) });
    return h('div', { class: 'bt-pair bt-stations' }, [
      kitUI.section(W('電台', 'Radio'), h('div', { class: 'bt-stiles q-rows-full q-rows-keep' }, [tile(now.id, now.part), ...ids.map(id => tile(id))]), { cls: 'bt-sec' }),
      kitUI.section(W('類型', 'Genres'), h('div', { class: 'bt-stiles q-rows-full q-rows-keep' }, rows.find(r => r.key === 'genres').ids.map(id => tile(id))), { cls: 'bt-sec', more: W('全部類型', 'All genres'), onMore: all })
    ]);
  }
  function paintTiles() {
    const id = P.state()?.track?.id || '';
    for (const b of panel.querySelectorAll('.bt-tile[data-id]')) b.toggleAttribute('data-on', b.dataset.id === id);
  }
  function paintStations() {
    const s = P.state();
    const on = s?.source === 'radio' && (s.playing || s.busy) ? radio.station() : '';
    for (const b of panel.querySelectorAll('[data-station]')) b.setAttribute('aria-pressed', String(b.dataset.station === on));
  }

  // ---- The maker's ways in ----
  const WAYS = () => [
    { icon: icon('grid'), title: W('即興', 'Jam'), sub: W('16 個打擊墊，跟著節奏按', '16 pads over a groove'), onClick: () => api.go('jam') },
    { icon: icon('note'), title: W('做歌', 'Songs'), sub: W('用你的片段做成歌', 'Songs from your pieces'), onClick: () => api.go('make') },
    { icon: icon('create'), title: W('樂器', 'Studio'), sub: W('一格一格寫節奏和旋律', 'Write beats and tunes step by step'), onClick: () => api.go('studio') },
    { icon: icon('trophy'), title: W('節奏遊戲', 'Rhythm game'), sub: W('每首歌都是一關', 'Every song is a level'), onClick: () => api.game?.() }
  ];
  const makeWide = () => kitUI.section(W('自己做', 'Make your own'), wayTilesOf(WAYS()), { cls: 'bt-sec bt-make' });
  const make = () =>
    kitUI.section(
      W('自己做', 'Make your own'),
      kitUI.rowCard(WAYS().map(x => ({ ...x, color: 'var(--accent)' }))),
      { cls: 'bt-sec bt-make' }
    );

  // ---- The whole home ----
  let upKey = '';
  const upSlot = h('div', { class: 'bt-slot' });
  const recentSlot = h('div', { class: 'bt-slot' });
  function drawUp() {
    const s = P.state();
    const queued = s?.track ? [...P.q.upNext, ...(P.q.station?.kind === 'radio' ? P.upNextRadio() : P.stationNext())] : [];
    const seen = new Set([s?.track?.id]);
    const ups = queued.filter(t => t && !seen.has(t.id) && seen.add(t.id)).slice(0, 8);
    const ps = pickList().filter(p => p.t.id !== shown().t.id);
    const key = [s?.track?.id || '', ...ups.map(t => t.id)].join('|');
    if (key === upKey) return;
    upKey = key;
    if (isWide())
      return upSlot.replaceChildren(
        ...[ups.length ? songGridOf('up', W('接下來', 'Up next'), ups.map(t => songTileOf(api, t, t.cover))) : null, songGridOf('picks', W('今日精選', 'Today’s picks'), ps.map(p => songTileOf(api, p.t, p.cover)))].filter(Boolean)
      );
    upSlot.replaceChildren(
      ...[ups.length ? songList('up', W('接下來', 'Up next'), ups.map(t => songRow(t, t.cover))) : null, songList('picks', W('今日精選', 'Today’s picks'), ps.map(p => songRow(p.t, p.cover)))].filter(Boolean)
    );
  }
  let recentKey = '';
  function drawRecent() {
    const id = P.state()?.track?.id || '';
    const list = radio.recent().filter(t => t.id !== id);
    const mine = [...api.songs()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 12).map(song => P.track(song));
    const key = [id, ...list.map(t => t.id), '/', ...mine.map(t => t.id)].join('|');
    if (key === recentKey) return;
    recentKey = key;
    recentSlot.replaceChildren(
      ...[songList('recent', W('最近播放', 'Recently played'), list.map(t => songRow(t, radio.coverOf(t)))), songList('mine', W('你的歌', 'Your songs'), mine.map(t => songRow(t)), { more: W('資料庫', 'Library'), onMore: () => api.go('library') })].filter(Boolean)
    );
  }
  function drawAll() {
    cardKey = upKey = recentKey = '-';
    litWas = -2;
    drawUp();
    drawRecent();
    // (Wide: the player across the top, then what plays as covers, the radio beside the genres,
    // what you heard beside what you kept, the ways to make your own side by side: the phone's order.)
    const wide = isWide();
    recentSlot.classList.toggle('bt-pair', wide);
    panel.replaceChildren(
      wide
        ? h('div', { class: 'bt-home bt-wide' }, [card, upSlot, stationsWide(), recentSlot, makeWide()])
        : h('div', { class: 'q-cols bt-home' }, [h('div', { class: 'bt-col' }, [card, upSlot]), h('div', { class: 'bt-col' }, [stations(), recentSlot, make()])])
    );
    paintCard();
    paintStations();
    paintTiles();
  }
  drawAll();
  P.on(w => {
    if (w === 'time') return paintTime();
    paintCard();
    paintStations();
    drawUp();
    drawRecent();
    paintTiles();
  });
  return { refresh: drawAll };
}

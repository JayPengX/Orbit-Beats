// 資料庫: the songs kept on this phone (lib/kits.mjs's store), newest first,
// found by a word of their name, groove or key and put in another order
// (newest, name, longest, groove), all of what's shown in a zip. The rows
// are the page's (app.js songRow), so a song plays, keeps and shares the
// same wherever it's shown. 清單: lists of kept songs (lib/lists.mjs), each
// opened to play in its order.
import { h, sheet, cell, list as group, menu, toast } from './ui.mjs';
import * as ui from './ui.mjs';
import { ask } from '#kit/orbit.mjs';
import { listSongs } from './kits.mjs';
import { listsOf, makeList, renameList, deleteList, addTo, removeFrom, dropSong, songsOf } from './lists.mjs';
import { STYLE_NAMES, name } from './names.mjs';
import { W, en, lang } from './lang.mjs';
import { icon } from './icons.mjs';

export const ORDERS = ['new', 'name', 'long', 'style'];
// Where a kept song came from: 'radio' (kept from 聽), 'made' (做歌, 簡單's batches), 'remix' (重新混音), 'jam' (即興).
// (Songs kept before `from` was noted: told by their id and recipe.)
export const KINDS = ['radio', 'made', 'remix', 'jam'];
export const KIND_NAMES = { radio: ['電台收藏', 'From the radio'], made: ['我做的歌', 'Made by me'], remix: ['混音', 'Remixes'], jam: ['即興', 'Jams'] };
const KIND_ICONS = { radio: 'radio', made: 'create', remix: 'shuffle', jam: 'grid' };
export function songKind(song) {
  if (KINDS.includes(song.from)) return song.from;
  if (/:rx[0-9a-z]+$/.test(song.id)) return 'remix';
  if (song.recipe?.jam) return 'jam';
  return String(song.id).startsWith('radio:') ? 'radio' : 'made';
}
const ORDER_NAMES = { new: ['最新', 'Newest'], name: ['歌名', 'Name'], long: ['最長', 'Longest'], style: ['節奏', 'Groove'] };

// What a search finds a song by: its name, its groove's name (both
// languages), its key ("A minor", "A 小調") and "jam" / 即興 for a jam's.
export function searchText(song) {
  const st = song.info?.style;
  const k = song.info?.key;
  return [song.name, st, ...(STYLE_NAMES[st] || []), song.recipe?.jam ? '即興 jam' : '', k ? `${k.minor ? '小調 minor' : '大調 major'}` : ''].join(' ').toLowerCase();
}
// The songs a search and an order show (pure: the tests call it).
export function shownOf(songs, { query = '', order = 'new' } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const found = songs.filter(s => words.every(w => searchText(s).includes(w)));
  const by = {
    new: (a, b) => (b.at || 0) - (a.at || 0),
    name: (a, b) => String(a.name).localeCompare(String(b.name), en ? 'en' : 'zh-Hant'),
    long: (a, b) => (b.info?.seconds || 0) - (a.info?.seconds || 0),
    style: (a, b) => String(a.info?.style || '~').localeCompare(String(b.info?.style || '~')) || (b.at || 0) - (a.at || 0)
  }[ORDERS.includes(order) ? order : 'new'];
  return [...found].sort(by);
}

// The lists on this phone. (A read that fails isn't "no lists": nothing is saved over it.)
const LISTS = 'orbit-beats.lists.v1';
function readLists() {
  try {
    return { lists: listsOf(JSON.parse(localStorage.getItem(LISTS) || '[]')), ok: true };
  } catch {
    return { lists: [], ok: false };
  }
}

// A name typed in a sheet: done(name) with what was typed.
// `keep`: the name as offered counts too (a kit saved under its suggested name).
export function nameSheet(title, value, done, { keep = false } = {}) {
  const input = h('input', { class: 'num', type: 'text', style: { width: '100%', textAlign: 'left', padding: '0 12px' }, maxlength: 40, 'aria-label': W('名稱', 'Name') });
  input.value = value;
  const go = () => {
    const v = input.value.trim().slice(0, 40);
    s.close();
    if (v && (keep || v !== value)) done(v);
  };
  input.addEventListener('keydown', e => e.key === 'Enter' && go());
  const s = sheet({ title, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'card sheet-card' }, [input, h('button', { class: 'primary', type: 'button', text: W('好', 'Done'), onclick: go })]) });
  setTimeout(() => input.focus(), 60);
}

// The newest kept songs first, as many as a shelf shows (pure: the tests call it).
// A list in a random order (pure given `rand`: the tests pass their own).
export function shuffled(items, rand = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const recentOf = (songs, n = 12) => shownOf(songs, { order: 'new' }).slice(0, n);
// The songs a list's cover is made of: four make a 2x2 mosaic, fewer show the first alone, none a blank.
export function mosaicOf(songs) {
  const s = songs.slice(0, 4);
  return s.length >= 4 ? s : s.slice(0, 1);
}
const timeText = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
const subText = song => [song.info?.style ? name(STYLE_NAMES, song.info.style) : W('即興', 'Jam'), song.info?.seconds ? timeText(song.info.seconds) : ''].filter(Boolean).join(' · ');

// d: { panel, row(song, listId), play(song), goMake(), zip(list), cover(song) -> url, songMenu(song, anchor),
//      recent() -> [{ track, cover, sub }] (the radio's, to keep), keepTrack(track), playTrack(track), goListen(),
//      others() -> Promise<[{ icon, title, value, onClick }]> (what else is kept: kits, clips, game records; only what there is)
export function libraryView({ panel, row, goMake, zip, play, cover = () => '', songMenu = () => {}, recent = () => [], keepTrack = () => {}, playTrack = () => {}, goListen = () => {}, others = async () => [] }) {
  let kind = null; // the songs page shows one kind only (null: all)
  let extra = [];
  let songs = [];
  let read = null;
  let query = '';
  let order = 'new';
  let list = [];
  let { lists, ok: listsOk } = readLists();
  let page = 'root'; // root | songs | lists | list
  let open = null; // the list shown, by id (page 'list')
  let mixed = null; // a shuffled copy of the open list, while 隨機播放 plays it
  const readAll = () => (read ||= listSongs().catch(() => []).then(all => (songs = all)));
  const openList = () => (page === 'list' ? lists.find(l => l.id === open) || null : null);
  function go(next, id = null) {
    page = next;
    open = id;
    mixed = null;
    draw();
    panel.scrollIntoView?.({ block: 'start' });
  }
  function saveLists(next) {
    if (!listsOk) return toast(W('讀不到清單，先不存', "Couldn't read the lists: not saved"), { tone: 'bad' });
    try {
      localStorage.setItem(LISTS, JSON.stringify(next));
    } catch {
      return toast(W('存不下：手機空間不夠？', "Couldn't save: phone storage full?"), { tone: 'bad' });
    }
    lists = next;
    if (!panel.hidden) draw();
    return true;
  }
  const newList = then => nameSheet(W('新清單', 'New playlist'), '', v => {
    const id = `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    saveLists(makeList(lists, v, id));
    then?.(id);
  });
  const countText = n => W(`${n} 首`, `${n} song${n === 1 ? '' : 's'}`);
  const img = (src, cls = '') => h('img', { class: cls, alt: '', src, loading: 'lazy', decoding: 'async', draggable: 'false' });
  // A list's (or any set of songs') cover.
  function mosaic(of, cls = '') {
    const m = mosaicOf(of);
    if (!m.length) return h('span', { class: `lib-mosaic blank ${cls}`, 'aria-hidden': 'true', html: icon('queue') });
    return h('span', { class: `lib-mosaic ${m.length > 1 ? 'four' : ''} ${cls}`, 'aria-hidden': 'true' }, m.map(s => img(cover(s))));
  }
  const back = to => h('button', { class: 'lib-back', type: 'button', 'aria-label': W('返回', 'Back'), html: icon('back-chevron'), onclick: () => go(to) });
  const iconBtn = (name, label, onclick) => h('button', { class: 'lib-btn', type: 'button', 'aria-label': label, html: icon(name), onclick });
  const bar = (left, mid, right) => h('div', { class: 'lib-nav' }, [left, mid, right]);
  const navTitle = text => h('h2', { class: 'lib-nav-title', text });

  function draw() {
    return Promise.all([readAll(), others().catch(() => []).then(x => (extra = x))]).then(paint);
  }
  function paint() {
    if (!songs.length) {
      page = 'root';
      open = null;
    }
    if (page === 'list' && !openList()) page = 'root';
    if (page === 'list') return drawList(openList());
    if (page === 'songs') return drawSongs();
    if (page === 'lists') return drawLists();
    return drawRoot();
  }

  // 資料庫: 清單 and 歌曲, then the newest kept songs as covers. With nothing kept the same
  // rows wait, greyed, and the radio's recent songs (with ♡) are how it fills.
  function drawRoot() {
    const has = songs.length > 0;
    const rows = group([
      cell({ icon: icon('queue'), title: W('清單', 'Playlists'), value: has && lists.length ? lists.length : '', chevron: has, onClick: has ? () => go('lists') : null }),
      cell({ icon: icon('note'), title: W('歌曲', 'Songs'), value: has ? songs.length : '', chevron: has, onClick: has ? () => ((kind = null), go('songs')) : null })
    ]);
    rows.classList.toggle('lib-dim', !has);
    const top = ui.navTitle(W('資料庫', 'Library'));
    // The kept songs by where they came from, and everything else kept on this phone: only what there is.
    const counts = Object.fromEntries(KINDS.map(k => [k, songs.filter(s => songKind(s) === k).length]));
    const kinds = KINDS.filter(k => counts[k]).map(k => cell({ icon: icon(KIND_ICONS[k]), title: name(KIND_NAMES, k), value: counts[k], chevron: true, onClick: () => ((kind = k), go('songs')) }));
    const sections = [
      kinds.length > 1 ? h('section', { class: 'lib-sec' }, [h('h2', { class: 'lib-sec-t', text: W('歌從哪裡來', 'Where they came from') }), group(kinds)]) : null,
      extra.length ? h('section', { class: 'lib-sec' }, [h('h2', { class: 'lib-sec-t', text: W('其他收藏', 'Also kept') }), group(extra.map(x => cell({ icon: icon(x.icon), title: x.title, value: x.value, chevron: true, onClick: x.onClick })))]) : null
    ].filter(Boolean);
    if (has) {
      const grid = h('div', { class: 'lib-grid' }, recentOf(songs).map(s => {
        const more = h('button', { class: 'lib-card-more', type: 'button', 'aria-label': W('更多', 'More'), html: icon('more'), onclick: e => (e.stopPropagation(), songMenu(s, e.currentTarget)) });
        return h('div', { class: 'lib-card' }, [
          h('button', { class: 'lib-cover', type: 'button', 'aria-label': W(`播放 ${s.name}`, `Play ${s.name}`), onclick: () => ((list = recentOf(songs)), play(s)) }, [img(cover(s))]),
          more,
          h('b', { text: s.name }),
          h('small', { text: subText(s) })
        ]);
      }));
      list = recentOf(songs);
      panel.replaceChildren(top, rows, ...sections, h('section', { class: 'lib-shelf' }, [h('h2', { text: W('最近收藏', 'Recently kept') }), grid]));
      return;
    }
    const heard = recent();
    const nodes = heard.map(({ track, cover: c, sub }) => {
      const heart = h('button', { class: 'act', type: 'button', 'aria-label': W('收藏', 'Keep'), html: icon('heart'), onclick: () => keepTrack(track) });
      return h('li', { class: 'lib-rec' }, [
        h('button', { class: 'lib-rec-main', type: 'button', 'aria-label': W(`播放 ${track.title}`, `Play ${track.title}`), onclick: () => playTrack(track) }, [img(c, 'lib-rec-cover'), h('span', { class: 'lib-rec-text' }, [h('b', { text: track.title }), h('small', { text: sub })])]),
        heart
      ]);
    });
    panel.replaceChildren(
      ...[top,
      rows,
      ...sections,
      nodes.length ? h('section', { class: 'lib-shelf' }, [h('h2', { text: W('最近播放', 'Recently played') }), h('ol', { class: 'lib-recs' }, nodes)]) : ui.empty({ icon: icon('heart'), title: W('還沒有收藏的歌', 'No songs kept yet'), body: W('聽到喜歡的歌按愛心，或做一首歌，就會在這裡。', 'Tap the heart on a song you like, or make one: it shows up here.') }),
      h('div', { class: 'lib-actions' }, [
        h('button', { class: 'primary', type: 'button', html: `${icon('radio')}<span>${W('聽電台', 'Listen to Radio')}</span>`, onclick: goListen }),
        h('button', { class: 'secondary', type: 'button', html: `${icon('create')}<span>${W('去做歌', 'Make songs')}</span>`, onclick: goMake })
      ])].filter(Boolean)
    );
  }

  // 清單: every list, a cover each.
  function drawLists() {
    const rows = lists.map(x => {
      const of = songsOf(x, songs);
      return h('button', { class: 'lib-lrow', type: 'button', onclick: () => go('list', x.id) }, [mosaic(of, 'sm'), h('span', { class: 'lib-ltext' }, [h('b', { text: x.name }), h('small', { text: countText(of.length) })]), h('span', { class: 'lib-chev', html: icon('chevron') })]);
    });
    panel.replaceChildren(
      bar(back('root'), navTitle(W('清單', 'Playlists')), iconBtn('plus', W('新清單', 'New playlist'), () => newList())),
      rows.length ? h('div', { class: 'lib-lrows' }, rows) : h('button', { class: 'add-row', type: 'button', html: `${icon('plus')}<span>${W('新清單', 'New playlist')}</span>`, onclick: () => newList() })
    );
  }

  // 歌曲: every kept song, found by a word and put in an order.
  function drawSongs() {
    const search = h('input', { type: 'search', placeholder: W('找歌名、節奏、調', 'Find a name, groove, key'), 'aria-label': W('找歌', 'Find a song'), autocomplete: 'off' });
    search.value = query;
    const sort = iconBtn('sort', W('排序', 'Order'), () => menu(sort, ORDERS.map(o => ({ label: name(ORDER_NAMES, o), icon: o === order ? 'check' : undefined, onClick: () => ((order = o), fill()) }))));
    const more = iconBtn('more', W('更多', 'More'), () =>
      menu(more, [{ label: query ? W(`下載這 ${list.length} 首`, `Download these ${list.length}`) : W('全部下載', 'Download all'), icon: 'download', onClick: () => list.length && zip(list) }])
    );
    const ol = h('ol', { class: 'songs' });
    const none = h('p', { class: 'lib-none', text: W('沒有符合的歌', 'No song matches') });
    const fill = () => {
      list = shownOf(kind ? songs.filter(s => songKind(s) === kind) : songs, { query, order });
      ol.replaceChildren(...list.map(s => row(s, null)));
      none.hidden = list.length > 0;
    };
    search.addEventListener('input', () => ((query = search.value.trim()), fill()));
    fill();
    panel.replaceChildren(bar(back('root'), navTitle(kind ? name(KIND_NAMES, kind) : W('歌曲', 'Songs')), h('span', { class: 'lib-btns' }, [sort, more])), h('div', { class: 'lib-tools' }, [search]), h('section', { class: 'card' }, [none, ol]));
  }

  // One list: its cover and name, 播放 and 隨機播放, then its songs in order.
  function drawList(l) {
    list = songsOf(l, songs);
    const more = iconBtn('more', W('更多', 'More'), () =>
      menu(more, [
        { label: W('重新命名', 'Rename'), icon: 'edit', onClick: () => nameSheet(W('重新命名', 'Rename'), l.name, v => saveLists(renameList(lists, l.id, v))) },
        { label: W('下載這些歌', 'Download these'), icon: 'download', onClick: () => list.length && zip(list) },
        'divider',
        {
          label: W('刪除清單', 'Delete playlist'),
          icon: 'trash',
          danger: true,
          onClick: async () => {
            const yes = await ask({ title: W(`刪除「${l.name}」？`, `Delete “${l.name}”?`), body: W('歌還會留在資料庫裡。', 'The songs stay in your Library.'), ok: W('刪除', 'Delete'), cancel: W('取消', 'Cancel'), danger: true, lang });
            if (yes) (go('lists'), saveLists(deleteList(lists, l.id)));
          }
        }
      ])
    );
    const playBtn = h('button', { class: 'lib-pill', type: 'button', disabled: !list.length, html: `${icon('play')}<span>${W('播放', 'Play')}</span>`, onclick: () => list.length && ((mixed = null), play(list[0])) });
    const shuffleBtn = h('button', { class: 'lib-pill', type: 'button', disabled: list.length < 2, html: `${icon('shuffle')}<span>${W('隨機播放', 'Shuffle')}</span>`, onclick: () => list.length && ((mixed = shuffled(list)), play(mixed[0])) });
    const ol = h('ol', { class: 'songs' }, list.map(s => row(s, l.id)));
    panel.replaceChildren(
      bar(back('lists'), h('span'), more),
      h('div', { class: 'lib-hero' }, [mosaic(list, 'lg'), h('h2', { text: l.name })]),
      h('div', { class: 'lib-pills' }, [playBtn, shuffleBtn]),
      ...(list.length ? [h('section', { class: 'card' }, [ol])] : [])
    );
  }
  // ⋯ 加到清單: each list, ✓ on those the song is in; a tap puts it in or takes it out.
  function pickList(song) {
    const body = h('div', { class: 'sheet-lists' });
    const fill = () =>
      body.replaceChildren(
        group([
          ...lists.map(x => {
            const has = x.songs.includes(song.id);
            return cell({ title: x.name, sub: countText(songsOf(x, songs).length), trailing: has ? h('span', { class: 'lib-check', html: icon('check') }) : null, onClick: () => (saveLists(has ? removeFrom(lists, x.id, song.id) : addTo(lists, x.id, song.id)), fill(), toast(has ? W(`已從「${x.name}」移除`, `Removed from “${x.name}”`) : W(`已加到「${x.name}」`, `Added to “${x.name}”`), { ms: 1400 })) });
          }),
          cell({ title: W('新清單…', 'New playlist…'), onClick: () => (s.close(), newList(id => (saveLists(addTo(lists, id, song.id)), toast(W('已加到新清單', 'Added to the new playlist'), { ms: 1400 })))) })
        ])
      );
    fill();
    const s = sheet({ title: W('加到清單', 'Add to playlist'), closeLabel: W('關閉', 'Close'), body });
  }
  const shownNow = () => !panel.hidden;
  return {
    draw,
    read: readAll,
    has: id => songs.some(s => s.id === id),
    add(rec) {
      songs = [rec, ...songs.filter(s => s.id !== rec.id)];
      if (shownNow()) draw();
    },
    remove(id) {
      songs = songs.filter(s => s.id !== id);
      const next = dropSong(lists, id);
      if (!(next !== lists && saveLists(next)) && shownNow()) draw();
    },
    // Every kept song, and one with its sound made small (資料庫瘦身).
    all: () => songs,
    get: id => songs.find(s => s.id === id) || null,
    replace(rec) {
      songs = songs.map(s => (s.id === rec.id ? rec : s));
      list = list.map(s => (s.id === rec.id ? rec : s));
    },
    rename(id, v) {
      songs = songs.map(s => (s.id === id ? { ...s, name: v } : s));
    },
    pickList,
    // Out of the list it's shown in.
    unlist(listId, id) {
      saveLists(removeFrom(lists, listId, id));
    },
    // The songs as shown (the player goes on to the next of these): the open list's, in its order.
    shown: () => {
      const l = openList();
      return l ? mixed || songsOf(l, songs) : list.length ? list : shownOf(songs, { query, order });
    }
  };
}

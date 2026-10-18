// 歌單: the songs kept on this phone (lib/kits.mjs's store), newest first,
// found by a word of their name, groove or key and put in another order
// (newest, name, longest, groove), all of what's shown in a zip. The rows
// are the page's (app.js songRow), so a song plays, keeps and shares the
// same wherever it's shown. 清單: lists of kept songs (lib/lists.mjs), each
// opened to play in its order.
import { h, empty, sheet, cell, list as group, menu, toast } from '#kit/ui.mjs';
import { ask } from '#kit/quadra.mjs';
import { listSongs } from './kits.mjs';
import { listsOf, makeList, renameList, deleteList, addTo, removeFrom, dropSong, songsOf } from './lists.mjs';
import { STYLE_NAMES, name } from './names.mjs';
import { W, en, lang } from './lang.mjs';

export const ORDERS = ['new', 'name', 'long', 'style'];
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
function nameSheet(title, value, done) {
  const input = h('input', { class: 'num', type: 'text', style: { width: '100%', textAlign: 'left', padding: '0 12px' }, maxlength: 40, 'aria-label': W('名稱', 'Name') });
  input.value = value;
  const go = () => {
    const v = input.value.trim().slice(0, 40);
    s.close();
    if (v && v !== value) done(v);
  };
  input.addEventListener('keydown', e => e.key === 'Enter' && go());
  const s = sheet({ title, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'card sheet-card' }, [input, h('button', { class: 'primary', type: 'button', text: W('好', 'Done'), onclick: go })]) });
  setTimeout(() => input.focus(), 60);
}

export function libraryView({ panel, row, goMake, zip, play }) {
  let songs = [];
  let read = null;
  let query = '';
  let order = 'new';
  let list = [];
  let { lists, ok: listsOk } = readLists();
  let open = null; // the list shown, by id (null: every kept song)
  const readAll = () => (read ||= listSongs().catch(() => []).then(all => (songs = all)));
  const openList = () => lists.find(l => l.id === open) || null;
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

  async function draw() {
    await readAll();
    const mb = songs.reduce((s, x) => s + (x.wav?.size || 0), 0) / 1e6;
    const head = h('div', { class: 'lib-head' }, [h('h2', { text: W('歌單', 'Library') }), songs.length ? h('small', { text: W(`${songs.length} 首 · ${mb.toFixed(mb < 10 ? 1 : 0)} MB`, `${songs.length} song${songs.length === 1 ? '' : 's'} · ${mb.toFixed(mb < 10 ? 1 : 0)} MB`) }) : null]);
    if (!songs.length) {
      open = null;
      panel.replaceChildren(
        head,
        h('section', { class: 'card' }, [
          empty({
            icon: '♡',
            title: W('還沒有收藏的歌', 'Nothing kept yet'),
            body: W('做好的歌按 ♡，就會存在這裡：離線也能聽、分享。你收藏的風格，下次做歌會多做一些。', 'Tap ♡ on a song to keep it here: play it offline, share it. The styles you keep come up more next time.'),
            action: h('button', { class: 'secondary', type: 'button', text: W('去做歌', 'Make songs'), onclick: goMake })
          })
        ])
      );
      return;
    }
    const l = openList();
    if (l) return drawList(l);
    open = null;
    const search = h('input', { type: 'search', placeholder: W('找歌名、節奏、調', 'Find a name, groove, key'), 'aria-label': W('找歌', 'Find a song'), autocomplete: 'off' });
    search.value = query;
    const sort = h('select', { 'aria-label': W('排序', 'Order') }, ORDERS.map(o => h('option', { value: o, text: name(ORDER_NAMES, o) })));
    sort.value = order;
    const ol = h('ol', { class: 'songs' });
    const zipBtn = h('button', { class: 'secondary', type: 'button', text: W('全部下載', 'Download all'), onclick: () => list.length && zip(list) });
    const none = h('p', { class: 'hint', text: W('沒有符合的歌', 'No song matches') });
    const fill = () => {
      list = shownOf(songs, { query, order });
      ol.replaceChildren(...list.map(s => row(s, null)));
      none.hidden = list.length > 0;
      zipBtn.disabled = !list.length;
      zipBtn.textContent = query ? W(`下載這 ${list.length} 首`, `Download these ${list.length}`) : W('全部下載', 'Download all');
    };
    search.addEventListener('input', () => ((query = search.value.trim()), fill()));
    sort.addEventListener('change', () => ((order = sort.value), fill()));
    fill();
    const playlists = h('section', { class: 'card lib-lists' }, [
      h('div', { class: 'head' }, [h('h2', { text: W('清單', 'Playlists') }), h('button', { class: 'secondary', type: 'button', text: W('＋ 新清單', '+ New'), onclick: () => newList() })]),
      lists.length
        ? h('div', { class: 'q-list' }, lists.map(x => cell({ title: x.name, value: countText(songsOf(x, songs).length), chevron: true, onClick: () => ((open = x.id), draw(), panel.scrollIntoView?.({ block: 'start' })) })))
        : h('p', { class: 'hint', text: W('在歌的 ⋯ 選「加到清單」', 'Add a song from its ⋯ menu') })
    ]);
    panel.replaceChildren(head, h('div', { class: 'lib-tools' }, [search, sort]), playlists, h('section', { class: 'card' }, [h('div', { class: 'head' }, [h('h2', { text: W('收藏的歌', 'Kept songs') }), zipBtn]), none, ol]), h('footer', { text: W('存在這支手機上 · 不上傳', 'Kept on this phone · never uploaded') }));
  }
  // One list: its songs in order, ▶ plays them from the first.
  function drawList(l) {
    list = songsOf(l, songs);
    const back = h('button', { class: 'lib-back', type: 'button', text: W('‹ 歌單', '‹ Library'), onclick: () => ((open = null), draw()) });
    const more = h('button', { class: 'lib-more', type: 'button', 'aria-label': W('更多', 'More'), text: '⋯' });
    more.onclick = () =>
      menu(more, [
        { label: W('重新命名', 'Rename'), icon: '✎', onClick: () => nameSheet(W('重新命名', 'Rename'), l.name, v => saveLists(renameList(lists, l.id, v))) },
        { label: W('下載這些歌', 'Download these'), icon: '↓', onClick: () => list.length && zip(list) },
        'divider',
        {
          label: W('刪除清單', 'Delete playlist'),
          icon: '✕',
          danger: true,
          onClick: async () => {
            const yes = await ask({ title: W(`刪除「${l.name}」？`, `Delete “${l.name}”?`), body: W('歌還會留在歌單裡。', 'The songs stay in your Library.'), ok: W('刪除', 'Delete'), cancel: W('取消', 'Cancel'), danger: true, lang });
            if (yes) ((open = null), saveLists(deleteList(lists, l.id)));
          }
        }
      ]);
    const playBtn = h('button', { class: 'primary', type: 'button', text: W('▶ 依序播放', '▶ Play in order'), disabled: !list.length, onclick: () => list.length && play(list[0]) });
    const ol = h('ol', { class: 'songs' }, list.map(s => row(s, l.id)));
    panel.replaceChildren(
      h('div', { class: 'lib-nav' }, [back, more]),
      h('div', { class: 'lib-head' }, [h('h2', { text: l.name }), h('small', { text: countText(list.length) })]),
      h('section', { class: 'card' }, [playBtn, list.length ? ol : h('p', { class: 'hint', text: W('在歌的 ⋯ 選「加到清單」', 'Add a song from its ⋯ menu') })])
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
            return cell({ title: x.name, sub: countText(songsOf(x, songs).length), value: has ? '✓' : '', onClick: () => (saveLists(has ? removeFrom(lists, x.id, song.id) : addTo(lists, x.id, song.id)), fill(), toast(has ? W(`已從「${x.name}」移除`, `Removed from “${x.name}”`) : W(`已加到「${x.name}」`, `Added to “${x.name}”`), { ms: 1400 })) });
          }),
          cell({ title: W('＋ 新清單…', '+ New playlist…'), onClick: () => (s.close(), newList(id => (saveLists(addTo(lists, id, song.id)), toast(W('已加到新清單', 'Added to the new playlist'), { ms: 1400 })))) })
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
      return l ? songsOf(l, songs) : list.length ? list : shownOf(songs, { query, order });
    }
  };
}

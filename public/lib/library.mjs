// 歌單: the songs kept on this phone (lib/kits.mjs's store), newest first,
// found by a word of their name, groove or key and put in another order
// (newest, name, longest, groove), all of what's shown in a zip. The rows
// are the page's (app.js songRow), so a song plays, keeps and shares the
// same wherever it's shown.
import { h, empty } from '#kit/ui.mjs';
import { listSongs } from './kits.mjs';
import { STYLE_NAMES, name } from './names.mjs';
import { W, en } from './lang.mjs';

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

export function libraryView({ panel, row, goMake, zip }) {
  let songs = [];
  let read = null;
  let query = '';
  let order = 'new';
  let list = [];
  const readAll = () => (read ||= listSongs().catch(() => []).then(all => (songs = all)));

  async function draw() {
    await readAll();
    const mb = songs.reduce((s, x) => s + (x.wav?.size || 0), 0) / 1e6;
    const head = h('div', { class: 'lib-head' }, [h('h2', { text: W('歌單', 'Library') }), songs.length ? h('small', { text: W(`${songs.length} 首 · ${mb.toFixed(mb < 10 ? 1 : 0)} MB`, `${songs.length} song${songs.length === 1 ? '' : 's'} · ${mb.toFixed(mb < 10 ? 1 : 0)} MB`) }) : null]);
    if (!songs.length) {
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
    const search = h('input', { type: 'search', placeholder: W('找歌名、節奏、調', 'Find a name, groove, key'), 'aria-label': W('找歌', 'Find a song'), autocomplete: 'off' });
    search.value = query;
    const sort = h('select', { 'aria-label': W('排序', 'Order') }, ORDERS.map(o => h('option', { value: o, text: name(ORDER_NAMES, o) })));
    sort.value = order;
    const ol = h('ol', { class: 'songs' });
    const zipBtn = h('button', { class: 'secondary', type: 'button', text: W('全部下載', 'Download all'), onclick: () => list.length && zip(list) });
    const none = h('p', { class: 'hint', text: W('沒有符合的歌', 'No song matches') });
    const fill = () => {
      list = shownOf(songs, { query, order });
      ol.replaceChildren(...list.map(s => row(s)));
      none.hidden = list.length > 0;
      zipBtn.disabled = !list.length;
      zipBtn.textContent = query ? W(`下載這 ${list.length} 首`, `Download these ${list.length}`) : W('全部下載', 'Download all');
    };
    search.addEventListener('input', () => ((query = search.value.trim()), fill()));
    sort.addEventListener('change', () => ((order = sort.value), fill()));
    fill();
    panel.replaceChildren(head, h('div', { class: 'lib-tools' }, [search, sort]), h('section', { class: 'card' }, [h('div', { class: 'head' }, [h('h2', { text: W('收藏的歌', 'Kept songs') }), zipBtn]), none, ol]), h('footer', { text: W('存在這支手機上 · 不上傳', 'Kept on this phone · never uploaded') }));
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
      if (shownNow()) draw();
    },
    rename(id, v) {
      songs = songs.map(s => (s.id === id ? { ...s, name: v } : s));
    },
    // The songs as shown (the player goes on to the next of these).
    shown: () => (list.length ? list : shownOf(songs, { query, order }))
  };
}

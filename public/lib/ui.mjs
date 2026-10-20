// The kit's ui.mjs (h, sheet, menu, toast, …) with two changes for this app: a menu's
// icons are drawn from lib/icons.mjs (an item's `icon` is an icon's name), and an empty
// state may take an SVG icon. (A sheet's close is the kit's own.)
import { h, menu as kitMenu, empty as kitEmpty } from '#kit/ui.mjs';
import { icon } from './icons.mjs';

export * from '#kit/ui.mjs';

// opts: { header: { cover?, title, sub? } } puts a small header (cover, title, line) on top;
// { scrim: true } dims the page behind it until it closes. An item may have `check: true`
// (a tick after the label, for the choice that is on).
export function menu(anchor, items, opts = {}) {
  const m = kitMenu(anchor, items.map(it => (it === 'divider' ? it : { ...it, icon: undefined })));
  const buttons = [...m.el.querySelectorAll('button[role="menuitem"]')];
  items.filter(it => it !== 'divider').forEach((it, i) => {
    if (it.icon) buttons[i]?.append(h('span', { class: 'mi', 'aria-hidden': 'true', html: icon(it.icon) }));
    if (it.check) {
      buttons[i]?.classList.add('on');
      buttons[i]?.append(h('span', { class: 'mi', 'aria-hidden': 'true', html: icon('check') }));
    }
  });
  const hd = opts.header;
  if (hd) {
    m.el.prepend(h('div', { class: 'mh' }, [hd.cover ? h('img', { class: 'mh-cover', alt: '', src: hd.cover }) : null, h('div', { class: 'mh-text' }, [h('b', { text: hd.title || '' }), hd.sub ? h('small', { text: hd.sub }) : null])]), h('hr'));
    // (The header takes room: place the menu again, as the kit did without it.)
    const r = anchor.getBoundingClientRect();
    const below = r.bottom + 8 + m.el.offsetHeight < innerHeight - 16;
    m.el.style.top = below ? `${r.bottom + 8}px` : `${Math.max(16, r.top - 8 - m.el.offsetHeight)}px`;
    m.el.style.setProperty('--q-menu-origin', `${r.left + r.width / 2 - parseFloat(m.el.style.left)}px ${below ? '0' : '100%'}`);
  }
  if (opts.scrim) {
    const sc = h('div', { class: 'q-menu-scrim' });
    m.el.before(sc);
    const gone = new MutationObserver(() => m.el.isConnected || (sc.remove(), gone.disconnect()));
    gone.observe(document.body, { childList: true });
  }
  return m;
}
// (An icon given as an SVG string is drawn, not shown as text.)
export function empty(o = {}) {
  const el = kitEmpty({ ...o, icon: String(o.icon || '').startsWith('<svg') ? '' : o.icon });
  // (In the kit's accent tile, as the kit's own icons are.)
  if (String(o.icon || '').startsWith('<svg')) el.prepend(h('span', { class: 'q-tile q-empty-tile', 'aria-hidden': 'true', html: o.icon }));
  return el;
}

// The kit's ui.mjs (h, sheet, menu, toast, …) with two changes for this app: a menu's
// icons are drawn from lib/icons.mjs (an item's `icon` is an icon's name), and an empty
// state may take an SVG icon. (A sheet's close is the kit's own.)
import { h, menu as kitMenu, empty as kitEmpty } from '#kit/ui.mjs';
import { icon } from './icons.mjs';

export * from '#kit/ui.mjs';

export function menu(anchor, items) {
  const m = kitMenu(anchor, items.map(it => (it === 'divider' ? it : { ...it, icon: undefined })));
  const buttons = [...m.el.querySelectorAll('button[role="menuitem"]')];
  items.filter(it => it !== 'divider').forEach((it, i) => it.icon && buttons[i]?.append(h('span', { class: 'mi', 'aria-hidden': 'true', html: icon(it.icon) })));
  return m;
}
// (An icon given as an SVG string is drawn, not shown as text.)
export function empty(o = {}) {
  const el = kitEmpty({ ...o, icon: String(o.icon || '').startsWith('<svg') ? '' : o.icon });
  if (String(o.icon || '').startsWith('<svg')) el.prepend(h('span', { class: 'q-empty-icon', 'aria-hidden': 'true', html: o.icon }));
  return el;
}

// The kit's ui.mjs (h, sheet, menu, toast, …) with two changes for this app: a menu's
// icons are drawn from lib/icons.mjs (an item's `icon` is an icon's name), and a sheet's
// close button is an icon, not a character.
import { h, sheet as kitSheet, menu as kitMenu } from '#kit/ui.mjs';
import { icon } from './icons.mjs';

export * from '#kit/ui.mjs';

export function menu(anchor, items) {
  const m = kitMenu(anchor, items.map(it => (it === 'divider' ? it : { ...it, icon: undefined })));
  const buttons = [...m.el.querySelectorAll('button[role="menuitem"]')];
  items.filter(it => it !== 'divider').forEach((it, i) => it.icon && buttons[i]?.append(h('span', { class: 'mi', 'aria-hidden': 'true', html: icon(it.icon) })));
  return m;
}
export function sheet(o) {
  const s = kitSheet(o);
  const x = s.el.querySelector('.q-close');
  if (x) x.innerHTML = icon('close');
  return s;
}

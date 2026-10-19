// One set of simple 24 px icons for the whole app (stroke, round caps), as SVG
// strings. No emoji or symbol characters in the UI: an icon is drawn here.
// icon(name, { size, cls }) -> '<svg …>'. Filled ones (play, pause, heart-fill,
// record, stop, more) fill with currentColor; the rest are strokes.
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor" stroke="none"';
const HEART = 'M12 20.3s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z';
const PATHS = {
  play: [F, '<path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"/>'],
  pause: [F, '<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>'],
  next: [F, '<path d="M5 5.6v12.8a1 1 0 0 0 1.55.83L15 13.1v5.3a1 1 0 0 0 2 0V5.6a1 1 0 0 0-2 0v5.3L6.55 4.77A1 1 0 0 0 5 5.6z"/>'],
  prev: [F, '<path d="M19 5.6v12.8a1 1 0 0 1-1.55.83L9 13.1v5.3a1 1 0 0 1-2 0V5.6a1 1 0 0 1 2 0v5.3l8.45-6.13A1 1 0 0 1 19 5.6z"/>'],
  shuffle: [S, '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'],
  dice: [S, '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>'],
  loop: [S, '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'],
  'loop-one': [S, '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/><path d="M11 10l1.5-1v6"/>'],
  queue: [S, '<path d="M4 6h16M4 12h10M4 18h7"/><path d="M17 14v6l5-3z" fill="currentColor"/>'],
  heart: [S, `<path d="${HEART}"/>`],
  'heart-fill': [`${S.replace('fill="none"', 'fill="currentColor"')}`, `<path d="${HEART}"/>`],
  more: [F, '<circle cx="5.5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18.5" cy="12" r="1.9"/>'],
  close: [S, '<path d="M6 6l12 12M18 6 6 18"/>'],
  check: [S, '<path d="M5 12.5l4.5 4.5L19 7.5"/>'],
  edit: [S, '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 7.5l3 3"/>'],
  share: [S, '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>'],
  download: [S, '<path d="M12 3v12M8 11l4 4 4-4M5 20h14"/>'],
  upload: [S, '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'],
  record: [F, '<circle cx="12" cy="12" r="7"/>'],
  stop: [F, '<rect x="6" y="6" width="12" height="12" rx="2.4"/>'],
  cut: [S, '<circle cx="6" cy="6.5" r="2.6"/><circle cx="6" cy="17.5" r="2.6"/><path d="M8 8l12 9M8 16 20 7"/>'],
  'back-chevron': [S, '<path d="M15 5l-7 7 7 7"/>'],
  chevron: [S, '<path d="M9 5l7 7-7 7"/>'],
  down: [S, '<path d="M5 9l7 7 7-7"/>'],
  up: [S, '<path d="M5 15l7-7 7 7"/>'],
  plus: [S, '<path d="M12 5v14M5 12h14"/>'],
  minus: [S, '<path d="M5 12h14"/>'],
  trash: [S, '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 19l1-12M9 7V4.5h6V7"/>'],
  search: [S, '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'],
  home: [S, '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'],
  create: [S, '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M8 4.5v8M12 4.5v8M16 4.5v8M3.5 12.5h17"/>'],
  library: [S, '<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M9 16.5V8.5l6-1.2v8"/><circle cx="8" cy="16.5" r="1.4"/><circle cx="14" cy="15.5" r="1.4"/>'],
  note: [S, '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'],
  moon: [F, '<path d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a.6.6 0 0 0-.8-.7A9.3 9.3 0 1 0 20.9 15.4a.6.6 0 0 0-.7-.8z"/>'],
  undo: [S, '<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12"/>'],
  refresh: [S, '<path d="M20 11a8 8 0 0 0-14-4.5L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4.5l2-2.5"/><path d="M20 20v-5h-5"/>'],
  arrow: [S, '<path d="M5 12h14M13 6l6 6-6 6"/>'],
  'arrow-up': [S, '<path d="M12 19V5M6 11l6-6 6 6"/>'],
  'arrow-down': [S, '<path d="M12 5v14M6 13l6 6 6-6"/>'],
  info: [S, '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>'],
  grid: [S, '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'],
  radio: [S, '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>'],
  mic: [S, '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'],
  copy: [S, '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>'],
  grip: [S, '<path d="M5 8h14M5 12h14M5 16h14"/>'],
  play_next: [S, '<path d="M4 6h10M4 12h7M4 18h7"/><path d="M15 12v8l6-4z" fill="currentColor"/>']
};
export const ICON_NAMES = Object.keys(PATHS);
// -> '<svg …>…</svg>'. size: px, or '' to let CSS size it.
export function icon(name, { size = '', cls = '' } = {}) {
  const [attrs, body] = PATHS[name] || PATHS.more;
  const dim = size ? ` width="${size}" height="${size}"` : '';
  // (Also as an inline style: a stylesheet's `svg { fill: none }` must not undo a filled icon.)
  const style = [...attrs.matchAll(/([a-z-]+)="([^"]*)"/g)].map(m => `${m[1]}:${m[2]}`).join(';');
  return `<svg viewBox="0 0 24 24"${dim} ${attrs} style="${style}"${cls ? ` class="${cls}"` : ''} aria-hidden="true" focusable="false">${body}</svg>`;
}
// The tab bar (the kit's tabBar) takes the inner markup of a 24 px stroke icon.
export const inner = name => PATHS[name][1];

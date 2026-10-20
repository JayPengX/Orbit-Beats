// Taking pieces out of the kit, undoing it, and kits kept by name. No DOM, no
// IndexedDB here: the tests run it (lib/kits.mjs keeps the named kits).

// The kit without some pieces. Pieces come from splitting the sources, so what
// is left is rebuilt as sources of its own (one per piece, still named after the
// file it came from); the roles set by hand follow their pieces to new numbers.
// `drop` is a Set of piece numbers.
export function dropPieces({ pieces, sources, roles, edited }, drop) {
  const keep = pieces.map((_, i) => i).filter(i => !drop.has(i));
  const left = keep.map(i => {
    const p = pieces[i];
    const s = sources[p.src] || {};
    return { name: s.name || '', sr: s.sr, L: p.L, R: p.R };
  });
  return { sources: left, roles: keep.map(i => roles[i]), edited: new Set(keep.flatMap((i, n) => (edited.has(i) ? [n] : []))) };
}

// A copy of the kit as it stands, to come back to (the sound is shared, never copied).
export const snapOf = ({ sources, roles, edited, bpm }) => ({ sources: [...sources], roles: [...roles], edited: [...edited], bpm });

// Roles to put back after a kit was split again: only if it split into as many pieces as before.
export function rolesBack(snap, count) {
  if (!snap || snap.roles.length !== count) return null;
  return { roles: [...snap.roles], edited: new Set(snap.edited) };
}

// The last few things undone, newest first: { label, snap } each; a new one on
// top, the oldest let go past `most`.
export function undoStack(most = 5) {
  const items = [];
  return {
    push(label, snap) {
      items.unshift({ label, snap });
      items.length = Math.min(items.length, most);
    },
    pop: () => items.shift() || null,
    peek: () => items[0] || null,
    clear: () => (items.length = 0),
    get size() {
      return items.length;
    }
  };
}

// ---- Kits kept by name ----

// A name not taken yet: "Kit", "Kit 2", "Kit 3"…
export function freeName(base, taken) {
  const names = new Set(taken.map(x => x.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}
// A kit as kept: its files' sound, tempo and the roles set by hand.
export function namedKit({ id, name, at = Date.now(), sources, roles, edited, bpm, count = roles.length }) {
  const set = {};
  for (const i of edited) if (roles[i]) set[i] = roles[i];
  return {
    id,
    name: String(name).trim().slice(0, 40) || 'Kit',
    at,
    bpm,
    count,
    roles: set,
    sources: sources.map(x => ({ name: x.name, sr: x.sr, L: x.L, R: x.R === x.L ? null : x.R }))
  };
}
// A kept kit as the page can open it: sources, tempo and { piece number: role } set by hand.
export const kitFrom = kept => ({
  sources: kept.sources.map(x => ({ name: x.name, sr: x.sr, L: x.L, R: x.R || x.L })),
  bpm: kept.bpm,
  set: kept.roles || {}
});

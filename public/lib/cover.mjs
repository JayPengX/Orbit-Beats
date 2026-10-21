// 聽's covers: each song's own artwork, drawn from what the song is (its
// seed, groove, mood, key and tempo), the same every time for the same song.
// A groove has its colour and its shape, one of twenty-four (rings, waves, a sun,
// shards, dots, Bauhaus arcs, a level meter's bars, 8-bit pixels, a retro grid,
// diagonal stripes, a colour mesh, stars, mountains, a vinyl, halftone, ribbons,
// orbits, a skyline, a spiral, zigzags, a checkerboard, petals, a prism, sun rays),
// no two grooves of one mood sharing one; each seed sets the shape's own place,
// turn and size, its framing (as it is, mirrored, in a disc, tiled four times),
// sometimes a kindred shape in its place, and often a second, fainter one behind;
// the mood and the key move the colour (minor cooler and darker, chill softer),
// the tempo sets how many rings, waves or stripes. The title is set small in the
// corner, as on a record sleeve; a station's cover has its name set large.
// No DOM: an SVG string, shown as an <img> and drawn to a PNG for the lock
// screen (lib/radioview.mjs).

// A small seeded generator (mulberry32): the same seed, the same cover.
export function coverRng(seed) {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: list => list[Math.floor(next() * list.length)] };
}

// Each groove: its hue and its shape.
export const STYLE_ART = {
  four: [262, 'rings'], hiphop: [28, 'dots'], trap: [298, 'shards'], half: [232, 'ribbons'], broken: [146, 'arcs'], house: [285, 'halftone'],
  dembow: [356, 'rings'], afro: [20, 'stripes'], drill: [216, 'grid'], boombap: [36, 'orbits'], jersey: [322, 'blocks'], amapiano: [50, 'blocks'],
  lofi: [204, 'waves'], funk: [44, 'mesh'], garage: [172, 'stars'], dnb: [192, 'sun'], reggae: [128, 'stars'], phonk: [346, 'vinyl'],
  baile: [92, 'waves'], techno: [208, 'orbits'], jazz: [222, 'arcs'], bossa: [160, 'mountains'], samba: [58, 'orbits'], salsa: [8, 'ribbons'],
  rock: [0, 'bars'], punk: [312, 'dots'], metal: [240, 'mountains'], citypop: [300, 'sun'], kpop: [326, 'waves'], synthwave: [290, 'grid'],
  disco: [270, 'vinyl'], gospel: [48, 'shards'], neosoul: [276, 'bars'], ballad: [200, 'mesh'], ambient: [186, 'spiral'], cinematic: [226, 'prism'],
  chiptune: [120, 'pixels'], kizomba: [330, 'petals'], highlife: [40, 'pixels'], cumbia: [80, 'zigzag'], bhangra: [30, 'grid'], dubstep: [262, 'checker'],
  footwork: [64, 'pixels'], jungle: [100, 'ribbons'], trance: [196, 'stripes'], hardstyle: [350, 'mesh'], chinese: [354, 'arcs'], blues: [214, 'stripes'],
  country: [34, 'sunrays']
};
// What a mood does to the colour: saturation and lightness, a nudge of hue.
const MOOD_TONE = { chill: [0.72, 6, -6], hype: [1, -6, 0], groove: [0.92, 0, 0], classic: [0.7, -2, 12], pop: [0.95, 4, 0], jazz: [0.65, -4, 8], world: [0.9, 2, 4] };

const wrap = h => ((Math.round(h) % 360) + 360) % 360;
const hsl = (h, s, l, a = 1) => (a === 1 ? `hsl(${wrap(h)} ${Math.round(s)}% ${Math.round(l)}%)` : `hsl(${wrap(h)} ${Math.round(s)}% ${Math.round(l)}% / ${a})`);

// The song's colours. -> { hue, shape, bg0, bg1, accent, glow, soft, amb, hues: [h1, h2] }
// amb: the one colour the page's tint takes (mid lightness: shows on light and dark).
export function coverPalette({ seed = 0, style = 'four', mood = 'all', key = null, bpm = 110 } = {}) {
  const [base, shape] = STYLE_ART[style] || [Math.floor(coverRng(seed).next() * 360), 'rings'];
  const R = coverRng(seed ^ 0x51ed27);
  const [sat, light, nudge] = MOOD_TONE[mood] || [0.9, 0, 0];
  const minor = Boolean(key?.minor);
  const h1 = base + nudge + (key ? ((key.tonic * 7) % 24) - 12 : 0) + R.range(-14, 14) + (minor ? -10 : 6);
  const h2 = h1 + R.pick([34, 48, 150, 180, 205, -42]);
  const s = 78 * sat;
  const l = (minor ? 30 : 36) + light + Math.min(6, Math.max(-6, (bpm - 110) / 12));
  return {
    hue: wrap(h1),
    shape,
    hues: [wrap(h1), wrap(h2)],
    bg0: hsl(h1, s, l),
    bg1: hsl(h2, s * 0.9, l - 14),
    accent: hsl(h2, Math.min(96, s + 18), 64),
    glow: hsl(h1 + 20, Math.min(96, s + 14), 70),
    soft: hsl(h1, s * 0.6, 88),
    amb: hsl(h1, Math.min(90, s + 6), 52)
  };
}

// How many rings, waves or stripes: more the faster it goes.
export const coverCount = (bpm, lo, hi, per) => Math.max(lo, Math.min(hi, Math.round(bpm / per)));

const n1 = x => Math.round(x * 10) / 10;
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function shapes(shape, p, R, bpm) {
  const out = [];
  if (shape === 'rings') {
    const cx = R.range(300, 420);
    const cy = R.range(90, 220);
    const n = coverCount(bpm, 5, 12, 14);
    const step = R.range(30, 42);
    out.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(step * 1.2)}" fill="${p.accent}" opacity=".9"/>`);
    for (let i = 2; i <= n; i++) out.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(step * i)}" fill="none" stroke="${i % 3 ? p.glow : p.accent}" stroke-width="${i % 2 ? 2 : 5}" opacity="${n1(Math.max(0.12, 0.85 - i * 0.07))}"/>`);
  } else if (shape === 'waves') {
    const n = coverCount(bpm, 4, 8, 18);
    const freq = R.range(1.1, 2.4);
    for (let i = 0; i < n; i++) {
      const y0 = 190 + (i * 300) / n;
      const amp = R.range(10, 34);
      const ph = R.range(0, Math.PI * 2);
      let d = `M0 ${n1(y0)}`;
      for (let x = 0; x <= 512; x += 16) d += ` L${x} ${n1(y0 + Math.sin((x / 512) * Math.PI * 2 * freq + ph) * amp)}`;
      d += ' L512 512 L0 512Z';
      out.push(`<path d="${d}" fill="${i % 2 ? p.accent : p.glow}" opacity="${n1(0.18 + (i / n) * 0.42)}"/>`);
    }
    out.push(`<circle cx="${n1(R.range(110, 400))}" cy="${n1(R.range(80, 150))}" r="${n1(R.range(26, 44))}" fill="${p.soft}" opacity=".85"/>`);
  } else if (shape === 'sun') {
    const cx = R.range(200, 312);
    const cy = R.range(250, 300);
    const r = R.range(140, 180);
    // (The stripes cut the sun's lower half, wider as they go down: a mask, so the sky shows through.)
    const n = coverCount(bpm, 4, 9, 16);
    let cuts = '';
    for (let i = 0; i < n; i++) cuts += `<rect x="0" y="${n1(cy + (i * r) / n)}" width="512" height="${n1(2 + i * 2.6)}" fill="#000"/>`;
    out.push(`<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.glow}"/><stop offset="1" stop-color="${p.accent}"/></linearGradient><mask id="m"><rect width="512" height="512" fill="#fff"/>${cuts}</mask></defs>`);
    out.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="url(#s)" mask="url(#m)"/>`);
  } else if (shape === 'shards') {
    const n = coverCount(bpm, 5, 8, 22);
    for (let i = 0; i < n; i++) {
      const x = R.range(-40, 552);
      const y = R.range(-40, 420);
      const s = R.range(120, 300);
      const a = R.range(0, Math.PI * 2);
      const pts = [0, 1, 2].map(k => `${n1(x + Math.cos(a + (k * 2 * Math.PI) / 3 + R.range(-0.4, 0.4)) * s)},${n1(y + Math.sin(a + (k * 2 * Math.PI) / 3) * s)}`).join(' ');
      out.push(`<polygon points="${pts}" fill="${i % 3 === 0 ? p.accent : i % 3 === 1 ? p.glow : p.bg1}" opacity="${n1(R.range(0.28, 0.72))}"/>`);
    }
  } else if (shape === 'dots') {
    const fx = R.range(120, 400);
    const fy = R.range(80, 300);
    const gap = 512 / coverCount(bpm, 8, 12, 12);
    for (let y = gap / 2; y < 512; y += gap)
      for (let x = gap / 2; x < 512; x += gap) {
        const d = Math.hypot(x - fx, y - fy) / 380;
        const r = Math.max(0, (1 - d) * gap * 0.46);
        if (r > 1) out.push(`<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="${d < 0.35 ? p.soft : p.accent}" opacity="${n1(0.35 + (1 - d) * 0.55)}"/>`);
      }
  } else if (shape === 'bars') {
    // bars: a level meter's columns, taller to the beat's peak.
    const n = coverCount(bpm, 8, 16, 10);
    const w = 512 / n;
    for (let i = 0; i < n; i++) {
      const hgt = R.range(90, 420);
      out.push(`<rect x="${n1(i * w + w * 0.14)}" y="${n1(512 - hgt)}" width="${n1(w * 0.72)}" height="${n1(hgt)}" rx="${n1(w * 0.2)}" fill="${i % 3 === 0 ? p.accent : i % 3 === 1 ? p.glow : p.soft}" opacity="${n1(R.range(0.45, 0.9))}"/>`);
    }
  } else if (shape === 'pixels') {
    // pixels: an 8-bit field, squares in a grid, some lit.
    const n = coverCount(bpm, 8, 14, 11);
    const c = 512 / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = R.next();
        if (v < 0.45) continue;
        out.push(`<rect x="${n1(x * c)}" y="${n1(y * c)}" width="${n1(c - 3)}" height="${n1(c - 3)}" fill="${v > 0.85 ? p.soft : v > 0.65 ? p.accent : p.glow}" opacity="${n1(0.35 + (v - 0.45))}"/>`);
      }
  } else if (shape === 'grid') {
    // grid: a retro floor in perspective under a horizon.
    const hz = R.range(210, 290);
    const vx = R.range(190, 320);
    out.push(`<rect y="${n1(hz)}" width="512" height="${n1(512 - hz)}" fill="${p.bg1}" opacity=".5"/>`);
    out.push(`<circle cx="${n1(vx)}" cy="${n1(hz)}" r="${n1(R.range(60, 110))}" fill="${p.glow}" opacity=".5"/>`);
    for (let i = -9; i <= 9; i++) out.push(`<path d="M${n1(vx)} ${n1(hz)} L${n1(vx + i * 95)} 512" stroke="${p.glow}" stroke-width="2" opacity=".6" fill="none"/>`);
    const rows = coverCount(bpm, 6, 10, 16);
    for (let j = 1; j <= rows; j++) out.push(`<path d="M0 ${n1(hz + (512 - hz) * (j / rows) ** 2)} H512" stroke="${p.accent}" stroke-width="${j > rows / 2 ? 3 : 2}" opacity=".7"/>`);
  } else if (shape === 'stripes') {
    // stripes: diagonal bands of changing width.
    const n = coverCount(bpm, 5, 10, 16);
    let x = -300;
    for (let i = 0; i < n * 2 && x < 820; i++) {
      const w = R.range(14, 60);
      if (i % 2 === 0) out.push(`<rect x="${n1(x)}" y="-300" width="${n1(w)}" height="1100" fill="${i % 4 === 0 ? p.accent : i % 4 === 2 ? p.glow : p.soft}" opacity="${n1(R.range(0.4, 0.85))}" transform="rotate(-32 256 256)"/>`);
      x += w + R.range(8, 40);
    }
  } else if (shape === 'mesh') {
    // mesh: soft blobs of colour that run into each other.
    const cols = [p.accent, p.glow, p.soft, p.bg0];
    let defs = '';
    let body = '';
    for (let i = 0; i < 4; i++) {
      defs += `<radialGradient id="mb${i}"><stop offset="0" stop-color="${cols[i]}" stop-opacity=".95"/><stop offset="1" stop-color="${cols[i]}" stop-opacity="0"/></radialGradient>`;
      body += `<circle cx="${n1(R.range(40, 470))}" cy="${n1(R.range(40, 470))}" r="${n1(R.range(150, 290))}" fill="url(#mb${i})"/>`;
    }
    out.push(`<defs>${defs}</defs>${body}`);
  } else if (shape === 'stars') {
    // stars: four-point sparkles, big and small, and dust.
    const n = coverCount(bpm, 6, 12, 14);
    for (let i = 0; i < n; i++) {
      const x = R.range(20, 492);
      const y = R.range(20, 492);
      const r = i < 2 ? R.range(60, 100) : R.range(8, 34);
      out.push(`<path d="M${n1(x)} ${n1(y - r)}Q${n1(x)} ${n1(y)} ${n1(x + r)} ${n1(y)}Q${n1(x)} ${n1(y)} ${n1(x)} ${n1(y + r)}Q${n1(x)} ${n1(y)} ${n1(x - r)} ${n1(y)}Q${n1(x)} ${n1(y)} ${n1(x)} ${n1(y - r)}Z" fill="${i % 3 === 0 ? p.soft : i % 3 === 1 ? p.accent : p.glow}" opacity="${n1(R.range(0.55, 1))}"/>`);
    }
    for (let i = 0; i < 16; i++) out.push(`<circle cx="${n1(R.range(0, 512))}" cy="${n1(R.range(0, 512))}" r="${n1(R.range(1.5, 4))}" fill="${p.soft}" opacity=".7"/>`);
  } else if (shape === 'mountains') {
    // mountains: ridges in layers, a low sun behind.
    out.push(`<circle cx="${n1(R.range(120, 400))}" cy="${n1(R.range(150, 230))}" r="${n1(R.range(46, 78))}" fill="${p.soft}" opacity=".85"/>`);
    const layers = 4;
    for (let l = 0; l < layers; l++) {
      const base = 250 + l * 62;
      let d = `M0 512 L0 ${n1(base)}`;
      for (let x = 0; x <= 512; x += 64) d += ` L${x + 32} ${n1(base - R.range(10, 120 - l * 14))} L${x + 64} ${n1(base + R.range(-10, 30))}`;
      d += ' L512 512Z';
      out.push(`<path d="${d}" fill="${[p.glow, p.accent, p.bg1, p.bg0][l]}" opacity="${n1(0.4 + l * 0.17)}"/>`);
    }
  } else if (shape === 'vinyl') {
    // vinyl: a record, grooves and a label, off to a side.
    const cx = R.range(200, 340);
    const cy = R.range(200, 330);
    const r = R.range(190, 235);
    out.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="#000" opacity=".5"/>`);
    for (let k = 1; k < 8; k++) out.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r * (0.4 + k * 0.075))}" fill="none" stroke="${p.glow}" stroke-width="1.5" opacity="${n1(0.18 + (k % 2) * 0.16)}"/>`);
    out.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r * 0.3)}" fill="${p.accent}"/><circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r * 0.05)}" fill="${p.bg1}"/>`);
    out.push(`<path d="M${n1(cx)} ${n1(cy - r)} A${n1(r)} ${n1(r)} 0 0 1 ${n1(cx + r * 0.8)} ${n1(cy - r * 0.6)}" stroke="${p.soft}" stroke-width="6" stroke-linecap="round" fill="none" opacity=".5"/>`);
  } else if (shape === 'halftone') {
    // halftone: dots that grow along a slope.
    const gap = 512 / coverCount(bpm, 10, 14, 10);
    const a = R.range(0, Math.PI * 2);
    for (let y = gap / 2; y < 512; y += gap)
      for (let x = gap / 2; x < 512; x += gap) {
        const t = ((x - 256) * Math.cos(a) + (y - 256) * Math.sin(a)) / 362 + 0.5;
        const r = Math.max(0, Math.min(1, t)) * gap * 0.62;
        if (r > 1.2) out.push(`<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="${t > 0.7 ? p.soft : p.accent}" opacity=".85"/>`);
      }
  } else if (shape === 'ribbons') {
    // ribbons: thick flowing bands.
    const n = coverCount(bpm, 3, 6, 24);
    for (let i = 0; i < n; i++) {
      const y = 80 + (i * 360) / n + R.range(-20, 20);
      out.push(`<path d="M-40 ${n1(y)} C${n1(R.range(80, 200))} ${n1(y - R.range(80, 190))} ${n1(R.range(260, 340))} ${n1(y + R.range(80, 190))} 552 ${n1(y + R.range(-90, 90))}" fill="none" stroke="${[p.accent, p.glow, p.soft][i % 3]}" stroke-width="${n1(R.range(22, 52))}" stroke-linecap="round" opacity="${n1(R.range(0.55, 0.9))}"/>`);
    }
  } else if (shape === 'orbits') {
    // orbits: tilted ellipses round a core, with bodies on them.
    const cx = R.range(200, 312);
    const cy = R.range(200, 312);
    const tilt = R.range(-40, 40);
    out.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(R.range(34, 56))}" fill="${p.accent}"/>`);
    const n = coverCount(bpm, 3, 5, 28);
    for (let i = 1; i <= n; i++) {
      const rx = 70 + i * R.range(46, 60);
      out.push(`<g transform="rotate(${n1(tilt + i * 11)} ${n1(cx)} ${n1(cy)})"><ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(rx)}" ry="${n1(rx * 0.42)}" fill="none" stroke="${p.glow}" stroke-width="2.5" opacity=".7"/><circle cx="${n1(cx + rx * Math.cos(R.range(0, 6.28)))}" cy="${n1(cy)}" r="${n1(R.range(7, 16))}" fill="${p.soft}"/></g>`);
    }
  } else if (shape === 'blocks') {
    // blocks: a skyline in layers, lit windows.
    for (let l = 0; l < 3; l++) {
      let x = -R.range(0, 30);
      while (x < 512) {
        const w = R.range(40, 96);
        const hgt = R.range(110, 330) - l * 40;
        out.push(`<rect x="${n1(x)}" y="${n1(512 - hgt)}" width="${n1(w - 4)}" height="${n1(hgt)}" rx="5" fill="${[p.bg1, p.accent, p.glow][l]}" opacity="${n1(0.4 + l * 0.2)}"/>`);
        if (l === 2) for (let wy = 512 - hgt + 18; wy < 500; wy += 26) for (let wx = x + 10; wx < x + w - 14; wx += 18) if (R.next() < 0.35) out.push(`<rect x="${n1(wx)}" y="${n1(wy)}" width="8" height="12" rx="2" fill="${p.soft}" opacity=".8"/>`);
        x += w;
      }
    }
  } else if (shape === 'spiral') {
    // spiral: one line wound out from a point, dots along it.
    const cx = R.range(200, 312);
    const cy = R.range(200, 312);
    const turns = coverCount(bpm, 3, 6, 26);
    const dir = R.next() < 0.5 ? 1 : -1;
    let d = `M${n1(cx)} ${n1(cy)}`;
    for (let a = 0; a <= turns * Math.PI * 2; a += 0.2) {
      const r = 6 + a * (230 / (turns * Math.PI * 2));
      d += ` L${n1(cx + Math.cos(a * dir) * r)} ${n1(cy + Math.sin(a * dir) * r)}`;
    }
    out.push(`<path d="${d}" fill="none" stroke="${p.glow}" stroke-width="${n1(R.range(6, 14))}" stroke-linecap="round" opacity=".8"/>`);
    out.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(R.range(16, 30))}" fill="${p.accent}"/>`);
  } else if (shape === 'zigzag') {
    // zigzag: chevron bands, one above the other.
    const n = coverCount(bpm, 5, 9, 16);
    const tooth = R.range(40, 80);
    const rise = R.range(30, 60);
    for (let i = 0; i < n; i++) {
      const y = (i * 560) / n - 20;
      let d = `M-20 ${n1(y)}`;
      for (let x = -20, up = true; x <= 552; x += tooth, up = !up) d += ` L${n1(x)} ${n1(up ? y : y + rise)}`;
      out.push(`<path d="${d}" fill="none" stroke="${[p.accent, p.glow, p.soft][i % 3]}" stroke-width="${n1(R.range(10, 22))}" stroke-linejoin="round" opacity="${n1(R.range(0.5, 0.9))}"/>`);
    }
  } else if (shape === 'checker') {
    // checker: a board in perspective-free squares, some lifted out in colour.
    const n = coverCount(bpm, 6, 10, 15);
    const c = 512 / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if ((x + y) % 2) continue;
        const lit = R.next() < 0.18;
        out.push(`<rect x="${n1(x * c)}" y="${n1(y * c)}" width="${n1(c)}" height="${n1(c)}" fill="${lit ? p.accent : p.bg1}" opacity="${lit ? '.9' : '.45'}"/>`);
      }
    out.push(`<circle cx="${n1(R.range(140, 372))}" cy="${n1(R.range(140, 372))}" r="${n1(R.range(70, 120))}" fill="${p.soft}" opacity=".8"/>`);
  } else if (shape === 'petals') {
    // petals: a flower of long leaves round a heart.
    const cx = R.range(210, 302);
    const cy = R.range(200, 300);
    const n = coverCount(bpm, 6, 12, 12);
    const len = R.range(150, 210);
    const wid = R.range(36, 60);
    const spin = R.range(0, 360);
    for (let i = 0; i < n; i++) out.push(`<ellipse cx="${n1(cx)}" cy="${n1(cy - len / 2)}" rx="${n1(wid)}" ry="${n1(len / 2)}" fill="${i % 2 ? p.accent : p.glow}" opacity=".62" transform="rotate(${n1(spin + (i * 360) / n)} ${n1(cx)} ${n1(cy)})"/>`);
    out.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(wid * 0.9)}" fill="${p.soft}"/>`);
  } else if (shape === 'prism') {
    // prism: a triangle, a white beam in, a fan of colour out.
    const cx = R.range(200, 300);
    const cy = R.range(220, 290);
    const s = R.range(110, 150);
    const n = coverCount(bpm, 4, 7, 20);
    out.push(`<path d="M0 ${n1(cy + R.range(-60, 20))} L${n1(cx)} ${n1(cy)}" stroke="${p.soft}" stroke-width="7" opacity=".9"/>`);
    for (let i = 0; i < n; i++) out.push(`<path d="M${n1(cx + s * 0.3)} ${n1(cy)} L560 ${n1(cy - 120 + (i * 260) / n)} L560 ${n1(cy - 120 + ((i + 1) * 260) / n)}Z" fill="hsl(${wrap(p.hue + i * (300 / n))} 85% 62%)" opacity=".72"/>`);
    out.push(`<polygon points="${n1(cx)},${n1(cy - s)} ${n1(cx + s * 0.9)},${n1(cy + s * 0.6)} ${n1(cx - s * 0.9)},${n1(cy + s * 0.6)}" fill="${p.bg1}" stroke="${p.soft}" stroke-width="4" opacity=".92"/>`);
  } else if (shape === 'sunrays') {
    // sunrays: rays from a sun low on the edge, as on an old poster.
    const cx = R.range(80, 432);
    const cy = R.pick([470, 520]);
    const n = coverCount(bpm, 10, 20, 7);
    for (let i = 0; i < n; i += 2) {
      const a0 = Math.PI + (i * Math.PI) / n;
      const a1 = Math.PI + ((i + 1) * Math.PI) / n;
      out.push(`<path d="M${n1(cx)} ${n1(cy)} L${n1(cx + Math.cos(a0) * 900)} ${n1(cy + Math.sin(a0) * 900)} L${n1(cx + Math.cos(a1) * 900)} ${n1(cy + Math.sin(a1) * 900)}Z" fill="${p.glow}" opacity=".32"/>`);
    }
    out.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(R.range(110, 160))}" fill="${p.accent}"/>`);
  } else {
    // arcs: a Bauhaus grid of quarter and half circles.
    const t = 128;
    const fills = [p.accent, p.glow, p.bg1, p.soft];
    for (let gy = 0; gy < 4; gy++)
      for (let gx = 0; gx < 4; gx++) {
        if (R.next() < 0.22) continue;
        const x = gx * t;
        const y = gy * t;
        const f = R.pick(fills);
        const o = n1(R.range(0.45, 0.9));
        const kind = R.int(0, 2);
        const rot = R.int(0, 3) * 90;
        const shape = kind === 0 ? `<path d="M0 0 A128 128 0 0 1 128 128 L0 128Z" fill="${f}" opacity="${o}"/>` : kind === 1 ? `<path d="M0 64 A64 64 0 0 1 128 64Z" fill="${f}" opacity="${o}"/>` : `<circle cx="64" cy="64" r="${n1(R.range(26, 52))}" fill="${f}" opacity="${o}"/>`;
        out.push(`<g transform="translate(${x} ${y}) rotate(${rot} 64 64)">${shape}</g>`);
      }
  }
  return out.join('');
}

// The shape placed by the seed: turned, scaled and moved a little, framed one of four ways,
// sometimes swapped for a kindred shape, often with a second shape, fainter, behind it.
const BEHIND = ['rings', 'dots', 'stripes', 'stars', 'orbits', 'halftone', 'waves', 'zigzag', 'checker'];
// Shapes that read alike, so a song may take its groove's kin and still look of its groove.
const KIN = {
  rings: ['spiral', 'orbits'], waves: ['ribbons', 'mountains'], sun: ['sunrays', 'grid'], shards: ['prism', 'stripes'], dots: ['halftone', 'stars'],
  arcs: ['petals', 'checker'], bars: ['blocks', 'pixels'], pixels: ['checker', 'bars'], grid: ['sun', 'zigzag'], stripes: ['zigzag', 'shards'],
  mesh: ['petals', 'waves'], stars: ['dots', 'orbits'], mountains: ['waves', 'sunrays'], vinyl: ['rings', 'spiral'], halftone: ['dots', 'checker'],
  ribbons: ['waves', 'spiral'], orbits: ['rings', 'stars'], blocks: ['bars', 'pixels'], spiral: ['rings', 'vinyl'], zigzag: ['stripes', 'grid'],
  checker: ['pixels', 'arcs'], petals: ['mesh', 'arcs'], prism: ['shards', 'sunrays'], sunrays: ['sun', 'prism']
};
export const FRAMES = ['plain', 'mirror', 'disc', 'tile'];
// The frame a groove's own cover takes: the second groove with a shape is mirrored, the third
// in a disc, so the grid of grooves never shows one picture twice.
const styleFrame = {};
{
  const seen = {};
  for (const [st, [, sh]] of Object.entries(STYLE_ART)) styleFrame[st] = FRAMES[(seen[sh] = (seen[sh] ?? -1) + 1) % FRAMES.length];
}
function framed(frame, body, p) {
  if (frame === 'mirror') return `<defs><clipPath id="cl"><rect width="256" height="512"/></clipPath></defs><g clip-path="url(#cl)">${body}</g><g transform="translate(512 0) scale(-1 1)" clip-path="url(#cl)">${body}</g>`;
  if (frame === 'disc') return `<defs><clipPath id="cd"><circle cx="256" cy="236" r="188"/></clipPath></defs><circle cx="256" cy="236" r="200" fill="#000" opacity=".22"/><g clip-path="url(#cd)"><rect width="512" height="512" fill="${p.bg1}" opacity=".55"/>${body}</g><circle cx="256" cy="236" r="188" fill="none" stroke="${p.soft}" stroke-width="3" opacity=".6"/>`;
  if (frame === 'tile') return [0, 1, 2, 3].map(k => `<g transform="translate(${(k % 2) * 256} ${(k >> 1) * 256}) scale(.5) rotate(${k * 90} 256 256)">${body}</g>`).join('');
  return body;
}
function composed(p, R, bpm, frame) {
  const turn = R.range(-14, 14);
  const k = R.range(1, 1.22);
  const dx = R.range(-34, 34);
  const dy = R.range(-34, 34);
  const shape = frame != null ? p.shape : R.next() < 0.3 ? R.pick(KIN[p.shape] || [p.shape]) : p.shape;
  let behind = '';
  if (R.next() < 0.6) {
    const kind = R.pick(BEHIND.filter(x => x !== shape));
    const L = coverRng(Math.floor(R.next() * 1e9));
    behind = `<g opacity=".32" transform="translate(256 256) rotate(${n1(R.range(-60, 60))}) scale(${n1(R.range(1, 1.4))}) translate(-256 -256)">${shapes(kind, p, L, bpm)}</g>`;
  }
  const f = frame === 'own' ? 'plain' : frame ?? R.pick(['plain', 'plain', 'mirror', 'disc', 'tile']);
  return behind + framed(f, `<g transform="translate(${n1(256 + dx)} ${n1(256 + dy)}) rotate(${n1(turn)}) scale(${n1(k)}) translate(-256 -256)">${shapes(shape, p, R, bpm)}</g>`, p);
}

// The cover, 512 square. text: false leaves the words off (a thumbnail); station: true sets
// the title large, as a station's art does. groove: true draws the groove's own cover (its shape,
// in its groove's frame), the one the list of grooves shows.
// -> an SVG string
export function coverSvg({ seed = 0, style = 'four', mood = 'all', key = null, bpm = 110, title = '', label = '', text = true, station = false, groove = false } = {}) {
  const p = coverPalette({ seed, style, mood, key, bpm });
  const R = coverRng(seed);
  const ang = R.int(0, 3) * 45 + 20;
  const gx = Math.cos((ang * Math.PI) / 180);
  const gy = Math.sin((ang * Math.PI) / 180);
  const glowAt = [R.range(0.1, 0.9), R.range(0.05, 0.5)];
  let words = '';
  if (text && title) {
    // (Sized to its length: CJK a full em a character, Latin about half.)
    const em = [...title].reduce((a, c) => a + (/[⺀-￿]/.test(c) ? 1 : c === ' ' ? 0.3 : 0.6), 0);
    const size = station ? Math.max(40, Math.min(92, 440 / Math.max(1, em))) : Math.max(22, Math.min(34, 300 / Math.max(1, em)));
    const font = `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang TC', 'Noto Sans TC', 'Segoe UI', sans-serif`;
    words =
      `<rect y="${station ? 230 : 300}" width="512" height="${station ? 282 : 212}" fill="url(#f)"/>` +
      (label ? `<text x="34" y="${n1(474 - size - 10)}" font-family="${font}" font-size="15" font-weight="600" letter-spacing="2.4" fill="#fff" fill-opacity=".78">${esc(label.toUpperCase())}</text>` : '') +
      `<text x="${station ? 36 : 32}" y="${station ? 468 : 474}" font-family="${font}" font-size="${n1(size)}" font-weight="800" letter-spacing="-.5" fill="#fff">${esc(title)}</text>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">` +
    `<defs><linearGradient id="b" x1="${n1(0.5 - gx / 2)}" y1="${n1(0.5 - gy / 2)}" x2="${n1(0.5 + gx / 2)}" y2="${n1(0.5 + gy / 2)}"><stop offset="0" stop-color="${p.bg0}"/><stop offset="1" stop-color="${p.bg1}"/></linearGradient>` +
    `<radialGradient id="g" cx="${n1(glowAt[0])}" cy="${n1(glowAt[1])}" r=".75"><stop offset="0" stop-color="${p.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></linearGradient></defs>` +
    `<rect width="512" height="512" fill="url(#b)"/><rect width="512" height="512" fill="url(#g)"/>` +
    composed(p, R, bpm, groove ? styleFrame[style] || 'plain' : station ? 'own' : null) +
    words +
    `</svg>`
  );
}

// As an <img> src.
export const coverUrl = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

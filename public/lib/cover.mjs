// 聽's covers: each song's own artwork, drawn from what the song is (its
// seed, groove, mood, key and tempo), the same every time for the same song.
// A groove has its colour and its shape (rings for the four-on-floor family,
// waves for the slow ones, a sun for the warm ones, shards for trap and
// drill, dots, Bauhaus arcs, a level meter's bars for the loud guitars, 8-bit
// pixels); the mood and the key move the colour (minor
// cooler and darker, chill softer), the tempo sets how many rings, waves or
// stripes. The title is set small in the corner, as on a record sleeve.
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
  four: [262, 'rings'], house: [285, 'rings'], jersey: [322, 'rings'], dnb: [192, 'rings'],
  techno: [208, 'dots'], hiphop: [28, 'dots'], garage: [172, 'arcs'], boombap: [36, 'arcs'], broken: [146, 'arcs'],
  lofi: [204, 'waves'], half: [232, 'waves'], reggae: [128, 'waves'],
  trap: [298, 'shards'], drill: [216, 'shards'], phonk: [346, 'shards'], baile: [92, 'shards'],
  funk: [44, 'sun'], afro: [20, 'sun'], amapiano: [50, 'sun'], dembow: [356, 'sun'],
  jazz: [222, 'arcs'], bossa: [160, 'waves'], samba: [58, 'sun'], salsa: [8, 'sun'], cumbia: [80, 'dots'], kizomba: [330, 'waves'], highlife: [40, 'arcs'], bhangra: [30, 'dots'],
  rock: [0, 'bars'], punk: [312, 'bars'], metal: [240, 'shards'], blues: [214, 'bars'], country: [34, 'arcs'], gospel: [48, 'rings'], neosoul: [276, 'waves'],
  citypop: [300, 'sun'], kpop: [326, 'dots'], synthwave: [290, 'sun'], disco: [270, 'rings'], ballad: [200, 'waves'], chinese: [354, 'arcs'],
  ambient: [186, 'waves'], cinematic: [226, 'bars'], chiptune: [120, 'pixels'], dubstep: [262, 'shards'], footwork: [64, 'pixels'], jungle: [100, 'shards'],
  trance: [196, 'rings'], hardstyle: [350, 'shards']
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

// The cover, 512 square. text: false leaves the words off (a thumbnail).
// -> an SVG string
export function coverSvg({ seed = 0, style = 'four', mood = 'all', key = null, bpm = 110, title = '', label = '', text = true } = {}) {
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
    const size = Math.max(22, Math.min(34, 300 / Math.max(1, em)));
    const font = `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang TC', 'Noto Sans TC', 'Segoe UI', sans-serif`;
    words =
      `<rect y="300" width="512" height="212" fill="url(#f)"/>` +
      (label ? `<text x="34" y="${n1(474 - size - 10)}" font-family="${font}" font-size="15" font-weight="600" letter-spacing="2.4" fill="#fff" fill-opacity=".78">${esc(label.toUpperCase())}</text>` : '') +
      `<text x="32" y="474" font-family="${font}" font-size="${n1(size)}" font-weight="800" letter-spacing="-.5" fill="#fff">${esc(title)}</text>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">` +
    `<defs><linearGradient id="b" x1="${n1(0.5 - gx / 2)}" y1="${n1(0.5 - gy / 2)}" x2="${n1(0.5 + gx / 2)}" y2="${n1(0.5 + gy / 2)}"><stop offset="0" stop-color="${p.bg0}"/><stop offset="1" stop-color="${p.bg1}"/></linearGradient>` +
    `<radialGradient id="g" cx="${n1(glowAt[0])}" cy="${n1(glowAt[1])}" r=".75"><stop offset="0" stop-color="${p.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></linearGradient></defs>` +
    `<rect width="512" height="512" fill="url(#b)"/><rect width="512" height="512" fill="url(#g)"/>` +
    shapes(p.shape, p, R, bpm) +
    words +
    `</svg>`
  );
}

// As an <img> src.
export const coverUrl = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

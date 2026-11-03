// 聽's small rules, no DOM: the sleep timer (睡眠定時) and the recently
// played list (最近播放). The screen is lib/radioview.mjs.

// ---- Sleep timer ----
// The choices: minutes, or 'song' (when this song ends).
export const SLEEP_CHOICES = [15, 30, 60, 'song'];
export const SLEEP_FADE = 10000; // ms the music fades out over before it stops

// A timer set now. -> { until (ms, a clock time) } | { song: true }
export const sleepSet = (choice, now = Date.now()) => (choice === 'song' ? { song: true } : { until: now + choice * 60000 });

// How long until it stops, in ms. songLeft: seconds left in the song playing.
export function sleepLeft(timer, now = Date.now(), songLeft = Infinity) {
  if (!timer) return Infinity;
  return Math.max(0, timer.song ? songLeft * 1000 : timer.until - now);
}

// The music's level, 1 down to 0 over the last `fade` ms (an even-sounding fade: squared).
export function sleepGain(left, fade = SLEEP_FADE) {
  if (!(left < fade)) return 1;
  const x = Math.max(0, left) / fade;
  return x * x;
}

// It's time: under a quarter second left (the player's time moves in steps about that long).
export const sleepDone = left => left <= 250;

// What the button shows: 29:59, 1:00:00.
export function sleepClock(left) {
  const s = Math.ceil(Math.max(0, left) / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

// ---- Recently played ----
export const RECENT_KEY = 'orbit-beats-recent.v1';
export const RECENT_MAX = 20;

// A played song as kept: what it takes to draw it again and keep it. -> entry
export const recentEntry = item => ({ seed: item.spec.seed, mood: item.spec.mood, style: item.info.style, bpm: item.info.bpm, key: item.info.key ? { tonic: item.info.key.tonic, minor: Boolean(item.info.key.minor) } : null, seconds: item.seconds, at: Date.now() });

// The list with a song put first (once: the same song again moves up), the newest RECENT_MAX.
export function recentAdd(list, entry, max = RECENT_MAX) {
  const same = e => e.seed === entry.seed && e.mood === entry.mood && e.style === entry.style;
  return [entry, ...list.filter(e => !same(e))].slice(0, max);
}

// A kept list read back: only well-formed entries, never more than max. A bad read is [].
export function recentParse(text, max = RECENT_MAX) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v.filter(e => e && Number.isFinite(e.seed) && typeof e.style === 'string' && typeof e.mood === 'string' && Number.isFinite(e.bpm)).slice(0, max) : [];
  } catch {
    return [];
  }
}


// ---- What you listen through (為你推薦, 為你電台 and 做歌's lean, with ♡) ----
// A radio song heard to its end says something for its groove, one skipped
// in its first half minute something against it, learnt by the family's one
// engine (the kit's feedback.mjs: a weight per groove, fading with a month's
// half-life, kept on the Pass so another phone starts where this one is). A
// ♡ says more (kept.taste, 1 each), and skips never take a kept groove below
// half of what its ♡s gave it.
export const SKIP_WITHIN = 30; // s
// What the radio tells (api.heard(style, d)): heard to its end, or skipped early.
export const LISTEN_DONE = 1;
export const LISTEN_SKIP = -1;
// A groove as the engine knows it.
export const grooveItem = style => ({ id: `style:${style}` });
// ♡s and listening as one taste: { style: weight } (weights under 0.3 left
// out). `weight(style)`: what's learnt of it (log-odds; 0 nothing known).
export function tasteFrom(taste = {}, weight = () => 0, styles = []) {
  const out = {};
  for (const s of new Set([...styles, ...Object.keys(taste || {})])) {
    if (!/^[a-z]+$/.test(s)) continue;
    const t = Math.max(0, Number(taste?.[s]) || 0);
    const v = Math.max(t * 0.5, t + (Number(weight(s)) || 0));
    if (v >= 0.3) out[s] = Math.round(v * 100) / 100;
  }
  return out;
}
// The old listening counts on this phone ({ style: { v, t } }, before the
// engine), once into the engine: heard through as acts, skips as turns-down.
export const LISTENED_OLD = 'orbit-beats-listened';
export function oldListening(map, now = Date.now()) {
  const out = [];
  for (const [s, x] of Object.entries(map || {})) {
    const v = (Number(x?.v) || 0) * 0.5 ** ((now - (Number(x?.t) || now)) / (30 * 86_400_000));
    if (/^[a-z]+$/.test(s) && Math.abs(v) >= 0.05) out.push([s, v]);
  }
  return out;
}

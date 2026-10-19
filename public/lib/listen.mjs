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

// An entry as the radio's ♡ takes it (app.js keepRadio): its spec and info.
export const recentItem = e => ({ id: `radio:${e.seed}:${e.mood}:${e.style}`, spec: { seed: e.seed, mood: e.mood }, info: { style: e.style, bpm: e.bpm, key: e.key } });

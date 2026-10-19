// A song's length as people say it: minutes and seconds (0:30 to 8:00), never bars.
// Bars are worked out from the tempo when the song is made.
export const LENGTH_MIN = 30;
export const LENGTH_MAX = 480;
export const LENGTH_STEP = 10;
export const LENGTH_PRESETS = [30, 60, 120, 180, 240, 360];
export const clampLength = v => (Number.isFinite(+v) ? Math.max(LENGTH_MIN, Math.min(LENGTH_MAX, Math.round(+v / LENGTH_STEP) * LENGTH_STEP)) : 60);
// 90 -> "1:30"
export const clock = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.round(Math.max(0, s)) % 60).padStart(2, '0')}`;
// Whole bars for a length at a tempo (an even number, 8 or more).
export const barsFor = (seconds, bpm) => Math.max(8, Math.round((seconds * bpm) / 240 / 2) * 2);
// How a kit's batch asks the engine for it: up to 64 bars, a range of a bar or two (the
// engine draws a form that fits); longer, no range: a plan of sections (lib/radio.mjs radioPlan).
export function kitLength(seconds, bpm) {
  const bars = barsFor(seconds, bpm);
  return bars <= 64 ? { minBars: Math.max(8, bars - 2), maxBars: bars, plan: null } : { minBars: 25, maxBars: 29, plan: true };
}
// Tempo in everyday words: 慢 / 中 / 快 (Slow / Medium / Fast).
export const speedKey = bpm => (bpm < 95 ? 'slow' : bpm < 125 ? 'mid' : 'fast');

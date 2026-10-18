// Tap tempo (點拍子): the tempo from taps on a button. A pause of two
// seconds starts over; the last eight taps count, their gaps' median (so
// one late tap doesn't pull it), to a tenth of a BPM, within 40–250.
export const TAP_RESET = 2000;
export function tapper(now = () => Date.now()) {
  let taps = [];
  return {
    tap() {
      const t = now();
      if (taps.length && t - taps.at(-1) > TAP_RESET) taps = [];
      taps.push(t);
      taps = taps.slice(-8);
      return tempoOf(taps);
    },
    reset() { taps = []; }
  };
}
// Times in ms -> BPM, or null with fewer than two taps.
export function tempoOf(times) {
  if (times.length < 2) return null;
  const gaps = times.slice(1).map((t, k) => t - times[k]).filter(g => g > 0).sort((a, b) => a - b);
  if (!gaps.length) return null;
  const mid = gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
  return Math.min(250, Math.max(40, Math.round(600000 / mid) / 10));
}

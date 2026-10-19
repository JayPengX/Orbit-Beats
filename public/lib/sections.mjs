// A song's sections on its clock: the pure parts of the section strip.
// plan is [[type, bars], …] (as info.plan); a bar is 4 beats at bpm.
export const barSeconds = (bpm, bar = 1) => (bar * 4 * 60) / bpm;

// [{ type, bars, bar, from, to }] with from/to in seconds.
export function sectionTimes(plan, bpm) {
  let bar = 0;
  return plan.map(([type, bars]) => {
    const s = { type, bars, bar, from: barSeconds(bpm, bar), to: barSeconds(bpm, bar + bars) };
    bar += bars;
    return s;
  });
}

// The index of the section playing at second t (the last one past the end; -1 for no sections).
export function sectionIndex(times, t) {
  const i = times.findIndex(s => t < s.to);
  return i < 0 ? times.length - 1 : i;
}

// Whether a section's label fits its slice of a strip `px` wide: `em` is the label's
// width in font sizes (2 for 前奏), size the font in px.
export const labelFits = (bars, total, px, em, size = 11) => total > 0 && (bars / total) * px >= em * size + 12;

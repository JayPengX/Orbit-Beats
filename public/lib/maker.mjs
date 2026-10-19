// The page's way to lib/make.mjs: through its worker (lib/maker.worker.mjs)
// when the browser runs module workers, else on the page. Every call is a
// promise either way, answered in order.
// `limit`: no answer in this long (ms), and the worker is taken as gone.
// `prep(fn, args, sent)`: what the worker needs first (the recorded
// instruments a song plays, lib/sampleload.mjs), handed over before the call;
// calls go out in the order asked either way.
export function maker(url, { limit = 90000, prep = null } = {}) {
  let worker = null;
  let local = null;
  try {
    worker = new Worker(url, { type: 'module' });
  } catch {
    worker = null;
  }
  let n = 0;
  const waiting = new Map();
  const fallback = async () => (local ||= await import('./make.mjs'));
  if (worker) {
    worker.onmessage = e => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      clearTimeout(w.timer);
      waiting.delete(e.data.id);
      if (e.data.ok) w.resolve(e.data.value);
      else w.reject(new Error(e.data.error));
    };
    // (A worker that can't start, a module it can't load, or one that stops
    // answering (killed for memory, say): the page does it from then on, and
    // what was asked is asked again, never left waiting.)
    worker.onerror = e => {
      e.preventDefault?.();
      giveUp();
    };
  }
  function giveUp() {
    if (!worker) return;
    const pending = [...waiting.values()];
    waiting.clear();
    worker.terminate();
    worker = null;
    for (const w of pending) (clearTimeout(w.timer), w.retry());
  }
  const call = (fn, ...args) =>
    new Promise((resolve, reject) => {
      // (A call that throws on the page rejects: never left waiting.)
      const onPage = () => fallback().then(m => m[fn](...args)).then(resolve, reject);
      if (!worker) return onPage();
      const id = ++n;
      waiting.set(id, { resolve, reject, timer: setTimeout(giveUp, limit), retry: () => (fn === 'setKit' ? onPage() : last ? fallback().then(m => (m.setKit(last), m[fn](...args))).then(resolve, reject) : onPage()) });
      worker.postMessage({ id, fn, args });
    });
  let last = null;
  const sent = new Set();
  let line = Promise.resolve();
  const ask = (fn, ...args) => {
    if (!prep) return call(fn, ...args);
    const posted = line
      .then(() => prep(fn, args, sent))
      .catch(() => null)
      .then(b => {
        if (b) call('setSamples', b).catch(() => {});
        return { p: call(fn, ...args) };
      });
    line = posted.then(() => {}, () => {});
    return posted.then(o => o.p);
  };
  return {
    setKit: k => ((last = k), ask('setKit', k)),
    song: (recipe, bits) => ask('song', recipe, bits),
    stems: (recipe, bits, opts) => ask('stems', recipe, bits, opts),
    midi: (recipe, opts) => ask('midi', recipe, opts),
    radio: (spec, after) => ask('radio', spec, after),
    radioWav: spec => ask('radioWav', spec),
    game: spec => ask('game', spec),
    clip: (recipe, k, part) => ask('clip', recipe, k, part),
    jamBand: set => ask('jamBand', set)
  };
}

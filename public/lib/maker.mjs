// The page's way to lib/make.mjs: through its worker (lib/maker.worker.mjs)
// when the browser runs module workers, else on the page. Every call is a
// promise either way, answered in order.
export function maker(url) {
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
      waiting.delete(e.data.id);
      if (e.data.ok) w.resolve(e.data.value);
      else w.reject(new Error(e.data.error));
    };
    // (A worker that can't start, a module it can't load: the page does it from then on.)
    worker.onerror = e => {
      e.preventDefault?.();
      const pending = [...waiting.values()];
      waiting.clear();
      worker.terminate();
      worker = null;
      for (const w of pending) w.retry();
    };
  }
  const call = (fn, ...args) =>
    new Promise((resolve, reject) => {
      const onPage = () => fallback().then(m => resolve(m[fn](...args)), reject);
      if (!worker) return onPage();
      const id = ++n;
      waiting.set(id, { resolve, reject, retry: () => (fn === 'setKit' ? onPage() : last ? fallback().then(m => (m.setKit(last), resolve(m[fn](...args))), reject) : onPage()) });
      worker.postMessage({ id, fn, args });
    });
  let last = null;
  return {
    setKit: k => ((last = k), call('setKit', k)),
    song: (recipe, bits) => call('song', recipe, bits),
    stems: (recipe, bits, opts) => call('stems', recipe, bits, opts),
    midi: (recipe, opts) => call('midi', recipe, opts)
  };
}

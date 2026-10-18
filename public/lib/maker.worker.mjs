// The song maker's worker: lib/make.mjs off the page's thread. Asked
// { id, fn, args }, it answers { id, ok, value } or { id, ok: false, error },
// handing its bytes over rather than copying them.
import * as make from './make.mjs';

self.onmessage = e => {
  const { id, fn, args } = e.data;
  try {
    const value = make[fn](...args);
    const moved = [value?.wav?.buffer, value instanceof Uint8Array ? value.buffer : null].filter(Boolean);
    self.postMessage({ id, ok: true, value }, moved);
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message || error) });
  }
};

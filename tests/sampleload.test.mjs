// lib/sampleload.mjs: an instrument's recordings fetched a few at a time,
// in the order asked, an opening's (a song someone is waiting on) first:
// all at once, a song's hundred notes took the phone's whole link on a slow
// connection, the app's own files and a tapped song's opening waiting
// behind the songs made ahead.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test("an instrument's notes fetched six at a time, in the order asked, an opening's first", async () => {
  const started = [];
  const held = new Map();
  let inFlight = 0;
  let most = 0;
  globalThis.fetch = url =>
    new Promise(ok => {
      most = Math.max(most, ++inFlight);
      started.push(String(url).split('/').slice(-2)[0]);
      held.set(`${url}#${started.length}`, () => (inFlight--, ok(new Response(new Uint8Array(8)))));
    });
  globalThis.OfflineAudioContext = class {
    decodeAudioData(buf, ok) {
      ok({ length: 4, sampleRate: 32000, numberOfChannels: 1, getChannelData: () => new Float32Array(4) });
    }
  };
  const { loadBank } = await import('../public/lib/sampleload.mjs');
  const settle = () => new Promise(done => setTimeout(done, 5));
  const banks = [loadBank('piano'), loadBank('sax', true), loadBank('rhodes')];
  // (An opening wants rhodes too: its notes still waiting go ahead of piano's, after sax's.)
  loadBank('rhodes', true);
  await settle();
  assert.deepEqual(started, Array(6).fill('piano'));
  while (held.size) {
    for (const [k, go] of [...held]) (held.delete(k), go());
    await settle();
  }
  assert.ok(most <= 6, `${most} at once`);
  assert.deepEqual(started, [...Array(6).fill('piano'), ...Array(10).fill('sax'), ...Array(16).fill('rhodes'), ...Array(13).fill('piano')]);
  const [piano, sax, rhodes] = await Promise.all(banks);
  assert.equal(piano.notes.length, 19);
  assert.equal(sax.notes.length, 10);
  assert.equal(rhodes.notes.length, 16);
});

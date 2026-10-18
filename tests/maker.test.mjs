// lib/maker.mjs (the page's way to the song maker) and its worker, in Node:
// no Worker here, so it falls back to making songs on the page; and a stand-in
// Worker to check the worker's path, its errors, and a worker that dies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maker } from '../public/lib/maker.mjs';
import { MIX } from '../public/lib/mix.mjs';
import { readMidi } from '../public/lib/midi.mjs';
import { demoRecording, splitPieces, analyzeRecording, parseWav } from '../public/engine.mjs';

const rec = demoRecording();
const pieces = splitPieces(rec);
const heard = analyzeRecording(pieces, rec.sr);
const kit = { pieces, sr: rec.sr, heard, bpm: heard.bpm, roles: heard.roles };
const recipe = { seed: 2, minBars: 8, maxBars: 8, humanize: 100, mix: MIX };

test('no Worker: every call answered on the page, a promise all the same, errors as rejections', async () => {
  assert.equal(typeof globalThis.Worker, 'undefined');
  const m = maker('lib/maker.worker.mjs');
  await assert.rejects(m.song(recipe), /No kit/);
  assert.equal(await m.setKit(kit), true);
  const [a, b] = await Promise.all([m.song(recipe), m.song({ ...recipe, seed: 3 }, 32)]);
  assert.equal(a.info.seed, 2);
  assert.equal(b.info.seed, 3);
  assert.equal(parseWav(a.wav).sr, rec.sr);
  assert.ok((await m.stems(recipe, 16, { title: 'T' })) instanceof Uint8Array);
  assert.equal(readMidi(await m.midi(recipe)).bpm, 125);
});

// The worker's own module, run by hand: it answers by id, moves the bytes, says what went wrong.
async function loadWorker() {
  const posted = [];
  globalThis.self = { postMessage: (msg, moved) => posted.push({ msg, moved }) };
  await import('../public/lib/maker.worker.mjs');
  return posted;
}

test('the worker: answers each call by its id, hands the bytes over, errors as messages', async () => {
  const posted = await loadWorker();
  const ask = (id, fn, ...args) => self.onmessage({ data: { id, fn, args } });
  ask(1, 'setKit', kit);
  ask(2, 'song', recipe);
  ask(3, 'midi', recipe);
  ask(4, 'nothing');
  ask(5, 'song', { jam: [{ i: 9, beat: 0 }], mix: MIX });
  assert.deepEqual(posted.map(p => [p.msg.id, p.msg.ok]), [[1, true], [2, true], [3, true], [4, false], [5, true]]);
  assert.equal(posted[0].msg.value, true);
  assert.equal(posted[1].moved[0], posted[1].msg.value.wav.buffer, 'the WAV moved, not copied');
  assert.equal(posted[2].moved[0], posted[2].msg.value.buffer);
  assert.deepEqual(posted[0].moved, []);
  assert.match(posted[3].msg.error, /not a function/);
});

test('through a worker: answers matched to their calls whatever the order; a worker that dies hands its calls to the page', async () => {
  const workers = [];
  class FakeWorker {
    constructor(url, opts) {
      this.url = url; this.opts = opts; this.sent = []; this.dead = false;
      workers.push(this);
    }
    postMessage(m) { this.sent.push(m); }
    terminate() { this.dead = true; }
    // Answer every call so far, last first.
    answerAll(fail = null) {
      for (const m of [...this.sent].reverse()) this.onmessage({ data: fail && m.fn === fail ? { id: m.id, ok: false, error: 'boom' } : { id: m.id, ok: true, value: `${m.fn}:${m.id}` } });
      this.sent = [];
    }
  }
  globalThis.Worker = FakeWorker;
  try {
    const m = maker('lib/maker.worker.mjs');
    assert.deepEqual(workers[0].opts, { type: 'module' });
    const calls = [m.setKit(kit), m.song(recipe), m.midi(recipe), m.stems(recipe, 16, {})];
    assert.deepEqual(workers[0].sent.map(s => s.fn), ['setKit', 'song', 'midi', 'stems']);
    workers[0].answerAll('midi');
    const got = await Promise.allSettled(calls);
    assert.deepEqual(got.map(g => g.value ?? g.reason.message), ['setKit:1', 'song:2', 'boom', 'stems:4']);
    workers[0].onmessage({ data: { id: 999, ok: true, value: 1 } });   // (an answer to nothing is ignored)

    // The worker dies with calls waiting: the kit set again on the page, and each answered there.
    const waiting = [m.song(recipe), m.midi(recipe)];
    const failing = m.song({ ...recipe, styles: [] });   // (one that throws on the page: rejected, not left waiting)
    let prevented = false;
    workers[0].onerror({ preventDefault: () => (prevented = true) });
    assert.ok(prevented && workers[0].dead);
    const [song, mid] = await Promise.all(waiting);
    assert.equal(song.info.seed, 2);
    assert.equal(readMidi(mid).bpm, 125);
    await assert.rejects(failing, /drum style/);
    await assert.rejects(m.midi({ ...recipe, styles: [] }), /drum style/);
    // And from then on, on the page.
    const sent = workers[0].sent.length;
    assert.equal((await m.song({ ...recipe, seed: 6 })).info.seed, 6);
    assert.equal(workers[0].sent.length, sent);

    // A worker dying before any kit: calls go to the page as they are.
    const m2 = maker('x');
    const p = m2.song(recipe);
    workers[1].onerror({});
    // (The page already has the kit from above: one module for both.)
    assert.equal((await p).info.seed, 2);
  } finally {
    delete globalThis.Worker;
  }
});

test('a Worker that throws on construction: the page from the start', async () => {
  globalThis.Worker = class { constructor() { throw new Error('module workers unsupported'); } };
  try {
    const m = maker('x');
    assert.equal(await m.setKit(kit), true);
    assert.equal((await m.song(recipe)).info.seed, 2);
  } finally {
    delete globalThis.Worker;
  }
});

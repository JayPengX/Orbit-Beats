// Orbit Beats out of sight (Jay 2026-11-10: the music stopped in the background while he used the other
// Orbit apps and swiped them off). iOS closes the heaviest background pages when the app in front wants
// memory, and WebKit lets a web app's audio session go between sounds unless the page names it. So:
// the workers let go of their recorded instruments when the page is out of sight (handed back at the
// next call), and the app's sound is music ('playback') from its first sound, never as it opens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maker } from '../public/lib/maker.mjs';
import * as make from '../public/lib/make.mjs';
import { bankOf, bankGen, useBanks } from '../public/lib/samples.mjs';

const bank = inst => ({ inst, sr: 32000, notes: [{ midi: 60, x: new Int16Array(3200) }] });

test('a worker lets go of its instruments (and the notes made from them), and is handed them again', () => {
  useBanks({ piano: bank('piano'), bass: bank('bass') });
  assert.ok(bankOf('piano') && bankOf('bass'));
  const gen = bankGen();
  assert.equal(make.letGo(), 2);
  assert.equal(bankOf('piano'), null);
  assert.ok(bankGen() > gen, 'the notes rendered before are not used again');
  assert.equal(make.letGo(), 0, 'nothing to let go: nothing changes');
  useBanks({ piano: bank('piano') });
  assert.ok(bankOf('piano'));
  make.letGo();
});

test('letGo goes in line with the calls: one already handed its instruments is made with them, the next is handed them again', async () => {
  const workers = [];
  class FakeWorker {
    constructor() {
      this.sent = [];
      workers.push(this);
    }
    postMessage(m) {
      this.sent.push(m);
      // (Answered at once, as the worker does, in order.)
      queueMicrotask(() => this.onmessage({ data: { id: m.id, ok: true, value: m.fn } }));
    }
    terminate() {}
  }
  globalThis.Worker = FakeWorker;
  try {
    const prep = async (fn, args, sent) => (fn === 'radio' && !sent.has('piano') ? (sent.add('piano'), { piano: bank('piano') }) : null);
    const m = maker('lib/maker.worker.mjs', { prep });
    const first = m.radio({ seed: 1 }, null);
    assert.equal(m.letGo(), true);
    const second = m.radio({ seed: 2 }, 'radio:1');
    await Promise.all([first, second]);
    await new Promise(r => setTimeout(r, 20));
    assert.deepEqual(workers[0].sent.map(s => s.fn), ['setSamples', 'radio', 'letGo', 'setSamples', 'radio']);
    // (The page's maker, with no worker: never lets go, its instruments are the page's own.)
    delete globalThis.Worker;
    assert.equal(maker('x', { prep }).letGo(), false);
  } finally {
    delete globalThis.Worker;
  }
});

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const radio = readFileSync(new URL('../public/lib/radioview.mjs', import.meta.url), 'utf8');

test('the sound is music from the first sound (every sound starts through quiet()), not as the app opens; the microphone records on auto', () => {
  const quiet = app.slice(app.indexOf('function quiet('), app.indexOf('stopPiece();', app.indexOf('function quiet(')));
  assert.match(quiet, /if \(!recorder\) soundAs\('playback'\)/);
  // (Only inside functions: no line at the module's top level sets it.)
  for (const line of app.split('\n')) assert.ok(!/^(navigator\.audioSession|soundAs\()/.test(line), line);
  const rec = app.slice(app.indexOf("$('record').onclick"), app.indexOf('recorder.start()'));
  assert.ok(rec.indexOf("soundAs('auto')") > -1 && rec.indexOf("soundAs('auto')") < rec.indexOf('getUserMedia'), 'auto before the microphone');
});

test('out of sight: 聽 keeps one song ahead (two on screen), its workers let go of their instruments; songs and pads go on when iOS lets go', () => {
  assert.match(radio, /want && !away\(\) \? 2 : 1/);
  assert.match(radio, /if \(away\(\)\) api\.make\.letGo\?\.\(\)/);
  assert.match(radio, /if \(!q\.busy\) api\.make\.letGo\?\.\(\)/);
  assert.match(app, /if \(!make\.busy\(\)\) make\.letGo\(\)/);
  assert.match(app, /jamMake && !jam\?\.playing\(\) && !jamMake\.busy\(\)\) jamMake\.letGo\(\)/);
  for (const src of [app, radio]) assert.match(src, /sound\?\.addEventListener\?\.\('statechange'/);
});

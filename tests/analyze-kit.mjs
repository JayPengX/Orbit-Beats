// One made-up pack (tests/kits.mjs), made and analysed in a worker thread so
// tests/analyze.test.mjs can do several at once: what it was made as, the
// tempo and roles heard, and the roles heard at the right tempo.
import { parentPort, workerData } from 'node:worker_threads';
import { splitPieces, analyzeRecording, guessRole } from '../public/engine.mjs';
import { makeKit } from './kits.mjs';

export function kitResult(seed) {
  const kit = makeKit(seed), a = analyzeRecording(splitPieces(kit.rec), kit.rec.sr);
  return { bpm: kit.bpm, roles: kit.roles, heard: { bpm: a.bpm, roles: a.roles }, atTempo: a.analyses.map(x => guessRole(x, kit.bpm)) };
}

if (parentPort) for (const seed of workerData) parentPort.postMessage(kitResult(seed));

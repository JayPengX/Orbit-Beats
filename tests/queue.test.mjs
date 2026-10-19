import test from 'node:test';
import assert from 'node:assert/strict';
import { newQueue, playNow, playNext, playLater, next, back, remove, move, clear, cycleLoop, setLoop, listStation, stationNext, radioNow, setStation, toText, fromText, slim, BACK_WITHIN } from '../public/lib/queue.mjs';

const s = (id, extra = {}) => ({ id, kind: 'song', title: `T${id}`, ...extra });
const r = (n, style = 'lofi') => ({ id: `radio:${n}:all:${style}`, kind: 'radio', title: `R${n}`, seed: n, mood: 'all', style, bpm: 90, key: { tonic: 1, minor: true } });
const ids = l => l.map(x => x.id);

test('playNow moves the one playing to history and keeps the queue', () => {
  let q = playNow(newQueue(), s('a'));
  q = playLater(q, s('x'));
  q = playNow(q, s('b'));
  assert.equal(q.now.id, 'b');
  assert.deepEqual(ids(q.history), ['a']);
  assert.deepEqual(ids(q.upNext), ['x']);
  q = playNow(q, s('b'));
  assert.deepEqual(ids(q.history), ['a'], 'the same song again is not history');
  assert.equal(playNow(q, null), q);
});

test('playNext goes first, playLater last', () => {
  let q = playNow(newQueue(), s('a'));
  q = playLater(q, s('l1'));
  q = playLater(q, s('l2'));
  q = playNext(q, s('n1'));
  q = playNext(q, s('n2'));
  assert.deepEqual(ids(q.upNext), ['n2', 'n1', 'l1', 'l2']);
});

test('next takes the queue in order, then the list, then ends', () => {
  const list = [s('1'), s('2'), s('3')];
  let q = playNow(newQueue(), list[0], listStation(list, '1'));
  q = playNext(q, s('x'));
  let n = next(q);
  assert.equal(n.item.id, 'x');
  n = next(n.q);
  assert.equal(n.item.id, '2');
  n = next(n.q);
  assert.equal(n.item.id, '3');
  assert.deepEqual(ids(n.q.history), ['1', 'x', '2']);
  n = next(n.q);
  assert.equal(n.item, null);
  assert.equal(n.q.now.id, '3');
});

test('next with the radio as the station hands back to the radio', () => {
  let q = playNow(newQueue(), r(1), { kind: 'radio', id: 'all' });
  assert.equal(next(q).handoff, 'radio');
  assert.equal(next(q).item, null);
  q = playLater(q, s('x'));
  const n = next(q);
  assert.equal(n.item.id, 'x');
  assert.equal(n.handoff, undefined);
  assert.equal(next(n.q).handoff, 'radio');
});

test('loop one repeats on its own end, forward still goes on', () => {
  let q = playNow(newQueue(), s('a'));
  q = playLater(q, s('b'));
  q = setLoop(q, 'one');
  const auto = next(q, { auto: true });
  assert.equal(auto.item.id, 'a');
  assert.equal(auto.restart, true);
  const tap = next(q);
  assert.equal(tap.item.id, 'b');
});

test('loop all wraps a list, and a queue played through', () => {
  const list = [s('1'), s('2')];
  let q = setLoop(playNow(newQueue(), list[1], listStation(list, '2')), 'all');
  assert.equal(next(q).item.id, '1');
  assert.deepEqual(ids(stationNext(q, 3)), ['1']);
  let p = setLoop(playNow(playNow(newQueue(), s('a')), s('b')), 'all');
  const n = next(p);
  assert.equal(n.item.id, 'a');
  assert.deepEqual(ids(n.q.upNext), ['b']);
  assert.equal(next(setLoop(playNow(newQueue(), s('z')), 'all')).restart, true);
  assert.equal(next(playNow(newQueue(), s('z'))).item, null);
});

test('back within three seconds goes to the song before; later restarts', () => {
  let q = playNow(playNow(newQueue(), s('a')), s('b'));
  assert.equal(back(q, BACK_WITHIN + 0.1).restart, true);
  assert.equal(back(q, BACK_WITHIN + 0.1).item.id, 'b');
  const b = back(q, 1);
  assert.equal(b.item.id, 'a');
  assert.equal(b.restart, undefined);
  assert.equal(b.q.now.id, 'a');
  assert.deepEqual(b.q.history, []);
  const f = next(b.q);
  assert.equal(f.item.id, 'b', 'forward comes back to where it was');
  assert.deepEqual(ids(f.q.history), ['a']);
  assert.equal(back(playNow(newQueue(), s('only')), 0).restart, true, 'nothing before: again');
});

test('a song picked by hand clears the way forward from back', () => {
  let q = playNow(playNow(newQueue(), s('a')), s('b'));
  q = back(q, 0).q;
  q = playNow(q, s('c'));
  assert.deepEqual(q.again, []);
  assert.equal(next(q).item, null);
});

test('remove, move and clear work on the queue only', () => {
  let q = playNow(newQueue(), s('a'));
  for (const x of ['1', '2', '3', '4']) q = playLater(q, s(x));
  assert.deepEqual(ids(remove(q, 1).upNext), ['1', '3', '4']);
  assert.equal(remove(q, 9), q);
  assert.equal(remove(q, -1), q);
  assert.deepEqual(ids(move(q, 0, 3).upNext), ['2', '3', '4', '1']);
  assert.deepEqual(ids(move(q, 3, 1).upNext), ['1', '4', '2', '3']);
  assert.equal(move(q, 2, 2), q);
  assert.equal(move(q, 0, 9), q);
  const c = clear(q);
  assert.deepEqual(c.upNext, []);
  assert.equal(c.now.id, 'a');
  assert.equal(clear(c), c);
  assert.deepEqual(ids(q.upNext), ['1', '2', '3', '4'], 'the old queue is untouched');
});

test('loop modes cycle off, all, one', () => {
  let q = newQueue();
  const seen = [];
  for (let i = 0; i < 4; i++) (q = cycleLoop(q)), seen.push(q.loop);
  assert.deepEqual(seen, ['all', 'one', 'off', 'all']);
  assert.equal(setLoop(q, 'bogus'), q);
});

test('the radio goes on as a station: radioNow keeps it', () => {
  let q = playNow(newQueue(), r(1), { kind: 'radio', id: 'chill' });
  q = radioNow(q, r(2));
  assert.equal(q.station.id, 'chill');
  assert.deepEqual(ids(q.history), ['radio:1:all:lofi']);
  q = setStation(q, null);
  assert.equal(next(q).item, null);
  assert.equal(listStation([], 'x'), null);
  assert.equal(listStation([s('a')], 'zz'), null);
});

test('history is capped and kept as small JSON', () => {
  let q = newQueue();
  for (let i = 0; i < 80; i++) q = playNow(q, s(String(i)));
  assert.equal(q.history.length, 50);
  q = playLater(playLater(q, r(5)), s('k'));
  const text = toText(q);
  assert.ok(text.length < 8000);
  assert.ok(!/blob:|data:|wav/.test(text));
  const back2 = fromText(text);
  assert.equal(back2.history.length, 30);
  assert.deepEqual(ids(back2.upNext), ['radio:5:all:lofi', 'k']);
  assert.equal(back2.now, null);
  assert.equal(back2.upNext[0].seed, 5);
  assert.deepEqual(slim({ ...r(5), cover: 'data:xx', wav: 1 }).cover, undefined);
});

test('a bad read is an empty queue, bad items are dropped', () => {
  assert.deepEqual(fromText('not json'), newQueue());
  assert.deepEqual(fromText('{"upNext":[{"id":1},{"id":"a","kind":"song","title":"x"},{"id":"r","kind":"radio","title":"x"}],"loop":"zzz"}').upNext.map(x => x.id), ['a']);
  assert.equal(fromText('{"loop":"one"}').loop, 'one');
  assert.equal(fromText('{"loop":"zzz"}').loop, 'off');
});

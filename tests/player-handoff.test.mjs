// 聽 playing, a song lined up (插播, 稍後播放) takes over at the radio song's end. After one
// had and the radio went on, every song lined up later was passed by: the
// handover stayed marked as under way (2026-11-17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../public/lib/player.mjs';

function rig() {
  const subs = [];
  const r = { cur: { id: 'r1', kind: 'radio', title: 'R1', seed: 1, mood: 'all', style: 'four' }, playing: true, t: 0, seconds: 120 };
  const radio = {
    state: () => r, on: f => subs.push(f), tell: w => subs.forEach(f => f(w)),
    playSpec: t => ((r.cur = t), (r.playing = true)), pick: () => true, start: () => (r.playing = true), pause: () => (r.playing = false),
    skip: () => {}, station: () => 'all', idle: () => ({}), upcoming: () => []
  };
  const audio = Object.assign(new EventTarget(), { paused: true, currentTime: 0, duration: 60, loop: false, seekable: { length: 0 }, play: async () => (audio.paused = false), pause: () => (audio.paused = true) });
  const songs = new Map([['s1', { id: 's1', name: 'S1', info: {} }], ['s2', { id: 's2', name: 'S2', info: {} }]]);
  let now = null;
  const P = createPlayer({ radio, audio, songOf: t => songs.get(t.id) || null, playSong: async s => ((now = s), (audio.paused = false)), nowSong: () => now, closeSong: () => (now = null) });
  return { P, r, radio, audio };
}
const tick = () => new Promise(res => setTimeout(res, 0));

test('a song lined up while the radio plays takes over at the radio song\'s end, the second time too', async () => {
  const { P, r, radio } = rig();
  P.radioPlay();
  radio.tell('song');
  // 插播 a kept song; the radio song nearly ends: it takes over.
  P.playNext({ id: 's1', kind: 'song', title: 'S1' });
  r.t = 119.6;
  radio.tell('time');
  await tick();
  assert.equal(P.state().source, 'song');
  // It ends: the radio goes on.
  await P.ended();
  await tick();
  assert.equal(P.state().source, 'radio');
  // Another lined up: the radio song nearly ends again.
  r.cur = { id: 'r2', kind: 'radio', title: 'R2', seed: 2, mood: 'all', style: 'four' };
  r.t = 0;
  radio.tell('song');
  P.playNext({ id: 's2', kind: 'song', title: 'S2' });
  r.t = 119.6;
  radio.tell('time');
  await tick();
  assert.equal(P.state().source, 'song', 'the second lined-up song never played');
});

// A song's opening (lib/radio.mjs radioIntro): eight bars made in a fraction of the song's time, at about an
// intro's level, never over full scale, that the song can follow at its own ninth bar, gone round (if it must) from its second half.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radioIntro, radioSong, RADIO_SR, OPENING_BARS } from '../public/lib/radio.mjs';
import { radioStart } from '../public/lib/make.mjs';

test("a song's opening: eight bars, about an intro's level, quicker than the song, its length the song's", () => {
  for (const style of ['rock', 'house', 'lofi']) {
    const spec = { seed: 5150, mood: 'all', style };
    let t = performance.now();
    const o = radioIntro(spec);
    const quick = performance.now() - t;
    t = performance.now();
    const s = radioSong(spec);
    const whole = performance.now() - t;
    assert.equal(OPENING_BARS, 8);
    assert.equal(o.audio.L.length, Math.round(((OPENING_BARS * 4 * 60) / s.info.bpm) * RADIO_SR), `${style}: eight bars`);
    let e = 0, peak = 0;
    for (let i = 0; i < o.audio.L.length; i++) (e += o.audio.L[i] ** 2), (peak = Math.max(peak, Math.abs(o.audio.L[i]), Math.abs(o.audio.R[i])));
    const db = 10 * Math.log10(e / o.audio.L.length);
    assert.ok(db > -24 && db < -14, `${style}: level ${db.toFixed(1)} dB`);
    assert.ok(peak <= 0.9, `${style}: peak ${peak}`);
    assert.ok(quick < whole / 3, `${style}: ${quick | 0} ms against ${whole | 0}`);
    assert.ok(Math.abs(o.seconds - s.audio.L.length / RADIO_SR) < 8, `${style}: about the song's length`);
    assert.equal(o.info.style, s.info.style);
  }
  const r = radioStart({ seed: 77, mood: 'chill', style: null });
  assert.ok(r.quick && Math.abs(r.hold.from - r.length / 2) < 1e-9 && Math.abs(r.hold.to - r.length) < 1e-9 && r.id.startsWith('radio:77:chill:'));
});

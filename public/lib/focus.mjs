// 專注配樂 (the AI plan's family links, Class + Beats): the radio's calm
// grooves, one song after another, for Orbit Class's 專注飛行. Class imports
// this file from Beats' own site (`/beats/lib/focus.mjs`, the same origin)
// on the tap that starts its music; the songs are made on the phone as 聽's
// radio makes them (lib/make.mjs `radio`, in its worker, with the recorded
// instruments lib/sampleload.mjs reads), never sent anywhere.
//
//   const m = focusMusic({ onState, audio })   audio: an element the caller unlocked in its tap; onState('making' | 'playing' | 'paused' | 'off' | 'failed', info)
//   m.start()   in the tap (iOS lets a page play only from one): the first song made, then the next
//               made while it plays; m.pause(), m.resume(), m.stop() (lets the worker go)
// A song is { style, bpm, title } as info. Nothing here touches Beats' own
// page, its library or its Pass copy.
import { maker } from './maker.mjs';
import { banksFor } from './sampleload.mjs';

// The calm grooves (聽's 放鬆 mood), the quietest first, taken in turn.
export const FOCUS_STYLES = ['lofi', 'ambient', 'bossa', 'neosoul', 'lofi', 'jazz'];
export const FOCUS_NAMES = { lofi: 'Lo-fi', ambient: 'Ambient', bossa: 'Bossa nova', neosoul: 'Neo-soul', jazz: 'Jazz' };
// A song's spec: 放鬆's (chill) where the groove is one of its own, else 爵士's.
export const focusSpec = (seed, i) => {
  const style = FOCUS_STYLES[i % FOCUS_STYLES.length];
  return { seed, mood: style === 'jazz' ? 'jazz' : 'chill', style };
};
// A breath of silence, played in the tap so the page may play the songs that come later.
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

export function focusMusic({ onState = () => {}, volume = 0.7, audio = null } = {}) {
  let make = null;
  let on = false;
  let i = 0;
  let next = null;
  let url = '';
  const seed0 = Math.floor(Math.random() * 1e9);
  const say = (state, info = null) => {
    try {
      onState(state, info);
    } catch {}
  };
  const song = () => {
    make ||= maker(new URL('./maker.worker.mjs', import.meta.url), { prep: banksFor });
    const k = i++;
    return make.radio(focusSpec(seed0 + k * 7919, k), null, 'blob');
  };
  const free = () => {
    if (url) URL.revokeObjectURL(url);
    url = '';
  };
  async function playNext() {
    if (!on) return;
    say('making');
    let s;
    try {
      s = await (next || song());
    } catch {
      next = null;
      if (on) say('failed');
      on = false;
      return;
    }
    next = null;
    if (!on) return;
    free();
    url = URL.createObjectURL(s.blob || new Blob([s.wav], { type: 'audio/wav' }));
    audio.src = url;
    try {
      await audio.play();
    } catch {
      on = false;
      return say('failed');
    }
    const info = { style: s.info?.style || '', name: FOCUS_NAMES[s.info?.style] || s.info?.style || '', bpm: s.info?.bpm || 0 };
    say('playing', info);
    // (The next made while this one plays: one after another, no gap to wait in.)
    next = song();
    next.catch(() => {});
  }
  return {
    start() {
      if (on) return;
      on = true;
      audio ||= Object.assign(new Audio(), { preload: 'auto' });
      audio.volume = volume;
      audio.onended = () => playNext();
      // (In the tap: a breath of silence unlocks the element for the songs made later.)
      audio.src = SILENT;
      audio.play().catch(() => {});
      playNext();
    },
    pause() {
      if (!on || !audio) return;
      audio.pause();
      say('paused');
    },
    resume() {
      if (!on || !audio) return;
      audio.play().then(() => say('playing'), () => say('failed'));
    },
    stop() {
      on = false;
      next = null;
      if (audio) {
        audio.onended = null;
        audio.pause();
        audio.removeAttribute('src');
        audio.load?.();
      }
      free();
      make?.reset?.();
      say('off');
    },
    get playing() {
      return on && audio && !audio.paused;
    },
    get on() {
      return on;
    }
  };
}

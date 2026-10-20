// The player's screens: the mini bar over the tab bar, Now Playing (a full
// screen sheet), the queue sheet and a song's ⋯ menu. They draw lib/player.mjs's
// state; the sound is not here.
import { h, sheet, menu } from './ui.mjs';
import { icon } from './icons.mjs';
import { STYLE_NAMES, name } from './names.mjs';
import { W } from './lang.mjs';
import { coverOfTrack } from './player.mjs';
import { speedKey } from './length.mjs';
import { TEMPOS, stationName } from './stations.mjs';

const STYLES_FOR_HOLES = ['lofi', 'house', 'jazz', 'citypop', 'hiphop'];

const clock = s => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
// 慢 / 中 / 快 (or Slow / Medium / Fast) for a tempo.
export const speedText = bpm => W(TEMPOS[speedKey(bpm)].zh, TEMPOS[speedKey(bpm)].en);
// A track's second line: its groove and tempo.
export const subOf = t => (t ? [t.style ? name(STYLE_NAMES, t.style) : W('即興', 'Jam'), t.bpm ? speedText(t.bpm) : ''].filter(Boolean).join(' · ') : '');

// A long press (0.5 s) on el runs fn; the click that follows it is dropped.
export function onLong(el, fn) {
  let timer = 0;
  let held = false;
  let x = 0;
  let y = 0;
  const stop = () => clearTimeout(timer);
  el.addEventListener('pointerdown', e => {
    held = false;
    [x, y] = [e.clientX, e.clientY];
    timer = setTimeout(() => {
      held = true;
      navigator.vibrate?.(12);
      fn();
    }, 500);
  });
  el.addEventListener('pointermove', e => Math.hypot(e.clientX - x, e.clientY - y) > 10 && stop());
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, stop);
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!held) (held = true), fn();
  });
  el.addEventListener('click', e => held && (e.stopImmediatePropagation(), e.preventDefault(), (held = false)), true);
}

// core: { kept(track), toggleKeep(track), share(track), inLibrary(track), remove(track), sleep(anchor), sleeping() }
export function mountPlayerView(P, core, { mini, npHost = document.body }) {
  const q = sel => mini.querySelector(sel);

  // ---- ⋯ ----
  // np: opened from Now Playing, where the song is already playing and ♡ and ✂ sit beside the ⋯.
  function trackMenu(track, anchor, { np = false } = {}) {
    if (core.menu) return core.menu(track, anchor, { np, after: () => paint() });
    const kept = core.kept(track);
    const header = { cover: coverOfTrack(track), title: track.title, sub: subOf(track) };
    menu(
      anchor,
      [
        ...(np ? [] : [{ label: W('播放', 'Play'), icon: 'play', onClick: () => P.play(track) }]),
        { label: W('插播', 'Play next'), icon: 'play_next', onClick: () => P.playNext(track) },
        { label: W('稍後播放', 'Play later'), icon: 'play_later', onClick: () => P.playLater(track) },
        'divider',
        ...(np ? [] : [{ label: kept ? W('取消收藏', 'Remove from Library') : W('收藏', 'Keep'), icon: kept ? 'heart-fill' : 'heart', onClick: () => core.toggleKeep(track).then(() => paint()) }]),
        { label: W('分享', 'Share'), icon: 'share', onClick: () => core.share(track) },
        ...(core.game && Number.isFinite(track.seed) && track.style ? [{ label: W('玩節奏遊戲', 'Play the rhythm game'), icon: 'grid', onClick: () => core.game(track) }] : []),
        ...(core.remix ? [{ label: W('重新混音', 'Remix'), icon: 'shuffle', onClick: () => core.remix(track) }, ...(np ? [] : [{ label: W('取出片段', 'Take a clip'), icon: 'cut', onClick: () => core.clip(track) }])] : []),
        ...(core.inLibrary(track) ? ['divider', { label: W('從資料庫移除', 'Remove from Library'), icon: 'trash', danger: true, onClick: () => core.remove(track) }] : [])
      ],
      { header, scrim: true }
    );
  }

  // ---- The mini bar ----
  const main = q('.mp-main');
  const mpPlay = q('.mp-play');
  const mpNext = q('.mp-next');
  let shown = '';
  function paintMini() {
    const s = P.state();
    mini.hidden = !s || (!s.track && !s.busy);
    document.body.classList.toggle('playing', !mini.hidden);
    if (mini.hidden) return;
    const title = s.track ? s.track.title : W('電台', 'Radio');
    const sub = s.busy && !s.track ? W('調頻中…', 'Tuning in…') : s.busy ? W('調頻中…', 'Tuning in…') : subOf(s.track);
    const key = `${s.track?.id}|${title}|${sub}|${s.playing}|${s.busy}`;
    if (key !== shown) {
      shown = key;
      q('.mp-cover').src = s.cover || '';
      q('.mp-title').textContent = title;
      q('.mp-sub').textContent = sub;
      mpPlay.innerHTML = icon(s.playing || s.busy ? 'pause' : 'play');
      mpPlay.setAttribute('aria-label', s.playing || s.busy ? W('暫停', 'Pause') : W('播放', 'Play'));
    }
    q('.mp-at').style.width = s.seconds ? `${Math.min(100, (s.t / s.seconds) * 100)}%` : '0';
  }
  mpPlay.innerHTML = icon('play');
  mpNext.innerHTML = icon('next');
  mpNext.setAttribute('aria-label', W('下一首', 'Next'));
  mpPlay.onclick = () => P.toggle();
  mpNext.onclick = () => P.forward();
  main.onclick = () => openNow();

  // ---- Now Playing ----
  let np = null;
  let els = null;
  let drag = false;
  const LOOP_LABEL = { off: W('循環：關', 'Loop: off'), all: W('循環：全部', 'Loop: all'), one: W('循環：單曲', 'Loop: one') };
  function buildNow() {
    const btn = (cls, label, onclick) => h('button', { class: cls, type: 'button', 'aria-label': label, onclick });
    const art = h('img', { class: 'np-cover', alt: '', draggable: 'false' });
    const title = h('h2', { class: 'np-title' });
    const sub = h('p', { class: 'np-sub' });
    const heart = btn('np-ico', W('收藏', 'Keep'), () => P.state()?.track && core.toggleKeep(P.state().track).then(() => paint()));
    const more = btn('np-ico', W('更多', 'More'), e => P.state()?.track && trackMenu(P.state().track, e.currentTarget, { np: true }));
    const fill = h('i');
    // (How far it can be moved to: the part of the song the phone has.)
    const reach = h('b', { class: 'np-reach' });
    const bar = h('div', { class: 'np-bar', role: 'slider', 'aria-label': W('播放位置', 'Position'), tabindex: '0' }, [reach, fill]);
    const t0 = h('span', { text: '0:00' });
    const t1 = h('span', { text: '0:00' });
    const back = btn('np-skip', W('上一首', 'Back'), () => P.back());
    const play = btn('np-play', W('播放', 'Play'), () => P.toggle());
    const fwd = btn('np-skip', W('下一首', 'Forward'), () => P.forward());
    const loop = btn('np-ico', LOOP_LABEL.off, () => (P.cycleLoop(), paint()));
    const sleep = btn('np-ico np-sleep', W('睡眠定時', 'Sleep timer'), e => core.sleep(e.currentTarget));
    const queue = btn('np-ico', W('播放佇列', 'Queue'), () => queueSheet());
    const cut = btn('np-ico', W('取出片段', 'Take a clip'), () => P.state()?.track && core.clip?.(P.state().track));
    cut.innerHTML = icon('cut');
    const down = btn('np-down', W('收起', 'Close'), () => closeNow());
    down.innerHTML = icon('down');
    back.innerHTML = icon('prev');
    fwd.innerHTML = icon('next');
    heart.innerHTML = icon('heart');
    more.innerHTML = icon('more');
    queue.innerHTML = icon('queue');
    sleep.innerHTML = icon('moon');
    const bg = h('img', { class: 'np-bg', alt: '', draggable: 'false', 'aria-hidden': 'true' });
    np = h('div', { class: 'np', role: 'dialog', 'aria-modal': 'true', 'aria-label': W('正在播放', 'Now playing'), hidden: true }, [
      bg,
      h('i', { class: 'np-shade', 'aria-hidden': 'true' }),
      h('div', { class: 'np-top' }, [down, h('i', { class: 'np-grab', 'aria-hidden': 'true' }), h('span', { class: 'np-top-gap' })]),
      h('div', { class: 'np-art' }, [art]),
      h('div', { class: 'np-what' }, [h('div', { class: 'np-text' }, [title, sub]), heart, more]),
      bar,
      h('div', { class: 'np-times' }, [t0, t1]),
      h('div', { class: 'np-main' }, [back, play, fwd]),
      h('div', { class: 'np-extra' }, [loop, sleep, ...(core.clip ? [cut] : []), queue])
    ]);
    npHost.append(np);
    // The position: a tap or drag along the bar (a song, or the radio's song: it's made whole before it plays).
    const at = ev => {
      const r = bar.getBoundingClientRect();
      const s = P.state();
      const top = s?.seconds ? Math.min(1, (s.upTo ?? s.seconds) / s.seconds) : 1;
      return Math.max(0, Math.min(top, (ev.clientX - r.left) / r.width));
    };
    bar.addEventListener('pointerdown', ev => {
      const s = P.state();
      if (!s?.canSeek) return;
      drag = true;
      bar.setPointerCapture?.(ev.pointerId);
      fill.style.width = `${at(ev) * 100}%`;
      t0.textContent = clock(at(ev) * s.seconds);
      const move = e2 => ((fill.style.width = `${at(e2) * 100}%`), (t0.textContent = clock(at(e2) * s.seconds)));
      const up = e2 => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        bar.removeEventListener('pointercancel', up);
        drag = false;
        P.seek(at(e2) * s.seconds);
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
      bar.addEventListener('pointercancel', up);
    });
    bar.addEventListener('keydown', ev => {
      const s = P.state();
      if (s?.canSeek && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) P.seek(s.t + (ev.key === 'ArrowRight' ? 5 : -5));
    });
    // Swiping down closes it.
    let y0 = null;
    np.addEventListener('touchstart', e => (y0 = np.scrollTop <= 0 && !e.target.closest('.np-bar') ? e.touches[0].clientY : null), { passive: true });
    // (The drag is the view's own: the page behind it never scrolls with it.)
    np.addEventListener('touchmove', e => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) {
        if (e.cancelable) e.preventDefault();
        np.style.transition = 'none';
        np.style.transform = `translateY(${dy}px)`;
      }
    }, { passive: false });
    np.addEventListener('touchend', e => {
      if (y0 == null) return;
      const dy = (e.changedTouches[0]?.clientY ?? y0) - y0;
      y0 = null;
      np.style.transition = '';
      np.style.transform = '';
      if (dy > 110) closeNow();
    });
    document.addEventListener('keydown', e => e.key === 'Escape' && np && !np.hidden && !document.querySelector('dialog[open]') && closeNow());
    els = { bg, art, title, sub, heart, fill, reach, t0, t1, play, loop, sleep, bar };
  }
  let hideTimer = 0;
  function openNow() {
    if (!P.state()) return;
    if (!np) buildNow();
    clearTimeout(hideTimer);
    np.hidden = false;
    document.body.classList.add('np-open');
    requestAnimationFrame(() => np.classList.add('in'));
    paint();
    els.play.focus({ preventScroll: true });
  }
  function closeNow() {
    if (!np || np.hidden) return;
    np.classList.remove('in');
    document.body.classList.remove('np-open');
    // (Opened again before it was gone: it stays.)
    hideTimer = setTimeout(() => !np.classList.contains('in') && (np.hidden = true), 280);
    mini.querySelector('.mp-main')?.focus?.({ preventScroll: true });
  }
  let npKey = '';
  function paintNow(time = false) {
    if (!np || np.hidden) return;
    const s = P.state();
    if (!s) return closeNow();
    const t = s.track;
    const playing = s.playing || s.busy;
    if (!time) {
      const key = `${t?.id}|${s.cover?.length}|${playing}|${P.q.loop}|${core.kept(t)}|${core.sleeping()}|${s.source}`;
      if (key !== npKey) {
        npKey = key;
        els.art.src = s.cover || '';
        els.bg.src = s.cover || '';
        els.title.textContent = t ? t.title : W('電台', 'Radio');
        els.sub.textContent = s.busy ? W('調頻中…', 'Tuning in…') : subOf(t);
        np.classList.toggle('paused', !playing);
        els.play.innerHTML = icon(playing ? 'pause' : 'play');
        els.play.setAttribute('aria-label', playing ? W('暫停', 'Pause') : W('播放', 'Play'));
        const k = core.kept(t);
        els.heart.innerHTML = icon(k ? 'heart-fill' : 'heart');
        els.heart.classList.toggle('on', k);
        els.heart.setAttribute('aria-label', k ? W('取消收藏', 'Remove from Library') : W('收藏', 'Keep'));
        els.heart.setAttribute('aria-pressed', String(k));
        const loop = P.q.loop;
        els.loop.innerHTML = icon(loop === 'one' ? 'loop-one' : 'loop');
        els.loop.classList.toggle('on', loop !== 'off');
        els.loop.setAttribute('aria-label', LOOP_LABEL[loop]);
        els.loop.setAttribute('aria-pressed', String(loop !== 'off'));
        els.sleep.hidden = s.source !== 'radio';
        els.sleep.classList.toggle('on', Boolean(core.sleeping()));
        els.sleep.dataset.left = core.sleeping();
        els.bar.classList.toggle('still', !s.canSeek);
      }
    }
    if (drag) return;
    els.fill.style.width = s.seconds ? `${Math.min(100, (s.t / s.seconds) * 100)}%` : '0';
    els.reach.style.width = s.canSeek && s.seconds ? `${Math.min(100, ((s.upTo ?? s.seconds) / s.seconds) * 100)}%` : '0';
    els.t0.textContent = clock(s.t);
    els.t1.textContent = s.seconds ? `-${clock(s.seconds - s.t)}` : '';
    els.bar.setAttribute('aria-valuenow', String(Math.round(s.t)));
  }

  // ---- The queue ----
  let qs = null;
  function row(track, { grip = false, onRemove = null, index = -1 } = {}) {
    const li = h('li', { class: 'qrow', 'data-i': String(index) }, [
      grip ? h('span', { class: 'qgrip', html: icon('grip'), 'aria-hidden': 'true' }) : null,
      h('img', { class: 'qcover', alt: '', src: coverOfTrack(track), width: 44, height: 44 }),
      h('div', { class: 'qtext' }, [h('b', { text: track.title }), h('small', { text: subOf(track) })]),
      onRemove ? h('button', { class: 'qx', type: 'button', 'aria-label': W(`移除 ${track.title}`, `Remove ${track.title}`), html: icon('close'), onclick: onRemove }) : null
    ]);
    return li;
  }
  function queueSheet() {
    const body = h('div', { class: 'qsheet' });
    const draw = () => {
      const s = P.state();
      const up = P.q.upNext;
      const after = P.q.station?.kind === 'radio' ? P.upNextRadio() : P.stationNext();
      const list = h('ul', { class: 'qlist' }, up.map((t, i) => row(t, { grip: true, index: i, onRemove: () => P.remove(i) })));
      grips(list);
      const radioQ = P.q.station?.kind === 'radio';
      // (The radio makes two ahead; the rest of the five are the station's, not made yet.)
      const holes = radioQ ? Math.max(0, 5 - up.length - after.length) : 0;
      const hole = i => {
        const t = { id: `ph:${i}`, kind: 'radio', seed: 7000 + i * 977, mood: s?.station && !/:/.test(s.station) ? s.station : 'all', style: STYLES_FOR_HOLES[i % STYLES_FOR_HOLES.length] };
        return h('li', { class: 'qrow ph', 'aria-hidden': 'true' }, [h('span', { class: 'qcover', style: `background-image:url("${coverOfTrack(t)}")` }), h('div', { class: 'qtext' }, [h('b', { text: W(`電台 · ${stationName(s?.station || 'all')}`, `Radio · ${stationName(s?.station || 'all')}`) }), h('i', { class: 'qbar' })])]);
      };
      const pill = (cls, ico, label, on, fn) => h('button', { class: `qpill${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), onclick: fn, html: `${icon(ico)}<span>${label}</span>` });
      const loop = P.q.loop;
      const pills = [
        P.q.station?.kind === 'list' || up.length > 1 || P.q.shuffle ? pill('', 'shuffle', W('隨機播放', 'Shuffle'), P.q.shuffle, () => P.shuffle()) : null,
        pill('', loop === 'one' ? 'loop-one' : 'loop', loop === 'one' ? W('循環 · 單曲', 'Repeat one') : W('循環', 'Repeat'), loop !== 'off', () => P.cycleLoop()),
        radioQ ? null : pill('', 'radio', W('自動播放', 'Autoplay'), P.q.autoplay, () => P.autoplay())
      ].filter(Boolean);
      const now = s?.track
        ? h('div', { class: 'qnow' }, [h('img', { class: 'qcover', alt: '', src: s.cover || coverOfTrack(s.track), width: 56, height: 56 }), h('div', { class: 'qtext' }, [h('b', { text: s.track.title }), h('small', { text: subOf(s.track) })]), h('span', { class: `qeq${s.playing ? ' on' : ''}`, 'aria-hidden': 'true', html: icon('wave') })])
        : h('p', { class: 'qnone', text: W('沒有在播放', 'Nothing playing') });
      const any = up.length || after.length || holes;
      body.replaceChildren(...[
        now,
        h('div', { class: 'qpills' }, pills),
        any ? h('div', { class: 'qhead-row' }, [h('h3', { class: 'qhead', text: W('接下來', 'Up next') }), up.length ? h('button', { class: 'qclear', type: 'button', text: W('清除', 'Clear'), onclick: () => P.clear() }) : null]) : null,
        up.length ? list : null,
        after.length || holes ? h('ul', { class: 'qlist dim' }, [...after.map(t => row(t)), ...Array.from({ length: holes }, (_, i) => hole(i))]) : null
      ].filter(Boolean));
    };
    // Drag a row by its grip to a new place.
    function grips(list) {
      for (const li of list.children) {
        const grip = li.querySelector('.qgrip');
        grip.addEventListener('pointerdown', ev => {
          ev.preventDefault();
          grip.setPointerCapture(ev.pointerId);
          const from = +li.dataset.i;
          const rows = [...list.children];
          const hgt = li.offsetHeight;
          const y0 = ev.clientY;
          let to = from;
          li.classList.add('drag');
          const move = e => {
            const dy = e.clientY - y0;
            to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / hgt)));
            li.style.transform = `translateY(${dy}px)`;
            rows.forEach((r, i) => r !== li && (r.style.transform = from < to && i > from && i <= to ? `translateY(${-hgt}px)` : from > to && i < from && i >= to ? `translateY(${hgt}px)` : ''));
          };
          const up = () => {
            grip.removeEventListener('pointermove', move);
            grip.removeEventListener('pointerup', up);
            grip.removeEventListener('pointercancel', up);
            if (to !== from) P.move(from, to);
            else draw();
          };
          grip.addEventListener('pointermove', move);
          grip.addEventListener('pointerup', up);
          grip.addEventListener('pointercancel', up);
        });
      }
    }
    draw();
    const off = P.on(w => (w === 'queue' || w === 'song') && draw());
    qs = sheet({ title: '', cls: 'q-queue', closeLabel: W('關閉', 'Close'), body, onClose: () => (off(), (qs = null)) });
    qs.el.setAttribute('aria-label', W('播放佇列', 'Queue'));
  }

  function paint() {
    paintMini();
    paintNow();
  }
  P.on(w => (w === 'time' ? (paintMini(), paintNow(true)) : paint()));
  paint();
  return { openNow, closeNow, queueSheet, trackMenu, paint };
}

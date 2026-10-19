# Orbit Beats

Music that never stops (聽, songs made from nothing on the app's own
instruments), and your own beat pieces arranged into new songs, each piece
exactly as recorded. Everything runs on the phone; no sound is uploaded. Signs in
with the Quadra Pass. `passion_beats.py` is the same engine on the command
line.

Live: https://jaypengx.github.io/Orbit-Beats/ (was Passion Beats)

## How it works

- **簡單 / 進階** (`lib/easy.mjs`): everyone opens 簡單 (the owner's call).
  簡單 makes songs on settings of its own, fixed (every groove, the usual
  length and feel, the mixer as it opens, 16-bit): it never reads or writes
  進階's, so 進階 is as it was on the way back. Its 做歌 is one button,
  🎲 隨機做一批: six songs from your pieces when they have a tune, else on
  the built-in band. 樂器 starts from a clip written for you (▶, 🎲,
  the groove chips, 存成片段); 即興 is the pads and ● 錄一段. 進階 shows every tool
  below. The choice is a setting on the Pass, in the account sheet (模式) and 更多設定.
  Each control only one of them shows carries `data-ctl`, hidden by one
  stylesheet rule per name.
- **Words** (`lib/help.mjs`): 23 music words (BPM, swing, riff, hi-hat, 808,
  chords, key, sections, chain, stems, MIDI, velocity, steps, choke, snap…) in
  everyday words, zh and en; a ⓘ beside a control opens one, eight with
  ▶ the same bar without it and with it. The ? sheet is the four screens as rows (聽 即興 樂器 做歌: tap one to go there, ▶ to try it; `TOUR` in `lib/help.mjs`), then rows for the words and
  opens the full guide (the kit's `help.mjs`, in the Quadra Pass sheet).
- **Tabs:**
  - **聽** (Listen, the first screen; `lib/radio.mjs`, `lib/radioview.mjs`):
    one play button and the moods (隨機, 放鬆, 熱血, 律動, 經典, or one groove).
    Each song is its own band on the app's instruments: a groove of the mood
    (never the one just played), its tempo, a key, four chords, chords,
    melodies, an arpeggio, two bass lines, hats and drums as four-bar loops,
    arranged by the engine in sections of four or eight bars and mixed.
    The worker makes them two ahead; each is cut just before its last hit and
    that hit's ring plays under the next one's intro, in one `<audio>` (it
    plays on with the screen locked; lock-screen title, play/pause, next,
    where in the song). Where Media Source takes FLAC in MP4 (Chrome), or AAC
    / Opus in MP4 and the phone's AudioEncoder (WebCodecs) can pack it
    (Safari 26), the songs go onto one endless stream (`lib/tape.mjs`), a
    few seconds ahead, so one runs into the next with no gap; elsewhere, or
    if the stream fails, stalls or is stopped with the screen off, file by
    file from where it was. The way taken and why is kept in
    `localStorage['orbit-beats-radio-path']` and shown on 聽 with `?debug`;
    `localStorage['orbit-beats-radio']` = `files` keeps a phone on files,
    `flac` / `aac` / `opus` tries only that one.
    If the next isn't made by the outro, the last hook plays again from its
    bar line. ♡ keeps the whole song in 資料庫; ⏭ the next. Each song has its
    own cover (`lib/cover.mjs`: drawn from its seed, groove, mood, key and
    tempo, the same every time), crossfaded in and shown on the lock screen
    (a small JPEG, the app icon after it); its bars and a breath of the cover land on the song's
    beat (CSS at its tempo, set to the player's time; still with reduced
    motion); the card takes a tint of its colour. 最近播放 lists the last
    songs (this phone, `orbit-beats-recent.v1`), each with ♡. 睡眠定時
    (🌙): 15, 30, 60 minutes or this song's end, the last ten seconds faded
    (not on iPhone, which keeps its own volume: there it stops on time).
  - **做歌** (Make): pieces in, a 情境 mood (放鬆, 熱血, 律動, 經典), the drum
    styles, how many songs, and 更多設定. Each song has a title, length,
    groove and key, ▶ in the player over the tab bar, ♡ to keep it, and ⋯
    (變奏一首, 換個鼓, 編排, 分享, 下載 WAV, 存成檔案, 分軌 stems, MIDI). A song
    plays on into the next of the list it was started from. Under each song is its
    section strip (前奏 主歌 導歌 副歌 …, wide as they are long): tap one to play
    from its start, hold it to loop it (the player's § repeat); the one playing
    is lit and follows seeks (`lib/sections.mjs`).
  - **樂器** (Studio): clips on the app's own instruments (`lib/synth.mjs`,
    drums or melody). On top ▶, 🎲 (a beat in another groove, or another
    melody) and chips: a groove's writes a beat in it and plays, an
    instrument's switches the notes to it. The grid is a lane a drum (its
    colour and name over it; only the drums in use and kick, snare, hat,
    the rest behind ＋ 更多鼓) or a note, 16 steps across in four beats
    (fits 320 px at 18 px a step), a bar at a time, the step playing lit.
    Under it ↶ 復原, 清除, ♡ 收藏 and 存成片段; ⓘ explains the taps. 1, 2 or 4 bars, with
    accents, a long press for each hit's 力度 (輕, 中, 重), chords, swing,
    undo, ⧉ 複製, ♡ 收藏 (to the shelf; delete and 清除 have 復原), tap tempo and MIDI out. Up to four 段落 (A–D) and a
    串接 of them (A A B A, up to 8) that plays, renders and exports in order.
    It loops as you tap; 存成片段 renders the chain into the kit.
  做歌 pieces: ⋯ → 刪除, 全部清除 (asks first), both with 復原 for 5 s; 存成套組 / 我的套組 keep named kits on this phone (`lib/kitops.mjs`, IndexedDB `named`).
  - **即興** (Jam): pads over a groove. It opens on **內建**, the app's own
    band as 16 coloured pads (`lib/jamset.mjs`: 聽's band from `radioKit`,
    drums, three hat loops, two bass lines, two chord parts and two melodies
    on the same four chords in one key), made in a worker of its own (not
    queued behind 聽's songs) as the app opens, from a groove
    and a seed; the groove chips and 🎲 swap the set (tempo, key,
    instruments), and what was playing goes on with the new one. Its
    four-bar parts keep step: joined on bar 2 a part plays from its own bar
    2, one chord part, bass line and closed hat at a time, and a part turned
    off is cut on the bar. With pieces in the kit, **我的片段** plays the kit
    as pads over a groove made of its own drums.
    Loops start on the next bar, one-shots snap to 1/16, 1/8, the beat or
    自由; ● 錄一段 turns a take into a song (a built-in take is made again
    from its seed and groove: no kit needed). A long press on a pad: its
    音量, 靜音 and 切音 (self, or group A/B: an open hat cut by a closed
    one), kept per kit (fingerprint) on the phone; a take's song carries
    each hit's level and cut, so it sounds as played.
  - **節奏遊戲** (Rhythm game; `lib/game.mjs`, `lib/gameview.mjs`): every
    radio song is a level. Its chart comes from the song's own notes
    (`radioSong` returns the engine's hits and each riff's melody and chords),
    so every tap lands on a sound; a long chord is a hold. Four lanes, four
    levels (簡單 普通 困難 專家), judged 完美 ±45 ms, 很好 ±90, 不錯 ±135,
    scored to 1,000,000 (S+ to D); 火力全開 from 50 combo. A full-screen
    canvas stage on the page's AudioContext clock; 時間校正 in the pause menu
    for Bluetooth lag. Opens from 創作's card (今日挑戰 and a mood's six songs
    of the day) or a song's ⋯; `#game`. Bests per song and level on this
    phone (`orbit-beats-game.v1`); `orbit-beats-game-auto` = `1` plays every
    note itself (screenshots).
  - **資料庫** (Library): kept songs (IndexedDB), small (`lib/pack.mjs`): AAC (else Opus)
    from the phone's AudioEncoder in a plain .m4a, about a tenth of the WAV; with no
    encoder a built-in song is mono 16-bit and one of your pieces stays a WAV. WAVs
    kept before are packed in the background (資料庫瘦身). 下載 / 分享 WAV and the zip
    make the song again at full quality from its recipe when it still sounds like
    what was kept, else decode the kept copy (and say so). Play, share,
    rename, delete, vary; search by name, groove or key, four orders, and
    a zip of what's shown. 清單 (playlists, localStorage): make, rename,
    delete, add a song from its ⋯, open one and play it in order; a song
    taken out of 資料庫 leaves every list. 依你的口味 leans new batches toward
    the styles you keep.
- **Pieces in:** one recording split on its silences, a sample pack (many
  files, each split), or the microphone, in any mix.
- **Tempo:** every tempo from 70–190 BPM is scored by how well the hits
  sit on 16ths; ½ and ×2 fix the usual off-by-a-ratio misses.
- **Roles:** each piece is heard as riff, phrase, bass, hats, fill, kick,
  808, snare, tick or roll (by hits, decay, frequency bands, noisiness,
  pitch). Each can be changed by hand. On 100 made-up packs: 97% of tempos
  exact, 97.5% of roles right.
- **Key:** from the riffs' notes (a DFT at each note's pitch,
  Krumhansl–Kessler profiles).
- **Arrangement:** the usual song form. Phrases in fours, intro → verse/hook
  pairs (a 導歌 pre-hook lift before some hooks) → bridge or break → last
  hook → outro. The same riff set per
  section type, energy building to the last hook, fills at phrase ends,
  and a clean ending.
- **Drum styles:** four-on-floor, hip-hop, trap, half-time, broken, house,
  dembow, afrobeats, drill, boom bap, Jersey club, amapiano, lo-fi, funk,
  UK garage, drum & bass, reggae, phonk, baile, techno.
- **Mix** (on by default, 更多設定): buses for drums, hats, bass and melody;
  the drums and bass glued (2:1) and kept off the sub, the melody brightened
  and set wide (its middle stays put, so a mono speaker hears it as it was),
  echo and an 8-line room (snare and hats sent to it, kick and bass not),
  sidechain pump, sweeps into hooks; then the song brought to one RMS
  (-13 dBFS), a soft saturation and a limiter at -1 dBFS; stems add up to the
  mix. Off, the pieces play exactly as recorded. `passion_beats.py` does the
  same steps, and `tests/mixparity.test.mjs` feeds both one input.
- **Making** runs in a worker (`lib/maker.mjs`), so the page never stalls.
- **Saved:**
  - On the phone: the last kit's sound and the kept songs.
  - On the Pass (app `beats`, `{ v: 1, settings, kits, taste }`): settings
    (簡單 / 進階 and what 聽 plays among them),
    and each kit's tempo and hand-set roles, keyed by a fingerprint of its
    sound. The newest 40 kits.
- **Offline:** works fully (`sw.js` keeps every file).

## Decisions in force

- 聽 plays on one `<audio>` only: iOS keeps one playing with the screen
  locked, and two (one starting before the other ends) stopped the music.
- The mixer is on by default (the owner's call). With it off, pieces are
  never changed: no volume, panning, fades or effects, and overlaps that
  clip are left (32-bit float keeps them; the page shows the peak).
- No sound ever leaves the phone.
- Nothing goes silent by accident: a song's every second sounds, and no
  quarter second of a radio song falls under -45 dBFS (the tests listen to
  twenty back to back; breaks and intros have a soft pad under their
  melody, and a riff is never left out for a whole four-bar loop); a break with nothing
  short enough still plays its shortest phrase; a worker that stops
  answering hands its work to the page after 90 s; the instruments and pads
  play as music (iOS's silent switch doesn't mute them) and start again
  after a call or Siri.
- The guided first song is retired (聽 is the way in now).
- `engine.mjs` and `passion_beats.py` stay in step.

## Sounds added for variety

- **Grooves (49 in all; 29 new):** jazz swing, bossa nova, samba, salsa, rock, pop-punk, metal, city pop, K-pop, synthwave, disco, gospel, neo-soul, ballad, ambient, cinematic, chiptune, kizomba, highlife, cumbia, bhangra, dubstep, footwork, jungle, trance, hardstyle, Chinese, blues, country. Each is in `engine.mjs` and mirrored in `passion_beats.py`, with a Chinese and an English name (`lib/names.mjs`) and a cover.
- **Instruments (42 in all; 30 new, `lib/voices.mjs`):** piano, Rhodes, clavinet, vibes, marimba, kalimba, music box, glass bell, steel drum, harp, nylon guitar, banjo, guzheng, sitar, pizzicato, erhu, sax, flute, harmonica, accordion, choir, supersaw, chip, chip bass, 808 glide, upright bass, acid bass, Reese bass, distorted guitar, slap bass.
- **Drums (32 in all; 16 new lanes):** timbale, cajon, tabla, clave, tambourine, guiro, agogo, dhol; brush, rock kick and snare, hard kick, 8-bit kick, snare and hat, gong. Each has its own General MIDI note.
- **聽 moods:** Pop, Jazz and World join the four.
- **Next-song rule (`radioPick`):** no groove repeated within the last six (the mood's size less five in a small mood), a different family, a tempo jump of 15 BPM or a half/double feel, and a new key or mode, then new chords, lead and form. `tests/variety.test.mjs` checks 30 songs per mood.
- **Inside a song (`lib/radio.mjs`, `makeSong`'s `arrange` and `varied`):** the verse's chords are one loop and the hook's another (another family, another lead, a bass to suit); a second verse plays other riffs; the last hook (when there are two) is lifted one to five semitones, with its own riffs, bass and 808; the drums are dressed per section (ghost ticks, a pushed or skipped kick, open ticks, a snare snap, and how a phrase ends: five touches, a different one for verses, hooks, the last hook and the bridge). The forms vary (an eight-bar intro, four-bar verses, a pre-hook now and then, a hook shown early, a break or bridge between pairs, the last hook doubled or cut short). All drawn from streams of their own, so the jam set's band (`radioKit(sp, sr)`) is as it was. `passion_beats.py --varied` plays the same drum touches.
- **Last eight (`radioPick`, `MEMORY`):** besides the last song, the seed drawn is the one that repeats least of the last eight: chord loops (verse's and hook's, as families: a loop and its turns are one), keys, leads, chord instruments, forms, tempos and drum touches, what is near counting the most. `tests/variety2.test.mjs` checks it, and that sections differ.
- **Core voices (`lib/voices.mjs`, `lib/synth.mjs`):** keys, rhodes, piano, pad, strings, pluck, lead, bass and sub are band-limited (PolyBLEP saws and pulses, sines) through filters that move with the note; the kick has a beater click; hats and cymbals are band-passed noise under the 808's six squares. `voice(inst, midi, sr, hold, vel, variant)`: a harder hit (`vel`, from the clip's level) is brighter, and a note that comes again in a clip takes the other of two takes (`variant`: its own noise, phase and a few cents), so no repeat is bit for bit the last. `tests/voices-core.test.mjs` holds the numbers.
- **Loudness:** `node scripts/loudness.mjs [seed] [style,...]` renders 8 s of each groove's radio song and prints RMS and peak (nothing is written); a per-groove `mix` in `lib/radio.mjs` evens out the outliers.

## Files (`public/`)

| File | What |
| --- | --- |
| `app.js`, `index.html` | The page, tabs, player, library |
| `engine.mjs` | Song planning and rendering (port of the script) |
| `analyze.mjs` | Hearing tempo and roles |
| `lib/sources.mjs` | Files to one rate, split on silence |
| `lib/kits.mjs` | Fingerprint, the Pass payload, the phone's kit and songs |
| `lib/synth.mjs`, `lib/studio.mjs` | Instruments and 自動編; the 樂器 tab |
| `lib/mix.mjs` | The mixer: buses, glue, width, room, the master (loudness, saturation, limiter), stems |
| `lib/make.mjs`, `lib/maker.mjs`, `lib/maker.worker.mjs` | Making songs in a worker |
| `lib/jam.mjs`, `lib/jamview.mjs` | 即興: timing, levels, choke; the pads |
| `lib/library.mjs`, `lib/lists.mjs` | 資料庫: search, order, zip; playlists |
| `lib/jam.mjs`, `lib/jamview.mjs` | 即興: timing; the pads |
| `lib/library.mjs` | 資料庫: search, order, zip |
| `lib/sections.mjs` | 做歌: section times and the playing section |
| `lib/radio.mjs`, `lib/radioview.mjs` | 聽: songs out of nothing, the join between them; its screen and player |
| `lib/cover.mjs`, `lib/listen.mjs` | 聽's covers; its sleep timer and recently played |
| `lib/tape.mjs` | 聽's one stream: FLAC frames, or AAC / Opus from AudioEncoder, in MP4 for Media Source; which way a phone plays; the songs in order (the hook again while waiting) |
| `lib/easy.mjs`, `lib/help.mjs` | 簡單 / 進階 and 簡單's fixed settings; the music words and their examples |
| `lib/pack.mjs` | 資料庫's songs kept small: the .m4a, packing, 資料庫瘦身's rule, telling a song made again from another |
| `lib/project.mjs` | 存成檔案 / 打開檔案: a song's settings (no sound) as a versioned `.orbitbeats.json` |
| `lib/midi.mjs`, `lib/tap.mjs`, `lib/download.mjs`, `lib/names.mjs` | MIDI files, tap tempo, saving, names |

## Run and test

```bash
npm test
```

```bash
node ../Shared-Proxy/tools/preview.mjs beats --width 375
```

The script:

```bash
python3 passion_beats.py all_beats.wav --count 20 --out songs/
```

Its flags: `--bpm`, `--roles 3=riff,12=off`, `--styles`, `--humanize`,
`--seed`, `--min-bars` / `--max-bars`, `--silence-db -60`,
`--save-pieces`, `--raw` (no mix), `--levels`, `--reverb`, `--delay`,
`--pump`, `--width`, `--fade`, `--no-sweep`, `--stems`, `--plan`. A push to `main` tests and deploys to Pages.

## The create shell (app.js)

- **創作** has no big title: 即興's hero, 樂器 and 做歌, then 你的歌 (or 從這裡開始, four one-tap ways in, before there are songs) and 即興組合 (six grooves, each a band: a tap opens 即興 on it and starts it, `jam.useSet`).
- **樂器, 即興, 做歌** put their chevron and name in the account's own line (`#subnav` in the app bar). While 樂器 or 即興 plays, the mini player steps aside (`body.own-sound`).
- A **song row** is one button (cover and name play it); ♡ and ⋯ stand beside it. The section strip is 做歌's only. The ⋯ menu leads with the song (cover, title) over a dimmed page: 插播, 稍後播放 · 加到清單, 分享 · 重新混音, 取出片段, 變奏一首 · 下載 · 重新命名 · 從資料庫移除 (red, last).
- **簡單 做歌**: the built-in band (its cover, ringed) beside ＋, four 情境 cards (放鬆 熱血 律動 經典; a tap picks, again lets go; `makeWith` in `lib/easy.mjs`) and the length. 做 N 首歌 shows a spinner only while it works, and the list below is the progress: a shimmering place per song, filled as each lands.

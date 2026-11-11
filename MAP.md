# Orbit Beats: the map

Music that never stops (聽, songs made from nothing on the app's own
instruments), and your own beat pieces arranged into new songs, each piece
exactly as recorded. Everything runs on the phone; no sound is uploaded. Signs in
with the Orbit Pass. `passion_beats.py` is the same engine on the command
line.

Live: https://orbit.jaypengx.com/beats/ (was Passion Beats)

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
  opens the full guide (the kit's `help.mjs`, in the Orbit Pass sheet).
- **Picks that learn** (the family's one engine, the kit's `feedback.mjs`,
  kept on the Pass as `fb:beats`, a month's half-life): 為你推薦, 為你電台
  and 做歌's lean learn from listening, not only ♡: a radio song heard to its
  end counts for its groove, one skipped in its first 30 s against
  (`heardSong`); a groove counts at its likely least (`SURE`: one heard by
  luck isn't one heard ten times); skips never take a ♡'d groove below half
  (`lib/listen.mjs tasteFrom`). This phone's counts from before the engine are
  read into it once (`oldListening`). 今日精選 and 今日挑戰 are
  the same on every device (made from Taiwan's date alone). The home screen's
  songs are planned from a table worked out once, so it opens faster.
- **Wide screens** (DESIGN §10; a page of 640 or more, `html.q-wide`; Jay 2026-11-06: "too like phone just port onto iPad"): each tab draws a big screen's own layout, never the phone's made long, in the phone's order (`isWide()` in `lib/homeview.mjs` at each draw; `kit.onScreen` draws 首頁, 創作 and 資料庫 again). 首頁 (`.bt-wide`): the player across the top (a 176 cover, the song, ⋯ ▶ ⏭ beside it, its parts the whole width), 接下來 and 今日精選 as an even grid of covers (`songTileOf`/`songGridOf`, the kit's `fullRows`), 電台 beside 類型 each station its own cover (`.bt-stiles`, 全部類型 at the genres' head), 最近播放 beside 你的歌 (`.bt-pair`), 自己做 as four tiles (`wayTilesOf`). 創作 (`.cr-wide`): 即興 across the top with its six sets as cover pills beside it, 樂器 · 做歌 · 節奏遊戲 as tiles, 你的歌 as covers (or 從這裡開始 as tiles). 資料庫: its rows stay on the left and 清單, 歌曲 or a list opens beside them, the row lit (`put()` in `lib/library.mjs`, `.lib-split`). 即興: the pads (`.jam-stage`) fill the left, the set and its controls beside them. 樂器: the grid the page's width, steps bigger; 進階's settings beside it. 做歌: the pieces beside the settings, then the songs beside both. Now Playing's cover beside its controls when wider than tall. The block at the end of `index.html`'s style and `look.css`.
- **Orbit's own look** (2026-11-03, Orbit-Core DESIGN §11; `<html data-look="native">`, `public/look.css` after the page's style):
  **首頁 is the player** (`mountHome` in `lib/homeview.mjs`): a graphite card with the cover, what's
  playing and from which station (or today's first pick, ready), ▶ in the app's colour, ⏭ and ⋯,
  and the song's parts as one line (each as long as it plays, on 做歌's section colours, faint
  till played, the one playing lit; a tap goes there: `sectionTimes`, a radio song's plan worked
  out from its seed as the radio makes it). While it's on screen the mini player steps aside
  (`bt-now-seen`). Then 接下來, 今日精選 (three, then the kit's 再看 bar), 電台 and 類型 as rows of
  taps (全部類型 opens the picker), 最近播放, 你的歌, 自己做 (即興, 做歌, 樂器, 節奏遊戲).
  創作 (`hubDraw` in `app.js`, its CSS in `look.css` `.cr-*`): one graphite 即興 card (the set on the pads: its cover small,
  its groove and speed, ▶ on the app's colour, the six other sets as an even 3 × 2 of taps, `jam.useSet`),
  then 樂器, 做歌 (how many pieces wait) and 節奏遊戲 as the kit's rows, each saying what it does, then
  你的歌 as song rows (`songRowOf`/`songListOf`, shared with 首頁) or 從這裡開始 as rows. Now Playing is the page's
  own dark (no blur of the cover), its bar and ▶ on the app's colour.
- **Tabs:**
  - **聽** (Listen, the first screen; `lib/radio.mjs`, `lib/radioview.mjs`):
    one play button and the moods (隨機, 放鬆, 熱血, 律動, 經典, or one groove).
    Each song is its own band on the app's instruments: a groove of the mood
    (never the one just played), its tempo, a key, four chords, chords,
    melodies, an arpeggio, bass lines, hats and drums, written as phrases (eight
    bars: a question and its answer; the second verse, the second hook and the
    lifted last hook are variants of their tunes, the bridge has chords and a
    lead of its own; every note has its own level and timing), arranged by the
    engine in sections of four or eight bars (a song runs about 2:30, a fifth
    are short forms) and mixed.
    The worker makes them two ahead, each whole with its cut (just before its last
    hit) and its ring: where one song runs into the next, the tape plays that hit's
    ring under the next one's intro (`tapeFeed`); a tap or ⏭ crossfades over 0.15 s,
    and with nothing made yet the song playing hushes at once (`hushNow`) while the
    next is made; file by file, each file ends 1.5 s into its ring. One `<audio>` (it
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
    (變奏一首, 換個鼓, 編排 (sections in order by their grips, kit `reorder`), 分享, 下載 WAV, 存成檔案, 分軌 stems, MIDI). A song
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
    so every tap lands on a sound; a long chord is a hold. Every chart is
    playable with two thumbs (left on lanes 1-2, right on 3-4): at most one
    note per thumb at a time, nothing for a thumb while it holds, a level's
    least gap between one thumb's notes and most notes a second
    (`tests/playable.test.mjs` checks 16 songs). Four lanes, four
    levels (簡單 普通 困難 專家), judged 完美 ±45 ms, 很好 ±90, 不錯 ±135,
    scored to 1,000,000 (S+ to D); 火力全開 from 50 combo. A full-screen
    canvas stage on the page's AudioContext clock; 時間校正 in the pause menu
    for Bluetooth lag. Opens from 創作's card (今日挑戰 and a mood's six songs
    of the day) or a song's ⋯; `#game`. Bests per song and level on this
    phone (`orbit-beats-game.v1`); `orbit-beats-game-auto` = `1` plays every
    note itself (screenshots: `shot` plays it without the frame count).
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
- **Pieces in:** one recording, a sample pack (many files), or the
  microphone, in any mix. Each is split on its silences first; then every
  stretch longer than 3 s with no silence in it (a song, a jam, a drum take)
  is cut by its beat (`lib/rhythm.mjs`, heard in a worker as the file loads,
  `maker.cuts`; `lib/sources.mjs` `planAll` keeps the plan by the stretch):
  - **The beat** (librosa's methods, ISC, ported): a log-mel SuperFlux onset
    strength (64 bands, a max filter of 3, about 86 frames a second), the low
    end weighed in at half (`PULSE_LOW`) so a syncopated layer can't pull the
    beat; the tempo from the onset curve's autocorrelation (8.9 s Hann windows)
    under a log-normal prior at 120 BPM, an octave wide; the beats by Ellis's
    dynamic programming (2007, tightness 100), then moved onto the metre
    (`onTheBeat`: the shift of up to half a beat where beats, eighths and
    sixteenths land best).
  - **The bar** (Goto; Davies & Plumbley): which beat of four is the one, from
    the kick and low end on it and where the harmony (chroma) changes.
  - **The patterns:** each bar as a picture (16 steps of low, high and all
    hits, and its chroma); how many bars a pattern takes (1, 2, 4 or 8) where
    the bars repeat best (Foote's self-similarity); the song in runs of that
    length, runs alike (cosine 0.97) kept once, the most typical take of each,
    at most 12. A piece is whole bars to the sample, starting on the downbeat's
    hit (20 ms either way, 6 ms before it), its edges eased 2 ms.
  - **No steady beat** (a loose take, a spoken line): cut at each hit that
    stands apart (the sound fallen under 30% before the next, at least 0.6 s);
    else the stretch stays whole, as does a loop of up to four bars.
  - Measured (`node scripts/beat-eval.mjs 24`, the radio's own songs with
    no silences, 2026-11-10): tempo right 71% (old 67%), right or an octave off
    96% (old 79%), 96% cut into bars (old: none, one piece a song), beat
    F-measure 0.62, about 0.36 s to hear a minute of music. `tests/rhythm.test.mjs`.
  - Not used: essentia.js (AGPL, megabytes of WASM), madmom (its models are
    non-commercial); aubio's and BeatRoot's ideas are covered by the above.
- **Tempo:** every tempo from 70–190 BPM is scored by how well the hits
  sit on 16ths; ½ and ×2 fix the usual off-by-a-ratio misses. A kit cut by
  its beat takes the beat's tempo (`beatTempo`).
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
- **Grooves (49, `STYLES` in `engine.mjs`, mirrored in `passion_beats.py`):**
  the first twenty are the drum styles (four-on-floor, hip-hop, trap, house,
  drill, lo-fi, techno…); the rest are the genres (jazz swing, bossa nova,
  salsa, rock, city pop, K-pop, synthwave, chiptune, dubstep, trance, blues,
  country…). Each has a Chinese and an English name (`lib/names.mjs`) and a
  cover.
- **Mix** (on by default, 更多設定): buses for drums, hats, bass and melody;
  the drums and bass glued (2:1) and kept off the sub, the melody brightened
  and set wide (its middle stays put, so a mono speaker hears it as it was),
  echo and an 8-line room (snare and hats sent to it, kick and bass not),
  sidechain pump, sweeps into hooks; then the song brought to one RMS
  (-15 dBFS), a soft saturation and a limiter at -1 dBFS; stems add up to the
  mix. Off, the pieces play exactly as recorded. `passion_beats.py` does the
  same steps, and `tests/mixparity.test.mjs` feeds both one input.
- **Making** runs in a worker (`lib/maker.mjs`), so the page never stalls.
- **Smooth while playing** (Jay 2026-11-10: lag and stuck scrolling as music
  plays): nothing that size runs on the page's thread while a song plays.
  聽's next songs come from the worker as a Blob where they play file by file
  (`radio(spec, after, 'blob')`, no tens-of-megabytes copy on the page);
  資料庫's .m4a is encoded in `lib/packer.worker.mjs` (the PCM sent in
  pieces), else on the page with a breath every few blocks; the recorded
  instruments go to the workers in slices (`copyBank`); 最近播放's sound is
  converted in slices and pruned by an index (`heard.mjs`, IndexedDB v2,
  `age`); the clock text changes its text node only (`tickText`), so the
  kit's place-keeping isn't woken four times a second.
- **Out of sight** (Jay 2026-11-10: the music stopped in the background while
  he used the other Orbit apps and swiped them off). The Orbit apps on a phone
  share one WebKit underneath (one app's BroadcastChannel reaches the others,
  2026-10-21), so most likely one audio session: in WebKit a sound that can't
  mix interrupts the other pages' (`RemoteAudioSessionProxyManager`), and
  nothing tells the interrupted page when that sound is over (WebKit lets a
  session go without notifying others). A page whose music stopped is frozen
  about ten seconds later (`audibleActivityClearDelay`), and iOS closes the
  heaviest background pages when the app in front wants memory.
  So: the app's sound is music (`navigator.audioSession.type = 'playback'`,
  `soundAs` in `app.js`) from its first sound (every sound starts through
  `quiet()`), never as it opens, and `'auto'` while the microphone records:
  WebKit keeps a session the page named between songs. Out of sight, 聽 keeps one
  song ahead (two on screen) and the workers let go of their recorded
  instruments and the notes made from them (`letGo` in `lib/maker.mjs` and
  `lib/make.mjs`, in line with the calls; 聽's after each song, the others at
  once if idle; the radio's last rings stay): 聽's worker drops from 170 MB
  to under 10 MB between songs. **Beats yields** (Jay 2026-11-11: it fought
  Orbit Law's live video): another sound taking the phone (a pause Beats
  didn't make, the audio session or the AudioContext `interrupted`) is ⏸ for
  聽 (`yieldTo` in `lib/radioview.mjs`), leaves a song paused, and stops
  樂器, 即興 and the pads (`yieldSound` in `app.js`). Nothing starts the sound
  again by itself, not a timer, the screen coming back or the session
  ending: only a tap (`tests/background.test.mjs`). The
  除錯紀錄 notes `beats-yielded` (what took the sound, out of sight how
  long, the way it played, the session's state) and `beats-gone` (music was
  playing when the page went: `orbit-beats-alive`, written every 15 s while
  something plays).
- **Saved:**
  - On the phone: the last kit's sound and the kept songs.
  - On the Pass (app `beats`, `{ v: 1, settings, kits, taste, songs, lists }`): settings
    (簡單 / 進階 and what 聽 plays among them),
    and each kit's tempo and hand-set roles, keyed by a fingerprint of its
    sound. The newest 40 kits.
  - **資料庫 on every phone** (`lib/songsync.mjs`, Jay 2026-11-11): a kept song made on the
    app's own band (聽, 簡單's batches, a remix of one, a take on 即興's built-in set) goes up
    as its recipe alone (seed, groove, the remix's choices; its name, tempo, length, key and
    sections for the row: about 300 bytes, never the sound), the newest that fit 150 KB; 清單
    too. Another phone lists it at once with no sound (`sound: null`) and makes it from the
    recipe when first played or exported (`soundFor`, said after 0.4 s) or behind everything
    else (`fillSounds`), packed and kept as if kept there. Taken out, renamed or a list changed
    on one phone: the same on the others (each entry the later change; a gone mark 120 days).
    A song of your own pieces stays on its phone (their sound never leaves it). Written through
    the kit's `passSync`: the Pass's copy read and merged before every write, so two phones
    never drop each other's songs.
- **Offline:** works fully (`sw.js` keeps every file).

## Decisions in force

- 聽 plays on one `<audio>` only: iOS keeps one playing with the screen
  locked, and two (one starting before the other ends) stopped the music.
- The mixer is on by default (the owner's call). With it off, pieces are
  never changed: no volume, panning, fades or effects, and overlaps that
  clip are left (32-bit float keeps them; the page shows the peak). The one
  exception: a piece cut out of a sound by its beat (not at a silence) has
  its two edges eased over 2 ms, or each cut would click.
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

## Sounds and the radio

- **Instruments (42, `lib/voices.mjs`), beyond the core voices:** piano, Rhodes, clavinet, vibes, marimba, kalimba, music box, glass bell, steel drum, harp, nylon guitar, banjo, guzheng, sitar, pizzicato, erhu, sax, flute, harmonica, accordion, choir, supersaw, chip, chip bass, 808 glide, upright bass, acid bass, Reese bass, distorted guitar, slap bass.
- **Drum lanes (32):** timbale, cajon, tabla, clave, tambourine, guiro, agogo, dhol; brush, rock kick and snare, hard kick, 8-bit kick, snare and hat, gong. Each has its own General MIDI note.
- **Next-song rule (`radioPick`):** no groove repeated within the last six (the mood's size less five in a small mood), a different family, a tempo jump of 15 BPM or a half/double feel, and a new key or mode, then new chords, lead and form. `tests/variety.test.mjs` checks 30 songs per mood.
- **Inside a song (`lib/radio.mjs`, `makeSong`'s `arrange` and `varied`):** the verse's chords are one loop and the hook's another (another family, another lead, a bass to suit); a second verse plays other riffs; the last hook (when there are two) is lifted one to five semitones, with its own riffs, bass and 808; the drums are dressed per section (ghost ticks, a pushed or skipped kick, open ticks, a snare snap, and how a phrase ends: five touches, a different one for verses, hooks, the last hook and the bridge). The forms vary (an eight-bar intro, four-bar verses, a pre-hook now and then, a hook shown early, a break or bridge between pairs, the last hook doubled or cut short). All drawn from streams of their own, so the jam set's band (`radioKit(sp, sr)`) is as it was. `passion_beats.py --varied` plays the same drum touches.
- **Last eight (`radioPick`, `MEMORY`):** besides the last song, the seed drawn is the one that repeats least of the last eight: chord loops (verse's and hook's, as families: a loop and its turns are one), keys, leads, chord instruments, forms, tempos and drum touches, what is near counting the most. `tests/variety2.test.mjs` checks it, and that sections differ.
- **Core voices (`lib/voices.mjs`, `lib/synth.mjs`):** keys, rhodes, piano, pad, strings, pluck, lead, bass and sub are band-limited (PolyBLEP saws and pulses, sines) through filters that move with the note; the kick has a beater click; hats and cymbals are band-passed noise under the 808's six squares. `voice(inst, midi, sr, hold, vel, variant)`: a harder hit (`vel`, from the clip's level) is brighter, and a note that comes again in a clip takes the other of two takes (`variant`: its own noise, phase and a few cents), so no repeat is bit for bit the last. `tests/voices-core.test.mjs` holds the numbers.
- **Recorded instruments (`lib/samples.mjs`, `lib/sampleload.mjs`, `public/samples/`):** the instruments that are real ones play recordings, not oscillators: 32 of them (piano, both electric pianos, clavinet, organ, vibes, marimba, kalimba, music box, celesta, tubular bells, steel drum, harp, nylon, clean and distorted guitar, banjo, koto for 古箏, sitar, strings, pizzicato, violin for 二胡, brass, alto sax, flute, harmonica, accordion, choir, oohs, finger, upright and slap bass) from the MusyngKite soundfont (CC BY-SA 3.0, `public/samples/mk/`, `node scripts/samples.mjs`), except strings (a real section: VSCO 2 CE's violins, violas and celli, CC0) and piano (Salamander Grand, CC BY 3.0), in `public/samples/v2/` (`node scripts/better-samples.mjs`; a new folder because `sw.js` keeps a sample's address forever), credited in the ? sheet; a note every major third, 3.2 s of each kept, and a held one (strings, organ, brass, winds, voices) longer than that loops its steady part (crossfaded) instead of stopping mid-chord. The drums are recorded kits by groove (`STYLE_KIT`): a real acoustic kit (Virtuosity Drums' middle mic; its lo-fi mic for lo-fi and boom bap), a real TR-808 (Michael Fischer) for trap, drill and hip-hop, an electronic kit (Sonic Pi) for house, techno and the rest, and recorded hand percussion everywhere, three hit strengths with two takes each, all CC0 (`node scripts/drums.mjs`, macOS). The page fetches only what a song plays, six files at a time with a tapped song's opening ahead of the songs made ahead (all at once, a hundred notes choked a slow link), decodes it once (32 kHz mono), and hands it to the workers before the song is made (`maker(url, { prep })`); `sw.js` keeps the files. With none in (offline the first time, the tests), the made voices play, each recording brought to the made voice's loudness so the mix holds. Synths, 8-bit, the 808 bass and pads stay made. `node scripts/listen.mjs [n] [dir] [--style=a,b] [--made]` writes songs to WAV both ways (afconvert on macOS, else ffmpeg).
- **Each kind of music its own (V19, Jay 2026-10-30: "every song a rising sound, then a random string of notes, then drums; super high"):** a song opens its groove's way (`sp.open`, `OPENS` in `lib/radio.mjs`): `beat` (rap, club, latin, afro, funk: the band from bar one), `hats` (the chords over the hats), `band` (rock, country: the riff with the drums), `keys` (jazz, ballad, soul: the chords alone) or `arp` (trance, retro, calm: the arpeggio over a pad); the engine's intro plays the drums only for an arranged song's `introDrums`, so `passion_beats.py` is as it was. No tune, chord or arpeggio over C6 (`underCeil`: a part over it comes down an octave whole; bells, celesta, music box, kalimba, flute and the synth lead sit an octave lower). The riser into a hook only in club, breaks, retro, pop and trap; no vibes an octave over the last hook; no pad under the struck chords of band grooves (`BEDLESS`); humming voices in the second verse only for soul, pop and the calm ones; the arpeggio from the groove's own instruments (no bell or pluck added to every groove). Measured on 30 songs: notes at or over C6 7% → 0%, bells' middle note C7 → C#5.
- **Real instruments first (V19, Jay 2026-10-30: "they love high instruments; every one has the same chance, so all sound electronic"):** a groove's instruments are no longer drawn evenly (`sound()` in `lib/radio.mjs`): its first-listed three times as often, its second twice, and a chime or synth (bell, celesta, music box, kalimba, pluck, synth lead, supersaw, chip, steel drum) that isn't its first, and the synth pad always, a quarter as often (half in club, retro, breaks and trap). A synth pad bed only under club, retro and breaks grooves and half of trap's; the rest the string section. House, four, afro, amapiano, K-pop, dembow, DnB, broken beat and hip-hop list a piano, guitar, keys or voice first. 隨機 and 今日精選 draw a club, retro, breaks or trap groove half as often as a band's. Measured: the main tune on a chime or synth 41% → 28% of songs, a synth pad bed 47% → 19%, electronic grooves in 今日精選 38% → 30%.
- **Each genre its own grammar (V19, `GRAMMAR` in `lib/radio.mjs`):** the first twenty grooves had no chord loops, tune scale, rhythms or minor/major lean of their own and fell back on the generic ones; each now has its music's (hip-hop's two-chord minor loops and laid-back rhythms, lo-fi's ii–V–I with sevenths and ninths, house's off-beat piano chords, afro's major loops and rhythms, funk's one-chord vamps on the blues scale, trap's dark loops and rolling rhythms…), and the tunes keep to the pentatonic (or blues) in thirty grooves whose music does. K-pop is pop: the pop loops, a pentatonic tune on sung rhythms, plain triads, piano and voice first, no bed (`bare`).
- **Musical, not just in key (V20, Jay 2026-11-10: "hurts my ear… not even musical"):** measured, 18% of held tune and arpeggio notes ground a half step against the chord under them, the tune sat inside the chords' range half the time, and 12% of a tune's bars echoed an earlier one. In `lib/radio.mjs`: every tune, harmony and arpeggio note is heard over the chord under it (`heardPcs`: the voicing and the bass root); `tuned` never moves a note onto a half step over a chord tone, and `overChord` moves a held or on-the-beat one that grinds to the nearest tone that doesn't; a seventh chord drops the note a half step under another (its root under a major seventh: `voicing`); chords sit three semitones lower and a lead's range starts at D4 (`rangeOf`), so the tune is over its chords; arpeggios stay under E4 (`ARP_TOP`); the pad bed turns with the chords. A tune (`tune()`) has a form (`FORMS`: a sentence or a period): a motif, the motif again on the next chord (`seqOf`, a sequence), a dip early (the first B), a high point late (bar 7), and closes on the third or fifth (the question) and the root (the answer); a variant's sequences turn their tails. A song that goes up a key for its last hook keeps that key through its outro (`parts.outroLifted`, `engine.mjs endKit`: the lifted 808). Measured (`RADIO_V` 20): grinding notes 17.5% → 0.7% (whole songs 11% → 2.7%), the tune under the chords' top 52% → 25%, bars echoing the motif 12% → 42%. Before/after recordings: `/mnt/project-files/apps/beats/radio-ab-2026-11-10/`.
- **A song of its own, played smoothly (V21, Jay 2026-11-10: "same genre sounds the same", "a crash when I click 今日精選", "next keeps playing the current song then jumps"):** measured on ten songs a groove, two songs shared 45% of their tune's bar rhythms and 37% of their chord loops. Now each song grows its own loops from how chords move in its music (`NEXT`, `growLoop`, `ownLoops`: `progV` the verse's, played by `songKit` in place of `prog`, which a jam set keeps; `VAMPS` grooves a one- or two-chord vamp of their own; blues, Chinese, country and ambient keep theirs), its own six bar rhythms grown from its groove's (`songCells`), and its own hook harmony (instrument, a third, sixth or octave under; who hums the second verse). Shared: rhythms 45% → 9%, loops 37% → 16%. The last hit's ring was mixed into whichever song was made next (`make.mjs` `tails`), so a song tapped or skipped to began on the last one's crash: the ring now stays with its song (`ring`) and the tape plays it only where one song runs into the next. Each song also fills out its first verse its own way (full, thin, or led by its arpeggio) and its first hook (plain, doubled an octave under, or answered by a harmony) (`verseTex`, `hookTex`). Everything laid on the tape passes a master limiter (`tapeFeed` `limit`: -1 dBFS, back up over 0.1 s), and the tape keeps 20 s ahead (`AHEAD`; on a 4× slower processor it never fell under 11.7 s).
- **Easy on the ears (V18, `eased` in `lib/radio.mjs`):** long listening tired the owner, so every radio song (and its opening) gets a gentle shelf down over 7 kHz and a dip at 3.2 kHz as deep as the song is sharp (its 2–5 kHz brought to about -10 dB under its 200 Hz–2 kHz); the master sits 2 dB lower (-15 dBFS RMS) so it squashes less; the hats a little softer, the bright tones milder; no choir under a song or its bridge (pad or strings), no celesta over the last hook (soft vibes), no harmonic minor drawn for a groove that doesn't own it; a repeated note's second take 2 cents off, not 4. Measured on 16 grooves: -10.3 → about -12.7 LUFS, 1.7 dB more punch room (crest), 2–5 kHz bite -3 dB or more, the songs within 0.8 LU of each other.
- **Loudness:** `node scripts/loudness.mjs [seed] [style,...]` renders 8 s of each groove's radio song and prints RMS and peak (nothing is written); a per-groove `mix` in `lib/radio.mjs` evens out the outliers.

## Files (`public/`)

| File | What |
| --- | --- |
| `app.js`, `index.html` | The page, tabs, player, library |
| `engine.mjs` | Song planning and rendering (port of the script) |
| `analyze.mjs` | Hearing tempo and roles |
| `lib/sources.mjs`, `lib/rhythm.mjs` | Files to one rate, split on silence, then by the beat; the beat, bars and patterns heard |
| `lib/kits.mjs` | Fingerprint, the Pass payload, the phone's kit and songs |
| `lib/songsync.mjs` | 資料庫's songs (as recipes) and 清單 on the Pass, merged with every phone's |
| `lib/synth.mjs`, `lib/studio.mjs` | Instruments and 自動編; the 樂器 tab |
| `lib/mix.mjs` | The mixer: buses, glue, width, room, the master (loudness, saturation, limiter), stems |
| `lib/make.mjs`, `lib/maker.mjs`, `lib/maker.worker.mjs` | Making songs in a worker |
| `lib/jam.mjs`, `lib/jamview.mjs` | 即興: timing, levels, choke; the pads |
| `lib/library.mjs`, `lib/lists.mjs` | 資料庫: search, order, zip; playlists |
| `lib/sections.mjs` | 做歌: section times and the playing section |
| `lib/radio.mjs`, `lib/radioview.mjs` | 聽: songs out of nothing, the join between them; its screen and player |
| `lib/cover.mjs`, `lib/listen.mjs` | 聽's covers; its sleep timer, recently played and the taste from listening (`tasteFrom`) |
| `lib/tape.mjs` | 聽's one stream: FLAC frames, or AAC / Opus from AudioEncoder, in MP4 for Media Source; which way a phone plays; the songs in order (the hook again while waiting) |
| `lib/easy.mjs`, `lib/help.mjs` | 簡單 / 進階 and 簡單's fixed settings; the music words and their examples |
| `lib/pack.mjs`, `lib/packer.worker.mjs` | 資料庫's songs kept small: the .m4a (encoded in a worker of its own, else on the page between frames), packing, 資料庫瘦身's rule, telling a song made again from another |
| `lib/project.mjs` | 存成檔案 / 打開檔案: a song's settings (no sound) as a versioned `.orbitbeats.json` |
| `lib/midi.mjs`, `lib/tap.mjs`, `lib/download.mjs`, `lib/names.mjs` | MIDI files, tap tempo, saving, names |
| `lib/samples.mjs`, `lib/sampleload.mjs`, `lib/voices.mjs` | Recorded instruments and drum kits: which notes, fetched and decoded; the added voices |
| `lib/game.mjs`, `lib/gameview.mjs` | 節奏遊戲: a song's chart, the stage |
| `lib/homeview.mjs`, `lib/stations.mjs`, `lib/genres.mjs` | 首頁 (the player and its rows) and the covers and shelves 資料庫 shares; stations as filters on the radio; the genre picker |
| `lib/say.mjs` | 用說的做節奏 (the family's AI, Jay 11-10; code first): the bar over 電台 (`homeview.mjs` `sayBar`) reads your words into a station (`readVibe`: grooves by name, a scene, how fast; `vibeStation` → `say:<grooves>@<lo>-<hi>`, `stations.mjs` `sayOf`); only words code finds no groove in go to the AI door (`beats-say`: the words only, never a sound; it answers grooves and a tempo) |
| `lib/heard.mjs`, `lib/queue.mjs`, `lib/player.mjs`, `lib/playerview.mjs` | 最近播放's kept sound; the play queue; the one player; the mini bar and Now Playing |
| `lib/remix.mjs`, `lib/remixview.mjs`, `lib/kitops.mjs`, `lib/jamset.mjs` | 重新混音 and 取出片段; kits taken apart and kept by name; 即興's built-in set |
| `lib/icons.mjs`, `lib/ui.mjs`, `lib/length.mjs`, `lib/lang.mjs` | Icons; the kit's UI with this app's changes; song length in words; language |

## Run and test

```bash
npm test
```

```bash
node ../Orbit-Core/tools/preview.mjs beats --width 375
```

The script:

```bash
python3 passion_beats.py all_beats.wav --count 20 --out songs/
```

Its flags: `--bpm`, `--roles 3=riff,12=off`, `--styles`, `--humanize`,
`--seed`, `--min-bars` / `--max-bars`, `--silence-db -60`,
`--save-pieces`, `--raw` (no mix), `--levels`, `--reverb`, `--delay`,
`--pump`, `--width`, `--fade`, `--no-sweep`, `--stems`, `--plan`. A push to `main` tests and deploys to Cloudflare.

## The create shell (app.js)

- **創作**: the 即興 card (▶ starts the set on the pads; the six other sets, each a band: a tap opens 即興 on it and starts it, `jam.useSet`), the rows for 樂器, 做歌 and 節奏遊戲, then 你的歌 (or 從這裡開始, up to three one-tap ways in, before there are songs).
- **樂器, 即興, 做歌** put their chevron and name in the account's own line (`#subnav` in the app bar). While 樂器 or 即興 plays, the mini player steps aside (`body.own-sound`).
- A **song row** is one button (cover and name play it); ♡ and ⋯ stand beside it. The section strip is 做歌's only. The ⋯ menu leads with the song (cover, title) over a dimmed page: 插播, 稍後播放 · 加到清單, 分享 · 重新混音, 取出片段, 變奏一首 · 下載 · 重新命名 · 從資料庫移除 (red, last).
- **簡單 做歌**: the built-in band (its cover, ringed) beside ＋, four 情境 cards (放鬆 熱血 律動 經典; a tap picks, again lets go; `makeWith` in `lib/easy.mjs`) and the length. 做 N 首歌 shows a spinner only while it works, and the list below is the progress: a shimmering place per song, filled as each lands.

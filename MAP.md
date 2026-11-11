# Orbit Beats: the map

Music that never stops (聽: songs made from nothing on the app's own
instruments), and your own beat pieces arranged into new songs. Everything
runs on the phone; no sound is uploaded. Signs in with the Orbit Pass.
`passion_beats.py` is the same engine on the command line.
Live: https://orbit.jaypengx.com/beats/

## Rules

Jay's, dated (Taiwan day), newest wins; the family's are in Orbit-Core `docs/RULEBOOK.md`.

- 10-18 No music training; the full mixer is on by default. With it off, pieces play exactly as recorded (no volume, panning, fades or effects; clipping overlaps left, 32-bit float); the one exception: a piece cut by its beat (not at a silence) has its edges eased 2 ms.
- 10-21 Songs must sound clearly different. 11-10 (V21) Each song grows its own chord loops, bar rhythms and hook harmony (`growLoop`, `songCells`); a song's last ring stays with its song.
- 10-23 Easy listening: keep `eased()` (a shelf over 7 kHz, a dip at 3.2 kHz as deep as the song is sharp) and the quieter master (-15 dBFS RMS); no choir beds or glassy doublings.
- 10-30 (V19) Each kind of music its own: a song opens its groove's way (`OPENS`); nothing over C6 (`underCeil`); real instruments first (a groove's first-listed three times as often, chimes and synths a quarter); each genre its own grammar (`GRAMMAR`).
- 11-10 (V20) Musical, not just in key: no held or on-beat note grinds a half step against its chord (`heardPcs`, `tuned`, `overChord`); the tune over its chords; a tune has a form (a motif, its sequence, a high point late, question and answer: `tune()`, `FORMS`).
- 11-10 Smooth while playing: nothing big runs on the page's thread while a song plays (songs as Blobs from the worker, packing in `lib/packer.worker.mjs`, instruments sent in slices, `tickText`).
- 11-11 Beats yields: another sound (Law's live video, any app, a call) stops it, and it never starts again by itself (no retry, no resume on return or when the session frees); only a tap (`yieldTo`, `yieldSound`; `tests/background.test.mjs`). Same for any Orbit app's sound.
- 11-11 資料庫 on every phone: a kept song made on the app's own band goes up as its recipe alone (about 300 bytes, never the sound) and is made again on another phone when first played (`lib/songsync.mjs`, through the kit's `passSync`); a song of your own pieces never leaves its phone.
- No sound ever leaves the phone; the Pass keeps only settings, kits' tempos and roles, taste, recipes and lists.
- Nothing goes silent by accident: every second of a song sounds (no quarter second of a radio song under -45 dBFS; tests listen to twenty back to back); a stalled worker hands its work to the page after 90 s; instruments play as music (the silent switch doesn't mute them) and start again after a call.
- 聽 plays on one `<audio>` only: iOS keeps one playing with the screen locked; two stopped the music.
- Keep `noted()` hooks in `radio.mjs`; never a `.loading` class outside `#loading`; home cards static (nothing animates forever). The guided first song is retired (聽 is the way in). Everyone opens 簡單 (`lib/easy.mjs`).
- `engine.mjs` is the port of `passion_beats.py`: a change to the songs goes into both (`tests/mixparity.test.mjs`).

## How it works

- **Tabs:** 首頁 (the player: cover, ▶, the song's parts as one line; 接下來, 今日精選, 電台 and 類型, 最近播放, 你的歌, 自己做; `lib/homeview.mjs`) · 創作 (即興's card and sets, 樂器, 做歌, 節奏遊戲, 你的歌; `hubDraw` in `app.js`) · 資料庫 (kept songs in IndexedDB, 清單). 簡單 / 進階 (`lib/easy.mjs`): 簡單 has fixed settings of its own; controls only one mode shows carry `data-ctl`. Wide screens draw their own layouts (`isWide()`, `.bt-wide`, `.cr-wide`, `.lib-split`).
- **聽** (`lib/radio.mjs`, `radioview.mjs`): each song is its own band on the app's instruments in a groove of the mood, made by the worker two ahead (`lib/maker.mjs`), next picked by `radioPick` (no groove within the last six, the seed that repeats least of the last eight, `MEMORY`; `tests/variety*.test.mjs`). One endless stream where Media Source can take it (`lib/tape.mjs`: FLAC, AAC or Opus in MP4), else file by file; the way taken in `localStorage['orbit-beats-radio-path']` (shown by the 測試工具's 電台走哪條路). Covers from the seed (`lib/cover.mjs`); 睡眠定時; lock-screen controls.
- **Out of sight:** the Orbit apps share one WebKit and likely one audio session; Beats names its sound music (`navigator.audioSession.type = 'playback'`, `soundAs`) from its first sound, keeps one song ahead out of sight, and the workers let go of their instruments (`letGo`). The 除錯紀錄 notes `beats-yielded` and `beats-gone`.
- **Pieces in** (`lib/sources.mjs`, `lib/rhythm.mjs`): split on silences, then any long stretch cut by its beat (librosa's methods ported: SuperFlux onsets, tempo by autocorrelation, Ellis's beats, the bar, patterns by self-similarity; `node scripts/beat-eval.mjs 24`). Tempo, roles and key heard by `analyze.mjs`. Arrangement in the usual song form; 49 grooves (`STYLES` in `engine.mjs`, mirrored in the script; names in `lib/names.mjs`).
- **Mix** (`lib/mix.mjs`): buses, glue, width, room, sidechain, then one RMS, saturation and a -1 dBFS limiter; stems add up to the mix.
- **Instruments:** 42 voices (`lib/voices.mjs`, `lib/synth.mjs`), 32 recorded (`lib/samples.mjs`, `public/samples/`; MusyngKite CC BY-SA 3.0, VSCO 2 CE CC0, Salamander CC BY 3.0, drum kits CC0; credited in the ? sheet). New samples go in a new folder: `sw.js` keeps a sample's address forever. The page fetches only what a song plays and hands it to the workers.
- **樂器** (`lib/studio.mjs`), **即興** (`lib/jam.mjs`, `jamview.mjs`, the built-in set `lib/jamset.mjs`), **做歌** (sections `lib/sections.mjs`), **節奏遊戲** (`lib/game.mjs`: charts from the song's own notes, playable with two thumbs, `tests/playable.test.mjs`), **用說的做節奏** (`lib/say.mjs`, code first; only unread words to `beats-say`), **專注配樂** for Class's 專注飛行 (`lib/focus.mjs`).
- **Picks that learn:** the kit's `feedback.mjs` (`fb:beats`) from listening (`heardSong`, `lib/listen.mjs tasteFrom`); 今日精選 and 今日挑戰 the same on every device (Taiwan's date).
- **Saved:** on the phone the last kit's sound and kept songs (small .m4a, `lib/pack.mjs`); on the Pass (app `beats`, `{ v: 1, settings, kits, taste, songs, lists }`), kits keyed by a fingerprint of their sound, the newest 40. **Offline:** works fully.
- **Tools:** `node scripts/listen.mjs` (songs to WAV), `scripts/loudness.mjs` (RMS and peak per groove). Before/after recordings of sound changes go to the project's shared folder (`apps/beats/`).

## Files (`public/`)

| File | What |
| --- | --- |
| `app.js`, `index.html` | The page, tabs, player, library |
| `testing.mjs` | The app's switches in the kit's hidden 測試工具 (never saved or sent): flags `makeFail`, `instruments` (slow/fail), `storageFull`, `gameAuto` (no record kept), `radioPath`; actions 別的聲音接手 / 聲音被打斷 (the `orbit-beats-test` event) and 電台走哪條路 |
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
| `lib/focus.mjs` | 專注配樂 (the AI plan's family links): the radio's calm grooves (放鬆's lofi, ambient, bossa, neo-soul; 爵士's jazz) one after another, for Orbit Class's 專注飛行, which imports this file from this site on its tap (same origin, made on the phone in this app's worker with its recorded instruments; never Beats' page, library or Pass copy) |
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

## Run and test

```bash
npm test
node ../Orbit-Core/tools/preview.mjs beats --width 375
python3 passion_beats.py all_beats.wav --count 20 --out songs/   # --help for its flags
```


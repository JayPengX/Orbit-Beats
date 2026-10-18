# Orbit Beats

Arranges your own beat pieces into new songs, using each piece exactly as
recorded. Everything runs on the phone; no sound is uploaded. Signs in
with the Quadra Pass. `passion_beats.py` is the same engine on the command
line.

Live: https://jaypengx.github.io/Orbit-Beats/ (was Passion Beats)

## How it works

- **簡單 / 進階** (`lib/easy.mjs`): a new phone opens 簡單, which shows what
  making a song needs: 做歌 is the mood, how many and 做; 樂器 starts from a
  clip written for you with big 再編一次 and 加進片段 over the grid; 即興 is
  the pads and ● 錄一段. 進階 shows every tool below. The choice is a
  setting on the Pass; settings kept before it existed open 進階. It's in
  the ? sheet (top right) and in 更多設定. Each control only one of them
  shows carries `data-ctl`, hidden by one stylesheet rule per name.
- **The guided first song:** with no pieces and no songs, 做歌 opens on four
  steps: a mood, the demo's sounds or your own (record or files), one song
  made and played, then 變奏一首 or 換個鼓 and ♡ to keep it. Skip or finish
  and it's done (the setting `guided`); the ? sheet plays it again.
- **Words** (`lib/help.mjs`): 22 music words (BPM, swing, riff, hi-hat, 808,
  chords, key, sections, chain, stems, MIDI, velocity, choke, snap…) in
  everyday words, zh and en; a ⓘ beside a control opens one, eight with
  ▶ the same bar without it and with it. The ? sheet lists them all and
  opens the full guide (the kit's `help.mjs`, in the Quadra Pass sheet).
- **Tabs:**
  - **做歌** (Make): pieces in, a 情境 mood (放鬆, 熱血, 律動, 經典), the drum
    styles, how many songs, and 更多設定. Each song has a title, length,
    groove and key, ▶ in the player over the tab bar, ♡ to keep it, and ⋯
    (變奏一首, 換個鼓, 編排, 分享, 下載 WAV, 分軌 stems, MIDI). Under each song is its
    section strip (前奏 主歌 導歌 副歌 …, wide as they are long): tap one to play
    from its start, hold it to loop it (the player's § repeat); the one playing
    is lit and follows seeks (`lib/sections.mjs`).
  - **樂器** (Studio): clips on the app's own instruments (`lib/synth.mjs`,
    drums or melody) on a vertical 16th-note grid, 1, 2 or 4 bars, with
    accents, a long press for each hit's 力度 (輕, 中, 重), chords, swing,
    undo, ⧉ 複製, ♡ 收藏, tap tempo and MIDI out. Up to four 段落 (A–D) and a
    串接 of them (A A B A, up to 8) that plays, renders and exports in order.
    It loops as you tap; 自動編 writes a start; 加進片段 renders the chain into the kit.
  - **即興** (Jam): the kit as pads over a groove made of its own drums.
    Loops start on the next bar, one-shots snap to 1/16, 1/8, the beat or
    自由; ● 錄一段 turns a take into a song. A long press on a pad: its
    音量, 靜音 and 切音 (self, or group A/B: an open hat cut by a closed
    one), kept per kit (fingerprint) on the phone; a take's song carries
    each hit's level and cut, so it sounds as played.
  - **歌單** (Library): kept songs (IndexedDB, 16-bit WAV). Play, share,
    rename, delete, vary; search by name, groove or key, four orders, and
    a zip of what's shown. 清單 (playlists, localStorage): make, rename,
    delete, add a song from its ⋯, open one and play it in order; a song
    taken out of 歌單 leaves every list. 依你的口味 leans new batches toward
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
- **Mix** (on by default, 更多設定): buses for drums, hats, bass and melody,
  echo and room, sidechain pump, sweeps into hooks, a limiter at -1 dBFS;
  stems add up to the mix. Off, the pieces play exactly as recorded.
- **Making** runs in a worker (`lib/maker.mjs`), so the page never stalls.
- **Saved:**
  - On the phone: the last kit's sound and the kept songs.
  - On the Pass (app `beats`, `{ v: 1, settings, kits, taste }`): settings
    (簡單 / 進階 and whether the guide is done among them),
    and each kit's tempo and hand-set roles, keyed by a fingerprint of its
    sound. The newest 40 kits.
- **Offline:** works fully (`sw.js` keeps every file).

## Decisions in force

- The mixer is on by default (the owner's call). With it off, pieces are
  never changed: no volume, panning, fades or effects, and overlaps that
  clip are left (32-bit float keeps them; the page shows the peak).
- No sound ever leaves the phone.
- `engine.mjs` and `passion_beats.py` stay in step.

## Files (`public/`)

| File | What |
| --- | --- |
| `app.js`, `index.html` | The page, tabs, player, library |
| `engine.mjs` | Song planning and rendering (port of the script) |
| `analyze.mjs` | Hearing tempo and roles |
| `lib/sources.mjs` | Files to one rate, split on silence |
| `lib/kits.mjs` | Fingerprint, the Pass payload, the phone's kit and songs |
| `lib/synth.mjs`, `lib/studio.mjs` | Instruments and 自動編; the 樂器 tab |
| `lib/mix.mjs` | The mixer, stems, limiter |
| `lib/make.mjs`, `lib/maker.mjs`, `lib/maker.worker.mjs` | Making songs in a worker |
| `lib/jam.mjs`, `lib/jamview.mjs` | 即興: timing, levels, choke; the pads |
| `lib/library.mjs`, `lib/lists.mjs` | 歌單: search, order, zip; playlists |
| `lib/jam.mjs`, `lib/jamview.mjs` | 即興: timing; the pads |
| `lib/library.mjs` | 歌單: search, order, zip |
| `lib/sections.mjs` | 做歌: section times and the playing section |
| `lib/easy.mjs`, `lib/help.mjs` | 簡單 / 進階 and the guided first song; the music words and their examples |
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

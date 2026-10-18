# Orbit Beats

Arranges your own beat pieces into new songs, using each piece exactly as
recorded. Everything runs on the phone; no sound is uploaded. Signs in
with the Quadra Pass. `passion_beats.py` is the same engine on the command
line.

Live: https://jaypengx.github.io/Orbit-Beats/ (was Passion Beats)

## How it works

- **Tabs:**
  - **做歌** (Make): pieces in, a 情境 mood (放鬆, 熱血, 律動, 經典), the drum
    styles, how many songs, and 更多設定. Each song has a title, length,
    groove and key, ▶ in the player over the tab bar, ♡ to keep it, and ⋯
    (變奏一首, 換個鼓, 分享, 下載 WAV).
  - **樂器** (Studio): clips on the app's own instruments (`lib/synth.mjs`,
    drums or melody) on a vertical 16th-note grid. It loops as you tap;
    自動編 writes a start; 加進片段 renders it into the kit.
  - **歌單** (Library): kept songs (IndexedDB, 16-bit WAV). Play, share,
    rename, delete, vary. 依你的口味 leans new batches toward the styles you
    keep.
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
  pairs → bridge or break → last hook → outro. The same riff set per
  section type, energy building to the last hook, fills at phrase ends,
  and a clean ending.
- **Drum styles:** four-on-floor, hip-hop, trap, half-time, broken, house,
  dembow, afrobeats, drill, boom bap, Jersey club, amapiano.
- **Saved:**
  - On the phone: the last kit's sound and the kept songs.
  - On the Pass (app `beats`, `{ v: 1, settings, kits, taste }`): settings,
    and each kit's tempo and hand-set roles, keyed by a fingerprint of its
    sound. The newest 40 kits.
- **Offline:** works fully (`sw.js` keeps every file).

## Decisions in force

- Pieces are never changed: no volume, panning, fades or effects. Overlaps
  that clip are left (32-bit float keeps them; the page shows the peak).
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
`--save-pieces`. A push to `main` tests and deploys to Pages.

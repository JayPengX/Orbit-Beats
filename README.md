# Passion Beats

Turns one recording of beat pieces (separated by silence) into new,
humanized songs.

**https://jaypengx.github.io/Passion-Beats/**: the page. Choose a recording
(or try the demo), set things, make songs, play them and download them one
by one or all in a zip. It all runs in the browser: nothing is uploaded.

`passion_beats.py` is the same thing on the command line.

## The recording

- 24 pieces in the order below, with silence (0.2 s or more) between them.
- Recorded at 125 BPM.
- WAV is best (any PCM or float WAV). On the page, anything the browser can
  play (m4a, mp3, …) works too; it's decoded at 48 kHz.
- Phone audio isn't digitally silent between pieces: if the count is off,
  raise **Silence below** (say to -60 dB) under **Splitting** on the page, or
  `--silence-db -60` in the script.

| Pieces | Role |
|---|---|
| 1–4 | Short phrases (2, 2, 4, 2 beats) |
| 5 | Shaker loop (2 beats) |
| 6 | Fill (4 beats) |
| 7–9 | Hat loops (8, 4, 4 beats) |
| 10, 22 | Kicks |
| 11 | Tick |
| 12 | Snare |
| 13–18, 21 | Riffs (4 beats) |
| 19, 20 | Bass (4 beats) |
| 23 | Roll |
| 24 | 808 |

The roles are set for the original "Passion" recording: `PERIOD`,
`RIFFSETS` and `HATS` at the top of `public/engine.mjs` (and `period`,
`RIFFSETS`, `HATS` in the script), with drums, fills and bass using piece
numbers in their code.

## Settings

| Page | Script | |
|---|---|---|
| Songs | `--count` | How many (page: up to 30; default 20) |
| Length | `--min-bars` / `--max-bars` | Bars of 4 beats, 8 or more (default 25–29: 100–116 beats, 48–56 s) |
| Drums | | The drum styles songs pick from: four-on-floor, hip-hop, trap, half-time, broken |
| Humanize | | Swing and timing drift, 0–200% |
| Seed | `--seed` | The same seed makes the same songs (the page and the script have different random numbers, so not the same songs as each other) |
| Format | | 16-bit or 32-bit float WAV (the script writes 32-bit float) |
| Splitting | `--silence-db` / `--min-gap` | What counts as silence, and the shortest gap between pieces (default -90 dB, 0.2 s) |
| | `--save-pieces folder/` | Also save the split pieces |
| | `--out folder/` | Where songs go (default `songs/`) |

Songs are named `Passion_HH-MM` with a random time, stereo, at the
recording's sample rate.

## How it works

1. Cuts the recording into pieces at each run of silence.
2. Plans a song: intro, then verses, hooks, breaks and bridges of irregular
   lengths, then an outro, to a random length in the range.
3. Places the pieces on a 125 BPM grid with small timing drift, swing,
   volume variation, panning, ghost notes, fills and the odd drop-out so it
   feels less robotic; fades out over the last two bars and saturates
   gently to a steady loudness.

## The script

    python3 -m pip install --user numpy scipy
    python3 passion_beats.py all_beats.wav --count 20 --out songs/

## Development

- `public/`: the page (`index.html`, `app.js`, and `engine.mjs`, the port
  of the script, with no DOM so it's testable).
- `npm test`: the engine's tests (Node 22).
- Every push to `main` runs the tests and deploys `public/` to Pages
  (`.github/workflows/pages.yml`).

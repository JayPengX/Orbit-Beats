# Passion Beats

Arranges one recording of beat pieces (separated by silence) into new
songs, using the pieces exactly as recorded.

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
| Length | `--min-bars` / `--max-bars` | Bars of 4 beats, 8 or more (default 25–29, so songs of 26 or 28 bars, about 51–55 s) |
| Drums | `--styles` | The drum styles songs pick from: four-on-floor, hip-hop, trap, half-time, broken |
| Humanize | `--humanize` | Swing and timing drift, 0–200% (0 is a strict grid) |
| Seed | `--seed` | The same seed makes the same songs (the page and the script have different random numbers, so not the same songs as each other) |
| Format | | 32-bit float or 16-bit WAV (the script writes 32-bit float) |
| Splitting | `--silence-db` / `--min-gap` | What counts as silence, and the shortest gap between pieces (default -90 dB, 0.2 s) |
| | `--save-pieces folder/` | Also save the split pieces |
| | `--out folder/` | Where songs go (default `songs/`) |

Songs are named for when they're made, `Passion DD-MM-YYYY HH-MM`: the
first gets the current date and time, each next one a minute later (the
script skips names already in the folder). Stereo, at the recording's
sample rate.

## How it works

1. Cuts the recording into pieces at each run of silence.
2. Plans the song (below), to an even number of bars in the Length range
   (an odd one only if that's all the range allows).
3. Places the pieces on the 125 BPM grid and adds them up.

**The pieces are used exactly as recorded:** no volume changes, panning,
fades, cutting or effects, and no fade-out at the end. Pieces may overlap
(a loop that runs past its section plays on into the next). Where
overlaps add up past full scale they're left that way: a 32-bit float WAV
keeps them exactly, a 16-bit WAV clips them, and the page shows by how much
(`peaks +5.3 dB`). Humanize only moves when a piece starts.

**The arrangement follows the usual rules of song form:**

- **Phrases come in fours.** Verses and hooks are 4 or 8 bars, breaks and
  bridges 2 or 4, intros and outros 2 or 4.
- **Form.** Intro, then verse–hook pairs (one to four), maybe a break
  first, maybe a break or bridge before a last hook, then the outro. A hook
  always follows a verse, and the song peaks on its last hook.
- **Repetition.** Every verse uses the same riff set, groove and hat; so
  does every hook. The outro brings back the intro's riff.
- **Contrast.** The bridge uses a different riff set and half-time drums;
  a break drops the drums and bass. A hook may lift to a related groove
  (four-on-floor ↔ broken, hip-hop ↔ trap), never a foreign one.
- **Energy builds.** The first verse's bass comes in halfway; the last
  hook adds the extra riff layer.
- **Variation at phrase ends.** A riff only lays out on the last bar of a
  4-bar phrase, and an 8-bar section may get a small turnaround fill at
  its middle.
- **Transitions fit where they lead.** A build into a hook (sometimes a
  stop bar, where everything lays out but the fill), something light into
  a verse, next to nothing into a break or bridge.
- **A clean ending.** A fill on the last bar, then one last hit on the
  next downbeat, left to ring out.

## The script

    python3 -m pip install --user numpy scipy
    python3 passion_beats.py all_beats.wav --count 20 --out songs/

## Development

- `public/`: the page (`index.html`, `app.js`, and `engine.mjs`, the port
  of the script, with no DOM so it's testable).
- `npm test`: the engine's tests (Node 22).
- Every push to `main` runs the tests and deploys `public/` to Pages
  (`.github/workflows/pages.yml`).

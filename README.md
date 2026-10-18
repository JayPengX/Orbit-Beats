# Orbit Beats

Orbit Beats (was Passion Beats; the repo keeps its name, so its address
stays) arranges beat pieces into new songs, using the pieces exactly as
recorded. An Orbit app on the Quadra Pass and the family's kit
(`Shared-Proxy/kit/`): Chinese first, English for readers who pick it.

**https://jaypengx.github.io/Orbit-Beats/**: the page. Put pieces in,
check the tempo and roles it hears, set things, make songs, play them and
download them one by one or all in a zip. It all runs on the phone:
nothing is uploaded.

`passion_beats.py` is the same thing on the command line.

## The pieces

Three ways in, and any mix of them (**再加檔案** / **Add files** puts more
beside the ones there):

- **One recording**: pieces with silence between them (below).
- **A sample pack**: pick many files at once (a folder's WAVs, a pack's
  one-shots and loops); each file is split on its own silence, so a file
  of one sound is one piece. All are brought to the first file's sample
  rate (`lib/sources.mjs`).
- **The microphone**: **用麥克風錄** / **Record**, a tap to start and one to
  stop, the phone's echo cancelling, noise suppression and gain control
  off (they'd eat the gaps); the take is split like a file.

What's kept (`lib/kits.mjs`):

- **On this phone**: the last kit's sound (IndexedDB), split and heard
  again before the loading screen lifts, so it's there when the app opens.
- **On the Quadra Pass** (app id `beats`, payload `{ v: 1, settings, kits }`):
  the settings, and each kit's tempo and the roles set by hand, a kit known
  by its sound's fingerprint (each file's length and a few hundred of its
  samples, hashed), so the same pieces on another phone find them. The
  newest 40 kits; the sound itself never leaves the phone.

**Without a connection**: the family's worker (`sw.js`) keeps every file,
so it opens and works offline.

## A recording

- Any number of pieces, with silence (0.2 s or more) between them.
- All at one tempo, any tempo: it's heard from the pieces.
- At least one riff or phrase; everything else is optional.
- WAV is best (any PCM or float WAV). On the page, anything the browser can
  play (m4a, mp3, …) works too; it's decoded at 48 kHz.
- Phone audio isn't digitally silent between pieces: if the count is off,
  raise **Silence below** (say to -60 dB) under **Splitting** on the page, or
  `--silence-db -60` in the script.

## Tempo

Pieces are made on a beat grid, so the hits inside each one fall on its
16th notes, and loops cut to the grid are whole beats long. Every tempo
from 70 to 190 BPM is scored by how well those line up, to a tenth of a
BPM (a whole number when it fits as well).

Twice a tempo can fit as well as the tempo itself, as can half, or 3/2
when a pack has few 16th notes. Of the tempos that fit about as well as
the best, the one wins that best balances the fit, loops of a usual
length (about 4 beats: half a bar to 4 bars) and a slight lean towards
120 BPM. If it's wrong, it's nearly always by one of those ratios: the
page has **½** and **×2** next to the tempo, and any tempo can be typed
in (`--bpm` in the script).

## Roles

Each piece's role is heard from its sound at that tempo. On the page,
each piece has a menu to change it (a new tempo hears the roles again,
but not ones set by hand). In the script, use `--roles 3=riff,6-8=hat,12=off`
(it prints the tempo and roles it uses).

| Role | What it is | How it's heard |
|---|---|---|
| Riff | A loop of notes, 4 beats or more | Hits a beat or more apart (or a held note), pitched or not noisy |
| Phrase | A short loop of notes, or a one-shot note | The same, looping every 1 or 2 beats; or one pure note |
| Bass | A low loop of notes | The same, mostly under 500 Hz, centred under 300 Hz |
| Hats | A hi-hat or shaker loop | Hits a beat or more apart, mostly above 6 kHz |
| Fill | A drum fill or loop | Hits over 1.5 beats or more, noisy (or a run of low drums, 3 or more a beat) |
| Kick | A kick | One low hit (mostly under 120 Hz) that dies away |
| 808 | A long low hit | The same, ringing on 0.8 s or more (or cut off still ringing) |
| Snare | A snare or clap | One hit, noisy, not mostly above 6 kHz |
| Tick | A short click or hat hit | One hit, mostly above 6 kHz |
| Roll | A short roll | Three hits or more over under 1.5 beats |
| Not used | Left out | |

What's heard of each piece: its hits (rises in its spectrum where some
octave band gets 3 dB louder, leaving out echoes, faint ripples and a
dying sound's flicker), how it dies away, how its sound spreads over five
frequency bands, how noisy it is (spectral flatness), how pitched, and
its notes' pitch classes.

A loop repeats every 1, 2, 4, 8 or 16 beats (and so on), whichever is the
longest that fits its length, so a tail ringing past the loop doesn't
count: a riff recorded as 5 beats (4 and a tail) loops every 4. A piece
that wasn't cut to the grid (not a whole number of beats long) may ring on
longer, so it's also kept to the shortest that holds all its hits.

**How well it works:** `tests/kits.mjs` makes up sample packs, each with
its own kicks (clicky, distorted), snares and claps, noise and metallic
808-style hats, shakers, tom and snare fills, 808s (some cut off short),
plucks, saws, squares, bells, keys, pads and chords, and sine, saw and
square basses, at tempos from 75 to 165 BPM, recorded with or without a
beat of tail cut to the grid, reverb, a phone's noise floor or an mp3's
missing top end. On 100 such packs never used to tune it, 97 tempos were
heard exactly (the other 3 as half) and 97.5% of roles were right, most
misses being riff and phrase mixed up (only the loop length differs).
They're made-up sounds, though: a real recording can differ, so check the
roles and tempo it hears.

Songs work with whatever roles there are. Riff sets for the intro, verse,
hook and bridge each start from a different riff and go on with the riffs
most alike in notes to it, so they keep to one key (phrases stand in if
there are no riffs, and the other way round). The hook may add the riff
most alike to it on top. With two kicks, the first plays light parts and
the second heavy ones; a break gets the shortest hat loop. A missing kick
or 808 is played by the other, a missing roll by the snare, and a missing
fill by a stutter. Anything else that's missing is left out: with no
drums the song is just its riffs.

## Settings

| Page | Script | |
|---|---|---|
| Songs | `--count` | How many (page: up to 30; default 20) |
| Length | `--min-bars` / `--max-bars` | Bars of 4 beats, 8 or more (default 25–29, so songs of 26 or 28 bars, about 51–55 s) |
| Drums | `--styles` | The drum styles songs pick from: four-on-floor, hip-hop, trap, half-time, broken, house (the clap on 2 and 4, a tick on every off-beat), dembow (reggaeton: the kick on the beat, the snare's 3+3+2), afrobeats (a skipping kick, a shaker's push) |
| Humanize | `--humanize` | Swing and timing drift, 0–200% (0 is a strict grid) |
| Seed | `--seed` | The same seed makes the same songs (the page and the script have different random numbers, so not the same songs as each other) |
| Format | | 32-bit float or 16-bit WAV (the script writes 32-bit float) |
| Splitting | `--silence-db` / `--min-gap` | What counts as silence, and the shortest gap between pieces (default -90 dB, 0.2 s) |
| Tempo | `--bpm` | The tempo the pieces were recorded at: heard, or as set (see Tempo) |
| Roles | `--roles` | Each piece's role: heard, or as set (see Roles) |
| | `--save-pieces folder/` | Also save the split pieces |
| | `--out folder/` | Where songs go (default `songs/`) |

Songs are named for when they're made, `Beats DD-MM-YYYY HH-MM`: the
first gets the current date and time, each next one a minute later (the
script skips names already in the folder). Stereo, at the recording's
sample rate.

## How it works

1. Cuts the recording into pieces at each run of silence, and hears the
   tempo and each one's role.
2. Plans the song (below), to an even number of bars in the Length range
   (an odd one only if that's all the range allows).
3. Places the pieces on the recording's beat grid and adds them up.

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
  hook adds another riff on top.
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
    python3 passion_beats.py all_beats.wav --bpm 125 --roles 3=riff,12=off

## Development

- `public/`: the page (`index.html`, `app.js`, `engine.mjs`, the port of
  the script, and `analyze.mjs`, the hearing; `lib/sources.mjs`, a kit's
  files at one rate and split; `lib/kits.mjs`, the fingerprint, the Pass's
  payload and the phone's copy; `lib/lang.mjs`; all but `app.js` with no
  DOM, so they're testable).
- `npm test`: the tests (Node 22), the analysis's on made-up sample packs
  (`tests/kits.mjs`) among them.
- Every push to `main` runs the tests and deploys `public/` to Pages
  (`.github/workflows/deploy.yml`, the kit checked out for the tests, every
  file stamped with the deploy's version).
- `node ../Shared-Proxy/tools/preview.mjs beats` looks at it on a phone
  screen (`--lang en`, `--reopen` for the kept kit).

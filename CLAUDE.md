# Working on Orbit Beats

Read `../Orbit-Core/docs/TRUTH.md` first (one page: how the owner works and what matters).
MAP.md is this repo's map (README.md is the short public front page).

- `npm test`, then `git push origin HEAD:main`.
- `engine.mjs` is the port of `passion_beats.py`: a change to the songs goes into both.
- Nothing of a kit's sound is ever sent anywhere; the Pass keeps only settings.
- See it on a phone: `node ../Orbit-Core/tools/preview.mjs beats --live --width 375`.
- Screenshots for a change: `node ../Orbit-Core/tools/shots.mjs beats --before main` (320/390, light/dark, live data, a diff against what's live; `../Orbit-Core/tools/README.md`).

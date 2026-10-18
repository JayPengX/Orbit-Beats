# Working on Orbit Beats

Read `../Shared-Proxy/docs/TRUTH.md` first (one page: how the owner works and what matters).
The README is this repo's map.

- `npm test`, then `git push origin HEAD:main`.
- `engine.mjs` is the port of `passion_beats.py`: a change to the songs goes into both.
- Nothing of a kit's sound is ever sent anywhere; the Pass keeps only settings.
- See it on a phone: `node ../Shared-Proxy/tools/preview.mjs beats --live --width 375`.

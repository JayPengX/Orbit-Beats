# Working on Orbit Beats

Orbit Beats (was Passion Beats; the repo keeps its name) is an Orbit app on
the Quadra Pass and the shared kit. **Read `../Shared-Proxy/docs/TRUTH.md`
first**: the owner's standing rules (push to `main`, `npm test` first,
iPhone Safari at 375 px, nothing cut, Chinese first, iOS look). The README
is the map; keep it current.

- The kit lives in `Shared-Proxy/kit/` only (`#kit/…`; the tests link it as
  `.kit`). Nothing of a kit's sound is ever sent anywhere: the Pass keeps
  only settings, tempos and roles.
- `engine.mjs` is the port of `passion_beats.py`: a change to the songs
  goes into both.
- `node ../Shared-Proxy/tools/preview.mjs beats` looks at it on a phone
  screen.

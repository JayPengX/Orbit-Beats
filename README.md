<p align="center">
  <img src="public/icons/icon-192.png" width="96" height="96" alt="">
</p>

<h1 align="center">Orbit Beats</h1>

<p align="center">
  <b>Make your own beats.</b><br>
  <a href="https://jaypengx.com/beats/"><b>jaypengx.com/beats</b></a>
</p>

<p align="center">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES_modules-F7DF1E?logo=javascript&logoColor=000"> <img alt="PWA" src="https://img.shields.io/badge/PWA-works_offline-5A0FC8?logo=pwa&logoColor=fff"> <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=fff"> <img alt="GitHub" src="https://img.shields.io/badge/GitHub-Pages-24292F?logo=github&logoColor=fff"> <img alt="Tests" src="https://img.shields.io/badge/Tests-node_--test-339933?logo=nodedotjs&logoColor=fff"> <img alt="Python" src="https://img.shields.io/badge/Python-CLI-3776AB?logo=python&logoColor=fff">
</p>

Music that never stops, and your own beat pieces arranged into new songs. Everything runs on the phone; no sound is uploaded. Part of **Orbit**, a family of phone apps for life in Taiwan that share one sign-in, the Orbit Pass. See them all at [jaypengx.com](https://jaypengx.com/).

## What it does

- **Listen:** endless songs written on the spot on the app's own instruments, by mood.
- **Jam:** play the pads and record a piece.
- **Instruments:** start from a clip written for you and save it as a piece.
- **Make songs:** your pieces arranged into full songs, each piece exactly as recorded.
- **Simple and Advanced modes**, with every music word explained in plain language.

## Stack

- Plain JavaScript (ES modules), HTML and CSS: no framework, no build step, no runtime dependencies.
- An installable phone web app (Add to Home Screen), cached by a service worker.
- The look, sign-in (the Orbit Pass) and notices come from the shared kit in [Shared-Proxy](https://github.com/JayPengX/Shared-Proxy).
- Audio made in the browser (Web Audio); `passion_beats.py` is the same engine on the command line.
- Hosted on GitHub Pages and served at jaypengx.com by a Cloudflare Worker; every push to `main` tests and deploys.

## For developers

```bash
npm test
```

How it works, file by file, and the decisions still in force: **[MAP.md](MAP.md)**.

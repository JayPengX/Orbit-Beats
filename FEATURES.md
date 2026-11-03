# Features kept

Every feature a person uses in this app, with the code that makes it.
`tests/features.test.mjs` fails if any mark below disappears, so a refactor cannot
drop a feature silently (2026-11-03, after the lost-features audit).
To remove a feature on purpose, delete its line here in the same commit and say why.
- The full mixer on by default — `public/lib/mix.mjs`: `mixOf`, `MIX = { on: true`
- Easy listening: eased songs — `public/lib/mix.mjs`, `public/lib/radio.mjs`: `eased`
- Radio: 隨機電台, 為你電台, sleep timer — `public/lib/radioview.mjs`: `隨機電台`, `為你電台`, `睡眠`
- The game and 我的紀錄 — `public/lib/gameview.mjs`: `我的紀錄`
- 即興 pads and 歌單 playlists — `public/index.html`: `即興`, `歌單`
- Remix: 驚喜 and 取出片段 — `public/lib/remixview.mjs`: `驚喜`, `取出片段`
- A song saved and opened as a file, stems and MIDI — `public/lib/project.mjs`, `public/app.js`: `存成檔案`, `打開檔案`, `MIDI`
- 首頁 is the player: the song's parts as one line on their colours, a tap goes there (Orbit's own look, 2026-11-03) — `public/lib/homeview.mjs`, `public/look.css`: `bt-parts`, `sectionTimes`, `P.seek(s.from`, `bt-now-seen`
- 首頁: 接下來, 今日精選, 電台 and 類型 (全部類型), 最近播放, 你的歌, 自己做 with 節奏遊戲 — `public/lib/homeview.mjs`: `接下來`, `今日精選`, `全部類型`, `最近播放`, `你的歌`, `自己做`, `節奏遊戲`
- 創作: the 即興 card (the set, ▶, six other sets), 樂器 · 做歌 · 節奏遊戲 as rows, 你的歌 or 從這裡開始 — `public/app.js`: `cr-jam`, `cr-sets`, `songListOf`, `從這裡開始`
